import type { DetailLevel, RGB, SmallComponentRemovalMode } from "./types";

export type IntRange = {
	min: number;
	max: number;
	default: number;
};

export const PROCESS_RANGES = {
	// 検出器: ポスタライズの段階数
	detectionQuantStep: { min: 1, max: 128, default: 64 } as const,
	// 検出器: 支配的な背景色に対するチャンネルごとの許容値
	backgroundMaskTolerance: { min: 0, max: 255, default: 0 } as const,
	// 処理器: ダウンサンプリング時の中央値ウィンドウ
	sampleWindow: { min: 1, max: 9, default: 3 } as const,
	// 処理器: 1セルから評価するサンプル数の上限
	maxSamplesPerCell: { min: 1, max: 256, default: 32 } as const,
	// 処理器: 色候補として扱うアルファの下限
	cellAlphaThreshold: { min: 0, max: 255, default: 16 } as const,
	// 塗りつぶしの許容値（チャンネルごと）
	backgroundTolerance: { min: 0, max: 255, default: 64 } as const,
	// トリミング用の境界ボックスしきい値
	trimAlphaThreshold: { min: 1, max: 255, default: 16 } as const,
	// 小さな孤立領域（連結成分）を背景として除去する
	floatingMaxPixels: { min: 0, max: 1000000, default: 0 } as const,
	// 出力ピクセルサイズを強制する（境界ボックスのトリミング後）
	forcePixelsW: { min: 1, max: 1024, default: 0 } as const,
	forcePixelsH: { min: 1, max: 1024, default: 0 } as const,
	// 減色
	colorCount: { min: 2, max: 256, default: 32 } as const,
	// ディザリング
	ditherStrength: { min: 0, max: 100, default: 0 } as const,
	// アウトライン
	outlineColor: { r: 255, g: 255, b: 255 }, // デフォルトの白
	// 自動傾き補正で扱う角度（度）
	deskewAngle: { min: -3, max: 3, default: 0 } as const,
} as const satisfies Record<string, IntRange | RGB>;

/** Gemini の右下ウォーターマークを、透過後の独立成分として識別する条件。 */
export const GEMINI_WATERMARK_LIMITS = {
	alphaThreshold: 16,
	minimumImageDimension: 48,
	minimumComponentPixels: 24,
	minimumDimensionRatio: 0.018,
	maximumDimensionRatio: 0.12,
	maximumAspectRatio: 1.1,
	minimumCenterRatio: 0.7,
	minimumMarginRatio: 0.002,
	maximumMarginRatio: 0.1,
	minimumFillRatio: 0.28,
	maximumFillRatio: 0.78,
	cornerSizeRatio: 0.25,
	maximumCornerPixelRatio: 0.08,
	minimumSymmetryRatio: 0.98,
	minimumBrightPixelRatio: 1,
	brightLuminanceMinimum: 168,
	minimumSubjectSizeRatio: 2,
} as const;

/**
 * ブラーや補間でにじんだアルファから、論理セルが実際に塗られていたかを判定する条件。
 *
 * [Intended] ブラー入力では、隣接する不透明セルのアルファが窓の端へ数十だけ漏れる。
 * 旧実装はその裾をセル全体のアルファに採用してしまい、透明であるべきセルが埋まる。
 * 一方「窓の少数派が不透明なら透明」という多数決に置き換えると、背景除去で作られた
 * ハードなアルファ境界（高解像度入力の物体外周など）を 1 セル削ってしまう。
 * そこで以下の条件がすべて揃った場合だけを「にじみのみ」と判定する。
 */
export const SOFT_ALPHA_CELL_LIMITS = {
	/**
	 * 判定を行う最小のセル辺長（px）。
	 * [Policy] 1 セルが 1〜2 画素しかない入力では、セル内のアルファ勾配は
	 * 劣化ではなく元画像が意図したフェードなので、判定対象から外す。
	 */
	minCellSize: 2,
	/**
	 * セル内アルファの最大値と最小値の差。これ未満なら丸め誤差の範囲とみなす。
	 * [Policy] 色候補として扱うアルファの下限（cellAlphaThreshold の既定）と同じ幅にする。
	 */
	minRampSpan: 16,
	/**
	 * ランプと判定するための最大値／最小値の比。
	 * [Intended] 一様な半透明セル（ノイズで多少ばらつくものを含む）を守るための条件。
	 * 最小値を 2 倍しても最大値へ届かない、つまり最小値がほぼ空である場合だけランプとみなす。
	 */
	rampPeakToFloorRatio: 2,
	/** セル内アルファの最大値がこの値未満なら、セル自身は不透明まで届いていない。 */
	maxBleedPeak: 192,
	/** セル内の被覆（重み付き平均アルファ）がこの値未満なら、被覆は半分未満。 */
	maxBleedCoverage: 128,
	/** 面積被覆アルファを保持しない場合に、不透明な論理セルへ丸める下限。 */
	hardEdgeCoverageThreshold: 128,
} as const;

