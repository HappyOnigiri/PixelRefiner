import { PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import type {
	DetailLevel,
	OutlineStyle,
	ProcessingMode,
} from "../shared/types";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import type {
	QuickBackground,
	QuickColors,
	QuickDithering,
	QuickSettingsState,
} from "./quick-settings";

type QuickSettingsControlsOptions = {
	els: Elements;
	processingState: ProcessingState;
	triggerAutoProcess: () => void;
	updateReduceColorsDisabledStates: () => void;
	updateBgDisabledStates: () => void;
};

export type QuickSettingsControls = {
	getQuickSettings: () => QuickSettingsState;
	applyQuickSettings: (settings: QuickSettingsState, presetId?: string) => void;
	setBackgroundColor: (hex: string) => void;
	syncQuickSettingsToAdvanced: () => void;
};

export const setupQuickSettingsControls = ({
	els,
	processingState,
	triggerAutoProcess,
	updateReduceColorsDisabledStates,
	updateBgDisabledStates,
}: QuickSettingsControlsOptions): QuickSettingsControls => {
	const getQuickSettings = (): QuickSettingsState => ({
		processingMode: els.quickProcessingModeSelect.value as ProcessingMode,
		detailLevel: els.quickDetailLevelSelect.value as DetailLevel,
		colors: els.quickColorsSelect.value as QuickColors,
		background: els.quickBackgroundSelect.value as QuickBackground,
		dithering: els.quickDitheringSelect.value as QuickDithering,
		outlineStyle: els.quickOutlineStyleSelect.value as OutlineStyle,
		trimToContent: els.quickAutoTrimCheck.checked,
	});

	const setBackgroundColor = (hex: string) => {
		els.quickBackgroundColorInput.value = hex;
	};

	const syncQuickSettingsToAdvanced = () => {
		const quick = getQuickSettings();
		if (quick.colors !== "custom") {
			processingState.currentFixedPalette = undefined;
		}
		if (quick.colors === "auto") {
			els.reduceColorModeSelect.value = "none";
		} else if (quick.colors !== "custom") {
			els.reduceColorModeSelect.value = "auto";
			els.colorCountInput.value = quick.colors;
			els.colorCountSlider.value = quick.colors;
		}
		if (quick.background === "keep") {
			els.bgExtractionMethod.value = "none";
		} else if (quick.background === "auto") {
			els.bgExtractionMethod.value = "auto";
		} else if (quick.background === "pick") {
			els.bgExtractionMethod.value = "rgb";
			els.bgRgbInput.value = els.quickBackgroundColorInput.value;
			els.bgColorInput.value = els.quickBackgroundColorInput.value;
		}
		els.quickBackgroundPicker.style.display =
			quick.background === "pick" ? "flex" : "none";
		if (quick.dithering === "off") {
			els.ditherModeSelect.value = "none";
			els.ditherStrengthInput.value = "0";
			els.ditherStrengthSlider.value = "0";
		} else if (quick.dithering === "subtle") {
			els.ditherModeSelect.value = "ordered";
			els.ditherStrengthInput.value = "20";
			els.ditherStrengthSlider.value = "20";
		} else if (quick.dithering === "strong") {
			els.ditherModeSelect.value = "floyd-steinberg";
			els.ditherStrengthInput.value = "60";
			els.ditherStrengthSlider.value = "60";
		}
		els.outlineStyleSelect.value = quick.outlineStyle;
		els.trimToContentCheck.checked = quick.trimToContent;
	};

	const applyQuickSettings = (
		settings: QuickSettingsState,
		presetId = "custom",
	) => {
		if (presetId !== "custom") {
			els.quantStepInput.value = String(
				PROCESS_RANGES.detectionQuantStep.default,
			);
			els.quantStepSlider.value = els.quantStepInput.value;
			els.sampleWindowInput.value = String(PROCESS_RANGES.sampleWindow.default);
			els.sampleWindowSlider.value = els.sampleWindowInput.value;
			els.toleranceInput.value = String(
				PROCESS_RANGES.backgroundTolerance.default,
			);
			els.toleranceSlider.value = els.toleranceInput.value;
			els.floatingMaxPercentInput.value = String(
				PROCESS_RANGES.floatingMaxPercent.default,
			);
			els.floatingMaxPercentSlider.value = els.floatingMaxPercentInput.value;
			els.forcePixelsWInput.value = "";
			els.forcePixelsHInput.value = "";
			els.gridDetectionModeSelect.value = "auto";
			els.preRemoveCheck.checked = PROCESS_DEFAULTS.preRemoveBackground;
			els.postRemoveCheck.checked = PROCESS_DEFAULTS.postRemoveBackground;
			els.bgRemovalScopeSelect.value = PROCESS_DEFAULTS.bgRemovalScope;
			els.bgConnectivitySelect.value = PROCESS_DEFAULTS.bgConnectivity;
			els.fastAutoGridFromTrimmedCheck.checked =
				PROCESS_DEFAULTS.fastAutoGridFromTrimmed;
			els.makeSquareCheck.checked = PROCESS_DEFAULTS.makeSquare;
			els.keepAspectRatioCheck.checked = PROCESS_DEFAULTS.keepAspectRatio;
			els.outlineColorInput.value = "#ffffff";
			processingState.currentFixedPalette = undefined;
		}
		els.quickProcessingModeSelect.value = settings.processingMode;
		els.quickDetailLevelSelect.value = settings.detailLevel;
		els.quickColorsSelect.value = settings.colors;
		els.quickBackgroundSelect.value = settings.background;
		els.quickDitheringSelect.value = settings.dithering;
		els.quickOutlineStyleSelect.value = settings.outlineStyle;
		els.quickAutoTrimCheck.checked = settings.trimToContent;
		els.builtInPresetSelect.value = presetId;
		syncQuickSettingsToAdvanced();
	};

	[
		els.quickProcessingModeSelect,
		els.quickDetailLevelSelect,
		els.quickColorsSelect,
		els.quickBackgroundSelect,
		els.quickDitheringSelect,
		els.quickOutlineStyleSelect,
		els.quickAutoTrimCheck,
	].forEach((el) => {
		el.addEventListener("change", () => {
			els.builtInPresetSelect.value = "custom";
			syncQuickSettingsToAdvanced();
			updateReduceColorsDisabledStates();
			updateBgDisabledStates();
			triggerAutoProcess();
		});
	});

	[
		els.reduceColorModeSelect,
		els.colorCountInput,
		els.colorCountSlider,
	].forEach((el) => {
		el.addEventListener("change", () => {
			els.quickColorsSelect.value = "custom";
			els.builtInPresetSelect.value = "custom";
		});
	});
	[
		els.bgExtractionMethod,
		els.bgRgbInput,
		els.bgColorInput,
		els.preRemoveCheck,
		els.postRemoveCheck,
		els.bgRemovalScopeSelect,
		els.bgConnectivitySelect,
		els.toleranceInput,
	].forEach((el) => {
		el.addEventListener("change", () => {
			els.quickBackgroundSelect.value = "custom";
			els.builtInPresetSelect.value = "custom";
		});
	});
	[
		els.ditherModeSelect,
		els.ditherStrengthInput,
		els.ditherStrengthSlider,
	].forEach((el) => {
		el.addEventListener("change", () => {
			els.quickDitheringSelect.value = "custom";
			els.builtInPresetSelect.value = "custom";
		});
	});
	els.outlineStyleSelect.addEventListener("change", () => {
		els.quickOutlineStyleSelect.value = els.outlineStyleSelect.value;
		els.builtInPresetSelect.value = "custom";
	});
	els.trimToContentCheck.addEventListener("change", () => {
		els.quickAutoTrimCheck.checked = els.trimToContentCheck.checked;
		els.builtInPresetSelect.value = "custom";
	});

	return {
		getQuickSettings,
		applyQuickSettings,
		setBackgroundColor,
		syncQuickSettingsToAdvanced,
	};
};
