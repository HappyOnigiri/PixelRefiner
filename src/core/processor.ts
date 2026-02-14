import {
	clampInt,
	clampOptionalInt,
	PROCESS_DEFAULTS,
	PROCESS_RANGES,
	RETRO_PALETTES,
} from "../shared/config";
import type { Pixel, PixelData, PixelGrid, RawImage } from "../shared/types";
import { type DetectOptions, detectGrid } from "./detector";
import { floodFillTransparent } from "./floodfill";
import { OklabKMeans, PaletteQuantizer } from "./quantizer";

const cloneImage = (img: RawImage): RawImage => ({
	width: img.width,
	height: img.height,
	data: new Uint8ClampedArray(img.data),
});

const medianOf = (values: number[]): number => {
	const n = values.length;
	if (n === 0) return 0;
	// 結果に影響しない（中央値のみ必要）ため、コピーせず in-place にソートする。
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

	// 各ピクセルごとの配列生成を避け、再利用する（値の列と順序は維持）。
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

export type ProcessOptions = DetectOptions & {
	preRemoveBackground?: boolean;
	postRemoveBackground?: boolean;
	/**
	 * 内容物BBoxでトリムした後、指定したピクセルサイズ(W×H)に強制変換する。
	 * 有効なときは自動グリッド検出(detectGrid)を行わない。
	 *
	 * 注意:
	 * - 有効条件は forcePixelsW/H の両方が指定されていること
	 * - 拡大が必要な場合は最近傍相当（sampleWindow=1）で変換する
	 */
	forcePixelsW?: number;
	forcePixelsH?: number;
	/**
	 * 背景除去（pre/post/トリム用マスク）で、四隅と近い背景色を画像全体で透過にする。
	 * 四隅から連結していない「内側の背景色」（例: ドーナツ穴）も透過できる。
	 */
	removeInnerBackground?: boolean;
	backgroundTolerance?: number;
	sampleWindow?: number;
	trimToContent?: boolean;
	trimAlphaThreshold?: number;
	/**
	 * 背景に囲まれて浮いている「小さな島」（連結成分）を背景扱いにして除去する。
	 * 微小ノイズで内容物BBox/グリッド推定が引っ張られるのを防ぐ。
	 *
	 * 注意: 画像内に「離れた別オブジェクト」がある場合、それも除去されうるため既定はOFF。
	 */
	ignoreFloatingContent?: boolean;
	/**
	 * ignoreFloatingContent=true のとき、除去対象とみなす最大ピクセル数（元画像ピクセル）。
	 */
	floatingMaxPixels?: number;
	/**
	 * trimToContent=true のとき、背景除去→BBoxクロップした領域から出力グリッド(outW/outH)を推定する。
	 */
	autoGridFromTrimmed?: boolean;
	/**
	 * autoGridFromTrimmed のグリッド推定を高速化する（結果が変わる可能性あり）。
	 * OFFにすると従来の探索ロジックを使用する。
	 *
	 * 既定: true
	 */
	fastAutoGridFromTrimmed?: boolean;
	/**
	 * グリッド検出と縮小を有効にする（デフォルトON）。
	 * OFFにすると、グリッド検出と縮小をスキップします（等倍ドット絵用）。
	 * 背景トリミングと背景透過は引き続き有効。
	 */
	enableGridDetection?: boolean;
	/**
	 * 減色を有効にする。
	 */
	reduceColors?: boolean;
	/**
	 * 減色モード
	 */
	reduceColorMode?: string;
	/**
	 * 減色後の色数。
	 */
	colorCount?: number;
	/**
	 * 背景抽出方法
	 */
	bgExtractionMethod?:
		| "none"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb";
	/**
	 * RGB指定時の背景色 (#rrggbb)
	 */
	bgRgb?: string;
	/**
	 * デバッグ用に中間画像を取り出すためのフック。
	 * ブラウザ環境でも動くよう、PNG書き出し等は呼び出し側で行う。
	 */
	debugHook?: (
		name: string,
		img: RawImage,
		meta?: Record<string, unknown>,
	) => void;
};

const normalizeProcessOptions = (
	options: ProcessOptions | undefined,
): {
	detect: DetectOptions;
	preRemoveBackground: boolean;
	postRemoveBackground: boolean;
	forcePixelsW?: number;
	forcePixelsH?: number;
	removeInnerBackground: boolean;
	backgroundTolerance: number;
	sampleWindow: number;
	trimToContent: boolean;
	trimAlphaThreshold: number;
	autoGridFromTrimmed: boolean;
	fastAutoGridFromTrimmed: boolean;
	enableGridDetection: boolean;
	reduceColors: boolean;
	reduceColorMode: string;
	colorCount: number;
	ignoreFloatingContent: boolean;
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
	const removeInnerBackground =
		raw.removeInnerBackground ?? PROCESS_DEFAULTS.removeInnerBackground;
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
	const enableGridDetection =
		raw.enableGridDetection ?? PROCESS_DEFAULTS.enableGridDetection;
	const reduceColors = raw.reduceColors ?? PROCESS_DEFAULTS.reduceColors;
	const reduceColorMode =
		raw.reduceColorMode ?? PROCESS_DEFAULTS.reduceColorMode;
	const colorCount = clampInt(
		raw.colorCount ?? PROCESS_DEFAULTS.colorCount,
		PROCESS_RANGES.colorCount,
	);
	const ignoreFloatingContent =
		raw.ignoreFloatingContent ?? PROCESS_DEFAULTS.ignoreFloatingContent;
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
		removeInnerBackground,
		backgroundTolerance,
		sampleWindow,
		trimToContent,
		trimAlphaThreshold,
		autoGridFromTrimmed,
		fastAutoGridFromTrimmed,
		enableGridDetection,
		reduceColors,
		reduceColorMode,
		colorCount,
		ignoreFloatingContent,
		floatingMaxPixels,
		bgExtractionMethod,
		bgRgb,
		debug,
		debugHook: raw.debugHook,
	};
};

