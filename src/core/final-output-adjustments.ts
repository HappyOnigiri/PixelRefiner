import type { OutlineStyle, PixelGrid, RawImage, RGB } from "../shared/types";
import { padImageToAspectRatio, padRawImage } from "./image-operations";
import { applyOutline } from "./outline";

type Padding = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

type AdjustmentKind = "outline" | "aspect-ratio" | "square";

type AdjustmentStep = Padding & {
	kind: AdjustmentKind;
	width: number;
	height: number;
};

type FinalOutputOptions = {
	outlineStyle: OutlineStyle;
	outlineColor: RGB;
	keepAspectRatio: boolean;
	makeSquare: boolean;
};

const paddingForSizeChange = (
	previousWidth: number,
	previousHeight: number,
	width: number,
	height: number,
): Padding => {
	const widthDifference = width - previousWidth;
	const heightDifference = height - previousHeight;
	const left = Math.floor(widthDifference / 2);
	const top = Math.floor(heightDifference / 2);
	return {
		left,
		top,
		right: widthDifference - left,
		bottom: heightDifference - top,
	};
};

export const applyFinalOutputAdjustments = (
	input: RawImage,
	sourceAspectRatio: number,
	options: FinalOutputOptions,
	applyOutlineAndAspectRatio = true,
): { image: RawImage; steps: AdjustmentStep[] } => {
	let image = input;
	const steps: AdjustmentStep[] = [];

	if (applyOutlineAndAspectRatio && options.outlineStyle !== "none") {
		const previousWidth = image.width;
		const previousHeight = image.height;
		image = applyOutline(image, options.outlineColor, options.outlineStyle);
		if (image.width !== previousWidth || image.height !== previousHeight) {
			steps.push({
				kind: "outline",
				...paddingForSizeChange(
					previousWidth,
					previousHeight,
					image.width,
					image.height,
				),
				width: image.width,
				height: image.height,
			});
		}
	}

	if (
		applyOutlineAndAspectRatio &&
		options.keepAspectRatio &&
		!options.makeSquare
	) {
		const padded = padImageToAspectRatio(image, sourceAspectRatio);
		if (padded.image !== image) {
			image = padded.image;
			steps.push({
				kind: "aspect-ratio",
				...padded.padding,
				width: image.width,
				height: image.height,
			});
		}
	}

	if (options.makeSquare && image.width !== image.height) {
		const size = Math.max(image.width, image.height);
		const padding = paddingForSizeChange(image.width, image.height, size, size);
		image = padRawImage(
			image,
			padding.left,
			padding.top,
			padding.right,
			padding.bottom,
		);
		steps.push({ kind: "square", ...padding, width: size, height: size });
	}

	return { image, steps };
};

// [Intended] 出力の論理解像度で数えたパディング量を、原寸（セル寸法倍）の画素数へ直す。
// 丸めの有無は呼び出し元ごとに違い、揃っていないのは書き間違いではない。詳細は
// padFinalOutputCompanions の shouldRoundSourcePadding を参照。
const scalePadding = (
	step: AdjustmentStep,
	grid: PixelGrid,
	round: boolean,
): Padding => {
	const convert = round ? Math.round : (value: number): number => value;
	return {
		left: convert(step.left * grid.cellW),
		top: convert(step.top * grid.cellH),
		right: convert(step.right * grid.cellW),
		bottom: convert(step.bottom * grid.cellH),
	};
};

/**
 * [Intended] 比較用の 2 枚は解像度が違う。compareBeforeSanitized は出力と同じ論理解像度な
 * ので step をそのまま足すが、compareBefore がどちらの座標系で保持されているかは経路ごとに
 * 異なるため compareBeforeCoordinates で切り替える（"source" ならセル寸法で引き伸ばす）。
 * grid の cropX/cropY は常に原寸座標なので、座標系の指定にかかわらず原寸のパディング量を引く。
 *
 * [Intended] shouldRoundSourcePadding は、原寸へ引き伸ばすときに Math.round を通すかどうかを
 * 調整種別ごとに決める。統合前の各経路が種別ごとに違う扱いをしていたのをそのまま写しており、
 * 呼び出し元で揃っていないのは意図的。一律に丸める／丸めないへ統一すると比較ビューの座標対応
 * とグリッドのクロップ位置が静かにずれる。
 */
export const padFinalOutputCompanions = (
	compareBeforeInput: RawImage,
	compareBeforeSanitizedInput: RawImage,
	gridInput: PixelGrid,
	steps: readonly AdjustmentStep[],
	compareBeforeCoordinates: "logical" | "source",
	shouldRoundSourcePadding: (kind: AdjustmentKind) => boolean = () => true,
): {
	compareBefore: RawImage;
	compareBeforeSanitized: RawImage;
	grid: PixelGrid;
} => {
	let compareBefore = compareBeforeInput;
	let compareBeforeSanitized = compareBeforeSanitizedInput;
	let grid = gridInput;

	for (let index = 0; index < steps.length; index += 1) {
		const step = steps[index];
		const sourcePadding = scalePadding(
			step,
			grid,
			shouldRoundSourcePadding(step.kind),
		);
		const comparisonPadding =
			compareBeforeCoordinates === "logical" ? step : sourcePadding;
		compareBefore = padRawImage(
			compareBefore,
			comparisonPadding.left,
			comparisonPadding.top,
			comparisonPadding.right,
			comparisonPadding.bottom,
		);
		compareBeforeSanitized = padRawImage(
			compareBeforeSanitized,
			step.left,
			step.top,
			step.right,
			step.bottom,
		);

		const baseCropX = grid.cropX ?? grid.offsetX;
		const baseCropY = grid.cropY ?? grid.offsetY;
		grid = {
			...grid,
			outW: step.width,
			outH: step.height,
			cropX: baseCropX - sourcePadding.left,
			cropY: baseCropY - sourcePadding.top,
			cropW: step.width * grid.cellW,
			cropH: step.height * grid.cellH,
		};
	}

	return { compareBefore, compareBeforeSanitized, grid };
};
