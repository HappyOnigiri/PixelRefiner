import { describe, expect, it } from "vitest";
import { PROCESS_DEFAULTS } from "../shared/config";
import {
	BUILT_IN_PRESETS,
	createBuiltInPresetOptions,
	createQuickProcessOptions,
	createUiInitialProcessOptions,
	QUICK_SETTINGS_DEFAULTS,
} from "./quick-settings";

describe("quick settings", () => {
	it("derives independent defaults from the central config", () => {
		expect(QUICK_SETTINGS_DEFAULTS).toMatchObject({
			processingMode: PROCESS_DEFAULTS.processingMode,
			detailLevel: PROCESS_DEFAULTS.detailLevel,
			reductionMode: "none",
			outlineStyle: PROCESS_DEFAULTS.outlineStyle,
			trimToContent: PROCESS_DEFAULTS.trimToContent,
		});
	});

	it("uses no color reduction for the default Auto preset", () => {
		const options = createUiInitialProcessOptions();

		expect(options).toMatchObject({
			processingMode: "auto",
			reduceColors: false,
			reduceColorMode: "none",
			ditherMode: "none",
			ditherStrength: 0,
		});
	});

	it.each([
		"mono",
		"gb_legacy",
		"pico8",
		"nes",
		"pc98",
		"msx",
		"c64",
		"arne16",
		"sfc_sprite",
		"sfc_bg",
	] as const)("maps the %s standard palette directly", (reductionMode) => {
		const options = createQuickProcessOptions({
			...QUICK_SETTINGS_DEFAULTS,
			reductionMode,
		});
		expect(options).toMatchObject({
			reduceColors: true,
			reduceColorMode: reductionMode,
		});
	});

	it.each(["8", "16", "32"] as const)(
		"maps the %s-color choice to automatic reduction with a fixed count",
		(reductionMode) => {
			const options = createQuickProcessOptions({
				...QUICK_SETTINGS_DEFAULTS,
				reductionMode,
			});
			expect(options).toMatchObject({
				reduceColors: true,
				reduceColorMode: "auto",
				colorCount: Number(reductionMode),
			});
		},
	);

	it("changes only size-related settings when detail changes", () => {
		const coarse = createQuickProcessOptions({
			...QUICK_SETTINGS_DEFAULTS,
			detailLevel: "coarse",
			reductionMode: "pico8",
			dithering: "strong",
		});
		const detailed = createQuickProcessOptions({
			...QUICK_SETTINGS_DEFAULTS,
			detailLevel: "detailed",
			reductionMode: "pico8",
			dithering: "strong",
		});

		expect(coarse.detailLevel).toBe("coarse");
		expect(detailed.detailLevel).toBe("detailed");
		expect({
			mode: coarse.reduceColorMode,
			count: coarse.colorCount,
			dither: coarse.ditherMode,
			strength: coarse.ditherStrength,
		}).toEqual({
			mode: detailed.reduceColorMode,
			count: detailed.colorCount,
			dither: detailed.ditherMode,
			strength: detailed.ditherStrength,
		});
	});

	it("maps picked backgrounds and dithering without reading Advanced settings", () => {
		const options = createQuickProcessOptions({
			...QUICK_SETTINGS_DEFAULTS,
			background: "pick",
			backgroundColor: "#123456",
			dithering: "strong",
		});
		expect(options).toMatchObject({
			bgExtractionMethod: "rgb",
			bgRgb: "#123456",
			ditherMode: "floyd-steinberg",
			ditherStrength: 60,
		});
	});

	it("defines six self-contained built-in presets", () => {
		expect(BUILT_IN_PRESETS.map((preset) => preset.id)).toEqual([
			"auto",
			"crisp-sprite",
			"keep-fine-details",
			"transparent-icon",
			"limited-colors",
			"photo-to-pixel",
		]);
		expect(createBuiltInPresetOptions("transparent-icon")).toMatchObject({
			colorCount: 32,
			outlineStyle: "rounded",
		});
		expect(createBuiltInPresetOptions("photo-to-pixel")).toMatchObject({
			processingMode: "convert",
			colorCount: 32,
			bgExtractionMethod: "none",
		});
	});
});
