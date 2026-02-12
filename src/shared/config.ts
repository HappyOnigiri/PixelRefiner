export type IntRange = {
	min: number;
	max: number;
	default: number;
};

export const PROCESS_RANGES = {
	// detector: posterize step
	detectionQuantStep: { min: 1, max: 128, default: 64 } as const,
	// processor: downsample median window
	sampleWindow: { min: 1, max: 9, default: 3 } as const,
	// flood fill tolerance (per channel)
	backgroundTolerance: { min: 0, max: 255, default: 32 } as const,
	// bbox threshold for trimming
	trimAlphaThreshold: { min: 1, max: 255, default: 16 } as const,
	// UI: remove small floating islands threshold (% of total pixels)
	floatingMaxPercent: { min: 0, max: 100, default: 3 } as const,
	// remove small floating islands (connected components) as background
	floatingMaxPixels: { min: 0, max: 1000000, default: 50000 } as const,
	// force output pixel size (after BBox trim)
	forcePixelsW: { min: 1, max: 1024, default: 0 } as const,
	forcePixelsH: { min: 1, max: 1024, default: 0 } as const,
} as const satisfies Record<string, IntRange>;

export const PROCESS_DEFAULTS = {
	preRemoveBackground: true,
	postRemoveBackground: true,
	// 「四隅から連結」だけでなく、背景色（四隅の色）に近いピクセルを画像全体で透過にする
	// ※背景と同じ色がキャラクター内にある場合、それも透過されうるためUIで切替可能にする
	removeInnerBackground: true,
	// 出力後に内容物BBoxでトリムする（既定はON）
	trimToContent: true,
	autoGridFromTrimmed: true,
	// autoGridFromTrimmed のグリッド推定を高速化する（結果が変わる可能性あり）
	fastAutoGridFromTrimmed: true,
	// グリッド検出と縮小を無効にする（等倍ドット絵用）
	disableGridDetection: false,
	ignoreFloatingContent: true,
	floatingMaxPixels: PROCESS_RANGES.floatingMaxPixels.default,
	debug: import.meta.env.DEV,
} as const;

export const clampInt = (value: number, range: IntRange): number => {
	const v = Number.isFinite(value) ? Math.trunc(value) : range.default;
	return Math.min(range.max, Math.max(range.min, v));
};

export const clampNumber = (
	value: number,
	range: { min: number; max: number; default: number },
): number => {
	const v = Number.isFinite(value) ? value : range.default;
	return Math.min(range.max, Math.max(range.min, v));
};

export const clampOptionalInt = (
	value: number | undefined,
	range: IntRange,
): number | undefined => {
	if (value === undefined) return undefined;
	if (!Number.isFinite(value)) return undefined;
	return clampInt(value, range);
};
