import { defineMessages } from "../define-messages";

// 画面の見出し・ボタン・ラベル・通知（app. / section. / ui. / modal. / footer. / notice. / result. / status.）
export const uiMessages = defineMessages({
	// app.*
	"app.title": {
		ja: "Pixel Refiner | AIドット絵の最適化・背景透過ツール",
		en: "Pixel Refiner | AI Pixel Art Optimizer & Background Remover",
		"zh-CN": "Pixel Refiner | AI 像素画优化与背景透明工具",
	},
	"app.description": {
		ja:
			'AIで生成したドット絵を、<span class="text-highlight">素材</span>や<span class="text-highlight">アイコン</span>として使えるクオリティに。<br />' +
			'<span class="text-highlight">アンチエイリアス除去</span>・<span class="text-highlight">背景透過</span>を数秒で完了します。',
		en:
			'Optimize AI-generated pixel art into <span class="text-highlight">high-quality assets</span> and <span class="text-highlight">icons</span>.<br />' +
			'Complete <span class="text-highlight">anti-aliasing removal</span> and <span class="text-highlight">background transparency</span> in seconds.',
		"zh-CN":
			'将 AI 生成的像素画优化为可直接用于<span class="text-highlight">素材</span>和<span class="text-highlight">图标</span>的品质。<br />' +
			'数秒内完成<span class="text-highlight">抗锯齿清理</span>和<span class="text-highlight">背景透明化</span>。',
	},
	"app.guide_link": {
		ja: "きれいにドット絵化できる画像の作り方（レシピ集）",
		en: "How to create images that convert cleanly (Prompt Recipes)",
		"zh-CN": "如何准备能干净转换成像素画的图片（配方集）",
	},
	// section.*
	"section.input": {
		ja: "入力画像",
		en: "Input Image",
		"zh-CN": "输入图片",
	},
	"section.result": {
		ja: "処理結果",
		en: "Result",
		"zh-CN": "处理结果",
	},
	"section.palette": {
		ja: "パレット",
		en: "Palette",
		"zh-CN": "调色板",
	},
	// ui.*
	"ui.process_btn": {
		ja: "処理を実行",
		en: "Process Image",
		"zh-CN": "开始处理",
	},
	"ui.images": {
		ja: "画像一覧",
		en: "Images",
		"zh-CN": "图片列表",
	},
	"ui.download_btn": {
		ja: "ダウンロード",
		en: "Download",
		"zh-CN": "下载",
	},
	"ui.export_gpl": {
		ja: ".GPLを書き出し",
		en: "Export .GPL",
		"zh-CN": "导出 .GPL",
	},
	"ui.export_png": {
		ja: ".PNGを書き出し",
		en: "Export .PNG",
		"zh-CN": "导出 .PNG",
	},
	"ui.import_palette": {
		ja: "パレットを読み込み",
		en: "Import Palette",
		"zh-CN": "导入调色板",
	},
	"ui.show_palette": {
		ja: "パレットを表示",
		en: "Show Palette",
		"zh-CN": "显示调色板",
	},
	"ui.clear_all": {
		ja: "すべてクリア",
		en: "Clear All",
		"zh-CN": "全部清除",
	},
	"ui.download_all": {
		ja: "一括ダウンロード",
		en: "Download All",
		"zh-CN": "全部下载",
	},
	"ui.download_all_zip": {
		ja: "一括ダウンロード (ZIP)",
		en: "Download All (ZIP)",
		"zh-CN": "全部下载 (ZIP)",
	},
	"ui.shared_palette": {
		ja: "共通パレット",
		en: "Shared palette",
		"zh-CN": "共用调色板",
	},
	"ui.include_diagnostics": {
		ja: "診断サマリーを含める",
		en: "Include diagnostic summary",
		"zh-CN": "包含诊断摘要",
	},
	"ui.remove_image": {
		ja: "画像を削除",
		en: "Remove Image",
		"zh-CN": "移除图片",
	},
	"ui.confirm_clear_all": {
		ja: "すべての画像を削除してもよろしいですか？",
		en: "Are you sure you want to clear all images?",
		"zh-CN": "确定要清除所有图片吗？",
	},
	"ui.size": {
		ja: "サイズ",
		en: "Size",
		"zh-CN": "尺寸",
	},
	"ui.view_compare": {
		ja: "比較",
		en: "Compare",
		"zh-CN": "对比",
	},
	"ui.compare_before_original": {
		ja: "元画像",
		en: "Original",
		"zh-CN": "原图",
	},
	"ui.compare_before_sanitized": {
		ja: "縮小のみ",
		en: "Downscaled only",
		"zh-CN": "仅缩小",
	},
	"ui.compare_preparing": {
		ja: "比較画像を準備中...",
		en: "Preparing comparison...",
		"zh-CN": "正在准备对比图...",
	},
	"ui.placeholder.input": {
		ja: '画像をここにドラッグ＆ドロップ<br /><span class="drop-subtext">または クリックして選択<br />(複数可)</span>',
		en: 'Drag & drop images here<br /><span class="drop-subtext">or Click to select<br />(Multiple allowed)</span>',
		"zh-CN":
			'将图片拖放到这里<br /><span class="drop-subtext">或点击选择<br />(支持多张)</span>',
	},
	"ui.placeholder.result": {
		ja: "処理結果がここに表示されます",
		en: "Processed result will appear here",
		"zh-CN": "处理结果会显示在这里",
	},
	"ui.close": {
		ja: "閉じる",
		en: "Close",
		"zh-CN": "关闭",
	},
	"ui.download_options": {
		ja: "ダウンロード種別を選択",
		en: "Select download options",
		"zh-CN": "选择下载类型",
	},
	// notice.*
	"notice.processing_mode_forced_size": {
		ja: "完全ピクセル指定が優先されるため、仕上がりは使用されません。",
		en: "Pixel Only takes priority, so Finish is not used.",
		"zh-CN": "完全像素指定优先，因此不会使用效果设置。",
	},
	// result.*
	"result.analysis": {
		ja: "判定: {classification} / {route} / 信頼度 {confidence}%",
		en: "Detected: {classification} / {route} / {confidence}% confidence",
		"zh-CN": "判断：{classification} / {route} / 可信度 {confidence}%",
	},
	// section.*
	"section.presets": {
		ja: "プリセット",
		en: "Presets",
		"zh-CN": "预设",
	},
	// ui.*
	"ui.preset_name": {
		ja: "プリセット名",
		en: "Preset Name",
		"zh-CN": "预设名称",
	},
	"ui.save_preset": {
		ja: "保存",
		en: "Save",
		"zh-CN": "保存",
	},
	"ui.load_preset": {
		ja: "ロード",
		en: "Load",
		"zh-CN": "加载",
	},
	"ui.delete_preset": {
		ja: "削除",
		en: "Delete",
		"zh-CN": "删除",
	},
	"ui.confirm_delete_preset": {
		ja: "プリセットを削除してもよろしいですか？",
		en: "Are you sure you want to delete this preset?",
		"zh-CN": "确定要删除此预设吗？",
	},
	"ui.confirm_overwrite_preset": {
		ja: "同じ名前のプリセットが既に存在します。上書きしますか？",
		en: "A preset with this name already exists. Do you want to overwrite it?",
		"zh-CN": "已存在同名预设。要覆盖它吗？",
	},
	"ui.preset_loaded": {
		ja: "プリセット「{name}」を読み込みました",
		en: 'Preset "{name}" loaded',
		"zh-CN": "已加载预设“{name}”",
	},
	"ui.preset_saved": {
		ja: "プリセット「{name}」を保存しました",
		en: 'Preset "{name}" saved',
		"zh-CN": "已保存预设“{name}”",
	},
	// status.*
	"status.processing": {
		ja: "処理中...",
		en: "Processing...",
		"zh-CN": "处理中...",
	},
	"status.processing_batch": {
		ja: "一括処理中... ({current}/{total})",
		en: "Batch Processing... ({current}/{total})",
		"zh-CN": "正在批量处理... ({current}/{total})",
	},
	// modal.*
	"modal.eyedropper.title": {
		ja: "背景色を選択",
		en: "Select Background Color",
		"zh-CN": "选择背景色",
	},
	"modal.eyedropper.instruction": {
		ja: "画像内の背景にしたい色をクリックしてください",
		en: "Click on the color in the image you want to set as background",
		"zh-CN": "点击图片中要作为背景的颜色",
	},
	// footer.*
	"footer.privacy": {
		ja: "画像はブラウザ内で安全に処理されます",
		en: "Images are processed safely within your browser",
		"zh-CN": "图片会在浏览器内安全处理",
	},
	"footer.qualityReport": {
		ja: "品質レポート",
		en: "Quality report",
		"zh-CN": "质量报告",
	},
});
