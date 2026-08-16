import type { QualityReportKind } from "../types";

// [Policy] レポートは本体アプリから独立した成果物なので、言語も訳文もここで完結させる。
export type ReportLanguage = "en" | "ja" | "zh-CN";

export const REPORT_LANGUAGES: readonly ReportLanguage[] = [
	"en",
	"ja",
	"zh-CN",
];

// 1 つのキーに対する全言語の訳文
type ReportMessageEntry = Record<ReportLanguage, string>;

// 訳文エントリと、関連するエントリを 1 段だけまとめたグループからなる定義
type ReportMessageTree = Record<
	string,
	ReportMessageEntry | Record<string, ReportMessageEntry>
>;

/**
 * 訳文定義を型を保ったまま受け取る。
 *
 * [Intended] 戻り値を T のままにすることで、訳文が ReportMessageEntry を満たさない
 * （= 言語の登録漏れがある）とその場で型エラーになり、かつ呼び出し側にキー名が
 * 伝わって上書き辞書の型チェックが効く。
 */
const defineReportMessages = <T extends ReportMessageTree>(messages: T): T =>
	messages;

/** 定義ツリーから 1 言語分を取り出した形。 */
type ByLanguage<T> = {
	[K in keyof T]: T[K] extends ReportMessageEntry
		? string
		: { [G in keyof T[K]]: string };
};

const isEntry = (
	value: ReportMessageEntry | Record<string, ReportMessageEntry>,
): value is ReportMessageEntry => typeof value.en === "string";

/** キー単位の定義を、埋め込み用の言語ごとの辞書へ組み替える。 */
const byLanguage = <T extends ReportMessageTree>(
	messages: T,
): Record<ReportLanguage, ByLanguage<T>> => {
	const pick = (language: ReportLanguage) =>
		Object.fromEntries(
			Object.entries(messages).map(([key, value]) => [
				key,
				isEntry(value)
					? value[language]
					: Object.fromEntries(
							Object.entries(value).map(([groupKey, groupEntry]) => [
								groupKey,
								groupEntry[language],
							]),
						),
			]),
		);
	return Object.fromEntries(
		REPORT_LANGUAGES.map((language) => [language, pick(language)]),
	) as Record<ReportLanguage, ByLanguage<T>>;
};

