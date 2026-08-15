import { PROCESS_DEFAULTS } from "../shared/config";
import {
	advancedModeControls,
	migrateAdvancedSettings,
} from "./advanced-settings-fields";
import type { Elements } from "./app-elements";
import type { ProcessingState, SettingsMode } from "./app-state";
import { i18n } from "./i18n";
import type { ModalController } from "./modal-controller";
import { showInfo } from "./notifications";
import { PresetManager } from "./presets";
import { BUILT_IN_PRESETS } from "./quick-settings";

type PresetControlsOptions = {
	els: Elements;
	processingState: ProcessingState;
	presetModalController: ModalController;
	updateDisabledStates: () => void;
	updateAdvancedProcessingDisabledStates: () => void;
	updateReduceColorsDisabledStates: () => void;
	updateBgDisabledStates: () => void;
	updateProcessButtonVisibility: () => void;
	triggerAutoProcess: () => void;
	setSettingsMode: (mode: SettingsMode, process?: boolean) => void;
	clearCandidateSelections: () => void;
	clearFixedPalette: () => void;
};

export const migrateSmallComponentMode = (
	state: Record<string, string | number | boolean>,
): void => {
	if (state["small-component-mode"] !== undefined) return;
	const legacyValue =
		state["floating-max-percent"] ?? state["floating-max-percent-slider"];
	if (typeof legacyValue === "number") {
		state["small-component-mode"] = legacyValue <= 0 ? "off" : "auto";
	}
};

