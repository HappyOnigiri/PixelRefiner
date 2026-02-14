import { expose } from "comlink";
import type { RawImage } from "../shared/types";
import type { ProcessOptions, ProcessResult } from "./processor";
import { processImage } from "./processor";

export type ProcessorWorker = {
	process: (img: RawImage, options: ProcessOptions) => ProcessResult;
};

const worker: ProcessorWorker = {
	process: (img, options) => {
		return processImage(img, options);
	},
};

expose(worker);
