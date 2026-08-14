import { inject } from "@vercel/analytics";
import { i18n, type Language } from "./i18n";
import { initTheme } from "./theme";
import "./style.css";
import "./guide.css";

// コピー完了の表示を元のラベルへ戻すまでの時間
const COPIED_LABEL_DURATION_MS = 1500;

// 言語切替ボタンを本体アプリと同じ data-lang-btn の規約で配線する
const setupLanguageButtons = (): void => {
	for (const button of document.querySelectorAll("[data-lang-btn]")) {
		button.addEventListener("click", () => {
			const lang = button.getAttribute("data-lang-btn") as Language | null;
			if (lang) i18n.setLanguage(lang);
		});
	}
};

// プロンプトをクリップボードへコピーする
const setupPromptCopyButtons = (): void => {
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		"[data-copy-prompt]",
	)) {
		let resetTimer: number | undefined;
		button.addEventListener("click", async () => {
			const prompt = button
				.closest("[data-prompt-block]")
				?.querySelector("code")?.textContent;
			if (!prompt) return;
			try {
				await navigator.clipboard.writeText(prompt);
			} catch {
				// [Workaround] クリップボードを使えない環境では表示を変えず、
				// 利用者が手動で選択してコピーできる状態のままにする。
				return;
			}
			button.textContent = i18n.t("guide.copied");
			window.clearTimeout(resetTimer);
			resetTimer = window.setTimeout(() => {
				button.textContent = i18n.t("guide.copy_prompt");
			}, COPIED_LABEL_DURATION_MS);
		});
	}
};

// [Policy] 読み物ページなので画像処理系のモジュールは読み込まない。
initTheme();
inject();

window.addEventListener("DOMContentLoaded", () => {
	setupLanguageButtons();
	setupPromptCopyButtons();
	// [Intended] <title> にも data-i18n を付けているため、
	// updatePage() だけで document.title まで言語に追従する。
	i18n.updatePage();
});
