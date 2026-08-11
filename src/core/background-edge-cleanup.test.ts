import { describe, expect, it } from "vitest";
import type { PixelGrid, RawImage } from "../shared/types";
import type { BackgroundModel } from "./background";
import { cleanBackgroundContaminatedEdges } from "./background-edge-cleanup";

const createImage = (
	width: number,
	height: number,
	pixelAt: (x: number, y: number) => readonly [number, number, number, number],
): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = pixelAt(x, y);
			const offset = (y * width + x) * 4;
			data[offset] = pixel[0];
			data[offset + 1] = pixel[1];
			data[offset + 2] = pixel[2];
			data[offset + 3] = pixel[3];
		}
	}
	return { width, height, data };
};

const colorAt = (
	image: RawImage,
	x: number,
	y: number,
): [number, number, number, number] => {
	const offset = (y * image.width + x) * 4;
	return [
		image.data[offset],
		image.data[offset + 1],
		image.data[offset + 2],
		image.data[offset + 3],
	];
};

const GREEN = [21, 236, 14] as const;
const WHITE = [255, 255, 255] as const;

/** 単一クラスタの背景モデル。差し替えの判定は rgb だけを見る。 */
const singleClusterModel = (
	rgb: readonly [number, number, number],
): BackgroundModel => ({
	clusters: [
		{
			color: { L: 0.87, a: -0.23, b: 0.18 },
			rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
			weight: 1,
			borderCoverage: 1,
			variance: 0,
		},
	],
	confidence: 1,
	borderBandRatio: 0.08,
});

const greenModel = (): BackgroundModel => singleClusterModel(GREEN);

/** セル 4x4、出力 2x2 のグリッド。 */
const grid: PixelGrid = {
	cellW: 4,
	cellH: 4,
	offsetX: 0,
	offsetY: 0,
	cropX: 0,
	cropY: 0,
	cropW: 8,
	cropH: 8,
	outW: 2,
	outH: 2,
	score: 0,
};

/** 背景色 bg と color を、bg の比率 share で混ぜた色。 */
const mixWith = (
	bg: readonly [number, number, number],
	share: number,
	color: readonly [number, number, number],
): [number, number, number, number] => [
	Math.round(bg[0] * share + color[0] * (1 - share)),
	Math.round(bg[1] * share + color[1] * (1 - share)),
	Math.round(bg[2] * share + color[2] * (1 - share)),
	255,
];

/** 背景色と黒を比率 share で混ぜた色。 */
const mixWithGreen = (
	share: number,
	color: readonly [number, number, number],
): [number, number, number, number] => mixWith(GREEN, share, color);

