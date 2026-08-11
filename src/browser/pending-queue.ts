import type { ImageItem } from "./session";

export type PendingQueueImage = {
	id: string;
	status: ImageItem["status"];
};

export type PendingQueueDeps = {
	getImages: () => readonly PendingQueueImage[];
	getActiveImageId: () => string | null;
	/** アクティブな画像を、表示更新や候補提示を含む通常の経路で処理する */
	processActiveImage: () => Promise<void>;
	/** アクティブでない画像を、表示を切り替えずに処理する */
	processInactiveImage: (id: string) => Promise<void>;
	/** 一巡の終了時に、処理を試みた画像 ID を通知する（途中で失敗した場合も呼ばれる） */
	onDrained?: (attemptedIds: readonly string[]) => void;
};

/**
 * 未変換（pending）の画像を一覧順に 1 枚ずつ処理するキューを作る。
 * 変換処理そのものには依存せず、処理順と多重起動の防止だけを担う。
 */
export const createPendingImageQueue = (
	deps: PendingQueueDeps,
): (() => Promise<void>) => {
	let running = false;

	return async () => {
		// [Intended] 実行中の呼び出しは受け流す。ループが毎回一覧を読み直すため、
		// 処理中に追加された画像も実行中のループが引き継いで処理する。
		if (running) return;
		running = true;
		// [Intended] 処理後も pending のままの画像を無限に選び直さないよう、試行済みは対象から外す。
		const attempted: string[] = [];
		const attemptedIds = new Set<string>();
		try {
			while (true) {
				const images = deps.getImages();
				let next: PendingQueueImage | undefined;
				for (let index = 0; index < images.length; index += 1) {
					const image = images[index];
					if (image.status === "pending" && !attemptedIds.has(image.id)) {
						next = image;
						break;
					}
				}
				if (!next) break;
				attempted.push(next.id);
				attemptedIds.add(next.id);
				if (next.id === deps.getActiveImageId()) {
					await deps.processActiveImage();
				} else {
					await deps.processInactiveImage(next.id);
				}
			}
		} finally {
			running = false;
			// [Intended] 途中で失敗した場合も通知する。呼び出し側が進捗表示を閉じられるようにする。
			deps.onDrained?.(attempted);
		}
	};
};
