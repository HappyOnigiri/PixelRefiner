import type { RawImage } from "../shared/types";
import {
	type AutomaticBackgroundResult,
	removeAutomaticBackground,
} from "./background";
import type { NormalizedProcessOptions } from "./processor-options";

export const prepareAutomaticBackground = (
	image: RawImage,
	options: NormalizedProcessOptions,
): {
	automaticBackground?: AutomaticBackgroundResult;
	backgroundDiagnostic?: { confidence: number; contentLossRisk: boolean };
} => {
	if (
		options.bgExtractionMethod !== "auto" ||
		options.bgRemovalScope === "off" ||
		(!options.preRemoveBackground && !options.postRemoveBackground)
	) {
		return {};
	}
	const automaticBackground = removeAutomaticBackground(
		image,
		options.backgroundTolerance,
		options.bgRemovalScope,
		options.bgConnectivity,
	);
	return {
		automaticBackground,
		backgroundDiagnostic: {
			confidence: automaticBackground.model.confidence,
			contentLossRisk: automaticBackground.rolledBack,
		},
	};
};
