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
 * RGB values of fully transparent pixels (alpha=0) in PNG do not affect visual appearance,
 * but depending on the generator tool, RGB might be zero-filled or retain original values, which can cause differences.
 * In tests, we normalize RGB to 0 when alpha=0 before comparison.
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
 * Verify images match exactly (provides shorter messages to trace causes without heavy diffs on mismatch).
 *
 * Vitest's `toEqual(Buffer)` can be extremely slow on mismatch due to large diff generation,
 * so here we report truthiness evaluation by `Buffer.equals()` + coordinates of the first difference.
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
	// `make test-debug` runs `rm -rf tmp/debug` first, so recreate the root itself.
	mkdirSync(DEBUG_ROOT, { recursive: true });
	const dir = path.join(DEBUG_ROOT, sanitizeForPath(testcaseName));
	rmSync(dir, { recursive: true, force: true });

	// Cleanup for legacy format (from when currentTestName was used directly as directory name).
	// e.g. prevents long directories like processImage___test6__... from remaining.
	const legacyPrefix = `processImage___${sanitizeForPath(testcaseName)}__`;
	try {
		for (const e of readdirSync(DEBUG_ROOT, { withFileTypes: true })) {
			if (!e.isDirectory()) continue;
			if (!e.name.startsWith(legacyPrefix)) continue;
			rmSync(path.join(DEBUG_ROOT, e.name), { recursive: true, force: true });
		}
	} catch {
		// Just in case: skip cleanup if DEBUG_ROOT doesn't exist
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

// When `processImage({ debug: true })`, ensure intermediate images/final result (99-result)
// are output even if `debugHook` is not passed on the test side.
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
