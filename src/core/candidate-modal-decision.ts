import type { ProcessingWarningCode } from "../shared/types";

export type CandidateModalDecision =
	| "would-show"
	| "would-not-show"
	| "not-applicable";

export type CandidateModalReason =
	| "LOW_GRID_CONFIDENCE"
	| "NO_WARNING"
	| "NO_LOW_GRID_CONFIDENCE"
	| "NO_CANDIDATE_PREVIEW"
	| "CANDIDATE_SELECTION_EXISTS"
	| "SHOW_CANDIDATES_DISABLED"
	| "NOT_INITIAL"
	| "NOT_AUTO";

export type WarningPresentation = "candidate-modal" | "indicator" | "none";

export type CandidateModalDecisionInput = {
	isAuto: boolean;
	isInitial: boolean;
	showCandidates: boolean;
	hasCandidateSelection: boolean;
	warningCodes: readonly ProcessingWarningCode[];
	/** 未指定の場合は候補プレビュー生成前で、候補が存在する可能性を表す。 */
	candidatePreviewCount?: number;
};

export type CandidateModalDecisionResult = {
	candidateModalEligible: boolean;
	candidateModalDecision: CandidateModalDecision;
	candidateModalReason: CandidateModalReason;
	warningPresentation: WarningPresentation;
};

/**
 * 候補選択モーダルと WARNING 表示の見込みを決定する。
 *
 * [Intended] 候補選択モーダルは Auto 専用にする。Auto 以外は利用者が処理経路を
 * 明示的に選んでいるので、こちらから別の経路を提案せず WARNING を出力欄に表示する。
 * [Intended] candidatePreviewCount が未確定の段階では、他の条件を満たせば
 * プレビュー生成を試行できると判定する。実際の表示可否はプレビュー生成後に
 * 件数を渡して再評価する。
 */
export const evaluateCandidateModalDecision = ({
	isAuto,
	isInitial,
	showCandidates,
	hasCandidateSelection,
	warningCodes,
	candidatePreviewCount,
}: CandidateModalDecisionInput): CandidateModalDecisionResult => {
	const hasWarnings = warningCodes.length > 0;
	const hasLowGridConfidence = warningCodes.includes("LOW_GRID_CONFIDENCE");
	let candidateModalReason: CandidateModalReason;

	if (hasCandidateSelection) {
		candidateModalReason = "CANDIDATE_SELECTION_EXISTS";
	} else if (!isAuto) {
		candidateModalReason = "NOT_AUTO";
	} else if (!isInitial) {
		candidateModalReason = "NOT_INITIAL";
	} else if (!showCandidates) {
		candidateModalReason = "SHOW_CANDIDATES_DISABLED";
	} else if (!hasLowGridConfidence) {
		candidateModalReason = hasWarnings
			? "NO_LOW_GRID_CONFIDENCE"
			: "NO_WARNING";
	} else if (
		candidatePreviewCount !== undefined &&
		candidatePreviewCount <= 0
	) {
		candidateModalReason = "NO_CANDIDATE_PREVIEW";
	} else {
		candidateModalReason = "LOW_GRID_CONFIDENCE";
	}

	const candidateModalEligible = candidateModalReason === "LOW_GRID_CONFIDENCE";
	const candidateModalDecision: CandidateModalDecision = !isAuto
		? "not-applicable"
		: candidateModalEligible
			? "would-show"
			: "would-not-show";
	const warningPresentation: WarningPresentation = candidateModalEligible
		? "candidate-modal"
		: hasWarnings
			? "indicator"
			: "none";

	return {
		candidateModalEligible,
		candidateModalDecision,
		candidateModalReason,
		warningPresentation,
	};
};
