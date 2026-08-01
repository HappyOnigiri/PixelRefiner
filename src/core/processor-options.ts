import {
	clampInt,
	clampOptionalInt,
	PROCESS_DEFAULTS,
	PROCESS_RANGES,
} from "../shared/config";
import type {
	BackgroundRemovalScope,
	Connectivity,
	DitherMode,
	OutlineStyle,
	RawImage,
	RGB,
} from "../shared/types";
import type { DetectOptions } from "./detector";

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

export const normalizeProcessOptions = (
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
		backgroundMaskTolerance: clampInt(
			raw.backgroundMaskTolerance ??
				PROCESS_RANGES.backgroundMaskTolerance.default,
			PROCESS_RANGES.backgroundMaskTolerance,
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

export type NormalizedProcessOptions = ReturnType<
	typeof normalizeProcessOptions
>;
