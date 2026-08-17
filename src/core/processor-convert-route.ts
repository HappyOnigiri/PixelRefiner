import { clampInt, PROCESS_RANGES } from "../shared/config";
import type {
	ConvertCandidate,
	DetailLevel,
	GridCandidateReport,
	PixelGrid,
	ProcessResult,
	RawImage,
} from "../shared/types";
import {
	removeBackground,
	removeSmallFloatingComponentsInPlace,
} from "./background-removal";
import { applyColorReduction, extractUsedColors } from "./color-reduction";
import { removeSmallComponents } from "./components";
import {
	createConvertCandidates,
	edgeAwareAreaResample,
	selectConvertCandidate,
} from "./converter";
import {
	applyFinalOutputAdjustments,
	padFinalOutputCompanions,
} from "./final-output-adjustments";
import {
	cropRawImage,
	findOpaqueBounds,
	getAspectRatio,
	resizeRawImageNearest,
} from "./image-operations";
import { createProcessingAnalysis } from "./processing-analysis";
import { applyPostRemovalOutcome } from "./processor-background";
import { getBackgroundBehavior } from "./processor-options";
import type { SimpleRouteContext } from "./processor-simple-routes";

const gridForCandidate = (
	image: RawImage,
	candidate: ConvertCandidate,
	selectedLabel: DetailLevel,
	cropX: number,
	cropY: number,
): PixelGrid => ({
	cellW: image.width / candidate.outW,
	cellH: image.height / candidate.outH,
	offsetX: 0,
	offsetY: 0,
	outW: candidate.outW,
	outH: candidate.outH,
	cropX,
	cropY,
	cropW: image.width,
	cropH: image.height,
	// [Intended] 採用した候補のスコアを最大にする。balanced を固定で最大にすると、
	// coarse / detailed を選んだときにレポートの上位候補と実際の出力が食い違う。
	score: candidate.label === selectedLabel ? 1 : 0.8,
});

const candidateReports = (
	image: RawImage,
	candidates: ConvertCandidate[],
	selectedLabel: DetailLevel,
	cropX: number,
	cropY: number,
): GridCandidateReport[] =>
	candidates.map((candidate) => {
		const grid = gridForCandidate(
			image,
			candidate,
			selectedLabel,
			cropX,
			cropY,
		);
		return {
			grid,
			outW: candidate.outW,
			outH: candidate.outH,
			cropX,
			cropY,
			cropW: image.width,
			cropH: image.height,
			method: `convert-${candidate.label}`,
			totalScore: grid.score,
			confidence: grid.score,
		};
	});

/** Convert の片軸指定は、実際にリサンプリングする領域の縦横比で補完する。 */
const explicitConvertCandidate = (
	image: RawImage,
	detailLevel: DetailLevel,
	width: number | undefined,
	height: number | undefined,
): ConvertCandidate | undefined => {
	if (width === undefined && height === undefined) return undefined;
	const outW =
		width ??
		clampInt(
			Math.round(((height as number) * image.width) / image.height),
			PROCESS_RANGES.convertPixelsW,
		);
	const outH =
		height ??
		clampInt(
			Math.round((outW * image.height) / image.width),
			PROCESS_RANGES.convertPixelsH,
		);
	return { label: detailLevel, outW, outH };
};

