import { TONE_RAMP_MAPPING } from "../shared/config";
import type { PixelData, RGB } from "../shared/types";
import { oklabToRgb, rgbToOklab } from "./colorUtils";

/**
 * 入力の階調（source）をパレットの階調（target）へ対応させる区分線形写像の制御点。
 * どちらも昇順で、同じ長さを持つ。
 */
export type ToneRampMapping = {
	source: number[];
	target: number[];
};

/** パレットの L を昇順で返す。 */
const paletteLightness = (palette: RGB[]): number[] =>
	palette.map((color) => rgbToOklab(color).L).sort((a, b) => a - b);

/**
 * パレットが単一色相の階調ランプ（モノトーン系）かどうかを判定する。
 * 無彩色の色は色相の判定から除外し、有彩色だけで色相の揃い方を見る。
 */
export const isToneRampPalette = (palette: RGB[]): boolean => {
	if (palette.length < 2) return false;
	if (palette.length > TONE_RAMP_MAPPING.maxPaletteColors) return false;

	const lightness = paletteLightness(palette);
	for (let i = 1; i < lightness.length; i++) {
		if (
			lightness[i] - lightness[i - 1] <
			TONE_RAMP_MAPPING.minPaletteLevelGap
		) {
			return false;
		}
	}

	// 有彩色の色相ベクトルを平均方向と比べ、ずれが許容内かを見る。
	const hueA: number[] = [];
	const hueB: number[] = [];
	let sumA = 0;
	let sumB = 0;
	for (let i = 0; i < palette.length; i++) {
		const lab = rgbToOklab(palette[i]);
		const chroma = Math.hypot(lab.a, lab.b);
		if (chroma < TONE_RAMP_MAPPING.achromaticChroma) continue;
		const a = lab.a / chroma;
		const b = lab.b / chroma;
		hueA.push(a);
		hueB.push(b);
		sumA += a;
		sumB += b;
	}
	if (hueA.length === 0) return true;
	// [Intended] 有彩色が 1 色だけのパレットは、色相が揃っているかを確かめようがなく
	// 「黒 + 任意の 1 色」のような階調ランプでない指定まで拾ってしまうため対象外にする。
	if (hueA.length === 1) return false;

	const norm = Math.hypot(sumA, sumB);
	if (norm < 1e-9) return false;
	const meanA = sumA / norm;
	const meanB = sumB / norm;
	const minCos = Math.cos(
		(TONE_RAMP_MAPPING.maxHueDeviationDeg * Math.PI) / 180,
	);
	for (let i = 0; i < hueA.length; i++) {
		if (hueA[i] * meanA + hueB[i] * meanB < minCos) return false;
	}
	return true;
};

/**
 * 各サンプルを最も近い中心へ割り当て、中心ごとの個数と、
 * クラスタで説明できる分散の割合（1 に近いほど階調が離散的）を返す。
 */
const evaluateClusters = (
	sorted: number[],
	centers: number[],
): { counts: number[]; separation: number } => {
	const counts = new Array<number>(centers.length).fill(0);
	let sum = 0;
	for (let i = 0; i < sorted.length; i++) sum += sorted[i];
	const mean = sum / sorted.length;

	let total = 0;
	let within = 0;
	for (let i = 0; i < sorted.length; i++) {
		const value = sorted[i];
		total += (value - mean) ** 2;
		let best = 0;
		let bestDist = Number.MAX_VALUE;
		for (let c = 0; c < centers.length; c++) {
			const dist = Math.abs(value - centers[c]);
			if (dist < bestDist) {
				bestDist = dist;
				best = c;
			}
		}
		counts[best] += 1;
		within += (value - centers[best]) ** 2;
	}
	return { counts, separation: total > 0 ? 1 - within / total : 0 };
};

/** 昇順のサンプル列を k 個の階調へ分ける 1 次元 k-means。 */
const clusterLightness = (sorted: number[], levels: number): number[] => {
	const centers = new Array<number>(levels);
	for (let i = 0; i < levels; i++) {
		centers[i] = sorted[Math.round(((sorted.length - 1) * i) / (levels - 1))];
	}

	const sums = new Array<number>(levels);
	const counts = new Array<number>(levels);
	for (let iter = 0; iter < TONE_RAMP_MAPPING.kmeansIterations; iter++) {
		sums.fill(0);
		counts.fill(0);
		for (let i = 0; i < sorted.length; i++) {
			const value = sorted[i];
			let best = 0;
			let bestDist = Number.MAX_VALUE;
			for (let c = 0; c < levels; c++) {
				const dist = Math.abs(value - centers[c]);
				if (dist < bestDist) {
					bestDist = dist;
					best = c;
				}
			}
			sums[best] += value;
			counts[best] += 1;
		}
		let moved = false;
		for (let c = 0; c < levels; c++) {
			if (counts[c] === 0) continue;
			const next = sums[c] / counts[c];
			if (Math.abs(next - centers[c]) > 1e-6) moved = true;
			centers[c] = next;
		}
		if (!moved) break;
	}
	return centers.sort((a, b) => a - b);
};