const removeBackgroundByFloodFill = (
	img: RawImage,
	tolerance: number,
	method:
		| "none"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb" = "top-left",
	bgRgb?: string,
): RawImage => {
	if (method === "none") return cloneImage(img);

	const out = cloneImage(img);
	const w = img.width;
	const h = img.height;

	if (method === "rgb" && bgRgb) {
		const hex = bgRgb.replace("#", "");
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		// 指定色のピクセルを全走査してシードにする
		// 効率化のため、visited配列を共有して重複走査を防ぐ
		const visited = new Uint8Array(w * h);
		const src32 = new Uint32Array(img.data.buffer);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const idx = y * w + x;
				if (visited[idx]) continue;

				const pixel = src32[idx];
				const pr = pixel & 0xff;
				const pg = (pixel >> 8) & 0xff;
				const pb = (pixel >> 16) & 0xff;

				if (
					Math.abs(pr - r) <= tolerance &&
					Math.abs(pg - g) <= tolerance &&
					Math.abs(pb - b) <= tolerance
				) {
					// 既に透過処理済みのピクセルはスキップ
					if (out.data[idx * 4 + 3] !== 0) {
						floodFillTransparent(out, x, y, tolerance, visited);
					}
				}
				visited[idx] = 1;
			}
		}
		return out;
	}

	const corners: Array<[number, number]> = [];
	if (method === "top-left") corners.push([0, 0]);
	else if (method === "bottom-left") corners.push([0, h - 1]);
	else if (method === "top-right") corners.push([w - 1, 0]);
	else if (method === "bottom-right") corners.push([w - 1, h - 1]);

	for (const [x, y] of corners) {
		floodFillTransparent(out, x, y, tolerance);
	}
	return out;
};

const removeBackground = (
	img: RawImage,
	tolerance: number,
	removeInnerBackground: boolean,
	bgTargets: Array<[number, number, number]>,
	method:
		| "none"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb" = "top-left",
	bgRgb?: string,
): RawImage => {
	if (method === "none") return cloneImage(img);

	const out = removeBackgroundByFloodFill(img, tolerance, method, bgRgb);
	if (!removeInnerBackground) return out;

	// 入力画像（クロップ前）から推定した「背景色候補」を、画像全体に適用する。
	if (bgTargets.length === 0) return out;

	const out32 = new Uint32Array(out.data.buffer);
	for (let i = 0; i < out.data.length; i += 4) {
		const a = out.data[i + 3];
		if (a === 0) continue;

		const pixel = out32[i / 4];
		const r = pixel & 0xff;
		const g = (pixel >> 8) & 0xff;
		const b = (pixel >> 16) & 0xff;

		for (const [tr, tg, tb] of bgTargets) {
			if (
				Math.abs(r - tr) <= tolerance &&
				Math.abs(g - tg) <= tolerance &&
				Math.abs(b - tb) <= tolerance
			) {
				out.data[i + 3] = 0;
				break;
			}
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
		throw new Error("working と masked のサイズが一致しません。");
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
					// これ以上は除去対象にならないので、記録をやめる
					storing = false;
					pixels = [];
				}
			}

			const x = cur % w;
			const y = (cur / w) | 0;

			// 4-neighborhood
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
		// 除去候補（小さいもの）だけ座標を保持しておく
		if (size <= maxPixels && pixels.length > 0) {
			small.push({ id, pixels, size });
		}
	}

	// 最大の連結成分は「本体」とみなし、除去候補でも残す
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