/**
 * セルの代表色を選ぶときに使う「セル中心寄りの領域（コア）」の定義。
 *
 * [Intended] ブラー・補間・非整数倍の拡大では、セル境界の画素が隣接セルの色と
 * 混ざる。境界画素まで含めて medoid を採ると、混色そのものが代表色として選ばれる。
 * コアだけで代表色を決めれば、混色比率がもっとも低い画素が残る。
 * アルファの被覆はセル全域で測り続けるので、面積由来の半透明表現は保たれる。
 */
export const CELL_COLOR_CORE_LIMITS = {
	/**
	 * セル幅・高さに対して片側から除外する比率。0.375 ならセル中央 25% がコア。
	 * [Policy] セル中心はつねにコアへ入るので、コアが空になることはない。
	 */
	marginRatio: 0.375,
	/**
	 * コアとして残す最小の幅（px）。比率だけで縮めるとコアが 1 画素以下になり、
	 * 代表色が「たまたま中心に来た画素」へ固定されて medoid の選択が効かなくなる。
	 * [Intended] 2 なら 4px セルで中央 2 画素が残り、混色の少ない側を選べる。
	 */
	minCoreSpan: 2,
	/**
	 * 片側から除外する幅の上限（px）。
	 * [Policy] にじみは境界から数画素しか伸びない。大きなセルで比率どおりに削ると
	 * 有効なセル内部まで捨てて、代表色が極小の窓だけで決まってしまう。
	 */
	maxMarginPixels: 6,
} as const;

export const PROCESS_ANALYSIS_THRESHOLDS = {
	contentLossRatio: 0.5,
	gridScoreScale: 16,
	extremeOutputDimension: 4096,
	minLargeInputArea: 4096,
	minSafeOutputArea: 4,
	maxCellAspectRatio: 8,
	maxAxisScoreDifferenceRatio: 0.9,
	gridCandidateConfidenceThreshold: 0.3,
	gridCandidateSampleLimit: 65536,
	gridCandidateReconstructionScale: 48,
	legacyPreserveCandidateScore: 1_000_000,
} as const;

// 等倍ドット絵判定（整数倍拡大の格子検出）に使う定数。
export const NATIVE_SCALE_LIMITS = {
	/** 遷移とみなす最小のエッジ強度（0〜1 に正規化した平均差）。 */
	minTransitionStrength: 0.02,
	/** これを超える画素数の画像は等倍判定を行わない。 */
	maxAnalysisPixels: 1_048_576,
} as const;

// auto 経路でグリッドが縮退したときのフォールバック条件。
export const AUTO_GRID_GUARD_LIMITS = {
	/** ガードを適用する入力の最大辺。これを超える入力は既存の出力を維持する。 */
	maxGuardedInputDimension: 32,
	/** 出力の最小辺がこれ未満なら縮退とみなす。 */
	minOutputDimension: 4,
	/** セルの縦横比がこれを超えたら縮退とみなす。 */
	maxCellAspectRatio: 8,
	/** 検出した整数倍格子と出力サイズが一致しているとみなす比率。 */
	nativeLatticeMatchRatio: 0.5,
} as const;

export const CANDIDATE_PREVIEW_LIMITS = {
	maxCandidates: 4,
	maxThumbnailDimension: 192,
	maxCacheEntries: 8,
	/** 面積差がこの比率以内なら、候補として区別できないほど近いとみなす。 */
	similarAreaRatio: 0.02,
	/** 面積差の下限（極小サイズで比率が効かない場合の救済）。 */
	minSimilarAreaDiff: 2,
	/** セルサイズ差がこの px 未満なら、候補として区別できないほど近いとみなす。 */
	similarCellDelta: 0.2,
} as const;

