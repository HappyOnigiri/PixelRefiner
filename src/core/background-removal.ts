import {
	BACKGROUND_MODEL_LIMITS,
	BACKGROUND_RAMP_LIMITS,
} from "../shared/config";
import type {
	BackgroundRemovalScope,
	Connectivity,
	RawImage,
} from "../shared/types";
import { type BackgroundModel, removeAutomaticBackground } from "./background";
import { addEnclosedBackground } from "./enclosed-background";
import { type FloodFillRamp, floodFillTransparent } from "./floodfill";
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

/**
 * 最外周を一周する画素の並び。隣り合う要素が必ず空間的な隣接画素になるので、
 * 「背景の色がなめらかに変化しているか」を段差の連続として測れる。
 */
const buildBorderRing = (w: number, h: number): Uint32Array => {
	const ring = new Uint32Array(2 * (w + h) - 4);
	let cursor = 0;
	for (let x = 0; x < w; x += 1) {
		ring[cursor] = x;
		cursor += 1;
	}
	for (let y = 1; y < h; y += 1) {
		ring[cursor] = y * w + w - 1;
		cursor += 1;
	}
	for (let x = w - 2; x >= 0; x -= 1) {
		ring[cursor] = (h - 1) * w + x;
		cursor += 1;
	}
	for (let y = h - 2; y >= 1; y -= 1) {
		ring[cursor] = y * w;
		cursor += 1;
	}
	return ring;
};

/**
 * 背景がなめらかなグラデーションかどうかを最外周から判定し、必要ならランプ許容を返す。
 *
 * - 隣接ペアの段差がほぼすべて小さい: 強いエッジ（被写体や模様）が混ざっていない。
 * - リング内のチャンネル値レンジが tolerance を超える: 絶対差だけでは覆いきれない。
 *
 * [Intended] この 2 条件が揃うときだけランプ許容を使う。単色パディングや模様のある
 * 写真では条件を満たさないため、従来の絶対差だけの塗りつぶしと完全に同じ結果になる。
 */
export const detectBackgroundRamp = (
	img: RawImage,
	tolerance: number,
): FloodFillRamp | undefined => {
	const w = img.width;
	const h = img.height;
	if (tolerance <= 0 || w < 3 || h < 3) return undefined;
	const ring = buildBorderRing(w, h);
	const data = img.data;
	let pairs = 0;
	let smoothPairs = 0;
	let minR = 255;
	let minG = 255;
	let minB = 255;
	let maxR = 0;
	let maxG = 0;
	let maxB = 0;
	for (let i = 0; i < ring.length; i += 1) {
		const offset = ring[i] * 4;
		if (data[offset + 3] !== 255) continue;
		const r = data[offset];
		const g = data[offset + 1];
		const b = data[offset + 2];
		if (r < minR) minR = r;
		if (r > maxR) maxR = r;
		if (g < minG) minG = g;
		if (g > maxG) maxG = g;
		if (b < minB) minB = b;
		if (b > maxB) maxB = b;
		const nextOffset = ring[(i + 1) % ring.length] * 4;
		if (data[nextOffset + 3] !== 255) continue;
		pairs += 1;
		const step = Math.max(
			Math.abs(r - data[nextOffset]),
			Math.abs(g - data[nextOffset + 1]),
			Math.abs(b - data[nextOffset + 2]),
		);
		if (step <= BACKGROUND_RAMP_LIMITS.maxSmoothStep) smoothPairs += 1;
	}
	if (pairs < BACKGROUND_RAMP_LIMITS.minRingPairs) return undefined;
	if (smoothPairs < pairs * BACKGROUND_RAMP_LIMITS.minSmoothRatio) {
		return undefined;
	}
	const range = Math.max(maxR - minR, maxG - minG, maxB - minB);
	if (range <= tolerance) return undefined;
	return {
		stepTolerance: Math.min(BACKGROUND_RAMP_LIMITS.maxSmoothStep, tolerance),
		// 背景自身の広がり（リングのレンジ）に tolerance 分の余裕を足した範囲までしか
		// 開始色から離れさせない。
		seedLimit: range + tolerance,
	};
};

const countOpaquePixels = (img: RawImage): number => {
	let opaque = 0;
	for (let pixel = 0; pixel < img.width * img.height; pixel += 1) {
		if (img.data[pixel * 4 + 3] !== 0) opaque += 1;
	}
	return opaque;
};

