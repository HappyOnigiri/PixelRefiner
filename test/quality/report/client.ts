import {
	type ColorTheme,
	THEME_MEDIA_QUERY,
	THEME_QUERY_PARAMETER,
	THEME_STORAGE_KEY,
} from "../../../src/shared/theme";

interface TranslationTree {
	[key: string]: string | TranslationTree;
}

export type QualityReportThemeConfig = {
	storageKey: string;
	queryParameter: string;
	mediaQuery: string;
};

export const QUALITY_REPORT_THEME_CONFIG: QualityReportThemeConfig = {
	storageKey: THEME_STORAGE_KEY,
	queryParameter: THEME_QUERY_PARAMETER,
	mediaQuery: THEME_MEDIA_QUERY,
};

declare global {
	interface Window {
		__QUALITY_REPORT_TRANSLATIONS__: Record<string, TranslationTree>;
		__QUALITY_REPORT_THEME__?: {
			theme: ColorTheme;
			queryPinned: boolean;
		};
	}
}

// [Intended] 本体の描画前にテーマを確定できるよう、この自己完結した関数だけを head へ埋め込む。
export const applyInitialQualityReportTheme = (
	config: QualityReportThemeConfig,
): void => {
	const isTheme = (value: string | null): value is ColorTheme =>
		value === "light" || value === "dark";
	const requestedTheme = new URLSearchParams(window.location.search).get(
		config.queryParameter,
	);
	let storedTheme: string | null = null;
	try {
		storedTheme = window.localStorage?.getItem(config.storageKey) ?? null;
	} catch {
		// [Workaround] file:// など保存領域を利用できない環境でもレポートを表示する。
	}
	const queryTheme = isTheme(requestedTheme) ? requestedTheme : null;
	const savedTheme = isTheme(storedTheme) ? storedTheme : null;
	const prefersDark =
		typeof window.matchMedia === "function" &&
		window.matchMedia(config.mediaQuery).matches;
	const theme = queryTheme ?? savedTheme ?? (prefersDark ? "dark" : "light");
	document.documentElement.dataset.theme = theme;
	document.documentElement.style.colorScheme = theme;
	window.__QUALITY_REPORT_THEME__ = {
		theme,
		queryPinned: queryTheme !== null,
	};
};

