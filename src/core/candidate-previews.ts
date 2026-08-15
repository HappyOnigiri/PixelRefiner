import {
	CANDIDATE_PREVIEW_LIMITS,
	CELL_SCALE_FACTORS,
	PROCESS_DEFAULTS,
} from "../shared/config";
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

/** 候補として提示するセル倍率。細かい側から並べる。 */
const CANDIDATE_CELL_SCALES: readonly CellScale[] = [
	"quarter",
	"half",
	"same",
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

/**
 * 倍率を掛けたセルで、この画像から何ドット取れるかの見積もり。
 * [Policy] 呼び出し前にセル寸法が 1px を下回る段階を除いてあるので、ここでは下限を見ない。
 */
const scaledOutputSize = (
	candidate: GridCandidateReport,
	cellScale: CellScale,
): { outW: number; outH: number } => {
	const factor = CELL_SCALE_FACTORS[cellScale];
	return {
		outW: Math.max(
			1,
			Math.floor(candidate.cropW / (candidate.grid.cellW * factor)),
		),
		outH: Math.max(
			1,
			Math.floor(candidate.cropH / (candidate.grid.cellH * factor)),
		),
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
	/** 現在の設定で選ばれているセル倍率。Auto 結果と同じ段階は候補にしない。 */
	baseCellScale: CellScale = PROCESS_DEFAULTS.cellScale,
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
			// [Intended] Auto 結果と同じ段階は候補にしない。候補は「ドットの大きさだけを
			// 差し替えたもの」なので、いま出ている結果と同じ指定を並べても選択肢にならない。
			// 原寸維持へ退避した場合はセル倍率が効いていないため、全段階が別の結果になる。
			if (!autoResultIsPreserve && cellScale === baseCellScale) continue;
			// [Policy] セル寸法が 1px を下回る段階は候補にしない。処理側は縦横比を保つために
			// 倍率ごと下限へ引き上げるので、出しても見出しの倍率と実際の倍率が食い違う。
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
		convertPixelsW: undefined,
		convertPixelsH: undefined,
		cellScale: undefined,
		detectedGrid,
		// [Intended] グリッド検出の検索開始点となるヒントは候補でも消さない。消すと候補だけ
		// 別の格子を検出し、提示したプレビューと選択後の結果が食い違う。ヒントは「どの倍率で
		// 復元するか」ではなく「どの格子を探すか」の指定なので、段階を変えても持ち回してよい。
		hintPixelsW: base.hintPixelsW,
		hintPixelsH: base.hintPixelsH,
	};
	if (selection.processingMode === "auto") {
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
