import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { processImage } from "./processor";

const readPngAsRawImage = async (filePath: string): Promise<RawImage> => {
	const buf = await readFile(filePath);
	const png = PNG.sync.read(buf);
	return {
		width: png.width,
		height: png.height,
		data: new Uint8ClampedArray(png.data),
	};
};

const writeRawImageAsPng = async (
	outPath: string,
	img: RawImage,
): Promise<void> => {
	const png = new PNG({ width: img.width, height: img.height });
	png.data = Buffer.from(img.data);
	const buf = PNG.sync.write(png);
	await writeFile(outPath, buf);
};

describe("processImage", () => {
	describe("forcePixelsW/H", () => {
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
			});
			// 浮きノイズ(8,8)まで含むBBox: x=1..8, y=1..8 => 8x8
			expect(gridNoIgnore.cropW).toBe(8);
			expect(gridNoIgnore.cropH).toBe(8);

			const { grid: gridIgnore } = processImage(img, {
				...base,
				ignoreFloatingContent: true,
				floatingMaxPixels: 4,
			});
			// 浮きノイズ除去後のBBox: x=1..4, y=1..4 => 4x4
			expect(gridIgnore.cropW).toBe(4);
			expect(gridIgnore.cropH).toBe(4);
		});
	});

	it("指定ピクセル(forcePixelsW/H)で 22x22 に強制変換できる", async () => {
		const imgPath = fileURLToPath(
			new URL("../../test/fixtures/test1.png", import.meta.url),
		);
		const img = await readPngAsRawImage(imgPath);

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
		});

		expect(result.width).toBe(22);
		expect(result.height).toBe(22);
		expect(grid.outW).toBe(22);
		expect(grid.outH).toBe(22);
	});

	describe("test2", () => {
		let img: RawImage;

		beforeAll(async () => {
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/test2.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);
		});

		it("指定ピクセル(forcePixelsW/H)=46/13 で 46x13 に強制変換できる", () => {
			const { result, grid } = processImage(img, {
				forcePixelsW: 46,
				forcePixelsH: 13,
				detectionQuantStep: 64,
				preRemoveBackground: false,
				postRemoveBackground: false,
				removeInnerBackground: true,
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: false,
				trimAlphaThreshold: 16,
				ignoreFloatingContent: false,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: false,
			});

			expect(result.width).toBe(46);
			expect(result.height).toBe(13);
			expect(grid.outW).toBe(46);
			expect(grid.outH).toBe(13);
		});

		it("デバッグ用に中間画像を出力できる", async () => {
			if (!process.env.PIXELATE_DEBUG_IMAGES) {
				// 通常のテスト実行でファイル生成を避ける
				return;
			}

			// デバッグ実行のたびにクリーンな状態で比較できるよう、tmp/debug 配下を掃除する
			const debugRoot = path.resolve("tmp/debug");
			await rm(debugRoot, { recursive: true, force: true });

			const outDir = path.join(debugRoot, "test2");
			await mkdir(outDir, { recursive: true });

			const writes: Array<Promise<void>> = [];
			const { result } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 32,
				ignoreFloatingContent: false,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: (name, raw) => {
					// 毎回同じファイル名で上書きし、差分比較しやすくする（サイズ情報は含めない）
					const filename = `${name}.png`;
					writes.push(writeRawImageAsPng(path.join(outDir, filename), raw));
				},
			});
			await Promise.all(writes);

			// フックが動いていればOK（詳細は tmp/debug/test2 を目視確認）
			expect(result.width).toBeGreaterThan(0);
			expect(result.height).toBeGreaterThan(0);
		});

		it.each([
			[
				"背景透過なし（基準）",
				{
					detectionQuantStep: 64,
					preRemoveBackground: false,
					postRemoveBackground: false,
					removeInnerBackground: true,
					backgroundTolerance: 64,
					sampleWindow: 3,
					trimToContent: false,
					trimAlphaThreshold: 16,
					ignoreFloatingContent: false,
					floatingMaxPixels: 50000,
					autoGridFromTrimmed: false,
				} as const,
				{ wMin: 46, wMax: 46, hMin: 13, hMax: 13 } as const,
			],
			[
				"量子化ステップを小さくする",
				{
					detectionQuantStep: 32,
					preRemoveBackground: false,
					postRemoveBackground: false,
					removeInnerBackground: true,
					backgroundTolerance: 64,
					sampleWindow: 3,
					trimToContent: false,
					trimAlphaThreshold: 16,
					ignoreFloatingContent: false,
					floatingMaxPixels: 50000,
					autoGridFromTrimmed: false,
				} as const,
				{ wMin: 46, wMax: 46, hMin: 13, hMax: 13 } as const,
			],
			[
				"量子化ステップを大きくする",
				{
					detectionQuantStep: 128,
					preRemoveBackground: false,
					postRemoveBackground: false,
					removeInnerBackground: true,
					backgroundTolerance: 64,
					sampleWindow: 3,
					trimToContent: false,
					trimAlphaThreshold: 16,
					ignoreFloatingContent: false,
					floatingMaxPixels: 50000,
					autoGridFromTrimmed: false,
				} as const,
				{ wMin: 45, wMax: 46, hMin: 13, hMax: 13 } as const,
			],
			[
				"サンプル窓を 1 にする",
				{
					detectionQuantStep: 64,
					preRemoveBackground: false,
					postRemoveBackground: false,
					removeInnerBackground: true,
					backgroundTolerance: 64,
					sampleWindow: 1,
					trimToContent: false,
					trimAlphaThreshold: 16,
					ignoreFloatingContent: false,
					floatingMaxPixels: 50000,
					autoGridFromTrimmed: false,
				} as const,
				{ wMin: 46, wMax: 46, hMin: 13, hMax: 13 } as const,
			],
			[
				"サンプル窓を 5 にする",
				{
					detectionQuantStep: 64,
					preRemoveBackground: false,
					postRemoveBackground: false,
					removeInnerBackground: true,
					backgroundTolerance: 64,
					sampleWindow: 5,
					trimToContent: false,
					trimAlphaThreshold: 16,
					ignoreFloatingContent: false,
					floatingMaxPixels: 50000,
					autoGridFromTrimmed: false,
				} as const,
				{ wMin: 46, wMax: 46, hMin: 13, hMax: 13 } as const,
			],
			[
				"検出前に背景除去する (tol=8)",
				{
					detectionQuantStep: 64,
					preRemoveBackground: true,
					postRemoveBackground: false,
					removeInnerBackground: true,
					backgroundTolerance: 8,
					sampleWindow: 3,
					trimToContent: false,
					trimAlphaThreshold: 16,
					ignoreFloatingContent: false,
					floatingMaxPixels: 50000,
					autoGridFromTrimmed: false,
				} as const,
				{ wMin: 45, wMax: 46, hMin: 13, hMax: 13 } as const,
			],
			[
				"検出前に背景除去する (tol=32)",
				{
					detectionQuantStep: 64,
					preRemoveBackground: true,
					postRemoveBackground: false,
					removeInnerBackground: true,
					backgroundTolerance: 32,
					sampleWindow: 3,
					trimToContent: false,
					trimAlphaThreshold: 16,
					ignoreFloatingContent: false,
					floatingMaxPixels: 50000,
					autoGridFromTrimmed: false,
				} as const,
				{ wMin: 45, wMax: 46, hMin: 13, hMax: 13 } as const,
			],
			[
				"変換後に背景除去する",
				{
					detectionQuantStep: 64,
					preRemoveBackground: false,
					postRemoveBackground: true,
					removeInnerBackground: true,
					backgroundTolerance: 16,
					sampleWindow: 3,
					trimToContent: false,
					trimAlphaThreshold: 16,
					ignoreFloatingContent: false,
					floatingMaxPixels: 50000,
					autoGridFromTrimmed: false,
				} as const,
				{ wMin: 46, wMax: 46, hMin: 13, hMax: 13 } as const,
			],
		])("オプションを変えても 46x13 に強制変換される: %s", (_label, opts, exp) => {
			const { result, grid } = processImage(img, {
				forcePixelsW: 46,
				forcePixelsH: 13,
				...opts,
			});

			expect(result.width).toBeGreaterThanOrEqual(exp.wMin);
			expect(result.width).toBeLessThanOrEqual(exp.wMax);
			expect(result.height).toBeGreaterThanOrEqual(exp.hMin);
			expect(result.height).toBeLessThanOrEqual(exp.hMax);
			expect(grid.outW).toBe(result.width);
			expect(grid.outH).toBe(result.height);
		});

		it("trimToContent=true でも指定ピクセルが優先され、サイズは変わらない", () => {
			const { result, grid } = processImage(img, {
				forcePixelsW: 46,
				forcePixelsH: 13,
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 16,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				ignoreFloatingContent: false,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: false,
			});

			expect(result.width).toBe(46);
			expect(result.height).toBe(13);
			expect(grid.outW).toBe(result.width);
			expect(grid.outH).toBe(result.height);
		});
	});

	describe("test3", () => {
		let img: RawImage;

		beforeAll(async () => {
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/test3.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);
		});

		it("デフォルトオプションで 88x61 になる", async () => {
			const debugRoot = path.resolve("tmp/debug");
			const outDir = path.join(debugRoot, "test3");
			await mkdir(outDir, { recursive: true });

			const writes: Array<Promise<void>> = [];
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
				debugHook: (name, raw) => {
					const filename = `${name}.png`;
					writes.push(writeRawImageAsPng(path.join(outDir, filename), raw));
				},
			});
			await Promise.all(writes);

			console.log(`Detected size: ${result.width}x${result.height}`);
			console.log(`Grid:`, grid);

			expect(result.width).toBe(88);
			expect(result.height).toBe(61);
			expect(grid.outW).toBe(88);
			expect(grid.outH).toBe(61);
		}, 20000);
	});

	describe("test4", () => {
		let img: RawImage;

		beforeAll(async () => {
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/test4.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);
		});

		it("浮きノイズ除去を有効にすると、22x21 になる", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				ignoreFloatingContent: true,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
			});

			expect(result.width).toBe(22);
			expect(result.height).toBe(21);
			expect(grid.outW).toBe(22);
			expect(grid.outH).toBe(21);
		});

		it("内側に閉じ込められた背景色（ドーナツ穴）も透過できる", () => {
			const { result } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				removeInnerBackground: true,
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				ignoreFloatingContent: true,
				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
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

	describe("disableGridDetection", () => {
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
