import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	type BatchExportItem,
	createBatchArchiveEntries,
	createBatchExportItems,
	encodeBatchEntries,
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

	it("builds exports only from the batch-start snapshot", () => {
		const analysis = {
			classification: "native-pixel" as const,
			classificationConfidence: 0.9,
			route: "preserve" as const,
			confidence: 1,
			warnings: [],
			gridCandidates: [],
		};
		const processResult = {
			result,
			grid: { cellW: 1, cellH: 1, offsetX: 0, offsetY: 0, score: 1 },
			extractedPalette: [{ r: 255, g: 0, b: 0 }],
			compareBefore: result,
			compareBeforeSanitized: result,
			analysis,
		};
		const items = createBatchExportItems(
			[{ id: "started", inputFilename: "started.png" }],
			[
				{ id: "started", status: "done", processResult },
				{ id: "added-later", status: "done", processResult },
			],
		);

		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			id: "started",
			inputFilename: "started.png",
			status: "done",
		});
	});

	it("isolates PNG encoding failures and keeps successful entries", async () => {
		const entries = createBatchArchiveEntries(
			[
				{ id: "good", inputFilename: "good.png", status: "done", result },
				{ id: "bad", inputFilename: "bad.png", status: "done", result },
			],
			1,
		);
		const encoded = await encodeBatchEntries(entries, async (entry) =>
			entry.id === "good" ? new Blob(["png"]) : null,
		);

		expect(encoded.encoded.map(({ entry }) => entry.id)).toEqual(["good"]);
		expect(encoded.failed).toMatchObject([
			{ entry: { id: "bad" }, error: "PNG export failed: bad.png" },
		]);
	});
});
