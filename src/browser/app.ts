import { wrap } from "comlink";
import { upscaleNearest } from "../core/ops";
import type { ProcessOptions } from "../core/processor";
import type { ProcessorWorker } from "../core/worker";
import {
	clampInt,
	clampNumber,
	PROCESS_DEFAULTS,
	PROCESS_RANGES,
} from "../shared/config";
import type { RawImage } from "../shared/types";
import { drawRawImageToCanvas, imageToRawImage } from "./io";

// Workerのインスタンス化
const workerInstance = new Worker(
	new URL("../core/worker.ts", import.meta.url),
	{ type: "module" },
);
const processor = wrap<ProcessorWorker>(workerInstance);

type Elements = {
	dropArea: HTMLElement;
	fileInput: HTMLInputElement;
	processButton: HTMLButtonElement;
	downloadButton: HTMLButtonElement;
	downloadDropdownButton: HTMLButtonElement;
	downloadMenu: HTMLElement;
	originalCanvas: HTMLCanvasElement;
	resultCanvas: HTMLCanvasElement;
	inputSize: HTMLElement;
	outputSize: HTMLElement;
	quantStepInput: HTMLInputElement;
	quantStepSlider: HTMLInputElement;
	forcePixelsWInput: HTMLInputElement;
	forcePixelsHInput: HTMLInputElement;
	sampleWindowInput: HTMLInputElement;
	sampleWindowSlider: HTMLInputElement;
	toleranceInput: HTMLInputElement;
	toleranceSlider: HTMLInputElement;
	preRemoveCheck: HTMLInputElement;
	postRemoveCheck: HTMLInputElement;
	removeInnerBackgroundCheck: HTMLInputElement;
	trimToContentCheck: HTMLInputElement;
	fastAutoGridFromTrimmedCheck: HTMLInputElement;
	enableGridDetectionCheck: HTMLInputElement;
	reduceColorModeSelect: HTMLSelectElement;
	colorCountInput: HTMLInputElement;
	colorCountSlider: HTMLInputElement;
	colorCountSetting: HTMLElement;
	ignoreFloatingCheck: HTMLInputElement;
	floatingMaxPercentInput: HTMLInputElement;
	floatingMaxPercentSlider: HTMLInputElement;
	zoomOutputCheck: HTMLInputElement;
	gridOutputCheck: HTMLInputElement;
	gridCanvas: HTMLCanvasElement;
	bgSelector: HTMLElement;
	outputPanel: HTMLElement;
	settingsPanel: HTMLElement;
	loadingOverlay: HTMLElement;
	bgExtractionMethod: HTMLSelectElement;
	rgbPickerContainer: HTMLElement;
	bgRgbInput: HTMLInputElement;
	bgColorInput: HTMLInputElement;
	eyedropperButton: HTMLButtonElement;
	eyedropperModal: HTMLElement;
	closeEyedropperModal: HTMLButtonElement;
	eyedropperCanvas: HTMLCanvasElement;
};

