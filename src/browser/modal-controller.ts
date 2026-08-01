const getFocusableElements = (root: HTMLElement): HTMLElement[] => {
	const nodes = Array.from(
		root.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		),
	);
	return nodes.filter((el) => {
		if (el.hasAttribute("disabled")) return false;
		if (el.getAttribute("aria-hidden") === "true") return false;
		// Skip elements that are not visible
		return el.offsetParent !== null || el === document.activeElement;
	});
};

export type ModalController = {
	open: () => void;
	close: () => void;
	isOpen: () => boolean;
};

export const createModalControllerFactory = (appRoot: HTMLElement | null) => {
	let openModalCount = 0;

	const setModalOpenState = (isOpen: boolean) => {
		openModalCount += isOpen ? 1 : -1;
		openModalCount = Math.max(0, openModalCount);

		document.body.classList.toggle("modal-open", openModalCount > 0);
		if (appRoot) {
			if (openModalCount > 0) {
				appRoot.setAttribute("aria-hidden", "true");
			} else {
				appRoot.removeAttribute("aria-hidden");
			}
		}
	};

	return (
		modalEl: HTMLElement,
		closeBtn: HTMLElement | null,
	): ModalController => {
		let lastFocused: HTMLElement | null = null;
		let abort: AbortController | null = null;

		const focusInitial = () => {
			(closeBtn ?? getFocusableElements(modalEl)[0] ?? modalEl).focus();
		};

		const open = () => {
			if (modalEl.style.display !== "none") return;
			lastFocused = document.activeElement as HTMLElement | null;
			modalEl.style.display = "flex";
			setModalOpenState(true);

			abort?.abort();
			abort = new AbortController();

			modalEl.addEventListener(
				"keydown",
				(e) => {
					if (e.key === "Escape") {
						e.stopPropagation();
						close();
						return;
					}
					if (e.key !== "Tab") return;

					const focusables = getFocusableElements(modalEl);
					if (focusables.length === 0) {
						e.preventDefault();
						return;
					}
					const first = focusables[0];
					const last = focusables[focusables.length - 1];
					const active = document.activeElement as HTMLElement | null;

					if (e.shiftKey) {
						if (!active || active === first) {
							e.preventDefault();
							last.focus();
						}
					} else {
						if (!active || active === last) {
							e.preventDefault();
							first.focus();
						}
					}
				},
				{ signal: abort.signal },
			);

			requestAnimationFrame(() => focusInitial());
		};

		const close = () => {
			if (modalEl.style.display === "none") return;
			modalEl.style.display = "none";
			setModalOpenState(false);
			abort?.abort();
			abort = null;
			lastFocused?.focus?.();
			lastFocused = null;
		};

		const isOpen = () => modalEl.style.display !== "none";

		return { open, close, isOpen };
	};
};