const applyColorReduction = (
	img: RawImage,
	mode: string,
	colorCount: number,
	log: (...args: unknown[]) => void,
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

	// SFCモードの場合は、減色前に15bitカラーに丸めることで、
	// K-meansがSFCの色空間内で最適なパレットを選べるようにする
	let workingPixelData = pixelData;
	const isSfcMode = mode === "sfc_sprite" || mode === "sfc_bg";
	if (isSfcMode) {
		workingPixelData = pixelData.map((p) => ({
			r: Math.round(p.r / 8) * 8,
			g: Math.round(p.g / 8) * 8,
			b: Math.round(p.b / 8) * 8,
			alpha: p.alpha,
		}));
	}

	let reducedPixels: PixelData[];
	if (mode === "auto" || isSfcMode) {
		let count = colorCount;
		if (mode === "sfc_sprite") count = 16;
		else if (mode === "sfc_bg") count = 256;

		const quantizer = new OklabKMeans(count);
		reducedPixels = quantizer.quantize(workingPixelData);
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
			reducedPixels = quantizer.quantize(workingPixelData);
		} else {
			// Fallback to auto if palette not found
			const quantizer = new OklabKMeans(colorCount);
			reducedPixels = quantizer.quantize(workingPixelData);
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

const _getPixelAt = (
	img: RawImage,
	x: number,
	y: number,
	out?: Pixel,
): Pixel => {
	const idx = (y * img.width + x) * 4;
	if (out) {
		out[0] = img.data[idx];
		out[1] = img.data[idx + 1];
		out[2] = img.data[idx + 2];
		out[3] = img.data[idx + 3];
		return out;
	}
	return [
		img.data[idx],
		img.data[idx + 1],
		img.data[idx + 2],
		img.data[idx + 3],
	];
};

type GridEstimateFromTrimmed = {
	outW: number;
	outH: number;
	cellW: number;
	cellH: number;
	offsetX: number;
	offsetY: number;
};

interface GridSearchFromTrimmedStrategy {
	search: (
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
	) => GridEstimateFromTrimmed | null;
}

class LegacyGridSearchFromTrimmed implements GridSearchFromTrimmedStrategy {
	search(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
	): GridEstimateFromTrimmed | null {
		return legacySearchGridFromTrimmed(cropped, mask, sampleWindow);
	}
}

class FastGridSearchFromTrimmed implements GridSearchFromTrimmedStrategy {
	private scan(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		outHMin: number,
		outHMax: number,
		outHStep: number,
		pixelStride: number,
	): { bestOutH: number; est: GridEstimateFromTrimmed } | null {
		const ratio = cropped.width / Math.max(1, cropped.height);
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

		for (let outH = outHMin; outH <= outHMax; outH += outHStep) {
			const outW = Math.max(2, Math.round(outH * ratio));
			if (outW > 256 || outH > 256) continue;

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

			// 再構成誤差（背景は mask の alpha=0 を無視）
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
			// 過分割は再構成誤差が単調に下がりがちなので、セル数に比例したペナルティを足す
			const complexityPenalty = 0.0025 * (outW * outH);
			const score = reconErr + complexityPenalty;

			if (!best || score < best.score) {
				best = { outW, outH, cellW, cellH, score };
			}
		}

		if (!best) return null;
		return {
			bestOutH: best.outH,
			est: {
				outW: best.outW,
				outH: best.outH,
				cellW: best.cellW,
				cellH: best.cellH,
				offsetX: 0,
				offsetY: 0,
			},
		};
	}

	search(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
	): GridEstimateFromTrimmed | null {
		// 比率に基づき outH を振って outW を決める（探索空間を抑える）
		const outHMin = Math.max(2, Math.floor(cropped.height / 32));
		// 1セルが小さすぎる（=過分割）と常に誤差が下がってしまうため、最低でも 4px/セル程度を要求する
		const outHMax = Math.min(
			128,
			Math.max(outHMin, Math.floor(cropped.height / 4)),
		);

		// 画像が大きいほど、粗いスキップで候補数を減らす
		const span = outHMax - outHMin;
		const outHStep = span >= 64 ? 3 : span >= 32 ? 2 : 1;

		// 再構成誤差の評価点を間引く（大きい画像ほど効果が大きい）
		const maxDim = Math.max(cropped.width, cropped.height);
		const pixelStride = Math.min(4, Math.max(1, Math.floor(maxDim / 512)));

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

		// 粗探索ベスト近傍だけを細かく再探索（範囲は狭いので stride を少し戻す）
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
		return refined?.est ?? coarse.est;
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
): GridEstimateFromTrimmed | null => {
	// 比率に基づき outH を振って outW を決める（探索空間を抑える）
	const ratio = cropped.width / Math.max(1, cropped.height);
	const outHMin = Math.max(2, Math.floor(cropped.height / 32));
	// 1セルが小さすぎる（=過分割）と常に誤差が下がってしまうため、最低でも 4px/セル程度を要求する
	const outHMax = Math.min(
		128,
		Math.max(outHMin, Math.floor(cropped.height / 4)),
	);

	let best: {
		outW: number;
		outH: number;
		cellW: number;
		cellH: number;
		score: number;
	} | null = null;

	for (let outH = outHMin; outH <= outHMax; outH += 1) {
		const outW = Math.max(2, Math.round(outH * ratio));
		if (outW > 256 || outH > 256) continue;

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

		// 再構成誤差（背景は mask の alpha=0 を無視）
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
		// 過分割は再構成誤差が単調に下がりがちなので、セル数に比例したペナルティを足す
		const complexityPenalty = 0.0025 * (outW * outH);
		const score = reconErr + complexityPenalty;

		if (!best || score < best.score) {
			best = { outW, outH, cellW, cellH, score };
		}
	}

	if (!best) return null;
	return {
		outW: best.outW,
		outH: best.outH,
		cellW: best.cellW,
		cellH: best.cellH,
		offsetX: 0,
		offsetY: 0,
	};
};

export const processImage = (
	img: RawImage,
	options: ProcessOptions = {},
): { result: RawImage; grid: PixelGrid } => {
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
	const bgTargets = o.removeInnerBackground
		? getBackgroundTargets(img, o.bgExtractionMethod, o.bgRgb, 16)
		: [];
	log(
		`Background targets extracted in ${(performance.now() - bgTargetsStart).toFixed(2)}ms`,
		bgTargets,
	);

	const workingStart = performance.now();
	const working = o.preRemoveBackground
		? removeBackgroundByFloodFill(
				img,
				o.backgroundTolerance,
				o.bgExtractionMethod,
				o.bgRgb,
			)
		: cloneImage(img);
	log(
		`Pre-background removal done in ${(performance.now() - workingStart).toFixed(2)}ms`,
	);

	o.debugHook?.("00-input", img);
	o.debugHook?.("01-working", working, {
		preRemoveBackground: o.preRemoveBackground,
	});
	const trimToContent = o.trimToContent;
	const trimAlphaThreshold = o.trimAlphaThreshold;

	// force: 内容物BBoxでトリム → 指定ピクセル(W×H)へ強制変換（自動検出は行わない）
	if (o.forcePixelsW !== undefined && o.forcePixelsH !== undefined) {
		const bgTol = o.backgroundTolerance;
		const masked = removeBackground(
			working,
			bgTol,
			o.removeInnerBackground,
			bgTargets,
			o.bgExtractionMethod,
			o.bgRgb,
		);
		if (o.ignoreFloatingContent) {
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
			throw new Error("内容物が見つからないため指定ピクセル変換できません。");
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

		// 拡大が必要な場合は最近傍相当（sampleWindow=1）にする
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

		const postBgStart = performance.now();
		const result2 = o.postRemoveBackground
			? removeBackground(
					down2,
					o.backgroundTolerance,
					o.removeInnerBackground,
					bgTargets,
					o.bgExtractionMethod,
					o.bgRgb,
				)
			: down2;
		log(
			`Post-background removal done in ${(performance.now() - postBgStart).toFixed(2)}ms`,
		);

		// 減色処理
		let finalResult = result2;
		if (o.reduceColors) {
			finalResult = applyColorReduction(
				result2,
				o.reduceColorMode,
				o.colorCount,
				log,
			);
		}

		o.debugHook?.("99-result", finalResult, {
			postRemoveBackground: o.postRemoveBackground,
			forced: true,
		});
		log(
			`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`,
		);
		return { result: finalResult, grid: g };
	}

	// enableGridDetection: グリッド検出と縮小をスキップ
	if (!o.enableGridDetection) {
		const bgTol = o.backgroundTolerance;
		const masked = removeBackground(
			working,
			bgTol,
			o.removeInnerBackground,
			bgTargets,
			o.bgExtractionMethod,
			o.bgRgb,
		);
		if (o.ignoreFloatingContent) {
			removeSmallFloatingComponentsInPlace(
				working,
				masked,
				trimAlphaThreshold,
				o.floatingMaxPixels,
			);
		}

		let resultImg = working;
		let outW = working.width;
		let outH = working.height;
		let cropX = 0;
		let cropY = 0;

		if (o.trimToContent) {
			const b = findOpaqueBounds(masked, trimAlphaThreshold);
			if (b) {
				resultImg = cropRawImage(working, b.x, b.y, b.w, b.h);
				outW = b.w;
				outH = b.h;
				cropX = b.x;
				cropY = b.y;
			}
		}

		const g: PixelGrid = {
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
			score: 1,
		};

		const result = o.postRemoveBackground
			? removeBackground(
					resultImg,
					o.backgroundTolerance,
					o.removeInnerBackground,
					bgTargets,
					o.bgExtractionMethod,
					o.bgRgb,
				)
			: resultImg;

		// 減色処理
		let finalResult = result;
		if (o.reduceColors) {
			finalResult = applyColorReduction(
				result,
				o.reduceColorMode,
				o.colorCount,
				log,
			);
		}

		log(
			`Grid detection disabled mode: ${outW}x${outH}`,
			`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`,
		);
		return { result: finalResult, grid: g };
	}

	// auto: まず背景トリム（縮小前）した領域から outW/outH を推定して、そのまま縮小する
	// （隙間の多い画像でも、内容物領域にフォーカスして安定させたい）
	const autoGridFromTrimmed = o.autoGridFromTrimmed;

	// 縮小前（downsample前）に「背景トリミング後」の見た目を確認できるように出力する。
	// 実処理のパイプラインは変えず、デバッグ用途のみで算出する。
	const bgTol = o.backgroundTolerance;
	const maskedStart = performance.now();
	const maskedForDebugOrAuto =
		o.debugHook || autoGridFromTrimmed || o.ignoreFloatingContent
			? removeBackground(
					working,
					bgTol,
					o.removeInnerBackground,
					bgTargets,
					o.bgExtractionMethod,
					o.bgRgb,
				)
			: null;
	if (maskedForDebugOrAuto) {
		log(
			`Masked image for debug/auto created in ${(performance.now() - maskedStart).toFixed(2)}ms`,
		);
	}

	if (maskedForDebugOrAuto && o.ignoreFloatingContent) {
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
			const est = gridSearcher.search(cropped, croppedMask, sw);
			log(
				`Grid search from trimmed done in ${(performance.now() - searchStart).toFixed(2)}ms`,
				est,
			);
			if (est) {
				// NOTE:
				// - トリムOFF時でも「内容物BBoxからの推定グリッド」は使いたい（潰れ対策）。
				// - ただしトリムOFFは背景（余白）を残すだけなので、縮小は全体(working)に適用する。
				//   これにより、中心オブジェクトのセル数（見かけサイズ）は一定になりやすい。
				const outW = Math.max(1, Math.floor(working.width / est.cellW));
				const outH = Math.max(1, Math.floor(working.height / est.cellH));
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
					score: 0,
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

	let trimmed = down;
	let trimmedGrid = grid;
	if (trimToContent) {
		const trimStart = performance.now();
		// 背景（四隅から連結）を透過化した上で、内容物のBBoxでセル単位にトリムする。
		// これにより、上下左右に大きな余白がある画像でも outW/outH を「内容物」に合わせられる。
		const bgTol = o.backgroundTolerance;
		const masked = removeBackground(
			down,
			bgTol,
			o.removeInnerBackground,
			bgTargets,
			o.bgExtractionMethod,
			o.bgRgb,
		);
		o.debugHook?.("06-post-downsample-masked", masked, { bgTol });
		const b = findOpaqueBounds(masked, trimAlphaThreshold);
		if (
			b &&
			(b.x !== 0 || b.y !== 0 || b.w !== down.width || b.h !== down.height)
		) {
			trimmed = cropRawImage(down, b.x, b.y, b.w, b.h);
			o.debugHook?.("07-trimmed", trimmed, { bounds: b });
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
				o.removeInnerBackground,
				bgTargets,
				o.bgExtractionMethod,
				o.bgRgb,
			)
		: trimmed;
	log(
		`Post-background removal done in ${(performance.now() - postBgStart).toFixed(2)}ms`,
	);

	// 減色処理
	let finalResult = result;
	if (o.reduceColors) {
		finalResult = applyColorReduction(
			result,
			o.reduceColorMode,
			o.colorCount,
			log,
		);
	}

	o.debugHook?.("99-result", finalResult, {
		postRemoveBackground: o.postRemoveBackground,
		reduceColors: o.reduceColors,
		colorCount: o.colorCount,
	});
	log(`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`);
	return { result: finalResult, grid: trimmedGrid };
};
