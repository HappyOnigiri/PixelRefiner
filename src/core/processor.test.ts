import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { processImage } from "./processor";

const DEBUG_IMAGES = Boolean(process.env.PIXELATE_DEBUG_IMAGES);
const DEBUG_ROOT = path.resolve("tmp/debug/test");

const readPngAsRawImage = async (filePath: string): Promise<RawImage> => {
	const buf = await readFile(filePath);
	const png = PNG.sync.read(buf);
	return {
		width: png.width,
		height: png.height,
		data: new Uint8ClampedArray(png.data),
	};
};

const writeRawImageAsPngSync = (outPath: string, img: RawImage): void => {
	const png = new PNG({ width: img.width, height: img.height });
	png.data = Buffer.from(img.data);
	const buf = PNG.sync.write(png);
	writeFileSync(outPath, buf);
};

/**
 * PNGの「完全透過ピクセル(alpha=0)のRGB値」は見た目に影響しないが、
 * 生成ツールによってRGBが0埋めだったり元値が残ったりして差分になりうる。
 * テストではalpha=0のRGBを0に正規化してから比較する。
 */
const normalizeTransparentRgb = (img: RawImage): Uint8ClampedArray => {
	const out = new Uint8ClampedArray(img.data);
	for (let i = 0; i < out.length; i += 4) {
		const a = out[i + 3];
		if (a === 0) {
			out[i] = 0;
			out[i + 1] = 0;
			out[i + 2] = 0;
		}
	}
	return out;
};

