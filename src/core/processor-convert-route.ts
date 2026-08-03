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
	cropRawImage,
	findOpaqueBounds,
	getAspectRatio,
	padImageToAspectRatio,
	padRawImage,
	resizeRawImageNearest,
} from "./image-operations";
import { applyOutline } from "./outline";
import { createProcessingAnalysis } from "./processing-analysis";
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

	// [Intended] 候補の解像度は被写体の寸法から決める。透明余白を含めたまま算出すると、
	// 余白の広い画像で被写体の実効解像度だけが落ちる。
	let source = working;
	let sourceX = 0;
	let sourceY = 0;
	if (o.trimToContent && masked) {
		const bounds = findOpaqueBounds(masked, trimAlphaThreshold);
		if (bounds) {
			source = cropRawImage(working, bounds.x, bounds.y, bounds.w, bounds.h);
			sourceX = bounds.x;
			sourceY = bounds.y;
		}
	}

	const candidates = createConvertCandidates(source);
	const selected = selectConvertCandidate(candidates, o.detailLevel);
	const selectedCandidateIndex = candidates.indexOf(selected);
	const reports = candidateReports(
		source,
		candidates,
		o.detailLevel,
		sourceX,
		sourceY,
	);
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
		o.bgExtractionMethod !== "none" && o.bgRemovalScope !== "off"
			? removeBackground(
					finalResult,
					o.backgroundTolerance,
					o.bgRemovalScope,
					o.bgConnectivity,
					bgTargets,
					o.bgExtractionMethod,
					backgroundModel,
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
		},
	);
	if (o.smallComponentMode !== "off") {
		smallComponentRemoval = componentResult.diagnostic;
	}
	finalResult = componentResult.image;

	if (o.postRemoveBackground) {
		finalResult = removeBackground(
			finalResult,
			o.backgroundTolerance,
			o.bgRemovalScope,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
			backgroundModel,
			backgroundDiagnostic,
		);
	}
	if (o.convertReduceColors || o.fixedPalette) {
		finalResult = applyColorReduction(
			finalResult,
			o.convertReduceColorMode,
			o.convertDitherMode,
			o.convertColorCount ?? selected.colorCount,
			o.convertDitherStrength ?? selected.ditherStrength,
			log,
			o.fixedPalette,
		);
	}

	const padCompanions = (
		left: number,
		top: number,
		right: number,
		bottom: number,
	): void => {
		compareBefore = padRawImage(compareBefore, left, top, right, bottom);
		compareBeforeSanitized = padRawImage(
			compareBeforeSanitized,
			left,
			top,
			right,
			bottom,
		);
		const cropX = grid.cropX ?? grid.offsetX;
		const cropY = grid.cropY ?? grid.offsetY;
		grid = {
			...grid,
			outW: finalResult.width,
			outH: finalResult.height,
			cropX: cropX - left * grid.cellW,
			cropY: cropY - top * grid.cellH,
			cropW: finalResult.width * grid.cellW,
			cropH: finalResult.height * grid.cellH,
		};
	};

	if (o.outlineStyle !== "none") {
		const previousWidth = finalResult.width;
		const previousHeight = finalResult.height;
		finalResult = applyOutline(finalResult, o.outlineColor, o.outlineStyle);
		const widthDifference = finalResult.width - previousWidth;
		const heightDifference = finalResult.height - previousHeight;
		if (widthDifference !== 0 || heightDifference !== 0) {
			const left = Math.floor(widthDifference / 2);
			const top = Math.floor(heightDifference / 2);
			padCompanions(left, top, widthDifference - left, heightDifference - top);
		}
	}

	if (o.keepAspectRatio && !o.makeSquare) {
		const { image: padded, padding } = padImageToAspectRatio(
			finalResult,
			getAspectRatio(img),
		);
		if (padded !== finalResult) {
			finalResult = padded;
			padCompanions(padding.left, padding.top, padding.right, padding.bottom);
		}
	}

	if (o.makeSquare && finalResult.width !== finalResult.height) {
		const size = Math.max(finalResult.width, finalResult.height);
		const widthDifference = size - finalResult.width;
		const heightDifference = size - finalResult.height;
		const left = Math.floor(widthDifference / 2);
		const top = Math.floor(heightDifference / 2);
		const right = widthDifference - left;
		const bottom = heightDifference - top;
		finalResult = padRawImage(finalResult, left, top, right, bottom);
		padCompanions(left, top, right, bottom);
	}

	o.debugHook?.("99-result", finalResult, {
		convertCandidate: selected,
	});
	const analysis = createProcessingAnalysis(
		img,
		finalResult,
		compareBeforeSanitized,
		grid,
		"convert",
		`convert-${selected.label}`,
		trimAlphaThreshold,
		reports,
		backgroundDiagnostic,
		context.classificationResult,
		context.additionalWarnings,
		selectedCandidateIndex,
		smallComponentRemoval,
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
