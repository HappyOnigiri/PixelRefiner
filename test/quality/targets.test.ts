import { describe, expect, it } from "vitest";
import { loadCases } from "./manifest";
import {
	caseTargetExpectation,
	syncAutoTargets,
	validateAutoTargets,
} from "./targets";

// [Policy] 目標画像の作成は "pnpm run quality:targets:init" だけが行う。通常のテスト実行では
// 検証だけを走らせ、目標が現状の出力に合わせて静かに書き換わることがないようにする。
const initMode = process.env.INIT_QUALITY_TARGETS === "1";

describe("quality auto targets", () => {
	it.runIf(initMode)("creates the missing target images", () => {
		const { created, kept } = syncAutoTargets();
		console.info(
			`quality targets: created ${String(created.length)}, kept ${String(kept.length)}`,
		);
		expect(validateAutoTargets(loadCases())).toEqual([]);
	});

	it.skipIf(initMode)(
		"registers a target image or an exclusion reason for every auto case",
		() => {
			expect(validateAutoTargets(loadCases())).toEqual([]);
		},
	);

	// [Intended] fixture を足すと auto ケースは自動で増える。目標の登録を忘れたときに
	// 黙って目標なしのケースが混ざらないことを、検証側から確かめる。
	it.skipIf(initMode)(
		"rejects an auto case with no target registration",
		() => {
			const cases = loadCases();
			const autoCase = cases.find(
				(qualityCase) => qualityCase.parameterMode === "auto",
			);
			if (autoCase === undefined) throw new Error("No auto case to copy");
			const errors = validateAutoTargets([
				...cases,
				{ ...autoCase, id: "auto-unregistered-example" },
			]);
			expect(errors).toContain(
				"auto-unregistered-example: missing target registration",
			);
		},
	);

	it.skipIf(initMode)("rejects a target whose source case is gone", () => {
		const errors = validateAutoTargets(
			loadCases().filter(
				(qualityCase) => qualityCase.id !== "restore-nearest-4x-to-8x8",
			),
		);
		expect(errors).toContain(
			"auto-quality-nearest-4x: unknown target source case restore-nearest-4x-to-8x8",
		);
	});

	it.skipIf(initMode)(
		"inherits the target source allowances for auto cases",
		() => {
			const autoCase = loadCases().find(
				(qualityCase) => qualityCase.id === "auto-quality-nearest-3-2x",
			);
			if (autoCase === undefined) throw new Error("Auto target case not found");
			expect(caseTargetExpectation(autoCase)).toMatchObject({
				maxMeanRgbaError: 25,
				minEdgeF1: 0.8,
				minBackgroundMaskIou: 0.8,
				expectedWidth: 8,
				expectedHeight: 8,
			});
		},
	);
});
