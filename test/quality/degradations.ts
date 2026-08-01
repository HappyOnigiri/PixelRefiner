import type { RawImage } from "../../src/shared/types";

type Rgba = readonly [number, number, number, number];

const setPixel = (
	data: Uint8ClampedArray,
	width: number,
	x: number,
	y: number,
	color: Rgba,
): void => {
	const index = (y * width + x) * 4;
	data[index] = color[0];
	data[index + 1] = color[1];
	data[index + 2] = color[2];
	data[index + 3] = color[3];
};

export const createReferenceSprite = (): RawImage => {
	const width = 8;
	const height = 8;
	const data = new Uint8ClampedArray(width * height * 4);
	const transparent = [0, 0, 0, 0] as const;
	const outline = [35, 28, 44, 255] as const;
	const red = [218, 74, 72, 255] as const;
	const gold = [249, 194, 81, 255] as const;
	const white = [245, 239, 220, 255] as const;
	const rows = [
		"..oooo..",
		".orrrro.",
		"orryyrro",
		"orwyrwro",
		"orrrrrro",
		".orryro.",
		".o.oo.o.",
		"o......o",
	];
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const token = rows[y][x];
			const color =
				token === "o"
					? outline
					: token === "r"
						? red
						: token === "y"
							? gold
							: token === "w"
								? white
								: transparent;
			setPixel(data, width, x, y, color);
		}
	}
	return { width, height, data };
};

export const resizeNearest = (
	image: RawImage,
	scaleX: number,
	scaleY = scaleX,
): RawImage => {
	const width = Math.max(1, Math.round(image.width * scaleX));
	const height = Math.max(1, Math.round(image.height * scaleY));
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const sourceY = Math.min(
			image.height - 1,
			Math.floor((y * image.height) / height),
		);
		for (let x = 0; x < width; x += 1) {
			const sourceX = Math.min(
				image.width - 1,
				Math.floor((x * image.width) / width),
			);
			const sourceIndex = (sourceY * image.width + sourceX) * 4;
			const outputIndex = (y * width + x) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				data[outputIndex + channel] = image.data[sourceIndex + channel];
			}
		}
	}
	return { width, height, data };
};

const sample = (
	image: RawImage,
	x: number,
	y: number,
	channel: number,
): number => {
	const clampedX = Math.max(0, Math.min(image.width - 1, x));
	const clampedY = Math.max(0, Math.min(image.height - 1, y));
	return image.data[(clampedY * image.width + clampedX) * 4 + channel];
};

export const resizeBilinear = (image: RawImage, scale: number): RawImage => {
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const sourceY = ((y + 0.5) * image.height) / height - 0.5;
		const y0 = Math.floor(sourceY);
		const fy = sourceY - y0;
		for (let x = 0; x < width; x += 1) {
			const sourceX = ((x + 0.5) * image.width) / width - 0.5;
			const x0 = Math.floor(sourceX);
			const fx = sourceX - x0;
			const outputIndex = (y * width + x) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				const top =
					sample(image, x0, y0, channel) * (1 - fx) +
					sample(image, x0 + 1, y0, channel) * fx;
				const bottom =
					sample(image, x0, y0 + 1, channel) * (1 - fx) +
					sample(image, x0 + 1, y0 + 1, channel) * fx;
				data[outputIndex + channel] = Math.round(top * (1 - fy) + bottom * fy);
			}
		}
	}
	return { width, height, data };
};

export const boxBlur = (image: RawImage, passes: number): RawImage => {
	let source = new Uint8ClampedArray(image.data);
	let output = new Uint8ClampedArray(source.length);
	for (let pass = 0; pass < passes; pass += 1) {
		for (let y = 0; y < image.height; y += 1) {
			for (let x = 0; x < image.width; x += 1) {
				const outputIndex = (y * image.width + x) * 4;
				for (let channel = 0; channel < 4; channel += 1) {
					let total = 0;
					let count = 0;
					for (let dy = -1; dy <= 1; dy += 1) {
						for (let dx = -1; dx <= 1; dx += 1) {
							const sampleX = Math.max(0, Math.min(image.width - 1, x + dx));
							const sampleY = Math.max(0, Math.min(image.height - 1, y + dy));
							total += source[(sampleY * image.width + sampleX) * 4 + channel];
							count += 1;
						}
					}
					output[outputIndex + channel] = Math.round(total / count);
				}
			}
		}
		const swap = source;
		source = output;
		output = swap;
	}
	return { width: image.width, height: image.height, data: source };
};

export const addDeterministicNoise = (
	image: RawImage,
	amplitude: number,
): RawImage => {
	const data = new Uint8ClampedArray(image.data);
	let state = 0x1a2b3c4d;
	for (let i = 0; i < data.length; i += 4) {
		for (let channel = 0; channel < 3; channel += 1) {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			const noise = (state % (amplitude * 2 + 1)) - amplitude;
			data[i + channel] = data[i + channel] + noise;
		}
	}
	return { width: image.width, height: image.height, data };
};

export const addPadding = (
	image: RawImage,
	padding: number,
	background: (x: number, y: number, width: number, height: number) => Rgba,
): RawImage => {
	const width = image.width + padding * 2;
	const height = image.height + padding * 2;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			setPixel(data, width, x, y, background(x, y, width, height));
		}
	}
	for (let y = 0; y < image.height; y += 1) {
		for (let x = 0; x < image.width; x += 1) {
			const sourceIndex = (y * image.width + x) * 4;
			const outputIndex = ((y + padding) * width + x + padding) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				const value = image.data[sourceIndex + channel];
				if (channel < 3 && image.data[sourceIndex + 3] === 0) continue;
				data[outputIndex + channel] = value;
			}
		}
	}
	return { width, height, data };
};

export const cropShift = (image: RawImage, pixels: number): RawImage => {
	const width = image.width - pixels;
	const height = image.height - pixels;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const sourceIndex = ((y + pixels) * image.width + x + pixels) * 4;
			const outputIndex = (y * width + x) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				data[outputIndex + channel] = image.data[sourceIndex + channel];
			}
		}
	}
	return { width, height, data };
};

export const createContinuousGradient = (): RawImage => {
	const width = 48;
	const height = 32;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			data[index] = Math.round((x / (width - 1)) * 255);
			data[index + 1] = Math.round((y / (height - 1)) * 255);
			data[index + 2] = Math.round(((x + y) / (width + height - 2)) * 255);
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
};
