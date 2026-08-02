import type {
	BackgroundRemovalScope,
	Connectivity,
	RawImage,
} from "../shared/types";
import { type BackgroundModel, removeAutomaticBackground } from "./background";
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
 * フラッドフィルによる旧仕様互換の背景除去。
 *
 * - 角の方式: 選択した角からフラッドフィルする（シード色の許容差）。
 * - RGB 方式: 指定 RGB に近いピクセルを走査し、それらをシードにフラッドフィルする。
 *
 * 注記: ここでは連結性を設定できるが、旧来のデフォルトは実質的に 4 方向だった。
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

	// RGB: すべてのピクセルを走査し、一致したピクセルをフラッドフィルのシードにする。
	// 重複したフラッドフィルを避けるため共有の訪問済みマップを使用する（旧来の挙動）。
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

	// 角の方式: 選択した角からのみフラッドフィルする（旧来の挙動）。
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
		| "auto"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb",
	automaticModel?: BackgroundModel,
	// [Intended] 自動除去のロールバックは呼び出し側の診断へ集約する必要があるため、
	// 戻り値を画像のままにして、この出力引数へ書き戻す。
	outcome?: { removalRolledBack: boolean },
): RawImage => {
	if (method === "none") return cloneImage(img);
	if (bgRemovalScope === "off") return cloneImage(img);
	if (method === "auto") {
		const automatic = removeAutomaticBackground(
			img,
			tolerance,
			bgRemovalScope,
			bgConnectivity,
			automaticModel,
		);
		if (outcome && automatic.rolledBack) outcome.removalRolledBack = true;
		return automatic.image;
	}

	// 4/8 連結性が有効なのは selected / outer のみ。
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

	// bgRemovalScope === "all": 旧仕様互換の挙動
	// - まず旧来のフラッドフィルで背景を除去する。
	// - 次に画像全体から bgTargets を走査し、内側の背景を除去する。
	// 注記: ここでは意図的に連結性を 4 方向に固定している。
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
		| "auto"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb",
	bgRgb?: string,
	alphaThreshold = 16,
): Array<[number, number, number]> => {
	if (method === "none" || method === "auto") return [];
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
					// すでに除去対象ではないため記録を中止する
					storing = false;
					pixels = [];
				}
			}

			const x = cur % w;
			const y = (cur / w) | 0;

			// 最近傍スケーリング用のダウンサンプリングロジック
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
		// 除去候補（小さな連結成分）の座標のみ保持する
		if (size <= maxPixels && pixels.length > 0) {
			small.push({ id, pixels, size });
		}
	}

	// 最大の連結成分を「主オブジェクト」とみなし、除去候補であっても保持する
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
