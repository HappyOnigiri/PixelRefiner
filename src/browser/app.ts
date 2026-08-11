import { PROCESS_DEFAULTS } from "../shared/config";
import type { ProcessingAnalysis } from "../shared/types";
import {
	extractColorsFromImage,
	generateGPL,
	generatePaletteImage,
	parseGPL,
} from "../utils/palette";
import { getElements } from "./app-elements";
import { createProcessingState } from "./app-state";
import { setupBatchController } from "./batch-controller";
import { renderBatchImageList } from "./batch-image-list";
import { CandidateChooser } from "./candidate-chooser";
import { ImageComparer } from "./compare";
import { setupCompareControls } from "./compare-controls";
import {
	readDisplaySettings,
	type SavedDisplaySettings,
	writeDisplaySettings,
} from "./display-settings";
import { i18n } from "./i18n";
import { drawRawImageToCanvas, imageToRawImage } from "./io";
import { createModalControllerFactory } from "./modal-controller";
import { showError } from "./notifications";
import { createProcessPendingImages } from "./pending-processing";
import { setupPresetControls } from "./preset-controls";
import { formatProcessingAnalysis } from "./processing-analysis-display";
import { createRunProcessing } from "./processing-controller";
import { setupResultActions } from "./result-actions";
import { ResultViewer } from "./result-viewer";
import { ImageSession } from "./session";
import { setupSettingsControls } from "./settings-controls";