export const setupPresetControls = ({
	els,
	processingState,
	presetModalController,
	updateDisabledStates,
	updateAdvancedProcessingDisabledStates,
	updateReduceColorsDisabledStates,
	updateBgDisabledStates,
	updateProcessButtonVisibility,
	triggerAutoProcess,
	setSettingsMode,
	clearCandidateSelections,
	clearFixedPalette,
}: PresetControlsOptions): void => {
	els.builtInPresetSelect.innerHTML = "";
	for (const preset of BUILT_IN_PRESETS) {
		const option = document.createElement("option");
		option.value = preset.id;
		option.dataset.i18n = preset.labelKey;
		option.textContent = i18n.t(
			preset.labelKey as Parameters<typeof i18n.t>[0],
		);
		els.builtInPresetSelect.appendChild(option);
	}
	const getUiState = (): Record<string, string | number | boolean> => {
		const state: Record<string, string | number | boolean> = {};
		const inputs = advancedModeControls(els);

		for (const input of inputs) {
			if (input instanceof HTMLInputElement) {
				if (input.type === "checkbox") {
					state[input.id] = input.checked;
				} else if (input.type === "number" || input.type === "range") {
					const optionalConvertDimension =
						input.id === "advanced-convert-width" ||
						input.id === "advanced-convert-height";
					state[input.id] =
						optionalConvertDimension && input.value === ""
							? ""
							: Number(input.value);
				} else {
					state[input.id] = input.value;
				}
			} else if (input instanceof HTMLSelectElement) {
				state[input.id] = input.value;
			}
		}
		if (processingState.currentFixedPalette) {
			state["fixed-palette"] = JSON.stringify(
				processingState.currentFixedPalette,
			);
		}
		return state;
	};

	const applyUiState = (state: Record<string, string | number | boolean>) => {
		// [Policy] 旧プリセットの割合設定は、無効か安全な自動判定へだけ移行する。
		migrateSmallComponentMode(state);
		// [Policy] UI追加前のプリセットは新しい既定値へ移行し、読み込み順で挙動を変えない。
		migrateAdvancedSettings(state);
		state["gemini-watermark-removal"] ??=
			PROCESS_DEFAULTS.geminiWatermarkRemoval;
		// 後方互換性: 旧 boolean の "enable-grid-detection" を新しいモード選択へ移行
		if (
			state["grid-detection-mode"] === undefined &&
			typeof state["enable-grid-detection"] === "boolean"
		) {
			state["grid-detection-mode"] = state["enable-grid-detection"]
				? "auto"
				: "off";
		}

		// 後方互換性: enable-bg-removal を bg-extraction-method へ移行
		if (
			state["bg-extraction-method"] === undefined &&
			typeof state["enable-bg-removal"] === "boolean"
		) {
			state["bg-extraction-method"] = state["enable-bg-removal"]
				? "top-left"
				: "none";
		}

		// 後方互換性: remove-inner-background を bg-removal-scope へ移行
		if (
			state["bg-removal-scope"] === undefined &&
			typeof state["remove-inner-background"] === "boolean"
		) {
			state["bg-removal-scope"] = state["remove-inner-background"]
				? "all"
				: "outer";
		}

		// 後方互換性: 旧背景除去スコープを詳細設定の項目へ移行
		if (
			state["advanced-bg-removal-scope"] === undefined &&
			state["bg-removal-scope"] !== undefined
		) {
			state["advanced-bg-removal-scope"] = state["bg-removal-scope"];
		}

		// 非推奨の背景除去スコープ "off" は "outer" に対応付ける
		if (state["advanced-bg-removal-scope"] === "off") {
			state["advanced-bg-removal-scope"] = "outer";
		}

		for (const [id, value] of Object.entries(state)) {
			const el = document.getElementById(id);
			if (!el) continue;

			if (el instanceof HTMLInputElement) {
				if (el.type === "checkbox") {
					if (typeof value !== "boolean") continue;
					el.checked = value;
				} else {
					el.value = String(value);
				}
			} else if (el instanceof HTMLSelectElement) {
				const next = String(value);
				if (!Array.from(el.options).some((option) => option.value === next)) {
					continue;
				}
				el.value = next;
			}
		}
		const fixedPalette = state["fixed-palette"];
		if (typeof fixedPalette === "string") {
			try {
				const parsed: unknown = JSON.parse(fixedPalette);
				if (
					!Array.isArray(parsed) ||
					!parsed.every(
						(color) =>
							typeof color === "object" &&
							color !== null &&
							typeof color.r === "number" &&
							typeof color.g === "number" &&
							typeof color.b === "number",
					)
				) {
					throw new Error("Invalid fixed palette");
				}
				processingState.currentFixedPalette = parsed;
			} catch {
				clearFixedPalette();
			}
		} else {
			clearFixedPalette();
		}
		clearCandidateSelections();
		updateDisabledStates();
		updateAdvancedProcessingDisabledStates();
		updateReduceColorsDisabledStates();
		updateBgDisabledStates();
		updateProcessButtonVisibility();
		setSettingsMode("advanced");
	};

	els.builtInPresetSelect.addEventListener("change", () => {
		const preset = BUILT_IN_PRESETS.find(
			(entry) => entry.id === els.builtInPresetSelect.value,
		);
		if (!preset) return;
		processingState.selectedBuiltInPresetId = preset.id;
		clearCandidateSelections();
		triggerAutoProcess();
	});

	const updatePresetList = () => {
		const presets = PresetManager.loadPresets();
		els.presetModalList.innerHTML = "";

		if (presets.length === 0) {
			els.presetModalList.innerHTML = `<div class="status-text" style="text-align: center; padding: 20px; opacity: 0.5;">${i18n.t("option.none")}</div>`;
			return;
		}

		presets.forEach((preset) => {
			const item = document.createElement("div");
			item.className = "preset-item";

			const nameSpan = document.createElement("span");
			nameSpan.className = "preset-item-name";
			nameSpan.textContent = preset.name;
			item.appendChild(nameSpan);

			const actions = document.createElement("div");
			actions.className = "preset-item-actions";

			const loadBtn = document.createElement("button");
			loadBtn.type = "button";
			loadBtn.className = "action-button small-button outline-button";
			loadBtn.textContent = i18n.t("ui.load_preset");
			loadBtn.onclick = () => {
				applyUiState(preset.data);
				els.presetNameInput.value = preset.name;
				showInfo(i18n.t("ui.preset_loaded", { name: preset.name }));
				presetModalController.close();
			};
			actions.appendChild(loadBtn);

			const deleteBtn = document.createElement("button");
			deleteBtn.type = "button";
			deleteBtn.className = "text-button danger-text";
			deleteBtn.textContent = i18n.t("ui.delete_preset");
			deleteBtn.onclick = () => {
				if (confirm(i18n.t("ui.confirm_delete_preset"))) {
					PresetManager.deletePreset(preset.id);
					updatePresetList();
				}
			};
			actions.appendChild(deleteBtn);

			item.appendChild(actions);
			els.presetModalList.appendChild(item);
		});
	};

	els.savePresetButton.addEventListener("click", () => {
		let name = els.presetNameInput.value.trim();
		if (!name) {
			name = new Date().toLocaleString();
		}

		const state = getUiState();
		const presets = PresetManager.loadPresets();
		const existing = presets.find((p) => p.name === name);

		if (existing) {
			if (confirm(i18n.t("ui.confirm_overwrite_preset"))) {
				PresetManager.updatePreset(existing.id, state);
				showInfo(i18n.t("ui.preset_saved", { name: name }));
			}
		} else {
			PresetManager.savePreset(name, state);
			showInfo(i18n.t("ui.preset_saved", { name: name }));
		}
		updatePresetList();
	});

	els.loadPresetModalButton.addEventListener("click", () => {
		updatePresetList();
		presetModalController.open();
	});

	els.closePresetModal.addEventListener("click", () => {
		presetModalController.close();
	});

	els.presetModal.addEventListener("click", (e) => {
		if (e.target === els.presetModal) {
			presetModalController.close();
		}
	});

	updatePresetList();
};
