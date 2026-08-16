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
		item.className = ["image-item", image.id === activeId ? "active" : ""]
			.filter(Boolean)
			.join(" ");
		item.dataset.status = image.status;
		// [Intended] 一覧では判定方式と信頼度を見せない。数値は達成率と誤読されやすく、
		// 判定の詳細は画像を選択したときの結果表示と診断サマリーが受け持つ。
		const statusLabel = i18n.t(`batch.status.${image.status}`);
		item.title = image.error
			? `${image.file.name}\n${statusLabel}\n${image.error}`
			: `${image.file.name}\n${statusLabel}`;
		item.setAttribute("aria-label", item.title);

		const thumbnail = document.createElement("img");
		thumbnail.src = image.thumbnail;
		item.appendChild(thumbnail);
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
