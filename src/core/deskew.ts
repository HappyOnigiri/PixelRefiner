import { DESKEW_LIMITS, PROCESS_RANGES } from "../shared/config";
import type { RawImage } from "../shared/types";
import { resizeRawImageNearest } from "./image-operations";

const DEGREES_TO_RADIANS = Math.PI / 180;
const ANGLE_EPSILON = 1e-9;

export type DeskewRotation = {
	image: RawImage;
	angle: number;
};

const readPremultiplied = (
	data: Uint8ClampedArray,
	width: number,
	height: number,
	x: number,
	y: number,
	channel: number,
): number => {
	if (x < 0 || y < 0 || x >= width || y >= height) return 0;
	const offset = (y * width + x) * 4;
	const alpha = data[offset + 3] / 255;
	return channel === 3 ? alpha : (data[offset + channel] / 255) * alpha;
};

/**
 * 画像中心を基準に回転し、四隅をすべて含む透明キャンバスへ展開する。
 */
export const rotateRawImageExpanded = (
	image: RawImage,
	angle: number,
): RawImage => {
	if (
		Math.abs(angle) < ANGLE_EPSILON ||
		image.width === 0 ||
		image.height === 0
	)
		return image;

	const radians = angle * DEGREES_TO_RADIANS;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const width = Math.max(
		1,
		Math.ceil(Math.abs(image.width * cosine) + Math.abs(image.height * sine)),
	);
	const height = Math.max(
		1,
		Math.ceil(Math.abs(image.width * sine) + Math.abs(image.height * cosine)),
	);
	const output = new Uint8ClampedArray(width * height * 4);
	const sourceCenterX = (image.width - 1) / 2;
	const sourceCenterY = (image.height - 1) / 2;
	const outputCenterX = (width - 1) / 2;
	const outputCenterY = (height - 1) / 2;

	for (let y = 0; y < height; y += 1) {
		const centeredY = y - outputCenterY;
		for (let x = 0; x < width; x += 1) {
			const centeredX = x - outputCenterX;
			const sourceX = cosine * centeredX + sine * centeredY + sourceCenterX;
			const sourceY = -sine * centeredX + cosine * centeredY + sourceCenterY;
			const x0 = Math.floor(sourceX);
			const y0 = Math.floor(sourceY);
			const fractionX = sourceX - x0;
			const fractionY = sourceY - y0;
			const outputOffset = (y * width + x) * 4;
			let alpha = 0;
			for (let sampleY = 0; sampleY < 2; sampleY += 1) {
				const weightY = sampleY === 0 ? 1 - fractionY : fractionY;
				for (let sampleX = 0; sampleX < 2; sampleX += 1) {
					const weightX = sampleX === 0 ? 1 - fractionX : fractionX;
					alpha +=
						readPremultiplied(
							image.data,
							image.width,
							image.height,
							x0 + sampleX,
							y0 + sampleY,
							3,
						) *
						weightX *
						weightY;
				}
			}
			if (alpha <= 0) continue;
			for (let channel = 0; channel < 3; channel += 1) {
				let premultiplied = 0;
				for (let sampleY = 0; sampleY < 2; sampleY += 1) {
					const weightY = sampleY === 0 ? 1 - fractionY : fractionY;
					for (let sampleX = 0; sampleX < 2; sampleX += 1) {
						const weightX = sampleX === 0 ? 1 - fractionX : fractionX;
						premultiplied +=
							readPremultiplied(
								image.data,
								image.width,
								image.height,
								x0 + sampleX,
								y0 + sampleY,
								channel,
							) *
							weightX *
							weightY;
					}
				}
				output[outputOffset + channel] = Math.round(
					(premultiplied / alpha) * 255,
				);
			}
			output[outputOffset + 3] = Math.round(alpha * 255);
		}
	}
	return { width, height, data: output };
};

export const createDeskewAnalysisImage = (image: RawImage): RawImage => {
	const maxDimension = Math.max(image.width, image.height);
	if (maxDimension <= DESKEW_LIMITS.maxAnalysisDimension) return image;
	const scale = DESKEW_LIMITS.maxAnalysisDimension / maxDimension;
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));
	return resizeRawImageNearest(
		image,
		0,
		0,
		image.width,
		image.height,
		width,
		height,
	);
};

export const createDeskewAngles = (): number[] => {
	const angles: number[] = [];
	const range = PROCESS_RANGES.deskewAngle.max;
	for (
		let angle = -range;
		angle <= range + ANGLE_EPSILON;
		angle += DESKEW_LIMITS.angleStep
	) {
		angles.push(Math.round(angle * 100) / 100);
	}
	return angles;
};

const opaqueLuminance = (data: Uint8ClampedArray, offset: number): number =>
	data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;

type DeskewOrientationMoment = {
	cosineSum: number;
	sineSum: number;
	totalWeight: number;
};

const createDeskewOrientationMoment = (
	image: RawImage,
): DeskewOrientationMoment => {
	if (image.width < 3 || image.height < 3) {
		return { cosineSum: 0, sineSum: 0, totalWeight: 0 };
	}
	const data = image.data;
	const rowStride = image.width * 4;
	let cosineSum = 0;
	let sineSum = 0;
	let totalWeight = 0;
	for (let y = 1; y < image.height - 1; y += 1) {
		for (let x = 1; x < image.width - 1; x += 1) {
			const offset = (y * image.width + x) * 4;
			const left = offset - 4;
			const right = offset + 4;
			const top = offset - rowStride;
			const bottom = offset + rowStride;
			const opaqueNeighborhood =
				data[left + 3] >= 128 &&
				data[right + 3] >= 128 &&
				data[top + 3] >= 128 &&
				data[bottom + 3] >= 128;
			if (!opaqueNeighborhood) continue;
			const gradientX =
				opaqueLuminance(data, right) - opaqueLuminance(data, left);
			const gradientY =
				opaqueLuminance(data, bottom) - opaqueLuminance(data, top);
			const x2 = gradientX * gradientX;
			const y2 = gradientY * gradientY;
			const magnitude2 = x2 + y2;
			if (magnitude2 <= 1e-9) continue;
			const magnitude4 = magnitude2 * magnitude2;
			cosineSum +=
				((x2 * x2 - 6 * x2 * y2 + y2 * y2) / magnitude4) * magnitude2;
			sineSum +=
				((4 * gradientX * gradientY * (x2 - y2)) / magnitude4) * magnitude2;
			totalWeight += magnitude2;
		}
	}
	return { cosineSum, sineSum, totalWeight };
};

const scoreDeskewOrientationMoment = (
	moment: DeskewOrientationMoment,
	correctionAngle: number,
): number => {
	if (moment.totalWeight <= 0) return 0;
	const radians = correctionAngle * DEGREES_TO_RADIANS * 4;
	return (
		(moment.cosineSum * Math.cos(radians) -
			moment.sineSum * Math.sin(radians)) /
		moment.totalWeight
	);
};

/** 直交する境界を同一方向として扱う4倍角の勾配整列スコア。 */
export const deskewOrientationScore = (
	image: RawImage,
	correctionAngle: number,
): number =>
	scoreDeskewOrientationMoment(
		createDeskewOrientationMoment(image),
		correctionAngle,
	);

/** 複数角度で共有できる勾配集計を一度だけ行う。 */
export const scoreDeskewAngles = (
	image: RawImage,
	angles: readonly number[],
): number[] => {
	const moment = createDeskewOrientationMoment(image);
	const scores = new Array<number>(angles.length);
	for (let index = 0; index < angles.length; index += 1) {
		scores[index] = scoreDeskewOrientationMoment(moment, angles[index]);
	}
	return scores;
};
