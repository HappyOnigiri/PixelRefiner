export const initTooltip = () => {
	const tooltip = document.createElement("div");
	tooltip.className = "custom-tooltip";
	document.body.appendChild(tooltip);

	let activeElement: HTMLElement | null = null;

	// Watch for attribute changes on the active element
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

		// Default position: Top Center
		let top = rect.top - tooltipRect.height - 8;
		let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

		// Check if it goes off screen
		if (top < 0) {
			// Show below if not enough space on top
			top = rect.bottom + 8;
		}

		if (left < 0) {
			left = 8;
		} else if (left + tooltipRect.width > window.innerWidth) {
			left = window.innerWidth - tooltipRect.width - 8;
		}

		tooltip.style.top = `${top}px`;
		tooltip.style.left = `${left}px`;
		// Ensure z-index is exceedingly high
		tooltip.style.zIndex = "10000";
	};

	// Event Delegation
	document.addEventListener("mouseover", (e) => {
		const target = (e.target as HTMLElement).closest("[data-tooltip]");
		if (target) {
			const text = target.getAttribute("data-tooltip");
			if (text) {
				showTooltip(target as HTMLElement, text);
			}
		}
	});

	// Use mouseout (bubbling) or mouseleave (capturing)
	// simple mouseout is fine if we check relatedTarget
	document.addEventListener("mouseout", (e) => {
		const target = (e.target as HTMLElement).closest("[data-tooltip]");
		// If moving to a child, don't hide
		if (target && target === activeElement) {
			const related = e.relatedTarget as HTMLElement;
			if (target.contains(related)) return;
			hideTooltip();
		}
	});

	// Handle scroll to update position if needed (optional, but good for fixed elements)
	window.addEventListener("scroll", updatePosition, true);
	window.addEventListener("resize", updatePosition);
};
