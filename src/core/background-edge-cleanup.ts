import { BACKGROUND_EDGE_CLEANUP_LIMITS } from "../shared/config";
import type { PixelGrid, RawImage } from "../shared/types";
import type { BackgroundModel } from "./background";

/** 画像の最外周に透明画素が 1 つでもあるか。 */
const hasTransparentBorder = (image: RawImage): boolean => {
	const width = image.width;
	const height = image.height;
	const data = image.data;
	for (let x = 0; x < width; x += 1) {
		if (data[x * 4 + 3] === 0) return true;
		if (data[((height - 1) * width + x) * 4 + 3] === 0) return true;
	}
	for (let y = 0; y < height; y += 1) {
		if (data[y * width * 4 + 3] === 0) return true;
		if (data[(y * width + width - 1) * 4 + 3] === 0) return true;
	}
	return false;
};

/**
 * 透明画素からの 8 近傍距離を、不透明画素について求める。距離 1 が透明に隣接する縁で、
 * 補正対象から外れる画素には 0 が入る。透明画素が無ければ null を返す。
 *
 * [Intended] 外周に透明画素がある画像でだけ、画像外を透明として扱う。トリミング後の
 * 出力では被写体の最外行・最外列がそのまま画像端になるため、画像外を不透明扱いにすると
 * その行だけ補正から漏れる。一方、透過が内側の閉領域や小領域除去だけで生じた画像では
 * 外周は縁ではないので、画像外を無条件に透明とみなすと（小さな出力では画像全体が）
 * 縁扱いになってしまう。
 */
const buildEdgeDepth = (
	image: RawImage,
	maxDepth: number,
): Uint8Array | null => {
	const width = image.width;
	const height = image.height;
	const pixelCount = width * height;
	const data = image.data;
	let hasTransparent = false;
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		if (data[pixel * 4 + 3] === 0) {
			hasTransparent = true;
			break;
		}
	}
	if (!hasTransparent) return null;
	const outsideIsTransparent = hasTransparentBorder(image);
	const depth = new Uint8Array(pixelCount);
	const queue = new Uint32Array(pixelCount);
	let tail = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x;
			if (data[pixel * 4 + 3] === 0) continue;
			let adjacent =
				outsideIsTransparent &&
				(x === 0 || y === 0 || x === width - 1 || y === height - 1);
			for (let dy = -1; dy <= 1 && !adjacent; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue;
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
					if (data[(ny * width + nx) * 4 + 3] === 0) {
						adjacent = true;
						break;
					}
				}
			}
			if (!adjacent) continue;
			depth[pixel] = 1;
			queue[tail] = pixel;
			tail += 1;
		}
	}
	let head = 0;
	while (head < tail) {
		const pixel = queue[head];
		head += 1;
		const current = depth[pixel];
		if (current >= maxDepth) continue;
		const x = pixel % width;
		const y = (pixel / width) | 0;
		for (let dy = -1; dy <= 1; dy += 1) {
			for (let dx = -1; dx <= 1; dx += 1) {
				if (dx === 0 && dy === 0) continue;
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
				const next = ny * width + nx;
				if (depth[next] !== 0 || data[next * 4 + 3] === 0) continue;
				depth[next] = current + 1;
				queue[tail] = next;
				tail += 1;
			}
		}
	}
	return depth;
};

/** 混色線の探索結果を書き戻す作業領域。画素ごとに確保し直さないよう使い回す。 */
type LineProbe = {
	/** 採用した画素群の平均色。 */
	r: number;
	g: number;
	b: number;
	/** 平均に使った画素数。0 なら差し替えない。 */
	count: number;
};

/**
 * 背景色 bg から向き (dirR, dirG, dirB) へ伸びる混色線の上に乗る原寸画素を、セル内から探す。
 * まず線上で最も背景から遠い距離を求め、次にその近傍にある画素の平均色を作る。
 */
