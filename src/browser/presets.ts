export interface Preset {
	id: string;
	name: string;
	timestamp: number;
	data: Record<string, string | number | boolean>;
}

const STORAGE_KEY = "pixel-refiner-presets";

export const PresetManager = {
	savePreset(
		name: string,
		data: Record<string, string | number | boolean>,
	): Preset {
		const presets = this.loadPresets();
		const newPreset: Preset = {
			id: crypto.randomUUID(),
			name: name || new Date().toLocaleString(),
			timestamp: Date.now(),
			data,
		};
		presets.push(newPreset);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
		return newPreset;
	},

	updatePreset(
		id: string,
		data: Record<string, string | number | boolean>,
	): void {
		const presets = this.loadPresets();
		const idx = presets.findIndex((p) => p.id === id);
		if (idx !== -1) {
			presets[idx].data = data;
			presets[idx].timestamp = Date.now();
			localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
		}
	},

	loadPresets(): Preset[] {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return [];
		try {
			return JSON.parse(saved) as Preset[];
		} catch (e) {
			console.error("Failed to parse presets:", e);
			return [];
		}
	},

	deletePreset(id: string): void {
		const presets = this.loadPresets();
		const filtered = presets.filter((p) => p.id !== id);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
	},
};
