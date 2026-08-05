import { describe, expect, it } from "vitest";
import type { Pixel, RawImage } from "../shared/types";
import { floodFillTransparent } from "./floodfill";
import { getPixel, setPixel } from "./ops";

describe("floodfill.ts", () => {
	describe("floodFillTransparent", () => {
		it("should fill connected color area with transparency", () => {
			// 5x5 画像、白背景
			const width = 5;
			const height = 5;
			const data = new Uint8ClampedArray(width * height * 4).fill(255); // 白
			const img: RawImage = { width, height, data };

			// (1,1) に赤い四角（2x2）を描画する
			const red: Pixel = [255, 0, 0, 255];
			setPixel(img, 1, 1, red);
			setPixel(img, 2, 1, red);
			setPixel(img, 1, 2, red);
			setPixel(img, 2, 2, red);

			// (1,1) から塗りつぶす
			floodFillTransparent(img, 1, 1, 0);

			// (1,1) は透明な赤になるはずである
			expect(getPixel(img, 1, 1)).toEqual([255, 0, 0, 0]);
			expect(getPixel(img, 2, 2)).toEqual([255, 0, 0, 0]);

			// (0,0) は白のままであるはずである
			expect(getPixel(img, 0, 0)).toEqual([255, 255, 255, 255]);
		});

		it("should respect tolerance", () => {
			const width = 3;
			const height = 1;
			const data = new Uint8ClampedArray(width * height * 4);
			const img: RawImage = { width, height, data };

			// [R=255, R=250, R=240]
			setPixel(img, 0, 0, [255, 0, 0, 255]);
			setPixel(img, 1, 0, [250, 0, 0, 255]);
			setPixel(img, 2, 0, [240, 0, 0, 255]);

			// 許容差 5 で (0,0) から塗りつぶす
			// R=250 は許容範囲内（255-250=5）、R=240 は範囲外（255-240=15）
			floodFillTransparent(img, 0, 0, 5);

			expect(getPixel(img, 0, 0)[3]).toBe(0); // 透明
			expect(getPixel(img, 1, 0)[3]).toBe(0); // 透明
			expect(getPixel(img, 2, 0)[3]).toBe(255); // 不透明
		});

		it("should not fill non-connected areas", () => {
			const width = 5;
			const height = 1;
			const data = new Uint8ClampedArray(width * height * 4).fill(255);
			const img: RawImage = { width, height, data };

			// [赤、白、赤、白、白]
			const red: Pixel = [255, 0, 0, 255];
			setPixel(img, 0, 0, red);
			setPixel(img, 2, 0, red);

			// (0,0) から塗りつぶす
			floodFillTransparent(img, 0, 0, 0);

			expect(getPixel(img, 0, 0)[3]).toBe(0); // 塗りつぶし済み
			expect(getPixel(img, 1, 0)).toEqual([255, 255, 255, 255]); // 白い区切り
			expect(getPixel(img, 2, 0)).toEqual([255, 0, 0, 255]); // 別の赤領域（未接続）
		});

		it("follows a smooth ramp beyond the absolute tolerance", () => {
			const width = 40;
			const data = new Uint8ClampedArray(width * 4);
			const img: RawImage = { width, height: 1, data };
			for (let x = 0; x < width; x += 1) {
				setPixel(img, x, 0, [100 + x * 2, 120, 180, 255]);
			}

			// 絶対差 8 だけなら x<=4 で止まるが、1 画素あたりの段差は 2 なので
			// ランプ許容で端まで到達する。
			floodFillTransparent(img, 0, 0, 8, undefined, "4", {
				stepTolerance: 4,
				seedLimit: 255,
			});

			expect(getPixel(img, 39, 0)[3]).toBe(0);
			expect(getPixel(img, 39, 0)[0]).toBe(178);
		});

		it("stops the ramp at a strong edge and at the seed limit", () => {
			const width = 40;
			const data = new Uint8ClampedArray(width * 4);
			const img: RawImage = { width, height: 1, data };
			for (let x = 0; x < width; x += 1) {
				// x>=20 は被写体。段差が大きいのでランプでは越えられない。
				setPixel(
					img,
					x,
					0,
					x < 20 ? [100 + x * 2, 120, 180, 255] : [20, 200, 30, 255],
				);
			}
			floodFillTransparent(img, 0, 0, 8, undefined, "4", {
				stepTolerance: 4,
				seedLimit: 255,
			});

			expect(getPixel(img, 19, 0)[3]).toBe(0);
			expect(getPixel(img, 20, 0)[3]).toBe(255);

			const bounded = {
				width,
				height: 1,
				data: new Uint8ClampedArray(width * 4),
			};
			for (let x = 0; x < width; x += 1) {
				setPixel(bounded, x, 0, [100 + x * 2, 120, 180, 255]);
			}
			// 開始色から 20 以上離れられないため、x=10 の手前で止まる。
			floodFillTransparent(bounded, 0, 0, 8, undefined, "4", {
				stepTolerance: 4,
				seedLimit: 20,
			});

			expect(getPixel(bounded, 10, 0)[3]).toBe(0);
			expect(getPixel(bounded, 11, 0)[3]).toBe(255);
		});
	});
});
