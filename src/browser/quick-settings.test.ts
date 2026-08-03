import { describe, expect, it } from "vitest";
import {
	applyQuickSettingsToOptions,
	BUILT_IN_PRESETS,
	QUICK_SETTINGS_DEFAULTS,
} from "./quick-settings";

describe("quick settings", () => {
	it("delegates automatic color selection to the processing route", () => {
		const result = applyQuickSettingsToOptions(
			{ reduceColors: false, reduceColorMode: "none", colorCount: 99 },
			QUICK_SETTINGS_DEFAULTS,
		);

		expect(result.reduceColors).toBeUndefined();
		expect(result.reduceColorMode).toBeUndefined();
		expect(result.colorCount).toBeUndefined();
	});

	it.each(["16", "32", "64"] as const)(
		"maps the %s-color level to automatic quantization",
		(colors) => {
			const result = applyQuickSettingsToOptions(
				{},
				{ ...QUICK_SETTINGS_DEFAULTS, colors },
			);

			expect(result).toMatchObject({
				reduceColors: true,
				reduceColorMode: "auto",
				colorCount: Number(colors),
			});
		},
	);

	it("preserves advanced values for custom domains", () => {
		const result = applyQuickSettingsToOptions(
			{
				reduceColors: true,
				reduceColorMode: "pico8",
				bgExtractionMethod: "top-left",
				ditherMode: "bayer-4x4",
				ditherStrength: 75,
			},
			{
				...QUICK_SETTINGS_DEFAULTS,
				colors: "custom",
				background: "custom",
				dithering: "custom",
			},
		);

		expect(result).toMatchObject({
			reduceColorMode: "pico8",
			bgExtractionMethod: "top-left",
			ditherMode: "bayer-4x4",
			ditherStrength: 75,
		});
	});

	it("maps the public background and dithering levels", () => {
		const picked = applyQuickSettingsToOptions(
			{ bgRgb: "#123456" },
			{
				...QUICK_SETTINGS_DEFAULTS,
				background: "pick",
				dithering: "strong",
			},
		);

		expect(picked).toMatchObject({
			bgExtractionMethod: "rgb",
			bgRgb: "#123456",
			preRemoveBackground: true,
			postRemoveBackground: true,
			bgRemovalScope: "outer",
			ditherMode: "floyd-steinberg",
			ditherStrength: 60,
		});
	});

	it("defines the six intended built-in presets", () => {
		expect(BUILT_IN_PRESETS.map((preset) => preset.id)).toEqual([
			"auto",
			"crisp-sprite",
			"keep-fine-details",
			"transparent-icon",
			"limited-colors",
			"photo-to-pixel",
		]);
		expect(BUILT_IN_PRESETS[3].settings).toMatchObject({
			colors: "32",
			background: "auto",
			outlineStyle: "rounded",
		});
		expect(BUILT_IN_PRESETS[5].settings).toMatchObject({
			processingMode: "convert",
			colors: "32",
			background: "keep",
			dithering: "subtle",
		});
	});
});
