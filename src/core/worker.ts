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
import { classifyInput } from "./classifier";
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
		// [Intended] refine など auto 以外のモードでは processImage が分類を行わないため、
		// 候補計画のためだけにここで補う。既定の処理結果には影響させない。
		// 背景除去後の作業画像は呼び出し元に残っていないので、入力画像から判定する。
		const classification =
			analysis.classification ??
			classifyInput(img, analysis.gridCandidates).classification;
		const plans = selectCandidatePlans(analysis, classification);
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
			} catch (error) {
				// [Intended] 1候補の生成失敗で、安全に確定済みの処理結果まで失敗扱いにしない。
				// 候補が黙って消えると原因を追えないため、種別とエラーだけ残す。
				console.warn(`Candidate preview failed (${plan.id}):`, error);
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
