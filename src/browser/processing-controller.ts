import { evaluateCandidateSuggestion } from "../core/candidate-suggestion-decision";
import type { ProcessOptions } from "../core/processor";
import type {
	CandidatePreview,
	CandidateSelection,
	ProcessingRoute,
	RawImage,
} from "../shared/types";
import { sortPalette } from "../utils/palette";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import type { CandidateChooser } from "./candidate-chooser";
import type { ImageComparer } from "./compare";
import { applyCompareImages, setComparePreparing } from "./compare-view";
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
	updateAdvancedProcessingControls: (activeRoute?: ProcessingRoute) => void;
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
	/** 比較用画像を用意して比較スライダーへ反映する。用意済みならそのまま反映する。 */
	refreshCompare: () => Promise<void>;
};

/** 比較用画像を作り直すために必要な、いま表示している結果の出所。 */
type CompareSource = {
	image: RawImage;
	options: ProcessOptions;
	cacheKey: string;
	selection?: CandidateSelection;
	result: RawImage;
};

/**
 * 候補を選んでから読み込み表示を出すまでの待ち時間。
 * [Intended] 候補の結果はキャッシュに当たれば一瞬で返るので、その場合に読み込み表示が
 * 一瞬だけ現れて消えるちらつきを避ける。キャッシュを外したときは通常どおり表示される。
 */
const CANDIDATE_LOADING_DELAY_MS = 150;

