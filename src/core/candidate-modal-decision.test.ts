import { describe, expect, it } from "vitest";
import { evaluateCandidateModalDecision } from "./candidate-modal-decision";

const evaluate = (
	overrides: Partial<Parameters<typeof evaluateCandidateModalDecision>[0]> = {},
) =>
	evaluateCandidateModalDecision({
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
			candidateModalDecision: "would-show",
			candidateModalReason: "LOW_GRID_CONFIDENCE",
			warningPresentation: "candidate-modal",
		});
	});

	it("WARNING がなければモーダルも通知も表示しない", () => {
		expect(evaluate({ warningCodes: [] })).toMatchObject({
			candidateModalDecision: "would-not-show",
			candidateModalReason: "NO_WARNING",
			warningPresentation: "none",
		});
	});

	it("低グリッド信頼度以外の WARNING は通常通知へ送る", () => {
		expect(evaluate({ warningCodes: ["CONTENT_LOSS_RISK"] })).toMatchObject({
			candidateModalDecision: "would-not-show",
			candidateModalReason: "NO_LOW_GRID_CONFIDENCE",
			warningPresentation: "toast",
		});
	});

	it("分類信頼度が低いだけではモーダルを表示しない", () => {
		expect(evaluate({ warningCodes: [] })).toMatchObject({
			candidateModalDecision: "would-not-show",
			warningPresentation: "none",
		});
	});

	it("候補プレビューが生成できなければ通常通知へフォールバックする", () => {
		expect(evaluate({ candidatePreviewCount: 0 })).toMatchObject({
			candidateModalDecision: "would-not-show",
			candidateModalReason: "NO_CANDIDATE_PREVIEW",
			warningPresentation: "toast",
		});
	});

	it("設定で候補表示を無効にした場合はモーダルを表示しない", () => {
		expect(evaluate({ showCandidates: false })).toMatchObject({
			candidateModalDecision: "would-not-show",
			candidateModalReason: "SHOW_CANDIDATES_DISABLED",
			warningPresentation: "toast",
		});
	});

	it("候補選択済みの再処理ではモーダルを表示しない", () => {
		expect(evaluate({ hasCandidateSelection: true })).toMatchObject({
			candidateModalDecision: "would-not-show",
			candidateModalReason: "CANDIDATE_SELECTION_EXISTS",
			warningPresentation: "toast",
		});
	});

	// [Intended] 候補選択モーダルは Auto 専用。利用者が処理経路を選んでいる場合に
	// 別の経路を提案せず、WARNING を通常通知へ送ることを固定する。
	it("Auto 以外はモーダルを表示せず WARNING を通常通知へ送る", () => {
		expect(evaluate({ isAuto: false })).toMatchObject({
			candidateModalEligible: false,
			candidateModalDecision: "not-applicable",
			candidateModalReason: "NOT_AUTO",
			warningPresentation: "toast",
		});
	});

	it("Auto 以外で WARNING もなければ通知しない", () => {
		expect(evaluate({ isAuto: false, warningCodes: [] })).toMatchObject({
			candidateModalEligible: false,
			candidateModalDecision: "not-applicable",
			candidateModalReason: "NOT_AUTO",
			warningPresentation: "none",
		});
	});

	// [Intended] 候補を選んだあとの再処理は Auto 以外の経路になるが、判定理由は
	// 「選択済み」を優先する。NOT_AUTO では再表示しない本当の理由が読めない。
	it("候補選択済みの再処理は Auto 以外でも選択済みを理由にする", () => {
		expect(
			evaluate({ isAuto: false, hasCandidateSelection: true }),
		).toMatchObject({
			candidateModalReason: "CANDIDATE_SELECTION_EXISTS",
			warningPresentation: "toast",
		});
	});

	it("プレビュー生成前は候補生成を試行できる", () => {
		expect(evaluate({ candidatePreviewCount: undefined })).toMatchObject({
			candidateModalEligible: true,
			candidateModalDecision: "would-show",
		});
	});
});
