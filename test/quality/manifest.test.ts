import { afterEach, describe, expect, it, vi } from "vitest";
import {
	loadCases,
	qualityCaseDirectory,
	qualityProfileFromEnvironment,
	selectCasesForProfile,
	validateManifest,
} from "./manifest";
import type { QualityImageCase } from "./types";

const cases = loadCases();
const cloneCases = (): QualityImageCase[] => structuredClone(cases);

// [Intended] 登録済みケースの種類に依存せず、否定テスト内で Quick Settings ケースを作る。
const asQuickSettingsCase = (draft: QualityImageCase[]): QualityImageCase => {
	const quick = draft.find((item) => item.presetId !== undefined);
	if (!quick) throw new Error("Preset case not found");
	delete quick.presetId;
	return quick;
};

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("quality manifest", () => {
	it("accepts the checked-in manifest", () => {
		expect(validateManifest(cases)).toEqual([]);
	});

	it("excludes option-specific fixtures from auto cases", () => {
		const ids = new Set(cases.map((qualityCase) => qualityCase.id));
		for (const id of [
			"auto-dithering-floyd-steinberg",
			"auto-palette-conversion-gb",
			"auto-quality-continuous-tone",
			"auto-quality-convert-illustration",
			"auto-quality-deterministic-quantization",
			"auto-quality-prf200-gradient-background",
			"auto-quality-prf210-isolated-noise",
			"auto-quality-prf210-protected-details",
			"auto-quality-prf420-shared-palette-companion",
			"auto-quality-prf420-shared-palette-target",
			"auto-tall-red",
			"auto-wide-red",
			"auto-quality-crop-shift-1px",
			"auto-quality-crop-shift-2px",
			"auto-quality-crop-shift-3px",
			"auto-quality-nearest-1-5x",
			"auto-quality-nearest-2-5x",
			"auto-quality-nearest-3-2x",
			"auto-quality-prf110-anisotropic-noninteger",
			"auto-quality-alpha-blur",
			"auto-quality-ambiguous-axis-grid",
			"auto-quality-anisotropic",
			"auto-quality-bicubic-equivalent",
			"auto-quality-bilinear",
			"auto-quality-gaussian-blur",
			"auto-quality-nearest-16x",
			"auto-quality-nearest-2x",
			"auto-quality-nearest-32x",
			"auto-quality-nearest-3x",
			"auto-quality-nearest-4x",
			"auto-quality-nearest-8x",
			"auto-quality-padding-black",
			"auto-quality-padding-gradient",
			"auto-quality-padding-solid",
			"auto-quality-padding-white",
			"auto-quality-prf120-alpha-grid",
			"auto-quality-prf120-diagonal-grid",
			"auto-quality-prf120-harmonic-grid",
			"auto-quality-prf130-cell-sampling",
			"auto-quality-prf210-uncertain-background",
			"auto-quality-prf400-ui-low-confidence",
			"auto-quality-rgb-noise",
			"auto-quality-transparent-rgb-padding",
		]) {
			expect(ids.has(id), id).toBe(false);
		}
		// [Intended] 出力サイズも含め、Auto が目標へ到達する品質対象として残す。
		expect(ids.has("auto-resize-with-trimming")).toBe(true);
	});

	it.each([
		{
			name: "duplicate IDs",
			mutate: (draft: QualityImageCase[]) => {
				draft[1].id = draft[0].id;
			},
			error: "Duplicate case ID:",
		},
		{
			name: "unsafe IDs",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].id = "unsafe/id";
			},
			error: "case ID must contain lowercase letters",
		},
		{
			name: "provenance-oriented IDs",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].id = "generated-case";
			},
			error: "case ID must describe behavior",
		},
		{
			name: "empty feature IDs",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].featureIds = [];
			},
			error: "featureIds must not be empty",
		},
		{
			name: "empty assertions",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].assertions = [];
			},
			error: "assertions must not be empty",
		},
		{
			name: "metric allowances on exact cases",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].expectation.minEdgeF1 = 1;
			},
			error: "exact cases must not use metric allowances",
		},
		{
			name: "missing thresholds on lossy cases",
			mutate: (draft: QualityImageCase[]) => {
				const lossy = draft.find((item) => !item.expectation.exact);
				if (!lossy) throw new Error("Lossy case not found");
				delete lossy.expectation.minEdgeF1;
			},
			error: "non-exact case requires minEdgeF1",
		},
		{
			name: "unknown presets",
			mutate: (draft: QualityImageCase[]) => {
				const preset = draft.find((item) => item.presetId !== undefined);
				if (!preset) throw new Error("Preset case not found");
				preset.presetId = "no-such-preset";
			},
			error: "unknown preset no-such-preset",
		},
		{
			name: "case options on preset cases",
			mutate: (draft: QualityImageCase[]) => {
				const preset = draft.find((item) => item.presetId !== undefined);
				if (!preset) throw new Error("Preset case not found");
				preset.options.trimToContent = false;
			},
			error: "preset cases must not define case options",
		},
		{
			name: "quick settings on preset cases",
			mutate: (draft: QualityImageCase[]) => {
				const preset = draft.find((item) => item.presetId !== undefined);
				if (!preset) throw new Error("Preset case not found");
				preset.quickSettings = { reductionMode: "mono" };
			},
			error: "preset cases must not define quickSettings",
		},
		{
			name: "case options on quick settings cases",
			mutate: (draft: QualityImageCase[]) => {
				const quick = asQuickSettingsCase(draft);
				quick.quickSettings = { reductionMode: "mono" };
				quick.options.trimToContent = false;
			},
			error: "quick settings cases must not define case options",
		},
		{
			name: "unknown quick setting keys",
			mutate: (draft: QualityImageCase[]) => {
				const quick = asQuickSettingsCase(draft);
				quick.quickSettings = {
					colours: "mono",
				} as unknown as QualityImageCase["quickSettings"];
			},
			error: "unknown quick setting colours",
		},
		{
			name: "quick setting values outside the UI choices",
			mutate: (draft: QualityImageCase[]) => {
				const quick = asQuickSettingsCase(draft);
				quick.quickSettings = {
					reductionMode: "gameboy",
				} as unknown as QualityImageCase["quickSettings"];
			},
			error: "invalid reductionMode gameboy",
		},
		{
			name: "background pick without a color",
			mutate: (draft: QualityImageCase[]) => {
				const quick = asQuickSettingsCase(draft);
				quick.quickSettings = { background: "pick" };
			},
			error: "background pick requires backgroundColor",
		},
		{
			name: "malformed background colors",
			mutate: (draft: QualityImageCase[]) => {
				const quick = asQuickSettingsCase(draft);
				quick.quickSettings = {
					background: "pick",
					backgroundColor: "magenta",
				};
			},
			error: "backgroundColor must be a #rrggbb color",
		},
		{
			name: "missing asset provenance",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].assets = [];
			},
			error: "missing provenance",
		},
		{
			name: "unusable asset terms",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].assets[0].redistributionAllowed = false;
			},
			error: "unusable asset terms",
		},
	])("rejects $name", ({ mutate, error }) => {
		const draft = cloneCases();
		mutate(draft);
		expect(
			validateManifest(draft).some((message) => message.includes(error)),
		).toBe(true);
	});

	it("uses one validated profile selector for smoke and full runs", () => {
		expect(selectCasesForProfile(cases, "smoke")).toHaveLength(
			cases.filter((qualityCase) => qualityCase.profile === "smoke").length,
		);
		expect(selectCasesForProfile(cases, "full")).toHaveLength(cases.length);
		vi.stubEnv("QUALITY_PROFILE", "invalid");
		expect(() => qualityProfileFromEnvironment()).toThrow(
			"Unsupported quality profile",
		);
	});

	it("uses safe case IDs as report directory names", () => {
		expect(qualityCaseDirectory("restore-nearest-2x")).toBe(
			"cases/restore-nearest-2x",
		);
		expect(() => qualityCaseDirectory("../unsafe")).toThrow(
			"Unsafe quality case ID",
		);
	});
});