export const BATCH_PALETTE_DEFAULTS = {
	/** 画像ごとの総寄与を揃えたうえで、画像内の画素頻度へ割り当てる比率。 */
	frequencyWeight: 0.75,
	/** 小さなアクセント色を保護するため、一意色へ均等に割り当てる比率。 */
	uniformColorWeight: 0.25,
	/** 1画像から共通パレットへ渡す決定論的サンプル数の上限。 */
	maxSamplesPerImage: 65_536,
} as const;

export const INPUT_CLASSIFIER_THRESHOLDS = {
	maxSamplePixels: 65_536,
	minDimension: 2,
	nativeMaxDimension: 64,
	nativeSafeMaxDimension: 12,
	nativeUniqueColorRatio: 0.35,
	nativeFlatNeighborRatio: 0.42,
	smoothGradientMaxDifference: 96,
	scaledGridConfidence: 0.3,
	scaledMinGridScale: 1.5,
	scaledFlatNeighborRatio: 0.48,
	softGridConfidence: 0.24,
	softMinGridScale: 1.35,
	softSmoothGradientRatio: 0.5,
	continuousUniqueColorRatio: 0.12,
	continuousSmoothGradientRatio: 0.62,
	continuousFlatNeighborRatio: 0.18,
} as const;

// 分類が返す信頼度（ルール適合度）の基準値とスケール係数。
// 各分類は base から始まり、超過分 (strength - 1) に scale を掛けた値を max で頭打ちにする。
export const INPUT_CLASSIFIER_CONFIDENCE = {
	base: 0.55,
	emptyOrTiny: 1,
	nativeSafe: 0.85,
	scaledMax: 0.99,
	scaledScale: 0.35,
	continuousMax: 0.98,
	continuousScale: 0.25,
	softMax: 0.95,
	softScale: 0.3,
	nativeMax: 0.95,
	nativeScale: 0.25,
	uncertain: 0.5,
} as const;

export const CONVERT_LIMITS = {
	minShortSide: 8,
	maxShortSide: 96,
	baseAreaDivisor: 2.4,
	informationAdjustment: 0.4,
	maxAnalysisPixels: 65_536,
	edgeThreshold: 0.08,
	edgeBoost: 2.25,
	// セル内の高コントラスト色を代表色へ昇格させる最小の色距離（Oklab の二乗距離）
	featureDistanceThreshold: 0.0625,
	// 同じ昇格に必要な最小の面積被覆率。孤立ノイズを除外する下限
	featureCoverageThreshold: 0.04,
} as const;

export const CONVERT_CANDIDATE_DEFAULTS = {
	coarse: { scale: 0.65, colorCount: 12, ditherStrength: 30 },
	balanced: { scale: 1, colorCount: 24, ditherStrength: 20 },
	detailed: { scale: 1.5, colorCount: 40, ditherStrength: 10 },
} as const satisfies Record<
	DetailLevel,
	{ scale: number; colorCount: number; ditherStrength: number }
>;

export const CONVERT_DEFAULTS = {
	detailLevel: "balanced",
	reduceColors: true,
	reduceColorMode: "auto",
	ditherMode: "ordered",
} as const;

export const BACKGROUND_MODEL_LIMITS = {
	borderBandRatio: 0.08,
	minBorderBandPixels: 1,
	// 境界帯のうち透明画素がこの比率以上なら、アルファがすでに背景を表しているとみなし、
	// 色による背景クラスタ推定を行わない（被写体が画像端に接している画像の保護）。
	alphaBackgroundBorderRatio: 0.35,
	maxClusters: 4,
	clusterIterations: 6,
	minClusterWeight: 0.04,
	minConfidence: 0.55,
	maxContentLossRatio: 0.92,
	baseOklabTolerance: 0.018,
	maxOklabTolerance: 0.2,
	// [Intended] 内側の閉領域は「背景の穴」と「被写体の塗り面」の区別が画素だけでは付かない。
	// 外周連結の背景と同じ許容で拾うと白背景キャラの白い目まで消えるため、内側だけは
	// 通常許容にこの係数を掛けた厳しい一致を要求する。1/3 は合成ケースと実 fixture の
	// 比較で、背景に近いだけの塗り面を落としつつ本当の穴を取れる水準として選んだ。
	enclosedToleranceRatio: 1 / 3,
	varianceScale: 2.5,
	varianceConfidenceScale: 0.012,
	maxBorderSamples: 262_144,
	dehaloRadius: 2,
	dehaloMaxChannelChange: 32,
	dehaloMaxRgbDistance: 128,
	dehaloPushStrength: 0.35,
	dehaloSourceBlend: 0.35,
	dehaloInteriorBlend: 0.65,
	// [Intended] 真のアンチエイリアシング縁は背景色と内側画素の色を各チャンネルで線形補間した
	// 範囲に収まる。この許容幅はノイズ・丸め誤差を吸収するための余裕。
	dehaloBetweennessTolerance: 6,
} as const;

