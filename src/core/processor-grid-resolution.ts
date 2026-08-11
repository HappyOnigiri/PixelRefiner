import {
	GRID_SEARCH_LIMITS,
	TRIMMED_GRID_SEARCH_LIMITS,
} from "../shared/config";
import type { PixelGrid, RawImage } from "../shared/types";
import { removeBackground } from "./background-removal";
import { detectGrid } from "./detector";
import { getGeminiWatermarkDownsampleOptions } from "./gemini-watermark-preprocessing";
import { resolveGridEstimate, searchPhaseAwareGrid } from "./grid-search";
import {
	cropRawImage,
	type DownsampleOptions,
	findOpaqueBounds,
} from "./image-operations";
import {
	getBackgroundBehavior,
	getDownsampleOptions,
	type NormalizedProcessOptions,
} from "./processor-options";
import { getGridSearchFromTrimmedStrategy } from "./trimmed-grid-search";

export type ResolveProcessingGridInput = {
	o: NormalizedProcessOptions;
	working: RawImage;
	geometryImage: RawImage;
	geometryWorking: RawImage;
	maskedForDebugOrAuto: RawImage | null;
	bgTargets: Array<[number, number, number]>;
	trimAlphaThreshold: number;
	watermarkRemovedFromGeometry: boolean;
	log: (...args: unknown[]) => void;
};

export type ResolvedProcessingGrid = {
	grid: PixelGrid;
	gridMethod: string;
	downsampleOptions: DownsampleOptions;
	allowSmallTrimmedGrid: boolean;
};

/**
 * 出力グリッドを決定する。背景トリミング後の領域からの推定（auto）を試し、
 * 得られなければグリッド検出へ委ねる。
 */
