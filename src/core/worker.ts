import { expose } from "comlink";
import {
	createProcessingService,
	type ProcessingService,
} from "./processing-service";

export type { AutoResultPreviewInput } from "./processing-service";

export type ProcessorWorker = ProcessingService;

expose(createProcessingService());
