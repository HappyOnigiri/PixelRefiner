import { GRID_SEARCH_LIMITS } from "../shared/config";
import type { PixelGrid, ProcessResult, RawImage } from "../shared/types";
import {
	getBackgroundTargets,
	removeBackground,
	removeBackgroundByFloodFillLegacy,
	removeSmallFloatingComponentsInPlace,
} from "./background-removal";
import { applyColorReduction, extractUsedColors } from "./color-reduction";
import { detectGrid } from "./detector";
import { rankGridCandidates } from "./grid-candidates";
import { resolveGridEstimate, searchPhaseAwareGrid } from "./grid-search";
import {
	cloneImage,
	cropRawImage,
	cropRawImageNearestFromGrid,
	downsample,
	findOpaqueBounds,
	getAspectRatio,
	padImageToAspectRatio,
	padRawImage,
} from "./image-operations";
import { applyOutline } from "./outline";
import { createProcessingAnalysis } from "./processing-analysis";
import { prepareAutomaticBackground } from "./processor-background";
import {
	getDownsampleOptions,
	normalizeProcessOptions,
	type ProcessOptions,
} from "./processor-options";
import {
	processForcedRoute,
	processGridDisabledRoute,
} from "./processor-simple-routes";
import { getGridSearchFromTrimmedStrategy } from "./trimmed-grid-search";

export type { ProcessResult } from "../shared/types";
export type { BackgroundCluster, BackgroundModel } from "./background";
export {
	estimateBackgroundModel,
	removeAutomaticBackground,
} from "./background";
export { _removeSmallFloatingComponentsInPlace } from "./background-removal";
export type {
	CellSampler,
	CellSamplerOptions,
	CellSamplingMode,
} from "./cell-sampler";
export { searchPhaseAwareGrid } from "./grid-search";
export {
	downsample,
	padImageToAspectRatio,
	resizeRawImageNearest,
	sampleRawImage,
} from "./image-operations";
export type { ProcessOptions } from "./processor-options";
export {
	FastGridSearchFromTrimmed,
	LegacyGridSearchFromTrimmed,
} from "./trimmed-grid-search";

