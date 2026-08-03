import { PROCESS_DEFAULTS, PROCESS_ROLLOUT } from "../shared/config";
import type { ProcessingMode } from "../shared/types";

export type ProcessingPipeline =
	| typeof PROCESS_ROLLOUT.legacyPipeline
	| typeof PROCESS_ROLLOUT.nextPipeline;

type RolloutStorage = Pick<Storage, "getItem" | "setItem">;

const isProcessingPipeline = (
	value: string | null,
): value is ProcessingPipeline =>
	value === PROCESS_ROLLOUT.legacyPipeline ||
	value === PROCESS_ROLLOUT.nextPipeline;

export const resolveProcessingPipeline = (
	search: string,
	storage?: RolloutStorage,
): ProcessingPipeline => {
	const queryValue = new URLSearchParams(search).get(
		PROCESS_ROLLOUT.queryParameter,
	);
	if (isProcessingPipeline(queryValue)) {
		try {
			storage?.setItem(PROCESS_ROLLOUT.storageKey, queryValue);
		} catch {
			// [Intended] ストレージ拒否時もURL指定されたパイプラインは今回の表示で有効にする。
		}
		return queryValue;
	}
	try {
		const storedValue = storage?.getItem(PROCESS_ROLLOUT.storageKey) ?? null;
		if (isProcessingPipeline(storedValue)) return storedValue;
	} catch {
		// [Intended] ストレージを利用できない環境では安全な既定値へ戻す。
	}
	return PROCESS_ROLLOUT.defaultPipeline;
};

export const processingModeForPipeline = (
	pipeline: ProcessingPipeline,
): ProcessingMode =>
	pipeline === PROCESS_ROLLOUT.nextPipeline
		? "auto"
		: PROCESS_DEFAULTS.processingMode;
