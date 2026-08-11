import { GRID_SEARCH_LIMITS } from "../../shared/config";
import type { Axis, GridSignalOptions, RawImage } from "../../shared/types";

export type AxisSignalProfile = {
	colorBoundary: Float64Array;
	luminanceGradient: Float64Array;
	alphaGradient: Float64Array;
	localGradients: Float64Array[];
};

export type AxisSignalScores = {
	colorBoundary: number;
	luminanceGradient: number;
	alphaGradient: number;
	autocorrelation: number;
	localPhaseStability: number;
	methodAgreement: number;
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const linearChannel = (value: number): number => {
	const normalized = value / 255;
	return normalized <= 0.04045
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
};

export const createLinearLuminance = (image: RawImage): Float32Array => {
	const luminance = new Float32Array(image.width * image.height);
	for (let pixel = 0; pixel < luminance.length; pixel += 1) {
		const index = pixel * 4;
		luminance[pixel] =
			linearChannel(image.data[index]) * 0.2126 +
			linearChannel(image.data[index + 1]) * 0.7152 +
			linearChannel(image.data[index + 2]) * 0.0722;
	}
	return luminance;
};

export const createAxisSignalProfile = (
	image: RawImage,
	mask: RawImage,
	axis: Axis,
	orthogonalStride: number,
	luminance: Float32Array,
): AxisSignalProfile => {
	const length = axis === "x" ? image.width : image.height;
	const orthogonalLength = axis === "x" ? image.height : image.width;
	const colorBoundary = new Float64Array(length + 1);
	const luminanceGradient = new Float64Array(length + 1);
	const alphaGradient = new Float64Array(length + 1);
	const localGradients = new Array<Float64Array>(
		GRID_SEARCH_LIMITS.localRegionCount,
	);
	const localSamples = new Array<Uint32Array>(
		GRID_SEARCH_LIMITS.localRegionCount,
	);
	for (let region = 0; region < localGradients.length; region += 1) {
		localGradients[region] = new Float64Array(length + 1);
		localSamples[region] = new Uint32Array(length + 1);
	}
	const data = image.data;
	const maskData = mask.data;
	for (let position = 1; position < length; position += 1) {
		let colorTotal = 0;
		let luminanceTotal = 0;
		let alphaTotal = 0;
		let samples = 0;
		for (
			let orthogonal = 0;
			orthogonal < orthogonalLength;
			orthogonal += orthogonalStride
		) {
			const beforePixel =
				axis === "x"
					? orthogonal * image.width + position - 1
					: (position - 1) * image.width + orthogonal;
			const afterPixel = beforePixel + (axis === "x" ? 1 : image.width);
			if (
				maskData[beforePixel * 4 + 3] < 16 &&
				maskData[afterPixel * 4 + 3] < 16
			)
				continue;
			const before = beforePixel * 4;
			const after = afterPixel * 4;
			const color =
				(Math.abs(data[before] - data[after]) +
					Math.abs(data[before + 1] - data[after + 1]) +
					Math.abs(data[before + 2] - data[after + 2])) /
				(3 * 255);
			const luminanceDifference = Math.abs(
				luminance[beforePixel] - luminance[afterPixel],
			);
			const alpha = Math.abs(data[before + 3] - data[after + 3]) / 255;
			colorTotal += color;
			luminanceTotal += luminanceDifference;
			alphaTotal += alpha;
			samples += 1;
			const region = Math.min(
				localGradients.length - 1,
				Math.floor((orthogonal * localGradients.length) / orthogonalLength),
			);
			localGradients[region][position] +=
				color * 0.45 + luminanceDifference * 0.35 + alpha * 0.2;
			localSamples[region][position] += 1;
		}
		if (samples === 0) continue;
		colorBoundary[position] = colorTotal / samples;
		luminanceGradient[position] = luminanceTotal / samples;
		alphaGradient[position] = alphaTotal / samples;
	}
	for (let region = 0; region < localGradients.length; region += 1) {
		const values = localGradients[region];
		const counts = localSamples[region];
		for (let position = 1; position < values.length - 1; position += 1) {
			if (counts[position] > 0) values[position] /= counts[position];
		}
	}
	return { colorBoundary, luminanceGradient, alphaGradient, localGradients };
};

/**
 * 両軸の信号プロファイルを、輝度配列と直交方向の間引き幅ごと 1 度で作る。
 *
 * [Policy] プロファイルを必要とする箇所はこの関数を通す。輝度配列の生成と
 * 間引き幅の算出を各所で書き写すと、片方だけ条件が変わったときに軸ごとの
 * 走査範囲が食い違う。
 */
export const createAxisSignalProfiles = (
	image: RawImage,
	mask: RawImage,
): {
	x: AxisSignalProfile;
	y: AxisSignalProfile;
	orthogonalStride: number;
} => {
	const orthogonalStride = Math.max(
		1,
		Math.ceil(
			Math.max(image.width, image.height) /
				GRID_SEARCH_LIMITS.maxAnalysisDimension,
		),
	);
	const luminance = createLinearLuminance(image);
	return {
		x: createAxisSignalProfile(image, mask, "x", orthogonalStride, luminance),
		y: createAxisSignalProfile(image, mask, "y", orthogonalStride, luminance),
		orthogonalStride,
	};
};

export const combineSignalProfiles = (
	profile: AxisSignalProfile,
	options: GridSignalOptions,
): Float64Array => {
	const combined = new Float64Array(profile.colorBoundary.length);
	for (let index = 1; index < combined.length - 1; index += 1) {
		if (options.colorBoundary) combined[index] += profile.colorBoundary[index];
		if (options.luminanceAlphaGradient) {
			combined[index] += profile.luminanceGradient[index] * 0.7;
			combined[index] += profile.alphaGradient[index] * 0.3;
		}
	}
	return combined;
};

const edgeAt = (edges: Float64Array, position: number): number => {
	const center = Math.round(position);
	let value = 0;
	for (let delta = -1; delta <= 1; delta += 1) {
		const index = center + delta;
		if (index <= 0 || index >= edges.length - 1) continue;
		const distance = Math.abs(position - index);
		value = Math.max(value, edges[index] * Math.max(0, 1 - distance));
	}
	return value;
};

export const gridAlignmentScore = (
	edges: Float64Array,
	cell: number,
	phase: number,
	normalizePhase: (value: number, cell: number) => number,
): number => {
	let totalEdge = 0;
	let alignedEdge = 0;
	let maxEdge = 0;
	for (let position = 1; position < edges.length - 1; position += 1) {
		const edge = edges[position];
		totalEdge += edge;
		maxEdge = Math.max(maxEdge, edge);
		const remainder = normalizePhase(position - phase, cell);
		const distance = Math.min(remainder, cell - remainder);
		if (distance <= 0.625) alignedEdge += edge;
	}
	let predictedEvidence = 0;
	let predictedCount = 0;
	for (
		let boundary = phase === 0 ? cell : phase;
		boundary < edges.length - 1;
		boundary += cell
	) {
		predictedEvidence += edgeAt(edges, boundary);
		predictedCount += 1;
	}
	const recall = totalEdge === 0 ? 0 : alignedEdge / totalEdge;
	const precision =
		predictedCount === 0 || maxEdge === 0
			? 0
			: predictedEvidence / (predictedCount * maxEdge);
	return clampUnit(recall * 0.65 + precision * 0.35);
};

const lagCorrelation = (values: Float64Array, lag: number): number => {
	if (
		lag < 1 ||
		values.length - lag < GRID_SEARCH_LIMITS.minimumAutocorrelationSamples
	)
		return 0;
	let mean = 0;
	let samples = 0;
	for (let index = 1; index < values.length - 1; index += 1) {
		mean += values[index];
		samples += 1;
	}
	if (samples === 0) return 0;
	mean /= samples;
	let covariance = 0;
	let leftVariance = 0;
	let rightVariance = 0;
	for (let index = 1; index + lag < values.length - 1; index += 1) {
		const left = values[index] - mean;
		const right = values[index + lag] - mean;
		covariance += left * right;
		leftVariance += left * left;
		rightVariance += right * right;
	}
	const denominator = Math.sqrt(leftVariance * rightVariance);
	return denominator === 0 ? 0 : clampUnit(covariance / denominator);
};

export const autocorrelationScore = (
	edges: Float64Array,
	cell: number,
): number => {
	const baseLag = Math.max(1, Math.round(cell));
	return clampUnit(
		lagCorrelation(edges, baseLag) * 0.55 +
			lagCorrelation(edges, baseLag * 2) * 0.3 +
			lagCorrelation(edges, baseLag * 3) * 0.15,
	);
};

const agreementScore = (values: number[], count: number): number => {
	if (count <= 1) return count === 0 ? 0 : 1;
	let mean = 0;
	for (let index = 0; index < count; index += 1) mean += values[index];
	mean /= count;
	let variance = 0;
	for (let index = 0; index < count; index += 1) {
		const delta = values[index] - mean;
		variance += delta * delta;
	}
	return clampUnit(1 - Math.sqrt(variance / count) * 2);
};

export const scoreAxisSignals = (
	profile: AxisSignalProfile,
	combined: Float64Array,
	cell: number,
	phase: number,
	options: GridSignalOptions,
	normalizePhase: (value: number, cell: number) => number,
	/**
	 * セル幅ごとに一度だけ求めた自己相関スコア。
	 * [Intended] 自己相関は位相に依存しないため、同じセル幅で位相だけを変える
	 * 探索では再計算が無駄になる。呼び出し元が使い回せるよう受け取れるようにする。
	 */
	precomputedAutocorrelation?: number,
): AxisSignalScores => {
	const colorBoundary = options.colorBoundary
		? gridAlignmentScore(profile.colorBoundary, cell, phase, normalizePhase)
		: 0;
	const luminanceGradient = options.luminanceAlphaGradient
		? gridAlignmentScore(profile.luminanceGradient, cell, phase, normalizePhase)
		: 0;
	const alphaGradient = options.luminanceAlphaGradient
		? gridAlignmentScore(profile.alphaGradient, cell, phase, normalizePhase)
		: 0;
	const autocorrelation = options.autocorrelation
		? (precomputedAutocorrelation ?? autocorrelationScore(combined, cell))
		: 0;
	let localPhaseStability = 0;
	if (options.localPhaseStability) {
		const localScores = new Array<number>(profile.localGradients.length);
		for (let region = 0; region < profile.localGradients.length; region += 1) {
			localScores[region] = gridAlignmentScore(
				profile.localGradients[region],
				cell,
				phase,
				normalizePhase,
			);
		}
		localPhaseStability = agreementScore(localScores, localScores.length);
	}
	const enabledScores = new Array<number>(5);
	let enabledCount = 0;
	if (options.colorBoundary) enabledScores[enabledCount++] = colorBoundary;
	if (options.luminanceAlphaGradient) {
		enabledScores[enabledCount++] = luminanceGradient;
		enabledScores[enabledCount++] = alphaGradient;
	}
	if (options.autocorrelation) enabledScores[enabledCount++] = autocorrelation;
	if (options.localPhaseStability)
		enabledScores[enabledCount++] = localPhaseStability;
	return {
		colorBoundary,
		luminanceGradient,
		alphaGradient,
		autocorrelation,
		localPhaseStability,
		methodAgreement: agreementScore(enabledScores, enabledCount),
	};
};
