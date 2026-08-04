export type Elements = {
	dropArea: HTMLElement;
	inputCanvasContainer: HTMLElement;
	fileInput: HTMLInputElement;
	processButton: HTMLButtonElement;
	downloadButton: HTMLButtonElement;
	downloadDropdownButton: HTMLButtonElement;
	downloadMenu: HTMLElement;
	originalCanvas: HTMLCanvasElement;
	inputSize: HTMLElement;
	outputSize: HTMLElement;
	quantStepInput: HTMLInputElement;
	quantStepSlider: HTMLInputElement;
	forcePixelsWInput: HTMLInputElement;
	forcePixelsHInput: HTMLInputElement;
	sampleWindowInput: HTMLInputElement;
	sampleWindowSlider: HTMLInputElement;
	toleranceInput: HTMLInputElement;
	toleranceSlider: HTMLInputElement;
	preRemoveCheck: HTMLInputElement;
	postRemoveCheck: HTMLInputElement;
	bgRemovalScopeSelect: HTMLSelectElement;
	bgConnectivitySelect: HTMLSelectElement;
	trimToContentCheck: HTMLInputElement;
	fastAutoGridFromTrimmedCheck: HTMLInputElement;
	makeSquareCheck: HTMLInputElement;
	keepAspectRatioCheck: HTMLInputElement;
	gridDetectionModeSelect: HTMLSelectElement;
	reduceColorModeSelect: HTMLSelectElement;
	ditherModeSelect: HTMLSelectElement;
	colorCountInput: HTMLInputElement;
	colorCountSlider: HTMLInputElement;
	colorCountSetting: HTMLElement;
	ditherStrengthInput: HTMLInputElement;
	ditherStrengthSlider: HTMLInputElement;
	ditherStrengthSetting: HTMLElement;

	outlineStyleSelect: HTMLSelectElement;
	outlineColorInput: HTMLInputElement;

	smallComponentModeSelect: HTMLSelectElement;
	zoomOutputCheck: HTMLInputElement;
	gridOutputCheck: HTMLInputElement;
	outputPanel: HTMLElement;
	loadingOverlay: HTMLElement;
	bgExtractionMethod: HTMLSelectElement;
	rgbPickerContainer: HTMLElement;
	bgRgbInput: HTMLInputElement;
	bgColorInput: HTMLInputElement;
	eyedropperButton: HTMLButtonElement;
	eyedropperModal: HTMLElement;
	closeEyedropperModal: HTMLButtonElement;
	eyedropperCanvas: HTMLCanvasElement;

	autoProcessToggle: HTMLInputElement;
	builtInPresetSelect: HTMLSelectElement;
	quickProcessingModeSelect: HTMLSelectElement;
	quickDetailLevelSelect: HTMLSelectElement;
	quickColorsSelect: HTMLSelectElement;
	quickBackgroundSelect: HTMLSelectElement;
	quickBackgroundPicker: HTMLElement;
	quickBackgroundColorInput: HTMLInputElement;
	quickEyedropperButton: HTMLButtonElement;
	quickDitheringSelect: HTMLSelectElement;
	quickOutlineStyleSelect: HTMLSelectElement;
	quickAutoTrimCheck: HTMLInputElement;

	// パレット UI
	// パレット UI
	paletteColors: HTMLElement;
	exportGPLButton: HTMLButtonElement;
	exportPNGButton: HTMLButtonElement;
	fixedPaletteImportButton: HTMLButtonElement;
	showPaletteButton: HTMLButtonElement;
	paletteModal: HTMLElement;
	closePaletteModal: HTMLButtonElement;
	paletteFileInput: HTMLInputElement;

	// 比較ビュー
	// 結果モーダル
	resultModal: HTMLElement;
	closeResultModal: HTMLButtonElement;
	candidateModal: HTMLElement;

	// 比較モーダル
	compareModal: HTMLElement;
	closeCompareModal: HTMLButtonElement;
	compareContainer: HTMLElement;
	compBeforeImg: HTMLImageElement;
	compAfterImg: HTMLImageElement;
	btnViewCompare: HTMLButtonElement;
	btnCompareBeforeOriginal: HTMLButtonElement;
	btnCompareBeforeSanitized: HTMLButtonElement;

	// 画像リスト
	imageListPanel: HTMLElement;
	imageListContainer: HTMLElement;
	clearAllButton: HTMLButtonElement;
	downloadAllButton: HTMLButtonElement;
	downloadAllDropdownButton: HTMLButtonElement;
	downloadAllMenu: HTMLElement;
	sharedPaletteToggle: HTMLInputElement;
	includeDiagnosticsToggle: HTMLInputElement;

	// プリセット
	presetNameInput: HTMLInputElement;
	savePresetButton: HTMLButtonElement;
	loadPresetModalButton: HTMLButtonElement;
	presetModal: HTMLElement;
	closePresetModal: HTMLButtonElement;
	presetModalList: HTMLElement;
};

