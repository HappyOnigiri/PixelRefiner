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
			reductionMode: "auto",
		});
	});

	it.each([
		["keep", false],
		["auto", true],
		["pick", true],
	] as const)(
		"derives trimming from the %s background mode",
		(background, trimToContent) => {
			const options = createQuickProcessOptions({
				...QUICK_SETTINGS_DEFAULTS,
				background,
			});

			expect(options.trimToContent).toBe(trimToContent);
		},
	);

	it("leaves color reduction to the processing route for the default Auto preset", () => {
		const options = createUiInitialProcessOptions();

		expect(options).toMatchObject({
			processingMode: "auto",
			ditherMode: "none",
			ditherStrength: 0,
		});
		expect(options).not.toHaveProperty("reduceColors");
		expect(options).not.toHaveProperty("reduceColorMode");
		expect(options).not.toHaveProperty("colorCount");
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

	it.each(["8", "16", "24", "32"] as const)(
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

	it("changes only the size level across the full five-step range", () => {
		const smallest = createQuickProcessOptions({
			...QUICK_SETTINGS_DEFAULTS,
			detailLevel: "smallest",
			reductionMode: "pico8",
			dithering: "strong",
		});
		const detailed = createQuickProcessOptions({
			...QUICK_SETTINGS_DEFAULTS,
			detailLevel: "detailed",
			reductionMode: "pico8",
			dithering: "strong",
		});

		expect(smallest.detailLevel).toBe("smallest");
		expect(detailed.detailLevel).toBe("detailed");
		expect({
			mode: smallest.reduceColorMode,
			count: smallest.colorCount,
			dither: smallest.ditherMode,
			strength: smallest.ditherStrength,
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
			bgRemovalScope: PROCESS_DEFAULTS.bgRemovalScope,
			outlineStyle: PROCESS_DEFAULTS.outlineStyle,
			ditherMode: "floyd-steinberg",
			ditherStrength: 60,
		});
	});

	it("keeps hidden background scope and outline at their shared defaults", () => {
		const options = createQuickProcessOptions(QUICK_SETTINGS_DEFAULTS);

		expect(options.bgRemovalScope).toBe(PROCESS_DEFAULTS.bgRemovalScope);
		expect(options.outlineStyle).toBe(PROCESS_DEFAULTS.outlineStyle);
	});

	it("defines eight built-in presets", () => {
		expect(BUILT_IN_PRESETS.map((preset) => preset.id)).toEqual([
			"auto",
			"crisp-sprite",
			"keep-fine-details",
			"photo-to-pixel",
			"transparent-icon",
			"retro-game",
			"background-art",
			"illustration-to-pixel-art",
		]);
		expect(createBuiltInPresetOptions("transparent-icon")).toMatchObject({
			colorCount: 32,
			outlineStyle: "none",
			trimToContent: true,
		});
		expect(createBuiltInPresetOptions("photo-to-pixel")).toMatchObject({
			processingMode: "convert",
			bgExtractionMethod: "auto",
			trimToContent: true,
		});
	});

	it("defines every built-in preset only as quick settings", () => {
		const quickSettingsById = Object.fromEntries(
			BUILT_IN_PRESETS.map((preset) => [preset.id, preset.quickSettings]),
		);

		expect(quickSettingsById).toEqual({
			auto: {
				processingMode: "auto",
				detailLevel: PROCESS_DEFAULTS.detailLevel,
				cellScale: PROCESS_DEFAULTS.cellScale,
				reductionMode: "auto",
				background: "auto",
				dithering: "off",
			},
			"crisp-sprite": {
				processingMode: "refine",
				detailLevel: PROCESS_DEFAULTS.detailLevel,
				cellScale: PROCESS_DEFAULTS.cellScale,
				reductionMode: "auto",
				background: "auto",
				dithering: "off",
			},
			"keep-fine-details": {
				processingMode: "preserve",
				detailLevel: PROCESS_DEFAULTS.detailLevel,
				cellScale: PROCESS_DEFAULTS.cellScale,
				reductionMode: "auto",
				background: "auto",
				dithering: "off",
			},
			"photo-to-pixel": {
				processingMode: "convert",
				detailLevel: PROCESS_DEFAULTS.detailLevel,
				cellScale: PROCESS_DEFAULTS.cellScale,
				reductionMode: "auto",
				background: "auto",
				dithering: "off",
			},
			"transparent-icon": {
				processingMode: "auto",
				detailLevel: PROCESS_DEFAULTS.detailLevel,
				cellScale: PROCESS_DEFAULTS.cellScale,
				reductionMode: "32",
				background: "auto",
				dithering: "off",
			},
			"retro-game": {
				processingMode: "auto",
				detailLevel: PROCESS_DEFAULTS.detailLevel,
				cellScale: PROCESS_DEFAULTS.cellScale,
				reductionMode: "gb_pocket",
				background: "auto",
				dithering: "off",
			},
			"background-art": {
				processingMode: "auto",
				detailLevel: PROCESS_DEFAULTS.detailLevel,
				cellScale: PROCESS_DEFAULTS.cellScale,
				reductionMode: "auto",
				background: "keep",
				dithering: "off",
			},
			"illustration-to-pixel-art": {
				processingMode: "convert",
				detailLevel: PROCESS_DEFAULTS.detailLevel,
				cellScale: PROCESS_DEFAULTS.cellScale,
				reductionMode: "32",
				background: "auto",
				dithering: "off",
			},
		});
	});

	it.each([
		["crisp-sprite", "refine"],
		["keep-fine-details", "preserve"],
		["photo-to-pixel", "convert"],
	] as const)(
		"aligns the %s preset with the Auto-selected %s route",
		(presetId, processingMode) => {
			const auto = createBuiltInPresetOptions("auto");
			const routePreset = createBuiltInPresetOptions(presetId);

			expect(routePreset).toEqual({ ...auto, processingMode });
			expect(routePreset).not.toHaveProperty("reduceColors");
			expect(routePreset).not.toHaveProperty("reduceColorMode");
			expect(routePreset).not.toHaveProperty("colorCount");
		},
	);
});
