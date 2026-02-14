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
import type { DitherMode, OutlineStyle, RawImage, RGB } from "../shared/types";
import {
	extractColorsFromImage,
	generateGPL,
	generatePaletteImage,
	parseGPL,
	sortPalette,
} from "../utils/palette";
import { ImageComparer } from "./compare";
import { i18n } from "./i18n";
import { drawRawImageToCanvas, imageToRawImage } from "./io";
import { ResultViewer } from "./result-viewer";

// Workerのインスタンス化
const workerInstance = new Worker(
	new URL("../core/worker.ts", import.meta.url),
	{ type: "module" },
);
const processor = wrap<ProcessorWorker>(workerInstance);

type Elements = {
	dropArea: HTMLElement;
	inputCanvasContainer: HTMLElement;
	fileInput: HTMLInputElement;
	processButton: HTMLButtonElement;
	downloadButton: HTMLButtonElement;
	downloadDropdownButton: HTMLButtonElement;
	downloadMenu: HTMLElement;
	originalCanvas: HTMLCanvasElement;
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
	ditherModeSelect: HTMLSelectElement;
	colorCountInput: HTMLInputElement;
	colorCountSlider: HTMLInputElement;
	colorCountSetting: HTMLElement;
	ditherStrengthInput: HTMLInputElement;
	ditherStrengthSlider: HTMLInputElement;
	ditherStrengthSetting: HTMLElement;

	outlineStyleSelect: HTMLSelectElement;
	outlineColorInput: HTMLInputElement;

	floatingMaxPercentInput: HTMLInputElement;
	floatingMaxPercentSlider: HTMLInputElement;
	zoomOutputCheck: HTMLInputElement;
	gridOutputCheck: HTMLInputElement;
	outputPanel: HTMLElement;
	loadingOverlay: HTMLElement;
	enableBgRemovalCheck: HTMLInputElement;
	bgExtractionMethod: HTMLSelectElement;
	rgbPickerContainer: HTMLElement;
	bgRgbInput: HTMLInputElement;
	bgColorInput: HTMLInputElement;
	eyedropperButton: HTMLButtonElement;
	eyedropperModal: HTMLElement;
	closeEyedropperModal: HTMLButtonElement;
	eyedropperCanvas: HTMLCanvasElement;

	autoProcessToggle: HTMLInputElement;

	// Palette UI
	// Palette UI
	paletteColors: HTMLElement;
	exportGPLButton: HTMLButtonElement;
	exportPNGButton: HTMLButtonElement;
	fixedPaletteImportButton: HTMLButtonElement;
	showPaletteButton: HTMLButtonElement;
	paletteModal: HTMLElement;
	closePaletteModal: HTMLButtonElement;
	paletteFileInput: HTMLInputElement;

	// Compare View
	// Result Modal
	resultModal: HTMLElement;
	closeResultModal: HTMLButtonElement;

	// Compare Modal
	compareModal: HTMLElement;
	closeCompareModal: HTMLButtonElement;
	compareContainer: HTMLElement;
	compBeforeImg: HTMLImageElement;
	compAfterImg: HTMLImageElement;
	btnViewCompare: HTMLButtonElement;
	btnCompareBeforeOriginal: HTMLButtonElement;
	btnCompareBeforeSanitized: HTMLButtonElement;
};