const getElements = (): Elements => {
	const get = <T extends HTMLElement>(id: string) => {
		const el = document.getElementById(id);
		if (!el) {
			throw new Error(`要素 #${id} が見つかりません。`);
		}
		return el as T;
	};
	return {
		dropArea: get<HTMLElement>("drop-area"),
		fileInput: get<HTMLInputElement>("file-input"),
		processButton: get<HTMLButtonElement>("process-button"),
		downloadButton: get<HTMLButtonElement>("download-button"),
		downloadDropdownButton: get<HTMLButtonElement>("download-dropdown-button"),
		downloadMenu: get<HTMLElement>("download-menu"),
		originalCanvas: get<HTMLCanvasElement>("original-canvas"),
		resultCanvas: get<HTMLCanvasElement>("result-canvas"),
		inputSize: get<HTMLElement>("input-size"),
		outputSize: get<HTMLElement>("output-size"),
		quantStepInput: get<HTMLInputElement>("quant-step"),
		quantStepSlider: get<HTMLInputElement>("quant-step-slider"),
		forcePixelsWInput: get<HTMLInputElement>("force-pixels-w"),
		forcePixelsHInput: get<HTMLInputElement>("force-pixels-h"),
		sampleWindowInput: get<HTMLInputElement>("sample-window"),
		sampleWindowSlider: get<HTMLInputElement>("sample-window-slider"),
		toleranceInput: get<HTMLInputElement>("tolerance"),
		toleranceSlider: get<HTMLInputElement>("tolerance-slider"),
		preRemoveCheck: get<HTMLInputElement>("pre-remove"),
		postRemoveCheck: get<HTMLInputElement>("post-remove"),
		removeInnerBackgroundCheck: get<HTMLInputElement>(
			"remove-inner-background",
		),
		trimToContentCheck: get<HTMLInputElement>("trim-to-content"),
		fastAutoGridFromTrimmedCheck: get<HTMLInputElement>(
			"fast-auto-grid-from-trimmed",
		),
		enableGridDetectionCheck: get<HTMLInputElement>("enable-grid-detection"),
		reduceColorModeSelect: get<HTMLSelectElement>("reduce-color-mode"),
		colorCountInput: get<HTMLInputElement>("color-count"),
		colorCountSlider: get<HTMLInputElement>("color-count-slider"),
		colorCountSetting: get<HTMLElement>("color-count-setting"),
		ignoreFloatingCheck: get<HTMLInputElement>("ignore-floating"),
		floatingMaxPercentInput: get<HTMLInputElement>("floating-max-percent"),
		floatingMaxPercentSlider: get<HTMLInputElement>(
			"floating-max-percent-slider",
		),
		zoomOutputCheck: get<HTMLInputElement>("zoom-output"),
		gridOutputCheck: get<HTMLInputElement>("grid-output"),
		gridCanvas: get<HTMLCanvasElement>("grid-canvas"),
		bgSelector: get<HTMLElement>("bg-selector"),
		outputPanel: get<HTMLElement>("output-panel"),
		settingsPanel: get<HTMLElement>("settings-panel"),
		loadingOverlay: get<HTMLElement>("loading-overlay"),
		bgExtractionMethod: get<HTMLSelectElement>("bg-extraction-method"),
		rgbPickerContainer: get<HTMLElement>("rgb-picker-container"),
		bgRgbInput: get<HTMLInputElement>("bg-rgb-input"),
		bgColorInput: get<HTMLInputElement>("bg-color-input"),
		eyedropperButton: get<HTMLButtonElement>("eyedropper-button"),
		eyedropperModal: get<HTMLElement>("eyedropper-modal"),
		closeEyedropperModal: get<HTMLButtonElement>("close-eyedropper-modal"),
		eyedropperCanvas: get<HTMLCanvasElement>("eyedropper-canvas"),
	};
};

/**
 * エラーをオーバーレイで表示する
 */
