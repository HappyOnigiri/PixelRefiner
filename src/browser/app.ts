import { wrap } from "comlink";
import JSZip from "jszip";
import { upscaleNearest } from "../core/ops";
import type { ProcessOptions } from "../core/processor";
import type { ProcessorWorker } from "../core/worker";
import {
	clampInt,
	clampNumber,
	PROCESS_DEFAULTS,
	PROCESS_RANGES,
} from "../shared/config";
import type { DitherMode, OutlineStyle, RGB } from "../shared/types";
import {
	extractColorsFromImage,
	generateGPL,
	generatePaletteImage,
	parseGPL,
	sortPalette,
} from "../utils/palette";
import { ImageComparer } from "./compare";
import { i18n, type Language } from "./i18n";
import { drawRawImageToCanvas, imageToRawImage } from "./io";
import { PresetManager } from "./presets";
import { ResultViewer } from "./result-viewer";
import { ImageSession } from "./session";

// Instantiate worker
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
	bgRemovalScopeSelect: HTMLSelectElement;
	bgConnectivitySelect: HTMLSelectElement;
	trimToContentCheck: HTMLInputElement;
	fastAutoGridFromTrimmedCheck: HTMLInputElement;
	makeSquareCheck: HTMLInputElement;
	keepAspectRatioCheck: HTMLInputElement;
	gridDetectionModeSelect: HTMLSelectElement;
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

	// Image List
	imageListPanel: HTMLElement;
	imageListContainer: HTMLElement;
	clearAllButton: HTMLButtonElement;
	downloadAllButton: HTMLButtonElement;
	downloadAllDropdownButton: HTMLButtonElement;
	downloadAllMenu: HTMLElement;

	// Presets
	presetNameInput: HTMLInputElement;
	savePresetButton: HTMLButtonElement;
	loadPresetModalButton: HTMLButtonElement;
	presetModal: HTMLElement;
	closePresetModal: HTMLButtonElement;
	presetModalList: HTMLElement;
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
		bgRemovalScopeSelect: get<HTMLSelectElement>("bg-removal-scope"),
		bgConnectivitySelect: get<HTMLSelectElement>("bg-connectivity"),
		trimToContentCheck: get<HTMLInputElement>("trim-to-content"),
		fastAutoGridFromTrimmedCheck: get<HTMLInputElement>(
			"fast-auto-grid-from-trimmed",
		),
		makeSquareCheck: get<HTMLInputElement>("make-square"),
		keepAspectRatioCheck: get<HTMLInputElement>("keep-aspect-ratio"),
		gridDetectionModeSelect: get<HTMLSelectElement>("grid-detection-mode"),
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

		// Image List
		imageListPanel: get<HTMLElement>("image-list-panel"),
		imageListContainer: get<HTMLElement>("image-list-container"),
		clearAllButton: get<HTMLButtonElement>("clear-all-button"),
		downloadAllButton: get<HTMLButtonElement>("download-all-button"),
		downloadAllDropdownButton: get<HTMLButtonElement>(
			"download-all-dropdown-button",
		),
		downloadAllMenu: get<HTMLElement>("download-all-menu"),

		presetNameInput: get<HTMLInputElement>("preset-name-input"),
		savePresetButton: get<HTMLButtonElement>("save-preset-button"),
		loadPresetModalButton: get<HTMLButtonElement>("load-preset-modal-button"),
		presetModal: get<HTMLElement>("preset-modal"),
		closePresetModal: get<HTMLButtonElement>("close-preset-modal"),
		presetModalList: get<HTMLElement>("preset-modal-list"),
	};
};

/**
 * Display error in overlay
 */