const probeMixingLine = (
	source: RawImage,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	bgR: number,
	bgG: number,
	bgB: number,
	dirR: number,
	dirG: number,
	dirB: number,
	currentDistance: number,
	probe: LineProbe,
): void => {
	const data = source.data;
	const width = source.width;
	const noiseFloor = BACKGROUND_EDGE_CLEANUP_LIMITS.lineNoiseFloor;
	const slopeRatio = BACKGROUND_EDGE_CLEANUP_LIMITS.lineSlopeRatio;
	const maxOffAxis = BACKGROUND_EDGE_CLEANUP_LIMITS.maxLineOffAxis;
	// [Intended] 出力色を「背景と候補色の混色」として説明できる範囲で候補を打ち切る。
	// 上限が無いと、混色では説明できないほど遠い色（別の陰影・別部位）まで代表色になる。
	const maxDistance =
		currentDistance / (1 - BACKGROUND_EDGE_CLEANUP_LIMITS.maxBackgroundShare);
	let farthest = currentDistance;
	for (let y = y0; y < y1; y += 1) {
		const row = y * width;
		for (let x = x0; x < x1; x += 1) {
			const offset = (row + x) * 4;
			if (data[offset + 3] === 0) continue;
			const deltaR = data[offset] - bgR;
			const deltaG = data[offset + 1] - bgG;
			const deltaB = data[offset + 2] - bgB;
			const distance = deltaR * dirR + deltaG * dirG + deltaB * dirB;
			if (distance <= farthest || distance > maxDistance) continue;
			const offAxisR = deltaR - distance * dirR;
			const offAxisG = deltaG - distance * dirG;
			const offAxisB = deltaB - distance * dirB;
			const allowed = Math.min(
				maxOffAxis,
				noiseFloor + slopeRatio * (distance - currentDistance),
			);
			if (
				offAxisR * offAxisR + offAxisG * offAxisG + offAxisB * offAxisB >
				allowed * allowed
			) {
				continue;
			}
			farthest = distance;
		}
	}
	probe.count = 0;
	probe.r = 0;
	probe.g = 0;
	probe.b = 0;
	if (
		farthest <
		currentDistance / (1 - BACKGROUND_EDGE_CLEANUP_LIMITS.minBackgroundShare)
	) {
		return;
	}
	// [Intended] 最遠の 1 画素だけを採用するとノイズ画素へ引きずられるため、
	// 線の先端付近に集まる画素の平均を代表色にする。
	const minimumDistance = farthest * BACKGROUND_EDGE_CLEANUP_LIMITS.tipShare;
	let sumR = 0;
	let sumG = 0;
	let sumB = 0;
	let count = 0;
	for (let y = y0; y < y1; y += 1) {
		const row = y * width;
		for (let x = x0; x < x1; x += 1) {
			const offset = (row + x) * 4;
			if (data[offset + 3] === 0) continue;
			const deltaR = data[offset] - bgR;
			const deltaG = data[offset + 1] - bgG;
			const deltaB = data[offset + 2] - bgB;
			const distance = deltaR * dirR + deltaG * dirG + deltaB * dirB;
			if (distance < minimumDistance || distance > maxDistance) continue;
			const offAxisR = deltaR - distance * dirR;
			const offAxisG = deltaG - distance * dirG;
			const offAxisB = deltaB - distance * dirB;
			const allowed = Math.min(
				maxOffAxis,
				noiseFloor + slopeRatio * (distance - currentDistance),
			);
			if (
				offAxisR * offAxisR + offAxisG * offAxisG + offAxisB * offAxisB >
				allowed * allowed
			) {
				continue;
			}
			sumR += data[offset];
			sumG += data[offset + 1];
			sumB += data[offset + 2];
			count += 1;
		}
	}
	if (count === 0) return;
	probe.r = sumR / count;
	probe.g = sumG / count;
	probe.b = sumB / count;
	probe.count = count;
};