/**
 * ランプ許容付きの塗りつぶしを試し、削りすぎた場合は絶対差のみの結果へ巻き戻す。
 *
 * [Intended] 段差の小ささだけでは、被写体側へなめらかにつながる経路があると
 * 回り込んで削りすぎる。最終的な除去率でも歯止めをかける二段構えにする。
 */
const fillWithRampFallback = (
	img: RawImage,
	tolerance: number,
	fill: (target: RawImage, ramp: FloodFillRamp | undefined) => void,
): RawImage => {
	const ramp = detectBackgroundRamp(img, tolerance);
	if (ramp !== undefined) {
		const opaqueBefore = countOpaquePixels(img);
		const ramped = cloneImage(img);
		fill(ramped, ramp);
		const removed = opaqueBefore - countOpaquePixels(ramped);
		if (
			opaqueBefore === 0 ||
			removed <= opaqueBefore * BACKGROUND_RAMP_LIMITS.maxRemovalRatio
		) {
			return ramped;
		}
	}
	const strict = cloneImage(img);
	fill(strict, undefined);
	return strict;
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

	const w = img.width;
	const h = img.height;

	// RGB: すべてのピクセルを走査し、一致したピクセルをフラッドフィルのシードにする。
	// 重複したフラッドフィルを避けるため共有の訪問済みマップを使用する（旧来の挙動）。
	if (method === "rgb") {
		if (bgTargets.length === 0) return cloneImage(img);
		const src32 = new Uint32Array(img.data.buffer);
		return fillWithRampFallback(img, tolerance, (out, ramp) => {
			const visited = new Uint8Array(w * h);
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
							floodFillTransparent(
								out,
								x,
								y,
								tolerance,
								visited,
								connectivity,
								ramp,
							);
						}
					}
					visited[idx] = 1;
				}
			}
		});
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
	return fillWithRampFallback(img, tolerance, (out, ramp) => {
		floodFillTransparent(out, sx, sy, tolerance, undefined, connectivity, ramp);
	});
};

/**
 * 外周の背景を除去した画像に対し、被写体に囲まれた背景色の閉領域を透過する。
 *
 * [Intended] 指定色そのものに近い閉領域だけを対象にするため、成分の平均色へ
 * 通常許容よりも厳しい一致（enclosedToleranceRatio 倍）を要求する。指定色に近いだけの
 * 塗り面（線画の内側、フキダシ、白背景の白い目）を残すのが狙い。
 */
const removeEnclosedTargets = (
	img: RawImage,
	tolerance: number,
	bgTargets: Array<[number, number, number]>,
): void => {
	if (bgTargets.length === 0) return;
	const pixelCount = img.width * img.height;
	const candidates = new Uint8Array(pixelCount);
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const offset = pixel * 4;
		if (img.data[offset + 3] === 0) continue;
		if (
			isCandidate(
				img.data[offset],
				img.data[offset + 1],
				img.data[offset + 2],
				bgTargets,
				tolerance,
			)
		) {
			candidates[pixel] = 1;
		}
	}
	const strictTolerance =
		tolerance * BACKGROUND_MODEL_LIMITS.enclosedToleranceRatio;
	const selected = new Uint8Array(pixelCount);
	addEnclosedBackground(img, candidates, selected, (pixels, size) => {
		let sumR = 0;
		let sumG = 0;
		let sumB = 0;
		for (let index = 0; index < size; index += 1) {
			const offset = pixels[index] * 4;
			sumR += img.data[offset];
			sumG += img.data[offset + 1];
			sumB += img.data[offset + 2];
		}
		return isCandidate(
			sumR / size,
			sumG / size,
			sumB / size,
			bgTargets,
			strictTolerance,
		);
	});
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		if (selected[pixel]) img.data[pixel * 4 + 3] = 0;
	}
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

	if (bgRemovalScope === "outer" || bgRemovalScope === "auto") {
		const w = img.width;
		const h = img.height;
		const border = getBorderPixels(w, h);
		const outer = fillWithRampFallback(img, tolerance, (out, ramp) => {
			const visited = new Uint8Array(w * h);
			const data = out.data;

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
				floodFillTransparent(
					out,
					sx,
					sy,
					tolerance,
					visited,
					bgConnectivity,
					ramp,
				);
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
		});
		if (bgRemovalScope === "auto") {
			removeEnclosedTargets(outer, tolerance, bgTargets);
		}
		return outer;
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
	// [Intended] 公開済み floatingMaxPixels の旧仕様互換専用。
	// 新しい自動処理は components.ts で論理ピクセルへ変換した後に行う。
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
