import { GEMINI_WATERMARK_LIMITS } from "../shared/config";
import type { PixelGrid, ProcessResult, RawImage } from "../shared/types";
import { getBackgroundTargets, removeBackground } from "./background-removal";
import { extractUsedColors } from "./color-reduction";
import type { NormalizedProcessOptions } from "./processor-options";

type Component = {
	id: number;
	size: number;
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	brightPixels: number;
};

export type GeminiWatermarkRemovalResult = {
	image: RawImage;
	removed: boolean;
	removedPixels: number;
	bounds: GeminiWatermarkBounds[];
};

export type GeminiWatermarkBounds = {
	x: number;
	y: number;
	w: number;
	h: number;
};

const assertSameSize = (image: RawImage, mask: RawImage): void => {
	if (image.width !== mask.width || image.height !== mask.height) {
		throw new Error("Gemini watermark images must have matching dimensions.");
	}
};

const componentWidth = (component: Component): number =>
	component.maxX - component.minX + 1;

const componentHeight = (component: Component): number =>
	component.maxY - component.minY + 1;

const analyzeComponents = (
	image: RawImage,
	mask: RawImage,
): { labels: Int32Array; components: Component[] } => {
	const width = mask.width;
	const height = mask.height;
	const pixelCount = width * height;
	const labels = new Int32Array(pixelCount);
	const queue = new Int32Array(pixelCount);
	const components: Component[] = [];
	const alphaThreshold = GEMINI_WATERMARK_LIMITS.alphaThreshold;

	for (let start = 0; start < pixelCount; start += 1) {
		if (labels[start] !== 0 || mask.data[start * 4 + 3] < alphaThreshold) {
			continue;
		}
		const id = components.length + 1;
		let read = 0;
		let write = 1;
		queue[0] = start;
		labels[start] = id;
		const component: Component = {
			id,
			size: 0,
			minX: width,
			minY: height,
			maxX: 0,
			maxY: 0,
			brightPixels: 0,
		};
		while (read < write) {
			const pixel = queue[read];
			read += 1;
			const x = pixel % width;
			const y = (pixel / width) | 0;
			const offset = pixel * 4;
			component.size += 1;
			component.minX = Math.min(component.minX, x);
			component.minY = Math.min(component.minY, y);
			component.maxX = Math.max(component.maxX, x);
			component.maxY = Math.max(component.maxY, y);
			const red = image.data[offset];
			const green = image.data[offset + 1];
			const blue = image.data[offset + 2];
			const luminance = (77 * red + 150 * green + 29 * blue) >> 8;
			if (luminance >= GEMINI_WATERMARK_LIMITS.brightLuminanceMinimum) {
				component.brightPixels += 1;
			}

			const xStart = x > 0 ? -1 : 0;
			const xEnd = x + 1 < width ? 1 : 0;
			const yStart = y > 0 ? -1 : 0;
			const yEnd = y + 1 < height ? 1 : 0;
			for (let dy = yStart; dy <= yEnd; dy += 1) {
				for (let dx = xStart; dx <= xEnd; dx += 1) {
					if (dx === 0 && dy === 0) continue;
					const neighbor = pixel + dy * width + dx;
					if (
						labels[neighbor] === 0 &&
						mask.data[neighbor * 4 + 3] >= alphaThreshold
					) {
						labels[neighbor] = id;
						queue[write] = neighbor;
						write += 1;
					}
				}
			}
		}
		components.push(component);
	}
	return { labels, components };
};

