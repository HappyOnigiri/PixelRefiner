import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { removeSmallFloatingComponentsInPlace } from "./background-removal";

describe("Floating Content Removal", () => {
	const createTestImage = (
		w: number,
		h: number,
		map: number[],
	): { working: RawImage; masked: RawImage } => {
		const data = new Uint8ClampedArray(w * h * 4);
		for (let i = 0; i < map.length; i++) {
			// マップ値が 1 なら不透明（黒）、0 なら透明
			const alpha = map[i] === 1 ? 255 : 0;
			data[i * 4] = 0;
			data[i * 4 + 1] = 0;
			data[i * 4 + 2] = 0;
			data[i * 4 + 3] = alpha;
		}
		return {
			working: { width: w, height: h, data: new Uint8ClampedArray(data) },
			masked: { width: w, height: h, data: new Uint8ClampedArray(data) }, // コピー
		};
	};

	it("should not consider diagonal placement as connected and judge removal individually (4-connectivity check)", () => {
		// 3x3
		// 1 0 0
		// 0 1 0  <- 中央は左上に接続されないはず
		// 0 0 1
		const { working, masked } = createTestImage(
			3,
			3,
			[1, 0, 0, 0, 1, 0, 0, 0, 1],
		);

		// maxPixels=1 のため、それぞれ（サイズ 1）が除去対象になるはずである
		// ただし仕様では最大のものを保持する。
		const result = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			128,
			1,
		);

		expect(result.removedPixels).toBe(2); // 3 個中 2 個を除去
		// どこかに 1 つだけ残るはずである
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
		// 左（サイズ 4）は残り、右（サイズ 1）は消えるはずである
		const { working, masked } = createTestImage(4, 2, [1, 1, 0, 1, 1, 1, 0, 0]);

		const result = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			128,
			2,
		);

		expect(result.removedPixels).toBe(1);

		// 右上のピクセル (3,0) が透明になったことを確認する
		expect(masked.data[3 * 4 + 3]).toBe(0);
		// 左上のピクセル (0,0) が不透明のままであることを確認する
		expect(masked.data[0 * 4 + 3]).toBe(255);
	});

	it("Donut shape: should correctly remove noise in the inner hole", () => {
		// 5x5
		// 1 1 1 1 1
		// 1 0 0 0 1
		// 1 0 1 0 1  <- 中央に 1
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
		// 中央ピクセル (2,2) = インデックス 12
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
		// 合計 7 ピクセル。単一の連結成分なので、最大の連結成分として残る。
		expect(result.removedPixels).toBe(0);
	});
});
