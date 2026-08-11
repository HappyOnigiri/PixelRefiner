import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	estimateBackgroundModel,
	removeAutomaticBackground,
} from "./background";
import {
	detectBackgroundRamp,
	getBackgroundTargets,
	removeBackground,
} from "./background-removal";

const createImage = (
	width: number,
	height: number,
	pixelAt: (x: number, y: number) => readonly [number, number, number, number],
): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = pixelAt(x, y);
			const offset = (y * width + x) * 4;
			data[offset] = pixel[0];
			data[offset + 1] = pixel[1];
			data[offset + 2] = pixel[2];
			data[offset + 3] = pixel[3];
		}
	}
	return { width, height, data };
};

const alphaAt = (image: RawImage, x: number, y: number): number =>
	image.data[(y * image.width + x) * 4 + 3];

describe("automatic background model", () => {
	it("removes a light gradient whose four corners have different colors", () => {
		const image = createImage(24, 24, (x, y) => {
			if (x >= 7 && x <= 16 && y >= 7 && y <= 16) {
				return [32, 48, 80, 255];
			}
			return [224 + x, 226 + y, 232 + ((x + y) % 5), 255];
		});
		const first = removeAutomaticBackground(image, 64, "outer", "4");
		const second = removeAutomaticBackground(image, 64, "outer", "4");
		const legacy = removeBackground(
			image,
			8,
			"outer",
			"4",
			getBackgroundTargets(image, "top-left"),
			"top-left",
		);

		expect(first.rolledBack).toBe(false);
		expect(first.model.clusters.length).toBeGreaterThan(1);
		expect(first.model.confidence).toBeGreaterThan(0.55);
		expect(alphaAt(first.image, 0, 0)).toBe(0);
		expect(alphaAt(first.image, 23, 23)).toBe(0);
		// [Intended] ランプ許容の導入で、旧来のフラッドフィルも緩やかな階調の背景を
		// 反対側の角まで落とせる。被写体は段差の大きさで守られるため残る。
		expect(alphaAt(legacy, 23, 23)).toBe(0);
		expect(alphaAt(legacy, 12, 12)).toBe(255);
		expect(alphaAt(first.image, 12, 12)).toBe(255);
		expect(second.image.data).toEqual(first.image.data);
	});

	it("absorbs deterministic compression-like noise around a solid background", () => {
		const image = createImage(20, 20, (x, y) => {
			if (x >= 5 && x <= 14 && y >= 5 && y <= 14) {
				return [180, 48, 64, 255];
			}
			const noise = ((x * 17 + y * 29) % 9) - 4;
			return [210 + noise, 218 - noise, 226 + noise, 255];
		});
		const result = removeAutomaticBackground(image, 40, "outer", "8");

		expect(result.rolledBack).toBe(false);
		expect(alphaAt(result.image, 2, 10)).toBe(0);
		expect(alphaAt(result.image, 10, 10)).toBe(255);
	});

	it("does not force removal when the border model has low confidence", () => {
		const image = createImage(20, 20, (x, y) => [
			(x * 73 + y * 41) % 256,
			(x * 19 + y * 101) % 256,
			(x * 151 + y * 7) % 256,
			255,
		]);
		const result = removeAutomaticBackground(image, 64, "outer", "4");

		expect(result.model.confidence).toBeLessThan(0.55);
		expect(result.removedRatio).toBe(0);
		expect(result.image.data).toEqual(image.data);
	});

	it("rolls back instead of erasing an image whose subject reaches the border", () => {
		const image = createImage(16, 16, (x, y) => {
			if (x < 8 && y < 8) return [24, 32, 48, 255];
			return [240, 240, 240, 255];
		});
		const result = removeAutomaticBackground(image, 96, "all", "4");

		expect(result.rolledBack).toBe(true);
		expect(result.removedRatio).toBeGreaterThan(0.92);
		expect(result.image.data).toEqual(image.data);
	});

	it("keeps existing alpha and reduces a white fringe near transparency", () => {
		const image = createImage(12, 12, (x, y) => {
			if (x >= 3 && x <= 8 && y >= 3 && y <= 8) {
				const edge = x === 3 || x === 8 || y === 3 || y === 8;
				return edge ? [190, 190, 190, 255] : [48, 48, 48, 255];
			}
			if (x === 1 && y === 1) return [12, 34, 56, 96];
			return [255, 255, 255, 255];
		});
		const result = removeAutomaticBackground(image, 32, "outer", "4");
		const edgeOffset = (5 * image.width + 3) * 4;

		expect(result.rolledBack).toBe(false);
		expect(alphaAt(result.image, 1, 1)).toBe(96);
		expect(result.image.data[edgeOffset]).toBeLessThan(190);
		expect(alphaAt(result.image, 5, 5)).toBe(255);
	});

	it("reduces a black fringe without changing opaque interior pixels", () => {
		const image = createImage(12, 12, (x, y) => {
			if (x >= 3 && x <= 8 && y >= 3 && y <= 8) {
				const edge = x === 3 || x === 8 || y === 3 || y === 8;
				return edge ? [65, 65, 65, 255] : [208, 208, 208, 255];
			}
			return [0, 0, 0, 255];
		});
		const result = removeAutomaticBackground(image, 32, "outer", "4");
		const edgeOffset = (5 * image.width + 3) * 4;
		const interiorOffset = (5 * image.width + 5) * 4;

		expect(result.image.data[edgeOffset]).toBeGreaterThan(65);
		expect(result.image.data[interiorOffset]).toBe(208);
	});

	it("estimates a background when only the outermost ring is transparent", () => {
		const image = createImage(40, 40, (x, y) => {
			if (x === 0 || y === 0 || x === 39 || y === 39) return [0, 0, 0, 0];
			if (x >= 14 && x <= 25 && y >= 14 && y <= 25) return [30, 60, 90, 255];
			return [235, 238, 240, 255];
		});
		const result = removeAutomaticBackground(image, 32, "outer", "4");

		expect(result.model.clusters.length).toBeGreaterThan(0);
		expect(result.rolledBack).toBe(false);
		expect(alphaAt(result.image, 2, 2)).toBe(0);
		expect(alphaAt(result.image, 20, 20)).toBe(255);
	});

	it("corrects the innermost fringe ring within the dehalo radius", () => {
		const image = createImage(16, 16, (x, y) => {
			const inSubject = x >= 4 && x <= 11 && y >= 4 && y <= 11;
			if (!inSubject) return [255, 255, 255, 255];
			if (x === 4 || x === 11 || y === 4 || y === 11) {
				return [200, 200, 200, 255];
			}
			if (x === 5 || x === 10 || y === 5 || y === 10) {
				return [190, 190, 190, 255];
			}
			return [48, 48, 48, 255];
		});
		const result = removeAutomaticBackground(image, 16, "outer", "4");
		const outerRingOffset = (7 * image.width + 4) * 4;
		const innerRingOffset = (7 * image.width + 5) * 4;
		const interiorOffset = (7 * image.width + 7) * 4;

		expect(result.rolledBack).toBe(false);
		expect(result.image.data[outerRingOffset]).toBeLessThan(200);
		expect(result.image.data[innerRingOffset]).toBeLessThan(190);
		expect(result.image.data[interiorOffset]).toBe(48);
	});

	it("keeps a subject's own outline color that is not an anti-aliased blend with the background", () => {
		// 背景色 (72,96,120) と輪郭色 (35,28,44) の RGB 距離は dehaloMaxRgbDistance 以内だが、
		// 輪郭色は背景と内側の塗り (218,74,72) を結ぶ直線上にはない（被写体自身が意図した色）。
		// パディング除去後にこの輪郭色を dehalo が誤って動かさないことを確認する。
		const image = createImage(16, 16, (x, y) => {
			const inSubject = x >= 4 && x <= 11 && y >= 4 && y <= 11;
			if (!inSubject) return [72, 96, 120, 255];
			const edge = x === 4 || x === 11 || y === 4 || y === 11;
			return edge ? [35, 28, 44, 255] : [218, 74, 72, 255];
		});
		const result = removeAutomaticBackground(image, 32, "outer", "4");
		const edgeOffset = (7 * image.width + 4) * 4;

		expect(result.rolledBack).toBe(false);
		expect(alphaAt(result.image, 0, 0)).toBe(0);
		expect(result.image.data[edgeOffset]).toBe(35);
		expect(result.image.data[edgeOffset + 1]).toBe(28);
		expect(result.image.data[edgeOffset + 2]).toBe(44);
	});

	it("treats a fully transparent border as known background", () => {
		const image = createImage(8, 8, (x, y) => {
			if (x === 0 || y === 0 || x === 7 || y === 7) return [200, 10, 50, 0];
			return [30, 60, 90, 255];
		});
		const model = estimateBackgroundModel(image);

		expect(model.confidence).toBe(1);
		expect(model.clusters).toEqual([]);
	});

	it("keeps the outline of a subject that reaches the border of a cut-out image", () => {
		// 透明背景のうえに菱形の被写体が画像端まで届く画像。境界帯の不透明画素は
		// すべて被写体のアウトライン色なので、色クラスタに採用してはいけない。
		const image = createImage(12, 12, (x, y) => {
			const distance = Math.abs(x - 5.5) + Math.abs(y - 5.5);
			if (distance > 6) return [0, 0, 0, 0];
			if (distance > 4.5) return [35, 28, 44, 255];
			return [218, 74, 72, 255];
		});
		const model = estimateBackgroundModel(image);
		const result = removeAutomaticBackground(image, 64, "outer", "4");

		expect(model.clusters).toEqual([]);
		// 小領域除去はアルファ背景でも有効にしたいため、信頼度は下げない。
		expect(model.confidence).toBe(1);
		expect(result.removedRatio).toBe(0);
		expect(result.rolledBack).toBe(false);
		expect(alphaAt(result.image, 0, 5)).toBe(255);
		expect(alphaAt(result.image, 5, 0)).toBe(255);
		expect(result.image.data).toEqual(image.data);
	});

	it("removes a gradient padding whose range exceeds the tolerance", () => {
		// 48x48 の直線グラデーションが 32x32 のアートを 8px 囲む構成。
		const image = createImage(48, 48, (x, y) => {
			if (x >= 8 && x <= 39 && y >= 8 && y <= 39) {
				const edge = x === 8 || x === 39 || y === 8 || y === 39;
				return edge ? [35, 28, 44, 255] : [218, 74, 72, 255];
			}
			return [
				Math.round((x / 47) * 90) + 120,
				Math.round((y / 47) * 80) + 130,
				180,
				255,
			];
		});
		const ramp = detectBackgroundRamp(image, 48);
		const result = removeBackground(
			image,
			48,
			"all",
			"4",
			getBackgroundTargets(image, "top-left"),
			"top-left",
		);

		expect(ramp).not.toBeUndefined();
		// パディングは四隅から反対側まで全て落ち、アートだけが残る。
		expect(alphaAt(result, 0, 0)).toBe(0);
		expect(alphaAt(result, 47, 47)).toBe(0);
		expect(alphaAt(result, 47, 0)).toBe(0);
		expect(alphaAt(result, 0, 47)).toBe(0);
		expect(alphaAt(result, 8, 8)).toBe(255);
		expect(alphaAt(result, 39, 39)).toBe(255);
		expect(alphaAt(result, 20, 20)).toBe(255);
	});

	it("does not enable the ramp for flat padding or a textured border", () => {
		const flat = createImage(48, 48, (x, y) => {
			if (x >= 8 && x <= 39 && y >= 8 && y <= 39) return [218, 74, 72, 255];
			return [255, 255, 255, 255];
		});
		const textured = createImage(48, 48, (x, y) => {
			if (x >= 8 && x <= 39 && y >= 8 && y <= 39) return [218, 74, 72, 255];
			return [(x * 71 + y * 37) % 256, (x * 13 + y * 97) % 256, 180, 255];
		});

		expect(detectBackgroundRamp(flat, 48)).toBeUndefined();
		expect(detectBackgroundRamp(textured, 48)).toBeUndefined();
		// 許容差 0 は「完全一致のみ」の意図なのでランプも使わない。
		expect(detectBackgroundRamp(flat, 0)).toBeUndefined();
	});

	it("rolls back the ramp when it would erase almost the whole image", () => {
		// 全面がなめらかなグラデーションで、被写体との強い境界が無い画像。
		// ランプ許容だと全部消えるため、絶対差のみの結果へ巻き戻す。
		const image = createImage(48, 48, (x, y) => [
			Math.round(((x + y) / 94) * 200) + 30,
			120,
			180,
			255,
		]);
		const ramp = detectBackgroundRamp(image, 48);
		const result = removeBackground(
			image,
			48,
			"all",
			"4",
			getBackgroundTargets(image, "top-left"),
			"top-left",
		);

		expect(ramp).not.toBeUndefined();
		// 巻き戻した結果は絶対差の届く範囲だけが落ち、遠い側は残る。
		expect(alphaAt(result, 0, 0)).toBe(0);
		expect(alphaAt(result, 47, 47)).toBe(255);
	});

	it("still removes a solid background when only a few border pixels are transparent", () => {
		const image = createImage(20, 20, (x, y) => {
			if (y === 0 && x < 10) return [0, 0, 0, 0];
			if (x >= 6 && x <= 13 && y >= 6 && y <= 13) return [30, 60, 90, 255];
			return [240, 242, 244, 255];
		});
		const model = estimateBackgroundModel(image);
		const result = removeAutomaticBackground(image, 32, "outer", "4");

		expect(model.clusters.length).toBeGreaterThan(0);
		expect(alphaAt(result.image, 19, 19)).toBe(0);
		expect(alphaAt(result.image, 10, 10)).toBe(255);
	});
});

