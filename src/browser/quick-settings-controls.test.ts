import { describe, expect, it, vi } from "vitest";
import type { Elements } from "./app-elements";
import {
	setupQuickSettingsControls,
	updateQuickSettingsDisabledStates,
} from "./quick-settings-controls";

class MockSettingItem {
	private classes = new Set<string>();
	classList = {
		toggle: (name: string, force: boolean) => {
			if (force) this.classes.add(name);
			else this.classes.delete(name);
		},
		contains: (name: string) => this.classes.has(name),
	};
	setAttribute() {
		// 属性は検証しないので何もしない
	}
}

class MockControl extends EventTarget {
	value = "";
	checked = false;
	disabled = false;
	style = { display: "" };
	settingItem = new MockSettingItem();
	closest(selector: string) {
		return selector === ".setting-item" ? this.settingItem : null;
	}
}

const createElements = () => {
	const controls = {
		quickProcessingModeSelect: new MockControl(),
		quickDetailLevelSelect: new MockControl(),
		quickCellScaleSelect: new MockControl(),
		quickReductionModeSelect: new MockControl(),
		quickBackgroundSelect: new MockControl(),
		quickBackgroundPicker: new MockControl(),
		quickBackgroundColorInput: new MockControl(),
		quickDitheringSelect: new MockControl(),
	};
	controls.quickProcessingModeSelect.value = "auto";
	controls.quickDetailLevelSelect.value = "balanced";
	controls.quickCellScaleSelect.value = "same";
	controls.quickReductionModeSelect.value = "auto";
	controls.quickBackgroundSelect.value = "auto";
	controls.quickDitheringSelect.value = "off";
	return controls;
};

