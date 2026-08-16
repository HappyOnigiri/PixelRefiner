import { defineMessages } from "../define-messages";

// 処理の実行時メッセージ（candidate. / warning. / error. / classification. / batch.）
export const processingMessages = defineMessages({
	// candidate.*
	"candidate.other_heading": {
		ja: "他の候補",
		en: "Other options",
		"zh-CN": "其他方案",
	},
	"candidate.recommended_badge": {
		ja: "おすすめ",
		en: "Recommended",
		"zh-CN": "推荐",
	},
	"candidate.metadata": {
		ja: "{width} × {height} px・{colors}色",
		en: "{width} × {height} px · {colors} colors",
		"zh-CN": "{width} × {height} px・{colors} 色",
	},
	"candidate.label.auto-result": {
		ja: "Auto結果",
		en: "Auto result",
		"zh-CN": "Auto结果",
	},
	"candidate.label.preserve": {
		ja: "原寸維持",
		en: "Keep original size",
		"zh-CN": "保持原尺寸",
	},
	"candidate.label.convert": {
		ja: "Convert候補",
		en: "Convert option",
		"zh-CN": "转换方案",
	},
	"candidate.label.cell_scale.quarter": {
		ja: "ドットをとても小さく",
		en: "Much smaller pixels",
		"zh-CN": "像素小很多",
	},
	"candidate.label.cell_scale.half": {
		ja: "ドットを小さく",
		en: "Smaller pixels",
		"zh-CN": "像素更小",
	},
	"candidate.label.cell_scale.same": {
		ja: "検出したドットのまま",
		en: "Detected pixel size",
		"zh-CN": "保持检测到的像素",
	},
	"candidate.label.cell_scale.double": {
		ja: "ドットを大きく",
		en: "Larger pixels",
		"zh-CN": "像素更大",
	},
	"candidate.label.cell_scale.quadruple": {
		ja: "ドットをとても大きく",
		en: "Much larger pixels",
		"zh-CN": "像素大很多",
	},
	"candidate.description.auto-result": {
		ja: "Auto処理で実際に採用された結果です。",
		en: "The result Auto processing actually used.",
		"zh-CN": "Auto处理实际采用的结果。",
	},
	"candidate.description.preserve": {
		ja: "縮小せず、安全に元の解像度を維持します。",
		en: "Keeps the original resolution without downscaling.",
		"zh-CN": "不缩小图像，安全保留原始分辨率。",
	},
	"candidate.description.convert": {
		ja: "通常画像としてドット絵風に変換します。",
		en: "Converts the image to pixel art as a regular picture.",
		"zh-CN": "按普通图像转换为像素画风格。",
	},
	"candidate.description.cell_scale.quarter": {
		ja: "検出したドットの1/4の大きさで復元します。",
		en: "Restores at a quarter of the detected pixel size.",
		"zh-CN": "以检测到的像素大小的 1/4 还原。",
	},
	"candidate.description.cell_scale.half": {
		ja: "検出したドットの半分の大きさで復元します。",
		en: "Restores at half the detected pixel size.",
		"zh-CN": "以检测到的像素大小的一半还原。",
	},
	"candidate.description.cell_scale.same": {
		ja: "検出したドットの大きさのまま復元します。",
		en: "Restores at the detected pixel size.",
		"zh-CN": "按检测到的像素大小还原。",
	},
	"candidate.description.cell_scale.double": {
		ja: "検出したドット2つ分を1ドットにまとめます。",
		en: "Merges every two detected pixels into one.",
		"zh-CN": "将每 2 个检测到的像素合并为 1 个。",
	},
	"candidate.description.cell_scale.quadruple": {
		ja: "検出したドット4つ分を1ドットにまとめます。",
		en: "Merges every four detected pixels into one.",
		"zh-CN": "将每 4 个检测到的像素合并为 1 个。",
	},
	// batch.*
	"batch.status.pending": {
		ja: "未処理",
		en: "Pending",
		"zh-CN": "待处理",
	},
	"batch.status.processing": {
		ja: "処理中",
		en: "Processing",
		"zh-CN": "处理中",
	},
	"batch.status.done": {
		ja: "完了",
		en: "Done",
		"zh-CN": "完成",
	},
	"batch.status.error": {
		ja: "エラー",
		en: "Error",
		"zh-CN": "错误",
	},
	// classification.*
	"classification.manual": {
		ja: "手動選択",
		en: "Manual selection",
		"zh-CN": "手动选择",
	},
	"classification.native-pixel": {
		ja: "原寸ドット絵",
		en: "Native pixel art",
		"zh-CN": "原始像素画",
	},
	"classification.scaled-pixel": {
		ja: "拡大ドット絵",
		en: "Scaled pixel art",
		"zh-CN": "放大像素画",
	},
	"classification.soft-pixel": {
		ja: "補間済みドット絵",
		en: "Interpolated pixel art",
		"zh-CN": "插值像素画",
	},
	"classification.continuous": {
		ja: "通常画像",
		en: "Continuous image",
		"zh-CN": "普通图像",
	},
	"classification.uncertain": {
		ja: "判定保留",
		en: "Uncertain",
		"zh-CN": "暂缓判断",
	},
	// error.*
	"error.no_image": {
		ja: "先に画像を選択してください。",
		en: "Please select an image first.",
		"zh-CN": "请先选择图片。",
	},
	"error.process_failed": {
		ja: "処理失敗",
		en: "Processing failed",
		"zh-CN": "处理失败",
	},
	"error.load_failed": {
		ja: "読み込み失敗",
		en: "Loading failed",
		"zh-CN": "加载失败",
	},
	// warning.*
	"warning.low_grid_confidence": {
		ja: "グリッド判定の信頼度が低いため、結果を確認してください。",
		en: "Grid confidence is low. Please check the result.",
		"zh-CN": "网格判断可信度较低，请检查结果。",
	},
	"warning.background_uncertain": {
		ja: "背景の判定が不確かです。",
		en: "The background detection is uncertain.",
		"zh-CN": "背景判断存在不确定性。",
	},
	"warning.background_removal_skipped": {
		ja: "背景が消えすぎると判定したため、背景の透過を中止しました。",
		en: "Background removal was skipped because too much would have been removed.",
		"zh-CN": "检测到背景可能被过度移除，已中止背景透明化。",
	},
	"warning.content_loss_risk": {
		ja: "処理によって内容が大きく失われた可能性があります。",
		en: "Processing may have removed a large amount of content.",
		"zh-CN": "处理可能导致大量内容丢失。",
	},
	"warning.one_axis_detection_failed": {
		ja: "片方向のグリッドを検出できませんでした。",
		en: "The grid could not be detected on one axis.",
		"zh-CN": "无法检测一个方向的网格。",
	},
	"warning.extreme_output_size": {
		ja: "出力サイズが非常に大きくなっています。",
		en: "The output size is extremely large.",
		"zh-CN": "输出尺寸非常大。",
	},
	"warning.no_content": {
		ja: "処理対象の内容を検出できませんでした。",
		en: "No processable content was detected.",
		"zh-CN": "未检测到可处理的内容。",
	},
	"warning.fallback_to_preserve": {
		ja: "安全のため元のサイズを維持しました。",
		en: "The original size was preserved for safety.",
		"zh-CN": "为安全起见，已保留原始尺寸。",
	},
	"warning.batch_partial_failure": {
		ja: "{total}件中{failed}件を処理できませんでした。成功した画像はZIPに含まれています。",
		en: "{failed} of {total} images could not be processed. Successful images are included in the ZIP.",
		"zh-CN":
			"{total} 张图片中有 {failed} 张处理失败。成功的图片已包含在 ZIP 中。",
	},
	"warning.pending_partial_failure": {
		ja: "{total}件中{failed}件を変換できませんでした。画像リストで対象を確認できます。",
		en: "{failed} of {total} images could not be converted. Check the image list to see which ones.",
		"zh-CN": "{total} 张图片中有 {failed} 张转换失败。可在图片列表中查看对象。",
	},
	"warning.unknown": {
		ja: "不明な処理警告です（{code}）。",
		en: "Unknown processing warning ({code}).",
		"zh-CN": "未知处理警告（{code}）。",
	},
	// error.*
	"error.palette_limit": {
		ja: "警告: 画像には{count}色が含まれています。パレットは256色に制限されます。",
		en: "Warning: The image contains {count} colors. Palette will be limited to 256 colors.",
		"zh-CN": "警告：图片包含{count}种颜色。调色板将限制为256色。",
	},
	"error.no_processed_images": {
		ja: "ダウンロード可能な処理済み画像がありません。",
		en: "No processed images available to download.",
		"zh-CN": "没有可下载的已处理图片。",
	},
	"error.download_failed": {
		ja: "ダウンロードに失敗しました",
		en: "Download failed",
		"zh-CN": "下载失败",
	},
});
