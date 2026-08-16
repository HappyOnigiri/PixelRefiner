import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { processImage } from "../core/processor";
import { readPngAsRawImage } from "../core/processor-test-helpers";
import {
	createBuiltInPresetOptions,
	createQuickProcessOptions,
	QUICK_SETTINGS_DEFAULTS,
} from "./quick-settings";

describe("built-in preset routes", () => {
	it.each([
		["quality_nearest_2x.png", "crisp-sprite", "refine"],
		["quality_reference.png", "keep-fine-details", "preserve"],
		["quality_continuous_tone.png", "photo-to-pixel", "convert"],
	] as const)(
		"reproduces the Auto-selected %s route with %s",
		async (fileName, presetId, route) => {
			const image = await readPngAsRawImage(
				fileURLToPath(
					new URL(`../../test/fixtures/${fileName}`, import.meta.url),
				),
			);
			const automatic = processImage(image, createBuiltInPresetOptions("auto"));
			const fixedRoute = processImage(
				image,
				createBuiltInPresetOptions(presetId),
			);
			const explicitChoices = processImage(
				image,
				createQuickProcessOptions({
					...QUICK_SETTINGS_DEFAULTS,
					processingMode: route,
					reductionMode: route === "convert" ? "24" : "none",
				}),
			);

			expect(automatic.analysis.route).toBe(route);
			expect(fixedRoute.analysis.route).toBe(route);
			expect(fixedRoute.result).toEqual(automatic.result);
			expect(fixedRoute.extractedPalette).toEqual(automatic.extractedPalette);
			expect(explicitChoices.result).toEqual(automatic.result);
			expect(explicitChoices.extractedPalette).toEqual(
				automatic.extractedPalette,
			);
		},
	);
});
