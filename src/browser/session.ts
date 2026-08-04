import { needsBatchAttention } from "../core/batch";
import type {
	CandidateSelection,
	PixelGrid,
	ProcessingAnalysis,
	ProcessResult,
	RawImage,
} from "../shared/types";
import { drawRawImageToCanvas } from "./io";

export interface ImageItem {
	id: string;
	file: File;
	original: RawImage;
	result?: RawImage;
	grid?: PixelGrid;
	thumbnail: string;
	status: "pending" | "processing" | "done" | "error";
	error?: string;
	analysis?: ProcessingAnalysis;
	attention?: boolean;
	outputFilename?: string;
	/**
	 * 候補プレビューで選んだ処理方針。設定変更で再処理しても自動判定へ戻らないよう保持する。
	 * UI の設定値は書き換えないため、保持先はこの画像単位の状態になる。
	 */
	candidateSelection?: CandidateSelection;
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

		// 最初の画像、またはアクティブな画像がない場合は選択する
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
			// 次に利用可能な画像を選択し、空なら null にする
			if (this.images.length > 0) {
				// 同じインデックスの画像、または最後の画像を選択する
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

	public updateImageResult(
		id: string,
		processed: ProcessResult,
	): PixelGrid | undefined {
		const img = this.images.find((i) => i.id === id);
		if (img) {
			img.result = processed.result;
			img.grid = processed.grid;
			img.analysis = processed.analysis;
			img.attention = needsBatchAttention(processed.analysis);
			img.status = "done";
			img.error = undefined;
			this.onUpdate();
			return img.grid;
		}
		return processed.grid;
	}

	public setOutputFilename(
		id: string,
		outputFilename: string | undefined,
	): void {
		const img = this.images.find((item) => item.id === id);
		if (img) img.outputFilename = outputFilename;
	}

	public setCandidateSelection(
		id: string,
		selection: CandidateSelection | undefined,
	): void {
		const img = this.images.find((i) => i.id === id);
		if (img) img.candidateSelection = selection;
	}

	public clearCandidateSelections(): void {
		for (let index = 0; index < this.images.length; index += 1) {
			this.images[index].candidateSelection = undefined;
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
			img.error = error;
			if (status === "processing") {
				img.analysis = undefined;
				img.attention = false;
				img.outputFilename = undefined;
			}
			this.onUpdate();
		}
	}

	// サムネイル用の小さなデータ URL を作成するヘルパー
	private createThumbnail(raw: RawImage, maxDim = 80): string {
		const canvas = document.createElement("canvas");
		let w = raw.width;
		let h = raw.height;

		if (w > maxDim || h > maxDim) {
			const ratio = Math.min(maxDim / w, maxDim / h);
			w = Math.floor(w * ratio);
			h = Math.floor(h * ratio);
		}

		// きれいにリサイズするため、まずフル画像用の一時キャンバスを作成する
		// 直接スケーリングして描画することもできる。ピクセルアートには最近傍法が最適だが、
		// サムネイルにはスムージングの方がよい可能性がある。サムネイルは既定（スムージング）を使う。
		// ピクセルアートらしさを保つため最近傍法も考えられるが、一貫性のため最近傍法を使用する。

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
