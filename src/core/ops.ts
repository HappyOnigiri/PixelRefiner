import type { Axis, Pixel, RawImage } from "../shared/types";

export const getPixel = (img: RawImage, x: number, y: number): Pixel => {
	const clampedX = Math.min(img.width - 1, Math.max(0, x));
	const clampedY = Math.min(img.height - 1, Math.max(0, y));
	const idx = (clampedY * img.width + clampedX) * 4;
	const d = img.data;
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
	for (let i = 0; i < img.data.length; i += 4) {
		out[i] = Math.min(255, Math.max(0, Math.floor(img.data[i] / step) * step));
		out[i + 1] = Math.min(
			255,
			Math.max(0, Math.floor(img.data[i + 1] / step) * step),
		);
		out[i + 2] = Math.min(
			255,
			Math.max(0, Math.floor(img.data[i + 2] / step) * step),
		);
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
	const newData = new Uint8ClampedArray(newWidth * newHeight * 4);

	for (let y = 0; y < newHeight; y++) {
		const srcY = Math.floor(y / scale);
		for (let x = 0; x < newWidth; x++) {
			const srcX = Math.floor(x / scale);
			const srcIdx = (srcY * img.width + srcX) * 4;
			const dstIdx = (y * newWidth + x) * 4;

			newData[dstIdx] = img.data[srcIdx];
			newData[dstIdx + 1] = img.data[srcIdx + 1];
			newData[dstIdx + 2] = img.data[srcIdx + 2];
			newData[dstIdx + 3] = img.data[srcIdx + 3];
		}
	}

	return {
		width: newWidth,
		height: newHeight,
		data: newData,
	};
};
