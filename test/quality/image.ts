import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	readSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import type { RawImage } from "../../src/shared/types";

const PNG_IHDR_HEADER_BYTES = 24;

export const readPng = (filePath: string): RawImage => {
	const png = PNG.sync.read(readFileSync(filePath));
	return {
		width: png.width,
		height: png.height,
		data: new Uint8ClampedArray(png.data),
	};
};

/**
 * PNG の画素数を IHDR だけ読んで求める。
 * 全ケースの実行コストを見積もるために使うので、デコードは避ける。
 */
export const pngPixelCount = (filePath: string): number => {
	const header = Buffer.alloc(PNG_IHDR_HEADER_BYTES);
	const file = openSync(filePath, "r");
	try {
		const read = readSync(file, header, 0, PNG_IHDR_HEADER_BYTES, 0);
		if (read < PNG_IHDR_HEADER_BYTES) {
			throw new Error(`Truncated PNG header: ${filePath}`);
		}
	} finally {
		closeSync(file);
	}
	return header.readUInt32BE(16) * header.readUInt32BE(20);
};

export const writePng = (filePath: string, image: RawImage): void => {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const png = new PNG({ width: image.width, height: image.height });
	png.data = Buffer.from(image.data);
	writeFileSync(filePath, PNG.sync.write(png));
};

export const normalizeTransparentRgb = (image: RawImage): Uint8ClampedArray => {
	const normalized = new Uint8ClampedArray(image.data);
	for (let i = 0; i < normalized.length; i += 4) {
		if (normalized[i + 3] !== 0) continue;
		normalized[i] = 0;
		normalized[i + 1] = 0;
		normalized[i + 2] = 0;
	}
	return normalized;
};

export const imagesEqual = (left: RawImage, right: RawImage): boolean =>
	left.width === right.width &&
	left.height === right.height &&
	Buffer.from(normalizeTransparentRgb(left)).equals(
		Buffer.from(normalizeTransparentRgb(right)),
	);

export const copyImage = (image: RawImage): RawImage => ({
	width: image.width,
	height: image.height,
	data: new Uint8ClampedArray(image.data),
});
