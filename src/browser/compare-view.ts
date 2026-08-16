import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import type { ImageComparer } from "./compare";

/**
 * 比較用画像を準備している間の表示を切り替える。
 * [Intended] 表示先は比較モーダルの中にする。全画面の読み込みオーバーレイはモーダルの
 * 背面に出るため、開いている間は見えない。
 */
export const setComparePreparing = (
	els: Elements,
	preparing: boolean,
): void => {
	els.comparePreparing.hidden = !preparing;
	els.compareContainer.setAttribute("aria-busy", String(preparing));
};

/** 準備済みの比較用画像を、いま選ばれている「処理前」の表示モードで反映する。 */
export const applyCompareImages = (
	processingState: ProcessingState,
	comparer: ImageComparer,
): boolean => {
	const before =
		processingState.compareBeforeMode === "sanitized"
			? processingState.compareBeforeSanitizedUrl
			: processingState.compareBeforeOriginalUrl;
	if (!before || !processingState.compareAfterUrl) return false;
	comparer.updateImages(before, processingState.compareAfterUrl);
	return true;
};
