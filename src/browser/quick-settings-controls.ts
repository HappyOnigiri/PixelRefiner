import { rgbToHex } from "../core/colorUtils";
import { createDefaultProcessOptions } from "../core/processor-options";
import { PROCESS_DEFAULTS } from "../shared/config";
import type {
	BackgroundRemovalScope,
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
	clearCandidateSelections: () => void;
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
	clearCandidateSelections,
}: QuickSettingsControlsOptions): QuickSettingsControls => {
	const getQuickSettings = (): QuickSettingsState => ({
		processingMode: els.quickProcessingModeSelect.value as ProcessingMode,
		detailLevel: els.quickDetailLevelSelect.value as DetailLevel,
		colors: els.quickColorsSelect.value as QuickColors,
		background: els.quickBackgroundSelect.value as QuickBackground,
		bgRemovalScope: els.quickBgRemovalScopeSelect
			.value as BackgroundRemovalScope,
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
		clearCandidateSelections();
		if (presetId !== "custom") {
			const defaults = createDefaultProcessOptions();
			els.quantStepInput.value = String(defaults.detectionQuantStep);
			els.quantStepSlider.value = els.quantStepInput.value;
			els.sampleWindowInput.value = String(defaults.sampleWindow);
			els.sampleWindowSlider.value = els.sampleWindowInput.value;
			els.toleranceInput.value = String(defaults.backgroundTolerance);
			els.toleranceSlider.value = els.toleranceInput.value;
			els.forcePixelsWInput.value = "";
			els.forcePixelsHInput.value = "";
			els.gridDetectionModeSelect.value =
				PROCESS_DEFAULTS.gridDetectionMode ?? "auto";
			els.preRemoveCheck.checked = defaults.preRemoveBackground;
			els.postRemoveCheck.checked = defaults.postRemoveBackground;
			els.bgConnectivitySelect.value = defaults.bgConnectivity;
			els.smallComponentModeSelect.value = defaults.smallComponentMode;
			els.alphaAwareMedoidCheck.checked =
				(defaults.cellSamplingMode as string) === "alpha-aware-medoid";
			els.fastAutoGridFromTrimmedCheck.checked =
				defaults.fastAutoGridFromTrimmed;
			els.makeSquareCheck.checked = defaults.makeSquare;
			els.keepAspectRatioCheck.checked = defaults.keepAspectRatio;
			els.outlineColorInput.value = rgbToHex(defaults.outlineColor);
			processingState.currentFixedPalette = undefined;
		}
		els.quickProcessingModeSelect.value = settings.processingMode;
		els.quickDetailLevelSelect.value = settings.detailLevel;
		els.quickColorsSelect.value = settings.colors;
		els.quickBackgroundSelect.value = settings.background;
		els.quickBgRemovalScopeSelect.value = settings.bgRemovalScope;
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
		els.quickBgRemovalScopeSelect,
		els.quickDitheringSelect,
		els.quickOutlineStyleSelect,
		els.quickAutoTrimCheck,
	].forEach((el) => {
		el.addEventListener("change", () => {
			clearCandidateSelections();
			els.builtInPresetSelect.value = "custom";
			syncQuickSettingsToAdvanced();
			updateReduceColorsDisabledStates();
			updateBgDisabledStates();
			triggerAutoProcess();
		});
	});

	const markColorsCustom = () => {
		els.quickColorsSelect.value = "custom";
		els.builtInPresetSelect.value = "custom";
	};
	els.reduceColorModeSelect.addEventListener("change", markColorsCustom);
	[els.colorCountInput, els.colorCountSlider].forEach((el) => {
		for (const eventName of ["input", "change"]) {
			el.addEventListener(eventName, markColorsCustom);
		}
	});
	const markBackgroundCustom = () => {
		els.quickBackgroundSelect.value = "custom";
		els.builtInPresetSelect.value = "custom";
	};
	[
		els.bgExtractionMethod,
		els.bgRgbInput,
		els.bgColorInput,
		els.preRemoveCheck,
		els.postRemoveCheck,
		els.bgConnectivitySelect,
	].forEach((el) => {
		el.addEventListener("change", markBackgroundCustom);
	});
	[els.toleranceInput, els.toleranceSlider].forEach((el) => {
		for (const eventName of ["input", "change"]) {
			el.addEventListener(eventName, markBackgroundCustom);
		}
	});
	const markDitheringCustom = () => {
		els.quickDitheringSelect.value = "custom";
		els.builtInPresetSelect.value = "custom";
	};
	els.ditherModeSelect.addEventListener("change", markDitheringCustom);
	[els.ditherStrengthInput, els.ditherStrengthSlider].forEach((el) => {
		for (const eventName of ["input", "change"]) {
			el.addEventListener(eventName, markDitheringCustom);
		}
	});
	els.outlineStyleSelect.addEventListener("change", () => {
		els.quickOutlineStyleSelect.value = els.outlineStyleSelect.value;
		els.builtInPresetSelect.value = "custom";
	});
	els.trimToContentCheck.addEventListener("change", () => {
		els.quickAutoTrimCheck.checked = els.trimToContentCheck.checked;
		els.builtInPresetSelect.value = "custom";
	});

	const advancedControls = [
		els.quantStepInput,
		els.quantStepSlider,
		els.forcePixelsWInput,
		els.forcePixelsHInput,
		els.sampleWindowInput,
		els.sampleWindowSlider,
		els.alphaAwareMedoidCheck,
		els.toleranceInput,
		els.toleranceSlider,
		els.preRemoveCheck,
		els.postRemoveCheck,
		els.bgConnectivitySelect,
		els.trimToContentCheck,
		els.fastAutoGridFromTrimmedCheck,
		els.makeSquareCheck,
		els.keepAspectRatioCheck,
		els.gridDetectionModeSelect,
		els.reduceColorModeSelect,
		els.ditherModeSelect,
		els.colorCountInput,
		els.colorCountSlider,
		els.ditherStrengthInput,
		els.ditherStrengthSlider,
		els.outlineStyleSelect,
		els.outlineColorInput,
		els.smallComponentModeSelect,
		els.bgExtractionMethod,
		els.bgRgbInput,
		els.bgColorInput,
	];
	for (const control of advancedControls) {
		const markPresetCustom = () => {
			els.builtInPresetSelect.value = "custom";
		};
		control.addEventListener("change", markPresetCustom);
		control.addEventListener("input", markPresetCustom);
	}

	return {
		getQuickSettings,
		applyQuickSettings,
		setBackgroundColor,
		syncQuickSettingsToAdvanced,
	};
};
