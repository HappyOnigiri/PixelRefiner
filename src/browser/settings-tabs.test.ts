import { describe, expect, it, vi } from "vitest";
import type { Elements } from "./app-elements";
import { createProcessingState } from "./app-state";
import { setupSettingsTabs } from "./settings-tabs";

class MockClassList {
	private values = new Set<string>();
	toggle(name: string, force: boolean) {
		if (force) this.values.add(name);
		else this.values.delete(name);
	}
	contains(name: string) {
		return this.values.has(name);
	}
}

class MockTab extends EventTarget {
	dataset: DOMStringMap;
	classList = new MockClassList();
	tabIndex = 0;
	attributes = new Map<string, string>();
	constructor(mode: string) {
		super();
		this.dataset = { settingsMode: mode } as DOMStringMap;
	}
	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}
	focus() {}
}

describe("settings tabs", () => {
	it("switches only the active mode and panel", () => {
		const tabs = [
			new MockTab("preset"),
			new MockTab("quick"),
			new MockTab("advanced"),
		];
		const panels = [{ hidden: false }, { hidden: true }, { hidden: true }];
		const els = {
			settingsTabs: tabs,
			presetSettingsPanel: panels[0],
			quickSettingsPanel: panels[1],
			advancedSettingsPanel: panels[2],
		} as unknown as Elements;
		const processingState = createProcessingState();
		const clearCandidateSelections = vi.fn();
		const triggerAutoProcess = vi.fn();
		const controls = setupSettingsTabs({
			els,
			processingState,
			clearCandidateSelections,
			triggerAutoProcess,
		});

		controls.setSettingsMode("quick");

		expect(processingState.settingsMode).toBe("quick");
		expect(panels.map((panel) => panel.hidden)).toEqual([true, false, true]);
		expect(tabs[1].classList.contains("is-active")).toBe(true);
		expect(clearCandidateSelections).toHaveBeenCalledOnce();
		expect(triggerAutoProcess).toHaveBeenCalledOnce();
	});

	it("starts in Preset mode without processing", () => {
		const tabs = [
			new MockTab("preset"),
			new MockTab("quick"),
			new MockTab("advanced"),
		];
		const els = {
			settingsTabs: tabs,
			presetSettingsPanel: { hidden: true },
			quickSettingsPanel: { hidden: false },
			advancedSettingsPanel: { hidden: false },
		} as unknown as Elements;
		const processingState = createProcessingState();
		const triggerAutoProcess = vi.fn();

		setupSettingsTabs({
			els,
			processingState,
			clearCandidateSelections: vi.fn(),
			triggerAutoProcess,
		});

		expect(processingState.settingsMode).toBe("preset");
		expect(els.presetSettingsPanel.hidden).toBe(false);
		expect(els.quickSettingsPanel.hidden).toBe(true);
		expect(els.advancedSettingsPanel.hidden).toBe(true);
		expect(triggerAutoProcess).not.toHaveBeenCalled();
	});
});
