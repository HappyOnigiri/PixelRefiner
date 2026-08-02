import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { expect } from "vitest";
import type { RawImage } from "../shared/types";

const DEBUG_IMAGES = Boolean(process.env.PIXELATE_DEBUG_IMAGES);
export const UPDATE_EXPECT = Boolean(process.env.UPDATE_EXPECT);
const DEBUG_ROOT = path.resolve("tmp/debug/test");

export const readPngAsRawImage = async (
	filePath: string,
): Promise<RawImage> => {
	const buf = await readFile(filePath);
	const png = PNG.sync.read(buf);
	return {
		width: png.width,
		height: png.height,
		data: new Uint8ClampedArray(png.data),
	};
};

export const writeRawImageAsPngSync = (
	outPath: string,
	img: RawImage,
): void => {
	const png = new PNG({ width: img.width, height: img.height });
	png.data = Buffer.from(img.data);
	const buf = PNG.sync.write(png);
	writeFileSync(outPath, buf);
};

/**
 * PNG 内の完全に透明なピクセル（alpha=0）の RGB 値は見た目に影響しないが、
 * 生成ツールによって RGB がゼロ埋めされたり元の値を保持したりするため、差異が生じる場合がある。
 * テストでは比較前に、alpha=0 の RGB を 0 へ正規化する。
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
 * 画像が完全に一致することを確認する（一致しない場合も重い差分を出さず、原因追跡向けに短いメッセージを提供する）。
 *
 * Vitest の `toEqual(Buffer)` は不一致時に大きな差分を生成して非常に遅くなる場合があるため、
 * ここでは `Buffer.equals()` による真偽評価と最初の差異の座標を報告する。
 */
export const expectSameImage = (
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
			`Image mismatch (length difference) actual=${a.length} expected=${b.length}`,
		);
	}

	const pixel = (first / 4) | 0;
	const ch = first % 4;
	const x = pixel % actual.width;
	const y = (pixel / actual.width) | 0;
	throw new Error(
		`Image mismatch: firstDiff=idx${first} (x=${x}, y=${y}, ch=${ch}) actual=${a[first]} expected=${b[first]}`,
	);
};

export const getExpectPath = (fixtureBase: string): string =>
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

export const cleanDebugDir = (testcaseName: string): void => {
	if (!DEBUG_IMAGES) return;
	// `make test-debug` は先に `rm -rf tmp/debug` を実行するため、ルート自体を再作成する。
	mkdirSync(DEBUG_ROOT, { recursive: true });
	const dir = path.join(DEBUG_ROOT, sanitizeForPath(testcaseName));
	rmSync(dir, { recursive: true, force: true });

	// 旧形式の後始末（currentTestName を直接ディレクトリ名としていた頃のもの）。
	// 例: processImage___test6__... のような長いディレクトリが残らないようにする。
	const legacyPrefix = `processImage___${sanitizeForPath(testcaseName)}__`;
	try {
		for (const e of readdirSync(DEBUG_ROOT, { withFileTypes: true })) {
			if (!e.isDirectory()) continue;
			if (!e.name.startsWith(legacyPrefix)) continue;
			rmSync(path.join(DEBUG_ROOT, e.name), { recursive: true, force: true });
		}
	} catch {
		// 念のため、DEBUG_ROOT が存在しない場合は後始末を省略する
	}
};

export const makeDebugHook = (testcaseName: string, testName: string) => {
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

// `processImage({ debug: true })` 時、テスト側で `debugHook` を渡さなくても中間画像と最終結果（99-result）を
// 出力するようにする。
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
