import type { QualityCaseResult } from "../types";

// [Policy] ケースの説明だけで内容を理解できるように、入力の特性、検証する処理、
// 変化してはならない点を記載する。画像テストの追加時は「画像を保持する」のような
// 曖昧な表現を避ける。
export const describeCase = (
	result: QualityCaseResult,
): { en: string; ja: string } => {
	const options = result.options;
	if (result.parameterMode === "auto") {
		return {
			en:
				"Process the fixture with Auto and the default settings only, with no case-specific options, " +
				"and keep the automatic classification, route, and output grid identical to the approved baseline. " +
				"The target comparison additionally measures how far the output still is from the fixed target image.",
			ja:
				"ケース固有のオプションを与えず、Autoと既定設定のみでfixtureを処理し、" +
				"自動判定の分類、route、出力グリッドを承認済みベースラインから変化させないことを確認します。" +
				"あわせて、固定した目標画像までの残りの差を目標との比較で測ります。",
		};
	}
	if (result.id === "guide-recipe1-knight-sprite") {
		return {
			en:
				"Process the 2048 x 2048 AI-generated knight published in the recipes guide, whose " +
				"cell boundaries are antialiased over a magenta background, with the Best Match preset " +
				"the page tells the reader to select, and reproduce the published 60 x 85 result pixel " +
				"for pixel. A mismatch means the published image no longer follows from the published steps.",
			ja:
				"レシピ集ページが掲載しているマゼンタ背景・2048×2048の生成AI製の騎士（セル境界はアンチエイリアス）を、" +
				"ページが案内するとおり「おまかせ仕上げ」プリセットのまま処理し、掲載している60×85の変換結果と1画素も違わないことを確認します。" +
				"一致しなくなった場合は、掲載画像が掲載手順の結果ではなくなっています。",
		};
	}
	if (result.id === "guide-recipe2-potion-icon") {
		return {
			en:
				"Process the 2752 x 1536 AI-generated potion bottle published in the recipes guide, " +
				"drawn over a chroma-key green background, with the Transparent Icon preset the page tells " +
				"the reader to select, and reproduce the published 16 x 23 result pixel for pixel, including " +
				"the transparent background.",
			ja:
				"レシピ集ページが掲載している緑背景・2752×1536の生成AI製のポーション瓶を、" +
				"ページが案内するとおり「透過アイコン」プリセットのまま処理し、" +
				"背景を透過した掲載中の16×23の変換結果と1画素も違わないことを確認します。",
		};
	}
	if (result.id === "guide-recipe3-dragon-sprite") {
		return {
			en:
				"Process the 2816 x 1536 AI-generated green dragon published in the recipes guide, " +
				"drawn over a red background, with the Retro Game Style preset the page tells the reader " +
				"to select, and reproduce the published 44 x 47 result pixel for pixel, " +
				"including the four-tone palette the conversion replaces the generated colors with.",
			ja:
				"レシピ集ページが掲載している赤背景・2816×1536の生成AI製の緑のドラゴンを、" +
				"ページが案内するとおり「レトロゲーム風」プリセットで処理し、" +
				"生成時の色を置き換えた4階調のパレットを含めて、" +
				"掲載している44×47の変換結果と1画素も違わないことを確認します。",
		};
	}
	if (result.id === "guide-recipe4-landscape") {
		return {
			en:
				"Process the 2752 x 1536 AI-generated mountain landscape published in the recipes guide, " +
				"whose pixel cells are softened by generation, with the Background Artwork preset the page " +
				"tells the reader to select, and reproduce the published 256 x 144 result " +
				"pixel for pixel without making any part of the full-frame scenery transparent.",
			ja:
				"レシピ集ページが掲載している2752×1536の生成AI製の山岳風景（生成時にセル境界がぼけたドット絵）を、" +
				"ページが案内するとおり「背景用の一枚絵」プリセットで処理し、" +
				"風景のどの部分も透過せず、掲載している256×144の変換結果と1画素も違わないことを確認します。",
		};
	}
	if (result.id === "guide-recipe5-chibi-character") {
		return {
			en:
				"Process the 2816 x 1536 AI-generated chibi character published in the recipes guide, " +
				"an ordinary flat-colored illustration rather than pixel art, with the Convert Illustration " +
				"to Pixel Art preset the page tells the reader to select, and reproduce the published " +
				"60 x 81 result pixel for pixel, including the " +
				"transparent background and the thick outlines carried over from the illustration.",
			ja:
				"レシピ集ページが掲載している青背景・2816×1536の生成AI製のデフォルメキャラクターを、" +
				"ドット絵ではないフラットな塗りのイラストのまま、" +
				"ページが案内するとおり「イラストをドット絵に変換」プリセットで処理し、" +
				"背景の透過とイラストから引き継いだ太い輪郭線を含めて、" +
				"掲載している60×81の変換結果と1画素も違わないことを確認します。",
		};
	}
	if (result.id === "restore-thin-features-and-alpha-coverage") {
		return {
			en:
				"Restore area-coverage alpha from enlarged artwork containing thin lines and highlights, " +
				"while selecting an input RGB without mixing in hidden colors from transparent pixels.",
			ja:
				"細線とハイライトを含む拡大画像から面積被覆アルファを復元し、" +
				"透明画素の隠れた色を混入させずに入力に存在するRGBを選択します。",
		};
	}
	if (result.id === "restore-soft-edged-sprite-to-34x47") {
		return {
			en:
				"Restore a 1254 x 1254 AI-generated pixel-art-style knight, whose cell boundaries carry " +
				"antialiasing instead of hard edges, to the hand-given 34 x 47 logical grid, keeping the " +
				"sword tip, the helmet slits, and the cross on the shield readable as single cells. " +
				"This output is the target that the Auto case for the same fixture is measured against.",
			ja:
				"セル境界がアンチエイリアスで鈍った1254×1254の生成AI製ドット絵風の騎士を、" +
				"人手で与えた34×47の論理グリッドへ復元し、剣先、兜のスリット、盾の十字を" +
				"1セルとして判読できる状態に保ちます。この出力は、同じfixtureのAutoケースが" +
				"目標として比較される画像です。",
		};
	}
	if (result.id === "restore-blocky-sprite-to-20x18") {
		return {
			en:
				"Restore a 1254 x 1254 AI-generated slime drawn in 39.7 px blocks to the hand-given " +
				"20 x 18 logical grid, keeping the single-cell eye highlight and the one-cell-thick mouth " +
				"line intact. Reconstruction error alone also accepts a roughly 5x finer reading of the " +
				"same image, so this output records which of the two scales is the intended one.",
			ja:
				"39.7pxのブロックで描かれた1254×1254の生成AI製スライムを、人手で与えた20×18の" +
				"論理グリッドへ復元し、1セルぶんの目のハイライトと1セル幅の口の線を保ちます。" +
				"再構成誤差だけでは同じ画像を約5倍細かく読む解釈も成り立つため、" +
				"この出力はどちらの倍率が意図された方かを記録します。",
		};
	}
	if (result.id === "convert-deterministic-auto-palette") {
		return {
			en:
				"Keep the image at its original 32 x 32 pixel dimensions and preserve " +
				"fully transparent pixels while reducing its 947 opaque input colors " +
				"to an automatically selected eight-color palette with full-strength Ordered dithering.",
			ja:
				"画像を32×32ピクセルの原寸に保ち、完全透明な画素を維持したまま、" +
				"947色ある不透明な入力色をAutoで選択した8色のパレットへ減色し、" +
				"強度100%のOrderedディザリングを適用します。",
		};
	}
	if (result.id === "convert-continuous-tone-balanced") {
		return {
			en:
				"Route a 48 x 32 continuous-tone image through Auto to the Convert pipeline, " +
				"derive three candidate resolutions from its aspect ratio and information density, " +
				"and emit the balanced candidate at 24 x 16 with edge-aware resampling instead of restoring an original grid.",
			ja:
				"48×32の連続階調画像をAuto判定からConvertパイプラインへ流し、" +
				"縦横比と情報量から3つの候補解像度を導出したうえで、" +
				"元グリッドの復元ではなく標準候補の24×16へエッジ考慮のリサンプルで変換します。",
		};
	}
	if (result.id === "convert-illustration-detailed") {
		return {
			en:
				"Convert a 72 x 48 illustration with transparent margins and thin high-contrast lines " +
				"to the detailed candidate at 54 x 36, keeping fully transparent pixels transparent and " +
				"never picking the RGB of a nearly transparent pixel as a cell's representative color.",
			ja:
				"透明余白と高コントラストの細線を含む72×48のイラストを細かめ候補の54×36へ変換し、" +
				"完全透明な画素を透明に保ったまま、ほぼ透明な画素のRGBをセルの代表色に選ばないことを確認します。",
		};
	}
	if (result.id === "retain-protected-small-details") {
		return {
			en:
				"Remove isolated background noise while retaining paired eyes, dakuten, " +
				"and disconnected star and spark details in native-resolution pixel art.",
			ja:
				"等倍のドット絵から孤立した背景ノイズを除去しつつ、対になった目、濁点、" +
				"分離した星と光の細部を保持します。",
		};
	}
	if (result.id === "remove-isolated-small-noise") {
		return {
			en:
				"Remove a weak isolated one-pixel noise component from a uniform background " +
				"without changing the main native-resolution subject.",
			ja:
				"一様な背景にある弱い1ピクセルの孤立ノイズを除去し、" +
				"等倍の主被写体を変化させずに保持します。",
		};
	}
	if (result.id === "skip-small-removal-on-uncertain-background") {
		return {
			en:
				"Keep every pixel unchanged when automatic background confidence is too low " +
				"to safely classify disconnected details as removable noise.",
			ja:
				"自動背景の信頼度が低く、分離した細部を除去可能なノイズと安全に判定できない場合は、" +
				"すべての画素を変更せずに保持します。",
		};
	}
	if (options.reduceColorMode === "gb_pocket") {
		return {
			en: "Convert a continuous-tone image to the four-color Game Boy Pocket palette without dithering.",
			ja: "連続階調画像をディザリングなしでゲームボーイポケットの4色パレットへ変換します。",
		};
	}
	if (options.ditherMode === "floyd-steinberg") {
		return {
			en: "Convert the image to monochrome using full-strength Floyd-Steinberg dithering.",
			ja: "Floyd-Steinbergディザリングを強度100%で適用し、画像をモノクロへ変換します。",
		};
	}
	if (options.makeSquare) {
		return {
			en: "Pad the image to a square canvas without trimming or background removal.",
			ja: "画像をトリミングや背景除去なしで正方形キャンバスへ拡張します。",
		};
	}
	if (result.degradationPatterns.includes("continuous-tone")) {
		return {
			en: "Preserve a continuous-tone image without grid detection or downsampling.",
			ja: "連続階調画像をグリッド検出や縮小処理なしで保持します。",
		};
	}
	if (result.degradationPatterns.includes("pixel-art-1x")) {
		return {
			en: "Preserve native-resolution pixel art, including small disconnected components and its limited palette.",
			ja: "小さな分離パーツや少色パレットを含む等倍のドット絵をそのまま保持します。",
		};
	}
	const target =
		options.forcePixelsW !== undefined && options.forcePixelsH !== undefined
			? `${options.forcePixelsW} x ${options.forcePixelsH}`
			: null;
	if (result.degradationPatterns.length > 0) {
		const patterns = result.degradationPatterns.join(", ");
		return {
			en: `Correct ${patterns}${target ? ` and restore the image to ${target} pixels` : ""}.`,
			ja: `${patterns}の劣化を補正し${target ? `、${target}ピクセルへ復元` : ""}します。`,
		};
	}
	const stepsEn: string[] = [];
	const stepsJa: string[] = [];
	if (options.preRemoveBackground || options.postRemoveBackground) {
		stepsEn.push("remove the background");
		stepsJa.push("背景除去");
	}
	if (options.trimToContent) {
		stepsEn.push("trim transparent margins");
		stepsJa.push("透明余白のトリミング");
	}
	if (options.autoGridFromTrimmed || options.enableGridDetection !== false) {
		stepsEn.push("restore the detected pixel grid");
		stepsJa.push("検出したピクセルグリッドの復元");
	}
	if (stepsEn.length === 0) {
		return target
			? {
					en: `Resize the input image to ${target} pixels without background removal, transparent-margin trimming, or pixel-grid restoration.`,
					ja:
						"背景除去、透明余白のトリミング、ピクセルグリッド復元を行わず、" +
						`入力画像を${target}ピクセルへ変換します。`,
				}
			: {
					en: "Output the input image at its current dimensions without background removal, transparent-margin trimming, or pixel-grid restoration.",
					ja:
						"背景除去、透明余白のトリミング、ピクセルグリッド復元を行わず、" +
						"入力画像を現在の寸法のまま出力します。",
				};
	}
	return {
		en: `${stepsEn.join(", ")}${target ? `, then resize it to ${target} pixels` : ""}.`,
		ja: `${stepsJa.join("、")}${target ? `後、${target}ピクセルへ変換` : ""}します。`,
	};
};
