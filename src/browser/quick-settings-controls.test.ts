import { describe, expect, it, vi } from "vitest";
import type { Elements } from "./app-elements";
import {
	readQuickSettings,
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
	setAttribute() {}
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
		quickReductionModeSelect: new MockControl(),
		quickBackgroundSelect: new MockControl(),
		quickBackgroundPicker: new MockControl(),
		quickBackgroundColorInput: new MockControl(),
		quickDitheringSelect: new MockControl(),
		quickAutoTrimSelect: new MockControl(),
	};
	controls.quickProcessingModeSelect.value = "auto";
	controls.quickDetailLevelSelect.value = "balanced";
	controls.quickReductionModeSelect.value = "none";
	controls.quickBackgroundSelect.value = "auto";
	controls.quickDitheringSelect.value = "off";
	controls.quickAutoTrimSelect.value = "auto";
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

	it("disables dependent controls only", () => {
		const els = createElements();
		els.quickBackgroundSelect.value = "keep";
		els.quickReductionModeSelect.value = "none";
		updateQuickSettingsDisabledStates(els as unknown as Elements);
		expect(els.quickAutoTrimSelect.disabled).toBe(false);
		expect(
			els.quickAutoTrimSelect.settingItem.classList.contains("disabled"),
		).toBe(false);
		expect(els.quickDitheringSelect.disabled).toBe(true);
		expect(readQuickSettings(els as unknown as Elements).trimToContent).toBe(
			true,
		);

		els.quickBackgroundSelect.value = "pick";
		els.quickReductionModeSelect.value = "gb_pocket";
		updateQuickSettingsDisabledStates(els as unknown as Elements);
		expect(els.quickAutoTrimSelect.disabled).toBe(false);
		expect(
			els.quickAutoTrimSelect.settingItem.classList.contains("disabled"),
		).toBe(false);
		expect(els.quickDitheringSelect.disabled).toBe(false);
		expect(els.quickBackgroundPicker.style.display).toBe("flex");
		expect(readQuickSettings(els as unknown as Elements).trimToContent).toBe(
			true,
		);
	});

	it("maps the auto-trim select to a boolean setting", () => {
		const els = createElements();
		els.quickAutoTrimSelect.value = "none";

		expect(readQuickSettings(els as unknown as Elements).trimToContent).toBe(
			false,
		);
	});
});
