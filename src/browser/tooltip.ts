export const initTooltip = () => {
	const tooltip = document.createElement("div");
	tooltip.className = "custom-tooltip";
	document.body.appendChild(tooltip);

	let activeElement: HTMLElement | null = null;

	// アクティブ要素の属性変更を監視
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (
				mutation.type === "attributes" &&
				mutation.attributeName === "data-tooltip" &&
				activeElement
			) {
				const newText = activeElement.getAttribute("data-tooltip");
				if (newText) {
					tooltip.textContent = newText;
					updatePosition();
				} else {
					hideTooltip();
				}
			}
		}
	});

	const showTooltip = (el: HTMLElement, text: string) => {
		tooltip.textContent = text;
		tooltip.classList.add("show");
		activeElement = el;
		updatePosition();
		observer.observe(el, { attributes: true });
	};

	const hideTooltip = () => {
		tooltip.classList.remove("show");
		if (activeElement) {
			observer.disconnect();
		}
		activeElement = null;
	};

	const updatePosition = () => {
		if (!activeElement || !tooltip.classList.contains("show")) return;

		const rect = activeElement.getBoundingClientRect();
		const tooltipRect = tooltip.getBoundingClientRect();

		// 既定位置: 上中央
		let top = rect.top - tooltipRect.height - 8;
		let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

		// 画面外にはみ出すか確認
		if (top < 0) {
			// 上部に十分な余白がなければ下に表示
			top = rect.bottom + 8;
		}

		if (left < 0) {
			left = 8;
		} else if (left + tooltipRect.width > window.innerWidth) {
			left = window.innerWidth - tooltipRect.width - 8;
		}

		tooltip.style.top = `${top}px`;
		tooltip.style.left = `${left}px`;
		// z-index が十分に高いことを保証
		tooltip.style.zIndex = "10000";
	};

	// イベント委譲
	document.addEventListener("mouseover", (e) => {
		const target = (e.target as HTMLElement).closest("[data-tooltip]");
		if (target) {
			const text = target.getAttribute("data-tooltip");
			if (text) {
				showTooltip(target as HTMLElement, text);
			}
		}
	});

	// mouseout（バブリング）または mouseleave（キャプチャリング）を使用する
	// relatedTarget を確認すれば単純な mouseout で問題ない
	document.addEventListener("mouseout", (e) => {
		const target = (e.target as HTMLElement).closest("[data-tooltip]");
		// 子要素へ移動する場合は非表示にしない
		if (target && target === activeElement) {
			const related = e.relatedTarget as HTMLElement;
			if (target.contains(related)) return;
			hideTooltip();
		}
	});

	// [Intended] マウスを使えない環境でも説明へ到達できるよう、
	// フォーカスの出入りでも同じツールチップを開閉する。
	document.addEventListener("focusin", (e) => {
		const target = (e.target as HTMLElement).closest("[data-tooltip]");
		if (!target) return;
		const text = target.getAttribute("data-tooltip");
		if (text) showTooltip(target as HTMLElement, text);
	});

	document.addEventListener("focusout", (e) => {
		const target = (e.target as HTMLElement).closest("[data-tooltip]");
		if (target && target === activeElement) hideTooltip();
	});

	// 必要に応じてスクロール時に位置を更新する（任意だが固定要素には有用）
	window.addEventListener("scroll", updatePosition, true);
	window.addEventListener("resize", updatePosition);
};
