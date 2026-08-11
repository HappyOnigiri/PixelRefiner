import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import { createBatchItemOptions } from "./batch-options";
import { i18n } from "./i18n";
import { showWarning } from "./notifications";
import { createPendingImageQueue } from "./pending-queue";
import type { RunProcessingOptions } from "./processing-controller";
import { createProcessOptions, processor } from "./processing-controller";
import type { ImageSession } from "./session";

type PendingProcessingOptions = {
	els: Elements;
	processingState: ProcessingState;
	imageSession: ImageSession;
	runProcessing: (options?: RunProcessingOptions) => Promise<void>;
};

/**
 * 未変換の画像をまとめて変換する処理を作る。
 * アクティブな画像は通常の処理経路（表示更新と候補提示つき）で、
 * それ以外は表示を切り替えずに 1 枚ずつ順番に変換する。
 */
export const createProcessPendingImages = ({
	els,
	processingState,
	imageSession,
	runProcessing,
}: PendingProcessingOptions): (() => Promise<void>) => {
	const setLoadingText = (text: string) => {
		const loadingText = els.loadingOverlay.querySelector(".loading-text");
		if (loadingText) loadingText.textContent = text;
	};

	// 一覧のうち何枚目を処理しているかを進捗として示す
	const showInactiveProgress = () => {
		const images = imageSession.getImages();
		let finished = 0;
		for (let index = 0; index < images.length; index += 1) {
			const status = images[index].status;
			if (status === "done" || status === "error") finished += 1;
		}
		els.loadingOverlay.style.display = "flex";
		setLoadingText(
			i18n.t("status.processing_batch", {
				current: Math.min(finished + 1, images.length),
				total: images.length,
			}),
		);
	};

	const processInactiveImage = async (id: string) => {
		const item = imageSession.getImages().find((image) => image.id === id);
		if (!item) return;
		imageSession.setImageStatus(id, "processing");
		showInactiveProgress();
		try {
			// [Intended] 候補プレビューで確定済みの方針は、一括変換でも画像ごとに引き継ぐ。
			const options = createBatchItemOptions(
				createProcessOptions(els, processingState),
				item.candidateSelection,
			);
			const processResult = await processor.process(item.original, options);
			imageSession.updateImageResult(id, processResult);
			// [Intended] 変換の待機中にこの画像がアクティブになっていた場合は、結果を表示へ反映する。
			if (imageSession.getActiveImage()?.id === id) {
				imageSession.setActiveImage(id);
			}
		} catch (error) {
			// [Intended] 失敗した画像は一覧でエラーとして示し、残りの画像の変換は続ける。
			// 通知は一巡の完了時にまとめる（トーストは重ねて表示できない）。
			const message = `${i18n.t("error.process_failed")}: ${(error as Error).message}`;
			imageSession.setImageStatus(id, "error", message);
		}
		// [Intended] 進捗表示は 1 枚ごとに閉じない。閉じると次の画像で開き直して点滅する。
		// 一巡の終了時に onDrained でまとめて閉じる。
	};

	return createPendingImageQueue({
		getImages: () => imageSession.getImages(),
		getActiveImageId: () => imageSession.getActiveImage()?.id ?? null,
		processActiveImage: () => runProcessing(),
		processInactiveImage,
		onDrained: (attemptedIds) => {
			els.loadingOverlay.style.display = "none";
			setLoadingText(i18n.t("status.processing"));
			if (attemptedIds.length === 0) return;
			const images = imageSession.getImages();
			let failed = 0;
			for (let index = 0; index < attemptedIds.length; index += 1) {
				const image = images.find((item) => item.id === attemptedIds[index]);
				if (image?.status === "error") failed += 1;
			}
			if (failed === 0) return;
			showWarning(
				i18n.t("warning.pending_partial_failure", {
					failed,
					total: attemptedIds.length,
				}),
			);
		},
	});
};
