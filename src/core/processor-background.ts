import type { BackgroundDiagnostic, RawImage } from "../shared/types";
import {
	type AutomaticBackgroundResult,
	type BackgroundModel,
	estimateBackgroundModel,
	removeAutomaticBackground,
} from "./background";
import {
	getBackgroundBehavior,
	type NormalizedProcessOptions,
} from "./processor-options";

export const prepareAutomaticBackground = (
	image: RawImage,
	options: NormalizedProcessOptions,
): {
	automaticBackground?: AutomaticBackgroundResult;
	backgroundModel?: BackgroundModel;
	backgroundDiagnostic?: BackgroundDiagnostic;
} => {
	if (
		options.bgExtractionMethod !== "auto" ||
		options.bgRemovalScope === "off" ||
		(!options.preRemoveBackground &&
			!options.postRemoveBackground &&
			options.smallComponentMode === "off")
	) {
		return {};
	}
	// [Intended] 事前除去が無効な場合、除去済み画像は後段で使われず捨てられるため、
	// 原寸画像に対してはモデル推定だけを行う。
	const behavior = getBackgroundBehavior(options);
	if (!options.preRemoveBackground) {
		const model = estimateBackgroundModel(image, behavior);
		return {
			backgroundModel: model,
			backgroundDiagnostic: {
				confidence: model.confidence,
				removalRolledBack: false,
			},
		};
	}
	const automaticBackground = removeAutomaticBackground(
		image,
		options.backgroundTolerance,
		options.bgRemovalScope,
		options.bgConnectivity,
		undefined,
		behavior,
	);
	return {
		automaticBackground,
		backgroundModel: automaticBackground.model,
		backgroundDiagnostic: {
			confidence: automaticBackground.model.confidence,
			removalRolledBack: automaticBackground.rolledBack,
		},
	};
};
