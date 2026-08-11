import {
	DESKEW_LIMITS,
	GRID_SEARCH_LIMITS,
	TRIMMED_GRID_SEARCH_LIMITS,
} from "../shared/config";
import type {
	PixelGrid,
	ProcessResult,
	RawImage,
	SmallComponentRemovalDiagnostic,
} from "../shared/types";
import { evaluateAutoGridDegeneracy } from "./auto-grid-guard";
import {
	getBackgroundTargets,
	removeBackground,
	removeBackgroundByFloodFillLegacy,
	removeSmallFloatingComponentsInPlace,
} from "./background-removal";
import { classifyInput, selectAutoProcessingRoute } from "./classifier";
import { applyColorReduction, extractUsedColors } from "./color-reduction";
import { removeSmallComponents } from "./components";
import { rotateRawImageExpanded } from "./deskew";
import { detectGrid } from "./detector";
import {
	applyGeminiWatermarkRemoval,
	createGeminiWatermarkDetectionMask,
} from "./gemini-watermark";
import {
	rankGridCandidates,
	rerankGridCandidateReports,
} from "./grid-candidates";
import {
	type DeskewGridSearchResult,
	resolveGridEstimate,
	searchDeskewedGrid,
	searchPhaseAwareGrid,
} from "./grid-search";
import {
	cloneImage,
	cropRawImage,
	cropRawImageNearestFromGrid,
	downsample,
	findOpaqueBounds,
	getAspectRatio,
	padImageToAspectRatio,
	padRawImage,
} from "./image-operations";
import { applyOutline } from "./outline";
import {
	createProcessingAnalysis,
	detectedGridConfidenceWarnings,
	findCandidateIndexForGrid,
} from "./processing-analysis";
import { prepareAutomaticBackground } from "./processor-background";
import { processConvertRoute } from "./processor-convert-route";
import {
	getDownsampleOptions,
	normalizeProcessOptions,
	type ProcessOptions,
} from "./processor-options";
import {
	processExplicitSimpleRoute,
	processForcedRoute,
	processGridDisabledRoute,
	type SimpleRouteContext,
} from "./processor-simple-routes";
import { getGridSearchFromTrimmedStrategy } from "./trimmed-grid-search";

export type { ProcessResult } from "../shared/types";
export type { BackgroundCluster, BackgroundModel } from "./background";
export {
	estimateBackgroundModel,
	removeAutomaticBackground,
} from "./background";
export { _removeSmallFloatingComponentsInPlace } from "./background-removal";
export type {
	CellSampler,
	CellSamplerOptions,
	CellSamplingMode,
} from "./cell-sampler";
export {
	createConvertCandidates,
	edgeAwareAreaResample,
} from "./converter";
export { searchPhaseAwareGrid } from "./grid-search";
export {
	downsample,
	padImageToAspectRatio,
	resizeRawImageNearest,
	sampleRawImage,
} from "./image-operations";
export type { ProcessOptions } from "./processor-options";
export {
	FastGridSearchFromTrimmed,
	LegacyGridSearchFromTrimmed,
} from "./trimmed-grid-search";

