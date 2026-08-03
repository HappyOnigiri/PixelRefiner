import {
	BACKGROUND_MODEL_LIMITS,
	SMALL_COMPONENT_LIMITS,
} from "../shared/config";
import type {
	RawImage,
	SmallComponentRemovalDiagnostic,
	SmallComponentRemovalMode,
} from "../shared/types";

type Component = {
	id: number;
	size: number;
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	sumR: number;
	sumG: number;
	sumB: number;
	sumA: number;
	maxEdge: number;
};

export type SmallComponentRemovalOptions = {
	mode: SmallComponentRemovalMode;
	alphaThreshold: number;
	backgroundEnabled: boolean;
	automaticBackground: boolean;
	backgroundConfidence?: number;
};

export type SmallComponentRemovalResult = {
	image: RawImage;
	mask: RawImage;
	diagnostic: SmallComponentRemovalDiagnostic;
};

const diagnostic = (
	mode: SmallComponentRemovalMode,
	applied: boolean,
	skippedReason?: SmallComponentRemovalDiagnostic["skippedReason"],
): SmallComponentRemovalDiagnostic => ({
	mode,
	applied,
	skippedReason,
	removedComponents: 0,
	removedPixels: 0,
	pixelBasis: "logical",
});

const assertSameSize = (left: RawImage, right: RawImage): void => {
	if (left.width !== right.width || left.height !== right.height) {
		throw new Error("Small-component images must have matching dimensions.");
	}
};

const luminanceAt = (data: Uint8ClampedArray, pixel: number): number => {
	const offset = pixel * 4;
	return (
		(77 * data[offset] + 150 * data[offset + 1] + 29 * data[offset + 2]) >> 8
	);
};

const edgeDelta = (
	evidence: RawImage,
	pixel: number,
	neighbor: number,
): number =>
	Math.abs(
		luminanceAt(evidence.data, pixel) - luminanceAt(evidence.data, neighbor),
	);

const componentCenterX2 = (component: Component): number =>
	component.minX + component.maxX;

const componentCenterY2 = (component: Component): number =>
	component.minY + component.maxY;

const componentWidth = (component: Component): number =>
	component.maxX - component.minX + 1;

const componentHeight = (component: Component): number =>
	component.maxY - component.minY + 1;

const meanChannel = (sum: number, size: number): number =>
	Math.round(sum / Math.max(1, size));

const colorBucket = (component: Component): string => {
	const tolerance = SMALL_COMPONENT_LIMITS.matchingColorChannelTolerance;
	const red = Math.round(
		meanChannel(component.sumR, component.size) / tolerance,
	);
	const green = Math.round(
		meanChannel(component.sumG, component.size) / tolerance,
	);
	const blue = Math.round(
		meanChannel(component.sumB, component.size) / tolerance,
	);
	const alpha = Math.round(
		meanChannel(component.sumA, component.size) / tolerance,
	);
	return `${red}:${green}:${blue}:${alpha}`;
};

const shapeColorKey = (component: Component): string =>
	`${componentWidth(component)}:${componentHeight(component)}:${component.size}:${colorBucket(component)}`;

const shapeKey = (component: Component): string =>
	`${componentWidth(component)}:${componentHeight(component)}:${component.size}`;

const bboxGap = (left: Component, right: Component): number => {
	const xGap = Math.max(
		0,
		left.minX - right.maxX - 1,
		right.minX - left.maxX - 1,
	);
	const yGap = Math.max(
		0,
		left.minY - right.maxY - 1,
		right.minY - left.maxY - 1,
	);
	return Math.max(xGap, yGap);
};

const isOutlineExtension = (candidate: Component, main: Component): boolean => {
	const minLength = SMALL_COMPONENT_LIMITS.outlineMinLength;
	const gap = SMALL_COMPONENT_LIMITS.proximityGap;
	const mainWidth = componentWidth(main);
	const mainHeight = componentHeight(main);
	if (mainWidth === 1 && mainHeight >= minLength) {
		const aligned =
			candidate.minX <= main.maxX + 1 && candidate.maxX >= main.minX - 1;
		const verticalGap = Math.min(
			Math.abs(candidate.minY - main.maxY - 1),
			Math.abs(main.minY - candidate.maxY - 1),
		);
		return aligned && verticalGap <= gap + 1;
	}
	if (mainHeight === 1 && mainWidth >= minLength) {
		const aligned =
			candidate.minY <= main.maxY + 1 && candidate.maxY >= main.minY - 1;
		const horizontalGap = Math.min(
			Math.abs(candidate.minX - main.maxX - 1),
			Math.abs(main.minX - candidate.maxX - 1),
		);
		return aligned && horizontalGap <= gap + 1;
	}
	return false;
};

const findRoot = (parents: Int32Array, id: number): number => {
	let root = id;
	while (parents[root] !== root) root = parents[root];
	let current = id;
	while (parents[current] !== current) {
		const next = parents[current];
		parents[current] = root;
		current = next;
	}
	return root;
};

