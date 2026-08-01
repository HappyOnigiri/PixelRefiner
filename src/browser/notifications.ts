/**
 * Display error in overlay
 */
export const showError = (message: string) => {
	const toast = document.createElement("div");
	toast.className = "error-toast";
	toast.setAttribute("role", "alert");
	toast.innerHTML =
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" ' +
		'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
		'stroke-linecap="round" stroke-linejoin="round">' +
		'<circle cx="12" cy="12" r="10"></circle>' +
		'<line x1="12" y1="8" x2="12" y2="12"></line>' +
		'<line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
	const text = document.createElement("span");
	text.textContent = message;
	toast.appendChild(text);
	document.body.appendChild(toast);

	// Start showing in the next frame
	requestAnimationFrame(() => {
		toast.classList.add("show");
	});

	// Remove after 5 seconds
	setTimeout(() => {
		toast.classList.remove("show");
		toast.addEventListener(
			"transitionend",
			() => {
				toast.remove();
			},
			{ once: true },
		);
	}, 5000);
};

/**
 * Display information (success, etc.) in toast
 */
export const showInfo = (message: string) => {
	const toast = document.createElement("div");
	toast.className = "info-toast";
	toast.setAttribute("role", "status");
	toast.innerHTML =
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" ' +
		'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
		'stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>' +
		'<polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
	const text = document.createElement("span");
	text.textContent = message;
	toast.appendChild(text);
	document.body.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.add("show");
	});

	setTimeout(() => {
		toast.classList.remove("show");
		toast.addEventListener(
			"transitionend",
			() => {
				toast.remove();
			},
			{ once: true },
		);
	}, 3000);
};

export const showWarning = (message: string) => {
	const toast = document.createElement("div");
	toast.className = "warning-toast";
	toast.setAttribute("role", "status");
	const text = document.createElement("span");
	text.textContent = message;
	toast.appendChild(text);
	document.body.appendChild(toast);

	requestAnimationFrame(() => toast.classList.add("show"));
	setTimeout(() => {
		toast.classList.remove("show");
		toast.addEventListener("transitionend", () => toast.remove(), {
			once: true,
		});
	}, 5000);
};
