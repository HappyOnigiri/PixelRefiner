import { defineMessages } from "../define-messages";

// AI 画像生成レシピ集（guide.html）専用（guide.）
export const guideMessages = defineMessages({
	"guide.page_title": {
		ja: "AI画像生成レシピ集 | Pixel Refiner",
		en: "Prompt Recipes | Pixel Refiner",
		"zh-CN": "AI 图像生成配方集 | Pixel Refiner",
	},
	"guide.page_name": {
		ja: "AI画像生成レシピ集",
		en: "Prompt Recipes",
		"zh-CN": "AI 图像生成配方集",
	},
	"guide.subtitle": {
		ja: "きれいにドット絵化できる入力画像の作り方",
		en: "How to create input images that convert cleanly into pixel art",
		"zh-CN": "如何准备能干净转换成像素画的输入图片",
	},
	"guide.back_to_app": {
		ja: "Pixel Refiner に戻る",
		en: "Back to Pixel Refiner",
		"zh-CN": "返回 Pixel Refiner",
	},
	"guide.copy_prompt": {
		ja: "プロンプトをコピー",
		en: "Copy prompt",
		"zh-CN": "复制提示词",
	},
	"guide.copied": {
		ja: "コピーしました",
		en: "Copied",
		"zh-CN": "已复制",
	},
	"guide.copy_failed": {
		ja: "コピーできません。テキストを選択してください",
		en: "Can’t copy. Select the text instead",
		"zh-CN": "无法复制，请手动选择文本",
	},
	"guide.intro.heading": {
		ja: "はじめに — 考え方",
		en: "Before You Start: The Idea",
		"zh-CN": "开始之前 — 基本思路",
	},
	"guide.intro.body1": {
		ja: "Pixel Refiner は「ドットのぼやけ」「グリッドのずれ」「多すぎる色」を自動で直せます。一方で、生成画像そのものに起因する問題は、変換の段階では直せません。",
		en: "Pixel Refiner can automatically fix blurred pixels, misaligned grids, and too many colors. Problems that come from the generated image itself, however, cannot be fixed at the conversion stage.",
		"zh-CN":
			"Pixel Refiner 能自动修正“像素模糊”“网格错位”“颜色过多”。但源自生成图片本身的问题，在转换阶段无法解决。",
	},
	"guide.intro.body2": {
		ja: "このページは、<strong>直せない問題を画像生成の段階で防ぐ</strong>ためのプロンプト集です。",
		en: "This page collects prompts that <strong>prevent the unfixable problems while the image is being generated</strong>.",
		"zh-CN":
			"本页收集的提示词，用于<strong>在生成阶段就避免那些无法修正的问题</strong>。",
	},
	"guide.intro.fixable_heading": {
		ja: "ツールが直せるもの（生成時に気にしなくてよい）",
		en: "What the tool can fix (no need to worry when generating)",
		"zh-CN": "工具可以修正的问题（生成时无需在意）",
	},
	"guide.intro.fixable_1": {
		ja: "ドットのぼやけ・アンチエイリアス",
		en: "Blurred pixels and anti-aliasing",
		"zh-CN": "像素模糊与抗锯齿",
	},
	"guide.intro.fixable_2": {
		ja: "ドットサイズの不揃いな拡大縮小・グリッドのずれ",
		en: "Uneven scaling of pixel size and misaligned grids",
		"zh-CN": "像素大小不一致的缩放与网格错位",
	},
	"guide.intro.fixable_3": {
		ja: "多すぎる色数（減色・パレット変換）",
		en: "Too many colors (color reduction and palette conversion)",
		"zh-CN": "颜色数量过多（减色与调色板转换）",
	},
	"guide.intro.fixable_4": {
		ja: "ベタ塗り背景の透過",
		en: "Background transparency for flat backgrounds",
		"zh-CN": "纯色平涂背景的透明化",
	},
	"guide.intro.unfixable_heading": {
		ja: "ツールでは直せないもの（生成時に防ぐ）",
		en: "What the tool cannot fix (prevent it when generating)",
		"zh-CN": "工具无法修正的问题（需在生成时避免）",
	},
	"guide.intro.unfixable_1": {
		ja: "背景色が被写体の中にも使われている",
		en: "The background color also appears inside the subject",
		"zh-CN": "背景色也出现在主体内部",
	},
	"guide.intro.unfixable_2": {
		ja: "被写体が画像の端で見切れている",
		en: "The subject is cropped at the edge of the image",
		"zh-CN": "主体在画面边缘被裁切",
	},
	"guide.intro.unfixable_3": {
		ja: "影・グロー・ソフトシャドウ",
		en: "Shadows, glows, and soft shadows",
		"zh-CN": "阴影、辉光、柔和投影",
	},
	"guide.intro.unfixable_4": {
		ja: "画像全体のわずかな傾き",
		en: "A slight tilt across the whole image",
		"zh-CN": "整幅图片存在轻微倾斜",
	},
	"guide.intro.unfixable_5": {
		ja: "1枚に複数の被写体が入っている",
		en: "Several subjects packed into one image",
		"zh-CN": "一张图中包含多个主体",
	},
	"guide.blur.heading": {
		ja: "拡大すると、AI 生成画像はぼけている",
		en: "Zoom In and the Generated Image Is Blurred",
		"zh-CN": "放大之后，AI 生成图片其实很模糊",
	},
	"guide.blur.body1": {
		ja: "引きで見るとドット絵に見えても、拡大すると 1 ドットの縁が数ピクセルかけて滲み、同じドットの中でも色が揺れています。画像生成モデルはドットの格子を正確には守らないため、生成画像はそのままでは素材として使いにくく、ゲームや UI に載せると輪郭がぼやけます。",
		en: "From a distance a generated image looks like pixel art, but zoom in and the edge of a single dot fades over several pixels, and the color drifts within one dot. Image models do not follow the pixel grid exactly, so a generated image is hard to use as an asset as it is: put it in a game or a UI and the outlines look soft.",
		"zh-CN":
			"远看像是像素画，放大后却能看到：单个像素块的边缘要经过好几个像素才过渡完，同一个像素块内部的颜色也在变化。图像生成模型并不会严格遵守像素网格，因此生成图片很难直接当作素材使用，放进游戏或 UI 里轮廓会发虚。",
	},
	"guide.blur.body2": {
		ja: "Pixel Refiner は、このぼけたドットを格子に合わせ直し、1 ドットを 1 色に塗り直します。この後のレシピは、そうやって整えやすい生成画像を作るためのものです。",
		en: "Pixel Refiner snaps these blurred dots back onto a grid and repaints each dot in a single color. The recipes below are about generating images that are easy to snap back.",
		"zh-CN":
			"Pixel Refiner 会把这些模糊的像素块重新对齐到网格，并把每一块重涂成单一颜色。后面的配方，就是为了生成更容易被这样整理的图片。",
	},
	"guide.blur.view_whole": {
		ja: "全体",
		en: "Whole image",
		"zh-CN": "整体",
	},
	"guide.blur.view_detail": {
		ja: "部分拡大（元画素の4倍）",
		en: "Detail (4× of the original pixels)",
		"zh-CN": "局部放大（原像素的 4 倍）",
	},
	"guide.blur.whole_alt": {
		ja: "引きで見るとドット絵に見える生成画像の騎士",
		en: "A generated knight sprite that looks like pixel art at a glance",
		"zh-CN": "远看像是像素画的生成骑士图片",
	},
	"guide.blur.zoom_alt": {
		ja: "兜の左上の拡大。ドットの縁が数ピクセルかけて滲んでいる",
		en: "Close-up of the top left of the helmet: every dot edge fades over several pixels",
		"zh-CN": "头盔左上角的放大图：像素块的边缘要经过好几个像素才过渡完",
	},
	"guide.blur.caption": {
		ja: "同じ生成画像。右は兜の左上 80×80 ピクセルを 4 倍に拡大したもので、ドットの境目が滲み、背景と輪郭の間には中間色が出ています。",
		en: "The same generated image. On the right, 80×80 pixels from the top left of the helmet are enlarged 4×: the boundary between dots is smeared, and intermediate colors appear between the background and the outline.",
		"zh-CN":
			"同一张生成图片。右侧是头盔左上角 80×80 像素放大 4 倍的结果：像素块之间的边界发糊，背景与轮廓之间还出现了中间色。",
	},
	"guide.principles.heading": {
		ja: "5つの基本原則",
		en: "Five Basic Principles",
		"zh-CN": "五条基本原则",
	},
	"guide.principles.p1_heading": {
		ja: "原則1: 背景は「被写体に含まれない」原色のベタ一色にする",
		en: "Principle 1: Use a flat, saturated background color that never appears in the subject",
		"zh-CN": "原则 1：背景使用主体中不存在的纯色平涂",
	},
	"guide.principles.p1_body": {
		ja: "白い背景に白い目のキャラクターのように、背景色が被写体の中にもあると、透過処理が被写体側を巻き込むことがあります。暖色系の被写体には緑（#00FF00）、緑系の被写体にはマゼンタ（#FF00FF）のように、被写体から色相の遠い色を選びます。",
		en: "When the background color also appears in the subject — a character with white eyes on a white background, for example — background transparency can eat into the subject. Pick a hue far from the subject: green (#00FF00) for warm-colored subjects, magenta (#FF00FF) for green ones.",
		"zh-CN":
			"如果背景色也出现在主体中，例如白色背景上有白色眼睛的角色，背景透明化就可能连主体一起去掉。请选择与主体色相相距较远的颜色：暖色主体用绿色（#00FF00），绿色主体用品红（#FF00FF）。",
	},
	"guide.principles.p2_heading": {
		ja: "原則2: 影・グロー・ソフトシャドウを付けない",
		en: "Principle 2: No drop shadows, glows, or soft shadows",
		"zh-CN": "原则 2：不要添加阴影、辉光、柔和投影",
	},
	"guide.principles.p2_body": {
		ja: "被写体と背景の間にできる半透明のグラデーションは、透過後のフチ残りや輪郭の変色の原因になります。",
		en: "The semi-transparent gradient between the subject and the background leaves a fringe or discolors the outline once the background is removed.",
		"zh-CN":
			"主体与背景之间的半透明渐变，会在透明化之后留下残边，或让轮廓变色。",
	},
	"guide.principles.p3_heading": {
		ja: "原則3: 被写体を見切れさせず、余白を取る",
		en: "Principle 3: Keep the subject uncropped and leave a margin",
		"zh-CN": "原则 3：不要让主体出框，四周留出空白",
	},
	"guide.principles.p3_body": {
		ja: "被写体が画像の端に接していると、背景の推定が乱れます。全身が収まり、周囲に余白のある構図にします。",
		en: "When the subject touches the edge of the image, background estimation breaks down. Compose so the whole subject fits with margin around it.",
		"zh-CN":
			"主体一旦贴到画面边缘，背景推定就会出现混乱。请让主体完整入画，四周留出空白。",
	},
	"guide.principles.p4_heading": {
		ja: "原則4: 傾けない",
		en: "Principle 4: Do not tilt the image",
		"zh-CN": "原则 4：不要倾斜",
	},
	"guide.principles.p4_body": {
		ja: "ドットのグリッドがわずかに傾いた画像は苦手です。生成の段階でまっすぐな構図にします。",
		en: "Images whose pixel grid is slightly tilted are hard to handle. Ask for a straight composition at generation time.",
		"zh-CN": "像素网格轻微倾斜的图片很难处理。请在生成阶段就要求端正的构图。",
	},
	"guide.principles.p5_heading": {
		ja: "原則5: 1画像1被写体・ドットの大きさを揃える",
		en: "Principle 5: One subject per image, with a uniform pixel size",
		"zh-CN": "原则 5：一图一主体，并统一像素大小",
	},
	"guide.principles.p5_body": {
		ja: "複数のスプライトを1枚にまとめた画像や、場所によってドットの大きさが違う画像は、グリッド検出を混乱させます。",
		en: "Sheets that pack several sprites into one image, or images whose pixel size varies from place to place, confuse grid detection.",
		"zh-CN":
			"把多个精灵拼在一张图上，或者不同区域像素大小不一致的图片，都会干扰网格检测。",
	},
	"guide.principles.no_effort_heading": {
		ja: "逆に、頑張らなくてよいこと",
		en: "What you do not need to work hard for",
		"zh-CN": "反过来，不必刻意追求的事",
	},
	"guide.principles.no_effort_body": {
		ja: "アンチエイリアスを完全に消すことや、正確に 32×32 ピクセルで生成することは、生成側で頑張る必要はありません。<code>32x32 pixel art</code> のような指定はそのまま守られなくても、ドットを大きく均一にする方向に働くので有効です。",
		en: "You do not need to remove anti-aliasing completely, or to land on exactly 32×32 pixels, at the generation stage. Even when an instruction such as <code>32x32 pixel art</code> is not followed literally, it still pushes the model toward larger, more uniform pixels, so it is worth including.",
		"zh-CN":
			"在生成阶段不必完全消除抗锯齿，也不必精确输出 32×32 像素。<code>32x32 pixel art</code> 这类指定即使没有被严格遵守，也会促使模型输出更大、更均匀的像素，因此仍然值得写上。",
	},
	"guide.recipes.heading": {
		ja: "レシピ集",
		en: "Recipes",
		"zh-CN": "配方集",
	},
	"guide.recipes.intro": {
		ja: "各レシピでは、プロンプト、生成画像、Pixel Refiner の設定、変換結果を順に紹介します。作例は、掲載したプロンプトで生成し、掲載した設定で変換したものです。",
		en: "Each recipe shows a prompt, the image it generated, the Pixel Refiner settings, and the converted result. Each example was generated with the shown prompt and converted with the shown settings.",
		"zh-CN":
			"每个配方会依次介绍提示词、生成图片、Pixel Refiner 设置和转换结果。每个示例都使用页面所示的提示词生成，并按页面所示的设置转换。",
	},
	"guide.recipes.goal_label": {
		ja: "ねらい",
		en: "Goal",
		"zh-CN": "目标",
	},
	"guide.recipes.settings_label": {
		ja: "Pixel Refiner の設定",
		en: "Pixel Refiner settings",
		"zh-CN": "Pixel Refiner 设置",
	},
	"guide.recipes.download_source": {
		ja: "この生成画像を原寸でダウンロードして、同じ手順を試す",
		en: "Download this generated image at full size and try the same steps",
		"zh-CN": "下载这张生成图片的原始尺寸版本，按同样的步骤试用",
	},
	"guide.recipes.scale_actual": {
		ja: "等倍",
		en: "Actual size (1×)",
		"zh-CN": "原尺寸",
	},
	"guide.recipes.scale_zoomed": {
		ja: "4倍表示",
		en: "Enlarged (4×)",
		"zh-CN": "4 倍显示",
	},
	"guide.recipe1.heading": {
		ja: "レシピ1: ゲームキャラクターのスプライト",
		en: "Recipe 1: Game character sprite",
		"zh-CN": "配方 1：游戏角色精灵",
	},
	"guide.recipe1.goal": {
		ja: "透過素材の基本形。背景色の選び方（暖色のキャラ × マゼンタ背景）と、見切れ防止の余白がテーマです。",
		en: "The basic form of a transparent asset. The themes are how to choose the background color (a warm-colored character against a magenta background) and leaving margin so the subject is never cropped.",
		"zh-CN":
			"透明素材的基本形态。重点是背景色的选法（暖色角色配品红背景），以及留出空白避免出框。",
	},
	"guide.recipe1.settings": {
		ja: "「プリセット」を「おまかせ」のままにします（背景は自動で透過されます）。",
		en: "Leave Preset on “Best Match” (the background is made transparent automatically).",
		"zh-CN": "把“预设”保持为“智能推荐”（背景会自动透明化）。",
	},
	"guide.recipe1.input_alt": {
		ja: "レシピ1の生成画像。マゼンタ背景に、剣と盾を持つ騎士のドット絵",
		en: "Generated image for recipe 1: a knight sprite with a sword and shield on a magenta background",
		"zh-CN": "配方 1 的生成图片：品红背景上手持剑与盾的骑士像素画",
	},
	"guide.recipe1.output_alt": {
		ja: "レシピ1の変換結果。背景が透過した騎士のドット絵",
		en: "Converted result for recipe 1: the knight sprite with a transparent background",
		"zh-CN": "配方 1 的转换结果：背景已透明的骑士像素画",
	},
	"guide.recipe1.caption_input": {
		ja: "生成画像（2048×2048px・縮小表示）",
		en: "Generated image (2048×2048 px, shown scaled down)",
		"zh-CN": "生成图片（2048×2048px，缩小显示）",
	},
	"guide.recipe1.caption_output": {
		ja: "変換結果（おまかせ・60×85px の等倍出力）",
		en: "Converted result (Best Match, 60×85 px output)",
		"zh-CN": "转换结果（智能推荐，60×85px 的原尺寸输出）",
	},
	"guide.recipe2.heading": {
		ja: "レシピ2: アイテムアイコン",
		en: "Recipe 2: Item icon",
		"zh-CN": "配方 2：道具图标",
	},
	"guide.recipe2.goal": {
		ja: "UI 用の単一オブジェクト。赤い被写体に緑の背景を組み合わせると、背景と被写体を区別しやすく、きれいに透過できます。",
		en: "A single object for UI use. Pairing a red subject with a green background makes the two easy to separate for clean background removal.",
		"zh-CN":
			"用于 UI 的单一物件。红色主体搭配绿色背景后，背景与主体更容易区分，透明化效果也会更干净。",
	},
	"guide.recipe2.settings": {
		ja: "「プリセット」で「透過アイコン」を選びます。背景を透過し、32色に減色します。",
		en: "Choose the “Transparent Icon” preset. It removes the background and reduces the image to 32 colors.",
		"zh-CN": "在“预设”中选择“透明图标”。背景会被透明化，颜色会减至 32 色。",
	},
	"guide.recipe2.input_alt": {
		ja: "レシピ2の生成画像。緑背景に、赤いポーション瓶のドット絵",
		en: "Generated image for recipe 2: a red potion bottle on a bright green background",
		"zh-CN": "配方 2 的生成图片：绿色背景上的红色药水瓶像素画",
	},
	"guide.recipe2.output_alt": {
		ja: "レシピ2の変換結果。背景が透過したポーション瓶のドット絵",
		en: "Converted result for recipe 2: the potion bottle with a transparent background",
		"zh-CN": "配方 2 的转换结果：背景已透明的药水瓶像素画",
	},
	"guide.recipe2.caption_input": {
		ja: "生成画像（2752×1536px・縮小表示）",
		en: "Generated image (2752×1536 px, shown scaled down)",
		"zh-CN": "生成图片（2752×1536px，缩小显示）",
	},
	"guide.recipe2.caption_output": {
		ja: "変換結果（透過アイコン・16×23px の等倍出力）",
		en: "Converted result (Transparent Icon, 16×23 px output)",
		"zh-CN": "转换结果（透明图标，16×23px 的原尺寸输出）",
	},
	"guide.recipe3.heading": {
		ja: "レシピ3: レトロ携帯ゲーム機風（Game Boy パレット）",
		en: "Recipe 3: Retro handheld look (Game Boy palette)",
		"zh-CN": "配方 3：复古掌机风格（Game Boy 调色板）",
	},
	"guide.recipe3.goal": {
		ja: "生成の段階から階調を絞っておき、パレット変換で選んだ機種の4階調へ正確に置き換えます。生成時の色そのものは残らないので、背景は仕上がりの色ではなく消しやすい色（緑の被写体に赤）で指定します。",
		en: "Ask for few tones at the generation stage, then let palette conversion map them exactly onto the four tones of the console you choose. The generated colors themselves do not survive, so the background is specified for easy removal — red against a green subject — rather than for the finished look.",
		"zh-CN":
			"在生成阶段就把层次压少，再用调色板转换精确替换成所选机型的 4 个色阶。生成时的颜色本身不会保留，所以背景色不按成品的颜色来指定，而按容易去除来指定（绿色主体配红色背景）。",
	},
	"guide.recipe3.settings": {
		ja: "「プリセット」で「レトロゲーム風」を選びます。背景は自動で透過されます。",
		en: "Choose the “Retro Game Style” preset. The background is made transparent automatically.",
		"zh-CN": "在“预设”中选择“复古游戏风格”。背景会自动透明化。",
	},
	"guide.recipe3.input_alt": {
		ja: "レシピ3の生成画像。赤い背景に緑のドラゴンのドット絵",
		en: "Generated image for recipe 3: a green dragon on a red background",
		"zh-CN": "配方 3 的生成图片：红色背景上的绿色小龙像素画",
	},
	"guide.recipe3.output_alt": {
		ja: "レシピ3の変換結果。背景が透過し、4階調のグレーになったドラゴンのドット絵",
		en: "Converted result for recipe 3: the dragon in four shades of gray with a transparent background",
		"zh-CN": "配方 3 的转换结果：背景已透明、变成 4 个灰色色阶的小龙像素画",
	},
	"guide.recipe3.caption_input": {
		ja: "生成画像（2816×1536px・縮小表示）",
		en: "Generated image (2816×1536 px, shown scaled down)",
		"zh-CN": "生成图片（2816×1536px，缩小显示）",
	},
	"guide.recipe3.caption_output": {
		ja: "変換結果（レトロゲーム風・44×47px の等倍出力）",
		en: "Converted result (Retro Game Style, 44×47 px output)",
		"zh-CN": "转换结果（复古游戏风格，44×47px 的原尺寸输出）",
	},
	"guide.recipe4.heading": {
		ja: "レシピ4: 背景用の一枚絵",
		en: "Recipe 4: Scenery for a background",
		"zh-CN": "配方 4：用作背景的整幅插画",
	},
	"guide.recipe4.goal": {
		ja: "透過しないケース。キャラクターや小物を置かない風景を、そのまま背景として使えるドット絵に変換します。要素を減らして1ドットを大きく描かせる指示がポイントです。",
		en: "A case without transparency. A landscape with no characters or props is turned into pixel art you can use as a background as it is. The key is asking for few elements and large pixels.",
		"zh-CN":
			"不做透明化的情况。把没有角色和小物件的风景，转换成可以直接当作背景使用的像素画。关键是要求减少元素、把每个像素画得更大。",
	},
	"guide.recipe4.settings": {
		ja: "「プリセット」で「背景用の一枚絵」を選びます。",
		en: "Choose the “Background Artwork” preset.",
		"zh-CN": "在“预设”中选择“背景插画”。",
	},
	"guide.recipe4.input_alt": {
		ja: "レシピ4の生成画像。明るい空の下に緑の平原と青い山並みを描いたドット絵",
		en: "Generated image for recipe 4: green fields and blue mountains beneath a bright sky",
		"zh-CN": "配方 4 的生成图片：明亮天空下的绿色原野与蓝色群山像素画",
	},
	"guide.recipe4.output_alt": {
		ja: "レシピ4の変換結果。山岳風景を背景ごと残したドット絵",
		en: "Converted result for recipe 4: the mountain landscape kept as a full-frame background",
		"zh-CN": "配方 4 的转换结果：保留完整背景的山野风景像素画",
	},
	"guide.recipe4.input_zoom_alt": {
		ja: "レシピ4の生成画像で、左側の山頂にあるドット境界を部分拡大したもの",
		en: "Close-up of the pixel boundary along the left-hand mountain peak before conversion",
		"zh-CN": "配方 4 生成图片中左侧山峰像素边界的局部放大图",
	},
	"guide.recipe4.output_zoom_alt": {
		ja: "レシピ4の変換結果で、同じドット境界を部分拡大したもの。色と輪郭がドット単位で揃っている",
		en: "Close-up of the same pixel boundary after conversion, with colors and edges aligned to the pixel grid",
		"zh-CN":
			"配方 4 转换结果中同一像素边界的局部放大图，颜色和轮廓已对齐像素网格",
	},
	"guide.recipe4.view_whole": {
		ja: "全体",
		en: "Whole image",
		"zh-CN": "整体",
	},
	"guide.recipe4.view_detail": {
		ja: "山頂の境界",
		en: "Peak edge",
		"zh-CN": "山峰边界",
	},
	"guide.recipe4.caption_input": {
		ja: "生成画像（2752×1536px・全体と、変換結果と同じ範囲を切り出した山頂境界）",
		en: "Generated image (2752×1536 px; whole image and the peak edge cropped to the same area)",
		"zh-CN": "生成图片（2752×1536px，整体与截取自同一范围的山峰边界）",
	},
	"guide.recipe4.caption_output": {
		ja: "変換結果（背景用の一枚絵・256×144px・全体と、同じ山頂境界を1ドット10px相当で拡大したもの）",
		en: "Converted result (Background Artwork, 256×144 px; whole image and the same peak edge, one dot enlarged to 10 px)",
		"zh-CN":
			"转换结果（背景插画，256×144px，整体与同一山峰边界，每个像素放大到 10px）",
	},
	"guide.recipe5.heading": {
		ja: "レシピ5: 普通のイラストをドット絵化する",
		en: "Recipe 5: Turn a normal illustration into pixel art",
		"zh-CN": "配方 5：把普通插画转成像素画",
	},
	"guide.recipe5.goal": {
		ja: "ドット絵風に生成できないモデルや画風でも、普通のイラストからドット絵へ変換できます。ドット絵を頼む代わりに、変換に強く効くフラットな塗りと太い輪郭線を指示します。",
		en: "Even with models or styles that cannot generate pixel art directly, an ordinary illustration can be converted into pixel art. Flat coloring and thick outlines survive the conversion well, so ask for them instead of asking for pixel art.",
		"zh-CN":
			"即使模型或画风无法直接生成像素画，也可以把普通插画转换成像素画。与其要求生成像素画，不如要求对转换特别有利的平涂上色和粗轮廓线。",
	},
	"guide.recipe5.settings": {
		ja: "「プリセット」で「イラストをドット絵に変換」を選びます。ドットの粗さを変えたいときは、その後「かんたん設定」の「ドットの細かさ」で調整します。",
		en: "Choose the “Convert Illustration to Pixel Art” preset. To make the pixels coarser or finer, adjust Pixel Detail in Quick Settings afterward.",
		"zh-CN":
			"在“预设”中选择“将插画转换为像素画”。想改变像素的粗细时，再用“快速设置”中的“像素细节”调整。",
	},
	"guide.recipe5.input_alt": {
		ja: "レシピ5の生成画像。青い背景に、フラットな塗りのデフォルメキャラクターのイラスト",
		en: "Generated image for recipe 5: a chibi character in flat colors on a blue background",
		"zh-CN": "配方 5 的生成图片：蓝色背景上、平涂上色的Q版角色插画",
	},
	"guide.recipe5.output_alt": {
		ja: "レシピ5の変換結果。背景が透過し、ドット絵になったデフォルメキャラクター",
		en: "Converted result for recipe 5: the chibi character redrawn as pixel art with a transparent background",
		"zh-CN": "配方 5 的转换结果：背景已透明、变成像素画的Q版角色",
	},
	"guide.recipe5.caption_input": {
		ja: "生成画像（2816×1536px・縮小表示）",
		en: "Generated image (2816×1536 px, shown scaled down)",
		"zh-CN": "生成图片（2816×1536px，缩小显示）",
	},
	"guide.recipe5.caption_output": {
		ja: "変換結果（イラストをドット絵に変換・60×81px の等倍出力）",
		en: "Converted result (Convert Illustration to Pixel Art, 60×81 px output)",
		"zh-CN": "转换结果（将插画转换为像素画，60×81px 的原尺寸输出）",
	},
	"guide.troubleshooting.heading": {
		ja: "うまくいかないときは",
		en: "When It Does Not Work",
		"zh-CN": "效果不理想时",
	},
	"guide.troubleshooting.col_symptom": {
		ja: "症状",
		en: "Symptom",
		"zh-CN": "现象",
	},
	"guide.troubleshooting.col_cause": {
		ja: "原因",
		en: "Cause",
		"zh-CN": "原因",
	},
	"guide.troubleshooting.col_fix": {
		ja: "プロンプトの直し方",
		en: "How to fix the prompt",
		"zh-CN": "提示词的调整方法",
	},
	"guide.troubleshooting.r1_symptom": {
		ja: "キャラクターの白目などに穴が開く",
		en: "Holes appear in the whites of the character's eyes",
		"zh-CN": "角色的眼白等部位出现空洞",
	},
	"guide.troubleshooting.r1_cause": {
		ja: "背景色が被写体の中にも使われている",
		en: "The background color also appears inside the subject",
		"zh-CN": "背景色也出现在主体内部",
	},
	"guide.troubleshooting.r1_fix": {
		ja: "背景を被写体に含まれない原色に変える（例: <code>full frame edge-to-edge solid magenta background</code>）",
		en: "Switch the background to a saturated color that never appears in the subject (for example <code>full frame edge-to-edge solid magenta background</code>)",
		"zh-CN":
			"把背景换成主体中不存在的纯色（例如 <code>full frame edge-to-edge solid magenta background</code>）",
	},
	"guide.troubleshooting.r2_symptom": {
		ja: "輪郭の周りに背景色のフチが残る・にじむ",
		en: "A fringe of background color remains or bleeds around the outline",
		"zh-CN": "轮廓周围残留背景色的边缘或发生渗色",
	},
	"guide.troubleshooting.r2_cause": {
		ja: "影やグローが被写体の周囲にある",
		en: "A shadow or glow surrounds the subject",
		"zh-CN": "主体周围存在阴影或辉光",
	},
	"guide.troubleshooting.r2_fix": {
		ja: "<code>no drop shadow, no outer glow, flat lighting</code> を追加する",
		en: "Add <code>no drop shadow, no outer glow, flat lighting</code>",
		"zh-CN": "追加 <code>no drop shadow, no outer glow, flat lighting</code>",
	},
	"guide.troubleshooting.r3_symptom": {
		ja: "出力サイズが極端に小さい・ドットが潰れる",
		en: "The output is far too small, or pixels collapse",
		"zh-CN": "输出尺寸过小、像素被压扁",
	},
	"guide.troubleshooting.r3_cause": {
		ja: "画像内でドットの大きさが揃っていない",
		en: "Pixel size is not uniform within the image",
		"zh-CN": "图片内部的像素大小不一致",
	},
	"guide.troubleshooting.r3_fix": {
		ja: "<code>consistent pixel size throughout</code> を追加する。結果の候補選択が出た場合は見比べて選ぶ",
		en: "Add <code>consistent pixel size throughout</code>. If the result chooser appears, compare the candidates and pick one",
		"zh-CN":
			"追加 <code>consistent pixel size throughout</code>。出现结果候选时请对比后选择",
	},
	"guide.troubleshooting.r4_symptom": {
		ja: "輪郭がギザギザに波打つ・斜めになる",
		en: "Outlines ripple with jagged steps or run diagonally",
		"zh-CN": "轮廓呈锯齿状起伏或整体倾斜",
	},
	"guide.troubleshooting.r4_cause": {
		ja: "生成画像がわずかに傾いている",
		en: "The generated image is slightly tilted",
		"zh-CN": "生成图片存在轻微倾斜",
	},
	"guide.troubleshooting.r4_fix": {
		ja: "<code>upright, straight-on</code> を追加して生成し直す",
		en: "Add <code>upright, straight-on</code> and generate again",
		"zh-CN": "追加 <code>upright, straight-on</code> 后重新生成",
	},
	"guide.troubleshooting.r5_symptom": {
		ja: "被写体の端が欠ける",
		en: "The edge of the subject is missing",
		"zh-CN": "主体的边缘缺失",
	},
	"guide.troubleshooting.r5_cause": {
		ja: "被写体が画像の端で見切れている",
		en: "The subject is cropped at the edge of the image",
		"zh-CN": "主体在画面边缘被裁切",
	},
	"guide.troubleshooting.r5_fix": {
		ja: "<code>full body, centered, with margin, not cropped</code> を追加する",
		en: "Add <code>full body, centered, with margin, not cropped</code>",
		"zh-CN": "追加 <code>full body, centered, with margin, not cropped</code>",
	},
	"guide.notes.heading": {
		ja: "注記",
		en: "Notes",
		"zh-CN": "备注",
	},
	"guide.notes.body": {
		ja: "作例は Google Gemini（Nano Banana 2）で生成しています。プロンプトの効き方は生成モデルやバージョンによって異なります。意図通りにならないときは、表現を少しずつ変えて複数回生成し、このページの原則に合う1枚を選んでください。",
		en: "The samples were generated with Google Gemini (Nano Banana 2). How well a prompt works depends on the model and its version. When the result is not what you intended, vary the wording a little, generate several times, and pick the one image that matches the principles on this page.",
		"zh-CN":
			"示例图片使用 Google Gemini（Nano Banana 2）生成。提示词的效果会随生成模型和版本而变化。如果结果不理想，请逐步调整措辞并多生成几次，从中挑选最符合本页原则的一张。",
	},
});
