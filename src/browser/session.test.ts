import { describe, expect, it, vi } from "vitest";
import type { ProcessingAnalysis, RawImage } from "../shared/types";
import { type ImageItem, ImageSession } from "./session";

const image = (): RawImage => ({
	width: 1,
	height: 1,
	data: new Uint8ClampedArray([0, 0, 0, 255]),
});

const analysis = (): ProcessingAnalysis => ({
	classification: "native-pixel",
	classificationConfidence: 0.9,
	route: "preserve",
	confidence: 0.8,
	warnings: [],
	gridCandidates: [],
});

describe("ImageSession", () => {
	it("stores processing analysis with each image result", () => {
		const session = new ImageSession({
			onUpdate: vi.fn(),
			onActiveChange: vi.fn(),
		});
		const original = image();
		const item: ImageItem = {
			id: "image-1",
			file: { name: "image.png" } as File,
			original,
			thumbnail: "",
			status: "pending",
		};
		(session as unknown as { images: ImageItem[] }).images.push(item);
		const processingAnalysis = analysis();

		session.updateImageResult(item.id, original, undefined, processingAnalysis);

		expect(session.getImages()[0].processingAnalysis).toBe(processingAnalysis);
	});
});