export const getElements = (): Elements => {
	const get = <T extends HTMLElement>(id: string) => {
		const el = document.getElementById(id);
		if (!el) {
			throw new Error(`Element #${id} not found.`);
		}
		return el as T;
	};
	return {
		dropArea: get<HTMLElement>("drop-area"),
		inputCanvasContainer: get<HTMLElement>("input-canvas-container"),
		fileInput: get<HTMLInputElement>("file-input"),
		processButton: get<HTMLButtonElement>("process-button"),
		downloadButton: get<HTMLButtonElement>("download-button"),
		downloadDropdownButton: get<HTMLButtonElement>("download-dropdown-button"),
		downloadMenu: get<HTMLElement>("download-menu"),
		originalCanvas: get<HTMLCanvasElement>("original-canvas"),
		inputSize: get<HTMLElement>("input-size"),
		outputSize: get<HTMLElement>("output-size"),
		quantStepInput: get<HTMLInputElement>("quant-step"),
		quantStepSlider: get<HTMLInputElement>("quant-step-slider"),
		forcePixelsWInput: get<HTMLInputElement>("force-pixels-w"),
		forcePixelsHInput: get<HTMLInputElement>("force-pixels-h"),
		sampleWindowInput: get<HTMLInputElement>("sample-window"),
		sampleWindowSlider: get<HTMLInputElement>("sample-window-slider"),
		toleranceInput: get<HTMLInputElement>("tolerance"),
		toleranceSlider: get<HTMLInputElement>("tolerance-slider"),
		preRemoveCheck: get<HTMLInputElement>("pre-remove"),
		postRemoveCheck: get<HTMLInputElement>("post-remove"),
		bgRemovalScopeSelect: get<HTMLSelectElement>("bg-removal-scope"),
		bgConnectivitySelect: get<HTMLSelectElement>("bg-connectivity"),
		trimToContentCheck: get<HTMLInputElement>("trim-to-content"),
		fastAutoGridFromTrimmedCheck: get<HTMLInputElement>(
			"fast-auto-grid-from-trimmed",
		),
		makeSquareCheck: get<HTMLInputElement>("make-square"),
		keepAspectRatioCheck: get<HTMLInputElement>("keep-aspect-ratio"),
		gridDetectionModeSelect: get<HTMLSelectElement>("grid-detection-mode"),
		reduceColorModeSelect: get<HTMLSelectElement>("reduce-color-mode"),
		ditherModeSelect: get<HTMLSelectElement>("dither-mode"),
		colorCountInput: get<HTMLInputElement>("color-count"),
		colorCountSlider: get<HTMLInputElement>("color-count-slider"),
		colorCountSetting: get<HTMLElement>("color-count-setting"),
		ditherStrengthInput: get<HTMLInputElement>("dither-strength"),
		ditherStrengthSlider: get<HTMLInputElement>("dither-strength-slider"),
		ditherStrengthSetting: get<HTMLElement>("dither-strength-setting"),

		outlineStyleSelect: get<HTMLSelectElement>("outline-style"),
		outlineColorInput: get<HTMLInputElement>("outline-color"),

		smallComponentModeSelect: get<HTMLSelectElement>("small-component-mode"),
		zoomOutputCheck: get<HTMLInputElement>("zoom-output"),
		gridOutputCheck: get<HTMLInputElement>("grid-output"),
		outputPanel: get<HTMLElement>("output-panel"),
		loadingOverlay: get<HTMLElement>("loading-overlay"),
		bgExtractionMethod: get<HTMLSelectElement>("bg-extraction-method"),
		rgbPickerContainer: get<HTMLElement>("rgb-picker-container"),
		bgRgbInput: get<HTMLInputElement>("bg-rgb-input"),
		bgColorInput: get<HTMLInputElement>("bg-color-input"),
		eyedropperButton: get<HTMLButtonElement>("eyedropper-button"),
		eyedropperModal: get<HTMLElement>("eyedropper-modal"),
		closeEyedropperModal: get<HTMLButtonElement>("close-eyedropper-modal"),
		eyedropperCanvas: get<HTMLCanvasElement>("eyedropper-canvas"),
		autoProcessToggle: get<HTMLInputElement>("auto-process-toggle"),
		builtInPresetSelect: get<HTMLSelectElement>("built-in-preset"),
		quickProcessingModeSelect: get<HTMLSelectElement>("quick-processing-mode"),
		quickDetailLevelSelect: get<HTMLSelectElement>("quick-detail-level"),
		quickColorsSelect: get<HTMLSelectElement>("quick-colors"),
		quickBackgroundSelect: get<HTMLSelectElement>("quick-background"),
		quickBackgroundPicker: get<HTMLElement>("quick-background-picker"),
		quickBackgroundColorInput: get<HTMLInputElement>("quick-background-color"),
		quickEyedropperButton: get<HTMLButtonElement>("quick-eyedropper-button"),
		quickDitheringSelect: get<HTMLSelectElement>("quick-dithering"),
		quickOutlineStyleSelect: get<HTMLSelectElement>("quick-outline-style"),
		quickAutoTrimCheck: get<HTMLInputElement>("quick-auto-trim"),
		paletteColors: get<HTMLElement>("palette-colors"),
		exportGPLButton: get<HTMLButtonElement>("export-gpl-button"),
		exportPNGButton: get<HTMLButtonElement>("export-png-button"),
		fixedPaletteImportButton: get<HTMLButtonElement>(
			"fixed-palette-import-button",
		),
		showPaletteButton: get<HTMLButtonElement>("show-palette-button"),
		paletteModal: get<HTMLElement>("palette-modal"),
		closePaletteModal: get<HTMLButtonElement>("close-palette-modal"),
		paletteFileInput: get<HTMLInputElement>("palette-file-input"),

		// 結果モーダル
		resultModal: get<HTMLElement>("result-modal"),
		closeResultModal: get<HTMLElement>("result-modal").querySelector(
			".js-close-result-modal",
		) as HTMLButtonElement,
		candidateModal: get<HTMLElement>("candidate-modal"),

		compareModal: get<HTMLElement>("compare-modal"),
		closeCompareModal: get<HTMLButtonElement>("close-compare-modal"),
		compareContainer: get<HTMLElement>("compare-container"),
		compBeforeImg: get<HTMLImageElement>("comp-before"),
		compAfterImg: get<HTMLImageElement>("comp-after"),
		btnViewCompare: get<HTMLButtonElement>("btn-view-compare"),
		btnCompareBeforeOriginal: get<HTMLButtonElement>(
			"btn-compare-before-original",
		),
		btnCompareBeforeSanitized: get<HTMLButtonElement>(
			"btn-compare-before-sanitized",
		),

		// 画像リスト
		imageListPanel: get<HTMLElement>("image-list-panel"),
		imageListContainer: get<HTMLElement>("image-list-container"),
		clearAllButton: get<HTMLButtonElement>("clear-all-button"),
		downloadAllButton: get<HTMLButtonElement>("download-all-button"),
		downloadAllDropdownButton: get<HTMLButtonElement>(
			"download-all-dropdown-button",
		),
		downloadAllMenu: get<HTMLElement>("download-all-menu"),
		sharedPaletteToggle: get<HTMLInputElement>("shared-palette-toggle"),
		includeDiagnosticsToggle: get<HTMLInputElement>(
			"include-diagnostics-toggle",
		),

		presetNameInput: get<HTMLInputElement>("preset-name-input"),
		savePresetButton: get<HTMLButtonElement>("save-preset-button"),
		loadPresetModalButton: get<HTMLButtonElement>("load-preset-modal-button"),
		presetModal: get<HTMLElement>("preset-modal"),
		closePresetModal: get<HTMLButtonElement>("close-preset-modal"),
		presetModalList: get<HTMLElement>("preset-modal-list"),
	};
};
