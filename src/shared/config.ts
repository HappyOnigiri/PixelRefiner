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
	// 検出器: 自動検出する最大セル数（各軸）
	autoMaxCells: { min: 2, max: 1024, default: 512 } as const,
	// アウトライン
	outlineColor: { r: 255, g: 255, b: 255 }, // デフォルトの白
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
	/**
	 * 候補の再構成誤差を 1/(1 + error * scale) で点数化するときの傾き。
	 * [Intended] アンサンブル側の reconstructionScore と同じ形・同じ強さにする。
	 * 線形に引く旧式では、わずかなアンチエイリアスでも全候補が 0 点へ潰れていた。
	 */
	gridCandidateReconstructionScale: 12,
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
	// [Intended] 内側判定の基準色を外周の実測色に切り替える最小画素数。数画素の平均は
	// 縁のにじみ 1 つで動くので、クラスタ中心より当てにならない。
	minEnclosedReferencePixels: 24,
	/**
	 * 内側判定の基準色を測るときに走査する画素数の上限。
	 *
	 * [Policy] 平均は許容値と比べるだけの統計量なので、全画素を舐める必要はない。
	 * 1 画素あたり pow 3 回＋cbrt 3 回の Oklab 変換が入り、既定スコープでは原寸画像に
	 * 対して必ず通る経路になる（実測: 4.3Mpx で約 250ms）。maxBorderSamples と同じ
	 * 考え方で等間隔に間引く。
	 */
	maxEnclosedReferenceSamples: 262_144,
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

// 縮小後の縁に残った背景色の汚染を、原寸の本来の色へ差し替える判定の基準。
export const BACKGROUND_EDGE_CLEANUP_LIMITS = {
	/**
	 * 混色線からのずれとして無条件に許す RGB 距離。ノイズと量子化誤差の吸収分。
	 */
	lineNoiseFloor: 8,
	/**
	 * 混色線からのずれとして追加で許す量を、背景から遠ざかった距離に対する比で表す。
	 *
	 * [Intended] p = α·bg + (1-α)·C の混色では、線からのずれの許容は「p が背景から
	 * どれだけ手前にいるか」に比例させるのが正しい。背景混合率 α が小さい画素は、
	 * 本来の色 C との距離も近いため、少しでも線から外れていれば混色ではなく
	 * その画素自身の色である。逆に α が大きい画素は色空間の非線形性で線が湾曲するので
	 * 広い余裕が必要になる。絶対値のしきい値ではこの 2 つを同時に満たせない。
	 */
	lineSlopeRatio: 1,
	/**
	 * 混色線からのずれとして許す上限。lineSlopeRatio による緩みをここで打ち切る。
	 *
	 * [Intended] 許容を距離に比例させたままにすると、背景から遠い候補ほど何でも通る。
	 * 同じセルに濃淡がある被写体では、汚染のない縁画素まで別の陰影の色へ寄ってしまうため、
	 * 「混色線の上に乗っている」と言える範囲で頭を押さえる。
	 * 値は fixture の実測で決めた。動かしてはいけない陰影の例（白背景の明暗のある赤）は
	 * ずれが 68 あり、動かしたい縁（アンチエイリアスが 3 色以上に及ぶスプライトの輪郭）は
	 * 45 前後なので、その間で誤検出側に余裕を残す位置に置く。
	 */
	maxLineOffAxis: 48,
	/**
	 * 背景色そのものとみなす RGB 距離。これ未満の画素は混色の向きが定まらないので触らない。
	 */
	minSeparation: 12,
	/**
	 * 差し替えるために必要な最小の背景混合率。出力色が本来の色の
	 * (1 - この値) 倍より背景側に寄っているときだけ差し替える。
	 * [Policy] 丸め誤差程度の混色で色を動かさないための下限。
	 */
	minBackgroundShare: 0.1,
	/**
	 * 差し替えを許す最大の背景混合率。候補色がこれより遠いと、出力色を
	 * 「背景と候補色の混色」として説明できないので差し替えない。
	 *
	 * [Intended] セル代表色は原寸の 1 画素なので、背景がここまで濃く混ざった色は
	 * アンチエイリアスの汚染ではなく、別の色を持つ画素である。上限が無いと
	 * セル内で最も極端な色が常に選ばれる。
	 */
	maxBackgroundShare: 0.75,
	/**
	 * 代表色の平均に含める、線の先端からの範囲。最遠距離のこの比率以上にある画素を使う。
	 */
	tipShare: 0.9,
	/**
	 * 透明画素からいくつ内側までを縁として扱うか。
	 * [Intended] 原寸のにじみ帯はセル 1 つに収まらないことがあり、2 段目のセルにも
	 * 弱い汚染が残る。混色線の判定は深さに関わらず同じなので、清浄なセルは動かない。
	 */
	maxDepth: 2,
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
	 * その「内容に応じた指標」が境界コントラスト（BOUNDARY_CONTRAST_LIMITS）で、
	 * 証拠が得られた入力ではそちらが採用格子を決める。
	 */
	complexityPenalty: 0.16,
} as const;

