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
	// [Intended] Auto が原寸維持を採用した場合、その実結果は原寸維持カードそのものである。
	// 専用の Auto結果カードを別に立てると同じ画像が二重に並び、さらに面積が最大の原寸維持が
	// 相対ラベルの基準になるため細かめが一度も選ばれなくなる。
	const autoResultIsPreserve = autoResultCandidate?.method === "preserve";
	const gridAutoResult = autoResultIsPreserve ? undefined : autoResultCandidate;
	const grids = analysis.gridCandidates.filter(
		(candidate) => candidate.method !== "preserve",
	);
	const plans: CandidateSelection[] = [];
	// 細かめ・粗めの基準となる候補。Auto 実結果が検出候補ならそれ自身、原寸維持なら
	// 検出上位の候補に据える（原寸維持を基準にすると面積が最大で細かめが選べない）。
	const anchor = gridAutoResult ?? grids[0];
	// [Intended] Auto 実結果が基準のときは面積もレポート値ではなく実出力から取る。
	// レポート値は検出後のトリミングで実出力とずれることがあり、そのままだと
	// 細かめ・粗めのラベルと実サイズの大小関係が逆転する。
	const anchorArea =
		gridAutoResult &&
		analysis.autoResultOutW !== undefined &&
		analysis.autoResultOutH !== undefined
			? analysis.autoResultOutW * analysis.autoResultOutH
			: anchor
				? area(anchor)
				: 0;
	if (autoResultIsPreserve) {
		plans.push({
			id: "auto-result:preserve",
			kind: "auto-result",
			recommended: true,
			processingMode: "auto",
		});
	} else if (gridAutoResult) {
		plans.push(selectionForGrid(gridAutoResult, "auto-result", true, "auto"));
	}
	if (anchor) {
		// Auto 実結果が検出候補そのものの場合は、同じ候補を推奨カードとして重ねない。
		if (!gridAutoResult) {
			plans.push(
				selectionForGrid(anchor, "recommended", !autoResultIsPreserve),
			);
		}
		const byArea = [...grids].sort((left, right) => area(left) - area(right));
		const isAlternative = (candidate: GridCandidateReport): boolean =>
			!plans.some(
				(plan) =>
					plan.outW === candidate.outW &&
					plan.outH === candidate.outH &&
					(plan.angle ?? 0) === (candidate.angle ?? 0),
			) && !isSimilar(candidate, anchor);
		const coarser = [...byArea]
			.reverse()
			.find(
				(candidate) => area(candidate) < anchorArea && isAlternative(candidate),
			);
		const finer = byArea.find(
			(candidate) => area(candidate) > anchorArea && isAlternative(candidate),
		);
		if (finer) plans.push(selectionForGrid(finer, "finer"));
		if (coarser) plans.push(selectionForGrid(coarser, "coarser"));
	}

	if (!autoResultIsPreserve) {
		plans.push({
			id: "preserve",
			kind: "preserve",
			recommended: plans.length === 0,
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
