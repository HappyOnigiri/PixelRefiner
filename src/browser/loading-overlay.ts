import type { Elements } from "./app-elements";
import { i18n } from "./i18n";

export type LoadingOverlay = {
	/** 何枚目を処理しているかを添えて表示する */
	showProgress: (current: number, total: number) => void;
	/** 非表示にし、進捗テキストを既定の文言へ戻す */
	hide: () => void;
};

/**
 * 変換中に出す読み込みオーバーレイの操作をまとめる。
 * 進捗テキストの要素と文言のキーを 1 箇所に集め、呼び出し側ごとに再実装しない。
 */
export const createLoadingOverlay = (els: Elements): LoadingOverlay => {
	const setText = (text: string) => {
		const loadingText = els.loadingOverlay.querySelector(".loading-text");
		if (loadingText) loadingText.textContent = text;
	};

	return {
		showProgress: (current: number, total: number) => {
			els.loadingOverlay.style.display = "flex";
			setText(i18n.t("status.processing_batch", { current, total }));
		},
		hide: () => {
			els.loadingOverlay.style.display = "none";
			setText(i18n.t("status.processing"));
		},
	};
};