describe("cleanBackgroundContaminatedEdges", () => {
	it("背景色が混ざった縁の色を、同じセルにある本来の色へ差し替える", () => {
		// 原寸: 上半分が黒、下半分が背景色、その境界に混色帯がある。
		const source = createImage(8, 8, (_x, y) => {
			if (y < 3) return [2, 4, 1, 255];
			if (y < 5) return mixWithGreen(0.4, [2, 4, 1]);
			return [GREEN[0], GREEN[1], GREEN[2], 255];
		});
		// 出力: 上のセルが混色を代表色に選んでしまった状態。下のセルは背景として透過済み。
		const image = createImage(2, 2, (_x, y) =>
			y === 0 ? mixWithGreen(0.4, [2, 4, 1]) : [0, 0, 0, 0],
		);

		const cleaned = cleanBackgroundContaminatedEdges(
			image,
			source,
			grid,
			greenModel(),
		);

		expect(cleaned).toBe(2);
		expect(colorAt(image, 0, 0)).toEqual([2, 4, 1, 255]);
		expect(colorAt(image, 1, 0)).toEqual([2, 4, 1, 255]);
		// アルファは動かさない。
		expect(colorAt(image, 0, 1)[3]).toBe(0);
	});

	it("すでに本来の色そのものなら差し替えない", () => {
		const source = createImage(8, 8, (_x, y) =>
			y < 4 ? [2, 4, 1, 255] : [GREEN[0], GREEN[1], GREEN[2], 255],
		);
		const image = createImage(2, 2, (_x, y) =>
			y === 0 ? [2, 4, 1, 255] : [0, 0, 0, 0],
		);

		expect(
			cleanBackgroundContaminatedEdges(image, source, grid, greenModel()),
		).toBe(0);
		expect(colorAt(image, 0, 0)).toEqual([2, 4, 1, 255]);
	});

	it("背景と無関係な向きの色は、より遠い色があっても差し替えない", () => {
		// セル内は暗い赤と明るい赤。混色線（背景→暗い赤）から明るい赤は大きく外れる。
		const source = createImage(8, 8, (_x, y) =>
			y < 4 ? [120, 20, 20, 255] : [40, 250, 250, 255],
		);
		const image = createImage(2, 2, (_x, y) =>
			y === 0 ? [120, 20, 20, 255] : [0, 0, 0, 0],
		);

		expect(
			cleanBackgroundContaminatedEdges(image, source, grid, greenModel()),
		).toBe(0);
		expect(colorAt(image, 0, 0)).toEqual([120, 20, 20, 255]);
	});

	it("同じセルに濃淡がある被写体で、汚染のない縁の色を暗い側へ寄せない", () => {
		// 明るい赤は白背景の混色では作れない色（混色なら緑と青がもっと高くなる）。
		// セル内に暗い赤があっても、混色として説明できないので差し替えてはいけない。
		const source = createImage(8, 8, (_x, y) =>
			y < 2 ? [200, 60, 60, 255] : [120, 20, 20, 255],
		);
		const image = createImage(2, 2, (_x, y) =>
			y === 0 ? [200, 60, 60, 255] : [0, 0, 0, 0],
		);

		expect(
			cleanBackgroundContaminatedEdges(
				image,
				source,
				grid,
				singleClusterModel(WHITE),
			),
		).toBe(0);
		expect(colorAt(image, 0, 0)).toEqual([200, 60, 60, 255]);
	});

	it("白背景が混ざった縁の色は、同じセルにある本来の色へ差し替える", () => {
		// 上の判定を厳しくしても、混色として説明できる色は差し替わる。
		const contaminated = mixWith(WHITE, 0.3, [120, 20, 20]);
		const source = createImage(8, 8, (_x, y) =>
			y < 2 ? contaminated : [120, 20, 20, 255],
		);
		const image = createImage(2, 2, (_x, y) =>
			y === 0 ? contaminated : [0, 0, 0, 0],
		);

		expect(
			cleanBackgroundContaminatedEdges(
				image,
				source,
				grid,
				singleClusterModel(WHITE),
			),
		).toBe(2);
		expect(colorAt(image, 0, 0)).toEqual([120, 20, 20, 255]);
	});

	it("透明画素が無い画像には何もしない", () => {
		const source = createImage(8, 8, () => mixWithGreen(0.4, [2, 4, 1]));
		const image = createImage(2, 2, () => mixWithGreen(0.4, [2, 4, 1]));

		expect(
			cleanBackgroundContaminatedEdges(image, source, grid, greenModel()),
		).toBe(0);
		expect(colorAt(image, 0, 0)).toEqual(mixWithGreen(0.4, [2, 4, 1]));
	});

	it("背景クラスタが無ければ何もしない", () => {
		const source = createImage(8, 8, () => [2, 4, 1, 255]);
		const image = createImage(2, 2, (_x, y) =>
			y === 0 ? mixWithGreen(0.4, [2, 4, 1]) : [0, 0, 0, 0],
		);

		expect(
			cleanBackgroundContaminatedEdges(image, source, grid, {
				clusters: [],
				confidence: 1,
				borderBandRatio: 0.08,
			}),
		).toBe(0);
	});

	it("原寸で透過済みの背景画素は参照しない", () => {
		// 背景側が透明でも、不透明な混色帯と黒から本来の色を選べる。
		const source = createImage(8, 8, (_x, y) => {
			if (y < 3) return [2, 4, 1, 255];
			if (y < 5) return mixWithGreen(0.4, [2, 4, 1]);
			return [GREEN[0], GREEN[1], GREEN[2], 0];
		});
		const image = createImage(2, 2, (_x, y) =>
			y === 0 ? mixWithGreen(0.4, [2, 4, 1]) : [0, 0, 0, 0],
		);

		expect(
			cleanBackgroundContaminatedEdges(image, source, grid, greenModel()),
		).toBe(2);
		expect(colorAt(image, 0, 0)).toEqual([2, 4, 1, 255]);
	});
});
