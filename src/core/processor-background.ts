import type {
	BackgroundDiagnostic,
	BackgroundRemovalStageOutcome,
	RawImage,
} from "../shared/types";
import {
	type AutomaticBackgroundResult,
	type BackgroundModel,
	estimateBackgroundModel,
	removeAutomaticBackground,
} from "./background";
import type { NormalizedProcessOptions } from "./processor-options";

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
	if (!options.preRemoveBackground) {
		const model = estimateBackgroundModel(image);
		return {
			backgroundModel: model,
			backgroundDiagnostic: {
				confidence: model.confidence,
				removalRolledBack: false,
				preRemoval: { attempted: false, rolledBack: false },
			},
		};
	}
	const automaticBackground = removeAutomaticBackground(
		image,
		options.backgroundTolerance,
		options.bgRemovalScope,
		options.bgConnectivity,
	);
	return {
		automaticBackground,
		backgroundModel: automaticBackground.model,
		backgroundDiagnostic: {
			confidence: automaticBackground.model.confidence,
			removalRolledBack: automaticBackground.rolledBack,
			preRemoval: {
				attempted: true,
				rolledBack: automaticBackground.rolledBack,
			},
		},
	};
};

/**
 * 事後除去の結果を診断へ合流させ、出力向けのロールバック判定を確定する。
 *
 * [Intended] 事前除去は原寸、事後除去は出力解像度で別々に消えすぎ判定を行うため、
 * 片方だけがロールバックすることがある。ロールバックした段階は入力をそのまま返すだけなので、
 * もう一方が成功していれば出力には背景の透過が残る。「透過を中止した」と伝えてよいのは、
 * 実施した段階がすべてロールバックしたときに限る。
 */
export const applyPostRemovalOutcome = (
	diagnostic: BackgroundDiagnostic | undefined,
	postRemoval: BackgroundRemovalStageOutcome,
): void => {
	if (!diagnostic) return;
	const stages = [diagnostic.preRemoval, postRemoval];
	const attempted = stages.filter((stage) => stage.attempted);
	diagnostic.removalRolledBack =
		attempted.length > 0 && attempted.every((stage) => stage.rolledBack);
};
