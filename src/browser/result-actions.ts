import { upscaleNearest } from "../core/ops";
import type { Elements } from "./app-elements";
import { drawRawImageToCanvas } from "./io";
import type { ModalController } from "./modal-controller";
import type { ResultViewer } from "./result-viewer";
import type { ImageSession } from "./session";

type ResultActionsOptions = {
	els: Elements;
	imageSession: ImageSession;
	mainResultViewer: ResultViewer;
	modalResultViewer: ResultViewer;
	resultModalController: ModalController;
	openCompareModal: () => void;
	closeResultModal: () => void;
	syncViewers: (
		source: ResultViewer,
		target: ResultViewer,
		bgType?: string,
		zoom?: boolean,
		grid?: boolean,
	) => void;
};

export const setupResultActions = ({
	els,
	imageSession,
	mainResultViewer,
	modalResultViewer,
	resultModalController,
	openCompareModal,
	closeResultModal,
	syncViewers,
}: ResultActionsOptions): void => {
	const getTimestampString = (): string => {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");
		return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
	};

	const handleDownload = (scale: number) => {
		const currentResult = imageSession.getActiveImage()?.result;
		if (!currentResult) return;

		const timestamp = getTimestampString();
		let link: HTMLAnchorElement;
		if (scale === 1) {
			link = document.createElement("a");
			link.download = `refined_${timestamp}.png`;
			link.href = els.originalCanvas.toDataURL("image/png"); // フォールバックか現在の結果か？
			// 待って、結果画像のデータ URL が必要である。
			// currentResult は RawImage のため、URL を取得するにはキャンバスへ描画する必要がある。
			// 画像が存在することを確信できれば、一時キャンバスまたは既存のキャンバスを使用できる。
			// ResultViewer はキャンバスを持つが、ここはその外部である。
			// 一時キャンバスのヘルパーまたは drawRawImageToCanvas を使用する。
			const tempCanvas = document.createElement("canvas");
			drawRawImageToCanvas(currentResult, tempCanvas);
			link.href = tempCanvas.toDataURL("image/png");
		} else {
			const upscaled = upscaleNearest(currentResult, scale);
			const tempCanvas = document.createElement("canvas");
			drawRawImageToCanvas(upscaled, tempCanvas);
			link = document.createElement("a");
			link.download = `refined_x${scale}_${timestamp}.png`;
			link.href = tempCanvas.toDataURL("image/png");
		}
		link.click();
	};

	// 外側をクリックしたときにメニューを閉じる
	document.addEventListener("click", () => {
		els.downloadMenu.classList.remove("show");
		els.downloadAllMenu.classList.remove("show");
	});

	mainResultViewer.setCallbacks({
		onBgChange: (bg) => syncViewers(mainResultViewer, modalResultViewer, bg),
		onZoomToggle: (z) =>
			syncViewers(mainResultViewer, modalResultViewer, undefined, z),
		onGridToggle: (g) =>
			syncViewers(mainResultViewer, modalResultViewer, undefined, undefined, g),
		onDownload: (scale) => handleDownload(scale),
		onCompare: () => openCompareModal(),
		onImageClick: () => {
			resultModalController.open();
			// モーダル表示時にグリッドなどの描画を更新する（サイズが異なるため）
			requestAnimationFrame(() => {
				modalResultViewer.drawGrid();
			});
		},
	});

	modalResultViewer.setCallbacks({
		onBgChange: (bg) => syncViewers(modalResultViewer, mainResultViewer, bg),
		onZoomToggle: (z) =>
			syncViewers(modalResultViewer, mainResultViewer, undefined, z),
		onGridToggle: (g) =>
			syncViewers(modalResultViewer, mainResultViewer, undefined, undefined, g),
		onDownload: (scale) => handleDownload(scale),
		onCompare: () => {
			closeResultModal();
			openCompareModal();
		},
	});
};
