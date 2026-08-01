import { wrap } from "comlink";
import type { ProcessOptions } from "../core/processor";
import type { ProcessorWorker } from "../core/worker";
import { clampInt, clampNumber, PROCESS_RANGES } from "../shared/config";
import type { DitherMode, OutlineStyle } from "../shared/types";
import { sortPalette } from "../utils/palette";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import type { ImageComparer } from "./compare";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { showError, showWarning } from "./notifications";
import { translateProcessingWarnings } from "./processing-warnings";
import type { ResultViewer } from "./result-viewer";
import type { ImageSession } from "./session";

const workerInstance = new Worker(
	new URL("../core/worker.ts", import.meta.url),
	{ type: "module" },
);
const processor = wrap<ProcessorWorker>(workerInstance);

type ProcessingControllerOptions = {
	els: Elements;
	processingState: ProcessingState;
	imageSession: ImageSession;
	mainResultViewer: ResultViewer;
	modalResultViewer: ResultViewer;
	comparer: ImageComparer;
	updatePaletteDisplay: () => void;
	updateGrid: () => void;
	updateBgColorFromMethod: () => void;
};

export const createRunProcessing = ({
	els,
	processingState,
	imageSession,
	mainResultViewer,
	modalResultViewer,
	comparer,
	updatePaletteDisplay,
	updateGrid,
	updateBgColorFromMethod,
}: ProcessingControllerOptions): (() => Promise<void>) => {
	const compareBeforeCanvas = document.createElement("canvas");
	const compareAfterCanvas = document.createElement("canvas");
	const compareBeforeSanitizedCanvas = document.createElement("canvas");
	const isGridManuallyToggled = false;

	return async () => {
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
				analysis,
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
				fixedPalette: processingState.currentFixedPalette,
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
			processingState.currentExtractedPalette = sortedPalette;

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
			processingState.compareBeforeOriginalUrl =
				compareBeforeCanvas.toDataURL("image/png");
			processingState.compareBeforeSanitizedUrl =
				compareBeforeSanitizedCanvas.toDataURL("image/png");
			processingState.compareAfterUrl =
				compareAfterCanvas.toDataURL("image/png");

			const before =
				processingState.compareBeforeMode === "sanitized"
					? processingState.compareBeforeSanitizedUrl
					: processingState.compareBeforeOriginalUrl;
			comparer.updateImages(before, processingState.compareAfterUrl);

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
			if (analysis.warnings.length > 0) {
				showWarning(translateProcessingWarnings(analysis.warnings).join("\n"));
			}
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
};
