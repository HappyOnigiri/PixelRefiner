import type {
	CandidatePreview,
	CandidateSelection,
	ProcessingWarningCode,
} from "../shared/types";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import type { ModalController } from "./modal-controller";
import { translateProcessingWarnings } from "./processing-warnings";

type CandidateChooserCallbacks = {
	onSelect: (
		selection: CandidateSelection,
		sourceImageId: string,
	) => Promise<void>;
};

export class CandidateChooser {
	private modal: HTMLElement;
	private controller: ModalController;
	private list: HTMLElement;
	private reasons: HTMLElement;
	private callbacks: CandidateChooserCallbacks | null = null;
	private sourceImageId: string | null = null;

	constructor(modal: HTMLElement, controller: ModalController) {
		this.modal = modal;
		this.controller = controller;
		this.list = this.get<HTMLElement>(".js-candidate-list");
		this.reasons = this.get<HTMLElement>(".js-candidate-reasons");
		this.get<HTMLButtonElement>(".js-close-candidates").addEventListener(
			"click",
			() => this.hide(),
		);
		this.modal.addEventListener("click", (event) => {
			if (event.target === this.modal) this.hide();
		});
		this.modal.addEventListener("keydown", (event) =>
			this.handleKeydown(event),
		);
	}

	private get<T extends HTMLElement>(selector: string): T {
		const element = this.modal.querySelector(selector);
		if (!element)
			throw new Error(`Element ${selector} not found in candidates`);
		return element as T;
	}

	public setCallbacks(callbacks: CandidateChooserCallbacks): void {
		this.callbacks = callbacks;
	}

	public show(
		candidates: CandidatePreview[],
		warnings: ProcessingWarningCode[],
		sourceImageId: string,
	): void {
		this.list.replaceChildren();
		this.reasons.textContent = translateProcessingWarnings(warnings).join(" ");
		for (let index = 0; index < candidates.length; index += 1) {
			this.list.appendChild(this.createCard(candidates[index]));
		}
		this.sourceImageId = sourceImageId;
		this.controller.open();
		this.modal.setAttribute("aria-hidden", "false");
		// ModalController は open 時に rAF で閉じるボタンへフォーカスするため、
		// 先頭カードへ移すのはその後のフレームで行う。
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (this.controller.isOpen())
					this.list.querySelector<HTMLButtonElement>("button")?.focus();
			});
		});
	}

	/** ユーザー操作で閉じる。直前のフォーカス位置へ戻す。 */
	public hide(): void {
		this.close(true);
	}

	/** 処理の開始やアクティブ画像の切替で閉じる。フォーカスは動かさない。 */
	public dismiss(): void {
		this.close(false);
	}

	private close(restoreFocus: boolean): void {
		if (!this.controller.isOpen()) return;
		this.controller.close(restoreFocus);
		this.modal.setAttribute("aria-hidden", "true");
		this.sourceImageId = null;
	}

	private createCard(candidate: CandidatePreview): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "candidate-card";
		button.dataset.candidateId = candidate.id;

		const preview = document.createElement("span");
		preview.className = "candidate-card-preview";
		const canvas = document.createElement("canvas");
		drawRawImageToCanvas(candidate.preview, canvas);
		preview.appendChild(canvas);

		const details = document.createElement("span");
		details.className = "candidate-card-details";
		const heading = document.createElement("span");
		heading.className = "candidate-card-heading";
		heading.textContent = i18n.t(`candidate.label.${candidate.kind}`);
		if (candidate.recommended) {
			const badge = document.createElement("span");
			badge.className = "candidate-recommended";
			badge.textContent = i18n.t("candidate.recommended_badge");
			heading.appendChild(badge);
		}
		const metadata = document.createElement("span");
		metadata.className = "candidate-card-metadata";
		metadata.textContent = i18n.t("candidate.metadata", {
			width: candidate.resultWidth,
			height: candidate.resultHeight,
			colors: candidate.colorCount,
		});
		const description = document.createElement("span");
		description.className = "candidate-card-description";
		description.textContent = i18n.t(`candidate.description.${candidate.kind}`);
		details.append(heading, metadata, description);
		button.append(preview, details);
		button.addEventListener("click", async () => {
			const sourceImageId = this.sourceImageId;
			if (!this.callbacks || !sourceImageId) return;
			this.hide();
			await this.callbacks.onSelect(candidate, sourceImageId);
		});
		return button;
	}

	private handleKeydown(event: KeyboardEvent): void {
		// Escape と Tab のフォーカストラップは ModalController が処理する。
		if (
			!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
		)
			return;
		const buttons = Array.from(
			this.list.querySelectorAll<HTMLButtonElement>("button"),
		);
		const current = buttons.indexOf(
			document.activeElement as HTMLButtonElement,
		);
		if (current < 0) return;
		event.preventDefault();
		const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
		buttons[(current + step + buttons.length) % buttons.length].focus();
	}
}