const matchesGeminiShape = (
	component: Component,
	labels: Int32Array,
	imageWidth: number,
	imageHeight: number,
): boolean => {
	const limits = GEMINI_WATERMARK_LIMITS;
	const width = componentWidth(component);
	const height = componentHeight(component);
	const minimumImageDimension = Math.min(imageWidth, imageHeight);
	const minimumDimension = minimumImageDimension * limits.minimumDimensionRatio;
	const maximumDimension = minimumImageDimension * limits.maximumDimensionRatio;
	const aspectRatio = Math.max(width, height) / Math.min(width, height);
	const centerX = (component.minX + component.maxX + 1) / 2;
	const centerY = (component.minY + component.maxY + 1) / 2;
	const rightMargin = imageWidth - component.maxX - 1;
	const bottomMargin = imageHeight - component.maxY - 1;
	const minimumMargin = minimumImageDimension * limits.minimumMarginRatio;
	const maximumMargin = minimumImageDimension * limits.maximumMarginRatio;
	const fillRatio = component.size / (width * height);
	const brightPixelRatio = component.brightPixels / component.size;

	if (
		component.size < limits.minimumComponentPixels ||
		width < minimumDimension ||
		height < minimumDimension ||
		width > maximumDimension ||
		height > maximumDimension ||
		aspectRatio > limits.maximumAspectRatio ||
		centerX < imageWidth * limits.minimumCenterRatio ||
		centerY < imageHeight * limits.minimumCenterRatio ||
		rightMargin < minimumMargin ||
		bottomMargin < minimumMargin ||
		rightMargin > maximumMargin ||
		bottomMargin > maximumMargin ||
		fillRatio < limits.minimumFillRatio ||
		fillRatio > limits.maximumFillRatio ||
		brightPixelRatio < limits.minimumBrightPixelRatio
	) {
		return false;
	}

	const cornerWidth = Math.max(1, Math.floor(width * limits.cornerSizeRatio));
	const cornerHeight = Math.max(1, Math.floor(height * limits.cornerSizeRatio));
	let cornerPixels = 0;
	let horizontalMatches = 0;
	let verticalMatches = 0;
	for (let y = component.minY; y <= component.maxY; y += 1) {
		for (let x = component.minX; x <= component.maxX; x += 1) {
			const pixel = y * imageWidth + x;
			if (labels[pixel] !== component.id) continue;
			const localX = x - component.minX;
			const localY = y - component.minY;
			const inHorizontalEdge =
				localX < cornerWidth || localX >= width - cornerWidth;
			const inVerticalEdge =
				localY < cornerHeight || localY >= height - cornerHeight;
			if (inHorizontalEdge && inVerticalEdge) cornerPixels += 1;
			const reflectedX = component.minX + component.maxX - x;
			const reflectedY = component.minY + component.maxY - y;
			if (labels[y * imageWidth + reflectedX] === component.id) {
				horizontalMatches += 1;
			}
			if (labels[reflectedY * imageWidth + x] === component.id) {
				verticalMatches += 1;
			}
		}
	}
	const cornerRatio = cornerPixels / component.size;
	const horizontalSymmetry = horizontalMatches / component.size;
	const verticalSymmetry = verticalMatches / component.size;
	return (
		cornerRatio <= limits.maximumCornerPixelRatio &&
		horizontalSymmetry >= limits.minimumSymmetryRatio &&
		verticalSymmetry >= limits.minimumSymmetryRatio
	);
};

/**
 * 背景透過後に右下で独立している Gemini の星形だけを除去する。
 * [Intended] 主体と接触したマークは同じ連結成分になり、寸法条件から外れるため補完しない。
 */
export const removeGeminiWatermark = (
	image: RawImage,
	transparencyMask: RawImage = image,
): GeminiWatermarkRemovalResult => {
	assertSameSize(image, transparencyMask);
	if (
		Math.min(image.width, image.height) <
		GEMINI_WATERMARK_LIMITS.minimumImageDimension
	) {
		return { image, removed: false, removedPixels: 0, bounds: [] };
	}
	const { labels, components } = analyzeComponents(image, transparencyMask);
	let largestSize = 0;
	for (let index = 0; index < components.length; index += 1) {
		largestSize = Math.max(largestSize, components[index].size);
	}
	const removeById = new Uint8Array(components.length + 1);
	let matched = false;
	for (let index = 0; index < components.length; index += 1) {
		const component = components[index];
		if (
			largestSize <
			component.size * GEMINI_WATERMARK_LIMITS.minimumSubjectSizeRatio
		) {
			continue;
		}
		if (matchesGeminiShape(component, labels, image.width, image.height)) {
			removeById[component.id] = 1;
			matched = true;
		}
	}
	if (!matched) {
		return { image, removed: false, removedPixels: 0, bounds: [] };
	}

	const data = new Uint8ClampedArray(image.data);
	const bounds: GeminiWatermarkBounds[] = [];
	let removedPixels = 0;
	for (let index = 0; index < components.length; index += 1) {
		const component = components[index];
		if (removeById[component.id] === 0) continue;
		bounds.push({
			x: component.minX,
			y: component.minY,
			w: componentWidth(component),
			h: componentHeight(component),
		});
		// [Intended] 透かしの弱い外縁は背景マスクで透明側へ分類されるため、
		// 検出した星形の BBox 全体を落としてダウンサンプリング後の点状残りを防ぐ。
		for (let y = component.minY; y <= component.maxY; y += 1) {
			for (let x = component.minX; x <= component.maxX; x += 1) {
				const alphaOffset = (y * image.width + x) * 4 + 3;
				if (data[alphaOffset] === 0) continue;
				data[alphaOffset] = 0;
				removedPixels += 1;
			}
		}
	}
	return {
		image: { width: image.width, height: image.height, data },
		removed: true,
		removedPixels,
		bounds,
	};
};

