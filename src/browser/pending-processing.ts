import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import { createBatchItemOptions } from "./batch-options";
import { i18n } from "./i18n";
import { createLoadingOverlay } from "./loading-overlay";
import { showWarning } from "./notifications";
import { createPendingImageQueue } from "./pending-queue";
import type { RunProcessingOptions } from "./processing-controller";
import { processor } from "./processor-worker";
import type { ImageSession } from "./session";
import { createProcessOptions } from "./settings-options";

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
	const loadingOverlay = createLoadingOverlay(els);

	// 一覧のうち何枚目を処理しているかを進捗として示す
	const showProgress = () => {
		const images = imageSession.getImages();
		let finished = 0;
		for (let index = 0; index < images.length; index += 1) {
			const status = images[index].status;
			if (status === "done" || status === "error") finished += 1;
		}
		loadingOverlay.showProgress(
			Math.min(finished + 1, images.length),
			images.length,
		);
	};

	const processInactiveImage = async (id: string) => {
		const item = imageSession.getImages().find((image) => image.id === id);
		if (!item) return;
		const processingToken = imageSession.beginProcessing(id);
		showProgress();
		try {
			// [Intended] 候補プレビューで確定済みの方針は、一括変換でも画像ごとに引き継ぐ。
			const options = createBatchItemOptions(
				createProcessOptions(els, processingState),
				item.candidateSelection,
			);
			const processResult = await processor.process(item.original, options);
			// [Intended] 待機中にこの画像が個別処理などで変換し直されていたら、古い結果で上書きしない。
			if (!imageSession.isProcessingCurrent(id, processingToken)) return;
			imageSession.updateImageResult(
				id,
				processResult,
				processingState.settingsMode,
			);
			// [Intended] 変換の待機中にこの画像がアクティブになっていた場合は、結果を表示へ反映する。
			if (imageSession.getActiveImage()?.id === id) {
				imageSession.setActiveImage(id);
			}
		} catch (error) {
			// [Intended] 失敗した画像は一覧でエラーとして示し、残りの画像の変換は続ける。
			// 通知は一巡の完了時にまとめる（トーストは重ねて表示できない）。
			if (!imageSession.isProcessingCurrent(id, processingToken)) return;
			const message = `${i18n.t("error.process_failed")}: ${(error as Error).message}`;
			imageSession.setImageStatus(id, "error", message);
		}
		// [Intended] 進捗表示は 1 枚ごとに閉じない。閉じると次の画像で開き直して点滅する。
		// 一巡の終了時に onDrained でまとめて閉じる。
	};

	return createPendingImageQueue({
		getImages: () => imageSession.getImages(),
		getActiveImageId: () => imageSession.getActiveImage()?.id ?? null,
		processActiveImage: async () => {
			// [Intended] アクティブな画像も進捗に含める。通常経路は進捗を更新しないため、
			// ここで更新しないと 1 つ前の枚数が表示されたままになる。
			showProgress();
			// [Intended] 続けて次の画像を変換するため、1 枚ごとにオーバーレイを閉じさせない。
			// 失敗の通知も一巡の完了時にまとめるため、その場では出させない。
			await runProcessing({
				keepLoadingOverlay: true,
				suppressErrorNotification: true,
			});
		},
		processInactiveImage,
		onDrained: (attemptedIds) => {
			loadingOverlay.hide();
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
