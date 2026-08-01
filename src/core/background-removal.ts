import type {
	BackgroundRemovalScope,
	Connectivity,
	RawImage,
} from "../shared/types";
import { floodFillTransparent } from "./floodfill";
import { cloneImage } from "./image-operations";

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
export const removeBackgroundByFloodFillLegacy = (
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

export const removeBackground = (
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

export const getBackgroundTargets = (
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

export const removeSmallFloatingComponentsInPlace = (
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
