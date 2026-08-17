import type { RawImage } from "../shared/types";
import { drawRawImageToCanvas } from "./io";

type ResultViewerCallbacks = {
	onDownload?: (scale: number) => void;
	onCompare?: () => void;
	onZoomToggle?: (enabled: boolean) => void;
	onGridToggle?: (enabled: boolean) => void;
	onBgChange?: (bgType: string) => void;
	onImageClick?: () => void;
};

export class ResultViewer {
	private static instances = new Set<ResultViewer>();
	private static globalListenersInitialized = false;
	private static nextId = 1;

	private container: HTMLElement;
	private canvas: HTMLCanvasElement;
	private gridCanvas: HTMLCanvasElement;
	private sizeLabel: HTMLElement;
	private analysisLabel: HTMLElement;
	private warningIndicator: HTMLElement;
	private bgSelector: HTMLElement;
	private zoomCheck: HTMLInputElement;
	private gridCheck: HTMLInputElement;
	private downloadBtn: HTMLButtonElement;
	private downloadDropdownBtn: HTMLButtonElement;
	private downloadMenu: HTMLElement;
	private compareBtn: HTMLButtonElement;
	private loadingOverlay: HTMLElement;

	private currentImage: RawImage | null = null;
	private currentBgType = "checkered";
	private callbacks: ResultViewerCallbacks = {};
	private resizeObserver: ResizeObserver | null = null;
	private scheduledGridRaf: number | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
		this.canvas = this.get<HTMLCanvasElement>(".js-result-canvas");
		this.gridCanvas = this.get<HTMLCanvasElement>(".js-grid-canvas");
		this.sizeLabel = this.get<HTMLElement>(".js-output-size");
		this.analysisLabel = this.get<HTMLElement>(".js-processing-analysis");
		this.warningIndicator = this.get<HTMLElement>(".js-processing-warning");
		this.bgSelector = this.get<HTMLElement>(".js-bg-selector");
		this.zoomCheck = this.get<HTMLInputElement>(".js-zoom-output");
		this.gridCheck = this.get<HTMLInputElement>(".js-grid-output");
		this.downloadBtn = this.get<HTMLButtonElement>(".js-download-button");
		this.downloadDropdownBtn = this.get<HTMLButtonElement>(
			".js-download-dropdown-button",
		);
		this.downloadMenu = this.get<HTMLElement>(".js-download-menu");
		this.compareBtn = this.get<HTMLButtonElement>(".js-btn-view-compare");
		this.loadingOverlay = this.get<HTMLElement>(".js-loading-overlay");

		// マークアップから状態を初期化
		const activeBgBtn = this.bgSelector.querySelector(
			".bg-btn.active",
		) as HTMLElement | null;
		const initialBg = activeBgBtn?.dataset.bg ?? "checkered";
		this.currentBgType = initialBg;
		this.setBackground(initialBg);

		// aria-controls からダウンロードメニューを参照できるようにする
		if (!this.downloadMenu.id) {
			this.downloadMenu.id = `download-menu-${ResultViewer.nextId++}`;
		}
		this.downloadMenu.setAttribute("role", "menu");
		this.downloadDropdownBtn.setAttribute("aria-haspopup", "menu");
		this.downloadDropdownBtn.setAttribute(
			"aria-controls",
			this.downloadMenu.id,
		);
		this.downloadDropdownBtn.setAttribute("aria-expanded", "false");

