import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	DEFAULT_BACKGROUND_BEHAVIOR,
	estimateBackgroundModel,
	removeAutomaticBackground,
} from "./background";
import { getBackgroundTargets, removeBackground } from "./background-removal";
import { normalizeProcessOptions } from "./processor-options";

const createImage = (
	width: number,
	height: number,
	pixel: (x: number, y: number) => [number, number, number, number],
): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const [r, g, b, a] = pixel(x, y);
			const offset = (y * width + x) * 4;
			data[offset] = r;
			data[offset + 1] = g;
			data[offset + 2] = b;
			data[offset + 3] = a;
		}
	}
	return { width, height, data };
};

const alphaAt = (image: RawImage, x: number, y: number): number =>
	image.data[(y * image.width + x) * 4 + 3];

/** 直線グラデーションのパディングが 32x32 のアートを 8px 囲む構成。 */
const createGradientPaddedArt = (): RawImage =>
	createImage(48, 48, (x, y) => {
		if (x >= 8 && x <= 39 && y >= 8 && y <= 39) {
			const edge = x === 8 || x === 39 || y === 8 || y === 39;
			return edge ? [35, 28, 44, 255] : [218, 74, 72, 255];
		}
		return [
			Math.round((x / 47) * 90) + 120,
			Math.round((y / 47) * 80) + 130,
			180,
			255,
		];
	});

describe("auto behavior settings", () => {
	it("follows the processing route while the setting stays at auto", () => {
		expect(
			normalizeProcessOptions({ processingMode: "auto" })
				.smallAspectGridAlignment,
		).toBe(true);
		expect(
			normalizeProcessOptions({ processingMode: "refine" })
				.smallAspectGridAlignment,
		).toBe(false);
		expect(
			normalizeProcessOptions({ processingMode: "auto" })
				.watermarkSamplingCompat,
		).toBe(true);
		expect(
			normalizeProcessOptions({ processingMode: "preserve" })
				.watermarkSamplingCompat,
		).toBe(false);
	});

	it("lets an explicit choice win over the processing route", () => {
		// [Intended] これが「手動 refine で Auto と同じ出力を再現する」ための入口になる。
		expect(
			normalizeProcessOptions({
				processingMode: "refine",
				smallAspectGridAlignment: "on",
			}).smallAspectGridAlignment,
		).toBe(true);
		expect(
			normalizeProcessOptions({
				processingMode: "auto",
				smallAspectGridAlignment: "off",
			}).smallAspectGridAlignment,
		).toBe(false);
		expect(
			normalizeProcessOptions({
				processingMode: "refine",
				watermarkSamplingCompat: "on",
			}).watermarkSamplingCompat,
		).toBe(true);
		expect(
			normalizeProcessOptions({
				processingMode: "auto",
				watermarkSamplingCompat: "off",
			}).watermarkSamplingCompat,
		).toBe(false);
	});
});

