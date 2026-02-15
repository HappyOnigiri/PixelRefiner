import type { RawImage } from "../shared/types";
import { drawRawImageToCanvas } from "./io";

export interface ImageItem {
	id: string;
	file: File;
	original: RawImage;
	result?: RawImage;
	thumbnail: string;
	status: "pending" | "processing" | "done" | "error";
	error?: string;
}

export class ImageSession {
	private images: ImageItem[] = [];
	private activeImageId: string | null = null;
	private onUpdate: () => void;
	private onActiveChange: (image: ImageItem | null) => void;

	constructor(callbacks: {
		onUpdate: () => void;
		onActiveChange: (image: ImageItem | null) => void;
	}) {
		this.onUpdate = callbacks.onUpdate;
		this.onActiveChange = callbacks.onActiveChange;
	}

	public addImage(file: File, raw: RawImage): void {
		const id = crypto.randomUUID();
		const thumbnail = this.createThumbnail(raw);
		const item: ImageItem = {
			id,
			file,
			original: raw,
			thumbnail,
			status: "pending",
		};
		this.images.push(item);

		// If this is the first image or no active image, select it
		if (!this.activeImageId) {
			this.setActiveImage(id);
		} else {
			this.onUpdate();
		}
	}

	public removeImage(id: string): void {
		const idx = this.images.findIndex((img) => img.id === id);
		if (idx === -1) return;

		const wasActive = this.activeImageId === id;
		this.images.splice(idx, 1);

		if (wasActive) {
			// Select next available image, or null if empty
			if (this.images.length > 0) {
				// Try to select the image at the same index, or the last one
				const nextIdx = Math.min(idx, this.images.length - 1);
				this.setActiveImage(this.images[nextIdx].id);
			} else {
				this.setActiveImage(null);
			}
		} else {
			this.onUpdate();
		}
	}

	public clearAll(): void {
		this.images = [];
		this.setActiveImage(null);
	}

	public setActiveImage(id: string | null): void {
		if (id !== null && !this.images.some((img) => img.id === id)) {
			console.warn(`Image with id ${id} not found.`);
			return;
		}
		this.activeImageId = id;
		this.onActiveChange(this.getActiveImage());
		this.onUpdate();
	}

	public getActiveImage(): ImageItem | null {
		return this.images.find((img) => img.id === this.activeImageId) || null;
	}

	public getImages(): ImageItem[] {
		return [...this.images];
	}

	public updateImageResult(id: string, result: RawImage): void {
		const img = this.images.find((i) => i.id === id);
		if (img) {
			img.result = result;
			img.status = "done";
			this.onUpdate();
		}
	}

	public setImageStatus(
		id: string,
		status: ImageItem["status"],
		error?: string,
	): void {
		const img = this.images.find((i) => i.id === id);
		if (img) {
			img.status = status;
			if (error) img.error = error;
			this.onUpdate();
		}
	}

	// Helper to create a small data URL for thumbnail
	private createThumbnail(raw: RawImage, maxDim = 80): string {
		const canvas = document.createElement("canvas");
		let w = raw.width;
		let h = raw.height;

		if (w > maxDim || h > maxDim) {
			const ratio = Math.min(maxDim / w, maxDim / h);
			w = Math.floor(w * ratio);
			h = Math.floor(h * ratio);
		}

		// Create a temp canvas for the full image first to resize cleanly
		// Or just draw directly scaled. For pixel art, nearest neighbor is best,
		// but for thumbnails, smooth might be better? Let's stick to default (smooth) for thumbnails
		// or maybe nearest to keep pixel art look? Let's use nearest for consistency.

		const tempCanvas = document.createElement("canvas");
		drawRawImageToCanvas(raw, tempCanvas);

		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return "";

		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(tempCanvas, 0, 0, w, h);

		return canvas.toDataURL("image/png");
	}
}
