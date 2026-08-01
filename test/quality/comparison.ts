import type { RawImage } from "../../src/shared/types";
import type {
	QualityBaselineCase,
	QualityChangeStatus,
	QualityMetrics,
} from "./types";

export const QUALITY_METRIC_RULES = [
	{ key: "meanRgbaError", direction: "lower", tolerance: 0.000001 },
	{ key: "edgeF1", direction: "higher", tolerance: 0.000001 },
	{ key: "backgroundMaskIou", direction: "higher", tolerance: 0.000001 },
	{
		key: "smallComponentRetention",
		direction: "higher",
		tolerance: 0.000001,
	},
] as const;

export const compareMetrics = (
	current: QualityMetrics,
	baseline: QualityBaselineCase | null,
	currentStatus?: QualityBaselineCase["status"],
): { regressed: string[]; improved: string[] } => {
	if (!baseline) return { regressed: [], improved: [] };
	const regressed: string[] = [];
	const improved: string[] = [];
	for (const rule of QUALITY_METRIC_RULES) {
		const delta = current[rule.key] - baseline[rule.key];
		if (!Number.isFinite(delta)) {
			regressed.push(rule.key);
			continue;
		}
		const signedDelta = rule.direction === "higher" ? delta : -delta;
		if (signedDelta < -rule.tolerance) regressed.push(rule.key);
		else if (signedDelta > rule.tolerance) improved.push(rule.key);
	}
	if (!baseline.catastrophicFailure && current.catastrophicFailure) {
		regressed.push("catastrophicFailure");
	}
	if (baseline.status === "passed" && currentStatus === "failed") {
		regressed.push("status");
	}
	return { regressed, improved };
};

export const compareImages = (
	current: RawImage,
	baseline: RawImage | null,
): {
	changed: boolean;
	changedPixelCount: number | null;
	changedPixelRate: number | null;
	diffBoundingBox: {
		x: number;
		y: number;
		width: number;
		height: number;
	} | null;
} => {
	if (!baseline) {
		return {
			changed: true,
			changedPixelCount: null,
			changedPixelRate: null,
			diffBoundingBox: null,
		};
	}
	if (current.width !== baseline.width || current.height !== baseline.height) {
		return {
			changed: true,
			changedPixelCount: current.width * current.height,
			changedPixelRate: 1,
			diffBoundingBox: {
				x: 0,
				y: 0,
				width: current.width,
				height: current.height,
			},
		};
	}
	let changedPixelCount = 0;
	let minX = current.width;
	let minY = current.height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < current.height; y += 1) {
		for (let x = 0; x < current.width; x += 1) {
			const index = (y * current.width + x) * 4;
			let changed = false;
			for (let channel = 0; channel < 4; channel += 1) {
				if (current.data[index + channel] !== baseline.data[index + channel]) {
					changed = true;
					break;
				}
			}
			if (!changed) continue;
			changedPixelCount += 1;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	return {
		changed: changedPixelCount > 0,
		changedPixelCount,
		changedPixelRate:
			changedPixelCount / Math.max(1, current.width * current.height),
		diffBoundingBox:
			changedPixelCount === 0
				? null
				: {
						x: minX,
						y: minY,
						width: maxX - minX + 1,
						height: maxY - minY + 1,
					},
	};
};

export const classifyChange = (
	hasBaseline: boolean,
	imageChanged: boolean,
	regressed: string[],
	improved: string[],
): QualityChangeStatus => {
	if (!hasBaseline) return "new";
	if (regressed.length > 0) return "regressed";
	if (!imageChanged) return "unchanged";
	if (improved.length > 0) return "improved";
	return "changed";
};