// フラッドフィルの背景除去で、なめらかな階調（グラデーション背景）をたどる判定の基準。
export const BACKGROUND_RAMP_LIMITS = {
	/** なめらかとみなす隣接画素間のチャンネル差。被写体の輪郭はこれを大きく超える。 */
	maxSmoothStep: 8,
	/** 最外周の隣接ペアのうち、なめらかである必要のある割合。 */
	minSmoothRatio: 0.9,
	/** 最外周の評価に必要な最小ペア数。これ未満は判定材料が足りないとみなす。 */
	minRingPairs: 16,
	/** ランプ許容で不透明画素をこの比率より多く削った場合は絶対差のみの結果へ巻き戻す。 */
	maxRemovalRatio: 0.9,
} as const;

export const SMALL_COMPONENT_LIMITS = {
	maxLogicalPixels: {
		off: 0,
		light: 1,
		auto: 2,
		strong: 4,
	} satisfies Record<SmallComponentRemovalMode, number>,
	proximityGap: 1,
	matchingColorChannelTolerance: 16,
	symmetryTolerance: 1,
	strongEdgeDelta: 64,
	highOpacity: 224,
	outlineMinLength: 2,
} as const;

export const GRID_CANDIDATE_SCORE_WEIGHTS = {
	colorBoundary: 0.08,
	luminanceGradient: 0.08,
	alphaGradient: 0.04,
	autocorrelation: 0.12,
	localPhaseStability: 0.1,
	periodicity: 0.08,
	edgeAlignment: 0.04,
	reconstruction: 0.16,
	complexity: 0.05,
	coverage: 0.04,
	axisAgreement: 0.08,
	methodAgreement: 0.05,
	stability: 0.03,
	harmonic: 0.03,
	outputSize: 0.02,
} as const;

export const GRID_SIGNAL_DEFAULTS = {
	colorBoundary: true,
	luminanceAlphaGradient: true,
	autocorrelation: true,
	reconstruction: true,
	localPhaseStability: true,
} as const;

export const GRID_CANDIDATE_CELL_SCALES = [0.5, 2] as const;

// 再構成ベースのグリッドサイズ探索（トリミング済み領域からの探索）の重み。
export const TRIMMED_GRID_SEARCH_WEIGHTS = {
	/**
	 * セル数に比例させる複雑度ペナルティの係数。
	 *
	 * 再構成誤差は過分割で単調に下がるため、これが唯一の「細かすぎる格子」への抑制になる。
	 * [Policy] 写実的な入力では再構成誤差の曲線がほぼ平坦で、この係数を動かしても
	 * 選ばれる格子は跳ぶだけで狙った倍率には収束しない（実測: auto_grid_detection は
	 * 0.02〜0.64 の全域で 88x61、resize_with_trimming も全域で 90x26、no_trimming は
	 * 0.04〜0.16 で 97x53、0.20 以上で 88x48）。倍率の精度を上げるには係数の調整では
	 * なく内容に応じた指標が必要なので、この値だけを触っても改善しない。
	 */
	complexityPenalty: 0.16,
} as const;

export const TRIMMED_GRID_SEARCH_LIMITS = {
	/** 論理セルのアスペクト差を別候補として評価する出力幅の上限。 */
	aspectAdjustedMaxOutputWidth: 64,
	/** 論理セルのアスペクト差を別候補として評価する出力高さの上限。 */
	aspectAdjustedMaxOutputHeight: 32,
} as const;

export const GRID_SEARCH_LIMITS = {
	axisCandidateLimit: 24,
	pairCandidateLimit: 128,
	fullResolutionCandidateLimit: 32,
	outputDimensionLimit: 600,
	maxTransitionSamples: 32,
	maxAnalysisDimension: 256,
	axisConfidenceThreshold: 0.55,
	/** 周期として信用するために必要な繰り返し回数。これ未満の周期は整合スコアを減衰させる。 */
	minGridPeriods: 3,
	/**
	 * 位相考慮探索を行う領域の画素数上限。
	 *
	 * [Policy] セル候補数は辺の長さに比例して増え、位相走査と合わせると探索時間が
	 * 辺の長さの二乗order で伸びる。実測で 2816x1536 の領域は 1 枚 19 秒を要し、
	 * それでも軸信頼度のしきい値には届かず結果は捨てられていた。処理時間の上限を
	 * 守るため、これを超える領域は再構成ベースの探索だけで判断する。
	 *
	 * 値は DESKEW_LIMITS.maximumInputPixels に回転で拡張される分の余裕を足して決める。
	 * 傾き補正は回転後の領域でこの探索を呼ぶため、上限が近すぎると入力が上限内でも
	 * 回転後だけ超えて角度候補が黙って捨てられる。
	 */
	maxPhaseAwarePixels: 1_200_000,
	localRegionCount: 4,
	minimumAutocorrelationSamples: 3,
	fullResolutionSampleLimit: 16384,
} as const;

