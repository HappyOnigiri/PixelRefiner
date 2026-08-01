import JSZip from "jszip";
import { upscaleNearest } from "../core/ops";
import type { Elements } from "./app-elements";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import type { ModalController } from "./modal-controller";
import { showError, showInfo } from "./notifications";
import type { ResultViewer } from "./result-viewer";
import type { ImageSession } from "./session";

type ResultActionsOptions = {
	els: Elements;
	imageSession: ImageSession;
	mainResultViewer: ResultViewer;
	modalResultViewer: ResultViewer;
	resultModalController: ModalController;
	runProcessing: () => Promise<void>;
	openCompareModal: () => void;
	closeResultModal: () => void;
	syncViewers: (
		source: ResultViewer,
		target: ResultViewer,
		bgType?: string,
		zoom?: boolean,
		grid?: boolean,
	) => void;
};

export const setupResultActions = ({
	els,
	imageSession,
	mainResultViewer,
	modalResultViewer,
	resultModalController,
	runProcessing,
	openCompareModal,
	closeResultModal,
	syncViewers,
}: ResultActionsOptions): void => {
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
};