		this.initEventListeners();
		this.initResizeObserver();
		this.initGlobalListeners();
		ResultViewer.instances.add(this);
	}

	private get<T extends HTMLElement>(selector: string): T {
		const el = this.container.querySelector(selector);
		if (!el) {
			throw new Error(`Element ${selector} not found in container`);
		}
		return el as T;
	}

	private initEventListeners() {
		// ズーム切替
		this.zoomCheck.addEventListener("change", () => {
			this.updateZoomState();
			this.callbacks.onZoomToggle?.(this.zoomCheck.checked);
		});

		// グリッド切替
		this.gridCheck.addEventListener("change", () => {
			if (this.gridCheck.checked) {
				// グリッド ON → ズームが ON であることを保証
				if (!this.zoomCheck.checked) {
					this.zoomCheck.checked = true;
					this.updateZoomState();
					this.callbacks.onZoomToggle?.(true);
				}
			}
			this.drawGrid();
			this.callbacks.onGridToggle?.(this.gridCheck.checked);
		});

		// 背景選択
		this.bgSelector.querySelectorAll(".bg-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const target = (e.target as HTMLElement).closest(
					".bg-btn",
				) as HTMLElement;
				if (!target) return;
				const bgType = target.dataset.bg;
				if (bgType) {
					this.setBackground(bgType);
					this.callbacks.onBgChange?.(bgType);
				}
			});
		});

		// ダウンロードボタン
		const handleDownload = (scale: number) => {
			this.callbacks.onDownload?.(scale);
			this.closeDownloadMenu();
		};

		this.downloadBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			handleDownload(1);
		});

		this.downloadDropdownBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleDownloadMenu();
		});

		this.downloadMenu.querySelectorAll("button").forEach((btn) => {
			btn.setAttribute("role", "menuitem");
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				const scale = Number.parseInt(
					btn.getAttribute("data-scale") || "1",
					10,
				);
				handleDownload(scale);
			});
		});

		// 比較ボタン
		this.compareBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.callbacks.onCompare?.();
		});

		// [Intended] クリック領域はキャンバスではなく親の ".js-result-canvas-container" に張る。
		// レイアウトによってはキャンバスがコンテナより小さく、余白のクリックを取りこぼすため。
		// セレクタでは引かず parentElement を使うが、マークアップ側のこのクラスに依存している。
		const canvasContainer = this.canvas.parentElement;
		if (canvasContainer) {
			canvasContainer.addEventListener("click", () => {
				// 内部のボタンやコントロールをクリックした場合は無視（通常、キャンバス領域にはない）
				// 画像がない場合も無視
				if (!this.currentImage) return;
				this.callbacks.onImageClick?.();
			});
		}
	}

	private isDownloadMenuOpen(): boolean {
		return this.downloadMenu.classList.contains("show");
	}

	private openDownloadMenu() {
		this.downloadMenu.classList.add("show");
		this.downloadDropdownBtn.setAttribute("aria-expanded", "true");
	}

	private closeDownloadMenu() {
		this.downloadMenu.classList.remove("show");
		this.downloadDropdownBtn.setAttribute("aria-expanded", "false");
	}

	private toggleDownloadMenu() {
		if (this.isDownloadMenuOpen()) {
			this.closeDownloadMenu();
			return;
		}
		ResultViewer.closeAllDownloadMenus();
		this.openDownloadMenu();
	}

	private static closeAllDownloadMenus() {
		for (const viewer of ResultViewer.instances) {
			viewer.closeDownloadMenu();
		}
	}

	private initGlobalListeners() {
		if (ResultViewer.globalListenersInitialized) return;
		ResultViewer.globalListenersInitialized = true;

		document.addEventListener("click", () => {
			ResultViewer.closeAllDownloadMenus();
		});
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				ResultViewer.closeAllDownloadMenus();
			}
		});
	}

	private initResizeObserver() {
		const canvasContainer = this.canvas.parentElement;
		if (!canvasContainer) return;

		const schedule = () => {
			if (this.scheduledGridRaf !== null) return;
			this.scheduledGridRaf = window.requestAnimationFrame(() => {
				this.scheduledGridRaf = null;
				this.drawGrid();
			});
		};

		if (typeof ResizeObserver !== "undefined") {
			this.resizeObserver = new ResizeObserver(() => schedule());
			this.resizeObserver.observe(canvasContainer);
		} else {
			window.addEventListener("resize", schedule);
		}
	}

	public setCallbacks(callbacks: ResultViewerCallbacks) {
		this.callbacks = callbacks;
	}

	public updateImage(image: RawImage) {
		this.currentImage = image;
		drawRawImageToCanvas(image, this.canvas);

		this.updateSizeLabel();

		// UI の表示状態を更新
		this.downloadBtn.style.display = "inline-flex";
		this.downloadDropdownBtn.style.display = "inline-flex";

		// コンテナの状態を更新
		const canvasContainer = this.canvas.parentElement;
		if (canvasContainer) {
			// プレースホルダーを削除してキャンバスを表示
			const placeholder = canvasContainer.querySelector(".placeholder");
			if (placeholder) (placeholder as HTMLElement).style.display = "none";
			this.canvas.style.display = "block";
			this.gridCanvas.style.display = "block";
			canvasContainer.classList.add("has-image");
		}

		this.loadingOverlay.style.display = "none";
		this.updateZoomState();
		this.drawGrid();
	}

	public updateAnalysis(text: string) {
		this.analysisLabel.textContent = text;
	}

	public updateWarnings(messages: readonly string[]) {
		const message = messages.join("\n");
		this.warningIndicator.hidden = message.length === 0;
		if (message.length === 0) {
			this.warningIndicator.removeAttribute("data-tooltip");
			this.warningIndicator.removeAttribute("aria-label");
			return;
		}
		this.warningIndicator.dataset.tooltip = message;
		this.warningIndicator.setAttribute("aria-label", message);
	}

	public setLoading(isLoading: boolean) {
		this.loadingOverlay.style.display = isLoading ? "flex" : "none";
	}

	public setBackground(bgType: string) {
		this.currentBgType = bgType;
		// ボタンを更新
		this.bgSelector.querySelectorAll(".bg-btn").forEach((b) => {
			const btn = b as HTMLElement;
			btn.classList.toggle("active", btn.dataset.bg === bgType);
		});

		// コンテナクラスを更新
		const container = this.canvas.parentElement;
		if (container) {
			["bg-checkered", "bg-white", "bg-black", "bg-green"].forEach((cls) => {
				container.classList.remove(cls);
			});
			container.classList.add(`bg-${bgType}`);
		}
	}

	public getBackgroundType(): string {
		return this.currentBgType;
	}

	public setZoom(enabled: boolean) {
		this.zoomCheck.checked = enabled;
		this.updateZoomState();
	}

	public setGrid(enabled: boolean) {
		this.gridCheck.checked = enabled;
		this.drawGrid();
	}

	private updateZoomState() {
		const container = this.canvas.parentElement;
		if (container) {
			if (this.zoomCheck.checked) {
				container.classList.add("zoom-enabled");
			} else {
				container.classList.remove("zoom-enabled");
				// ズームがオフならグリッドも視覚的にオフにする（通常は CSS で処理するが、ここでロジックを強制）
				if (this.gridCheck.checked) {
					// 設定を保持するためグリッドチェックボックスは自動で外さないが、
					// グリッドキャンバスはクリアした方がよいかもしれない。
					// 現時点では CSS による .zoom-enabled .grid-canvas の非表示に依存する
				}
			}
		}
		this.drawGrid();
	}

	public drawGrid() {
		const ctx = this.gridCanvas.getContext("2d");
		if (!ctx) return;

		// 前のグリッドをクリア
		ctx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

		// グリッドは有効かつズーム有効の場合のみ描画
		if (
			!this.gridCheck.checked ||
			!this.zoomCheck.checked ||
			!this.currentImage
		) {
			this.canvas.parentElement?.classList.remove("grid-enabled");
			return;
		}

		this.canvas.parentElement?.classList.add("grid-enabled");

		// コンテナ（またはキャンバス）の表示サイズを測定
		const rect = this.canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const cssW = rect.width;
		const cssH = rect.height;

		if (cssW === 0 || cssH === 0) return;

		// グリッドキャンバスの解像度を画面ピクセルに設定
		const targetWidth = Math.round(cssW * dpr);
		const targetHeight = Math.round(cssH * dpr);

		if (
			this.gridCanvas.width !== targetWidth ||
			this.gridCanvas.height !== targetHeight
		) {
			this.gridCanvas.width = targetWidth;
			this.gridCanvas.height = targetHeight;
		}

		// object-fit: contain の計算
		const imgW = this.currentImage.width;
		const imgH = this.currentImage.height;
		const imgRatio = imgW / imgH;
		const containerRatio = cssW / cssH;

		let drawW = cssW;
		let drawH = cssH;
		let offsetX = 0;
		let offsetY = 0;

		if (containerRatio > imgRatio) {
			// コンテナが画像より横長 → ピラーボックス（左右に余白）
			drawH = cssH;
			drawW = cssH * imgRatio;
			offsetX = (cssW - drawW) / 2;
		} else {
			// コンテナが画像より縦長 → レターボックス（上下に余白）
			drawW = cssW;
			drawH = cssW / imgRatio;
			offsetY = (cssH - drawH) / 2;
		}

		// 計算をキャンバス座標系に合わせる（DPR を乗算）
		// またはコンテキストを単純にスケーリングできる。
		ctx.resetTransform();
		ctx.scale(dpr, dpr);

		ctx.beginPath();
		// 視認性を保つ細い線を使用
		ctx.strokeStyle = "rgba(128, 128, 128, 0.4)";
		ctx.lineWidth = 1;

		// 1px 程度の線なら 0.5 ずらすと鮮明に描画できるが、
		// スケーリングしているため直接座標でもよく、ピクセルに揃えることもできる。
		// ただし "step" は小数になる可能性がある。
		// 論理ピクセル境界で描画する方が安全である。

		const stepX = drawW / imgW;
		const stepY = drawH / imgH;

		// 垂直線
		// コンテナ境界と重なる場合は最初と最後の線を避けるが、
		// 通常はすべての内部線を描画する。
		// 最適化: step が非常に小さい（ズームアウト）場合はグリッドを描画しない？
		// ユーザーは「ズームモード」を求めているため、ズームインしている可能性が高い。

		for (let x = 0; x <= imgW; x++) {
			const px = offsetX + x * stepX;
			ctx.moveTo(px, offsetY);
			ctx.lineTo(px, offsetY + drawH);
		}

		// 水平線
		for (let y = 0; y <= imgH; y++) {
			const py = offsetY + y * stepY;
			ctx.moveTo(offsetX, py);
			ctx.lineTo(offsetX + drawW, py);
		}
		ctx.stroke();
	}

	private updateSizeLabel() {
		if (!this.currentImage) {
			this.sizeLabel.textContent = "-";
			return;
		}

		// [Intended] 数値だけの候補一覧は表示せず、低信頼度時は実結果の候補リストへ誘導する。
		this.sizeLabel.textContent = `${this.currentImage.width} x ${this.currentImage.height}`;
		this.sizeLabel.style.cursor = "default";
		this.sizeLabel.style.textDecoration = "none";
		this.sizeLabel.onclick = null;
	}
}
