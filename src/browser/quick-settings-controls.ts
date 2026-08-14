import type {
	DetailLevel,
	ProcessingMode,
	ProcessingRoute,
} from "../shared/types";
import type { Elements } from "./app-elements";
import type {
	QuickBackground,
	QuickDithering,
	QuickReductionMode,
	QuickSettingsState,
} from "./quick-settings";

type QuickSettingsControlsOptions = {
	els: Elements;
	triggerAutoProcess: () => void;
	clearCandidateSelections: () => void;
};

export type QuickSettingsControls = {
	getQuickSettings: () => QuickSettingsState;
	setBackgroundColor: (hex: string) => void;
};

type QuickSettingsDisabledStateOptions = {
	preservePendingAutoRoute?: boolean;
};

const setQuickControlDisabled = (
	control: HTMLInputElement | HTMLSelectElement,
	disabled: boolean,
): void => {
	control.disabled = disabled;
	const item = control.closest(".setting-item");
	if (!item) return;
	item.classList.toggle("disabled", disabled);
	item.setAttribute("aria-disabled", String(disabled));
};

export const updateQuickSettingsDisabledStates = (
	els: Elements,
	activeRoute?: ProcessingRoute,
	options: QuickSettingsDisabledStateOptions = {},
): void => {
	const processingMode = els.quickProcessingModeSelect.value as ProcessingMode;
	const effectiveRoute =
		processingMode === "auto" ? activeRoute : processingMode;
	// [Intended] Auto の再処理中は直前に確定した経路の表示状態を維持し、
	// 新しい処理結果が確定してからサイズ項目を切り替える。
	if (
		!(
			processingMode === "auto" &&
			options.preservePendingAutoRoute &&
			activeRoute === undefined
		)
	) {
		setQuickControlDisabled(
			els.quickDetailLevelSelect,
			effectiveRoute !== undefined && effectiveRoute !== "convert",
		);
	}

	const background = els.quickBackgroundSelect.value as QuickBackground;
	els.quickBackgroundPicker.style.display =
		background === "pick" ? "flex" : "none";

	const reductionMode = els.quickReductionModeSelect
		.value as QuickReductionMode;
	setQuickControlDisabled(els.quickDitheringSelect, reductionMode === "none");
};

/**
 * かんたん設定の DOM から状態を読み出す。
 *
 * [Policy] 処理オプションの生成もこの関数を通す。読み出しが分かれていると、
 * 項目を足したときに片方だけ更新されて処理に反映されない状態になる。
 */
export const readQuickSettings = (els: Elements): QuickSettingsState => ({
	processingMode: els.quickProcessingModeSelect.value as ProcessingMode,
	detailLevel: els.quickDetailLevelSelect.value as DetailLevel,
	reductionMode: els.quickReductionModeSelect.value as QuickReductionMode,
	background: els.quickBackgroundSelect.value as QuickBackground,
	backgroundColor: els.quickBackgroundColorInput.value,
	dithering: els.quickDitheringSelect.value as QuickDithering,
	trimToContent: els.quickAutoTrimSelect.value === "auto",
});

export const setupQuickSettingsControls = ({
	els,
	triggerAutoProcess,
	clearCandidateSelections,
}: QuickSettingsControlsOptions): QuickSettingsControls => {
	const getQuickSettings = (): QuickSettingsState => readQuickSettings(els);

	const setBackgroundColor = (hex: string) => {
		els.quickBackgroundColorInput.value = hex;
	};

	const handleQuickSettingChange = (preservePendingAutoRoute: boolean) => {
		clearCandidateSelections();
		updateQuickSettingsDisabledStates(els, undefined, {
			preservePendingAutoRoute,
		});
		triggerAutoProcess();
	};

	// [Intended] 処理方法自体の変更では直前の表示状態を維持しない。
	// 維持したいのは Auto のまま他項目を変えたときのちらつきだけで、
	// 別モードから Auto へ切り替えた時点の表示状態は引き継ぐ対象ではない。
	els.quickProcessingModeSelect.addEventListener("change", () => {
		handleQuickSettingChange(false);
	});

	[
		els.quickDetailLevelSelect,
		els.quickReductionModeSelect,
		els.quickBackgroundSelect,
		els.quickDitheringSelect,
		els.quickAutoTrimSelect,
	].forEach((control) => {
		control.addEventListener("change", () => {
			handleQuickSettingChange(true);
		});
	});

	updateQuickSettingsDisabledStates(els);
	return { getQuickSettings, setBackgroundColor };
};
