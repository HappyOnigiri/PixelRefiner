import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import type { ImageComparer } from "./compare";
import { applyCompareImages } from "./compare-view";
import { readDisplaySettings } from "./display-settings";
import type { ModalController } from "./modal-controller";

type CompareControlsOptions = {
	els: Elements;
	processingState: ProcessingState;
	comparer: ImageComparer;
	compareModalController: ModalController;
	/** 比較用画像を用意して比較スライダーへ反映する。 */
	refreshCompare: () => Promise<void>;
};

export const setupCompareControls = ({
	els,
	processingState,
	comparer,
	compareModalController,
	refreshCompare,
}: CompareControlsOptions): { openCompareModal: () => void } => {
	const openCompareModal = () => {
		compareModalController.open();

		// 保存済みの表示設定から背景色を同期する。
		try {
			const settings = readDisplaySettings();
			if (settings) {
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

		// モーダルを開いた直後にサイズを同期する必要がある
		requestAnimationFrame(() => {
			// 比較モーダルでは常にグリッドを OFF にする（描画対象はないが状態を一貫させる）
			// （比較モーダルでは grid-canvas を使用しないため、現時点では何もしない。）
			// [Intended] 比較用画像はここで用意する。用意済みならそのまま反映される。
			void refreshCompare();
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
		applyCompareImages(processingState, comparer);
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
