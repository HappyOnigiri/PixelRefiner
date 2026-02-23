import type { RawImage } from "../shared/types";

const imageDataToRawImage = (imageData: ImageData): RawImage => ({
	width: imageData.width,
	height: imageData.height,
	data: new Uint8ClampedArray(imageData.data),
});

export const imageToRawImage = async (
	source: File | HTMLImageElement | ImageBitmap,
): Promise<RawImage> => {
	if (source instanceof File) {
		const bitmap = await createImageBitmap(source);
		return imageToRawImage(bitmap);
	}

	const width = source.width;
	const height = source.height;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to get Canvas 2D context.");
	}
	ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
	const imageData = ctx.getImageData(0, 0, width, height);
	return imageDataToRawImage(imageData);
};

export const drawRawImageToCanvas = (
	img: RawImage,
	canvas: HTMLCanvasElement,
): void => {
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to get Canvas 2D context.");
	}
	const imageData = new ImageData(
		new Uint8ClampedArray(img.data),
		img.width,
		img.height,
	);
	ctx.putImageData(imageData, 0, 0);
};

export const drawGridToCanvas = (
	width: number,
	height: number,
	canvas: HTMLCanvasElement,
): void => {
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}

	ctx.clearRect(0, 0, width, height);

	// Draw with a very faint color to avoid obscuring the image.
	// Use semi-transparent white or gray so it's visible on both dark and light pixels.
	// Using light gray here for simplicity.
	ctx.strokeStyle = "rgba(128, 128, 128, 0.4)";
	ctx.lineWidth = 1;

	// Start path
	ctx.beginPath();

	// Vertical lines
	for (let x = 1; x < width; x++) {
		ctx.moveTo(x + 0.5, 0);
		ctx.lineTo(x + 0.5, height);
	}

	// Horizontal lines
	for (let y = 1; y < height; y++) {
		ctx.moveTo(0, y + 0.5);
		ctx.lineTo(width, y + 0.5);
	}

	ctx.stroke();
};