export const REPORT_MESSAGES = defineReportMessages({
	title: {
		ja: "品質レポート",
		en: "PixelRefiner quality report",
		"zh-CN": "PixelRefiner 质量报告",
	},
	groundTruth: {
		ja: "目標",
		en: "Target",
		"zh-CN": "目标",
	},
	input: {
		ja: "入力",
		en: "Input",
		"zh-CN": "输入",
	},
	baseline: {
		ja: "前回生成",
		en: "Previous run",
		"zh-CN": "上次生成",
	},
	result: {
		ja: "今回生成",
		en: "Current run",
		"zh-CN": "本次生成",
	},
	groundTruthDifference: {
		ja: "目標差分",
		en: "Target difference",
		"zh-CN": "与目标的差异",
	},
	baselineDifference: {
		ja: "前回差分",
		en: "Previous-run difference",
		"zh-CN": "与上次生成的差异",
	},
	backgroundMask: {
		ja: "背景マスク",
		en: "Background mask",
		"zh-CN": "背景蒙版",
	},
	targetComparison: {
		ja: "目標との比較",
		en: "Target comparison",
		"zh-CN": "与目标的比较",
	},
	targetSource: {
		ja: "目標の由来",
		en: "Target source",
		"zh-CN": "目标来源",
	},
	targetUnregistered: {
		ja: "このケースには目標が登録されていません",
		en: "No target registered for this case",
		"zh-CN": "此用例未登记目标",
	},
	sizeMatches: {
		ja: "サイズ一致",
		en: "Size matches",
		"zh-CN": "尺寸一致",
	},
	inputKind: {
		ja: "入力種別",
		en: "Input kind",
		"zh-CN": "输入类型",
	},
	route: {
		ja: "処理ルート",
		en: "Route",
		"zh-CN": "处理路径",
	},
	classificationConfidence: {
		ja: "自動分類信頼度",
		en: "Classification confidence",
		"zh-CN": "自动分类置信度",
	},
	gridConfidence: {
		ja: "グリッド信頼度",
		en: "Grid confidence",
		"zh-CN": "网格置信度",
	},
	notAvailable: {
		ja: "取得不可",
		en: "not available",
		"zh-CN": "不可用",
	},
	metricReferenceUnavailable: {
		ja: "このケースは比較の基準になる出力が無いため、指標を測定できません。",
		en: "No reference output is available for this case, so its metrics cannot be measured.",
		"zh-CN": "该用例没有可作为比较基准的输出，因此无法测量指标。",
	},
	hasWarnings: {
		ja: "WARNINGあり",
		en: "WARNING present",
		"zh-CN": "存在 WARNING",
	},
	hasCandidateSelection: {
		ja: "候補選択あり",
		en: "candidate selection shown",
		"zh-CN": "有候选选择",
	},
	warningDetails: {
		ja: "WARNINGの詳細",
		en: "WARNING details",
		"zh-CN": "WARNING 详情",
	},
	warningTrigger: {
		ja: "判定条件",
		en: "Raised by",
		"zh-CN": "判定条件",
	},
	candidateDiagnostics: {
		ja: "Auto候補リスト診断",
		en: "Auto candidate diagnostic",
		"zh-CN": "Auto 候选列表诊断",
	},
	candidateSuggestion: {
		ja: "候補リスト",
		en: "Candidate list",
		"zh-CN": "候选列表",
	},
	candidateSuggestionWouldShow: {
		ja: "表示される想定",
		en: "expected to show",
		"zh-CN": "预计显示",
	},
	candidateSuggestionWouldNotShow: {
		ja: "表示されない",
		en: "not expected to show",
		"zh-CN": "预计不显示",
	},
	candidateSuggestionNotApplicable: {
		ja: "対象外",
		en: "not applicable",
		"zh-CN": "不适用",
	},
	warningPresentation: {
		ja: "WARNINGの表示先",
		en: "WARNING presentation",
		"zh-CN": "WARNING 显示位置",
	},
	warningPresentationCandidateList: {
		ja: "候補リスト",
		en: "candidate list",
		"zh-CN": "候选列表",
	},
	warningPresentationIndicator: {
		ja: "警告アイコン",
		en: "warning indicator",
		"zh-CN": "警告图标",
	},
	warningPresentationNone: {
		ja: "なし",
		en: "none",
		"zh-CN": "无",
	},
	candidateSuggestionReason: {
		ja: "判定理由",
		en: "Decision reason",
		"zh-CN": "判定原因",
	},
	candidatePlanCount: {
		ja: "候補プラン数",
		en: "Candidate plans",
		"zh-CN": "候选方案数",
	},
	candidateOptions: {
		ja: "候補選択の選択肢",
		en: "Candidate options",
		"zh-CN": "候选选择项",
	},
	candidateOptionsUnavailable: {
		ja: "生成された選択肢はありません",
		en: "No candidate option was generated",
		"zh-CN": "未生成候选项",
	},
	candidateOptionFailed: {
		ja: "選択肢の生成に失敗",
		en: "generation failed",
		"zh-CN": "候选项生成失败",
	},
	candidateRecommended: {
		ja: "おすすめ",
		en: "Recommended",
		"zh-CN": "推荐",
	},
	colorCount: {
		ja: "色数",
		en: "Colors",
		"zh-CN": "色数",
	},
	none: {
		ja: "なし",
		en: "none",
		"zh-CN": "无",
	},
	topCandidates: {
		ja: "上位候補",
		en: "Top candidates",
		"zh-CN": "候选前三名",
	},
	metrics: {
		ja: "評価指標",
		en: "Metrics",
		"zh-CN": "指标",
	},
	options: {
		ja: "処理設定",
		en: "Options",
		"zh-CN": "处理设置",
	},
	filterCases: {
		ja: "ケースを絞り込む",
		en: "Filter cases",
		"zh-CN": "筛选用例",
	},
	language: {
		ja: "表示言語",
		en: "Language",
		"zh-CN": "显示语言",
	},
	toggleTheme: {
		ja: "表示テーマを切り替える",
		en: "Toggle color theme",
		"zh-CN": "切换显示主题",
	},
	allStatuses: {
		ja: "すべて",
		en: "All",
		"zh-CN": "全部",
	},
	passed: {
		ja: "合格",
		en: "passed",
		"zh-CN": "通过",
	},
	// [Intended] 目標画像との一致とは別概念なので "target" を避ける。こちらはケース定義の
	// 許容値（誤差上限など）を満たすかどうか。
	failed: {
		ja: "基準未達",
		en: "expectation unmet",
		"zh-CN": "未达标准",
	},
	targetMet: {
		ja: "目標達成",
		en: "target met",
		"zh-CN": "达到目标",
	},
	targetUnmet: {
		ja: "目標未達",
		en: "target unmet",
		"zh-CN": "未达目标",
	},
	targetMissing: {
		ja: "判定不能",
		en: "cannot assess",
		"zh-CN": "无法判定",
	},
	preserve: {
		ja: "保持",
		en: "preserve",
		"zh-CN": "保留",
	},
	refine: {
		ja: "復元",
		en: "refine",
		"zh-CN": "优化",
	},
	convert: {
		ja: "変換",
		en: "convert",
		"zh-CN": "转换",
	},
	workflow: {
		ja: "実行ログ",
		en: "workflow",
		"zh-CN": "工作流",
	},
	changed: {
		ja: "差分あり",
		en: "changed from previous run / base branch",
		"zh-CN": "与上次运行 / 基础分支不同",
	},
	unchanged: {
		ja: "差分なし",
		en: "unchanged from previous run / base branch",
		"zh-CN": "与上次运行 / 基础分支相同",
	},
	new: {
		ja: "新規追加",
		en: "new case",
		"zh-CN": "新增用例",
	},
	allChanges: {
		ja: "すべて",
		en: "All",
		"zh-CN": "全部",
	},
	qualityStatus: {
		ja: "目標品質",
		en: "Target quality",
		"zh-CN": "目标质量",
	},
	parameterMode: {
		ja: "パラメータ",
		en: "Parameters",
		"zh-CN": "参数",
	},
	allParameters: {
		ja: "すべて",
		en: "All",
		"zh-CN": "全部",
	},
	explicitParameters: {
		ja: "オプション指定あり",
		en: "explicit options",
		"zh-CN": "指定选项",
	},
	autoParameters: {
		ja: "自動判定",
		en: "auto detection",
		"zh-CN": "自动判定",
	},
	changeStatus: {
		ja: "前回比較",
		en: "Change from previous run",
		"zh-CN": "与上次运行的比较",
	},
	reportDetails: {
		ja: "レポート情報",
		en: "Report details",
		"zh-CN": "报告信息",
	},
	localReport: {
		ja: "ローカルで表示中",
		en: "Viewing locally",
		"zh-CN": "正在本地查看",
	},
	releaseReport: {
		ja: "リリースレポート",
		en: "Release report",
		"zh-CN": "版本报告",
	},
	previousVersion: {
		ja: "前回バージョン",
		en: "Previous version",
		"zh-CN": "上一版本",
	},
	previousRunUnavailable: {
		ja: "前回生成を取得できないため、前回との比較は表示していません。",
		en: "The previous run is unavailable, so comparisons with it are omitted.",
		"zh-CN": "无法获取上次运行结果，因此不显示与上次的比较。",
	},
	pullRequest: {
		ja: "プルリクエスト",
		en: "Pull request",
		"zh-CN": "拉取请求",
	},
	headCommit: {
		ja: "HEAD",
		en: "Head",
		"zh-CN": "HEAD",
	},
	baseCommit: {
		ja: "PRのベース",
		en: "PR base",
		"zh-CN": "PR 基础提交",
	},
	baselineCommit: {
		ja: "比較基準",
		en: "Baseline snapshot",
		"zh-CN": "比较基准",
	},
	generatedAt: {
		ja: "生成日時",
		en: "Generated",
		"zh-CN": "生成时间",
	},
	displayConditions: {
		ja: "表示条件",
		en: "Showing",
		"zh-CN": "显示条件",
	},
	casesShown: {
		ja: "件",
		en: "cases",
		"zh-CN": "个用例",
	},
	changedPixels: {
		ja: "変更画素",
		en: "Changed pixels",
		"zh-CN": "变更像素",
	},
	comparison: {
		ja: "指標の比較",
		en: "Metric comparison",
		"zh-CN": "指标比较",
	},
	metric: {
		ja: "指標",
		en: "Metric",
		"zh-CN": "指标",
	},
	target: {
		ja: "合格条件",
		en: "Target",
		"zh-CN": "目标",
	},
	current: {
		ja: "今回",
		en: "Current",
		"zh-CN": "当前",
	},
	delta: {
		ja: "変化量",
		en: "Delta",
		"zh-CN": "变化量",
	},
	verdict: {
		ja: "判定",
		en: "Verdict",
		"zh-CN": "判定",
	},
	metricImproved: {
		ja: "指標が前回基準より改善",
		en: "metric improved against baseline",
		"zh-CN": "指标优于基准",
	},
	metricRegressed: {
		ja: "指標が前回基準より悪化",
		en: "metric regressed against baseline",
		"zh-CN": "指标劣于基准",
	},
	metricUnchanged: {
		ja: "指標が前回基準と同じ",
		en: "metric unchanged against baseline",
		"zh-CN": "指标与基准相同",
	},
	regressedMetrics: {
		ja: "悪化した指標",
		en: "Regressed metrics",
		"zh-CN": "劣化的指标",
	},
	catastrophicFailure: {
		ja: "致命的な失敗",
		en: "Catastrophic failure",
		"zh-CN": "灾难性失败",
	},
	status: {
		ja: "合格判定",
		en: "Expectation status",
		"zh-CN": "达标判定",
	},
	outputSize: {
		ja: "出力サイズ",
		en: "Output size",
		"zh-CN": "输出尺寸",
	},
	meanRgbaError: {
		ja: "RGBA平均誤差",
		en: "Mean RGBA error",
		"zh-CN": "RGBA 平均误差",
	},
	processingTime: {
		ja: "時間",
		en: "Time",
		"zh-CN": "时间",
	},
	exactMatch: {
		ja: "完全一致",
		en: "Exact match",
		"zh-CN": "完全匹配",
	},
	yes: {
		ja: "はい",
		en: "yes",
		"zh-CN": "是",
	},
	no: {
		ja: "いいえ",
		en: "no",
		"zh-CN": "否",
	},
	edgeF1: {
		ja: "輪郭F1",
		en: "Edge F1",
		"zh-CN": "边缘 F1",
	},
	backgroundMaskIou: {
		ja: "背景マスクIoU",
		en: "Background mask IoU",
		"zh-CN": "背景蒙版 IoU",
	},
	smallComponentRetention: {
		ja: "小要素保持率",
		en: "Small component retention",
		"zh-CN": "小组件保留率",
	},
	diagnostics: {
		ja: "すべての画像と処理設定",
		en: "All images and settings",
		"zh-CN": "所有图像和处理设置",
	},
	details: {
		ja: "詳細",
		en: "Details",
		"zh-CN": "详情",
	},
	backToReport: {
		ja: "レポートに戻る",
		en: "Back to report",
		"zh-CN": "返回报告",
	},
	assertions: {
		"exact-image-match": {
			ja: "画像の完全一致",
			en: "exact image match",
			"zh-CN": "图像完全匹配",
		},
		"mean-rgba-error": {
			ja: "RGBA平均誤差",
			en: "mean RGBA error",
			"zh-CN": "RGBA 平均误差",
		},
		"edge-f1": {
			ja: "輪郭の保持",
			en: "edge retention",
			"zh-CN": "边缘保留",
		},
		"background-mask-iou": {
			ja: "背景マスク",
			en: "background mask",
			"zh-CN": "背景蒙版",
		},
		"small-component-retention": {
			ja: "小要素の保持",
			en: "small component retention",
			"zh-CN": "小组件保留",
		},
		"expected-width": {
			ja: "期待する幅",
			en: "expected width",
			"zh-CN": "预期宽度",
		},
		"expected-height": {
			ja: "期待する高さ",
			en: "expected height",
			"zh-CN": "预期高度",
		},
		"deterministic-output": {
			ja: "出力の再現性",
			en: "deterministic output",
			"zh-CN": "输出可重复性",
		},
		"catastrophic-failure": {
			ja: "致命的な失敗",
			en: "catastrophic failure",
			"zh-CN": "灾难性失败",
		},
		"output-size": {
			ja: "出力サイズ",
			en: "output size",
			"zh-CN": "输出尺寸",
		},
	},
	processingWarnings: {
		LOW_GRID_CONFIDENCE: {
			ja: "グリッド判定の信頼度が低いため、結果を確認してください。",
			en: "Grid confidence is low. Please check the result.",
			"zh-CN": "网格置信度较低，请检查结果。",
		},
		BACKGROUND_UNCERTAIN: {
			ja: "背景の判定が不確かです。",
			en: "The background detection is uncertain.",
			"zh-CN": "背景判断存在不确定性。",
		},
		BACKGROUND_REMOVAL_SKIPPED: {
			ja: "背景が消えすぎると判定したため、背景の透過を中止しました。",
			en: "Background removal was skipped because too much would have been removed.",
			"zh-CN": "检测到背景可能被过度移除，已中止背景透明化。",
		},
		CONTENT_LOSS_RISK: {
			ja: "処理によって内容が大きく失われた可能性があります。",
			en: "Processing may have removed a large amount of content.",
			"zh-CN": "处理可能导致大量内容丢失。",
		},
		ONE_AXIS_DETECTION_FAILED: {
			ja: "片方向のグリッドを検出できませんでした。",
			en: "The grid could not be detected on one axis.",
			"zh-CN": "无法检测一个方向的网格。",
		},
		EXTREME_OUTPUT_SIZE: {
			ja: "出力サイズが非常に大きくなっています。",
			en: "The output size is extremely large.",
			"zh-CN": "输出尺寸非常大。",
		},
		NO_CONTENT: {
			ja: "処理対象の内容を検出できませんでした。",
			en: "No processable content was detected.",
			"zh-CN": "未检测到可处理的内容。",
		},
		FALLBACK_TO_PRESERVE: {
			ja: "安全のため元のサイズを維持しました。",
			en: "The original size was preserved for safety.",
			"zh-CN": "为安全起见，已保留原始尺寸。",
		},
	},
	// [Policy] どの判定でその WARNING が付いたかを書く。利用者向けの文言
	// （processingWarnings）とは別に、レポートの読者が原因を追える説明を持たせる。
	warningTriggers: {
		LOW_GRID_CONFIDENCE: {
			ja:
				"採用したグリッド候補の信頼度が閾値未満、縦横のスコアが食い違う、" +
				"出力が退化または極小になる、片軸の検出に失敗した、のいずれかを検出した。",
			en:
				"The selected grid candidate's confidence is below the threshold, the two axis scores " +
				"disagree, the output would be degenerate or extremely small, or one axis failed detection.",
			"zh-CN":
				"采用的网格方案置信度低于阈值、两轴评分不一致、输出会退化或极小、" +
				"或某一轴检测失败。",
		},
		BACKGROUND_UNCERTAIN: {
			ja: "自動背景モデルの信頼度が下限を下回った。",
			en: "The automatic background model's confidence is below the minimum.",
			"zh-CN": "自动背景模型的置信度低于下限。",
		},
		BACKGROUND_REMOVAL_SKIPPED: {
			ja: "背景が消えすぎると判定し、背景除去をロールバックした。",
			en: "Background removal was rolled back because too much would have been removed.",
			"zh-CN": "判断背景会被过度移除，已回滚背景透明化。",
		},
		CONTENT_LOSS_RISK: {
			ja: "処理の前後で前景の割合が上限を超えて減った。",
			en: "The foreground ratio dropped more than the allowed limit between input and output.",
			"zh-CN": "处理前后前景比例的下降超过上限。",
		},
		ONE_AXIS_DETECTION_FAILED: {
			ja: "グリッド検出で縦横のうち片方だけ失敗した。",
			en: "Grid detection failed on exactly one of the two axes.",
			"zh-CN": "网格检测仅在一个方向上失败。",
		},
		EXTREME_OUTPUT_SIZE: {
			ja: "出力が退化または極小になる、あるいは出力の幅か高さが上限を超えた。",
			en: "The output would be degenerate or extremely small, or its width or height exceeds the limit.",
			"zh-CN": "输出会退化或极小，或输出的宽或高超过上限。",
		},
		NO_CONTENT: {
			ja: "処理前の前景画素が無く、処理対象が存在しない。",
			en: "The input had no foreground pixel to process.",
			"zh-CN": "处理前不存在前景像素，没有可处理的内容。",
		},
		FALLBACK_TO_PRESERVE: {
			ja: "Autoの判定が低信頼、または検出したグリッドが縮退したため、原寸維持へ退避した。",
			en:
				"Auto fell back to keeping the original size because its decision was low confidence " +
				"or the detected grid was degenerate.",
			"zh-CN": "Auto 的判定置信度低，或检测到的网格退化，因此退回保持原尺寸。",
		},
	},
	candidateSuggestionReasons: {
		LOW_GRID_CONFIDENCE: {
			ja: "グリッド信頼度が低く、候補を提示できる",
			en: "Grid confidence is low and candidates can be offered",
			"zh-CN": "网格置信度低，可以提供候选",
		},
		NO_WARNING: {
			ja: "WARNINGが無い",
			en: "No warning was raised",
			"zh-CN": "没有 WARNING",
		},
		NO_LOW_GRID_CONFIDENCE: {
			ja: "WARNINGはあるが、グリッド信頼度の低下ではない",
			en: "A warning was raised, but not about low grid confidence",
			"zh-CN": "有 WARNING，但不是网格置信度低",
		},
		NO_CANDIDATE_PREVIEW: {
			ja: "提示できる候補が無い",
			en: "No candidate could be offered",
			"zh-CN": "没有可提供的候选",
		},
		CANDIDATE_SELECTION_EXISTS: {
			ja: "すでに候補を選択済み",
			en: "A candidate has already been selected",
			"zh-CN": "已经选择过候选",
		},
		SHOW_CANDIDATES_DISABLED: {
			ja: "候補選択の表示が設定で無効",
			en: "Candidate selection is disabled in the settings",
			"zh-CN": "设置中已关闭候选选择",
		},
		NOT_INITIAL: {
			ja: "初回処理ではない",
			en: "This is not the initial processing run",
			"zh-CN": "不是首次处理",
		},
		NOT_AUTO: {
			ja: "Auto以外の処理モード",
			en: "The processing mode is not Auto",
			"zh-CN": "处理模式不是 Auto",
		},
	},
	candidateKinds: {
		"auto-result": {
			ja: "Auto結果",
			en: "Auto result",
			"zh-CN": "Auto结果",
		},
		"cell-scale": {
			ja: "ドットの大きさ",
			en: "Pixel size",
			"zh-CN": "像素大小",
		},
		preserve: {
			ja: "原寸維持",
			en: "Keep original size",
			"zh-CN": "保持原尺寸",
		},
		convert: {
			ja: "Convert候補",
			en: "Convert option",
			"zh-CN": "转换方案",
		},
	},
	candidateCellScales: {
		quarter: {
			ja: "ドットをとても小さく（1/4倍）",
			en: "Much smaller pixels (1/4x)",
			"zh-CN": "像素小很多（1/4 倍）",
		},
		half: {
			ja: "ドットを小さく（1/2倍）",
			en: "Smaller pixels (1/2x)",
			"zh-CN": "像素更小（1/2 倍）",
		},
		same: {
			ja: "検出したドットのまま（1倍）",
			en: "Detected pixel size (1x)",
			"zh-CN": "保持检测到的像素（1 倍）",
		},
		double: {
			ja: "ドットを大きく（2倍）",
			en: "Larger pixels (2x)",
			"zh-CN": "像素更大（2 倍）",
		},
		quadruple: {
			ja: "ドットをとても大きく（4倍）",
			en: "Much larger pixels (4x)",
			"zh-CN": "像素大很多（4 倍）",
		},
	},
});

