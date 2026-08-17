type ToastOptions = {
	className: string;
	role: "alert" | "status";
	durationMs: number;
	icon?: string;
};

const showToast = (message: string, options: ToastOptions): void => {
	const toast = document.createElement("div");
	toast.className = options.className;
	toast.setAttribute("role", options.role);
	if (options.icon) toast.innerHTML = options.icon;

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
		// [Intended] transition が無効な環境でも通知を DOM に残さない。
		setTimeout(() => toast.remove(), 1000);
	}, options.durationMs);
};

const ERROR_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" ' +
	'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
	'stroke-linecap="round" stroke-linejoin="round">' +
	'<circle cx="12" cy="12" r="10"></circle>' +
	'<line x1="12" y1="8" x2="12" y2="12"></line>' +
	'<line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';

const INFO_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" ' +
	'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
	'stroke-linecap="round" stroke-linejoin="round">' +
	'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>' +
	'<polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';

/** オーバーレイにエラーを表示する。 */
export const showError = (message: string): void => {
	showToast(message, {
		className: "error-toast",
		role: "alert",
		durationMs: 5000,
		icon: ERROR_ICON,
	});
};

/** トーストに情報（成功など）を表示する。 */
export const showInfo = (message: string): void => {
	showToast(message, {
		className: "info-toast",
		role: "status",
		durationMs: 3000,
		icon: INFO_ICON,
	});
};

export const showWarning = (message: string): void => {
	showToast(message, {
		className: "warning-toast",
		role: "status",
		durationMs: 5000,
	});
};
