import JSZip from "jszip";
import { upscaleNearest } from "../core/ops";
import { clampInt, PROCESS_RANGES } from "../shared/config";
import type { DitherMode } from "../shared/types";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import {
	type BatchExportItem,
	createBatchArchiveEntries,
	serializeBatchDiagnostics,
} from "./batch-export";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { showError, showWarning } from "./notifications";
import { createProcessOptions, processor } from "./processing-controller";
import type { ImageSession } from "./session";

type BatchControllerOptions = {
	els: Elements;
	processingState: ProcessingState;
	imageSession: ImageSession;
};

const timestamp = (): string => {
	const now = new Date();
	const part = (value: number) => String(value).padStart(2, "0");
	const date = `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}`;
	const time = `${part(now.getHours())}-${part(now.getMinutes())}-${part(now.getSeconds())}`;
	return `${date}_${time}`;
};

const toExportItems = (imageSession: ImageSession): BatchExportItem[] =>
	imageSession.getImages().map((item) => ({
		id: item.id,
		inputFilename: item.file.name,
		status: item.status === "done" ? "done" : "error",
		result: item.result,
		analysis: item.analysis,
		attention: item.attention,
		error: item.error,
	}));

export const setupBatchController = ({
	els,
	processingState,
	imageSession,
}: BatchControllerOptions): void => {
	const handleDownloadAll = async (scale: number) => {
		const images = imageSession.getImages();
		if (images.length === 0) {
			showError(i18n.t("error.no_processed_images"));
			return;
		}

		const loadingText = els.loadingOverlay.querySelector(".loading-text");
		els.loadingOverlay.style.display = "flex";
		els.downloadAllButton.disabled = true;
		els.downloadAllDropdownButton.disabled = true;
		if (loadingText) {
			loadingText.textContent = i18n.t("status.processing_batch", {
				current: 0,
				total: images.length,
			});
		}

		try {
			for (let index = 0; index < images.length; index += 1) {
				imageSession.setImageStatus(images[index].id, "processing");
			}
			const colorCount = clampInt(
				Number(els.colorCountInput.value),
				PROCESS_RANGES.colorCount,
			);
			const batchResult = await processor.processBatch(
				images.map((item) => ({
					id: item.id,
					image: item.original,
					options: createProcessOptions(els, processingState, item.original),
				})),
				{
					sharedPalette: els.sharedPaletteToggle.checked,
					colorCount,
					ditherMode: els.ditherModeSelect.value as DitherMode,
					ditherStrength: clampInt(
						Number(els.ditherStrengthInput.value),
						PROCESS_RANGES.ditherStrength,
					),
				},
			);

			for (let index = 0; index < batchResult.items.length; index += 1) {
				const item = batchResult.items[index];
				if (item.status === "done") {
					imageSession.updateImageResult(item.id, item.processResult);
				} else {
					imageSession.setImageStatus(item.id, "error", item.error);
				}
			}
			const activeId = imageSession.getActiveImage()?.id;
			if (activeId) imageSession.setActiveImage(activeId);
			if (loadingText) {
				loadingText.textContent = i18n.t("status.processing_batch", {
					current: images.length,
					total: images.length,
				});
			}

			const exportItems = toExportItems(imageSession);
			const entries = createBatchArchiveEntries(exportItems, scale);
			if (entries.length === 0)
				throw new Error("No successfully processed images.");
			const zip = new JSZip();
			for (let index = 0; index < entries.length; index += 1) {
				const entry = entries[index];
				const canvas = document.createElement("canvas");
				drawRawImageToCanvas(
					scale === 1 ? entry.result : upscaleNearest(entry.result, scale),
					canvas,
				);
				const blob = await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, "image/png"),
				);
				if (!blob) throw new Error(`PNG export failed: ${entry.inputFilename}`);
				zip.file(entry.outputFilename, blob);
				imageSession.setOutputFilename(entry.id, entry.outputFilename);
			}
			if (els.includeDiagnosticsToggle.checked) {
				zip.file(
					"diagnostics.json",
					serializeBatchDiagnostics(
						exportItems,
						entries,
						batchResult.sharedPalette,
					),
				);
			}
			const content = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(content);
			const link = document.createElement("a");
			link.href = url;
			const suffix = scale === 1 ? "" : `_x${scale}`;
			link.download = `refined_batch${suffix}_${timestamp()}.zip`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);

			const failures = exportItems.filter((item) => item.status === "error");
			if (failures.length > 0) {
				showWarning(
					i18n.t("warning.batch_partial_failure", {
						failed: failures.length,
						total: exportItems.length,
					}),
				);
			}
		} catch (error) {
			console.error(error);
			showError(
				`${i18n.t("error.download_failed")}: ${(error as Error).message}`,
			);
		} finally {
			els.loadingOverlay.style.display = "none";
			els.downloadAllButton.disabled = false;
			els.downloadAllDropdownButton.disabled = false;
			if (loadingText) loadingText.textContent = i18n.t("status.processing");
		}
	};

	els.downloadAllButton.addEventListener("click", () => handleDownloadAll(1));
	els.downloadAllDropdownButton.addEventListener("click", (event) => {
		event.stopPropagation();
		els.downloadAllMenu.classList.toggle("show");
	});
	els.downloadAllMenu.addEventListener("click", (event) => {
		const button = (event.target as HTMLElement).closest("button");
		if (!button) return;
		const scale = Number(button.dataset.scale);
		if (scale) handleDownloadAll(scale);
		els.downloadAllMenu.classList.remove("show");
	});
};
