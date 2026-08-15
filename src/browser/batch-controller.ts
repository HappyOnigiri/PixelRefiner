import JSZip from "jszip";
import { upscaleNearest } from "../core/ops";
import { clampInt, PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import type { DitherMode } from "../shared/types";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import {
	createBatchArchiveEntries,
	createBatchExportItems,
	encodeBatchEntries,
	serializeBatchDiagnostics,
} from "./batch-export";
import { createBatchItemOptions } from "./batch-options";
import { failBatchProcessing } from "./batch-state";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { createLoadingOverlay } from "./loading-overlay";
import { showError, showWarning } from "./notifications";
import { processor } from "./processor-worker";
import type { ImageSession } from "./session";
import { createProcessOptions } from "./settings-options";

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

export const setupBatchController = ({
	els,
	processingState,
	imageSession,
}: BatchControllerOptions): void => {
	const loadingOverlay = createLoadingOverlay(els);
	els.batchColorCountInput.min = String(PROCESS_RANGES.colorCount.min);
	els.batchColorCountInput.max = String(PROCESS_RANGES.colorCount.max);
	els.batchColorCountInput.value = String(PROCESS_DEFAULTS.colorCount);
	els.batchDitherModeSelect.value = PROCESS_DEFAULTS.ditherMode;
	els.batchDitherStrengthInput.min = String(PROCESS_RANGES.ditherStrength.min);
	els.batchDitherStrengthInput.max = String(PROCESS_RANGES.ditherStrength.max);
	els.batchDitherStrengthInput.value = String(PROCESS_DEFAULTS.ditherStrength);

	const updateSharedPaletteSettings = (): void => {
		const enabled = els.sharedPaletteToggle.checked;
		els.sharedPaletteSettings.classList.toggle("disabled", !enabled);
		for (const control of [
			els.batchColorCountInput,
			els.batchDitherModeSelect,
			els.batchDitherStrengthInput,
		]) {
			control.disabled = !enabled;
		}
		els.batchDitherStrengthInput
			.closest(".setting-item")
			?.classList.toggle(
				"disabled",
				!enabled || els.batchDitherModeSelect.value === "none",
			);
		els.batchDitherStrengthInput.disabled =
			!enabled || els.batchDitherModeSelect.value === "none";
	};
	els.sharedPaletteToggle.addEventListener(
		"change",
		updateSharedPaletteSettings,
	);
	els.batchDitherModeSelect.addEventListener(
		"change",
		updateSharedPaletteSettings,
	);
	updateSharedPaletteSettings();

	const handleDownloadAll = async (scale: number) => {
		const images = imageSession.getImages();
		const startedImageIds = images.map((image) => image.id);
		let processingCompleted = false;
		if (images.length === 0) {
			showError(i18n.t("error.no_processed_images"));
			return;
		}

		els.downloadAllButton.disabled = true;
		els.downloadAllDropdownButton.disabled = true;
		loadingOverlay.showProgress(0, images.length);

		try {
			const processingTokens = new Map<string, number>();
			for (let index = 0; index < images.length; index += 1) {
				const id = images[index].id;
				processingTokens.set(id, imageSession.beginProcessing(id));
			}
			const colorCount = clampInt(
				Number(els.batchColorCountInput.value),
				PROCESS_RANGES.colorCount,
			);
			const batchResult = await processor.processBatch(
				images.map((item) => ({
					id: item.id,
					image: item.original,
					options: createBatchItemOptions(
						createProcessOptions(els, processingState),
						item.candidateSelection,
					),
				})),
				{
					sharedPalette: els.sharedPaletteToggle.checked,
					colorCount,
					ditherMode: els.batchDitherModeSelect.value as DitherMode,
					ditherStrength: clampInt(
						Number(els.batchDitherStrengthInput.value),
						PROCESS_RANGES.ditherStrength,
					),
				},
			);

			for (let index = 0; index < batchResult.items.length; index += 1) {
				const item = batchResult.items[index];
				// [Intended] 一括変換の待機中に同じ画像を個別処理していたら、古い結果で上書きしない。
				const token = processingTokens.get(item.id);
				if (
					token === undefined ||
					!imageSession.isProcessingCurrent(item.id, token)
				) {
					continue;
				}
				if (item.status === "done") {
					imageSession.updateImageResult(
						item.id,
						item.processResult,
						processingState.settingsMode,
					);
				} else {
					imageSession.setImageStatus(item.id, "error", item.error);
				}
			}
			processingCompleted = true;
			const activeId = imageSession.getActiveImage()?.id;
			if (activeId) imageSession.setActiveImage(activeId);
			loadingOverlay.showProgress(images.length, images.length);

			// [Intended] 処理開始後に追加・個別処理された画像を混ぜず、
			// 開始時の入力と今回の Worker 結果だけで ZIP を構成する。
			const exportItems = createBatchExportItems(
				images.map((image) => ({
					id: image.id,
					inputFilename: image.file.name,
				})),
				batchResult.items,
			);
			const entries = createBatchArchiveEntries(exportItems, scale);
			if (entries.length === 0)
				throw new Error("No successfully processed images.");
			const zip = new JSZip();
			const encoded = await encodeBatchEntries(entries, async (entry) => {
				const canvas = document.createElement("canvas");
				drawRawImageToCanvas(
					scale === 1 ? entry.result : upscaleNearest(entry.result, scale),
					canvas,
				);
				return new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, "image/png"),
				);
			});
			for (let index = 0; index < encoded.encoded.length; index += 1) {
				const { entry, blob } = encoded.encoded[index];
				zip.file(entry.outputFilename, blob);
				imageSession.setOutputFilename(entry.id, entry.outputFilename);
			}
			for (let index = 0; index < encoded.failed.length; index += 1) {
				const failure = encoded.failed[index];
				const item = exportItems.find(({ id }) => id === failure.entry.id);
				if (item) {
					item.status = "error";
					item.error = failure.error;
				}
				imageSession.setImageStatus(failure.entry.id, "error", failure.error);
			}
			if (encoded.encoded.length === 0)
				throw new Error("No successfully exported images.");
			const exportedEntries = encoded.encoded.map(({ entry }) => entry);
			if (els.includeDiagnosticsToggle.checked) {
				zip.file(
					"diagnostics.json",
					serializeBatchDiagnostics(
						exportItems,
						exportedEntries,
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
			const message = processingCompleted
				? error instanceof Error
					? error.message
					: String(error)
				: failBatchProcessing(imageSession, startedImageIds, error);
			showError(`${i18n.t("error.download_failed")}: ${message}`);
		} finally {
			loadingOverlay.hide();
			els.downloadAllButton.disabled = false;
			els.downloadAllDropdownButton.disabled = false;
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
