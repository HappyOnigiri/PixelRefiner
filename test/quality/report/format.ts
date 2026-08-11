import type { QualityImageSize } from "../types";

export const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

export const formatMetric = (value: number | undefined): string =>
	value === undefined ? "-" : Number(value.toFixed(3)).toString();

export const formatConfidence = (value: number | null): string =>
	value === null ? "-" : value.toFixed(4);

export const formatImageSize = (size: QualityImageSize): string =>
	`${String(size.width)}x${String(size.height)}px`;
