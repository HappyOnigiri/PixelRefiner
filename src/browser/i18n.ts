export type Language = "ja" | "en" | "zh-CN";

const isLanguage = (value: string | null): value is Language =>
	value === "ja" || value === "en" || value === "zh-CN";

const detectBrowserLanguage = (): Language => {
	const lang = typeof navigator !== "undefined" ? navigator.language : "";
	if (lang.startsWith("zh")) {
		return "zh-CN";
	}
	if (lang.startsWith("ja")) {
		return "ja";
	}
	return "en";
};

const resources = {
	ja: {
		// UI 見出しとラベル
		"app.title": "Pixel Refiner | AIドット絵の最適化・背景透過ツール",
		"app.description":
			'AIで生成したドット絵を、<span class="text-highlight">素材</span>や<span class="text-highlight">アイコン</span>として使えるクオリティに。<br />' +
			'<span class="text-highlight">アンチエイリアス除去</span>・<span class="text-highlight">背景透過</span>を数秒で完了します。',
		"app.guide_link": "きれいにドット絵化できる画像の作り方（レシピ集）",
		"section.input": "入力画像",
		"section.result": "処理結果",
		"section.palette": "パレット",
		"ui.process_btn": "処理を実行",
		"ui.images": "画像一覧",
		"ui.auto_process": "自動",
		"ui.download_btn": "ダウンロード",
		"ui.export_gpl": ".GPLを書き出し",
		"ui.export_png": ".PNGを書き出し",
		"ui.import_palette": "パレットを読み込み",
		"ui.show_palette": "パレットを表示",
		"ui.clear_all": "すべてクリア",
		"ui.download_all": "一括ダウンロード",
		"ui.download_all_zip": "一括ダウンロード (ZIP)",
		"ui.shared_palette": "共通パレット",
		"ui.include_diagnostics": "診断サマリーを含める",
		"ui.remove_image": "画像を削除",
		"ui.confirm_clear_all": "すべての画像を削除してもよろしいですか？",
		"ui.size": "サイズ",
		"ui.view_single": "単体",
		"ui.view_compare": "比較",
		"ui.compare_before_original": "元画像",
		"ui.compare_before_sanitized": "サニタイズ",
		"ui.placeholder.input":
			'画像をここにドラッグ＆ドロップ<br /><span class="drop-subtext">または クリックして選択<br />(複数可)</span>',
		"ui.placeholder.result": "処理結果がここに表示されます",
		"ui.close": "閉じる",
		"ui.download_options": "ダウンロード種別を選択",
		"candidate.title": "結果を選択",
		"candidate.intro":
			"自動判定に確信を持てませんでした。実際の結果を比較して選んでください。",
		"candidate.recommended_badge": "おすすめ",
		"candidate.metadata": "{width} × {height} px・{colors}色",
		"candidate.label.recommended": "推奨候補",
		"candidate.label.auto-result": "Auto結果",
		"candidate.label.finer": "細かめ",
		"candidate.label.coarser": "粗め",
		"candidate.label.preserve": "原寸維持",
		"candidate.label.convert": "Convert候補",
		"candidate.description.recommended":
			"検出結果の中で画像構造に最も合う候補です。",
		"candidate.description.auto-result": "Auto処理で実際に採用された結果です。",
		"candidate.description.finer": "細部を多く残す候補です。",
		"candidate.description.coarser": "大きなドットへまとめる候補です。",
		"candidate.description.preserve":
			"縮小せず、安全に元の解像度を維持します。",
		"candidate.description.convert": "通常画像としてドット絵風に変換します。",
		"batch.status.pending": "未処理",
		"batch.status.processing": "処理中",
		"batch.status.done": "完了",
		"batch.status.error": "エラー",

		// 設定
		"setting.mode": "設定方式",
		"setting.quick": "かんたん設定",
		"setting.preset": "プリセット",
		"setting.quick_finish": "仕上がり",
		"setting.quick_pixel_detail": "ドットの細かさ",
		"setting.quick_colors": "減色",
		"setting.quick_background": "背景",
		"setting.quick_gradient": "グラデーション表現",
		"setting.processing_mode": "仕上がり",
		"setting.size": "サイズ",
		"setting.detail": "細かさ",
		"setting.convert_output_size": "ドットの細かさ",
		"setting.convert_output_width": "出力幅",
		"setting.convert_output_height": "出力高さ",
		"setting.background": "背景透過",
		"setting.dithering": "ディザリング",
		"preset.auto": "おまかせ",
		"preset.crisp_sprite": "輪郭をくっきり",
		"preset.keep_fine_details": "サイズを変えず補正",
		"preset.transparent_icon": "透過アイコン",
		"preset.limited_colors": "16色レトロ",
		"preset.photo_to_pixel": "細部を残してドット化",
		"option.quick_processing_auto": "おまかせ",
		"option.quick_processing_refine": "輪郭をくっきり",
		"option.quick_processing_convert": "細部を残してドット化",
		"option.quick_processing_preserve": "サイズを変えず補正",
		"option.processing_auto": "おまかせ",
		"notice.processing_mode_forced_size":
			"完全ピクセル指定が優先されるため、仕上がりは使用されません。",
		"option.processing_refine": "輪郭をくっきり",
		"option.processing_convert": "細部を残してドット化",
		"option.processing_preserve": "サイズを変えず補正",
		"option.size_very_small": "とても粗い",
		"option.size_small": "粗い",
		"option.size_slightly_small": "やや粗い",
		"option.size_standard": "標準",
		"option.size_large": "細かい",
		"option.size_custom_width": "幅を指定",
		"option.size_custom_height": "高さを指定",
		"option.size_custom_both": "幅と高さを指定",
		"option.detail_coarse": "粗め",
		"option.detail_balanced": "バランス",
		"option.detail_detailed": "細かめ",
		"option.colors_8": "8色",
		"option.colors_16": "16色",
		"option.colors_24": "24色",
		"option.colors_32": "32色",
		"option.quick_colors_auto": "おまかせ",
		"option.quick_colors_original": "元の色を維持",
		"option.background_keep": "背景を残す",
		"option.background_auto": "自動で透過",
		"option.background_pick": "選んだ色を透過",
		"option.dithering_off": "使わない",
		"option.dithering_subtle": "控えめ",
		"option.dithering_strong": "強め",
		"classification.manual": "手動選択",
		"classification.native-pixel": "原寸ドット絵",
		"classification.scaled-pixel": "拡大ドット絵",
		"classification.soft-pixel": "補間済みドット絵",
		"classification.continuous": "通常画像",
		"classification.uncertain": "判定保留",
		"route.refine": "Refine",
		"route.convert": "Convert",
		"route.preserve": "Preserve",
		"result.analysis":
			"判定: {classification} / {route} / 信頼度 {confidence}%",
		"setting.color_reduction": "減色",
		"setting.color_mode": "減色モード",
		"setting.color_count": "色数",
		"setting.dither_mode": "ディザリング",
		"setting.dither_strength": "ディザリング強度 (%)",
		"setting.advanced": "詳細設定",
		"setting.grid_detection": "グリッド検出",
		"setting.grid_mode": "グリッド検出モード",
		"setting.quant_step": "減色段階",
		"setting.sample_window": "グリッド探索のサンプル範囲",
		"setting.cell_sampling_mode": "セル色のサンプリング",
		"setting.preserve_thin_features": "細い線を保護",
		"setting.auto_grid_from_trimmed": "内容から格子を推定",
		"setting.phase_aware_grid_search": "位相考慮の格子探索",
		"setting.boundary_contrast_override": "境界コントラストで乗り換え",
		"setting.small_aspect_grid_alignment": "小さな格子の基準合わせ",
		"setting.max_samples_per_cell": "セルごとの最大サンプル数",
		"setting.cell_alpha_threshold": "セル色のアルファ下限",
		"setting.auto_max_cells_w": "最大セル数（幅）",
		"setting.auto_max_cells_h": "最大セル数（高さ）",
		"setting.detection_background_mask": "検出前に背景をマスク",
		"setting.background_mask_tolerance": "検出マスクの許容差",
		"setting.grid_signal_color_boundary": "信号: 色境界",
		"setting.grid_signal_luminance_alpha": "信号: 輝度・アルファ",
		"setting.grid_signal_autocorrelation": "信号: 自己相関",
		"setting.grid_signal_reconstruction": "信号: 再構成誤差",
		"setting.grid_signal_local_phase": "信号: 局所位相",
		"setting.background_dehalo": "縁のにじみを補正",
		"setting.background_edge_cleanup": "縁の汚染色を差し替え",
		"setting.background_ramp_follow": "グラデーション背景を追従",
		"setting.background_removal_rollback": "消えすぎたら巻き戻す",
		"setting.alpha_border_background_guard": "既存の透過を信用する",
		"setting.background_confidence_gate": "背景の信頼度を要求",
		"setting.small_component_background_gate": "整理も背景の信頼度に従う",
		"setting.watermark_sampling_compat": "透かし除去後のサンプリング",
		"setting.trim_alpha_threshold": "トリミングのアルファ下限",
		"option.cell_sampling_hard": "ハードアルファ（既定）",
		"option.cell_sampling_alpha_aware": "半透明を保持",
		"option.cell_sampling_legacy": "互換（中央値）",
		"option.auto_behavior_on": "常に有効",
		"option.auto_behavior_off": "常に無効",
		"setting.force_width": "強制幅 (px)",
		"setting.force_height": "強制高さ (px)",
		"setting.fast_mode": "高速モード",
		"setting.make_square": "正方形にする",
		"setting.keep_aspect_ratio": "アスペクト比を維持",
		"setting.bg_removal": "背景透過",
		"setting.bg_method": "背景抽出方法",
		"setting.bg_rgb": "背景色(RGB)",
		"setting.bg_tolerance": "背景色の許容差",
		"setting.pre_remove": "事前の背景透過",
		"setting.post_remove": "事後の背景透過",
		"setting.bg_removal_scope": "背景透過の範囲",
		"setting.bg_connectivity": "連結判定",
		"setting.gemini_watermark_removal": "Gemini透かしの除去",

		"setting.small_component_mode": "小さな要素の整理",
		"setting.trimming": "トリミング",
		"setting.outline": "アウトライン",
		"setting.outline_style": "スタイル",
		"setting.outline_color": "色",
		"setting.processing": "処理",
		"setting.auto_process": "自動変換",
		"section.presets": "プリセット",
		"ui.preset_name": "プリセット名",
		"ui.save_preset": "保存",
		"ui.load_preset": "ロード",
		"ui.delete_preset": "削除",
		"ui.confirm_delete_preset": "プリセットを削除してもよろしいですか？",
		"ui.confirm_overwrite_preset":
			"同じ名前のプリセットが既に存在します。上書きしますか？",
		"ui.preset_loaded": "プリセット「{name}」を読み込みました",
		"ui.preset_saved": "プリセット「{name}」を保存しました",
		"tooltip.help.auto_process":
			"設定を変更した際に、自動で変換処理を実行します。\n\n手動でボタンを押して実行したい場合はOFFにしてください。",
		"tooltip.help.quick_preset":
			"目指す仕上がりに合わせて、サイズ、色、背景などをまとめて設定します。",
		"tooltip.help.quick_processing_mode":
			"目指す仕上がりを選びます。\n\nおまかせ: 画像に合う仕上がりを自動で選びます。\n輪郭をくっきり: ぼかしを除き、色と透明度をドット単位で揃えます。\n細部を残してドット化: 階調や細い線を残しながら低解像度化します。\nサイズを変えず補正: 縮小せず、背景や色だけを補正します。",
		"tooltip.help.convert_output_size":
			"5段階の細かさから選ぶか、Convertでリサンプリングする幅、高さ、または両方を指定します。片方だけ指定した場合、もう片方は画像の縦横比に合わせます。",
		"tooltip.help.convert_output_dimension":
			"Convertでリサンプリングする寸法を指定します。背景トリム、アウトライン、余白追加によって最終キャンバスの寸法は変わる場合があります。",
		"tooltip.help.quick_detail":
			"「細部を残してドット化」で使うドットの細かさを5段階から選びます。粗くするほど出力が小さくなり、1ドットが大きく見えます。「細かい」も元画像を超えて拡大しません。色数など、ほかの設定には影響しません。\n\n「おまかせ」では、細部を残す仕上がりが自動で選ばれた画像にだけ適用されます。",
		"tooltip.help.quick_reduction_mode":
			"減色方法を選びます。おまかせでは、「輪郭をくっきり」と「サイズを変えず補正」は元の色を維持し、「細部を残してドット化」は24色に減色します。任意の色数指定と固定パレットの読み込みは詳細設定で行えます。",
		"tooltip.help.quick_background":
			"背景を残すか、自動判定で透過するか、選んだ色を透過するかを選びます。背景を残す場合はキャンバス全体を維持し、透過する場合は透明な余白も自動で切り詰めます。",
		"tooltip.help.quick_dithering":
			"減色時にドット模様を加えてグラデーションを表現します。強くするほど階調を残しやすくなりますが、模様も目立ちます。",

		// ツールチップ
		"tooltip.help.color_mode":
			"出力結果の色数を制限します。\n\nドット絵らしい色使いに整えたい場合に有効です。\n無効: 減色を行いません。\nGame Boy / PICO-8 / NES: 各ゲーム機のパレットを使用します。\n色数指定 (Auto): 指定した色数に自動で減色します。",
		"tooltip.help.color_count":
			"出力する最大の色数を指定します。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.dither_strength":
			"減色時にディザリング（誤差拡散）を適用します。\n\n100%: 完全な誤差拡散を行います。\n0%: ディザリングを行わず、最も近い色に丸めます。\n\n少ない色数でも滑らかなグラデーションを表現できますが、ドット絵特有のザラつきが発生します。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.grid_mode":
			"グリッド検出の動作モードを切り替えます。\n\n自動検出: グリッドを自動検出します（デフォルト）。\nピクセル指定 + 自動検出: 指定ピクセルをヒントにして、その近傍から精密探索を開始します。\n完全ピクセル指定: 指定サイズに強制変換します（自動検出なし）。\n無効: グリッド検出と縮小をスキップします（等倍ドット絵向け）。",
		"tooltip.help.quant_step":
			"グリッド検出用の減色レベルを設定します。\n\n【大】色がまとまりノイズに強くなりますが、微妙な色の違いが消える場合があります。\n【小】色の境界を細かく拾いますが、ノイズを誤検出するリスクが高まります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.sample_window":
			"Auto・Hintでグリッドサイズ候補を比較する際の参照範囲（ピクセル数）です。\n\n【大】グリッド検出がノイズに強くなりますが、細かな境界を見落とす可能性があります。\n【小】細かな境界を捉えやすくなりますが、位置ズレやノイズの影響を強く受けます。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.cell_sampling_mode":
			"論理ピクセル 1 つの代表色をどう選ぶかを決めます。\n\nハードアルファ: 補間で生じた中間の透明度を残しません。\n半透明を保持: 面積被覆としての半透明を残します。意図的に柔らかい縁向けです。\n互換: 旧方式の中央値サンプラーです。透かし除去後に自動で使われるのもこれです。",
		"tooltip.help.preserve_thin_features":
			"セルを横切る少数派の色を、線や輪郭として残します。切ると細部が面色に飲まれます。",
		"tooltip.help.auto_grid_from_trimmed":
			"背景を除いた内容の範囲から出力格子を推定します。\n切ると、画像全体を走査する旧来の検出器だけで判断します。",
		"tooltip.help.phase_aware_grid_search":
			"位相を考慮した探索も行い、縦横どちらの軸も十分に確からしい場合はそちらを採用します。",
		"tooltip.help.boundary_contrast_override":
			"セル境界が実際のエッジに明確によく乗る粗い倍率が見つかったとき、採用する格子をそちらへ乗り換えます。",
		"tooltip.help.small_aspect_grid_alignment":
			"論理解像度が小さいとき、角から求めたマスクの範囲を格子の基準に使います。無効にすると、「おまかせ」が小さな格子ではなく「サイズを変えず補正」を選ぶ場合があります。",
		"tooltip.help.max_samples_per_cell":
			"1 つのセルの色を決めるときに読み取る画素数の上限です。大きいほど安定しますが遅くなります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.cell_alpha_threshold":
			"セル内で色の候補として扱うために必要な、最低限のアルファ値です。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.auto_max_cells_w":
			"旧来の検出器が自動検出するセル数の上限です。「内容から格子を推定」を切ったときに効きます。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.auto_max_cells_h":
			"旧来の検出器が自動検出するセル数の上限です。「内容から格子を推定」を切ったときに効きます。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.detection_background_mask":
			"背景色を推測して格子検出の前に隠します。背景のノイズが検出結果を引っぱるのを防ぎます。",
		"tooltip.help.background_mask_tolerance":
			"検出用の背景マスクが背景色とみなす、チャンネルごとの色差です。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.grid_signal_color_boundary":
			"格子候補の採点に色境界の信号を含めます。",
		"tooltip.help.grid_signal_luminance_alpha":
			"格子候補の採点に輝度勾配とアルファ勾配の信号を含めます。",
		"tooltip.help.grid_signal_autocorrelation":
			"格子候補の採点に自己相関の信号を含めます。",
		"tooltip.help.grid_signal_reconstruction":
			"格子候補の採点に再構成誤差の信号を含めます。",
		"tooltip.help.grid_signal_local_phase":
			"格子候補の採点に局所位相の安定性を含めます。",
		"tooltip.help.background_dehalo":
			"背景を消したあと、アンチエイリアスの縁を背景色から遠ざけて残った色かぶりを薄めます。",
		"tooltip.help.background_edge_cleanup":
			"縮小後の縁に背景色が混ざって残った画素を、原寸の本来の色へ差し替えます。",
		"tooltip.help.background_ramp_follow":
			"なめらかに変化する背景を、絶対的な色差ではなく小さな段差の連なりとしてたどります。",
		"tooltip.help.background_removal_rollback":
			"背景除去で可視画素のほとんどが消えてしまう場合に、その除去を丸ごと取り消します。",
		"tooltip.help.alpha_border_background_guard":
			"画像の縁の多くがすでに透明なら、色から背景を推定しません。切り抜き済みの画像の輪郭が削れるのを防ぎます。",
		"tooltip.help.background_confidence_gate":
			"推定した背景モデルの確からしさが足りないときは、背景除去そのものを見送ります。",
		"tooltip.help.small_component_background_gate":
			"推定した背景モデルの確からしさが足りないときは、「小さな要素の整理」も見送ります。",
		"tooltip.help.watermark_sampling_compat":
			"透かしを消したあと、末尾の行が欠けるのを防ぐために互換の中央値サンプラーへ切り替えます。",
		"tooltip.help.trim_alpha_threshold":
			"トリミング範囲を求めるときに、内容とみなすために必要な最低限のアルファ値です。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.force_width":
			"指定ピクセル（横）です。\n\nピクセル指定 + 自動検出: この値をヒントに精密探索を開始します。\n完全ピクセル指定: この値に強制変換します。\n\n設定範囲: 1〜1024 (デフォルト: 自動)",
		"tooltip.help.force_height":
			"指定ピクセル（縦）です。\n\nピクセル指定 + 自動検出: この値をヒントに精密探索を開始します。\n完全ピクセル指定: この値に強制変換します。\n\n設定範囲: 1〜1024 (デフォルト: 自動)",
		"tooltip.help.fast_mode":
			"ONにすると、効率的なアルゴリズムで探索を高速化します。\nOFFにすると、より広範囲を精密に探索します。\n\n自動検出の結果がズレる場合や、ノイズ・細かい模様が多い画像では、OFFにすると精度が向上します。",
		"tooltip.help.shared_palette":
			"すべての画像を同じパレットで減色します。\n\n処理後の全画像から共通のパレットを作り、色数の設定を上限としてまとめてから、各画像へ適用し直します。\nキャラクターの差分やアニメーションのコマなど、画像どうしで色味を揃えたい場合に使います。",
		"tooltip.help.include_diagnostics":
			"一括ダウンロード (ZIP) に diagnostics.json を追加します。\n\n画像ごとの入出力ファイル名、判定した入力の種類、処理方式、信頼度、警告コードを記録した JSON です。\n大量の画像を処理したあとで、確認が必要な画像を絞り込むときに使います。",
		"tooltip.help.bg_method":
			"背景色をどこから抽出するか選択します。背景透過を有効にすると透明な余白も自動で切り詰め、透過しない場合はキャンバス全体を維持します。\n\n自動: 外周全体から背景を推定します。\n透過しない: 背景透過を行いません。\n各四隅: 指定した角のピクセルを背景色とします。\nRGB指定: 指定した色を背景色とします。",
		"tooltip.help.bg_rgb":
			"背景色として扱う色を16進数(例: #ffffff)で指定します。\n四隅指定時は自動で色がセットされます。スポイトボタンで画像から色を選択することもできます。",
		"tooltip.help.bg_tolerance":
			"背景色と判定する色の類似度（誤差範囲）です。\n\n【大】圧縮ノイズなどで色が多少ブレていても背景として透過できますが、必要な色まで消える可能性があります。\n【小】厳密に背景色のみを透過しますが、ノイズが残りやすくなります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.pre_remove":
			"グリッド検出を行う【前】に、背景色を無視します。\n\nメリット: 余白が広い画像でも、本体部分のグリッドを正しく検出しやすくなります。\n注意: 背景と同じ色がキャラクター内にある場合、検出精度が下がる可能性があります。",
		"tooltip.help.post_remove":
			"処理完了【後】に、背景色を透明に置き換えて出力します。\n\nメリット: 背景透明のPNGとして保存できます。\n注意: グリッド検出処理自体には影響しません。",
		"tooltip.help.bg_removal_scope":
			"背景をどこまで透過するかの範囲です。\n\nおまかせ: 外側に加え、背景色そのものだと判断できた内側の閉じた領域だけ透過。\n選択部分のみ: 選択した角から繋がる背景だけ透過。\n外側全部: 画像の外周に繋がる背景をすべて透過。\n全領域: 背景色に近い領域を内側も含めてすべて透過。\n\n背景が「維持」のときは使用しません。",
		"tooltip.help.bg_connectivity":
			"「繋がっている」の判定方法です。\n\n4方向: 斜めを含めない厳しい判定。\n8方向: 斜めも繋がりとみなします。",
		"tooltip.help.gemini_watermark_removal":
			"背景透過後、右下に明るいひし形として単独で浮いているGeminiの透かしだけを自動で除去します。主体と接している場合は除去しません。",
		"tooltip.help.small_component_mode":
			"復元後の論理ピクセルを基準に孤立ノイズを整理します。近接・反復・対称・輪郭の延長・強いエッジ・高い不透明度を持つ細部は保護します。背景判定が不確かな場合は自動削除しません。",
		"tooltip.help.make_square":
			"画像全体が正方形になるように、足りない部分を透過ピクセルで埋め合わせます。\n\n元の画像は中心に配置されます。",
		"tooltip.help.keep_aspect_ratio":
			"トリミング後の出力画像が元画像のアスペクト比を維持するように、透過ピクセルでパディングします。\n\nスプライトのキャンバスサイズを揃えたい場合に便利です。",

		// 選択肢
		"option.none": "無効",
		"option.mono": "モノクロ",
		"option.gb_legacy": "ゲームボーイ (初代)",
		"option.gb_pocket": "ゲームボーイ (ポケット)",
		"option.gb_light": "ゲームボーイ (ライト)",
		"option.pico8": "PICO-8",
		"option.nes": "ファミコン (NES)",
		"option.pc98": "PC-9801",
		"option.msx": "MSX1",
		"option.c64": "Commodore 64",
		"option.arne16": "Arne 16",
		"option.sfc_sprite": "SFC風 (16色/スプライト)",
		"option.sfc_bg": "SFC風 (256色/背景)",
		"option.auto": "色数指定",
		"option.fixed": "固定パレット (Imported)",
		"option.dither_none": "無効",
		"option.dither_floyd": "Floyd-Steinberg",
		"option.dither_bayer2": "Bayer 2x2",
		"option.dither_bayer4": "Bayer 4x4",
		"option.dither_bayer8": "Bayer 8x8",
		"option.dither_ordered": "Ordered",
		"option.outline_none": "なし",
		"option.outline_rounded": "Rounded (8近傍)",
		"option.outline_sharp": "Sharp (4近傍)",
		"option.grid_mode_auto": "自動検出（デフォルト）",
		"option.grid_mode_hint": "ピクセル指定 + 自動検出",
		"option.grid_mode_force": "完全ピクセル指定",
		"option.grid_mode_off": "無効",
		"option.bg_none": "透過しない",
		"option.bg_auto": "自動（デフォルト）",
		"option.bg_scope_auto": "おまかせ",
		"option.bg_scope_selected": "選択した角のみ",
		"option.bg_scope_outer": "外周のみ",
		"option.bg_scope_all": "外周＋内側すべて",
		"option.bg_connectivity_4": "4方向（斜めなし）",
		"option.bg_connectivity_8": "8方向（斜め含む）",
		"option.gemini_watermark_auto": "自動",
		"option.gemini_watermark_off": "無効",
		"option.small_component_off": "無効",
		"option.small_component_light": "弱（細部を保持）",
		"option.small_component_auto": "自動",
		"option.small_component_strong": "強",
		"option.bg_top_left": "左上",
		"option.bg_bottom_left": "左下",
		"option.bg_top_right": "右上",
		"option.bg_bottom_right": "右下",
		"option.bg_rgb": "RGB指定",

		// JS メッセージ
		"error.no_image": "先に画像を選択してください。",
		"error.process_failed": "処理失敗",
		"error.load_failed": "読み込み失敗",
		"warning.low_grid_confidence":
			"グリッド判定の信頼度が低いため、結果を確認してください。",
		"warning.background_uncertain": "背景の判定が不確かです。",
		"warning.background_removal_skipped":
			"背景が消えすぎると判定したため、背景の透過を中止しました。",
		"warning.content_loss_risk":
			"処理によって内容が大きく失われた可能性があります。",
		"warning.one_axis_detection_failed":
			"片方向のグリッドを検出できませんでした。",
		"warning.extreme_output_size": "出力サイズが非常に大きくなっています。",
		"warning.no_content": "処理対象の内容を検出できませんでした。",
		"warning.fallback_to_preserve": "安全のため元のサイズを維持しました。",
		"warning.batch_partial_failure":
			"{total}件中{failed}件を処理できませんでした。成功した画像はZIPに含まれています。",
		"warning.pending_partial_failure":
			"{total}件中{failed}件を変換できませんでした。画像リストで対象を確認できます。",
		"warning.unknown": "不明な処理警告です（{code}）。",

		"error.palette_limit":
			"警告: 画像には{count}色が含まれています。パレットは256色に制限されます。",
		"error.no_processed_images": "ダウンロード可能な処理済み画像がありません。",
		"error.download_failed": "ダウンロードに失敗しました",
		"status.processing": "処理中...",
		"status.processing_batch": "一括処理中... ({current}/{total})",

		// 属性とタイトル
		"attr.title.bg_checkered": "背景: 格子模様",
		"attr.title.bg_white": "背景: 白",
		"attr.title.bg_black": "背景: 黒",
		"attr.title.bg_green": "背景: 緑",
		"attr.title.grid_toggle": "グリッドを表示する（拡大時のみ有効）",
		"attr.title.zoom_toggle": "拡大表示する",
		"attr.title.eyedropper": "スポイトで画像から色を選択",
		"attr.aria.background_color": "背景色",
		"attr.aria.theme_toggle": "表示テーマを切り替える",
		"attr.placeholder.auto": "自動",

		// モーダル
		"modal.eyedropper.title": "背景色を選択",
		"modal.eyedropper.instruction":
			"画像内の背景にしたい色をクリックしてください",

		// フッター
		"footer.privacy": "画像はブラウザ内で安全に処理されます",
		"footer.qualityReport": "品質レポート",

		// AI画像生成レシピ集（guide.html）
		"guide.page_title": "AI画像生成レシピ集 | Pixel Refiner",
		"guide.page_name": "AI画像生成レシピ集",
		"guide.subtitle": "きれいにドット絵化できる入力画像の作り方",
		"guide.back_to_app": "Pixel Refiner に戻る",
		"guide.copy_prompt": "プロンプトをコピー",
		"guide.copied": "コピーしました",
		"guide.intro.heading": "はじめに — 考え方",
		"guide.intro.body1":
			"Pixel Refiner は「ドットのぼやけ」「グリッドのずれ」「多すぎる色」を自動で直せます。一方で、生成画像そのものに起因する問題は、変換の段階では直せません。",
		"guide.intro.body2":
			"このページは、<strong>直せない問題を画像生成の段階で防ぐ</strong>ためのプロンプト集です。",
		"guide.intro.fixable_heading":
			"ツールが直せるもの（生成時に気にしなくてよい）",
		"guide.intro.fixable_1": "ドットのぼやけ・アンチエイリアス",
		"guide.intro.fixable_2": "ドットサイズの不揃いな拡大縮小・グリッドのずれ",
		"guide.intro.fixable_3": "多すぎる色数（減色・パレット変換）",
		"guide.intro.fixable_4": "ベタ塗り背景の透過",
		"guide.intro.unfixable_heading": "ツールでは直せないもの（生成時に防ぐ）",
		"guide.intro.unfixable_1": "背景色が被写体の中にも使われている",
		"guide.intro.unfixable_2": "被写体が画像の端で見切れている",
		"guide.intro.unfixable_3": "影・グロー・ソフトシャドウ",
		"guide.intro.unfixable_4": "画像全体のわずかな傾き",
		"guide.intro.unfixable_5": "1枚に複数の被写体が入っている",
		"guide.blur.heading": "拡大すると、AI 生成画像はぼけている",
		"guide.blur.body1":
			"引きで見るとドット絵に見えても、拡大すると 1 ドットの縁が数ピクセルかけて滲み、同じドットの中でも色が揺れています。画像生成モデルはドットの格子を正確には守らないため、生成画像はそのままでは素材として使いにくく、ゲームや UI に載せると輪郭がぼやけます。",
		"guide.blur.body2":
			"Pixel Refiner は、このぼけたドットを格子に合わせ直し、1 ドットを 1 色に塗り直します。この後のレシピは、そうやって整えやすい生成画像を作るためのものです。",
		"guide.blur.view_whole": "全体",
		"guide.blur.view_detail": "部分拡大（元画素の4倍）",
		"guide.blur.whole_alt": "引きで見るとドット絵に見える生成画像の騎士",
		"guide.blur.zoom_alt":
			"兜の左上の拡大。ドットの縁が数ピクセルかけて滲んでいる",
		"guide.blur.caption":
			"同じ生成画像。右は兜の左上 80×80 ピクセルを 4 倍に拡大したもので、ドットの境目が滲み、背景と輪郭の間には中間色が出ています。",
		"guide.principles.heading": "5つの基本原則",
		"guide.principles.p1_heading":
			"原則1: 背景は「被写体に含まれない」原色のベタ一色にする",
		"guide.principles.p1_body":
			"白い背景に白い目のキャラクターのように、背景色が被写体の中にもあると、透過処理が被写体側を巻き込むことがあります。暖色系の被写体には緑（#00FF00）、緑系の被写体にはマゼンタ（#FF00FF）のように、被写体から色相の遠い色を選びます。",
		"guide.principles.p2_heading":
			"原則2: 影・グロー・ソフトシャドウを付けない",
		"guide.principles.p2_body":
			"被写体と背景の間にできる半透明のグラデーションは、透過後のフチ残りや輪郭の変色の原因になります。",
		"guide.principles.p3_heading": "原則3: 被写体を見切れさせず、余白を取る",
		"guide.principles.p3_body":
			"被写体が画像の端に接していると、背景の推定が乱れます。全身が収まり、周囲に余白のある構図にします。",
		"guide.principles.p4_heading": "原則4: 傾けない",
		"guide.principles.p4_body":
			"ドットのグリッドがわずかに傾いた画像は苦手です。生成の段階でまっすぐな構図にします。",
		"guide.principles.p5_heading":
			"原則5: 1画像1被写体・ドットの大きさを揃える",
		"guide.principles.p5_body":
			"複数のスプライトを1枚にまとめた画像や、場所によってドットの大きさが違う画像は、グリッド検出を混乱させます。",
		"guide.principles.no_effort_heading": "逆に、頑張らなくてよいこと",
		"guide.principles.no_effort_body":
			"アンチエイリアスを完全に消すことや、正確に 32×32 ピクセルで生成することは、生成側で頑張る必要はありません。<code>32x32 pixel art</code> のような指定はそのまま守られなくても、ドットを大きく均一にする方向に働くので有効です。",
		"guide.recipes.heading": "レシピ集",
		"guide.recipes.intro":
			"各レシピでは、プロンプト、生成画像、Pixel Refiner の設定、変換結果を順に紹介します。作例は、掲載したプロンプトで生成し、掲載した設定で変換したものです。",
		"guide.recipes.goal_label": "ねらい",
		"guide.recipes.settings_label": "Pixel Refiner の設定",
		"guide.recipes.caption_input": "生成画像（サンプル）",
		"guide.recipes.scale_actual": "等倍",
		"guide.recipes.scale_zoomed": "4倍表示",
		"guide.recipes.caption_output": "変換結果（サンプル）",
		"guide.recipe1.heading": "レシピ1: ゲームキャラクターのスプライト",
		"guide.recipe1.goal":
			"透過素材の基本形。背景色の選び方（暖色のキャラ × マゼンタ背景）と、見切れ防止の余白がテーマです。",
		"guide.recipe1.settings":
			"「プリセット」を「おまかせ仕上げ」のままにします（背景は自動で透過されます）。",
		"guide.recipe1.input_alt":
			"レシピ1の生成画像。マゼンタ背景に、剣と盾を持つ騎士のドット絵",
		"guide.recipe1.output_alt":
			"レシピ1の変換結果。背景が透過した騎士のドット絵",
		"guide.recipe1.caption_input": "生成画像（2048×2048px・縮小表示）",
		"guide.recipe1.caption_output":
			"変換結果（おまかせ仕上げ・60×85px の等倍出力）",
		"guide.recipe2.heading": "レシピ2: アイテムアイコン",
		"guide.recipe2.goal":
			"UI 用の単一オブジェクト。赤い被写体に緑の背景を組み合わせると、背景と被写体を区別しやすく、きれいに透過できます。",
		"guide.recipe2.settings":
			"「プリセット」で「透過アイコン」を選びます。背景を透過し、32色に減色します。",
		"guide.recipe2.input_alt":
			"レシピ2の生成画像。緑背景に、赤いポーション瓶のドット絵",
		"guide.recipe2.output_alt":
			"レシピ2の変換結果。背景が透過したポーション瓶のドット絵",
		"guide.recipe2.caption_input": "生成画像（2752×1536px・縮小表示）",
		"guide.recipe2.caption_output":
			"変換結果（透過アイコン・16×23px の等倍出力）",
		"guide.recipe3.heading":
			"レシピ3: レトロ携帯ゲーム機風（Game Boy パレット）",
		"guide.recipe3.goal":
			"生成の段階から階調を絞っておき、パレット変換で選んだ機種の4階調へ正確に置き換えます。生成時の色そのものは残らないので、背景は仕上がりの色ではなく消しやすい色（緑の被写体に赤）で指定します。",
		"guide.recipe3.settings":
			"「かんたん設定」の「色数・配色」で「ゲームボーイ (ポケット)」を選びます。ほかはそのままで、背景は自動で透過されます。",
		"guide.recipe3.input_alt":
			"レシピ3の生成画像。赤い背景に緑のドラゴンのドット絵",
		"guide.recipe3.output_alt":
			"レシピ3の変換結果。背景が透過し、4階調のグレーになったドラゴンのドット絵",
		"guide.recipe3.caption_input": "生成画像（2816×1536px・縮小表示）",
		"guide.recipe3.caption_output":
			"変換結果（ゲームボーイ (ポケット)・44×47px の等倍出力）",
		"guide.recipe4.heading": "レシピ4: 背景用の一枚絵",
		"guide.recipe4.goal":
			"透過しないケース。キャラクターや小物を置かない風景を、そのまま背景として使えるドット絵に変換します。要素を減らして1ドットを大きく描かせる指示がポイントです。",
		"guide.recipe4.settings":
			"「かんたん設定」の「背景」を「背景を残す」にします（「仕上がり」は「おまかせ」のままで構いません）。",
		"guide.recipe4.input_alt":
			"レシピ4の生成画像。明るい空の下に緑の平原と青い山並みを描いたドット絵",
		"guide.recipe4.output_alt":
			"レシピ4の変換結果。山岳風景を背景ごと残したドット絵",
		"guide.recipe4.caption_input": "生成画像（2752×1536px・縮小表示）",
		"guide.recipe4.caption_output":
			"変換結果（おまかせ＋背景を残す・256×144px の等倍出力）",
		"guide.recipe5.heading": "レシピ5: 普通のイラストをドット絵化する",
		"guide.recipe5.goal":
			"ドット絵風に生成できないモデルや画風でも、普通のイラストからドット絵へ変換できます。ドット絵を頼む代わりに、変換に強く効くフラットな塗りと太い輪郭線を指示します。",
		"guide.recipe5.settings":
			"「かんたん設定」の「仕上がり」を「細部を残してドット化」、「色数・配色」を「32色」にします。ドットの粗さを変えたいときは「ドットの細かさ」で調整します。",
		"guide.recipe5.input_alt":
			"レシピ5の生成画像。青い背景に、フラットな塗りのデフォルメキャラクターのイラスト",
		"guide.recipe5.output_alt":
			"レシピ5の変換結果。背景が透過し、ドット絵になったデフォルメキャラクター",
		"guide.recipe5.caption_input": "生成画像（2816×1536px・縮小表示）",
		"guide.recipe5.caption_output":
			"変換結果（細部を残してドット化＋32色・60×81px の等倍出力）",
		"guide.troubleshooting.heading": "うまくいかないときは",
		"guide.troubleshooting.col_symptom": "症状",
		"guide.troubleshooting.col_cause": "原因",
		"guide.troubleshooting.col_fix": "プロンプトの直し方",
		"guide.troubleshooting.r1_symptom": "キャラクターの白目などに穴が開く",
		"guide.troubleshooting.r1_cause": "背景色が被写体の中にも使われている",
		"guide.troubleshooting.r1_fix":
			"背景を被写体に含まれない原色に変える（例: <code>full frame edge-to-edge solid magenta background</code>）",
		"guide.troubleshooting.r2_symptom":
			"輪郭の周りに背景色のフチが残る・にじむ",
		"guide.troubleshooting.r2_cause": "影やグローが被写体の周囲にある",
		"guide.troubleshooting.r2_fix":
			"<code>no drop shadow, no outer glow, flat lighting</code> を追加する",
		"guide.troubleshooting.r3_symptom":
			"出力サイズが極端に小さい・ドットが潰れる",
		"guide.troubleshooting.r3_cause": "画像内でドットの大きさが揃っていない",
		"guide.troubleshooting.r3_fix":
			"<code>consistent pixel size throughout</code> を追加する。結果の候補選択が出た場合は見比べて選ぶ",
		"guide.troubleshooting.r4_symptom": "輪郭がギザギザに波打つ・斜めになる",
		"guide.troubleshooting.r4_cause": "生成画像がわずかに傾いている",
		"guide.troubleshooting.r4_fix":
			"<code>upright, straight-on</code> を追加して生成し直す",
		"guide.troubleshooting.r5_symptom": "被写体の端が欠ける",
		"guide.troubleshooting.r5_cause": "被写体が画像の端で見切れている",
		"guide.troubleshooting.r5_fix":
			"<code>full body, centered, with margin, not cropped</code> を追加する",
		"guide.notes.heading": "注記",
		"guide.notes.body":
			"作例は Google Gemini（Nano Banana 2）で生成しています。プロンプトの効き方は生成モデルやバージョンによって異なります。意図通りにならないときは、表現を少しずつ変えて複数回生成し、このページの原則に合う1枚を選んでください。",
	},
	"zh-CN": {
		// UI 見出しとラベル
		"app.title": "Pixel Refiner | AI 像素画优化与背景透明工具",
		"app.description":
			'将 AI 生成的像素画优化为可直接用于<span class="text-highlight">素材</span>和<span class="text-highlight">图标</span>的品质。<br />' +
			'数秒内完成<span class="text-highlight">抗锯齿清理</span>和<span class="text-highlight">背景透明化</span>。',
		"app.guide_link": "如何准备能干净转换成像素画的图片（配方集）",
		"section.input": "输入图片",
		"section.result": "处理结果",
		"section.palette": "调色板",
		"ui.process_btn": "开始处理",
		"ui.images": "图片列表",
		"ui.auto_process": "自动",
		"ui.download_btn": "下载",
		"ui.export_gpl": "导出 .GPL",
		"ui.export_png": "导出 .PNG",
		"ui.import_palette": "导入调色板",
		"ui.show_palette": "显示调色板",
		"ui.clear_all": "全部清除",
		"ui.download_all": "全部下载",
		"ui.download_all_zip": "全部下载 (ZIP)",
		"ui.shared_palette": "共用调色板",
		"ui.include_diagnostics": "包含诊断摘要",
		"ui.remove_image": "移除图片",
		"ui.confirm_clear_all": "确定要清除所有图片吗？",
		"ui.size": "尺寸",
		"ui.view_single": "单图",
		"ui.view_compare": "对比",
		"ui.compare_before_original": "原图",
		"ui.compare_before_sanitized": "预处理",
		"ui.placeholder.input":
			'将图片拖放到这里<br /><span class="drop-subtext">或点击选择<br />(支持多张)</span>',
		"ui.placeholder.result": "处理结果会显示在这里",
		"ui.close": "关闭",
		"ui.download_options": "选择下载类型",
		"candidate.title": "选择处理结果",
		"candidate.intro": "自动判断不够确定，请比较实际结果后再选择。",
		"candidate.recommended_badge": "推荐",
		"candidate.metadata": "{width} × {height} px・{colors} 色",
		"candidate.label.recommended": "推荐方案",
		"candidate.label.auto-result": "Auto结果",
		"candidate.label.finer": "更精细",
		"candidate.label.coarser": "更粗犷",
		"candidate.label.preserve": "保持原尺寸",
		"candidate.label.convert": "转换方案",
		"candidate.description.recommended": "最符合图像结构的检测结果。",
		"candidate.description.auto-result": "Auto处理实际采用的结果。",
		"candidate.description.finer": "保留更多细节的方案。",
		"candidate.description.coarser": "将图像整理为更大像素块的方案。",
		"candidate.description.preserve": "不缩小图像，安全保留原始分辨率。",
		"candidate.description.convert": "按普通图像转换为像素画风格。",
		"batch.status.pending": "待处理",
		"batch.status.processing": "处理中",
		"batch.status.done": "完成",
		"batch.status.error": "错误",

		// 設定
		"setting.mode": "设置方式",
		"setting.quick": "快速设置",
		"setting.preset": "预设",
		"setting.quick_finish": "效果",
		"setting.quick_pixel_detail": "像素细节",
		"setting.quick_colors": "减色",
		"setting.quick_background": "背景",
		"setting.quick_gradient": "渐变纹理",
		"setting.processing_mode": "效果",
		"setting.size": "尺寸",
		"setting.detail": "细节",
		"setting.convert_output_size": "像素细节",
		"setting.convert_output_width": "输出宽度",
		"setting.convert_output_height": "输出高度",
		"setting.background": "背景透明",
		"setting.dithering": "抖动",
		"preset.auto": "智能推荐",
		"preset.crisp_sprite": "清晰轮廓",
		"preset.keep_fine_details": "原尺寸优化",
		"preset.transparent_icon": "透明图标",
		"preset.limited_colors": "16色复古风格",
		"preset.photo_to_pixel": "保留细节的像素画",
		"option.quick_processing_auto": "智能推荐",
		"option.quick_processing_refine": "清晰轮廓",
		"option.quick_processing_convert": "保留细节的像素画",
		"option.quick_processing_preserve": "原尺寸优化",
		"option.processing_auto": "智能推荐",
		"notice.processing_mode_forced_size":
			"完全像素指定优先，因此不会使用效果设置。",
		"option.processing_refine": "清晰轮廓",
		"option.processing_convert": "保留细节的像素画",
		"option.processing_preserve": "原尺寸优化",
		"option.size_very_small": "非常粗",
		"option.size_small": "粗",
		"option.size_slightly_small": "稍粗",
		"option.size_standard": "标准",
		"option.size_large": "精细",
		"option.size_custom_width": "指定宽度",
		"option.size_custom_height": "指定高度",
		"option.size_custom_both": "指定宽度和高度",
		"option.detail_coarse": "粗略",
		"option.detail_balanced": "平衡",
		"option.detail_detailed": "精细",
		"option.colors_8": "8色",
		"option.colors_16": "16色",
		"option.colors_24": "24色",
		"option.colors_32": "32色",
		"option.quick_colors_auto": "智能推荐",
		"option.quick_colors_original": "保留原色",
		"option.background_keep": "保留背景",
		"option.background_auto": "自动移除背景",
		"option.background_pick": "移除所选颜色",
		"option.dithering_off": "不使用",
		"option.dithering_subtle": "轻微",
		"option.dithering_strong": "强烈",
		"classification.manual": "手动选择",
		"classification.native-pixel": "原始像素画",
		"classification.scaled-pixel": "放大像素画",
		"classification.soft-pixel": "插值像素画",
		"classification.continuous": "普通图像",
		"classification.uncertain": "暂缓判断",
		"route.refine": "Refine",
		"route.convert": "Convert",
		"route.preserve": "Preserve",
		"result.analysis":
			"判断：{classification} / {route} / 可信度 {confidence}%",
		"setting.color_reduction": "减色",
		"setting.color_mode": "减色模式",
		"setting.color_count": "颜色数量",
		"setting.dither_mode": "抖动",
		"setting.dither_strength": "抖动强度 (%)",
		"setting.advanced": "高级设置",
		"setting.grid_detection": "网格检测",
		"setting.grid_mode": "网格检测模式",
		"setting.quant_step": "量化步长",
		"setting.sample_window": "网格搜索采样范围",
		"setting.cell_sampling_mode": "单元格颜色采样",
		"setting.preserve_thin_features": "保护细线",
		"setting.auto_grid_from_trimmed": "从内容推定网格",
		"setting.phase_aware_grid_search": "相位感知网格搜索",
		"setting.boundary_contrast_override": "按边界对比度切换",
		"setting.small_aspect_grid_alignment": "小网格基准对齐",
		"setting.max_samples_per_cell": "每单元格最大采样数",
		"setting.cell_alpha_threshold": "单元格 Alpha 下限",
		"setting.auto_max_cells_w": "最大单元格数（宽）",
		"setting.auto_max_cells_h": "最大单元格数（高）",
		"setting.detection_background_mask": "检测前遮罩背景",
		"setting.background_mask_tolerance": "检测遮罩容差",
		"setting.grid_signal_color_boundary": "信号：颜色边界",
		"setting.grid_signal_luminance_alpha": "信号：亮度／Alpha",
		"setting.grid_signal_autocorrelation": "信号：自相关",
		"setting.grid_signal_reconstruction": "信号：重建误差",
		"setting.grid_signal_local_phase": "信号：局部相位",
		"setting.background_dehalo": "修正边缘光晕",
		"setting.background_edge_cleanup": "替换边缘污染色",
		"setting.background_ramp_follow": "跟随渐变背景",
		"setting.background_removal_rollback": "过度移除时回滚",
		"setting.alpha_border_background_guard": "信任已有透明度",
		"setting.background_confidence_gate": "要求背景可信",
		"setting.small_component_background_gate": "清理依赖背景可信度",
		"setting.watermark_sampling_compat": "水印移除后的采样",
		"setting.trim_alpha_threshold": "裁剪 Alpha 下限",
		"option.cell_sampling_hard": "硬 Alpha（默认）",
		"option.cell_sampling_alpha_aware": "保留半透明",
		"option.cell_sampling_legacy": "兼容（中值）",
		"option.auto_behavior_on": "始终启用",
		"option.auto_behavior_off": "始终禁用",
		"setting.force_width": "强制宽度 (px)",
		"setting.force_height": "强制高度 (px)",
		"setting.fast_mode": "快速模式",
		"setting.make_square": "转为正方形",
		"setting.keep_aspect_ratio": "保持宽高比",
		"setting.bg_removal": "背景透明化",
		"setting.bg_method": "背景提取方式",
		"setting.bg_rgb": "背景色 (RGB)",
		"setting.bg_tolerance": "背景色容差",
		"setting.pre_remove": "处理前透明化",
		"setting.post_remove": "处理后透明化",
		"setting.bg_removal_scope": "背景透明化范围",
		"setting.bg_connectivity": "连通判定",
		"setting.gemini_watermark_removal": "移除 Gemini 水印",

		"setting.small_component_mode": "小组件清理",
		"setting.trimming": "裁剪",
		"setting.outline": "描边",
		"setting.outline_style": "样式",
		"setting.outline_color": "颜色",
		"setting.processing": "处理",
		"setting.auto_process": "自动转换",
		"section.presets": "预设",
		"ui.preset_name": "预设名称",
		"ui.save_preset": "保存",
		"ui.load_preset": "加载",
		"ui.delete_preset": "删除",
		"ui.confirm_delete_preset": "确定要删除此预设吗？",
		"ui.confirm_overwrite_preset": "已存在同名预设。要覆盖它吗？",
		"ui.preset_loaded": "已加载预设“{name}”",
		"ui.preset_saved": "已保存预设“{name}”",
		"tooltip.help.auto_process":
			"设置变化时自动运行转换处理。\n\n如果想手动点击处理按钮，请关闭此选项。",
		"tooltip.help.quick_preset":
			"根据目标效果，一次设置尺寸、色彩和背景等项目。",
		"tooltip.help.quick_processing_mode":
			"选择目标效果。\n\n智能推荐：自动选择适合图像的效果。\n清晰轮廓：去除模糊，并按像素统一颜色和透明度。\n保留细节的像素画：在保留明暗层次和细线的同时降低分辨率。\n原尺寸优化：不缩小图像，只调整背景和色彩。",
		"tooltip.help.convert_output_size":
			"选择五档细节级别，或指定 Convert 重采样使用的宽度、高度或两者。仅指定一个尺寸时，另一个尺寸将按图像纵横比计算。",
		"tooltip.help.convert_output_dimension":
			"指定 Convert 重采样使用的尺寸。背景裁剪、描边和留白可能会改变最终画布尺寸。",
		"tooltip.help.quick_detail":
			"为“保留细节的像素画”选择五档像素细节。设置越粗，输出尺寸越小，单个像素看起来越大。“精细”也不会放大到超过原图尺寸，不影响颜色数量等其他设置。\n\n在“智能推荐”中，仅当系统自动选择保留细节的效果时生效。",
		"tooltip.help.quick_reduction_mode":
			"选择减色方式。智能推荐会为“清晰轮廓”和“原尺寸优化”保留原色，并为“保留细节的像素画”选择24色。任意颜色数量和导入固定调色板可在高级设置中指定。",
		"tooltip.help.quick_background":
			"选择保留背景、自动移除背景，或将选定颜色设为透明。保留背景时会保留完整画布；透明化背景时也会自动裁剪透明边距。",
		"tooltip.help.quick_dithering":
			"减色时加入像素纹理来表现渐变。强度越高越能保留明暗层次，但纹理也会更明显。",

		// ツールチップ
		"tooltip.help.color_mode":
			"限制输出结果的颜色数量。\n\n适合将画面整理成更接近经典像素画的色彩风格。\n无：不进行减色。\nGame Boy / PICO-8 / NES：使用对应主机的调色板。\n自定义数量：自动减色到指定颜色数量。",
		"tooltip.help.color_count":
			"指定输出的最大颜色数量。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.dither_strength":
			"减色时应用抖动（误差扩散）。\n\n100%：完整误差扩散。\n0%：不使用抖动，直接取最接近的颜色。\n\n可以用较少颜色表现更平滑的渐变，但会产生像素画常见的颗粒感。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.grid_mode":
			"切换网格检测的工作方式。\n\n自动检测：自动检测网格（默认）。\n像素指定 + 自动检测：把指定像素尺寸作为提示，并在附近进行精细搜索。\n完全像素指定：强制转换为指定尺寸（不自动检测）。\n关闭：跳过网格检测和缩小（适合 1:1 像素画）。",
		"tooltip.help.quant_step":
			"设置网格检测使用的减色级别。\n\n高：颜色会被归并，更抗噪，但细微色差可能丢失。\n低：能捕捉更细的颜色边界，但更容易误判噪点。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.sample_window":
			"在自动和提示模式下比较网格尺寸候选项时使用的参考范围（像素数）。\n\n高：网格检测更能抵抗噪点，但可能忽略细微边界。\n低：更容易捕捉细微边界，但更容易受错位和噪点影响。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.cell_sampling_mode":
			"决定如何选择每个逻辑像素的代表色。\n\n硬 Alpha：不保留插值产生的中间透明度。\n保留半透明：保留作为面积覆盖的半透明，适合刻意柔和的边缘。\n兼容：旧版中值采样器，水印移除后也会自动使用。",
		"tooltip.help.preserve_thin_features":
			"保护横跨单元格的少数色，使细线与轮廓在缩小后仍然保留。",
		"tooltip.help.auto_grid_from_trimmed":
			"从去除背景后的内容范围推定输出网格。\n关闭时仅使用扫描整幅图像的旧版检测器。",
		"tooltip.help.phase_aware_grid_search":
			"同时执行相位感知搜索，当两个轴都足够可信时优先采用其结果。",
		"tooltip.help.boundary_contrast_override":
			"当更粗的倍率其单元格边界明显更贴合真实边缘时，将采用的网格切换过去。",
		"tooltip.help.small_aspect_grid_alignment":
			"当逻辑分辨率较小时，使用从角落求得的遮罩范围作为网格基准。关闭后，智能推荐可能选择原尺寸优化而不是小网格。",
		"tooltip.help.max_samples_per_cell":
			"决定单个单元格颜色时读取的像素数上限。数值越大越稳定，但速度更慢。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.cell_alpha_threshold":
			"像素在单元格内被视为颜色候选所需的最低 Alpha 值。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.auto_max_cells_w":
			"旧版检测器自动检测的单元格数上限。关闭「从内容推定网格」时生效。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.auto_max_cells_h":
			"旧版检测器自动检测的单元格数上限。关闭「从内容推定网格」时生效。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.detection_background_mask":
			"在网格检测前推测并遮罩背景色，避免背景噪点影响检测结果。",
		"tooltip.help.background_mask_tolerance":
			"检测用背景遮罩视为背景的各通道色差。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.grid_signal_color_boundary":
			"在网格候选评分中纳入颜色边界信号。",
		"tooltip.help.grid_signal_luminance_alpha":
			"在网格候选评分中纳入亮度梯度与 Alpha 梯度信号。",
		"tooltip.help.grid_signal_autocorrelation":
			"在网格候选评分中纳入自相关信号。",
		"tooltip.help.grid_signal_reconstruction":
			"在网格候选评分中纳入重建误差信号。",
		"tooltip.help.grid_signal_local_phase":
			"在网格候选评分中纳入局部相位稳定性信号。",
		"tooltip.help.background_dehalo":
			"移除背景后，将抗锯齿边缘推离背景色，减轻残留的偏色。",
		"tooltip.help.background_edge_cleanup":
			"将缩小后仍带有背景色的边缘像素替换为原始尺寸下的本来颜色。",
		"tooltip.help.background_ramp_follow":
			"将平滑渐变的背景视为一连串细小台阶来追踪，而非依据绝对色差。",
		"tooltip.help.background_removal_rollback":
			"当背景移除会抹掉几乎所有可见像素时，整体撤销该次移除。",
		"tooltip.help.alpha_border_background_guard":
			"当图像边缘大部分已透明时，不再依据颜色推定背景，避免削掉已抠图图像的轮廓。",
		"tooltip.help.background_confidence_gate":
			"当推定的背景模型可信度不足时，直接跳过背景移除。",
		"tooltip.help.small_component_background_gate":
			"当推定的背景模型可信度不足时，同样跳过「细小元素整理」。",
		"tooltip.help.watermark_sampling_compat":
			"移除水印后切换到兼容的中值采样器，以避免末行缺失。",
		"tooltip.help.trim_alpha_threshold":
			"计算裁剪范围时，像素被视为内容所需的最低 Alpha 值。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.force_width":
			"指定像素宽度。\n\n像素指定 + 自动检测：用该值作为提示并在附近精细搜索。\n完全像素指定：强制转换为该宽度。\n\n范围：1 到 1024 (默认：自动)",
		"tooltip.help.force_height":
			"指定像素高度。\n\n像素指定 + 自动检测：用该值作为提示并在附近精细搜索。\n完全像素指定：强制转换为该高度。\n\n范围：1 到 1024 (默认：自动)",
		"tooltip.help.fast_mode":
			"开启后使用更高效的算法加快搜索。\n关闭后会进行更大范围、更精细的搜索。\n\n如果自动检测结果错位，或图片包含大量噪点和细碎纹理，关闭后可能提高准确度。",
		"tooltip.help.shared_palette":
			"使用同一个调色板对所有图片减色。\n\n处理完成后会从全部图片生成共用调色板，以色数设置为上限归纳后，再重新应用到每张图片。\n适合角色差分或动画帧等需要统一色调的场景。",
		"tooltip.help.include_diagnostics":
			"在全部下载 (ZIP) 中追加 diagnostics.json。\n\n该 JSON 记录每张图片的输入输出文件名、判定的输入类型、处理方式、置信度和警告代码。\n便于在批量处理后筛选需要确认的图片。",
		"tooltip.help.bg_method":
			"选择从哪里提取背景色。启用背景透明化时也会自动裁剪透明边距；不透明化背景时会保留完整画布。\n\n自动：从整个图像边缘估算背景。\n无：不移除背景。\n四角：使用指定角落的像素作为背景色。\nRGB：使用指定颜色作为背景色。",
		"tooltip.help.bg_rgb":
			"用十六进制格式指定要视为背景的颜色（例如 #ffffff）。\n选择四角时会自动填入颜色。也可以用吸管按钮从图片中取色。",
		"tooltip.help.bg_tolerance":
			"判断背景色相似度的误差范围。\n\n高：即使背景因压缩噪点产生轻微偏差也能移除，但可能误删需要保留的颜色。\n低：只移除更接近精确背景色的颜色，但可能残留噪点。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.pre_remove":
			"在网格检测前忽略背景色。\n\n优点：图片留白较大时，更容易正确检测主体网格。\n注意：如果角色内部也有背景同色区域，检测准确度可能下降。",
		"tooltip.help.post_remove":
			"处理完成后将背景色替换为透明。\n\n优点：可以保存为透明背景 PNG。\n注意：不会影响网格检测过程本身。",
		"tooltip.help.bg_removal_scope":
			"决定背景透明化的范围。\n\n自动：在外侧的基础上，只透明化可确定为背景色的内部封闭区域。\n仅选中部分：只透明化从所选角落连通的背景。\n外侧全部：透明化所有与图片边缘连通的背景。\n全区域：包括内部在内，透明化所有接近背景色的区域。\n\n背景设为“保留”时不可用。",
		"tooltip.help.bg_connectivity":
			"决定相邻区域是否算作连通。\n\n4 方向：更严格，不包含斜向。\n8 方向：包含斜向相邻。",
		"tooltip.help.gemini_watermark_removal":
			"背景透明化后，仅自动移除位于右下角、以明亮菱形独立悬浮的 Gemini 水印。水印与主体接触时不会移除。",
		"tooltip.help.small_component_mode":
			"根据恢复后的逻辑像素清理孤立噪点。会保护邻近、重复、对称、位于轮廓延长线、边缘清晰或高不透明度的细节。背景判断不确定时不会自动删除。",
		"tooltip.help.make_square":
			"用透明像素填充不足的边，使整张图片变为正方形。\n\n原内容会居中放置。",
		"tooltip.help.keep_aspect_ratio":
			"裁剪后的输出图片使用透明像素填充，以保持原图的宽高比。\n\n适用于需要统一精灵画布尺寸的场景。",

		// 選択肢
		"option.none": "无",
		"option.mono": "黑白",
		"option.gb_legacy": "Game Boy (初代)",
		"option.gb_pocket": "Game Boy (Pocket)",
		"option.gb_light": "Game Boy (Light)",
		"option.pico8": "PICO-8",
		"option.nes": "NES",
		"option.pc98": "PC-9801",
		"option.msx": "MSX1",
		"option.c64": "Commodore 64",
		"option.arne16": "Arne 16",
		"option.sfc_sprite": "SFC 风格 (16 色/精灵)",
		"option.sfc_bg": "SFC 风格 (256 色/背景)",
		"option.auto": "自定义数量",
		"option.fixed": "固定/自定义调色板",
		"option.dither_none": "无",
		"option.dither_floyd": "Floyd-Steinberg",
		"option.dither_bayer2": "Bayer 2x2",
		"option.dither_bayer4": "Bayer 4x4",
		"option.dither_bayer8": "Bayer 8x8",
		"option.dither_ordered": "Ordered",
		"option.outline_none": "无",
		"option.outline_rounded": "圆润 (8 方向)",
		"option.outline_sharp": "锐利 (4 方向)",
		"option.grid_mode_auto": "自动检测（默认）",
		"option.grid_mode_hint": "像素指定 + 自动检测",
		"option.grid_mode_force": "完全像素指定",
		"option.grid_mode_off": "关闭",
		"option.bg_none": "无",
		"option.bg_auto": "自动（默认）",
		"option.bg_scope_auto": "自动",
		"option.bg_scope_selected": "仅所选角落",
		"option.bg_scope_outer": "仅外侧",
		"option.bg_scope_all": "外侧 + 内部",
		"option.bg_connectivity_4": "4 方向（不含斜向）",
		"option.bg_connectivity_8": "8 方向（含斜向）",
		"option.gemini_watermark_auto": "自动",
		"option.gemini_watermark_off": "关闭",
		"option.small_component_off": "关闭",
		"option.small_component_light": "轻度（保留细节）",
		"option.small_component_auto": "自动",
		"option.small_component_strong": "强力",
		"option.bg_top_left": "左上",
		"option.bg_bottom_left": "左下",
		"option.bg_top_right": "右上",
		"option.bg_bottom_right": "右下",
		"option.bg_rgb": "RGB 指定",

		// JS メッセージ
		"error.no_image": "请先选择图片。",
		"error.process_failed": "处理失败",
		"error.load_failed": "加载失败",
		"warning.low_grid_confidence": "网格判断可信度较低，请检查结果。",
		"warning.background_uncertain": "背景判断存在不确定性。",
		"warning.background_removal_skipped":
			"检测到背景可能被过度移除，已中止背景透明化。",
		"warning.content_loss_risk": "处理可能导致大量内容丢失。",
		"warning.one_axis_detection_failed": "无法检测一个方向的网格。",
		"warning.extreme_output_size": "输出尺寸非常大。",
		"warning.no_content": "未检测到可处理的内容。",
		"warning.fallback_to_preserve": "为安全起见，已保留原始尺寸。",
		"warning.batch_partial_failure":
			"{total} 张图片中有 {failed} 张处理失败。成功的图片已包含在 ZIP 中。",
		"warning.pending_partial_failure":
			"{total} 张图片中有 {failed} 张转换失败。可在图片列表中查看对象。",
		"warning.unknown": "未知处理警告（{code}）。",

		"error.palette_limit": "警告：图片包含{count}种颜色。调色板将限制为256色。",
		"error.no_processed_images": "没有可下载的已处理图片。",
		"error.download_failed": "下载失败",
		"status.processing": "处理中...",
		"status.processing_batch": "正在批量处理... ({current}/{total})",

		// 属性とタイトル
		"attr.title.bg_checkered": "背景：棋盘格",
		"attr.title.bg_white": "背景：白色",
		"attr.title.bg_black": "背景：黑色",
		"attr.title.bg_green": "背景：绿色",
		"attr.title.grid_toggle": "显示网格（仅缩放时有效）",
		"attr.title.zoom_toggle": "放大显示",
		"attr.title.eyedropper": "用吸管从图片中选择颜色",
		"attr.aria.background_color": "背景颜色",
		"attr.aria.theme_toggle": "切换显示主题",
		"attr.placeholder.auto": "自动",

		// モーダル
		"modal.eyedropper.title": "选择背景色",
		"modal.eyedropper.instruction": "点击图片中要作为背景的颜色",

		// フッター
		"footer.privacy": "图片会在浏览器内安全处理",
		"footer.qualityReport": "质量报告",

		// AI画像生成レシピ集（guide.html）
		"guide.page_title": "AI 图像生成配方集 | Pixel Refiner",
		"guide.page_name": "AI 图像生成配方集",
		"guide.subtitle": "如何准备能干净转换成像素画的输入图片",
		"guide.back_to_app": "返回 Pixel Refiner",
		"guide.copy_prompt": "复制提示词",
		"guide.copied": "已复制",
		"guide.intro.heading": "开始之前 — 基本思路",
		"guide.intro.body1":
			"Pixel Refiner 能自动修正“像素模糊”“网格错位”“颜色过多”。但源自生成图片本身的问题，在转换阶段无法解决。",
		"guide.intro.body2":
			"本页收集的提示词，用于<strong>在生成阶段就避免那些无法修正的问题</strong>。",
		"guide.intro.fixable_heading": "工具可以修正的问题（生成时无需在意）",
		"guide.intro.fixable_1": "像素模糊与抗锯齿",
		"guide.intro.fixable_2": "像素大小不一致的缩放与网格错位",
		"guide.intro.fixable_3": "颜色数量过多（减色与调色板转换）",
		"guide.intro.fixable_4": "纯色平涂背景的透明化",
		"guide.intro.unfixable_heading": "工具无法修正的问题（需在生成时避免）",
		"guide.intro.unfixable_1": "背景色也出现在主体内部",
		"guide.intro.unfixable_2": "主体在画面边缘被裁切",
		"guide.intro.unfixable_3": "阴影、辉光、柔和投影",
		"guide.intro.unfixable_4": "整幅图片存在轻微倾斜",
		"guide.intro.unfixable_5": "一张图中包含多个主体",
		"guide.blur.heading": "放大之后，AI 生成图片其实很模糊",
		"guide.blur.body1":
			"远看像是像素画，放大后却能看到：单个像素块的边缘要经过好几个像素才过渡完，同一个像素块内部的颜色也在变化。图像生成模型并不会严格遵守像素网格，因此生成图片很难直接当作素材使用，放进游戏或 UI 里轮廓会发虚。",
		"guide.blur.body2":
			"Pixel Refiner 会把这些模糊的像素块重新对齐到网格，并把每一块重涂成单一颜色。后面的配方，就是为了生成更容易被这样整理的图片。",
		"guide.blur.view_whole": "整体",
		"guide.blur.view_detail": "局部放大（原像素的 4 倍）",
		"guide.blur.whole_alt": "远看像是像素画的生成骑士图片",
		"guide.blur.zoom_alt":
			"头盔左上角的放大图：像素块的边缘要经过好几个像素才过渡完",
		"guide.blur.caption":
			"同一张生成图片。右侧是头盔左上角 80×80 像素放大 4 倍的结果：像素块之间的边界发糊，背景与轮廓之间还出现了中间色。",
		"guide.principles.heading": "五条基本原则",
		"guide.principles.p1_heading": "原则 1：背景使用主体中不存在的纯色平涂",
		"guide.principles.p1_body":
			"如果背景色也出现在主体中，例如白色背景上有白色眼睛的角色，背景透明化就可能连主体一起去掉。请选择与主体色相相距较远的颜色：暖色主体用绿色（#00FF00），绿色主体用品红（#FF00FF）。",
		"guide.principles.p2_heading": "原则 2：不要添加阴影、辉光、柔和投影",
		"guide.principles.p2_body":
			"主体与背景之间的半透明渐变，会在透明化之后留下残边，或让轮廓变色。",
		"guide.principles.p3_heading": "原则 3：不要让主体出框，四周留出空白",
		"guide.principles.p3_body":
			"主体一旦贴到画面边缘，背景推定就会出现混乱。请让主体完整入画，四周留出空白。",
		"guide.principles.p4_heading": "原则 4：不要倾斜",
		"guide.principles.p4_body":
			"像素网格轻微倾斜的图片很难处理。请在生成阶段就要求端正的构图。",
		"guide.principles.p5_heading": "原则 5：一图一主体，并统一像素大小",
		"guide.principles.p5_body":
			"把多个精灵拼在一张图上，或者不同区域像素大小不一致的图片，都会干扰网格检测。",
		"guide.principles.no_effort_heading": "反过来，不必刻意追求的事",
		"guide.principles.no_effort_body":
			"在生成阶段不必完全消除抗锯齿，也不必精确输出 32×32 像素。<code>32x32 pixel art</code> 这类指定即使没有被严格遵守，也会促使模型输出更大、更均匀的像素，因此仍然值得写上。",
		"guide.recipes.heading": "配方集",
		"guide.recipes.intro":
			"每个配方会依次介绍提示词、生成图片、Pixel Refiner 设置和转换结果。每个示例都使用页面所示的提示词生成，并按页面所示的设置转换。",
		"guide.recipes.goal_label": "目标",
		"guide.recipes.settings_label": "Pixel Refiner 设置",
		"guide.recipes.caption_input": "生成图片（示例）",
		"guide.recipes.scale_actual": "原尺寸",
		"guide.recipes.scale_zoomed": "4 倍显示",
		"guide.recipes.caption_output": "转换结果（示例）",
		"guide.recipe1.heading": "配方 1：游戏角色精灵",
		"guide.recipe1.goal":
			"透明素材的基本形态。重点是背景色的选法（暖色角色配品红背景），以及留出空白避免出框。",
		"guide.recipe1.settings": "把“预设”保持为“智能推荐”（背景会自动透明化）。",
		"guide.recipe1.input_alt":
			"配方 1 的生成图片：品红背景上手持剑与盾的骑士像素画",
		"guide.recipe1.output_alt": "配方 1 的转换结果：背景已透明的骑士像素画",
		"guide.recipe1.caption_input": "生成图片（2048×2048px，缩小显示）",
		"guide.recipe1.caption_output":
			"转换结果（智能推荐，60×85px 的原尺寸输出）",
		"guide.recipe2.heading": "配方 2：道具图标",
		"guide.recipe2.goal":
			"用于 UI 的单一物件。红色主体搭配绿色背景后，背景与主体更容易区分，透明化效果也会更干净。",
		"guide.recipe2.settings":
			"在“预设”中选择“透明图标”。背景会被透明化，颜色会减至 32 色。",
		"guide.recipe2.input_alt":
			"配方 2 的生成图片：绿色背景上的红色药水瓶像素画",
		"guide.recipe2.output_alt": "配方 2 的转换结果：背景已透明的药水瓶像素画",
		"guide.recipe2.caption_input": "生成图片（2752×1536px，缩小显示）",
		"guide.recipe2.caption_output":
			"转换结果（透明图标，16×23px 的原尺寸输出）",
		"guide.recipe3.heading": "配方 3：复古掌机风格（Game Boy 调色板）",
		"guide.recipe3.goal":
			"在生成阶段就把层次压少，再用调色板转换精确替换成所选机型的 4 个色阶。生成时的颜色本身不会保留，所以背景色不按成品的颜色来指定，而按容易去除来指定（绿色主体配红色背景）。",
		"guide.recipe3.settings":
			"在“快速设置”的“色彩”中选择“Game Boy (Pocket)”。其余保持不变，背景会自动透明化。",
		"guide.recipe3.input_alt": "配方 3 的生成图片：红色背景上的绿色小龙像素画",
		"guide.recipe3.output_alt":
			"配方 3 的转换结果：背景已透明、变成 4 个灰色色阶的小龙像素画",
		"guide.recipe3.caption_input": "生成图片（2816×1536px，缩小显示）",
		"guide.recipe3.caption_output":
			"转换结果（Game Boy (Pocket)，44×47px 的原尺寸输出）",
		"guide.recipe4.heading": "配方 4：用作背景的整幅插画",
		"guide.recipe4.goal":
			"不做透明化的情况。把没有角色和小物件的风景，转换成可以直接当作背景使用的像素画。关键是要求减少元素、把每个像素画得更大。",
		"guide.recipe4.settings":
			"在“快速设置”中把“背景”设为“保留背景”（“效果”保持“智能推荐”即可）。",
		"guide.recipe4.input_alt":
			"配方 4 的生成图片：明亮天空下的绿色原野与蓝色群山像素画",
		"guide.recipe4.output_alt":
			"配方 4 的转换结果：保留完整背景的山野风景像素画",
		"guide.recipe4.caption_input": "生成图片（2752×1536px，缩小显示）",
		"guide.recipe4.caption_output":
			"转换结果（智能推荐＋保留背景，256×144px 的原尺寸输出）",
		"guide.recipe5.heading": "配方 5：把普通插画转成像素画",
		"guide.recipe5.goal":
			"即使模型或画风无法直接生成像素画，也可以把普通插画转换成像素画。与其要求生成像素画，不如要求对转换特别有利的平涂上色和粗轮廓线。",
		"guide.recipe5.settings":
			"在“快速设置”中把“效果”设为“保留细节的像素画”，把“色彩”设为“32色”。想改变像素的粗细时，用“像素细节”调整。",
		"guide.recipe5.input_alt":
			"配方 5 的生成图片：蓝色背景上、平涂上色的Q版角色插画",
		"guide.recipe5.output_alt":
			"配方 5 的转换结果：背景已透明、变成像素画的Q版角色",
		"guide.recipe5.caption_input": "生成图片（2816×1536px，缩小显示）",
		"guide.recipe5.caption_output":
			"转换结果（保留细节的像素画＋32色，60×81px 的原尺寸输出）",
		"guide.troubleshooting.heading": "效果不理想时",
		"guide.troubleshooting.col_symptom": "现象",
		"guide.troubleshooting.col_cause": "原因",
		"guide.troubleshooting.col_fix": "提示词的调整方法",
		"guide.troubleshooting.r1_symptom": "角色的眼白等部位出现空洞",
		"guide.troubleshooting.r1_cause": "背景色也出现在主体内部",
		"guide.troubleshooting.r1_fix":
			"把背景换成主体中不存在的纯色（例如 <code>full frame edge-to-edge solid magenta background</code>）",
		"guide.troubleshooting.r2_symptom": "轮廓周围残留背景色的边缘或发生渗色",
		"guide.troubleshooting.r2_cause": "主体周围存在阴影或辉光",
		"guide.troubleshooting.r2_fix":
			"追加 <code>no drop shadow, no outer glow, flat lighting</code>",
		"guide.troubleshooting.r3_symptom": "输出尺寸过小、像素被压扁",
		"guide.troubleshooting.r3_cause": "图片内部的像素大小不一致",
		"guide.troubleshooting.r3_fix":
			"追加 <code>consistent pixel size throughout</code>。出现结果候选时请对比后选择",
		"guide.troubleshooting.r4_symptom": "轮廓呈锯齿状起伏或整体倾斜",
		"guide.troubleshooting.r4_cause": "生成图片存在轻微倾斜",
		"guide.troubleshooting.r4_fix":
			"追加 <code>upright, straight-on</code> 后重新生成",
		"guide.troubleshooting.r5_symptom": "主体的边缘缺失",
		"guide.troubleshooting.r5_cause": "主体在画面边缘被裁切",
		"guide.troubleshooting.r5_fix":
			"追加 <code>full body, centered, with margin, not cropped</code>",
		"guide.notes.heading": "备注",
		"guide.notes.body":
			"示例图片使用 Google Gemini（Nano Banana 2）生成。提示词的效果会随生成模型和版本而变化。如果结果不理想，请逐步调整措辞并多生成几次，从中挑选最符合本页原则的一张。",
	},
	en: {
		// UI 見出しとラベル
		"app.title": "Pixel Refiner | AI Pixel Art Optimizer & Background Remover",
		"app.description":
			'Optimize AI-generated pixel art into <span class="text-highlight">high-quality assets</span> and <span class="text-highlight">icons</span>.<br />' +
			'Complete <span class="text-highlight">anti-aliasing removal</span> and <span class="text-highlight">background transparency</span> in seconds.',
		"app.guide_link":
			"How to create images that convert cleanly (Prompt Recipes)",
		"section.input": "Input Image",
		"section.result": "Result",
		"section.palette": "Palette",
		"ui.process_btn": "Process Image",
		"ui.images": "Images",
		"ui.auto_process": "Auto",
		"ui.download_btn": "Download",
		"ui.export_gpl": "Export .GPL",
		"ui.export_png": "Export .PNG",
		"ui.import_palette": "Import Palette",
		"ui.show_palette": "Show Palette",
		"ui.clear_all": "Clear All",
		"ui.download_all": "Download All",
		"ui.download_all_zip": "Download All (ZIP)",
		"ui.shared_palette": "Shared palette",
		"ui.include_diagnostics": "Include diagnostic summary",
		"ui.remove_image": "Remove Image",
		"ui.confirm_clear_all": "Are you sure you want to clear all images?",
		"ui.size": "Size",
		"ui.view_single": "Single",
		"ui.view_compare": "Compare",
		"ui.compare_before_original": "Original",
		"ui.compare_before_sanitized": "Sanitized",
		"ui.placeholder.input":
			'Drag & drop images here<br /><span class="drop-subtext">or Click to select<br />(Multiple allowed)</span>',
		"ui.placeholder.result": "Processed result will appear here",
		"ui.close": "Close",
		"ui.download_options": "Select download options",
		"candidate.title": "Choose the best result",
		"candidate.intro":
			"Automatic detection was uncertain. Compare the actual results before choosing.",
		"candidate.recommended_badge": "Recommended",
		"candidate.metadata": "{width} × {height} px · {colors} colors",
		"candidate.label.recommended": "Recommended",
		"candidate.label.auto-result": "Auto result",
		"candidate.label.finer": "Finer",
		"candidate.label.coarser": "Coarser",
		"candidate.label.preserve": "Keep original size",
		"candidate.label.convert": "Convert option",
		"candidate.description.recommended":
			"The detected result that best matches the image structure.",
		"candidate.description.auto-result":
			"The result actually selected by Auto processing.",
		"candidate.description.finer": "Keeps more fine detail.",
		"candidate.description.coarser": "Groups the image into larger pixels.",
		"candidate.description.preserve":
			"Avoids downscaling and safely keeps the original resolution.",
		"candidate.description.convert":
			"Treats the input as a regular image and converts it to pixel art.",
		"batch.status.pending": "Pending",
		"batch.status.processing": "Processing",
		"batch.status.done": "Done",
		"batch.status.error": "Error",

		// 設定
		"setting.mode": "Settings mode",
		"setting.quick": "Quick Settings",
		"setting.preset": "Preset",
		"setting.quick_finish": "Finish",
		"setting.quick_pixel_detail": "Pixel Detail",
		"setting.quick_colors": "Color Reduction",
		"setting.quick_background": "Background",
		"setting.quick_gradient": "Gradient Texture",
		"setting.processing_mode": "Finish",
		"setting.size": "Size",
		"setting.detail": "Detail",
		"setting.convert_output_size": "Pixel Detail",
		"setting.convert_output_width": "Output Width",
		"setting.convert_output_height": "Output Height",
		"setting.background": "Background Transparency",
		"setting.dithering": "Dithering",
		"preset.auto": "Best Match",
		"preset.crisp_sprite": "Crisp Edges",
		"preset.keep_fine_details": "Original Size Cleanup",
		"preset.transparent_icon": "Transparent Icon",
		"preset.limited_colors": "16-Color Retro",
		"preset.photo_to_pixel": "Detailed Pixel Art",
		"option.quick_processing_auto": "Best Match",
		"option.quick_processing_refine": "Crisp Edges",
		"option.quick_processing_convert": "Detailed Pixel Art",
		"option.quick_processing_preserve": "Original Size Cleanup",
		"option.processing_auto": "Best Match",
		"notice.processing_mode_forced_size":
			"Pixel Only takes priority, so Finish is not used.",
		"option.processing_refine": "Crisp Edges",
		"option.processing_convert": "Detailed Pixel Art",
		"option.processing_preserve": "Original Size Cleanup",
		"option.size_very_small": "Very coarse",
		"option.size_small": "Coarse",
		"option.size_slightly_small": "Slightly coarse",
		"option.size_standard": "Balanced",
		"option.size_large": "Fine",
		"option.size_custom_width": "Specify width",
		"option.size_custom_height": "Specify height",
		"option.size_custom_both": "Specify width and height",
		"option.detail_coarse": "Coarse",
		"option.detail_balanced": "Balanced",
		"option.detail_detailed": "Detailed",
		"option.colors_8": "8 colors",
		"option.colors_16": "16 colors",
		"option.colors_24": "24 colors",
		"option.colors_32": "32 colors",
		"option.quick_colors_auto": "Best Match",
		"option.quick_colors_original": "Keep original colors",
		"option.background_keep": "Keep background",
		"option.background_auto": "Remove automatically",
		"option.background_pick": "Remove selected color",
		"option.dithering_off": "None",
		"option.dithering_subtle": "Subtle",
		"option.dithering_strong": "Strong",
		"classification.manual": "Manual selection",
		"classification.native-pixel": "Native pixel art",
		"classification.scaled-pixel": "Scaled pixel art",
		"classification.soft-pixel": "Interpolated pixel art",
		"classification.continuous": "Continuous image",
		"classification.uncertain": "Uncertain",
		"route.refine": "Refine",
		"route.convert": "Convert",
		"route.preserve": "Preserve",
		"result.analysis":
			"Detected: {classification} / {route} / {confidence}% confidence",
		"setting.color_reduction": "Color Reduction",
		"setting.color_mode": "Reduction Mode",
		"setting.color_count": "Color Count",
		"setting.dither_mode": "Dithering",
		"setting.dither_strength": "Dither Strength (%)",
		"setting.advanced": "Advanced Settings",
		"setting.grid_detection": "Grid Detection",
		"setting.grid_mode": "Grid Detection Mode",
		"setting.quant_step": "Quantization Step",
		"setting.sample_window": "Grid Sampling Window",
		"setting.cell_sampling_mode": "Cell Color Sampling",
		"setting.preserve_thin_features": "Preserve Thin Features",
		"setting.auto_grid_from_trimmed": "Estimate Grid From Content",
		"setting.phase_aware_grid_search": "Phase-aware Grid Search",
		"setting.boundary_contrast_override": "Boundary Contrast Override",
		"setting.small_aspect_grid_alignment": "Small Grid Alignment",
		"setting.max_samples_per_cell": "Max Samples per Cell",
		"setting.cell_alpha_threshold": "Cell Alpha Threshold",
		"setting.auto_max_cells_w": "Max Cells (Width)",
		"setting.auto_max_cells_h": "Max Cells (Height)",
		"setting.detection_background_mask": "Mask Background For Detection",
		"setting.background_mask_tolerance": "Detection Mask Tolerance",
		"setting.grid_signal_color_boundary": "Signal: Colour Boundary",
		"setting.grid_signal_luminance_alpha": "Signal: Luminance / Alpha",
		"setting.grid_signal_autocorrelation": "Signal: Autocorrelation",
		"setting.grid_signal_reconstruction": "Signal: Reconstruction",
		"setting.grid_signal_local_phase": "Signal: Local Phase",
		"setting.background_dehalo": "Reduce Edge Halo",
		"setting.background_edge_cleanup": "Clean Contaminated Edges",
		"setting.background_ramp_follow": "Follow Gradient Background",
		"setting.background_removal_rollback": "Roll Back Over-removal",
		"setting.alpha_border_background_guard": "Trust Existing Transparency",
		"setting.background_confidence_gate": "Require Confident Background",
		"setting.small_component_background_gate": "Gate Cleanup On Background",
		"setting.watermark_sampling_compat": "Watermark Sampling Fallback",
		"setting.trim_alpha_threshold": "Trim Alpha Threshold",
		"option.cell_sampling_hard": "Hard Alpha (Default)",
		"option.cell_sampling_alpha_aware": "Alpha Aware",
		"option.cell_sampling_legacy": "Compatible (Median)",
		"option.auto_behavior_on": "Always On",
		"option.auto_behavior_off": "Always Off",
		"setting.force_width": "Force Width (px)",
		"setting.force_height": "Force Height (px)",
		"setting.fast_mode": "Fast Mode",
		"setting.make_square": "Make Square",
		"setting.keep_aspect_ratio": "Keep Aspect Ratio",
		"setting.bg_removal": "Background Removal",
		"setting.bg_method": "Extraction Method",
		"setting.bg_rgb": "Background Color (RGB)",
		"setting.bg_tolerance": "Color Tolerance",
		"setting.pre_remove": "Pre-process Transparency",
		"setting.post_remove": "Post-process Transparency",
		"setting.bg_removal_scope": "Background Removal Scope",
		"setting.bg_connectivity": "Connectivity",
		"setting.gemini_watermark_removal": "Gemini Watermark Removal",

		"setting.small_component_mode": "Small Detail Cleanup",
		"setting.trimming": "Trimming",
		"setting.outline": "Outline",
		"setting.outline_style": "Style",
		"setting.outline_color": "Color",
		"setting.processing": "Processing",
		"setting.auto_process": "Auto Process",
		"section.presets": "Presets",
		"ui.preset_name": "Preset Name",
		"ui.save_preset": "Save",
		"ui.load_preset": "Load",
		"ui.delete_preset": "Delete",
		"ui.confirm_delete_preset": "Are you sure you want to delete this preset?",
		"ui.confirm_overwrite_preset":
			"A preset with this name already exists. Do you want to overwrite it?",
		"ui.preset_loaded": 'Preset "{name}" loaded',
		"ui.preset_saved": 'Preset "{name}" saved',
		"tooltip.help.auto_process":
			"Automatically runs processing when settings are changed.\n\nTurn OFF if you prefer to manually click the Process button.",
		"tooltip.help.quick_preset":
			"Sets the size, colors, background, and related options together for the finish you want.",
		"tooltip.help.quick_processing_mode":
			"Chooses the intended finish.\n\nBest Match: Selects a suitable finish for the image.\nCrisp Edges: Removes blur and aligns color and transparency to the pixel grid.\nDetailed Pixel Art: Reduces resolution while keeping gradients and thin lines.\nOriginal Size Cleanup: Adjusts the background and colors without downscaling.",
		"tooltip.help.convert_output_size":
			"Choose one of five detail levels, or specify the Convert resampling width, height, or both. When only one dimension is specified, the other follows the image aspect ratio.",
		"tooltip.help.convert_output_dimension":
			"Sets the resampling dimension used by Convert. Background trimming, outlines, and padding can change the final canvas size.",
		"tooltip.help.quick_detail":
			"Chooses from five pixel-detail levels for Detailed Pixel Art. Coarser settings produce a smaller output with larger-looking pixels. Fine never upscales beyond the original image and does not change the color count or other settings.\n\nIn Best Match, this applies only when a detailed finish is selected automatically.",
		"tooltip.help.quick_reduction_mode":
			"Chooses color reduction. Best Match keeps original colors for Crisp Edges and Original Size Cleanup, and selects 24 colors for Detailed Pixel Art. Custom color counts and imported palettes are available in Advanced Settings.",
		"tooltip.help.quick_background":
			"Chooses whether to keep the background, remove it automatically, or make a selected color transparent. Keeping the background preserves the full canvas; removing it also trims transparent margins.",
		"tooltip.help.quick_dithering":
			"Adds a pixel pattern during color reduction to preserve gradients. Stronger settings retain more tonal variation but make the texture more visible.",

		// ツールチップ
		"tooltip.help.color_mode":
			"Limits the number of colors in the output.\n\nUseful for achieving a classic pixel art look.\nNone: No color reduction.\nGame Boy / PICO-8 / NES: Uses specific console palettes.\nAuto: Automatically reduces to the specified number of colors.",
		"tooltip.help.color_count":
			"Specifies the maximum number of colors in the output.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.dither_strength":
			"Applies dithering (error diffusion) during color reduction.\n\n100%: Full error diffusion.\n0%: No dithering (None).\n\nAllows for smoother gradients with fewer colors, but introduces characteristic pixel noise.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.grid_mode":
			"Switches the grid detection behavior.\n\nAuto: Automatically detects the grid (default).\nPixel + Auto: Uses the specified pixel size as a hint and starts fine search near it.\nPixel Only: Forces conversion to the specified size (no auto detection).\nOff: Skips grid detection and reduction (useful for 1:1 pixel art).",
		"tooltip.help.quant_step":
			"Sets the color reduction level for grid detection.\n\nHigh: Colors are grouped, making it resistant to noise, but subtle color differences may be lost.\nLow: Picks up fine color boundaries, but increases the risk of false noise detection.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.sample_window":
			"The reference range (in pixels) used to compare grid-size candidates in Auto and Hint modes.\n\nHigh: Grid detection is more resistant to noise, but fine boundaries may be overlooked.\nLow: Grid detection follows fine boundaries, but is more affected by misalignment and noise.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.cell_sampling_mode":
			"How the representative colour of each logical pixel is chosen.\n\nHard Alpha: Avoids keeping partial transparency introduced by interpolation.\nAlpha Aware: Preserves area-coverage alpha for intentionally soft edges.\nCompatible: The legacy median sampler, also used automatically after watermark removal.",
		"tooltip.help.preserve_thin_features":
			"Protects minority colours that cross a cell so that thin lines and outlines survive downsampling.",
		"tooltip.help.auto_grid_from_trimmed":
			"Estimates the output grid from the trimmed content area.\nWhen OFF, only the fallback detector that scans the whole canvas is used.",
		"tooltip.help.phase_aware_grid_search":
			"Also runs a phase-aware search and prefers its result when both axes are confident enough.",
		"tooltip.help.boundary_contrast_override":
			"Switches the chosen grid to a coarser harmonic when its cell boundaries align clearly better with real edges.",
		"tooltip.help.small_aspect_grid_alignment":
			"For small logical resolutions, uses the corner-seeded mask bounds as the grid reference area. Turning this off may cause Best Match to select Original Size Cleanup instead of a small grid.",
		"tooltip.help.max_samples_per_cell":
			"Upper bound on the pixels sampled from one cell when picking its colour. Higher is more stable but slower.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.cell_alpha_threshold":
			"Minimum alpha for a pixel to be considered a colour candidate inside a cell.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.auto_max_cells_w":
			"Upper bound on the cell count found by the fallback detector. Applies when grid estimation from content is off.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.auto_max_cells_h":
			"Upper bound on the cell count found by the fallback detector. Applies when grid estimation from content is off.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.detection_background_mask":
			"Guesses the background colour and masks it before grid detection so that background noise does not bias the result.",
		"tooltip.help.background_mask_tolerance":
			"Per-channel colour difference the detection background mask treats as background.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.grid_signal_color_boundary":
			"Includes the colour-boundary signal when scoring grid candidates.",
		"tooltip.help.grid_signal_luminance_alpha":
			"Includes the luminance and alpha gradient signals when scoring grid candidates.",
		"tooltip.help.grid_signal_autocorrelation":
			"Includes the autocorrelation signal when scoring grid candidates.",
		"tooltip.help.grid_signal_reconstruction":
			"Includes the reconstruction-error signal when scoring grid candidates.",
		"tooltip.help.grid_signal_local_phase":
			"Includes the local phase stability signal when scoring grid candidates.",
		"tooltip.help.background_dehalo":
			"Pushes anti-aliased edge pixels away from the background colour after removal.",
		"tooltip.help.background_edge_cleanup":
			"Replaces edge pixels that still carry the background colour after downscaling with their original colour.",
		"tooltip.help.background_ramp_follow":
			"Follows a smooth gradient background as a chain of small steps instead of an absolute colour difference.",
		"tooltip.help.background_removal_rollback":
			"Discards the whole background removal when it would erase almost all of the visible pixels.",
		"tooltip.help.alpha_border_background_guard":
			"Skips colour-cluster estimation when most of the border band is already transparent, which protects the outline of pre-cut images.",
		"tooltip.help.background_confidence_gate":
			"Skips background removal entirely when the estimated background model is not confident enough.",
		"tooltip.help.small_component_background_gate":
			"Skips the small-detail cleanup when the estimated background model is not confident enough.",
		"tooltip.help.watermark_sampling_compat":
			"Switches to the compatible median sampler once a watermark has been removed, which prevents the last row from being dropped.",
		"tooltip.help.trim_alpha_threshold":
			"Minimum alpha for a pixel to count as content when computing the trimming bounds.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.force_width":
			"Specified pixel width.\n\nPixel + Auto: Uses this as a hint and starts fine search near it.\nPixel Only: Forces conversion to this size.\n\nRange: 1 to 1024 (Default: Auto)",
		"tooltip.help.force_height":
			"Specified pixel height.\n\nPixel + Auto: Uses this as a hint and starts fine search near it.\nPixel Only: Forces conversion to this size.\n\nRange: 1 to 1024 (Default: Auto)",
		"tooltip.help.fast_mode":
			"When ON, uses an efficient algorithm to speed up the search.\nWhen OFF, performs a more comprehensive and precise search.\n\nIf automatic detection results are misaligned or the image has a lot of noise/fine patterns, turning this OFF may improve accuracy.",
		"tooltip.help.shared_palette":
			"Reduces colors with a single palette shared by every image.\n\nA common palette is built from all processed images, limited to the color count setting, and reapplied to each image.\nUseful when colors must match across character variations or animation frames.",
		"tooltip.help.include_diagnostics":
			"Adds diagnostics.json to the ZIP download.\n\nIt records the input and output filenames, detected input type, processing route, confidence, and warning codes for each image.\nUseful for narrowing down images that need a second look after a large batch.",
		"tooltip.help.bg_method":
			"Select where to extract the background color from. When background transparency is enabled, transparent margins are also trimmed automatically; None preserves the full canvas.\n\nAuto: Estimates the background from the full image border.\nNone: No background removal.\nCorners: Uses the pixel at the specified corner as the background color.\nRGB: Uses the specified color as the background color.",
		"tooltip.help.bg_rgb":
			"Specify the color to be treated as the background in hex format (e.g., #ffffff).\nWhen a corner is specified, the color is automatically set. You can also pick a color from the image using the eyedropper button.",
		"tooltip.help.bg_tolerance":
			"The similarity (error range) for determining the background color.\n\nHigh: Can remove background even if colors are slightly distorted by compression noise, but may also remove intended colors.\nLow: Strictly removes only the exact background color, but noise may remain.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.pre_remove":
			"Ignores the background color BEFORE performing grid detection.\n\nBenefit: Makes it easier to correctly detect the grid for the main subject even in images with large margins.\nNote: If the background color exists within the character, detection accuracy may decrease.",
		"tooltip.help.post_remove":
			"Replaces the background color with transparency AFTER processing is complete.\n\nBenefit: Allows saving as a PNG with a transparent background.\nNote: Does not affect the grid detection process itself.",
		"tooltip.help.bg_removal_scope":
			"Range of background to make transparent.\n\nAuto: Outer background, plus enclosed holes that clearly match the background color.\nSelected only: Only background connected from the chosen corner.\nOuter all: All background connected to the image border.\nAll: Every area matching the background color, inner ones included.\n\nUnavailable when Background is Keep.",
		"tooltip.help.bg_connectivity":
			"Whether diagonal neighbors are considered connected.\n\n4-way: Strict (no diagonals).\n8-way: Includes diagonals.",
		"tooltip.help.gemini_watermark_removal":
			"After background transparency, automatically removes only an isolated bright Gemini diamond in the bottom-right corner. A mark touching the subject is kept.",
		"tooltip.help.small_component_mode":
			"Cleans isolated noise using restored logical pixels. Nearby, repeated, symmetric, outline-aligned, strongly edged, and highly opaque details are protected. Automatic removal is skipped when the background estimate is uncertain.",
		"tooltip.help.make_square":
			"Pads the image with transparent pixels to make it perfectly square.\n\nThe original content is placed in the center.",
		"tooltip.help.keep_aspect_ratio":
			"Pads the trimmed output with transparent pixels to preserve the original image's aspect ratio.\n\nUseful for maintaining sprite canvas proportions after trimming.",

		// 選択肢
		"option.none": "None",
		"option.mono": "Monochrome",
		"option.gb_legacy": "Game Boy (Original)",
		"option.gb_pocket": "Game Boy (Pocket)",
		"option.gb_light": "Game Boy (Light)",
		"option.pico8": "PICO-8",
		"option.nes": "NES",
		"option.pc98": "PC-9801",
		"option.msx": "MSX1",
		"option.c64": "Commodore 64",
		"option.arne16": "Arne 16",
		"option.sfc_sprite": "SFC Style (16 colors/Sprite)",
		"option.sfc_bg": "SFC Style (256 colors/BG)",
		"option.auto": "Custom Count",
		"option.fixed": "Fixed / Custom Palette",
		"option.dither_none": "None",
		"option.dither_floyd": "Floyd-Steinberg",
		"option.dither_bayer2": "Bayer 2x2",
		"option.dither_bayer4": "Bayer 4x4",
		"option.dither_bayer8": "Bayer 8x8",
		"option.dither_ordered": "Ordered",
		"option.outline_none": "None",
		"option.outline_rounded": "Rounded (8-way)",
		"option.outline_sharp": "Sharp (4-way)",
		"option.grid_mode_auto": "Auto (Default)",
		"option.grid_mode_hint": "Pixel + Auto",
		"option.grid_mode_force": "Pixel Only",
		"option.grid_mode_off": "Off",
		"option.bg_none": "None",
		"option.bg_auto": "Auto (Default)",
		"option.bg_scope_auto": "Auto",
		"option.bg_scope_selected": "Selected corner",
		"option.bg_scope_outer": "Outer only",
		"option.bg_scope_all": "Outer + inner",
		"option.bg_connectivity_4": "4-way (no diagonals)",
		"option.bg_connectivity_8": "8-way (with diagonals)",
		"option.gemini_watermark_auto": "Auto",
		"option.gemini_watermark_off": "Off",
		"option.small_component_off": "Off",
		"option.small_component_light": "Light (Keep Details)",
		"option.small_component_auto": "Auto",
		"option.small_component_strong": "Strong",
		"option.bg_top_left": "Top-Left",
		"option.bg_bottom_left": "Bottom-Left",
		"option.bg_top_right": "Top-Right",
		"option.bg_bottom_right": "Bottom-Right",
		"option.bg_rgb": "RGB Specification",

		// JS メッセージ
		"error.no_image": "Please select an image first.",
		"error.process_failed": "Processing failed",
		"error.load_failed": "Loading failed",
		"warning.low_grid_confidence":
			"Grid confidence is low. Please check the result.",
		"warning.background_uncertain": "The background detection is uncertain.",
		"warning.background_removal_skipped":
			"Background removal was skipped because too much would have been removed.",
		"warning.content_loss_risk":
			"Processing may have removed a large amount of content.",
		"warning.one_axis_detection_failed":
			"The grid could not be detected on one axis.",
		"warning.extreme_output_size": "The output size is extremely large.",
		"warning.no_content": "No processable content was detected.",
		"warning.fallback_to_preserve":
			"The original size was preserved for safety.",
		"warning.batch_partial_failure":
			"{failed} of {total} images could not be processed. Successful images are included in the ZIP.",
		"warning.pending_partial_failure":
			"{failed} of {total} images could not be converted. Check the image list to see which ones.",
		"warning.unknown": "Unknown processing warning ({code}).",

		"error.palette_limit":
			"Warning: The image contains {count} colors. Palette will be limited to 256 colors.",
		"error.no_processed_images": "No processed images available to download.",
		"error.download_failed": "Download failed",
		"status.processing": "Processing...",
		"status.processing_batch": "Batch Processing... ({current}/{total})",

		// 属性とタイトル
		"attr.title.bg_checkered": "Background: Checkered",
		"attr.title.bg_white": "Background: White",
		"attr.title.bg_black": "Background: Black",
		"attr.title.bg_green": "Background: Green",
		"attr.title.grid_toggle": "Show Grid (Zoom only)",
		"attr.title.zoom_toggle": "Zoom Output",
		"attr.title.eyedropper": "Pick color from image",
		"attr.aria.background_color": "Background color",
		"attr.aria.theme_toggle": "Toggle color theme",
		"attr.placeholder.auto": "Auto",

		// モーダル
		"modal.eyedropper.title": "Select Background Color",
		"modal.eyedropper.instruction":
			"Click on the color in the image you want to set as background",

		// フッター
		"footer.privacy": "Images are processed safely within your browser",
		"footer.qualityReport": "Quality report",

		// AI画像生成レシピ集（guide.html）
		"guide.page_title": "Prompt Recipes | Pixel Refiner",
		"guide.page_name": "Prompt Recipes",
		"guide.subtitle":
			"How to create input images that convert cleanly into pixel art",
		"guide.back_to_app": "Back to Pixel Refiner",
		"guide.copy_prompt": "Copy prompt",
		"guide.copied": "Copied",
		"guide.intro.heading": "Before You Start: The Idea",
		"guide.intro.body1":
			"Pixel Refiner can automatically fix blurred pixels, misaligned grids, and too many colors. Problems that come from the generated image itself, however, cannot be fixed at the conversion stage.",
		"guide.intro.body2":
			"This page collects prompts that <strong>prevent the unfixable problems while the image is being generated</strong>.",
		"guide.intro.fixable_heading":
			"What the tool can fix (no need to worry when generating)",
		"guide.intro.fixable_1": "Blurred pixels and anti-aliasing",
		"guide.intro.fixable_2":
			"Uneven scaling of pixel size and misaligned grids",
		"guide.intro.fixable_3":
			"Too many colors (color reduction and palette conversion)",
		"guide.intro.fixable_4": "Background transparency for flat backgrounds",
		"guide.intro.unfixable_heading":
			"What the tool cannot fix (prevent it when generating)",
		"guide.intro.unfixable_1":
			"The background color also appears inside the subject",
		"guide.intro.unfixable_2":
			"The subject is cropped at the edge of the image",
		"guide.intro.unfixable_3": "Shadows, glows, and soft shadows",
		"guide.intro.unfixable_4": "A slight tilt across the whole image",
		"guide.intro.unfixable_5": "Several subjects packed into one image",
		"guide.blur.heading": "Zoom In and the Generated Image Is Blurred",
		"guide.blur.body1":
			"From a distance a generated image looks like pixel art, but zoom in and the edge of a single dot fades over several pixels, and the color drifts within one dot. Image models do not follow the pixel grid exactly, so a generated image is hard to use as an asset as it is: put it in a game or a UI and the outlines look soft.",
		"guide.blur.body2":
			"Pixel Refiner snaps these blurred dots back onto a grid and repaints each dot in a single color. The recipes below are about generating images that are easy to snap back.",
		"guide.blur.view_whole": "Whole image",
		"guide.blur.view_detail": "Detail (4× of the original pixels)",
		"guide.blur.whole_alt":
			"A generated knight sprite that looks like pixel art at a glance",
		"guide.blur.zoom_alt":
			"Close-up of the top left of the helmet: every dot edge fades over several pixels",
		"guide.blur.caption":
			"The same generated image. On the right, 80×80 pixels from the top left of the helmet are enlarged 4×: the boundary between dots is smeared, and intermediate colors appear between the background and the outline.",
		"guide.principles.heading": "Five Basic Principles",
		"guide.principles.p1_heading":
			"Principle 1: Use a flat, saturated background color that never appears in the subject",
		"guide.principles.p1_body":
			"When the background color also appears in the subject — a character with white eyes on a white background, for example — background transparency can eat into the subject. Pick a hue far from the subject: green (#00FF00) for warm-colored subjects, magenta (#FF00FF) for green ones.",
		"guide.principles.p2_heading":
			"Principle 2: No drop shadows, glows, or soft shadows",
		"guide.principles.p2_body":
			"The semi-transparent gradient between the subject and the background leaves a fringe or discolors the outline once the background is removed.",
		"guide.principles.p3_heading":
			"Principle 3: Keep the subject uncropped and leave a margin",
		"guide.principles.p3_body":
			"When the subject touches the edge of the image, background estimation breaks down. Compose so the whole subject fits with margin around it.",
		"guide.principles.p4_heading": "Principle 4: Do not tilt the image",
		"guide.principles.p4_body":
			"Images whose pixel grid is slightly tilted are hard to handle. Ask for a straight composition at generation time.",
		"guide.principles.p5_heading":
			"Principle 5: One subject per image, with a uniform pixel size",
		"guide.principles.p5_body":
			"Sheets that pack several sprites into one image, or images whose pixel size varies from place to place, confuse grid detection.",
		"guide.principles.no_effort_heading":
			"What you do not need to work hard for",
		"guide.principles.no_effort_body":
			"You do not need to remove anti-aliasing completely, or to land on exactly 32×32 pixels, at the generation stage. Even when an instruction such as <code>32x32 pixel art</code> is not followed literally, it still pushes the model toward larger, more uniform pixels, so it is worth including.",
		"guide.recipes.heading": "Recipes",
		"guide.recipes.intro":
			"Each recipe shows a prompt, the image it generated, the Pixel Refiner settings, and the converted result. Each example was generated with the shown prompt and converted with the shown settings.",
		"guide.recipes.goal_label": "Goal",
		"guide.recipes.settings_label": "Pixel Refiner settings",
		"guide.recipes.caption_input": "Generated image (sample)",
		"guide.recipes.scale_actual": "Actual size (1×)",
		"guide.recipes.scale_zoomed": "Enlarged (4×)",
		"guide.recipes.caption_output": "Converted result (sample)",
		"guide.recipe1.heading": "Recipe 1: Game character sprite",
		"guide.recipe1.goal":
			"The basic form of a transparent asset. The themes are how to choose the background color (a warm-colored character against a magenta background) and leaving margin so the subject is never cropped.",
		"guide.recipe1.settings":
			"Leave Preset on “Best Match” (the background is made transparent automatically).",
		"guide.recipe1.input_alt":
			"Generated image for recipe 1: a knight sprite with a sword and shield on a magenta background",
		"guide.recipe1.output_alt":
			"Converted result for recipe 1: the knight sprite with a transparent background",
		"guide.recipe1.caption_input":
			"Generated image (2048×2048 px, shown scaled down)",
		"guide.recipe1.caption_output":
			"Converted result (Best Match, 60×85 px output)",
		"guide.recipe2.heading": "Recipe 2: Item icon",
		"guide.recipe2.goal":
			"A single object for UI use. Pairing a red subject with a green background makes the two easy to separate for clean background removal.",
		"guide.recipe2.settings":
			"Choose the “Transparent Icon” preset. It removes the background and reduces the image to 32 colors.",
		"guide.recipe2.input_alt":
			"Generated image for recipe 2: a red potion bottle on a bright green background",
		"guide.recipe2.output_alt":
			"Converted result for recipe 2: the potion bottle with a transparent background",
		"guide.recipe2.caption_input":
			"Generated image (2752×1536 px, shown scaled down)",
		"guide.recipe2.caption_output":
			"Converted result (Transparent Icon, 16×23 px output)",
		"guide.recipe3.heading": "Recipe 3: Retro handheld look (Game Boy palette)",
		"guide.recipe3.goal":
			"Ask for few tones at the generation stage, then let palette conversion map them exactly onto the four tones of the console you choose. The generated colors themselves do not survive, so the background is specified for easy removal — red against a green subject — rather than for the finished look.",
		"guide.recipe3.settings":
			"In Quick Settings, set Colors to “Game Boy (Pocket)”. Leave the rest as they are; the background is made transparent automatically.",
		"guide.recipe3.input_alt":
			"Generated image for recipe 3: a green dragon on a red background",
		"guide.recipe3.output_alt":
			"Converted result for recipe 3: the dragon in four shades of gray with a transparent background",
		"guide.recipe3.caption_input":
			"Generated image (2816×1536 px, shown scaled down)",
		"guide.recipe3.caption_output":
			"Converted result (Game Boy (Pocket), 44×47 px output)",
		"guide.recipe4.heading": "Recipe 4: Scenery for a background",
		"guide.recipe4.goal":
			"A case without transparency. A landscape with no characters or props is turned into pixel art you can use as a background as it is. The key is asking for few elements and large pixels.",
		"guide.recipe4.settings":
			"In Quick Settings, set Background to “Keep background” (Finish can stay on “Best Match”).",
		"guide.recipe4.input_alt":
			"Generated image for recipe 4: green fields and blue mountains beneath a bright sky",
		"guide.recipe4.output_alt":
			"Converted result for recipe 4: the mountain landscape kept as a full-frame background",
		"guide.recipe4.caption_input":
			"Generated image (2752×1536 px, shown scaled down)",
		"guide.recipe4.caption_output":
			"Converted result (Best Match + Keep background, 256×144 px output)",
		"guide.recipe5.heading":
			"Recipe 5: Turn a normal illustration into pixel art",
		"guide.recipe5.goal":
			"Even with models or styles that cannot generate pixel art directly, an ordinary illustration can be converted into pixel art. Flat coloring and thick outlines survive the conversion well, so ask for them instead of asking for pixel art.",
		"guide.recipe5.settings":
			"In Quick Settings, set Finish to “Detailed Pixel Art” and Colors to “32 colors”. Use Pixel Detail to make the pixels coarser or finer.",
		"guide.recipe5.input_alt":
			"Generated image for recipe 5: a chibi character in flat colors on a blue background",
		"guide.recipe5.output_alt":
			"Converted result for recipe 5: the chibi character redrawn as pixel art with a transparent background",
		"guide.recipe5.caption_input":
			"Generated image (2816×1536 px, shown scaled down)",
		"guide.recipe5.caption_output":
			"Converted result (Detailed Pixel Art + 32 colors, 60×81 px output)",
		"guide.troubleshooting.heading": "When It Does Not Work",
		"guide.troubleshooting.col_symptom": "Symptom",
		"guide.troubleshooting.col_cause": "Cause",
		"guide.troubleshooting.col_fix": "How to fix the prompt",
		"guide.troubleshooting.r1_symptom":
			"Holes appear in the whites of the character's eyes",
		"guide.troubleshooting.r1_cause":
			"The background color also appears inside the subject",
		"guide.troubleshooting.r1_fix":
			"Switch the background to a saturated color that never appears in the subject (for example <code>full frame edge-to-edge solid magenta background</code>)",
		"guide.troubleshooting.r2_symptom":
			"A fringe of background color remains or bleeds around the outline",
		"guide.troubleshooting.r2_cause": "A shadow or glow surrounds the subject",
		"guide.troubleshooting.r2_fix":
			"Add <code>no drop shadow, no outer glow, flat lighting</code>",
		"guide.troubleshooting.r3_symptom":
			"The output is far too small, or pixels collapse",
		"guide.troubleshooting.r3_cause":
			"Pixel size is not uniform within the image",
		"guide.troubleshooting.r3_fix":
			"Add <code>consistent pixel size throughout</code>. If the result chooser appears, compare the candidates and pick one",
		"guide.troubleshooting.r4_symptom":
			"Outlines ripple with jagged steps or run diagonally",
		"guide.troubleshooting.r4_cause": "The generated image is slightly tilted",
		"guide.troubleshooting.r4_fix":
			"Add <code>upright, straight-on</code> and generate again",
		"guide.troubleshooting.r5_symptom": "The edge of the subject is missing",
		"guide.troubleshooting.r5_cause":
			"The subject is cropped at the edge of the image",
		"guide.troubleshooting.r5_fix":
			"Add <code>full body, centered, with margin, not cropped</code>",
		"guide.notes.heading": "Notes",
		"guide.notes.body":
			"The samples were generated with Google Gemini (Nano Banana 2). How well a prompt works depends on the model and its version. When the result is not what you intended, vary the wording a little, generate several times, and pick the one image that matches the principles on this page.",
	},
};

