import { createConvertCandidates } from "../core/converter";
import { clampInt, PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import type { DetailLevel, ProcessingRoute, RawImage } from "../shared/types";
import type { Elements } from "./app-elements";

export type AdvancedConvertSizeMode =
	| DetailLevel
	| "custom-width"
	| "custom-height"
	| "custom-both";

const DETAIL_LEVELS: readonly DetailLevel[] = [
	"smallest",
	"small",
	"coarse",
	"balanced",
	"detailed",
];

export const isConvertDetailLevel = (value: string): value is DetailLevel =>
	DETAIL_LEVELS.includes(value as DetailLevel);

const hasNumber = (input: HTMLInputElement): boolean => {
	const value = input.value.trim();
	return value !== "" && Number.isFinite(Number(value));
};

export const hasCompleteConvertOutputSize = (els: Elements): boolean =>
	isConvertDetailLevel(els.advancedConvertSizeModeSelect.value) ||
	(els.advancedConvertSizeModeSelect.value === "custom-width" &&
		hasNumber(els.advancedConvertWidthInput)) ||
	(els.advancedConvertSizeModeSelect.value === "custom-height" &&
		hasNumber(els.advancedConvertHeightInput)) ||
	(els.advancedConvertSizeModeSelect.value === "custom-both" &&
		hasNumber(els.advancedConvertWidthInput) &&
		hasNumber(els.advancedConvertHeightInput));

export const hasCompleteForcedSize = (els: Elements): boolean =>
	els.gridDetectionModeSelect.value === "force" &&
	hasNumber(els.forcePixelsWInput) &&
	hasNumber(els.forcePixelsHInput);

/**
 * Convert の自動候補を、選択したカスタム入力の初期値へ展開する。
 *
 * [Intended] 幅だけ・高さだけの指定では、もう一方をコア側が実処理領域から算出する。
 * UI は利用者が指定すると選んだ軸だけを補い、入力対象ではない値を暗黙に送らない。
 */
export const populateAdvancedConvertOutputSize = (
	els: Elements,
	image: RawImage | undefined,
): void => {
	if (!image) return;
	const mode = els.advancedConvertSizeModeSelect
		.value as AdvancedConvertSizeMode;
	if (isConvertDetailLevel(mode)) return;
	const candidates = createConvertCandidates(image);
	const suggested = candidates.find(
		(candidate) => candidate.label === PROCESS_DEFAULTS.detailLevel,
	);
	if (!suggested) return;
	const usesWidth = mode === "custom-width" || mode === "custom-both";
	const usesHeight = mode === "custom-height" || mode === "custom-both";
	if (usesWidth && els.advancedConvertWidthInput.value.trim() === "") {
		els.advancedConvertWidthInput.value = String(
			clampInt(suggested.outW, PROCESS_RANGES.convertPixelsW),
		);
	}
	if (usesHeight && els.advancedConvertHeightInput.value.trim() === "") {
		els.advancedConvertHeightInput.value = String(
			clampInt(suggested.outH, PROCESS_RANGES.convertPixelsH),
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
	const sizeMode = els.advancedConvertSizeModeSelect
		.value as AdvancedConvertSizeMode;
	const showWidth =
		showConvertSize &&
		(sizeMode === "custom-width" || sizeMode === "custom-both");
	const showHeight =
		showConvertSize &&
		(sizeMode === "custom-height" || sizeMode === "custom-both");

	els.advancedConvertSizeModeSetting.hidden = !showConvertSize;
	els.advancedConvertWidthSetting.hidden = !showWidth;
	els.advancedConvertHeightSetting.hidden = !showHeight;
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
