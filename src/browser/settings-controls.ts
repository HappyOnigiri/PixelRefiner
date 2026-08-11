import { rgbToHex } from "../core/colorUtils";
import { createDefaultProcessOptions } from "../core/processor-options";
import { PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import {
	advancedSettingControls,
	applyAdvancedSettingDefaults,
	backgroundDependentAdvancedControls,
	gridDetectionAdvancedControls,
} from "./advanced-settings-fields";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import { isDitherSettingsEnabled } from "./batch-options";
import { i18n, type Language } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { showError } from "./notifications";
import type { RunProcessingOptions } from "./processing-controller";
import {
	QUICK_SETTINGS_DEFAULTS,
	type QuickSettingsState,
} from "./quick-settings";
import { setupQuickSettingsControls } from "./quick-settings-controls";
import type { ImageSession } from "./session";

type SettingsControlsOptions = {
	els: Elements;
	processingState: ProcessingState;
	imageSession: ImageSession;
	runProcessing: (options?: RunProcessingOptions) => Promise<void>;
	saveSettings: () => void;
	onLanguageChange: () => void;
};

export type SettingsControls = {
	updateRgbInputs: (hex: string) => void;
	updateProcessButtonVisibility: () => void;
	triggerAutoProcess: () => void;
	updateDisabledStates: () => void;
	updatePaletteButtonVisibility: () => void;
	updateReduceColorsDisabledStates: () => void;
	updateBgDisabledStates: () => void;
	updateBgColorFromMethod: () => void;
	getQuickSettings: () => QuickSettingsState;
	applyQuickSettings: (settings: QuickSettingsState, presetId?: string) => void;
};

export const setupSettingsControls = ({
	els,
	processingState,
	imageSession,
	runProcessing,
	saveSettings,
	onLanguageChange,
}: SettingsControlsOptions): SettingsControls => {
	const openEyedropperModal = () => {
		const img = imageSession.getActiveImage()?.original;
		if (!img) return;
		els.eyedropperModal.style.display = "flex";
		drawRawImageToCanvas(img, els.eyedropperCanvas);
	};

	const closeEyedropperModal = () => {
		els.eyedropperModal.style.display = "none";
	};

	const quickSettingsControls = setupQuickSettingsControls({
		els,
		processingState,
		triggerAutoProcess: () => triggerAutoProcess(),
		updateReduceColorsDisabledStates: () => updateReduceColorsDisabledStates(),
		updateBgDisabledStates: () => updateBgDisabledStates(),
		clearCandidateSelections: () => imageSession.clearCandidateSelections(),
	});
	const {
		getQuickSettings,
		applyQuickSettings,
		setBackgroundColor,
		syncQuickSettingsToAdvanced,
	} = quickSettingsControls;

	// RGB 入力を同期
	const updateRgbInputs = (hex: string) => {
		els.bgRgbInput.value = hex;
		els.bgColorInput.value = hex;
		setBackgroundColor(hex);
	};

	els.closeEyedropperModal.addEventListener("click", closeEyedropperModal);
	els.quickBackgroundColorInput.addEventListener("input", () => {
		updateRgbInputs(els.quickBackgroundColorInput.value);
		els.quickBackgroundSelect.value = "pick";
		els.builtInPresetSelect.value = "custom";
		syncQuickSettingsToAdvanced();
		triggerAutoProcess();
	});
	els.quickEyedropperButton.addEventListener("click", () => {
		els.eyedropperButton.click();
	});

	els.bgRgbInput.addEventListener("input", () => {
		let val = els.bgRgbInput.value.trim();
		if (/^#?[0-9a-fA-F]{6}$/.test(val)) {
			if (!val.startsWith("#")) val = `#${val}`;
			els.bgColorInput.value = val;
			// 手動入力時に RGB モードへ切り替え
			if (els.bgExtractionMethod.value !== "rgb") {
				els.bgExtractionMethod.value = "rgb";
				updateBgDisabledStates();
			}
			els.quickBackgroundSelect.value = "pick";
			els.builtInPresetSelect.value = "custom";
		}
	});

	els.bgColorInput.addEventListener("input", () => {
		els.bgRgbInput.value = els.bgColorInput.value;
		// 手動入力時に RGB モードへ切り替え
		if (els.bgExtractionMethod.value !== "rgb") {
			els.bgExtractionMethod.value = "rgb";
			updateBgDisabledStates();
		}
		els.quickBackgroundSelect.value = "pick";
		els.builtInPresetSelect.value = "custom";
	});

	els.eyedropperButton.addEventListener("click", (e) => {
		e.stopPropagation();
		if (!imageSession.getActiveImage()) {
			showError(i18n.t("error.no_image"));
			return;
		}
		openEyedropperModal();
	});

	els.eyedropperModal.addEventListener("click", (e) => {
		if (e.target === els.eyedropperModal) {
			closeEyedropperModal();
		}
	});

	els.eyedropperCanvas.addEventListener("click", (e) => {
		const currentImage = imageSession.getActiveImage()?.original;
		if (!currentImage) return;

		const rect = els.eyedropperCanvas.getBoundingClientRect();
		// モーダル内のキャンバスは 1:1 で表示されるため、クリック座標は画像座標として扱う。
		// ただし、CSS スケーリングが適用される場合は考慮が必要である。
		const x = Math.floor(
			((e.clientX - rect.left) / rect.width) * currentImage.width,
		);
		const y = Math.floor(
			((e.clientY - rect.top) / rect.height) * currentImage.height,
		);

		if (x >= 0 && x < currentImage.width && y >= 0 && y < currentImage.height) {
			const idx = (y * currentImage.width + x) * 4;
			const r = currentImage.data[idx];
			const g = currentImage.data[idx + 1];
			const b = currentImage.data[idx + 2];
			const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
			updateRgbInputs(hex);
			// スポイトで色を選択したときに RGB モードへ切り替え
			els.bgExtractionMethod.value = "rgb";
			els.quickBackgroundSelect.value = "pick";
			els.builtInPresetSelect.value = "custom";
			updateBgDisabledStates();
			closeEyedropperModal();
			triggerAutoProcess();
		}
	});

	// 設定ファイルの既定値・範囲を UI に適用
	const applyConfigToUi = () => {
		const defaults = createDefaultProcessOptions();
		const setNumberInput = (
			input: HTMLInputElement,
			slider: HTMLInputElement | null,
			range: { min: number; max: number },
			defaultValue: number,
		) => {
			input.min = String(range.min);
			input.max = String(range.max);
			input.value = String(defaultValue);
			if (slider) {
				slider.min = String(range.min);
				slider.max = String(range.max);
				slider.value = String(defaultValue);
			}
		};

		setNumberInput(
			els.quantStepInput,
			els.quantStepSlider,
			PROCESS_RANGES.detectionQuantStep,
			defaults.detectionQuantStep,
		);
		setNumberInput(
			els.sampleWindowInput,
			els.sampleWindowSlider,
			PROCESS_RANGES.sampleWindow,
			defaults.sampleWindow,
		);
		setNumberInput(
			els.toleranceInput,
			els.toleranceSlider,
			PROCESS_RANGES.backgroundTolerance,
			defaults.backgroundTolerance,
		);
		setNumberInput(
			els.colorCountInput,
			els.colorCountSlider,
			PROCESS_RANGES.colorCount,
			defaults.colorCount,
		);
		setNumberInput(
			els.ditherStrengthInput,
			els.ditherStrengthSlider,
			PROCESS_RANGES.ditherStrength,
			defaults.ditherStrength,
		);

		els.forcePixelsWInput.min = String(PROCESS_RANGES.forcePixelsW.min);
		els.forcePixelsWInput.max = String(PROCESS_RANGES.forcePixelsW.max);
		els.forcePixelsHInput.min = String(PROCESS_RANGES.forcePixelsH.min);
		els.forcePixelsHInput.max = String(PROCESS_RANGES.forcePixelsH.max);

		els.preRemoveCheck.checked = defaults.preRemoveBackground;
		els.postRemoveCheck.checked = defaults.postRemoveBackground;
		els.quickBgRemovalScopeSelect.value = defaults.bgRemovalScope;
		els.bgConnectivitySelect.value = defaults.bgConnectivity;
		els.smallComponentModeSelect.value = defaults.smallComponentMode;
		els.geminiWatermarkRemovalSelect.value = defaults.geminiWatermarkRemoval;
		applyAdvancedSettingDefaults(els, defaults);
		els.trimToContentCheck.checked = defaults.trimToContent;
		els.fastAutoGridFromTrimmedCheck.checked = defaults.fastAutoGridFromTrimmed;
		els.makeSquareCheck.checked = defaults.makeSquare;
		els.keepAspectRatioCheck.checked = defaults.keepAspectRatio;
		els.gridDetectionModeSelect.value =
			PROCESS_DEFAULTS.gridDetectionMode ?? "auto";
		els.reduceColorModeSelect.value = defaults.reduceColorMode;
		els.ditherModeSelect.value = defaults.ditherMode;
		els.outlineColorInput.value = rgbToHex(defaults.outlineColor);

		els.bgExtractionMethod.value = defaults.bgExtractionMethod;
		els.quickProcessingModeSelect.value =
			QUICK_SETTINGS_DEFAULTS.processingMode;
		els.quickDetailLevelSelect.value = QUICK_SETTINGS_DEFAULTS.detailLevel;
		els.quickColorsSelect.value = QUICK_SETTINGS_DEFAULTS.colors;
		els.quickBackgroundSelect.value = QUICK_SETTINGS_DEFAULTS.background;
		els.quickDitheringSelect.value = QUICK_SETTINGS_DEFAULTS.dithering;
		els.quickOutlineStyleSelect.value = QUICK_SETTINGS_DEFAULTS.outlineStyle;
		els.quickAutoTrimCheck.checked = QUICK_SETTINGS_DEFAULTS.trimToContent;
		els.builtInPresetSelect.value = "auto";
		syncQuickSettingsToAdvanced();

		const applyTooltipRange = (
			id: string,
			range: { min: number; max: number; default: number },
		) => {
			const el = document.getElementById(id);
			if (!el) return;
			const cur = el.getAttribute("data-tooltip");
			if (!cur) return;
			el.setAttribute(
				"data-tooltip",
				cur
					.replace(/\{min\}/g, String(range.min))
					.replace(/\{max\}/g, String(range.max))
					.replace(/\{default\}/g, String(range.default)),
			);
		};
		applyTooltipRange("help-quant-step", PROCESS_RANGES.detectionQuantStep);
		applyTooltipRange("help-sample-window", PROCESS_RANGES.sampleWindow);
		applyTooltipRange("help-tolerance", PROCESS_RANGES.backgroundTolerance);
		applyTooltipRange("help-color-count", PROCESS_RANGES.colorCount);
		applyTooltipRange("help-dither-strength", PROCESS_RANGES.ditherStrength);

		// 言語切替ボタンのイベントリスナー
		document.querySelectorAll("[data-lang-btn]").forEach((el) => {
			el.addEventListener("click", () => {
				const lang = el.getAttribute("data-lang-btn") as Language | null;
				if (lang) {
					i18n.setLanguage(lang);
					onLanguageChange();
				}
			});
		});

		// 初期翻訳を適用
		i18n.updatePage();
	};

	// 自動処理の状態に応じて処理ボタンの表示を切り替え
	const updateProcessButtonVisibility = () => {
		els.processButton.style.display = els.autoProcessToggle.checked
			? "none"
			: "flex";
	};

	let autoProcessTimeout: number | undefined;
	const triggerAutoProcess = () => {
		if (!els.autoProcessToggle.checked) return;
		// 画像が設定されていない場合は変換しない
		if (!imageSession.getActiveImage()) return;

		// 既存の予約があればキャンセルする（デバウンス）
		if (autoProcessTimeout) {
			window.clearTimeout(autoProcessTimeout);
		}

		autoProcessTimeout = window.setTimeout(() => {
			// [Intended] 設定調整のたびに候補モーダルが開くと、入力からフォーカスが奪われ調整を続けられない。
			// 候補の提示は明示的な処理実行に限る。
			runProcessing({ showCandidates: false });
		}, 300);
	};

	// グリッド設定を直接変えた場合は、候補プレビューでの選択より新しい指定として扱う。
	const clearCandidateSelections = () => {
		imageSession.clearCandidateSelections();
	};
	[
		els.gridDetectionModeSelect,
		els.forcePixelsWInput,
		els.forcePixelsHInput,
		...gridDetectionAdvancedControls(els),
	].forEach((el) => {
		el.addEventListener("change", clearCandidateSelections);
		el.addEventListener("input", clearCandidateSelections);
	});

	const syncSliderAndInput = (
		slider: HTMLInputElement,
		input: HTMLInputElement,
	) => {
		slider.addEventListener("input", () => {
			input.value = slider.value;
			triggerAutoProcess();
		});
		input.addEventListener("input", () => {
			slider.value = input.value;
			triggerAutoProcess();
		});
	};

	applyConfigToUi();
	syncSliderAndInput(els.quantStepSlider, els.quantStepInput);
	syncSliderAndInput(els.sampleWindowSlider, els.sampleWindowInput);
	syncSliderAndInput(els.toleranceSlider, els.toleranceInput);
	syncSliderAndInput(els.colorCountSlider, els.colorCountInput);
	syncSliderAndInput(els.ditherStrengthSlider, els.ditherStrengthInput);

	// グリッド検出が無効な場合の UI 制御
	const updateDisabledStates = () => {
		const mode = els.gridDetectionModeSelect.value;
		const isAutoOrHint = mode === "auto" || mode === "hint";
		const isHintOrForce = mode === "hint" || mode === "force";

		const setDisabledClass = (el: HTMLElement, disabled: boolean) => {
			const item = el.closest(".setting-item");
			if (item) item.classList.toggle("disabled", disabled);
		};

		// detectGrid / autoGridFromTrimmed 関連
		[
			els.quantStepInput,
			els.quantStepSlider,
			els.fastAutoGridFromTrimmedCheck,
			...gridDetectionAdvancedControls(els),
		].forEach((el) => {
			setDisabledClass(el, !isAutoOrHint);
		});

		// ピクセル入力（hint / force のみ）
		[els.forcePixelsWInput, els.forcePixelsHInput].forEach((el) => {
			setDisabledClass(el, !isHintOrForce);
		});

		// [Intended] サンプル範囲はグリッド探索だけに使うため、Auto / Hint でのみ有効にする。
		[els.sampleWindowInput, els.sampleWindowSlider].forEach((el) => {
			setDisabledClass(el, !isAutoOrHint);
		});
	};

	els.gridDetectionModeSelect.addEventListener("change", updateDisabledStates);

	// 減色設定の UI 制御
	const updatePaletteButtonVisibility = () => {
		const mode = els.reduceColorModeSelect.value;
		const isFixed = mode === "fixed";
		const hasImage = !!imageSession.getActiveImage();

		// Fixed モードではインポートを表示する（画像が設定されている場合のみ）
		els.fixedPaletteImportButton.style.display =
			isFixed && hasImage ? "flex" : "none";

		// パレット結果がある場合は「パレットを表示」を表示する（画像が設定されている場合のみ）
		const hasPalette = processingState.currentExtractedPalette.length > 0;
		els.showPaletteButton.style.display =
			hasPalette && hasImage ? "flex" : "none";
	};

	const updateReduceColorsDisabledStates = () => {
		const mode = els.reduceColorModeSelect.value;
		const isAuto = mode === "auto";
		const isSharedPalette = els.sharedPaletteToggle.checked;

		// モードに応じてセクションを有効・無効にする
		const isEnabled = isDitherSettingsEnabled(mode, isSharedPalette);

		els.colorCountSetting.style.display =
			isAuto || isSharedPalette ? "flex" : "none";

		const ditherMode = els.ditherModeSelect.value;
		const isDitherNone = ditherMode === "none";
		// ディザリングが有効な場合は強度を表示
		els.ditherStrengthSetting.style.display =
			isEnabled && !isDitherNone ? "flex" : "none";

		// 減色モードが None の場合はディザリング設定を無効にする
		const ditherModeItem = els.ditherModeSelect.closest(".setting-item");
		if (ditherModeItem) {
			ditherModeItem.classList.toggle("disabled", !isEnabled);
		}

		const outlineEnabled = els.outlineStyleSelect.value !== "none";
		const outlineColorItem = els.outlineColorInput.closest(".setting-item");
		if (outlineColorItem) {
			outlineColorItem.classList.toggle("disabled", !outlineEnabled);
		}

		updatePaletteButtonVisibility();
	};

	els.reduceColorModeSelect.addEventListener("change", () => {
		updateReduceColorsDisabledStates();
		// Fixed 以外へ切り替えた場合は固定パレットをクリアする
		if (els.reduceColorModeSelect.value !== "fixed") {
			processingState.currentFixedPalette = undefined;
		}
		triggerAutoProcess();
	});

	els.ditherModeSelect.addEventListener("change", () => {
		updateReduceColorsDisabledStates();
		triggerAutoProcess();
	});

	els.outlineStyleSelect.addEventListener("change", () => {
		updateReduceColorsDisabledStates();
		triggerAutoProcess();
	});
	els.outlineColorInput.addEventListener("input", triggerAutoProcess);

	// ディザリングの UI 制御（常時表示も可能だが、モードが None 以外の場合のみ有効）
	// 現時点では簡潔な実装にする
	updateReduceColorsDisabledStates();

	updateDisabledStates();

	// 背景除去方法が none の場合は背景関連 UI を無効にする
	const updateBgDisabledStates = () => {
		const isBgDisabled = els.bgExtractionMethod.value === "none";

		// 背景の透明化に関する項目を制御
		[
			els.toleranceInput,
			els.toleranceSlider,
			els.preRemoveCheck,
			els.postRemoveCheck,
			els.quickBgRemovalScopeSelect,
			els.bgConnectivitySelect,
			els.smallComponentModeSelect,
			els.geminiWatermarkRemovalSelect,
			...backgroundDependentAdvancedControls(els),
		].forEach((el) => {
			const item = el.closest(".setting-item");
			if (item) {
				item.classList.toggle("disabled", isBgDisabled);
			}
		});

		// [Intended] Auto には角の選択が無く、"selected" は "outer" と同じ結果になるため
		// 選ばせない。色を指定する抽出も角シードは持たないが、"selected" では画像全体の
		// 一致画素をシードにして内側の閉領域まで落ちるため、選べるままにする。
		const selectedScopeHasNoEffect = els.bgExtractionMethod.value === "auto";
		const selectedScopeOption =
			els.quickBgRemovalScopeSelect.querySelector<HTMLOptionElement>(
				'option[value="selected"]',
			);
		if (selectedScopeOption) {
			selectedScopeOption.disabled = selectedScopeHasNoEffect;
		}
		if (
			selectedScopeHasNoEffect &&
			els.quickBgRemovalScopeSelect.value === "selected"
		) {
			els.quickBgRemovalScopeSelect.value = "outer";
		}

		const rgbContainer = els.rgbPickerContainer;
		if (isBgDisabled) {
			rgbContainer.classList.add("disabled");
		} else {
			rgbContainer.classList.remove("disabled");
		}
	};

	const updateBgColorFromMethod = () => {
		const method = els.bgExtractionMethod.value;
		const currentImage = imageSession.getActiveImage()?.original;
		if (
			method !== "none" &&
			method !== "auto" &&
			method !== "rgb" &&
			currentImage
		) {
			const w = currentImage.width;
			const h = currentImage.height;
			let x = 0;
			let y = 0;
			if (method === "bottom-left") y = h - 1;
			else if (method === "top-right") x = w - 1;
			else if (method === "bottom-right") {
				x = w - 1;
				y = h - 1;
			}
			const idx = (y * w + x) * 4;
			const r = currentImage.data[idx];
			const g = currentImage.data[idx + 1];
			const b = currentImage.data[idx + 2];
			const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
			updateRgbInputs(hex);
		}
	};

	els.bgExtractionMethod.addEventListener("change", () => {
		updateBgColorFromMethod();
		updateBgDisabledStates();
		triggerAutoProcess();
	});

	updateBgDisabledStates();

	updateProcessButtonVisibility();

	// 設定変更時に保存する共通リスナー（表示条件のみ）
	[els.zoomOutputCheck, els.gridOutputCheck, els.autoProcessToggle].forEach(
		(el) => {
			el.addEventListener("change", () => saveSettings());
		},
	);

	// 自動処理トグルの変更時に処理ボタンの表示を切り替え
	els.autoProcessToggle.addEventListener("change", () => {
		updateProcessButtonVisibility();
	});

	// 設定変更時に自動処理を開始するイベントリスナーを追加
	[
		els.forcePixelsWInput,
		els.forcePixelsHInput,
		...advancedSettingControls(els),
		els.preRemoveCheck,
		els.postRemoveCheck,
		els.bgConnectivitySelect,
		els.smallComponentModeSelect,
		els.geminiWatermarkRemovalSelect,
		els.trimToContentCheck,
		els.fastAutoGridFromTrimmedCheck,
		els.makeSquareCheck,
		els.keepAspectRatioCheck,
		els.gridDetectionModeSelect,
		els.reduceColorModeSelect,
		els.ditherModeSelect,

		els.bgExtractionMethod,
		els.bgRgbInput,
		els.bgColorInput,
	].forEach((el) => {
		el.addEventListener("change", triggerAutoProcess);
		// input イベントでテキスト入力も捕捉する
		if (
			el instanceof HTMLInputElement &&
			(el.type === "text" || el.type === "number")
		) {
			el.addEventListener("input", triggerAutoProcess);
		}
	});

	return {
		updateRgbInputs,
		updateProcessButtonVisibility,
		triggerAutoProcess,
		updateDisabledStates,
		updatePaletteButtonVisibility,
		updateReduceColorsDisabledStates,
		updateBgDisabledStates,
		updateBgColorFromMethod,
		getQuickSettings,
		applyQuickSettings,
	};
};
