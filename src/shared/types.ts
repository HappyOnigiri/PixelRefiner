export type RawImage = {
	width: number;
	height: number;
	data: Uint8ClampedArray; // RGBA
};

export type Pixel = [number, number, number, number] | Uint8ClampedArray;

export type PixelGrid = {
	cellW: number;
	cellH: number;
	offsetX: number;
	offsetY: number;
	score: number;
	cropX?: number;
	cropY?: number;
	cropW?: number;
	cropH?: number;
	outW?: number;
	outH?: number;
	scoreX?: number;
	scoreY?: number;
};

export type Axis = "x" | "y";

export interface RGB {
	r: number; // 0-255
	g: number; // 0-255
	b: number; // 0-255
}

export type OutlineStyle = "none" | "rounded" | "sharp";

export interface Oklab {
	L: number; // Lightness
	a: number; // Green-Red component
	b: number; // Blue-Yellow component
}

// 透過情報付きのピクセルデータ
export interface PixelData extends RGB {
	alpha: number; // 0-255 (Alpha)
}

export type DitherMode = "none" | "floyd-steinberg";

export interface Palette {
	id: string;
	name: string;
	colors: RGB[];
}
