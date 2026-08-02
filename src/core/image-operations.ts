import type { PixelGrid, RawImage } from "../shared/types";

export const cloneImage = (img: RawImage): RawImage => ({
	width: img.width,
	height: img.height,
	data: new Uint8ClampedArray(img.data),
});

const medianOf = (values: number[]): number => {
	const n = values.length;
	if (n === 0) return 0;
	// 結果には影響しないため、その場でソートする（中央値のみ必要）。
	values.sort((a, b) => a - b);
	const mid = Math.floor(n / 2);
	if (n % 2 === 0) {
		return (values[mid - 1] + values[mid]) / 2;
	}
	return values[mid];
};

export const downsample = (
	img: RawImage,
	grid: PixelGrid,
	sampleWindow = 3,
): RawImage => {
	const cellW = grid.cellW;
	const cellH = grid.cellH;
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const outW =
		grid.outW ?? Math.max(1, Math.floor((img.width - cropX) / cellW));
	const outH =
		grid.outH ?? Math.max(1, Math.floor((img.height - cropY) / cellH));
	const half = Math.max(0, Math.floor(sampleWindow / 2));
	const out = new Uint8ClampedArray(outW * outH * 4);

	const roundHalfUp = (x: number): number => Math.floor(x + 0.5);
	const cw = Math.round(cellW);
	const ch = Math.round(cellH);
	const cwHalf = Math.floor(cw / 2);
	const chHalf = Math.floor(ch / 2);
	const useInt = Math.abs(cellW - cw) < 1e-6 && Math.abs(cellH - ch) < 1e-6;

	const imgData = img.data;
	const imgW = img.width;
	const imgH = img.height;
	const imgWMax = imgW - 1;
	const imgHMax = imgH - 1;

	// ピクセルごとの割り当てを避けるため配列を再利用する（値の並びと順序は維持する）。
	const valuesR: number[] = [];
	const valuesG: number[] = [];
	const valuesB: number[] = [];
	const valuesA: number[] = [];
	const valuesAllR: number[] = [];
	const valuesAllG: number[] = [];
	const valuesAllB: number[] = [];
	const valuesAllA: number[] = [];

	for (let j = 0; j < outH; j += 1) {
		for (let i = 0; i < outW; i += 1) {
			let cx: number;
			let cy: number;
			if (useInt) {
				cx = cropX + i * cw + cwHalf;
				cy = cropY + j * ch + chHalf;
			} else {
				cx = roundHalfUp(cropX + (i + 0.5) * cellW);
				cy = roundHalfUp(cropY + (j + 0.5) * cellH);
			}
			const x0 = Math.min(imgWMax, Math.max(0, cx - half));
			const x1 = Math.min(imgW, Math.max(1, cx + half + 1));
			const y0 = Math.min(imgHMax, Math.max(0, cy - half));
			const y1 = Math.min(imgH, Math.max(1, cy + half + 1));

			valuesR.length = 0;
			valuesG.length = 0;
			valuesB.length = 0;
			valuesA.length = 0;
			valuesAllR.length = 0;
			valuesAllG.length = 0;
			valuesAllB.length = 0;
			valuesAllA.length = 0;

			for (let y = y0; y < y1; y += 1) {
				const rowOffset = y * imgW;
				for (let x = x0; x < x1; x += 1) {
					const idx = (rowOffset + x) * 4;
					const r = imgData[idx];
					const g = imgData[idx + 1];
					const b = imgData[idx + 2];
					const a = imgData[idx + 3];
					valuesAllR.push(r);
					valuesAllG.push(g);
					valuesAllB.push(b);
					valuesAllA.push(a);
					if (a >= 16) {
						valuesR.push(r);
						valuesG.push(g);
						valuesB.push(b);
						valuesA.push(a);
					}
				}
			}

			const useOpaque = valuesA.length > 0;
			const r = medianOf(useOpaque ? valuesR : valuesAllR);
			const g = medianOf(useOpaque ? valuesG : valuesAllG);
			const b = medianOf(useOpaque ? valuesB : valuesAllB);
			const a = medianOf(useOpaque ? valuesA : valuesAllA);

			const outIdx = (j * outW + i) * 4;
			out[outIdx] = r;
			out[outIdx + 1] = g;
			out[outIdx + 2] = b;
			out[outIdx + 3] = a;
		}
	}

	return { width: outW, height: outH, data: out };
};

