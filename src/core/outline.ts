import type { OutlineStyle, RawImage, RGB } from "../shared/types";

/**
 * Add an outline around a transparent image.
 * To ensure the outline is not cut off when there are dots at the edges,
 * the image is expanded by 1px in all directions (top, bottom, left, right) before processing.
 * @param image Input image
 * @param color Outline color
 * @param style Outline style ('rounded': 8-neighbors, 'sharp': 4-neighbors)
 */
export function applyOutline(
	image: RawImage,
	color: RGB,
	style: OutlineStyle,
): RawImage {
	if (style === "none") return image;

	// Expand by 1px in all directions (top, bottom, left, right)
	const srcW = image.width;
	const srcH = image.height;
	const dstW = srcW + 2;
	const dstH = srcH + 2;
	const srcData = image.data;
	const dstData = new Uint8ClampedArray(dstW * dstH * 4);

	// Copy original image to the center
	for (let y = 0; y < srcH; y++) {
		const srcOffset = y * srcW * 4;
		const dstOffset = ((y + 1) * dstW + 1) * 4;
		dstData.set(srcData.subarray(srcOffset, srcOffset + srcW * 4), dstOffset);
	}

	const outData = new Uint8ClampedArray(dstData);
	const isSharp = style === "sharp";

	// Relative coordinates for neighbors to check
	const neighbors = isSharp
		? [
				[0, -1], // Up
				[0, 1], // Down
				[-1, 0], // Left
				[1, 0], // Right
			]
		: [
				[0, -1],
				[0, 1],
				[-1, 0],
				[1, 0],
				[-1, -1], // Top-Left
				[1, -1], // Top-Right
				[-1, 1], // Bottom-Left
				[1, 1], // Bottom-Right
			];

	for (let y = 0; y < dstH; y++) {
		for (let x = 0; x < dstW; x++) {
			const idx = (y * dstW + x) * 4;
			const alpha = dstData[idx + 3];

			// Skip if pixel is already opaque
			if (alpha > 0) continue;

			// Check surrounding pixels
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
