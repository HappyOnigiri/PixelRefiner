import { GEMINI_WATERMARK_LIMITS } from "../shared/config";
import type { PixelGrid, RawImage } from "../shared/types";

export type MappedRemovalMode = "transparent" | "background";

const TRANSPARENT_BACKGROUND_OFFSET = -1;
const MISSING_BACKGROUND_OFFSET = -2;

type Rotation = {
	width: number;
	height: number;
	cosine: number;
	sine: number;
};

const rotatedSize = (
	width: number,
	height: number,
	angle: number,
): Rotation => {
	const radians = (angle * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	return {
		width: Math.max(
			1,
			Math.ceil(Math.abs(width * cosine) + Math.abs(height * sine)),
		),
		height: Math.max(
			1,
			Math.ceil(Math.abs(width * sine) + Math.abs(height * cosine)),
		),
		cosine,
		sine,
	};
};

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
	rotation: Rotation,
	interpolationRadius: number,
): boolean => {
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const rotatedMinX = cropX + outputX * grid.cellW - interpolationRadius;
	const rotatedMinY = cropY + outputY * grid.cellH - interpolationRadius;
	const rotatedMaxX = cropX + (outputX + 1) * grid.cellW + interpolationRadius;
	const rotatedMaxY = cropY + (outputY + 1) * grid.cellH + interpolationRadius;
	const sourceCenterX = (sourceMask.width - 1) / 2;
	const sourceCenterY = (sourceMask.height - 1) / 2;
	const outputCenterX = (rotation.width - 1) / 2;
	const outputCenterY = (rotation.height - 1) / 2;
	let sourceMinX = sourceMask.width;
	let sourceMinY = sourceMask.height;
	let sourceMaxX = 0;
	let sourceMaxY = 0;
	for (let corner = 0; corner < 4; corner += 1) {
		const rotatedX = corner % 2 === 0 ? rotatedMinX : rotatedMaxX;
		const rotatedY = corner < 2 ? rotatedMinY : rotatedMaxY;
		const centeredX = rotatedX - outputCenterX;
		const centeredY = rotatedY - outputCenterY;
		const sourceX =
			rotation.cosine * centeredX + rotation.sine * centeredY + sourceCenterX;
		const sourceY =
			-rotation.sine * centeredX + rotation.cosine * centeredY + sourceCenterY;
		sourceMinX = Math.min(sourceMinX, Math.floor(sourceX));
		sourceMinY = Math.min(sourceMinY, Math.floor(sourceY));
		sourceMaxX = Math.max(sourceMaxX, Math.ceil(sourceX));
		sourceMaxY = Math.max(sourceMaxY, Math.ceil(sourceY));
	}
	sourceMinX = Math.max(0, sourceMinX);
	sourceMinY = Math.max(0, sourceMinY);
	sourceMaxX = Math.min(sourceMask.width - 1, sourceMaxX);
	sourceMaxY = Math.min(sourceMask.height - 1, sourceMaxY);
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
			const centeredX = sourceX - sourceCenterX;
			const centeredY = sourceY - sourceCenterY;
			const rotatedX =
				rotation.cosine * centeredX - rotation.sine * centeredY + outputCenterX;
			const rotatedY =
				rotation.sine * centeredX + rotation.cosine * centeredY + outputCenterY;
			const mappedMinX = Math.floor(
				(rotatedX - interpolationRadius - cropX) / grid.cellW,
			);
			const mappedMinY = Math.floor(
				(rotatedY - interpolationRadius - cropY) / grid.cellH,
			);
			const mappedMaxX = Math.floor(
				(rotatedX + interpolationRadius - cropX) / grid.cellW,
			);
			const mappedMaxY = Math.floor(
				(rotatedY + interpolationRadius - cropY) / grid.cellH,
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
	rotation: Rotation,
	interpolationRadius: number,
	mappedMinX: number,
	mappedMinY: number,
	mappedMaxX: number,
	mappedMaxY: number,
): number => {
	const markWidth = sourceMaxX - sourceMinX + 1;
	const markHeight = sourceMaxY - sourceMinY + 1;
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const sourceCenterX = (sourceMask.width - 1) / 2;
	const sourceCenterY = (sourceMask.height - 1) / 2;
	const outputCenterX = (rotation.width - 1) / 2;
	const outputCenterY = (rotation.height - 1) / 2;
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
		const centeredX = sourceX - sourceCenterX;
		const centeredY = sourceY - sourceCenterY;
		const rotatedX =
			rotation.cosine * centeredX - rotation.sine * centeredY + outputCenterX;
		const rotatedY =
			rotation.sine * centeredX + rotation.cosine * centeredY + outputCenterY;
		const outputX = Math.floor((rotatedX - cropX) / grid.cellW);
		const outputY = Math.floor((rotatedY - cropY) / grid.cellH);
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
				rotation,
				interpolationRadius,
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

/** 検出した元画像画素を、傾き補正と確定済みグリッドを通した出力座標へ写す。 */
export const clearMappedGeminiWatermark = (
	image: RawImage,
	sourceMask: RawImage,
	grid: PixelGrid,
	sourcePixels: Uint32Array,
	angle: number,
	mode: MappedRemovalMode = "transparent",
): RawImage => {
	if (sourcePixels.length === 0) return image;
	const sourceWidth = sourceMask.width;
	const sourceHeight = sourceMask.height;
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const rotation = rotatedSize(sourceWidth, sourceHeight, angle);
	const sourceCenterX = (sourceWidth - 1) / 2;
	const sourceCenterY = (sourceHeight - 1) / 2;
	const outputCenterX = (rotation.width - 1) / 2;
	const outputCenterY = (rotation.height - 1) / 2;
	const interpolationRadius = Math.abs(angle) > 1e-9 ? 1 : 0.5;
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
	let mappedMinX = image.width;
	let mappedMinY = image.height;
	let mappedMaxX = 0;
	let mappedMaxY = 0;
	for (let corner = 0; corner < 4; corner += 1) {
		const sourceX = corner % 2 === 0 ? sourceMinX : sourceMaxX;
		const sourceY = corner < 2 ? sourceMinY : sourceMaxY;
		const centeredX = sourceX - sourceCenterX;
		const centeredY = sourceY - sourceCenterY;
		const rotatedX =
			rotation.cosine * centeredX - rotation.sine * centeredY + outputCenterX;
		const rotatedY =
			rotation.sine * centeredX + rotation.cosine * centeredY + outputCenterY;
		mappedMinX = Math.min(
			mappedMinX,
			Math.max(
				0,
				Math.floor((rotatedX - interpolationRadius - cropX) / grid.cellW),
			),
		);
		mappedMinY = Math.min(
			mappedMinY,
			Math.max(
				0,
				Math.floor((rotatedY - interpolationRadius - cropY) / grid.cellH),
			),
		);
		mappedMaxX = Math.max(
			mappedMaxX,
			Math.min(
				image.width - 1,
				Math.floor((rotatedX + interpolationRadius - cropX) / grid.cellW),
			),
		);
		mappedMaxY = Math.max(
			mappedMaxY,
			Math.min(
				image.height - 1,
				Math.floor((rotatedY + interpolationRadius - cropY) / grid.cellH),
			),
		);
	}
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
					rotation,
					interpolationRadius,
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
		const centeredX = sourceX - sourceCenterX;
		const centeredY = sourceY - sourceCenterY;
		const rotatedX =
			rotation.cosine * centeredX - rotation.sine * centeredY + outputCenterX;
		const rotatedY =
			rotation.sine * centeredX + rotation.cosine * centeredY + outputCenterY;
		const minX = Math.max(
			0,
			Math.floor((rotatedX - interpolationRadius - cropX) / grid.cellW),
		);
		const minY = Math.max(
			0,
			Math.floor((rotatedY - interpolationRadius - cropY) / grid.cellH),
		);
		const maxX = Math.min(
			image.width - 1,
			Math.floor((rotatedX + interpolationRadius - cropX) / grid.cellW),
		);
		const maxY = Math.min(
			image.height - 1,
			Math.floor((rotatedY + interpolationRadius - cropY) / grid.cellH),
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
						rotation,
						interpolationRadius,
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
