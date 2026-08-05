import { NATIVE_SCALE_LIMITS } from "../shared/config";
import type { RawImage } from "../shared/types";

/**
 * 入力が「等倍のドット絵」か「整数倍に拡大されたドット絵」かを表す推定結果。
 *
 * scaleX / scaleY は「1論理ドットが何画素で描かれているか」の推定値で、
 * 1 なら等倍（これ以上縮小すると必ず情報が落ちる）ことを意味する。
 */
export type NativePixelScale = {
	scaleX: number;
	scaleY: number;
	/** 判定に使えた遷移（隣接列・隣接行の変化点）の本数。 */
	transitionsX: number;
	transitionsY: number;
	/** 画素数が上限を超えるなどで判定できなかった場合は false。 */
	measured: boolean;
};

const UNMEASURED: NativePixelScale = {
	scaleX: 1,
	scaleY: 1,
	transitionsX: 0,
	transitionsY: 0,
	measured: false,
};

const greatestCommonDivisor = (left: number, right: number): number => {
	let a = left;
	let b = right;
	while (b !== 0) {
		const next = a % b;
		a = b;
		b = next;
	}
	return a;
};

/**
 * 軸方向の遷移強度を求める。
 * 位置 p の値は「列(行) p-1 と p の平均差」で、0〜1 に正規化する。
 * 両側とも透明な画素対は、背景の広がりが遷移として数えられないよう除外する。
 */
const fillTransitionStrength = (
	image: RawImage,
	strength: Float64Array,
	horizontal: boolean,
): void => {
	const { width, height, data } = image;
	const length = horizontal ? width : height;
	const orthogonalLength = horizontal ? height : width;
	const step = horizontal ? 1 : width;
	for (let position = 1; position < length; position += 1) {
		let total = 0;
		let samples = 0;
		for (let orthogonal = 0; orthogonal < orthogonalLength; orthogonal += 1) {
			const beforePixel = horizontal
				? orthogonal * width + position - 1
				: (position - 1) * width + orthogonal;
			const afterPixel = beforePixel + step;
			const before = beforePixel * 4;
			const after = afterPixel * 4;
			const beforeAlpha = data[before + 3];
			const afterAlpha = data[after + 3];
			if (beforeAlpha === 0 && afterAlpha === 0) continue;
			let difference = Math.abs(beforeAlpha - afterAlpha);
			if (beforeAlpha > 0 && afterAlpha > 0) {
				difference = Math.max(
					difference,
					Math.abs(data[before] - data[after]),
					Math.abs(data[before + 1] - data[after + 1]),
					Math.abs(data[before + 2] - data[after + 2]),
				);
			}
			total += difference;
			samples += 1;
		}
		strength[position] = samples === 0 ? 0 : total / (samples * 255);
	}
};

const axisScale = (
	length: number,
	strength: Float64Array,
	minStrength: number,
): { scale: number; transitions: number } => {
	let scale = length;
	let transitions = 0;
	for (let position = 1; position < length; position += 1) {
		if (strength[position] < minStrength) continue;
		transitions += 1;
		scale = greatestCommonDivisor(scale, position);
		// [Intended] 1 まで落ちたら以降どう変化しても 1 のままなので、
		// 遷移本数の集計だけ続けて約数計算は打ち切ってよい。
		if (scale === 1) {
			for (let rest = position + 1; rest < length; rest += 1) {
				if (strength[rest] >= minStrength) transitions += 1;
			}
			return { scale: 1, transitions };
		}
	}
	return { scale: Math.max(1, scale), transitions };
};

/**
 * 整数倍拡大の格子を検出する。
 *
 * [Intended] 「遷移位置がすべて s の倍数であり、かつ辺の長さも s の倍数」を満たす
 * 最大の s が整数倍拡大率になる。これは遷移位置と辺の長さの最大公約数に一致するため、
 * 候補を総当たりせずに求められる。1 が返るときは、どんな整数倍でも説明できない
 * ＝すでに等倍のドット絵である、ことを意味する。
 */
export const detectNativePixelScale = (image: RawImage): NativePixelScale => {
	const pixelCount = image.width * image.height;
	if (pixelCount === 0) return UNMEASURED;
	if (pixelCount > NATIVE_SCALE_LIMITS.maxAnalysisPixels) return UNMEASURED;
	const horizontal = new Float64Array(image.width);
	const vertical = new Float64Array(image.height);
	fillTransitionStrength(image, horizontal, true);
	fillTransitionStrength(image, vertical, false);
	const minStrength = NATIVE_SCALE_LIMITS.minTransitionStrength;
	const x = axisScale(image.width, horizontal, minStrength);
	const y = axisScale(image.height, vertical, minStrength);
	return {
		scaleX: x.scale,
		scaleY: y.scale,
		transitionsX: x.transitions,
		transitionsY: y.transitions,
		measured: true,
	};
};
