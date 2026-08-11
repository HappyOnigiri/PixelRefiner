import { GEMINI_WATERMARK_LIMITS } from "../shared/config";
import type { PixelGrid, RawImage } from "../shared/types";

export type MappedRemovalMode = "transparent" | "background";

const rotatedSize = (
	width: number,
	height: number,
	angle: number,
): { width: number; height: number; cosine: number; sine: number } => {
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

const findNearbyBackgroundOffset = (
	image: RawImage,
	boundMinX: number,
	boundMinY: number,
	boundMaxX: number,
	boundMaxY: number,
): number => {
	const maximumRadius =
		Math.ceil(
			Math.min(image.width, image.height) *
				GEMINI_WATERMARK_LIMITS.maximumDimensionRatio,
		) + 2;
	for (let radius = 1; radius <= maximumRadius; radius += 1) {
		const minX = Math.max(0, boundMinX - radius);
		const maxX = Math.min(image.width - 1, boundMaxX + radius);
		const minY = Math.max(0, boundMinY - radius);
		const maxY = Math.min(image.height - 1, boundMaxY + radius);
		for (let candidateX = minX; candidateX <= maxX; candidateX += 1) {
			const topOffset = (minY * image.width + candidateX) * 4;
			if (image.data[topOffset + 3] >= GEMINI_WATERMARK_LIMITS.alphaThreshold) {
				return topOffset;
			}
			if (maxY !== minY) {
				const bottomOffset = (maxY * image.width + candidateX) * 4;
				if (
					image.data[bottomOffset + 3] >= GEMINI_WATERMARK_LIMITS.alphaThreshold
				) {
					return bottomOffset;
				}
			}
		}
		for (let candidateY = minY + 1; candidateY < maxY; candidateY += 1) {
			const leftOffset = (candidateY * image.width + minX) * 4;
			if (
				image.data[leftOffset + 3] >= GEMINI_WATERMARK_LIMITS.alphaThreshold
			) {
				return leftOffset;
			}
			if (maxX !== minX) {
				const rightOffset = (candidateY * image.width + maxX) * 4;
				if (
					image.data[rightOffset + 3] >= GEMINI_WATERMARK_LIMITS.alphaThreshold
				) {
					return rightOffset;
				}
			}
		}
	}
	return -1;
};

/** 検出した元画像画素を、傾き補正と確定済みグリッドを通した出力座標へ写す。 */
export const clearMappedGeminiWatermark = (
	image: RawImage,
	grid: PixelGrid,
	sourceWidth: number,
	sourceHeight: number,
	sourcePixels: Uint32Array,
	angle: number,
	mode: MappedRemovalMode = "transparent",
): RawImage => {
	if (sourcePixels.length === 0) return image;
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
			? findNearbyBackgroundOffset(
					image,
					mappedMinX,
					mappedMinY,
					mappedMaxX,
					mappedMaxY,
				)
			: -1;
	if (mode === "background" && backgroundOffset < 0) return image;
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
				const offset = (y * image.width + x) * 4;
				data ??= new Uint8ClampedArray(image.data);
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