describe("quick settings controls", () => {
	it("keeps quick changes local and clears candidate selections", () => {
		const els = createElements();
		const clearCandidateSelections = vi.fn();
		const controls = setupQuickSettingsControls({
			els: els as unknown as Elements,
			triggerAutoProcess: vi.fn(),
			clearCandidateSelections,
		});

		els.quickReductionModeSelect.value = "pico8";
		els.quickReductionModeSelect.dispatchEvent(new Event("change"));

		expect(clearCandidateSelections).toHaveBeenCalledOnce();
		expect(controls.getQuickSettings().reductionMode).toBe("pico8");
	});

	it("disables detail when the effective route does not use it", () => {
		const els = createElements();
		updateQuickSettingsDisabledStates(els as unknown as Elements, "refine");
		expect(els.quickDetailLevelSelect.disabled).toBe(true);
		updateQuickSettingsDisabledStates(els as unknown as Elements, "convert");
		expect(els.quickDetailLevelSelect.disabled).toBe(false);
	});

	it("disables pixel size when the effective route does not restore a grid", () => {
		const els = createElements();
		updateQuickSettingsDisabledStates(els as unknown as Elements, "convert");
		expect(els.quickCellScaleSelect.disabled).toBe(true);
		updateQuickSettingsDisabledStates(els as unknown as Elements, "preserve");
		expect(els.quickCellScaleSelect.disabled).toBe(true);
		updateQuickSettingsDisabledStates(els as unknown as Elements, "refine");
		expect(els.quickCellScaleSelect.disabled).toBe(false);
	});

	it("keeps the confirmed Auto route state while reprocessing", () => {
		const els = createElements();
		const triggerAutoProcess = vi.fn();
		setupQuickSettingsControls({
			els: els as unknown as Elements,
			triggerAutoProcess,
			clearCandidateSelections: vi.fn(),
		});
		updateQuickSettingsDisabledStates(els as unknown as Elements, "refine");

		els.quickBackgroundSelect.value = "keep";
		els.quickBackgroundSelect.dispatchEvent(new Event("change"));

		expect(els.quickDetailLevelSelect.disabled).toBe(true);
		expect(
			els.quickDetailLevelSelect.settingItem.classList.contains("disabled"),
		).toBe(true);
		expect(triggerAutoProcess).toHaveBeenCalledOnce();
	});

	it("keeps the confirmed Auto convert state while reprocessing", () => {
		const els = createElements();
		setupQuickSettingsControls({
			els: els as unknown as Elements,
			triggerAutoProcess: vi.fn(),
			clearCandidateSelections: vi.fn(),
		});
		updateQuickSettingsDisabledStates(els as unknown as Elements, "convert");

		els.quickBackgroundSelect.value = "keep";
		els.quickBackgroundSelect.dispatchEvent(new Event("change"));

		expect(els.quickDetailLevelSelect.disabled).toBe(false);
		expect(
			els.quickDetailLevelSelect.settingItem.classList.contains("disabled"),
		).toBe(false);
	});

	it("updates detail immediately for an explicit processing route", () => {
		const els = createElements();
		setupQuickSettingsControls({
			els: els as unknown as Elements,
			triggerAutoProcess: vi.fn(),
			clearCandidateSelections: vi.fn(),
		});
		updateQuickSettingsDisabledStates(els as unknown as Elements, "refine");

		els.quickProcessingModeSelect.value = "convert";
		els.quickProcessingModeSelect.dispatchEvent(new Event("change"));

		expect(els.quickDetailLevelSelect.disabled).toBe(false);
	});

	it("re-enables detail when switching back to Auto", () => {
		const els = createElements();
		setupQuickSettingsControls({
			els: els as unknown as Elements,
			triggerAutoProcess: vi.fn(),
			clearCandidateSelections: vi.fn(),
		});
		els.quickProcessingModeSelect.value = "refine";
		els.quickProcessingModeSelect.dispatchEvent(new Event("change"));
		expect(els.quickDetailLevelSelect.disabled).toBe(true);

		els.quickProcessingModeSelect.value = "auto";
		els.quickProcessingModeSelect.dispatchEvent(new Event("change"));

		expect(els.quickDetailLevelSelect.disabled).toBe(false);
		expect(
			els.quickDetailLevelSelect.settingItem.classList.contains("disabled"),
		).toBe(false);
	});

	it("disables dependent controls only", () => {
		const els = createElements();
		els.quickBackgroundSelect.value = "keep";
		els.quickReductionModeSelect.value = "none";
		updateQuickSettingsDisabledStates(els as unknown as Elements);
		expect(els.quickDitheringSelect.disabled).toBe(true);

		els.quickBackgroundSelect.value = "pick";
		els.quickReductionModeSelect.value = "gb_pocket";
		updateQuickSettingsDisabledStates(els as unknown as Elements);
		expect(els.quickDitheringSelect.disabled).toBe(false);
		expect(els.quickBackgroundPicker.style.display).toBe("flex");
	});

	it("follows the selected finish when automatic reduction controls dithering", () => {
		const els = createElements();

		updateQuickSettingsDisabledStates(els as unknown as Elements, "refine");
		expect(els.quickDitheringSelect.disabled).toBe(true);

		updateQuickSettingsDisabledStates(els as unknown as Elements, "convert");
		expect(els.quickDitheringSelect.disabled).toBe(false);
	});

	it("keeps the confirmed dithering state while reprocessing", () => {
		const els = createElements();
		setupQuickSettingsControls({
			els: els as unknown as Elements,
			triggerAutoProcess: vi.fn(),
			clearCandidateSelections: vi.fn(),
		});
		updateQuickSettingsDisabledStates(els as unknown as Elements, "refine");
		expect(els.quickDitheringSelect.disabled).toBe(true);

		els.quickBackgroundSelect.value = "keep";
		els.quickBackgroundSelect.dispatchEvent(new Event("change"));

		expect(els.quickDitheringSelect.disabled).toBe(true);
	});

	it("updates dithering immediately for a route-independent reduction choice", () => {
		const els = createElements();
		setupQuickSettingsControls({
			els: els as unknown as Elements,
			triggerAutoProcess: vi.fn(),
			clearCandidateSelections: vi.fn(),
		});
		updateQuickSettingsDisabledStates(els as unknown as Elements, "convert");
		expect(els.quickDitheringSelect.disabled).toBe(false);

		els.quickReductionModeSelect.value = "none";
		els.quickReductionModeSelect.dispatchEvent(new Event("change"));

		expect(els.quickDitheringSelect.disabled).toBe(true);
	});
});