describe("enclosed background removal (scope: auto)", () => {
	/** リング状の被写体で囲まれた中空を持つ画像。中空の色は引数で変える。 */
	const createDonut = (
		holeColor: readonly [number, number, number],
		background: readonly [number, number, number] = [240, 240, 240],
	): RawImage =>
		createImage(32, 32, (x, y) => {
			const distance = Math.hypot(x - 15.5, y - 15.5);
			if (distance <= 5) return [...holeColor, 255] as const;
			if (distance <= 12) return [40, 90, 160, 255];
			return [...background, 255] as const;
		});

	it("removes an enclosed hole that matches the background color", () => {
		const image = createDonut([240, 240, 240]);
		const result = removeAutomaticBackground(image, 64, "auto", "4");

		expect(result.rolledBack).toBe(false);
		// 穴の中心は透過され、リング本体は残る。
		expect(alphaAt(result.image, 15, 15)).toBe(0);
		expect(alphaAt(result.image, 15, 7)).toBe(255);
		expect(alphaAt(result.image, 0, 0)).toBe(0);
	});

	it("keeps the enclosed hole when the scope is outer", () => {
		const image = createDonut([240, 240, 240]);
		const result = removeAutomaticBackground(image, 64, "outer", "4");

		expect(alphaAt(result.image, 15, 15)).toBe(255);
		expect(alphaAt(result.image, 0, 0)).toBe(0);
	});

	it("keeps an enclosed area that is merely close to the background color", () => {
		// 通常の候補許容には入るが、内側向けの厳密な許容からは外れる明るいグレー。
		const image = createDonut([224, 226, 222]);
		const result = removeAutomaticBackground(image, 64, "auto", "4");
		const everything = removeAutomaticBackground(image, 64, "all", "4");

		expect(alphaAt(result.image, 15, 15)).toBe(255);
		expect(alphaAt(result.image, 0, 0)).toBe(0);
		// "all" では落ちる＝通常の候補には入っており、厳密判定が効いていることの裏付け。
		expect(alphaAt(everything.image, 15, 15)).toBe(0);
	});

	it("keeps an enclosed area that surrounds another element", () => {
		// 中空の中央に別の要素がある＝線画の塗り面とみなして残す。
		const image = createImage(32, 32, (x, y) => {
			const distance = Math.hypot(x - 15.5, y - 15.5);
			if (x >= 14 && x <= 17 && y >= 14 && y <= 17) return [20, 20, 20, 255];
			if (distance <= 8) return [240, 240, 240, 255];
			if (distance <= 12) return [40, 90, 160, 255];
			return [240, 240, 240, 255];
		});
		const result = removeAutomaticBackground(image, 64, "auto", "4");

		expect(alphaAt(result.image, 15, 10)).toBe(255);
		expect(alphaAt(result.image, 0, 0)).toBe(0);
	});

	it("removes an enclosed hole for the RGB extraction method too", () => {
		const image = createDonut([255, 255, 255], [255, 255, 255]);
		const targets = getBackgroundTargets(image, "rgb", "#ffffff");
		const auto = removeBackground(image, 32, "auto", "4", targets, "rgb");
		const outer = removeBackground(image, 32, "outer", "4", targets, "rgb");

		expect(alphaAt(auto, 15, 15)).toBe(0);
		expect(alphaAt(auto, 15, 7)).toBe(255);
		expect(alphaAt(outer, 15, 15)).toBe(255);
	});

	it("keeps an enclosed area that only resembles the picked color", () => {
		const image = createDonut([236, 236, 236], [255, 255, 255]);
		const targets = getBackgroundTargets(image, "rgb", "#ffffff");
		const result = removeBackground(image, 32, "auto", "4", targets, "rgb");

		expect(alphaAt(result, 15, 15)).toBe(255);
		expect(alphaAt(result, 0, 0)).toBe(0);
	});
});