export const initApp = (): void => {
	const els = getElements();
	els.sharedPaletteToggle.checked = PROCESS_DEFAULTS.sharedPalette;
	els.includeDiagnosticsToggle.checked =
		PROCESS_DEFAULTS.includeDiagnosticSummary;
	const createModalController = createModalControllerFactory(
		document.querySelector(".app"),
	);
	const comparer = new ImageComparer("compare-container");
	const mainResultViewer = new ResultViewer(els.outputPanel);
	const modalResultViewer = new ResultViewer(
		els.resultModal.querySelector(".result-modal-body") as HTMLElement,
	);
	const updateProcessingAnalysis = (analysis?: ProcessingAnalysis) => {
		const text = analysis
			? formatProcessingAnalysis(analysis, (key, params) =>
					i18n.t(key as Parameters<typeof i18n.t>[0], params),
				)
			: "";
		mainResultViewer.updateAnalysis(text);
		modalResultViewer.updateAnalysis(text);
	};
	const candidateChooser = new CandidateChooser(
		els.candidateModal,
		// 閉じるボタンのフォーカスは CandidateChooser 側で先頭カードへ移すため渡さない。
		createModalController(els.candidateModal, null),
	);

	const resultModalController = createModalController(
		els.resultModal,
		els.closeResultModal,
	);
	const compareModalController = createModalController(
		els.compareModal,
		els.closeCompareModal,
	);

	const presetModalController = createModalController(
		els.presetModal,
		els.closePresetModal,
	);

	// 同期ロジック
	const syncViewers = (
		_source: ResultViewer,
		target: ResultViewer,
		bgType?: string,
		zoom?: boolean,
		grid?: boolean,
	) => {
		if (bgType !== undefined) target.setBackground(bgType);
		if (zoom !== undefined) target.setZoom(zoom);
		if (grid !== undefined) target.setGrid(grid);
		saveSettings();
	};

	const imageSession = new ImageSession({
		onUpdate: () => {
			updateImageList();
			updateProcessButtonVisibility();
		},
		onActiveChange: (item) => {
			candidateChooser.dismiss();
			updateProcessingAnalysis(item?.analysis);
			if (item) {
				// 結果があれば復元し、なければ元画像を使用
				// const displayImage = item.result || item.original; // 未使用

				// ビューアーを更新
				drawRawImageToCanvas(item.original, els.originalCanvas);

				// 結果があれば表示し、なければ出力をクリアするか？
				if (item.result) {
					mainResultViewer.updateImage(item.result);
					modalResultViewer.updateImage(item.result);
					els.outputPanel.classList.add("has-image");
					// els.outputSize.textContent = `${item.result.width}x${item.result.height} px`; // ResultViewer で処理する
					els.downloadButton.style.display = "flex";
					els.downloadDropdownButton.style.display = "flex";

					// 必要に応じてグリッドを再適用
					setTimeout(() => {
						mainResultViewer.drawGrid();
						modalResultViewer.drawGrid();
					}, 0);
				} else {
					// 保留状態: 出力をクリアするか、プレースホルダーを表示するか？
					// 現在、キャンバスをクリアせずに「出力をクリア」するメソッドはアプリから容易に公開されていない。
					// 機能を隠すか、出力に元画像を表示するか？
					// 通常は直ちに処理を実行する。
					// 保留中の場合、runProcessing は自動処理または手動操作で実行される。
					// 現時点では、結果がなければ結果ビューをクリアする。

					// ただし通常、runProcessing は追加直後に呼び出される。
					// 保留中の画像（エラー時やクリア後など）へ戻る場合は、出力をクリアすべきかもしれない。
					// しかし ResultViewer には clear メソッドがない。
					// 更新しないこともできるが、前の画像が残ってしまう。
					// TODO: ResultViewer に clear メソッドを追加するか、既存の挙動に任せる。
					// 自動処理が ON、またはユーザーが処理をクリックする前提で、現時点ではこのままにする。

					els.outputPanel.classList.remove("has-image");
					// els.outputSize.textContent = "-"; // ResultViewer で処理する
					els.downloadButton.style.display = "none";
					els.downloadDropdownButton.style.display = "none";
					els.downloadMenu.classList.remove("show");
				}

				els.dropArea.classList.add("has-image");
				els.inputSize.textContent = `${item.original.width}x${item.original.height} px`;

				// 保留中かつ自動処理が ON なら処理を開始
				// [Intended] 未処理の画像はキュー経由でまとめて変換する。ここで直接処理すると
				// アクティブになった画像だけが変換され、残りが保留のまま取り残される。
				if (item.status === "pending" && els.autoProcessToggle.checked) {
					void processPendingImages();
				}

				// 方法が RGB の場合は背景抽出色を更新
				// （または画像から選ぶ場合は RGB 入力を更新）
			} else {
				// アクティブな画像がない
				els.dropArea.classList.remove("has-image");
				els.outputPanel.classList.remove("has-image");
				els.inputSize.textContent = "-";
				// els.outputSize.textContent = "-"; // ResultViewer で処理する
				const ctx = els.originalCanvas.getContext("2d");
				ctx?.clearRect(
					0,
					0,
					els.originalCanvas.width,
					els.originalCanvas.height,
				);
			}
			updateReduceColorsDisabledStates();
			updateBgDisabledStates();
		},
	});

	// 画像リスト UI の更新処理
	const updateImageList = () => {
		const images = imageSession.getImages();
		// 画像が 0 枚または 1 枚なら非表示（ユーザー要望）
		if (images.length <= 1) {
			els.imageListPanel.style.display = "none";
			return;
		}
		els.imageListPanel.style.display = "block";

		renderBatchImageList({
			container: els.imageListContainer,
			images,
			activeId: imageSession.getActiveImage()?.id,
			onSelect: (id) => imageSession.setActiveImage(id),
			onRemove: (id) => imageSession.removeImage(id),
		});
	};

	const processingState = createProcessingState();

	const saveSettings = () => {
		const settings: SavedDisplaySettings = {
			zoomOutput: els.zoomOutputCheck.checked,
			gridOutput: els.gridOutputCheck.checked,
			bgType: mainResultViewer.getBackgroundType(),
			autoProcess: els.autoProcessToggle.checked,
		};
		writeDisplaySettings(settings);
	};

	const loadSettings = () => {
		try {
			const settings = readDisplaySettings();
			if (!settings) return;
			if (settings.zoomOutput !== undefined)
				els.zoomOutputCheck.checked = settings.zoomOutput;
			if (settings.gridOutput !== undefined)
				els.gridOutputCheck.checked = settings.gridOutput;
			if (settings.autoProcess !== undefined)
				els.autoProcessToggle.checked = settings.autoProcess;

			// ボタンの表示状態を更新
			updateProcessButtonVisibility();

			if (settings.bgType !== undefined) {
				mainResultViewer.setBackground(settings.bgType);
				modalResultViewer.setBackground(settings.bgType);
			}
		} catch (e) {
			console.error("Failed to restore settings:", e);
		}
	};

	const runProcessing = createRunProcessing({
		els,
		processingState,
		imageSession,
		mainResultViewer,
		modalResultViewer,
		comparer,
		updatePaletteDisplay: () => updatePaletteDisplay(),
		updateGrid: () => updateGrid(),
		updateBgColorFromMethod: () => updateBgColorFromMethod(),
		candidateChooser,
	});
	const processPendingImages = createProcessPendingImages({
		els,
		processingState,
		imageSession,
		runProcessing,
	});
	const {
		updateRgbInputs,
		updateProcessButtonVisibility,
		triggerAutoProcess,
		updateDisabledStates,
		updatePaletteButtonVisibility,
		updateReduceColorsDisabledStates,
		updateBgDisabledStates,
		updateBgColorFromMethod,
		applyQuickSettings,
	} = setupSettingsControls({
		els,
		processingState,
		imageSession,
		runProcessing,
		saveSettings,
		onLanguageChange: () =>
			updateProcessingAnalysis(imageSession.getActiveImage()?.analysis),
	});
	els.sharedPaletteToggle.addEventListener(
		"change",
		updateReduceColorsDisabledStates,
	);
	const updateGrid = () => {
		mainResultViewer.drawGrid();
		modalResultViewer.drawGrid();
	};

	const updatePaletteDisplay = () => {
		els.paletteColors.innerHTML = "";
		if (processingState.currentExtractedPalette.length === 0) {
			// els.paletteSection.style.display = "none";
			updatePaletteButtonVisibility();
			return;
		}

		// els.paletteSection.style.display = "block";
		updatePaletteButtonVisibility();

		processingState.currentExtractedPalette.forEach((color) => {
			const hex =
				"#" +
				[color.r, color.g, color.b]
					.map((x) => x.toString(16).padStart(2, "0"))
					.join("");
			const swatch = document.createElement("div");
			swatch.className = "color-swatch";
			swatch.style.backgroundColor = hex;
			swatch.dataset.tooltip = hex.toUpperCase();
			swatch.addEventListener("click", () => {
				navigator.clipboard.writeText(hex.toUpperCase()).then(() => {
					const originalTooltip = swatch.getAttribute("data-tooltip") || "";
					swatch.setAttribute("data-tooltip", "Copied!");
					swatch.classList.add("copied");
					setTimeout(() => {
						swatch.classList.remove("copied");
						swatch.setAttribute("data-tooltip", originalTooltip);
					}, 1500);
				});
				updateRgbInputs(hex);
				// RGB モードの場合はこの色も選択する
				if (els.bgExtractionMethod.value === "rgb") {
					els.bgExtractionMethod.dispatchEvent(new Event("change"));
				}
				updateReduceColorsDisabledStates();
			});
			els.paletteColors.appendChild(swatch);
		});
	};

	const loadFiles = async (files: File[]) => {
		// 画像のみ処理
		const imageFiles = Array.from(files).filter((f) =>
			f.type.startsWith("image/"),
		);

		if (imageFiles.length === 0) {
			if (files.length > 0 && !files[0].name.endsWith(".gpl")) {
				// ファイルがドロップされたものの画像がなく（GPL でもない）場合はエラーを表示
				// ただし GPL はドロップハンドラーで別途処理する。
			}
			return;
		}

		// RawImage の作成は高速なため、逐次処理で問題ない。
		const failedNames: string[] = [];
		let addedCount = 0;
		for (const file of imageFiles) {
			try {
				const raw = await imageToRawImage(file);
				imageSession.addImage(file, raw);
				addedCount += 1;
			} catch {
				// [Intended] 1 枚の読み込み失敗で、残りの画像を取りこぼさない。
				failedNames.push(file.name);
			}
		}
		if (failedNames.length > 0) {
			showError(`${i18n.t("error.load_failed")}: ${failedNames.join(", ")}`);
		}

		// [Intended] 1 枚も追加できなかったときは、表示中の画像を切り替えず変換も始めない。
		// 読み込みに失敗しただけで、ユーザーが見ていた画像が別の画像へ移らないようにする。
		if (addedCount === 0) return;

		// 最後に追加した画像を選択（ユーザー要望）
		const allImages = imageSession.getImages();
		const lastImage = allImages[allImages.length - 1];
		imageSession.setActiveImage(lastImage.id);
		// [Intended] 自動処理が OFF のときは読み込みを契機に変換しない。OFF は処理ボタンで
		// 表示中の画像だけを変換するモードなので、ここで一覧全体を変換してはいけない。
		if (els.autoProcessToggle.checked) {
			// 追加した画像を一覧順にすべて変換する
			void processPendingImages();
		}
	};

	els.clearAllButton.addEventListener("click", () => {
		if (confirm(i18n.t("ui.confirm_clear_all") || "Clear all images?")) {
			imageSession.clearAll();
		}
	});

	// ドラッグ＆ドロップ時の視覚的フィードバック
	const highlight = () => els.dropArea.classList.add("drag-over");
	const unhighlight = () => els.dropArea.classList.remove("drag-over");

	["dragenter", "dragover"].forEach((eventName) => {
		els.dropArea.addEventListener(eventName, (e) => {
			e.preventDefault();
			e.stopPropagation();
			highlight();
		});
	});

	["dragleave", "drop"].forEach((eventName) => {
		els.dropArea.addEventListener(eventName, (e) => {
			e.preventDefault();
			e.stopPropagation();
			unhighlight();
		});
	});

	// 入力キャンバスのコンテナをクリックするとファイル入力を開く
	els.inputCanvasContainer.addEventListener("click", () => {
		els.fileInput.click();
	});

	els.fileInput.addEventListener("click", (e) => {
		e.stopPropagation();
	});

	els.fileInput.addEventListener("change", async (ev) => {
		const files = (ev.target as HTMLInputElement).files;
		if (!files || files.length === 0) {
			return;
		}
		loadFiles(Array.from(files));
		// 必要に応じて同じファイルを再選択できるよう値をリセット
		els.fileInput.value = "";
	});

	els.dropArea.addEventListener("drop", async (e) => {
		const dt = (e as DragEvent).dataTransfer;
		const files = dt?.files;
		if (files && files.length > 0) {
			const file = files[0];
			if (file.name.toLowerCase().endsWith(".gpl")) {
				// パレットファイルを処理
				const text = await file.text();
				const palette = parseGPL(text);
				if (palette.length > 0) {
					if (palette.length > 0) {
						processingState.currentFixedPalette = palette;
						els.reduceColorModeSelect.value = "fixed";
						updateReduceColorsDisabledStates();
						runProcessing();
					}
				}
			} else {
				loadFiles(Array.from(files));
				// 一致するようファイル入力を更新（任意だが一貫性のため有用）
				// FileList を入力へ簡単に設定できないが、その必要はない。
			}
		}
	});

	// パレットのインポート／エクスポート
	els.exportGPLButton.addEventListener("click", () => {
		if (processingState.currentExtractedPalette.length === 0) return;
		const content = generateGPL(
			processingState.currentExtractedPalette,
			"PixelRefiner Export",
		);
		const blob = new Blob([content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "palette.gpl";
		link.click();
		URL.revokeObjectURL(url);
	});

	els.exportPNGButton.addEventListener("click", async () => {
		if (processingState.currentExtractedPalette.length === 0) return;
		const blob = await generatePaletteImage(
			processingState.currentExtractedPalette,
		);
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "palette.png";
		link.click();
		URL.revokeObjectURL(url);
	});
	// ---------------------------------------------------------
	// 結果モーダル
	// ---------------------------------------------------------

	const closeResultModal = () => {
		resultModalController.close();
	};

	// 結果コンテナのクリックでモーダルを開く処理は、現在 ResultViewer の onImageClick コールバックが担う

	els.closeResultModal.addEventListener("click", closeResultModal);

	els.resultModal.addEventListener("click", (e) => {
		if (e.target === els.resultModal) {
			closeResultModal();
		}
	});

	els.fixedPaletteImportButton.addEventListener("click", () => {
		els.paletteFileInput.click();
	});

	els.showPaletteButton.addEventListener("click", () => {
		els.paletteModal.style.display = "flex";
	});

	els.closePaletteModal.addEventListener("click", () => {
		els.paletteModal.style.display = "none";
	});

	els.paletteModal.addEventListener("click", (e) => {
		if (e.target === els.paletteModal) {
			els.paletteModal.style.display = "none";
		}
	});

	els.paletteFileInput.addEventListener("change", async (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		try {
			if (file.name.toLowerCase().endsWith(".gpl")) {
				// GIMP パレットファイルを処理
				const text = await file.text();
				const palette = parseGPL(text);
				if (palette.length > 0) {
					processingState.currentFixedPalette = palette;
					els.reduceColorModeSelect.value = "fixed";
					updateReduceColorsDisabledStates();
					runProcessing();
				}
			} else if (file.type.startsWith("image/")) {
				// すべての画像形式（PNG、JPEG、GIF、WebP など）を処理
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement("canvas");
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext("2d");
					if (!ctx) return;
					ctx.drawImage(img, 0, 0);
					const imageData = ctx.getImageData(0, 0, img.width, img.height);

					// 最大 256 色で色を抽出
					const { colors, totalColors } = extractColorsFromImage(
						imageData,
						256,
					);

					// 256 色を超える場合は警告を表示
					if (totalColors > 256) {
						showError(i18n.t("error.palette_limit", { count: totalColors }));
					}

					if (colors.length > 0) {
						processingState.currentFixedPalette = colors;
						els.reduceColorModeSelect.value = "fixed";
						updateReduceColorsDisabledStates();
						runProcessing();
					}
					URL.revokeObjectURL(img.src);
				};
				img.src = URL.createObjectURL(file);
			}
		} catch (err) {
			console.error(err);
			showError(i18n.t("error.load_failed"));
		}
		// 入力をリセット
		els.paletteFileInput.value = "";
	});

	els.processButton.addEventListener("click", () => {
		runProcessing();
	});

	// 表示切替ロジック
	const { openCompareModal } = setupCompareControls({
		els,
		processingState,
		comparer,
		compareModalController,
	});
	setupResultActions({
		els,
		imageSession,
		mainResultViewer,
		modalResultViewer,
		resultModalController,
		openCompareModal,
		closeResultModal,
		syncViewers,
	});
	setupBatchController({ els, processingState, imageSession });

	// アプリの準備完了時に表示
	document.body.classList.add("loaded");

	// 背景選択のロジック（ResultViewer へ移動済みだが、ここにあった場合は初期同期や設定が必要になる可能性がある）
	// ロジックは初期 bg-checkered の設定とクリックリスナーの追加だった。
	// 現在は ResultViewer がこれを処理する。

	loadSettings();

	// ---------------------------------------------------------
	setupPresetControls({
		els,
		presetModalController,
		updateDisabledStates,
		updateReduceColorsDisabledStates,
		updateBgDisabledStates,
		updateProcessButtonVisibility,
		triggerAutoProcess,
		applyQuickSettings,
		clearCandidateSelections: () => imageSession.clearCandidateSelections(),
		clearFixedPalette: () => {
			processingState.currentFixedPalette = undefined;
		},
	});
};
