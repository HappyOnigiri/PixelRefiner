import type { MessageCatalog, MessageEntry } from "./define-messages";
import { detectBrowserLanguage, isLanguage, type Language } from "./language";
import { appMessages } from "./messages";
// [Intended] 型だけを取り込むので、この import は実行時コードに残らない。
// guide.html 専用の文言を本体バンドルへ持ち込まずに、キー名だけを型へ通す。
import type { guideMessages } from "./messages/guide";

export type { MessageCatalog } from "./define-messages";
export type { Language } from "./language";

export type ResourceKey = keyof typeof appMessages | keyof typeof guideMessages;

export class I18nManager {
	currentLang: Language = "en";

	// キー -> 全言語の訳文。ページ固有の文言は registerMessages() で足す。
	private messages: MessageCatalog = { ...appMessages };

	constructor() {
		// localStorage が存在しない可能性がある環境（Vitest/Node など）を処理
		let saved: string | null = null;
		try {
			if (typeof localStorage !== "undefined") {
				saved = localStorage.getItem("pixel-refiner-lang");
			}
		} catch (_e) {
			// セキュリティエラーまたは localStorage 未存在を無視
		}

		this.currentLang = isLanguage(saved) ? saved : detectBrowserLanguage();
	}

	/**
	 * ページ固有のメッセージを追加登録する。
	 * updatePage() より前に呼ぶこと。
	 */
	registerMessages(messages: MessageCatalog) {
		Object.assign(this.messages, messages);
	}

	setLanguage(lang: Language) {
		this.currentLang = lang;
		try {
			if (typeof localStorage !== "undefined") {
				localStorage.setItem("pixel-refiner-lang", lang);
			}
		} catch (_e) {
			// 無視
		}
		this.updatePage();
	}

	// キーからテキストを取得
	t(key: ResourceKey, params?: Record<string, string | number>): string {
		const entry: MessageEntry | undefined = this.messages[key];
		const text = entry?.[this.currentLang] || key;
		if (params) {
			let interpolated = text;
			for (const [k, v] of Object.entries(params)) {
				interpolated = interpolated.replace(
					new RegExp(`\\{${k}\\}`, "g"),
					String(v),
				);
			}
			return interpolated;
		}
		return text;
	}

	// ページ全体の更新
	updatePage() {
		if (typeof document === "undefined") return;

		// 1. テキストコンテンツの更新 (innerHTML を使用してタグを維持)
		document.querySelectorAll("[data-i18n]").forEach((el) => {
			const key = el.getAttribute("data-i18n") as ResourceKey;
			if (key) {
				const text = this.t(key);
				if (el.hasAttribute("data-i18n-html")) {
					el.innerHTML = text;
				} else {
					el.textContent = text;
				}
			}
		});

		// 2. 属性の更新 (placeholder, titleなど)
		document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
			const config = el.getAttribute("data-i18n-attr");
			if (!config) return;

			for (const pair of config.split(",")) {
				const [attr, key] = pair.split(":");
				el.setAttribute(attr, this.t(key as ResourceKey));
			}
		});

		// htmlタグのlang属性更新
		document.documentElement.lang = this.currentLang;

		// 言語切り替えボタンのアクティブ状態更新
		document.querySelectorAll("[data-lang-btn]").forEach((el) => {
			const lang = el.getAttribute("data-lang-btn");
			el.classList.toggle("active", lang === this.currentLang);
		});
	}
}

export const i18n = new I18nManager();
