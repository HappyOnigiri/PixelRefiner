import { defineMessages } from "../define-messages";

// 詳細設定・かんたん設定の項目名と説明（setting.）
export const settingMessages = defineMessages({
	"setting.mode": {
		ja: "設定方式",
		en: "Settings mode",
		"zh-CN": "设置方式",
	},
	"setting.quick": {
		ja: "かんたん設定",
		en: "Quick Settings",
		"zh-CN": "快速设置",
	},
	"setting.preset": {
		ja: "プリセット",
		en: "Preset",
		"zh-CN": "预设",
	},
	"setting.quick_finish": {
		ja: "仕上がり",
		en: "Finish",
		"zh-CN": "效果",
	},
	"setting.quick_pixel_detail": {
		ja: "ドットの細かさ",
		en: "Pixel Detail",
		"zh-CN": "像素细节",
	},
	"setting.quick_colors": {
		ja: "減色",
		en: "Color Reduction",
		"zh-CN": "减色",
	},
	"setting.quick_background": {
		ja: "背景",
		en: "Background",
		"zh-CN": "背景",
	},
	"setting.quick_gradient": {
		ja: "グラデーション表現",
		en: "Gradient Texture",
		"zh-CN": "渐变纹理",
	},
	"setting.processing_mode": {
		ja: "仕上がり",
		en: "Finish",
		"zh-CN": "效果",
	},
	"setting.size": {
		ja: "サイズ",
		en: "Size",
		"zh-CN": "尺寸",
	},
	"setting.detail": {
		ja: "細かさ",
		en: "Detail",
		"zh-CN": "细节",
	},
	"setting.convert_output_size": {
		ja: "ドットの細かさ",
		en: "Pixel Detail",
		"zh-CN": "像素细节",
	},
	"setting.convert_output_width": {
		ja: "出力幅",
		en: "Output Width",
		"zh-CN": "输出宽度",
	},
	"setting.convert_output_height": {
		ja: "出力高さ",
		en: "Output Height",
		"zh-CN": "输出高度",
	},
	"setting.background": {
		ja: "背景透過",
		en: "Background Transparency",
		"zh-CN": "背景透明",
	},
	"setting.dithering": {
		ja: "ディザリング",
		en: "Dithering",
		"zh-CN": "抖动",
	},
	"setting.color_reduction": {
		ja: "減色",
		en: "Color Reduction",
		"zh-CN": "减色",
	},
	"setting.color_mode": {
		ja: "減色モード",
		en: "Reduction Mode",
		"zh-CN": "减色模式",
	},
	"setting.color_count": {
		ja: "色数",
		en: "Color Count",
		"zh-CN": "颜色数量",
	},
	"setting.dither_mode": {
		ja: "ディザリング",
		en: "Dithering",
		"zh-CN": "抖动",
	},
	"setting.dither_strength": {
		ja: "ディザリング強度 (%)",
		en: "Dither Strength (%)",
		"zh-CN": "抖动强度 (%)",
	},
	"setting.advanced": {
		ja: "詳細設定",
		en: "Advanced Settings",
		"zh-CN": "高级设置",
	},
	"setting.grid_detection": {
		ja: "グリッド検出",
		en: "Grid Detection",
		"zh-CN": "网格检测",
	},
	"setting.grid_mode": {
		ja: "グリッド検出モード",
		en: "Grid Detection Mode",
		"zh-CN": "网格检测模式",
	},
	"setting.quant_step": {
		ja: "減色段階",
		en: "Quantization Step",
		"zh-CN": "量化步长",
	},
	"setting.sample_window": {
		ja: "グリッド探索のサンプル範囲",
		en: "Grid Sampling Window",
		"zh-CN": "网格搜索采样范围",
	},
	"setting.cell_sampling_mode": {
		ja: "セル色のサンプリング",
		en: "Cell Color Sampling",
		"zh-CN": "单元格颜色采样",
	},
	"setting.preserve_thin_features": {
		ja: "細い線を保護",
		en: "Preserve Thin Features",
		"zh-CN": "保护细线",
	},
	"setting.auto_grid_from_trimmed": {
		ja: "内容から格子を推定",
		en: "Estimate Grid From Content",
		"zh-CN": "从内容推定网格",
	},
	"setting.phase_aware_grid_search": {
		ja: "位相考慮の格子探索",
		en: "Phase-aware Grid Search",
		"zh-CN": "相位感知网格搜索",
	},
	"setting.boundary_contrast_override": {
		ja: "境界コントラストで乗り換え",
		en: "Boundary Contrast Override",
		"zh-CN": "按边界对比度切换",
	},
	"setting.small_aspect_grid_alignment": {
		ja: "小さな格子の基準合わせ",
		en: "Small Grid Alignment",
		"zh-CN": "小网格基准对齐",
	},
	"setting.max_samples_per_cell": {
		ja: "セルごとの最大サンプル数",
		en: "Max Samples per Cell",
		"zh-CN": "每单元格最大采样数",
	},
	"setting.cell_alpha_threshold": {
		ja: "セル色のアルファ下限",
		en: "Cell Alpha Threshold",
		"zh-CN": "单元格 Alpha 下限",
	},
	"setting.auto_max_cells_w": {
		ja: "最大セル数（幅）",
		en: "Max Cells (Width)",
		"zh-CN": "最大单元格数（宽）",
	},
	"setting.auto_max_cells_h": {
		ja: "最大セル数（高さ）",
		en: "Max Cells (Height)",
		"zh-CN": "最大单元格数（高）",
	},
	"setting.detection_background_mask": {
		ja: "検出前に背景をマスク",
		en: "Mask Background For Detection",
		"zh-CN": "检测前遮罩背景",
	},
	"setting.background_mask_tolerance": {
		ja: "検出マスクの許容差",
		en: "Detection Mask Tolerance",
		"zh-CN": "检测遮罩容差",
	},
	"setting.grid_signal_color_boundary": {
		ja: "信号: 色境界",
		en: "Signal: Colour Boundary",
		"zh-CN": "信号：颜色边界",
	},
	"setting.grid_signal_luminance_alpha": {
		ja: "信号: 輝度・アルファ",
		en: "Signal: Luminance / Alpha",
		"zh-CN": "信号：亮度／Alpha",
	},
	"setting.grid_signal_autocorrelation": {
		ja: "信号: 自己相関",
		en: "Signal: Autocorrelation",
		"zh-CN": "信号：自相关",
	},
	"setting.grid_signal_reconstruction": {
		ja: "信号: 再構成誤差",
		en: "Signal: Reconstruction",
		"zh-CN": "信号：重建误差",
	},
	"setting.grid_signal_local_phase": {
		ja: "信号: 局所位相",
		en: "Signal: Local Phase",
		"zh-CN": "信号：局部相位",
	},
	"setting.background_dehalo": {
		ja: "縁のにじみを補正",
		en: "Reduce Edge Halo",
		"zh-CN": "修正边缘光晕",
	},
	"setting.background_edge_cleanup": {
		ja: "縁の汚染色を差し替え",
		en: "Clean Contaminated Edges",
		"zh-CN": "替换边缘污染色",
	},
	"setting.background_ramp_follow": {
		ja: "グラデーション背景を追従",
		en: "Follow Gradient Background",
		"zh-CN": "跟随渐变背景",
	},
	"setting.background_removal_rollback": {
		ja: "消えすぎたら巻き戻す",
		en: "Roll Back Over-removal",
		"zh-CN": "过度移除时回滚",
	},
	"setting.alpha_border_background_guard": {
		ja: "既存の透過を信用する",
		en: "Trust Existing Transparency",
		"zh-CN": "信任已有透明度",
	},
	"setting.background_confidence_gate": {
		ja: "背景の信頼度を要求",
		en: "Require Confident Background",
		"zh-CN": "要求背景可信",
	},
	"setting.small_component_background_gate": {
		ja: "整理も背景の信頼度に従う",
		en: "Gate Cleanup On Background",
		"zh-CN": "清理依赖背景可信度",
	},
	"setting.watermark_sampling_compat": {
		ja: "透かし除去後のサンプリング",
		en: "Watermark Sampling Fallback",
		"zh-CN": "水印移除后的采样",
	},
	"setting.trim_alpha_threshold": {
		ja: "トリミングのアルファ下限",
		en: "Trim Alpha Threshold",
		"zh-CN": "裁剪 Alpha 下限",
	},
	"setting.force_width": {
		ja: "強制幅 (px)",
		en: "Force Width (px)",
		"zh-CN": "强制宽度 (px)",
	},
	"setting.force_height": {
		ja: "強制高さ (px)",
		en: "Force Height (px)",
		"zh-CN": "强制高度 (px)",
	},
	"setting.fast_mode": {
		ja: "高速モード",
		en: "Fast Mode",
		"zh-CN": "快速模式",
	},
	"setting.make_square": {
		ja: "正方形にする",
		en: "Make Square",
		"zh-CN": "转为正方形",
	},
	"setting.keep_aspect_ratio": {
		ja: "アスペクト比を維持",
		en: "Keep Aspect Ratio",
		"zh-CN": "保持宽高比",
	},
	"setting.bg_removal": {
		ja: "背景透過",
		en: "Background Removal",
		"zh-CN": "背景透明化",
	},
	"setting.bg_method": {
		ja: "背景抽出方法",
		en: "Extraction Method",
		"zh-CN": "背景提取方式",
	},
	"setting.bg_rgb": {
		ja: "背景色(RGB)",
		en: "Background Color (RGB)",
		"zh-CN": "背景色 (RGB)",
	},
	"setting.bg_tolerance": {
		ja: "背景色の許容差",
		en: "Color Tolerance",
		"zh-CN": "背景色容差",
	},
	"setting.pre_remove": {
		ja: "事前の背景透過",
		en: "Pre-process Transparency",
		"zh-CN": "处理前透明化",
	},
	"setting.post_remove": {
		ja: "事後の背景透過",
		en: "Post-process Transparency",
		"zh-CN": "处理后透明化",
	},
	"setting.bg_removal_scope": {
		ja: "背景透過の範囲",
		en: "Background Removal Scope",
		"zh-CN": "背景透明化范围",
	},
	"setting.bg_connectivity": {
		ja: "連結判定",
		en: "Connectivity",
		"zh-CN": "连通判定",
	},
	"setting.gemini_watermark_removal": {
		ja: "Gemini透かしの除去",
		en: "Gemini Watermark Removal",
		"zh-CN": "移除 Gemini 水印",
	},
	"setting.small_component_mode": {
		ja: "小さな要素の整理",
		en: "Small Detail Cleanup",
		"zh-CN": "小组件清理",
	},
	"setting.trimming": {
		ja: "トリミング",
		en: "Trimming",
		"zh-CN": "裁剪",
	},
	"setting.outline": {
		ja: "アウトライン",
		en: "Outline",
		"zh-CN": "描边",
	},
	"setting.outline_style": {
		ja: "スタイル",
		en: "Style",
		"zh-CN": "样式",
	},
	"setting.outline_color": {
		ja: "色",
		en: "Color",
		"zh-CN": "颜色",
	},
	"setting.processing": {
		ja: "処理",
		en: "Processing",
		"zh-CN": "处理",
	},
	"setting.auto_process": {
		ja: "自動変換",
		en: "Auto Process",
		"zh-CN": "自动转换",
	},
});
