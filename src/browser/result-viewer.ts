import type { PixelGrid, RawImage } from "../shared/types";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";

type ResultViewerCallbacks = {
	onDownload?: (scale: number) => void;
	onCompare?: () => void;
	onZoomToggle?: (enabled: boolean) => void;
	onGridToggle?: (enabled: boolean) => void;
	onBgChange?: (bgType: string) => void;
	onImageClick?: () => void;
	onGridSelect?: (grid: PixelGrid) => void;
};

export class ResultViewer {
	private static instances = new Set<ResultViewer>();
	private static globalListenersInitialized = false;
	private static nextId = 1;

	private container: HTMLElement;
	private canvas: HTMLCanvasElement;
	private gridCanvas: HTMLCanvasElement;
	private sizeLabel: HTMLElement;
	private bgSelector: HTMLElement;
	private zoomCheck: HTMLInputElement;
	private gridCheck: HTMLInputElement;
	private downloadBtn: HTMLButtonElement;
	private downloadDropdownBtn: HTMLButtonElement;
	private downloadMenu: HTMLElement;
	private compareBtn: HTMLButtonElement;
	private loadingOverlay: HTMLElement;
	private candidatesMenu: HTMLElement | null = null;

	private currentImage: RawImage | null = null;
	private currentGrid: PixelGrid | null = null;
	private currentBgType = "checkered";
	private callbacks: ResultViewerCallbacks = {};
	private resizeObserver: ResizeObserver | null = null;
	private scheduledGridRaf: number | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
		this.canvas = this.get<HTMLCanvasElement>(".js-result-canvas");
		this.gridCanvas = this.get<HTMLCanvasElement>(".js-grid-canvas");
		this.sizeLabel = this.get<HTMLElement>(".js-output-size");
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

		// Init state from markup
		const activeBgBtn = this.bgSelector.querySelector(
			".bg-btn.active",
		) as HTMLElement | null;
		const initialBg = activeBgBtn?.dataset.bg ?? "checkered";
		this.currentBgType = initialBg;
		this.setBackground(initialBg);

		// Ensure download menu is addressable for aria-controls
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
		// Zoom Toggle
		this.zoomCheck.addEventListener("change", () => {
			this.updateZoomState();
			this.callbacks.onZoomToggle?.(this.zoomCheck.checked);
		});

		// Grid Toggle
		this.gridCheck.addEventListener("change", () => {
			if (this.gridCheck.checked) {
				// Grid ON -> Ensure Zoom is ON
				if (!this.zoomCheck.checked) {
					this.zoomCheck.checked = true;
					this.updateZoomState();
					this.callbacks.onZoomToggle?.(true);
				}
			}
			this.drawGrid();
			this.callbacks.onGridToggle?.(this.gridCheck.checked);
		});

		// Background Selector
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

		// Download Buttons
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

