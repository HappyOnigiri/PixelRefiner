import type { createDefaultProcessOptions } from "../core/processor-options";
import { PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import type { Elements } from "./app-elements";

type ProcessDefaults = ReturnType<typeof createDefaultProcessOptions>;

/**
 * 詳細設定へ公開した「Auto の自動判定」と検出器の調整項目。
 *
 * [Intended] 既定値の反映・変更監視・プリセット保存の 3 箇所が同じ一覧を見るようにする。
 * 項目を足すときにどこか 1 箇所だけ漏れる、という壊れ方を防ぐのが目的。
 */
export const advancedSettingControls = (
	els: Elements,
): Array<HTMLInputElement | HTMLSelectElement> => [
	els.cellSamplingModeSelect,
	els.smallAspectGridAlignmentSelect,
	els.watermarkSamplingCompatSelect,
	els.preserveThinFeaturesCheck,
	els.autoGridFromTrimmedCheck,
	els.phaseAwareGridSearchCheck,
	els.boundaryContrastOverrideCheck,
	els.detectionBackgroundMaskCheck,
	els.gridSignalColorBoundaryCheck,
	els.gridSignalLuminanceAlphaCheck,
	els.gridSignalAutocorrelationCheck,
	els.gridSignalReconstructionCheck,
	els.gridSignalLocalPhaseCheck,
	els.backgroundDehaloCheck,
	els.backgroundEdgeCleanupCheck,
	els.backgroundRampFollowCheck,
	els.backgroundRemovalRollbackCheck,
	els.alphaBorderBackgroundGuardCheck,
	els.backgroundConfidenceGateCheck,
	els.smallComponentBackgroundGateCheck,
	els.maxSamplesPerCellInput,
	els.cellAlphaThresholdInput,
	els.autoMaxCellsWInput,
	els.autoMaxCellsHInput,
	els.backgroundMaskToleranceInput,
	els.trimAlphaThresholdInput,
];

/**
 * 格子検出でしか効かない詳細設定。
 *
 * [Intended] 候補選択のクリア対象と、グリッド検出モードに応じた無効表示が
 * 同じ一覧を見るようにする。片方だけに足すと、設定を変えても候補の固定サイズが
 * 残る／効かない項目が有効に見える、という壊れ方をする。
 */
export const gridDetectionAdvancedControls = (
	els: Elements,
): Array<HTMLInputElement | HTMLSelectElement> => [
	els.autoGridFromTrimmedCheck,
	els.phaseAwareGridSearchCheck,
	els.boundaryContrastOverrideCheck,
	els.detectionBackgroundMaskCheck,
	els.backgroundMaskToleranceInput,
	els.gridSignalColorBoundaryCheck,
	els.gridSignalLuminanceAlphaCheck,
	els.gridSignalAutocorrelationCheck,
	els.gridSignalReconstructionCheck,
	els.gridSignalLocalPhaseCheck,
	els.autoMaxCellsWInput,
	els.autoMaxCellsHInput,
];

/**
 * 背景抽出が無効なら効かない詳細設定。
 *
 * [Intended] createProcessOptions が bgEnabled で強制 false にしている項目に限る。
 * 巻き戻しや信頼度ゲートは背景抽出が無効でも透かし除去の経路で効くため含めない。
 */
export const backgroundDependentAdvancedControls = (
	els: Elements,
): Array<HTMLInputElement | HTMLSelectElement> => [
	els.backgroundDehaloCheck,
	els.backgroundEdgeCleanupCheck,
	els.backgroundRampFollowCheck,
];

/** 詳細設定へ公開した項目に既定値を反映する。 */
export const applyAdvancedSettingDefaults = (
	els: Elements,
	defaults: ProcessDefaults,
): void => {
	els.cellSamplingModeSelect.value = defaults.cellSamplingMode;
	els.smallAspectGridAlignmentSelect.value = defaults.smallAspectGridAlignment;
	els.watermarkSamplingCompatSelect.value = defaults.watermarkSamplingCompat;

	els.preserveThinFeaturesCheck.checked = defaults.preserveThinFeatures;
	els.autoGridFromTrimmedCheck.checked = defaults.autoGridFromTrimmed;
	els.phaseAwareGridSearchCheck.checked = defaults.phaseAwareGridSearch;
	els.boundaryContrastOverrideCheck.checked = defaults.boundaryContrastOverride;
	els.detectionBackgroundMaskCheck.checked = defaults.backgroundMask;

	els.gridSignalColorBoundaryCheck.checked = defaults.gridSignals.colorBoundary;
	els.gridSignalLuminanceAlphaCheck.checked =
		defaults.gridSignals.luminanceAlphaGradient;
	els.gridSignalAutocorrelationCheck.checked =
		defaults.gridSignals.autocorrelation;
	els.gridSignalReconstructionCheck.checked =
		defaults.gridSignals.reconstruction;
	els.gridSignalLocalPhaseCheck.checked =
		defaults.gridSignals.localPhaseStability;

	els.backgroundDehaloCheck.checked = defaults.backgroundDehalo;
	els.backgroundEdgeCleanupCheck.checked = defaults.backgroundEdgeCleanup;
	els.backgroundRampFollowCheck.checked = defaults.backgroundRampFollow;
	els.backgroundRemovalRollbackCheck.checked =
		defaults.backgroundRemovalRollback;
	els.alphaBorderBackgroundGuardCheck.checked =
		defaults.alphaBorderBackgroundGuard;
	els.backgroundConfidenceGateCheck.checked = defaults.backgroundConfidenceGate;
	els.smallComponentBackgroundGateCheck.checked =
		defaults.smallComponentBackgroundGate;

	const applyRange = (
		input: HTMLInputElement,
		range: { min: number; max: number },
	): void => {
		input.min = String(range.min);
		input.max = String(range.max);
	};
	applyRange(els.maxSamplesPerCellInput, PROCESS_RANGES.maxSamplesPerCell);
	applyRange(els.cellAlphaThresholdInput, PROCESS_RANGES.cellAlphaThreshold);
	applyRange(els.autoMaxCellsWInput, PROCESS_RANGES.autoMaxCells);
	applyRange(els.autoMaxCellsHInput, PROCESS_RANGES.autoMaxCells);
	applyRange(
		els.backgroundMaskToleranceInput,
		PROCESS_RANGES.backgroundMaskTolerance,
	);
	applyRange(els.trimAlphaThresholdInput, PROCESS_RANGES.trimAlphaThreshold);

	els.maxSamplesPerCellInput.value = String(defaults.maxSamplesPerCell);
	els.cellAlphaThresholdInput.value = String(defaults.cellAlphaThreshold);
	els.autoMaxCellsWInput.value = String(defaults.autoMaxCellsW);
	els.autoMaxCellsHInput.value = String(defaults.autoMaxCellsH);
	els.backgroundMaskToleranceInput.value = String(
		defaults.backgroundMaskTolerance,
	);
	els.trimAlphaThresholdInput.value = String(defaults.trimAlphaThreshold);
};

/**
 * UI 追加前に保存されたプリセットを、新しい設定項目の既定値で補う。
 *
 * [Policy] 既定値はいずれも従来の挙動と同じなので、古いプリセットを読み込んでも
 * 出力は変わらない。旧 boolean の "alpha-aware-medoid" だけは、同じ意味を保つよう
 * 3 択のセルサンプリングへ読み替える。
 */
export const migrateAdvancedSettings = (
	state: Record<string, string | number | boolean>,
): void => {
	if (state["cell-sampling-mode"] === undefined) {
		state["cell-sampling-mode"] =
			state["alpha-aware-medoid"] === true
				? "alpha-aware-medoid"
				: PROCESS_DEFAULTS.cellSamplingMode;
	}
	state["small-aspect-grid-alignment"] ??=
		PROCESS_DEFAULTS.smallAspectGridAlignment;
	state["watermark-sampling-compat"] ??=
		PROCESS_DEFAULTS.watermarkSamplingCompat;

	state["preserve-thin-features"] ??= PROCESS_DEFAULTS.preserveThinFeatures;
	state["auto-grid-from-trimmed"] ??= PROCESS_DEFAULTS.autoGridFromTrimmed;
	state["phase-aware-grid-search"] ??= PROCESS_DEFAULTS.phaseAwareGridSearch;
	state["boundary-contrast-override"] ??=
		PROCESS_DEFAULTS.boundaryContrastOverride;
	state["detection-background-mask"] ??= PROCESS_DEFAULTS.backgroundMask;

	state["grid-signal-color-boundary"] ??=
		PROCESS_DEFAULTS.gridSignals.colorBoundary;
	state["grid-signal-luminance-alpha"] ??=
		PROCESS_DEFAULTS.gridSignals.luminanceAlphaGradient;
	state["grid-signal-autocorrelation"] ??=
		PROCESS_DEFAULTS.gridSignals.autocorrelation;
	state["grid-signal-reconstruction"] ??=
		PROCESS_DEFAULTS.gridSignals.reconstruction;
	state["grid-signal-local-phase"] ??=
		PROCESS_DEFAULTS.gridSignals.localPhaseStability;

	state["background-dehalo"] ??= PROCESS_DEFAULTS.backgroundDehalo;
	state["background-edge-cleanup"] ??= PROCESS_DEFAULTS.backgroundEdgeCleanup;
	state["background-ramp-follow"] ??= PROCESS_DEFAULTS.backgroundRampFollow;
	state["background-removal-rollback"] ??=
		PROCESS_DEFAULTS.backgroundRemovalRollback;
	state["alpha-border-background-guard"] ??=
		PROCESS_DEFAULTS.alphaBorderBackgroundGuard;
	state["background-confidence-gate"] ??=
		PROCESS_DEFAULTS.backgroundConfidenceGate;
	state["small-component-background-gate"] ??=
		PROCESS_DEFAULTS.smallComponentBackgroundGate;

	state["max-samples-per-cell"] ??= PROCESS_RANGES.maxSamplesPerCell.default;
	state["cell-alpha-threshold"] ??= PROCESS_RANGES.cellAlphaThreshold.default;
	state["auto-max-cells-w"] ??= PROCESS_RANGES.autoMaxCells.default;
	state["auto-max-cells-h"] ??= PROCESS_RANGES.autoMaxCells.default;
	state["background-mask-tolerance"] ??=
		PROCESS_RANGES.backgroundMaskTolerance.default;
	state["trim-alpha-threshold"] ??= PROCESS_RANGES.trimAlphaThreshold.default;
};
