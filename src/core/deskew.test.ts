import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	createDeskewAnalysisImage,
	createDeskewAngles,
	deskewOrientationScore,
	rotateRawImageExpanded,
	scoreDeskewAngles,
} from "./deskew";

const image = (width: number, height: number): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let offset = 0; offset < data.length; offset += 4) {
		data[offset] = 200;
		data[offset + 1] = 100;
		data[offset + 2] = 50;
		data[offset + 3] = 255;
	}
	return { width, height, data };
};

describe("deskew geometry", () => {
	it("0度では入力バッファをそのまま再利用する", () => {
		const source = image(8, 4);
		expect(rotateRawImageExpanded(source, 0)).toBe(source);
	});

	it.each([-3, -1, -0.25, 0.25, 1, 3])(
		"%s度で四隅を含むキャンバスへ決定論的に展開する",
		(angle) => {
			const source = image(32, 16);
			const first = rotateRawImageExpanded(source, angle);
			const second = rotateRawImageExpanded(source, angle);
			expect(first.width).toBeGreaterThanOrEqual(source.width);
			expect(first.height).toBeGreaterThanOrEqual(source.height);
			expect(first).toEqual(second);
		},
	);

	it("透明画素のRGBを可視境界へ混入させない", () => {
		const source = image(3, 3);
		for (let offset = 0; offset < source.data.length; offset += 4) {
			source.data[offset] = 0;
			source.data[offset + 1] = 255;
			source.data[offset + 2] = 0;
			source.data[offset + 3] = 0;
		}
		const center = (1 * source.width + 1) * 4;
		source.data[center] = 255;
		source.data[center + 1] = 0;
		source.data[center + 2] = 0;
		source.data[center + 3] = 255;
		const rotated = rotateRawImageExpanded(source, 3);
		for (let offset = 0; offset < rotated.data.length; offset += 4) {
			if (rotated.data[offset + 3] === 0) continue;
			expect(rotated.data[offset + 1]).toBe(0);
		}
	});

	it("解析画像の最大辺と角度候補数を固定する", () => {
		const analysis = createDeskewAnalysisImage(image(1024, 512));
		expect(analysis.width).toBe(256);
		expect(analysis.height).toBe(128);
		const angles = createDeskewAngles();
		expect(angles).toHaveLength(25);
		expect(angles[0]).toBe(-3);
		expect(angles[angles.length - 1]).toBe(3);
	});

	it("複数角度の一括評価を個別評価と一致させる", () => {
		const source = image(8, 8);
		const angles = [-1, 0, 1];
		expect(scoreDeskewAngles(source, angles)).toEqual(
			angles.map((angle) => deskewOrientationScore(source, angle)),
		);
	});
});
