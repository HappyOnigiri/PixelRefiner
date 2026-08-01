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

	// Sync RGB inputs
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
			// Switch to RGB mode on manual input
			if (els.bgExtractionMethod.value !== "rgb") {
				els.bgExtractionMethod.value = "rgb";
				updateBgDisabledStates();
			}
		}
	});

	els.bgColorInput.addEventListener("input", () => {
		els.bgRgbInput.value = els.bgColorInput.value;
		// Switch to RGB mode on manual input
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
		// Canvas in modal is shown 1:1, so click coordinates are treated as image coordinates.
		// However, consideration is needed if CSS scaling is applied.
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
			// Switch to RGB mode when color is picked with eyedropper
			els.bgExtractionMethod.value = "rgb";
			updateBgDisabledStates();
			closeEyedropperModal();
		}
	});

	// Apply default/range from config file to UI
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

		// Event listeners for language switching buttons
		document.querySelectorAll("[data-lang-btn]").forEach((el) => {
			el.addEventListener("click", () => {
				const lang = el.getAttribute("data-lang-btn") as Language | null;
				if (lang) i18n.setLanguage(lang);
			});
		});

		// Apply initial translation
		i18n.updatePage();
	};

	// Toggle Process button visibility based on Auto Process state
	const updateProcessButtonVisibility = () => {
		els.processButton.style.display = els.autoProcessToggle.checked
			? "none"
			: "flex";
	};

	let autoProcessTimeout: number | undefined;
	const triggerAutoProcess = () => {
		if (!els.autoProcessToggle.checked) return;
		// Do not run conversion if no image is set
		if (!imageSession.getActiveImage()) return;

		// Cancel existing reservation if any (debounce)
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

	// UI control when grid detection is disabled
	const updateDisabledStates = () => {
		const mode = els.gridDetectionModeSelect.value;
		const isOff = mode === "off";
		const isAutoOrHint = mode === "auto" || mode === "hint";
		const isHintOrForce = mode === "hint" || mode === "force";

		const setDisabledClass = (el: HTMLElement, disabled: boolean) => {
			const item = el.closest(".setting-item");
			if (item) item.classList.toggle("disabled", disabled);
		};

		// detectGrid / autoGridFromTrimmed related
		[
			els.quantStepInput,
			els.quantStepSlider,
			els.fastAutoGridFromTrimmedCheck,
		].forEach((el) => {
			setDisabledClass(el, !isAutoOrHint);
		});

		// pixel inputs (hint/force only)
		[els.forcePixelsWInput, els.forcePixelsHInput].forEach((el) => {
			setDisabledClass(el, !isHintOrForce);
		});

		// downsample-related (disabled only when off)
		[els.sampleWindowInput, els.sampleWindowSlider].forEach((el) => {
			setDisabledClass(el, isOff);
		});
	};

	els.gridDetectionModeSelect.addEventListener("change", updateDisabledStates);

	// UI control for color reduction settings
	const updatePaletteButtonVisibility = () => {
		const mode = els.reduceColorModeSelect.value;
		const isFixed = mode === "fixed";
		const hasImage = !!imageSession.getActiveImage();

		// In Fixed mode, Import is shown. (Only if image is set)
		els.fixedPaletteImportButton.style.display =
			isFixed && hasImage ? "flex" : "none";

		// "Show Palette" is shown if we have a palette results. (Only if image is set)
		const hasPalette = processingState.currentExtractedPalette.length > 0;
		els.showPaletteButton.style.display =
			hasPalette && hasImage ? "flex" : "none";
	};

	const updateReduceColorsDisabledStates = () => {
		const mode = els.reduceColorModeSelect.value;
		const isNone = mode === "none";
		const isAuto = mode === "auto";

		// Enable/Disable sections based on mode
		const isEnabled = !isNone;

		els.colorCountSetting.style.display = isAuto ? "flex" : "none";

		const ditherMode = els.ditherModeSelect.value;
		const isDitherNone = ditherMode === "none";
		// Show strength if dithering is enabled
		els.ditherStrengthSetting.style.display = !isDitherNone ? "flex" : "none";

		// Disable dithering settings when color reduction mode is None
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
		// If we switch away from Fixed, clear the fixed palette
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

	// UI control for dithering (could keep it always shown, but enabled only when mode is not None)
	// Keeping it simple for now
	updateReduceColorsDisabledStates();

	updateDisabledStates();

	// Disable background-related UI when background removal method is none
	const updateBgDisabledStates = () => {
		const isBgDisabled = els.bgExtractionMethod.value === "none";

		// Control items related to background transparency
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

	// Common listener for saving on setting changes (display conditions only)
	[els.zoomOutputCheck, els.gridOutputCheck, els.autoProcessToggle].forEach(
		(el) => {
			el.addEventListener("change", () => saveSettings());
		},
	);

	// Toggle process button visibility when Auto Process toggle changes
	els.autoProcessToggle.addEventListener("change", () => {
		updateProcessButtonVisibility();
	});

	// Add event listeners to trigger auto-processing on setting changes
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
		// Also capture text inputs with input event
		if (
			el instanceof HTMLInputElement &&
			(el.type === "text" || el.type === "number")
		) {
			el.addEventListener("input", triggerAutoProcess);
		}
	});

	// Grid Update Logic (Handled by ResultViewer now)
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
