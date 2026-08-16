import type { RawImage } from "../../shared/types";

const linearChannel = (value: number): number => {
	const normalized = value / 255;
	return normalized <= 0.04045
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
};

const oklabDistance = (
	data: Uint8ClampedArray,
	left: number,
	right: number,
): number => {
	const leftR = linearChannel(data[left]);
	const leftG = linearChannel(data[left + 1]);
	const leftB = linearChannel(data[left + 2]);
	const rightR = linearChannel(data[right]);
	const rightG = linearChannel(data[right + 1]);
	const rightB = linearChannel(data[right + 2]);
	const leftL = Math.cbrt(
		0.4122214708 * leftR + 0.5363325363 * leftG + 0.0514459929 * leftB,
	);
	const leftM = Math.cbrt(
		0.2119034982 * leftR + 0.6806995451 * leftG + 0.1073969566 * leftB,
	);
	const leftS = Math.cbrt(
		0.0883024619 * leftR + 0.2817188501 * leftG + 0.6299787005 * leftB,
	);
	const rightL = Math.cbrt(
		0.4122214708 * rightR + 0.5363325363 * rightG + 0.0514459929 * rightB,
	);
	const rightM = Math.cbrt(
		0.2119034982 * rightR + 0.6806995451 * rightG + 0.1073969566 * rightB,
	);
	const rightS = Math.cbrt(
		0.0883024619 * rightR + 0.2817188501 * rightG + 0.6299787005 * rightB,
	);
	const deltaL =
		0.2104542553 * (leftL - rightL) +
		0.793617785 * (leftM - rightM) -
		0.0040720468 * (leftS - rightS);
	const deltaA =
		1.9779984951 * (leftL - rightL) -
		2.428592205 * (leftM - rightM) +
		0.4505937099 * (leftS - rightS);
	const deltaB =
		0.0259040371 * (leftL - rightL) +
		0.7827717662 * (leftM - rightM) -
		0.808675766 * (leftS - rightS);
	return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
};

export const perceptualReconstructionError = (
	image: RawImage,
	mask: RawImage,
	cropX: number,
	cropY: number,
	cellW: number,
	cellH: number,
	pixelStride: number,
): number => {
	const data = image.data;
	const maskData = mask.data;
	let error = 0;
	let samples = 0;
	for (let sourceY = 0; sourceY < image.height; sourceY += pixelStride) {
		const cellY = Math.floor((sourceY - cropY) / cellH);
		const centerY = Math.min(
			image.height - 1,
			Math.max(0, Math.floor(cropY + (cellY + 0.5) * cellH)),
		);
		for (let sourceX = 0; sourceX < image.width; sourceX += pixelStride) {
			const pixel = sourceY * image.width + sourceX;
			if (maskData[pixel * 4 + 3] < 16) continue;
			const cellX = Math.floor((sourceX - cropX) / cellW);
			const centerX = Math.min(
				image.width - 1,
				Math.max(0, Math.floor(cropX + (cellX + 0.5) * cellW)),
			);
			const source = pixel * 4;
			const center = (centerY * image.width + centerX) * 4;
			const colorDistance = oklabDistance(data, source, center);
			const alphaDistance = Math.abs(data[source + 3] - data[center + 3]) / 255;
			error += colorDistance * 0.8 + alphaDistance * 0.2;
			samples += 1;
		}
	}
	return samples === 0 ? Number.POSITIVE_INFINITY : error / samples;
};

export const reconstructionScore = (error: number): number =>
	Number.isFinite(error) ? 1 / (1 + error * 12) : 0;