const showError = (message: string) => {
	const toast = document.createElement("div");
	toast.className = "error-toast";
	toast.setAttribute("role", "alert");
	toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>${message}</span>`;
	document.body.appendChild(toast);

	// Start showing in the next frame
	requestAnimationFrame(() => {
		toast.classList.add("show");
	});

	// Remove after 5 seconds
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

/**
 * Display information (success, etc.) in toast
 */
const showInfo = (message: string) => {
	const toast = document.createElement("div");
	toast.className = "info-toast";
	toast.setAttribute("role", "status");
	toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>${message}</span>`;
	document.body.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.add("show");
	});

	setTimeout(() => {
		toast.classList.remove("show");
		toast.addEventListener(
			"transitionend",
			() => {
				toast.remove();
			},
			{ once: true },
		);
	}, 3000);
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

	// ---------------------------------------------------------
	// Modal accessibility helpers
	// ---------------------------------------------------------
	const appRoot = document.querySelector(".app") as HTMLElement | null;
	let openModalCount = 0;

	const setModalOpenState = (isOpen: boolean) => {
		openModalCount += isOpen ? 1 : -1;
		openModalCount = Math.max(0, openModalCount);

		document.body.classList.toggle("modal-open", openModalCount > 0);
		if (appRoot) {
			if (openModalCount > 0) {
				appRoot.setAttribute("aria-hidden", "true");
			} else {
				appRoot.removeAttribute("aria-hidden");
			}
		}
	};

	const getFocusableElements = (root: HTMLElement): HTMLElement[] => {
		const nodes = Array.from(
			root.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			),
		);
		return nodes.filter((el) => {
			if (el.hasAttribute("disabled")) return false;
			if (el.getAttribute("aria-hidden") === "true") return false;
			// Skip elements that are not visible
			return el.offsetParent !== null || el === document.activeElement;
		});
	};

	type ModalController = {
		open: () => void;
		close: () => void;
		isOpen: () => boolean;
	};

	const createModalController = (
		modalEl: HTMLElement,
		closeBtn: HTMLElement | null,
	): ModalController => {
		let lastFocused: HTMLElement | null = null;
		let abort: AbortController | null = null;

		const focusInitial = () => {
			(closeBtn ?? getFocusableElements(modalEl)[0] ?? modalEl).focus();
		};

		const open = () => {
			if (modalEl.style.display !== "none") return;
			lastFocused = document.activeElement as HTMLElement | null;
			modalEl.style.display = "flex";
			setModalOpenState(true);

			abort?.abort();
			abort = new AbortController();

			modalEl.addEventListener(
				"keydown",
				(e) => {
					if (e.key === "Escape") {
						e.stopPropagation();
						close();
						return;
					}
					if (e.key !== "Tab") return;

					const focusables = getFocusableElements(modalEl);
					if (focusables.length === 0) {
						e.preventDefault();
						return;
					}
					const first = focusables[0];
					const last = focusables[focusables.length - 1];
					const active = document.activeElement as HTMLElement | null;

					if (e.shiftKey) {
						if (!active || active === first) {
							e.preventDefault();
							last.focus();
						}
					} else {
						if (!active || active === last) {
							e.preventDefault();
							first.focus();
						}
					}
				},
				{ signal: abort.signal },
			);

			requestAnimationFrame(() => focusInitial());
		};

		const close = () => {
			if (modalEl.style.display === "none") return;
			modalEl.style.display = "none";
			setModalOpenState(false);
			abort?.abort();
			abort = null;
			lastFocused?.focus?.();
			lastFocused = null;
		};

		const isOpen = () => modalEl.style.display !== "none";

		return { open, close, isOpen };
	};

	const resultModalController = createModalController(
		els.resultModal,
		els.closeResultModal,
	);
	const compareModalController = createModalController(
		els.compareModal,
		els.closeCompareModal,
	);

	const presetModalController = createModalController(
		els.presetModal,
		els.closePresetModal,
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

	const getTimestampString = (): string => {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");
		return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
	};

	const handleDownload = (scale: number) => {
		const currentResult = imageSession.getActiveImage()?.result;
		if (!currentResult) return;

		const timestamp = getTimestampString();
		let link: HTMLAnchorElement;
		if (scale === 1) {
			link = document.createElement("a");
			link.download = `refined_${timestamp}.png`;
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
			link.download = `refined_x${scale}_${timestamp}.png`;
			link.href = tempCanvas.toDataURL("image/png");
		}
		link.click();
	};

	const handleDownloadAll = async (scale = 1) => {
		const allImages = imageSession.getImages();
		if (allImages.length === 0) {
			showError(
				i18n.t("error.no_processed_images") ||
					"No processed images to download.",
			);
			return;
		}

		els.loadingOverlay.style.display = "flex";
		try {
			// 1. Process ALL images (User Request: Force re-process to apply current settings)
			const imagesToProcess = [...allImages];

			if (imagesToProcess.length > 0) {
				const originalActiveId = imageSession.getActiveImage()?.id;

				for (let i = 0; i < imagesToProcess.length; i++) {
					const img = imagesToProcess[i];
					const index = i + 1;
					const total = imagesToProcess.length;

					// Update loading text
					const statusText = i18n.t("status.processing_batch", {
						current: index,
						total: total,
					});
					const loadingTextEl =
						els.loadingOverlay.querySelector(".loading-text");
					if (loadingTextEl) {
						loadingTextEl.textContent = statusText;
					}

					imageSession.setActiveImage(img.id);
					// Wait a tick for UI to update (inputs to reflect, though they shouldn't change for same session if global)
					await new Promise((r) => setTimeout(r, 10));

					await runProcessing();
				}

				// Restore original active image
				if (originalActiveId) {
					imageSession.setActiveImage(originalActiveId);
				}
			}

			// 2. Create ZIP
			// Re-fetch images to get updated results
			const imagesToZip = imageSession
				.getImages()
				.filter((img) => img.status === "done" && img.result);

			if (imagesToZip.length === 0) {
				throw new Error("No successfully processed images.");
			}

			const zip = new JSZip();
			const filenames = new Set<string>();

			for (const img of imagesToZip) {
				if (!img.result) continue;

				const name = img.file.name.replace(/\.[^/.]+$/, ""); // Remove extension
				let filename =
					scale === 1 ? `${name}_refined.png` : `${name}_refined_x${scale}.png`;

				// Avoid duplicates
				let counter = 1;
				while (filenames.has(filename)) {
					filename =
						scale === 1
							? `${name}_refined_${counter}.png`
							: `${name}_refined_x${scale}_${counter}.png`;
					counter++;
				}
				filenames.add(filename);

				const canvas = document.createElement("canvas");
				if (scale === 1) {
					drawRawImageToCanvas(img.result, canvas);
				} else {
					const upscaled = upscaleNearest(img.result, scale);
					drawRawImageToCanvas(upscaled, canvas);
				}

				const blob = await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, "image/png"),
				);
				if (blob) {
					zip.file(filename, blob);
				}
			}

			const content = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(content);
			const link = document.createElement("a");
			link.href = url;
			const timestamp = getTimestampString();
			const suffix = scale === 1 ? "" : `_x${scale}`;
			link.download = `refined_batch${suffix}_${timestamp}.zip`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (e) {
			console.error(e);
			showError(`${i18n.t("error.download_failed")}: ${(e as Error).message}`);
		} finally {
			els.loadingOverlay.style.display = "none";
		}
	};

	els.downloadAllButton.addEventListener("click", () => handleDownloadAll(1));

	els.downloadAllDropdownButton.addEventListener("click", (e) => {
		e.stopPropagation();
		els.downloadAllMenu.classList.toggle("show");
	});

	els.downloadAllMenu.addEventListener("click", (e) => {
		const btn = (e.target as HTMLElement).closest("button");
		if (btn) {
			const scale = Number(btn.dataset.scale);
			if (scale) {
				handleDownloadAll(scale);
			}
			els.downloadAllMenu.classList.remove("show");
		}
	});

	// Close menus on outside click
	document.addEventListener("click", () => {
		els.downloadMenu.classList.remove("show");
		els.downloadAllMenu.classList.remove("show");
	});

	mainResultViewer.setCallbacks({
		onBgChange: (bg) => syncViewers(mainResultViewer, modalResultViewer, bg),
		onZoomToggle: (z) =>
			syncViewers(mainResultViewer, modalResultViewer, undefined, z),
		onGridToggle: (g) =>
			syncViewers(mainResultViewer, modalResultViewer, undefined, undefined, g),
		onDownload: (scale) => handleDownload(scale),
		onCompare: () => openCompareModal(),
		onImageClick: () => {
			resultModalController.open();
			// Update grid and other drawings when modal is displayed (due to size difference)
			requestAnimationFrame(() => {
				modalResultViewer.drawGrid();
			});
		},
		onGridSelect: (grid) => {
			if (grid.outW === undefined || grid.outH === undefined) return;
			els.gridDetectionModeSelect.value = "hint";
			els.gridDetectionModeSelect.dispatchEvent(new Event("change"));
			els.forcePixelsWInput.value = grid.outW.toString();
			els.forcePixelsHInput.value = grid.outH.toString();
			showInfo(
				i18n.t("info.grid_updated", { w: grid.outW, h: grid.outH }) ||
					`Grid updated to ${grid.outW}x${grid.outH}`,
			);
			runProcessing();
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
		onGridSelect: (grid) => {
			if (grid.outW === undefined || grid.outH === undefined) return;
			els.gridDetectionModeSelect.value = "hint";
			els.gridDetectionModeSelect.dispatchEvent(new Event("change"));
			els.forcePixelsWInput.value = grid.outW.toString();
			els.forcePixelsHInput.value = grid.outH.toString();
			showInfo(
				i18n.t("info.grid_updated", { w: grid.outW, h: grid.outH }) ||
					`Grid updated to ${grid.outW}x${grid.outH}`,
			);
			runProcessing();
		},
	});

	const imageSession = new ImageSession({
		onUpdate: () => {
			updateImageList();
			updateProcessButtonVisibility();
		},
		onActiveChange: (item) => {
			if (item) {
				// Restore result if available, or original
				// const displayImage = item.result || item.original; // Unused

				// Reset viewers
				// Note: We might want to persist grid/zoom state or reset it?
				// Current logic: isGridManuallyToggled controls grid auto-off.
				// Let's reset isGridManuallyToggled when switching images?
				// Maybe not, if user wants to keep grid on.
				// But original logic reset it on loadFile.
				// For now, let's keep grid state as is, but maybe re-evaluate auto-grid if new image.

				// Update Viewers
				drawRawImageToCanvas(item.original, els.originalCanvas);

				// If result exists, show it. If not, clear output?
				if (item.result) {
					mainResultViewer.updateImage(item.result, item.grid);
					modalResultViewer.updateImage(item.result, item.grid);
					els.outputPanel.classList.add("has-image");
					// els.outputSize.textContent = `${item.result.width}x${item.result.height} px`; // Handled by ResultViewer
					els.downloadButton.style.display = "flex";
					els.downloadDropdownButton.style.display = "flex";

					// Re-apply grid if needed
					setTimeout(() => {
						mainResultViewer.drawGrid();
						modalResultViewer.drawGrid();
					}, 0);
				} else {
					// Pending state: Clear output or show placeholder?
					// Currently app doesn't have "clear output" method easily exposed without clearing canvas.
					// Let's just hide functionality or show original in output?
					// Typically we run processing immediately.
					// If pending, runProcessing will be triggered by auto-process or manual.
					// For now, let's clear the result view if no result.

					// However, runProcessing is usually called immediately after add.
					// If switching back to a pending image (e.g. error or cleared), we should maybe clear output.
					// But we don't have "clear" method on ResultViewer.
					// We can just not update it, but that leaves previous image.
					// TODO: Add clear method to ResultViewer? Or just existing behavior.
					// Let's leave it for now, assuming auto-process is ON or user clicks process.

					els.outputPanel.classList.remove("has-image");
					// els.outputSize.textContent = "-"; // Handled by ResultViewer
					els.downloadButton.style.display = "none";
					els.downloadDropdownButton.style.display = "none";
					els.downloadMenu.classList.remove("show");
				}

				els.dropArea.classList.add("has-image");
				els.inputSize.textContent = `${item.original.width}x${item.original.height} px`;

				// Trigger processing if pending and auto-process is ON
				// Note: For multiple images, auto-process is forced OFF above, so this only runs for single image
				// unless we change logic.
				if (item.status === "pending" && els.autoProcessToggle.checked) {
					runProcessing();
				}

				// Update BG extraction color if method is RGB
				// (Or update RGB inputs if picking from image)
			} else {
				// No active image
				els.dropArea.classList.remove("has-image");
				els.outputPanel.classList.remove("has-image");
				els.inputSize.textContent = "-";
				// els.outputSize.textContent = "-"; // Handled by ResultViewer
				const ctx = els.originalCanvas.getContext("2d");
				ctx?.clearRect(
					0,
					0,
					els.originalCanvas.width,
					els.originalCanvas.height,
				);
			}
			updateReduceColorsDisabledStates();
			updateBgDisabledStates();
		},
	});

	// Image List UI Updater
	const updateImageList = () => {
		const images = imageSession.getImages();
		// Hide if 0 or 1 image (User Request)
		if (images.length <= 1) {
			els.imageListPanel.style.display = "none";
			return;
		}
		els.imageListPanel.style.display = "block";

		els.imageListContainer.innerHTML = "";
		const activeId = imageSession.getActiveImage()?.id;

		images.forEach((img) => {
			const item = document.createElement("div");
			item.className = `image-item ${img.id === activeId ? "active" : ""}`;
			item.dataset.status = img.status;
			item.title = img.file.name;

			const thumb = document.createElement("img");
			thumb.src = img.thumbnail;
			item.appendChild(thumb);

			const statusInd = document.createElement("div");
			statusInd.className = "status-indicator";
			item.appendChild(statusInd);

			const removeBtn = document.createElement("button");
			removeBtn.className = "remove-btn";
			removeBtn.innerHTML = "x";
			removeBtn.title = i18n.t("ui.remove_image") || "Remove";
			removeBtn.onclick = (e) => {
				e.stopPropagation();
				imageSession.removeImage(img.id);
			};
			item.appendChild(removeBtn);

			item.onclick = () => {
				imageSession.setActiveImage(img.id);
			};

			els.imageListContainer.appendChild(item);
		});
	};

	let currentFixedPalette: RGB[] | undefined;
	const isGridManuallyToggled = false;

	const saveSettings = () => {
		const settings: SavedSettings = {
			zoomOutput: els.zoomOutputCheck.checked,
			gridOutput: els.gridOutputCheck.checked,
			bgType: mainResultViewer.getBackgroundType(),
			autoProcess: els.autoProcessToggle.checked,
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
			if (settings.autoProcess !== undefined)
				els.autoProcessToggle.checked = settings.autoProcess;

			// Update button visibility status
			updateProcessButtonVisibility();

			if (settings.bgType !== undefined) {
				mainResultViewer.setBackground(settings.bgType);
				modalResultViewer.setBackground(settings.bgType);
			}
		} catch (e) {
			console.error("Failed to restore settings:", e);
		}
	};

	let currentExtractedPalette: RGB[] = [];

	// Comparison specific variables
	const compareBeforeCanvas = document.createElement("canvas");
	const compareAfterCanvas = document.createElement("canvas");
	const compareBeforeSanitizedCanvas = document.createElement("canvas");

	let compareBeforeOriginalUrl = "";
	let compareBeforeSanitizedUrl = "";
	let compareAfterUrl = "";
	let compareBeforeMode: "original" | "sanitized" = "original";

	// Processing Function
	const runProcessing = async () => {
		const images = imageSession.getImages();
		if (images.length === 0) return;

		mainResultViewer.setLoading(true);

		// Disable UI
		els.processButton.disabled = true;
		els.loadingOverlay.style.display = "flex";
		els.outputPanel.classList.add("is-processing");
		els.outputPanel.setAttribute("aria-busy", "true");

		// Design to process only the currently active image
		// (Batch processing requires separate implementation, but currently auto-processes on switch)
		const currentItem = imageSession.getActiveImage();
		if (!currentItem) {
			// Cleanup and finish
			els.loadingOverlay.style.display = "none";
			els.outputPanel.classList.remove("is-processing");
			els.outputPanel.removeAttribute("aria-busy");
			els.processButton.disabled = false;
			return;
		}

		const currentImage = currentItem.original;
		imageSession.setImageStatus(currentItem.id, "processing");

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
			const pixelsW = parseOptionalInt(
				els.forcePixelsWInput,
				PROCESS_RANGES.forcePixelsW,
			);
			const pixelsH = parseOptionalInt(
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
			const method = els.bgExtractionMethod
				.value as ProcessOptions["bgExtractionMethod"];
			const bgEnabled = method !== "none";
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

			type GridDetectionMode = "auto" | "hint" | "force" | "off";
			const gridMode = els.gridDetectionModeSelect.value as GridDetectionMode;
			const usePixels = pixelsW !== undefined && pixelsH !== undefined;
			const forcePixelsW =
				gridMode === "force" && usePixels ? pixelsW : undefined;
			const forcePixelsH =
				gridMode === "force" && usePixels ? pixelsH : undefined;
			const hintPixelsW =
				gridMode === "hint" && usePixels ? pixelsW : undefined;
			const hintPixelsH =
				gridMode === "hint" && usePixels ? pixelsH : undefined;
			const enableGridDetection = gridMode !== "off";

			const {
				result,
				grid,
				extractedPalette,
				compareBefore,
				compareBeforeSanitized,
			} = await processor.process(currentImage, {
				detectionQuantStep,
				forcePixelsW,
				forcePixelsH,
				hintPixelsW,
				hintPixelsH,
				preRemoveBackground: bgEnabled && els.preRemoveCheck.checked,
				postRemoveBackground: bgEnabled && els.postRemoveCheck.checked,
				bgRemovalScope: bgEnabled
					? (els.bgRemovalScopeSelect.value as ProcessOptions["bgRemovalScope"])
					: "off",
				bgConnectivity: bgEnabled
					? (els.bgConnectivitySelect.value as ProcessOptions["bgConnectivity"])
					: "4",
				backgroundTolerance: tolerance,
				sampleWindow,
				trimToContent: els.trimToContentCheck.checked,
				fastAutoGridFromTrimmed: els.fastAutoGridFromTrimmedCheck.checked,
				makeSquare: els.makeSquareCheck.checked,
				keepAspectRatio: els.keepAspectRatioCheck.checked,
				enableGridDetection,
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

			// Transferred data might become unavailable in the caller thread (depending on Comlink behavior,
			// basically designed so RawImage is not reused, so re-assigned here)
			// However, Comlink uses structured cloning by default,
			// so currentImage is maintained unless transfer is used explicitly.
			// Keeping it as a copy for simplicity.
			const resultImage = result;
			// currentResult = resultImage; // No longer used directly
			const effectiveGrid = imageSession.updateImageResult(
				currentItem.id,
				resultImage,
				grid,
			);

			mainResultViewer.updateImage(resultImage, effectiveGrid);
			modalResultViewer.updateImage(resultImage, effectiveGrid);
			mainResultViewer.setLoading(false);

			// Turn OFF grid by default if exceeds 256px (if not manually enabled)
			if (!isGridManuallyToggled) {
				if (resultImage.width > 256 || resultImage.height > 256) {
					if (els.gridOutputCheck.checked) {
						els.gridOutputCheck.checked = false;
						// Clear grid
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

			// Update size display in download menu
			els.downloadMenu.querySelectorAll("button").forEach((btn) => {
				const scale = Number(btn.dataset.scale);
				if (scale && scale > 1) {
					btn.textContent = `x${scale} (${resultImage.width * scale}x${resultImage.height * scale})`;
				}
			});

			// Update comparison slider (generate both resized original and sanitized)
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

			// If modal is open, reflect immediately (including size sync)
			if (els.compareModal.style.display !== "none") {
				requestAnimationFrame(() => {
					comparer.syncImageSize();
				});
			}

			// Redraw grid when processing result is updated
			// Delay slightly to wait for DOM update (canvas display size determination)
			requestAnimationFrame(() => {
				updateGrid();
			});
			els.outputPanel.classList.add("has-image");
			// els.outputSize.textContent = `${resultImage.width}x${resultImage.height} px`; // Handled by ResultViewer

			// If background removal method is corner-based, reflect extracted color in UI
			updateBgColorFromMethod();
		} catch (err) {
			const msg = `${i18n.t("error.process_failed")}: ${(err as Error).message}`;
			showError(msg);
			imageSession.setImageStatus(currentItem.id, "error", msg);
		} finally {
			els.loadingOverlay.style.display = "none";
			els.outputPanel.classList.remove("is-processing");
			els.outputPanel.removeAttribute("aria-busy");
			els.processButton.disabled = false;
		}
	};

	// Eyedropper state
	const openEyedropperModal = () => {
		const img = imageSession.getActiveImage()?.original;
		if (!img) return;
		els.eyedropperModal.style.display = "flex";
		drawRawImageToCanvas(img, els.eyedropperCanvas);
	};

	const closeEyedropperModal = () => {
		els.eyedropperModal.style.display = "none";
	};

	// Sync RGB inputs
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
			// Switch to RGB mode on manual input
			if (els.bgExtractionMethod.value !== "rgb") {
				els.bgExtractionMethod.value = "rgb";
				updateBgDisabledStates();
			}
		}
	});

	els.bgColorInput.addEventListener("input", () => {
		els.bgRgbInput.value = els.bgColorInput.value;
		// Switch to RGB mode on manual input
		if (els.bgExtractionMethod.value !== "rgb") {
			els.bgExtractionMethod.value = "rgb";
			updateBgDisabledStates();
		}
	});

	els.eyedropperButton.addEventListener("click", (e) => {
		e.stopPropagation();
		if (!imageSession.getActiveImage()) {
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
		const currentImage = imageSession.getActiveImage()?.original;
		if (!currentImage) return;

		const rect = els.eyedropperCanvas.getBoundingClientRect();
		// Canvas in modal is shown 1:1, so click coordinates are treated as image coordinates.
		// However, consideration is needed if CSS scaling is applied.
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
			// Switch to RGB mode when color is picked with eyedropper
			els.bgExtractionMethod.value = "rgb";
			updateBgDisabledStates();
			closeEyedropperModal();
		}
	});

	// Apply default/range from config file to UI
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
		els.bgRemovalScopeSelect.value = PROCESS_DEFAULTS.bgRemovalScope;
		els.bgConnectivitySelect.value = PROCESS_DEFAULTS.bgConnectivity;
		els.trimToContentCheck.checked = PROCESS_DEFAULTS.trimToContent;
		els.fastAutoGridFromTrimmedCheck.checked =
			PROCESS_DEFAULTS.fastAutoGridFromTrimmed;
		els.makeSquareCheck.checked = PROCESS_DEFAULTS.makeSquare;
		els.keepAspectRatioCheck.checked = PROCESS_DEFAULTS.keepAspectRatio;
		els.gridDetectionModeSelect.value =
			PROCESS_DEFAULTS.gridDetectionMode ?? "auto";
		els.reduceColorModeSelect.value = PROCESS_DEFAULTS.reduceColorMode;
		els.ditherModeSelect.value = PROCESS_DEFAULTS.ditherMode;

		els.bgExtractionMethod.value = "top-left";

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

		// Event listeners for language switching buttons
		document.querySelectorAll("[data-lang-btn]").forEach((el) => {
			el.addEventListener("click", () => {
				const lang = el.getAttribute("data-lang-btn") as Language | null;
				if (lang) i18n.setLanguage(lang);
			});
		});

		// Apply initial translation
		i18n.updatePage();
	};

	// Toggle Process button visibility based on Auto Process state
	const updateProcessButtonVisibility = () => {
		els.processButton.style.display = els.autoProcessToggle.checked
			? "none"
			: "flex";
	};

	let autoProcessTimeout: number | undefined;
	const triggerAutoProcess = () => {
		if (!els.autoProcessToggle.checked) return;
		// Do not run conversion if no image is set
		if (!imageSession.getActiveImage()) return;

		// Cancel existing reservation if any (debounce)
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

	// UI control when grid detection is disabled
	const updateDisabledStates = () => {
		const mode = els.gridDetectionModeSelect.value;
		const isOff = mode === "off";
		const isAutoOrHint = mode === "auto" || mode === "hint";
		const isHintOrForce = mode === "hint" || mode === "force";

		const setDisabledClass = (el: HTMLElement, disabled: boolean) => {
			const item = el.closest(".setting-item");
			if (item) item.classList.toggle("disabled", disabled);
		};

		// detectGrid / autoGridFromTrimmed related
		[
			els.quantStepInput,
			els.quantStepSlider,
			els.fastAutoGridFromTrimmedCheck,
		].forEach((el) => {
			setDisabledClass(el, !isAutoOrHint);
		});

		// pixel inputs (hint/force only)
		[els.forcePixelsWInput, els.forcePixelsHInput].forEach((el) => {
			setDisabledClass(el, !isHintOrForce);
		});

		// downsample-related (disabled only when off)
		[els.sampleWindowInput, els.sampleWindowSlider].forEach((el) => {
			setDisabledClass(el, isOff);
		});
	};

	els.gridDetectionModeSelect.addEventListener("change", updateDisabledStates);

	// UI control for color reduction settings
	const updatePaletteButtonVisibility = () => {
		const mode = els.reduceColorModeSelect.value;
		const isFixed = mode === "fixed";
		const hasImage = !!imageSession.getActiveImage();

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
		// Show strength if dithering is enabled
		els.ditherStrengthSetting.style.display = !isDitherNone ? "flex" : "none";

		// Disable dithering settings when color reduction mode is None
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

	// UI control for dithering (could keep it always shown, but enabled only when mode is not None)
	// Keeping it simple for now
	updateReduceColorsDisabledStates();

	updateDisabledStates();

	// Disable background-related UI when background removal method is none
	const updateBgDisabledStates = () => {
		const isBgDisabled = els.bgExtractionMethod.value === "none";

		// Control items related to background transparency
		[
			els.toleranceInput,
			els.toleranceSlider,
			els.preRemoveCheck,
			els.postRemoveCheck,
			els.bgRemovalScopeSelect,
			els.bgConnectivitySelect,
			els.floatingMaxPercentInput,
			els.floatingMaxPercentSlider,
		].forEach((el) => {
			const item = el.closest(".setting-item");
			if (item) {
				item.classList.toggle("disabled", isBgDisabled);
			}
		});

		const rgbContainer = els.rgbPickerContainer;
		if (isBgDisabled) {
			rgbContainer.classList.add("disabled");
		} else {
			rgbContainer.classList.remove("disabled");
		}
	};

	const updateBgColorFromMethod = () => {
		const method = els.bgExtractionMethod.value;
		const currentImage = imageSession.getActiveImage()?.original;
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
		updateBgDisabledStates();
		triggerAutoProcess();
	});

	updateBgDisabledStates();

	updateProcessButtonVisibility();

	// Common listener for saving on setting changes (display conditions only)
	[els.zoomOutputCheck, els.gridOutputCheck, els.autoProcessToggle].forEach(
		(el) => {
			el.addEventListener("change", () => saveSettings());
		},
	);

	// Toggle process button visibility when Auto Process toggle changes
	els.autoProcessToggle.addEventListener("change", () => {
		updateProcessButtonVisibility();
	});

	// Add event listeners to trigger auto-processing on setting changes
	[
		els.forcePixelsWInput,
		els.forcePixelsHInput,
		els.preRemoveCheck,
		els.postRemoveCheck,
		els.bgRemovalScopeSelect,
		els.bgConnectivitySelect,
		els.trimToContentCheck,
		els.fastAutoGridFromTrimmedCheck,
		els.makeSquareCheck,
		els.keepAspectRatioCheck,
		els.gridDetectionModeSelect,
		els.reduceColorModeSelect,
		els.ditherModeSelect,

		els.bgExtractionMethod,
		els.bgRgbInput,
		els.bgColorInput,
	].forEach((el) => {
		el.addEventListener("change", triggerAutoProcess);
		// Also capture text inputs with input event
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

	const loadFiles = async (files: File[]) => {
		// Only process images
		const imageFiles = Array.from(files).filter((f) =>
			f.type.startsWith("image/"),
		);

		if (imageFiles.length === 0) {
			if (files.length > 0 && !files[0].name.endsWith(".gpl")) {
				// If files were dropped but none were images (and not GPL), show error
				// But we handle GPL separately in drop handler.
			}
			return;
		}

		try {
			// Process one by one or Promise.all?
			// Creating raw images is fast, sequential is fine.

			for (const file of imageFiles) {
				const raw = await imageToRawImage(file);
				imageSession.addImage(file, raw);
			}

			// Select the last added image (User Request)
			const allImages = imageSession.getImages();
			if (allImages.length > 0) {
				const lastImage = allImages[allImages.length - 1];
				imageSession.setActiveImage(lastImage.id);
			}
		} catch (err) {
			showError(`${i18n.t("error.load_failed")}: ${(err as Error).message}`);
		}
	};

	els.clearAllButton.addEventListener("click", () => {
		if (confirm(i18n.t("ui.confirm_clear_all") || "Clear all images?")) {
			imageSession.clearAll();
		}
	});

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
		loadFiles(Array.from(files));
		// Reset value so same files can be selected again if needed
		els.fileInput.value = "";
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
				loadFiles(Array.from(files));
				// Update file input to match (optional but good for consistency)
				// Cannot easily set FileList to input, but we don't need to.
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
		resultModalController.close();
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

	// Display toggle logic
	const openCompareModal = () => {
		compareModalController.open();

		// Sync background color (from mainResultViewer or saved settings)
		// Simply retrieve from localStorage
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

		// Need size synchronization immediately after modal opens
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
		compareModalController.close();
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

	// Display when app is ready
	document.body.classList.add("loaded");

	// Background selector logic (Moved to ResultViewer, but we might need initial sync or setup if logic was here)
	// The logic was: set initial bg-checkered, and add click listener.
	// ResultViewer handles this now.

	loadSettings();

	// ---------------------------------------------------------
	// Presets Logic
	// ---------------------------------------------------------
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
