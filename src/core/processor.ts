import {
	clampInt,
	clampOptionalInt,
	PROCESS_ANALYSIS_THRESHOLDS,
	PROCESS_DEFAULTS,
	PROCESS_RANGES,
	RETRO_PALETTES,
} from "../shared/config";
import type {
	BackgroundRemovalScope,
	Connectivity,
	DitherMode,
	OutlineStyle,
	PixelData,
	PixelGrid,
	ProcessingAnalysis,
	ProcessingRoute,
	ProcessingWarningCode,
	ProcessResult,
	RawImage,
	RGB,
} from "../shared/types";

export type { ProcessResult } from "../shared/types";

import { type DetectOptions, detectGrid } from "./detector";
import { floodFillTransparent } from "./floodfill";
import { applyOutline } from "./outline";
import { OklabKMeans, PaletteQuantizer } from "./quantizer";

const cloneImage = (img: RawImage): RawImage => ({
	width: img.width,
	height: img.height,
	data: new Uint8ClampedArray(img.data),
});

const medianOf = (values: number[]): number => {
	const n = values.length;
	if (n === 0) return 0;
	// Sort in-place as it doesn't affect the result (only median is needed).
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

	// Reuse arrays to avoid allocation for each pixel (keep value sequence and order).
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
 * Simple point sampling (Nearest Neighbor) to resize image for comparison.
 * Unlike `downsample`, this does not perform median filtering,
 * preserving original anti-aliasing and noise for visual comparison.
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
 * Nearest-neighbor resize of a cropped region for comparison view.
 * This avoids smoothing and avoids any median/color aggregation
 * (i.e. no "dot sanitize").
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

	// Avoid division by zero
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
		// Center-of-pixel mapping then nearest neighbor
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

const cropRawImageNearestFromGrid = (
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

	// Use cropW/cropH as output size to preserve original resolution
	return resizeRawImageNearest(img, cropX, cropY, cropW, cropH, cropW, cropH);
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const foregroundRatio = (img: RawImage, alphaThreshold: number): number => {
	const pixelCount = img.width * img.height;
	if (pixelCount === 0) return 0;
	let foregroundCount = 0;
	for (let i = 3; i < img.data.length; i += 4) {
		if (img.data[i] >= alphaThreshold) foregroundCount += 1;
	}
	return foregroundCount / pixelCount;
};

const getAxisAgreement = (grid: PixelGrid): number => {
	if (grid.detectionFailedAxes && grid.detectionFailedAxes.length > 0) return 0;
	if (grid.scoreX === undefined || grid.scoreY === undefined) return 1;
	const denominator = Math.abs(grid.scoreX) + Math.abs(grid.scoreY) + 1;
	return clampUnit(1 - Math.abs(grid.scoreX - grid.scoreY) / denominator);
};

const getGridConfidence = (grid: PixelGrid, route: ProcessingRoute): number => {
	if (route !== "refine") return 1;
	const scoreConfidence =
		1 /
		(1 + Math.max(0, grid.score) / PROCESS_ANALYSIS_THRESHOLDS.gridScoreScale);
	return clampUnit(scoreConfidence * getAxisAgreement(grid));
};

const toCandidateReport = (
	grid: PixelGrid,
	source: RawImage,
	route: ProcessingRoute,
	method: string,
) => {
	const outW =
		grid.outW ??
		Math.max(1, Math.floor((source.width - grid.offsetX) / grid.cellW));
	const outH =
		grid.outH ??
		Math.max(1, Math.floor((source.height - grid.offsetY) / grid.cellH));
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const cropW = grid.cropW ?? outW * grid.cellW;
	const cropH = grid.cropH ?? outH * grid.cellH;
	const axisAgreement = getAxisAgreement(grid);
	const { candidates: _candidates, ...reportGrid } = grid;

	return {
		grid: reportGrid,
		outW,
		outH,
		cropX,
		cropY,
		cropW,
		cropH,
		method,
		totalScore: grid.score,
		confidence: getGridConfidence(grid, route),
		subscores: { axisAgreement },
	};
};

const createProcessingAnalysis = (
	source: RawImage,
	result: RawImage,
	grid: PixelGrid,
	route: ProcessingRoute,
	method: string,
	alphaThreshold: number,
): ProcessingAnalysis => {
	const selected = toCandidateReport(grid, source, route, method);
	const gridCandidates = [selected];
	if (grid.candidates) {
		for (const candidate of grid.candidates) {
			const report = toCandidateReport(candidate, source, route, method);
			const isSelected =
				report.outW === selected.outW &&
				report.outH === selected.outH &&
				report.totalScore === selected.totalScore;
			if (!isSelected) gridCandidates.push(report);
		}
	}

	const before = foregroundRatio(source, alphaThreshold);
	const after = foregroundRatio(result, alphaThreshold);
	const contentLossRatio =
		before === 0 ? 0 : clampUnit((before - after) / before);
	const warnings: ProcessingWarningCode[] = [];
	if (before === 0) warnings.push("NO_CONTENT");
	if (
		route === "refine" &&
		selected.confidence < PROCESS_ANALYSIS_THRESHOLDS.lowGridConfidence
	) {
		warnings.push("LOW_GRID_CONFIDENCE");
	}
	if (grid.detectionFailedAxes?.length === 1) {
		warnings.push("ONE_AXIS_DETECTION_FAILED");
	}
	if (contentLossRatio > PROCESS_ANALYSIS_THRESHOLDS.contentLossRatio) {
		warnings.push("CONTENT_LOSS_RISK");
	}
	if (
		result.width > PROCESS_ANALYSIS_THRESHOLDS.extremeOutputDimension ||
		result.height > PROCESS_ANALYSIS_THRESHOLDS.extremeOutputDimension
	) {
		warnings.push("EXTREME_OUTPUT_SIZE");
	}

	return {
		route,
		confidence: selected.confidence,
		warnings,
		gridCandidates,
		selectedCandidateIndex: 0,
		foregroundRatioBefore: before,
		foregroundRatioAfter: after,
		contentLossRatio,
	};
};

export type ProcessOptions = DetectOptions & {
	preRemoveBackground?: boolean;
	postRemoveBackground?: boolean;
	/**
	 * Force conversion to the specified pixel size (W x H) after trimming with content BBox.
	 * When enabled, automatic grid detection (detectGrid) is not performed.
	 *
	 * Note:
	 * - Conditions: both forcePixelsW/H must be specified.
	 * - If upscaling is needed, nearest neighbor (sampleWindow=1) is used.
	 */
	forcePixelsW?: number;
	forcePixelsH?: number;
	/**
	 * Use the specified pixel size (W x H) as a "hint" to start automatic grid estimation with a precise search from its neighborhood.
	 * Unlike full pixel specification (forcePixelsW/H), automatic detection is still performed.
	 *
	 * Note:
	 * - Conditions: both hintPixelsW/H must be specified.
	 * - Mainly used as a starting point for autoGridFromTrimmed search.
	 */
	hintPixelsW?: number;
	hintPixelsH?: number;
	/**
	 * Scope of background removal (off/selected/outer/all)
	 * For RGB specification + selected, it is automatically treated as outer.
	 */
	bgRemovalScope?: BackgroundRemovalScope;
	/**
	 * Whether to include diagonals (8-neighbors) in connectivity search.
	 */
	bgConnectivity?: Connectivity;
	backgroundTolerance?: number;
	sampleWindow?: number;
	trimToContent?: boolean;
	trimAlphaThreshold?: number;
	/**
	 * Maximum number of pixels to consider as target for removal (original image pixels).
	 * If 0, skip removal of floating noise.
	 */
	floatingMaxPixels?: number;
	/**
	 * When trimToContent=true, estimate the output grid (outW/outH) from the background removed -> BBox cropped area.
	 */
	autoGridFromTrimmed?: boolean;
	/**
	 * Speed up grid estimation for autoGridFromTrimmed (may affect results).
	 * If OFF, use legacy search logic.
	 *
	 * Default: true
	 */
	fastAutoGridFromTrimmed?: boolean;
	/**
	 * Enable grid detection and downsampling (default ON).
	 * If OFF, skip grid detection and downsampling (for same-size pixel art).
	 * Background trimming and transparency are still applied.
	 */
	enableGridDetection?: boolean;
	/**
	 * Fill the shorter side with transparent pixels to make the image square
	 */
	makeSquare?: boolean;
	/**
	 * Pad the output with transparent pixels to preserve the source aspect ratio
	 */
	keepAspectRatio?: boolean;
	/**
	 * Enable color reduction.
	 */
	reduceColors?: boolean;
	/**
	 * Color reduction mode
	 */
	reduceColorMode?: string;
	/**
	 * Dithering mode
	 */
	ditherMode?: DitherMode;
	/**
	 * Number of colors after reduction.
	 */
	colorCount?: number;
	/**
	 * Dithering strength (0-100). If 0, no dithering.
	 */
	ditherStrength?: number;
	/**
	 * Fixed palette
	 */
	fixedPalette?: RGB[];
	/**
	 * Background extraction method
	 */
	bgExtractionMethod?:
		| "none"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb";
	/**
	 * Background color for RGB specification (#rrggbb)
	 */
	bgRgb?: string;
	outlineStyle?: OutlineStyle;
	outlineColor?: RGB;
	/**
	 * Hook to extract intermediate images for debugging.
	 * To work in browser environment, PNG export, etc., should be performed on the calling side.
	 */
	debugHook?: (
		name: string,
		img: RawImage,
		meta?: Record<string, unknown>,
	) => void;
};

const getGlobalDebugHook = (): ProcessOptions["debugHook"] | undefined => {
	const g = globalThis as unknown as {
		__PIXEL_REFINER_DEBUG_HOOK__?: unknown;
	};
	const hook = g.__PIXEL_REFINER_DEBUG_HOOK__;
	return typeof hook === "function"
		? (hook as ProcessOptions["debugHook"])
		: undefined;
};

const normalizeProcessOptions = (
	options: ProcessOptions | undefined,
): {
	detect: DetectOptions;
	preRemoveBackground: boolean;
	postRemoveBackground: boolean;
	forcePixelsW?: number;
	forcePixelsH?: number;
	hintPixelsW?: number;
	hintPixelsH?: number;
	bgRemovalScope: BackgroundRemovalScope;
	bgConnectivity: Connectivity;
	backgroundTolerance: number;
	sampleWindow: number;
	trimToContent: boolean;
	trimAlphaThreshold: number;
	autoGridFromTrimmed: boolean;
	fastAutoGridFromTrimmed: boolean;
	enableGridDetection: boolean;
	makeSquare: boolean;
	keepAspectRatio: boolean;
	reduceColors: boolean;
	reduceColorMode: string;
	ditherMode: DitherMode;
	colorCount: number;
	ditherStrength: number;
	fixedPalette?: RGB[];
	outlineStyle: OutlineStyle;
	outlineColor: RGB;
	floatingMaxPixels: number;
	bgExtractionMethod:
		| "none"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb";
	bgRgb?: string;
	debug?: boolean;
	debugHook?: ProcessOptions["debugHook"];
} => {
	const raw = options ?? {};
	const debug = raw.debug ?? PROCESS_DEFAULTS.debug;
	const debugHook = raw.debugHook ?? (debug ? getGlobalDebugHook() : undefined);

	const detect: DetectOptions = {
		...raw,
		detectionQuantStep: clampInt(
			raw.detectionQuantStep ?? PROCESS_RANGES.detectionQuantStep.default,
			PROCESS_RANGES.detectionQuantStep,
		),
	};

	const preRemoveBackground =
		raw.preRemoveBackground ?? PROCESS_DEFAULTS.preRemoveBackground;
	const postRemoveBackground =
		raw.postRemoveBackground ?? PROCESS_DEFAULTS.postRemoveBackground;
	const forcePixelsW = clampOptionalInt(
		raw.forcePixelsW,
		PROCESS_RANGES.forcePixelsW,
	);
	const forcePixelsH = clampOptionalInt(
		raw.forcePixelsH,
		PROCESS_RANGES.forcePixelsH,
	);
	const hintPixelsW = clampOptionalInt(
		raw.hintPixelsW,
		PROCESS_RANGES.forcePixelsW,
	);
	const hintPixelsH = clampOptionalInt(
		raw.hintPixelsH,
		PROCESS_RANGES.forcePixelsH,
	);
	const bgRemovalScope = raw.bgRemovalScope ?? PROCESS_DEFAULTS.bgRemovalScope;
	const bgConnectivity = raw.bgConnectivity ?? PROCESS_DEFAULTS.bgConnectivity;
	const backgroundTolerance = clampInt(
		raw.backgroundTolerance ?? PROCESS_RANGES.backgroundTolerance.default,
		PROCESS_RANGES.backgroundTolerance,
	);
	const sampleWindow = clampInt(
		raw.sampleWindow ?? PROCESS_RANGES.sampleWindow.default,
		PROCESS_RANGES.sampleWindow,
	);
	const trimToContent = raw.trimToContent ?? PROCESS_DEFAULTS.trimToContent;
	const trimAlphaThreshold = clampInt(
		raw.trimAlphaThreshold ?? PROCESS_RANGES.trimAlphaThreshold.default,
		PROCESS_RANGES.trimAlphaThreshold,
	);
	const autoGridFromTrimmed =
		raw.autoGridFromTrimmed ?? PROCESS_DEFAULTS.autoGridFromTrimmed;
	const fastAutoGridFromTrimmed =
		raw.fastAutoGridFromTrimmed ?? PROCESS_DEFAULTS.fastAutoGridFromTrimmed;
	const makeSquare = raw.makeSquare ?? PROCESS_DEFAULTS.makeSquare;
	const keepAspectRatio =
		raw.keepAspectRatio ?? PROCESS_DEFAULTS.keepAspectRatio;
	const enableGridDetection =
		raw.enableGridDetection ?? PROCESS_DEFAULTS.enableGridDetection;
	const reduceColors = raw.reduceColors ?? PROCESS_DEFAULTS.reduceColors;
	const reduceColorMode =
		raw.reduceColorMode ?? PROCESS_DEFAULTS.reduceColorMode;
	const ditherMode = raw.ditherMode ?? PROCESS_DEFAULTS.ditherMode;
	const colorCount = clampInt(
		raw.colorCount ?? PROCESS_DEFAULTS.colorCount,
		PROCESS_RANGES.colorCount,
	);
	const ditherStrength = clampInt(
		raw.ditherStrength ?? PROCESS_DEFAULTS.ditherStrength,
		PROCESS_RANGES.ditherStrength,
	);

	const outlineStyle = raw.outlineStyle ?? PROCESS_DEFAULTS.outlineStyle;
	const outlineColor = raw.outlineColor ?? PROCESS_DEFAULTS.outlineColor;

	const floatingMaxPixels = clampInt(
		raw.floatingMaxPixels ?? PROCESS_DEFAULTS.floatingMaxPixels,
		PROCESS_RANGES.floatingMaxPixels,
	);
	const bgExtractionMethod = raw.bgExtractionMethod ?? "top-left";
	const bgRgb = raw.bgRgb;

	return {
		detect,
		preRemoveBackground,
		postRemoveBackground,
		forcePixelsW,
		forcePixelsH,
		hintPixelsW,
		hintPixelsH,
		bgRemovalScope,
		bgConnectivity,
		backgroundTolerance,
		sampleWindow,
		trimToContent,
		trimAlphaThreshold,
		autoGridFromTrimmed,
		fastAutoGridFromTrimmed,
		enableGridDetection,
		makeSquare,
		keepAspectRatio,
		reduceColors,
		reduceColorMode,
		ditherMode,
		colorCount,
		ditherStrength,
		fixedPalette: raw.fixedPalette,
		outlineStyle,
		outlineColor,

		floatingMaxPixels,
		bgExtractionMethod,
		bgRgb,
		debug,
		debugHook,
	};
};

const isCandidate = (
	r: number,
	g: number,
	b: number,
	bgTargets: Array<[number, number, number]>,
	tolerance: number,
): boolean => {
	for (const [tr, tg, tb] of bgTargets) {
		if (
			Math.abs(r - tr) <= tolerance &&
			Math.abs(g - tg) <= tolerance &&
			Math.abs(b - tb) <= tolerance
		) {
			return true;
		}
	}
	return false;
};

const getBorderPixels = (w: number, h: number): Array<[number, number]> => {
	const out: Array<[number, number]> = [];
	for (let x = 0; x < w; x += 1) {
		out.push([x, 0]);
		if (h > 1) out.push([x, h - 1]);
	}
	for (let y = 1; y < h - 1; y += 1) {
		out.push([0, y]);
		if (w > 1) out.push([w - 1, y]);
	}
	return out;
};

/**
 * Legacy-compatible background removal by flood fill.
 *
 * - Corner methods: flood fill from the selected corner (seed-color tolerance).
 * - RGB method: scan pixels near the specified RGB and flood fill from those seeds.
 *
 * Note: connectivity is configurable here, but legacy default was effectively 4-way.
 */
const removeBackgroundByFloodFillLegacy = (
	img: RawImage,
	tolerance: number,
	connectivity: Connectivity,
	bgTargets: Array<[number, number, number]>,
	method:
		| "none"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb",
): RawImage => {
	if (method === "none") return cloneImage(img);

	const out = cloneImage(img);
	const w = img.width;
	const h = img.height;

	// RGB: scan all pixels and use matched pixels as flood-fill seeds.
	// Use a shared visited map to avoid redundant flood fills (legacy behavior).
	if (method === "rgb") {
		if (bgTargets.length === 0) return out;
		const visited = new Uint8Array(w * h);
		const src32 = new Uint32Array(img.data.buffer);
		for (let y = 0; y < h; y += 1) {
			const row = y * w;
			for (let x = 0; x < w; x += 1) {
				const idx = row + x;
				if (visited[idx]) continue;

				const pixel = src32[idx];
				const r = pixel & 0xff;
				const g = (pixel >> 8) & 0xff;
				const b = (pixel >> 16) & 0xff;

				if (isCandidate(r, g, b, bgTargets, tolerance)) {
					const a = out.data[idx * 4 + 3];
					if (a !== 0) {
						floodFillTransparent(out, x, y, tolerance, visited, connectivity);
					}
				}
				visited[idx] = 1;
			}
		}
		return out;
	}

	// Corner methods: flood fill from the selected corner only (legacy behavior).
	let sx = 0;
	let sy = 0;
	if (method === "bottom-left") {
		sy = h - 1;
	} else if (method === "top-right") {
		sx = w - 1;
	} else if (method === "bottom-right") {
		sx = w - 1;
		sy = h - 1;
	}
	floodFillTransparent(out, sx, sy, tolerance, undefined, connectivity);
	return out;
};

const removeBackground = (
	img: RawImage,
	tolerance: number,
	bgRemovalScope: BackgroundRemovalScope,
	bgConnectivity: Connectivity,
	bgTargets: Array<[number, number, number]>,
	method:
		| "none"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb",
): RawImage => {
	if (method === "none") return cloneImage(img);
	if (bgRemovalScope === "off") return cloneImage(img);

	// 4/8 connectivity is only valid for selected / outer.
	if (bgRemovalScope === "selected") {
		return removeBackgroundByFloodFillLegacy(
			img,
			tolerance,
			bgConnectivity,
			bgTargets,
			method,
		);
	}

	if (bgRemovalScope === "outer") {
		const out = cloneImage(img);
		const w = img.width;
		const h = img.height;
		const visited = new Uint8Array(w * h);
		const data = out.data;
		const border = getBorderPixels(w, h);

		const fillFrom = (sx: number, sy: number): void => {
			if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
			const idx = sy * w + sx;
			if (visited[idx]) return;
			const i = idx * 4;
			if (data[i + 3] === 0) return;
			if (bgTargets.length > 0) {
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];
				if (!isCandidate(r, g, b, bgTargets, tolerance)) return;
			}
			floodFillTransparent(out, sx, sy, tolerance, visited, bgConnectivity);
		};

		for (const [x, y] of border) {
			const idx = y * w + x;
			const i = idx * 4;
			if (data[i + 3] === 0) continue;
			if (
				bgTargets.length > 0 &&
				!isCandidate(data[i], data[i + 1], data[i + 2], bgTargets, tolerance)
			) {
				continue;
			}
			fillFrom(x, y);
		}
		return out;
	}

	// bgRemovalScope === "all": legacy-compatible behavior
	// - First, remove background by legacy flood fill.
	// - Then, remove inner background by scanning the whole image for bgTargets.
	// NOTE: connectivity is intentionally fixed to 4-way here.
	const out = removeBackgroundByFloodFillLegacy(
		img,
		tolerance,
		"4",
		bgTargets,
		method,
	);
	if (bgTargets.length === 0) return out;

	const d = out.data;
	for (let i = 0; i < d.length; i += 4) {
		const a = d[i + 3];
		if (a === 0) continue;
		if (isCandidate(d[i], d[i + 1], d[i + 2], bgTargets, tolerance)) {
			d[i + 3] = 0;
		}
	}
	return out;
};

const getBackgroundTargets = (
	img: RawImage,
	method:
		| "none"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb",
	bgRgb?: string,
	alphaThreshold = 16,
): Array<[number, number, number]> => {
	if (method === "none") return [];
	if (method === "rgb" && bgRgb) {
		const hex = bgRgb.replace("#", "");
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		return [[r, g, b]];
	}

	const w = img.width;
	const h = img.height;
	const points: Array<[number, number]> = [];
	if (method === "top-left") points.push([0, 0]);
	else if (method === "bottom-left") points.push([0, h - 1]);
	else if (method === "top-right") points.push([w - 1, 0]);
	else if (method === "bottom-right") points.push([w - 1, h - 1]);

	const keys = new Set<string>();
	const targets: Array<[number, number, number]> = [];
	for (const [x, y] of points) {
		const idx = (y * w + x) * 4;
		const r = img.data[idx];
		const g = img.data[idx + 1];
		const b = img.data[idx + 2];
		const a = img.data[idx + 3];
		if (a < alphaThreshold) continue;
		const key = `${r},${g},${b}`;
		if (!keys.has(key)) {
			keys.add(key);
			targets.push([r, g, b]);
		}
	}
	return targets;
};

const removeSmallFloatingComponentsInPlace = (
	working: RawImage,
	masked: RawImage,
	alphaThreshold: number,
	maxPixels: number,
): { removedComponents: number; removedPixels: number } => {
	if (maxPixels <= 0) return { removedComponents: 0, removedPixels: 0 };
	if (working.width !== masked.width || working.height !== masked.height) {
		throw new Error("working and masked sizes do not match.");
	}
	const w = masked.width;
	const h = masked.height;
	const n = w * h;
	const visited = new Uint8Array(n);

	let compId = 0;
	let largestId = -1;
	let largestSize = 0;
	const small: Array<{ id: number; pixels: number[]; size: number }> = [];

	const isOpaque = (p: number): boolean =>
		masked.data[p * 4 + 3] >= alphaThreshold;

	for (let p = 0; p < n; p += 1) {
		if (visited[p]) continue;
		if (!isOpaque(p)) continue;

		compId += 1;
		const id = compId;
		const queue: number[] = [p];
		visited[p] = 1;

		let size = 0;
		let pixels: number[] = [];
		let storing = true;

		while (queue.length > 0) {
			const cur = queue.pop() as number;
			size += 1;
			if (storing) {
				pixels.push(cur);
				if (pixels.length > maxPixels) {
					// Stop recording as it is no longer a target for removal
					storing = false;
					pixels = [];
				}
			}

			const x = cur % w;
			const y = (cur / w) | 0;

			// Downsampling logic for nearest-neighbor scaling
			if (x > 0) {
				const p2 = cur - 1;
				if (!visited[p2] && isOpaque(p2)) {
					visited[p2] = 1;
					queue.push(p2);
				}
			}
			if (x + 1 < w) {
				const p2 = cur + 1;
				if (!visited[p2] && isOpaque(p2)) {
					visited[p2] = 1;
					queue.push(p2);
				}
			}
			if (y > 0) {
				const p2 = cur - w;
				if (!visited[p2] && isOpaque(p2)) {
					visited[p2] = 1;
					queue.push(p2);
				}
			}
			if (y + 1 < h) {
				const p2 = cur + w;
				if (!visited[p2] && isOpaque(p2)) {
					visited[p2] = 1;
					queue.push(p2);
				}
			}
		}

		if (size > largestSize) {
			largestSize = size;
			largestId = id;
		}
		// Only keep coordinates for candidate for removal (small components)
		if (size <= maxPixels && pixels.length > 0) {
			small.push({ id, pixels, size });
		}
	}

	// The largest connected component is considered the "main object" and is kept even if it's a candidate for removal
	let removedComponents = 0;
	let removedPixels = 0;
	for (const comp of small) {
		if (comp.id === largestId) continue;
		removedComponents += 1;
		removedPixels += comp.size;
		for (const p of comp.pixels) {
			const aIdx = p * 4 + 3;
			masked.data[aIdx] = 0;
			working.data[aIdx] = 0;
		}
	}
	return { removedComponents, removedPixels };
};

export const _removeSmallFloatingComponentsInPlace =
	removeSmallFloatingComponentsInPlace;

const findOpaqueBounds = (
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

const cropRawImage = (
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

const padRawImage = (
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

const getAspectRatio = (img: RawImage): number =>
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

const applyColorReduction = (
	img: RawImage,
	mode: string,
	ditherMode: DitherMode,
	colorCount: number,
	ditherStrength: number,
	log: (...args: unknown[]) => void,
	customPalette?: RGB[],
): RawImage => {
	const quantStart = performance.now();
	const pixelData: PixelData[] = [];
	for (let i = 0; i < img.data.length; i += 4) {
		pixelData.push({
			r: img.data[i],
			g: img.data[i + 1],
			b: img.data[i + 2],
			alpha: img.data[i + 3],
		});
	}

	// In SFC mode, round to 15-bit color before color reduction,
	// allowing K-means to select the optimal palette within the SFC color space.
	let workingPixelData = pixelData;
	const isSfcMode = mode === "sfc_sprite" || mode === "sfc_bg";
	if (isSfcMode && !customPalette) {
		workingPixelData = pixelData.map((p) => ({
			r: Math.round(p.r / 8) * 8,
			g: Math.round(p.g / 8) * 8,
			b: Math.round(p.b / 8) * 8,
			alpha: p.alpha,
		}));
	}

	let reducedPixels: PixelData[];
	if (customPalette) {
		const quantizer = new PaletteQuantizer(customPalette);
		reducedPixels = quantizer.applyDithering(
			workingPixelData,
			img.width,
			img.height,
			ditherMode,
			ditherStrength / 100,
		);
	} else if (mode === "auto" || isSfcMode) {
		let count = colorCount;
		if (mode === "sfc_sprite") count = 16;
		else if (mode === "sfc_bg") count = 256;

		const quantizer = new OklabKMeans(count);
		reducedPixels = quantizer.applyDithering(
			workingPixelData,
			img.width,
			img.height,
			ditherMode,
			ditherStrength / 100,
		);
	} else {
		const paletteDef = RETRO_PALETTES[mode];
		if (paletteDef) {
			const colors = paletteDef.colors.map((hex) => {
				const r = parseInt(hex.slice(1, 3), 16);
				const g = parseInt(hex.slice(3, 5), 16);
				const b = parseInt(hex.slice(5, 7), 16);
				return { r, g, b };
			});
			const quantizer = new PaletteQuantizer(colors);
			reducedPixels = quantizer.applyDithering(
				workingPixelData,
				img.width,
				img.height,
				ditherMode,
				ditherStrength / 100,
			);
		} else {
			// Fallback to auto if palette not found
			const quantizer = new OklabKMeans(colorCount);
			reducedPixels = quantizer.applyDithering(
				workingPixelData,
				img.width,
				img.height,
				ditherMode,
				ditherStrength / 100,
			);
		}
	}

	const newData = new Uint8ClampedArray(img.data.length);
	for (let i = 0; i < reducedPixels.length; i++) {
		const p = reducedPixels[i];
		newData[i * 4] = p.r;
		newData[i * 4 + 1] = p.g;
		newData[i * 4 + 2] = p.b;
		newData[i * 4 + 3] = p.alpha;
	}

	log(
		`Color reduction (${mode}, ${colorCount} colors) done in ${(performance.now() - quantStart).toFixed(2)}ms`,
	);

	return { ...img, data: newData };
};

const extractUsedColors = (img: RawImage): RGB[] => {
	const colors = new Set<string>();
	const result: RGB[] = [];
	for (let i = 0; i < img.data.length; i += 4) {
		const a = img.data[i + 3];
		if (a < 16) continue; // Transparency threshold
		const r = img.data[i];
		const g = img.data[i + 1];
		const b = img.data[i + 2];
		const key = `${r},${g},${b}`;
		if (!colors.has(key)) {
			colors.add(key);
			result.push({ r, g, b });
		}
	}
	return result;
};

type GridEstimateFromTrimmed = {
	outW: number;
	outH: number;
	cellW: number;
	cellH: number;
	offsetX: number;
	offsetY: number;
	score?: number;
	candidates?: GridEstimateFromTrimmed[];
};

interface GridSearchFromTrimmedStrategy {
	search: (
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		hint?: { outW: number; outH: number },
	) => GridEstimateFromTrimmed | null;
}

const GRID_SIZE_CANDIDATE_COUNT = 10;

type GridSizeCandidate = {
	outW: number;
	outH: number;
	score: number;
};

/**
 * To "disperse" candidate sizes to some extent, divide the outH range into buckets and pick the best from each bucket.
 * - Even if the scale differs significantly, candidates that are not too close to each other are obtained.
 * - The best candidate is always included, and any shortfall is filled in order of score.
 */
const pickDistributedGridSizeCandidates = (
	results: GridSizeCandidate[],
	count: number,
): GridSizeCandidate[] => {
	if (results.length === 0) return [];

	const byScore = [...results].sort((a, b) => a.score - b.score);
	if (byScore.length <= count) return byScore;

	let minOutH = byScore[0].outH;
	let maxOutH = byScore[0].outH;
	for (const r of byScore) {
		if (r.outH < minOutH) minOutH = r.outH;
		if (r.outH > maxOutH) maxOutH = r.outH;
	}
	if (minOutH === maxOutH) return byScore.slice(0, count);

	const range = maxOutH - minOutH + 1;
	const bucketCount = Math.min(count, range);
	const bucketBest: (GridSizeCandidate | null)[] = Array.from(
		{ length: bucketCount },
		() => null,
	);

	for (const r of byScore) {
		const t = (r.outH - minOutH) / Math.max(1, range - 1);
		const b = Math.min(
			bucketCount - 1,
			Math.max(0, Math.floor(t * bucketCount)),
		);
		const cur = bucketBest[b];
		if (!cur || r.score < cur.score) bucketBest[b] = r;
	}

	const selected: GridSizeCandidate[] = [];
	const seen = new Set<string>();

	// Always include the best candidate
	const best = byScore[0];
	selected.push(best);
	seen.add(`${best.outW}x${best.outH}`);

	for (const r of bucketBest) {
		if (!r) continue;
		const key = `${r.outW}x${r.outH}`;
		if (seen.has(key)) continue;
		selected.push(r);
		seen.add(key);
		if (selected.length >= count) break;
	}

	// If there is space, fill with others in order of score
	for (const r of byScore) {
		if (selected.length >= count) break;
		const key = `${r.outW}x${r.outH}`;
		if (seen.has(key)) continue;
		selected.push(r);
		seen.add(key);
	}

	// Sort by size for better display in UI
	selected.sort((a, b) => a.outH - b.outH || a.outW - b.outW);
	return selected.slice(0, count);
};

export class LegacyGridSearchFromTrimmed
	implements GridSearchFromTrimmedStrategy
{
	search(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		hint?: { outW: number; outH: number },
	): GridEstimateFromTrimmed | null {
		return legacySearchGridFromTrimmed(cropped, mask, sampleWindow, hint);
	}
}

export class FastGridSearchFromTrimmed
	implements GridSearchFromTrimmedStrategy
{
	private scan(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		outHMin: number,
		outHMax: number,
		outHStep: number,
		pixelStride: number,
		ratioOverride?: number,
	): { bestOutH: number; est: GridEstimateFromTrimmed } | null {
		const ratio = ratioOverride ?? cropped.width / Math.max(1, cropped.height);
		let best: {
			outW: number;
			outH: number;
			cellW: number;
			cellH: number;
			score: number;
		} | null = null;

		const croppedData = cropped.data;
		const croppedW = cropped.width;
		const croppedH = cropped.height;
		const maskData = mask.data;

		const allResults: GridSizeCandidate[] = [];

		for (let outH = outHMin; outH <= outHMax; outH += outHStep) {
			const outW = Math.max(2, Math.round(outH * ratio));
			if (outW > 600 || outH > 600) continue;

			const cellW = croppedW / outW;
			const cellH = croppedH / outH;
			if (!(cellW > 1 && cellH > 1)) continue;

			const grid: PixelGrid = {
				cellW,
				cellH,
				offsetX: 0,
				offsetY: 0,
				outW,
				outH,
				cropX: 0,
				cropY: 0,
				cropW: croppedW,
				cropH: croppedH,
				score: 0,
			};
			const small = downsample(cropped, grid, sampleWindow);
			const smallData = small.data;

			// Reconstruction error (ignore mask alpha=0 for background)
			let err = 0;
			let n = 0;
			for (let y = 0; y < croppedH; y += pixelStride) {
				const rowOffset = y * croppedW;
				for (let x = 0; x < croppedW; x += pixelStride) {
					const pixelIdx = rowOffset + x;
					const ma = maskData[pixelIdx * 4 + 3];
					if (ma < 16) continue;

					const i = Math.min(outW - 1, Math.max(0, Math.floor(x / cellW)));
					const j = Math.min(outH - 1, Math.max(0, Math.floor(y / cellH)));

					const srcIdx = pixelIdx * 4;
					const r0 = croppedData[srcIdx];
					const g0 = croppedData[srcIdx + 1];
					const b0 = croppedData[srcIdx + 2];

					const dstIdx = (j * outW + i) * 4;
					const r1 = smallData[dstIdx];
					const g1 = smallData[dstIdx + 1];
					const b1 = smallData[dstIdx + 2];
					err += Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1);
					n += 1;
				}
			}
			if (n === 0) continue;

			const reconErr = err / n;
			// Reconstruction error tends to drop monotonically with over-partitioning, so add a penalty proportional to number of cells.
			// Use square root order to balance between low resolution (few cells) and high resolution (many cells).
			const complexityPenalty = 0.16 * Math.sqrt(outW * outH);
			const score = reconErr + complexityPenalty;
			allResults.push({ outH, outW, score });

			if (!best || score < best.score) {
				best = { outW, outH, cellW, cellH, score };
			}
		}

		if (!best) return null;
		const picked = pickDistributedGridSizeCandidates(
			allResults,
			GRID_SIZE_CANDIDATE_COUNT,
		);
		return {
			bestOutH: best.outH,
			est: {
				outW: best.outW,
				outH: best.outH,
				cellW: best.cellW,
				cellH: best.cellH,
				offsetX: 0,
				offsetY: 0,
				score: best.score,
				candidates: picked.map((c) => ({
					outW: c.outW,
					outH: c.outH,
					cellW: croppedW / c.outW,
					cellH: croppedH / c.outH,
					offsetX: 0,
					offsetY: 0,
					score: c.score,
				})),
			},
		};
	}

	search(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		hint?: { outW: number; outH: number },
	): GridEstimateFromTrimmed | null {
		// Vary outH based on ratio to determine outW (limits search space)
		const outHMin = Math.max(2, Math.floor(cropped.height / 32));
		// If 1 cell is too small (= over-partitioned), error always drops, so require at least ~4px/cell
		const outHMax = Math.min(
			512,
			Math.max(outHMin, Math.floor(cropped.height / 4)),
		);

		// If image is larger, reduce candidates with coarser steps
		const span = outHMax - outHMin;
		const outHStep = span >= 64 ? 3 : span >= 32 ? 2 : 1;

		// Downsample the reconstruction error evaluation points (more effective for larger images)
		const maxDim = Math.max(cropped.width, cropped.height);
		const pixelStride = Math.min(4, Math.max(1, Math.floor(maxDim / 512)));

		// If hint is specified, start precise search (outHStep=1) from its neighborhood
		if (hint) {
			const hintOutH = clampInt(hint.outH, {
				min: outHMin,
				max: outHMax,
				default: hint.outH,
			});
			const radius = Math.max(6, outHStep * 2);
			const r0 = Math.max(outHMin, hintOutH - radius);
			const r1 = Math.min(outHMax, hintOutH + radius);
			const ratioHint = hint.outW / Math.max(1, hint.outH);
			const refinedFromHint = this.scan(
				cropped,
				mask,
				sampleWindow,
				r0,
				r1,
				1,
				Math.max(1, Math.floor(pixelStride / 2)),
				ratioHint,
			);
			return refinedFromHint?.est ?? null;
		}

		const coarse = this.scan(
			cropped,
			mask,
			sampleWindow,
			outHMin,
			outHMax,
			outHStep,
			pixelStride,
		);
		if (!coarse) return null;

		// Fine-grained re-scan around the best coarse-search candidate (stride is reduced as the range is narrow)
		const refineRadius = outHStep * 2;
		const r0 = Math.max(outHMin, coarse.bestOutH - refineRadius);
		const r1 = Math.min(outHMax, coarse.bestOutH + refineRadius);
		const refined = this.scan(
			cropped,
			mask,
			sampleWindow,
			r0,
			r1,
			1,
			Math.max(1, Math.floor(pixelStride / 2)),
		);
		// NOTE:
		// Candidate list (for size adjustment in UI) uses Top 3 from "coarse-search".
		// The finally adopted grid maintains the best result from "refined-search".
		const best = refined?.est ?? coarse.est;
		return { ...best, candidates: coarse.est.candidates };
	}
}

const getGridSearchFromTrimmedStrategy = (
	fast: boolean,
): GridSearchFromTrimmedStrategy => {
	return fast
		? new FastGridSearchFromTrimmed()
		: new LegacyGridSearchFromTrimmed();
};

const legacySearchGridFromTrimmed = (
	cropped: RawImage,
	mask: RawImage,
	sampleWindow: number,
	hint?: { outW: number; outH: number },
): GridEstimateFromTrimmed | null => {
	// Determine outW by varying outH based on ratio (to limit search space)
	const ratio = cropped.width / Math.max(1, cropped.height);
	const outHMin = Math.max(2, Math.floor(cropped.height / 32));
	// If 1 cell is too small (= over-partitioned), error always drops, so require at least ~4px/cell
	const outHMax = Math.min(
		512,
		Math.max(outHMin, Math.floor(cropped.height / 4)),
	);

	let best: {
		outW: number;
		outH: number;
		cellW: number;
		cellH: number;
		score: number;
	} | null = null;
	const allResults: GridSizeCandidate[] = [];

	const h0 = hint ? Math.max(outHMin, hint.outH - 12) : outHMin;
	const h1 = hint ? Math.min(outHMax, hint.outH + 12) : outHMax;

	for (let outH = h0; outH <= h1; outH += 1) {
		const outW = Math.max(2, Math.round(outH * ratio));
		if (outW > 600 || outH > 600) continue;

		const cellW = cropped.width / outW;
		const cellH = cropped.height / outH;
		if (!(cellW > 1 && cellH > 1)) continue;

		const grid: PixelGrid = {
			cellW,
			cellH,
			offsetX: 0,
			offsetY: 0,
			outW,
			outH,
			cropX: 0,
			cropY: 0,
			cropW: cropped.width,
			cropH: cropped.height,
			score: 0,
		};
		const small = downsample(cropped, grid, sampleWindow);

		// Reconstruction error (ignore mask alpha=0 for background)
		let err = 0;
		let n = 0;
		const croppedData = cropped.data;
		const croppedW = cropped.width;
		const maskData = mask.data;
		const smallData = small.data;

		for (let y = 0; y < cropped.height; y += 1) {
			const rowOffset = y * croppedW;
			for (let x = 0; x < croppedW; x += 1) {
				const pixelIdx = rowOffset + x;
				const ma = maskData[pixelIdx * 4 + 3];
				if (ma < 16) continue;
				const i = Math.min(outW - 1, Math.max(0, Math.floor(x / cellW)));
				const j = Math.min(outH - 1, Math.max(0, Math.floor(y / cellH)));

				const srcIdx = pixelIdx * 4;
				const r0 = croppedData[srcIdx];
				const g0 = croppedData[srcIdx + 1];
				const b0 = croppedData[srcIdx + 2];

				const dstIdx = (j * outW + i) * 4;
				const r1 = smallData[dstIdx];
				const g1 = smallData[dstIdx + 1];
				const b1 = smallData[dstIdx + 2];
				err += Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1);
				n += 1;
			}
		}
		if (n === 0) continue;

		const reconErr = err / n;
		// Reconstruction error tends to drop monotonically with over-partitioning, so add a penalty proportional to number of cells.
		// Use square root order to balance between low resolution (few cells) and high resolution (many cells).
		const complexityPenalty = 0.16 * Math.sqrt(outW * outH);
		const score = reconErr + complexityPenalty;
		allResults.push({ outH, outW, score });

		if (!best || score < best.score) {
			best = { outW, outH, cellW, cellH, score };
		}
	}

	if (!best) return null;
	const picked = pickDistributedGridSizeCandidates(
		allResults,
		GRID_SIZE_CANDIDATE_COUNT,
	);
	return {
		outW: best.outW,
		outH: best.outH,
		cellW: best.cellW,
		cellH: best.cellH,
		offsetX: 0,
		offsetY: 0,
		score: best.score,
		candidates: picked.map((c) => ({
			outW: c.outW,
			outH: c.outH,
			cellW: cropped.width / c.outW,
			cellH: cropped.height / c.outH,
			offsetX: 0,
			offsetY: 0,
			score: c.score,
		})),
	};
};

export const processImage = (
	img: RawImage,
	options: ProcessOptions = {},
): ProcessResult => {
	const o = normalizeProcessOptions(options);
	const startTime = performance.now();
	const log = (...args: unknown[]) => {
		if (o.debug) {
			console.log("[Processor]", ...args);
		}
	};

	log("Processing started", {
		width: img.width,
		height: img.height,
		options: o,
	});

	const bgTargetsStart = performance.now();
	const bgTargets =
		o.bgRemovalScope !== "off"
			? getBackgroundTargets(img, o.bgExtractionMethod, o.bgRgb, 16)
			: [];
	log(
		`Background targets extracted in ${(performance.now() - bgTargetsStart).toFixed(2)}ms`,
		bgTargets,
	);

	const workingStart = performance.now();
	const working = o.preRemoveBackground
		? o.bgRemovalScope === "outer"
			? removeBackground(
					img,
					o.backgroundTolerance,
					"outer",
					o.bgConnectivity,
					bgTargets,
					o.bgExtractionMethod,
				)
			: o.bgRemovalScope === "selected"
				? removeBackgroundByFloodFillLegacy(
						img,
						o.backgroundTolerance,
						o.bgConnectivity,
						bgTargets,
						o.bgExtractionMethod,
					)
				: o.bgRemovalScope === "all"
					? removeBackgroundByFloodFillLegacy(
							img,
							o.backgroundTolerance,
							"4",
							bgTargets,
							o.bgExtractionMethod,
						)
					: cloneImage(img)
		: cloneImage(img);
	log(
		`Pre-background removal done in ${(performance.now() - workingStart).toFixed(2)}ms`,
	);

	o.debugHook?.("00-input", img);
	o.debugHook?.("01-working", working, {
		preRemoveBackground: o.preRemoveBackground,
	});
	const trimToContent = o.trimToContent;
	const sourceAspectRatio = o.keepAspectRatio ? getAspectRatio(img) : 0;
	const trimAlphaThreshold = o.trimAlphaThreshold;

	// force: Trim with content BBox -> Force convert to specified pixel size (W x H) (no auto-detection)
	if (o.forcePixelsW !== undefined && o.forcePixelsH !== undefined) {
		const bgTol = o.backgroundTolerance;
		const masked = removeBackground(
			working,
			bgTol,
			o.bgRemovalScope,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
		);
		if (o.floatingMaxPixels > 0) {
			const floatingStart = performance.now();
			const { removedComponents, removedPixels } =
				removeSmallFloatingComponentsInPlace(
					working,
					masked,
					trimAlphaThreshold,
					o.floatingMaxPixels,
				);
			log(
				`Floating components removed in ${(performance.now() - floatingStart).toFixed(2)}ms`,
				{ removedComponents, removedPixels },
			);
			if (o.debugHook && removedPixels > 0) {
				o.debugHook("01b-working-ignore-floating", working, {
					floatingMaxPixels: o.floatingMaxPixels,
					removedComponents,
					removedPixels,
					forced: true,
				});
			}
		}
		o.debugHook?.("02-pre-downsample-masked", masked, {
			bgTol,
			forcePixels: { w: o.forcePixelsW, h: o.forcePixelsH },
		});
		const boundsStart = performance.now();
		const b = findOpaqueBounds(masked, trimAlphaThreshold);
		if (!b) {
			throw new Error(
				"Specified pixel conversion failed because no content was found.",
			);
		}
		log(
			`Opaque bounds found in ${(performance.now() - boundsStart).toFixed(2)}ms`,
			b,
		);
		const cropped = cropRawImage(working, b.x, b.y, b.w, b.h);
		o.debugHook?.("03-pre-downsample-bg-trimmed", cropped, {
			bounds: b,
			forcePixels: { w: o.forcePixelsW, h: o.forcePixelsH },
		});

		const outW = o.forcePixelsW;
		const outH = o.forcePixelsH;
		const cellW = cropped.width / outW;
		const cellH = cropped.height / outH;
		log(
			`Forced pixel size mode: ${outW}x${outH} (cell: ${cellW.toFixed(2)}x${cellH.toFixed(2)})`,
		);
		const g: PixelGrid = {
			cellW,
			cellH,
			offsetX: 0,
			offsetY: 0,
			outW,
			outH,
			cropX: 0,
			cropY: 0,
			cropW: cropped.width,
			cropH: cropped.height,
			score: 0,
		};

		// 2. Downsampling / Sanitization
		const sw = cellW < 1 || cellH < 1 ? 1 : o.sampleWindow;
		const downsampleStart = performance.now();
		const down2 = downsample(cropped, g, sw);
		log(
			`Downsampling (forced) done in ${(performance.now() - downsampleStart).toFixed(2)}ms`,
		);
		o.debugHook?.("05-downsampled", down2, {
			sampleWindow: sw,
			forced: true,
		});

		// 3. Post-process Transparency (Background removal)
		const postBgStart = performance.now();
		const result2 = o.postRemoveBackground
			? removeBackground(
					down2,
					o.backgroundTolerance,
					o.bgRemovalScope,
					o.bgConnectivity,
					bgTargets,
					o.bgExtractionMethod,
				)
			: down2;
		log(
			`Post-background removal done in ${(performance.now() - postBgStart).toFixed(2)}ms`,
		);

		// Color reduction
		let finalResult = result2;
		if (o.reduceColors || o.fixedPalette) {
			finalResult = applyColorReduction(
				result2,
				o.reduceColorMode,
				o.ditherMode,
				o.colorCount,
				o.ditherStrength,
				log,
				o.fixedPalette,
			);
		}

		// compareBefore needs to be resized from the original image 'img'
		// using the bounds 'b' and the forced grid.
		const forcedTrimmedGridForOriginal: PixelGrid = {
			...g,
			cropX: b.x,
			cropY: b.y,
			cropW: b.w,
			cropH: b.h,
		};
		let compareBefore = cropRawImageNearestFromGrid(
			img,
			forcedTrimmedGridForOriginal,
		);

		// Sanitized comparison: use the same downsample as the pipeline (median sampling).
		const croppedOriginal = cropRawImage(img, b.x, b.y, b.w, b.h);
		let compareBeforeSanitized = downsample(croppedOriginal, g, sw);

		let finalGridForForce = g;
		if (o.makeSquare) {
			const w = finalResult.width;
			const h = finalResult.height;
			if (w !== h) {
				const size = Math.max(w, h);
				const dw = size - w;
				const dh = size - h;
				const padLeft = Math.floor(dw / 2);
				const padTop = Math.floor(dh / 2);
				const padRight = dw - padLeft;
				const padBottom = dh - padTop;

				const padLeftPx = Math.round(padLeft * finalGridForForce.cellW);
				const padTopPx = Math.round(padTop * finalGridForForce.cellH);
				const padRightPx = Math.round(padRight * finalGridForForce.cellW);
				const padBottomPx = Math.round(padBottom * finalGridForForce.cellH);

				finalResult = padRawImage(
					finalResult,
					padLeft,
					padTop,
					padRight,
					padBottom,
				);
				compareBefore = padRawImage(
					compareBefore,
					padLeftPx,
					padTopPx,
					padRightPx,
					padBottomPx,
				);
				compareBeforeSanitized = padRawImage(
					compareBeforeSanitized,
					padLeft,
					padTop,
					padRight,
					padBottom,
				);
				const baseCropX = finalGridForForce.cropX ?? finalGridForForce.offsetX;
				const baseCropY = finalGridForForce.cropY ?? finalGridForForce.offsetY;
				finalGridForForce = {
					...finalGridForForce,
					outW: size,
					outH: size,
					cropX: baseCropX - padLeftPx,
					cropY: baseCropY - padTopPx,
					cropW: size * finalGridForForce.cellW,
					cropH: size * finalGridForForce.cellH,
				};
			}
		}

		o.debugHook?.("99-result", finalResult, {
			postRemoveBackground: o.postRemoveBackground,
			forced: true,
		});
		log(
			`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`,
		);
		const extracted = extractUsedColors(finalResult);
		const analysis = createProcessingAnalysis(
			img,
			finalResult,
			finalGridForForce,
			"convert",
			"forced-size",
			trimAlphaThreshold,
		);
		log("Processing analysis", analysis);
		return {
			result: finalResult,
			grid: finalGridForForce,
			extractedPalette: extracted,
			compareBefore,
			compareBeforeSanitized,
			analysis,
		};
	}

	// enableGridDetection: Skip grid detection and downsampling
	if (!o.enableGridDetection) {
		const bgTol = o.backgroundTolerance;
		const masked = removeBackground(
			working,
			bgTol,
			o.bgRemovalScope,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
		);
		if (o.floatingMaxPixels > 0) {
			removeSmallFloatingComponentsInPlace(
				working,
				masked,
				trimAlphaThreshold,
				o.floatingMaxPixels,
			);
		}

		let finalResult = working;
		let compareBefore = img;
		let compareBeforeSanitized = img;
		let outW = working.width;
		let outH = working.height;
		let cropX = 0;
		let cropY = 0;

		if (o.reduceColors || o.fixedPalette) {
			finalResult = applyColorReduction(
				working,
				o.reduceColorMode,
				o.ditherMode,
				o.colorCount,
				o.ditherStrength,
				log,
				o.fixedPalette,
			);
		}

		if (o.trimToContent) {
			const b = findOpaqueBounds(masked, trimAlphaThreshold);
			if (b) {
				finalResult = cropRawImage(finalResult, b.x, b.y, b.w, b.h);
				compareBefore = cropRawImage(compareBefore, b.x, b.y, b.w, b.h);
				compareBeforeSanitized = cropRawImage(
					compareBeforeSanitized,
					b.x,
					b.y,
					b.w,
					b.h,
				);
				outW = b.w;
				outH = b.h;
				cropX = b.x;
				cropY = b.y;
			}
		}

		let finalGridForNoGrid = {
			cellW: 1,
			cellH: 1,
			offsetX: 0,
			offsetY: 0,
			outW,
			outH,
			cropX,
			cropY,
			cropW: outW,
			cropH: outH,
			score: 0,
		};

		if (o.makeSquare) {
			const w = finalResult.width;
			const h = finalResult.height;
			if (w !== h) {
				const size = Math.max(w, h);
				const dw = size - w;
				const dh = size - h;
				const padLeft = Math.floor(dw / 2);
				const padTop = Math.floor(dh / 2);
				const padRight = dw - padLeft;
				const padBottom = dh - padTop;

				const padLeftPx = Math.round(padLeft * finalGridForNoGrid.cellW);
				const padTopPx = Math.round(padTop * finalGridForNoGrid.cellH);
				const padRightPx = Math.round(padRight * finalGridForNoGrid.cellW);
				const padBottomPx = Math.round(padBottom * finalGridForNoGrid.cellH);

				finalResult = padRawImage(
					finalResult,
					padLeft,
					padTop,
					padRight,
					padBottom,
				);
				compareBefore = padRawImage(
					compareBefore,
					padLeftPx,
					padTopPx,
					padRightPx,
					padBottomPx,
				);
				compareBeforeSanitized = padRawImage(
					compareBeforeSanitized,
					padLeft,
					padTop,
					padRight,
					padBottom,
				);
				const baseCropX =
					finalGridForNoGrid.cropX ?? finalGridForNoGrid.offsetX;
				const baseCropY =
					finalGridForNoGrid.cropY ?? finalGridForNoGrid.offsetY;
				finalGridForNoGrid = {
					...finalGridForNoGrid,
					outW: size,
					outH: size,
					cropX: baseCropX - padLeftPx,
					cropY: baseCropY - padTopPx,
					cropW: size * finalGridForNoGrid.cellW,
					cropH: size * finalGridForNoGrid.cellH,
				};
			}
		}

		o.debugHook?.("99-result", finalResult, {
			noGridDetection: true,
			trimmed: o.trimToContent,
		});

		const extracted = extractUsedColors(finalResult);
		log(
			`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`,
		);

		const analysis = createProcessingAnalysis(
			img,
			finalResult,
			finalGridForNoGrid,
			"preserve",
			"grid-disabled",
			trimAlphaThreshold,
		);
		log("Processing analysis", analysis);
		return {
			result: finalResult,
			grid: finalGridForNoGrid,
			extractedPalette: extracted,
			compareBefore,
			compareBeforeSanitized,
			analysis,
		};
	}

	// auto: First, estimate outW/outH from the background-trimmed area (before downsampling) and downsample as is.
	// (Even for images with many gaps, we want to focus on the content area for stability.)
	const autoGridFromTrimmed = o.autoGridFromTrimmed;

	// Output the "after background trimming" look (before downsampling) for debugging.
	// This is calculated for debug output only and does not change the actual processing pipeline.
	const bgTol = o.backgroundTolerance;
	const maskedStart = performance.now();
	const maskedForDebugOrAuto =
		o.debugHook || autoGridFromTrimmed || o.floatingMaxPixels > 0
			? removeBackground(
					working,
					bgTol,
					o.bgRemovalScope,
					o.bgConnectivity,
					bgTargets,
					o.bgExtractionMethod,
				)
			: null;
	if (maskedForDebugOrAuto) {
		log(
			`Masked image for debug/auto created in ${(performance.now() - maskedStart).toFixed(2)}ms`,
		);
	}

	if (maskedForDebugOrAuto && o.floatingMaxPixels > 0) {
		const floatingStart = performance.now();
		const { removedComponents, removedPixels } =
			removeSmallFloatingComponentsInPlace(
				working,
				maskedForDebugOrAuto,
				trimAlphaThreshold,
				o.floatingMaxPixels,
			);
		log(
			`Floating components removed in ${(performance.now() - floatingStart).toFixed(2)}ms`,
			{ removedComponents, removedPixels },
		);
		if (o.debugHook && removedPixels > 0) {
			o.debugHook("01b-working-ignore-floating", working, {
				floatingMaxPixels: o.floatingMaxPixels,
				removedComponents,
				removedPixels,
			});
		}
	}
	if (maskedForDebugOrAuto && o.debugHook) {
		o.debugHook("02-pre-downsample-masked", maskedForDebugOrAuto, {
			bgTol,
		});
		const b = findOpaqueBounds(maskedForDebugOrAuto, trimAlphaThreshold);
		if (b) {
			const cropped = cropRawImage(working, b.x, b.y, b.w, b.h);
			o.debugHook("03-pre-downsample-bg-trimmed", cropped, { bounds: b });
		}
	}

	let grid: PixelGrid | null = null;
	let gridMethod = "detect-grid";

	if (autoGridFromTrimmed && maskedForDebugOrAuto) {
		log("Auto grid from trimmed mode");
		const b = findOpaqueBounds(maskedForDebugOrAuto, trimAlphaThreshold);
		if (b) {
			const cropped = cropRawImage(working, b.x, b.y, b.w, b.h);
			const croppedMask = cropRawImage(
				maskedForDebugOrAuto,
				b.x,
				b.y,
				b.w,
				b.h,
			);
			o.debugHook?.("03-pre-downsample-bg-trimmed", cropped, {
				bounds: b,
			});

			const sw = o.sampleWindow;
			const searchStart = performance.now();
			const gridSearcher = getGridSearchFromTrimmedStrategy(
				o.fastAutoGridFromTrimmed,
			);
			const hint =
				o.hintPixelsW !== undefined && o.hintPixelsH !== undefined
					? { outW: o.hintPixelsW, outH: o.hintPixelsH }
					: undefined;
			const est = gridSearcher.search(cropped, croppedMask, sw, hint);
			log(
				`Grid search from trimmed done in ${(performance.now() - searchStart).toFixed(2)}ms`,
				est,
			);
			if (est) {
				gridMethod = o.fastAutoGridFromTrimmed
					? "trimmed-reconstruction-fast"
					: "trimmed-reconstruction";
				// NOTE:
				// - Even when trimming is OFF, we want to use the "estimated grid from content BBox" (to prevent crushing).
				// - However, trimming OFF just leaves background (margins), so apply downsampling to the whole image (working).
				//   This makes the number of cells (apparent size) of the center object more stable.
				const outW = Math.max(1, Math.floor(working.width / est.cellW));
				const outH = Math.max(1, Math.floor(working.height / est.cellH));
				const includeCandidates = hint === undefined;
				grid = {
					cellW: est.cellW,
					cellH: est.cellH,
					offsetX: 0,
					offsetY: 0,
					outW,
					outH,
					cropX: 0,
					cropY: 0,
					cropW: outW * est.cellW,
					cropH: outH * est.cellH,
					score: est.score ?? 0,
					candidates: includeCandidates
						? est.candidates?.map((c) => ({
								cellW: c.cellW,
								cellH: c.cellH,
								offsetX: 0,
								offsetY: 0,
								outW: Math.max(1, Math.floor(working.width / c.cellW)),
								outH: Math.max(1, Math.floor(working.height / c.cellH)),
								score: c.score ?? 0,
							}))
						: undefined,
				};
				o.debugHook?.("04-grid-crop", working, {
					grid,
					autoFromTrimmed: true,
					bounds: b,
				});
			}
		}
	}

	if (!grid) {
		const detectStart = performance.now();
		grid = detectGrid(working, { ...o.detect, debug: o.debug });
		log(
			`Grid detection done in ${(performance.now() - detectStart).toFixed(2)}ms`,
			grid,
		);
		o.debugHook?.("04-grid-crop", working, {
			grid,
		});
	}

	const downsampleStart = performance.now();
	const down = downsample(working, grid, o.sampleWindow);
	log(
		`Downsampling done in ${(performance.now() - downsampleStart).toFixed(2)}ms`,
	);
	o.debugHook?.("05-downsampled", down, {
		sampleWindow: o.sampleWindow,
	});

	// Compare "before": original image resized only (no sanitize).
	let compareBefore = cropRawImageNearestFromGrid(img, grid);
	// Compare "before (sanitized)": original image downsampled (median sampling) using the same grid.
	let compareBeforeSanitized = downsample(img, grid, o.sampleWindow);

	let trimmed = down;
	let trimmedGrid = grid;
	if (trimToContent) {
		const trimStart = performance.now();
		// After removing background (flood fill from corners), trim by content BBox in cell units.
		// This allows outW/outH to fit the "content" even for images with large margins.
		const bgTol = o.backgroundTolerance;
		const masked = removeBackground(
			down,
			bgTol,
			o.bgRemovalScope,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
		);
		o.debugHook?.("06-post-downsample-masked", masked, { bgTol });
		const b = findOpaqueBounds(masked, trimAlphaThreshold);
		if (
			b &&
			(b.x !== 0 || b.y !== 0 || b.w !== down.width || b.h !== down.height)
		) {
			trimmed = cropRawImage(down, b.x, b.y, b.w, b.h);

			const baseCropX = grid.cropX ?? grid.offsetX;
			const baseCropY = grid.cropY ?? grid.offsetY;
			trimmedGrid = {
				...grid,
				outW: b.w,
				outH: b.h,
				cropX: baseCropX + b.x * grid.cellW,
				cropY: baseCropY + b.y * grid.cellH,
				cropW: b.w * grid.cellW,
				cropH: b.h * grid.cellH,
			};

			// Recompute comparison befores using the updated trimmed grid
			compareBefore = cropRawImageNearestFromGrid(img, trimmedGrid);
			compareBeforeSanitized = cropRawImage(
				compareBeforeSanitized,
				b.x,
				b.y,
				b.w,
				b.h,
			);

			o.debugHook?.("07-trimmed", trimmed, { bounds: b });
			log(
				`Trimmed to content in ${(performance.now() - trimStart).toFixed(2)}ms`,
				b,
			);
		} else {
			log(
				`No trimming needed or possible in ${(performance.now() - trimStart).toFixed(2)}ms`,
			);
		}
	}

	const postBgStart = performance.now();
	const result = o.postRemoveBackground
		? removeBackground(
				trimmed,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
			)
		: trimmed;
	log(
		`Post-background removal done in ${(performance.now() - postBgStart).toFixed(2)}ms`,
	);

	// Color reduction
	let finalResult = result;
	if (o.reduceColors || o.fixedPalette) {
		finalResult = applyColorReduction(
			result,
			o.reduceColorMode,
			o.ditherMode,
			o.colorCount,
			o.ditherStrength,
			log,
			o.fixedPalette,
		);
	}

	// Outline processing
	if (o.outlineStyle !== "none") {
		const prevW = finalResult.width;
		const prevH = finalResult.height;
		finalResult = applyOutline(finalResult, o.outlineColor, o.outlineStyle);

		// Update grid info if image size was expanded
		if (finalResult.width !== prevW || finalResult.height !== prevH) {
			const dw = finalResult.width - prevW;
			const dh = finalResult.height - prevH;
			const padLeft = Math.floor(dw / 2);
			const padTop = Math.floor(dh / 2);
			const padRight = dw - padLeft;
			const padBottom = dh - padTop;

			// Keep compareBefore aligned with the expanded result (transparent padding).
			// Scale padding by cell size because compareBefore is high resolution.
			compareBefore = padRawImage(
				compareBefore,
				padLeft * trimmedGrid.cellW,
				padTop * trimmedGrid.cellH,
				padRight * trimmedGrid.cellW,
				padBottom * trimmedGrid.cellH,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);

			const cellDw = (finalResult.width - prevW) / 2;
			const cellDh = (finalResult.height - prevH) / 2;
			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;

			trimmedGrid = {
				...trimmedGrid,
				outW: finalResult.width,
				outH: finalResult.height,
				cropX: baseCropX - cellDw * trimmedGrid.cellW,
				cropY: baseCropY - cellDh * trimmedGrid.cellH,
				cropW: finalResult.width * trimmedGrid.cellW,
				cropH: finalResult.height * trimmedGrid.cellH,
			};
		}
	}

	if (o.keepAspectRatio && !o.makeSquare) {
		const { image: paddedResult, padding } = padImageToAspectRatio(
			finalResult,
			sourceAspectRatio,
		);
		if (paddedResult !== finalResult) {
			const padLeftPx = Math.round(padding.left * trimmedGrid.cellW);
			const padTopPx = Math.round(padding.top * trimmedGrid.cellH);
			const padRightPx = Math.round(padding.right * trimmedGrid.cellW);
			const padBottomPx = Math.round(padding.bottom * trimmedGrid.cellH);

			finalResult = paddedResult;
			compareBefore = padRawImage(
				compareBefore,
				padLeftPx,
				padTopPx,
				padRightPx,
				padBottomPx,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padding.left,
				padding.top,
				padding.right,
				padding.bottom,
			);

			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;
			trimmedGrid = {
				...trimmedGrid,
				outW: finalResult.width,
				outH: finalResult.height,
				cropX: baseCropX - padLeftPx,
				cropY: baseCropY - padTopPx,
				cropW: finalResult.width * trimmedGrid.cellW,
				cropH: finalResult.height * trimmedGrid.cellH,
			};
		}
	}

	if (o.makeSquare) {
		const w = finalResult.width;
		const h = finalResult.height;
		if (w !== h) {
			const size = Math.max(w, h);
			const dw = size - w;
			const dh = size - h;
			const padLeft = Math.floor(dw / 2);
			const padTop = Math.floor(dh / 2);
			const padRight = dw - padLeft;
			const padBottom = dh - padTop;

			const padLeftPx = Math.round(padLeft * trimmedGrid.cellW);
			const padTopPx = Math.round(padTop * trimmedGrid.cellH);
			const padRightPx = Math.round(padRight * trimmedGrid.cellW);
			const padBottomPx = Math.round(padBottom * trimmedGrid.cellH);

			finalResult = padRawImage(
				finalResult,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);
			compareBefore = padRawImage(
				compareBefore,
				padLeftPx,
				padTopPx,
				padRightPx,
				padBottomPx,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);
			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;
			trimmedGrid = {
				...trimmedGrid,
				outW: size,
				outH: size,
				cropX: baseCropX - padLeftPx,
				cropY: baseCropY - padTopPx,
				cropW: size * trimmedGrid.cellW,
				cropH: size * trimmedGrid.cellH,
			};
		}
	}

	o.debugHook?.("99-result", finalResult, {
		postRemoveBackground: o.postRemoveBackground,
		reduceColors: o.reduceColors,
		colorCount: o.colorCount,
	});
	log(`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`);

	const extracted = extractUsedColors(finalResult);
	const analysis = createProcessingAnalysis(
		img,
		finalResult,
		trimmedGrid,
		"refine",
		gridMethod,
		trimAlphaThreshold,
	);
	log("Processing analysis", analysis);
	return {
		result: finalResult,
		grid: trimmedGrid,
		extractedPalette: extracted,
		compareBefore,
		compareBeforeSanitized,
		analysis,
	};
};
