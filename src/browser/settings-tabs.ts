import type { Elements } from "./app-elements";
import type { ProcessingState, SettingsMode } from "./app-state";

type SettingsTabsOptions = {
	els: Elements;
	processingState: ProcessingState;
	clearCandidateSelections: () => void;
	triggerAutoProcess: () => void;
};

export type SettingsTabs = {
	setSettingsMode: (mode: SettingsMode, process?: boolean) => void;
};

const SETTINGS_MODES: SettingsMode[] = ["preset", "quick", "advanced"];

export const setupSettingsTabs = ({
	els,
	processingState,
	clearCandidateSelections,
	triggerAutoProcess,
}: SettingsTabsOptions): SettingsTabs => {
	const panels: Record<SettingsMode, HTMLElement> = {
		preset: els.presetSettingsPanel,
		quick: els.quickSettingsPanel,
		advanced: els.advancedSettingsPanel,
	};

	const setSettingsMode = (mode: SettingsMode, process = true): void => {
		processingState.settingsMode = mode;
		for (const tab of els.settingsTabs) {
			const selected = tab.dataset.settingsMode === mode;
			tab.classList.toggle("is-active", selected);
			tab.setAttribute("aria-selected", String(selected));
			tab.tabIndex = selected ? 0 : -1;
		}
		for (const candidate of SETTINGS_MODES) {
			panels[candidate].hidden = candidate !== mode;
		}
		if (!process) return;
		clearCandidateSelections();
		triggerAutoProcess();
	};

	for (const tab of els.settingsTabs) {
		tab.addEventListener("click", () => {
			const mode = tab.dataset.settingsMode as SettingsMode | undefined;
			if (mode) setSettingsMode(mode);
		});
		tab.addEventListener("keydown", (event) => {
			const current = SETTINGS_MODES.indexOf(processingState.settingsMode);
			let next = current;
			if (event.key === "ArrowRight")
				next = (current + 1) % SETTINGS_MODES.length;
			else if (event.key === "ArrowLeft") {
				next = (current - 1 + SETTINGS_MODES.length) % SETTINGS_MODES.length;
			} else if (event.key === "Home") next = 0;
			else if (event.key === "End") next = SETTINGS_MODES.length - 1;
			else return;
			event.preventDefault();
			setSettingsMode(SETTINGS_MODES[next]);
			els.settingsTabs[next]?.focus();
		});
	}

	setSettingsMode("preset", false);
	return { setSettingsMode };
};
