export const computeMedian = (values: number[]): number => {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}
	return sorted[mid];
};

export const computeVariance = (values: number[]): number => {
	if (values.length === 0) {
		return 0;
	}
	const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
	const variance =
		values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
	return variance;
};

export const computePercentile = (values: number[], p: number): number => {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const clamped = Math.min(100, Math.max(0, p));
	const idx = (clamped / 100) * (sorted.length - 1);
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) {
		return sorted[lo];
	}
	const t = idx - lo;
	return sorted[lo] * (1 - t) + sorted[hi] * t;
};
