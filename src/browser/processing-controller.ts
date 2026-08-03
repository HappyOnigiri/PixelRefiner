import { wrap } from "comlink";
import type { ProcessOptions } from "../core/processor";
import type { ProcessorWorker } from "../core/worker";
import { clampInt, clampNumber, PROCESS_RANGES } from "../shared/config";
import type {
	CandidateSelection,
	DitherMode,
	OutlineStyle,
	ProcessingMode,
} from "../shared/types";
import { sortPalette } from "../utils/palette";
import type { Elements } from "./app-elements";
import type { ProcessingState } from "./app-state";
import type { CandidateChooser } from "./candidate-chooser";
import type { ImageComparer } from "./compare";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { showError, showWarning } from "./notifications";
import {
	shouldNotifyProcessingWarnings,
	translateProcessingWarnings,
} from "./processing-warnings";
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
	candidateChooser: CandidateChooser;
	processingMode: ProcessingMode;
};

export type RunProcessingOptions = {
	showCandidates?: boolean;
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
	processingMode,
}: ProcessingControllerOptions): ((
	options?: RunProcessingOptions,
) => Promise<void>) => {
	const compareBeforeCanvas = document.createElement("canvas");
	const compareAfterCanvas = document.createElement("canvas");
	const compareBeforeSanitizedCanvas = document.createElement("canvas");
	// [Intended] 候補プレビューの生成は await を挟むため、完了時に自分が最新の処理か判定する。
	// これがないと、遅れて返った旧画像・旧設定の候補が現在の状態のものとして表示される。
	let latestGeneration = 0;

	const runProcessing = async (
		selection?: CandidateSelection,
		showCandidates = true,
	) => {
		const images = imageSession.getImages();
		if (images.length === 0) return;
		const generation = ++latestGeneration;
		if (!selection) candidateChooser.dismiss();

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
			// クリーンアップして完了
			els.loadingOverlay.style.display = "none";
			els.outputPanel.classList.remove("is-processing");
			els.outputPanel.removeAttribute("aria-busy");
			els.processButton.disabled = false;
			return;
		}

		const currentImage = currentItem.original;
		// 明示的な選択がなければ、この画像に対して以前選ばれた候補を引き継ぐ。
		const effectiveSelection = selection ?? currentItem.candidateSelection;
		if (selection) {
			imageSession.setCandidateSelection(currentItem.id, selection);
		}
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

			const processOptions: ProcessOptions = {
				processingMode,
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
			};

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

			// 転送したデータは呼び出し元スレッドで利用できなくなる可能性がある（Comlink の挙動に依存し、
			// RawImage を再利用しない設計のため、ここで再代入する）
			// ただし、Comlink は既定で構造化クローンを使用するため、
			// 明示的に transfer を使わない限り currentImage は維持される。
			// 簡潔にするためコピーとして保持する。
			const resultImage = result;
			// currentResult = resultImage; // 直接使用しなくなった
			imageSession.updateImageResult(currentItem.id, resultImage, grid);

			mainResultViewer.updateImage(resultImage);
			modalResultViewer.updateImage(resultImage);
			mainResultViewer.setLoading(false);

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
			let candidateModalShown = false;
			if (
				showCandidates &&
				!effectiveSelection &&
				analysis.warnings.includes("LOW_GRID_CONFIDENCE")
			) {
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
						generation === latestGeneration &&
						imageSession.getActiveImage()?.id === currentItem.id;
					if (stillCurrent && previews.length > 0) {
						candidateChooser.show(previews, analysis.warnings, currentItem.id);
						candidateModalShown = true;
					}
				} catch (error) {
					// [Intended] 候補UIの失敗は、すでに得られた安全な処理結果を無効にしない。
					console.error("Failed to create candidate previews:", error);
				}
			}
			if (
				shouldNotifyProcessingWarnings(analysis.warnings, candidateModalShown)
			) {
				showWarning(translateProcessingWarnings(analysis.warnings).join("\n"));
			}
			// els.outputSize.textContent = `${resultImage.width}x${resultImage.height} px`; // ResultViewer で処理する

			// 背景除去方法がコーナーベースの場合は、抽出した色を UI に反映
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

	candidateChooser.setCallbacks({
		onSelect: async (selection, sourceImageId) => {
			// 候補は生成元の画像に対する提案なので、表示後に切り替わっていたら適用しない。
			if (imageSession.getActiveImage()?.id !== sourceImageId) return;
			await runProcessing(selection);
		},
	});
	return (options?: RunProcessingOptions) =>
		runProcessing(undefined, options?.showCandidates !== false);
};
