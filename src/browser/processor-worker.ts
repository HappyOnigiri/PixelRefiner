import { wrap } from "comlink";
import type { ProcessorWorker } from "../core/worker";

export type ProcessorClient = {
	process: (
		...args: Parameters<ProcessorWorker["process"]>
	) => Promise<ReturnType<ProcessorWorker["process"]>>;
	processBatch: (
		...args: Parameters<ProcessorWorker["processBatch"]>
	) => Promise<ReturnType<ProcessorWorker["processBatch"]>>;
	previewCandidates: (
		...args: Parameters<ProcessorWorker["previewCandidates"]>
	) => Promise<ReturnType<ProcessorWorker["previewCandidates"]>>;
	processCandidate: (
		...args: Parameters<ProcessorWorker["processCandidate"]>
	) => Promise<ReturnType<ProcessorWorker["processCandidate"]>>;
};

export type ProcessorEndpoint = {
	worker: Pick<Worker, "terminate">;
	processor: ProcessorClient;
};

export class ProcessingCancelledError extends Error {
	constructor() {
		super("Processing was cancelled.");
		this.name = "ProcessingCancelledError";
	}
}

export const isProcessingCancelledError = (
	error: unknown,
): error is ProcessingCancelledError =>
	error instanceof ProcessingCancelledError;

export const createProcessorEndpoint = (): ProcessorEndpoint => {
	const worker = new Worker(new URL("../core/worker.ts", import.meta.url), {
		type: "module",
	});
	return {
		worker,
		processor: wrap<ProcessorWorker>(worker),
	};
};

export const createCancellableProcessor = (
	createEndpoint: () => ProcessorEndpoint = createProcessorEndpoint,
): ProcessorClient & { cancelActive: () => void } => {
	let endpoint = createEndpoint();
	const pendingCancellations = new Set<(error: Error) => void>();

	const invoke = <Result>(
		operation: (processor: ProcessorClient) => Promise<Result>,
	): Promise<Result> => {
		const activeProcessor = endpoint.processor;
		return new Promise<Result>((resolve, reject) => {
			let settled = false;
			const settle = (
				callback: (value: Result | PromiseLike<Result>) => void,
				value: Result | PromiseLike<Result>,
			) => {
				if (settled) return;
				settled = true;
				pendingCancellations.delete(cancel);
				callback(value);
			};
			const cancel = (error: Error) => {
				if (settled) return;
				settled = true;
				pendingCancellations.delete(cancel);
				reject(error);
			};
			pendingCancellations.add(cancel);
			void operation(activeProcessor).then(
				(result) => settle(resolve, result),
				(error: unknown) => {
					if (settled) return;
					settled = true;
					pendingCancellations.delete(cancel);
					reject(error);
				},
			);
		});
	};

	return {
		process: (...args) => invoke((processor) => processor.process(...args)),
		processBatch: (...args) =>
			invoke((processor) => processor.processBatch(...args)),
		previewCandidates: (...args) =>
			invoke((processor) => processor.previewCandidates(...args)),
		processCandidate: (...args) =>
			invoke((processor) => processor.processCandidate(...args)),
		cancelActive: () => {
			if (pendingCancellations.size === 0) return;
			const cancellations = [...pendingCancellations];
			// [Intended] 同期的な画像処理は Worker 内から中断できないため、Worker 自体を終了して CPU 処理を止める。
			endpoint.worker.terminate();
			endpoint = createEndpoint();
			const error = new ProcessingCancelledError();
			for (let index = 0; index < cancellations.length; index += 1) {
				cancellations[index](error);
			}
		},
	};
};

let sharedProcessor: ProcessorClient | undefined;

const getSharedProcessor = (): ProcessorClient => {
	sharedProcessor ??= createProcessorEndpoint().processor;
	return sharedProcessor;
};

// 一括処理など、キャンセル対象ではない処理は従来どおり 1 つの Worker を共有する。
export const processor: ProcessorClient = {
	process: (...args) => getSharedProcessor().process(...args),
	processBatch: (...args) => getSharedProcessor().processBatch(...args),
	previewCandidates: (...args) =>
		getSharedProcessor().previewCandidates(...args),
	processCandidate: (...args) => getSharedProcessor().processCandidate(...args),
};
