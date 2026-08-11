import { GEMINI_WATERMARK_LIMITS } from "../shared/config";
import type { PixelGrid, ProcessResult, RawImage } from "../shared/types";
import type { AutomaticBackgroundResult } from "./background";
import {
	detectBackgroundRamp,
	getBackgroundTargets,
	removeBackground,
} from "./background-removal";
import { extractUsedColors } from "./color-reduction";
import { floodFillTransparent } from "./floodfill";
import {
	clearMappedGeminiWatermark,
	type MappedRemovalMode,
} from "./gemini-watermark-mapping";
import { cloneImage } from "./image-operations";
import type { NormalizedProcessOptions } from "./processor-options";

type SearchRegion = {
	x: number;
	y: number;
	w: number;
	h: number;
};

type Component = {
	id: number;
	size: number;
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	brightPixels: number;
	touchesOutsideRegion: boolean;
};

export type GeminiWatermarkBounds = {
	x: number;
	y: number;
	w: number;
	h: number;
};

export type GeminiWatermarkDetectionResult = {
	removed: boolean;
	removedPixels: number;
	bounds: GeminiWatermarkBounds[];
	/** 元画像上で除去対象になった画素番号。 */
	pixels: Uint32Array;
};

export type GeminiWatermarkRemovalResult = GeminiWatermarkDetectionResult & {
	image: RawImage;
};

const EMPTY_PIXELS = new Uint32Array(0);

const assertSameSize = (image: RawImage, mask: RawImage): void => {
	if (image.width !== mask.width || image.height !== mask.height) {
		throw new Error("Gemini watermark images must have matching dimensions.");
	}
};

const componentWidth = (component: Component): number =>
	component.maxX - component.minX + 1;

const componentHeight = (component: Component): number =>
	component.maxY - component.minY + 1;

const createSearchRegion = (width: number, height: number): SearchRegion => {
	const limits = GEMINI_WATERMARK_LIMITS;
	const minimumDimension = Math.min(width, height);
	const maximumMarkDimension = minimumDimension * limits.maximumDimensionRatio;
	const maximumMargin = minimumDimension * limits.maximumMarginRatio;
	const x = Math.max(
		0,
		Math.floor(
			Math.max(
				width * limits.minimumCenterRatio - maximumMarkDimension / 2,
				width - maximumMargin - maximumMarkDimension - 1,
			),
		),
	);
	const y = Math.max(
		0,
		Math.floor(
			Math.max(
				height * limits.minimumCenterRatio - maximumMarkDimension / 2,
				height - maximumMargin - maximumMarkDimension - 1,
			),
		),
	);
	return { x, y, w: width - x, h: height - y };
};

const analyzeComponents = (
	image: RawImage,
	mask: RawImage,
	region: SearchRegion,
): { labels: Int32Array; components: Component[]; opaquePixels: number } => {
	const labels = new Int32Array(region.w * region.h);
	const queue = new Int32Array(region.w * region.h);
	const components: Component[] = [];
	const alphaThreshold = GEMINI_WATERMARK_LIMITS.alphaThreshold;
	let opaquePixels = 0;
	for (let pixel = 0; pixel < mask.width * mask.height; pixel += 1) {
		if (mask.data[pixel * 4 + 3] >= alphaThreshold) opaquePixels += 1;
	}

	for (let start = 0; start < labels.length; start += 1) {
		const startX = region.x + (start % region.w);
		const startY = region.y + ((start / region.w) | 0);
		const sourcePixel = startY * mask.width + startX;
		if (
			labels[start] !== 0 ||
			mask.data[sourcePixel * 4 + 3] < alphaThreshold
		) {
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
			minX: image.width,
			minY: image.height,
			maxX: 0,
			maxY: 0,
			brightPixels: 0,
			touchesOutsideRegion: false,
		};
		while (read < write) {
			const localPixel = queue[read];
			read += 1;
			const x = region.x + (localPixel % region.w);
			const y = region.y + ((localPixel / region.w) | 0);
			const pixel = y * image.width + x;
			const offset = pixel * 4;
			component.size += 1;
			component.minX = Math.min(component.minX, x);
			component.minY = Math.min(component.minY, y);
			component.maxX = Math.max(component.maxX, x);
			component.maxY = Math.max(component.maxY, y);
			const luminance =
				(77 * image.data[offset] +
					150 * image.data[offset + 1] +
					29 * image.data[offset + 2]) >>
				8;
			if (luminance >= GEMINI_WATERMARK_LIMITS.brightLuminanceMinimum) {
				component.brightPixels += 1;
			}

			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue;
					const neighborX = x + dx;
					const neighborY = y + dy;
					if (
						neighborX < 0 ||
						neighborY < 0 ||
						neighborX >= mask.width ||
						neighborY >= mask.height
					) {
						continue;
					}
					const neighbor = neighborY * mask.width + neighborX;
					if (mask.data[neighbor * 4 + 3] < alphaThreshold) continue;
					const localX = neighborX - region.x;
					const localY = neighborY - region.y;
					if (
						localX < 0 ||
						localY < 0 ||
						localX >= region.w ||
						localY >= region.h
					) {
						component.touchesOutsideRegion = true;
						continue;
					}
					const localNeighbor = localY * region.w + localX;
					if (labels[localNeighbor] !== 0) continue;
					labels[localNeighbor] = id;
					queue[write] = localNeighbor;
					write += 1;
				}
			}
		}
		components.push(component);
	}
	return { labels, components, opaquePixels };
};

