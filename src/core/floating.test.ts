import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { _removeSmallFloatingComponentsInPlace as removeSmallFloatingComponentsInPlace } from "./processor";

describe("Floating Content Removal", () => {
	const createTestImage = (
		w: number,
		h: number,
		map: number[],
	): { working: RawImage; masked: RawImage } => {
		const data = new Uint8ClampedArray(w * h * 4);
		for (let i = 0; i < map.length; i++) {
			// If map value is 1, opaque (black), if 0, transparent
			const alpha = map[i] === 1 ? 255 : 0;
			data[i * 4] = 0;
			data[i * 4 + 1] = 0;
			data[i * 4 + 2] = 0;
			data[i * 4 + 3] = alpha;
		}
		return {
			working: { width: w, height: h, data: new Uint8ClampedArray(data) },
			masked: { width: w, height: h, data: new Uint8ClampedArray(data) }, // Copy
		};
	};

	it("should not consider diagonal placement as connected and judge removal individually (4-connectivity check)", () => {
		// 3x3
		// 1 0 0
		// 0 1 0  <- Center should not be connected to top-left
		// 0 0 1
		const { working, masked } = createTestImage(
			3,
			3,
			[1, 0, 0, 0, 1, 0, 0, 0, 1],
		);

		// Since maxPixels=1, each (size 1) should be eligible for removal
		// However, the specification is to keep the largest one.
		const result = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			128,
			1,
		);

		expect(result.removedPixels).toBe(2); // 2 out of 3 are removed
		// Only one should remain somewhere
		let opaqueCount = 0;
		for (let i = 0; i < 9; i++) {
			if (masked.data[i * 4 + 3] === 255) opaqueCount++;
		}
		expect(opaqueCount).toBe(1);
	});

	it("should only remove components below the threshold (maxPixels)", () => {
		// 4x2
		// 1 1 0 1
		// 1 1 0 0
		// Left (size 4) should remain, right (size 1) should disappear
		const { working, masked } = createTestImage(4, 2, [1, 1, 0, 1, 1, 1, 0, 0]);

		const result = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			128,
			2,
		);

		expect(result.removedPixels).toBe(1);

		// Check if top-right pixel (3,0) became transparent
		expect(masked.data[3 * 4 + 3]).toBe(0);
		// Check if top-left pixel (0,0) remains opaque
		expect(masked.data[0 * 4 + 3]).toBe(255);
	});

	it("Donut shape: should correctly remove noise in the inner hole", () => {
		// 5x5
		// 1 1 1 1 1
		// 1 0 0 0 1
		// 1 0 1 0 1  <- 1 in the middle
		// 1 0 0 0 1
		// 1 1 1 1 1
		const { working, masked } = createTestImage(
			5,
			5,
			[
				1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1,
				1,
			],
		);

		const result = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			128,
			1,
		);
		expect(result.removedPixels).toBe(1);
		// Middle pixel (2,2) = index 12
		expect(masked.data[12 * 4 + 3]).toBe(0);
	});

	it("U-shape: should recognize irregular shapes as a single component", () => {
		// 3x3
		// 1 1 1
		// 1 0 0
		// 1 1 1
		const { working, masked } = createTestImage(
			3,
			3,
			[1, 1, 1, 1, 0, 0, 1, 1, 1],
		);

		const result = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			128,
			10,
		);
		// 7 pixels in total. Since it's a single component, it remains as the largest component.
		expect(result.removedPixels).toBe(0);
	});
});
