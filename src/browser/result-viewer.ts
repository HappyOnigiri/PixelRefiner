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

	private currentImage: RawImage | null = null;
	private callbacks: ResultViewerCallbacks = {};

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

		this.initEventListeners();
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
			this.downloadMenu.style.display = "none";
		};

		this.downloadBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			handleDownload(1);
		});

		this.downloadDropdownBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const isVisible = this.downloadMenu.style.display === "block";
			this.closeAllMenus(); // Close others first
			this.downloadMenu.style.display = isVisible ? "none" : "block";
		});

		this.downloadMenu.querySelectorAll("button").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				const scale = Number.parseInt(
					btn.getAttribute("data-scale") || "1",
					10,
				);
				handleDownload(scale);
			});
		});

		document.addEventListener("click", () => {
			this.downloadMenu.style.display = "none";
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

	private closeAllMenus() {
		// Close menus in this viewer (and potentially others if needed, but usually document click handles it)
		this.downloadMenu.style.display = "none";
	}

	public setCallbacks(callbacks: ResultViewerCallbacks) {
		this.callbacks = callbacks;
	}

	public updateImage(image: RawImage) {
		this.currentImage = image;
		drawRawImageToCanvas(image, this.canvas);
		this.sizeLabel.textContent = `${image.width} x ${image.height}`;

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
		this.downloadBtn.style.display = "none";
		this.downloadDropdownBtn.style.display = "none";
	}
}