const showError = (message: string) => {
	const toast = document.createElement("div");
	toast.className = "error-toast";
	toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> <span>${message}</span>`;
	document.body.appendChild(toast);

	// 次のフレームで表示開始
	requestAnimationFrame(() => {
		toast.classList.add("show");
	});

	// 5秒後に消去
	setTimeout(() => {
		toast.classList.remove("show");
		toast.addEventListener(
			"transitionend",
			() => {
				toast.remove();
			},
			{ once: true },
		);
	}, 5000);
};

const STORAGE_KEY = "pixel-refiner-display-settings";

type SavedSettings = {
	zoomOutput?: boolean;
	gridOutput?: boolean;
	bgType?: string;
};

export const initApp = (): void => {
	const els = getElements();
	let currentImage: RawImage | null = null;
	let currentResult: RawImage | null = null;
	let lastBgChecks: {
		preRemove: boolean;
		postRemove: boolean;
		removeInner: boolean;
		ignoreFloating: boolean;
	} | null = null;

	const saveSettings = () => {
		const activeBgBtn = els.bgSelector.querySelector(
			".bg-btn.active",
		) as HTMLElement;
		const settings: SavedSettings = {
			zoomOutput: els.zoomOutputCheck.checked,
			gridOutput: els.gridOutputCheck.checked,
			bgType: activeBgBtn?.dataset.bg || "checkered",
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	};

	const loadSettings = () => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return;
		try {
			const settings = JSON.parse(saved) as SavedSettings;
			if (settings.zoomOutput !== undefined)
				els.zoomOutputCheck.checked = settings.zoomOutput;
			if (settings.gridOutput !== undefined)
				els.gridOutputCheck.checked = settings.gridOutput;

			if (settings.bgType !== undefined) {
				const btn = els.bgSelector.querySelector(
					`.bg-btn[data-bg="${settings.bgType}"]`,
				) as HTMLElement;
				if (btn) {
					// 既存の背景クラスをクリアして新しいクラスを追加し、ボタンをアクティブにする
					const resultContainer = els.resultCanvas.parentElement;
					if (resultContainer) {
						["bg-checkered", "bg-white", "bg-black", "bg-green"].forEach(
							(cls) => {
								resultContainer.classList.remove(cls);
							},
						);
						resultContainer.classList.add(`bg-${settings.bgType}`);

						els.bgSelector.querySelectorAll(".bg-btn").forEach((b) => {
							b.classList.toggle("active", b === btn);
						});
					}
				}
			}
		} catch (e) {
			console.error("設定の復元に失敗しました:", e);
		}
	};

	// スポイト機能の状態
	const openEyedropperModal = () => {
		if (!currentImage) return;
		els.eyedropperModal.style.display = "flex";
		drawRawImageToCanvas(currentImage, els.eyedropperCanvas);
	};

	const closeEyedropperModal = () => {
		els.eyedropperModal.style.display = "none";
	};

	// RGB入力の同期
	const updateRgbInputs = (hex: string) => {
		els.bgRgbInput.value = hex;
		els.bgColorInput.value = hex;
	};

	els.closeEyedropperModal.addEventListener("click", closeEyedropperModal);

	els.bgRgbInput.addEventListener("input", () => {
		let val = els.bgRgbInput.value.trim();
		if (/^#?[0-9a-fA-F]{6}$/.test(val)) {
			if (!val.startsWith("#")) val = `#${val}`;
			els.bgColorInput.value = val;
			// 手動入力されたらRGB指定モードに切り替え
			if (els.bgExtractionMethod.value !== "rgb") {
				els.bgExtractionMethod.value = "rgb";
				updateBgDisabledStates();
			}
		}
	});

	els.bgColorInput.addEventListener("input", () => {
		els.bgRgbInput.value = els.bgColorInput.value;
		// 手動入力されたらRGB指定モードに切り替え
		if (els.bgExtractionMethod.value !== "rgb") {
			els.bgExtractionMethod.value = "rgb";
			updateBgDisabledStates();
		}
	});

	els.eyedropperButton.addEventListener("click", (e) => {
		e.stopPropagation();
		if (!currentImage) {
			showError("先に画像を選択してください。");
			return;
		}
		openEyedropperModal();
	});

	els.eyedropperModal.addEventListener("click", (e) => {
		if (e.target === els.eyedropperModal) {
			closeEyedropperModal();
		}
	});

	els.eyedropperCanvas.addEventListener("click", (e) => {
		if (!currentImage) return;

		const rect = els.eyedropperCanvas.getBoundingClientRect();
		// モーダル内のキャンバスは等倍表示なので、クリック座標をそのまま画像座標として扱う
		// ただし、CSSでのスケーリングがある場合は考慮が必要
		const x = Math.floor(
			((e.clientX - rect.left) / rect.width) * currentImage.width,
		);
		const y = Math.floor(
			((e.clientY - rect.top) / rect.height) * currentImage.height,
		);

		if (x >= 0 && x < currentImage.width && y >= 0 && y < currentImage.height) {
			const idx = (y * currentImage.width + x) * 4;
			const r = currentImage.data[idx];
			const g = currentImage.data[idx + 1];
			const b = currentImage.data[idx + 2];
			const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
			updateRgbInputs(hex);
			// スポイトで選択されたらRGB指定モードに切り替え
			els.bgExtractionMethod.value = "rgb";
			updateBgDisabledStates();
			closeEyedropperModal();
		}
	});

	// 設定ファイルのデフォルト/範囲を UI に反映
	const applyConfigToUi = () => {
		const setNumberInput = (
			input: HTMLInputElement,
			slider: HTMLInputElement | null,
			range: { min: number; max: number; default: number },
		) => {
			input.min = String(range.min);
			input.max = String(range.max);
			input.value = String(range.default);
			if (slider) {
				slider.min = String(range.min);
				slider.max = String(range.max);
				slider.value = String(range.default);
			}
		};

		setNumberInput(
			els.quantStepInput,
			els.quantStepSlider,
			PROCESS_RANGES.detectionQuantStep,
		);
		setNumberInput(
			els.sampleWindowInput,
			els.sampleWindowSlider,
			PROCESS_RANGES.sampleWindow,
		);
		setNumberInput(
			els.toleranceInput,
			els.toleranceSlider,
			PROCESS_RANGES.backgroundTolerance,
		);
		setNumberInput(
			els.floatingMaxPercentInput,
			els.floatingMaxPercentSlider,
			PROCESS_RANGES.floatingMaxPercent,
		);
		setNumberInput(
			els.colorCountInput,
			els.colorCountSlider,
			PROCESS_RANGES.colorCount,
		);

		els.forcePixelsWInput.min = String(PROCESS_RANGES.forcePixelsW.min);
		els.forcePixelsWInput.max = String(PROCESS_RANGES.forcePixelsW.max);
		els.forcePixelsHInput.min = String(PROCESS_RANGES.forcePixelsH.min);
		els.forcePixelsHInput.max = String(PROCESS_RANGES.forcePixelsH.max);

		els.preRemoveCheck.checked = PROCESS_DEFAULTS.preRemoveBackground;
		els.postRemoveCheck.checked = PROCESS_DEFAULTS.postRemoveBackground;
		els.removeInnerBackgroundCheck.checked =
			PROCESS_DEFAULTS.removeInnerBackground;
		els.trimToContentCheck.checked = PROCESS_DEFAULTS.trimToContent;
		els.fastAutoGridFromTrimmedCheck.checked =
			PROCESS_DEFAULTS.fastAutoGridFromTrimmed;
		els.enableGridDetectionCheck.checked = PROCESS_DEFAULTS.enableGridDetection;
		els.reduceColorModeSelect.value = PROCESS_DEFAULTS.reduceColorMode;
		els.ignoreFloatingCheck.checked = PROCESS_DEFAULTS.ignoreFloatingContent;

		const applyTooltipRange = (
			id: string,
			range: { min: number; max: number; default: number },
		) => {
			const el = document.getElementById(id);
			if (!el) return;
			const cur = el.getAttribute("data-tooltip");
			if (!cur) return;
			el.setAttribute(
				"data-tooltip",
				cur
					.replace(/\{min\}/g, String(range.min))
					.replace(/\{max\}/g, String(range.max))
					.replace(/\{default\}/g, String(range.default)),
			);
		};
		applyTooltipRange("help-quant-step", PROCESS_RANGES.detectionQuantStep);
		applyTooltipRange("help-sample-window", PROCESS_RANGES.sampleWindow);
		applyTooltipRange("help-tolerance", PROCESS_RANGES.backgroundTolerance);
		applyTooltipRange(
			"help-floating-max-percent",
			PROCESS_RANGES.floatingMaxPercent,
		);
		applyTooltipRange("help-color-count", PROCESS_RANGES.colorCount);
	};

	const syncSliderAndInput = (
		slider: HTMLInputElement,
		input: HTMLInputElement,
	) => {
		slider.addEventListener("input", () => {
			input.value = slider.value;
		});
		input.addEventListener("input", () => {
			slider.value = input.value;
		});
	};

	applyConfigToUi();
	syncSliderAndInput(els.quantStepSlider, els.quantStepInput);
	syncSliderAndInput(els.sampleWindowSlider, els.sampleWindowInput);
	syncSliderAndInput(els.toleranceSlider, els.toleranceInput);
	syncSliderAndInput(els.floatingMaxPercentSlider, els.floatingMaxPercentInput);
	syncSliderAndInput(els.colorCountSlider, els.colorCountInput);

	// グリッド検出無効時のUI制御
	const updateDisabledStates = () => {
		const enabled = els.enableGridDetectionCheck.checked;
		const disabled = !enabled;
		[
			els.quantStepInput,
			els.quantStepSlider,
			els.forcePixelsWInput,
			els.forcePixelsHInput,
			els.sampleWindowInput,
			els.sampleWindowSlider,
			els.fastAutoGridFromTrimmedCheck,
		].forEach((el) => {
			if (el instanceof HTMLInputElement) {
				el.disabled = disabled;
				const item = el.closest(".setting-item");
				if (item) {
					item.classList.toggle("disabled", disabled);
				}
			}
		});
	};

	els.enableGridDetectionCheck.addEventListener("change", updateDisabledStates);

	// 減色設定のUI制御
	const updateReduceColorsDisabledStates = () => {
		const mode = els.reduceColorModeSelect.value;
		const isAuto = mode === "auto";

		// 色数設定の表示・非表示
		els.colorCountSetting.style.display = isAuto ? "flex" : "none";

		[els.colorCountInput, els.colorCountSlider].forEach((el) => {
			el.disabled = !isAuto;
		});
	};

	els.reduceColorModeSelect.addEventListener(
		"change",
		updateReduceColorsDisabledStates,
	);
	updateReduceColorsDisabledStates();

	updateDisabledStates();

	// 背景抽出方法変更時のUI制御
	const updateBgDisabledStates = () => {
		const method = els.bgExtractionMethod.value;
		const isBgDisabled = method === "none";
		const isFloatingDisabled = !els.ignoreFloatingCheck.checked;

		// 「透過しない」の場合は背景透過関連の処理が走らないように状態自体もOFFにする
		// （disabled だけだと checked=true のまま worker に渡ってしまい、浮きノイズ除去が有効になる）
		if (isBgDisabled) {
			if (!lastBgChecks) {
				lastBgChecks = {
					preRemove: els.preRemoveCheck.checked,
					postRemove: els.postRemoveCheck.checked,
					removeInner: els.removeInnerBackgroundCheck.checked,
					ignoreFloating: els.ignoreFloatingCheck.checked,
				};
			}
			els.preRemoveCheck.checked = false;
			els.postRemoveCheck.checked = false;
			els.removeInnerBackgroundCheck.checked = false;
			els.ignoreFloatingCheck.checked = false;
		} else if (lastBgChecks) {
			// 「透過しない」から戻したときに、直前の状態を復元する
			els.preRemoveCheck.checked = lastBgChecks.preRemove;
			els.postRemoveCheck.checked = lastBgChecks.postRemove;
			els.removeInnerBackgroundCheck.checked = lastBgChecks.removeInner;
			els.ignoreFloatingCheck.checked = lastBgChecks.ignoreFloating;
			lastBgChecks = null;
		}

		// 背景透過に関連する項目の制御
		[
			els.toleranceInput,
			els.toleranceSlider,
			els.preRemoveCheck,
			els.postRemoveCheck,
			els.removeInnerBackgroundCheck,
			els.ignoreFloatingCheck,
		].forEach((el) => {
			if (el instanceof HTMLInputElement) {
				el.disabled = isBgDisabled;
				const item = el.closest(".setting-item");
				if (item) {
					item.classList.toggle("disabled", isBgDisabled);
				}
			}
		});

		// 浮きノイズ上限の制御（背景透過が無効、または浮きノイズ無視がOFFの時に無効化）
		const disableFloatingMax = isBgDisabled || isFloatingDisabled;
		[els.floatingMaxPercentInput, els.floatingMaxPercentSlider].forEach(
			(el) => {
				if (el instanceof HTMLInputElement) {
					el.disabled = disableFloatingMax;
					const item = el.closest(".setting-item");
					if (item) {
						item.classList.toggle("disabled", disableFloatingMax);
					}
				}
			},
		);

		// RGB指定時のコンテナ表示制御（常に表示するように変更）
		// els.rgbPickerContainer.style.display = method === "rgb" ? "flex" : "none";

		// RGB入力とスポイトボタンの有効/無効制御
		const rgbContainer = els.rgbPickerContainer;

		if (isBgDisabled) {
			rgbContainer.classList.add("disabled");
		} else {
			rgbContainer.classList.remove("disabled");
		}

		[els.bgRgbInput, els.bgColorInput, els.eyedropperButton].forEach((el) => {
			if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
				el.disabled = isBgDisabled;
			}
		});
	};

	const updateBgColorFromMethod = () => {
		const method = els.bgExtractionMethod.value;
		if (method !== "none" && method !== "rgb" && currentImage) {
			const w = currentImage.width;
			const h = currentImage.height;
			let x = 0;
			let y = 0;
			if (method === "bottom-left") y = h - 1;
			else if (method === "top-right") x = w - 1;
			else if (method === "bottom-right") {
				x = w - 1;
				y = h - 1;
			}
			const idx = (y * w + x) * 4;
			const r = currentImage.data[idx];
			const g = currentImage.data[idx + 1];
			const b = currentImage.data[idx + 2];
			const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
			updateRgbInputs(hex);
		}
	};

	els.bgExtractionMethod.addEventListener("change", () => {
		updateBgDisabledStates();
		updateBgColorFromMethod();
	});
	els.ignoreFloatingCheck.addEventListener("change", updateBgDisabledStates);
	updateBgDisabledStates();

	loadSettings();

	// 設定変更時に保存するための共通リスナー（表示条件のみ）
	[els.zoomOutputCheck, els.gridOutputCheck].forEach((el) => {
		el.addEventListener("change", () => saveSettings());
	});

	const clearGrid = () => {
		const container = els.resultCanvas.parentElement;
		container?.classList.remove("grid-enabled");
		const ctx = els.gridCanvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, els.gridCanvas.width, els.gridCanvas.height);
	};

	const drawGridOverlay = (img: RawImage) => {
		// result-canvas の表示サイズ（CSS px）に合わせて grid-canvas をリサイズし、
		// 1px 線でグリッドを描画する（拡大スケールで線幅が太らないようにする）
		const rect = els.resultCanvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;

		const dpr = window.devicePixelRatio || 1;
		const cssW = rect.width;
		const cssH = rect.height;

		els.gridCanvas.width = Math.max(1, Math.round(cssW * dpr));
		els.gridCanvas.height = Math.max(1, Math.round(cssH * dpr));
		els.gridCanvas.style.width = `${cssW}px`;
		els.gridCanvas.style.height = `${cssH}px`;

		const ctx = els.gridCanvas.getContext("2d");
		if (!ctx) return;

		// CSS ピクセル座標で描けるようにする
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, cssW, cssH);

		// object-fit: contain を前提に、実際の描画領域（レターボックス除外）を計算
		const objectFit = getComputedStyle(els.resultCanvas).objectFit;
		const imgAspect = img.width / img.height;
		const boxAspect = cssW / cssH;

		let drawW = cssW;
		let drawH = cssH;
		let offsetX = 0;
		let offsetY = 0;

		if (objectFit === "contain" || objectFit === "scale-down") {
			if (boxAspect > imgAspect) {
				// 横が余る
				drawH = cssH;
				drawW = drawH * imgAspect;
				offsetX = (cssW - drawW) / 2;
				offsetY = 0;
			} else {
				// 縦が余る
				drawW = cssW;
				drawH = drawW / imgAspect;
				offsetX = 0;
				offsetY = (cssH - drawH) / 2;
			}
		}

		// グリッド線（薄めに）
		ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
		ctx.lineWidth = 1;

		const stepX = drawW / img.width;
		const stepY = drawH / img.height;

		ctx.beginPath();
		for (let x = 1; x < img.width; x++) {
			const px = offsetX + x * stepX;
			ctx.moveTo(px, offsetY);
			ctx.lineTo(px, offsetY + drawH);
		}
		for (let y = 1; y < img.height; y++) {
			const py = offsetY + y * stepY;
			ctx.moveTo(offsetX, py);
			ctx.lineTo(offsetX + drawW, py);
		}
		ctx.stroke();
	};

	// グリッド更新処理
	const updateGrid = () => {
		if (
			!currentResult ||
			!els.gridOutputCheck.checked ||
			!els.zoomOutputCheck.checked
		) {
			clearGrid();
			return;
		}

		drawGridOverlay(currentResult);
		const container = els.resultCanvas.parentElement;
		container?.classList.add("grid-enabled");
	};

	const runProcessing = async () => {
		const img = currentImage;
		if (!img) {
			showError("先に画像を選択してください。");
			return;
		}

		els.loadingOverlay.style.display = "flex";
		els.outputPanel.classList.add("is-processing");

		try {
			const parseOptionalInt = (
				input: HTMLInputElement,
				range: { min: number; max: number; default: number },
			): number | undefined => {
				const s = input.value.trim();
				if (s === "") return undefined;
				const n = Number(s);
				if (!Number.isFinite(n)) return undefined;
				return clampInt(n, range);
			};

			const detectionQuantStep = clampInt(
				Number(els.quantStepInput.value),
				PROCESS_RANGES.detectionQuantStep,
			);
			const forcePixelsW = parseOptionalInt(
				els.forcePixelsWInput,
				PROCESS_RANGES.forcePixelsW,
			);
			const forcePixelsH = parseOptionalInt(
				els.forcePixelsHInput,
				PROCESS_RANGES.forcePixelsH,
			);
			const sampleWindow = clampInt(
				Number(els.sampleWindowInput.value),
				PROCESS_RANGES.sampleWindow,
			);
			const tolerance = clampInt(
				Number(els.toleranceInput.value),
				PROCESS_RANGES.backgroundTolerance,
			);
			const floatingMaxPercent = clampNumber(
				Number(els.floatingMaxPercentInput.value),
				PROCESS_RANGES.floatingMaxPercent,
			);
			const totalPixels = img.width * img.height;
			const method = els.bgExtractionMethod
				.value as ProcessOptions["bgExtractionMethod"];
			const bgEnabled = method !== "none";
			const ignoreFloatingEnabled =
				bgEnabled && els.ignoreFloatingCheck.checked;

			const floatingMaxPixels = ignoreFloatingEnabled
				? floatingMaxPercent <= 0
					? 0
					: Math.min(
							totalPixels,
							Math.max(1, Math.ceil((floatingMaxPercent / 100) * totalPixels)),
						)
				: 0;

			const colorCount = clampInt(
				Number(els.colorCountInput.value),
				PROCESS_RANGES.colorCount,
			);

			const reduceColorMode = els.reduceColorModeSelect.value;
			const reduceColors = reduceColorMode !== "none";

			const { result } = await processor.process(img, {
				detectionQuantStep,
				forcePixelsW,
				forcePixelsH,
				preRemoveBackground: bgEnabled && els.preRemoveCheck.checked,
				postRemoveBackground: bgEnabled && els.postRemoveCheck.checked,
				removeInnerBackground:
					bgEnabled && els.removeInnerBackgroundCheck.checked,
				backgroundTolerance: tolerance,
				sampleWindow,
				trimToContent: els.trimToContentCheck.checked,
				fastAutoGridFromTrimmed: els.fastAutoGridFromTrimmedCheck.checked,
				enableGridDetection: els.enableGridDetectionCheck.checked,
				reduceColors,
				reduceColorMode,
				colorCount,
				ignoreFloatingContent: ignoreFloatingEnabled,
				floatingMaxPixels,
				bgExtractionMethod: method,
				bgRgb: els.bgRgbInput.value,
			});

			// 転送されたデータは元のスレッドで使えなくなる（Comlinkの挙動に依存するが、
			// 基本的にRawImageは再利用しない設計なので、ここで再代入しておく）
			// ただし、Comlinkはデフォルトでコピー（構造化複製）を行うため、
			// 明示的に transfer を使わない限り currentImage は維持される。
			// 今回はシンプルさを優先してコピーのままにする。

			currentResult = result;
			els.downloadButton.disabled = false;
			els.downloadDropdownButton.disabled = false;

			// ダウンロードメニューのサイズ表示を更新
			els.downloadMenu.querySelectorAll("button").forEach((btn) => {
				const scale = Number(btn.dataset.scale);
				if (scale) {
					btn.textContent = `x${scale} (${result.width * scale}x${result.height * scale})`;
				}
			});

			drawRawImageToCanvas(result, els.resultCanvas);
			// 処理結果が更新されたらグリッドも再描画
			// DOMの更新（canvasの表示サイズ確定）を待つために少し遅らせる
			requestAnimationFrame(() => {
				updateGrid();
			});
			els.outputPanel.classList.add("has-image");
			els.outputSize.textContent = `${result.width}x${result.height} px`;

			// 背景抽出方法が四隅指定の場合、抽出された色をUIに反映
			updateBgColorFromMethod();
		} catch (err) {
			showError(`処理失敗: ${(err as Error).message}`);
		} finally {
			els.loadingOverlay.style.display = "none";
			els.outputPanel.classList.remove("is-processing");
		}
	};

	const loadFile = async (file: File) => {
		try {
			const raw = await imageToRawImage(file);
			currentImage = raw;
			currentResult = null; // 新しい画像が読み込まれたら結果をリセット
			els.downloadButton.disabled = true;
			els.downloadDropdownButton.disabled = true;
			els.downloadMenu.classList.remove("show");
			updateGrid(); // グリッドもクリア
			drawRawImageToCanvas(raw, els.originalCanvas);
			els.dropArea.classList.add("has-image");
			els.outputPanel.classList.remove("has-image");
			els.inputSize.textContent = `${raw.width}x${raw.height} px`;
			els.outputSize.textContent = "-";

			// 自動処理の実行
			runProcessing();
		} catch (err) {
			currentImage = null;
			showError(`読み込み失敗: ${(err as Error).message}`);
		}
	};

	// Drag & Drop visual feedback
	const highlight = () => els.dropArea.classList.add("drag-over");
	const unhighlight = () => els.dropArea.classList.remove("drag-over");

	["dragenter", "dragover"].forEach((eventName) => {
		els.dropArea.addEventListener(eventName, (e) => {
			e.preventDefault();
			e.stopPropagation();
			highlight();
		});
	});

	["dragleave", "drop"].forEach((eventName) => {
		els.dropArea.addEventListener(eventName, (e) => {
			e.preventDefault();
			e.stopPropagation();
			unhighlight();
		});
	});

	// Click on input panel triggers file input
	els.dropArea.addEventListener("click", () => {
		els.fileInput.click();
	});

	els.fileInput.addEventListener("click", (e) => {
		e.stopPropagation();
	});

	els.fileInput.addEventListener("change", async (ev) => {
		const files = (ev.target as HTMLInputElement).files;
		if (!files || files.length === 0) {
			return;
		}
		loadFile(files[0]);
	});

	els.dropArea.addEventListener("drop", (e) => {
		const dt = (e as DragEvent).dataTransfer;
		const files = dt?.files;
		if (files && files.length > 0) {
			loadFile(files[0]);
			// Update file input to match (optional but good for consistency)
			if (files.length > 0) {
				const container = new DataTransfer();
				container.items.add(files[0]);
				els.fileInput.files = container.files;
			}
		}
	});

	els.processButton.addEventListener("click", () => {
		runProcessing();
	});

	els.downloadButton.addEventListener("click", () => {
		if (!currentResult) return;

		const link = document.createElement("a");
		link.download = "refined.png";
		link.href = els.resultCanvas.toDataURL("image/png");
		link.click();
	});

	// ダウンロードドロップダウンのトグル
	els.downloadDropdownButton.addEventListener("click", (e) => {
		e.stopPropagation();
		els.downloadMenu.classList.toggle("show");
	});

	// メニュー外クリックで閉じる
	document.addEventListener("click", () => {
		els.downloadMenu.classList.remove("show");
	});

	// 拡大ダウンロードの実行
	els.downloadMenu.addEventListener("click", (e) => {
		const btn = (e.target as HTMLElement).closest("button");
		if (!btn || !currentResult) return;

		const scale = Number(btn.dataset.scale);
		if (!scale) return;

		const upscaled = upscaleNearest(currentResult, scale);
		const tempCanvas = document.createElement("canvas");
		drawRawImageToCanvas(upscaled, tempCanvas);

		const link = document.createElement("a");
		link.download = `refined_x${scale}.png`;
		link.href = tempCanvas.toDataURL("image/png");
		link.click();
	});

	els.zoomOutputCheck.addEventListener("change", () => {
		const container = els.resultCanvas.parentElement;
		if (container) {
			if (els.zoomOutputCheck.checked) {
				container.classList.add("zoom-enabled");
			} else {
				container.classList.remove("zoom-enabled");
				// 拡大OFFならグリッドもOFF
				if (els.gridOutputCheck.checked) {
					els.gridOutputCheck.checked = false;
					clearGrid();
				}
			}
		}
		updateGrid();
	});

	els.gridOutputCheck.addEventListener("change", () => {
		if (els.gridOutputCheck.checked) {
			// グリッドONなら拡大もON
			if (!els.zoomOutputCheck.checked) {
				els.zoomOutputCheck.checked = true;
				els.zoomOutputCheck.dispatchEvent(new Event("change"));
			}
		}
		updateGrid();
	});

	// Initialize zoom/grid state
	if (els.zoomOutputCheck.checked) {
		const container = els.resultCanvas.parentElement;
		if (container) {
			container.classList.add("zoom-enabled");
		}
	}
	// Initial grid update might be too early if canvas is not yet rendered or currentResult is null
	updateGrid();

	// Resize/レイアウト変化でズレないように追従
	window.addEventListener("resize", () => updateGrid());

	// アプリの準備が整ったら表示
	document.body.classList.add("loaded");

	// Background selector logic
	const resultContainer = els.resultCanvas.parentElement;
	if (resultContainer) {
		// Set initial background
		resultContainer.classList.add("bg-checkered");

		els.bgSelector.addEventListener("click", (e) => {
			const btn = (e.target as HTMLElement).closest(".bg-btn");
			if (!btn) return;

			const bgType = (btn as HTMLElement).dataset.bg;
			if (!bgType) return;

			// Update buttons
			els.bgSelector.querySelectorAll(".bg-btn").forEach((b) => {
				b.classList.toggle("active", b === btn);
			});

			// Update container
			["bg-checkered", "bg-white", "bg-black", "bg-green"].forEach((cls) => {
				resultContainer.classList.remove(cls);
			});
			resultContainer.classList.add(`bg-${bgType}`);

			saveSettings();
		});
	}
};