export const resolveProcessingGrid = ({
	o,
	working,
	geometryImage,
	geometryWorking,
	maskedForDebugOrAuto,
	bgTargets,
	trimAlphaThreshold,
	watermarkRemovedFromGeometry,
	log,
}: ResolveProcessingGridInput): ResolvedProcessingGrid => {
	const trimToContent = o.trimToContent;
	let grid: PixelGrid | null = null;
	let gridMethod = "detect-grid";
	let downsampleOptions = getGeminiWatermarkDownsampleOptions(
		o,
		watermarkRemovedFromGeometry,
	);
	let allowSmallTrimmedGrid = false;

	if (o.autoGridFromTrimmed && maskedForDebugOrAuto) {
		log("Auto grid from trimmed mode");
		const b = findOpaqueBounds(maskedForDebugOrAuto, trimAlphaThreshold);
		if (b) {
			const cropped = cropRawImage(working, b.x, b.y, b.w, b.h);
			const croppedMask = cropRawImage(
				maskedForDebugOrAuto,
				b.x,
				b.y,
				b.w,
				b.h,
			);
			o.debugHook?.("03-pre-downsample-bg-trimmed", cropped, {
				bounds: b,
			});

			const sw = o.sampleWindow;
			const searchStart = performance.now();
			const hint =
				o.hintPixelsW !== undefined && o.hintPixelsH !== undefined
					? { outW: o.hintPixelsW, outH: o.hintPixelsH }
					: undefined;
			const est = getGridSearchFromTrimmedStrategy(
				o.fastAutoGridFromTrimmed,
			).search(
				cropped,
				croppedMask,
				sw,
				hint,
				o.gridSignals,
				o.boundaryContrastOverride,
			);
			const phaseAwareEstimate =
				o.fastAutoGridFromTrimmed &&
				o.phaseAwareGridSearch &&
				hint === undefined
					? searchPhaseAwareGrid(cropped, croppedMask, o.gridSignals)
					: null;
			log(
				`Grid search from trimmed done in ${(performance.now() - searchStart).toFixed(2)}ms`,
				est,
			);
			if (est) {
				const phaseAwareReliable =
					phaseAwareEstimate !== null &&
					(phaseAwareEstimate.scoreX ?? 0) >=
						GRID_SEARCH_LIMITS.axisConfidenceThreshold &&
					(phaseAwareEstimate.scoreY ?? 0) >=
						GRID_SEARCH_LIMITS.axisConfidenceThreshold;
				const selectedEstimate = phaseAwareReliable ? phaseAwareEstimate : est;
				const isSmallAspectAdjustedGrid =
					!phaseAwareReliable &&
					o.smallAspectGridAlignment &&
					o.bgExtractionMethod === "auto" &&
					o.bgRemovalScope !== "off" &&
					trimToContent &&
					(selectedEstimate.outW ?? 0) <=
						TRIMMED_GRID_SEARCH_LIMITS.aspectAdjustedMaxOutputWidth &&
					(selectedEstimate.outH ?? 0) <=
						TRIMMED_GRID_SEARCH_LIMITS.aspectAdjustedMaxOutputHeight &&
					(selectedEstimate.outW ?? 0) !==
						Math.max(
							2,
							Math.round(
								(selectedEstimate.outH ?? 0) * (b.w / Math.max(1, b.h)),
							),
						);
				// [Intended] この設定は格子の基準領域だけでなく Auto の経路判定にも効く。
				// 「常に無効」にすると小さな格子が許可されず、refine から preserve へ
				// フォールバックする場合がある（ツールチップにも同じ注意を書いている）。
				allowSmallTrimmedGrid = isSmallAspectAdjustedGrid;
				// [Intended] トリミング領域で推定した格子は、元画像の左上へ投影せず
				// コンテンツ BBox をそのままサンプリング領域として使う。
				const alignToTrimmedBounds = isSmallAspectAdjustedGrid;
				let gridBounds = b;
				let gridEstimate = selectedEstimate;
				if (isSmallAspectAdjustedGrid) {
					// [Intended] 自動背景推定が残す薄い外周は、論理セルのアスペクト比を
					// 乱すため、角から得たマスクの境界を格子の基準領域に使用する。
					const cornerMask = removeBackground(
						geometryImage,
						o.backgroundTolerance,
						o.bgRemovalScope,
						o.bgConnectivity,
						bgTargets,
						"top-left",
						undefined,
						getBackgroundBehavior(o),
					);
					const tightBounds = findOpaqueBounds(cornerMask, trimAlphaThreshold);
					if (
						tightBounds &&
						tightBounds.x >= b.x &&
						tightBounds.y >= b.y &&
						tightBounds.x + tightBounds.w <= b.x + b.w &&
						tightBounds.y + tightBounds.h <= b.y + b.h
					) {
						gridBounds = tightBounds;
						gridEstimate = {
							...selectedEstimate,
							cellW: tightBounds.w / Math.max(1, selectedEstimate.outW),
							cellH: tightBounds.h / Math.max(1, selectedEstimate.outH),
						};
						downsampleOptions = getDownsampleOptions({
							...o,
							cellSamplingMode: "legacy-median",
						});
					}
				}
				gridMethod = phaseAwareReliable
					? "phase-aware-grid-search"
					: o.fastAutoGridFromTrimmed
						? "trimmed-reconstruction-fast"
						: "trimmed-reconstruction";
				// 注記:
				// - トリミングが OFF でも、つぶれを防ぐため「コンテンツ BBox から推定したグリッド」を使用する。
				// - ただしトリミング OFF は背景（余白）を残すだけなので、画像全体にダウンサンプリングを適用する。
				//   これにより中央オブジェクトのセル数（見かけのサイズ）がより安定する。
				const includeCandidates = hint === undefined;
				const searchCandidates = [
					...(phaseAwareEstimate && phaseAwareReliable
						? (phaseAwareEstimate.candidates ?? []).map((candidate) => ({
								candidate,
								phaseAware: true,
							}))
						: []),
					...(phaseAwareReliable ? [est] : []),
					...(est.candidates ?? []),
				];
				grid = {
					...resolveGridEstimate(
						gridEstimate,
						working,
						gridBounds,
						phaseAwareReliable,
						alignToTrimmedBounds,
					),
					candidates: includeCandidates
						? searchCandidates?.map((entry) => {
								const c = "candidate" in entry ? entry.candidate : entry;
								const phaseAware = "phaseAware" in entry;
								const candidateEstimate =
									alignToTrimmedBounds && !phaseAware
										? {
												...c,
												cellW: gridBounds.w / Math.max(1, c.outW ?? 1),
												cellH: gridBounds.h / Math.max(1, c.outH ?? 1),
											}
										: c;
								return {
									...resolveGridEstimate(
										candidateEstimate,
										working,
										gridBounds,
										phaseAware,
										alignToTrimmedBounds && !phaseAware,
									),
								};
							})
						: undefined,
				};
				o.debugHook?.("04-grid-crop", working, {
					grid,
					autoFromTrimmed: true,
					bounds: gridBounds,
				});
			}
		}
	}

	if (!grid) {
		const detectStart = performance.now();
		grid = detectGrid(geometryWorking, { ...o.detect, debug: o.debug });
		log(
			`Grid detection done in ${(performance.now() - detectStart).toFixed(2)}ms`,
			grid,
		);
		o.debugHook?.("04-grid-crop", working, {
			grid,
		});
	}

	return { grid, gridMethod, downsampleOptions, allowSmallTrimmedGrid };
};
