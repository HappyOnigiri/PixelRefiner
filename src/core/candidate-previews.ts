import { CANDIDATE_PREVIEW_LIMITS } from "../shared/config";
import type {
	CandidatePreview,
	CandidateSelection,
	GridCandidateReport,
	InputClassification,
	ProcessingAnalysis,
	ProcessingMode,
	RawImage,
} from "../shared/types";
import { resizeRawImageNearest } from "./image-operations";
import type { ProcessOptions } from "./processor-options";

const area = (candidate: GridCandidateReport): number =>
	candidate.outW * candidate.outH;

/**
 * 出力サイズとセルサイズがともに近い候補は、サムネイルでも見分けが付かず選択の助けにならない。
 * 判定式は削除されたサイズ候補メニューの近似判定を引き継いでいる。
 */
const isSimilar = (
	left: GridCandidateReport,
	right: GridCandidateReport,
): boolean => {
	if ((left.angle ?? 0) !== (right.angle ?? 0)) return false;
	const leftArea = area(left);
	const rightArea = area(right);
	const areaThreshold = Math.max(
		CANDIDATE_PREVIEW_LIMITS.minSimilarAreaDiff,
		Math.max(leftArea, rightArea) * CANDIDATE_PREVIEW_LIMITS.similarAreaRatio,
	);
	if (Math.abs(leftArea - rightArea) > areaThreshold) return false;
	return (
		Math.abs(left.grid.cellW - right.grid.cellW) <
		CANDIDATE_PREVIEW_LIMITS.similarCellDelta
	);
};

const isSameCandidate = (
	left: GridCandidateReport,
	right: GridCandidateReport,
): boolean =>
	left.outW === right.outW &&
	left.outH === right.outH &&
	left.cropX === right.cropX &&
	left.cropY === right.cropY &&
	left.cropW === right.cropW &&
	left.cropH === right.cropH &&
	left.grid.cellW === right.grid.cellW &&
	left.grid.cellH === right.grid.cellH &&
	left.grid.offsetX === right.grid.offsetX &&
	left.grid.offsetY === right.grid.offsetY &&
	(left.angle ?? 0) === (right.angle ?? 0);

const selectionForGrid = (
	candidate: GridCandidateReport,
	kind: CandidateSelection["kind"],
	recommended = false,
	processingMode: ProcessingMode = "refine",
): CandidateSelection => ({
	id: `${kind}:${candidate.outW}x${candidate.outH}:${candidate.angle ?? 0}`,
	kind,
	recommended,
	processingMode,
	outW: candidate.outW,
	outH: candidate.outH,
	angle: candidate.angle,
});

export const selectCandidatePlans = (
	analysis: ProcessingAnalysis,
	classification: InputClassification | undefined = analysis.classification,
): CandidateSelection[] => {
	const autoResultCandidate =
		analysis.autoResultCandidateIndex !== undefined
			? analysis.gridCandidates[analysis.autoResultCandidateIndex]
			: undefined;
	const grids = analysis.gridCandidates.filter(
		(candidate) => candidate.method !== "preserve",
	);
	const plans: CandidateSelection[] = [];
	const recommended = autoResultCandidate ?? grids[0];
	if (recommended) {
		const isAutoResult = autoResultCandidate !== undefined;
		plans.push(
			selectionForGrid(
				recommended,
				isAutoResult ? "auto-result" : "recommended",
				true,
				isAutoResult ? "auto" : "refine",
			),
		);
		const byArea = [...grids].sort((left, right) => area(left) - area(right));
		const recommendedArea = area(recommended);
		const isAlternative = (candidate: GridCandidateReport): boolean =>
			!isSameCandidate(candidate, recommended) &&
			!plans.some(
				(plan) =>
					plan.outW === candidate.outW &&
					plan.outH === candidate.outH &&
					(plan.angle ?? 0) === (candidate.angle ?? 0),
			) &&
			!isSimilar(candidate, recommended);
		const coarser = [...byArea]
			.reverse()
			.find(
				(candidate) =>
					area(candidate) < recommendedArea && isAlternative(candidate),
			);
		const finer = byArea.find(
			(candidate) =>
				area(candidate) > recommendedArea && isAlternative(candidate),
		);
		if (finer) plans.push(selectionForGrid(finer, "finer"));
		if (coarser) plans.push(selectionForGrid(coarser, "coarser"));
	}

	if (!plans.some((plan) => plan.kind === "preserve")) {
		plans.push({
			id: "preserve",
			kind: "preserve",
			recommended: recommended === undefined,
			processingMode: "preserve",
		});
	}

	if (
		plans.length < CANDIDATE_PREVIEW_LIMITS.maxCandidates &&
		(classification === "continuous" || classification === "uncertain")
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
	if (selection.processingMode === "auto") return options;
	if (selection.processingMode === "refine") {
		options.forcePixelsW = selection.outW;
		options.forcePixelsH = selection.outH;
		options.deskewAngle = selection.angle;
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