export const DESKEW_LIMITS = {
	angleStep: 0.25,
	maxAnalysisDimension: 256,
	minimumInputDimension: 64,
	maximumInputPixels: 1_000_000,
	fullResolutionCandidateLimit: 3,
	minimumConfidence: 0.3,
	minimumConfidenceGain: 0.005,
	// 0度から満点までの残り幅に対して必要な、絶対スコア改善量の割合。
	minimumScoreHeadroomGain: 0.001,
} as const;

export const RETRO_PALETTES: Record<
	string,
	{ name: string; colors: string[] }
> = {
	gb_legacy: {
		name: "Game Boy (Legacy)",
		colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
	},
	gb_pocket: {
		name: "Game Boy (Pocket)",
		colors: ["#000000", "#545454", "#a8a8a8", "#ffffff"],
	},
	gb_light: {
		name: "Game Boy (Light)",
		colors: ["#004040", "#15605d", "#308880", "#00e0e0"],
	},
	pico8: {
		name: "PICO-8",
		colors: [
			"#000000",
			"#1D2B53",
			"#7E2553",
			"#008751",
			"#AB5236",
			"#5F574F",
			"#C2C3C7",
			"#FFF1E8",
			"#FF004D",
			"#FFA300",
			"#FFEC27",
			"#00E436",
			"#29ADFF",
			"#83769C",
			"#FF77A8",
			"#FFCCAA",
		],
	},
	nes: {
		name: "NES",
		colors: [
			"#7C7C7C",
			"#0000FC",
			"#0000BC",
			"#4428BC",
			"#940084",
			"#A80020",
			"#A81000",
			"#881400",
			"#503000",
			"#007800",
			"#006800",
			"#005800",
			"#004058",
			"#000000",
			"#000000",
			"#000000",
			"#BCBCBC",
			"#0078F8",
			"#0058F8",
			"#6844FC",
			"#D800CC",
			"#E40058",
			"#F83800",
			"#E45C10",
			"#AC7C00",
			"#00B800",
			"#00A800",
			"#00A844",
			"#008888",
			"#000000",
			"#000000",
			"#000000",
			"#F8F8F8",
			"#3CBCFC",
			"#6888FC",
			"#9878F8",
			"#F878F8",
			"#F85898",
			"#F87858",
			"#FCA044",
			"#F8B800",
			"#B8F818",
			"#58D854",
			"#58F898",
			"#00E8D8",
			"#787878",
			"#000000",
			"#000000",
			"#FCFCFC",
			"#A4E4FC",
			"#B8B8F8",
			"#D8B8F8",
			"#F8B8F8",
			"#F8A4C0",
			"#F0D0B0",
			"#FCE0A8",
			"#F8D878",
			"#D8F878",
			"#B8F8B8",
			"#B8F8D8",
			"#00FCFC",
			"#F8D8F8",
			"#000000",
			"#000000",
		],
	},
	mono: {
		name: "Monochrome",
		colors: ["#000000", "#FFFFFF"],
	},
	pc98: {
		name: "PC-9801",
		colors: [
			"#000000",
			"#0000F8",
			"#F80000",
			"#F800F8",
			"#00F800",
			"#00F8F8",
			"#F8F800",
			"#F8F8F8",
			"#888888",
			"#000088",
			"#880000",
			"#880088",
			"#008800",
			"#008888",
			"#888800",
			"#C0C0C0",
		],
	},
	msx: {
		name: "MSX1",
		colors: [
			"#000000",
			"#3EB849",
			"#74D07D",
			"#5955E0",
			"#8076F1",
			"#B95E51",
			"#65DBEF",
			"#DB6559",
			"#FF897D",
			"#CCC35E",
			"#DED087",
			"#3AA241",
			"#B766B5",
			"#CCCCCC",
			"#FFFFFF",
		],
	},
	c64: {
		name: "Commodore 64",
		colors: [
			"#000000",
			"#FFFFFF",
			"#813338",
			"#75CEC8",
			"#8E3C97",
			"#56AC4D",
			"#2E2C9B",
			"#EDF171",
			"#8E5029",
			"#553800",
			"#C46C71",
			"#4A4A4A",
			"#7B7B7B",
			"#A9FF9F",
			"#706DEB",
			"#B2B2B2",
		],
	},
	arne16: {
		name: "Arne 16",
		colors: [
			"#000000",
			"#9D9D9D",
			"#FFFFFF",
			"#BE2633",
			"#E06F8B",
			"#493C2B",
			"#A46422",
			"#EB8931",
			"#F7E26B",
			"#2F484E",
			"#44891A",
			"#A3CE27",
			"#1B2632",
			"#005784",
			"#31A2F2",
			"#B2DCEF",
		],
	},
	sfc_sprite: {
		name: "SFC Style (16 colors/Sprite)",
		colors: [], // K-means で 16 色に減色し、15 ビットに丸める
	},
	sfc_bg: {
		name: "SFC Style (256 colors/BG)",
		colors: [], // K-means で 256 色に減色し、15 ビットに丸める
	},
};

