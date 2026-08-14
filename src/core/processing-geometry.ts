import { PROCESS_DEFAULTS } from "../shared/config";
import type { RawImage } from "../shared/types";
import {
	type AutomaticBackgroundResult,
	removeAutomaticBackground,
} from "./background";
import { getBackgroundTargets } from "./background-removal";
import {
	prepareGeminiWatermarkAwareAutoMask,
	prepareGeminiWatermarkGeometry,
} from "./gemini-watermark-preprocessing";
import {
	getBackgroundBehavior,
	type NormalizedProcessOptions,
} from "./processor-options";

export type ProcessingGeometry = {
	working: RawImage;
	autoMask: RawImage;
	preparedMask?: RawImage;
	watermarkRemoved: boolean;
};

type ReusableWatermarkGeometry = {
	working: RawImage;
	preparedMask?: RawImage;
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
	reusableWatermarkGeometry?: ReusableWatermarkGeometry,
): ProcessingGeometry => {
	const geometryOptions: NormalizedProcessOptions = {
		...options,
		preRemoveBackground: true,
		postRemoveBackground: true,
		bgExtractionMethod: "auto",
		bgRemovalScope: PROCESS_DEFAULTS.bgRemovalScope,
	};
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
				getBackgroundBehavior(geometryOptions),
			);
	const backgroundTargets = getBackgroundTargets(image, "auto", undefined, 16);
	const watermarkGeometry = reusableWatermarkGeometry
		? reusableWatermarkGeometry
		: (() => {
				const prepared = prepareGeminiWatermarkGeometry({
					inputImage: image,
					image,
					working: automaticBackground.image,
					options: geometryOptions,
					automaticBackground,
					getBackgroundMaskedInput: () => automaticBackground.image,
					backgroundTargets,
					backgroundModel: automaticBackground.model,
				});
				return {
					working: prepared.working,
					preparedMask: prepared.mask,
					watermarkRemoved: prepared.removed,
				};
			})();
	const { preparedMask, watermarkRemoved } = watermarkGeometry;
	const autoMask = prepareGeminiWatermarkAwareAutoMask({
		needed: true,
		preparedMask,
		options: geometryOptions,
		geometryWorking: watermarkGeometry.working,
		backgroundTargets,
		backgroundModel: automaticBackground.model,
	});
	return {
		working: watermarkGeometry.working,
		autoMask: autoMask ?? watermarkGeometry.working,
		preparedMask,
		watermarkRemoved,
	};
};
