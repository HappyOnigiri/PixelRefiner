import { expose } from "comlink";
import type { PixelGrid, RawImage } from "../shared/types";
import type { ProcessOptions } from "./processor";
import { processImage } from "./processor";

export type ProcessorWorker = {
	process: (
		img: RawImage,
		options: ProcessOptions,
	) => { result: RawImage; grid: PixelGrid };
};

const worker: ProcessorWorker = {
	process: (img, options) => {
		return processImage(img, options);
	},
};

expose(worker);
