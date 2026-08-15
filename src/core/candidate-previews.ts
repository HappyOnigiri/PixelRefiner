import { CANDIDATE_PREVIEW_LIMITS, CELL_SCALE_FACTORS } from "../shared/config";
import type {
	CandidatePreview,
	CandidateSelection,
	CellScale,
	GridCandidateReport,
	InputClassification,
	ProcessingAnalysis,
	RawImage,
} from "../shared/types";
import { resizeRawImageNearest } from "./image-operations";
import type { DetectedGridHandoff, ProcessOptions } from "./processor-options";

/**
 * 候補として提示するセル倍率。細かい側から並べる。
 * [Intended] 「検出したまま」(same) は Auto 結果そのものなので候補には含めない。
 */
const CANDIDATE_CELL_SCALES: readonly CellScale[] = [
	"quarter",
	"half",
	"double",
	"quadruple",
];

const area = (width: number, height: number): number => width * height;

/**
 * 原寸維持と見分けが付かないほど大きいか。
 * [Intended] 原寸維持より大きくはならない（セルは 1px 未満へ縮めない）ので、
 * 面積比が下限を超えたかどうかだけを見る。
 */
const isNearPreserve = (scaledArea: number, preserveArea: number): boolean =>
	scaledArea >=
	preserveArea * CANDIDATE_PREVIEW_LIMITS.preserveSimilarAreaRatio;

/** 倍率を掛けたセルで、この画像から何ドット取れるかの見積もり。 */
const scaledOutputSize = (
	candidate: GridCandidateReport,
	cellScale: CellScale,
): { outW: number; outH: number } => {
	const factor = CELL_SCALE_FACTORS[cellScale];
	const cellW = Math.max(1, candidate.grid.cellW * factor);
	const cellH = Math.max(1, candidate.grid.cellH * factor);
	return {
		outW: Math.max(1, Math.floor(candidate.cropW / cellW)),
		outH: Math.max(1, Math.floor(candidate.cropH / cellH)),
	};
};

/**
 * 候補として意味のある出力の下限。
 * [Policy] 1 ドットしか無い出力は絵として比べようがなく、粗い側の倍率がすべて
 * 同じ 1x1 に潰れて並ぶ。見て選べない候補は最初から出さない。
 */
const MIN_CANDIDATE_OUTPUT_DIMENSION = 2;

export const selectCandidatePlans = (
	analysis: ProcessingAnalysis,
	classification: InputClassification | undefined = analysis.classification,
): CandidateSelection[] => {
	const autoResultCandidate =
		analysis.autoResultCandidateIndex !== undefined
			? analysis.gridCandidates[analysis.autoResultCandidateIndex]
			: undefined;
	// [Intended] Auto が原寸維持を採用した場合でも、格子検出そのものは行われている。
	// セル倍率の基準にはその検出格子を使い、原寸維持カードは Auto 結果カードが兼ねる。
	const autoResultIsPreserve = autoResultCandidate?.method === "preserve";
	const grids = analysis.gridCandidates.filter(
		(candidate) => candidate.method !== "preserve",
	);
	const anchor = autoResultIsPreserve
		? grids[0]
		: (autoResultCandidate ?? grids[0]);
	const plans: CandidateSelection[] = [];

	if (autoResultCandidate) {
		plans.push({
			id: autoResultIsPreserve
				? "auto-result:preserve"
				: `auto-result:${autoResultCandidate.outW}x${autoResultCandidate.outH}`,
			kind: "auto-result",
			recommended: true,
			processingMode: "auto",
			...(autoResultIsPreserve
				? {}
				: { outW: autoResultCandidate.outW, outH: autoResultCandidate.outH }),
		});
	}

	// 原寸維持の実出力は必ず入力サイズそのもの。細かい側の候補がこれに並ぶほど
	// 大きくなった場合は、原寸維持を残して候補側を落とす。
	const preserveCandidate = analysis.gridCandidates.find(
		(candidate) => candidate.method === "preserve",
	);
	const preserveArea = preserveCandidate
		? area(preserveCandidate.outW, preserveCandidate.outH)
		: undefined;

	if (anchor) {
		const takenSizes = new Set<string>();
		for (const cellScale of CANDIDATE_CELL_SCALES) {
			const factor = CELL_SCALE_FACTORS[cellScale];
			// [Intended] Auto が原寸維持を採用した画像はセルが 1px 相当まで細かい。
			// そこからさらに細かくしても原寸維持と同じ絵にしかならないので出さない。
			if (autoResultIsPreserve && factor < 1) continue;
			// セル寸法が 1px を下回る倍率は、クランプされて隣の段階と同じ出力になる。
			if (anchor.grid.cellW * factor < 1 || anchor.grid.cellH * factor < 1)
				continue;
			const { outW, outH } = scaledOutputSize(anchor, cellScale);
			if (
				outW < MIN_CANDIDATE_OUTPUT_DIMENSION ||
				outH < MIN_CANDIDATE_OUTPUT_DIMENSION
			)
				continue;
			// 粗い側は端数の切り捨てで隣の段階と同じ寸法に落ち着くことがある。
			const sizeKey = `${outW}x${outH}`;
			if (takenSizes.has(sizeKey)) continue;
			if (
				preserveArea !== undefined &&
				isNearPreserve(area(outW, outH), preserveArea)
			)
				continue;
			takenSizes.add(sizeKey);
			plans.push({
				id: `cell-scale:${cellScale}`,
				kind: "cell-scale",
				recommended: false,
				processingMode: "refine",
				cellScale,
			});
		}
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
	detectedGrid?: DetectedGridHandoff,
): ProcessOptions => {
	const options: ProcessOptions = {
		...base,
		processingMode: selection.processingMode,
		// [Policy] 候補は forcePixelsW/H を使わない。force は内容 BBox を軸ごとに独立して
		// 分割するため、候補が使うと入力の縦横比が壊れる。出力サイズを変える手段は cellScale。
		forcePixelsW: undefined,
		forcePixelsH: undefined,
		hintPixelsW: undefined,
		hintPixelsH: undefined,
		convertPixelsW: undefined,
		convertPixelsH: undefined,
		cellScale: undefined,
		detectedGrid,
	};
	// [Intended] Auto 実結果の再現は初回と同じ入力で Auto を再実行することが前提なので、
	// グリッド検出の検索開始点となるヒントは消さない。消すと検出結果が変わり、
	// 候補として提示した実結果を再現できない。
	if (selection.processingMode === "auto") {
		options.hintPixelsW = base.hintPixelsW;
		options.hintPixelsH = base.hintPixelsH;
		options.convertPixelsW = base.convertPixelsW;
		options.convertPixelsH = base.convertPixelsH;
		options.cellScale = base.cellScale;
		return options;
	}
	if (selection.kind === "cell-scale") {
		options.cellScale = selection.cellScale;
	}
	if (selection.processingMode === "convert") {
		options.detailLevel = selection.detailLevel;
		options.convertPixelsW = selection.outW;
		options.convertPixelsH = selection.outH;
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
