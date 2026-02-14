import type { OutlineStyle, RawImage, RGB } from "../shared/types";

/**
 * 透過画像の周囲にアウトラインを追加する。
 * 画像の端にドットがある場合にアウトラインが切れないよう、上下左右に1pxずつ拡張してから処理を行う。
 * @param image 入力画像
 * @param color アウトラインの色
 * @param style アウトラインのスタイル ('rounded': 8近傍, 'sharp': 4近傍)
 */
export function applyOutline(
	image: RawImage,
	color: RGB,
	style: OutlineStyle,
): RawImage {
	if (style === "none") return image;

	// 上下左右に1pxずつ拡張する
	const srcW = image.width;
	const srcH = image.height;
	const dstW = srcW + 2;
	const dstH = srcH + 2;
	const srcData = image.data;
	const dstData = new Uint8ClampedArray(dstW * dstH * 4);

	// 元の画像を中央にコピー
	for (let y = 0; y < srcH; y++) {
		const srcOffset = y * srcW * 4;
		const dstOffset = ((y + 1) * dstW + 1) * 4;
		dstData.set(srcData.subarray(srcOffset, srcOffset + srcW * 4), dstOffset);
	}

	const outData = new Uint8ClampedArray(dstData);
	const isSharp = style === "sharp";

	// チェックする近傍の相対座標
	const neighbors = isSharp
		? [
				[0, -1], // 上
				[0, 1], // 下
				[-1, 0], // 左
				[1, 0], // 右
			]
		: [
				[0, -1],
				[0, 1],
				[-1, 0],
				[1, 0],
				[-1, -1], // 左上
				[1, -1], // 右上
				[-1, 1], // 左下
				[1, 1], // 右下
			];

	for (let y = 0; y < dstH; y++) {
		for (let x = 0; x < dstW; x++) {
			const idx = (y * dstW + x) * 4;
			const alpha = dstData[idx + 3];

			// 既に不透明なピクセルはスキップ
			if (alpha > 0) continue;

			// 周囲のピクセルをチェック
			let hasOpaqueNeighbor = false;

			for (const [dx, dy] of neighbors) {
				const nx = x + dx;
				const ny = y + dy;

				if (nx >= 0 && nx < dstW && ny >= 0 && ny < dstH) {
					const nIdx = (ny * dstW + nx) * 4;
					if (dstData[nIdx + 3] > 0) {
						hasOpaqueNeighbor = true;
						break;
					}
				}
			}

			if (hasOpaqueNeighbor) {
				outData[idx] = color.r;
				outData[idx + 1] = color.g;
				outData[idx + 2] = color.b;
				outData[idx + 3] = 255;
			}
		}
	}

	return { width: dstW, height: dstH, data: outData };
}