const labelAt = (
	labels: Int32Array,
	region: SearchRegion,
	x: number,
	y: number,
): number => labels[(y - region.y) * region.w + x - region.x];

const matchesGeminiShape = (
	component: Component,
	labels: Int32Array,
	region: SearchRegion,
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
		component.touchesOutsideRegion ||
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
			if (labelAt(labels, region, x, y) !== component.id) continue;
			const localX = x - component.minX;
			const localY = y - component.minY;
			const inHorizontalEdge =
				localX < cornerWidth || localX >= width - cornerWidth;
			const inVerticalEdge =
				localY < cornerHeight || localY >= height - cornerHeight;
			if (inHorizontalEdge && inVerticalEdge) cornerPixels += 1;
			const reflectedX = component.minX + component.maxX - x;
			const reflectedY = component.minY + component.maxY - y;
			if (labelAt(labels, region, reflectedX, y) === component.id) {
				horizontalMatches += 1;
			}
			if (labelAt(labels, region, x, reflectedY) === component.id) {
				verticalMatches += 1;
			}
		}
	}
	return (
		cornerPixels / component.size <= limits.maximumCornerPixelRatio &&
		horizontalMatches / component.size >= limits.minimumSymmetryRatio &&
		verticalMatches / component.size >= limits.minimumSymmetryRatio
	);
};

/**
 * 背景マスク上で右下に独立している Gemini の星形だけを検出する。
 * [Intended] 主体と接触したマークは探索領域外へ接続するか寸法条件から外れるため補完しない。
 */
export const detectGeminiWatermark = (
	image: RawImage,
	transparencyMask: RawImage = image,
): GeminiWatermarkDetectionResult => {
	assertSameSize(image, transparencyMask);
	if (
		Math.min(image.width, image.height) <
		GEMINI_WATERMARK_LIMITS.minimumImageDimension
	) {
		return {
			removed: false,
			removedPixels: 0,
			bounds: [],
			pixels: EMPTY_PIXELS,
		};
	}
	const region = createSearchRegion(image.width, image.height);
	const { labels, components, opaquePixels } = analyzeComponents(
		image,
		transparencyMask,
		region,
	);
	const removeById = new Uint8Array(components.length + 1);
	let removedPixelCapacity = 0;
	for (let index = 0; index < components.length; index += 1) {
		const component = components[index];
		if (
			opaquePixels <
			component.size * (GEMINI_WATERMARK_LIMITS.minimumSubjectSizeRatio + 1)
		) {
			continue;
		}
		if (
			matchesGeminiShape(component, labels, region, image.width, image.height)
		) {
			removeById[component.id] = 1;
			removedPixelCapacity += component.size;
		}
	}
	if (removedPixelCapacity === 0) {
		return {
			removed: false,
			removedPixels: 0,
			bounds: [],
			pixels: EMPTY_PIXELS,
		};
	}

	const pixels = new Uint32Array(removedPixelCapacity);
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
		for (let y = component.minY; y <= component.maxY; y += 1) {
			for (let x = component.minX; x <= component.maxX; x += 1) {
				if (labelAt(labels, region, x, y) !== component.id) continue;
				const pixel = y * image.width + x;
				pixels[removedPixels] = pixel;
				removedPixels += 1;
			}
		}
	}
	return {
		removed: true,
		removedPixels,
		bounds,
		pixels,
	};
};

/** 検出した Gemini ウォーターマーク成分だけを透明化した画像を返す。 */
export const removeGeminiWatermark = (
	image: RawImage,
	transparencyMask: RawImage = image,
): GeminiWatermarkRemovalResult => {
	const detection = detectGeminiWatermark(image, transparencyMask);
	if (!detection.removed) return { ...detection, image };
	const data = new Uint8ClampedArray(image.data);
	for (let index = 0; index < detection.pixels.length; index += 1) {
		const offset = detection.pixels[index] * 4;
		data[offset] = 0;
		data[offset + 1] = 0;
		data[offset + 2] = 0;
		data[offset + 3] = 0;
	}
	return {
		...detection,
		image: { width: image.width, height: image.height, data },
	};
};