const getElements = (): Elements => {
	const get = <T extends HTMLElement>(id: string) => {
		const el = document.getElementById(id);
		if (!el) {
			throw new Error(`Element #${id} not found.`);
		}
		return el as T;
	};
	return {
		dropArea: get<HTMLElement>("drop-area"),
		inputCanvasContainer: get<HTMLElement>("input-canvas-container"),
		fileInput: get<HTMLInputElement>("file-input"),
		processButton: get<HTMLButtonElement>("process-button"),
		downloadButton: get<HTMLButtonElement>("download-button"),
		downloadDropdownButton: get<HTMLButtonElement>("download-dropdown-button"),
		downloadMenu: get<HTMLElement>("download-menu"),
		originalCanvas: get<HTMLCanvasElement>("original-canvas"),
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
		ditherModeSelect: get<HTMLSelectElement>("dither-mode"),
		colorCountInput: get<HTMLInputElement>("color-count"),
		colorCountSlider: get<HTMLInputElement>("color-count-slider"),
		colorCountSetting: get<HTMLElement>("color-count-setting"),
		ditherStrengthInput: get<HTMLInputElement>("dither-strength"),
		ditherStrengthSlider: get<HTMLInputElement>("dither-strength-slider"),
		ditherStrengthSetting: get<HTMLElement>("dither-strength-setting"),

		outlineStyleSelect: get<HTMLSelectElement>("outline-style"),
		outlineColorInput: get<HTMLInputElement>("outline-color"),

		floatingMaxPercentInput: get<HTMLInputElement>("floating-max-percent"),
		floatingMaxPercentSlider: get<HTMLInputElement>(
			"floating-max-percent-slider",
		),
		zoomOutputCheck: get<HTMLInputElement>("zoom-output"),
		gridOutputCheck: get<HTMLInputElement>("grid-output"),
		outputPanel: get<HTMLElement>("output-panel"),
		loadingOverlay: get<HTMLElement>("loading-overlay"),
		enableBgRemovalCheck: get<HTMLInputElement>("enable-bg-removal"),
		bgExtractionMethod: get<HTMLSelectElement>("bg-extraction-method"),
		rgbPickerContainer: get<HTMLElement>("rgb-picker-container"),
		bgRgbInput: get<HTMLInputElement>("bg-rgb-input"),
		bgColorInput: get<HTMLInputElement>("bg-color-input"),
		eyedropperButton: get<HTMLButtonElement>("eyedropper-button"),
		eyedropperModal: get<HTMLElement>("eyedropper-modal"),
		closeEyedropperModal: get<HTMLButtonElement>("close-eyedropper-modal"),
		eyedropperCanvas: get<HTMLCanvasElement>("eyedropper-canvas"),
		autoProcessToggle: get<HTMLInputElement>("auto-process-toggle"),
		paletteColors: get<HTMLElement>("palette-colors"),
		exportGPLButton: get<HTMLButtonElement>("export-gpl-button"),
		exportPNGButton: get<HTMLButtonElement>("export-png-button"),
		fixedPaletteImportButton: get<HTMLButtonElement>(
			"fixed-palette-import-button",
		),
		showPaletteButton: get<HTMLButtonElement>("show-palette-button"),
		paletteModal: get<HTMLElement>("palette-modal"),
		closePaletteModal: get<HTMLButtonElement>("close-palette-modal"),
		paletteFileInput: get<HTMLInputElement>("palette-file-input"),

		// Result Modal
		resultModal: get<HTMLElement>("result-modal"),
		closeResultModal: get<HTMLElement>("result-modal").querySelector(
			".js-close-result-modal",
		) as HTMLButtonElement,

		compareModal: get<HTMLElement>("compare-modal"),
		closeCompareModal: get<HTMLButtonElement>("close-compare-modal"),
		compareContainer: get<HTMLElement>("compare-container"),
		compBeforeImg: get<HTMLImageElement>("comp-before"),
		compAfterImg: get<HTMLImageElement>("comp-after"),
		btnViewCompare: get<HTMLButtonElement>("btn-view-compare"),
		btnCompareBeforeOriginal: get<HTMLButtonElement>(
			"btn-compare-before-original",
		),
		btnCompareBeforeSanitized: get<HTMLButtonElement>(
			"btn-compare-before-sanitized",
		),
	};
};

/**
 * エラーをオーバーレイで表示する
 */