const union = (parents: Int32Array, left: number, right: number): void => {
	const leftRoot = findRoot(parents, left);
	const rightRoot = findRoot(parents, right);
	if (leftRoot === rightRoot) return;
	if (leftRoot < rightRoot) parents[rightRoot] = leftRoot;
	else parents[leftRoot] = rightRoot;
};

const analyzeComponents = (
	mask: RawImage,
	evidence: RawImage,
	alphaThreshold: number,
): { labels: Int32Array; components: Component[]; groupSizes: Int32Array } => {
	const width = mask.width;
	const height = mask.height;
	const pixelCount = width * height;
	const labels = new Int32Array(pixelCount);
	const queue = new Int32Array(pixelCount);
	const components: Component[] = [];
	const isForeground = (pixel: number): boolean =>
		mask.data[pixel * 4 + 3] >= alphaThreshold;

	for (let start = 0; start < pixelCount; start += 1) {
		if (labels[start] !== 0 || !isForeground(start)) continue;
		const id = components.length + 1;
		let read = 0;
		let write = 1;
		queue[0] = start;
		labels[start] = id;
		// [Intended] 全画素分の多列メタデータを確保せず、実在する成分ごとに一度だけ保持する。
		// ピクセル単位の探索ループ内では追加オブジェクトを作らない。
		const component: Component = {
			id,
			size: 0,
			minX: width,
			minY: height,
			maxX: 0,
			maxY: 0,
			sumR: 0,
			sumG: 0,
			sumB: 0,
			sumA: 0,
			maxEdge: 0,
		};
		while (read < write) {
			const pixel = queue[read];
			read += 1;
			const x = pixel % width;
			const y = (pixel / width) | 0;
			const offset = pixel * 4;
			component.size += 1;
			component.minX = Math.min(component.minX, x);
			component.minY = Math.min(component.minY, y);
			component.maxX = Math.max(component.maxX, x);
			component.maxY = Math.max(component.maxY, y);
			component.sumR += evidence.data[offset];
			component.sumG += evidence.data[offset + 1];
			component.sumB += evidence.data[offset + 2];
			component.sumA += evidence.data[offset + 3];
			if (x > 0) {
				const neighbor = pixel - 1;
				component.maxEdge = Math.max(
					component.maxEdge,
					edgeDelta(evidence, pixel, neighbor),
				);
				if (labels[neighbor] === 0 && isForeground(neighbor)) {
					labels[neighbor] = id;
					queue[write] = neighbor;
					write += 1;
				}
			}
			if (x + 1 < width) {
				const neighbor = pixel + 1;
				component.maxEdge = Math.max(
					component.maxEdge,
					edgeDelta(evidence, pixel, neighbor),
				);
				if (labels[neighbor] === 0 && isForeground(neighbor)) {
					labels[neighbor] = id;
					queue[write] = neighbor;
					write += 1;
				}
			}
			if (y > 0) {
				const neighbor = pixel - width;
				component.maxEdge = Math.max(
					component.maxEdge,
					edgeDelta(evidence, pixel, neighbor),
				);
				if (labels[neighbor] === 0 && isForeground(neighbor)) {
					labels[neighbor] = id;
					queue[write] = neighbor;
					write += 1;
				}
			}
			if (y + 1 < height) {
				const neighbor = pixel + width;
				component.maxEdge = Math.max(
					component.maxEdge,
					edgeDelta(evidence, pixel, neighbor),
				);
				if (labels[neighbor] === 0 && isForeground(neighbor)) {
					labels[neighbor] = id;
					queue[write] = neighbor;
					write += 1;
				}
			}
		}
		components.push(component);
	}

	const parents = new Int32Array(components.length + 1);
	for (let id = 1; id < parents.length; id += 1) parents[id] = id;
	// [Intended] 4近傍成分を削除単位に保ちつつ、斜め接続だけを8近傍の保護判定へ使う。
	for (let y = 0; y + 1 < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x;
			const id = labels[pixel];
			if (id === 0) continue;
			if (x > 0) {
				const diagonal = labels[pixel + width - 1];
				if (diagonal !== 0 && diagonal !== id) union(parents, id, diagonal);
			}
			if (x + 1 < width) {
				const diagonal = labels[pixel + width + 1];
				if (diagonal !== 0 && diagonal !== id) union(parents, id, diagonal);
			}
		}
	}
	const groupSizes = new Int32Array(components.length + 1);
	for (let index = 0; index < components.length; index += 1) {
		const component = components[index];
		groupSizes[findRoot(parents, component.id)] += component.size;
	}
	for (let id = 1; id < groupSizes.length; id += 1) {
		groupSizes[id] = groupSizes[findRoot(parents, id)];
	}
	return { labels, components, groupSizes };
};

