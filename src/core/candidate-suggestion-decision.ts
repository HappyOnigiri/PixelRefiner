import type { ProcessingWarningCode } from "../shared/types";

export type CandidateSuggestionDecision =
	| "would-show"
	| "would-not-show"
	| "not-applicable";

export type CandidateSuggestionReason =
	| "LOW_GRID_CONFIDENCE"
	| "NO_WARNING"
	| "NO_LOW_GRID_CONFIDENCE"
	| "NO_CANDIDATE_PREVIEW"
	| "CANDIDATE_SELECTION_EXISTS"
	| "SHOW_CANDIDATES_DISABLED"
	| "NOT_INITIAL"
	| "NOT_AUTO";

export type WarningPresentation = "candidate-list" | "indicator" | "none";

export type CandidateSuggestionInput = {
	isAuto: boolean;
	isInitial: boolean;
	showCandidates: boolean;
	hasCandidateSelection: boolean;
	warningCodes: readonly ProcessingWarningCode[];
	/** 未指定の場合は候補プレビュー生成前で、候補が存在する可能性を表す。 */
	candidatePreviewCount?: number;
};

export type CandidateSuggestionResult = {
	candidateSuggestionEligible: boolean;
	candidateSuggestionDecision: CandidateSuggestionDecision;
	candidateSuggestionReason: CandidateSuggestionReason;
	warningPresentation: WarningPresentation;
};

/**
 * 候補リストと WARNING 表示の見込みを決定する。
 *
 * [Intended] 候補リストは Auto 専用にする。Auto 以外は利用者が処理経路を
 * 明示的に選んでいるので、こちらから別の経路を提案せず WARNING を出力欄に表示する。
 * [Intended] candidatePreviewCount が未確定の段階では、他の条件を満たせば
 * プレビュー生成を試行できると判定する。実際の表示可否はプレビュー生成後に
 * 件数を渡して再評価する。
 */
export const evaluateCandidateSuggestion = ({
	isAuto,
	isInitial,
	showCandidates,
	hasCandidateSelection,
	warningCodes,
	candidatePreviewCount,
}: CandidateSuggestionInput): CandidateSuggestionResult => {
	const hasWarnings = warningCodes.length > 0;
	const hasLowGridConfidence = warningCodes.includes("LOW_GRID_CONFIDENCE");
	let candidateSuggestionReason: CandidateSuggestionReason;

	if (hasCandidateSelection) {
		candidateSuggestionReason = "CANDIDATE_SELECTION_EXISTS";
	} else if (!isAuto) {
		candidateSuggestionReason = "NOT_AUTO";
	} else if (!isInitial) {
		candidateSuggestionReason = "NOT_INITIAL";
	} else if (!showCandidates) {
		candidateSuggestionReason = "SHOW_CANDIDATES_DISABLED";
	} else if (!hasLowGridConfidence) {
		candidateSuggestionReason = hasWarnings
			? "NO_LOW_GRID_CONFIDENCE"
			: "NO_WARNING";
	} else if (
		candidatePreviewCount !== undefined &&
		candidatePreviewCount <= 0
	) {
		candidateSuggestionReason = "NO_CANDIDATE_PREVIEW";
	} else {
		candidateSuggestionReason = "LOW_GRID_CONFIDENCE";
	}

	const candidateSuggestionEligible =
		candidateSuggestionReason === "LOW_GRID_CONFIDENCE";
	const candidateSuggestionDecision: CandidateSuggestionDecision = !isAuto
		? "not-applicable"
		: candidateSuggestionEligible
			? "would-show"
			: "would-not-show";
	const warningPresentation: WarningPresentation = candidateSuggestionEligible
		? "candidate-list"
		: hasWarnings
			? "indicator"
			: "none";

	return {
		candidateSuggestionEligible,
		candidateSuggestionDecision,
		candidateSuggestionReason,
		warningPresentation,
	};
};
