type Language = "ja" | "en";

const resources = {
	ja: {
		// UI Headings & Labels
		"app.title": "Pixel Refiner | AIドット絵の最適化・背景透過ツール",
		"app.description":
			'AIで生成したドット絵を、<span class="text-highlight">ゲーム素材</span>として使えるクオリティに。<br />' +
			'<span class="text-highlight">アンチエイリアス除去</span>・<span class="text-highlight">背景透過</span>を数秒で完了します。',
		"section.input": "入力画像",
		"section.result": "処理結果",
		"section.palette": "パレット",
		"ui.process_btn": "処理を実行",
		"ui.auto_process": "自動",
		"ui.download_btn": "ダウンロード",
		"ui.export_gpl": ".GPLを書き出し",
		"ui.export_png": ".PNGを書き出し",
		"ui.import_palette": "パレットを読み込み",
		"ui.show_palette": "パレットを表示",
		"ui.size": "サイズ",
		"ui.placeholder.input":
			'画像をここにドラッグ＆ドロップ<br /><span class="drop-subtext">または クリックして選択</span>',
		"ui.placeholder.result": "処理結果がここに表示されます",

		// Settings
		"setting.color_reduction": "減色",
		"setting.color_mode": "減色モード",
		"setting.color_count": "色数",
		"setting.dither_mode": "ディザリング",
		"setting.dither_strength": "ディザリング強度 (%)",
		"setting.advanced": "詳細設定",
		"setting.grid_detection": "グリッド検出",
		"setting.enable_grid": "グリッド検出有効",
		"setting.quant_step": "減色ステップ",
		"setting.sample_window": "サンプル範囲",
		"setting.force_width": "指定ピクセル(横)",
		"setting.force_height": "指定ピクセル(縦)",
		"setting.fast_mode": "高速モード",
		"setting.bg_removal": "背景透過",
		"setting.enable_bg_removal": "背景透過有効",
		"setting.bg_method": "背景抽出方法",
		"setting.bg_rgb": "背景色(RGB)",
		"setting.bg_tolerance": "背景色の許容差",
		"setting.pre_remove": "事前の背景透過",
		"setting.post_remove": "事後の背景透過",
		"setting.remove_inner": "内側の背景も透過",

		"setting.floating_max": "浮きノイズ上限(%)",
		"setting.trimming": "トリミング",
		"setting.auto_trim": "自動トリム",
		"setting.processing": "処理",
		"setting.auto_process": "自動変換",
		"tooltip.help.auto_process":
			"設定変更時に自動で処理を実行します。\n\nOFFにすると、手動で「処理を実行」ボタンをクリックする必要があります。",

		// Tooltips
		"tooltip.help.color_mode":
			"出力結果の色数を制限します。\n\nドット絵らしい色使いに整えたい場合に有効です。\n無効: 減色を行いません。\nGame Boy / PICO-8 / NES: 各ゲーム機のパレットを使用します。\n色数指定 (Auto): 指定した色数に自動で減色します。",
		"tooltip.help.color_count":
			"出力する最大の色数を指定します。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.dither_strength":
			"減色時にディザリング（誤差拡散）を適用します。\n\n100%: 完全な誤差拡散を行います。\n0%: ディザリングを行わず、最も近い色に丸めます。\n\n少ない色数でも滑らかなグラデーションを表現できますが、ドット絵特有のザラつきが発生します。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.enable_grid":
			"入力画像からグリッドを自動検出し、ドット単位に縮小・最適化します。\n\nOFFにすると、グリッド検出と縮小をスキップします（既に等倍のドット絵である場合に有効です）。背景トリミングや背景透過は、他の設定に従って引き続き実行されます。",
		"tooltip.help.quant_step":
			"グリッド検出用の減色レベルを設定します。\n\n【大】色がまとまりノイズに強くなりますが、微妙な色の違いが消える場合があります。\n【小】色の境界を細かく拾いますが、ノイズを誤検出するリスクが高まります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.sample_window":
			"各ドットの色を決める際の参照範囲（ピクセル数）です。\n\n【大】ノイズが除去され色が安定しますが、細部のディテールが失われやすくなります。\n【小】元画像を忠実に再現しますが、位置ズレやノイズの影響を強く受けます。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.force_width":
			"指定サイズに強制変換します。\n指定ピクセルが有効なときは自動検出は行いません。\n\n設定範囲: 1〜1024 (デフォルト: 自動)",
		"tooltip.help.force_height":
			"指定サイズに強制変換します。\n指定ピクセルが有効なときは自動検出は行いません。\n\n設定範囲: 1〜1024 (デフォルト: 自動)",
		"tooltip.help.fast_mode":
			"ONにすると、効率的なアルゴリズムで探索を高速化します。\nOFFにすると、より広範囲を精密に探索します。\n\n自動検出の結果がズレる場合や、ノイズ・細かい模様が多い画像では、OFFにすると精度が向上します。",
		"tooltip.help.enable_bg_removal":
			"背景透過処理を有効にします。\n\nOFFにすると、背景透過に関する全ての設定が無効になり、背景はそのまま維持されます。",
		"tooltip.help.bg_method":
			"背景色をどこから抽出するか選択します。\n\n各四隅: 指定した角のピクセルを背景色とします。\nRGB指定: 指定した色を背景色とします。",
		"tooltip.help.bg_rgb":
			"背景色として扱う色を16進数(例: #ffffff)で指定します。\n四隅指定時は自動で色がセットされます。スポイトボタンで画像から色を選択することもできます。",
		"tooltip.help.bg_tolerance":
			"背景色と判定する色の類似度（誤差範囲）です。\n\n【大】圧縮ノイズなどで色が多少ブレていても背景として透過できますが、必要な色まで消える可能性があります。\n【小】厳密に背景色のみを透過しますが、ノイズが残りやすくなります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.pre_remove":
			"グリッド検出を行う【前】に、背景色を無視します。\n\nメリット: 余白が広い画像でも、本体部分のグリッドを正しく検出しやすくなります。\n注意: 背景と同じ色がキャラクター内にある場合、検出精度が下がる可能性があります。",
		"tooltip.help.post_remove":
			"処理完了【後】に、背景色を透明に置き換えて出力します。\n\nメリット: 背景透明のPNGとして保存できます。\n注意: グリッド検出処理自体には影響しません。",
		"tooltip.help.remove_inner":
			"背景透過時に、四隅と近い背景色を画像全体で透過にします。\n\nメリット: ドーナツ穴など「内側に閉じ込められた背景色」も透明にできます。\n注意: 背景と同じ色がキャラクター内にある場合、それも透明になる可能性があります。",
		"tooltip.help.floating_max":
			"背景に囲まれて浮いている小さな島（連結成分）を除去対象とみなす最大面積（元画像の総ピクセル数に対する割合）です。\n0%のときは浮きノイズ除去を行いません。\n例: 1% → (幅×高さ×0.01) px\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		"tooltip.help.auto_trim":
			"出力結果を「内容物のある範囲」に合わせて自動でトリミングします。\n\n余白（背景）が大きい画像で、縦横のマス数を正しく検出したい場合に有効です。",

		// Select Options
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
		"option.bg_none": "透過しない",
		"option.bg_top_left": "左上（デフォルト）",
		"option.bg_bottom_left": "左下",
		"option.bg_top_right": "右上",
		"option.bg_bottom_right": "右下",
		"option.bg_rgb": "RGB指定",

		// JS Messages
		"error.no_image": "先に画像を選択してください。",
		"error.process_failed": "処理失敗",
		"error.load_failed": "読み込み失敗",
		"status.processing": "処理中...",

		// Attributes & Titles
		"attr.title.bg_checkered": "背景: 格子模様",
		"attr.title.bg_white": "背景: 白",
		"attr.title.bg_black": "背景: 黒",
		"attr.title.bg_green": "背景: 緑",
		"attr.title.grid_toggle": "グリッドを表示する（拡大時のみ有効）",
		"attr.title.zoom_toggle": "拡大表示する",
		"attr.title.eyedropper": "スポイトで画像から色を選択",
		"attr.placeholder.auto": "自動",

		// Modal
		"modal.eyedropper.title": "背景色を選択",
		"modal.eyedropper.instruction":
			"画像内の背景にしたい色をクリックしてください",

		// Footer
		"footer.privacy": "画像はブラウザ内で安全に処理されます",
	},
	en: {
		// UI Headings & Labels
		"app.title": "Pixel Refiner | AI Pixel Art Optimizer & Background Remover",
		"app.description":
			'Optimize AI-generated pixel art into <span class="text-highlight">production-ready sprites</span>.<br />' +
			'Complete <span class="text-highlight">anti-aliasing removal</span> and <span class="text-highlight">background transparency</span> in seconds.',
		"section.input": "Input Image",
		"section.result": "Result",
		"section.palette": "Palette",
		"ui.process_btn": "Process Image",
		"ui.auto_process": "Auto",
		"ui.download_btn": "Download",
		"ui.export_gpl": "Export .GPL",
		"ui.export_png": "Export .PNG",
		"ui.import_palette": "Import Palette",
		"ui.show_palette": "Show Palette",
		"ui.size": "Size",
		"ui.placeholder.input":
			'Drag & drop image here<br /><span class="drop-subtext">or Click to select</span>',
		"ui.placeholder.result": "Processed result will appear here",

		// Settings
		"setting.color_reduction": "Color Reduction",
		"setting.color_mode": "Reduction Mode",
		"setting.color_count": "Color Count",
		"setting.dither_mode": "Dithering",
		"setting.dither_strength": "Dither Strength (%)",
		"setting.advanced": "Advanced Settings",
		"setting.grid_detection": "Grid Detection",
		"setting.enable_grid": "Enable Grid Detection",
		"setting.quant_step": "Quantization Step",
		"setting.sample_window": "Sample Window",
		"setting.force_width": "Force Width (px)",
		"setting.force_height": "Force Height (px)",
		"setting.fast_mode": "Fast Mode",
		"setting.bg_removal": "Background Removal",
		"setting.enable_bg_removal": "Enable Background Removal",
		"setting.bg_method": "Extraction Method",
		"setting.bg_rgb": "Background Color (RGB)",
		"setting.bg_tolerance": "Color Tolerance",
		"setting.pre_remove": "Pre-process Transparency",
		"setting.post_remove": "Post-process Transparency",
		"setting.remove_inner": "Remove Inner Background",

		"setting.floating_max": "Max Noise Size (%)",
		"setting.trimming": "Trimming",
		"setting.auto_trim": "Auto Trim",
		"setting.processing": "Processing",
		"setting.auto_process": "Auto Process",
		"tooltip.help.auto_process":
			"Automatically runs processing when settings are changed.\n\nTurn OFF if you prefer to manually click the Process button.",

		// Tooltips
		"tooltip.help.color_mode":
			"Limits the number of colors in the output.\n\nUseful for achieving a classic pixel art look.\nNone: No color reduction.\nGame Boy / PICO-8 / NES: Uses specific console palettes.\nAuto: Automatically reduces to the specified number of colors.",
		"tooltip.help.color_count":
			"Specifies the maximum number of colors in the output.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.dither_strength":
			"Applies dithering (error diffusion) during color reduction.\n\n100%: Full error diffusion.\n0%: No dithering (None).\n\nAllows for smoother gradients with fewer colors, but introduces characteristic pixel noise.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.enable_grid":
			"Automatically detects the grid from the input image and reduces/optimizes it to pixel units.\n\nIf OFF, grid detection and reduction are skipped (useful if the image is already a 1:1 pixel art). Background trimming and transparency will still be performed based on other settings.",
		"tooltip.help.quant_step":
			"Sets the color reduction level for grid detection.\n\nHigh: Colors are grouped, making it resistant to noise, but subtle color differences may be lost.\nLow: Picks up fine color boundaries, but increases the risk of false noise detection.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.sample_window":
			"The reference range (in pixels) used when determining the color of each dot.\n\nHigh: Noise is removed and colors become stable, but fine details may be lost.\nLow: Faithfully reproduces the original image, but is more affected by misalignment and noise.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.force_width":
			"Forces conversion to the specified size.\nAutomatic detection is not performed when a specific size is set.\n\nRange: 1 to 1024 (Default: Auto)",
		"tooltip.help.force_height":
			"Forces conversion to the specified size.\nAutomatic detection is not performed when a specific size is set.\n\nRange: 1 to 1024 (Default: Auto)",
		"tooltip.help.fast_mode":
			"When ON, uses an efficient algorithm to speed up the search.\nWhen OFF, performs a more comprehensive and precise search.\n\nIf automatic detection results are misaligned or the image has a lot of noise/fine patterns, turning this OFF may improve accuracy.",
		"tooltip.help.enable_bg_removal":
			"Enables background removal processing.\n\nWhen OFF, all background removal settings are disabled and the background is kept as-is.",
		"tooltip.help.bg_method":
			"Select where to extract the background color from.\n\nCorners: Uses the pixel at the specified corner as the background color.\nRGB: Uses the specified color as the background color.",
		"tooltip.help.bg_rgb":
			"Specify the color to be treated as the background in hex format (e.g., #ffffff).\nWhen a corner is specified, the color is automatically set. You can also pick a color from the image using the eyedropper button.",
		"tooltip.help.bg_tolerance":
			"The similarity (error range) for determining the background color.\n\nHigh: Can remove background even if colors are slightly distorted by compression noise, but may also remove intended colors.\nLow: Strictly removes only the exact background color, but noise may remain.\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.pre_remove":
			"Ignores the background color BEFORE performing grid detection.\n\nBenefit: Makes it easier to correctly detect the grid for the main subject even in images with large margins.\nNote: If the background color exists within the character, detection accuracy may decrease.",
		"tooltip.help.post_remove":
			"Replaces the background color with transparency AFTER processing is complete.\n\nBenefit: Allows saving as a PNG with a transparent background.\nNote: Does not affect the grid detection process itself.",
		"tooltip.help.remove_inner":
			'When removing the background, also makes similar background colors transparent throughout the entire image.\n\nBenefit: Can transparentize "trapped" background colors like the hole in a donut.\nNote: If the background color exists within the character, it may also become transparent.',
		"tooltip.help.floating_max":
			"The maximum area (as a percentage of the total pixels in the original image) to be considered for removal as floating noise.\nWhen set to 0%, floating noise removal is skipped.\nExample: 1% → (Width × Height × 0.01) px\n\nRange: {min} to {max} (Default: {default})",
		"tooltip.help.auto_trim":
			"Automatically trims the output to fit the range containing the content.\n\nUseful for correctly detecting the number of vertical and horizontal cells in images with large margins (background).",

		// Select Options
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
		"option.bg_none": "None",
		"option.bg_top_left": "Top-Left (Default)",
		"option.bg_bottom_left": "Bottom-Left",
		"option.bg_top_right": "Top-Right",
		"option.bg_bottom_right": "Bottom-Right",
		"option.bg_rgb": "RGB Specification",

		// JS Messages
		"error.no_image": "Please select an image first.",
		"error.process_failed": "Processing failed",
		"error.load_failed": "Loading failed",
		"status.processing": "Processing...",

		// Attributes & Titles
		"attr.title.bg_checkered": "Background: Checkered",
		"attr.title.bg_white": "Background: White",
		"attr.title.bg_black": "Background: Black",
		"attr.title.bg_green": "Background: Green",
		"attr.title.grid_toggle": "Show Grid (Zoom only)",
		"attr.title.zoom_toggle": "Zoom Output",
		"attr.title.eyedropper": "Pick color from image",
		"attr.placeholder.auto": "Auto",

		// Modal
		"modal.eyedropper.title": "Select Background Color",
		"modal.eyedropper.instruction":
			"Click on the color in the image you want to set as background",

		// Footer
		"footer.privacy": "Images are processed safely within your browser",
	},
};

export class I18nManager {
	currentLang: Language = "en";

	constructor() {
		// 1. LocalStorage 2. Browser Setting 3. Default (en)
		const saved = localStorage.getItem("pixel-refiner-lang");
		const browser = navigator.language.startsWith("ja") ? "ja" : "en";
		this.currentLang = (saved as Language) || browser;
	}

	setLanguage(lang: Language) {
		this.currentLang = lang;
		localStorage.setItem("pixel-refiner-lang", lang);
		this.updatePage();
	}

	// キーからテキストを取得
	t(key: keyof (typeof resources)["ja"]): string {
		return resources[this.currentLang][key] || key;
	}

	// ページ全体の更新
	updatePage() {
		// 1. テキストコンテンツの更新 (innerHTML を使用してタグを維持)
		document.querySelectorAll("[data-i18n]").forEach((el) => {
			const key = el.getAttribute(
				"data-i18n",
			) as keyof (typeof resources)["ja"];
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
				el.setAttribute(attr, this.t(key as keyof (typeof resources)["ja"]));
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
