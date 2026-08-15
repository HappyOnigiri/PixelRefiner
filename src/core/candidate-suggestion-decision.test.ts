import { describe, expect, it } from "vitest";
import { evaluateCandidateSuggestion } from "./candidate-suggestion-decision";

const evaluate = (
	overrides: Partial<Parameters<typeof evaluateCandidateSuggestion>[0]> = {},
) =>
	evaluateCandidateSuggestion({
		isAuto: true,
		isInitial: true,
		showCandidates: true,
		hasCandidateSelection: false,
		warningCodes: ["LOW_GRID_CONFIDENCE"],
		candidatePreviewCount: 2,
		...overrides,
	});

describe("candidate modal decision", () => {
	it("低グリッド信頼度と候補があれば表示見込みになる", () => {
		expect(evaluate()).toMatchObject({
			candidateSuggestionDecision: "would-show",
			candidateSuggestionReason: "LOW_GRID_CONFIDENCE",
			warningPresentation: "candidate-list",
		});
	});

	it("WARNING がなければモーダルもアイコンも表示しない", () => {
		expect(evaluate({ warningCodes: [] })).toMatchObject({
			candidateSuggestionDecision: "would-not-show",
			candidateSuggestionReason: "NO_WARNING",
			warningPresentation: "none",
		});
	});

	it("低グリッド信頼度以外の WARNING はアイコンへ送る", () => {
		expect(evaluate({ warningCodes: ["CONTENT_LOSS_RISK"] })).toMatchObject({
			candidateSuggestionDecision: "would-not-show",
			candidateSuggestionReason: "NO_LOW_GRID_CONFIDENCE",
			warningPresentation: "indicator",
		});
	});

	it("分類信頼度が低いだけではモーダルを表示しない", () => {
		expect(evaluate({ warningCodes: [] })).toMatchObject({
			candidateSuggestionDecision: "would-not-show",
			warningPresentation: "none",
		});
	});

	it("候補プレビューが生成できなければアイコンへフォールバックする", () => {
		expect(evaluate({ candidatePreviewCount: 0 })).toMatchObject({
			candidateSuggestionDecision: "would-not-show",
			candidateSuggestionReason: "NO_CANDIDATE_PREVIEW",
			warningPresentation: "indicator",
		});
	});

	it("設定で候補表示を無効にした場合はモーダルを表示しない", () => {
		expect(evaluate({ showCandidates: false })).toMatchObject({
			candidateSuggestionDecision: "would-not-show",
			candidateSuggestionReason: "SHOW_CANDIDATES_DISABLED",
			warningPresentation: "indicator",
		});
	});

	it("候補選択済みの再処理ではモーダルを表示しない", () => {
		expect(evaluate({ hasCandidateSelection: true })).toMatchObject({
			candidateSuggestionDecision: "would-not-show",
			candidateSuggestionReason: "CANDIDATE_SELECTION_EXISTS",
			warningPresentation: "indicator",
		});
	});

	// [Intended] 候補リストは Auto 専用。利用者が処理経路を選んでいる場合に
	// 別の経路を提案せず、WARNING を出力欄に表示することを固定する。
	it("Auto 以外はモーダルを表示せず WARNING をアイコンへ送る", () => {
		expect(evaluate({ isAuto: false })).toMatchObject({
			candidateSuggestionEligible: false,
			candidateSuggestionDecision: "not-applicable",
			candidateSuggestionReason: "NOT_AUTO",
			warningPresentation: "indicator",
		});
	});

	it("Auto 以外で WARNING もなければ通知しない", () => {
		expect(evaluate({ isAuto: false, warningCodes: [] })).toMatchObject({
			candidateSuggestionEligible: false,
			candidateSuggestionDecision: "not-applicable",
			candidateSuggestionReason: "NOT_AUTO",
			warningPresentation: "none",
		});
	});

	// [Intended] 候補を選んだあとの再処理は Auto 以外の経路になるが、判定理由は
	// 「選択済み」を優先する。NOT_AUTO では再表示しない本当の理由が読めない。
	it("候補選択済みの再処理は Auto 以外でも選択済みを理由にする", () => {
		expect(
			evaluate({ isAuto: false, hasCandidateSelection: true }),
		).toMatchObject({
			candidateSuggestionReason: "CANDIDATE_SELECTION_EXISTS",
			warningPresentation: "indicator",
		});
	});

	it("プレビュー生成前は候補生成を試行できる", () => {
		expect(evaluate({ candidatePreviewCount: undefined })).toMatchObject({
			candidateSuggestionEligible: true,
			candidateSuggestionDecision: "would-show",
		});
	});
});