/**
 * 予測セル境界に実エッジがどれだけ集まるかで格子を選ぶための基準値。
 * 1.0 が「境界に偏りが無い＝格子の証拠なし」を意味する比率なので、
 * しきい値はすべて 1.0 より上に置く。
 */
export const BOUNDARY_CONTRAST_LIMITS = {
	/**
	 * 採用格子の乗り換えを検討する最小値。
	 * [Policy] これを下回る入力は格子そのものが読み取れていないので、
	 * 既存の再構成ベースの選択を維持して挙動を変えない。
	 */
	minEvidence: 1.1,
	/**
	 * 再構成が選んだ格子から乗り換えるために必要な、境界コントラストの優位比。
	 * [Policy] 僅差では乗り換えない。既存の判断を覆すのは、粗い格子のほうが
	 * 明確に境界へ乗っている場合だけに限る。
	 */
	overrideRatio: 1.25,
	/**
	 * 乗り換え先として許す最小の出力高さ。
	 * [Intended] 数セルしか無い格子は境界コントラストが偶然の一致で跳ね上がる
	 * （実測: 8x8 が正解の fixture で 2x2 が最大値を取る）。周期の繰り返しが
	 * 足りない候補は乗り換え先にしない。
	 */
	minOverrideOutH: 6,
	/**
	 * 乗り換えを許す倍音関係。再構成側の過分割は、正解の整数倍の細かさで現れる。
	 * [Intended] 倍音以外への乗り換えを許すと、格子とは無関係の周期へ飛ぶ。
	 * [Intended] 2〜6 の整数倍を欠けなく並べる。窓幅は中心の 10% しかないので、
	 * 抜けた倍率は前後の窓の隙間へ落ちて一度も評価されない（実測: 5 が無いために
	 * 正解の 5 倍細かい格子を採った 1254x1254 の生成画像で、正解 20x18 の境界
	 * コントラスト 4.03 が採用格子の 1.51 を上回っていながら乗り換えなかった）。
	 */
	harmonicFactors: [2, 3, 4, 5, 6],
	/** 各倍音の周囲を探す窓の幅（中心に対する比率）。 */
	harmonicWindow: 0.1,
	/**
	 * 採用格子と、境界コントラストが最も強い格子とのずれ。これを超えたら
	 * 「どの倍率を採るかで指標が食い違っている」とみなして候補選択を出す。
	 */
	contestedRatio: 0.1,
	/**
	 * 格子の証拠が十分だとみなす値。これ未満の入力は、出力が正しく見えても
	 * 別の倍率が同程度に妥当なので、候補選択をユーザーへ出す。
	 *
	 * [Policy] 「格子が読めていない」と「格子は読めているが輪郭がぼけている」の
	 * 境目に置く。この指標はぼけやアンチエイリアスが強い入力ほど 1.0 へ寄るため、
	 * ぼけた入力を弾く高さに置くと正しい倍率を当てた結果まで警告になる
	 * （実測: 正解サイズを出す high_resolution 1.053・bilinear 1.154・
	 * bicubic 1.226・diagonal_grid 1.166 に対し、証拠なしの帯は 0.00〜1.017）。
	 * 両帯の間で余白がもっとも広い位置を採る。
	 */
	confidentEvidence: 1.04,
	/**
	 * 境界コントラストが選んだ出力高さの周辺を、再構成誤差で詰め直す幅（行）。
	 * [Intended] 境界コントラストは倍率を当てられるが、端数の丸めやトリミング位置の
	 * ずれで 1〜2 行ぶれる。その範囲だけ再構成誤差に決めさせる。
	 */
	refineRadius: 3,
	/**
	 * 採用したセル寸法のまま位相を詰めるときの、境界コントラストの最小値。
	 * [Policy] これを下回る軸は格子の位相が読めていないので、位相は決めずに
	 * 従来どおりキャンバス左上を起点として投影する。
	 */
	minPhaseEvidence: 1.1,
	/**
	 * 位相を測ることを許す最小のセル辺長（px）。
	 * [Intended] これより小さいセルでは、セル内部の 1px の線が境界と区別できない
	 * （実測: 4px セルの合成 fixture で、各セルの localY=1 にある特徴線を境界と読み、
	 * 位相が 1〜2px ずれた）。小さいセルの位相は測らず従来の投影に任せる。
	 */
	minPhaseCellPixels: 8,
} as const;

