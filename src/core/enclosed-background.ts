import type { RawImage } from "../shared/types";

/**
 * 成分が背景の穴とみなせるかを、成分の画素列から判定する。
 * pixels は再利用される作業バッファなので、size 個までだけを読むこと。
 */
export type EnclosedComponentTest = (
	pixels: Uint32Array,
	size: number,
) => boolean;

/**
 * 外周から連結しない背景候補（内側の閉領域）のうち、透過してよい成分だけを selected へ足す。
 *
 * [Intended] 内側の閉領域は「背景の穴」と「被写体の塗り面」のどちらでもありうる。
 * 白背景キャラの白い目とドーナツの中空は色も面積も一致しうるので、誤って被写体へ穴を
 * 開けないよう次の条件をすべて満たす成分だけを対象にする。
 * - 画像端に接しない: 端に接する領域は背景の続きであり、外周からの連結判定が扱う。
 * - 内部に別要素の島が無い: 島を含む閉領域は線画の塗り面である公算が高い。
 * - 呼び出し側の色判定 isBackgroundComponent を通る: 通常の候補許容より厳しい一致を要求する。
 */
export const addEnclosedBackground = (
	img: RawImage,
	candidates: Uint8Array,
	selected: Uint8Array,
	isBackgroundComponent: EnclosedComponentTest,
): void => {
	const width = img.width;
	const height = img.height;
	const pixelCount = width * height;
	const visited = new Uint8Array(pixelCount);
	const queue = new Uint32Array(pixelCount);
	// 島判定で成分メンバーシップを O(1) で引くための作業マスク。成分ごとに戻す。
	const member = new Uint8Array(pixelCount);

	for (let seed = 0; seed < pixelCount; seed += 1) {
		if (!candidates[seed] || selected[seed] || visited[seed]) continue;
		if (img.data[seed * 4 + 3] === 0) continue;

		let head = 0;
		let size = 0;
		visited[seed] = 1;
		queue[size] = seed;
		size += 1;
		let touchesEdge = false;
		let minX = width;
		let maxX = -1;
		let minY = height;
		let maxY = -1;
		while (head < size) {
			const pixel = queue[head];
			head += 1;
			const x = pixel % width;
			const y = (pixel / width) | 0;
			if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
				touchesEdge = true;
			}
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
			if (x > 0) {
				const next = pixel - 1;
				if (
					candidates[next] &&
					!visited[next] &&
					img.data[next * 4 + 3] !== 0
				) {
					visited[next] = 1;
					queue[size] = next;
					size += 1;
				}
			}
			if (x + 1 < width) {
				const next = pixel + 1;
				if (
					candidates[next] &&
					!visited[next] &&
					img.data[next * 4 + 3] !== 0
				) {
					visited[next] = 1;
					queue[size] = next;
					size += 1;
				}
			}
			if (y > 0) {
				const next = pixel - width;
				if (
					candidates[next] &&
					!visited[next] &&
					img.data[next * 4 + 3] !== 0
				) {
					visited[next] = 1;
					queue[size] = next;
					size += 1;
				}
			}
			if (y + 1 < height) {
				const next = pixel + width;
				if (
					candidates[next] &&
					!visited[next] &&
					img.data[next * 4 + 3] !== 0
				) {
					visited[next] = 1;
					queue[size] = next;
					size += 1;
				}
			}
		}

		if (touchesEdge) continue;
		if (!isBackgroundComponent(queue, size)) continue;
		if (hasIsland(width, queue, size, member, minX, maxX, minY, maxY)) continue;

		for (let index = 0; index < size; index += 1) {
			selected[queue[index]] = 1;
		}
	}
};

/**
 * 成分の外接矩形の縁から成分の外側を塗り、縁から届かない画素が残るかを調べる。
 * 残ればその成分は内部に別の要素を囲っている。
 */
const hasIsland = (
	width: number,
	pixels: Uint32Array,
	size: number,
	member: Uint8Array,
	minX: number,
	maxX: number,
	minY: number,
	maxY: number,
): boolean => {
	for (let index = 0; index < size; index += 1) member[pixels[index]] = 1;
	const boxWidth = maxX - minX + 1;
	const boxHeight = maxY - minY + 1;
	const outside = new Uint8Array(boxWidth * boxHeight);
	const boxQueue = new Uint32Array(boxWidth * boxHeight);
	let tail = 0;
	const enqueue = (bx: number, by: number): void => {
		const index = by * boxWidth + bx;
		if (outside[index] || member[(minY + by) * width + minX + bx]) return;
		outside[index] = 1;
		boxQueue[tail] = index;
		tail += 1;
	};
	for (let bx = 0; bx < boxWidth; bx += 1) {
		enqueue(bx, 0);
		enqueue(bx, boxHeight - 1);
	}
	for (let by = 0; by < boxHeight; by += 1) {
		enqueue(0, by);
		enqueue(boxWidth - 1, by);
	}
	let head = 0;
	while (head < tail) {
		const index = boxQueue[head];
		head += 1;
		const bx = index % boxWidth;
		const by = (index / boxWidth) | 0;
		if (bx > 0) enqueue(bx - 1, by);
		if (bx + 1 < boxWidth) enqueue(bx + 1, by);
		if (by > 0) enqueue(bx, by - 1);
		if (by + 1 < boxHeight) enqueue(bx, by + 1);
	}
	let island = false;
	for (let by = 0; by < boxHeight && !island; by += 1) {
		for (let bx = 0; bx < boxWidth; bx += 1) {
			if (outside[by * boxWidth + bx]) continue;
			if (!member[(minY + by) * width + minX + bx]) {
				island = true;
				break;
			}
		}
	}
	for (let index = 0; index < size; index += 1) member[pixels[index]] = 0;
	return island;
};
