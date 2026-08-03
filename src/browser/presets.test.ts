import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresetManager } from "./presets";

const store = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: {
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => store.set(key, value)),
	},
});

describe("PresetManager", () => {
	beforeEach(() => {
		store.clear();
		vi.clearAllMocks();
	});

	it("saves version 2 presets", () => {
		const preset = PresetManager.savePreset("Auto", {
			"quick-processing-mode": "auto",
		});

		expect(preset.version).toBe(2);
		expect(PresetManager.loadPresets()).toEqual([preset]);
	});

	it("migrates legacy data as custom without discarding advanced values", () => {
		store.set(
			"pixel-refiner-presets",
			JSON.stringify([
				{
					id: "legacy",
					name: "Legacy",
					timestamp: 10,
					data: {
						"reduce-color-mode": "pico8",
						"bg-extraction-method": "top-left",
						"outline-style": "rounded",
						"trim-to-content": false,
						unknown: { nested: true },
					},
				},
			]),
		);

		const [preset] = PresetManager.loadPresets();
		expect(preset).toMatchObject({
			version: 2,
			data: {
				"reduce-color-mode": "pico8",
				"bg-extraction-method": "top-left",
				"quick-processing-mode": "auto",
				"quick-detail-level": "balanced",
				"quick-colors": "custom",
				"quick-background": "custom",
				"quick-dithering": "custom",
				"quick-outline-style": "rounded",
				"quick-auto-trim": false,
			},
		});
		expect(preset.data.unknown).toBeUndefined();
	});

	it("returns migrated presets when persisting the migration fails", () => {
		store.set(
			"pixel-refiner-presets",
			JSON.stringify([
				{
					id: "legacy",
					name: "Legacy",
					timestamp: 10,
					data: { "reduce-color-mode": "none" },
				},
			]),
		);
		vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
			throw new DOMException("quota exceeded", "QuotaExceededError");
		});
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		expect(PresetManager.loadPresets()).toMatchObject([
			{ id: "legacy", version: 2 },
		]);
		expect(error).toHaveBeenCalledWith(
			"Failed to persist migrated presets:",
			expect.any(DOMException),
		);
		error.mockRestore();
	});

	it("keeps valid presets when another entry is invalid", () => {
		store.set(
			"pixel-refiner-presets",
			JSON.stringify([
				null,
				{
					version: 2,
					id: "valid",
					name: "Valid",
					timestamp: 20,
					data: { "quick-colors": "32" },
				},
			]),
		);

		expect(PresetManager.loadPresets()).toHaveLength(1);
		expect(PresetManager.loadPresets()[0].id).toBe("valid");
	});

	it("returns an empty list for malformed storage", () => {
		store.set("pixel-refiner-presets", "not-json");
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		expect(PresetManager.loadPresets()).toEqual([]);
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
	});
});
