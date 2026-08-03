import type { ProcessingAnalysis, RawImage, RGB } from "../shared/types";

export type BatchExportItem = {
	id: string;
	inputFilename: string;
	status: "done" | "error";
	result?: RawImage;
	analysis?: ProcessingAnalysis;
	attention?: boolean;
	error?: string;
};

export type BatchArchiveEntry = {
	id: string;
	inputFilename: string;
	outputFilename: string;
	result: RawImage;
};

const safeBasename = (filename: string): string => {
	const leaf = filename.split(/[\\/]/).pop() ?? "image";
	const withoutExtension = leaf.replace(/\.[^/.]+$/, "");
	let sanitized = "";
	for (let index = 0; index < withoutExtension.length; index += 1) {
		const code = withoutExtension.charCodeAt(index);
		sanitized += code < 32 || code === 127 ? "_" : withoutExtension[index];
	}
	return sanitized || "image";
};

export const createBatchArchiveEntries = (
	items: readonly BatchExportItem[],
	scale: number,
): BatchArchiveEntry[] => {
	const filenames = new Set<string>();
	const entries: BatchArchiveEntry[] = [];
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		if (item.status !== "done" || !item.result) continue;
		const base = safeBasename(item.inputFilename);
		const scaleSuffix = scale === 1 ? "" : `_x${scale}`;
		let outputFilename = `${base}_refined${scaleSuffix}.png`;
		let duplicate = 1;
		while (filenames.has(outputFilename)) {
			outputFilename = `${base}_refined${scaleSuffix}_${duplicate}.png`;
			duplicate += 1;
		}
		filenames.add(outputFilename);
		entries.push({
			id: item.id,
			inputFilename: item.inputFilename,
			outputFilename,
			result: item.result,
		});
	}
	return entries;
};

export const serializeBatchDiagnostics = (
	items: readonly BatchExportItem[],
	entries: readonly BatchArchiveEntry[],
	sharedPalette: readonly RGB[] | undefined,
): string => {
	const outputById = new Map(
		entries.map((entry) => [entry.id, entry.outputFilename]),
	);
	return `${JSON.stringify(
		{
			schemaVersion: 1,
			sharedPalette: sharedPalette
				? { enabled: true, colors: sharedPalette }
				: { enabled: false },
			items: items.map((item) => ({
				inputFilename: item.inputFilename,
				outputFilename: outputById.get(item.id) ?? null,
				status: item.status,
				classification: item.analysis?.classification ?? null,
				route: item.analysis?.route ?? null,
				confidence:
					item.analysis?.classificationConfidence ??
					item.analysis?.confidence ??
					null,
				attention: item.attention === true,
				warnings: item.analysis?.warnings ?? [],
				error: item.error ?? null,
			})),
		},
		null,
		2,
	)}\n`;
};
