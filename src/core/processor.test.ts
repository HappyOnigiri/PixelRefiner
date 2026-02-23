import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	FastGridSearchFromTrimmed,
	LegacyGridSearchFromTrimmed,
	processImage,
} from "./processor";

const DEBUG_IMAGES = Boolean(process.env.PIXELATE_DEBUG_IMAGES);
const UPDATE_EXPECT = Boolean(process.env.UPDATE_EXPECT);
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

/**
 * 画像の完全一致を確認する（不一致時も重いdiffを出さず、原因が追える短いメッセージにする）。
 *
 * Vitest の `toEqual(Buffer)` は不一致時に巨大な差分生成で極端に遅くなることがあるため、
 * ここでは `Buffer.equals()` による真偽判定＋先頭差分の座標だけを報告する。
 */
const expectSameImage = (
	actual: RawImage,
	expected: RawImage,
	expectPath?: string,
): void => {
	if (UPDATE_EXPECT && expectPath) {
		writeRawImageAsPngSync(expectPath, actual);
		return;
	}
	expect(actual.width).toBe(expected.width);
	expect(actual.height).toBe(expected.height);

	const a = Buffer.from(normalizeTransparentRgb(actual));
	const b = Buffer.from(normalizeTransparentRgb(expected));

	if (a.equals(b)) return;

	let first = -1;
	for (let i = 0; i < a.length && i < b.length; i += 1) {
		if (a[i] !== b[i]) {
			first = i;
			break;
		}
	}
	if (first < 0) {
		throw new Error(
			`画像が一致しません（length違い） actual=${a.length} expected=${b.length}`,
		);
	}

	const pixel = (first / 4) | 0;
	const ch = first % 4;
	const x = pixel % actual.width;
	const y = (pixel / actual.width) | 0;
	throw new Error(
		`画像が一致しません: firstDiff=idx${first} (x=${x}, y=${y}, ch=${ch}) actual=${a[first]} expected=${b[first]}`,
	);
};

const getExpectPath = (fixtureBase: string): string =>
	fileURLToPath(
		new URL(`../../test/fixtures/${fixtureBase}-expect.png`, import.meta.url),
	);

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
	// `make test-debug` は先に `rm -rf tmp/debug` するので、ルート自体を作り直す
	mkdirSync(DEBUG_ROOT, { recursive: true });
	const dir = path.join(DEBUG_ROOT, sanitizeForPath(testcaseName));
	rmSync(dir, { recursive: true, force: true });

	// 旧形式（currentTestName を丸ごとディレクトリ名にしていた頃）の掃除。
	// 例: processImage___test6__... のような長いディレクトリが残り続けるのを防ぐ。
	const legacyPrefix = `processImage___${sanitizeForPath(testcaseName)}__`;
	try {
		for (const e of readdirSync(DEBUG_ROOT, { withFileTypes: true })) {
			if (!e.isDirectory()) continue;
			if (!e.name.startsWith(legacyPrefix)) continue;
			rmSync(path.join(DEBUG_ROOT, e.name), { recursive: true, force: true });
		}
	} catch {
		// 念のため: DEBUG_ROOT が消えていても掃除はスキップする
	}
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

declare global {
	var __PIXEL_REFINER_DEBUG_HOOK__:
		| ((name: string, img: RawImage, meta?: Record<string, unknown>) => void)
		| undefined;
}

const fnv1a32Base36 = (s: string): string => {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
};

const currentTestDebugDir = (): string => {
	const current = expect.getState().currentTestName ?? "unknown-test";
	const parts = current
		.split(">")
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	const groupCandidate =
		parts.find((p) => /^test\d+\b/.test(p)) ??
		parts[1] ??
		parts[0] ??
		"unknown";
	const m = /^test(\d+)\b/.exec(groupCandidate);
	const group = sanitizeForPath(m ? `test${m[1]}` : groupCandidate);

	const caseCandidate = parts[parts.length - 1] ?? current;
	const label = sanitizeForPath(caseCandidate).slice(0, 32);
	const hash = fnv1a32Base36(current).slice(0, 6);
	const caseDir = label.length > 0 ? `${label}__${hash}` : hash;

	return path.join(DEBUG_ROOT, group, caseDir);
};

