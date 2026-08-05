import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { evaluateAutoGridDegeneracy } from "./auto-grid-guard";

const createImage = (
	width: number,
	height: number,
	color: (x: number, y: number) => [number, number, number, number],
): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const [r, g, b, a] = color(x, y);
			const index = (y * width + x) * 4;
			data[index] = r;
			data[index + 1] = g;
			data[index + 2] = b;
			data[index + 3] = a;
		}
	}
	return { width, height, data };
};

const nativeArt = (width: number, height: number): RawImage =>
	createImage(width, height, (x, y) => [
		(x * 61 + y * 17) % 256,
		(x * 29 + y * 113) % 256,
		(x * 149 + y * 47) % 256,
		255,
	]);

const upscaledArt = (
	logicalWidth: number,
	logicalHeight: number,
	scale: number,
): RawImage =>
	createImage(logicalWidth * scale, logicalHeight * scale, (x, y) => {
		const lx = Math.floor(x / scale);
		const ly = Math.floor(y / scale);
		return [
			(lx * 61 + ly * 17) % 256,
			(lx * 29 + ly * 113) % 256,
			(lx * 149 + ly * 47) % 256,
			255,
		];
	});

describe("evaluateAutoGridDegeneracy", () => {
	it("等倍のドット絵を極端に縮小する選択は縮退とみなす", () => {
		const result = evaluateAutoGridDegeneracy(nativeArt(16, 16), 2, 2, {
			cellW: 8,
			cellH: 8,
		});
		expect(result.degenerate).toBe(true);
	});

	it("整数倍拡大を元へ戻す縮小は小さくても縮退としない", () => {
		const result = evaluateAutoGridDegeneracy(upscaledArt(2, 2, 8), 2, 2, {
			cellW: 8,
			cellH: 8,
		});
		expect(result.degenerate).toBe(false);
	});

	it("十分な大きさの出力は縮退としない", () => {
		const result = evaluateAutoGridDegeneracy(nativeArt(32, 32), 8, 8, {
			cellW: 4,
			cellH: 4,
		});
		expect(result.degenerate).toBe(false);
	});

	it("セルの縦横比が極端なら出力が大きくても縮退とみなす", () => {
		const result = evaluateAutoGridDegeneracy(nativeArt(24, 24), 2, 24, {
			cellW: 22,
			cellH: 1,
		});
		expect(result.degenerate).toBe(true);
	});

	it("ガード対象外の大きな入力では判定しない", () => {
		const result = evaluateAutoGridDegeneracy(nativeArt(64, 64), 2, 2, {
			cellW: 32,
			cellH: 32,
		});
		expect(result.degenerate).toBe(false);
		expect(result.nativeScale).toBeUndefined();
	});

	it("縮小していない出力は縮退としない", () => {
		const result = evaluateAutoGridDegeneracy(nativeArt(3, 3), 3, 3, {
			cellW: 1,
			cellH: 1,
		});
		expect(result.degenerate).toBe(false);
	});
});
