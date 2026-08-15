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

	it("saves version 3 Advanced-only presets", () => {
		const preset = PresetManager.savePreset("Auto", {
			"advanced-processing-mode": "auto",
		});

		expect(preset.version).toBe(3);
		expect(PresetManager.loadPresets()).toEqual([preset]);
	});

	it("migrates legacy public settings into Advanced without discarding values", () => {
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
			version: 3,
			data: {
				"reduce-color-mode": "pico8",
				"bg-extraction-method": "top-left",
				"advanced-processing-mode": "auto",
				"advanced-detail-level": "balanced",
				"advanced-bg-removal-scope": "auto",
			},
		});
		expect(preset.data).not.toHaveProperty("trim-to-content");
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
			{ id: "legacy", version: 3 },
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
					version: 3,
					id: "valid",
					name: "Valid",
					timestamp: 20,
					data: { "advanced-processing-mode": "auto" },
				},
			]),
		);

		expect(PresetManager.loadPresets()).toHaveLength(1);
		expect(PresetManager.loadPresets()[0].id).toBe("valid");
	});

	it("drops the retired trim setting from current presets", () => {
		store.set(
			"pixel-refiner-presets",
			JSON.stringify([
				{
					version: 3,
					id: "current",
					name: "Current",
					timestamp: 30,
					data: { "trim-to-content": false },
				},
			]),
		);

		const [preset] = PresetManager.loadPresets();

		expect(preset.data).not.toHaveProperty("trim-to-content");
		expect(localStorage.setItem).toHaveBeenCalled();
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