const processImageCore = (
	inputImage: RawImage,
	options: ProcessOptions = {},
): ProcessResult => {
	const o = normalizeProcessOptions(options);
	const sourceAspectRatio = o.keepAspectRatio ? getAspectRatio(inputImage) : 0;
	const bgTargetsStart = performance.now();
	// [Intended] 回転で生じる透明な拡張角ではなく、利用者が指定した元画像の角から背景色を取得する。
	const bgTargets =
		o.bgRemovalScope !== "off"
			? getBackgroundTargets(inputImage, o.bgExtractionMethod, o.bgRgb, 16)
			: [];
	const { automaticBackground, backgroundModel, backgroundDiagnostic } =
		prepareAutomaticBackground(inputImage, o);
	let backgroundMaskedInput: RawImage | undefined;
	let preRemovedInput: RawImage | undefined;
	const getBackgroundMaskedInput = (): RawImage => {
		if (backgroundMaskedInput) return backgroundMaskedInput;
		if (automaticBackground) {
			backgroundMaskedInput = automaticBackground.image;
		} else if (
			o.bgRemovalScope === "off" ||
			o.bgExtractionMethod === "none" ||
			(o.bgExtractionMethod === "auto" && !backgroundModel)
		) {
			backgroundMaskedInput = cloneImage(inputImage);
		} else {
			backgroundMaskedInput = removeBackground(
				inputImage,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
			);
		}
		return backgroundMaskedInput;
	};
	const getPreRemovedInput = (): RawImage => {
		if (preRemovedInput) return preRemovedInput;
		if (automaticBackground) {
			preRemovedInput = automaticBackground.image;
		} else if (o.bgExtractionMethod === "auto") {
			preRemovedInput = cloneImage(inputImage);
		} else if (o.bgRemovalScope === "outer") {
			preRemovedInput = removeBackground(
				inputImage,
				o.backgroundTolerance,
				"outer",
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
			);
		} else if (o.bgRemovalScope === "selected") {
			preRemovedInput = removeBackgroundByFloodFillLegacy(
				inputImage,
				o.backgroundTolerance,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
			);
		} else if (o.bgRemovalScope === "all") {
			preRemovedInput = removeBackgroundByFloodFillLegacy(
				inputImage,
				o.backgroundTolerance,
				"4",
				bgTargets,
				o.bgExtractionMethod,
			);
		} else {
			preRemovedInput = cloneImage(inputImage);
		}
		return preRemovedInput;
	};
	let deskewSearch: DeskewGridSearchResult | null = null;
	let appliedDeskewAngle = o.deskewAngle;
	let img = inputImage;
	if (appliedDeskewAngle !== 0) {
		img = rotateRawImageExpanded(inputImage, appliedDeskewAngle);
	} else if (
		o.enableDeskew &&
		o.enableGridDetection &&
		o.autoGridFromTrimmed &&
		o.fastAutoGridFromTrimmed &&
		o.hintPixelsW === undefined &&
		o.hintPixelsH === undefined &&
		o.forcePixelsW === undefined &&
		o.forcePixelsH === undefined &&
		(o.processingMode === "auto" || o.processingMode === "refine") &&
		Math.min(inputImage.width, inputImage.height) >=
			DESKEW_LIMITS.minimumInputDimension &&
		// [Policy] 上位角度のフル解像度評価が処理時間を占有しないよう、自動補正の画素数を制限する。
		inputImage.width * inputImage.height <= DESKEW_LIMITS.maximumInputPixels
	) {
		const deskewMask =
			o.bgRemovalScope === "off" || o.bgExtractionMethod === "none"
				? inputImage
				: getBackgroundMaskedInput();
		deskewSearch = searchDeskewedGrid(inputImage, deskewMask, o.gridSignals);
		if (deskewSearch) {
			appliedDeskewAngle = deskewSearch.angle;
			img = deskewSearch.image;
		}
	}
	const startTime = performance.now();
	const log = (...args: unknown[]) => {
		if (o.debug) {
			console.log("[Processor]", ...args);
		}
	};

	log("Processing started", {
		width: img.width,
		height: img.height,
		options: o,
	});

	log(
		`Background targets extracted in ${(performance.now() - bgTargetsStart).toFixed(2)}ms`,
		bgTargets,
	);

	const workingStart = performance.now();
	let working: RawImage;
	if (!o.preRemoveBackground) {
		working = cloneImage(img);
	} else if (
		o.bgRemovalScope !== "off" &&
		o.bgExtractionMethod !== "none" &&
		!(o.bgExtractionMethod === "auto" && !backgroundModel)
	) {
		const maskedInput = getPreRemovedInput();
		working =
			appliedDeskewAngle === 0
				? cloneImage(maskedInput)
				: rotateRawImageExpanded(maskedInput, appliedDeskewAngle);
	} else if (o.bgExtractionMethod === "auto") {
		// [Intended] auto の除去経路は prepareAutomaticBackground だけが持つ。
		// 除去結果が無い場合は角シードのレガシー経路へ落とさず、元画像をそのまま保つ。
		working = cloneImage(img);
	} else {
		working = cloneImage(img);
	}
	log(
		`Pre-background removal done in ${(performance.now() - workingStart).toFixed(2)}ms`,
	);

	o.debugHook?.("00-input", img);
	o.debugHook?.("01-working", working, {
		preRemoveBackground: o.preRemoveBackground,
	});
	const trimToContent = o.trimToContent;
	const trimAlphaThreshold = o.trimAlphaThreshold;

	let smallComponentRemoval: SmallComponentRemovalDiagnostic | undefined;
	const simpleRouteContext: SimpleRouteContext = {
		img,
		o,
		working,
		bgTargets,
		trimAlphaThreshold,
		startTime,
		log,
		backgroundDiagnostic,
		backgroundModel,
		smallComponentRemoval,
	};
	let watermarkDetection:
		| ReturnType<typeof createGeminiWatermarkDetectionMask>
		| undefined;
	const finishProcessing = (processed: ProcessResult): ProcessResult => {
		if (o.geminiWatermarkRemoval === "off") return processed;
		watermarkDetection ??= createGeminiWatermarkDetectionMask(
			inputImage,
			o,
			automaticBackground,
			getBackgroundMaskedInput,
		);
		return applyGeminiWatermarkRemoval(
			inputImage,
			watermarkDetection.image,
			processed,
			o,
			appliedDeskewAngle,
			watermarkDetection.mode,
		);
	};
	const forcedResult = processForcedRoute(simpleRouteContext);
	if (forcedResult) return finishProcessing(forcedResult);
	// [Intended] 明示された処理経路は enableGridDetection の早期 return より先に判定する。
	// 逆順だと、グリッド検出を無効にしただけで指定した convert が preserve に化ける。
	if (o.processingMode === "convert") {
		return finishProcessing(
			processConvertRoute({
				...simpleRouteContext,
				route: "convert",
				method: "manual-convert",
			}),
		);
	}
	if (o.processingMode === "preserve") {
		return finishProcessing(
			processExplicitSimpleRoute({
				...simpleRouteContext,
				route: "preserve",
				method: "manual-preserve",
			}),
		);
	}
	const gridDisabledResult = processGridDisabledRoute(simpleRouteContext);
	if (gridDisabledResult) return finishProcessing(gridDisabledResult);

	// auto: まず背景トリミング後の領域（ダウンサンプリング前）から outW/outH を推定し、そのままダウンサンプリングする。
	// （隙間の多い画像でも、安定させるためコンテンツ領域に注目したい。）
	const autoGridFromTrimmed = o.autoGridFromTrimmed;

	// デバッグ用に「背景トリミング後」（ダウンサンプリング前）の見た目を出力する。
	// これはデバッグ出力のためだけに計算され、実際の処理パイプラインは変更しない。
	const bgTol = o.backgroundTolerance;
	const maskedStart = performance.now();
	const maskedForDebugOrAuto =
		o.debugHook || autoGridFromTrimmed || o.floatingMaxPixels > 0
			? appliedDeskewAngle !== 0 &&
				o.bgRemovalScope !== "off" &&
				o.bgExtractionMethod !== "none"
				? o.preRemoveBackground
					? cloneImage(working)
					: rotateRawImageExpanded(
							getBackgroundMaskedInput(),
							appliedDeskewAngle,
						)
				: removeBackground(
						working,
						bgTol,
						o.bgRemovalScope,
						o.bgConnectivity,
						bgTargets,
						o.bgExtractionMethod,
						backgroundModel,
					)
			: null;
	if (maskedForDebugOrAuto) {
		log(
			`Masked image for debug/auto created in ${(performance.now() - maskedStart).toFixed(2)}ms`,
		);
	}

	if (maskedForDebugOrAuto && o.floatingMaxPixels > 0) {
		const floatingStart = performance.now();
		const { removedComponents, removedPixels } =
			removeSmallFloatingComponentsInPlace(
				working,
				maskedForDebugOrAuto,
				trimAlphaThreshold,
				o.floatingMaxPixels,
			);
		log(
			`Floating components removed in ${(performance.now() - floatingStart).toFixed(2)}ms`,
			{ removedComponents, removedPixels },
		);
		smallComponentRemoval = {
			mode: "legacy",
			applied: true,
			removedComponents,
			removedPixels,
			pixelBasis: "source",
		};
		simpleRouteContext.smallComponentRemoval = smallComponentRemoval;
		if (o.debugHook && removedPixels > 0) {
			o.debugHook("01b-working-ignore-floating", working, {
				floatingMaxPixels: o.floatingMaxPixels,
				removedComponents,
				removedPixels,
			});
		}
	}
	if (maskedForDebugOrAuto && o.debugHook) {
		o.debugHook("02-pre-downsample-masked", maskedForDebugOrAuto, {
			bgTol,
		});
		const b = findOpaqueBounds(maskedForDebugOrAuto, trimAlphaThreshold);
		if (b) {
			const cropped = cropRawImage(working, b.x, b.y, b.w, b.h);
			o.debugHook("03-pre-downsample-bg-trimmed", cropped, { bounds: b });
		}
	}

	let grid: PixelGrid | null = null;
	let gridMethod = "detect-grid";
	let downsampleOptions = getDownsampleOptions(o);
	let allowSmallTrimmedGrid = false;

	if (autoGridFromTrimmed && maskedForDebugOrAuto) {
		log("Auto grid from trimmed mode");
		const b = findOpaqueBounds(maskedForDebugOrAuto, trimAlphaThreshold);
		if (b) {
			const cropped = cropRawImage(working, b.x, b.y, b.w, b.h);
			const croppedMask = cropRawImage(
				maskedForDebugOrAuto,
				b.x,
				b.y,
				b.w,
				b.h,
			);
			o.debugHook?.("03-pre-downsample-bg-trimmed", cropped, {
				bounds: b,
			});

			const sw = o.sampleWindow;
			const searchStart = performance.now();
			const hint =
				o.hintPixelsW !== undefined && o.hintPixelsH !== undefined
					? { outW: o.hintPixelsW, outH: o.hintPixelsH }
					: undefined;
			const est = getGridSearchFromTrimmedStrategy(
				o.fastAutoGridFromTrimmed,
			).search(cropped, croppedMask, sw, hint);
			const phaseAwareEstimate =
				o.fastAutoGridFromTrimmed && hint === undefined
					? searchPhaseAwareGrid(cropped, croppedMask, o.gridSignals)
					: null;
			log(
				`Grid search from trimmed done in ${(performance.now() - searchStart).toFixed(2)}ms`,
				est,
			);
			if (est) {
				const phaseAwareReliable =
					appliedDeskewAngle === 0 &&
					phaseAwareEstimate !== null &&
					(phaseAwareEstimate.scoreX ?? 0) >=
						GRID_SEARCH_LIMITS.axisConfidenceThreshold &&
					(phaseAwareEstimate.scoreY ?? 0) >=
						GRID_SEARCH_LIMITS.axisConfidenceThreshold;
				const selectedEstimate = phaseAwareReliable ? phaseAwareEstimate : est;
				const isSmallAspectAdjustedGrid =
					!phaseAwareReliable &&
					o.processingMode === "auto" &&
					o.bgExtractionMethod === "auto" &&
					o.bgRemovalScope !== "off" &&
					trimToContent &&
					(selectedEstimate.outW ?? 0) <=
						TRIMMED_GRID_SEARCH_LIMITS.aspectAdjustedMaxOutputWidth &&
					(selectedEstimate.outH ?? 0) <=
						TRIMMED_GRID_SEARCH_LIMITS.aspectAdjustedMaxOutputHeight &&
					(selectedEstimate.outW ?? 0) !==
						Math.max(
							2,
							Math.round(
								(selectedEstimate.outH ?? 0) * (b.w / Math.max(1, b.h)),
							),
						);
				allowSmallTrimmedGrid = isSmallAspectAdjustedGrid;
				// [Intended] トリミング領域で推定した格子は、元画像の左上へ投影せず
				// コンテンツ BBox をそのままサンプリング領域として使う。
				const alignToTrimmedBounds = isSmallAspectAdjustedGrid;
				let gridBounds = b;
				let gridEstimate = selectedEstimate;
				if (isSmallAspectAdjustedGrid) {
					// [Intended] 自動背景推定が残す薄い外周は、論理セルのアスペクト比を
					// 乱すため、角から得たマスクの境界を格子の基準領域に使用する。
					const cornerMask = removeBackground(
						img,
						o.backgroundTolerance,
						o.bgRemovalScope,
						o.bgConnectivity,
						bgTargets,
						"top-left",
					);
					const tightBounds = findOpaqueBounds(cornerMask, trimAlphaThreshold);
					if (
						tightBounds &&
						tightBounds.x >= b.x &&
						tightBounds.y >= b.y &&
						tightBounds.x + tightBounds.w <= b.x + b.w &&
						tightBounds.y + tightBounds.h <= b.y + b.h
					) {
						gridBounds = tightBounds;
						gridEstimate = {
							...selectedEstimate,
							cellW: tightBounds.w / Math.max(1, selectedEstimate.outW),
							cellH: tightBounds.h / Math.max(1, selectedEstimate.outH),
						};
						downsampleOptions = getDownsampleOptions({
							...o,
							cellSamplingMode: "legacy-median",
						});
					}
				}
				gridMethod = phaseAwareReliable
					? "phase-aware-grid-search"
					: appliedDeskewAngle !== 0
						? "deskewed-trimmed-reconstruction-fast"
						: o.fastAutoGridFromTrimmed
							? "trimmed-reconstruction-fast"
							: "trimmed-reconstruction";
				// [Intended] 回転後の拡張余白は元画像のグリッド位相ではないため、
				// 傾き補正時はコンテンツ BBox のセル数推定を優先する。
				// 注記:
				// - トリミングが OFF でも、つぶれを防ぐため「コンテンツ BBox から推定したグリッド」を使用する。
				// - ただしトリミング OFF は背景（余白）を残すだけなので、画像全体にダウンサンプリングを適用する。
				//   これにより中央オブジェクトのセル数（見かけのサイズ）がより安定する。
				const includeCandidates = hint === undefined;
				const searchCandidates = [
					...(phaseAwareEstimate && phaseAwareReliable
						? (phaseAwareEstimate.candidates ?? []).map((candidate) => ({
								candidate,
								phaseAware: true,
							}))
						: []),
					...(phaseAwareReliable ? [est] : []),
					...(est.candidates ?? []),
				];
				grid = {
					...resolveGridEstimate(
						gridEstimate,
						working,
						gridBounds,
						phaseAwareReliable,
						alignToTrimmedBounds,
					),
					candidates: includeCandidates
						? searchCandidates?.map((entry) => {
								const c = "candidate" in entry ? entry.candidate : entry;
								const phaseAware = "phaseAware" in entry;
								const candidateEstimate =
									alignToTrimmedBounds && !phaseAware
										? {
												...c,
												cellW: gridBounds.w / Math.max(1, c.outW ?? 1),
												cellH: gridBounds.h / Math.max(1, c.outH ?? 1),
											}
										: c;
								return {
									...resolveGridEstimate(
										candidateEstimate,
										working,
										gridBounds,
										phaseAware,
										alignToTrimmedBounds && !phaseAware,
									),
									angle: appliedDeskewAngle,
								};
							})
						: undefined,
					angle: appliedDeskewAngle,
				};
				o.debugHook?.("04-grid-crop", working, {
					grid,
					autoFromTrimmed: true,
					bounds: gridBounds,
				});
			}
		}
	}

	if (!grid) {
		const detectStart = performance.now();
		grid = detectGrid(working, { ...o.detect, debug: o.debug });
		grid.angle = appliedDeskewAngle;
		log(
			`Grid detection done in ${(performance.now() - detectStart).toFixed(2)}ms`,
			grid,
		);
		o.debugHook?.("04-grid-crop", working, {
			grid,
		});
	}
	let rankedGridCandidates = rankGridCandidates(working, grid, gridMethod);
	if (deskewSearch) {
		const additional = deskewSearch.candidates
			.filter((candidate) => candidate.angle !== appliedDeskewAngle)
			.flatMap((candidate) =>
				rankGridCandidates(
					candidate.image,
					{
						...candidate.estimate,
						angle: candidate.angle,
						candidates: undefined,
					},
					"deskewed-phase-aware-grid-search",
				).filter((report) => report.method !== "preserve"),
			);
		rankedGridCandidates = rerankGridCandidateReports([
			...rankedGridCandidates,
			...additional,
		]);
	}
	// [Intended] 分類の画像特徴は、グリッド候補の評価に使うのと同じ working から取る。
	// 元画像 img を使うと、背景除去の有無で両者が別画像になり判定が背景面積に左右される。
	const classificationResult =
		o.processingMode === "auto"
			? classifyInput(working, rankedGridCandidates)
			: undefined;
	const selectedCandidateIndex = findCandidateIndexForGrid(
		rankedGridCandidates,
		grid,
	);
	const selectedCandidateConfidence =
		selectedCandidateIndex >= 0
			? rankedGridCandidates[selectedCandidateIndex].confidence
			: undefined;
	const autoRoute = classificationResult
		? selectAutoProcessingRoute(
				classificationResult.classification,
				selectedCandidateConfidence,
				allowSmallTrimmedGrid,
			)
		: { route: "refine" as const, fellBackToPreserve: false };
	if (autoRoute.route !== "refine" || autoRoute.fellBackToPreserve) {
		if (autoRoute.route === "convert") {
			return finishProcessing(
				processConvertRoute({
					...simpleRouteContext,
					route: "convert",
					method: "auto-convert",
					classificationResult,
					preparedMask: maskedForDebugOrAuto ?? undefined,
				}),
			);
		}
		return finishProcessing(
			processExplicitSimpleRoute({
				...simpleRouteContext,
				route: autoRoute.route,
				method: autoRoute.fellBackToPreserve
					? "auto-low-confidence-preserve"
					: `auto-${autoRoute.route}`,
				classificationResult,
				rankedCandidates: rankedGridCandidates,
				additionalWarnings: [
					...(autoRoute.fellBackToPreserve
						? (["FALLBACK_TO_PRESERVE"] as const)
						: []),
					// [Intended] 分類が preserve を選んだ場合も、検出側の低信頼シグナルを
					// 握りつぶさず渡す。これが無いと候補選択の表示条件を満たさず、
					// 復元候補の存在をユーザーが知る手段が無くなる。
					...(autoRoute.route === "preserve"
						? detectedGridConfidenceWarnings(
								working,
								grid,
								selectedCandidateConfidence,
							)
						: []),
				],
				preparedMask: maskedForDebugOrAuto ?? undefined,
			}),
		);
	}

	const downsampleStart = performance.now();
	// [Intended] 選択した出力グリッドは後でトリミングまたはパディングされる場合がある一方で、
	// 候補診断は検出器で共有する座標空間に保つ。
	const diagnosticGrid = grid;
	const down = downsample(working, grid, downsampleOptions);
	log(
		`Downsampling done in ${(performance.now() - downsampleStart).toFixed(2)}ms`,
	);
	o.debugHook?.("05-downsampled", down, {
		sampleWindow: o.sampleWindow,
		cellSamplingMode: o.cellSamplingMode,
	});

	// 「処理前」比較: 元画像をリサイズするだけ（補正なし）。
	let compareBefore = cropRawImageNearestFromGrid(img, grid);
	// 「処理前（補正済み）」比較: 同じグリッドとセルサンプリングで元画像をダウンサンプリングする。
	let compareBeforeSanitized = downsample(img, grid, downsampleOptions);

	const needsLogicalMask = trimToContent || o.smallComponentMode !== "off";
	const logicalMask = needsLogicalMask
		? removeBackground(
				down,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
			)
		: down;
	const componentResult = removeSmallComponents(
		down,
		logicalMask,
		compareBeforeSanitized,
		{
			mode: o.smallComponentMode,
			alphaThreshold: trimAlphaThreshold,
			backgroundEnabled:
				o.bgExtractionMethod !== "none" && o.bgRemovalScope !== "off",
			automaticBackground: o.bgExtractionMethod === "auto",
			backgroundConfidence: backgroundDiagnostic?.confidence,
		},
	);
	if (o.smallComponentMode !== "off") {
		smallComponentRemoval = componentResult.diagnostic;
	}
	let trimmed = componentResult.image;
	let trimmedGrid = grid;
	if (trimToContent) {
		const trimStart = performance.now();
		// 背景を除去（角からの塗りつぶし）後、セル単位でコンテンツ BBox によりトリミングする。
		// これにより余白が大きい画像でも、outW/outH を「コンテンツ」に合わせられる。
		const bgTol = o.backgroundTolerance;
		const masked = componentResult.mask;
		o.debugHook?.("06-post-downsample-masked", masked, { bgTol });
		const b = findOpaqueBounds(masked, trimAlphaThreshold);
		if (
			b &&
			(b.x !== 0 ||
				b.y !== 0 ||
				b.w !== componentResult.image.width ||
				b.h !== componentResult.image.height)
		) {
			trimmed = cropRawImage(componentResult.image, b.x, b.y, b.w, b.h);

			const baseCropX = grid.cropX ?? grid.offsetX;
			const baseCropY = grid.cropY ?? grid.offsetY;
			trimmedGrid = {
				...grid,
				outW: b.w,
				outH: b.h,
				cropX: baseCropX + b.x * grid.cellW,
				cropY: baseCropY + b.y * grid.cellH,
				cropW: b.w * grid.cellW,
				cropH: b.h * grid.cellH,
			};

			// 更新済みのトリミンググリッドを使って処理前比較を再計算する
			compareBefore = cropRawImageNearestFromGrid(img, trimmedGrid);
			compareBeforeSanitized = cropRawImage(
				compareBeforeSanitized,
				b.x,
				b.y,
				b.w,
				b.h,
			);

			o.debugHook?.("07-trimmed", trimmed, { bounds: b });
			log(
				`Trimmed to content in ${(performance.now() - trimStart).toFixed(2)}ms`,
				b,
			);
		} else {
			log(
				`No trimming needed or possible in ${(performance.now() - trimStart).toFixed(2)}ms`,
			);
		}
	}

	// [Intended] auto 経路でグリッドが縮退した場合は、破綻した縮小結果を返さず等倍へ戻す。
	// 判定はトリミング後の実サイズで行う。検出時点の outW/outH は妥当に見えても、
	// コンテンツ BBox で切り詰めた結果 1x1 まで潰れることがあるため。
	if (o.processingMode === "auto") {
		const degeneracy = evaluateAutoGridDegeneracy(
			working,
			trimmed.width,
			trimmed.height,
			grid,
		);
		if (degeneracy.degenerate) {
			log("Degenerate auto grid detected; falling back to native scale", {
				outW: trimmed.width,
				outH: trimmed.height,
				nativeScale: degeneracy.nativeScale,
			});
			return finishProcessing(
				processExplicitSimpleRoute({
					...simpleRouteContext,
					route: "preserve",
					method: "auto-degenerate-grid-preserve",
					classificationResult,
					rankedCandidates: rankedGridCandidates,
					additionalWarnings: [
						"FALLBACK_TO_PRESERVE",
						// [Intended] 縮退で棄却したグリッドも候補としては提示したいので、
						// 候補選択 UI の表示条件である低信頼シグナルを必ず付ける。
						"LOW_GRID_CONFIDENCE",
						...detectedGridConfidenceWarnings(
							working,
							grid,
							selectedCandidateConfidence,
						),
					],
					preparedMask: maskedForDebugOrAuto ?? undefined,
				}),
			);
		}
	}

	const postBgStart = performance.now();
	const result = o.postRemoveBackground
		? removeBackground(
				trimmed,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
				backgroundDiagnostic,
			)
		: trimmed;
	log(
		`Post-background removal done in ${(performance.now() - postBgStart).toFixed(2)}ms`,
	);

	// 色削減
	let finalResult = result;
	if (o.reduceColors || o.fixedPalette) {
		finalResult = applyColorReduction(
			result,
			o.reduceColorMode,
			o.ditherMode,
			o.colorCount,
			o.ditherStrength,
			log,
			o.fixedPalette,
		);
	}

	// アウトライン処理
	if (o.outlineStyle !== "none") {
		const prevW = finalResult.width;
		const prevH = finalResult.height;
		finalResult = applyOutline(finalResult, o.outlineColor, o.outlineStyle);

		// 画像サイズを拡張した場合はグリッド情報を更新する
		if (finalResult.width !== prevW || finalResult.height !== prevH) {
			const dw = finalResult.width - prevW;
			const dh = finalResult.height - prevH;
			const padLeft = Math.floor(dw / 2);
			const padTop = Math.floor(dh / 2);
			const padRight = dw - padLeft;
			const padBottom = dh - padTop;

			// compareBefore を拡張後の結果（透明パディング）に合わせる。
			// compareBefore は高解像度のため、パディングをセルサイズで拡大する。
			compareBefore = padRawImage(
				compareBefore,
				padLeft * trimmedGrid.cellW,
				padTop * trimmedGrid.cellH,
				padRight * trimmedGrid.cellW,
				padBottom * trimmedGrid.cellH,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);

			const cellDw = (finalResult.width - prevW) / 2;
			const cellDh = (finalResult.height - prevH) / 2;
			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;

			trimmedGrid = {
				...trimmedGrid,
				outW: finalResult.width,
				outH: finalResult.height,
				cropX: baseCropX - cellDw * trimmedGrid.cellW,
				cropY: baseCropY - cellDh * trimmedGrid.cellH,
				cropW: finalResult.width * trimmedGrid.cellW,
				cropH: finalResult.height * trimmedGrid.cellH,
			};
		}
	}

	if (o.keepAspectRatio && !o.makeSquare) {
		const { image: paddedResult, padding } = padImageToAspectRatio(
			finalResult,
			sourceAspectRatio,
		);
		if (paddedResult !== finalResult) {
			const padLeftPx = Math.round(padding.left * trimmedGrid.cellW);
			const padTopPx = Math.round(padding.top * trimmedGrid.cellH);
			const padRightPx = Math.round(padding.right * trimmedGrid.cellW);
			const padBottomPx = Math.round(padding.bottom * trimmedGrid.cellH);

			finalResult = paddedResult;
			compareBefore = padRawImage(
				compareBefore,
				padLeftPx,
				padTopPx,
				padRightPx,
				padBottomPx,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padding.left,
				padding.top,
				padding.right,
				padding.bottom,
			);

			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;
			trimmedGrid = {
				...trimmedGrid,
				outW: finalResult.width,
				outH: finalResult.height,
				cropX: baseCropX - padLeftPx,
				cropY: baseCropY - padTopPx,
				cropW: finalResult.width * trimmedGrid.cellW,
				cropH: finalResult.height * trimmedGrid.cellH,
			};
		}
	}

	if (o.makeSquare) {
		const w = finalResult.width;
		const h = finalResult.height;
		if (w !== h) {
			const size = Math.max(w, h);
			const dw = size - w;
			const dh = size - h;
			const padLeft = Math.floor(dw / 2);
			const padTop = Math.floor(dh / 2);
			const padRight = dw - padLeft;
			const padBottom = dh - padTop;

			const padLeftPx = Math.round(padLeft * trimmedGrid.cellW);
			const padTopPx = Math.round(padTop * trimmedGrid.cellH);
			const padRightPx = Math.round(padRight * trimmedGrid.cellW);
			const padBottomPx = Math.round(padBottom * trimmedGrid.cellH);

			finalResult = padRawImage(
				finalResult,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);
			compareBefore = padRawImage(
				compareBefore,
				padLeftPx,
				padTopPx,
				padRightPx,
				padBottomPx,
			);
			compareBeforeSanitized = padRawImage(
				compareBeforeSanitized,
				padLeft,
				padTop,
				padRight,
				padBottom,
			);
			const baseCropX = trimmedGrid.cropX ?? trimmedGrid.offsetX;
			const baseCropY = trimmedGrid.cropY ?? trimmedGrid.offsetY;
			trimmedGrid = {
				...trimmedGrid,
				outW: size,
				outH: size,
				cropX: baseCropX - padLeftPx,
				cropY: baseCropY - padTopPx,
				cropW: size * trimmedGrid.cellW,
				cropH: size * trimmedGrid.cellH,
			};
		}
	}

	o.debugHook?.("99-result", finalResult, {
		postRemoveBackground: o.postRemoveBackground,
		reduceColors: o.reduceColors,
		colorCount: o.colorCount,
	});
	log(`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`);

	const extracted = extractUsedColors(finalResult);
	const analysis = createProcessingAnalysis(
		img,
		finalResult,
		compareBeforeSanitized,
		diagnosticGrid,
		"refine",
		gridMethod,
		trimAlphaThreshold,
		rankedGridCandidates,
		backgroundDiagnostic,
		classificationResult,
		[],
		undefined,
		smallComponentRemoval,
	);
	log("Processing analysis", analysis);
	return finishProcessing({
		result: finalResult,
		grid: trimmedGrid,
		extractedPalette: extracted,
		compareBefore,
		compareBeforeSanitized,
		analysis,
	});
};

export const processImage = processImageCore;
