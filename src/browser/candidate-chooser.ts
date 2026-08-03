import type {
	CandidatePreview,
	CandidateSelection,
	ProcessingWarningCode,
} from "../shared/types";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { translateProcessingWarnings } from "./processing-warnings";

type CandidateChooserCallbacks = {
	onSelect: (selection: CandidateSelection) => Promise<void>;
};

export class CandidateChooser {
	private modal: HTMLElement;
	private list: HTMLElement;
	private reasons: HTMLElement;
	private closeButton: HTMLButtonElement;
	private callbacks: CandidateChooserCallbacks | null = null;
	private previousFocus: HTMLElement | null = null;

	constructor(modal: HTMLElement) {
		this.modal = modal;
		this.list = this.get<HTMLElement>(".js-candidate-list");
		this.reasons = this.get<HTMLElement>(".js-candidate-reasons");
		this.closeButton = this.get<HTMLButtonElement>(".js-close-candidates");
		this.closeButton.addEventListener("click", () => this.hide());
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
	): void {
		this.list.replaceChildren();
		this.reasons.textContent = translateProcessingWarnings(warnings).join(" ");
		for (let index = 0; index < candidates.length; index += 1) {
			this.list.appendChild(this.createCard(candidates[index]));
		}
		this.previousFocus = document.activeElement as HTMLElement | null;
		this.modal.style.display = "flex";
		this.modal.setAttribute("aria-hidden", "false");
		this.list.querySelector<HTMLButtonElement>("button")?.focus();
	}

	public hide(): void {
		if (this.modal.style.display === "none") return;
		this.modal.style.display = "none";
		this.modal.setAttribute("aria-hidden", "true");
		this.previousFocus?.focus();
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
			if (!this.callbacks) return;
			this.hide();
			await this.callbacks.onSelect(candidate);
		});
		return button;
	}

	private handleKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			event.preventDefault();
			this.hide();
			return;
		}
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
