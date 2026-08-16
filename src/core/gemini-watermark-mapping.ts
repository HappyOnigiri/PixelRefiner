import { GEMINI_WATERMARK_LIMITS } from "../shared/config";
import type { PixelGrid, RawImage } from "../shared/types";

export type MappedRemovalMode = "transparent" | "background";

const TRANSPARENT_BACKGROUND_OFFSET = -1;
const MISSING_BACKGROUND_OFFSET = -2;

/** ダウンサンプリングの補間で隣のセルへにじむ分を見込んだ、セル境界の余白（元画像の画素）。 */
const INTERPOLATION_RADIUS = 0.5;

const cellContainsOtherForeground = (
	sourceMask: RawImage,
	markMask: Uint8Array,
	markMinX: number,
	markMinY: number,
	markWidth: number,
	markHeight: number,
	grid: PixelGrid,
	outputX: number,
	outputY: number,
): boolean => {
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const sourceMinX = Math.max(
		0,
		Math.floor(cropX + outputX * grid.cellW - INTERPOLATION_RADIUS),
	);
	const sourceMinY = Math.max(
		0,
		Math.floor(cropY + outputY * grid.cellH - INTERPOLATION_RADIUS),
	);
	const sourceMaxX = Math.min(
		sourceMask.width - 1,
		Math.ceil(cropX + (outputX + 1) * grid.cellW + INTERPOLATION_RADIUS),
	);
	const sourceMaxY = Math.min(
		sourceMask.height - 1,
		Math.ceil(cropY + (outputY + 1) * grid.cellH + INTERPOLATION_RADIUS),
	);
	for (let sourceY = sourceMinY; sourceY <= sourceMaxY; sourceY += 1) {
		for (let sourceX = sourceMinX; sourceX <= sourceMaxX; sourceX += 1) {
			const sourcePixel = sourceY * sourceMask.width + sourceX;
			if (
				sourceMask.data[sourcePixel * 4 + 3] <
				GEMINI_WATERMARK_LIMITS.alphaThreshold
			) {
				continue;
			}
			const markX = sourceX - markMinX;
			const markY = sourceY - markMinY;
			if (
				markX >= 0 &&
				markY >= 0 &&
				markX < markWidth &&
				markY < markHeight &&
				markMask[markY * markWidth + markX] !== 0
			) {
				continue;
			}
			const mappedMinX = Math.floor(
				(sourceX - INTERPOLATION_RADIUS - cropX) / grid.cellW,
			);
			const mappedMinY = Math.floor(
				(sourceY - INTERPOLATION_RADIUS - cropY) / grid.cellH,
			);
			const mappedMaxX = Math.floor(
				(sourceX + INTERPOLATION_RADIUS - cropX) / grid.cellW,
			);
			const mappedMaxY = Math.floor(
				(sourceY + INTERPOLATION_RADIUS - cropY) / grid.cellH,
			);
			if (
				outputX >= mappedMinX &&
				outputX <= mappedMaxX &&
				outputY >= mappedMinY &&
				outputY <= mappedMaxY
			) {
				return true;
			}
		}
	}
	return false;
};

const findMappedBackgroundOffset = (
	image: RawImage,
	sourceMask: RawImage,
	markMask: Uint8Array,
	sourceMinX: number,
	sourceMinY: number,
	sourceMaxX: number,
	sourceMaxY: number,
	grid: PixelGrid,
	mappedMinX: number,
	mappedMinY: number,
	mappedMaxX: number,
	mappedMaxY: number,
): number => {
	const markWidth = sourceMaxX - sourceMinX + 1;
	const markHeight = sourceMaxY - sourceMinY + 1;
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const maximumRadius =
		Math.ceil(
			Math.min(sourceMask.width, sourceMask.height) *
				GEMINI_WATERMARK_LIMITS.maximumDimensionRatio,
		) + 2;
	const candidateOffset = (sourceX: number, sourceY: number): number => {
		const sourceOffset = (sourceY * sourceMask.width + sourceX) * 4;
		if (
			sourceMask.data[sourceOffset + 3] >=
			GEMINI_WATERMARK_LIMITS.alphaThreshold
		) {
			return MISSING_BACKGROUND_OFFSET;
		}
		const outputX = Math.floor((sourceX - cropX) / grid.cellW);
		const outputY = Math.floor((sourceY - cropY) / grid.cellH);
		if (
			outputX < 0 ||
			outputY < 0 ||
			outputX >= image.width ||
			outputY >= image.height ||
			(outputX >= mappedMinX &&
				outputX <= mappedMaxX &&
				outputY >= mappedMinY &&
				outputY <= mappedMaxY) ||
			cellContainsOtherForeground(
				sourceMask,
				markMask,
				sourceMinX,
				sourceMinY,
				markWidth,
				markHeight,
				grid,
				outputX,
				outputY,
			)
		) {
			return MISSING_BACKGROUND_OFFSET;
		}
		const offset = (outputY * image.width + outputX) * 4;
		return image.data[offset + 3] >= GEMINI_WATERMARK_LIMITS.alphaThreshold
			? offset
			: TRANSPARENT_BACKGROUND_OFFSET;
	};
	for (let radius = 1; radius <= maximumRadius; radius += 1) {
		const minX = Math.max(0, sourceMinX - radius);
		const maxX = Math.min(sourceMask.width - 1, sourceMaxX + radius);
		const minY = Math.max(0, sourceMinY - radius);
		const maxY = Math.min(sourceMask.height - 1, sourceMaxY + radius);
		for (let x = minX; x <= maxX; x += 1) {
			const top = candidateOffset(x, minY);
			if (top !== MISSING_BACKGROUND_OFFSET) return top;
			if (maxY === minY) continue;
			const bottom = candidateOffset(x, maxY);
			if (bottom !== MISSING_BACKGROUND_OFFSET) return bottom;
		}
		for (let y = minY + 1; y < maxY; y += 1) {
			const left = candidateOffset(minX, y);
			if (left !== MISSING_BACKGROUND_OFFSET) return left;
			if (maxX === minX) continue;
			const right = candidateOffset(maxX, y);
			if (right !== MISSING_BACKGROUND_OFFSET) return right;
		}
	}
	return MISSING_BACKGROUND_OFFSET;
};

