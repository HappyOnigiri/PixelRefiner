import { i18n } from "./i18n";
import type { ImageItem } from "./session";

type BatchImageListOptions = {
	container: HTMLElement;
	images: readonly ImageItem[];
	activeId: string | undefined;
	onSelect: (id: string) => void;
	onRemove: (id: string) => void;
};

export const renderBatchImageList = ({
	container,
	images,
	activeId,
	onSelect,
	onRemove,
}: BatchImageListOptions): void => {
	container.innerHTML = "";
	for (let index = 0; index < images.length; index += 1) {
		const image = images[index];
		const item = document.createElement("div");
		item.className = [
			"image-item",
			image.id === activeId ? "active" : "",
			image.attention ? "attention" : "",
		]
			.filter(Boolean)
			.join(" ");
		item.dataset.status = image.status;
		const confidence =
			image.analysis?.classificationConfidence ?? image.analysis?.confidence;
		const diagnostic = image.analysis
			? `${i18n.t(`batch.route.${image.analysis.route}`)} ${Math.round((confidence ?? 0) * 100)}%`
			: i18n.t(`batch.status.${image.status}`);
		item.title = image.error
			? `${image.file.name}\n${diagnostic}\n${image.error}`
			: `${image.file.name}\n${diagnostic}`;
		item.setAttribute("aria-label", item.title);

		const thumbnail = document.createElement("img");
		thumbnail.src = image.thumbnail;
		item.appendChild(thumbnail);
		const diagnosticLabel = document.createElement("div");
		diagnosticLabel.className = "image-item-diagnostic";
		diagnosticLabel.textContent = diagnostic;
		item.appendChild(diagnosticLabel);
		const status = document.createElement("div");
		status.className = "status-indicator";
		item.appendChild(status);

		const remove = document.createElement("button");
		remove.className = "remove-btn";
		remove.textContent = "×";
		remove.title = i18n.t("ui.remove_image");
		remove.addEventListener("click", (event) => {
			event.stopPropagation();
			onRemove(image.id);
		});
		item.appendChild(remove);
		item.addEventListener("click", () => onSelect(image.id));
		container.appendChild(item);
	}
};
