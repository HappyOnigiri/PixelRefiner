import type {
	CandidatePreview,
	CandidateSelection,
	ProcessingWarningCode,
} from "../shared/types";
import { i18n } from "./i18n";
import { drawRawImageToCanvas } from "./io";
import { translateProcessingWarnings } from "./processing-warnings";

type TranslationKey = Parameters<typeof i18n.t>[0];

type CandidateChooserCallbacks = {
	onSelect: (
		selection: CandidateSelection,
		sourceImageId: string,
	) => Promise<void>;
};

/**
 * 結果パネル内に並ぶ「他の候補」。
 *
 * [Intended] モーダルではなく結果パネルの一部にする。候補はメイン画像へ反映して
 * 既存のズームで拡大しながら比べるものなので、フォーカスを奪って前面に出す必要がない。
 */
export class CandidateChooser {
	private section: HTMLElement;
	private list: HTMLElement;
	private reasons: HTMLElement;
	private callbacks: CandidateChooserCallbacks | null = null;
	private sourceImageId: string | null = null;

	constructor(section: HTMLElement) {
		this.section = section;
		this.list = this.get<HTMLElement>(".js-candidate-list");
		this.reasons = this.get<HTMLElement>(".js-candidate-reasons");
		this.section.addEventListener("keydown", (event) =>
			this.handleKeydown(event),
		);
	}

	private get<T extends HTMLElement>(selector: string): T {
		const element = this.section.querySelector(selector);
		if (!element)
			throw new Error(`Element ${selector} not found in candidates`);
		return element as T;
	}

	/** 表示中の候補が、どの画像に対する提案か。 */
	public getSourceImageId(): string | null {
		return this.sourceImageId;
	}

	public show(
		candidates: CandidatePreview[],
		warnings: ProcessingWarningCode[],
		sourceImageId: string,
		selectedId?: string,
	): void {
		this.list.replaceChildren();
		this.reasons.textContent = translateProcessingWarnings(warnings).join(" ");
		for (let index = 0; index < candidates.length; index += 1) {
			this.list.appendChild(this.createCard(candidates[index]));
		}
		this.sourceImageId = sourceImageId;
		this.section.hidden = candidates.length === 0;
		this.setSelected(selectedId);
	}

	/**
	 * 選択中のカードを強調する。
	 * [Intended] 未選択のときは Auto 結果がメイン画像に出ているので、その候補を選択中にする。
	 */
	public setSelected(selectedId?: string): void {
		const cards = this.list.querySelectorAll<HTMLButtonElement>(
			"button[data-candidate-id]",
		);
		for (const card of cards) {
			const isSelected =
				selectedId === undefined
					? card.dataset.autoResult === "true"
					: card.dataset.candidateId === selectedId;
			card.classList.toggle("is-selected", isSelected);
			card.setAttribute("aria-pressed", String(isSelected));
		}
	}

	/** 処理の開始やアクティブ画像の切替で閉じる。 */
	public dismiss(): void {
		if (this.section.hidden) return;
		this.section.hidden = true;
		this.list.replaceChildren();
		this.reasons.textContent = "";
		this.sourceImageId = null;
	}

	public setCallbacks(callbacks: CandidateChooserCallbacks): void {
		this.callbacks = callbacks;
	}

	/** カードの見出しと説明のキー。セル倍率は段階ごとに文言を分ける。 */
	private textKeys(candidate: CandidatePreview): {
		label: TranslationKey;
		description: TranslationKey;
	} {
		if (candidate.kind === "cell-scale") {
			const scale = candidate.cellScale ?? "same";
			return {
				label: `candidate.label.cell_scale.${scale}`,
				description: `candidate.description.cell_scale.${scale}`,
			};
		}
		return {
			label: `candidate.label.${candidate.kind}`,
			description: `candidate.description.${candidate.kind}`,
		};
	}

	private createCard(candidate: CandidatePreview): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "candidate-card";
		button.dataset.candidateId = candidate.id;
		if (candidate.kind === "auto-result") button.dataset.autoResult = "true";
		button.setAttribute("aria-pressed", "false");

		const preview = document.createElement("span");
		preview.className = "candidate-card-preview";
		const canvas = document.createElement("canvas");
		drawRawImageToCanvas(candidate.preview, canvas);
		preview.appendChild(canvas);

		const keys = this.textKeys(candidate);
		const details = document.createElement("span");
		details.className = "candidate-card-details";
		const heading = document.createElement("span");
		heading.className = "candidate-card-heading";
		heading.textContent = i18n.t(keys.label);
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
		description.textContent = i18n.t(keys.description);
		details.append(heading, metadata, description);
		button.append(preview, details);
		button.addEventListener("click", async () => {
			const sourceImageId = this.sourceImageId;
			if (!this.callbacks || !sourceImageId) return;
			// [Intended] 候補は選んだ後も並べたままにする。インライン表示では選び直しが
			// できることに意味があるので、選択の反映は強調表示の更新だけで行う。
			this.setSelected(candidate.id);
			await this.callbacks.onSelect(candidate, sourceImageId);
		});
		return button;
	}

	private handleKeydown(event: KeyboardEvent): void {
		// [Intended] 横並びのカード間は矢印キーで移動できるようにする（ツールバーと同じ操作）。
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
