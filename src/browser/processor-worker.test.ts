import { describe, expect, it, vi } from "vitest";
import type { ProcessOptions } from "../core/processor";
import type { RawImage } from "../shared/types";
import {
	createCancellableProcessor,
	ProcessingCancelledError,
	type ProcessorClient,
	type ProcessorEndpoint,
} from "./processor-worker";

const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
const options = {} as ProcessOptions;

const deferred = <Value>() => {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
};

const endpoint = (
	process: ProcessorClient["process"],
): ProcessorEndpoint & { terminate: ReturnType<typeof vi.fn> } => {
	const terminate = vi.fn();
	return {
		terminate,
		worker: { terminate },
		processor: {
			process,
			processBatch: vi.fn(),
			previewCandidates: vi.fn(),
			processCandidate: vi.fn(),
		},
	};
};

describe("cancellable processor", () => {
	it("terminates the running worker and uses a new worker for the latest request", async () => {
		const firstResult = deferred<never>();
		const secondResult = deferred<never>();
		const firstEndpoint = endpoint(() => firstResult.promise);
		const secondEndpoint = endpoint(() => secondResult.promise);
		const createEndpoint = vi
			.fn<() => ProcessorEndpoint>()
			.mockReturnValueOnce(firstEndpoint)
			.mockReturnValueOnce(secondEndpoint);
		const processor = createCancellableProcessor(createEndpoint);

		const first = processor.process(image as RawImage, options);
		const cancelled = expect(first).rejects.toBeInstanceOf(
			ProcessingCancelledError,
		);
		processor.cancelActive();

		await cancelled;
		expect(firstEndpoint.terminate).toHaveBeenCalledOnce();

		const second = processor.process(image as RawImage, options);
		secondResult.resolve(undefined as never);
		await expect(second).resolves.toBeUndefined();
		expect(createEndpoint).toHaveBeenCalledTimes(2);
	});

	it("ignores a late resolution from the terminated worker", async () => {
		const firstResult = deferred<never>();
		const firstEndpoint = endpoint(() => firstResult.promise);
		const createEndpoint = vi.fn(() => firstEndpoint);
		const processor = createCancellableProcessor(createEndpoint);

		const first = processor.process(image as RawImage, options);
		const cancelled = expect(first).rejects.toBeInstanceOf(
			ProcessingCancelledError,
		);
		processor.cancelActive();
		await cancelled;

		// 終了させた Worker から遅れて応答が届いても、呼び出し側の結果は中断のままにする。
		firstResult.resolve(undefined as never);

		await expect(first).rejects.toBeInstanceOf(ProcessingCancelledError);
	});

	it("keeps an idle worker instead of recreating it", async () => {
		const firstEndpoint = endpoint(vi.fn(async () => undefined as never));
		const createEndpoint = vi.fn(() => firstEndpoint);
		const processor = createCancellableProcessor(createEndpoint);

		await processor.process(image as RawImage, options);
		processor.cancelActive();
		await processor.process(image as RawImage, options);

		expect(firstEndpoint.terminate).not.toHaveBeenCalled();
		expect(createEndpoint).toHaveBeenCalledOnce();
	});

	it("does not create a worker before the first request", () => {
		const createEndpoint = vi.fn(() => endpoint(vi.fn()));

		createCancellableProcessor(createEndpoint);

		expect(createEndpoint).not.toHaveBeenCalled();
	});

	it("clears the cancellation entry when the worker call throws synchronously", async () => {
		const failingEndpoint = endpoint(() => {
			throw new Error("boom");
		});
		const createEndpoint = vi.fn(() => failingEndpoint);
		const processor = createCancellableProcessor(createEndpoint);

		await expect(processor.process(image as RawImage, options)).rejects.toThrow(
			"boom",
		);
		processor.cancelActive();

		expect(failingEndpoint.terminate).not.toHaveBeenCalled();
	});
});
