import { candidateProcessOptions } from "../core/candidate-previews";
import type { ProcessOptions } from "../core/processor";
import type { CandidateSelection } from "../shared/types";

export const createBatchItemOptions = (
	base: ProcessOptions,
	selection: CandidateSelection | undefined,
): ProcessOptions =>
	selection === undefined ? base : candidateProcessOptions(base, selection);

export const isDitherSettingsEnabled = (reduceColorMode: string): boolean =>
	reduceColorMode !== "none";
