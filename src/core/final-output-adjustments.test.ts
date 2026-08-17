import { describe, expect, it } from "vitest";
import type { PixelGrid, RawImage } from "../shared/types";
import {
	applyFinalOutputAdjustments,
	padFinalOutputCompanions,
} from "./final-output-adjustments";

const createImage = (width: number, height: number): RawImage => ({
	width,
	height,
	data: new Uint8ClampedArray(width * height * 4).fill(255),
});

const createGrid = (cellW: number, cellH: number): PixelGrid => ({
	cellW,
	cellH,
	offsetX: 4,
	offsetY: 6,
	score: 0,
	cropX: 4,
	cropY: 6,
	cropW: 8 * cellW,
	cropH: 6 * cellH,
});

const baseOptions = {
	outlineStyle: "none",
	outlineColor: { r: 0, g: 0, b: 0 },
	keepAspectRatio: false,
	makeSquare: false,
} as const;

describe("applyFinalOutputAdjustments", () => {
	it("アウトラインは 1 セルぶんの均等パディングとして記録される", () => {
		const { image, steps } = applyFinalOutputAdjustments(
			createImage(8, 6),
			8 / 6,
			{ ...baseOptions, outlineStyle: "sharp" },
		);

		expect(image.width).toBe(10);
		expect(image.height).toBe(8);
		expect(steps).toEqual([
			{
				kind: "outline",
				left: 1,
				top: 1,
				right: 1,
				bottom: 1,
				width: 10,
				height: 8,
			},
		]);
	});

	it("正方形化は左右・上下へ分けたパディングを記録する", () => {
		const { image, steps } = applyFinalOutputAdjustments(
			createImage(8, 5),
			8 / 5,
			{
				...baseOptions,
				makeSquare: true,
			},
		);

		expect(image.width).toBe(8);
		expect(image.height).toBe(8);
		expect(steps).toEqual([
			{
				kind: "square",
				left: 0,
				top: 1,
				right: 0,
				bottom: 2,
				width: 8,
				height: 8,
			},
		]);
	});

	it("applyOutlineAndAspectRatio が false ならアウトラインとアスペクト比は適用しない", () => {
		const { image, steps } = applyFinalOutputAdjustments(
			createImage(8, 6),
			2,
			{ ...baseOptions, outlineStyle: "sharp", keepAspectRatio: true },
			false,
		);

		expect(image.width).toBe(8);
		expect(image.height).toBe(6);
		expect(steps).toEqual([]);
	});
});

describe("padFinalOutputCompanions", () => {
	const steps = [
		{
			kind: "outline" as const,
			left: 1,
			top: 1,
			right: 1,
			bottom: 1,
			width: 10,
			height: 8,
		},
	];

	it('compareBeforeCoordinates="source" では compareBefore をセル寸法で引き伸ばす', () => {
		const grid = createGrid(3, 5);
		const result = padFinalOutputCompanions(
			createImage(24, 30),
			createImage(8, 6),
			grid,
			steps,
			"source",
		);

		// compareBefore は原寸なのでセル寸法ぶん、sanitized は論理解像度なので 1 セルぶん。
		expect([result.compareBefore.width, result.compareBefore.height]).toEqual([
			30, 40,
		]);
		expect([
			result.compareBeforeSanitized.width,
			result.compareBeforeSanitized.height,
		]).toEqual([10, 8]);
		expect(result.grid.cropX).toBe(4 - 3);
		expect(result.grid.cropY).toBe(6 - 5);
		expect(result.grid.cropW).toBe(30);
		expect(result.grid.cropH).toBe(40);
		expect([result.grid.outW, result.grid.outH]).toEqual([10, 8]);
	});

	it('compareBeforeCoordinates="logical" では compareBefore にも論理解像度のまま足す', () => {
		const grid = createGrid(3, 5);
		const result = padFinalOutputCompanions(
			createImage(8, 6),
			createImage(8, 6),
			grid,
			steps,
			"logical",
		);

		expect([result.compareBefore.width, result.compareBefore.height]).toEqual([
			10, 8,
		]);
		// crop 座標は座標系の指定にかかわらず原寸のパディング量を引く。
		expect(result.grid.cropX).toBe(4 - 3);
		expect(result.grid.cropY).toBe(6 - 5);
	});

	it("shouldRoundSourcePadding が false の種別はセル寸法を丸めずに掛ける", () => {
		const grid = createGrid(2.5, 2.5);
		const rounded = padFinalOutputCompanions(
			createImage(20, 15),
			createImage(8, 6),
			grid,
			steps,
			"source",
		);
		const unrounded = padFinalOutputCompanions(
			createImage(20, 15),
			createImage(8, 6),
			grid,
			steps,
			"source",
			() => false,
		);

		// Math.round(1 * 2.5) は 3、丸めなしなら 2.5 のまま crop 座標へ反映される。
		expect(rounded.grid.cropX).toBe(4 - 3);
		expect(unrounded.grid.cropX).toBe(4 - 2.5);
	});

	it("複数の調整が連なっても crop 原点が累積して後退する", () => {
		const grid = createGrid(2, 2);
		const result = padFinalOutputCompanions(
			createImage(16, 12),
			createImage(8, 6),
			grid,
			[
				...steps,
				{
					kind: "square" as const,
					left: 0,
					top: 1,
					right: 0,
					bottom: 1,
					width: 10,
					height: 10,
				},
			],
			"source",
		);

		expect(result.grid.cropX).toBe(4 - 2);
		expect(result.grid.cropY).toBe(6 - 2 - 2);
		expect([result.grid.outW, result.grid.outH]).toEqual([10, 10]);
		expect(result.grid.cropW).toBe(20);
		expect(result.grid.cropH).toBe(20);
	});
});