/** 検出した元画像画素を、確定済みグリッドを通した出力座標へ写す。 */
export const clearMappedGeminiWatermark = (
	image: RawImage,
	sourceMask: RawImage,
	grid: PixelGrid,
	sourcePixels: Uint32Array,
	mode: MappedRemovalMode = "transparent",
): RawImage => {
	if (sourcePixels.length === 0) return image;
	const sourceWidth = sourceMask.width;
	const sourceHeight = sourceMask.height;
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	let sourceMinX = sourceWidth;
	let sourceMinY = sourceHeight;
	let sourceMaxX = 0;
	let sourceMaxY = 0;
	for (let index = 0; index < sourcePixels.length; index += 1) {
		const sourcePixel = sourcePixels[index];
		const sourceX = sourcePixel % sourceWidth;
		const sourceY = (sourcePixel / sourceWidth) | 0;
		sourceMinX = Math.min(sourceMinX, sourceX);
		sourceMinY = Math.min(sourceMinY, sourceY);
		sourceMaxX = Math.max(sourceMaxX, sourceX);
		sourceMaxY = Math.max(sourceMaxY, sourceY);
	}
	const markWidth = sourceMaxX - sourceMinX + 1;
	const markHeight = sourceMaxY - sourceMinY + 1;
	const markMask = new Uint8Array(markWidth * markHeight);
	for (let index = 0; index < sourcePixels.length; index += 1) {
		const sourcePixel = sourcePixels[index];
		const sourceX = sourcePixel % sourceWidth;
		const sourceY = (sourcePixel / sourceWidth) | 0;
		markMask[(sourceY - sourceMinY) * markWidth + sourceX - sourceMinX] = 1;
	}
	const mappedMinX = Math.max(
		0,
		Math.floor((sourceMinX - INTERPOLATION_RADIUS - cropX) / grid.cellW),
	);
	const mappedMinY = Math.max(
		0,
		Math.floor((sourceMinY - INTERPOLATION_RADIUS - cropY) / grid.cellH),
	);
	const mappedMaxX = Math.min(
		image.width - 1,
		Math.floor((sourceMaxX + INTERPOLATION_RADIUS - cropX) / grid.cellW),
	);
	const mappedMaxY = Math.min(
		image.height - 1,
		Math.floor((sourceMaxY + INTERPOLATION_RADIUS - cropY) / grid.cellH),
	);
	if (mappedMinX > mappedMaxX || mappedMinY > mappedMaxY) return image;
	const backgroundOffset =
		mode === "background"
			? findMappedBackgroundOffset(
					image,
					sourceMask,
					markMask,
					sourceMinX,
					sourceMinY,
					sourceMaxX,
					sourceMaxY,
					grid,
					mappedMinX,
					mappedMinY,
					mappedMaxX,
					mappedMaxY,
				)
			: -1;
	if (mode === "background" && backgroundOffset === MISSING_BACKGROUND_OFFSET) {
		return image;
	}
	const mappedWidth = mappedMaxX - mappedMinX + 1;
	const cellStatus = new Uint8Array(
		mappedWidth * (mappedMaxY - mappedMinY + 1),
	);
	let data: Uint8ClampedArray | undefined;
	for (let index = 0; index < sourcePixels.length; index += 1) {
		const sourcePixel = sourcePixels[index];
		const sourceX = sourcePixel % sourceWidth;
		const sourceY = (sourcePixel / sourceWidth) | 0;
		const minX = Math.max(
			0,
			Math.floor((sourceX - INTERPOLATION_RADIUS - cropX) / grid.cellW),
		);
		const minY = Math.max(
			0,
			Math.floor((sourceY - INTERPOLATION_RADIUS - cropY) / grid.cellH),
		);
		const maxX = Math.min(
			image.width - 1,
			Math.floor((sourceX + INTERPOLATION_RADIUS - cropX) / grid.cellW),
		);
		const maxY = Math.min(
			image.height - 1,
			Math.floor((sourceY + INTERPOLATION_RADIUS - cropY) / grid.cellH),
		);
		for (let y = minY; y <= maxY; y += 1) {
			for (let x = minX; x <= maxX; x += 1) {
				const statusIndex = (y - mappedMinY) * mappedWidth + x - mappedMinX;
				if (cellStatus[statusIndex] !== 0) continue;
				if (
					cellContainsOtherForeground(
						sourceMask,
						markMask,
						sourceMinX,
						sourceMinY,
						markWidth,
						markHeight,
						grid,
						x,
						y,
					)
				) {
					cellStatus[statusIndex] = 1;
					continue;
				}
				cellStatus[statusIndex] = 2;
				data ??= new Uint8ClampedArray(image.data);
				const offset = (y * image.width + x) * 4;
				if (backgroundOffset >= 0) {
					data[offset] = image.data[backgroundOffset];
					data[offset + 1] = image.data[backgroundOffset + 1];
					data[offset + 2] = image.data[backgroundOffset + 2];
					data[offset + 3] = image.data[backgroundOffset + 3];
				} else {
					data[offset] = 0;
					data[offset + 1] = 0;
					data[offset + 2] = 0;
					data[offset + 3] = 0;
				}
			}
		}
	}
	return data ? { width: image.width, height: image.height, data } : image;
};
