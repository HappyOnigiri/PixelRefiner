import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	RESULT_LABEL_DURATION_MS,
	setupLanguageButtons,
	setupPromptCopyButtons,
} from "./guide-controls";
import { i18n, type Language } from "./i18n";
import { guideMessages } from "./i18n/messages/guide";

// guide.html のエントリと同じく、レシピ集の文言を登録してから検証する
i18n.registerMessages(guideMessages);

type FakeElement = {
	attributes: Map<string, string>;
	textContent: string;
	getAttribute: (name: string) => string | null;
	setAttribute: (name: string, value: string) => void;
	hasAttribute: (name: string) => boolean;
	addEventListener: (type: string, listener: () => unknown) => void;
	classList: { toggle: (name: string, force: boolean) => void };
	closest: (selector: string) => FakeElement | null;
	querySelector: (selector: string) => { textContent: string | null } | null;
	click: () => Promise<void>;
};

const createElement = (
	attributes: Record<string, string>,
	prompt: string | null,
): FakeElement => {
	const listeners: (() => unknown)[] = [];
	const element: FakeElement = {
		attributes: new Map(Object.entries(attributes)),
		textContent: "",
		getAttribute: (name) => element.attributes.get(name) ?? null,
		setAttribute: (name, value) => {
			element.attributes.set(name, value);
		},
		hasAttribute: (name) => element.attributes.has(name),
		addEventListener: (type, listener) => {
			if (type === "click") listeners.push(listener);
		},
		classList: { toggle: () => {} },
		// プロンプト本体はボタンの祖先にある [data-prompt-block] の <code> に入っている
		closest: (selector) => (selector === "[data-prompt-block]" ? block : null),
		querySelector: () => null,
		click: async () => {
			for (const listener of listeners) await listener();
		},
	};
	const block = {
		...element,
		querySelector: (selector: string) =>
			selector === "code" ? { textContent: prompt } : null,
	};
	return element;
};

const stubPage = (elements: Record<string, FakeElement[]>) => {
	const documentElement = { lang: "" };
	vi.stubGlobal("document", {
		documentElement,
		querySelectorAll: (selector: string) => elements[selector] ?? [],
	});
	return documentElement;
};

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
	vi.useFakeTimers();
	writeText.mockReset();
	writeText.mockResolvedValue(undefined);
	vi.stubGlobal("navigator", { clipboard: { writeText } });
	vi.stubGlobal("window", {
		setTimeout: (handler: () => void, delay: number) =>
			setTimeout(handler, delay),
		clearTimeout: (id: number | undefined) => {
			clearTimeout(id);
		},
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	i18n.setLanguage("en");
});

describe("setupPromptCopyButtons", () => {
	it("copies the prompt and restores the label after the result is shown", async () => {
		const button = createElement({ "data-copy-prompt": "" }, "a knight");
		stubPage({ "[data-copy-prompt]": [button] });
		setupPromptCopyButtons();

		await button.click();

		expect(writeText).toHaveBeenCalledWith("a knight");
		expect(button.textContent).toBe(i18n.t("guide.copied"));
		expect(button.getAttribute("aria-live")).toBe("polite");

		vi.advanceTimersByTime(RESULT_LABEL_DURATION_MS);
		expect(button.textContent).toBe(i18n.t("guide.copy_prompt"));
	});

	it("tells the reader to select the text when the clipboard is unavailable", async () => {
		writeText.mockRejectedValue(new Error("denied"));
		const button = createElement({ "data-copy-prompt": "" }, "a potion");
		stubPage({ "[data-copy-prompt]": [button] });
		setupPromptCopyButtons();

		await button.click();

		expect(button.textContent).toBe(i18n.t("guide.copy_failed"));

		vi.advanceTimersByTime(RESULT_LABEL_DURATION_MS);
		expect(button.textContent).toBe(i18n.t("guide.copy_prompt"));
	});

	it("keeps the label unchanged when the block holds no prompt", async () => {
		const button = createElement({ "data-copy-prompt": "" }, null);
		stubPage({ "[data-copy-prompt]": [button] });
		setupPromptCopyButtons();

		await button.click();

		expect(writeText).not.toHaveBeenCalled();
		expect(button.textContent).toBe("");
	});

	it("restarts the timer so a second click keeps the result visible", async () => {
		const button = createElement({ "data-copy-prompt": "" }, "a dragon");
		stubPage({ "[data-copy-prompt]": [button] });
		setupPromptCopyButtons();

		await button.click();
		vi.advanceTimersByTime(RESULT_LABEL_DURATION_MS - 100);
		await button.click();
		vi.advanceTimersByTime(RESULT_LABEL_DURATION_MS - 100);

		expect(button.textContent).toBe(i18n.t("guide.copied"));

		vi.advanceTimersByTime(100);
		expect(button.textContent).toBe(i18n.t("guide.copy_prompt"));
	});
});

describe("setupLanguageButtons", () => {
	it("switches the display language to the one the button carries", async () => {
		const button = createElement({ "data-lang-btn": "ja" }, null);
		const documentElement = stubPage({
			"[data-lang-btn]": [button],
			"[data-i18n]": [],
			"[data-i18n-attr]": [],
		});
		setupLanguageButtons();

		await button.click();

		expect(i18n.currentLang).toBe<Language>("ja");
		expect(documentElement.lang).toBe("ja");
	});
});