/**
 * 比較用に画像をリサイズする単純な点サンプリング（最近傍法）。
 * `downsample` と異なり中央値フィルタリングを行わないため、
 * 視覚比較用に元のアンチエイリアスとノイズを保持する。
 */
export const sampleRawImage = (img: RawImage, grid: PixelGrid): RawImage => {
	const cellW = grid.cellW;
	const cellH = grid.cellH;
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const outW =
		grid.outW ?? Math.max(1, Math.floor((img.width - cropX) / cellW));
	const outH =
		grid.outH ?? Math.max(1, Math.floor((img.height - cropY) / cellH));
	const out = new Uint8ClampedArray(outW * outH * 4);

	const imgData = img.data;
	const imgW = img.width;
	const imgH = img.height;

	for (let j = 0; j < outH; j += 1) {
		const cy = Math.floor(cropY + (j + 0.5) * cellH);
		if (cy < 0 || cy >= imgH) continue;
		const rowOffset = cy * imgW;
		const outRowOffset = j * outW;

		for (let i = 0; i < outW; i += 1) {
			const cx = Math.floor(cropX + (i + 0.5) * cellW);
			if (cx < 0 || cx >= imgW) continue;

			const srcIdx = (rowOffset + cx) * 4;
			const dstIdx = (outRowOffset + i) * 4;

			out[dstIdx] = imgData[srcIdx];
			out[dstIdx + 1] = imgData[srcIdx + 1];
			out[dstIdx + 2] = imgData[srcIdx + 2];
			out[dstIdx + 3] = imgData[srcIdx + 3];
		}
	}

	return { width: outW, height: outH, data: out };
};

/**
 * 比較表示用に、切り抜いた領域を最近傍法でリサイズする。
 * 平滑化や中央値・色の集約を避ける
 * （つまり「ドット補正」は行わない）。
 */
export const resizeRawImageNearest = (
	img: RawImage,
	cropX: number,
	cropY: number,
	cropW: number,
	cropH: number,
	outW: number,
	outH: number,
): RawImage => {
	const dstW = Math.max(1, outW | 0);
	const dstH = Math.max(1, outH | 0);
	const out = new Uint8ClampedArray(dstW * dstH * 4);

	const srcW = img.width;
	const srcH = img.height;
	const src = img.data;

	// ゼロ除算を避ける
	const cw = Math.max(1e-6, cropW);
	const ch = Math.max(1e-6, cropH);
	const scaleX = cw / dstW;
	const scaleY = ch / dstH;

	const clampInt0 = (v: number, max: number): number => {
		if (v < 0) return 0;
		if (v > max) return max;
		return v | 0;
	};

	for (let j = 0; j < dstH; j += 1) {
		// ピクセル中心へマッピングしてから最近傍法を適用する
		const sy = cropY + (j + 0.5) * scaleY - 0.5;
		const yy = clampInt0(Math.round(sy), srcH - 1);
		const rowOffset = yy * srcW;

		for (let i = 0; i < dstW; i += 1) {
			const sx = cropX + (i + 0.5) * scaleX - 0.5;
			const xx = clampInt0(Math.round(sx), srcW - 1);
			const srcIdx = (rowOffset + xx) * 4;
			const dstIdx = (j * dstW + i) * 4;
			out[dstIdx] = src[srcIdx];
			out[dstIdx + 1] = src[srcIdx + 1];
			out[dstIdx + 2] = src[srcIdx + 2];
			out[dstIdx + 3] = src[srcIdx + 3];
		}
	}

	return { width: dstW, height: dstH, data: out };
};

export const cropRawImageNearestFromGrid = (
	img: RawImage,
	grid: PixelGrid,
): RawImage => {
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const outW =
		grid.outW ?? Math.max(1, Math.floor((img.width - cropX) / grid.cellW));
	const outH =
		grid.outH ?? Math.max(1, Math.floor((img.height - cropY) / grid.cellH));
	const cropW = grid.cropW ?? outW * grid.cellW;
	const cropH = grid.cropH ?? outH * grid.cellH;

	// 元の解像度を保つため、cropW/cropH を出力サイズとして使用する
	return resizeRawImageNearest(img, cropX, cropY, cropW, cropH, cropW, cropH);
};

