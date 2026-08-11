import path from "node:path";
import type {
	CandidateModalDecision,
	WarningPresentation,
} from "../../../src/core/candidate-modal-decision";
import type { QualityCandidateOption, QualityCaseResult } from "../types";
import { escapeHtml, formatConfidence, formatImageSize } from "./format";

const CANDIDATE_MODAL_DECISION_KEYS: Record<CandidateModalDecision, string> = {
	"would-show": "candidateModalWouldShow",
	"would-not-show": "candidateModalWouldNotShow",
	"not-applicable": "candidateModalNotApplicable",
};

const WARNING_PRESENTATION_KEYS: Record<WarningPresentation, string> = {
	"candidate-modal": "warningPresentationCandidateModal",
	toast: "warningPresentationToast",
	none: "warningPresentationNone",
};

/** 候補選択モーダルが出る見込みか。一覧のバッジと詳細の表示条件で同じ判定を使う。 */
const showsCandidateSelection = (result: QualityCaseResult): boolean =>
	result.candidateModalDecision === "would-show";

/**
 * 一覧のバッジ。WARNING の有無と候補選択モーダルの表示見込みだけを示す。
 * [Policy] 一覧に診断値を並べない。信頼度、判定理由、選択肢の画像はケース詳細で読む。
 */
export const renderAutoDiagnosticBadges = (
	result: QualityCaseResult,
): string => {
	const badges: string[] = [];
	if (result.warnings.length > 0) {
		badges.push(
			'<span class="badge has-warnings" data-i18n="hasWarnings">WARNING</span>',
		);
	}
	if (showsCandidateSelection(result)) {
		badges.push(
			'<span class="badge has-candidate-selection" ' +
				'data-i18n="hasCandidateSelection">candidate selection</span>',
		);
	}
	return badges.join("\n\t\t\t\t");
};

const renderWarningItem = (warning: string): string => {
	const code = escapeHtml(warning);
	return `<li class="warning-item">
				<code>${code}</code>
				<span class="warning-message" data-i18n="processingWarnings.${code}">${code}</span>
				<span class="warning-trigger"><strong data-i18n="warningTrigger">Raised by</strong>:
					<span data-i18n="warningTriggers.${code}">${code}</span></span>
			</li>`;
};

/**
 * WARNING の詳細。コード、利用者へ出る文言、どの判定で付いたかを 1 件ずつ並べる。
 * [Intended] 一覧はバッジしか出さないので、判定条件を辿れる場所はここだけになる。
 * 表示先も併記して、通常通知と候補モーダルのどちらへ出るのかを同じ場所で読めるようにする。
 */
export const renderWarningDetails = (result: QualityCaseResult): string => {
	const presentationKey = WARNING_PRESENTATION_KEYS[result.warningPresentation];
	const body =
		result.warnings.length === 0
			? '<p data-i18n="none">none</p>'
			: `<ul class="warning-list">
			${result.warnings.map(renderWarningItem).join("\n\t\t\t")}
		</ul>`;
	return `<section class="warning-details">
		<h2 data-i18n="warningDetails">WARNING details</h2>
		<p><strong data-i18n="warningPresentation">WARNING presentation</strong>:
			<span data-i18n="${presentationKey}">${escapeHtml(result.warningPresentation)}</span></p>
		${body}
	</section>`;
};

const renderCandidateOption = (option: QualityCandidateOption): string => {
	const kindKey = `candidateKinds.${option.kind}`;
	const recommended = option.recommended
		? ' <span class="badge candidate-recommended" ' +
			'data-i18n="candidateRecommended">recommended</span>'
		: "";
	// [Intended] 生成に失敗した候補も欠番として残す。モーダルの表示見込みは候補プラン数だけで
	// 決まるため、生成できなかった選択肢はここに出さないとレポートから消えてしまう。
	const outputSize =
		option.outputWidth === null || option.outputHeight === null
			? "-"
			: formatImageSize({
					width: option.outputWidth,
					height: option.outputHeight,
				});
	const metadata =
		option.file === null
			? '<span data-i18n="candidateOptionFailed">generation failed</span>'
			: `${outputSize} ` +
				`&middot; <span data-i18n="colorCount">Colors</span> ${String(option.colorCount)}`;
	const stage =
		option.file === null
			? ""
			: `<div class="image-stage"><img src="${escapeHtml(path.posix.basename(option.file))}" ` +
				`alt="${escapeHtml(option.kind)}" data-i18n-alt="${kindKey}" loading="lazy"></div>`;
	return `<figure>
				<figcaption><span data-i18n="${kindKey}">${escapeHtml(option.kind)}</span>${recommended}
					<small class="candidate-metadata">${metadata}</small></figcaption>
				${stage}
			</figure>`;
};

/**
 * 候補選択モーダルの診断と、モーダルに並ぶ選択肢そのもの。
 * [Intended] 選択肢は候補選択モーダルが出る見込みのケースだけ生成するので、それ以外は
 * 判定理由だけを出して「なぜ選択肢が無いのか」を読めるようにする。
 */
export const renderCandidateDiagnostics = (
	result: QualityCaseResult,
): string => {
	if (result.options.processingMode !== "auto") return "";
	const decisionKey =
		CANDIDATE_MODAL_DECISION_KEYS[result.candidateModalDecision];
	const reason = escapeHtml(result.candidateModalReason);
	const options =
		result.candidateOptions.length === 0
			? '<p data-i18n="candidateOptionsUnavailable">No candidate option was generated</p>'
			: `<div class="images candidate-options">
			${result.candidateOptions.map(renderCandidateOption).join("\n\t\t\t")}
		</div>`;
	return `<section class="candidate-diagnostics">
		<h2 data-i18n="candidateDiagnostics">Auto candidate diagnostic</h2>
		<dl>
			<dt data-i18n="candidateModal">Candidate modal</dt>
			<dd><span data-i18n="${decisionKey}">${escapeHtml(result.candidateModalDecision)}</span></dd>
			<dt data-i18n="candidateModalReason">Decision reason</dt>
			<dd><code>${reason}</code>
				<span data-i18n="candidateModalReasons.${reason}">${reason}</span></dd>
			<dt data-i18n="classificationConfidence">Classification confidence</dt>
			<dd>${formatConfidence(result.classificationConfidence)}</dd>
			<dt data-i18n="gridConfidence">Grid confidence</dt>
			<dd>${formatConfidence(result.gridConfidence)}</dd>
			<dt data-i18n="candidatePlanCount">Candidate plans</dt>
			<dd>${String(result.candidatePlanCount)}</dd>
		</dl>
		<h3 data-i18n="candidateOptions">Candidate options</h3>
		${options}
	</section>`;
};
