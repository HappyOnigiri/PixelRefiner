import type { RGB } from "./types";

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
	backgroundTolerance: { min: 0, max: 255, default: 64 } as const,
	// bbox threshold for trimming
	trimAlphaThreshold: { min: 1, max: 255, default: 16 } as const,
	// UI: remove small floating islands threshold (% of total pixels)
	floatingMaxPercent: { min: 0, max: 100, default: 3 } as const,
	// remove small floating islands (connected components) as background
	floatingMaxPixels: { min: 0, max: 1000000, default: 0 } as const,
	// force output pixel size (after BBox trim)
	forcePixelsW: { min: 1, max: 1024, default: 0 } as const,
	forcePixelsH: { min: 1, max: 1024, default: 0 } as const,
	// color reduction
	colorCount: { min: 2, max: 256, default: 32 } as const,
	// dithering
	ditherStrength: { min: 0, max: 100, default: 0 } as const,
	// outline
	outlineColor: { r: 255, g: 255, b: 255 }, // Default white
} as const satisfies Record<string, IntRange | RGB>;

export const RETRO_PALETTES: Record<
	string,
	{ name: string; colors: string[] }
> = {
	gb_legacy: {
		name: "Game Boy (Legacy)",
		colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
	},
	gb_pocket: {
		name: "Game Boy (Pocket)",
		colors: ["#000000", "#545454", "#a8a8a8", "#ffffff"],
	},
	gb_light: {
		name: "Game Boy (Light)",
		colors: ["#004040", "#15605d", "#308880", "#00e0e0"],
	},
	pico8: {
		name: "PICO-8",
		colors: [
			"#000000",
			"#1D2B53",
			"#7E2553",
			"#008751",
			"#AB5236",
			"#5F574F",
			"#C2C3C7",
			"#FFF1E8",
			"#FF004D",
			"#FFA300",
			"#FFEC27",
			"#00E436",
			"#29ADFF",
			"#83769C",
			"#FF77A8",
			"#FFCCAA",
		],
	},
	nes: {
		name: "NES",
		colors: [
			"#7C7C7C",
			"#0000FC",
			"#0000BC",
			"#4428BC",
			"#940084",
			"#A80020",
			"#A81000",
			"#881400",
			"#503000",
			"#007800",
			"#006800",
			"#005800",
			"#004058",
			"#000000",
			"#000000",
			"#000000",
			"#BCBCBC",
			"#0078F8",
			"#0058F8",
			"#6844FC",
			"#D800CC",
			"#E40058",
			"#F83800",
			"#E45C10",
			"#AC7C00",
			"#00B800",
			"#00A800",
			"#00A844",
			"#008888",
			"#000000",
			"#000000",
			"#000000",
			"#F8F8F8",
			"#3CBCFC",
			"#6888FC",
			"#9878F8",
			"#F878F8",
			"#F85898",
			"#F87858",
			"#FCA044",
			"#F8B800",
			"#B8F818",
			"#58D854",
			"#58F898",
			"#00E8D8",
			"#787878",
			"#000000",
			"#000000",
			"#FCFCFC",
			"#A4E4FC",
			"#B8B8F8",
			"#D8B8F8",
			"#F8B8F8",
			"#F8A4C0",
			"#F0D0B0",
			"#FCE0A8",
			"#F8D878",
			"#D8F878",
			"#B8F8B8",
			"#B8F8D8",
			"#00FCFC",
			"#F8D8F8",
			"#000000",
			"#000000",
		],
	},
	mono: {
		name: "Monochrome",
		colors: ["#000000", "#FFFFFF"],
	},
	pc98: {
		name: "PC-9801",
		colors: [
			"#000000",
			"#0000F8",
			"#F80000",
			"#F800F8",
			"#00F800",
			"#00F8F8",
			"#F8F800",
			"#F8F8F8",
			"#888888",
			"#000088",
			"#880000",
			"#880088",
			"#008800",
			"#008888",
			"#888800",
			"#C0C0C0",
		],
	},
	msx: {
		name: "MSX1",
		colors: [
			"#000000",
			"#3EB849",
			"#74D07D",
			"#5955E0",
			"#8076F1",
			"#B95E51",
			"#65DBEF",
			"#DB6559",
			"#FF897D",
			"#CCC35E",
			"#DED087",
			"#3AA241",
			"#B766B5",
			"#CCCCCC",
			"#FFFFFF",
		],
	},
	c64: {
		name: "Commodore 64",
		colors: [
			"#000000",
			"#FFFFFF",
			"#813338",
			"#75CEC8",
			"#8E3C97",
			"#56AC4D",
			"#2E2C9B",
			"#EDF171",
			"#8E5029",
			"#553800",
			"#C46C71",
			"#4A4A4A",
			"#7B7B7B",
			"#A9FF9F",
			"#706DEB",
			"#B2B2B2",
		],
	},
	arne16: {
		name: "Arne 16",
		colors: [
			"#000000",
			"#9D9D9D",
			"#FFFFFF",
			"#BE2633",
			"#E06F8B",
			"#493C2B",
			"#A46422",
			"#EB8931",
			"#F7E26B",
			"#2F484E",
			"#44891A",
			"#A3CE27",
			"#1B2632",
			"#005784",
			"#31A2F2",
			"#B2DCEF",
		],
	},
	sfc_sprite: {
		name: "SFC風 (16色/スプライト)",
		colors: [], // K-means 16色 + 15bit丸め
	},
	sfc_bg: {
		name: "SFC風 (256色/背景)",
		colors: [], // K-means 256色 + 15bit丸め
	},
};

export const PROCESS_DEFAULTS = {
	preRemoveBackground: true,
	postRemoveBackground: true,
	// 「四隅から連結」だけでなく、背景色（四隅の色）に近いピクセルを画像全体で透過にする
	// ※背景と同じ色がキャラクター内にある場合、それも透過されうるためUIで切替可能にする
	removeInnerBackground: false,
	// 出力後に内容物BBoxでトリムする（既定はON）
	trimToContent: true,
	autoGridFromTrimmed: true,
	// autoGridFromTrimmed のグリッド推定を高速化する（結果が変わる可能性あり）
	fastAutoGridFromTrimmed: true,
	// グリッド検出と縮小を有効にする（デフォルトON）
	enableGridDetection: true,

	floatingMaxPixels: PROCESS_RANGES.floatingMaxPixels.default,
	reduceColors: false,
	reduceColorMode: "none", // "none" | "auto" | "gb_legacy" | "gb_pocket" | "gb_light" | "pico8" | "nes" | "mono" | "custom"
	ditherMode: "none",
	colorCount: PROCESS_RANGES.colorCount.default,
	ditherStrength: PROCESS_RANGES.ditherStrength.default,
	outlineStyle: "none",
	outlineColor: PROCESS_RANGES.outlineColor,
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
