import type { RGB } from "../shared/types";

/**
 * Parses a GIMP Palette (.gpl) string and returns an array of RGB colors.
 * Ignores comments and header lines.
 */
export const parseGPL = (text: string): RGB[] => {
	const lines = text.split(/\r?\n/);
	const colors: RGB[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Skip header lines until we find a line with digits
		// GIMP Palette format usually has "GIMP Palette" then "Name: ...", "Columns: ...", then "#" or data

		if (
			trimmed.startsWith("#") ||
			trimmed.startsWith("GIMP Palette") ||
			trimmed.includes(":")
		) {
			continue;
		}

		// Try to parse "R G B [Name]"
		const parts = trimmed.split(/\s+/).filter(Boolean);
		if (parts.length >= 3) {
			const r = parseInt(parts[0], 10);
			const g = parseInt(parts[1], 10);
			const b = parseInt(parts[2], 10);

			if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
				colors.push({ r, g, b });
			}
		}
	}

	return colors;
};

/**
 * Generates a GIMP Palette (.gpl) string from an array of RGB colors.
 */
export const generateGPL = (colors: RGB[], name: string): string => {
	const lines = ["GIMP Palette", `Name: ${name}`, "Columns: 4", "#"];

	for (const c of colors) {
		// Format: R G B Name
		const r = c.r.toString().padStart(3, " ");
		const g = c.g.toString().padStart(3, " ");
		const b = c.b.toString().padStart(3, " ");

		// Convert to hex for the name part
		const rHex = c.r.toString(16).padStart(2, "0").toUpperCase();
		const gHex = c.g.toString(16).padStart(2, "0").toUpperCase();
		const bHex = c.b.toString(16).padStart(2, "0").toUpperCase();
		const hex = `#${rHex}${gHex}${bHex}`;

		lines.push(`${r} ${g} ${b}\t${hex}`);
	}

	return lines.join("\n");
};

/**
 * Generates a PNG blob from an array of RGB colors.
 * The image will be 1px high and Npx wide.
 * Note: This function uses DOM APIs so it must run in browser context.
 */
export const generatePaletteImage = (colors: RGB[]): Promise<Blob | null> => {
	return new Promise((resolve) => {
		if (colors.length === 0) {
			resolve(null);
			return;
		}

		const canvas = document.createElement("canvas");
		canvas.width = colors.length;
		canvas.height = 1;
		const ctx = canvas.getContext("2d");

		if (!ctx) {
			resolve(null);
			return;
		}

		const imgData = ctx.createImageData(colors.length, 1);
		for (let i = 0; i < colors.length; i++) {
			const c = colors[i];
			const idx = i * 4;
			imgData.data[idx] = c.r;
			imgData.data[idx + 1] = c.g;
			imgData.data[idx + 2] = c.b;
			imgData.data[idx + 3] = 255; // Alpha
		}
		ctx.putImageData(imgData, 0, 0);

		canvas.toBlob((blob) => {
			resolve(blob);
		}, "image/png");
	});
};

/**
 * Finds the nearest color in the palette using Euclidean distance.
 */
export const findNearestColor = (target: RGB, palette: RGB[]): RGB => {
	if (palette.length === 0) return target;

	let minDist = Infinity;
	let nearest = palette[0];

	for (const p of palette) {
		// Simple Euclidean distance in RGB space
		const dr = target.r - p.r;
		const dg = target.g - p.g;
		const db = target.b - p.b;
		const dist = dr * dr + dg * dg + db * db;

		if (dist < minDist) {
			minDist = dist;
			nearest = p;
		}
	}

	return nearest;
};

/**
 * Sorts palette colors by relative luminance (perceived brightness).
 * Sorts from Brightest to Darkest.
 */
export const sortPalette = (palette: RGB[]): RGB[] => {
	return [...palette].sort((a, b) => {
		// Calculate relative luminance
		// L = 0.2126*R + 0.7152*G + 0.0722*B (Rec. 709)
		// or simpler: 0.299*R + 0.587*G + 0.114*B (Rec. 601)
		// Using Rec. 601 for simplicity as it matches common perception well enough
		const getLum = (c: RGB) => c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
		return getLum(b) - getLum(a); // Descending (High L -> Low L)
	});
};

/**
 * Extracts unique colors from ImageData.
 * @param imageData - The ImageData to extract colors from
 * @param maxColors - Maximum number of colors to return (default: no limit)
 * @returns Object containing extracted colors array and total unique color count
 */
export const extractColorsFromImage = (
	imageData: ImageData,
	maxColors?: number,
): { colors: RGB[]; totalColors: number } => {
	const colors: RGB[] = [];
	const seen = new Set<string>();
	const data = imageData.data;

	// Extract all unique colors
	for (let i = 0; i < data.length; i += 4) {
		// Skip transparent pixels (alpha < 128)
		if (data[i + 3] < 128) continue;

		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const key = `${r},${g},${b}`;

		if (!seen.has(key)) {
			seen.add(key);
			colors.push({ r, g, b });
		}
	}

	const totalColors = colors.length;

	// If maxColors is specified and we have more colors than the limit,
	// sort by luminance and return the top N colors
	if (maxColors !== undefined && colors.length > maxColors) {
		const sorted = sortPalette(colors);
		return {
			colors: sorted.slice(0, maxColors),
			totalColors,
		};
	}

	return { colors, totalColors };
};