export const findOpaqueBounds = (
	img: RawImage,
	alphaThreshold: number,
): { x: number; y: number; w: number; h: number } | null => {
	const w = img.width;
	const h = img.height;
	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;

	for (let y = 0; y < h; y += 1) {
		for (let x = 0; x < w; x += 1) {
			const idx = (y * w + x) * 4;
			const a = img.data[idx + 3];
			if (a >= alphaThreshold) {
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
			}
		}
	}

	if (maxX < minX || maxY < minY) {
		return null;
	}
	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

export const cropRawImage = (
	img: RawImage,
	x: number,
	y: number,
	w: number,
	h: number,
): RawImage => {
	const out = new Uint8ClampedArray(w * h * 4);
	const out32 = new Uint32Array(out.buffer);
	const src32 = new Uint32Array(img.data.buffer);

	for (let j = 0; j < h; j += 1) {
		const srcRowIdx = (y + j) * img.width + x;
		const dstRowIdx = j * w;
		for (let i = 0; i < w; i += 1) {
			out32[dstRowIdx + i] = src32[srcRowIdx + i];
		}
	}
	return { width: w, height: h, data: out };
};

export const padRawImage = (
	img: RawImage,
	padLeft: number,
	padTop: number,
	padRight: number,
	padBottom: number,
): RawImage => {
	const l = Math.max(0, padLeft | 0);
	const t = Math.max(0, padTop | 0);
	const r = Math.max(0, padRight | 0);
	const b = Math.max(0, padBottom | 0);
	if (l === 0 && t === 0 && r === 0 && b === 0) return img;

	const outW = img.width + l + r;
	const outH = img.height + t + b;
	const out = new Uint8ClampedArray(outW * outH * 4);
	const out32 = new Uint32Array(out.buffer);
	const src32 = new Uint32Array(img.data.buffer);

	for (let y = 0; y < img.height; y += 1) {
		const srcRow = y * img.width;
		const dstRow = (y + t) * outW + l;
		for (let x = 0; x < img.width; x += 1) {
			out32[dstRow + x] = src32[srcRow + x];
		}
	}
	return { width: outW, height: outH, data: out };
};

type AspectPadding = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
};

export const getAspectRatio = (img: RawImage): number =>
	img.height > 0 ? img.width / img.height : 1;

const getAspectPadding = (
	width: number,
	height: number,
	targetRatio: number,
): AspectPadding => {
	const safeRatio =
		targetRatio > 0 && Number.isFinite(targetRatio) ? targetRatio : 1;
	const currentRatio = height > 0 ? width / height : safeRatio;
	if (Math.abs(currentRatio - safeRatio) < 0.0001) {
		return { left: 0, top: 0, right: 0, bottom: 0, width, height };
	}

	const widthForHeight = Math.max(width, Math.ceil(height * safeRatio));
	const heightForWidth = Math.max(height, Math.ceil(width / safeRatio));
	const widthFirstError = Math.abs(widthForHeight / height - safeRatio);
	const heightFirstError = Math.abs(width / heightForWidth - safeRatio);
	const useWidthFirst =
		widthFirstError < heightFirstError ||
		(widthFirstError === heightFirstError &&
			widthForHeight * height <= width * heightForWidth);

	const outW = useWidthFirst ? widthForHeight : width;
	const outH = useWidthFirst ? height : heightForWidth;
	const dw = outW - width;
	const dh = outH - height;
	const left = Math.floor(dw / 2);
	const top = Math.floor(dh / 2);

	return {
		left,
		top,
		right: dw - left,
		bottom: dh - top,
		width: outW,
		height: outH,
	};
};

export const padImageToAspectRatio = (
	img: RawImage,
	targetRatio = getAspectRatio(img),
): { image: RawImage; padding: AspectPadding } => {
	const padding = getAspectPadding(img.width, img.height, targetRatio);
	return {
		image: padRawImage(
			img,
			padding.left,
			padding.top,
			padding.right,
			padding.bottom,
		),
		padding,
	};
};
