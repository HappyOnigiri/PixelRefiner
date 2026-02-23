export class ImageComparer {
	private container: HTMLElement;
	private overlay: HTMLElement;
	private handle: HTMLElement;
	private isDragging = false;

	constructor(containerId: string) {
		const container = document.getElementById(containerId);
		if (!container) throw new Error(`Container #${containerId} not found`);
		this.container = container;

		const overlay = container.querySelector(".img-comp-overlay") as HTMLElement;
		const handle = container.querySelector(
			"#comp-slider-handle",
		) as HTMLElement;

		if (!overlay || !handle) {
			throw new Error("Slider elements not found in container");
		}

		this.overlay = overlay;
		this.handle = handle;

		this.init();
	}

	private init() {
		const startDrag = (e: MouseEvent | TouchEvent) => {
			e.preventDefault();
			this.isDragging = true;
		};

		const stopDrag = () => {
			this.isDragging = false;
		};

		const onMove = (e: MouseEvent | TouchEvent) => {
			if (!this.isDragging) return;
			this.updateSliderPosition(e);
		};

		this.handle.addEventListener("mousedown", startDrag);
		this.handle.addEventListener("touchstart", startDrag);

		window.addEventListener("mouseup", stopDrag);
		window.addEventListener("touchend", stopDrag);

		window.addEventListener("mousemove", onMove);
		window.addEventListener("touchmove", onMove);

		// Sync image size when container size changes
		const resizeObserver = new ResizeObserver(() => {
			this.syncImageSize();
		});
		resizeObserver.observe(this.container);

		// Initial position
		this.setSliderPos(50);
		this.syncImageSize();
	}

	public syncImageSize() {
		const rect = this.container.getBoundingClientRect();
		const img = this.overlay.querySelector("img");
		if (img) {
			// Sync image size in overlay to match the entire container.
			// This ensures the image is clipped rather than shrunk when the overlay width changes.
			img.style.width = `${rect.width}px`;
			img.style.height = `${rect.height}px`;
		}
	}

	private updateSliderPosition(e: MouseEvent | TouchEvent) {
		const rect = this.container.getBoundingClientRect();
		let x = 0;

		if (e instanceof MouseEvent) {
			x = e.pageX - rect.left;
		} else {
			x = e.touches[0].pageX - rect.left;
		}

		// Consider page scroll offset
		x = x - window.pageXOffset;

		let percent = (x / rect.width) * 100;
		percent = Math.max(0, Math.min(100, percent));

		this.setSliderPos(percent);
	}

	private setSliderPos(percent: number) {
		this.overlay.style.width = `${percent}%`;
		this.handle.style.left = `${percent}%`;
	}

	public updateImages(srcBefore: string, srcAfter: string) {
		const imgBefore = this.container.querySelector(
			"#comp-before",
		) as HTMLImageElement;
		const imgAfter = this.container.querySelector(
			"#comp-after",
		) as HTMLImageElement;

		if (imgBefore) imgBefore.src = srcBefore;
		if (imgAfter) imgAfter.src = srcAfter;

		// Also sync size when updating images (just in case)
		this.syncImageSize();
	}
}
