import { CANDIDATE_PREVIEW_LIMITS } from "../shared/config";
import type {
	CandidatePreview,
	CandidateSelection,
	GridCandidateReport,
	ProcessingAnalysis,
	RawImage,
} from "../shared/types";
import { resizeRawImageNearest } from "./image-operations";
import type { ProcessOptions } from "./processor-options";

const area = (candidate: GridCandidateReport): number =>
	candidate.outW * candidate.outH;

const selectionForGrid = (
	candidate: GridCandidateReport,
	kind: CandidateSelection["kind"],
	recommended = false,
): CandidateSelection => ({
	id: `${kind}:${candidate.outW}x${candidate.outH}`,
	kind,
	recommended,
	processingMode: "refine",
	outW: candidate.outW,
	outH: candidate.outH,
});

export const selectCandidatePlans = (
	analysis: ProcessingAnalysis,
): CandidateSelection[] => {
	const grids = analysis.gridCandidates.filter(
		(candidate) => candidate.method !== "preserve",
	);
	const plans: CandidateSelection[] = [];
	if (grids.length > 0) {
		const recommended = grids[0];
		plans.push(selectionForGrid(recommended, "recommended", true));
		const byArea = [...grids].sort((left, right) => area(left) - area(right));
		const recommendedArea = area(recommended);
		const coarser = [...byArea]
			.reverse()
			.find((candidate) => area(candidate) < recommendedArea);
		const finer = byArea.find((candidate) => area(candidate) > recommendedArea);
		if (finer) plans.push(selectionForGrid(finer, "finer"));
		if (coarser) plans.push(selectionForGrid(coarser, "coarser"));
	}

	plans.push({
		id: "preserve",
		kind: "preserve",
		recommended: grids.length === 0,
		processingMode: "preserve",
	});

	if (
		plans.length < CANDIDATE_PREVIEW_LIMITS.maxCandidates &&
		(analysis.classification === "continuous" ||
			analysis.classification === "uncertain")
	) {
		plans.push({
			id: "convert:balanced",
			kind: "convert",
			recommended: false,
			processingMode: "convert",
			detailLevel: "balanced",
		});
	}

	return plans.slice(0, CANDIDATE_PREVIEW_LIMITS.maxCandidates);
};

export const candidateProcessOptions = (
	base: ProcessOptions,
	selection: CandidateSelection,
): ProcessOptions => {
	const options: ProcessOptions = {
		...base,
		processingMode: selection.processingMode,
		forcePixelsW: undefined,
		forcePixelsH: undefined,
		hintPixelsW: undefined,
		hintPixelsH: undefined,
	};
	if (selection.processingMode === "refine") {
		options.forcePixelsW = selection.outW;
		options.forcePixelsH = selection.outH;
	}
	if (selection.processingMode === "convert") {
		options.detailLevel = selection.detailLevel;
	}
	return options;
};

export const createCandidatePreview = (
	selection: CandidateSelection,
	result: RawImage,
	colorCount: number,
): CandidatePreview => {
	const scale = Math.min(
		1,
		CANDIDATE_PREVIEW_LIMITS.maxThumbnailDimension /
			Math.max(result.width, result.height),
	);
	const width = Math.max(1, Math.round(result.width * scale));
	const height = Math.max(1, Math.round(result.height * scale));
	return {
		...selection,
		preview:
			scale === 1
				? result
				: resizeRawImageNearest(
						result,
						0,
						0,
						result.width,
						result.height,
						width,
						height,
					),
		resultWidth: result.width,
		resultHeight: result.height,
		colorCount,
	};
};
