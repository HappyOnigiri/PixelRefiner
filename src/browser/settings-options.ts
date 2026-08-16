import type { ProcessOptions } from "../core/processor";
import { createDefaultProcessOptions } from "../core/processor-options";
import { clampInt, PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import type { CellScale, DitherMode, OutlineStyle } from "../shared/types";
import { isConvertDetailLevel } from "./advanced-processing-controls";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import {
	createBuiltInPresetOptions,
	createQuickProcessOptions,
} from "./quick-settings";
import { readQuickSettings } from "./quick-settings-controls";
import { BROWSER_RUNTIME_CONFIG } from "./runtime-config";

const parseOptionalInt = (
	input: HTMLInputElement,
	range: { min: number; max: number; default: number },
): number | undefined => {
	const value = input.value.trim();
	if (value === "") return undefined;
	const number = Number(value);
	if (!Number.isFinite(number)) return undefined;
	return clampInt(number, range);
};

export const createAdvancedProcessOptions = (
	els: Elements,
	processingState: ProcessingState,
): ProcessOptions => {
	const pixelsW = parseOptionalInt(
		els.forcePixelsWInput,
		PROCESS_RANGES.forcePixelsW,
	);
	const pixelsH = parseOptionalInt(
		els.forcePixelsHInput,
		PROCESS_RANGES.forcePixelsH,
	);
	const usePixels = pixelsW !== undefined && pixelsH !== undefined;
	const convertPixelsW = parseOptionalInt(
		els.advancedConvertWidthInput,
		PROCESS_RANGES.convertPixelsW,
	);
	const convertPixelsH = parseOptionalInt(
		els.advancedConvertHeightInput,
		PROCESS_RANGES.convertPixelsH,
	);
	const convertSizeMode = els.advancedConvertSizeModeSelect.value;
	const hasBothConvertDimensions =
		convertPixelsW !== undefined && convertPixelsH !== undefined;
	const useConvertWidth =
		(convertSizeMode === "custom-width" && convertPixelsW !== undefined) ||
		(convertSizeMode === "custom-both" && hasBothConvertDimensions);
	const useConvertHeight =
		(convertSizeMode === "custom-height" && convertPixelsH !== undefined) ||
		(convertSizeMode === "custom-both" && hasBothConvertDimensions);
	type GridDetectionMode = "auto" | "hint" | "force" | "off";
	const gridMode = els.gridDetectionModeSelect.value as GridDetectionMode;
	const method = els.bgExtractionMethod
		.value as ProcessOptions["bgExtractionMethod"];
	const bgEnabled = method !== "none";
	const preRemoveBackground = bgEnabled && els.preRemoveCheck.checked;
	const postRemoveBackground = bgEnabled && els.postRemoveCheck.checked;
	const reduceColorMode = els.reduceColorModeSelect.value;
	const outlineHex = els.outlineColorInput.value;

	return {
		...createDefaultProcessOptions(),
		debug: BROWSER_RUNTIME_CONFIG.debug,
		processingMode: els.advancedProcessingModeSelect
			.value as ProcessOptions["processingMode"],
		detailLevel: isConvertDetailLevel(convertSizeMode)
			? convertSizeMode
			: PROCESS_DEFAULTS.detailLevel,
		cellScale: els.advancedCellScaleSelect.value as CellScale,
		convertPixelsW: useConvertWidth ? convertPixelsW : undefined,
		convertPixelsH: useConvertHeight ? convertPixelsH : undefined,
		detectionQuantStep: clampInt(
			Number(els.quantStepInput.value),
			PROCESS_RANGES.detectionQuantStep,
		),
		forcePixelsW: gridMode === "force" && usePixels ? pixelsW : undefined,
		forcePixelsH: gridMode === "force" && usePixels ? pixelsH : undefined,
		hintPixelsW: gridMode === "hint" && usePixels ? pixelsW : undefined,
		hintPixelsH: gridMode === "hint" && usePixels ? pixelsH : undefined,
		preRemoveBackground,
		postRemoveBackground,
		bgRemovalScope: bgEnabled
			? (els.advancedBgRemovalScopeSelect
					.value as ProcessOptions["bgRemovalScope"])
			: "off",
		bgConnectivity: bgEnabled
			? (els.bgConnectivitySelect.value as ProcessOptions["bgConnectivity"])
			: "4",
		backgroundTolerance: clampInt(
			Number(els.toleranceInput.value),
			PROCESS_RANGES.backgroundTolerance,
		),
		sampleWindow: clampInt(
			Number(els.sampleWindowInput.value),
			PROCESS_RANGES.sampleWindow,
		),
		cellSamplingMode: els.cellSamplingModeSelect
			.value as ProcessOptions["cellSamplingMode"],
		maxSamplesPerCell: clampInt(
			Number(els.maxSamplesPerCellInput.value),
			PROCESS_RANGES.maxSamplesPerCell,
		),
		cellAlphaThreshold: clampInt(
			Number(els.cellAlphaThresholdInput.value),
			PROCESS_RANGES.cellAlphaThreshold,
		),
		trimAlphaThreshold: clampInt(
			Number(els.trimAlphaThresholdInput.value),
			PROCESS_RANGES.trimAlphaThreshold,
		),
		autoMaxCellsW: clampInt(
			Number(els.autoMaxCellsWInput.value),
			PROCESS_RANGES.autoMaxCells,
		),
		autoMaxCellsH: clampInt(
			Number(els.autoMaxCellsHInput.value),
			PROCESS_RANGES.autoMaxCells,
		),
		backgroundMask: els.detectionBackgroundMaskCheck.checked,
		backgroundMaskTolerance: clampInt(
			Number(els.backgroundMaskToleranceInput.value),
			PROCESS_RANGES.backgroundMaskTolerance,
		),
		preserveThinFeatures: els.preserveThinFeaturesCheck.checked,
		autoGridFromTrimmed: els.autoGridFromTrimmedCheck.checked,
		phaseAwareGridSearch: els.phaseAwareGridSearchCheck.checked,
		boundaryContrastOverride: els.boundaryContrastOverrideCheck.checked,
		smallAspectGridAlignment: els.smallAspectGridAlignmentSelect
			.value as ProcessOptions["smallAspectGridAlignment"],
		watermarkSamplingCompat: els.watermarkSamplingCompatSelect
			.value as ProcessOptions["watermarkSamplingCompat"],
		gridSignals: {
			colorBoundary: els.gridSignalColorBoundaryCheck.checked,
			luminanceAlphaGradient: els.gridSignalLuminanceAlphaCheck.checked,
			autocorrelation: els.gridSignalAutocorrelationCheck.checked,
			reconstruction: els.gridSignalReconstructionCheck.checked,
			localPhaseStability: els.gridSignalLocalPhaseCheck.checked,
		},
		backgroundDehalo: bgEnabled && els.backgroundDehaloCheck.checked,
		backgroundEdgeCleanup: bgEnabled && els.backgroundEdgeCleanupCheck.checked,
		backgroundRampFollow: bgEnabled && els.backgroundRampFollowCheck.checked,
		backgroundRemovalRollback: els.backgroundRemovalRollbackCheck.checked,
		alphaBorderBackgroundGuard: els.alphaBorderBackgroundGuardCheck.checked,
		backgroundConfidenceGate: els.backgroundConfidenceGateCheck.checked,
		smallComponentBackgroundGate: els.smallComponentBackgroundGateCheck.checked,
		// [Policy] 詳細設定でも背景透過とトリムを一体にし、透過しない画像の全キャンバスを保つ。
		trimToContent: preRemoveBackground || postRemoveBackground,
		// [Policy] ブラウザUIでは背景透過の有無にかかわらず処理倍率を維持する。
		preserveProcessingScale: true,
		fastAutoGridFromTrimmed: els.fastAutoGridFromTrimmedCheck.checked,
		makeSquare: els.makeSquareCheck.checked,
		keepAspectRatio: els.keepAspectRatioCheck.checked,
		enableGridDetection: gridMode !== "off",
		reduceColors: reduceColorMode !== "none",
		reduceColorMode,
		ditherMode: els.ditherModeSelect.value as DitherMode,
		colorCount: clampInt(
			Number(els.colorCountInput.value),
			PROCESS_RANGES.colorCount,
		),
		ditherStrength: clampInt(
			Number(els.ditherStrengthInput.value),
			PROCESS_RANGES.ditherStrength,
		),
		smallComponentMode: bgEnabled
			? (els.smallComponentModeSelect
					.value as ProcessOptions["smallComponentMode"])
			: "off",
		geminiWatermarkRemoval: els.geminiWatermarkRemovalSelect
			.value as ProcessOptions["geminiWatermarkRemoval"],
		outlineStyle: els.outlineStyleSelect.value as OutlineStyle,
		outlineColor: {
			r: Number.parseInt(outlineHex.slice(1, 3), 16),
			g: Number.parseInt(outlineHex.slice(3, 5), 16),
			b: Number.parseInt(outlineHex.slice(5, 7), 16),
		},
		bgExtractionMethod: method,
		bgRgb: els.bgRgbInput.value,
		fixedPalette: processingState.currentFixedPalette,
	};
};

export const createProcessOptions = (
	els: Elements,
	processingState: ProcessingState,
): ProcessOptions => {
	if (processingState.settingsMode === "preset") {
		return {
			...createBuiltInPresetOptions(processingState.selectedBuiltInPresetId),
			debug: BROWSER_RUNTIME_CONFIG.debug,
		};
	}
	if (processingState.settingsMode === "quick") {
		return {
			...createQuickProcessOptions(readQuickSettings(els)),
			debug: BROWSER_RUNTIME_CONFIG.debug,
		};
	}
	return createAdvancedProcessOptions(els, processingState);
};
