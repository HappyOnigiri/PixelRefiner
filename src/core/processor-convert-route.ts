import type {
	ConvertCandidate,
	GridCandidateReport,
	PixelGrid,
	ProcessResult,
	RawImage,
} from "../shared/types";
import { removeBackground } from "./background-removal";
import { applyColorReduction, extractUsedColors } from "./color-reduction";
import {
	createConvertCandidates,
	edgeAwareAreaResample,
	selectConvertCandidate,
} from "./converter";
import {
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
): PixelGrid => ({
	cellW: image.width / candidate.outW,
	cellH: image.height / candidate.outH,
	offsetX: 0,
	offsetY: 0,
	outW: candidate.outW,
	outH: candidate.outH,
	cropX: 0,
	cropY: 0,
	cropW: image.width,
	cropH: image.height,
	score: candidate.label === "balanced" ? 1 : 0.8,
});

const candidateReports = (
	image: RawImage,
	candidates: ConvertCandidate[],
): GridCandidateReport[] =>
	candidates.map((candidate) => {
		const grid = gridForCandidate(image, candidate);
		return {
			grid,
			outW: candidate.outW,
			outH: candidate.outH,
			cropX: 0,
			cropY: 0,
			cropW: image.width,
			cropH: image.height,
			method: `convert-${candidate.label}`,
			totalScore: grid.score,
			confidence: 1,
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
	const candidates = createConvertCandidates(working);
	const selected = selectConvertCandidate(candidates, o.detailLevel);
	const reports = candidateReports(working, candidates);
	let grid = gridForCandidate(working, selected);
	const resizeStart = performance.now();
	let finalResult = edgeAwareAreaResample(
		working,
		selected.outW,
		selected.outH,
	);
	log(
		`Convert resampling done in ${(performance.now() - resizeStart).toFixed(2)}ms`,
		selected,
	);
	o.debugHook?.("05-convert-resampled", finalResult, { candidate: selected });
	let compareBefore = resizeRawImageNearest(
		img,
		0,
		0,
		img.width,
		img.height,
		selected.outW,
		selected.outH,
	);
	let compareBeforeSanitized = finalResult;

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
