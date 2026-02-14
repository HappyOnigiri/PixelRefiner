import type { Axis, Pixel, RawImage } from "../shared/types";

export const getPixel = (
	img: RawImage,
	x: number,
	y: number,
	out?: Pixel,
): Pixel => {
	const clampedX = Math.min(img.width - 1, Math.max(0, x));
	const clampedY = Math.min(img.height - 1, Math.max(0, y));
	const idx = (clampedY * img.width + clampedX) * 4;
	const d = img.data;
	if (out) {
		out[0] = d[idx];
		out[1] = d[idx + 1];
		out[2] = d[idx + 2];
		out[3] = d[idx + 3];
		return out;
	}
	return [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
};

export const setPixel = (
	img: RawImage,
	x: number,
	y: number,
	px: Pixel,
): void => {
	if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
		return;
	}
	const idx = (y * img.width + x) * 4;
	const d = img.data;
	d[idx] = px[0];
	d[idx + 1] = px[1];
	d[idx + 2] = px[2];
	d[idx + 3] = px[3];
};

export const posterize = (img: RawImage, step: number): RawImage => {
	if (step <= 0) {
		return {
			width: img.width,
			height: img.height,
			data: new Uint8ClampedArray(img.data),
		};
	}
	const out = new Uint8ClampedArray(img.data.length);
	const src32 = new Uint32Array(img.data.buffer);
	for (let i = 0; i < img.data.length; i += 4) {
		const pixel = src32[i / 4];
		const r = pixel & 0xff;
		const g = (pixel >> 8) & 0xff;
		const b = (pixel >> 16) & 0xff;
		const a = (pixel >> 24) & 0xff;

		out[i] = Math.min(255, Math.max(0, Math.floor(r / step) * step));
		out[i + 1] = Math.min(255, Math.max(0, Math.floor(g / step) * step));
		out[i + 2] = Math.min(255, Math.max(0, Math.floor(b / step) * step));
		out[i + 3] = a;
	}
	return { width: img.width, height: img.height, data: out };
};

/**
 * SFCのハードウェア仕様（15bitカラー / RGB各5bit）に色を丸める。
 * 0-255 を 0-31 (5bit) に変換し、また 0-248 (8bit相当) に戻す。
 */
export const roundTo15bitColor = (img: RawImage): RawImage => {
	const out = new Uint8ClampedArray(img.data.length);
	for (let i = 0; i < img.data.length; i += 4) {
		out[i] = Math.round(img.data[i] / 8) * 8;
		out[i + 1] = Math.round(img.data[i + 1] / 8) * 8;
		out[i + 2] = Math.round(img.data[i + 2] / 8) * 8;
		out[i + 3] = img.data[i + 3];
	}
	return { width: img.width, height: img.height, data: out };
};

export const extractStrip = (
	img: RawImage,
	axis: Axis,
	pos: number,
): Pixel[] => {
	const strip: Pixel[] = [];
	if (axis === "y") {
		const y = Math.min(img.height - 1, Math.max(0, Math.round(pos)));
		for (let x = 0; x < img.width; x += 1) {
			// ここでは strip に追加するため新しい配列が必要だが、
			// getPixel(img, x, y) を直接呼ぶ
			strip.push(getPixel(img, x, y));
		}
		return strip;
	}
	if (axis === "x") {
		const x = Math.min(img.width - 1, Math.max(0, Math.round(pos)));
		for (let y = 0; y < img.height; y += 1) {
			strip.push(getPixel(img, x, y));
		}
		return strip;
	}
	return strip;
};

export const upscaleNearest = (img: RawImage, scale: number): RawImage => {
	if (scale <= 1) return img;

	const newWidth = img.width * scale;
	const newHeight = img.height * scale;
	const out = new Uint8ClampedArray(newWidth * newHeight * 4);
	const out32 = new Uint32Array(out.buffer);
	const src32 = new Uint32Array(img.data.buffer);

	for (let y = 0; y < newHeight; y++) {
		const srcY = Math.floor(y / scale);
		const dstRowIdx = y * newWidth;
		const srcRowIdx = srcY * img.width;
		for (let x = 0; x < newWidth; x++) {
			const srcX = Math.floor(x / scale);
			out32[dstRowIdx + x] = src32[srcRowIdx + srcX];
		}
	}

	return {
		width: newWidth,
		height: newHeight,
		data: out,
	};
};
