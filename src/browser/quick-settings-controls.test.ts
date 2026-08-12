import { describe, expect, it, vi } from "vitest";
import type { Elements } from "./app-elements";
import { createProcessingState } from "./app-state";
import { QUICK_SETTINGS_DEFAULTS } from "./quick-settings";
import { setupQuickSettingsControls } from "./quick-settings-controls";

class MockControl extends EventTarget {
	value = "";
	checked = false;
	style = { display: "" };
}

const controlNames = [
	"quickProcessingModeSelect",
	"quickDetailLevelSelect",
	"quickColorsSelect",
	"quickBackgroundSelect",
	"quickDitheringSelect",
	"quickOutlineStyleSelect",
	"quickAutoTrimCheck",
	"quickBackgroundColorInput",
	"quickBackgroundPicker",
	"builtInPresetSelect",
	"reduceColorModeSelect",
	"colorCountInput",
	"colorCountSlider",
	"bgExtractionMethod",
	"bgRgbInput",
	"bgColorInput",
	"preRemoveCheck",
	"postRemoveCheck",
	"quickBgRemovalScopeSelect",
	"bgConnectivitySelect",
	"toleranceInput",
	"toleranceSlider",
	"ditherModeSelect",
	"ditherStrengthInput",
	"ditherStrengthSlider",
	"outlineStyleSelect",
	"trimToContentCheck",
	"quantStepInput",
	"quantStepSlider",
	"forcePixelsWInput",
	"forcePixelsHInput",
	"sampleWindowInput",
	"sampleWindowSlider",
	"cellSamplingModeSelect",
	"smallAspectGridAlignmentSelect",
	"watermarkSamplingCompatSelect",
	"preserveThinFeaturesCheck",
	"autoGridFromTrimmedCheck",
	"phaseAwareGridSearchCheck",
	"boundaryContrastOverrideCheck",
	"detectionBackgroundMaskCheck",
	"gridSignalColorBoundaryCheck",
	"gridSignalLuminanceAlphaCheck",
	"gridSignalAutocorrelationCheck",
	"gridSignalReconstructionCheck",
	"gridSignalLocalPhaseCheck",
	"backgroundDehaloCheck",
	"backgroundEdgeCleanupCheck",
	"backgroundRampFollowCheck",
	"backgroundRemovalRollbackCheck",
	"alphaBorderBackgroundGuardCheck",
	"backgroundConfidenceGateCheck",
	"smallComponentBackgroundGateCheck",
	"maxSamplesPerCellInput",
	"cellAlphaThresholdInput",
	"autoMaxCellsWInput",
	"autoMaxCellsHInput",
	"backgroundMaskToleranceInput",
	"trimAlphaThresholdInput",
	"fastAutoGridFromTrimmedCheck",
	"makeSquareCheck",
	"keepAspectRatioCheck",
	"gridDetectionModeSelect",
	"outlineColorInput",
	"smallComponentModeSelect",
] as const;

type MockElements = Record<(typeof controlNames)[number], MockControl>;

const createElements = (): MockElements => {
	const controls = {} as MockElements;
	for (const name of controlNames) controls[name] = new MockControl();
	controls.quickProcessingModeSelect.value = "auto";
	controls.quickDetailLevelSelect.value = "balanced";
	controls.quickColorsSelect.value = "auto";
	controls.quickBackgroundSelect.value = "auto";
	controls.quickBgRemovalScopeSelect.value = "auto";
	controls.quickDitheringSelect.value = "off";
	controls.quickOutlineStyleSelect.value = "none";
	controls.quickAutoTrimCheck.checked = true;
	return controls;
};

const setup = (els: MockElements) => {
	const clearCandidateSelections = vi.fn();
	const controls = setupQuickSettingsControls({
		els: els as unknown as Elements,
		processingState: createProcessingState(),
		triggerAutoProcess: vi.fn(),
		updateReduceColorsDisabledStates: vi.fn(),
		updateBgDisabledStates: vi.fn(),
		clearCandidateSelections,
	});
	return { controls, clearCandidateSelections };
};

describe("quick settings controls", () => {
	it("clears candidate selections after a direct quick-setting change", () => {
		const els = createElements();
		const { clearCandidateSelections } = setup(els);

		els.quickProcessingModeSelect.value = "convert";
		els.quickProcessingModeSelect.dispatchEvent(new Event("change"));

		expect(clearCandidateSelections).toHaveBeenCalledOnce();
	});

	it("marks numeric quick domains as custom on input", () => {
		const els = createElements();
		setup(els);
		els.quickColorsSelect.value = "16";
		els.quickDitheringSelect.value = "subtle";
		els.builtInPresetSelect.value = "limited-colors";

		els.colorCountInput.dispatchEvent(new Event("input"));
		expect(els.quickColorsSelect.value).toBe("custom");
		expect(els.builtInPresetSelect.value).toBe("custom");

		els.builtInPresetSelect.value = "limited-colors";
		els.ditherStrengthSlider.dispatchEvent(new Event("input"));
		expect(els.quickDitheringSelect.value).toBe("custom");
		expect(els.builtInPresetSelect.value).toBe("custom");
	});

	it("marks every directly edited technical setting as a custom preset", () => {
		const els = createElements();
		setup(els);
		els.quickColorsSelect.value = "32";
		els.builtInPresetSelect.value = "transparent-icon";

		els.quantStepInput.dispatchEvent(new Event("input"));

		expect(els.builtInPresetSelect.value).toBe("custom");
		expect(els.quickColorsSelect.value).toBe("32");
	});

	it("clears candidate selections when applying a purpose preset", () => {
		const els = createElements();
		const { controls, clearCandidateSelections } = setup(els);

		controls.applyQuickSettings(
			{
				processingMode: "convert",
				detailLevel: "balanced",
				colors: "32",
				background: "keep",
				bgRemovalScope: "auto",
				dithering: "subtle",
				outlineStyle: "none",
				trimToContent: true,
			},
			"photo-to-pixel",
		);

		expect(clearCandidateSelections).toHaveBeenCalledOnce();
		expect(els.smallComponentModeSelect.value).toBe("auto");
		expect(els.cellSamplingModeSelect.value).toBe("hard-alpha-medoid");
	});

	it("reads the background removal scope from the quick settings", () => {
		const els = createElements();
		const { controls } = setup(els);

		expect(controls.getQuickSettings().bgRemovalScope).toBe("auto");

		els.quickBgRemovalScopeSelect.value = "all";
		els.quickBgRemovalScopeSelect.dispatchEvent(new Event("change"));

		expect(controls.getQuickSettings().bgRemovalScope).toBe("all");
		// 背景の抽出方法は変えていないので、背景ドメインは custom へ落とさない。
		expect(els.quickBackgroundSelect.value).toBe("auto");
		expect(els.builtInPresetSelect.value).toBe("custom");
	});

	it("applies the scope carried by a preset", () => {
		const els = createElements();
		const { controls } = setup(els);
		els.quickBgRemovalScopeSelect.value = "all";

		controls.applyQuickSettings(
			{ ...QUICK_SETTINGS_DEFAULTS, bgRemovalScope: "outer" },
			"crisp-sprite",
		);

		expect(els.quickBgRemovalScopeSelect.value).toBe("outer");
	});
});