/** 外れ値を落とした両端だけを合わせる写像。階調を分けきれない入力で使う。 */
const rangeMapping = (
	sorted: number[],
	targets: number[],
): ToneRampMapping | undefined => {
	const last = sorted.length - 1;
	const lo = sorted[Math.floor(last * TONE_RAMP_MAPPING.fallbackPercentile)];
	const hi =
		sorted[Math.ceil(last * (1 - TONE_RAMP_MAPPING.fallbackPercentile))];
	if (hi - lo < TONE_RAMP_MAPPING.minSourceRange) return undefined;
	return {
		source: [lo, hi],
		target: [targets[0], targets[targets.length - 1]],
	};
};

/**
 * 入力画素からパレットへの階調順マッピングを求める。
 * 対象外のパレットや階調を測れない入力では undefined を返す。
 */
export const resolveToneRampMapping = (
	pixels: PixelData[],
	palette: RGB[],
): ToneRampMapping | undefined => {
	if (!isToneRampPalette(palette)) return undefined;

	const targets = paletteLightness(palette);
	const levels = targets.length;
	let opaque = 0;
	for (let i = 0; i < pixels.length; i++) {
		if (pixels[i].alpha >= TONE_RAMP_MAPPING.alphaThreshold) opaque += 1;
	}
	if (opaque < levels * TONE_RAMP_MAPPING.minSamplesPerLevel) return undefined;

	const stride = Math.max(
		1,
		Math.ceil(opaque / TONE_RAMP_MAPPING.maxGradeSamples),
	);
	const sorted: number[] = [];
	let seen = 0;
	for (let i = 0; i < pixels.length; i++) {
		const pixel = pixels[i];
		if (pixel.alpha < TONE_RAMP_MAPPING.alphaThreshold) continue;
		const index = seen;
		seen += 1;
		if (index % stride !== 0) continue;
		sorted.push(rgbToOklab(pixel).L);
	}
	sorted.sort((a, b) => a - b);

	const centers = clusterLightness(sorted, levels);
	const { counts, separation } = evaluateClusters(sorted, centers);
	// [Intended] 階調が連続的な入力では順位の対応が階調の等化になってしまうので、
	// 階調が離散的に分かれている入力にだけ順序対応を効かせる。
	if (separation < TONE_RAMP_MAPPING.minGradeSeparation) return undefined;
	// [Intended] 入力の階調がパレットより少ないと順位の対応が決まらないので、
	// 最暗と最明だけを合わせる写像へ退避する。
	if (counts.some((count) => count === 0)) return rangeMapping(sorted, targets);
	if (centers[levels - 1] - centers[0] < TONE_RAMP_MAPPING.minSourceRange) {
		return undefined;
	}
	return { source: centers, target: targets };
};

/** 制御点に沿って L を写像する。制御点の外側は端の値へ丸める。 */
const mapLightness = (
	lightness: number,
	source: number[],
	target: number[],
): number => {
	const last = source.length - 1;
	if (lightness <= source[0]) return target[0];
	if (lightness >= source[last]) return target[last];
	for (let i = 1; i <= last; i++) {
		if (lightness > source[i]) continue;
		const span = source[i] - source[i - 1];
		if (span <= 0) return target[i];
		const ratio = (lightness - source[i - 1]) / span;
		return target[i - 1] + (target[i] - target[i - 1]) * ratio;
	}
	return target[last];
};

/**
 * 写像に従って各画素の L だけを移す。色相と彩度は元の値を保つ。
 */
export const applyToneRampMapping = (
	pixels: PixelData[],
	mapping: ToneRampMapping,
): PixelData[] => {
	const { source, target } = mapping;
	const out = new Array<PixelData>(pixels.length);
	for (let i = 0; i < pixels.length; i++) {
		const pixel = pixels[i];
		if (pixel.alpha < TONE_RAMP_MAPPING.alphaThreshold) {
			out[i] = pixel;
			continue;
		}
		const lab = rgbToOklab(pixel);
		const mapped = mapLightness(lab.L, source, target);
		if (mapped === lab.L) {
			out[i] = pixel;
			continue;
		}
		const rgb = oklabToRgb({ L: mapped, a: lab.a, b: lab.b });
		out[i] = { r: rgb.r, g: rgb.g, b: rgb.b, alpha: pixel.alpha };
	}
	return out;
};

/**
 * モノトーン系パレット向けに、入力の階調をパレットの階調へ順序どおり合わせる。
 * 対象外のパレットでは入力をそのまま返す。
 */
export const alignPixelsToToneRamp = (
	pixels: PixelData[],
	palette: RGB[],
): PixelData[] => {
	const mapping = resolveToneRampMapping(pixels, palette);
	if (!mapping) return pixels;
	return applyToneRampMapping(pixels, mapping);
};