export const createProcessingController = ({
	els,
	processingState,
	imageSession,
	mainResultViewer,
	modalResultViewer,
	comparer,
	updatePaletteDisplay,
	updateGrid,
	updateBgColorFromMethod,
	updateAdvancedProcessingControls,
	candidateChooser,
}: ProcessingControllerOptions): ProcessingController => {
	const compareBeforeCanvas = document.createElement("canvas");
	const compareAfterCanvas = document.createElement("canvas");
	const compareBeforeSanitizedCanvas = document.createElement("canvas");
	const processor = createCancellableProcessor();
	const latestProcessing = createLatestProcessingState();
	let latestImageId: string | undefined;
	let compareSource: CompareSource | undefined;
	/** 比較用画像を用意済みの結果。CompareSource と同じ鍵で持つ。 */
	let preparedCompareKey: string | undefined;

	const compareKey = (source: CompareSource): string =>
		`${source.cacheKey} ${source.selection?.id ?? ""}`;

	const showLoading = () => {
		mainResultViewer.setLoading(true);
		els.loadingOverlay.style.display = "flex";
		els.outputPanel.classList.add("is-processing");
		els.outputPanel.setAttribute("aria-busy", "true");
	};

	const hideLoading = () => {
		mainResultViewer.setLoading(false);
		els.loadingOverlay.style.display = "none";
		els.outputPanel.classList.remove("is-processing");
		els.outputPanel.removeAttribute("aria-busy");
		els.processButton.disabled = false;
	};

	/**
	 * 比較用画像を用意する。用意できたら true を返す。
	 * [Intended] 比較用の 2 枚は結果と一緒には受け取らない。原寸の compareBefore は
	 * 変換のたびに運んで PNG へ書き出すには大きすぎるので、比較を見るときだけ作る。
	 */
	const prepareCompareImages = async (): Promise<boolean> => {
		const source = compareSource;
		if (!source) return false;
		if (preparedCompareKey === compareKey(source)) return true;
		try {
			const { compareBefore, compareBeforeSanitized } =
				await processor.compareImages(
					source.image,
					source.options,
					source.selection,
					source.cacheKey,
				);
			// 待っている間に別の結果へ切り替わっていたら、その結果の比較として反映しない。
			if (compareSource !== source) return false;
			drawRawImageToCanvas(compareBefore, compareBeforeCanvas);
			drawRawImageToCanvas(
				compareBeforeSanitized,
				compareBeforeSanitizedCanvas,
			);
			drawRawImageToCanvas(source.result, compareAfterCanvas);
			processingState.compareBeforeOriginalUrl =
				compareBeforeCanvas.toDataURL("image/png");
			processingState.compareBeforeSanitizedUrl =
				compareBeforeSanitizedCanvas.toDataURL("image/png");
			processingState.compareAfterUrl =
				compareAfterCanvas.toDataURL("image/png");
			preparedCompareKey = compareKey(source);
			return true;
		} catch (error) {
			// [Intended] 変換の開始で中断された場合は、次に比較を開いたときに作り直せばよい。
			if (isProcessingCancelledError(error)) return false;
			console.error("Failed to prepare compare images:", error);
			showError(i18n.t("error.process_failed"));
			return false;
		}
	};

	const refreshCompare = async (): Promise<void> => {
		// まだ 1 枚も変換していない場合は、用意するものがないので準備中の表示も出さない。
		if (!compareSource) return;
		if (preparedCompareKey === compareKey(compareSource)) {
			applyCompareImages(processingState, comparer);
			comparer.syncImageSize();
			return;
		}
		setComparePreparing(els, true);
		try {
			if (!(await prepareCompareImages())) return;
			applyCompareImages(processingState, comparer);
			comparer.syncImageSize();
		} finally {
			setComparePreparing(els, false);
		}
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

		// UI を無効化
		els.processButton.disabled = true;
		// [Intended] 候補の選択だけは読み込み表示を遅らせる。生成済みの結果に当たれば
		// 待ち時間がないため、出しても一瞬で消えるちらつきになる。
		let loadingTimer: number | undefined;
		if (selection) {
			loadingTimer = window.setTimeout(showLoading, CANDIDATE_LOADING_DELAY_MS);
		} else {
			showLoading();
		}

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
			// [Intended] 候補プレビューと検出結果のキャッシュ鍵をここで揃える。処理と候補生成が
			// 同じ鍵を使うことで、候補側はグリッド検出をやり直さずに済む。
			const cacheKey = `${currentItem.id}:${JSON.stringify(processOptions)}`;

			const { result, grid, extractedPalette, analysis } = effectiveSelection
				? await processor.processCandidate(
						currentImage,
						processOptions,
						effectiveSelection,
						// [Intended] 候補プレビューと同じ鍵を渡す。プレビュー生成時にすでに
						// 通した処理の結果をそのまま受け取れるので、選び直しでも変換しない。
						cacheKey,
					)
				: await processor.process(currentImage, processOptions, cacheKey);
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
				{ result, grid, extractedPalette, analysis },
				processingState.settingsMode,
			);
			resultApplied = true;
			// [Intended] 比較用画像は結果と一緒には作らない。ここでは出所だけ覚えておき、
			// 比較モーダルを開いたときに用意する。
			compareSource = {
				image: currentImage,
				options: processOptions,
				cacheKey,
				selection: effectiveSelection,
				result,
			};
			// 用意済みの比較スライダーの内容は、この結果のものへ作り直すまで使わない。
			preparedCompareKey = undefined;
			processingState.compareBeforeOriginalUrl = "";
			processingState.compareBeforeSanitizedUrl = "";
			processingState.compareAfterUrl = "";

			// [Intended] 待機中に表示対象が切り替わっていたら、結果の保存だけで表示は更新しない。
			// 複数画像をまとめて変換する際に、古い画像の結果が現在の表示を上書きしないようにする。
			if (imageSession.getActiveImage()?.id !== currentItem.id) return;

			// [Intended] 候補プレビューは結果を画面へ反映する前に生成する。
			// 結果の表示更新が読み込みオーバーレイを閉じるため、後から生成すると
			// 変換が終わったように見えた後で候補リストだけが遅れて現れる。
			const candidateSuggestionInput = {
				isAuto: processOptions.processingMode === "auto",
				isInitial: !effectiveSelection,
				showCandidates,
				hasCandidateSelection: effectiveSelection !== undefined,
				warningCodes: analysis.warnings,
			};
			let candidatePreviews: CandidatePreview[] = [];
			if (
				evaluateCandidateSuggestion(candidateSuggestionInput)
					.candidateSuggestionEligible
			) {
				try {
					candidatePreviews = await processor.previewCandidates(
						currentImage,
						processOptions,
						analysis,
						cacheKey,
						// [Intended] Auto 結果の候補は、いま得た実結果をそのまま使う。
						// 候補生成のために同じ Auto をもう一度走らせない。
						{ result, colorCount: extractedPalette.length },
					);
				} catch (error) {
					if (isProcessingCancelledError(error)) throw error;
					// [Intended] 候補UIの失敗は、すでに得られた安全な処理結果を無効にしない。
					console.error("Failed to create candidate previews:", error);
				}
				// 生成待ちの間に別の処理が始まった、または表示対象が切り替わった場合は、
				// 結果の保存だけで表示は更新しない。
				if (
					!latestProcessing.isLatest(generation) ||
					imageSession.getActiveImage()?.id !== currentItem.id
				)
					return;
			}

			// [Intended] 経路はかんたん設定で処理したときだけ無効状態の根拠になる。
			// 他タブの設定で決まった経路を持ち込むと、かんたん設定の細かさが理由なく編集不可になる。
			updateQuickSettingsDisabledStates(
				els,
				processingState.settingsMode === "quick" ? analysis.route : undefined,
			);
			// [Intended] Convert 候補の選択を、詳細設定でも同じサイズ指定として表示する。
			if (
				processingState.settingsMode === "advanced" &&
				effectiveSelection?.processingMode === "convert"
			) {
				if (effectiveSelection.detailLevel) {
					els.advancedConvertSizeModeSelect.value =
						effectiveSelection.detailLevel;
				} else if (
					effectiveSelection.outW !== undefined &&
					effectiveSelection.outH !== undefined
				) {
					els.advancedConvertSizeModeSelect.value = "custom-both";
					els.advancedConvertWidthInput.value = String(effectiveSelection.outW);
					els.advancedConvertHeightInput.value = String(
						effectiveSelection.outH,
					);
				}
			}
			updateAdvancedProcessingControls(
				processingState.settingsMode === "advanced"
					? analysis.route
					: undefined,
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

			// 比較モーダルを開いたまま変換された場合は、その場で新しい結果の比較へ差し替える。
			if (els.compareModal.style.display !== "none") void refreshCompare();

			// 処理結果の更新時にグリッドを再描画
			// DOM 更新（キャンバス表示サイズの決定）を待つため少し遅延させる
			requestAnimationFrame(() => {
				updateGrid();
			});
			els.outputPanel.classList.add("has-image");
			// [Intended] 生成済みの候補は結果の表示直後に提示する。
			// 変換結果と候補リストが同じタイミングで現れるようにする。
			const candidateSuggestionAfterPreview = evaluateCandidateSuggestion({
				...candidateSuggestionInput,
				candidatePreviewCount: candidatePreviews.length,
			});
			if (
				candidateSuggestionAfterPreview.warningPresentation === "candidate-list"
			) {
				candidateChooser.show(
					candidatePreviews,
					analysis.warnings,
					currentItem.id,
					effectiveSelection?.id,
				);
			} else if (
				effectiveSelection &&
				candidateChooser.getSourceImageId() === currentItem.id
			) {
				// [Intended] 候補を選んだ後も一覧は残す。インライン表示では選び直せることに
				// 意味があるので、選択の反映は強調表示の更新だけで済ませる。
				candidateChooser.setSelected(effectiveSelection.id);
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
			if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
			const finishDecision = latestProcessing.finish(
				generation,
				options.keepLoadingOverlay === true,
			);
			if (finishDecision === "hide-loading") hideLoading();
			if (finishDecision === "keep-loading") {
				// [Intended] 結果の表示更新が同じオーバーレイを閉じるため、維持する場合は開き直す。
				// 開き直さないと、次の変換が始まるまで処理中表示が一度消えて点滅する。
				mainResultViewer.setLoading(true);
				els.loadingOverlay.style.display = "flex";
				if (options.keepLoadingOverlay) {
					els.outputPanel.classList.remove("is-processing");
					els.outputPanel.removeAttribute("aria-busy");
					els.processButton.disabled = false;
				}
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
		refreshCompare,
	};
};
