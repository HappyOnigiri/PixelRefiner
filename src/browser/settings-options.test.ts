import { describe, expect, it } from "vitest";
import type { Elements } from "./app-elements";
import { createProcessingState } from "./app-state";
import { createProcessOptions } from "./settings-options";

const select = (value: string) => ({ value }) as HTMLSelectElement;
const input = (value: string, checked = false) =>
	({ value, checked }) as HTMLInputElement;

const quickElements = (): Elements =>
	({
		quickProcessingModeSelect: select("convert"),
		quickDetailLevelSelect: select("detailed"),
		quickReductionModeSelect: select("pico8"),
		quickBackgroundSelect: select("keep"),
		quickBackgroundColorInput: input("#abcdef"),
		quickBgRemovalScopeSelect: select("all"),
		quickDitheringSelect: select("strong"),
		quickOutlineStyleSelect: select("sharp"),
		quickAutoTrimCheck: input("", true),
	}) as Elements;

describe("settings mode options", () => {
	it("ignores Quick and Advanced values in Preset mode", () => {
		const els = quickElements();
		const state = createProcessingState();
		state.settingsMode = "preset";
		state.selectedBuiltInPresetId = "auto";

		const first = createProcessOptions(els, state);
		els.quickReductionModeSelect.value = "nes";
		const second = createProcessOptions(els, state);

		expect(second).toEqual(first);
		// Auto プリセットは減色を処理経路へ委ねるため、かんたん設定の減色モードは混入しない。
		expect(second).not.toHaveProperty("reduceColorMode");
	});

	it("builds Quick mode only from Quick controls", () => {
		const els = quickElements();
		const state = createProcessingState();
		state.settingsMode = "quick";
		state.currentFixedPalette = [{ r: 1, g: 2, b: 3 }];

		const options = createProcessOptions(els, state);
		expect(options).toMatchObject({
			processingMode: "convert",
			detailLevel: "detailed",
			reduceColorMode: "pico8",
			bgExtractionMethod: "none",
			ditherMode: "floyd-steinberg",
		});
		expect(options.fixedPalette).toBeUndefined();
	});
});