const showError = (message: string) => {
	const toast = document.createElement("div");
	toast.className = "error-toast";
	toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>${message}</span>`;
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
	autoProcess?: boolean;
};

export const initApp = (): void => {
	const els = getElements();
	const comparer = new ImageComparer("compare-container");
	const mainResultViewer = new ResultViewer(els.outputPanel);
	const modalResultViewer = new ResultViewer(
		els.resultModal.querySelector(".result-modal-body") as HTMLElement,
	);

	// Sync logic
	const syncViewers = (
		_source: ResultViewer,
		target: ResultViewer,
		bgType?: string,
		zoom?: boolean,
		grid?: boolean,
	) => {
		if (bgType !== undefined) target.setBackground(bgType);
		if (zoom !== undefined) target.setZoom(zoom);
		if (grid !== undefined) target.setGrid(grid);
		saveSettings();
	};

	const handleDownload = (scale: number) => {
		if (!currentResult) return;

		let link: HTMLAnchorElement;
		if (scale === 1) {
			link = document.createElement("a");
			link.download = "refined.png";
			link.href = els.originalCanvas.toDataURL("image/png"); // Fallback or current result?
			// Wait, we need the result image data URL.
			// Since currentResult is RawImage, we need to draw it to a canvas to get URL.
			// We can use a temp canvas or one of the existing ones if we are sure it has the image.
			// ResultViewer has the canvas, but we are outside.
			// Let's use a temp canvas helper or drawRawImageToCanvas.
			const tempCanvas = document.createElement("canvas");
			drawRawImageToCanvas(currentResult, tempCanvas);
			link.href = tempCanvas.toDataURL("image/png");
		} else {
			const upscaled = upscaleNearest(currentResult, scale);
			const tempCanvas = document.createElement("canvas");
			drawRawImageToCanvas(upscaled, tempCanvas);
			link = document.createElement("a");
			link.download = `refined_x${scale}.png`;
			link.href = tempCanvas.toDataURL("image/png");
		}
		link.click();
	};

	mainResultViewer.setCallbacks({
		onBgChange: (bg) => syncViewers(mainResultViewer, modalResultViewer, bg),
		onZoomToggle: (z) =>
			syncViewers(mainResultViewer, modalResultViewer, undefined, z),
		onGridToggle: (g) =>
			syncViewers(mainResultViewer, modalResultViewer, undefined, undefined, g),
		onDownload: (scale) => handleDownload(scale),
		onCompare: () => openCompareModal(),
		onImageClick: () => {
			els.resultModal.style.display = "flex";
			// モーダル表示時にグリッドなどの描画を更新（サイズが異なるため）
			requestAnimationFrame(() => {
				modalResultViewer.drawGrid();
			});
		},
	});

	modalResultViewer.setCallbacks({
		onBgChange: (bg) => syncViewers(modalResultViewer, mainResultViewer, bg),
		onZoomToggle: (z) =>
			syncViewers(modalResultViewer, mainResultViewer, undefined, z),
		onGridToggle: (g) =>
			syncViewers(modalResultViewer, mainResultViewer, undefined, undefined, g),
		onDownload: (scale) => handleDownload(scale),
		onCompare: () => {
			closeResultModal();
			openCompareModal();
		},
	});

	let currentImage: RawImage | null = null;
	let currentResult: RawImage | null = null;
	const compareBeforeCanvas = document.createElement("canvas");
	const compareAfterCanvas = document.createElement("canvas");
	const compareBeforeSanitizedCanvas = document.createElement("canvas");

	let compareBeforeOriginalUrl = "";
	let compareBeforeSanitizedUrl = "";
	let compareAfterUrl = "";
	let compareBeforeMode: "original" | "sanitized" = "original";

	let currentExtractedPalette: RGB[] = [];
	let currentFixedPalette: RGB[] | undefined;
	let lastBgChecks: {
		preRemove: boolean;
		postRemove: boolean;
		removeInner: boolean;
	} | null = null;

	let isGridManuallyToggled = false;

	const saveSettings = () => {
		const settings: SavedSettings = {
			zoomOutput: els.zoomOutputCheck.checked,
			gridOutput: els.gridOutputCheck.checked,
			bgType: "checkered", // We'll need to read this from viewer state effectively, or just default.
			autoProcess: els.autoProcessToggle.checked,
		};
		// Since we don't have direct access to BG state from here easily without asking viewer,
		// we might rely on the last set state or ask viewer if we exposed getter.
		// For now, let's skip bgType saving in this simplified block or fix it below.
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
			if (settings.autoProcess !== undefined)
				els.autoProcessToggle.checked = settings.autoProcess;

			// ボタン表示状態を更新
			updateProcessButtonVisibility();

			if (settings.bgType !== undefined) {
				mainResultViewer.setBackground(settings.bgType);
				modalResultViewer.setBackground(settings.bgType);
			}
		} catch (e) {
			console.error("Failed to restore settings:", e);
		}
	};

	// Processing Function
	const runProcessing = async () => {
		if (!currentImage) return;

		mainResultViewer.setLoading(true);

		// Disable UI
		els.processButton.disabled = true;
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
			const totalPixels = currentImage.width * currentImage.height;
			const bgEnabled = els.enableBgRemovalCheck.checked;
			const method = (
				bgEnabled ? els.bgExtractionMethod.value : "none"
			) as ProcessOptions["bgExtractionMethod"];
			const floatingMaxPixels = bgEnabled
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
			const ditherMode = els.ditherModeSelect.value as DitherMode;

			const ditherStrength = clampInt(
				Number(els.ditherStrengthInput.value),
				PROCESS_RANGES.ditherStrength,
			);

			const outlineStyle = els.outlineStyleSelect.value as OutlineStyle;
			const outlineHex = els.outlineColorInput.value;
			const outlineColor = {
				r: parseInt(outlineHex.slice(1, 3), 16),
				g: parseInt(outlineHex.slice(3, 5), 16),
				b: parseInt(outlineHex.slice(5, 7), 16),
			};

			const {
				result,
				extractedPalette,
				compareBefore,
				compareBeforeSanitized,
			} = await processor.process(currentImage, {
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
				ditherMode,
				colorCount,
				ditherStrength,
				floatingMaxPixels,
				outlineStyle,
				outlineColor,
				bgExtractionMethod: method,
				bgRgb: els.bgRgbInput.value,
				fixedPalette: currentFixedPalette,
			});

			// 転送されたデータは元のスレッドで使えなくなる（Comlinkの挙動に依存するが、
			// 基本的にRawImageは再利用しない設計なので、ここで再代入しておく）
			// ただし、Comlinkはデフォルトでコピー（構造化複製）を行うため、
			// 明示的に transfer を使わない限り currentImage は維持される。
			// 今回はシンプルさを優先してコピーのままにする。

			// 明示的に transfer を使わない限り currentImage は維持される。
			// 今回はシンプルさを優先してコピーのままにする。

			const resultImage = result;
			currentResult = resultImage;

			mainResultViewer.updateImage(resultImage);
			modalResultViewer.updateImage(resultImage);
			mainResultViewer.setLoading(false);

			// 256pxを超える場合はデフォルトでグリッドをOFFにする（手動でONにしていない場合）
			if (!isGridManuallyToggled) {
				if (resultImage.width > 256 || resultImage.height > 256) {
					if (els.gridOutputCheck.checked) {
						els.gridOutputCheck.checked = false;
						// グリッドをクリア
						mainResultViewer.setGrid(false);
						modalResultViewer.setGrid(false);
					}
				}
			}

			// Sort the palette for better visualization
			const sortedPalette = sortPalette(extractedPalette);
			currentExtractedPalette = sortedPalette;

			updatePaletteDisplay();
			els.downloadButton.style.display = "flex";
			els.downloadDropdownButton.style.display = "flex";

			// ダウンロードメニューのサイズ表示を更新
			els.downloadMenu.querySelectorAll("button").forEach((btn) => {
				const scale = Number(btn.dataset.scale);
				if (scale) {
					btn.textContent = `x${scale} (${resultImage.width * scale}x${resultImage.height * scale})`;
				}
			});

			// 比較スライダーの更新（元画像リサイズ / サニタイズ の両方を生成）
			drawRawImageToCanvas(compareBefore, compareBeforeCanvas);
			drawRawImageToCanvas(
				compareBeforeSanitized,
				compareBeforeSanitizedCanvas,
			);
			drawRawImageToCanvas(resultImage, compareAfterCanvas);
			compareBeforeOriginalUrl = compareBeforeCanvas.toDataURL("image/png");
			compareBeforeSanitizedUrl =
				compareBeforeSanitizedCanvas.toDataURL("image/png");
			compareAfterUrl = compareAfterCanvas.toDataURL("image/png");

			const before =
				compareBeforeMode === "sanitized"
					? compareBeforeSanitizedUrl
					: compareBeforeOriginalUrl;
			comparer.updateImages(before, compareAfterUrl);

			// モーダルが開いている場合は、直ちに反映（サイズ同期も）
			if (els.compareModal.style.display !== "none") {
				requestAnimationFrame(() => {
					comparer.syncImageSize();
				});
			}

			// 処理結果が更新されたらグリッドも再描画
			// DOMの更新（canvasの表示サイズ確定）を待つために少し遅らせる
			requestAnimationFrame(() => {
				updateGrid();
			});
			els.outputPanel.classList.add("has-image");
			els.outputSize.textContent = `${resultImage.width}x${resultImage.height} px`;

			// 背景抽出方法が四隅指定の場合、抽出された色をUIに反映
			updateBgColorFromMethod();
		} catch (err) {
			showError(`${i18n.t("error.process_failed")}: ${(err as Error).message}`);
		} finally {
			els.loadingOverlay.style.display = "none";
			els.outputPanel.classList.remove("is-processing");
			els.processButton.disabled = false;
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
			showError(i18n.t("error.no_image"));
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
		setNumberInput(
			els.ditherStrengthInput,
			els.ditherStrengthSlider,
			PROCESS_RANGES.ditherStrength,
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
		els.ditherModeSelect.value = PROCESS_DEFAULTS.ditherMode;

		els.enableBgRemovalCheck.checked = true;

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
		applyTooltipRange("help-dither-strength", PROCESS_RANGES.ditherStrength);

		// 言語切り替えボタンのイベントリスナー
		document.querySelectorAll("[data-lang-btn]").forEach((el) => {
			el.addEventListener("click", () => {
				const lang = el.getAttribute("data-lang-btn") as "ja" | "en";
				if (lang) i18n.setLanguage(lang);
			});
		});

		// 初回翻訳適用
		i18n.updatePage();
	};

	// Auto Process の状態に応じて Process ボタンの表示を切り替え
	const updateProcessButtonVisibility = () => {
		els.processButton.style.display = els.autoProcessToggle.checked
			? "none"
			: "flex";
	};

	let autoProcessTimeout: number | undefined;
	const triggerAutoProcess = () => {
		if (!els.autoProcessToggle.checked) return;
		// 画像未設定時は変換を実行しない
		if (!currentImage) return;

		// 既に実行予約があればキャンセル（デバウンス）
		if (autoProcessTimeout) {
			window.clearTimeout(autoProcessTimeout);
		}

		autoProcessTimeout = window.setTimeout(() => {
			runProcessing();
		}, 300);
	};

	const syncSliderAndInput = (
		slider: HTMLInputElement,
		input: HTMLInputElement,
	) => {
		slider.addEventListener("input", () => {
			input.value = slider.value;
			triggerAutoProcess();
		});
		input.addEventListener("input", () => {
			slider.value = input.value;
			triggerAutoProcess();
		});
	};

	applyConfigToUi();
	syncSliderAndInput(els.quantStepSlider, els.quantStepInput);
	syncSliderAndInput(els.sampleWindowSlider, els.sampleWindowInput);
	syncSliderAndInput(els.toleranceSlider, els.toleranceInput);
	syncSliderAndInput(els.floatingMaxPercentSlider, els.floatingMaxPercentInput);
	syncSliderAndInput(els.colorCountSlider, els.colorCountInput);
	syncSliderAndInput(els.ditherStrengthSlider, els.ditherStrengthInput);

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
			const item = el.closest(".setting-item");
			if (item) {
				item.classList.toggle("disabled", disabled);
			}
		});
	};

	els.enableGridDetectionCheck.addEventListener("change", updateDisabledStates);

	// 減色設定のUI制御
	const updatePaletteButtonVisibility = () => {
		const mode = els.reduceColorModeSelect.value;
		const isFixed = mode === "fixed";
		const hasImage = currentImage !== null;

		// In Fixed mode, Import is shown. (Only if image is set)
		els.fixedPaletteImportButton.style.display =
			isFixed && hasImage ? "flex" : "none";

		// "Show Palette" is shown if we have a palette results. (Only if image is set)
		const hasPalette = currentExtractedPalette.length > 0;
		els.showPaletteButton.style.display =
			hasPalette && hasImage ? "flex" : "none";
	};

	const updateReduceColorsDisabledStates = () => {
		const mode = els.reduceColorModeSelect.value;
		const isNone = mode === "none";
		const isAuto = mode === "auto";

		// Enable/Disable sections based on mode
		const isEnabled = !isNone;

		els.colorCountSetting.style.display = isAuto ? "flex" : "none";

		const ditherMode = els.ditherModeSelect.value;
		const isDitherNone = ditherMode === "none";
		// ディザリングが有効なら強度を表示
		els.ditherStrengthSetting.style.display = !isDitherNone ? "flex" : "none";

		// 減色モードが None のときはディザリング設定を無効化
		const ditherModeItem = els.ditherModeSelect.closest(".setting-item");
		if (ditherModeItem) {
			ditherModeItem.classList.toggle("disabled", !isEnabled);
		}

		const outlineEnabled = els.outlineStyleSelect.value !== "none";
		const outlineColorItem = els.outlineColorInput.closest(".setting-item");
		if (outlineColorItem) {
			outlineColorItem.classList.toggle("disabled", !outlineEnabled);
		}

		updatePaletteButtonVisibility();
	};

	els.reduceColorModeSelect.addEventListener("change", () => {
		updateReduceColorsDisabledStates();
		// If we switch away from Fixed, clear the fixed palette
		if (els.reduceColorModeSelect.value !== "fixed") {
			currentFixedPalette = undefined;
		}
		triggerAutoProcess();
	});

	els.ditherModeSelect.addEventListener("change", () => {
		updateReduceColorsDisabledStates();
		triggerAutoProcess();
	});

	els.outlineStyleSelect.addEventListener("change", () => {
		updateReduceColorsDisabledStates();
		triggerAutoProcess();
	});
	els.outlineColorInput.addEventListener("input", triggerAutoProcess);

	// ディザリング設定のUI制御（常に表示、ただし減色モードがNone以外のときのみ有効など検討可能）
	// 現状はシンプルに維持
	updateReduceColorsDisabledStates();

	updateDisabledStates();

	// 背景除去チェックボックスによるUI制御
	const updateBgDisabledStates = () => {
		const isBgDisabled = !els.enableBgRemovalCheck.checked;

		// チェックボックスOFF時は背景透過関連の処理が走らないように状態自体もOFFにする
		// （disabled だけだと checked=true のまま worker に渡ってしまい、浮きノイズ除去が有効になる）
		if (isBgDisabled) {
			if (!lastBgChecks) {
				lastBgChecks = {
					preRemove: els.preRemoveCheck.checked,
					postRemove: els.postRemoveCheck.checked,
					removeInner: els.removeInnerBackgroundCheck.checked,
				};
			}
			els.preRemoveCheck.checked = false;
			els.postRemoveCheck.checked = false;
			els.removeInnerBackgroundCheck.checked = false;
		} else if (lastBgChecks) {
			// 無効から戻したときに、直前の状態を復元する
			els.preRemoveCheck.checked = lastBgChecks.preRemove;
			els.postRemoveCheck.checked = lastBgChecks.postRemove;
			els.removeInnerBackgroundCheck.checked = lastBgChecks.removeInner;
			lastBgChecks = null;
		}

		// Extraction Method セレクトボックスの制御
		const methodItem = els.bgExtractionMethod.closest(".setting-item");
		if (methodItem) {
			methodItem.classList.toggle("disabled", isBgDisabled);
		}

		// 背景透過に関連する項目の制御
		[
			els.toleranceInput,
			els.toleranceSlider,
			els.preRemoveCheck,
			els.postRemoveCheck,
			els.removeInnerBackgroundCheck,
		].forEach((el) => {
			const item = el.closest(".setting-item");
			if (item) {
				item.classList.toggle("disabled", isBgDisabled);
			}
		});

		// 浮きノイズ上限の制御（背景透過が無効の時に無効化）
		[els.floatingMaxPercentInput, els.floatingMaxPercentSlider].forEach(
			(el) => {
				const item = el.closest(".setting-item");
				if (item) {
					item.classList.toggle("disabled", isBgDisabled);
				}
			},
		);

		// RGB入力とスポイトボタンの有効/無効制御
		const rgbContainer = els.rgbPickerContainer;

		if (isBgDisabled) {
			rgbContainer.classList.add("disabled");
		} else {
			rgbContainer.classList.remove("disabled");
		}
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
		updateBgColorFromMethod();
	});
	els.enableBgRemovalCheck.addEventListener("change", () => {
		updateBgDisabledStates();
		triggerAutoProcess();
	});

	updateBgDisabledStates();

	updateProcessButtonVisibility();

	// 設定変更時に保存するための共通リスナー（表示条件のみ）
	[els.zoomOutputCheck, els.gridOutputCheck, els.autoProcessToggle].forEach(
		(el) => {
			el.addEventListener("change", () => saveSettings());
		},
	);

	// Auto Process トグル変更時にプロセスボタンの表示/非表示を切り替え
	els.autoProcessToggle.addEventListener("change", () => {
		updateProcessButtonVisibility();
	});

	// 設定変更時に自動処理をトリガーするイベントリスナーを追加
	[
		els.forcePixelsWInput,
		els.forcePixelsHInput,
		els.preRemoveCheck,
		els.postRemoveCheck,
		els.removeInnerBackgroundCheck,
		els.trimToContentCheck,
		els.fastAutoGridFromTrimmedCheck,
		els.enableGridDetectionCheck,
		els.reduceColorModeSelect,
		els.ditherModeSelect,

		els.bgExtractionMethod,
		els.bgRgbInput,
		els.bgColorInput,
	].forEach((el) => {
		el.addEventListener("change", triggerAutoProcess);
		// テキスト入力などは input イベントでも拾う
		if (
			el instanceof HTMLInputElement &&
			(el.type === "text" || el.type === "number")
		) {
			el.addEventListener("input", triggerAutoProcess);
		}
	});

	// Grid Update Logic (Handled by ResultViewer now)
	const updateGrid = () => {
		mainResultViewer.drawGrid();
		modalResultViewer.drawGrid();
	};

	const updatePaletteDisplay = () => {
		els.paletteColors.innerHTML = "";
		if (currentExtractedPalette.length === 0) {
			// els.paletteSection.style.display = "none";
			updatePaletteButtonVisibility();
			return;
		}

		// els.paletteSection.style.display = "block";
		updatePaletteButtonVisibility();

		currentExtractedPalette.forEach((color) => {
			const hex =
				"#" +
				[color.r, color.g, color.b]
					.map((x) => x.toString(16).padStart(2, "0"))
					.join("");
			const swatch = document.createElement("div");
			swatch.className = "color-swatch";
			swatch.style.backgroundColor = hex;
			swatch.dataset.tooltip = hex.toUpperCase();
			swatch.addEventListener("click", () => {
				navigator.clipboard.writeText(hex.toUpperCase()).then(() => {
					const originalTooltip = swatch.getAttribute("data-tooltip") || "";
					swatch.setAttribute("data-tooltip", "Copied!");
					swatch.classList.add("copied");
					setTimeout(() => {
						swatch.classList.remove("copied");
						swatch.setAttribute("data-tooltip", originalTooltip);
					}, 1500);
				});
				updateRgbInputs(hex);
				// Also select this color if in RGB mode
				if (els.bgExtractionMethod.value === "rgb") {
					els.bgExtractionMethod.dispatchEvent(new Event("change"));
				}
				updateReduceColorsDisabledStates();
			});
			els.paletteColors.appendChild(swatch);
		});
	};

	const loadFile = async (file: File) => {
		try {
			const raw = await imageToRawImage(file);
			currentImage = raw;

			currentResult = null; // 新しい画像が読み込まれたら結果をリセット
			currentFixedPalette = undefined; // Reset fixed palette on new image load? Or keep it?
			// Let's keep it if the user imported it. But if they just drop an image, maybe we shouldn't reset.
			// However, if they drop a GPL file, we handle that separately.
			// For now, let's NOT reset fixed palette so users can batch process with the same palette.

			isGridManuallyToggled = false; // 新しい画像が読み込まれたら手動フラグをリセット

			els.downloadButton.style.display = "none";
			els.downloadDropdownButton.style.display = "none";
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
			// 失敗時はUIをリセット
			currentImage = null;
			updateReduceColorsDisabledStates();
			showError(`${i18n.t("error.load_failed")}: ${(err as Error).message}`);
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

	// Click on input canvas container triggers file input
	els.inputCanvasContainer.addEventListener("click", () => {
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

	els.dropArea.addEventListener("drop", async (e) => {
		const dt = (e as DragEvent).dataTransfer;
		const files = dt?.files;
		if (files && files.length > 0) {
			const file = files[0];
			if (file.name.toLowerCase().endsWith(".gpl")) {
				// Handle palette file
				const text = await file.text();
				const palette = parseGPL(text);
				if (palette.length > 0) {
					if (palette.length > 0) {
						currentFixedPalette = palette;
						els.reduceColorModeSelect.value = "fixed";
						updateReduceColorsDisabledStates();
						runProcessing();
					}
				}
			} else {
				loadFile(file);
				// Update file input to match (optional but good for consistency)
				const container = new DataTransfer();
				container.items.add(file);
				els.fileInput.files = container.files;
			}
		}
	});

	// Palette Import/Export
	els.exportGPLButton.addEventListener("click", () => {
		if (currentExtractedPalette.length === 0) return;
		const content = generateGPL(currentExtractedPalette, "PixelRefiner Export");
		const blob = new Blob([content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "palette.gpl";
		link.click();
		URL.revokeObjectURL(url);
	});

	els.exportPNGButton.addEventListener("click", async () => {
		if (currentExtractedPalette.length === 0) return;
		const blob = await generatePaletteImage(currentExtractedPalette);
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "palette.png";
		link.click();
		URL.revokeObjectURL(url);
	});
	// ---------------------------------------------------------
	// Result Modal
	// ---------------------------------------------------------

	const closeResultModal = () => {
		els.resultModal.style.display = "none";
	};

	// Open modal on result container click is now handled by ResultViewer onImageClick callback

	els.closeResultModal.addEventListener("click", closeResultModal);

	els.resultModal.addEventListener("click", (e) => {
		if (e.target === els.resultModal) {
			closeResultModal();
		}
	});

	els.fixedPaletteImportButton.addEventListener("click", () => {
		els.paletteFileInput.click();
	});

	els.showPaletteButton.addEventListener("click", () => {
		els.paletteModal.style.display = "flex";
	});

	els.closePaletteModal.addEventListener("click", () => {
		els.paletteModal.style.display = "none";
	});

	els.paletteModal.addEventListener("click", (e) => {
		if (e.target === els.paletteModal) {
			els.paletteModal.style.display = "none";
		}
	});

	els.paletteFileInput.addEventListener("change", async (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		try {
			if (file.name.toLowerCase().endsWith(".gpl")) {
				// Handle GIMP Palette files
				const text = await file.text();
				const palette = parseGPL(text);
				if (palette.length > 0) {
					currentFixedPalette = palette;
					els.reduceColorModeSelect.value = "fixed";
					updateReduceColorsDisabledStates();
					runProcessing();
				}
			} else if (file.type.startsWith("image/")) {
				// Handle all image formats (PNG, JPEG, GIF, WebP, etc.)
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement("canvas");
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext("2d");
					if (!ctx) return;
					ctx.drawImage(img, 0, 0);
					const imageData = ctx.getImageData(0, 0, img.width, img.height);

					// Extract colors with 256 color limit
					const { colors, totalColors } = extractColorsFromImage(
						imageData,
						256,
					);

					// Show warning if there were more than 256 colors
					if (totalColors > 256) {
						showError(i18n.t("error.palette_limit", { count: totalColors }));
					}

					if (colors.length > 0) {
						currentFixedPalette = colors;
						els.reduceColorModeSelect.value = "fixed";
						updateReduceColorsDisabledStates();
						runProcessing();
					}
					URL.revokeObjectURL(img.src);
				};
				img.src = URL.createObjectURL(file);
			}
		} catch (err) {
			console.error(err);
			showError(i18n.t("error.load_failed"));
		}
		// Reset input
		els.paletteFileInput.value = "";
	});

	els.processButton.addEventListener("click", () => {
		runProcessing();
	});

	// 表示切替ロジック
	const openCompareModal = () => {
		els.compareModal.style.display = "flex";

		// 背景色を同期 (mainResultViewerから取得するか、保存された設定から取得)
		// 簡易的に localStorage から取得
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const settings = JSON.parse(saved) as SavedSettings;
				const bgType = settings.bgType || "checkered";

				const compareContainer = els.compareContainer.querySelector(
					".img-comp-container",
				);
				if (compareContainer) {
					["bg-checkered", "bg-white", "bg-black", "bg-green"].forEach(
						(cls) => {
							compareContainer.classList.remove(cls);
						},
					);
					compareContainer.classList.add(`bg-${bgType}`);
				}
			}
		} catch (e) {
			console.error(e);
		}

		// モーダルが開いた直後にサイズ同期を行う必要がある
		requestAnimationFrame(() => {
			// Always keep grid OFF in compare modal (nothing to draw, but keep state consistent)
			// (No-op for now, since compare modal does not use grid-canvas.)
			const before =
				compareBeforeMode === "sanitized"
					? compareBeforeSanitizedUrl
					: compareBeforeOriginalUrl;
			if (before && compareAfterUrl) {
				comparer.updateImages(before, compareAfterUrl);
			}
			comparer.syncImageSize();
		});
	};

	const closeCompareModal = () => {
		els.compareModal.style.display = "none";
	};

	els.btnViewCompare.addEventListener("click", () => openCompareModal());
	els.closeCompareModal.addEventListener("click", () => closeCompareModal());
	els.compareModal.addEventListener("click", (e) => {
		if (e.target === els.compareModal) {
			closeCompareModal();
		}
	});

	const setCompareBeforeMode = (mode: "original" | "sanitized") => {
		compareBeforeMode = mode;
		els.btnCompareBeforeOriginal.classList.toggle(
			"active",
			mode === "original",
		);
		els.btnCompareBeforeSanitized.classList.toggle(
			"active",
			mode === "sanitized",
		);
		const before =
			mode === "sanitized"
				? compareBeforeSanitizedUrl
				: compareBeforeOriginalUrl;
		if (before && compareAfterUrl) {
			comparer.updateImages(before, compareAfterUrl);
		}
	};

	els.btnCompareBeforeOriginal.addEventListener("click", (e) => {
		e.stopPropagation();
		setCompareBeforeMode("original");
	});
	els.btnCompareBeforeSanitized.addEventListener("click", (e) => {
		e.stopPropagation();
		setCompareBeforeMode("sanitized");
	});

	// アプリの準備が整ったら表示
	document.body.classList.add("loaded");

	// Background selector logic (Moved to ResultViewer, but we might need initial sync or setup if logic was here)
	// The logic was: set initial bg-checkered, and add click listener.
	// ResultViewer handles this now.

	loadSettings();
};
