import { createConvertCandidates } from "../core/converter";
import { clampInt, PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import type { ProcessingRoute, RawImage } from "../shared/types";
import type { Elements } from "./app-elements";

const hasNumber = (input: HTMLInputElement): boolean => {
	const value = input.value.trim();
	return value !== "" && Number.isFinite(Number(value));
};

export const hasCompleteConvertOutputSize = (els: Elements): boolean =>
	hasNumber(els.advancedConvertWidthInput) &&
	hasNumber(els.advancedConvertHeightInput);

export const hasCompleteForcedSize = (els: Elements): boolean =>
	els.gridDetectionModeSelect.value === "force" &&
	hasNumber(els.forcePixelsWInput) &&
	hasNumber(els.forcePixelsHInput);

/**
 * Convert の自動候補を、詳細設定で編集できる具体的な幅・高さへ展開する。
 *
 * [Intended] 片方だけ入力済みなら利用者の値を保持し、欠けている軸だけを補う。
 */
export const populateAdvancedConvertOutputSize = (
	els: Elements,
	image: RawImage | undefined,
): void => {
	if (!image) return;
	if (
		els.advancedConvertWidthInput.value.trim() !== "" &&
		els.advancedConvertHeightInput.value.trim() !== ""
	) {
		return;
	}
	const candidates = createConvertCandidates(image);
	const suggested = candidates.find(
		(candidate) => candidate.label === PROCESS_DEFAULTS.detailLevel,
	);
	if (!suggested) return;
	const width = Number(els.advancedConvertWidthInput.value);
	const height = Number(els.advancedConvertHeightInput.value);
	if (els.advancedConvertWidthInput.value.trim() === "") {
		els.advancedConvertWidthInput.value = String(
			clampInt(
				Number.isFinite(height) && height > 0
					? Math.round((height * image.width) / image.height)
					: suggested.outW,
				PROCESS_RANGES.convertPixelsW,
			),
		);
	}
	if (els.advancedConvertHeightInput.value.trim() === "") {
		els.advancedConvertHeightInput.value = String(
			clampInt(
				Number.isFinite(width) && width > 0
					? Math.round((width * image.height) / image.width)
					: suggested.outH,
				PROCESS_RANGES.convertPixelsH,
			),
		);
	}
};

export const applyAdvancedConvertOutputRanges = (els: Elements): void => {
	els.advancedConvertWidthInput.min = String(PROCESS_RANGES.convertPixelsW.min);
	els.advancedConvertWidthInput.max = String(PROCESS_RANGES.convertPixelsW.max);
	els.advancedConvertHeightInput.min = String(
		PROCESS_RANGES.convertPixelsH.min,
	);
	els.advancedConvertHeightInput.max = String(
		PROCESS_RANGES.convertPixelsH.max,
	);
};

/** 詳細設定の処理経路に依存する表示と、強制サイズ優先時の無効状態を同期する。 */
export const updateAdvancedProcessingControls = (
	els: Elements,
	activeRoute?: ProcessingRoute,
): void => {
	const mode = els.advancedProcessingModeSelect.value;
	const forced = hasCompleteForcedSize(els);
	const showConvertSize =
		!forced &&
		(mode === "convert" || (mode === "auto" && activeRoute === "convert"));

	els.advancedConvertWidthSetting.hidden = !showConvertSize;
	els.advancedConvertHeightSetting.hidden = !showConvertSize;
	els.advancedProcessingModeSelect.disabled = forced;
	els.advancedProcessingModeSetting.classList.toggle(
		"is-disabled-visible",
		forced,
	);
	els.advancedProcessingModeSetting.setAttribute(
		"aria-disabled",
		String(forced),
	);
	els.advancedProcessingModeNotice.hidden = !forced;
};