export const processImage = (
	img: RawImage,
	options: ProcessOptions = {},
): ProcessResult => {
	const o = normalizeProcessOptions(options);
	const startTime = performance.now();
	const log = (...args: unknown[]) => {
		if (o.debug) {
			console.log("[Processor]", ...args);
		}
	};

	log("Processing started", {
		width: img.width,
		height: img.height,
		options: o,
	});

	const bgTargetsStart = performance.now();
	const bgTargets =
		o.bgRemovalScope !== "off"
			? getBackgroundTargets(img, o.bgExtractionMethod, o.bgRgb, 16)
			: [];
	const { automaticBackground, backgroundModel, backgroundDiagnostic } =
		prepareAutomaticBackground(img, o);
	log(
		`Background targets extracted in ${(performance.now() - bgTargetsStart).toFixed(2)}ms`,
		bgTargets,
	);

	const workingStart = performance.now();
	let working: RawImage;
	if (!o.preRemoveBackground) {
		working = cloneImage(img);
	} else if (automaticBackground) {
		working = automaticBackground.image;
	} else if (o.bgExtractionMethod === "auto") {
		// [Intended] auto の除去経路は prepareAutomaticBackground だけが持つ。
		// 除去結果が無い場合は角シードのレガシー経路へ落とさず、元画像をそのまま保つ。
		working = cloneImage(img);
	} else if (o.bgRemovalScope === "outer") {
		working = removeBackground(
			img,
			o.backgroundTolerance,
			"outer",
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
		);
	} else if (o.bgRemovalScope === "selected") {
		working = removeBackgroundByFloodFillLegacy(
			img,
			o.backgroundTolerance,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
		);
	} else if (o.bgRemovalScope === "all") {
		working = removeBackgroundByFloodFillLegacy(
			img,
			o.backgroundTolerance,
			"4",
			bgTargets,
			o.bgExtractionMethod,
		);
	} else {
		working = cloneImage(img);
	}
	log(
		`Pre-background removal done in ${(performance.now() - workingStart).toFixed(2)}ms`,
	);

	o.debugHook?.("00-input", img);
	o.debugHook?.("01-working", working, {
		preRemoveBackground: o.preRemoveBackground,
	});
	const trimToContent = o.trimToContent;
	const sourceAspectRatio = o.keepAspectRatio ? getAspectRatio(img) : 0;
	const trimAlphaThreshold = o.trimAlphaThreshold;

	const simpleRouteContext = {
		img,
		o,
		working,
		bgTargets,
		trimAlphaThreshold,
		startTime,
		log,
		backgroundDiagnostic,
		backgroundModel,
	};
	const forcedResult = processForcedRoute(simpleRouteContext);
	if (forcedResult) return forcedResult;
	const gridDisabledResult = processGridDisabledRoute(simpleRouteContext);
	if (gridDisabledResult) return gridDisabledResult;

	// auto: まず背景トリミング後の領域（ダウンサンプリング前）から outW/outH を推定し、そのままダウンサンプリングする。
	// （隙間の多い画像でも、安定させるためコンテンツ領域に注目したい。）
	const autoGridFromTrimmed = o.autoGridFromTrimmed;

	// デバッグ用に「背景トリミング後」（ダウンサンプリング前）の見た目を出力する。
	// これはデバッグ出力のためだけに計算され、実際の処理パイプラインは変更しない。
	const bgTol = o.backgroundTolerance;
	const maskedStart = performance.now();
	const maskedForDebugOrAuto =
		o.debugHook || autoGridFromTrimmed || o.floatingMaxPixels > 0
			? removeBackground(
					working,
					bgTol,
					o.bgRemovalScope,
					o.bgConnectivity,
					bgTargets,
					o.bgExtractionMethod,
					backgroundModel,
				)
			: null;
	if (maskedForDebugOrAuto) {
		log(
			`Masked image for debug/auto created in ${(performance.now() - maskedStart).toFixed(2)}ms`,
		);
	}

	if (maskedForDebugOrAuto && o.floatingMaxPixels > 0) {
		const floatingStart = performance.now();
		const { removedComponents, removedPixels } =
			removeSmallFloatingComponentsInPlace(
				working,
				maskedForDebugOrAuto,
				trimAlphaThreshold,
				o.floatingMaxPixels,
			);
		log(
			`Floating components removed in ${(performance.now() - floatingStart).toFixed(2)}ms`,
			{ removedComponents, removedPixels },
		);
		if (o.debugHook && removedPixels > 0) {
			o.debugHook("01b-working-ignore-floating", working, {
				floatingMaxPixels: o.floatingMaxPixels,
				removedComponents,
				removedPixels,
			});
		}
	}
	if (maskedForDebugOrAuto && o.debugHook) {
		o.debugHook("02-pre-downsample-masked", maskedForDebugOrAuto, {
			bgTol,
		});
		const b = findOpaqueBounds(maskedForDebugOrAuto, trimAlphaThreshold);
		if (b) {
			const cropped = cropRawImage(working, b.x, b.y, b.w, b.h);
			o.debugHook("03-pre-downsample-bg-trimmed", cropped, { bounds: b });
		}
	}

	let grid: PixelGrid | null = null;
	let gridMethod = "detect-grid";

	if (autoGridFromTrimmed && maskedForDebugOrAuto) {
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
			).search(cropped, croppedMask, sw, hint);
			const phaseAwareEstimate =
				o.fastAutoGridFromTrimmed && hint === undefined
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
						selectedEstimate,
						working,
						b,
						phaseAwareReliable,
					),
					candidates: includeCandidates
						? searchCandidates?.map((entry) => {
								const c = "candidate" in entry ? entry.candidate : entry;
								const phaseAware = "phaseAware" in entry;
								return resolveGridEstimate(c, working, b, phaseAware);
							})
						: undefined,
				};
				o.debugHook?.("04-grid-crop", working, {
					grid,
					autoFromTrimmed: true,
					bounds: b,
				});
			}
		}
	}

	if (!grid) {
		const detectStart = performance.now();
		grid = detectGrid(working, { ...o.detect, debug: o.debug });
		log(
			`Grid detection done in ${(performance.now() - detectStart).toFixed(2)}ms`,
			grid,
		);
		o.debugHook?.("04-grid-crop", working, {
			grid,
		});
	}
	const rankedGridCandidates = rankGridCandidates(working, grid, gridMethod);

	const downsampleStart = performance.now();
	// [Intended] 選択した出力グリッドは後でトリミングまたはパディングされる場合がある一方で、
	// 候補診断は検出器で共有する座標空間に保つ。
	const diagnosticGrid = grid;
	const down = downsample(working, grid, getDownsampleOptions(o));
	log(
		`Downsampling done in ${(performance.now() - downsampleStart).toFixed(2)}ms`,
	);
	o.debugHook?.("05-downsampled", down, {
		sampleWindow: o.sampleWindow,
		cellSamplingMode: o.cellSamplingMode,
	});

	// 「処理前」比較: 元画像をリサイズするだけ（補正なし）。
	let compareBefore = cropRawImageNearestFromGrid(img, grid);
	// 「処理前（補正済み）」比較: 同じグリッドとセルサンプリングで元画像をダウンサンプリングする。
	let compareBeforeSanitized = downsample(img, grid, getDownsampleOptions(o));

	let trimmed = down;
	let trimmedGrid = grid;
	if (trimToContent) {
		const trimStart = performance.now();
		// 背景を除去（角からの塗りつぶし）後、セル単位でコンテンツ BBox によりトリミングする。
		// これにより余白が大きい画像でも、outW/outH を「コンテンツ」に合わせられる。
		const bgTol = o.backgroundTolerance;
		const masked = removeBackground(
			down,
			bgTol,
			o.bgRemovalScope,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
			backgroundModel,
		);
		o.debugHook?.("06-post-downsample-masked", masked, { bgTol });
		const b = findOpaqueBounds(masked, trimAlphaThreshold);
		if (
			b &&
			(b.x !== 0 || b.y !== 0 || b.w !== down.width || b.h !== down.height)
		) {
			trimmed = cropRawImage(down, b.x, b.y, b.w, b.h);

			const baseCropX = grid.cropX ?? grid.offsetX;
			const baseCropY = grid.cropY ?? grid.offsetY;
			trimmedGrid = {
				...grid,
				outW: b.w,
				outH: b.h,
				cropX: baseCropX + b.x * grid.cellW,
				cropY: baseCropY + b.y * grid.cellH,
				cropW: b.w * grid.cellW,
				cropH: b.h * grid.cellH,
			};

			// 更新済みのトリミンググリッドを使って処理前比較を再計算する
			compareBefore = cropRawImageNearestFromGrid(img, trimmedGrid);
			compareBeforeSanitized = cropRawImage(
				compareBeforeSanitized,
				b.x,
				b.y,
				b.w,
				b.h,
			);

			o.debugHook?.("07-trimmed", trimmed, { bounds: b });
			log(
				`Trimmed to content in ${(performance.now() - trimStart).toFixed(2)}ms`,
				b,
			);
		} else {
			log(
				`No trimming needed or possible in ${(performance.now() - trimStart).toFixed(2)}ms`,
			);
		}
	}

	const postBgStart = performance.now();
	const result = o.postRemoveBackground
		? removeBackground(
				trimmed,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
				backgroundDiagnostic,
			)
		: trimmed;
	log(
		`Post-background removal done in ${(performance.now() - postBgStart).toFixed(2)}ms`,
	);

	// 色削減
	let finalResult = result;
	if (o.reduceColors || o.fixedPalette) {
		finalResult = applyColorReduction(
			result,
			o.reduceColorMode,
			o.ditherMode,
			o.colorCount,
			o.ditherStrength,
			log,
			o.fixedPalette,
		);
	}

	// アウトライン処理
	if (o.outlineStyle !== "none") {
		const prevW = finalResult.width;
		const prevH = finalResult.height;
		finalResult = applyOutline(finalResult, o.outlineColor, o.outlineStyle);

		// 画像サイズを拡張した場合はグリッド情報を更新する
		if (finalResult.width !== prevW || finalResult.height !== prevH) {
			const dw = finalResult.width - prevW;
			const dh = finalResult.height - prevH;
			const padLeft = Math.floor(dw / 2);
			const padTop = Math.floor(dh / 2);
			const padRight = dw - padLeft;
			const padBottom = dh - padTop;

			// compareBefore を拡張後の結果（透明パディング）に合わせる。
			// compareBefore は高解像度のため、パディングをセルサイズで拡大する。
			compareBefore = padRawImage(
				compareBefore,
				padLeft * trimmedGrid.cellW,
				padTop * trimmedGrid.cellH,
				padRight * trimmedGrid.cellW,
				padBottom * trimmedGrid.cellH,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);

			const cellDw = (finalResult.width - prevW) / 2;
			const cellDh = (finalResult.height - prevH) / 2;
			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;

			trimmedGrid = {
				...trimmedGrid,
				outW: finalResult.width,
				outH: finalResult.height,
				cropX: baseCropX - cellDw * trimmedGrid.cellW,
				cropY: baseCropY - cellDh * trimmedGrid.cellH,
				cropW: finalResult.width * trimmedGrid.cellW,
				cropH: finalResult.height * trimmedGrid.cellH,
			};
		}
	}

	if (o.keepAspectRatio && !o.makeSquare) {
		const { image: paddedResult, padding } = padImageToAspectRatio(
			finalResult,
			sourceAspectRatio,
		);
		if (paddedResult !== finalResult) {
			const padLeftPx = Math.round(padding.left * trimmedGrid.cellW);
			const padTopPx = Math.round(padding.top * trimmedGrid.cellH);
			const padRightPx = Math.round(padding.right * trimmedGrid.cellW);
			const padBottomPx = Math.round(padding.bottom * trimmedGrid.cellH);

			finalResult = paddedResult;
			compareBefore = padRawImage(
				compareBefore,
				padLeftPx,
				padTopPx,
				padRightPx,
				padBottomPx,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padding.left,
				padding.top,
				padding.right,
				padding.bottom,
			);

			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;
			trimmedGrid = {
				...trimmedGrid,
				outW: finalResult.width,
				outH: finalResult.height,
				cropX: baseCropX - padLeftPx,
				cropY: baseCropY - padTopPx,
				cropW: finalResult.width * trimmedGrid.cellW,
				cropH: finalResult.height * trimmedGrid.cellH,
			};
		}
	}

	if (o.makeSquare) {
		const w = finalResult.width;
		const h = finalResult.height;
		if (w !== h) {
			const size = Math.max(w, h);
			const dw = size - w;
			const dh = size - h;
			const padLeft = Math.floor(dw / 2);
			const padTop = Math.floor(dh / 2);
			const padRight = dw - padLeft;
			const padBottom = dh - padTop;

			const padLeftPx = Math.round(padLeft * trimmedGrid.cellW);
			const padTopPx = Math.round(padTop * trimmedGrid.cellH);
			const padRightPx = Math.round(padRight * trimmedGrid.cellW);
			const padBottomPx = Math.round(padBottom * trimmedGrid.cellH);

			finalResult = padRawImage(
				finalResult,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);
			compareBefore = padRawImage(
				compareBefore,
				padLeftPx,
				padTopPx,
				padRightPx,
				padBottomPx,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);
			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;
			trimmedGrid = {
				...trimmedGrid,
				outW: size,
				outH: size,
				cropX: baseCropX - padLeftPx,
				cropY: baseCropY - padTopPx,
				cropW: size * trimmedGrid.cellW,
				cropH: size * trimmedGrid.cellH,
			};
		}
	}

	o.debugHook?.("99-result", finalResult, {
		postRemoveBackground: o.postRemoveBackground,
		reduceColors: o.reduceColors,
		colorCount: o.colorCount,
	});
	log(`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`);

	const extracted = extractUsedColors(finalResult);
	const analysis = createProcessingAnalysis(
		img,
		finalResult,
		compareBeforeSanitized,
		diagnosticGrid,
		"refine",
		gridMethod,
		trimAlphaThreshold,
		rankedGridCandidates,
		backgroundDiagnostic,
	);
	log("Processing analysis", analysis);
	return {
		result: finalResult,
		grid: trimmedGrid,
		extractedPalette: extracted,
		compareBefore,
		compareBeforeSanitized,
		analysis,
	};
};
