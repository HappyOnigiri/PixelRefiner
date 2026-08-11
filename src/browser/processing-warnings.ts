import { i18n } from "./i18n";

export const translateProcessingWarning = (code: string): string => {
	switch (code) {
		case "LOW_GRID_CONFIDENCE":
			return i18n.t("warning.low_grid_confidence");
		case "BACKGROUND_UNCERTAIN":
			return i18n.t("warning.background_uncertain");
		case "BACKGROUND_REMOVAL_SKIPPED":
			return i18n.t("warning.background_removal_skipped");
		case "CONTENT_LOSS_RISK":
			return i18n.t("warning.content_loss_risk");
		case "ONE_AXIS_DETECTION_FAILED":
			return i18n.t("warning.one_axis_detection_failed");
		case "EXTREME_OUTPUT_SIZE":
			return i18n.t("warning.extreme_output_size");
		case "NO_CONTENT":
			return i18n.t("warning.no_content");
		case "FALLBACK_TO_PRESERVE":
			return i18n.t("warning.fallback_to_preserve");
		default:
			return i18n.t("warning.unknown", { code });
	}
};

export const translateProcessingWarnings = (
	codes: readonly string[],
): string[] => codes.map(translateProcessingWarning);

export const shouldNotifyProcessingWarnings = (
	codes: readonly string[],
	candidateModalDisplayed: boolean,
): boolean => codes.length > 0 && !candidateModalDisplayed;
