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
