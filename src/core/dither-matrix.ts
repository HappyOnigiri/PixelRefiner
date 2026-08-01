import type { DitherMode } from "../shared/types";

const BAYER_2X2 = [0, 2, 3, 1].map((v) => (v + 0.5) / 4);

const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
	(v) => (v + 0.5) / 16,
);

const BAYER_8X8 = [
	0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
	14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
	51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
	61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

const ORDERED_MATRIX = [
	1, 9, 3, 11, 13, 5, 15, 7, 4, 12, 2, 10, 16, 8, 14, 6,
].map((v) => (v - 1 + 0.5) / 16);

export function getDitherMatrix(mode: DitherMode): number[] {
	switch (mode) {
		case "bayer-2x2":
			return BAYER_2X2;
		case "bayer-4x4":
			return BAYER_4X4;
		case "bayer-8x8":
			return BAYER_8X8;
		case "ordered":
			return ORDERED_MATRIX;
		default:
			return ORDERED_MATRIX;
	}
}