/**
 * 縮小後の出力に残った「背景色に汚染された縁の色」を、原寸の本来の色へ差し替える。
 *
 * セル代表色は原寸のセル内から 1 画素を選ぶ。背景と被写体が同じセルに入ると、
 * 両者の中間にあるアンチエイリアス画素が最も総距離の小さい代表になりやすく、
 * 「背景色が薄く混ざった被写体の色」が出力へ残る。ドーナツの下端の黒い輪郭が
 * 暗い緑になるのがこれである。
 *
 * [Intended] 汚染画素は背景色 bg と本来の色 C の線形混色なので、bg から出力色へ
 * 伸ばした半直線の上に C が乗る。同じセルの原寸画素からその線上でより背景から遠い色を
 * 探し、見つかればそこへ差し替える。倍率のようなしきい値で「背景に近い色」を決めないため、
 * 背景色に似た色を意図的に持つ被写体を巻き込まない。
 *
 * [Intended] 候補は「出力色を bg と候補色の混色として説明できる」範囲に限る。線からの
 * ずれと背景混合率の両方に上限があるので、同じセルに濃淡がある被写体で、汚染のない縁画素が
 * 別の陰影の色へ寄ることはない。
 *
 * [Policy] アルファは触らない。シルエット・出力サイズ・トリミング・格子検出の結果を
 * 一切動かさず、色だけを直す。背景の許容を広げてオブジェクトを欠けさせないための制約。
 */
export const cleanBackgroundContaminatedEdges = (
	image: RawImage,
	source: RawImage,
	grid: PixelGrid,
	model: BackgroundModel,
): number => {
	if (model.clusters.length === 0) return 0;
	const depth = buildEdgeDepth(image, BACKGROUND_EDGE_CLEANUP_LIMITS.maxDepth);
	if (depth === null) return 0;
	const width = image.width;
	const height = image.height;
	const data = image.data;
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const probe: LineProbe = { r: 0, g: 0, b: 0, count: 0 };
	let cleaned = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x;
			const offset = pixel * 4;
			if (depth[pixel] === 0) continue;
			const r = data[offset];
			const g = data[offset + 1];
			const b = data[offset + 2];
			let nearestCluster = 0;
			let nearestDistanceSquared = Number.POSITIVE_INFINITY;
			for (let cluster = 0; cluster < model.clusters.length; cluster += 1) {
				const rgb = model.clusters[cluster].rgb;
				const deltaR = r - rgb.r;
				const deltaG = g - rgb.g;
				const deltaB = b - rgb.b;
				const distanceSquared =
					deltaR * deltaR + deltaG * deltaG + deltaB * deltaB;
				if (distanceSquared < nearestDistanceSquared) {
					nearestDistanceSquared = distanceSquared;
					nearestCluster = cluster;
				}
			}
			const distance = Math.sqrt(nearestDistanceSquared);
			// [Intended] 背景色そのものに極めて近い画素は混色の向きが決まらないので触らない。
			if (distance < BACKGROUND_EDGE_CLEANUP_LIMITS.minSeparation) continue;
			const bg = model.clusters[nearestCluster].rgb;
			const dirR = (r - bg.r) / distance;
			const dirG = (g - bg.g) / distance;
			const dirB = (b - bg.b) / distance;
			const cellX0 = Math.max(0, Math.floor(cropX + x * grid.cellW));
			const cellY0 = Math.max(0, Math.floor(cropY + y * grid.cellH));
			const cellX1 = Math.min(
				source.width,
				Math.ceil(cropX + (x + 1) * grid.cellW),
			);
			const cellY1 = Math.min(
				source.height,
				Math.ceil(cropY + (y + 1) * grid.cellH),
			);
			if (cellX1 <= cellX0 || cellY1 <= cellY0) continue;
			probeMixingLine(
				source,
				cellX0,
				cellY0,
				cellX1,
				cellY1,
				bg.r,
				bg.g,
				bg.b,
				dirR,
				dirG,
				dirB,
				distance,
				probe,
			);
			if (probe.count === 0) continue;
			data[offset] = Math.round(probe.r);
			data[offset + 1] = Math.round(probe.g);
			data[offset + 2] = Math.round(probe.b);
			cleaned += 1;
		}
	}
	return cleaned;
};
