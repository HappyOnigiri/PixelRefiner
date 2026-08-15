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
	// [Intended] Worker は最初の要求まで作らない。中断のたびに作り直すと、
	// 次の要求が来ない場合に使われない Worker を起こすことになる。
	let endpoint: ProcessorEndpoint | undefined;
	const pendingCancellations = new Set<(error: Error) => void>();

	const invoke = <Result>(
		operation: (processor: ProcessorClient) => Promise<Result>,
	): Promise<Result> => {
		endpoint ??= createEndpoint();
		const activeProcessor = endpoint.processor;
		return new Promise<Result>((resolve, reject) => {
			let settled = false;
			// 決着済みなら false を返す。中断の登録を必ず 1 箇所で取り消すためにまとめる。
			const finalize = (): boolean => {
				if (settled) return false;
				settled = true;
				pendingCancellations.delete(cancel);
				return true;
			};
			const cancel = (error: Error) => {
				if (finalize()) reject(error);
			};
			pendingCancellations.add(cancel);
			// [Intended] operation が同期的に投げた例外も reject 経路へ流す。
			// executor の例外として抜けると中断の登録が集合に残り、
			// 実行中の処理がなくても cancelActive が Worker を終了し続けてしまう。
			void Promise.resolve()
				.then(() => operation(activeProcessor))
				.then(
					(result) => {
						if (finalize()) resolve(result);
					},
					(error: unknown) => {
						if (finalize()) reject(error);
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
			endpoint?.worker.terminate();
			endpoint = undefined;
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
