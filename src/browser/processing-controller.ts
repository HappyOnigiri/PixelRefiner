import { evaluateCandidateModalDecision } from "../core/candidate-modal-decision";
import type { CandidateSelection } from "../shared/types";
import { sortPalette } from "../utils/palette";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import type { CandidateChooser } from "./candidate-chooser";
import type { ImageComparer } from "./compare";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { createLatestProcessingState } from "./latest-processing-state";
import { showError } from "./notifications";
import { formatProcessingAnalysis } from "./processing-analysis-display";
import { translateProcessingWarnings } from "./processing-warnings";
import {
	createCancellableProcessor,
	isProcessingCancelledError,
} from "./processor-worker";
import { updateQuickSettingsDisabledStates } from "./quick-settings-controls";
import type { ResultViewer } from "./result-viewer";
import type { ImageSession } from "./session";
import { createProcessOptions } from "./settings-options";

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
	candidateChooser: CandidateChooser;
};

export type RunProcessingOptions = {
	showCandidates?: boolean;
	/**
	 * 処理の終わりに読み込みオーバーレイを閉じない。
	 * 複数画像を続けて変換する呼び出し側が、1 枚ごとの閉じ直しによる点滅を避けるために使う。
	 */
	keepLoadingOverlay?: boolean;
	/**
	 * 失敗をその場で通知しない。
	 * 複数画像を続けて変換する呼び出し側が、一巡の完了時にまとめて通知するために使う。
	 */
	suppressErrorNotification?: boolean;
};

