import { describe, expect, it } from "vitest";
import { PROCESS_DEFAULTS } from "../shared/config";
import {
	applyQuickSettingsToOptions,
	BUILT_IN_PRESETS,
	createUiInitialProcessOptions,
	QUICK_SETTINGS_DEFAULTS,
} from "./quick-settings";

describe("quick settings", () => {
	it("derives shared processing defaults from the central config", () => {
		expect(QUICK_SETTINGS_DEFAULTS).toMatchObject({
			processingMode: PROCESS_DEFAULTS.processingMode,
			detailLevel: PROCESS_DEFAULTS.detailLevel,
			outlineStyle: PROCESS_DEFAULTS.outlineStyle,
			trimToContent: PROCESS_DEFAULTS.trimToContent,
			bgRemovalScope: PROCESS_DEFAULTS.bgRemovalScope,
		});
	});

	it("builds UI initial options from processing defaults and Auto settings", () => {
		const options = createUiInitialProcessOptions();

		expect(options).toMatchObject({
			processingMode: PROCESS_DEFAULTS.processingMode,
			detailLevel: PROCESS_DEFAULTS.detailLevel,
			preRemoveBackground: true,
			postRemoveBackground: true,
			bgExtractionMethod: "auto",
			bgRemovalScope: "auto",
			trimToContent: PROCESS_DEFAULTS.trimToContent,
			ditherMode: "none",
			ditherStrength: 0,
		});
		expect(options.reduceColors).toBeUndefined();
		expect(options.reduceColorMode).toBeUndefined();
		expect(options.colorCount).toBeUndefined();
	});

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

	it("takes the background removal scope from the quick settings for a custom method", () => {
		const result = applyQuickSettingsToOptions(
			{ bgExtractionMethod: "top-left", bgRemovalScope: "all" },
			{
				...QUICK_SETTINGS_DEFAULTS,
				background: "custom",
				bgRemovalScope: "auto",
			},
		);

		expect(result).toMatchObject({
			bgExtractionMethod: "top-left",
			bgRemovalScope: "auto",
		});
	});

	it("narrows the selected-corner scope only where it has no effect", () => {
		const scoped = {
			...QUICK_SETTINGS_DEFAULTS,
			bgRemovalScope: "selected",
		} as const;
		const auto = applyQuickSettingsToOptions(
			{},
			{ ...scoped, background: "auto" },
		);
		const picked = applyQuickSettingsToOptions(
			{ bgRgb: "#123456" },
			{ ...scoped, background: "pick" },
		);
		const corner = applyQuickSettingsToOptions(
			{ bgExtractionMethod: "bottom-right" },
			{ ...scoped, background: "custom" },
		);

		// Auto には角の選択が無く "outer" と同じ結果になるため寄せる。
		expect(auto.bgRemovalScope).toBe("outer");
		// 色を指定する抽出は一致画素すべてをシードにするため、内側まで落ちる "selected" を保つ。
		expect(picked.bgRemovalScope).toBe("selected");
		expect(corner.bgRemovalScope).toBe("selected");
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
			bgRemovalScope: "auto",
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