const protectedBySymmetry = (
	candidate: Component,
	main: Component,
	candidatesByPosition: Map<string, Component>,
): boolean => {
	const tolerance = SMALL_COMPONENT_LIMITS.symmetryTolerance * 2;
	const reflectedX = 2 * componentCenterX2(main) - componentCenterX2(candidate);
	const reflectedY = 2 * componentCenterY2(main) - componentCenterY2(candidate);
	const shape = shapeKey(candidate);
	for (let delta = -tolerance; delta <= tolerance; delta += 1) {
		const horizontal = `${reflectedX + delta}:${componentCenterY2(candidate)}:${shape}`;
		const vertical = `${componentCenterX2(candidate)}:${reflectedY + delta}:${shape}`;
		const horizontalMatch = candidatesByPosition.get(horizontal);
		const verticalMatch = candidatesByPosition.get(vertical);
		if (
			(horizontalMatch && horizontalMatch.id !== candidate.id) ||
			(verticalMatch && verticalMatch.id !== candidate.id)
		) {
			return true;
		}
	}
	return false;
};

export const removeSmallComponents = (
	image: RawImage,
	mask: RawImage,
	evidence: RawImage,
	options: SmallComponentRemovalOptions,
): SmallComponentRemovalResult => {
	assertSameSize(image, mask);
	assertSameSize(image, evidence);
	if (options.mode === "off") {
		return { image, mask, diagnostic: diagnostic(options.mode, false, "off") };
	}
	if (!options.backgroundEnabled) {
		return {
			image,
			mask,
			diagnostic: diagnostic(options.mode, false, "background-disabled"),
		};
	}
	if (
		options.automaticBackground &&
		(options.backgroundConfidence === undefined ||
			options.backgroundConfidence < BACKGROUND_MODEL_LIMITS.minConfidence)
	) {
		return {
			image,
			mask,
			diagnostic: diagnostic(options.mode, false, "low-background-confidence"),
		};
	}

	const maxPixels = SMALL_COMPONENT_LIMITS.maxLogicalPixels[options.mode];
	const { labels, components, groupSizes } = analyzeComponents(
		mask,
		evidence,
		options.alphaThreshold,
	);
	let largest = components[0];
	for (let index = 1; index < components.length; index += 1) {
		if (components[index].size > (largest?.size ?? 0))
			largest = components[index];
	}
	const resultDiagnostic = diagnostic(options.mode, true);
	if (!largest || maxPixels <= 0) {
		return { image, mask, diagnostic: resultDiagnostic };
	}

	const candidates = components.filter(
		(component) => component.id !== largest.id && component.size <= maxPixels,
	);
	const repeated = new Map<string, number>();
	const byPosition = new Map<string, Component>();
	for (let index = 0; index < candidates.length; index += 1) {
		const component = candidates[index];
		const repeatedKey = shapeColorKey(component);
		repeated.set(repeatedKey, (repeated.get(repeatedKey) ?? 0) + 1);
		byPosition.set(
			`${componentCenterX2(component)}:${componentCenterY2(component)}:${shapeKey(component)}`,
			component,
		);
	}

	const removeById = new Uint8Array(components.length + 1);
	for (let index = 0; index < candidates.length; index += 1) {
		const component = candidates[index];
		const meanAlpha = meanChannel(component.sumA, component.size);
		const keep =
			bboxGap(component, largest) <= SMALL_COMPONENT_LIMITS.proximityGap ||
			(repeated.get(shapeColorKey(component)) ?? 0) > 1 ||
			protectedBySymmetry(component, largest, byPosition) ||
			isOutlineExtension(component, largest) ||
			groupSizes[component.id] > maxPixels ||
			component.maxEdge >= SMALL_COMPONENT_LIMITS.strongEdgeDelta ||
			meanAlpha >= SMALL_COMPONENT_LIMITS.highOpacity;
		if (!keep) removeById[component.id] = 1;
	}

	for (let pixel = 0; pixel < labels.length; pixel += 1) {
		if (!removeById[labels[pixel]]) continue;
		resultDiagnostic.removedPixels += 1;
	}
	for (let id = 1; id < removeById.length; id += 1) {
		if (removeById[id]) resultDiagnostic.removedComponents += 1;
	}
	if (resultDiagnostic.removedPixels === 0) {
		return { image, mask, diagnostic: resultDiagnostic };
	}

	const imageData = new Uint8ClampedArray(image.data);
	const maskData = new Uint8ClampedArray(mask.data);
	for (let pixel = 0; pixel < labels.length; pixel += 1) {
		if (!removeById[labels[pixel]]) continue;
		imageData[pixel * 4 + 3] = 0;
		maskData[pixel * 4 + 3] = 0;
	}
	return {
		image: { width: image.width, height: image.height, data: imageData },
		mask: { width: mask.width, height: mask.height, data: maskData },
		diagnostic: resultDiagnostic,
	};
};