export type ProcessingController = {
	runProcessing: (options?: RunProcessingOptions) => Promise<void>;
	setAutoProcessScheduled: (scheduled: boolean) => void;
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
	candidateChooser,
}: ProcessingControllerOptions): ProcessingController => {
	const compareBeforeCanvas = document.createElement("canvas");
	const compareAfterCanvas = document.createElement("canvas");
	const compareBeforeSanitizedCanvas = document.createElement("canvas");
	const processor = createCancellableProcessor();
	const latestProcessing = createLatestProcessingState();
	let latestImageId: string | undefined;

	const hideLoading = () => {
		mainResultViewer.setLoading(false);
		els.loadingOverlay.style.display = "none";
		els.outputPanel.classList.remove("is-processing");
		els.outputPanel.removeAttribute("aria-busy");
		els.processButton.disabled = false;
	};

	const runProcessing = async (
		selection?: CandidateSelection,
		options: RunProcessingOptions = {},
	) => {
		const showCandidates = options.showCandidates !== false;
		const images = imageSession.getImages();
		if (images.length === 0) return;
		const generation = latestProcessing.begin();
		// [Intended] 最新設定の結果を優先し、実行中の同期 Worker 処理と待機中の要求を破棄する。
		processor.cancelActive();
		if (!selection) candidateChooser.dismiss();

		// [Intended] 設定変更前の警告を処理中の設定へ引き継がない。
		// 新しい結果にも警告があれば、処理完了後に改めて表示する。
		mainResultViewer.updateWarnings([]);
		modalResultViewer.updateWarnings([]);
		mainResultViewer.setLoading(true);

		// UI を無効化
		els.processButton.disabled = true;
		els.loadingOverlay.style.display = "flex";
		els.outputPanel.classList.add("is-processing");
		els.outputPanel.setAttribute("aria-busy", "true");

		// 現在アクティブな画像のみを処理する設計
		// （一括処理には別実装が必要だが、現在は切替時に自動処理する）
		const currentItem = imageSession.getActiveImage();
		if (!currentItem) {
			latestImageId = undefined;
			if (latestProcessing.finish(generation, false) === "hide-loading") {
				hideLoading();
			}
			return;
		}
		latestImageId = currentItem.id;

		const currentImage = currentItem.original;
		// 明示的な選択がなければ、この画像に対して以前選ばれた候補を引き継ぐ。
		const effectiveSelection = selection ?? currentItem.candidateSelection;
		if (selection) {
			imageSession.setCandidateSelection(currentItem.id, selection);
		}
		const processingToken = imageSession.beginProcessing(currentItem.id);

		// [Intended] 結果を書き込んだ後に中断された場合は、done の画像を pending へ戻さない。
		// 戻すと一覧が未変換のまま表示され、保留キューが同じ設定で変換をやり直す。
		let resultApplied = false;

		try {
			const processOptions = createProcessOptions(els, processingState);

			const {
				result,
				grid,
				extractedPalette,
				compareBefore,
				compareBeforeSanitized,
				analysis,
			} = effectiveSelection
				? await processor.processCandidate(
						currentImage,
						processOptions,
						effectiveSelection,
					)
				: await processor.process(currentImage, processOptions);
			// [Intended] キャンセル直前に完了通知が届いた旧処理も、結果や画像状態を上書きさせない。
			// 一括処理など別経路がこの画像を処理し直していた場合は、状態もその経路に委ねる。
			const superseded = !imageSession.isProcessingCurrent(
				currentItem.id,
				processingToken,
			);
			if (superseded || !latestProcessing.isLatest(generation)) {
				if (!superseded && currentItem.id !== latestImageId) {
					imageSession.setImageStatus(currentItem.id, "pending");
				}
				return;
			}

			// 転送したデータは呼び出し元スレッドで利用できなくなる可能性がある（Comlink の挙動に依存し、
			// RawImage を再利用しない設計のため、ここで再代入する）
			// ただし、Comlink は既定で構造化クローンを使用するため、
			// 明示的に transfer を使わない限り currentImage は維持される。
			// 簡潔にするためコピーとして保持する。
			const resultImage = result;
			// currentResult = resultImage; // 直接使用しなくなった
			imageSession.updateImageResult(
				currentItem.id,
				{
					result,
					grid,
					extractedPalette,
					compareBefore,
					compareBeforeSanitized,
					analysis,
				},
				processingState.settingsMode,
			);
			resultApplied = true;

			// [Intended] 待機中に表示対象が切り替わっていたら、結果の保存だけで表示は更新しない。
			// 複数画像をまとめて変換する際に、古い画像の結果が現在の表示を上書きしないようにする。
			if (imageSession.getActiveImage()?.id !== currentItem.id) return;
			// [Intended] 経路はかんたん設定で処理したときだけ無効状態の根拠になる。
			// 他タブの設定で決まった経路を持ち込むと、かんたん設定の細かさが理由なく編集不可になる。
			updateQuickSettingsDisabledStates(
				els,
				processingState.settingsMode === "quick" ? analysis.route : undefined,
			);

			mainResultViewer.updateImage(resultImage);
			modalResultViewer.updateImage(resultImage);
			const analysisText = formatProcessingAnalysis(analysis, (key, params) =>
				i18n.t(key as Parameters<typeof i18n.t>[0], params),
			);
			mainResultViewer.updateAnalysis(analysisText);
			modalResultViewer.updateAnalysis(analysisText);
			const warningMessages = translateProcessingWarnings(analysis.warnings);
			mainResultViewer.updateWarnings(warningMessages);
			modalResultViewer.updateWarnings(warningMessages);

			// オーバーレイが過密にならないよう、大きな結果ではグリッドをオフにする。
			if (resultImage.width > 256 || resultImage.height > 256) {
				if (els.gridOutputCheck.checked) {
					els.gridOutputCheck.checked = false;
					mainResultViewer.setGrid(false);
					modalResultViewer.setGrid(false);
				}
			}

			// 見やすくするためパレットをソート
			const sortedPalette = sortPalette(extractedPalette);
			processingState.currentExtractedPalette = sortedPalette;

			updatePaletteDisplay();
			els.downloadButton.style.display = "flex";
			els.downloadDropdownButton.style.display = "flex";

			// ダウンロードメニューのサイズ表示を更新
			els.downloadMenu.querySelectorAll("button").forEach((btn) => {
				const scale = Number(btn.dataset.scale);
				if (scale && scale > 1) {
					btn.textContent = `x${scale} (${resultImage.width * scale}x${resultImage.height * scale})`;
				}
			});

			// 比較スライダーを更新（リサイズ済みの元画像と処理済み画像の両方を生成）
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

			// モーダルが開いている場合は直ちに反映する（サイズ同期を含む）
			if (els.compareModal.style.display !== "none") {
				requestAnimationFrame(() => {
					comparer.syncImageSize();
				});
			}

			// 処理結果の更新時にグリッドを再描画
			// DOM 更新（キャンバス表示サイズの決定）を待つため少し遅延させる
			requestAnimationFrame(() => {
				updateGrid();
			});
			els.outputPanel.classList.add("has-image");
			const candidateModalInput = {
				isAuto: processOptions.processingMode === "auto",
				isInitial: !effectiveSelection,
				showCandidates,
				hasCandidateSelection: effectiveSelection !== undefined,
				warningCodes: analysis.warnings,
			};
			const candidateModalPrecheck =
				evaluateCandidateModalDecision(candidateModalInput);
			if (candidateModalPrecheck.candidateModalEligible) {
				try {
					const cacheKey = `${currentItem.id}:${JSON.stringify(processOptions)}`;
					const previews = await processor.previewCandidates(
						currentImage,
						processOptions,
						analysis,
						cacheKey,
					);
					// 待機中に別の処理が始まった、または表示対象が切り替わった場合は表示しない。
					const stillCurrent =
						latestProcessing.isLatest(generation) &&
						imageSession.getActiveImage()?.id === currentItem.id;
					const candidateModalAfterPreview = evaluateCandidateModalDecision({
						...candidateModalInput,
						candidatePreviewCount: stillCurrent ? previews.length : 0,
					});
					if (
						candidateModalAfterPreview.warningPresentation === "candidate-modal"
					) {
						candidateChooser.show(previews, analysis.warnings, currentItem.id);
					}
				} catch (error) {
					if (isProcessingCancelledError(error)) throw error;
					// [Intended] 候補UIの失敗は、すでに得られた安全な処理結果を無効にしない。
					console.error("Failed to create candidate previews:", error);
				}
			}
			// els.outputSize.textContent = `${resultImage.width}x${resultImage.height} px`; // ResultViewer で処理する

			// 背景除去方法がコーナーベースの場合は、抽出した色を UI に反映
			updateBgColorFromMethod();
		} catch (err) {
			if (
				isProcessingCancelledError(err) ||
				!latestProcessing.isLatest(generation)
			) {
				if (
					!resultApplied &&
					currentItem.id !== latestImageId &&
					imageSession.isProcessingCurrent(currentItem.id, processingToken)
				) {
					imageSession.setImageStatus(currentItem.id, "pending");
				}
				return;
			}
			const msg = `${i18n.t("error.process_failed")}: ${(err as Error).message}`;
			// [Intended] トーストは重ねて表示できないため、呼び出し側がまとめて通知する場合は出さない。
			// 原因は画像一覧の状態として残るので、ここで失われるわけではない。
			if (!options.suppressErrorNotification) showError(msg);
			if (imageSession.isProcessingCurrent(currentItem.id, processingToken)) {
				imageSession.setImageStatus(currentItem.id, "error", msg);
			}
		} finally {
			const finishDecision = latestProcessing.finish(
				generation,
				options.keepLoadingOverlay === true,
			);
			if (finishDecision === "hide-loading") hideLoading();
			if (finishDecision === "keep-loading" && options.keepLoadingOverlay) {
				els.outputPanel.classList.remove("is-processing");
				els.outputPanel.removeAttribute("aria-busy");
				els.processButton.disabled = false;
			}
		}
	};

	candidateChooser.setCallbacks({
		onSelect: async (selection, sourceImageId) => {
			// 候補は生成元の画像に対する提案なので、表示後に切り替わっていたら適用しない。
			if (imageSession.getActiveImage()?.id !== sourceImageId) return;
			await runProcessing(selection);
		},
	});
	return {
		runProcessing: (options?: RunProcessingOptions) =>
			runProcessing(undefined, options),
		setAutoProcessScheduled: (scheduled: boolean) => {
			if (latestProcessing.setAutoProcessScheduled(scheduled)) hideLoading();
		},
	};
};
