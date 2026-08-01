import type { Elements } from "./app-elements";
import { i18n } from "./i18n";
import type { ModalController } from "./modal-controller";
import { showInfo } from "./notifications";
import { PresetManager } from "./presets";

type PresetControlsOptions = {
	els: Elements;
	presetModalController: ModalController;
	updateDisabledStates: () => void;
	updateReduceColorsDisabledStates: () => void;
	updateBgDisabledStates: () => void;
	updateProcessButtonVisibility: () => void;
	triggerAutoProcess: () => void;
};

export const setupPresetControls = ({
	els,
	presetModalController,
	updateDisabledStates,
	updateReduceColorsDisabledStates,
	updateBgDisabledStates,
	updateProcessButtonVisibility,
	triggerAutoProcess,
}: PresetControlsOptions): void => {
	const getUiState = (): Record<string, string | number | boolean> => {
		const state: Record<string, string | number | boolean> = {};
		const inputs = [
			els.quantStepInput,
			els.quantStepSlider,
			els.forcePixelsWInput,
			els.forcePixelsHInput,
			els.sampleWindowInput,
			els.sampleWindowSlider,
			els.toleranceInput,
			els.toleranceSlider,
			els.preRemoveCheck,
			els.postRemoveCheck,
			els.bgRemovalScopeSelect,
			els.bgConnectivitySelect,
			els.trimToContentCheck,
			els.fastAutoGridFromTrimmedCheck,
			els.makeSquareCheck,
			els.gridDetectionModeSelect,
			els.reduceColorModeSelect,
			els.ditherModeSelect,
			els.colorCountInput,
			els.colorCountSlider,
			els.ditherStrengthInput,
			els.ditherStrengthSlider,
			els.outlineStyleSelect,
			els.outlineColorInput,
			els.floatingMaxPercentInput,
			els.floatingMaxPercentSlider,
			els.bgExtractionMethod,
			els.bgRgbInput,
			els.bgColorInput,
			els.autoProcessToggle,
		];

		for (const input of inputs) {
			if (input instanceof HTMLInputElement) {
				if (input.type === "checkbox") {
					state[input.id] = input.checked;
				} else if (input.type === "number" || input.type === "range") {
					state[input.id] = Number(input.value);
				} else {
					state[input.id] = input.value;
				}
			} else if (input instanceof HTMLSelectElement) {
				state[input.id] = input.value;
			}
		}
		return state;
	};

	const applyUiState = (state: Record<string, string | number | boolean>) => {
		// Backward compatibility: migrate old boolean "enable-grid-detection" to new mode select
		if (
			state["grid-detection-mode"] === undefined &&
			typeof state["enable-grid-detection"] === "boolean"
		) {
			state["grid-detection-mode"] = state["enable-grid-detection"]
				? "auto"
				: "off";
		}

		// Backward compatibility: migrate enable-bg-removal to bg-extraction-method
		if (
			state["bg-extraction-method"] === undefined &&
			typeof state["enable-bg-removal"] === "boolean"
		) {
			state["bg-extraction-method"] = state["enable-bg-removal"]
				? "top-left"
				: "none";
		}

		// Backward compatibility: migrate remove-inner-background to bg-removal-scope
		if (
			state["bg-removal-scope"] === undefined &&
			typeof state["remove-inner-background"] === "boolean"
		) {
			state["bg-removal-scope"] = state["remove-inner-background"]
				? "all"
				: "outer";
		}

		// Deprecated "off" from bg removal scope: map to "outer"
		if (state["bg-removal-scope"] === "off") {
			state["bg-removal-scope"] = "outer";
		}

		for (const [id, value] of Object.entries(state)) {
			const el = document.getElementById(id);
			if (!el) continue;

			if (el instanceof HTMLInputElement) {
				if (el.type === "checkbox") {
					el.checked = value as boolean;
				} else {
					el.value = String(value);
				}
			} else if (el instanceof HTMLSelectElement) {
				el.value = String(value);
			}
			// Trigger change event to update UI dependencies
			el.dispatchEvent(new Event("change"));
		}
		updateDisabledStates();
		updateReduceColorsDisabledStates();
		updateBgDisabledStates();
		updateProcessButtonVisibility();
		triggerAutoProcess();
	};

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
