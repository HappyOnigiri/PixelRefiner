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
	type BatchProcessInput,
	type BatchProcessingOptions,
	type BatchProcessResult,
	processBatchImages,
} from "./batch";
import {
	candidateProcessOptions,
	createCandidateAcceptor,
	createCandidatePreview,
	selectCandidatePlans,
} from "./candidate-previews";
import { classifyInput } from "./classifier";
import type { ProcessOptions } from "./processor";
import { processImage } from "./processor";
import type { DetectedGridHandoff } from "./processor-options";

/** Auto の実結果。auto-result 候補を再計算せずに提示するために受け取る。 */
export type AutoResultPreviewInput = {
	result: RawImage;
	colorCount: number;
};

export type ProcessorWorker = {
	process: (
		img: RawImage,
		options: ProcessOptions,
		detectionKey?: string,
	) => ProcessResult;
	processBatch: (
		inputs: BatchProcessInput[],
		options: BatchProcessingOptions,
	) => BatchProcessResult;
	previewCandidates: (
		img: RawImage,
		options: ProcessOptions,
		analysis: ProcessingAnalysis,
		cacheKey: string,
		autoResult?: AutoResultPreviewInput,
	) => CandidatePreview[];
	processCandidate: (
		img: RawImage,
		options: ProcessOptions,
		selection: CandidateSelection,
	) => ProcessResult;
};

const candidateCache = new Map<string, CandidatePreview[]>();
/**
 * 直前の処理で確定した検出結果。候補プレビューがグリッド検出をやり直さないために持つ。
 * [Policy] 鍵は候補キャッシュと同じ「画像 + 処理オプション」。検出結果は入力と検出
 * パラメータだけで決まるので、同じ鍵なら検出し直しても同じ格子になる。
 */
const detectionCache = new Map<string, DetectedGridHandoff>();

const remember = <Value>(
	cache: Map<string, Value>,
	key: string,
	value: Value,
) => {
	if (cache.size >= CANDIDATE_PREVIEW_LIMITS.maxCacheEntries) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== undefined) cache.delete(oldestKey);
	}
	cache.set(key, value);
};

const worker: ProcessorWorker = {
	process: (img, options, detectionKey) => {
		if (detectionKey === undefined) return processImage(img, options);
		let detected: DetectedGridHandoff | undefined;
		const result = processImage(img, {
			...options,
			onDetectedGrid: (handoff) => {
				detected = handoff;
			},
		});
		if (detected) remember(detectionCache, detectionKey, detected);
		return result;
	},
	processBatch: (inputs, options) => processBatchImages(inputs, options),
	previewCandidates: (img, options, analysis, cacheKey, autoResult) => {
		const cached = candidateCache.get(cacheKey);
		if (cached) return cached;
		// [Intended] refine など auto 以外のモードでは processImage が分類を行わないため、
		// 候補計画のためだけにここで補う。既定の処理結果には影響させない。
		// 背景除去後の作業画像は呼び出し元に残っていないので、入力画像から判定する。
		const classification =
			analysis.classification ??
			classifyInput(img, analysis.gridCandidates).classification;
		const plans = selectCandidatePlans(
			analysis,
			classification,
			options.cellScale,
		);
		const detectedGrid = detectionCache.get(cacheKey);
		const accept = createCandidateAcceptor(analysis);
		const previews: CandidatePreview[] = [];
		for (let index = 0; index < plans.length; index += 1) {
			const plan = plans[index];
			try {
				// [Intended] Auto 結果は呼び出し元がすでに持っている実結果をそのまま使う。
				// 同じ入力で Auto をもう一度走らせても同じ絵にしかならず、候補の中で
				// 最も重いグリッド検出をもう 1 回通すだけになる。
				if (plan.kind === "auto-result" && autoResult) {
					previews.push(
						createCandidatePreview(
							plan,
							autoResult.result,
							autoResult.colorCount,
						),
					);
					continue;
				}
				const processed = processImage(
					img,
					candidateProcessOptions(options, plan, detectedGrid),
				);
				// [Intended] 見て選べない候補は、生成し終えた実出力で落とす。プラン段階の
				// 見積もりでは、トリム後に 1x1 まで潰れる候補や隣の段階と同寸法になる候補を
				// 判別できない。
				if (!accept(plan, processed.result)) continue;
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
		remember(candidateCache, cacheKey, previews);
		return previews;
	},
	processCandidate: (img, options, selection) =>
		processImage(img, candidateProcessOptions(options, selection)),
};

expose(worker);
