import type {
	DetailLevel,
	OutlineStyle,
	ProcessingMode,
	ProcessingRoute,
} from "../shared/types";
import type { Elements } from "./app-elements";
import type {
	QuickBackground,
	QuickBackgroundRemovalScope,
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
): void => {
	const processingMode = els.quickProcessingModeSelect.value as ProcessingMode;
	const effectiveRoute =
		processingMode === "auto" ? activeRoute : processingMode;
	// [Intended] Auto は画像ごとに経路が変わるため、処理結果が無い間は選択を許可する。
	// 結果が出た後は、その画像で実際に採用された経路に合わせて無効状態を示す。
	setQuickControlDisabled(
		els.quickDetailLevelSelect,
		effectiveRoute !== undefined && effectiveRoute !== "convert",
	);

	const background = els.quickBackgroundSelect.value as QuickBackground;
	setQuickControlDisabled(els.quickBgRemovalScopeSelect, background === "keep");
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
	bgRemovalScope: els.quickBgRemovalScopeSelect
		.value as QuickBackgroundRemovalScope,
	dithering: els.quickDitheringSelect.value as QuickDithering,
	outlineStyle: els.quickOutlineStyleSelect.value as OutlineStyle,
	trimToContent: els.quickAutoTrimCheck.checked,
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

	[
		els.quickProcessingModeSelect,
		els.quickDetailLevelSelect,
		els.quickReductionModeSelect,
		els.quickBackgroundSelect,
		els.quickBgRemovalScopeSelect,
		els.quickDitheringSelect,
		els.quickOutlineStyleSelect,
		els.quickAutoTrimCheck,
	].forEach((control) => {
		control.addEventListener("change", () => {
			clearCandidateSelections();
			updateQuickSettingsDisabledStates(els);
			triggerAutoProcess();
		});
	});

	updateQuickSettingsDisabledStates(els);
	return { getQuickSettings, setBackgroundColor };
};
