import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	hasCompleteForcedSize,
	populateAdvancedConvertOutputSize,
	updateAdvancedProcessingControls,
} from "./advanced-processing-controls";
import type { Elements } from "./app-elements";

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

class MockElement {
	hidden = false;
	classList = new MockClassList();
	attributes = new Map<string, string>();
	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}
}

class MockControl extends MockElement {
	value = "";
	disabled = false;
}

const createElements = (): Elements =>
	({
		advancedProcessingModeSelect: new MockControl(),
		advancedProcessingModeSetting: new MockElement(),
		advancedProcessingModeNotice: new MockElement(),
		advancedConvertWidthSetting: new MockElement(),
		advancedConvertHeightSetting: new MockElement(),
		advancedConvertWidthInput: new MockControl(),
		advancedConvertHeightInput: new MockControl(),
		gridDetectionModeSelect: new MockControl(),
		forcePixelsWInput: new MockControl(),
		forcePixelsHInput: new MockControl(),
	}) as unknown as Elements;

const image = (): RawImage => ({
	width: 64,
	height: 32,
	data: new Uint8ClampedArray(64 * 32 * 4),
});

describe("advanced processing controls", () => {
	it("shows Convert dimensions only for a Convert route", () => {
		const els = createElements();
		els.advancedProcessingModeSelect.value = "auto";

		updateAdvancedProcessingControls(els, "refine");
		expect(els.advancedConvertWidthSetting.hidden).toBe(true);
		expect(els.advancedConvertHeightSetting.hidden).toBe(true);

		updateAdvancedProcessingControls(els, "convert");
		expect(els.advancedConvertWidthSetting.hidden).toBe(false);
		expect(els.advancedConvertHeightSetting.hidden).toBe(false);

		els.advancedProcessingModeSelect.value = "convert";
		updateAdvancedProcessingControls(els);
		expect(els.advancedConvertWidthSetting.hidden).toBe(false);
	});

	it("expands the balanced Convert candidate into concrete dimensions", () => {
		const els = createElements();

		populateAdvancedConvertOutputSize(els, image());

		expect(Number(els.advancedConvertWidthInput.value)).toBeGreaterThan(0);
		expect(Number(els.advancedConvertHeightInput.value)).toBeGreaterThan(0);
	});

	it("preserves one entered dimension and derives the other from the image ratio", () => {
		const els = createElements();
		els.advancedConvertWidthInput.value = "20";

		populateAdvancedConvertOutputSize(els, image());

		expect(els.advancedConvertWidthInput.value).toBe("20");
		expect(els.advancedConvertHeightInput.value).toBe("10");
	});

	it("disables Processing and explains why when a complete forced size wins", () => {
		const els = createElements();
		els.advancedProcessingModeSelect.value = "convert";
		els.gridDetectionModeSelect.value = "force";
		els.forcePixelsWInput.value = "16";
		els.forcePixelsHInput.value = "12";

		expect(hasCompleteForcedSize(els)).toBe(true);
		updateAdvancedProcessingControls(els);

		expect(els.advancedProcessingModeSelect.disabled).toBe(true);
		expect(els.advancedProcessingModeNotice.hidden).toBe(false);
		expect(els.advancedConvertWidthSetting.hidden).toBe(true);
		expect(
			els.advancedProcessingModeSetting.classList.contains(
				"is-disabled-visible",
			),
		).toBe(true);
	});

	it("keeps Processing available until both forced dimensions are present", () => {
		const els = createElements();
		els.gridDetectionModeSelect.value = "force";
		els.forcePixelsWInput.value = "16";

		updateAdvancedProcessingControls(els);

		expect(els.advancedProcessingModeSelect.disabled).toBe(false);
		expect(els.advancedProcessingModeNotice.hidden).toBe(true);
	});
});