const sanitizeForPath = (s: string): string => {
	const out = s
		.trim()
		.replace(/[\\/]/g, "_")
		.replace(/[:*?"<>|]/g, "_")
		.replace(/\s+/g, "_");
	return out.length > 0 ? out.slice(0, 120) : "unnamed";
};

const cleanDebugDir = (testcaseName: string): void => {
	if (!DEBUG_IMAGES) return;
	const dir = path.join(DEBUG_ROOT, sanitizeForPath(testcaseName));
	rmSync(dir, { recursive: true, force: true });
};

const makeDebugHook = (testcaseName: string, testName: string) => {
	if (!DEBUG_IMAGES) return undefined;

	const dir = path.join(
		DEBUG_ROOT,
		sanitizeForPath(testcaseName),
		sanitizeForPath(testName),
	);
	mkdirSync(dir, { recursive: true });

	return (name: string, raw: RawImage) => {
		const filename = `${sanitizeForPath(name)}.png`;
		writeRawImageAsPngSync(path.join(dir, filename), raw);
	};
};

describe("processImage", () => {
	describe("forcePixelsW/H", () => {
		beforeAll(() => {
			cleanDebugDir("forcePixelsW_H");
		});

		const mkImg = (): RawImage => {
			const w = 10;
			const h = 10;
			const data = new Uint8ClampedArray(w * h * 4);
			const set = (
				x: number,
				y: number,
				r: number,
				g: number,
				b: number,
				a: number,
			) => {
				const idx = (y * w + x) * 4;
				data[idx] = r;
				data[idx + 1] = g;
				data[idx + 2] = b;
				data[idx + 3] = a;
			};
			// background (white)
			for (let y = 0; y < h; y += 1) {
				for (let x = 0; x < w; x += 1) {
					set(x, y, 255, 255, 255, 255);
				}
			}
			// main object: 4x4 black block at (1..4, 1..4)
			for (let y = 1; y <= 4; y += 1) {
				for (let x = 1; x <= 4; x += 1) {
					set(x, y, 0, 0, 0, 255);
				}
			}
			// floating noise: 1px at (8, 8) (corner seedを汚さない位置)
			set(8, 8, 0, 0, 0, 255);
			return { width: w, height: h, data };
		};

		it("指定ピクセル時も ignoreFloatingContent=true ならBBoxが浮きノイズに引っ張られない", () => {
			const img = mkImg();

			const base = {
				forcePixelsW: 8,
				forcePixelsH: 8,
				detectionQuantStep: 64,
				preRemoveBackground: false,
				postRemoveBackground: false,
				removeInnerBackground: false,
				backgroundTolerance: 0,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				autoGridFromTrimmed: false,
			} as const;

			const { grid: gridNoIgnore } = processImage(img, {
				...base,
				ignoreFloatingContent: false,
				floatingMaxPixels: 4,
				debugHook: makeDebugHook(
					"forcePixelsW_H",
					"ignoreFloatingContent=false",
				),
			});
			// 浮きノイズ(8,8)まで含むBBox: x=1..8, y=1..8 => 8x8
			expect(gridNoIgnore.cropW).toBe(8);
			expect(gridNoIgnore.cropH).toBe(8);

			const { grid: gridIgnore } = processImage(img, {
				...base,
				ignoreFloatingContent: true,
				floatingMaxPixels: 4,
				debugHook: makeDebugHook(
					"forcePixelsW_H",
					"ignoreFloatingContent=true",
				),
			});
			// 浮きノイズ除去後のBBox: x=1..4, y=1..4 => 4x4
			expect(gridIgnore.cropW).toBe(4);
			expect(gridIgnore.cropH).toBe(4);
		});
	});

	describe("test1", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("test1");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/test1.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);
			const expPath = fileURLToPath(
				new URL("../../test/fixtures/test1-expect.png", import.meta.url),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("サイズを指定する（forcePixelsW/H=22/22）: 期待画像と完全一致する", () => {
			const expNorm = normalizeTransparentRgb(expected);
			const { result, grid } = processImage(img, {
				forcePixelsW: 22,
				forcePixelsH: 22,
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: false,
				trimAlphaThreshold: 16,
				ignoreFloatingContent: false,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: false,
				debugHook: makeDebugHook(
					"test1",
					"サイズ指定(forcePixelsW/H=22/22)_期待画像と完全一致",
				),
			});

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(22);
			expect(grid.outH).toBe(22);
			expect(Buffer.from(normalizeTransparentRgb(result))).toEqual(
				Buffer.from(expNorm),
			);
		});

		it("高速モードOFF、浮きノイズOFF: 期待画像と完全一致する", () => {
			const expNorm = normalizeTransparentRgb(expected);
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				autoGridFromTrimmed: true,
				fastAutoGridFromTrimmed: false, // 高速モードOFF
				ignoreFloatingContent: false, // 浮きノイズOFF
				floatingMaxPixels: 50000,
				debugHook: makeDebugHook(
					"test1",
					"高速モードOFF(fastAutoGridFromTrimmed=false)_浮きノイズOFF(ignoreFloatingContent=false)_期待画像と完全一致",
				),
			});

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(22);
			expect(grid.outH).toBe(22);
			expect(Buffer.from(normalizeTransparentRgb(result))).toEqual(
				Buffer.from(expNorm),
			);
		});
	});

	describe("test2", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("test2");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/test2.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL("../../test/fixtures/test2-expect.png", import.meta.url),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("指定ピクセル(forcePixelsW/H)=46/13 で 46x13 に強制変換され、期待画像と完全一致する", () => {
			const expNorm = normalizeTransparentRgb(expected);

			const baseOpts = {
				forcePixelsW: 46,
				forcePixelsH: 13,
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 64,
				ignoreFloatingContent: true,
				floatingMaxPixels: 0,
				autoGridFromTrimmed: true,
			} as const;

			const { result, grid } = processImage(img, {
				...baseOpts,
				forcePixelsW: 46,
				forcePixelsH: 13,
				debugHook: makeDebugHook(
					"test2",
					"指定ピクセル(forcePixelsW/H)=46/13_で_46x13_に強制変換され、期待画像と完全一致する",
				),
			});

			// 期待値PNGと完全一致（サイズ・ピクセル）
			expect(result.width).toBe(46);
			expect(result.height).toBe(13);
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(46);
			expect(grid.outH).toBe(13);

			expect(Buffer.from(normalizeTransparentRgb(result))).toEqual(
				Buffer.from(expNorm),
			);
			const { result: resultTrim, grid: gridTrim } = processImage(img, {
				...baseOpts,
				trimToContent: true,
				debugHook: makeDebugHook(
					"test2",
					"trimToContent=true_でもサイズは変わらない",
				),
			});
			expect(resultTrim.width).toBe(46);
			expect(resultTrim.height).toBe(13);
			expect(gridTrim.outW).toBe(46);
			expect(gridTrim.outH).toBe(13);
		});
	});

	describe("test3", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("test3");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/test3.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL("../../test/fixtures/test3-expect.png", import.meta.url),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("期待画像と完全一致する（サイズ・ピクセル）", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				ignoreFloatingContent: false,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"test3",
					"期待画像と完全一致する（サイズ・ピクセル）",
				),
			});

			// 期待値PNGと完全一致（サイズ・ピクセル）
			expect(result.width).toBe(88);
			expect(result.height).toBe(61);
			expect(expected.width).toBe(88);
			expect(expected.height).toBe(61);

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(88);
			expect(grid.outH).toBe(61);

			expect(Buffer.from(normalizeTransparentRgb(result))).toEqual(
				Buffer.from(normalizeTransparentRgb(expected)),
			);
		});
	});

	describe("test4", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("test4");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/test4.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL("../../test/fixtures/test4-expect.png", import.meta.url),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("期待画像と完全一致する（サイズ・ピクセル）", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 96,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				ignoreFloatingContent: true,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"test4",
					"期待画像と完全一致する（サイズ・ピクセル）",
				),
			});

			// 期待値PNGと完全一致（サイズ・ピクセル）
			expect(result.width).toBe(22);
			expect(result.height).toBe(21);
			expect(expected.width).toBe(22);
			expect(expected.height).toBe(21);

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(22);
			expect(grid.outH).toBe(21);

			expect(Buffer.from(normalizeTransparentRgb(result))).toEqual(
				Buffer.from(normalizeTransparentRgb(expected)),
			);
		});

		it("内側に閉じ込められた背景色（ドーナツ穴）も透過できる", () => {
			const { result } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 96,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				ignoreFloatingContent: true,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"test4",
					"内側に閉じ込められた背景色（ドーナツ穴）も透過できる",
				),
			});

			// 中心付近（内側背景）の alpha が 0 になることを確認する
			const cx = Math.floor(result.width / 2);
			const cy = Math.floor(result.height / 2);
			const alphas: number[] = [];
			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					const x = Math.min(result.width - 2, Math.max(1, cx + dx));
					const y = Math.min(result.height - 2, Math.max(1, cy + dy));
					const a = result.data[(y * result.width + x) * 4 + 3];
					alphas.push(a);
				}
			}
			expect(alphas.some((a) => a === 0)).toBe(true);
		});
	});

	describe("test5", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("test5");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/test5.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL("../../test/fixtures/test5-expect.png", import.meta.url),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("自動トリム(trimToContent)をOFFにしても、期待画像と一致する", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 32,
				sampleWindow: 3,
				trimToContent: false, // 自動トリムをOFF
				trimAlphaThreshold: 16,
				ignoreFloatingContent: true,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"test5",
					"自動トリム(trimToContent)_OFFでも期待画像と一致する",
				),
			});

			// 期待値PNGと完全一致（サイズ・ピクセル）
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);

			expect(Buffer.from(normalizeTransparentRgb(result))).toEqual(
				Buffer.from(normalizeTransparentRgb(expected)),
			);
		});
	});

	describe("disableGridDetection", () => {
		beforeAll(() => {
			cleanDebugDir("disableGridDetection");
		});

		const mkImg = (): RawImage => {
			const w = 10;
			const h = 10;
			const data = new Uint8ClampedArray(w * h * 4);
			const set = (
				x: number,
				y: number,
				r: number,
				g: number,
				b: number,
				a: number,
			) => {
				const idx = (y * w + x) * 4;
				data[idx] = r;
				data[idx + 1] = g;
				data[idx + 2] = b;
				data[idx + 3] = a;
			};
			// background (white)
			for (let y = 0; y < h; y += 1) {
				for (let x = 0; x < w; x += 1) {
					set(x, y, 255, 255, 255, 255);
				}
			}
			// object: 4x4 black block at (2, 2)
			for (let y = 2; y < 6; y += 1) {
				for (let x = 2; x < 6; x += 1) {
					set(x, y, 0, 0, 0, 255);
				}
			}
			return { width: w, height: h, data };
		};

		it("disableGridDetection=true のとき、縮小されず等倍で出力される", () => {
			const img = mkImg();
			const { result, grid } = processImage(img, {
				disableGridDetection: true,
				trimToContent: false,
				debugHook: makeDebugHook(
					"disableGridDetection",
					"disableGridDetection=true_縮小されず等倍で出力",
				),
			});

			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(grid.cellW).toBe(1);
			expect(grid.cellH).toBe(1);
		});

		it("disableGridDetection=true かつ trimToContent=true のとき、トリミングのみ行われる", () => {
			const img = mkImg();
			const { result, grid } = processImage(img, {
				disableGridDetection: true,
				trimToContent: true,
				preRemoveBackground: true,
				backgroundTolerance: 0,
				debugHook: makeDebugHook(
					"disableGridDetection",
					"disableGridDetection=true_かつ_trimToContent=true_トリミングのみ",
				),
			});

			// 4x4 black block at (2, 2)
			expect(result.width).toBe(4);
			expect(result.height).toBe(4);
			expect(grid.cropX).toBe(2);
			expect(grid.cropY).toBe(2);
			expect(grid.cellW).toBe(1);
			expect(grid.cellH).toBe(1);
		});
	});
});
