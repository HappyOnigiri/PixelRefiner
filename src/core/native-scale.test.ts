import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { detectNativePixelScale } from "./native-scale";

type Rgba = [number, number, number, number];

const createImage = (
	width: number,
	height: number,
	color: (x: number, y: number) => Rgba,
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

// 論理ドットごとに違う色を割り当てた市松状のドット絵。
const logicalColor = (x: number, y: number): Rgba => [
	(x * 61 + y * 17) % 256,
	(x * 29 + y * 113) % 256,
	(x * 149 + y * 47) % 256,
	255,
];

const createUpscaled = (
	logicalWidth: number,
	logicalHeight: number,
	scaleX: number,
	scaleY: number,
): RawImage =>
	createImage(logicalWidth * scaleX, logicalHeight * scaleY, (x, y) =>
		logicalColor(Math.floor(x / scaleX), Math.floor(y / scaleY)),
	);

describe("detectNativePixelScale", () => {
	it("等倍のドット絵では拡大率 1 を返す", () => {
		const image = createUpscaled(16, 16, 1, 1);
		const scale = detectNativePixelScale(image);
		expect(scale.measured).toBe(true);
		expect(scale.scaleX).toBe(1);
		expect(scale.scaleY).toBe(1);
	});

	it("整数倍に拡大されたドット絵では拡大率を復元する", () => {
		const scale = detectNativePixelScale(createUpscaled(8, 8, 4, 4));
		expect(scale.scaleX).toBe(4);
		expect(scale.scaleY).toBe(4);
	});

	it("軸ごとに異なる拡大率を区別する", () => {
		const scale = detectNativePixelScale(createUpscaled(8, 6, 2, 3));
		expect(scale.scaleX).toBe(2);
		expect(scale.scaleY).toBe(3);
	});

	it("1 画素だけの模様が格子を壊す場合は等倍と判定する", () => {
		const image = createUpscaled(4, 4, 4, 4);
		// 格子から外れた位置に 1 画素の点を置く（等倍でしか説明できない配置）。
		const index = (5 * image.width + 7) * 4;
		image.data[index] = 255;
		image.data[index + 1] = 0;
		image.data[index + 2] = 0;
		const scale = detectNativePixelScale(image);
		expect(scale.scaleX).toBe(1);
		expect(scale.scaleY).toBe(1);
	});

	it("辺の長さで割り切れない周期は採用しない", () => {
		// 幅 16 の中に周期 6 の矩形だけがある。6 は 16 を割り切らないため等倍とみなす。
		const image = createImage(16, 16, (x, y) =>
			x >= 5 && x < 11 && y >= 5 && y < 11 ? [40, 80, 120, 255] : [0, 0, 0, 0],
		);
		const scale = detectNativePixelScale(image);
		expect(scale.scaleX).toBe(1);
		expect(scale.scaleY).toBe(1);
	});

	it("透明な余白は遷移として数えない", () => {
		const image = createImage(16, 16, (x, y) =>
			x >= 4 && x < 12 && y >= 4 && y < 12 ? [10, 200, 30, 255] : [0, 0, 0, 0],
		);
		const scale = detectNativePixelScale(image);
		expect(scale.transitionsX).toBe(2);
		expect(scale.transitionsY).toBe(2);
		expect(scale.scaleX).toBe(4);
		expect(scale.scaleY).toBe(4);
	});

	it("単色画像では遷移が無く、軸全体を 1 ブロックとして扱う", () => {
		const scale = detectNativePixelScale(
			createImage(12, 8, () => [7, 7, 7, 255]),
		);
		expect(scale.transitionsX).toBe(0);
		expect(scale.scaleX).toBe(12);
		expect(scale.scaleY).toBe(8);
	});

	it("空の画像は判定しない", () => {
		const scale = detectNativePixelScale({
			width: 0,
			height: 0,
			data: new Uint8ClampedArray(0),
		});
		expect(scale.measured).toBe(false);
	});
});
