import type { Connectivity, Pixel, RawImage } from "../shared/types";
import { getPixel, setPixel } from "./ops";

const withinTolerance = (
	a: [number, number, number],
	b: [number, number, number],
	tol: number,
): boolean => {
	return (
		Math.abs(a[0] - b[0]) <= tol &&
		Math.abs(a[1] - b[1]) <= tol &&
		Math.abs(a[2] - b[2]) <= tol
	);
};

const NEIGHBORS_4: Array<[number, number]> = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
];

const NEIGHBORS_8: Array<[number, number]> = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
	[-1, -1],
	[-1, 1],
	[1, -1],
	[1, 1],
];

export const floodFillTransparent = (
	img: RawImage,
	startX: number,
	startY: number,
	tolerance: number,
	visitedExternal?: Uint8Array,
	connectivity: Connectivity = "4",
): void => {
	if (startX < 0 || startY < 0 || startX >= img.width || startY >= img.height) {
		return;
	}
	const seed = getPixel(img, startX, startY);
	const target: [number, number, number] = [seed[0], seed[1], seed[2]];
	const visited = visitedExternal ?? new Uint8Array(img.width * img.height);
	const stack: Array<[number, number]> = [[startX, startY]];
	const neighbors = connectivity === "8" ? NEIGHBORS_8 : NEIGHBORS_4;
	const w = img.width;
	const h = img.height;

	const currentPx: Pixel = [0, 0, 0, 0];
	while (stack.length > 0) {
		const [x, y] = stack.pop() as [number, number];
		const idx = y * w + x;
		if (visited[idx] === 1) {
			continue;
		}
		visited[idx] = 1;
		getPixel(img, x, y, currentPx);
		if (
			!withinTolerance(
				[currentPx[0], currentPx[1], currentPx[2]],
				target,
				tolerance,
			)
		) {
			continue;
		}
		if (currentPx[3] === 0) {
			continue;
		}
		setPixel(img, x, y, [currentPx[0], currentPx[1], currentPx[2], 0]);
		for (const [dx, dy] of neighbors) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
				stack.push([nx, ny]);
			}
		}
	}
};
