import { PROCESS_DEFAULTS } from "../shared/config";
import type { RawImage } from "../shared/types";
import {
	type AutomaticBackgroundResult,
	removeAutomaticBackground,
} from "./background";
import { removeGeminiWatermark } from "./gemini-watermark";
import {
	getBackgroundBehavior,
	type NormalizedProcessOptions,
} from "./processor-options";

export type ProcessingGeometry = {
	mask: RawImage;
	watermarkRemoved: boolean;
};

/**
 * 出力の透明化設定に依存しない、寸法決定専用の被写体マスクを準備する。
 *
 * [Intended] 背景透過は出力アルファだけ、自動トリムはキャンバス範囲だけを変える。
 * グリッド倍率と経路判定は常に同じ自動背景マスクを使い、設定の切り替えで被写体の
 * 大きさやディテールが変わらないようにする。
 */
export const prepareProcessingGeometry = (
	image: RawImage,
	options: NormalizedProcessOptions,
	reusableAutomaticBackground?: AutomaticBackgroundResult,
): ProcessingGeometry => {
	const canReuse =
		reusableAutomaticBackground !== undefined &&
		options.bgExtractionMethod === "auto" &&
		options.bgRemovalScope === PROCESS_DEFAULTS.bgRemovalScope;
	const automaticBackground = canReuse
		? reusableAutomaticBackground
		: removeAutomaticBackground(
				image,
				options.backgroundTolerance,
				PROCESS_DEFAULTS.bgRemovalScope,
				options.bgConnectivity,
				undefined,
				getBackgroundBehavior(options),
			);
	if (options.geminiWatermarkRemoval === "off") {
		return { mask: automaticBackground.image, watermarkRemoved: false };
	}
	const watermark = removeGeminiWatermark(
		automaticBackground.image,
		automaticBackground.image,
	);
	return { mask: watermark.image, watermarkRemoved: watermark.removed };
};
