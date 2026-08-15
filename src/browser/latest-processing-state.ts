export type ProcessingFinishDecision =
	| "stale"
	| "keep-loading"
	| "hide-loading";

/**
 * 最新の変換と、自動変換のデバウンス待機をまとめて管理する。
 * DOM や Worker には依存せず、表示を閉じてよいタイミングだけを判定する。
 */
export const createLatestProcessingState = () => {
	let latestGeneration = 0;
	let activeGeneration: number | undefined;
	let autoProcessScheduled = false;
	let loadingHeldExternally = false;

	return {
		begin: (): number => {
			latestGeneration += 1;
			activeGeneration = latestGeneration;
			loadingHeldExternally = false;
			return latestGeneration;
		},
		isLatest: (generation: number): boolean => generation === latestGeneration,
		finish: (
			generation: number,
			keepLoadingOverlay: boolean,
		): ProcessingFinishDecision => {
			if (generation !== latestGeneration) return "stale";
			activeGeneration = undefined;
			loadingHeldExternally = keepLoadingOverlay;
			return keepLoadingOverlay || autoProcessScheduled
				? "keep-loading"
				: "hide-loading";
		},
		setAutoProcessScheduled: (scheduled: boolean): boolean => {
			autoProcessScheduled = scheduled;
			return (
				!scheduled && activeGeneration === undefined && !loadingHeldExternally
			);
		},
	};
};
