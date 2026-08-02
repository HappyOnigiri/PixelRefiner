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
		"ui.pixel_size": "ピクセルサイズ",
		"ui.select_size_title": "変更するサイズを選択",
		"ui.select_size_note":
			"※推定値です。選択したサイズを参考に最適なグリッドを再判定します。",
		"ui.change_to_this_size": "このサイズに変更",
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

		// 設定
		"setting.color_reduction": "減色",
		"setting.color_mode": "減色モード",
		"setting.color_count": "色数",
		"setting.dither_mode": "ディザリング",
		"setting.dither_strength": "ディザリング強度 (%)",
		"setting.advanced": "詳細設定",
		"setting.grid_detection": "グリッド検出",
		"setting.grid_mode": "グリッド検出モード",
		"setting.quant_step": "減色段階",
		"setting.sample_window": "サンプル対象範囲",
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

		"setting.floating_max": "浮きノイズ上限(%)",
		"setting.trimming": "トリミング",
		"setting.auto_trim": "自動トリム",
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
			"各ドットの色を決める際の参照範囲（ピクセル数）です。\n\n【大】ノイズが除去され色が安定しますが、細部のディテールが失われやすくなります。\n【小】元画像を忠実に再現しますが、位置ズレやノイズの影響を強く受けます。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.force_width":
			"指定ピクセル（横）です。\n\nピクセル指定 + 自動検出: この値をヒントに精密探索を開始します。\n完全ピクセル指定: この値に強制変換します。\n\n設定範囲: 1〜1024 (デフォルト: 自動)",
		"tooltip.help.force_height":
			"指定ピクセル（縦）です。\n\nピクセル指定 + 自動検出: この値をヒントに精密探索を開始します。\n完全ピクセル指定: この値に強制変換します。\n\n設定範囲: 1〜1024 (デフォルト: 自動)",
		"tooltip.help.fast_mode":
			"ONにすると、効率的なアルゴリズムで探索を高速化します。\nOFFにすると、より広範囲を精密に探索します。\n\n自動検出の結果がズレる場合や、ノイズ・細かい模様が多い画像では、OFFにすると精度が向上します。",
		"tooltip.help.bg_method":
			"背景色をどこから抽出するか選択します。\n\n透過しない: 背景透過を行いません。\n各四隅: 指定した角のピクセルを背景色とします。\nRGB指定: 指定した色を背景色とします。",
		"tooltip.help.bg_rgb":
			"背景色として扱う色を16進数(例: #ffffff)で指定します。\n四隅指定時は自動で色がセットされます。スポイトボタンで画像から色を選択することもできます。",
		"tooltip.help.bg_tolerance":
			"背景色と判定する色の類似度（誤差範囲）です。\n\n【大】圧縮ノイズなどで色が多少ブレていても背景として透過できますが、必要な色まで消える可能性があります。\n【小】厳密に背景色のみを透過しますが、ノイズが残りやすくなります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.pre_remove":
			"グリッド検出を行う【前】に、背景色を無視します。\n\nメリット: 余白が広い画像でも、本体部分のグリッドを正しく検出しやすくなります。\n注意: 背景と同じ色がキャラクター内にある場合、検出精度が下がる可能性があります。",
		"tooltip.help.post_remove":
			"処理完了【後】に、背景色を透明に置き換えて出力します。\n\nメリット: 背景透明のPNGとして保存できます。\n注意: グリッド検出処理自体には影響しません。",
		"tooltip.help.bg_removal_scope":
			"背景をどこまで透過するかの範囲です。\n\n選択部分のみ: 選択した角から繋がる背景だけ透過。\n外側全部: 画像の外周に繋がる背景をすべて透過。\n全領域: 外側に加え、ドーナツ穴などの内側も透過。",
		"tooltip.help.bg_connectivity":
			"「繋がっている」の判定方法です。\n\n4方向: 斜めを含めない厳しい判定。\n8方向: 斜めも繋がりとみなします。",
		"tooltip.help.floating_max":
			"背景に囲まれて浮きノイズとみなす最大面積（元画像の総ピクセル数に対する割合）です。\n0%のときは浮きノイズ除去を行いません。\n例: 1% → (幅×高さ×0.01) px\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.auto_trim":
			"出力後に内容物が存在する範囲で自動的にトリミング（余白削除）を行います。\n\n余白（背景）が大きい画像に対して、これをONにすることで正しい縦横のマス数が検出されやすくなります。",
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
		"option.bg_scope_selected": "選択した角から繋がる部分のみ",
		"option.bg_scope_outer": "外周に繋がる部分すべて",
		"option.bg_scope_all": "外周＋内側（穴）も含む",
		"option.bg_connectivity_4": "4方向（斜めなし）",
		"option.bg_connectivity_8": "8方向（斜め含む）",
		"option.bg_top_left": "左上（デフォルト）",
		"option.bg_bottom_left": "左下",
		"option.bg_top_right": "右上",
		"option.bg_bottom_right": "右下",
		"option.bg_rgb": "RGB指定",

		// JS メッセージ
		"error.no_image": "先に画像を選択してください。",
		"error.process_failed": "処理失敗",
		"error.load_failed": "読み込み失敗",
		"info.grid_updated": "グリッドサイズを {w}x{h} に更新しました",
		"warning.low_grid_confidence":
			"グリッド判定の信頼度が低いため、結果を確認してください。",
		"warning.background_uncertain": "背景の判定が不確かです。",
		"warning.content_loss_risk":
			"処理によって内容が大きく失われた可能性があります。",
		"warning.one_axis_detection_failed":
			"片方向のグリッドを検出できませんでした。",
		"warning.extreme_output_size": "出力サイズが非常に大きくなっています。",
		"warning.no_content": "処理対象の内容を検出できませんでした。",
		"warning.fallback_to_preserve": "安全のため元のサイズを維持しました。",
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
		"attr.placeholder.auto": "自動",

		// モーダル
		"modal.eyedropper.title": "背景色を選択",
		"modal.eyedropper.instruction":
			"画像内の背景にしたい色をクリックしてください",

		// フッター
		"footer.privacy": "画像はブラウザ内で安全に処理されます",
	},
	"zh-CN": {
		// UI 見出しとラベル
		"app.title": "Pixel Refiner | AI 像素画优化与背景透明工具",
		"app.description":
			'将 AI 生成的像素画优化为可直接用于<span class="text-highlight">素材</span>和<span class="text-highlight">图标</span>的品质。<br />' +
			'数秒内完成<span class="text-highlight">抗锯齿清理</span>和<span class="text-highlight">背景透明化</span>。',
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
		"ui.pixel_size": "像素尺寸",
		"ui.select_size_title": "选择要切换的尺寸",
		"ui.select_size_note":
			"*以下为估算值。选择后会根据该尺寸重新判定最佳网格。",
		"ui.change_to_this_size": "切换到此尺寸",
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

		// 設定
		"setting.color_reduction": "减色",
		"setting.color_mode": "减色模式",
		"setting.color_count": "颜色数量",
		"setting.dither_mode": "抖动",
		"setting.dither_strength": "抖动强度 (%)",
		"setting.advanced": "高级设置",
		"setting.grid_detection": "网格检测",
		"setting.grid_mode": "网格检测模式",
		"setting.quant_step": "量化步长",
		"setting.sample_window": "采样范围",
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

		"setting.floating_max": "漂浮噪点上限 (%)",
		"setting.trimming": "裁剪",
		"setting.auto_trim": "自动裁剪",
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
			"决定每个像素块颜色时参考的范围（像素数）。\n\n高：噪点更容易被去除，颜色更稳定，但细节更容易丢失。\n低：更忠实于原图，但更容易受错位和噪点影响。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.force_width":
			"指定像素宽度。\n\n像素指定 + 自动检测：用该值作为提示并在附近精细搜索。\n完全像素指定：强制转换为该宽度。\n\n范围：1 到 1024 (默认：自动)",
		"tooltip.help.force_height":
			"指定像素高度。\n\n像素指定 + 自动检测：用该值作为提示并在附近精细搜索。\n完全像素指定：强制转换为该高度。\n\n范围：1 到 1024 (默认：自动)",
		"tooltip.help.fast_mode":
			"开启后使用更高效的算法加快搜索。\n关闭后会进行更大范围、更精细的搜索。\n\n如果自动检测结果错位，或图片包含大量噪点和细碎纹理，关闭后可能提高准确度。",
		"tooltip.help.bg_method":
			"选择从哪里提取背景色。\n\n无：不移除背景。\n四角：使用指定角落的像素作为背景色。\nRGB：使用指定颜色作为背景色。",
		"tooltip.help.bg_rgb":
			"用十六进制格式指定要视为背景的颜色（例如 #ffffff）。\n选择四角时会自动填入颜色。也可以用吸管按钮从图片中取色。",
		"tooltip.help.bg_tolerance":
			"判断背景色相似度的误差范围。\n\n高：即使背景因压缩噪点产生轻微偏差也能移除，但可能误删需要保留的颜色。\n低：只移除更接近精确背景色的颜色，但可能残留噪点。\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.pre_remove":
			"在网格检测前忽略背景色。\n\n优点：图片留白较大时，更容易正确检测主体网格。\n注意：如果角色内部也有背景同色区域，检测准确度可能下降。",
		"tooltip.help.post_remove":
			"处理完成后将背景色替换为透明。\n\n优点：可以保存为透明背景 PNG。\n注意：不会影响网格检测过程本身。",
		"tooltip.help.bg_removal_scope":
			"决定背景透明化的范围。\n\n仅选中部分：只透明化从所选角落连通的背景。\n外侧全部：透明化所有与图片边缘连通的背景。\n全区域：外侧背景加上内部孔洞也一起透明化。",
		"tooltip.help.bg_connectivity":
			"决定相邻区域是否算作连通。\n\n4 方向：更严格，不包含斜向。\n8 方向：包含斜向相邻。",
		"tooltip.help.floating_max":
			"被视为漂浮噪点并移除的最大面积，占原图总像素数的百分比。\n设为 0% 时不移除漂浮噪点。\n示例：1% -> (宽度 x 高度 x 0.01) px\n\n范围：{min} 到 {max} (默认：{default})",
		"tooltip.help.auto_trim":
			"处理后自动裁剪到包含内容的范围。\n\n对于留白（背景）较大的图片，开启后更容易检测到正确的横纵格数。",
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
		"option.bg_scope_selected": "仅从所选角落连通的部分",
		"option.bg_scope_outer": "所有与外边缘连通的部分",
		"option.bg_scope_all": "外侧 + 内部孔洞",
		"option.bg_connectivity_4": "4 方向（不含斜向）",
		"option.bg_connectivity_8": "8 方向（含斜向）",
		"option.bg_top_left": "左上（默认）",
		"option.bg_bottom_left": "左下",
		"option.bg_top_right": "右上",
		"option.bg_bottom_right": "右下",
		"option.bg_rgb": "RGB 指定",

		// JS メッセージ
		"error.no_image": "请先选择图片。",
		"error.process_failed": "处理失败",
		"error.load_failed": "加载失败",
		"info.grid_updated": "网格尺寸已更新为 {w}x{h}",
		"warning.low_grid_confidence": "网格判断可信度较低，请检查结果。",
		"warning.background_uncertain": "背景判断存在不确定性。",
		"warning.content_loss_risk": "处理可能导致大量内容丢失。",
		"warning.one_axis_detection_failed": "无法检测一个方向的网格。",
		"warning.extreme_output_size": "输出尺寸非常大。",
		"warning.no_content": "未检测到可处理的内容。",
		"warning.fallback_to_preserve": "为安全起见，已保留原始尺寸。",
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
		"attr.placeholder.auto": "自动",

		// モーダル
		"modal.eyedropper.title": "选择背景色",
		"modal.eyedropper.instruction": "点击图片中要作为背景的颜色",

		// フッター
		"footer.privacy": "图片会在浏览器内安全处理",
	},
	en: {
		// UI 見出しとラベル
		"app.title": "Pixel Refiner | AI Pixel Art Optimizer & Background Remover",
		"app.description":
			'Optimize AI-generated pixel art into <span class="text-highlight">high-quality assets</span> and <span class="text-highlight">icons</span>.<br />' +
			'Complete <span class="text-highlight">anti-aliasing removal</span> and <span class="text-highlight">background transparency</span> in seconds.',
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
		"ui.pixel_size": "Pixel Size",
		"ui.select_size_title": "Select size to change",
		"ui.select_size_note":
			"*Estimated values. The grid will be re-evaluated based on your selection.",
		"ui.change_to_this_size": "Change to this size",
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

		// 設定
		"setting.color_reduction": "Color Reduction",
		"setting.color_mode": "Reduction Mode",
		"setting.color_count": "Color Count",
		"setting.dither_mode": "Dithering",
		"setting.dither_strength": "Dither Strength (%)",
		"setting.advanced": "Advanced Settings",
		"setting.grid_detection": "Grid Detection",
		"setting.grid_mode": "Grid Detection Mode",
		"setting.quant_step": "Quantization Step",
		"setting.sample_window": "Sample Window",
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

		"setting.floating_max": "Max Noise Size (%)",
		"setting.trimming": "Trimming",
		"setting.auto_trim": "Auto Trim",
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
			"The reference range (in pixels) used when determining the color of each dot.\n\nHigh: Noise is removed and colors become stable, but fine details may be lost.\nLow: Faithfully reproduces the original image, but is more affected by misalignment and noise.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.force_width":
			"Specified pixel width.\n\nPixel + Auto: Uses this as a hint and starts fine search near it.\nPixel Only: Forces conversion to this size.\n\nRange: 1 to 1024 (Default: Auto)",
		"tooltip.help.force_height":
			"Specified pixel height.\n\nPixel + Auto: Uses this as a hint and starts fine search near it.\nPixel Only: Forces conversion to this size.\n\nRange: 1 to 1024 (Default: Auto)",
		"tooltip.help.fast_mode":
			"When ON, uses an efficient algorithm to speed up the search.\nWhen OFF, performs a more comprehensive and precise search.\n\nIf automatic detection results are misaligned or the image has a lot of noise/fine patterns, turning this OFF may improve accuracy.",
		"tooltip.help.bg_method":
			"Select where to extract the background color from.\n\nNone: No background removal.\nCorners: Uses the pixel at the specified corner as the background color.\nRGB: Uses the specified color as the background color.",
		"tooltip.help.bg_rgb":
			"Specify the color to be treated as the background in hex format (e.g., #ffffff).\nWhen a corner is specified, the color is automatically set. You can also pick a color from the image using the eyedropper button.",
		"tooltip.help.bg_tolerance":
			"The similarity (error range) for determining the background color.\n\nHigh: Can remove background even if colors are slightly distorted by compression noise, but may also remove intended colors.\nLow: Strictly removes only the exact background color, but noise may remain.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.pre_remove":
			"Ignores the background color BEFORE performing grid detection.\n\nBenefit: Makes it easier to correctly detect the grid for the main subject even in images with large margins.\nNote: If the background color exists within the character, detection accuracy may decrease.",
		"tooltip.help.post_remove":
			"Replaces the background color with transparency AFTER processing is complete.\n\nBenefit: Allows saving as a PNG with a transparent background.\nNote: Does not affect the grid detection process itself.",
		"tooltip.help.bg_removal_scope":
			"Range of background to make transparent.\n\nSelected only: Only background connected from the chosen corner.\nOuter all: All background connected to the image border.\nAll: Outer + inner holes (e.g. donut hole).",
		"tooltip.help.bg_connectivity":
			"Whether diagonal neighbors are considered connected.\n\n4-way: Strict (no diagonals).\n8-way: Includes diagonals.",
		"tooltip.help.floating_max":
			"The maximum area (as a percentage of the total pixels in the original image) to be considered for removal as floating noise.\nWhen set to 0%, floating noise removal is skipped.\nExample: 1% → (Width × Height × 0.01) px\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.auto_trim":
			"Automatically trims the output to fit the range containing the content.\n\nUseful for correctly detecting the number of vertical and horizontal cells in images with large margins (background).",
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
		"option.bg_scope_selected": "Selected corner only",
		"option.bg_scope_outer": "Outer (border-connected)",
		"option.bg_scope_all": "Outer + inner holes",
		"option.bg_connectivity_4": "4-way (no diagonals)",
		"option.bg_connectivity_8": "8-way (with diagonals)",
		"option.bg_top_left": "Top-Left (Default)",
		"option.bg_bottom_left": "Bottom-Left",
		"option.bg_top_right": "Top-Right",
		"option.bg_bottom_right": "Bottom-Right",
		"option.bg_rgb": "RGB Specification",

		// JS メッセージ
		"error.no_image": "Please select an image first.",
		"error.process_failed": "Processing failed",
		"error.load_failed": "Loading failed",
		"info.grid_updated": "Grid updated to {w}x{h}",
		"warning.low_grid_confidence":
			"Grid confidence is low. Please check the result.",
		"warning.background_uncertain": "The background detection is uncertain.",
		"warning.content_loss_risk":
			"Processing may have removed a large amount of content.",
		"warning.one_axis_detection_failed":
			"The grid could not be detected on one axis.",
		"warning.extreme_output_size": "The output size is extremely large.",
		"warning.no_content": "No processable content was detected.",
		"warning.fallback_to_preserve":
			"The original size was preserved for safety.",
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
		"attr.placeholder.auto": "Auto",

		// モーダル
		"modal.eyedropper.title": "Select Background Color",
		"modal.eyedropper.instruction":
			"Click on the color in the image you want to set as background",

		// フッター
		"footer.privacy": "Images are processed safely within your browser",
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
