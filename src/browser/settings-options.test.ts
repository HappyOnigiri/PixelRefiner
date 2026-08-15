import { describe, expect, it } from "vitest";
import type { Elements } from "./app-elements";
import { createProcessingState } from "./app-state";
import {
	createAdvancedProcessOptions,
	createProcessOptions,
} from "./settings-options";

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
		quickDitheringSelect: select("strong"),
	}) as Elements;

const advancedElements = (
	background: "none" | "auto",
	preRemove: boolean,
	postRemove: boolean,
): Elements => {
	const fallback = input("0");
	const values: Partial<Elements> = {
		bgExtractionMethod: select(background),
		preRemoveCheck: input("", preRemove),
		postRemoveCheck: input("", postRemove),
		advancedProcessingModeSelect: select("auto"),
		advancedConvertSizeModeSelect: select("custom-both"),
		advancedConvertWidthInput: input("24"),
		advancedConvertHeightInput: input("18"),
		advancedBgRemovalScopeSelect: select("auto"),
		bgConnectivitySelect: select("4"),
		cellSamplingModeSelect: select("hard-alpha-medoid"),
		smallAspectGridAlignmentSelect: select("on"),
		watermarkSamplingCompatSelect: select("on"),
		gridDetectionModeSelect: select("auto"),
		reduceColorModeSelect: select("none"),
		ditherModeSelect: select("none"),
		outlineStyleSelect: select("none"),
		outlineColorInput: input("#ffffff"),
		smallComponentModeSelect: select("auto"),
		geminiWatermarkRemovalSelect: select("auto"),
		bgRgbInput: input("#ffffff"),
	};
	return new Proxy(values, {
		get: (target, property: keyof Elements) => target[property] ?? fallback,
	}) as Elements;
};

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
			trimToContent: false,
			preserveProcessingScale: true,
			ditherMode: "floyd-steinberg",
		});
		expect(options.fixedPalette).toBeUndefined();
	});

	it.each([
		["none", true, true, false],
		["auto", false, false, false],
		["auto", true, false, true],
		["auto", false, true, true],
	] as const)(
		"derives Advanced trimming from background %s with pre=%s and post=%s",
		(background, preRemove, postRemove, trimToContent) => {
			const state = createProcessingState();
			const options = createAdvancedProcessOptions(
				advancedElements(background, preRemove, postRemove),
				state,
			);

			expect(options.trimToContent).toBe(trimToContent);
		},
	);

	it("passes Advanced Convert output dimensions independently of forced grid dimensions", () => {
		const state = createProcessingState();
		const els = advancedElements("auto", true, true);
		els.advancedProcessingModeSelect.value = "convert";
		els.gridDetectionModeSelect.value = "auto";

		const options = createAdvancedProcessOptions(els, state);

		expect(options).toMatchObject({
			processingMode: "convert",
			convertPixelsW: 24,
			convertPixelsH: 18,
		});
		expect(options.forcePixelsW).toBeUndefined();
		expect(options.forcePixelsH).toBeUndefined();
	});

	it("passes only the selected Convert dimension", () => {
		const state = createProcessingState();
		const els = advancedElements("auto", true, true);
		els.advancedConvertSizeModeSelect.value = "custom-width";

		const options = createAdvancedProcessOptions(els, state);

		expect(options.convertPixelsW).toBe(24);
		expect(options.convertPixelsH).toBeUndefined();
	});

	it("uses a five-level Convert size without explicit dimensions", () => {
		const state = createProcessingState();
		const els = advancedElements("auto", true, true);
		els.advancedConvertSizeModeSelect.value = "small";

		const options = createAdvancedProcessOptions(els, state);

		expect(options.detailLevel).toBe("small");
		expect(options.convertPixelsW).toBeUndefined();
		expect(options.convertPixelsH).toBeUndefined();
	});

	it("does not apply a partially entered two-dimension size", () => {
		const state = createProcessingState();
		const els = advancedElements("auto", true, true);
		els.advancedConvertHeightInput.value = "";

		const options = createAdvancedProcessOptions(els, state);

		expect(options.convertPixelsW).toBeUndefined();
		expect(options.convertPixelsH).toBeUndefined();
	});
});
