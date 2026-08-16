import { defineMessages } from "../define-messages";

// 設定項目のツールチップ（tooltip.）
export const tooltipMessages = defineMessages({
	"tooltip.help.auto_process": {
		ja: "設定を変更した際に、自動で変換処理を実行します。\n\n手動でボタンを押して実行したい場合はOFFにしてください。",
		en: "Automatically runs processing when settings are changed.\n\nTurn OFF if you prefer to manually click the Process button.",
		"zh-CN":
			"设置变化时自动运行转换处理。\n\n如果想手动点击处理按钮，请关闭此选项。",
	},
	"tooltip.help.quick_preset": {
		ja: "目指す仕上がりに合わせて、サイズ、色、背景などをまとめて設定します。",
		en: "Sets the size, colors, background, and related options together for the finish you want.",
		"zh-CN": "根据目标效果，一次设置尺寸、色彩和背景等项目。",
	},
	"tooltip.help.quick_processing_mode": {
		ja: "目指す仕上がりを選びます。\n\nおまかせ: 画像に合う仕上がりを自動で選びます。\n輪郭をくっきり: ぼかしを除き、色と透明度をドット単位で揃えます。\n細部を残してドット化: 階調や細い線を残しながら低解像度化します。\nサイズを変えず補正: 縮小せず、背景や色だけを補正します。",
		en: "Chooses the intended finish.\n\nBest Match: Selects a suitable finish for the image.\nCrisp Edges: Removes blur and aligns color and transparency to the pixel grid.\nDetailed Pixel Art: Reduces resolution while keeping gradients and thin lines.\nOriginal Size Cleanup: Adjusts the background and colors without downscaling.",
		"zh-CN":
			"选择目标效果。\n\n智能推荐：自动选择适合图像的效果。\n清晰轮廓：去除模糊，并按像素统一颜色和透明度。\n保留细节的像素画：在保留明暗层次和细线的同时降低分辨率。\n原尺寸优化：不缩小图像，只调整背景和色彩。",
	},
	"tooltip.help.convert_output_size": {
		ja: "5段階の細かさから選ぶか、Convertでリサンプリングする幅、高さ、または両方を指定します。片方だけ指定した場合、もう片方は画像の縦横比に合わせます。",
		en: "Choose one of five detail levels, or specify the Convert resampling width, height, or both. When only one dimension is specified, the other follows the image aspect ratio.",
		"zh-CN":
			"选择五档细节级别，或指定 Convert 重采样使用的宽度、高度或两者。仅指定一个尺寸时，另一个尺寸将按图像纵横比计算。",
	},
	"tooltip.help.convert_output_dimension": {
		ja: "Convertでリサンプリングする寸法を指定します。背景トリム、アウトライン、余白追加によって最終キャンバスの寸法は変わる場合があります。",
		en: "Sets the resampling dimension used by Convert. Background trimming, outlines, and padding can change the final canvas size.",
		"zh-CN":
			"指定 Convert 重采样使用的尺寸。背景裁剪、描边和留白可能会改变最终画布尺寸。",
	},
	"tooltip.help.quick_detail": {
		ja: "「細部を残してドット化」で使うドットの細かさを5段階から選びます。粗くするほど出力が小さくなり、1ドットが大きく見えます。「細かい」も元画像を超えて拡大しません。色数など、ほかの設定には影響しません。\n\n「おまかせ」では、細部を残す仕上がりが自動で選ばれた画像にだけ適用されます。「輪郭をくっきり」で使うのは「ドットの大きさ」で、こちらとは別の項目です。",
		en: "Chooses from five pixel-detail levels for Detailed Pixel Art. Coarser settings produce a smaller output with larger-looking pixels. Fine never upscales beyond the original image and does not change the color count or other settings.\n\nIn Best Match, this applies only when a detailed finish is selected automatically. Crisp Edges uses Pixel Size instead, which is a separate setting.",
		"zh-CN":
			"为“保留细节的像素画”选择五档像素细节。设置越粗，输出尺寸越小，单个像素看起来越大。“精细”也不会放大到超过原图尺寸，不影响颜色数量等其他设置。\n\n在“智能推荐”中，仅当系统自动选择保留细节的效果时生效。“清晰轮廓”使用的是另一个项目“像素大小”。",
	},
	"tooltip.help.quick_cell_scale": {
		ja: "「輪郭をくっきり」で復元するドットの大きさを5段階から選びます。検出したドットの大きさを基準に、その1/4〜4倍へ変えます。格子の検出が外れて出力が粗くなりすぎたときに、小さい側を選ぶと復元し直せます。元画像を超えて拡大することはありません。\n\n「おまかせ」では、輪郭をくっきりする仕上がりが自動で選ばれた画像にだけ適用されます。「細部を残してドット化」で使うのは「ドットの細かさ」です。",
		en: "Chooses the size of the pixels restored by Crisp Edges, in five steps relative to the detected pixel size (1/4x to 4x). When grid detection misses and the result looks too coarse, pick a smaller step to restore it again. It never upscales beyond the original image.\n\nIn Best Match, this applies only when Crisp Edges is selected automatically. Detailed Pixel Art uses Pixel Detail instead.",
		"zh-CN":
			"为“清晰轮廓”选择还原时的像素大小，共五档。以检测到的像素大小为基准，在 1/4 到 4 倍之间调整。当网格检测失误导致结果过粗时，选择更小的档位即可重新还原。不会放大到超过原图尺寸。\n\n在“智能推荐”中，仅当系统自动选择清晰轮廓时生效。“保留细节的像素画”使用的是“像素细节”。",
	},
	"tooltip.help.advanced_cell_scale": {
		ja: "検出したセル寸法に倍率を掛けてから縮小します。格子の位相は変えないので、セル境界は検出した格子に乗ったままで、出力の縦横比も変わりません。グリッド検出モードが「自動」または「ピクセル+自動」で、格子の復元で仕上げる場合にだけ効きます。",
		en: "Scales the detected cell size before downsampling. The grid phase is kept, so cell boundaries stay on the detected grid and the output aspect ratio does not change. Applies only when Grid Detection Mode is Auto or Pixel + Auto and the result comes from grid restoration.",
		"zh-CN":
			"在缩小之前，为检测到的单元格尺寸乘以倍率。网格相位保持不变，因此单元格边界仍位于检测到的网格上，输出的纵横比也不会改变。仅当网格检测模式为“自动”或“像素+自动”，且结果来自网格还原时生效。",
	},
	"tooltip.help.quick_reduction_mode": {
		ja: "減色方法を選びます。おまかせでは、「輪郭をくっきり」と「サイズを変えず補正」は元の色を維持し、「細部を残してドット化」は24色に減色します。任意の色数指定と固定パレットの読み込みは詳細設定で行えます。",
		en: "Chooses color reduction. Best Match keeps original colors for Crisp Edges and Original Size Cleanup, and selects 24 colors for Detailed Pixel Art. Custom color counts and imported palettes are available in Advanced Settings.",
		"zh-CN":
			"选择减色方式。智能推荐会为“清晰轮廓”和“原尺寸优化”保留原色，并为“保留细节的像素画”选择24色。任意颜色数量和导入固定调色板可在高级设置中指定。",
	},
	"tooltip.help.quick_background": {
		ja: "背景を残すか、自動判定で透過するか、選んだ色を透過するかを選びます。背景を残す場合はキャンバス全体を維持し、透過する場合は透明な余白も自動で切り詰めます。",
		en: "Chooses whether to keep the background, remove it automatically, or make a selected color transparent. Keeping the background preserves the full canvas; removing it also trims transparent margins.",
		"zh-CN":
			"选择保留背景、自动移除背景，或将选定颜色设为透明。保留背景时会保留完整画布；透明化背景时也会自动裁剪透明边距。",
	},
	"tooltip.help.quick_dithering": {
		ja: "減色時にドット模様を加えてグラデーションを表現します。強くするほど階調を残しやすくなりますが、模様も目立ちます。",
		en: "Adds a pixel pattern during color reduction to preserve gradients. Stronger settings retain more tonal variation but make the texture more visible.",
		"zh-CN":
			"减色时加入像素纹理来表现渐变。强度越高越能保留明暗层次，但纹理也会更明显。",
	},
	"tooltip.help.color_mode": {
		ja: "出力結果の色数を制限します。\n\nドット絵らしい色使いに整えたい場合に有効です。\n無効: 減色を行いません。\nGame Boy / PICO-8 / NES: 各ゲーム機のパレットを使用します。\n色数指定 (Auto): 指定した色数に自動で減色します。",
		en: "Limits the number of colors in the output.\n\nUseful for achieving a classic pixel art look.\nNone: No color reduction.\nGame Boy / PICO-8 / NES: Uses specific console palettes.\nAuto: Automatically reduces to the specified number of colors.",
		"zh-CN":
			"限制输出结果的颜色数量。\n\n适合将画面整理成更接近经典像素画的色彩风格。\n无：不进行减色。\nGame Boy / PICO-8 / NES：使用对应主机的调色板。\n自定义数量：自动减色到指定颜色数量。",
	},
	"tooltip.help.color_count": {
		ja: "出力する最大の色数を指定します。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Specifies the maximum number of colors in the output.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"指定输出的最大颜色数量。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.dither_strength": {
		ja: "減色時にディザリング（誤差拡散）を適用します。\n\n100%: 完全な誤差拡散を行います。\n0%: ディザリングを行わず、最も近い色に丸めます。\n\n少ない色数でも滑らかなグラデーションを表現できますが、ドット絵特有のザラつきが発生します。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Applies dithering (error diffusion) during color reduction.\n\n100%: Full error diffusion.\n0%: No dithering (None).\n\nAllows for smoother gradients with fewer colors, but introduces characteristic pixel noise.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"减色时应用抖动（误差扩散）。\n\n100%：完整误差扩散。\n0%：不使用抖动，直接取最接近的颜色。\n\n可以用较少颜色表现更平滑的渐变，但会产生像素画常见的颗粒感。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.grid_mode": {
		ja: "グリッド検出の動作モードを切り替えます。\n\n自動検出: グリッドを自動検出します（デフォルト）。\nピクセル指定 + 自動検出: 指定ピクセルをヒントにして、その近傍から精密探索を開始します。\n完全ピクセル指定: 指定サイズに強制変換します（自動検出なし）。\n無効: グリッド検出と縮小をスキップします（等倍ドット絵向け）。",
		en: "Switches the grid detection behavior.\n\nAuto: Automatically detects the grid (default).\nPixel + Auto: Uses the specified pixel size as a hint and starts fine search near it.\nPixel Only: Forces conversion to the specified size (no auto detection).\nOff: Skips grid detection and reduction (useful for 1:1 pixel art).",
		"zh-CN":
			"切换网格检测的工作方式。\n\n自动检测：自动检测网格（默认）。\n像素指定 + 自动检测：把指定像素尺寸作为提示，并在附近进行精细搜索。\n完全像素指定：强制转换为指定尺寸（不自动检测）。\n关闭：跳过网格检测和缩小（适合 1:1 像素画）。",
	},
	"tooltip.help.quant_step": {
		ja: "グリッド検出用の減色レベルを設定します。\n\n【大】色がまとまりノイズに強くなりますが、微妙な色の違いが消える場合があります。\n【小】色の境界を細かく拾いますが、ノイズを誤検出するリスクが高まります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Sets the color reduction level for grid detection.\n\nHigh: Colors are grouped, making it resistant to noise, but subtle color differences may be lost.\nLow: Picks up fine color boundaries, but increases the risk of false noise detection.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"设置网格检测使用的减色级别。\n\n高：颜色会被归并，更抗噪，但细微色差可能丢失。\n低：能捕捉更细的颜色边界，但更容易误判噪点。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.sample_window": {
		ja: "Auto・Hintでグリッドサイズ候補を比較する際の参照範囲（ピクセル数）です。\n\n【大】グリッド検出がノイズに強くなりますが、細かな境界を見落とす可能性があります。\n【小】細かな境界を捉えやすくなりますが、位置ズレやノイズの影響を強く受けます。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "The reference range (in pixels) used to compare grid-size candidates in Auto and Hint modes.\n\nHigh: Grid detection is more resistant to noise, but fine boundaries may be overlooked.\nLow: Grid detection follows fine boundaries, but is more affected by misalignment and noise.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"在自动和提示模式下比较网格尺寸候选项时使用的参考范围（像素数）。\n\n高：网格检测更能抵抗噪点，但可能忽略细微边界。\n低：更容易捕捉细微边界，但更容易受错位和噪点影响。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.cell_sampling_mode": {
		ja: "論理ピクセル 1 つの代表色をどう選ぶかを決めます。\n\nハードアルファ: 補間で生じた中間の透明度を残しません。\n半透明を保持: 面積被覆としての半透明を残します。意図的に柔らかい縁向けです。\n互換: 旧方式の中央値サンプラーです。透かし除去後に自動で使われるのもこれです。",
		en: "How the representative colour of each logical pixel is chosen.\n\nHard Alpha: Avoids keeping partial transparency introduced by interpolation.\nAlpha Aware: Preserves area-coverage alpha for intentionally soft edges.\nCompatible: The legacy median sampler, also used automatically after watermark removal.",
		"zh-CN":
			"决定如何选择每个逻辑像素的代表色。\n\n硬 Alpha：不保留插值产生的中间透明度。\n保留半透明：保留作为面积覆盖的半透明，适合刻意柔和的边缘。\n兼容：旧版中值采样器，水印移除后也会自动使用。",
	},
	"tooltip.help.preserve_thin_features": {
		ja: "セルを横切る少数派の色を、線や輪郭として残します。切ると細部が面色に飲まれます。",
		en: "Protects minority colours that cross a cell so that thin lines and outlines survive downsampling.",
		"zh-CN": "保护横跨单元格的少数色，使细线与轮廓在缩小后仍然保留。",
	},
	"tooltip.help.auto_grid_from_trimmed": {
		ja: "背景を除いた内容の範囲から出力格子を推定します。\n切ると、画像全体を走査する旧来の検出器だけで判断します。",
		en: "Estimates the output grid from the trimmed content area.\nWhen OFF, only the fallback detector that scans the whole canvas is used.",
		"zh-CN":
			"从去除背景后的内容范围推定输出网格。\n关闭时仅使用扫描整幅图像的旧版检测器。",
	},
	"tooltip.help.phase_aware_grid_search": {
		ja: "位相を考慮した探索も行い、縦横どちらの軸も十分に確からしい場合はそちらを採用します。",
		en: "Also runs a phase-aware search and prefers its result when both axes are confident enough.",
		"zh-CN": "同时执行相位感知搜索，当两个轴都足够可信时优先采用其结果。",
	},
	"tooltip.help.boundary_contrast_override": {
		ja: "セル境界が実際のエッジに明確によく乗る粗い倍率が見つかったとき、採用する格子をそちらへ乗り換えます。",
		en: "Switches the chosen grid to a coarser harmonic when its cell boundaries align clearly better with real edges.",
		"zh-CN":
			"当更粗的倍率其单元格边界明显更贴合真实边缘时，将采用的网格切换过去。",
	},
	"tooltip.help.small_aspect_grid_alignment": {
		ja: "論理解像度が小さいとき、角から求めたマスクの範囲を格子の基準に使います。無効にすると、「おまかせ」が小さな格子ではなく「サイズを変えず補正」を選ぶ場合があります。",
		en: "For small logical resolutions, uses the corner-seeded mask bounds as the grid reference area. Turning this off may cause Best Match to select Original Size Cleanup instead of a small grid.",
		"zh-CN":
			"当逻辑分辨率较小时，使用从角落求得的遮罩范围作为网格基准。关闭后，智能推荐可能选择原尺寸优化而不是小网格。",
	},
	"tooltip.help.max_samples_per_cell": {
		ja: "1 つのセルの色を決めるときに読み取る画素数の上限です。大きいほど安定しますが遅くなります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Upper bound on the pixels sampled from one cell when picking its colour. Higher is more stable but slower.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"决定单个单元格颜色时读取的像素数上限。数值越大越稳定，但速度更慢。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.cell_alpha_threshold": {
		ja: "セル内で色の候補として扱うために必要な、最低限のアルファ値です。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Minimum alpha for a pixel to be considered a colour candidate inside a cell.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"像素在单元格内被视为颜色候选所需的最低 Alpha 值。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.auto_max_cells_w": {
		ja: "旧来の検出器が自動検出するセル数の上限です。「内容から格子を推定」を切ったときに効きます。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Upper bound on the cell count found by the fallback detector. Applies when grid estimation from content is off.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"旧版检测器自动检测的单元格数上限。关闭「从内容推定网格」时生效。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.auto_max_cells_h": {
		ja: "旧来の検出器が自動検出するセル数の上限です。「内容から格子を推定」を切ったときに効きます。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Upper bound on the cell count found by the fallback detector. Applies when grid estimation from content is off.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"旧版检测器自动检测的单元格数上限。关闭「从内容推定网格」时生效。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.detection_background_mask": {
		ja: "背景色を推測して格子検出の前に隠します。背景のノイズが検出結果を引っぱるのを防ぎます。",
		en: "Guesses the background colour and masks it before grid detection so that background noise does not bias the result.",
		"zh-CN": "在网格检测前推测并遮罩背景色，避免背景噪点影响检测结果。",
	},
	"tooltip.help.background_mask_tolerance": {
		ja: "検出用の背景マスクが背景色とみなす、チャンネルごとの色差です。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Per-channel colour difference the detection background mask treats as background.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"检测用背景遮罩视为背景的各通道色差。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.grid_signal_color_boundary": {
		ja: "格子候補の採点に色境界の信号を含めます。",
		en: "Includes the colour-boundary signal when scoring grid candidates.",
		"zh-CN": "在网格候选评分中纳入颜色边界信号。",
	},
	"tooltip.help.grid_signal_luminance_alpha": {
		ja: "格子候補の採点に輝度勾配とアルファ勾配の信号を含めます。",
		en: "Includes the luminance and alpha gradient signals when scoring grid candidates.",
		"zh-CN": "在网格候选评分中纳入亮度梯度与 Alpha 梯度信号。",
	},
	"tooltip.help.grid_signal_autocorrelation": {
		ja: "格子候補の採点に自己相関の信号を含めます。",
		en: "Includes the autocorrelation signal when scoring grid candidates.",
		"zh-CN": "在网格候选评分中纳入自相关信号。",
	},
	"tooltip.help.grid_signal_reconstruction": {
		ja: "格子候補の採点に再構成誤差の信号を含めます。",
		en: "Includes the reconstruction-error signal when scoring grid candidates.",
		"zh-CN": "在网格候选评分中纳入重建误差信号。",
	},
	"tooltip.help.grid_signal_local_phase": {
		ja: "格子候補の採点に局所位相の安定性を含めます。",
		en: "Includes the local phase stability signal when scoring grid candidates.",
		"zh-CN": "在网格候选评分中纳入局部相位稳定性信号。",
	},
	"tooltip.help.background_dehalo": {
		ja: "背景を消したあと、アンチエイリアスの縁を背景色から遠ざけて残った色かぶりを薄めます。",
		en: "Pushes anti-aliased edge pixels away from the background colour after removal.",
		"zh-CN": "移除背景后，将抗锯齿边缘推离背景色，减轻残留的偏色。",
	},
	"tooltip.help.background_edge_cleanup": {
		ja: "縮小後の縁に背景色が混ざって残った画素を、原寸の本来の色へ差し替えます。",
		en: "Replaces edge pixels that still carry the background colour after downscaling with their original colour.",
		"zh-CN": "将缩小后仍带有背景色的边缘像素替换为原始尺寸下的本来颜色。",
	},
	"tooltip.help.background_ramp_follow": {
		ja: "なめらかに変化する背景を、絶対的な色差ではなく小さな段差の連なりとしてたどります。",
		en: "Follows a smooth gradient background as a chain of small steps instead of an absolute colour difference.",
		"zh-CN": "将平滑渐变的背景视为一连串细小台阶来追踪，而非依据绝对色差。",
	},
	"tooltip.help.background_removal_rollback": {
		ja: "背景除去で可視画素のほとんどが消えてしまう場合に、その除去を丸ごと取り消します。",
		en: "Discards the whole background removal when it would erase almost all of the visible pixels.",
		"zh-CN": "当背景移除会抹掉几乎所有可见像素时，整体撤销该次移除。",
	},
	"tooltip.help.alpha_border_background_guard": {
		ja: "画像の縁の多くがすでに透明なら、色から背景を推定しません。切り抜き済みの画像の輪郭が削れるのを防ぎます。",
		en: "Skips colour-cluster estimation when most of the border band is already transparent, which protects the outline of pre-cut images.",
		"zh-CN":
			"当图像边缘大部分已透明时，不再依据颜色推定背景，避免削掉已抠图图像的轮廓。",
	},
	"tooltip.help.background_confidence_gate": {
		ja: "推定した背景モデルの確からしさが足りないときは、背景除去そのものを見送ります。",
		en: "Skips background removal entirely when the estimated background model is not confident enough.",
		"zh-CN": "当推定的背景模型可信度不足时，直接跳过背景移除。",
	},
	"tooltip.help.small_component_background_gate": {
		ja: "推定した背景モデルの確からしさが足りないときは、「小さな要素の整理」も見送ります。",
		en: "Skips the small-detail cleanup when the estimated background model is not confident enough.",
		"zh-CN": "当推定的背景模型可信度不足时，同样跳过「细小元素整理」。",
	},
	"tooltip.help.watermark_sampling_compat": {
		ja: "透かしを消したあと、末尾の行が欠けるのを防ぐために互換の中央値サンプラーへ切り替えます。",
		en: "Switches to the compatible median sampler once a watermark has been removed, which prevents the last row from being dropped.",
		"zh-CN": "移除水印后切换到兼容的中值采样器，以避免末行缺失。",
	},
	"tooltip.help.trim_alpha_threshold": {
		ja: "トリミング範囲を求めるときに、内容とみなすために必要な最低限のアルファ値です。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "Minimum alpha for a pixel to count as content when computing the trimming bounds.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"计算裁剪范围时，像素被视为内容所需的最低 Alpha 值。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.force_width": {
		ja: "指定ピクセル（横）です。\n\nピクセル指定 + 自動検出: この値をヒントに精密探索を開始します。\n完全ピクセル指定: この値に強制変換します。\n\n設定範囲: 1〜1024 (デフォルト: 自動)",
		en: "Specified pixel width.\n\nPixel + Auto: Uses this as a hint and starts fine search near it.\nPixel Only: Forces conversion to this size.\n\nRange: 1 to 1024 (Default: Auto)",
		"zh-CN":
			"指定像素宽度。\n\n像素指定 + 自动检测：用该值作为提示并在附近精细搜索。\n完全像素指定：强制转换为该宽度。\n\n范围：1 到 1024 (默认：自动)",
	},
	"tooltip.help.force_height": {
		ja: "指定ピクセル（縦）です。\n\nピクセル指定 + 自動検出: この値をヒントに精密探索を開始します。\n完全ピクセル指定: この値に強制変換します。\n\n設定範囲: 1〜1024 (デフォルト: 自動)",
		en: "Specified pixel height.\n\nPixel + Auto: Uses this as a hint and starts fine search near it.\nPixel Only: Forces conversion to this size.\n\nRange: 1 to 1024 (Default: Auto)",
		"zh-CN":
			"指定像素高度。\n\n像素指定 + 自动检测：用该值作为提示并在附近精细搜索。\n完全像素指定：强制转换为该高度。\n\n范围：1 到 1024 (默认：自动)",
	},
	"tooltip.help.fast_mode": {
		ja: "ONにすると、効率的なアルゴリズムで探索を高速化します。\nOFFにすると、より広範囲を精密に探索します。\n\n自動検出の結果がズレる場合や、ノイズ・細かい模様が多い画像では、OFFにすると精度が向上します。",
		en: "When ON, uses an efficient algorithm to speed up the search.\nWhen OFF, performs a more comprehensive and precise search.\n\nIf automatic detection results are misaligned or the image has a lot of noise/fine patterns, turning this OFF may improve accuracy.",
		"zh-CN":
			"开启后使用更高效的算法加快搜索。\n关闭后会进行更大范围、更精细的搜索。\n\n如果自动检测结果错位，或图片包含大量噪点和细碎纹理，关闭后可能提高准确度。",
	},
	"tooltip.help.shared_palette": {
		ja: "すべての画像を同じパレットで減色します。\n\n処理後の全画像から共通のパレットを作り、色数の設定を上限としてまとめてから、各画像へ適用し直します。\nキャラクターの差分やアニメーションのコマなど、画像どうしで色味を揃えたい場合に使います。",
		en: "Reduces colors with a single palette shared by every image.\n\nA common palette is built from all processed images, limited to the color count setting, and reapplied to each image.\nUseful when colors must match across character variations or animation frames.",
		"zh-CN":
			"使用同一个调色板对所有图片减色。\n\n处理完成后会从全部图片生成共用调色板，以色数设置为上限归纳后，再重新应用到每张图片。\n适合角色差分或动画帧等需要统一色调的场景。",
	},
	"tooltip.help.include_diagnostics": {
		ja: "一括ダウンロード (ZIP) に diagnostics.json を追加します。\n\n画像ごとの入出力ファイル名、判定した入力の種類、処理方式、信頼度、警告コードを記録した JSON です。\n大量の画像を処理したあとで、確認が必要な画像を絞り込むときに使います。",
		en: "Adds diagnostics.json to the ZIP download.\n\nIt records the input and output filenames, detected input type, processing route, confidence, and warning codes for each image.\nUseful for narrowing down images that need a second look after a large batch.",
		"zh-CN":
			"在全部下载 (ZIP) 中追加 diagnostics.json。\n\n该 JSON 记录每张图片的输入输出文件名、判定的输入类型、处理方式、置信度和警告代码。\n便于在批量处理后筛选需要确认的图片。",
	},
	"tooltip.help.bg_method": {
		ja: "背景色をどこから抽出するか選択します。背景透過を有効にすると透明な余白も自動で切り詰め、透過しない場合はキャンバス全体を維持します。\n\n自動: 外周全体から背景を推定します。\n透過しない: 背景透過を行いません。\n各四隅: 指定した角のピクセルを背景色とします。\nRGB指定: 指定した色を背景色とします。",
		en: "Select where to extract the background color from. When background transparency is enabled, transparent margins are also trimmed automatically; None preserves the full canvas.\n\nAuto: Estimates the background from the full image border.\nNone: No background removal.\nCorners: Uses the pixel at the specified corner as the background color.\nRGB: Uses the specified color as the background color.",
		"zh-CN":
			"选择从哪里提取背景色。启用背景透明化时也会自动裁剪透明边距；不透明化背景时会保留完整画布。\n\n自动：从整个图像边缘估算背景。\n无：不移除背景。\n四角：使用指定角落的像素作为背景色。\nRGB：使用指定颜色作为背景色。",
	},
	"tooltip.help.bg_rgb": {
		ja: "背景色として扱う色を16進数(例: #ffffff)で指定します。\n四隅指定時は自動で色がセットされます。スポイトボタンで画像から色を選択することもできます。",
		en: "Specify the color to be treated as the background in hex format (e.g., #ffffff).\nWhen a corner is specified, the color is automatically set. You can also pick a color from the image using the eyedropper button.",
		"zh-CN":
			"用十六进制格式指定要视为背景的颜色（例如 #ffffff）。\n选择四角时会自动填入颜色。也可以用吸管按钮从图片中取色。",
	},
	"tooltip.help.bg_tolerance": {
		ja: "背景色と判定する色の類似度（誤差範囲）です。\n\n【大】圧縮ノイズなどで色が多少ブレていても背景として透過できますが、必要な色まで消える可能性があります。\n【小】厳密に背景色のみを透過しますが、ノイズが残りやすくなります。\n\n設定範囲: {min}〜{max} (デフォルト: {default})",
		en: "The similarity (error range) for determining the background color.\n\nHigh: Can remove background even if colors are slightly distorted by compression noise, but may also remove intended colors.\nLow: Strictly removes only the exact background color, but noise may remain.\n\nRange: {min} to {max} (Default: {default})",
		"zh-CN":
			"判断背景色相似度的误差范围。\n\n高：即使背景因压缩噪点产生轻微偏差也能移除，但可能误删需要保留的颜色。\n低：只移除更接近精确背景色的颜色，但可能残留噪点。\n\n范围：{min} 到 {max} (默认：{default})",
	},
	"tooltip.help.pre_remove": {
		ja: "グリッド検出を行う【前】に、背景色を無視します。\n\nメリット: 余白が広い画像でも、本体部分のグリッドを正しく検出しやすくなります。\n注意: 背景と同じ色がキャラクター内にある場合、検出精度が下がる可能性があります。",
		en: "Ignores the background color BEFORE performing grid detection.\n\nBenefit: Makes it easier to correctly detect the grid for the main subject even in images with large margins.\nNote: If the background color exists within the character, detection accuracy may decrease.",
		"zh-CN":
			"在网格检测前忽略背景色。\n\n优点：图片留白较大时，更容易正确检测主体网格。\n注意：如果角色内部也有背景同色区域，检测准确度可能下降。",
	},
	"tooltip.help.post_remove": {
		ja: "処理完了【後】に、背景色を透明に置き換えて出力します。\n\nメリット: 背景透明のPNGとして保存できます。\n注意: グリッド検出処理自体には影響しません。",
		en: "Replaces the background color with transparency AFTER processing is complete.\n\nBenefit: Allows saving as a PNG with a transparent background.\nNote: Does not affect the grid detection process itself.",
		"zh-CN":
			"处理完成后将背景色替换为透明。\n\n优点：可以保存为透明背景 PNG。\n注意：不会影响网格检测过程本身。",
	},
	"tooltip.help.bg_removal_scope": {
		ja: "背景をどこまで透過するかの範囲です。\n\nおまかせ: 外側に加え、背景色そのものだと判断できた内側の閉じた領域だけ透過。\n選択部分のみ: 選択した角から繋がる背景だけ透過。\n外側全部: 画像の外周に繋がる背景をすべて透過。\n全領域: 背景色に近い領域を内側も含めてすべて透過。\n\n背景が「維持」のときは使用しません。",
		en: "Range of background to make transparent.\n\nAuto: Outer background, plus enclosed holes that clearly match the background color.\nSelected only: Only background connected from the chosen corner.\nOuter all: All background connected to the image border.\nAll: Every area matching the background color, inner ones included.\n\nUnavailable when Background is Keep.",
		"zh-CN":
			"决定背景透明化的范围。\n\n自动：在外侧的基础上，只透明化可确定为背景色的内部封闭区域。\n仅选中部分：只透明化从所选角落连通的背景。\n外侧全部：透明化所有与图片边缘连通的背景。\n全区域：包括内部在内，透明化所有接近背景色的区域。\n\n背景设为“保留”时不可用。",
	},
	"tooltip.help.bg_connectivity": {
		ja: "「繋がっている」の判定方法です。\n\n4方向: 斜めを含めない厳しい判定。\n8方向: 斜めも繋がりとみなします。",
		en: "Whether diagonal neighbors are considered connected.\n\n4-way: Strict (no diagonals).\n8-way: Includes diagonals.",
		"zh-CN":
			"决定相邻区域是否算作连通。\n\n4 方向：更严格，不包含斜向。\n8 方向：包含斜向相邻。",
	},
	"tooltip.help.gemini_watermark_removal": {
		ja: "背景透過後、右下に明るいひし形として単独で浮いているGeminiの透かしだけを自動で除去します。主体と接している場合は除去しません。",
		en: "After background transparency, automatically removes only an isolated bright Gemini diamond in the bottom-right corner. A mark touching the subject is kept.",
		"zh-CN":
			"背景透明化后，仅自动移除位于右下角、以明亮菱形独立悬浮的 Gemini 水印。水印与主体接触时不会移除。",
	},
	"tooltip.help.small_component_mode": {
		ja: "復元後の論理ピクセルを基準に孤立ノイズを整理します。近接・反復・対称・輪郭の延長・強いエッジ・高い不透明度を持つ細部は保護します。背景判定が不確かな場合は自動削除しません。",
		en: "Cleans isolated noise using restored logical pixels. Nearby, repeated, symmetric, outline-aligned, strongly edged, and highly opaque details are protected. Automatic removal is skipped when the background estimate is uncertain.",
		"zh-CN":
			"根据恢复后的逻辑像素清理孤立噪点。会保护邻近、重复、对称、位于轮廓延长线、边缘清晰或高不透明度的细节。背景判断不确定时不会自动删除。",
	},
	"tooltip.help.make_square": {
		ja: "画像全体が正方形になるように、足りない部分を透過ピクセルで埋め合わせます。\n\n元の画像は中心に配置されます。",
		en: "Pads the image with transparent pixels to make it perfectly square.\n\nThe original content is placed in the center.",
		"zh-CN":
			"用透明像素填充不足的边，使整张图片变为正方形。\n\n原内容会居中放置。",
	},
	"tooltip.help.keep_aspect_ratio": {
		ja: "トリミング後の出力画像が元画像のアスペクト比を維持するように、透過ピクセルでパディングします。\n\nスプライトのキャンバスサイズを揃えたい場合に便利です。",
		en: "Pads the trimmed output with transparent pixels to preserve the original image's aspect ratio.\n\nUseful for maintaining sprite canvas proportions after trimming.",
		"zh-CN":
			"裁剪后的输出图片使用透明像素填充，以保持原图的宽高比。\n\n适用于需要统一精灵画布尺寸的场景。",
	},
});