type ResourceKey = keyof (typeof resources)["en"];

export class I18nManager {
	currentLang: Language = "en";

	constructor() {
		// localStorage が存在しない可能性がある環境（Vitest/Node など）を処理
		let saved: string | null = null;
		try {
			if (typeof localStorage !== "undefined") {
				saved = localStorage.getItem("pixel-refiner-lang");
			}
		} catch (_e) {
			// セキュリティエラーまたは localStorage 未存在を無視
		}

		this.currentLang = isLanguage(saved) ? saved : detectBrowserLanguage();
	}

	setLanguage(lang: Language) {
		this.currentLang = lang;
		try {
			if (typeof localStorage !== "undefined") {
				localStorage.setItem("pixel-refiner-lang", lang);
			}
		} catch (_e) {
			// 無視
		}
		this.updatePage();
	}

	// キーからテキストを取得
	t(key: ResourceKey, params?: Record<string, string | number>): string {
		const text = resources[this.currentLang][key] || key;
		if (params) {
			let interpolated = text;
			for (const [k, v] of Object.entries(params)) {
				interpolated = interpolated.replace(
					new RegExp(`\\{${k}\\}`, "g"),
					String(v),
				);
			}
			return interpolated;
		}
		return text;
	}

	// ページ全体の更新
	updatePage() {
		if (typeof document === "undefined") return;

		// 1. テキストコンテンツの更新 (innerHTML を使用してタグを維持)
		document.querySelectorAll("[data-i18n]").forEach((el) => {
			const key = el.getAttribute("data-i18n") as ResourceKey;
			if (key) {
				const text = this.t(key);
				if (el.hasAttribute("data-i18n-html")) {
					el.innerHTML = text;
				} else {
					el.textContent = text;
				}
			}
		});

		// 2. 属性の更新 (placeholder, titleなど)
		document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
			const config = el.getAttribute("data-i18n-attr");
			if (!config) return;

			for (const pair of config.split(",")) {
				const [attr, key] = pair.split(":");
				el.setAttribute(attr, this.t(key as ResourceKey));
			}
		});

		// htmlタグのlang属性更新
		document.documentElement.lang = this.currentLang;

		// 言語切り替えボタンのアクティブ状態更新
		document.querySelectorAll("[data-lang-btn]").forEach((el) => {
			const lang = el.getAttribute("data-lang-btn");
			el.classList.toggle("active", lang === this.currentLang);
		});
	}
}

export const i18n = new I18nManager();
