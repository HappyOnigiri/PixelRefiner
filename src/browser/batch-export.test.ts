import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	type BatchExportItem,
	createBatchArchiveEntries,
	serializeBatchDiagnostics,
} from "./batch-export";

const result: RawImage = {
	width: 1,
	height: 1,
	data: new Uint8ClampedArray([255, 0, 0, 255]),
};

describe("batch export", () => {
	it("creates unique names and keeps diagnostic mappings exact", () => {
		const items: BatchExportItem[] = [
			{ id: "a", inputFilename: "sprite.png", status: "done", result },
			{ id: "b", inputFilename: "sprite.jpg", status: "done", result },
			{ id: "c", inputFilename: "broken.png", status: "error", error: "bad" },
		];
		const entries = createBatchArchiveEntries(items, 2);
		const diagnostics = JSON.parse(
			serializeBatchDiagnostics(items, entries, undefined),
		) as { items: Array<{ outputFilename: string | null; status: string }> };

		expect(entries.map((entry) => entry.outputFilename)).toEqual([
			"sprite_refined_x2.png",
			"sprite_refined_x2_1.png",
		]);
		expect(diagnostics.items).toMatchObject([
			{ outputFilename: "sprite_refined_x2.png", status: "done" },
			{ outputFilename: "sprite_refined_x2_1.png", status: "done" },
			{ outputFilename: null, status: "error" },
		]);
	});

	it("includes route confidence and shared palette metadata", () => {
		const items: BatchExportItem[] = [
			{
				id: "a",
				inputFilename: "sprite.png",
				status: "done",
				result,
				attention: true,
				analysis: {
					classification: "uncertain",
					classificationConfidence: 0.5,
					route: "preserve",
					confidence: 1,
					warnings: ["LOW_GRID_CONFIDENCE"],
					gridCandidates: [],
				},
			},
		];
		const entries = createBatchArchiveEntries(items, 1);
		const diagnostics = JSON.parse(
			serializeBatchDiagnostics(items, entries, [{ r: 255, g: 0, b: 0 }]),
		) as {
			sharedPalette: { enabled: boolean };
			items: Array<{ route: string; confidence: number; attention: boolean }>;
		};

		expect(diagnostics.sharedPalette.enabled).toBe(true);
		expect(diagnostics.items[0]).toMatchObject({
			route: "preserve",
			confidence: 0.5,
			attention: true,
		});
	});
});
