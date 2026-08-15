import { inject } from "@vercel/analytics";
import { i18n, type Language } from "./i18n";
import { initTheme } from "./theme";

// [Intended] CSS は guide.html の <link> で読み込む。
// JS から import すると dev で描画後にスタイルが当たり、FOUC になる。

// コピー結果の表示を元のラベルへ戻すまでの時間
const RESULT_LABEL_DURATION_MS = 1500;

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
		// [Intended] 結果はボタンのラベルだけで伝わるので、ボタン自身を
		// 読み上げ対象にする。成功と失敗で別の領域を用意しない。
		button.setAttribute("aria-live", "polite");
		let resetTimer: number | undefined;
		const showResult = (key: "guide.copied" | "guide.copy_failed"): void => {
			button.textContent = i18n.t(key);
			window.clearTimeout(resetTimer);
			resetTimer = window.setTimeout(() => {
				button.textContent = i18n.t("guide.copy_prompt");
			}, RESULT_LABEL_DURATION_MS);
		};
		button.addEventListener("click", async () => {
			const prompt = button
				.closest("[data-prompt-block]")
				?.querySelector("code")?.textContent;
			if (!prompt) return;
			try {
				await navigator.clipboard.writeText(prompt);
			} catch {
				// クリップボードを使えない環境では、手動で選択する必要があることを伝える。
				showResult("guide.copy_failed");
				return;
			}
			showResult("guide.copied");
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
