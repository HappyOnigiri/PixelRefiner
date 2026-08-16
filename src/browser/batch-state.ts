export type BatchStatusWriter = {
	setImageStatus: (id: string, status: "error", error: string) => void;
};

export const failBatchProcessing = (
	writer: BatchStatusWriter,
	imageIds: readonly string[],
	error: unknown,
): string => {
	const message = error instanceof Error ? error.message : String(error);
	for (let index = 0; index < imageIds.length; index += 1) {
		writer.setImageStatus(imageIds[index], "error", message);
	}
	return message;
};
