import { expose } from "comlink";
import { CANDIDATE_PREVIEW_LIMITS } from "../shared/config";
import type {
	CandidatePreview,
	CandidateSelection,
	ProcessingAnalysis,
	ProcessResult,
	RawImage,
} from "../shared/types";
import {
	candidateProcessOptions,
	createCandidatePreview,
	selectCandidatePlans,
} from "./candidate-previews";
import type { ProcessOptions } from "./processor";
import { processImage } from "./processor";

export type ProcessorWorker = {
	process: (img: RawImage, options: ProcessOptions) => ProcessResult;
	previewCandidates: (
		img: RawImage,
		options: ProcessOptions,
		analysis: ProcessingAnalysis,
		cacheKey: string,
	) => CandidatePreview[];
	processCandidate: (
		img: RawImage,
		options: ProcessOptions,
		selection: CandidateSelection,
	) => ProcessResult;
};

const candidateCache = new Map<string, CandidatePreview[]>();

const worker: ProcessorWorker = {
	process: (img, options) => {
		return processImage(img, options);
	},
	previewCandidates: (img, options, analysis, cacheKey) => {
		const cached = candidateCache.get(cacheKey);
		if (cached) return cached;
		const plans = selectCandidatePlans(analysis);
		const previews: CandidatePreview[] = [];
		for (let index = 0; index < plans.length; index += 1) {
			const plan = plans[index];
			try {
				const processed = processImage(
					img,
					candidateProcessOptions(options, plan),
				);
				previews.push(
					createCandidatePreview(
						plan,
						processed.result,
						processed.extractedPalette.length,
					),
				);
			} catch {
				// [Intended] 1候補の生成失敗で、安全に確定済みの処理結果まで失敗扱いにしない。
			}
		}
		if (candidateCache.size >= CANDIDATE_PREVIEW_LIMITS.maxCacheEntries) {
			const oldestKey = candidateCache.keys().next().value;
			if (oldestKey !== undefined) candidateCache.delete(oldestKey);
		}
		candidateCache.set(cacheKey, previews);
		return previews;
	},
	processCandidate: (img, options, selection) =>
		processImage(img, candidateProcessOptions(options, selection)),
};

expose(worker);
