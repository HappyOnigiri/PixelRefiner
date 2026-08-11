interface TranslationTree {
	[key: string]: string | TranslationTree;
}

declare global {
	interface Window {
		__QUALITY_REPORT_TRANSLATIONS__: Record<string, TranslationTree>;
	}
}

// [Intended] この自己完結した関数は各静的レポートへシリアライズされる。
export const runQualityReportClient = (): void => {
	const translations = window.__QUALITY_REPORT_TRANSLATIONS__;
	const preferredLanguage = (
		navigator.languages?.[0] ??
		navigator.language ??
		"en"
	).toLowerCase();
	let locale = preferredLanguage.startsWith("ja")
		? "ja"
		: preferredLanguage.startsWith("zh")
			? "zh-CN"
			: "en";
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
		refreshFilter();
	};
	for (const button of localeButtons) {
		button.addEventListener("click", () =>
			setLocale(button.dataset.locale ?? "en"),
		);
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
		const filterStorageKey = "pixel-refiner-quality-report-filters";
		type SavedFilterState = {
			search: string;
			groups: Record<string, string>;
		};
		const isRecord = (value: unknown): value is Record<string, unknown> =>
			typeof value === "object" && value !== null && !Array.isArray(value);
		// [Workaround] file:// やプライベートブラウジングで保存領域が使えない場合も、
		// レポートの絞り込み自体は継続できるように保存処理だけを無効化する。
		const storage: Storage | null = (() => {
			try {
				return window.localStorage;
			} catch {
				return null;
			}
		})();
		const emptyFilterState = (): SavedFilterState => ({
			search: "",
			groups: {},
		});
		const readFilterState = (): SavedFilterState => {
			if (!storage) return emptyFilterState();
			try {
				const saved: unknown = JSON.parse(
					storage.getItem(filterStorageKey) ?? "null",
				);
				if (!isRecord(saved)) return emptyFilterState();
				const groups: Record<string, string> = {};
				if (isRecord(saved.groups)) {
					for (const [name, value] of Object.entries(saved.groups)) {
						if (typeof value === "string") groups[name] = value;
					}
				}
				return {
					search: typeof saved.search === "string" ? saved.search : "",
					groups,
				};
			} catch {
				return emptyFilterState();
			}
		};
		const savedFilterState = readFilterState();
		search.value = savedFilterState.search;
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
			const savedActive = savedFilterState.groups[group.name];
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
			if (!storage) return;
			try {
				const savedGroups: Record<string, string> = {};
				for (const group of groups) savedGroups[group.name] = group.active;
				storage.setItem(
					filterStorageKey,
					JSON.stringify({ search: search.value, groups: savedGroups }),
				);
			} catch {
				// [Intended] 保存できない環境でも、画面上の絞り込みは妨げない。
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
