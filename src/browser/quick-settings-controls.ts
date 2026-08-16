import type {
	CellScale,
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
	// 新しい処理結果が確定してからサイズ項目を切り替える。維持するのは
	// activeRoute が未確定のときだけで、確定経路を渡す呼び出しは常に更新する。
	const keepPendingAutoRoute =
		processingMode === "auto" &&
		options.preservePendingAutoRoute === true &&
		activeRoute === undefined;
	if (!keepPendingAutoRoute) {
		setQuickControlDisabled(
			els.quickDetailLevelSelect,
			effectiveRoute !== undefined && effectiveRoute !== "convert",
		);
		// [Intended] ドットの大きさは検出した格子を拡縮する指定なので、格子を復元する
		// 「輪郭をくっきり」でしか効かない。細かさ（convert 専用）と対になる関係。
		setQuickControlDisabled(
			els.quickCellScaleSelect,
			effectiveRoute !== undefined && effectiveRoute !== "refine",
		);
	}

	const background = els.quickBackgroundSelect.value as QuickBackground;
	els.quickBackgroundPicker.style.display =
		background === "pick" ? "flex" : "none";

	const reductionMode = els.quickReductionModeSelect
		.value as QuickReductionMode;
	// [Intended] 減色「おまかせ」のときだけディザリングの可否が経路で変わるため、
	// 経路が未確定の再処理中は直前の表示状態を維持する。維持しないと、Auto のまま
	// 他の項目を変えるたびにディザリングが一度有効表示へ戻ってちらつく。
	// 経路に依存しない選択（減色なし・固定色数）は常に更新する。
	if (reductionMode !== "auto") {
		setQuickControlDisabled(els.quickDitheringSelect, reductionMode === "none");
	} else if (!keepPendingAutoRoute) {
		setQuickControlDisabled(
			els.quickDitheringSelect,
			effectiveRoute !== undefined && effectiveRoute !== "convert",
		);
	}
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
	cellScale: els.quickCellScaleSelect.value as CellScale,
	reductionMode: els.quickReductionModeSelect.value as QuickReductionMode,
	background: els.quickBackgroundSelect.value as QuickBackground,
	backgroundColor: els.quickBackgroundColorInput.value,
	dithering: els.quickDitheringSelect.value as QuickDithering,
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
		els.quickCellScaleSelect,
		els.quickReductionModeSelect,
		els.quickBackgroundSelect,
		els.quickDitheringSelect,
	].forEach((control) => {
		control.addEventListener("change", () => {
			handleQuickSettingChange(true);
		});
	});

	updateQuickSettingsDisabledStates(els);
	return { getQuickSettings, setBackgroundColor };
};
