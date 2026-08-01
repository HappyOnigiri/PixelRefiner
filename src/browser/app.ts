import {
	extractColorsFromImage,
	generateGPL,
	generatePaletteImage,
	parseGPL,
} from "../utils/palette";
import { getElements } from "./app-elements";
import { createProcessingState } from "./app-state";
import { ImageComparer } from "./compare";
import { setupCompareControls } from "./compare-controls";
import { i18n } from "./i18n";
import { drawRawImageToCanvas, imageToRawImage } from "./io";
import { createModalController } from "./modal-controller";
import { showError } from "./notifications";
import { setupPresetControls } from "./preset-controls";
import { createRunProcessing } from "./processing-controller";
import { setupResultActions } from "./result-actions";
import { ResultViewer } from "./result-viewer";
import { ImageSession } from "./session";
import { setupSettingsControls } from "./settings-controls";

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

	const processingState = createProcessingState();

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

	const runProcessing = createRunProcessing({
		els,
		processingState,
		imageSession,
		mainResultViewer,
		modalResultViewer,
		comparer,
		updatePaletteDisplay: () => updatePaletteDisplay(),
		updateGrid: () => updateGrid(),
		updateBgColorFromMethod: () => updateBgColorFromMethod(),
	});
	const {
		updateRgbInputs,
		updateProcessButtonVisibility,
		triggerAutoProcess,
		updateDisabledStates,
		updatePaletteButtonVisibility,
		updateReduceColorsDisabledStates,
		updateBgDisabledStates,
		updateBgColorFromMethod,
	} = setupSettingsControls({
		els,
		processingState,
		imageSession,
		runProcessing,
		saveSettings,
	});
	const updateGrid = () => {
		mainResultViewer.drawGrid();
		modalResultViewer.drawGrid();
	};

	const updatePaletteDisplay = () => {
		els.paletteColors.innerHTML = "";
		if (processingState.currentExtractedPalette.length === 0) {
			// els.paletteSection.style.display = "none";
			updatePaletteButtonVisibility();
			return;
		}

		// els.paletteSection.style.display = "block";
		updatePaletteButtonVisibility();

		processingState.currentExtractedPalette.forEach((color) => {
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
						processingState.currentFixedPalette = palette;
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
		if (processingState.currentExtractedPalette.length === 0) return;
		const content = generateGPL(
			processingState.currentExtractedPalette,
			"PixelRefiner Export",
		);
		const blob = new Blob([content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "palette.gpl";
		link.click();
		URL.revokeObjectURL(url);
	});

	els.exportPNGButton.addEventListener("click", async () => {
		if (processingState.currentExtractedPalette.length === 0) return;
		const blob = await generatePaletteImage(
			processingState.currentExtractedPalette,
		);
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
					processingState.currentFixedPalette = palette;
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
						processingState.currentFixedPalette = colors;
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
	const { openCompareModal } = setupCompareControls({
		els,
		processingState,
		comparer,
		compareModalController,
		storageKey: STORAGE_KEY,
	});
	setupResultActions({
		els,
		imageSession,
		mainResultViewer,
		modalResultViewer,
		resultModalController,
		runProcessing,
		openCompareModal,
		closeResultModal,
		syncViewers,
	});

	// Display when app is ready
	document.body.classList.add("loaded");

	// Background selector logic (Moved to ResultViewer, but we might need initial sync or setup if logic was here)
	// The logic was: set initial bg-checkered, and add click listener.
	// ResultViewer handles this now.

	loadSettings();

	// ---------------------------------------------------------
	setupPresetControls({
		els,
		presetModalController,
		updateDisabledStates,
		updateReduceColorsDisabledStates,
		updateBgDisabledStates,
		updateProcessButtonVisibility,
		triggerAutoProcess,
	});
};