describe("background behavior flags", () => {
	it("keeps every automatic judgement enabled by default", () => {
		const options = normalizeProcessOptions({});

		expect(options.backgroundDehalo).toBe(true);
		expect(options.backgroundEdgeCleanup).toBe(true);
		expect(options.backgroundRampFollow).toBe(true);
		expect(options.backgroundRemovalRollback).toBe(true);
		expect(options.alphaBorderBackgroundGuard).toBe(true);
		expect(options.backgroundConfidenceGate).toBe(true);
		expect(options.smallComponentBackgroundGate).toBe(true);
		expect(options.phaseAwareGridSearch).toBe(true);
		expect(options.boundaryContrastOverride).toBe(true);
	});

	it("stops following a gradient background when the ramp is disabled", () => {
		const image = createGradientPaddedArt();
		const targets = getBackgroundTargets(image, "top-left");
		const withRamp = removeBackground(
			image,
			48,
			"all",
			"4",
			targets,
			"top-left",
		);
		const withoutRamp = removeBackground(
			image,
			48,
			"all",
			"4",
			targets,
			"top-left",
			undefined,
			{ ...DEFAULT_BACKGROUND_BEHAVIOR, rampFollow: false },
		);

		// ランプ許容があると反対側の角まで落ちる。切ると開始色から離れた角が残る。
		expect(alphaAt(withRamp, 47, 47)).toBe(0);
		expect(alphaAt(withoutRamp, 0, 0)).toBe(0);
		expect(alphaAt(withoutRamp, 47, 47)).toBe(255);
	});

	it("leaves the halo untouched when dehalo is disabled", () => {
		// 背景色と被写体色の中間にあるアンチエイリアス縁を 1 周ぶん持たせる。
		const image = createImage(24, 24, (x, y) => {
			const inner = x >= 9 && x <= 14 && y >= 9 && y <= 14;
			const edge = x >= 8 && x <= 15 && y >= 8 && y <= 15;
			if (inner) return [40, 60, 200, 255];
			if (edge) return [150, 160, 220, 255];
			return [235, 238, 240, 255];
		});
		const withDehalo = removeAutomaticBackground(image, 40, "outer", "4");
		const withoutDehalo = removeAutomaticBackground(
			image,
			40,
			"outer",
			"4",
			undefined,
			{ ...DEFAULT_BACKGROUND_BEHAVIOR, dehalo: false },
		);

		expect(withDehalo.rolledBack).toBe(false);
		expect(withoutDehalo.rolledBack).toBe(false);
		// 補正を切った側は原寸の縁の色がそのまま残る。
		const edgeOffset = (8 * 24 + 11) * 4;
		expect(withoutDehalo.image.data[edgeOffset]).toBe(image.data[edgeOffset]);
		expect(withDehalo.image.data).not.toEqual(withoutDehalo.image.data);
	});

	it("skips the over-removal rollback when it is disabled", () => {
		// 全面がなめらかなグラデーションで、被写体との強い境界が無い画像。
		const image = createImage(48, 48, (x, y) => [
			Math.round(((x + y) / 94) * 200) + 30,
			120,
			180,
			255,
		]);
		const targets = getBackgroundTargets(image, "top-left");
		const withRollback = removeBackground(
			image,
			48,
			"all",
			"4",
			targets,
			"top-left",
		);
		const withoutRollback = removeBackground(
			image,
			48,
			"all",
			"4",
			targets,
			"top-left",
			undefined,
			{ ...DEFAULT_BACKGROUND_BEHAVIOR, rollback: false },
		);

		expect(alphaAt(withRollback, 24, 24)).toBe(255);
		expect(alphaAt(withoutRollback, 24, 24)).toBe(0);
	});

	it("removes a low-confidence background once the confidence gate is off", () => {
		// 境界帯の色がばらつき、信頼度が下限に届かない画像。
		const image = createImage(32, 32, (x, y) => {
			if (x >= 12 && x <= 19 && y >= 12 && y <= 19) return [20, 20, 20, 255];
			return [(x * 37) % 256, (y * 53) % 256, (x * y * 11) % 256, 255];
		});
		const model = estimateBackgroundModel(image);
		const gated = removeAutomaticBackground(image, 32, "outer", "4");
		const ungated = removeAutomaticBackground(
			image,
			32,
			"outer",
			"4",
			undefined,
			{ ...DEFAULT_BACKGROUND_BEHAVIOR, confidenceGate: false },
		);

		expect(model.confidence).toBeLessThan(0.55);
		expect(gated.image.data).toEqual(image.data);
		expect(ungated.image.data).not.toEqual(image.data);
	});

	it("estimates colour clusters on a transparent border once the guard is off", () => {
		// 境界帯の大半が透明で、不透明な外周は被写体の輪郭だけという画像。
		const image = createImage(32, 32, (x, y) => {
			const ring = x === 0 || y === 0 || x === 31 || y === 31;
			if (ring && x >= 12 && x <= 19) return [200, 40, 40, 255];
			if (ring) return [0, 0, 0, 0];
			if (x >= 8 && x <= 23 && y >= 8 && y <= 23) return [200, 40, 40, 255];
			return [0, 0, 0, 0];
		});

		expect(estimateBackgroundModel(image).clusters).toHaveLength(0);
		expect(
			estimateBackgroundModel(image, {
				...DEFAULT_BACKGROUND_BEHAVIOR,
				alphaBorderGuard: false,
			}).clusters.length,
		).toBeGreaterThan(0);
	});
});