// [Intended] この自己完結した関数は各静的レポートへシリアライズされる。
export const runQualityReportClient = (
	config: QualityReportThemeConfig,
): void => {
	const isTheme = (value: string | null): value is ColorTheme =>
		value === "light" || value === "dark";
	const requestedTheme = new URLSearchParams(window.location.search).get(
		config.queryParameter,
	);
	let storedTheme: string | null = null;
	try {
		storedTheme = window.localStorage?.getItem(config.storageKey) ?? null;
	} catch {
		// [Workaround] 保存領域を利用できない環境でもテーマ切り替えを妨げない。
	}
	const queryTheme = isTheme(requestedTheme) ? requestedTheme : null;
	const savedTheme = isTheme(storedTheme) ? storedTheme : null;
	const themeMediaQuery =
		typeof window.matchMedia === "function"
			? window.matchMedia(config.mediaQuery)
			: null;
	const themePinned =
		window.__QUALITY_REPORT_THEME__?.queryPinned ?? queryTheme !== null;
	let themeManuallySelected = themePinned || savedTheme !== null;
	let theme =
		window.__QUALITY_REPORT_THEME__?.theme ??
		queryTheme ??
		savedTheme ??
		(themeMediaQuery?.matches === true ? "dark" : "light");
	document.documentElement.dataset.theme = theme;
	document.documentElement.style.colorScheme = theme;

	const translations = window.__QUALITY_REPORT_TRANSLATIONS__;
	const preferredLanguage = (
		navigator.languages?.[0] ??
		navigator.language ??
		"en"
	).toLowerCase();
	// [Intended] 言語切り替えは一覧のサイドバーにしかないので、選択結果をクエリで運んで
	// ケース詳細へ引き継ぐ。ブラウザ言語のままなら遷移先でも同じ判定になるため、
	// 明示的に選ばれた言語だけをクエリとリンクに残す。
	const requestedLocale = new URLSearchParams(window.location.search).get(
		"locale",
	);
	const pinnedLocale =
		requestedLocale !== null && requestedLocale in translations
			? requestedLocale
			: null;
	let localePinned = pinnedLocale !== null;
	let locale =
		pinnedLocale ??
		(preferredLanguage.startsWith("ja")
			? "ja"
			: preferredLanguage.startsWith("zh")
				? "zh-CN"
				: "en");
	let messages = translations[locale];

	const translate = (key: string): string | undefined => {
		let value: string | Record<string, unknown> | undefined = messages;
		for (const part of key.split(".")) {
			if (typeof value !== "object" || value === null) return undefined;
			value = value[part] as string | Record<string, unknown> | undefined;
		}
		return typeof value === "string" ? value : undefined;
	};

	const applyTranslations = (): void => {
		document.documentElement.lang = locale;
		for (const element of document.querySelectorAll<HTMLElement>(
			"[data-i18n]",
		)) {
			element.textContent =
				translate(element.dataset.i18n ?? "") ?? element.textContent;
		}
		for (const element of document.querySelectorAll<HTMLImageElement>(
			"[data-i18n-alt]",
		)) {
			element.alt = translate(element.dataset.i18nAlt ?? "") ?? element.alt;
		}
		for (const element of document.querySelectorAll<HTMLInputElement>(
			"[data-i18n-placeholder]",
		)) {
			element.placeholder =
				translate(element.dataset.i18nPlaceholder ?? "") ?? element.placeholder;
		}
		for (const element of document.querySelectorAll<HTMLElement>(
			"[data-description-en]",
		)) {
			element.textContent =
				locale === "ja"
					? (element.dataset.descriptionJa ?? element.textContent)
					: (element.dataset.descriptionEn ?? element.textContent);
		}
	};

	const localeButtons = [
		...document.querySelectorAll<HTMLButtonElement>("[data-locale]"),
	];
	const localeLinks = [
		...document.querySelectorAll<HTMLAnchorElement>(
			"a.detail-link, a.back-link",
		),
	];
	const setLinkParameter = (
		link: HTMLAnchorElement,
		name: string,
		value: string,
	): void => {
		const href = link.getAttribute("href");
		if (href === null) return;
		// [Intended] 相対URLのままクエリだけを更新し、file:// レポートのリンクを維持する。
		const [target, hash] = href.split("#");
		const [pathOnly, query = ""] = target.split("?");
		const params = new URLSearchParams(query);
		params.set(name, value);
		link.setAttribute(
			"href",
			`${pathOnly}?${params.toString()}` +
				(hash === undefined ? "" : `#${hash}`),
		);
	};
	const replaceCurrentParameter = (name: string, value: string): void => {
		try {
			const url = new URL(window.location.href);
			url.searchParams.set(name, value);
			window.history.replaceState(
				null,
				"",
				`${url.pathname}${url.search}${url.hash}`,
			);
		} catch {
			// [Workaround] URLを更新できない環境でも、画面上の切り替えは妨げない。
		}
	};
	const themeToggle = document.querySelector<HTMLButtonElement>(
		"[data-theme-toggle]",
	);
	const applyTheme = (nextTheme: ColorTheme): void => {
		theme = nextTheme;
		document.documentElement.dataset.theme = theme;
		document.documentElement.style.colorScheme = theme;
		window.__QUALITY_REPORT_THEME__ = { theme, queryPinned: themePinned };
		if (!themeToggle) return;
		themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
		for (const icon of themeToggle.querySelectorAll<SVGElement>(
			"[data-theme-icon]",
		)) {
			icon.toggleAttribute("hidden", icon.dataset.themeIcon !== theme);
		}
	};
	const persistThemeQuery = (): void => {
		for (const link of localeLinks) {
			setLinkParameter(link, config.queryParameter, theme);
		}
		replaceCurrentParameter(config.queryParameter, theme);
	};
	applyTheme(theme);
	if (themePinned) {
		for (const link of localeLinks) {
			setLinkParameter(link, config.queryParameter, theme);
		}
	}
	themeToggle?.addEventListener("click", () => {
		themeManuallySelected = true;
		applyTheme(theme === "light" ? "dark" : "light");
		try {
			window.localStorage?.setItem(config.storageKey, theme);
		} catch {
			// [Workaround] 保存に失敗しても現在のレポートでは選択を維持する。
		}
		if (themePinned) persistThemeQuery();
	});
	themeMediaQuery?.addEventListener("change", (event) => {
		if (!themeManuallySelected) applyTheme(event.matches ? "dark" : "light");
	});

	const persistLocale = (): void => {
		for (const link of localeLinks) {
			setLinkParameter(link, "locale", locale);
		}
		replaceCurrentParameter("locale", locale);
	};
	let refreshFilter = (): void => {};
	const setLocale = (nextLocale: string): void => {
		if (!(nextLocale in translations)) return;
		locale = nextLocale;
		messages = translations[locale];
		applyTranslations();
		for (const button of localeButtons) {
			const active = button.dataset.locale === locale;
			button.classList.toggle("active", active);
			button.setAttribute("aria-pressed", String(active));
		}
		if (localePinned) persistLocale();
		refreshFilter();
	};
	for (const button of localeButtons) {
		button.addEventListener("click", () => {
			localePinned = true;
			setLocale(button.dataset.locale ?? "en");
		});
	}
	setLocale(locale);

	const fitImage = (image: HTMLImageElement): void => {
		if (!image.naturalWidth || !image.naturalHeight) return;
		const stage = image.parentElement;
		if (!stage) return;
		const scale = Math.min(
			stage.clientWidth / image.naturalWidth,
			stage.clientHeight / image.naturalHeight,
		);
		image.style.width = `${image.naturalWidth * scale}px`;
		image.style.height = `${image.naturalHeight * scale}px`;
	};
	const reportImages = [
		...document.querySelectorAll<HTMLImageElement>(".images img"),
	];
	for (const image of reportImages) {
		image.addEventListener("load", () => fitImage(image));
		if (image.complete) fitImage(image);
	}
	window.addEventListener("resize", () => {
		for (const image of reportImages) fitImage(image);
	});

	const search = document.querySelector<HTMLInputElement>("#search");
	if (search) {
		const cards = [...document.querySelectorAll<HTMLElement>(".case")];
		const visibleCount = document.querySelector<HTMLElement>("#visible-count");
		// [Intended] 絞り込みの軸はすべて同じ形（data-<name>-filter のボタン群 ×
		// カードの data-<name>）なので、軸ごとに同じ処理を書かず名前だけで束ねる。
		// 軸を増やすときはこの配列に名前を足すだけで済む。
		const groups = ["quality", "change", "parameter"].map((name) => ({
			name,
			buttons: [
				...document.querySelectorAll<HTMLButtonElement>(
					`[data-${name}-filter]`,
				),
			],
			label: document.querySelector<HTMLElement>(`#active-${name}-label`),
			active: "",
		}));
		type FilterState = {
			search: string;
			groups: Record<string, string>;
		};
		const readFilterState = (): FilterState => {
			const params = new URLSearchParams(window.location.search);
			const savedGroups: Record<string, string> = {};
			for (const group of groups) {
				const active = params.get(group.name);
				if (active !== null) savedGroups[group.name] = active;
			}
			return {
				search: params.get("search") ?? "",
				groups: savedGroups,
			};
		};
		const initialFilterState = readFilterState();
		search.value = initialFilterState.search;
		const setGroupActive = (
			group: (typeof groups)[number],
			button: HTMLButtonElement,
		): void => {
			group.active = button.dataset[`${group.name}Filter`] ?? "";
			for (const other of group.buttons) {
				const active = other === button;
				other.classList.toggle("active", active);
				other.setAttribute("aria-pressed", String(active));
			}
		};
		for (const group of groups) {
			const savedActive = initialFilterState.groups[group.name];
			const button =
				group.buttons.find(
					(candidate) =>
						candidate.dataset[`${group.name}Filter`] === savedActive,
				) ??
				group.buttons.find(
					(candidate) => candidate.dataset[`${group.name}Filter`] === "",
				);
			if (button) setGroupActive(group, button);
		}
		const saveFilterState = (): void => {
			try {
				const url = new URL(window.location.href);
				url.searchParams.delete("search");
				for (const group of groups) url.searchParams.delete(group.name);
				if (search.value) url.searchParams.set("search", search.value);
				for (const group of groups) {
					if (group.active) url.searchParams.set(group.name, group.active);
				}
				// [Intended] URLに状態を残し、更新や共有リンクから同じ条件を復元する。
				window.history.replaceState(
					null,
					"",
					`${url.pathname}${url.search}${url.hash}`,
				);
			} catch {
				// [Workaround] URLを更新できない環境でも、画面上の絞り込みは妨げない。
			}
		};

		refreshFilter = (): void => {
			const text = search.value.toLowerCase();
			let visible = 0;
			for (const card of cards) {
				const matchesText = (card.dataset.search ?? "")
					.toLowerCase()
					.includes(text);
				const matchesGroups = groups.every(
					(group) => !group.active || card.dataset[group.name] === group.active,
				);
				card.hidden = !(matchesText && matchesGroups);
				if (!card.hidden) visible += 1;
			}
			for (const group of groups) {
				if (!group.label) continue;
				group.label.textContent =
					group.buttons
						.find(
							(button) =>
								button.dataset[`${group.name}Filter`] === group.active,
						)
						?.querySelector<HTMLElement>("[data-i18n]")?.textContent ?? "";
			}
			if (visibleCount) visibleCount.textContent = String(visible);
		};
		search.addEventListener("input", () => {
			saveFilterState();
			refreshFilter();
		});
		for (const group of groups) {
			for (const button of group.buttons) {
				button.addEventListener("click", () => {
					setGroupActive(group, button);
					saveFilterState();
					refreshFilter();
				});
			}
		}
		refreshFilter();
	}

	const dialog = document.querySelector<HTMLDialogElement>("#image-dialog");
	const dialogImage = dialog?.querySelector<HTMLImageElement>("img");
	if (dialog && dialogImage) {
		dialogImage.addEventListener("load", () => fitImage(dialogImage));
		for (const source of reportImages) {
			source.addEventListener("click", () => {
				dialogImage.src = source.src;
				dialogImage.alt = source.alt;
				dialog.showModal();
				requestAnimationFrame(() => fitImage(dialogImage));
			});
		}
		dialog.addEventListener("click", (event) => {
			if (event.target === dialog) dialog.close();
		});
		document
			.querySelector<HTMLButtonElement>("#dialog-close")
			?.addEventListener("click", () => dialog.close());
	}
};