export const processConvertRoute = (
	context: SimpleRouteContext,
): ProcessResult => {
	const {
		img,
		o,
		working,
		bgTargets,
		trimAlphaThreshold,
		startTime,
		log,
		backgroundDiagnostic,
		backgroundModel,
	} = context;
	const behavior = getBackgroundBehavior(o);
	let smallComponentRemoval = context.smallComponentRemoval;
	// [Intended] 呼び出し元が同じマスクを算出済みなら再計算しない。
	// 孤立成分の除去は working を破壊的に書き換えるため、2 度走らせると
	// 1 回目の結果から作り直したマスクで別の成分まで消えうる。
	const needsMask = o.trimToContent || o.floatingMaxPixels > 0;
	const masked =
		context.preparedMask ??
		(needsMask
			? removeBackground(
					working,
					o.backgroundTolerance,
					o.bgRemovalScope,
					o.bgConnectivity,
					bgTargets,
					o.bgExtractionMethod,
					backgroundModel,
					behavior,
				)
			: undefined);
	if (masked && !context.preparedMask && o.floatingMaxPixels > 0) {
		const legacy = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			trimAlphaThreshold,
			o.floatingMaxPixels,
		);
		smallComponentRemoval = {
			mode: "legacy",
			applied: true,
			removedComponents: legacy.removedComponents,
			removedPixels: legacy.removedPixels,
			pixelBasis: "source",
		};
	}

	let source = working;
	let sourceX = 0;
	let sourceY = 0;
	if (!o.preserveProcessingScale && o.trimToContent && masked) {
		const bounds = findOpaqueBounds(masked, trimAlphaThreshold);
		if (bounds) {
			source = cropRawImage(working, bounds.x, bounds.y, bounds.w, bounds.h);
			sourceX = bounds.x;
			sourceY = bounds.y;
		}
	}

	const candidates = createConvertCandidates(source);
	const explicitCandidate = explicitConvertCandidate(
		source,
		o.detailLevel,
		o.convertPixelsW,
		o.convertPixelsH,
	);
	const hasExplicitSize = explicitCandidate !== undefined;
	const selected = explicitCandidate
		? explicitCandidate
		: selectConvertCandidate(candidates, o.detailLevel);
	let selectedCandidateIndex = candidates.indexOf(selected);
	let reports = candidateReports(
		source,
		candidates,
		o.detailLevel,
		sourceX,
		sourceY,
	);
	if (hasExplicitSize) {
		const explicitGrid = gridForCandidate(
			source,
			selected,
			o.detailLevel,
			sourceX,
			sourceY,
		);
		reports = [
			{
				grid: explicitGrid,
				outW: selected.outW,
				outH: selected.outH,
				cropX: sourceX,
				cropY: sourceY,
				cropW: source.width,
				cropH: source.height,
				method: "convert-explicit-size",
				totalScore: 1,
				confidence: 1,
			},
			...reports,
		];
		selectedCandidateIndex = 0;
	}
	let grid = gridForCandidate(
		source,
		selected,
		o.detailLevel,
		sourceX,
		sourceY,
	);
	const resizeStart = performance.now();
	let finalResult = edgeAwareAreaResample(source, selected.outW, selected.outH);
	log(
		`Convert resampling done in ${(performance.now() - resizeStart).toFixed(2)}ms`,
		selected,
	);
	o.debugHook?.("05-convert-resampled", finalResult, { candidate: selected });
	let compareBefore = resizeRawImageNearest(
		img,
		sourceX,
		sourceY,
		source.width,
		source.height,
		selected.outW,
		selected.outH,
	);
	let compareBeforeSanitized = finalResult;
	const logicalMask =
		o.preserveProcessingScale && masked
			? edgeAwareAreaResample(masked, selected.outW, selected.outH)
			: o.bgExtractionMethod !== "none" && o.bgRemovalScope !== "off"
				? removeBackground(
						finalResult,
						o.backgroundTolerance,
						o.bgRemovalScope,
						o.bgConnectivity,
						bgTargets,
						o.bgExtractionMethod,
						backgroundModel,
						behavior,
					)
				: finalResult;
	const componentResult = removeSmallComponents(
		finalResult,
		logicalMask,
		compareBefore,
		{
			mode: o.smallComponentMode,
			alphaThreshold: trimAlphaThreshold,
			backgroundEnabled:
				o.bgExtractionMethod !== "none" && o.bgRemovalScope !== "off",
			automaticBackground: o.bgExtractionMethod === "auto",
			backgroundConfidence: backgroundDiagnostic?.confidence,
			backgroundConfidenceGate: o.smallComponentBackgroundGate,
		},
	);
	if (o.smallComponentMode !== "off") {
		smallComponentRemoval = componentResult.diagnostic;
	}
	finalResult = componentResult.image;

	const postRemoval = {
		attempted: o.postRemoveBackground,
		rolledBack: false,
		removed: false,
	};
	if (postRemoval.attempted) {
		finalResult = removeBackground(
			finalResult,
			o.backgroundTolerance,
			o.bgRemovalScope,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
			backgroundModel,
			behavior,
			postRemoval,
		);
	}
	applyPostRemovalOutcome(backgroundDiagnostic, postRemoval);
	if (o.convertReduceColors || o.fixedPalette) {
		finalResult = applyColorReduction(
			finalResult,
			o.convertReduceColorMode,
			o.convertDitherMode,
			o.convertColorCount,
			o.convertDitherStrength,
			log,
			o.fixedPalette,
		);
	}

	if (o.preserveProcessingScale && o.trimToContent) {
		// [Intended] かんたん設定のトリムは変換後のキャンバスだけを切り詰め、
		// 候補の解像度を変えない。先に切ると被写体まで拡大される。
		const bounds = findOpaqueBounds(componentResult.mask, trimAlphaThreshold);
		if (
			bounds &&
			(bounds.x !== 0 ||
				bounds.y !== 0 ||
				bounds.w !== finalResult.width ||
				bounds.h !== finalResult.height)
		) {
			finalResult = cropRawImage(
				finalResult,
				bounds.x,
				bounds.y,
				bounds.w,
				bounds.h,
			);
			compareBefore = cropRawImage(
				compareBefore,
				bounds.x,
				bounds.y,
				bounds.w,
				bounds.h,
			);
			compareBeforeSanitized = cropRawImage(
				compareBeforeSanitized,
				bounds.x,
				bounds.y,
				bounds.w,
				bounds.h,
			);
			const cropX = grid.cropX ?? grid.offsetX;
			const cropY = grid.cropY ?? grid.offsetY;
			grid = {
				...grid,
				outW: bounds.w,
				outH: bounds.h,
				cropX: cropX + bounds.x * grid.cellW,
				cropY: cropY + bounds.y * grid.cellH,
				cropW: bounds.w * grid.cellW,
				cropH: bounds.h * grid.cellH,
			};
		}
	}

	const adjustments = applyFinalOutputAdjustments(
		finalResult,
		getAspectRatio(img),
		o,
	);
	finalResult = adjustments.image;
	({ compareBefore, compareBeforeSanitized, grid } = padFinalOutputCompanions(
		compareBefore,
		compareBeforeSanitized,
		grid,
		adjustments.steps,
		"logical",
		() => false,
	));

	o.debugHook?.("99-result", finalResult, {
		convertCandidate: selected,
	});
	const analysis = createProcessingAnalysis(
		img,
		finalResult,
		compareBeforeSanitized,
		grid,
		"convert",
		hasExplicitSize ? "convert-explicit-size" : `convert-${selected.label}`,
		trimAlphaThreshold,
		reports,
		backgroundDiagnostic,
		context.classificationResult,
		context.additionalWarnings,
		selectedCandidateIndex,
		smallComponentRemoval,
		// [Policy] ここへ渡す候補配列は convert 候補の reports で、Auto 実結果の位置が
		// 指す rankedGridCandidates とは index 空間が異なる。値を渡すと範囲チェックだけを
		// 通って無関係な候補を指すため、convert 経路では常に渡さない。
		undefined,
	);
	log(`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`);
	return {
		result: finalResult,
		grid,
		extractedPalette: extractUsedColors(finalResult),
		compareBefore,
		compareBeforeSanitized,
		analysis,
	};
};
