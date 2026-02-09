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
		throw new Error("Canvas 2D context の取得に失敗しました。");
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
		throw new Error("Canvas 2D context の取得に失敗しました。");
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

	// 非常に薄い色で描画して、画像の視認性を妨げないようにする
	// 暗いドット上でも明るいドット上でも見えるように、半透明の白またはグレーを使用
	// ここでは単純化のため薄いグレーを使用
	ctx.strokeStyle = "rgba(128, 128, 128, 0.4)";
	ctx.lineWidth = 1;

	// パスを開始
	ctx.beginPath();

	// 縦線
	for (let x = 1; x < width; x++) {
		ctx.moveTo(x + 0.5, 0);
		ctx.lineTo(x + 0.5, height);
	}

	// 横線
	for (let y = 1; y < height; y++) {
		ctx.moveTo(0, y + 0.5);
		ctx.lineTo(width, y + 0.5);
	}

	ctx.stroke();
};
