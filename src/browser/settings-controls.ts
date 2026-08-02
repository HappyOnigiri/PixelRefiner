import { PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import { i18n, type Language } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { showError } from "./notifications";
import type { ImageSession } from "./session";

type SettingsControlsOptions = {
	els: Elements;
	processingState: ProcessingState;
	imageSession: ImageSession;
	runProcessing: () => Promise<void>;
	saveSettings: () => void;
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
};

export const setupSettingsControls = ({
	els,
	processingState,
	imageSession,
	runProcessing,
	saveSettings,
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

	// RGB 入力を同期
	const updateRgbInputs = (hex: string) => {
		els.bgRgbInput.value = hex;
		els.bgColorInput.value = hex;
	};

	els.closeEyedropperModal.addEventListener("click", closeEyedropperModal);

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
		}
	});

	els.bgColorInput.addEventListener("input", () => {
		els.bgRgbInput.value = els.bgColorInput.value;
		// 手動入力時に RGB モードへ切り替え
		if (els.bgExtractionMethod.value !== "rgb") {
			els.bgExtractionMethod.value = "rgb";
			updateBgDisabledStates();
		}
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
			updateBgDisabledStates();
			closeEyedropperModal();
		}
	});

	// 設定ファイルの既定値・範囲を UI に適用
	const applyConfigToUi = () => {
		const setNumberInput = (
			input: HTMLInputElement,
			slider: HTMLInputElement | null,
			range: { min: number; max: number; default: number },
		) => {
			input.min = String(range.min);
			input.max = String(range.max);
			input.value = String(range.default);
			if (slider) {
				slider.min = String(range.min);
				slider.max = String(range.max);
				slider.value = String(range.default);
			}
		};

		setNumberInput(
			els.quantStepInput,
			els.quantStepSlider,
			PROCESS_RANGES.detectionQuantStep,
		);
		setNumberInput(
			els.sampleWindowInput,
			els.sampleWindowSlider,
			PROCESS_RANGES.sampleWindow,
		);
		setNumberInput(
			els.toleranceInput,
			els.toleranceSlider,
			PROCESS_RANGES.backgroundTolerance,
		);
		setNumberInput(
			els.floatingMaxPercentInput,
			els.floatingMaxPercentSlider,
			PROCESS_RANGES.floatingMaxPercent,
		);
		setNumberInput(
			els.colorCountInput,
			els.colorCountSlider,
			PROCESS_RANGES.colorCount,
		);
		setNumberInput(
			els.ditherStrengthInput,
			els.ditherStrengthSlider,
			PROCESS_RANGES.ditherStrength,
		);

		els.forcePixelsWInput.min = String(PROCESS_RANGES.forcePixelsW.min);
		els.forcePixelsWInput.max = String(PROCESS_RANGES.forcePixelsW.max);
		els.forcePixelsHInput.min = String(PROCESS_RANGES.forcePixelsH.min);
		els.forcePixelsHInput.max = String(PROCESS_RANGES.forcePixelsH.max);

		els.preRemoveCheck.checked = PROCESS_DEFAULTS.preRemoveBackground;
		els.postRemoveCheck.checked = PROCESS_DEFAULTS.postRemoveBackground;
		els.bgRemovalScopeSelect.value = PROCESS_DEFAULTS.bgRemovalScope;
		els.bgConnectivitySelect.value = PROCESS_DEFAULTS.bgConnectivity;
		els.trimToContentCheck.checked = PROCESS_DEFAULTS.trimToContent;
		els.fastAutoGridFromTrimmedCheck.checked =
			PROCESS_DEFAULTS.fastAutoGridFromTrimmed;
		els.makeSquareCheck.checked = PROCESS_DEFAULTS.makeSquare;
		els.keepAspectRatioCheck.checked = PROCESS_DEFAULTS.keepAspectRatio;
		els.gridDetectionModeSelect.value =
			PROCESS_DEFAULTS.gridDetectionMode ?? "auto";
		els.reduceColorModeSelect.value = PROCESS_DEFAULTS.reduceColorMode;
		els.ditherModeSelect.value = PROCESS_DEFAULTS.ditherMode;

		els.bgExtractionMethod.value = "top-left";

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
		applyTooltipRange(
			"help-floating-max-percent",
			PROCESS_RANGES.floatingMaxPercent,
		);
		applyTooltipRange("help-color-count", PROCESS_RANGES.colorCount);
		applyTooltipRange("help-dither-strength", PROCESS_RANGES.ditherStrength);

		// 言語切替ボタンのイベントリスナー
		document.querySelectorAll("[data-lang-btn]").forEach((el) => {
			el.addEventListener("click", () => {
				const lang = el.getAttribute("data-lang-btn") as Language | null;
				if (lang) i18n.setLanguage(lang);
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
			runProcessing();
		}, 300);
	};

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
	syncSliderAndInput(els.floatingMaxPercentSlider, els.floatingMaxPercentInput);
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
		const isNone = mode === "none";
		const isAuto = mode === "auto";

		// モードに応じてセクションを有効・無効にする
		const isEnabled = !isNone;

		els.colorCountSetting.style.display = isAuto ? "flex" : "none";

		const ditherMode = els.ditherModeSelect.value;
		const isDitherNone = ditherMode === "none";
		// ディザリングが有効な場合は強度を表示
		els.ditherStrengthSetting.style.display = !isDitherNone ? "flex" : "none";

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
			els.bgRemovalScopeSelect,
			els.bgConnectivitySelect,
			els.floatingMaxPercentInput,
			els.floatingMaxPercentSlider,
		].forEach((el) => {
			const item = el.closest(".setting-item");
			if (item) {
				item.classList.toggle("disabled", isBgDisabled);
			}
		});

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
		if (method !== "none" && method !== "rgb" && currentImage) {
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
		els.preRemoveCheck,
		els.postRemoveCheck,
		els.bgRemovalScopeSelect,
		els.bgConnectivitySelect,
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
	};
};
