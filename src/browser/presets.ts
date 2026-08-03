export type PresetValue = string | number | boolean;

export interface Preset {
	version: 2;
	id: string;
	name: string;
	timestamp: number;
	data: Record<string, PresetValue>;
}

const STORAGE_KEY = "pixel-refiner-presets";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const migratePreset = (value: unknown): Preset | null => {
	if (!isRecord(value) || !isRecord(value.data)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.name !== "string" ||
		typeof value.timestamp !== "number"
	) {
		return null;
	}
	const data: Record<string, PresetValue> = {};
	for (const [key, entry] of Object.entries(value.data)) {
		if (
			typeof entry === "string" ||
			typeof entry === "number" ||
			typeof entry === "boolean"
		) {
			data[key] = entry;
		}
	}
	if (value.version !== 2) {
		// [Policy] 旧プリセットの低水準値を推測で高水準設定へ変換すると出力が変わり得る。
		// 既存値をそのまま使う Custom として移行し、処理互換性を優先する。
		data["quick-processing-mode"] ??= "auto";
		data["quick-detail-level"] ??= "balanced";
		data["quick-colors"] ??= "custom";
		data["quick-background"] ??= "custom";
		data["quick-dithering"] ??= "custom";
	}
	return {
		version: 2,
		id: value.id,
		name: value.name,
		timestamp: value.timestamp,
		data,
	};
};

export const PresetManager = {
	savePreset(name: string, data: Record<string, PresetValue>): Preset {
		const presets = this.loadPresets();
		const newPreset: Preset = {
			version: 2,
			id: crypto.randomUUID(),
			name: name || new Date().toLocaleString(),
			timestamp: Date.now(),
			data,
		};
		presets.push(newPreset);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
		return newPreset;
	},

	updatePreset(id: string, data: Record<string, PresetValue>): void {
		const presets = this.loadPresets();
		const idx = presets.findIndex((p) => p.id === id);
		if (idx !== -1) {
			presets[idx].version = 2;
			presets[idx].data = data;
			presets[idx].timestamp = Date.now();
			localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
		}
	},

	loadPresets(): Preset[] {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return [];
		try {
			const parsed: unknown = JSON.parse(saved);
			if (!Array.isArray(parsed)) return [];
			const presets = parsed
				.map((entry) => migratePreset(entry))
				.filter((entry): entry is Preset => entry !== null);
			if (JSON.stringify(parsed) !== JSON.stringify(presets)) {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
			}
			return presets;
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
