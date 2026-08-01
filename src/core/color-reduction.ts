import { RETRO_PALETTES } from "../shared/config";
import type { DitherMode, PixelData, RawImage, RGB } from "../shared/types";
import { OklabKMeans, PaletteQuantizer } from "./quantizer";

export const applyColorReduction = (
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

export const extractUsedColors = (img: RawImage): RGB[] => {
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