/** 検出した元画像座標の領域を、確定済みグリッドで出力座標へ写して透明化する。 */
export const clearMappedGeminiWatermarks = (
	image: RawImage,
	grid: PixelGrid,
	bounds: GeminiWatermarkBounds[],
): RawImage => {
	if (bounds.length === 0 || grid.angle) return image;
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	let data: Uint8ClampedArray | undefined;
	for (let index = 0; index < bounds.length; index += 1) {
		const bound = bounds[index];
		const minX = Math.max(0, Math.floor((bound.x - cropX) / grid.cellW));
		const minY = Math.max(0, Math.floor((bound.y - cropY) / grid.cellH));
		const maxX = Math.min(
			image.width - 1,
			Math.ceil((bound.x + bound.w - cropX) / grid.cellW) - 1,
		);
		const maxY = Math.min(
			image.height - 1,
			Math.ceil((bound.y + bound.h - cropY) / grid.cellH) - 1,
		);
		if (minX > maxX || minY > maxY) continue;
		data ??= new Uint8ClampedArray(image.data);
		for (let y = minY; y <= maxY; y += 1) {
			for (let x = minX; x <= maxX; x += 1) {
				const offset = (y * image.width + x) * 4;
				data[offset] = 0;
				data[offset + 1] = 0;
				data[offset + 2] = 0;
				data[offset + 3] = 0;
			}
		}
	}
	return data ? { width: image.width, height: image.height, data } : image;
};

/** 確定済みの処理結果へ透かし除去だけを適用し、経路選択と出力形状を保持する。 */
export const applyGeminiWatermarkRemoval = (
	inputImage: RawImage,
	processed: ProcessResult,
	options: NormalizedProcessOptions,
): ProcessResult => {
	if (
		options.geminiWatermarkRemoval === "off" ||
		!options.postRemoveBackground ||
		options.bgRemovalScope === "off" ||
		options.bgExtractionMethod === "none"
	) {
		return processed;
	}
	const detectionMethod =
		options.bgExtractionMethod === "auto"
			? ("top-left" as const)
			: options.bgExtractionMethod;
	const detectionMask = removeBackground(
		inputImage,
		options.backgroundTolerance,
		"outer",
		options.bgConnectivity,
		getBackgroundTargets(inputImage, detectionMethod, options.bgRgb),
		detectionMethod,
	);
	const removal = removeGeminiWatermark(inputImage, detectionMask);
	if (!removal.removed) return processed;

	// [Intended] 検出・分類・トリミングの結果は透かし除去前のまま保ち、
	// 確定した出力座標だけを透明化して Auto の経路選択やキャンバス寸法を変えない。
	const result = clearMappedGeminiWatermarks(
		processed.result,
		processed.grid,
		removal.bounds,
	);
	const compareBeforeSanitized = clearMappedGeminiWatermarks(
		processed.compareBeforeSanitized,
		processed.grid,
		removal.bounds,
	);
	options.debugHook?.("99-watermark-removed", result, {
		removedPixels: removal.removedPixels,
	});
	return {
		...processed,
		result,
		compareBeforeSanitized,
		extractedPalette: extractUsedColors(result),
	};
};
