import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { applySharedPalette, createSharedPalette } from "./shared-palette";

const solidImage = (
	width: number,
	height: number,
	r: number,
	g: number,
	b: number,
	a = 255,
): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let offset = 0; offset < data.length; offset += 4) {
		data[offset] = r;
		data[offset + 1] = g;
		data[offset + 2] = b;
		data[offset + 3] = a;
	}
	return { width, height, data };
};

const colorKeys = (image: RawImage): Set<string> => {
	const keys = new Set<string>();
	for (let offset = 0; offset < image.data.length; offset += 4) {
		if (image.data[offset + 3] === 0) continue;
		keys.add(
			`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`,
		);
	}
	return keys;
};

describe("shared palette", () => {
	it("is deterministic and independent of batch order", () => {
		const red = solidImage(64, 64, 240, 20, 20);
		const blue = solidImage(2, 2, 20, 20, 240);
		const forward = createSharedPalette([red, blue], 2);
		const reversed = createSharedPalette([blue, red], 2);

		expect(reversed).toEqual(forward);
		expect(forward).toHaveLength(2);
	});

	it("balances image contribution and protects an accent color", () => {
		const dominant = solidImage(128, 128, 240, 20, 20);
		const accented = solidImage(4, 4, 20, 20, 240);
		accented.data[0] = 20;
		accented.data[1] = 240;
		accented.data[2] = 20;

		const palette = createSharedPalette([dominant, accented], 3);
		const keys = new Set(
			palette.map((color) => `${color.r},${color.g},${color.b}`),
		);

		expect(keys).toContain("240,20,20");
		expect(keys).toContain("20,20,240");
		expect(keys).toContain("20,240,20");
	});

	it("does not count transparent RGB values", () => {
		const image = solidImage(4, 4, 0, 255, 0, 0);
		image.data.set([255, 0, 0, 255], 0);

		expect(createSharedPalette([image], 2)).toEqual([{ r: 255, g: 0, b: 0 }]);
	});

	it("maps opaque colors to the palette while preserving alpha", () => {
		const image: RawImage = {
			width: 2,
			height: 1,
			data: new Uint8ClampedArray([120, 10, 10, 200, 1, 2, 3, 0]),
		};
		const result = applySharedPalette(
			image,
			[
				{ r: 255, g: 0, b: 0 },
				{ r: 0, g: 0, b: 255 },
			],
			"none",
			0,
		);

		expect(colorKeys(result)).toEqual(new Set(["255,0,0"]));
		expect(Array.from(result.data.slice(3, 8))).toEqual([200, 1, 2, 3, 0]);
	});
});
