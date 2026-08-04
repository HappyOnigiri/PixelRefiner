import type { ProcessingAnalysis } from "../shared/types";

type Translate = (
	key: string,
	params?: Record<string, string | number>,
) => string;

export const formatProcessingAnalysis = (
	analysis: ProcessingAnalysis,
	t: Translate,
): string => {
	const classification = analysis.classification
		? t(`classification.${analysis.classification}`)
		: t("classification.manual");
	const route = t(`route.${analysis.route}`);
	const rawConfidence =
		analysis.classificationConfidence ?? analysis.confidence;
	const confidence = Math.round(Math.min(1, Math.max(0, rawConfidence)) * 100);
	return t("result.analysis", { classification, route, confidence });
};
