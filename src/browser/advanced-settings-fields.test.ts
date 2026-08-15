import { describe, expect, it } from "vitest";
import { PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import { migrateAdvancedSettings } from "./advanced-settings-fields";

describe("migrateAdvancedSettings", () => {
	it("fills newly exposed settings with the previous behaviour", () => {
		const state: Record<string, string | number | boolean> = {};

		migrateAdvancedSettings(state);

		// [Policy] Auto 専用の処理条件を残さず、手動経路でも同じ補助処理を使う。
		expect(state["cell-sampling-mode"]).toBe(PROCESS_DEFAULTS.cellSamplingMode);
		expect(state["small-aspect-grid-alignment"]).toBe("on");
		expect(state["watermark-sampling-compat"]).toBe("on");
		expect(state["background-dehalo"]).toBe(true);
		expect(state["background-edge-cleanup"]).toBe(true);
		expect(state["background-confidence-gate"]).toBe(true);
		expect(state["phase-aware-grid-search"]).toBe(true);
		expect(state["boundary-contrast-override"]).toBe(true);
		expect(state["grid-signal-color-boundary"]).toBe(true);
		expect(state["trim-alpha-threshold"]).toBe(
			PROCESS_RANGES.trimAlphaThreshold.default,
		);
		expect(state["auto-max-cells-w"]).toBe(PROCESS_RANGES.autoMaxCells.default);
	});

	it("carries the old semi-transparent-edge toggle into the sampling mode", () => {
		const enabled: Record<string, string | number | boolean> = {
			"alpha-aware-medoid": true,
		};
		const disabled: Record<string, string | number | boolean> = {
			"alpha-aware-medoid": false,
		};

		migrateAdvancedSettings(enabled);
		migrateAdvancedSettings(disabled);

		expect(enabled["cell-sampling-mode"]).toBe("alpha-aware-medoid");
		expect(disabled["cell-sampling-mode"]).toBe(
			PROCESS_DEFAULTS.cellSamplingMode,
		);
	});

	it("keeps a value that the preset already carries", () => {
		const state: Record<string, string | number | boolean> = {
			"cell-sampling-mode": "legacy-median",
			"background-dehalo": false,
			"small-aspect-grid-alignment": "on",
		};

		migrateAdvancedSettings(state);

		expect(state["cell-sampling-mode"]).toBe("legacy-median");
		expect(state["background-dehalo"]).toBe(false);
		expect(state["small-aspect-grid-alignment"]).toBe("on");
	});

	it("migrates route-dependent auto behavior to always on", () => {
		const state: Record<string, string | number | boolean> = {
			"small-aspect-grid-alignment": "auto",
			"watermark-sampling-compat": "auto",
		};

		migrateAdvancedSettings(state);

		expect(state["small-aspect-grid-alignment"]).toBe("on");
		expect(state["watermark-sampling-compat"]).toBe("on");
	});
});
