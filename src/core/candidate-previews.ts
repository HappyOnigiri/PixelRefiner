import {
	CANDIDATE_PREVIEW_LIMITS,
	CELL_SCALE_FACTORS,
	PROCESS_DEFAULTS,
} from "../shared/config";
import type {
	CandidatePreview,
	CandidateSelection,
	CellScale,
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

	if (anchor) {
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
			// [Policy] 出力寸法による絞り込みはここでは行わない。実処理はダウンサンプル後に
			// 内容範囲へトリムするため、この段階で計算できる見積もりは実出力より大きく出る。
			// 採否は生成した候補の実寸法で決める（acceptCandidateResult）。
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

/**
 * 生成し終えた候補を実際に並べてよいかを判定する関数を作る。
 *
 * [Intended] 採否をプラン段階の見積もりではなく実出力で決めるためのもの。実処理は
 * ダウンサンプル後に内容範囲へトリムするので、「切り出し幅 ÷ セル幅」で見積もると
 * 実出力より大きく出る。見積もりで判定すると、1 ドットしか無い候補や、実際には
 * 同じ寸法へ落ち着く候補が並んでしまう。
 * 返す関数は採用した寸法を覚えるため、1 回の候補生成につき 1 つだけ作って使い回す。
 */
export const createCandidateAcceptor = (
	analysis: ProcessingAnalysis,
): ((selection: CandidateSelection, result: RawImage) => boolean) => {
	// [Intended] 原寸維持は縮小しないので、実出力は候補レポートの寸法そのものになる。
	// 実測を待たずに比較の基準として使える。
	const preserveCandidate = analysis.gridCandidates.find(
		(candidate) => candidate.method === "preserve",
	);
	const preserveArea = preserveCandidate
		? area(preserveCandidate.outW, preserveCandidate.outH)
		: undefined;
	const takenSizes = new Set<string>();
	return (selection, result) => {
		if (selection.kind !== "cell-scale") return true;
		if (
			result.width < CANDIDATE_PREVIEW_LIMITS.minOutputDimension ||
			result.height < CANDIDATE_PREVIEW_LIMITS.minOutputDimension
		)
			return false;
		if (
			preserveArea !== undefined &&
			isNearPreserve(area(result.width, result.height), preserveArea)
		)
			return false;
		// 粗い側は端数の切り捨てとトリムで隣の段階と同じ寸法に落ち着くことがある。
		const sizeKey = `${result.width}x${result.height}`;
		if (takenSizes.has(sizeKey)) return false;
		takenSizes.add(sizeKey);
		return true;
	};
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
