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
			// mapの値が1なら不透明(黒)、0なら透明
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

	it("斜め配置は連結とみなさず、個別に除去判定されること(4近傍確認)", () => {
		// 3x3
		// 1 0 0
		// 0 1 0  <- 中央は左上と連結していないはず
		// 0 0 1
		const { working, masked } = createTestImage(
			3,
			3,
			[1, 0, 0, 0, 1, 0, 0, 0, 1],
		);

		// maxPixels=1 なので、それぞれ(サイズ1)は除去対象になるはず
		// ただし、最大の1つは残る仕様
		const result = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			128,
			1,
		);

		expect(result.removedPixels).toBe(2); // 3つ中2つが除去される
		// どこか1つだけ残っているはず
		let opaqueCount = 0;
		for (let i = 0; i < 9; i++) {
			if (masked.data[i * 4 + 3] === 255) opaqueCount++;
		}
		expect(opaqueCount).toBe(1);
	});

	it("しきい値(maxPixels)以下の塊のみ除去されること", () => {
		// 4x2
		// 1 1 0 1
		// 1 1 0 0
		// 左(サイズ4)は残り、右(サイズ1)は消えるべき
		const { working, masked } = createTestImage(4, 2, [1, 1, 0, 1, 1, 1, 0, 0]);

		const result = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			128,
			2,
		);

		expect(result.removedPixels).toBe(1);

		// 右上のピクセル(3,0)が透明になっているか確認
		expect(masked.data[3 * 4 + 3]).toBe(0);
		// 左上のピクセル(0,0)は不透明のままか確認
		expect(masked.data[0 * 4 + 3]).toBe(255);
	});

	it("ドーナツ型: 内部の穴にあるノイズが正しく除去されるか", () => {
		// 5x5
		// 1 1 1 1 1
		// 1 0 0 0 1
		// 1 0 1 0 1  <- 真ん中に 1
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
		// 真ん中のピクセル (2,2) = index 12
		expect(masked.data[12 * 4 + 3]).toBe(0);
	});

	it("コの字型: 凹凸のある形状が一つの塊として認識されるか", () => {
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
		// 全部で7ピクセル。1つの塊なので、最大成分として残る
		expect(result.removedPixels).toBe(0);
	});
});