export type GeminiWatermarkDetectionMask = {
	image: RawImage;
	mode: MappedRemovalMode;
};

/** 処理本体が採用した背景条件を再利用し、透かしの独立性を判定するマスクを返す。 */
export const createGeminiWatermarkDetectionMask = (
	inputImage: RawImage,
	options: NormalizedProcessOptions,
	automaticBackground: AutomaticBackgroundResult | undefined,
	getProcessedBackgroundMask: () => RawImage,
): GeminiWatermarkDetectionMask => {
	if (
		(!options.preRemoveBackground && !options.postRemoveBackground) ||
		options.bgRemovalScope === "off" ||
		options.bgExtractionMethod === "none"
	) {
		// [Intended] 入力が既に透過済みなら、背景除去設定が無効でもそのアルファを根拠に判定する。
		return { image: inputImage, mode: "transparent" };
	}
	if (
		options.bgExtractionMethod === "auto" &&
		automaticBackground &&
		!automaticBackground.rolledBack
	) {
		return { image: automaticBackground.image, mode: "transparent" };
	}
	if (options.bgExtractionMethod !== "auto") {
		// [Intended] selected / outer / all の違いを処理本体と同じマスクで尊重する。
		return { image: getProcessedBackgroundMask(), mode: "transparent" };
	}

	// [Intended] Auto が背景面積の大きさだけでロールバックした場合も、右下の星形が
	// 角背景から独立しているかは保守的な単一角マスクで判定する。
	const method = "top-left" as const;
	if (automaticBackground) {
		// [Intended] 検出マスクは後続処理より先に作るため、Auto 背景除去の結果を保持する。
		// ここで共有画像を透過化すると、後続の背景除去経路まで意図せず変わってしまう。
		const detectionMask = cloneImage(automaticBackground.image);
		floodFillTransparent(
			detectionMask,
			0,
			0,
			options.backgroundTolerance,
			undefined,
			options.bgConnectivity,
			detectBackgroundRamp(inputImage, options.backgroundTolerance),
		);
		return { image: detectionMask, mode: "background" };
	}
	return {
		image: removeBackground(
			inputImage,
			options.backgroundTolerance,
			options.bgRemovalScope,
			options.bgConnectivity,
			getBackgroundTargets(inputImage, method, options.bgRgb),
			method,
		),
		// [Intended] 確定出力が不透明なロールバック時は、透明穴ではなく周囲の背景色へ置換する。
		mode: "background",
	};
};

/** Auto 判定へ渡す作業画像から、検出済みの透かし成分を元画像座標で除外する。 */
export const clearGeminiWatermarkFromWorkingImage = (
	detectionMask: RawImage,
	workingImage: RawImage,
	sourcePixels: Uint32Array,
	mode: MappedRemovalMode,
): RawImage => {
	if (sourcePixels.length === 0) return workingImage;
	const grid: PixelGrid = {
		cellW: 1,
		cellH: 1,
		offsetX: 0,
		offsetY: 0,
		outW: workingImage.width,
		outH: workingImage.height,
		cropX: 0,
		cropY: 0,
		cropW: workingImage.width,
		cropH: workingImage.height,
		score: 0,
	};
	return clearMappedGeminiWatermark(
		workingImage,
		detectionMask,
		grid,
		sourcePixels,
		mode,
	);
};

/** 確定済みの処理結果へ透かし除去だけを適用し、経路選択と出力形状を保持する。 */
export const applyGeminiWatermarkRemoval = (
	removal: GeminiWatermarkDetectionResult,
	detectionMask: RawImage,
	processed: ProcessResult,
	options: NormalizedProcessOptions,
	mode: MappedRemovalMode,
): ProcessResult => {
	if (options.geminiWatermarkRemoval === "off") {
		return processed;
	}
	if (!removal.removed) return processed;

	// [Intended] 作業画像で先に除去しても補間後に残り得る対象セルを、確定座標でも除去する。
	const result = clearMappedGeminiWatermark(
		processed.result,
		detectionMask,
		processed.grid,
		removal.pixels,
		mode,
	);
	const compareBeforeSanitized = clearMappedGeminiWatermark(
		processed.compareBeforeSanitized,
		detectionMask,
		processed.grid,
		removal.pixels,
		mode,
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
