import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawImage } from "../../src/shared/types";
import { generateQualityBaseline, writeQualityBaselineImage } from "./benchmark";
import type { QualityImageCase } from "./types";

// [Intended] 入力から決まる固定値で寸法を固定する。generateQualityBaseline の戻り値から
// 期待値を作ると、出力寸法が変わってもテストは通ってしまう。
const AUTO_OUTPUT_SIZE = { width: 8, height: 8 };
const EXPLICIT_OUTPUT_SIZE = { width: 22, height: 22 };

const autoCase: QualityImageCase = {
	id: "auto-baseline-update-test",
	featureIds: ["PRF-400"],
	profile: "smoke",
	parameterMode: "auto",
	inputKind: "unclassified",
	degradationPatterns: [],
	options: {},
	input: "test/fixtures/quality_reference.png",
	assertions: ["deterministic-output"],
	expectation: {},
	assets: [],
};

const explicitCase: QualityImageCase = {
	id: "explicit-baseline-update-test",
	featureIds: ["PRF-001"],
	profile: "smoke",
	inputKind: "scaled-pixel-art",
	degradationPatterns: [],
	options: {
		cellSamplingMode: "legacy-median",
		detectionQuantStep: 64,
		preRemoveBackground: true,
		postRemoveBackground: true,
		bgRemovalScope: "all",
		backgroundTolerance: 64,
		sampleWindow: 3,
		trimToContent: true,
		trimAlphaThreshold: 16,
		autoGridFromTrimmed: true,
		fastAutoGridFromTrimmed: false,
		floatingMaxPixels: 0,
	},
	input: "test/fixtures/resize_and_remove_bg.png",
	expected: "test/fixtures/resize_and_remove_bg-expect.png",
	assertions: ["exact image", "output size", "determinism"],
	expectation: { exact: true },
	assets: [],
};

const solidRedImage = (width: number, height: number): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = 255;
		data[i + 3] = 255;
	}
	return { width, height, data };
};

describe("quality baseline generation", () => {
	let directory = "";

	afterEach(() => {
		vi.unstubAllEnvs();
		if (directory !== "") {
			rmSync(directory, { recursive: true, force: true });
			directory = "";
		}
	});

	it("stores auto metrics against the newly generated image, ignoring the stored baseline", () => {
		// [Intended] 現在の出力とは異なる画像を「更新前のベースライン」役として置く。
		// 保存済み画像を基準に測る実装へ戻ると誤差が非ゼロになり、ここで落ちる。
		directory = mkdtempSync(path.join(tmpdir(), "pixel-refiner-old-baseline-"));
		writeQualityBaselineImage(
			path.join(directory, `${autoCase.id}.png`),
			solidRedImage(AUTO_OUTPUT_SIZE.width, AUTO_OUTPUT_SIZE.height),
		);
		vi.stubEnv("QUALITY_BASELINE_ROOT", directory);
		const generated = generateQualityBaseline(autoCase);
		expect(generated.entry).toMatchObject({
			id: autoCase.id,
			status: "passed",
			outputWidth: AUTO_OUTPUT_SIZE.width,
			outputHeight: AUTO_OUTPUT_SIZE.height,
			meanRgbaError: 0,
			edgeF1: 1,
			backgroundMaskIou: 1,
			smallComponentRetention: 1,
			catastrophicFailure: false,
		});
		expect(generated.image.width).toBe(AUTO_OUTPUT_SIZE.width);
		expect(generated.image.height).toBe(AUTO_OUTPUT_SIZE.height);
	});

	it("stores explicit metrics against the expectation image of the case", () => {
		const generated = generateQualityBaseline(explicitCase);
		expect(generated.entry).toMatchObject({
			id: explicitCase.id,
			status: "passed",
			outputWidth: EXPLICIT_OUTPUT_SIZE.width,
			outputHeight: EXPLICIT_OUTPUT_SIZE.height,
			meanRgbaError: 0,
			edgeF1: 1,
			catastrophicFailure: false,
		});
		expect(generated.image.width).toBe(EXPLICIT_OUTPUT_SIZE.width);
		expect(generated.image.height).toBe(EXPLICIT_OUTPUT_SIZE.height);
	});

	it("measures explicit cases against the expectation image instead of the output", () => {
		// [Intended] 出力と一致しない正解画像を指定する。explicit ケースも自己参照で測る
		// 実装になると誤差が 0 に落ちるため、非ゼロであることで参照先を確かめる。
		const generated = generateQualityBaseline({
			...explicitCase,
			id: "explicit-baseline-mismatch-test",
			expected: "test/fixtures/quality_reference.png",
			assertions: [],
			expectation: {},
		});
		expect(generated.entry.meanRgbaError).toBeGreaterThan(0);
		expect(generated.entry.edgeF1).toBeLessThan(1);
		// 書き出す画像は正解画像ではなく処理結果のまま。
		expect(generated.image.width).toBe(EXPLICIT_OUTPUT_SIZE.width);
		expect(generated.image.height).toBe(EXPLICIT_OUTPUT_SIZE.height);
	});
});
