const STORAGE_KEY = "pixel-refiner-display-settings";

export type SavedDisplaySettings = {
	zoomOutput?: boolean;
	gridOutput?: boolean;
	bgType?: string;
	autoProcess?: boolean;
};

export const readDisplaySettings = (): SavedDisplaySettings | null => {
	const saved = localStorage.getItem(STORAGE_KEY);
	return saved ? (JSON.parse(saved) as SavedDisplaySettings) : null;
};

export const writeDisplaySettings = (settings: SavedDisplaySettings): void => {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