export const TRIMMED_GRID_SEARCH_LIMITS = {
	/**
	 * 境界コントラストが探索するセル幅の上限（px）。
	 * [Intended] 32px までしか見ないと、1 ドットが大きく描かれた入力
	 * （AI 生成のドット絵風イラストなど）で正解のセル幅が範囲外になる。
	 * 実測: 1254x1254 の生成画像でセル 39.7px / 45.8px が該当した。
	 */
	maxCellPixels: 64,
	/**
	 * 再構成誤差が探索するセル幅の上限（px）。
	 * [Policy] こちらを広げると複雑度ペナルティとの釣り合いが変わり、既存の入力で
	 * 選ばれる格子まで動く。範囲の拡張は境界コントラスト側だけに留める。
	 */
	reconstructionMaxCellPixels: 32,
	/** 探索するセル幅の下限（px）。これ未満は過分割で再構成誤差が常に下がる。 */
	minCellPixels: 4,
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
	 */
	maxPhaseAwarePixels: 1_200_000,
	localRegionCount: 4,
	minimumAutocorrelationSamples: 3,
	fullResolutionSampleLimit: 16384,
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
	// 背景除去の範囲（off/selected/outer/auto/all）
	bgRemovalScope: "auto",
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
	// [Intended] 既定では補間由来の中間 alpha を面積被覆として残さない。
	// 必要な場合だけ詳細設定のセル色サンプリングから別の方式を選ぶ。
	cellSamplingMode: "hard-alpha-medoid",
	preserveThinFeatures: true,
	smallComponentMode: "auto",
	geminiWatermarkRemoval: "auto",

	// [Intended] ここから下は「これまで固定で動いていた自動判定」を明示的に切れるようにした指定。
	// 既定はいずれも従来の挙動そのままなので、公開しても出力は変わらない。
	// 縁のにじみ（ハロー）を背景色から遠ざける補正
	backgroundDehalo: true,
	// 縮小後の縁に残った背景色の汚染を、原寸の本来の色へ差し替える
	backgroundEdgeCleanup: true,
	// なめらかなグラデーション背景を段差の連続としてたどる
	backgroundRampFollow: true,
	// 消えすぎを検出したときに背景除去を丸ごと巻き戻す
	backgroundRemovalRollback: true,
	// 境界帯の大半が透明なら、色による背景クラスタ推定を行わない
	alphaBorderBackgroundGuard: true,
	// 背景モデルの信頼度が下限未満なら背景除去を見送る
	backgroundConfidenceGate: true,
	// 背景モデルの信頼度が下限未満なら小成分除去を見送る
	smallComponentBackgroundGate: true,
	// 位相を考慮した格子探索を行い、軸信頼度が十分なら再構成ベースより優先する
	phaseAwareGridSearch: true,
	// 境界コントラストが明確に優る粗い倍音へ採用格子を乗り換える
	boundaryContrastOverride: true,
	// 小さな論理解像度の格子で、角シードマスクの境界を基準領域に使う
	smallAspectGridAlignment: "auto",
	// 透かし除去が成立したとき、末尾行の欠落を防ぐ互換サンプラーへ切り替える
	watermarkSamplingCompat: "auto",
	// 検出前に背景色を推測してマスクする（検出器フォールバック用）
	backgroundMask: true,
	// 格子候補の各信号を個別に有効／無効にする
	gridSignals: GRID_SIGNAL_DEFAULTS,

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

export const clampOptionalInt = (
	value: number | undefined,
	range: IntRange,
): number | undefined => {
	if (value === undefined) return undefined;
	if (!Number.isFinite(value)) return undefined;
	return clampInt(value, range);
};
