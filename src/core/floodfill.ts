import type { RawImage } from "../shared/types";
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

export const floodFillTransparent = (
	img: RawImage,
	startX: number,
	startY: number,
	tolerance: number,
): void => {
	if (startX < 0 || startY < 0 || startX >= img.width || startY >= img.height) {
		return;
	}
	const seed = getPixel(img, startX, startY);
	const target: [number, number, number] = [seed[0], seed[1], seed[2]];
	const visited = new Uint8Array(img.width * img.height);
	const stack: Array<[number, number]> = [[startX, startY]];

	while (stack.length > 0) {
		const [x, y] = stack.pop() as [number, number];
		const idx = y * img.width + x;
		if (visited[idx] === 1) {
			continue;
		}
		visited[idx] = 1;
		const px = getPixel(img, x, y);
		if (!withinTolerance([px[0], px[1], px[2]], target, tolerance)) {
			continue;
		}
		if (px[3] === 0) {
			continue;
		}
		setPixel(img, x, y, [px[0], px[1], px[2], 0]);
		if (x > 0) stack.push([x - 1, y]);
		if (x < img.width - 1) stack.push([x + 1, y]);
		if (y > 0) stack.push([x, y - 1]);
		if (y < img.height - 1) stack.push([x, y + 1]);
	}
};