		// Compare Button
		this.compareBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.callbacks.onCompare?.();
		});

		// Click on canvas container to trigger onImageClick
		// We use container because canvas might be smaller than container in some layouts,
		// but typically we want the image click.
		// However, the requested feature is "click on image".
		// But in zoom mode, canvas fills container or scrolls.
		// Let's attach to the container but check if we clicked on valid area if needed?
		// Simply attaching to container ".js-result-canvas-container" is easier and covers the area.
		const canvasContainer = this.canvas.parentElement;
		if (canvasContainer) {
			canvasContainer.addEventListener("click", () => {
				// Ignore if clicking on buttons or controls inside (though there are none usually in the canvas area)
				// Also ignore if no image
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

	private static closeAllCandidatesMenus() {
		for (const viewer of ResultViewer.instances) {
			viewer.closeCandidatesMenu();
		}
	}

	private initGlobalListeners() {
		if (ResultViewer.globalListenersInitialized) return;
		ResultViewer.globalListenersInitialized = true;

		document.addEventListener("click", () => {
			ResultViewer.closeAllDownloadMenus();
			ResultViewer.closeAllCandidatesMenus();
		});
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				ResultViewer.closeAllDownloadMenus();
				ResultViewer.closeAllCandidatesMenus();
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

	public updateImage(image: RawImage, grid?: PixelGrid) {
		this.currentImage = image;
		this.currentGrid = grid ?? null;
		drawRawImageToCanvas(image, this.canvas);

		this.updateSizeLabel();

		// Update UI visibility
		this.downloadBtn.style.display = "inline-flex";
		this.downloadDropdownBtn.style.display = "inline-flex";

		// Update Container State
		const canvasContainer = this.canvas.parentElement;
		if (canvasContainer) {
			// Remove placeholder, show canvases
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

	public setLoading(isLoading: boolean) {
		this.loadingOverlay.style.display = isLoading ? "flex" : "none";
	}

	public setBackground(bgType: string) {
		this.currentBgType = bgType;
		// Update buttons
		this.bgSelector.querySelectorAll(".bg-btn").forEach((b) => {
			const btn = b as HTMLElement;
			btn.classList.toggle("active", btn.dataset.bg === bgType);
		});

		// Update container class
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
				// If zoom off, grid should appear off visually (handled by CSS usually, but logic enforcement here)
				if (this.gridCheck.checked) {
					// We don't auto-uncheck grid checkbox to preserve preference,
					// but we might want to clear the grid canvas.
					// For now, relies on CSS hiding .zoom-enabled .grid-canvas
				}
			}
		}
		this.drawGrid();
	}

	public drawGrid() {
		const ctx = this.gridCanvas.getContext("2d");
		if (!ctx) return;

		// Clear previous grid
		ctx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

		// Grid is only drawn if enabled and zoom is enabled
		if (
			!this.gridCheck.checked ||
			!this.zoomCheck.checked ||
			!this.currentImage
		) {
			this.canvas.parentElement?.classList.remove("grid-enabled");
			return;
		}

		this.canvas.parentElement?.classList.add("grid-enabled");

		// Measure container (or canvas) display size
		const rect = this.canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const cssW = rect.width;
		const cssH = rect.height;

		if (cssW === 0 || cssH === 0) return;

		// Set grid canvas resolution to screen pixels
		const targetWidth = Math.round(cssW * dpr);
		const targetHeight = Math.round(cssH * dpr);

		if (
			this.gridCanvas.width !== targetWidth ||
			this.gridCanvas.height !== targetHeight
		) {
			this.gridCanvas.width = targetWidth;
			this.gridCanvas.height = targetHeight;
		}

		// Calculations for object-fit: contain
		const imgW = this.currentImage.width;
		const imgH = this.currentImage.height;
		const imgRatio = imgW / imgH;
		const containerRatio = cssW / cssH;

		let drawW = cssW;
		let drawH = cssH;
		let offsetX = 0;
		let offsetY = 0;

		if (containerRatio > imgRatio) {
			// Container is wider than image -> Pillarbox (bars on sides)
			drawH = cssH;
			drawW = cssH * imgRatio;
			offsetX = (cssW - drawW) / 2;
		} else {
			// Container is taller than image -> Letterbox (bars top/bottom)
			drawW = cssW;
			drawH = cssW / imgRatio;
			offsetY = (cssH - drawH) / 2;
		}

		// Adjust calculations to canvas coordinate space (Multiplying by DPR)
		// Or we can simple scale the context.
		ctx.resetTransform();
		ctx.scale(dpr, dpr);

		ctx.beginPath();
		// Use a thin line that remains visible
		ctx.strokeStyle = "rgba(128, 128, 128, 0.4)";
		ctx.lineWidth = 1;

		// Shift by 0.5 to draw sharp lines if we are taking about 1px lines,
		// but since we are scaling, direct coordinate is likely fine or we might want to align to pixels.
		// However, "step" might be fractional.
		// Drawing at logical pixel boundaries is safer.

		const stepX = drawW / imgW;
		const stepY = drawH / imgH;

		// Vertical lines
		// We avoid drawing the very first and last lines if they overlap with container border,
		// but typically we draw all internal lines.
		// Optimization: if step is very small (zoom out), don't draw grid?
		// User asked for "Zoom Mode" so it's likely zoomed in.

		for (let x = 0; x <= imgW; x++) {
			const px = offsetX + x * stepX;
			ctx.moveTo(px, offsetY);
			ctx.lineTo(px, offsetY + drawH);
		}

		// Horizontal lines
		for (let y = 0; y <= imgH; y++) {
			const py = offsetY + y * stepY;
			ctx.moveTo(offsetX, py);
			ctx.lineTo(offsetX + drawW, py);
		}
		ctx.stroke();
	}

	public clear() {
		this.currentImage = null;
		this.currentGrid = null;
		this.closeDownloadMenu();
		this.closeCandidatesMenu();
		const ctx = this.canvas.getContext("2d");
		ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
		const gridCtx = this.gridCanvas.getContext("2d");
		gridCtx?.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

		const canvasContainer = this.canvas.parentElement;
		if (canvasContainer) {
			canvasContainer.classList.remove("has-image");
			canvasContainer.classList.remove("grid-enabled");
			const placeholder = canvasContainer.querySelector(".placeholder");
			if (placeholder) (placeholder as HTMLElement).style.display = "flex";
			this.canvas.style.display = "none";
			this.gridCanvas.style.display = "none";
		}
		this.sizeLabel.textContent = "-";
		this.sizeLabel.style.cursor = "default";
		this.sizeLabel.style.textDecoration = "none";
		this.sizeLabel.onclick = null;
		this.downloadBtn.style.display = "none";
		this.downloadDropdownBtn.style.display = "none";
	}

	private updateSizeLabel() {
		if (!this.currentImage) {
			this.sizeLabel.textContent = "-";
			return;
		}

		if ((this.currentGrid?.candidates?.length ?? 0) > 0) {
			this.sizeLabel.innerHTML = `${this.currentImage.width} x ${this.currentImage.height} <span style="font-size: 0.8em; opacity: 0.7;">▼</span>`;
			this.sizeLabel.style.cursor = "pointer";
			this.sizeLabel.style.textDecoration = "underline";
			this.sizeLabel.style.textDecorationStyle = "dotted";
			this.sizeLabel.onclick = (e) => {
				e.stopPropagation();
				this.toggleCandidatesMenu();
			};
		} else {
			this.sizeLabel.textContent = `${this.currentImage.width} x ${this.currentImage.height}`;
			this.sizeLabel.style.cursor = "default";
			this.sizeLabel.style.textDecoration = "none";
			this.sizeLabel.onclick = null;
		}
	}

	private toggleCandidatesMenu() {
		if (this.candidatesMenu?.parentElement) {
			this.closeCandidatesMenu();
			return;
		}
		ResultViewer.closeAllDownloadMenus();
		ResultViewer.closeAllCandidatesMenus();
		this.showCandidatesMenu();
	}

	private closeCandidatesMenu() {
		if (this.candidatesMenu) {
			this.candidatesMenu.remove();
			this.candidatesMenu = null;
		}
	}

	private showCandidatesMenu() {
		if (!this.currentGrid?.candidates) return;

		this.closeCandidatesMenu();

		const menu = document.createElement("div");
		menu.className = "candidates-menu";
		menu.setAttribute("role", "menu");
		menu.style.position = "absolute";
		// Above modal overlay (3000)
		menu.style.zIndex = "3001";

		const title = document.createElement("div");
		title.className = "candidates-menu-title";
		title.textContent = i18n.t("ui.select_size_title");
		title.style.padding = "8px 12px";
		title.style.fontSize = "0.85em";
		title.style.fontWeight = "bold";
		title.style.opacity = "0.8";
		title.style.borderBottom = "1px solid var(--border-color)";
		menu.appendChild(title);

		const note = document.createElement("div");
		note.className = "candidates-menu-note";
		note.textContent = i18n.t("ui.select_size_note");
		note.style.padding = "4px 12px 8px";
		note.style.fontSize = "0.75em";
		note.style.opacity = "0.6";
		note.style.lineHeight = "1.4";
		menu.style.borderBottom = "1px solid var(--border-color)";
		menu.appendChild(note);

		// 候補と現在のサイズを統合してソート
		const current = this.currentGrid;
		const rawCandidates = [...(this.currentGrid.candidates || [])];

		// 1. 現在のサイズと「近すぎる」候補を排除する
		// 2. 候補同士で「近すぎる」ものを排除する
		// 判定基準: 面積差が小さい、かつセルサイズ(px)の差が小さい
		const isSimilar = (a: PixelGrid, b: PixelGrid) => {
			const areaA = (a.outW ?? 0) * (a.outH ?? 0);
			const areaB = (b.outW ?? 0) * (b.outH ?? 0);
			const areaDiff = Math.abs(areaA - areaB);
			const cellDiff = Math.abs(a.cellW - b.cellW);

			// 面積差が 2% 以内かつ、ピクセルサイズ差が 0.2px 以内なら同一視
			const areaThreshold = Math.max(areaA, areaB) * 0.02;
			return areaDiff <= Math.max(2, areaThreshold) && cellDiff < 0.2;
		};

		// まず現在のサイズを基準にフィルタリング
		const filtered = rawCandidates.filter((c) => !isSimilar(c, current));

		// 候補同士でも重複を排除（サイズ順に並べて隣接要素と比較）
		filtered.sort(
			(a, b) => (a.outW ?? 0) * (a.outH ?? 0) - (b.outW ?? 0) * (b.outH ?? 0),
		);
		const uniqueCandidates: PixelGrid[] = [];
		for (const c of filtered) {
			if (
				uniqueCandidates.length === 0 ||
				!isSimilar(c, uniqueCandidates[uniqueCandidates.length - 1])
			) {
				uniqueCandidates.push(c);
			}
		}

		// 現在のサイズを統合
		const candidates = [current, ...uniqueCandidates];

		// 最終的なサイズ順（面積順）にソート
		candidates.sort((a, b) => {
			const areaA = (a.outW ?? 0) * (a.outH ?? 0);
			const areaB = (b.outW ?? 0) * (b.outH ?? 0);
			return areaA - areaB;
		});

		// 最大件数を制限
		const displayCandidates = candidates.slice(0, 12);

		displayCandidates.forEach((c) => {
			const isCurrent = c.outW === current.outW && c.outH === current.outH;

			if (isCurrent) {
				const currentItem = document.createElement("div");
				currentItem.className = "candidates-menu-current";
				const pixelSizeLabel = i18n.t("ui.pixel_size");
				currentItem.textContent = `${c.outW ?? "?"} x ${c.outH ?? "?"} (${pixelSizeLabel}: ${c.cellW.toFixed(1)}px)`;
				currentItem.style.padding = "8px 12px";
				currentItem.style.fontSize = "0.9em";
				currentItem.style.backgroundColor = "var(--bg-secondary)";
				currentItem.style.color = "var(--text-secondary)";
				currentItem.style.borderBottom = "1px solid var(--border-color)";
				currentItem.style.display = "flex";
				currentItem.style.alignItems = "center";

				const check = document.createElement("span");
				check.innerHTML = "✓";
				check.style.marginRight = "8px";
				check.style.color = "var(--accent-color)";
				currentItem.prepend(check);

				menu.appendChild(currentItem);
			} else {
				const btn = document.createElement("button");
				const pixelSizeLabel = i18n.t("ui.pixel_size");
				const label = `${c.outW ?? "?"} x ${c.outH ?? "?"} (${pixelSizeLabel}: ${c.cellW.toFixed(1)}px)`;
				btn.textContent = label;
				btn.type = "button";
				btn.setAttribute("role", "menuitem");
				btn.onclick = (e) => {
					e.stopPropagation();
					this.callbacks.onGridSelect?.(c);
					this.closeCandidatesMenu();
				};
				menu.appendChild(btn);
			}
		});

		document.body.appendChild(menu);
		this.candidatesMenu = menu;

		// Position near sizeLabel
		const rect = this.sizeLabel.getBoundingClientRect();
		const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
		const scrollLeft =
			window.pageXOffset || document.documentElement.scrollLeft;

		// Reset any inherited positioning (safety)
		menu.style.right = "auto";
		menu.style.bottom = "auto";

		// Default: position below the label
		menu.style.left = `${rect.left + scrollLeft}px`;
		menu.style.top = `${rect.bottom + scrollTop + 6}px`;

		// Reposition if it overflows viewport (after it's in DOM)
		const menuRect = menu.getBoundingClientRect();
		const padding = 10;

		// Horizontal overflow
		if (menuRect.right > window.innerWidth - padding) {
			const nextLeft = rect.right + scrollLeft - Math.max(menuRect.width, 200);
			menu.style.left = `${Math.max(padding + scrollLeft, nextLeft)}px`;
		}

		// Vertical overflow (open upward)
		const nextMenuRect = menu.getBoundingClientRect();
		if (nextMenuRect.bottom > window.innerHeight - padding) {
			const topUp = rect.top + scrollTop - nextMenuRect.height - 6;
			menu.style.top = `${Math.max(padding + scrollTop, topUp)}px`;
		}
	}
}
