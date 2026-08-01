import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import type { ImageComparer } from "./compare";
import type { ModalController } from "./modal-controller";

type CompareControlsOptions = {
	els: Elements;
	processingState: ProcessingState;
	comparer: ImageComparer;
	compareModalController: ModalController;
	storageKey: string;
};

export const setupCompareControls = ({
	els,
	processingState,
	comparer,
	compareModalController,
	storageKey,
}: CompareControlsOptions): { openCompareModal: () => void } => {
	const openCompareModal = () => {
		compareModalController.open();

		// Sync background color (from mainResultViewer or saved settings)
		// Simply retrieve from localStorage
		try {
			const saved = localStorage.getItem(storageKey);
			if (saved) {
				const settings = JSON.parse(saved) as { bgType?: string };
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
				processingState.compareBeforeMode === "sanitized"
					? processingState.compareBeforeSanitizedUrl
					: processingState.compareBeforeOriginalUrl;
			if (before && processingState.compareAfterUrl) {
				comparer.updateImages(before, processingState.compareAfterUrl);
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
		processingState.compareBeforeMode = mode;
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
				? processingState.compareBeforeSanitizedUrl
				: processingState.compareBeforeOriginalUrl;
		if (before && processingState.compareAfterUrl) {
			comparer.updateImages(before, processingState.compareAfterUrl);
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
	return { openCompareModal };
};