/**
 * 上書き辞書の型。
 * [Intended] 独立したオブジェクト型にすると、キー名の打ち間違いは未使用キーが増える
 * だけで型検査を通り、表示が黙って上書き前の文言に戻る。言語の取りこぼしも同様に
 * 検出できないため、既存キーの部分集合であることを型で強制する。
 */
type ReportMessageOverrides = Partial<typeof REPORT_MESSAGES>;

const PULL_REQUEST_REFERENCE_MESSAGES = defineReportMessages({
	baseline: {
		ja: "ベースブランチ",
		en: "Base branch",
		"zh-CN": "基础分支",
	},
	baselineDifference: {
		ja: "ベースブランチ差分",
		en: "Base-branch difference",
		"zh-CN": "与基础分支的差异",
	},
	changed: {
		ja: "ベースブランチと差分あり",
		en: "changed from base branch",
		"zh-CN": "与基础分支不同",
	},
	unchanged: {
		ja: "ベースブランチと差分なし",
		en: "unchanged from base branch",
		"zh-CN": "与基础分支相同",
	},
	changeStatus: {
		ja: "ベースブランチとの比較",
		en: "Change from base branch",
		"zh-CN": "与基础分支的比较",
	},
	previousRunUnavailable: {
		ja: "ベースブランチの生成結果を取得できないため、比較を表示していません。",
		en: "The base-branch output is unavailable, so comparisons with it are omitted.",
		"zh-CN": "无法获取基础分支的生成结果，因此不显示相关比较。",
	},
	metricImproved: {
		ja: "指標がベースブランチより改善",
		en: "metric improved against base branch",
		"zh-CN": "指标优于基础分支",
	},
	metricRegressed: {
		ja: "指標がベースブランチより悪化",
		en: "metric regressed against base branch",
		"zh-CN": "指标劣于基础分支",
	},
	metricUnchanged: {
		ja: "指標がベースブランチと同じ",
		en: "metric unchanged against base branch",
		"zh-CN": "指标与基础分支相同",
	},
}) satisfies ReportMessageOverrides;

const PULL_REQUEST_REPORT_MESSAGES = {
	...REPORT_MESSAGES,
	...PULL_REQUEST_REFERENCE_MESSAGES,
};

export const REPORT_TRANSLATIONS = byLanguage(REPORT_MESSAGES);

const PULL_REQUEST_REPORT_TRANSLATIONS = byLanguage(
	PULL_REQUEST_REPORT_MESSAGES,
);

/** PR レポートだけ比較元をベースブランチと明示し、リリース比較の表現は維持する。 */
export const reportTranslations = (kind: QualityReportKind) =>
	kind === "pull-request"
		? PULL_REQUEST_REPORT_TRANSLATIONS
		: REPORT_TRANSLATIONS;