// `processImage({ debug: true })` 時に、テスト側で `debugHook` を渡さなくても
// 中間画像/最終結果(99-result)が出力されるようにする。
if (DEBUG_IMAGES) {
	globalThis.__PIXEL_REFINER_DEBUG_HOOK__ = (name, raw) => {
		const dir = currentTestDebugDir();
		mkdirSync(dir, { recursive: true });
		const filename = `${sanitizeForPath(name)}.png`;
		writeRawImageAsPngSync(path.join(dir, filename), raw);
	};
} else {
	globalThis.__PIXEL_REFINER_DEBUG_HOOK__ = undefined;
}

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

		it("指定ピクセル時も floatingMaxPixels>0 ならBBoxが浮きノイズに引っ張られない", () => {
			const img = mkImg();

			const base = {
				forcePixelsW: 8,
				forcePixelsH: 8,
				detectionQuantStep: 64,
				preRemoveBackground: false,
				postRemoveBackground: false,
				bgRemovalScope: "selected",
				backgroundTolerance: 0,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				autoGridFromTrimmed: false,
			} as const;

			const { grid: gridNoIgnore } = processImage(img, {
				...base,
				floatingMaxPixels: 0,
				debugHook: makeDebugHook("forcePixelsW_H", "floatingMaxPixels=0"),
			});
			// 浮きノイズ(8,8)まで含むBBox: x=1..8, y=1..8 => 8x8
			expect(gridNoIgnore.cropW).toBe(8);
			expect(gridNoIgnore.cropH).toBe(8);

			const { grid: gridIgnore } = processImage(img, {
				...base,
				floatingMaxPixels: 4,
				debugHook: makeDebugHook("forcePixelsW_H", "floatingMaxPixels=4"),
			});
			// 浮きノイズ除去後のBBox: x=1..4, y=1..4 => 4x4
			expect(gridIgnore.cropW).toBe(4);
			expect(gridIgnore.cropH).toBe(4);
		});
	});

	describe("resize_and_remove_bg", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("resize_and_remove_bg");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/resize_and_remove_bg.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);
			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/resize_and_remove_bg-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("高速モードOFF、浮きノイズOFF: 期待画像と完全一致する", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				autoGridFromTrimmed: true,
				fastAutoGridFromTrimmed: false, // 高速モードOFF
				floatingMaxPixels: 0, // 浮きノイズOFF
				debugHook: makeDebugHook(
					"resize_and_remove_bg",
					"高速モードOFF(fastAutoGridFromTrimmed=false)_浮きノイズOFF(floatingMaxPixels=0)_期待画像と完全一致",
				),
			});

			if (UPDATE_EXPECT) {
				writeRawImageAsPngSync(getExpectPath("resize_and_remove_bg"), result);
				return;
			}
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);
			expectSameImage(result, expected, getExpectPath("resize_and_remove_bg"));
		});
	});

	describe("resize_with_trimming", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("resize_with_trimming");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/resize_with_trimming.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/resize_with_trimming-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("指定ピクセル(forcePixelsW/H)=46/13 で 46x13 に強制変換され、期待画像と完全一致する", () => {
			const baseOpts = {
				forcePixelsW: 46,
				forcePixelsH: 13,
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 64,

				floatingMaxPixels: 0,
				autoGridFromTrimmed: true,
			} as const;

			const { result, grid } = processImage(img, {
				...baseOpts,
				forcePixelsW: 46,
				forcePixelsH: 13,
				debugHook: makeDebugHook(
					"resize_with_trimming",
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

			expectSameImage(result, expected, getExpectPath("resize_with_trimming"));
			const { result: resultTrim, grid: gridTrim } = processImage(img, {
				...baseOpts,
				trimToContent: true,
				debugHook: makeDebugHook(
					"resize_with_trimming",
					"trimToContent=true_でもサイズは変わらない",
				),
			});
			expect(resultTrim.width).toBe(46);
			expect(resultTrim.height).toBe(13);
			expect(gridTrim.outW).toBe(46);
			expect(gridTrim.outH).toBe(13);
		});
	});

	describe("auto_grid_detection", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("auto_grid_detection");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/auto_grid_detection.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/auto_grid_detection-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("期待画像と完全一致する（サイズ・ピクセル）", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,

				floatingMaxPixels: 0,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"auto_grid_detection",
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

			expectSameImage(result, expected, getExpectPath("auto_grid_detection"));
		});
	});

	describe("inner_background_removal", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("inner_background_removal");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/inner_background_removal.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/inner_background_removal-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("期待画像と完全一致する（サイズ・ピクセル）", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 96,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,

				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"inner_background_removal",
					"期待画像と完全一致する（サイズ・ピクセル）",
				),
			});

			if (UPDATE_EXPECT) {
				writeRawImageAsPngSync(
					getExpectPath("inner_background_removal"),
					result,
				);
				return;
			}
			// 期待値PNGと完全一致（サイズ・ピクセル）
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);

			expectSameImage(
				result,
				expected,
				getExpectPath("inner_background_removal"),
			);
		});

		it("内側に閉じ込められた背景色（ドーナツ穴）も透過できる", () => {
			const { result } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 96,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,

				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"inner_background_removal",
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

	describe("no_trimming", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("no_trimming");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/no_trimming.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL("../../test/fixtures/no_trimming-expect.png", import.meta.url),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("自動トリム(trimToContent)をOFFにしても、期待画像と一致する", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 32,
				sampleWindow: 3,
				trimToContent: false, // 自動トリムをOFF
				trimAlphaThreshold: 16,

				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"no_trimming",
					"自動トリム(trimToContent)_OFFでも期待画像と一致する",
				),
			});

			// 期待値PNGと完全一致（サイズ・ピクセル）
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);

			expectSameImage(result, expected, getExpectPath("no_trimming"));
		});
	});

	describe("palette_conversion_gb: Palette Conversion (Game Boy)", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("palette_conversion_gb");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/palette_conversion_gb.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);
			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/palette_conversion_gb-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("GBパレット(4色)に正しく変換され、期待画像と一致すること", () => {
			// ゲームボーイ(Legacy)モードで実行
			const { result } = processImage(img, {
				reduceColors: true,
				reduceColorMode: "gb_pocket",
				ditherStrength: 0,
				// 他の処理はOFFにしておく
				enableGridDetection: false,
				bgExtractionMethod: "none", // 背景抽出をOFF
				preRemoveBackground: false,
				postRemoveBackground: false,
				bgRemovalScope: "selected",
				trimToContent: false,
				debug: true,
			});

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expectSameImage(result, expected, getExpectPath("palette_conversion_gb"));
		});
	});

	describe("dithering_floyd_steinberg: Dithering (Floyd-Steinberg)", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("dithering_floyd_steinberg");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/dithering_floyd_steinberg.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);
			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/dithering_floyd_steinberg-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("ディザリングありで処理され、期待画像と一致すること", () => {
			// 2色（白黒）＋ディザリング
			const { result } = processImage(img, {
				reduceColors: true,
				reduceColorMode: "mono", // 白黒
				ditherMode: "floyd-steinberg",
				ditherStrength: 100,
				enableGridDetection: false,
				bgExtractionMethod: "none", // 背景抽出をOFF
				preRemoveBackground: false,
				postRemoveBackground: false,
				bgRemovalScope: "selected",
				trimToContent: false,
				debug: true,
			});

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expectSameImage(
				result,
				expected,
				getExpectPath("dithering_floyd_steinberg"),
			);
		});
	});

	describe("enableGridDetection", () => {
		beforeAll(() => {
			cleanDebugDir("enableGridDetection");
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

		it("enableGridDetection=false のとき、縮小されず等倍で出力される", () => {
			const img = mkImg();
			const { result, grid } = processImage(img, {
				enableGridDetection: false,
				trimToContent: false,
				debugHook: makeDebugHook(
					"enableGridDetection",
					"enableGridDetection=false_縮小されず等倍で出力",
				),
			});

			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(grid.cellW).toBe(1);
			expect(grid.cellH).toBe(1);
		});

		it("enableGridDetection=false かつ trimToContent=true のとき、トリミングのみ行われる", () => {
			const img = mkImg();
			const { result, grid } = processImage(img, {
				enableGridDetection: false,
				trimToContent: true,
				preRemoveBackground: true,
				backgroundTolerance: 0,
				debugHook: makeDebugHook(
					"enableGridDetection",
					"enableGridDetection=false_かつ_trimToContent=true_トリミングのみ",
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

		it("enableGridDetection=false のときも減色が動作する", () => {
			const img = mkImg();
			const { result } = processImage(img, {
				enableGridDetection: false,
				reduceColors: true,
				reduceColorMode: "auto",
				colorCount: 2,
				debugHook: makeDebugHook(
					"enableGridDetection",
					"enableGridDetection=false_かつ_reduceColors=true",
				),
			});

			// 色数をカウント
			const colors = new Set<number>();
			const data32 = new Uint32Array(result.data.buffer);
			for (let i = 0; i < data32.length; i++) {
				colors.add(data32[i]);
			}
			// 背景(白)とオブジェクト(黒)の2色になるはず
			expect(colors.size).toBeLessThanOrEqual(2);
		});
	});
	describe("makeSquare", () => {
		beforeAll(() => {
			cleanDebugDir("makeSquare");
		});

		const mkImg = (w: number, h: number): RawImage => {
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
			for (let y = 0; y < h; y += 1) {
				for (let x = 0; x < w; x += 1) {
					// わかりやすいように不透明な色で塗りつぶす
					set(x, y, 255, 0, 0, 255);
				}
			}
			return { width: w, height: h, data };
		};

		it("幅が広い画像(横長)を正方形にする", () => {
			const img = mkImg(10, 4); // 横長
			const { result, grid } = processImage(img, {
				trimToContent: false,
				preRemoveBackground: false,
				postRemoveBackground: false,
				makeSquare: true,
				enableGridDetection: false,
				debugHook: makeDebugHook(
					"makeSquare",
					"幅が広い画像(横長)を正方形にする",
				),
			});

			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(grid.outW).toBe(10);
			expect(grid.outH).toBe(10);

			// 中央(0, 3)には元の赤いピクセルがあり、上下の余白(0, 0)などは透明になっていること
			const topAlpha = result.data[3]; // (0, 0)
			expect(topAlpha).toBe(0);
			const centerAlpha = result.data[(3 * 10 + 0) * 4 + 3]; // (0, 3)
			expect(centerAlpha).toBe(255);
		});

		it("高さが高い画像(縦長)を正方形にする", () => {
			const img = mkImg(4, 10); // 縦長
			const { result, grid } = processImage(img, {
				trimToContent: false,
				preRemoveBackground: false,
				postRemoveBackground: false,
				makeSquare: true,
				enableGridDetection: false,
				debugHook: makeDebugHook(
					"makeSquare",
					"高さが高い画像(縦長)を正方形にする",
				),
			});

			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(grid.outW).toBe(10);
			expect(grid.outH).toBe(10);

			// 中央(3, 0)には元の赤いピクセルがあり、左右の余白(0, 0)などは透明になっていること
			const leftEdgeAlpha = result.data[3]; // (0, 0)
			expect(leftEdgeAlpha).toBe(0);
			const centerAlpha = result.data[(0 * 10 + 3) * 4 + 3]; // (3, 0)
			expect(centerAlpha).toBe(255);
		});
	});

	describe("high_resolution", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("high_resolution");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/high_resolution.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/high_resolution-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("高解像度画像（1ドットが小さい画像）が適切に検出・処理されること", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				// ユーザーからのフィードバックに基づき、autoGridFromTrimmed: true でも
				// 探索範囲の緩和とペナルティ調整により、高解像度グリッドが検出されることを確認する。
				autoGridFromTrimmed: true,
				debug: true,
				debugHook: makeDebugHook("high_resolution", "結果確認用"),
			});

			// 検出結果の検証
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);

			// 画像比較
			expectSameImage(result, expected, getExpectPath("high_resolution"));
		});
	});

	describe("Grid Search Strategies Consistency", () => {
		it("FastモードとLegacyモードが同じ結果を導き出すか (シンプルな画像)", () => {
			// 16x16 のグリッド画像を作成 (8x8セルが2x2並んでいる想定)
			const width = 16;
			const height = 16;
			const data = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const isCell1 = Math.floor(x / 8) % 2 === Math.floor(y / 8) % 2;
					const color = isCell1 ? 255 : 0;
					data[idx] = color;
					data[idx + 1] = color;
					data[idx + 2] = color;
					data[idx + 3] = 255;
				}
			}
			const img: RawImage = { width, height, data };
			const mask: RawImage = {
				width,
				height,
				data: new Uint8ClampedArray(data),
			};

			// 内部クラスにアクセスするために型をキャストして使用
			const legacy = new (
				LegacyGridSearchFromTrimmed as unknown as {
					new (): {
						search: (img: RawImage, mask: RawImage, sw: number) => unknown;
					};
				}
			)();
			const fast = new (
				FastGridSearchFromTrimmed as unknown as {
					new (): {
						search: (img: RawImage, mask: RawImage, sw: number) => unknown;
					};
				}
			)();

			const resLegacy = legacy.search(img, mask, 3) as {
				outW: number;
				outH: number;
			} | null;
			const resFast = fast.search(img, mask, 3) as {
				outW: number;
				outH: number;
			} | null;

			expect(resLegacy).not.toBeNull();
			expect(resFast).not.toBeNull();
			if (resLegacy && resFast) {
				expect(resFast.outW).toBe(resLegacy.outW);
				expect(resFast.outH).toBe(resLegacy.outH);
			}
		});
	});
});
