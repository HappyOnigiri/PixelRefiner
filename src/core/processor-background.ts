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
				preRemoval: { attempted: false, rolledBack: false, removed: false },
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
			preRemoval: {
				attempted: true,
				rolledBack: automaticBackground.rolledBack,
				removed:
					!automaticBackground.rolledBack &&
					automaticBackground.removedRatio > 0,
			},
		},
	};
};

/** 事後除去の実施結果を診断へ記録する。 */
export const applyPostRemovalOutcome = (
	diagnostic: BackgroundDiagnostic | undefined,
	postRemoval: BackgroundRemovalStageOutcome,
): void => {
	if (!diagnostic) return;
	diagnostic.postRemoval = postRemoval;
};

/**
 * 利用者へ「背景の透過を中止した」と伝えてよいかを、段階ごとの結果から判定する。
 *
 * [Intended] 事前除去は原寸、事後除去は出力解像度で別々に消えすぎ判定を行うため、
 * 片方だけがロールバックすることがある。ロールバックした段階は入力をそのまま返すだけなので、
 * もう一方が透過を作っていれば出力には背景の透過が残る。中止を伝えてよいのは、
 * どこかの段階が消えすぎで巻き戻り、かつどの段階も透過を作らなかったときに限る。
 * ロールバックしなかった段階を成功と見なすと、除去対象が無くて何も消さなかった段階が
 * 巻き戻りを打ち消し、透過が一切ない出力でも中止を伝えられなくなる。
 */
export const hasSkippedBackgroundRemoval = (
	diagnostic: BackgroundDiagnostic,
): boolean => {
	const stages = [diagnostic.preRemoval, diagnostic.postRemoval];
	let rolledBack = false;
	for (const stage of stages) {
		if (stage === undefined || !stage.attempted) continue;
		if (stage.removed) return false;
		if (stage.rolledBack) rolledBack = true;
	}
	return rolledBack;
};
