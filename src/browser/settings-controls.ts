import { rgbToHex } from "../core/colorUtils";
import { createDefaultProcessOptions } from "../core/processor-options";
import { PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import type { ProcessingRoute } from "../shared/types";
import {
	applyAdvancedConvertOutputRanges,
	hasCompleteConvertOutputSize,
	populateAdvancedConvertOutputSize,
	updateAdvancedProcessingControls,
} from "./advanced-processing-controls";
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
import { QUICK_SETTINGS_DEFAULTS } from "./quick-settings";
import {
	setupQuickSettingsControls,
	updateQuickSettingsDisabledStates,
} from "./quick-settings-controls";
import type { ImageSession } from "./session";
import type { GridDetectionMode } from "./settings-options";

type SettingsControlsOptions = {
	els: Elements;
	processingState: ProcessingState;
	imageSession: ImageSession;
	runProcessing: (options?: RunProcessingOptions) => Promise<void>;
	onAutoProcessScheduledChange: (scheduled: boolean) => void;
	saveSettings: () => void;
	onLanguageChange: () => void;
};

export type SettingsControls = {
	updateRgbInputs: (hex: string) => void;
	updateProcessButtonVisibility: () => void;
	triggerAutoProcess: () => void;
	updateDisabledStates: () => void;
	updateAdvancedProcessingDisabledStates: (
		activeRoute?: ProcessingRoute,
	) => void;
	updatePaletteButtonVisibility: () => void;
	updateReduceColorsDisabledStates: () => void;
	updateBgDisabledStates: () => void;
	updateBgColorFromMethod: () => void;
};

export const setupSettingsControls = ({
	els,
	processingState,
	imageSession,
	runProcessing,
	onAutoProcessScheduledChange,
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
		triggerAutoProcess: () => triggerAutoProcess(),
		clearCandidateSelections: () => imageSession.clearCandidateSelections(),
	});
	const { setBackgroundColor } = quickSettingsControls;

	// RGB 入力を同期
	const updateRgbInputs = (hex: string) => {
		if (processingState.settingsMode === "quick") {
			setBackgroundColor(hex);
			els.quickBackgroundSelect.value = "pick";
			updateQuickSettingsDisabledStates(els, undefined, {
				preservePendingAutoRoute: true,
			});
			imageSession.clearCandidateSelections();
			return;
		}
		if (processingState.settingsMode !== "advanced") return;
		els.bgRgbInput.value = hex;
		els.bgColorInput.value = hex;
	};

	/**
	 * 詳細設定で背景色を直接指定する操作を、抽出方法「色で指定」の選択として扱う。
	 *
	 * [Intended] 抽出方法が rgb 以外のままだと、指定した色は入力欄に見えていても
	 * 処理オプションに渡らず無視される。呼び出し側で updateBgDisabledStates を続けて呼ぶ。
	 */
	const selectRgbBackgroundMethod = () => {
		if (processingState.settingsMode !== "advanced") return;
		if (els.bgExtractionMethod.value === "rgb") return;
		els.bgExtractionMethod.value = "rgb";
	};

	els.closeEyedropperModal.addEventListener("click", closeEyedropperModal);
	els.quickBackgroundColorInput.addEventListener("input", () => {
		imageSession.clearCandidateSelections();
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
			selectRgbBackgroundMethod();
			updateBgDisabledStates();
		}
	});

	els.bgColorInput.addEventListener("input", () => {
		els.bgRgbInput.value = els.bgColorInput.value;
		selectRgbBackgroundMethod();
		updateBgDisabledStates();
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
			selectRgbBackgroundMethod();
			updateBgDisabledStates();
			closeEyedropperModal();
			triggerAutoProcess();
		}
	});

	/**
	 * ツールチップ内の {min} / {max} / {default} を設定ファイルの範囲で置き換える。
	 *
	 * [Intended] i18n.updatePage() は data-tooltip を翻訳リソースの原文で上書きするため、
	 * 置換は必ず翻訳の適用後（言語切替のたび）に行う。
	 */
	const applyTooltipRanges = () => {
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
		applyTooltipRange(
			"help-max-samples-per-cell",
			PROCESS_RANGES.maxSamplesPerCell,
		);
		applyTooltipRange(
			"help-cell-alpha-threshold",
			PROCESS_RANGES.cellAlphaThreshold,
		);
		applyTooltipRange("help-auto-max-cells-w", PROCESS_RANGES.autoMaxCells);
		applyTooltipRange("help-auto-max-cells-h", PROCESS_RANGES.autoMaxCells);
		applyTooltipRange(
			"help-background-mask-tolerance",
			PROCESS_RANGES.backgroundMaskTolerance,
		);
		applyTooltipRange(
			"help-trim-alpha-threshold",
			PROCESS_RANGES.trimAlphaThreshold,
		);
	};

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
		applyAdvancedConvertOutputRanges(els);

		els.preRemoveCheck.checked = defaults.preRemoveBackground;
		els.postRemoveCheck.checked = defaults.postRemoveBackground;
		els.advancedBgRemovalScopeSelect.value = defaults.bgRemovalScope;
		els.bgConnectivitySelect.value = defaults.bgConnectivity;
		els.smallComponentModeSelect.value = defaults.smallComponentMode;
		els.geminiWatermarkRemovalSelect.value = defaults.geminiWatermarkRemoval;
		applyAdvancedSettingDefaults(els, defaults);
		els.fastAutoGridFromTrimmedCheck.checked = defaults.fastAutoGridFromTrimmed;
		els.makeSquareCheck.checked = defaults.makeSquare;
		els.keepAspectRatioCheck.checked = defaults.keepAspectRatio;
		// [Intended] gridDetectionMode は UI 専用で ProcessOptions に無いため、
		// PROCESS_DEFAULTS 側の値をどの型も縛っていない。ここで受け直して、
		// 既定値が select の値集合から外れたらコンパイルエラーになるようにする。
		const gridDetectionModeDefault: GridDetectionMode =
			PROCESS_DEFAULTS.gridDetectionMode ?? "auto";
		els.gridDetectionModeSelect.value = gridDetectionModeDefault;
		els.advancedCellScaleSelect.value = defaults.cellScale;
		els.reduceColorModeSelect.value = defaults.reduceColorMode;
		els.ditherModeSelect.value = defaults.ditherMode;
		els.outlineColorInput.value = rgbToHex(defaults.outlineColor);

		els.bgExtractionMethod.value = defaults.bgExtractionMethod;
		els.advancedProcessingModeSelect.value = defaults.processingMode;
		els.advancedConvertSizeModeSelect.value = defaults.detailLevel;
		els.advancedConvertWidthInput.value = "";
		els.advancedConvertHeightInput.value = "";
		els.quickProcessingModeSelect.value =
			QUICK_SETTINGS_DEFAULTS.processingMode;
		els.quickDetailLevelSelect.value = QUICK_SETTINGS_DEFAULTS.detailLevel;
		els.quickCellScaleSelect.value = QUICK_SETTINGS_DEFAULTS.cellScale;
		els.quickReductionModeSelect.value = QUICK_SETTINGS_DEFAULTS.reductionMode;
		els.quickBackgroundSelect.value = QUICK_SETTINGS_DEFAULTS.background;
		els.quickDitheringSelect.value = QUICK_SETTINGS_DEFAULTS.dithering;
		els.builtInPresetSelect.value = "auto";

		// 言語切替ボタンのイベントリスナー
		document.querySelectorAll("[data-lang-btn]").forEach((el) => {
			el.addEventListener("click", () => {
				const lang = el.getAttribute("data-lang-btn") as Language | null;
				if (lang) {
					i18n.setLanguage(lang);
					applyTooltipRanges();
					onLanguageChange();
				}
			});
		});

		// 初期翻訳を適用
		i18n.updatePage();
		applyTooltipRanges();
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
		onAutoProcessScheduledChange(true);

		autoProcessTimeout = window.setTimeout(() => {
			autoProcessTimeout = undefined;
			// [Intended] 設定調整のたびに候補を作り直すと、1 回の調整で 7 通りの変換が走る。
			// 候補の提示は明示的な処理実行に限る。
			void runProcessing({ showCandidates: false }).finally(() => {
				// [Intended] 予約の解除は変換の完了時に行う。呼び出し直後に解除すると、
				// runProcessing が最初の await までに変換の開始を記録することへ暗黙に依存する。
				// 待機中に次の予約が入っていた場合は、その予約の完了時の解除に任せる。
				if (autoProcessTimeout === undefined)
					onAutoProcessScheduledChange(false);
			});
		}, 300);
	};

	// 出力サイズを決める設定を直接変えた場合は、候補プレビューでの選択より新しい指定として扱う。
	// [Intended] 対象は出力サイズに効く設定に限る。色やアウトラインまで含めると、
	// サイズと無関係な微調整のたびに候補リストで選んだ結果が失われる。
	const clearCandidateSelections = () => {
		imageSession.clearCandidateSelections();
	};
	[
		els.gridDetectionModeSelect,
		els.forcePixelsWInput,
		els.forcePixelsHInput,
		els.advancedProcessingModeSelect,
		els.advancedConvertSizeModeSelect,
		els.advancedConvertWidthInput,
		els.advancedConvertHeightInput,
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
	// [Intended] HTML の初期値ではなく、適用済みのかんたん設定の既定値で表示状態を決める。
	updateQuickSettingsDisabledStates(els);
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
	let activeAdvancedRoute: ProcessingRoute | undefined;
	const refreshAdvancedProcessingControls = () => {
		const mode = els.advancedProcessingModeSelect.value;
		if (
			mode === "convert" ||
			(mode === "auto" && activeAdvancedRoute === "convert")
		) {
			populateAdvancedConvertOutputSize(
				els,
				imageSession.getActiveImage()?.original,
			);
		}
		updateAdvancedProcessingControls(els, activeAdvancedRoute);
	};
	const updateAdvancedProcessingDisabledStates = (
		activeRoute?: ProcessingRoute,
	) => {
		activeAdvancedRoute = activeRoute;
		refreshAdvancedProcessingControls();
	};

	els.gridDetectionModeSelect.addEventListener("change", () => {
		updateDisabledStates();
		refreshAdvancedProcessingControls();
	});
	els.advancedProcessingModeSelect.addEventListener("change", () => {
		refreshAdvancedProcessingControls();
	});
	els.advancedConvertSizeModeSelect.addEventListener("change", () => {
		populateAdvancedConvertOutputSize(
			els,
			imageSession.getActiveImage()?.original,
		);
		refreshAdvancedProcessingControls();
		if (hasCompleteConvertOutputSize(els)) triggerAutoProcess();
	});
	[els.forcePixelsWInput, els.forcePixelsHInput].forEach((input) => {
		input.addEventListener("input", () => {
			refreshAdvancedProcessingControls();
		});
		input.addEventListener("change", () => {
			refreshAdvancedProcessingControls();
		});
	});
	[els.advancedConvertWidthInput, els.advancedConvertHeightInput].forEach(
		(input) => {
			input.addEventListener("input", () => {
				if (hasCompleteConvertOutputSize(els)) triggerAutoProcess();
			});
			input.addEventListener("change", () => {
				populateAdvancedConvertOutputSize(
					els,
					imageSession.getActiveImage()?.original,
				);
				if (hasCompleteConvertOutputSize(els)) triggerAutoProcess();
			});
		},
	);

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

		// モードに応じてセクションを有効・無効にする
		const isEnabled = isDitherSettingsEnabled(mode);

		els.colorCountSetting.style.display = isAuto ? "flex" : "none";

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
	updateAdvancedProcessingDisabledStates();

	// 背景除去方法が none の場合は背景関連 UI を無効にする
	const updateBgDisabledStates = () => {
		const isBgDisabled = els.bgExtractionMethod.value === "none";

		// 背景の透明化に関する項目を制御
		[
			els.toleranceInput,
			els.toleranceSlider,
			els.preRemoveCheck,
			els.postRemoveCheck,
			els.advancedBgRemovalScopeSelect,
			els.bgConnectivitySelect,
			els.trimAlphaThresholdInput,
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
			els.advancedBgRemovalScopeSelect.querySelector<HTMLOptionElement>(
				'option[value="selected"]',
			);
		if (selectedScopeOption) {
			selectedScopeOption.disabled = selectedScopeHasNoEffect;
		}
		if (
			selectedScopeHasNoEffect &&
			els.advancedBgRemovalScopeSelect.value === "selected"
		) {
			els.advancedBgRemovalScopeSelect.value = "outer";
		}

		const rgbContainer = els.rgbPickerContainer;
		if (isBgDisabled) {
			rgbContainer.classList.add("disabled");
		} else {
			rgbContainer.classList.remove("disabled");
		}
	};

	const updateBgColorFromMethod = () => {
		if (processingState.settingsMode !== "advanced") return;
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
		if (!els.autoProcessToggle.checked && autoProcessTimeout) {
			window.clearTimeout(autoProcessTimeout);
			autoProcessTimeout = undefined;
			onAutoProcessScheduledChange(false);
		}
	});

	// 設定変更時に自動処理を開始するイベントリスナーを追加
	[
		els.forcePixelsWInput,
		els.forcePixelsHInput,
		els.advancedCellScaleSelect,
		...advancedSettingControls(els),
		els.preRemoveCheck,
		els.postRemoveCheck,
		els.bgConnectivitySelect,
		els.smallComponentModeSelect,
		els.geminiWatermarkRemovalSelect,
		els.fastAutoGridFromTrimmedCheck,
		els.makeSquareCheck,
		els.keepAspectRatioCheck,
		els.gridDetectionModeSelect,
		els.reduceColorModeSelect,
		els.ditherModeSelect,
		els.advancedProcessingModeSelect,
		els.advancedBgRemovalScopeSelect,

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
		updateAdvancedProcessingDisabledStates,
		updatePaletteButtonVisibility,
		updateReduceColorsDisabledStates,
		updateBgDisabledStates,
		updateBgColorFromMethod,
	};
};