export const PROCESS_DEFAULTS = {
	processingMode: "auto",
	detailLevel: CONVERT_DEFAULTS.detailLevel,
	preRemoveBackground: true,
	postRemoveBackground: true,
	bgExtractionMethod: "auto",
	// 背景除去の範囲（off/selected/outer/all）
	bgRemovalScope: "outer",
	// 連結探索に対角方向（8 近傍）を含めるか（4=いいえ、8=はい）
	bgConnectivity: "4",
	// 処理後にコンテンツの境界ボックスまでトリミングする（デフォルトは ON）
	trimToContent: true,
	autoGridFromTrimmed: true,
	// autoGridFromTrimmed のグリッド推定を高速化する（結果に影響する場合がある）
	fastAutoGridFromTrimmed: true,
	// グリッド検出とダウンサンプリングを有効にする（デフォルトは ON）
	enableGridDetection: true,
	// 短い辺を透明ピクセルで埋めて画像を正方形にする
	makeSquare: false,
	// 出力に余白を追加して元画像のアスペクト比を維持する
	keepAspectRatio: false,
	// グリッド検出モード（UI 用）
	gridDetectionMode: "auto",
	// [Intended] 既定では補間由来の中間 alpha を面積被覆として残さず、
	// 必要な場合だけ詳細設定から alpha-aware-medoid を有効にする。
	cellSamplingMode: "hard-alpha-medoid",
	preserveThinFeatures: true,
	// [Intended] UIに専門パラメータを増やさず、Auto経路だけで微小な傾きを補正する。
	enableDeskew: true,
	smallComponentMode: "auto",
	geminiWatermarkRemoval: "auto",

	// [Intended] 公開済みの旧オプション用。新しい既定処理には使用しない。
	floatingMaxPixels: PROCESS_RANGES.floatingMaxPixels.default,
	reduceColors: false,
	reduceColorMode: "none", // "none" | "auto" | "gb_legacy" | "gb_pocket" | "gb_light" | "pico8" | "nes" | "mono" | "custom"
	ditherMode: "none",
	colorCount: PROCESS_RANGES.colorCount.default,
	ditherStrength: PROCESS_RANGES.ditherStrength.default,
	outlineStyle: "none",
	outlineColor: PROCESS_RANGES.outlineColor,
	sharedPalette: false,
	includeDiagnosticSummary: false,
	// [Policy] core/shared は実行環境に依存せず、開発時の値は browser 側から明示的に渡す。
	debug: false,
} as const;

export const clampInt = (value: number, range: IntRange): number => {
	const v = Number.isFinite(value) ? Math.trunc(value) : range.default;
	return Math.min(range.max, Math.max(range.min, v));
};

export const clampNumber = (
	value: number,
	range: { min: number; max: number; default: number },
): number => {
	const v = Number.isFinite(value) ? value : range.default;
	return Math.min(range.max, Math.max(range.min, v));
};

export const clampOptionalInt = (
	value: number | undefined,
	range: IntRange,
): number | undefined => {
	if (value === undefined) return undefined;
	if (!Number.isFinite(value)) return undefined;
	return clampInt(value, range);
};
