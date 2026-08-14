import { PROCESS_DEFAULTS } from "../shared/config";
import type {
	ProcessResult,
	RawImage,
	SmallComponentRemovalDiagnostic,
} from "../shared/types";
import { evaluateAutoGridDegeneracy } from "./auto-grid-guard";
import {
	canCleanBackgroundContaminatedEdges,
	cleanBackgroundContaminatedEdgesInPlace,
} from "./background-edge-cleanup";
import {
	getBackgroundTargets,
	removeBackground,
	removeBackgroundByFloodFillLegacy,
	removeSmallFloatingComponentsInPlace,
} from "./background-removal";
import { classifyInput, selectAutoProcessingRoute } from "./classifier";
import { applyColorReduction, extractUsedColors } from "./color-reduction";
import { removeSmallComponents } from "./components";
import {
	downsampleGeminiWatermarkGeometry,
	prepareGeminiWatermarkAwareAutoMask,
	prepareGeminiWatermarkGeometry,
} from "./gemini-watermark-preprocessing";
import { rankGridCandidates } from "./grid-candidates";
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
import { prepareProcessingGeometry } from "./processing-geometry";
import {
	applyPostRemovalOutcome,
	prepareAutomaticBackground,
} from "./processor-background";
import { processConvertRoute } from "./processor-convert-route";
import {
	expandContentGridToCanvas,
	resolveProcessingGrid,
} from "./processor-grid-resolution";
import {
	getBackgroundBehavior,
	normalizeProcessOptions,
	type ProcessOptions,
} from "./processor-options";
import {
	processExplicitSimpleRoute,
	processForcedRoute,
	processGridDisabledRoute,
	type SimpleRouteContext,
} from "./processor-simple-routes";

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
	const backgroundBehavior = getBackgroundBehavior(o);
	const sourceAspectRatio = o.keepAspectRatio ? getAspectRatio(inputImage) : 0;
	const bgTargetsStart = performance.now();
	// [Intended] 背景色は加工前の入力画像の角から取得し、後段の加工結果に左右されないようにする。
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
				backgroundBehavior,
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
		} else if (o.bgRemovalScope === "outer" || o.bgRemovalScope === "auto") {
			preRemovedInput = removeBackground(
				inputImage,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				undefined,
				backgroundBehavior,
			);
		} else if (o.bgRemovalScope === "selected") {
			preRemovedInput = removeBackgroundByFloodFillLegacy(
				inputImage,
				o.backgroundTolerance,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundBehavior,
			);
		} else if (o.bgRemovalScope === "all") {
			preRemovedInput = removeBackgroundByFloodFillLegacy(
				inputImage,
				o.backgroundTolerance,
				"4",
				bgTargets,
				o.bgExtractionMethod,
				backgroundBehavior,
			);
		} else {
			preRemovedInput = cloneImage(inputImage);
		}
		return preRemovedInput;
	};
	const startTime = performance.now();
	const log = (...args: unknown[]) => {
		if (o.debug) {
			console.log("[Processor]", ...args);
		}
	};

	log("Processing started", {
		width: inputImage.width,
		height: inputImage.height,
		options: o,
	});

	log(
		`Background targets extracted in ${(performance.now() - bgTargetsStart).toFixed(2)}ms`,
		bgTargets,
	);

	const workingStart = performance.now();
	let working: RawImage;
	/** working が背景除去済みか。縁の色の差し替えを行ってよいかの判定に使う。 */
	let preBackgroundRemoved = false;
	if (!o.preRemoveBackground) {
		working = cloneImage(inputImage);
	} else if (
		o.bgRemovalScope !== "off" &&
		o.bgExtractionMethod !== "none" &&
		!(o.bgExtractionMethod === "auto" && !backgroundModel)
	) {
		working = cloneImage(getPreRemovedInput());
		preBackgroundRemoved = true;
	} else if (o.bgExtractionMethod === "auto") {
		// [Intended] auto の除去経路は prepareAutomaticBackground だけが持つ。
		// 除去結果が無い場合は角シードのレガシー経路へ落とさず、元画像をそのまま保つ。
		working = cloneImage(inputImage);
	} else {
		working = cloneImage(inputImage);
	}
	const watermarkGeometry = prepareGeminiWatermarkGeometry({
		inputImage,
		image: inputImage,
		working,
		options: o,
		automaticBackground,
		getBackgroundMaskedInput,
		backgroundTargets: bgTargets,
		backgroundModel,
	});
	const geometryImage = watermarkGeometry.image;
	const geometryWorking = watermarkGeometry.working;
	const preparedWatermarkMask = watermarkGeometry.mask;
	const canReuseProcessingGeometry =
		o.bgExtractionMethod === "auto" &&
		o.bgRemovalScope === PROCESS_DEFAULTS.bgRemovalScope &&
		o.preRemoveBackground;
	const processingGeometry = o.preserveProcessingScale
		? prepareProcessingGeometry(
				inputImage,
				o,
				automaticBackground,
				canReuseProcessingGeometry
					? {
							working: geometryWorking,
							preparedMask: preparedWatermarkMask,
							watermarkRemoved: watermarkGeometry.removed,
						}
					: undefined,
			)
		: undefined;
	const geometryMask =
		processingGeometry?.preparedMask ?? preparedWatermarkMask;
	const analysisGeometry = processingGeometry?.working ?? geometryWorking;
	log(
		`Pre-background removal done in ${(performance.now() - workingStart).toFixed(2)}ms`,
	);

	o.debugHook?.("00-input", inputImage);
	o.debugHook?.("01-working", working, {
		preRemoveBackground: o.preRemoveBackground,
	});
	const trimToContent = o.trimToContent;
	const trimAlphaThreshold = o.trimAlphaThreshold;
	const watermarkRemovedFromGeometry = watermarkGeometry.removed;

	let smallComponentRemoval: SmallComponentRemovalDiagnostic | undefined;
	const simpleRouteContext: SimpleRouteContext = {
		img: inputImage,
		o,
		working,
		bgTargets,
		trimAlphaThreshold,
		startTime,
		log,
		backgroundDiagnostic,
		backgroundModel,
		smallComponentRemoval,
		preparedMask: processingGeometry?.autoMask ?? geometryMask,
		preBackgroundRemoved,
	};
	const finishProcessing = watermarkGeometry.finish;
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
		processingGeometry?.autoMask ??
		prepareGeminiWatermarkAwareAutoMask({
			needed: Boolean(
				o.debugHook || autoGridFromTrimmed || o.floatingMaxPixels > 0,
			),
			preparedMask: geometryMask,
			options: o,
			geometryWorking: analysisGeometry,
			backgroundTargets: bgTargets,
			backgroundModel,
		});
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

	const {
		grid: detectionGrid,
		gridMethod,
		downsampleOptions,
		allowSmallTrimmedGrid,
		gridAlignedToContent,
	} = resolveProcessingGrid({
		o,
		working: processingGeometry ? analysisGeometry : working,
		geometryImage: processingGeometry ? inputImage : geometryImage,
		geometryWorking: analysisGeometry,
		maskedForDebugOrAuto,
		bgTargets,
		trimAlphaThreshold,
		watermarkRemovedFromGeometry:
			(processingGeometry?.watermarkRemoved ?? false) ||
			watermarkRemovedFromGeometry,
		log,
	});

	const rankedGridCandidates = rankGridCandidates(
		analysisGeometry,
		detectionGrid,
		gridMethod,
	);
	// [Intended] 分類の画像特徴は、グリッド候補の評価に使うのと同じ working から取る。
	// 加工前の入力画像を使うと、背景除去の有無で両者が別画像になり判定が背景面積に左右される。
	const classificationResult =
		o.processingMode === "auto"
			? classifyInput(analysisGeometry, rankedGridCandidates)
			: undefined;
	const selectedCandidateIndex = findCandidateIndexForGrid(
		rankedGridCandidates,
		detectionGrid,
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
	const preserveCandidateIndex = rankedGridCandidates.findIndex(
		(candidate) => candidate.method === "preserve",
	);
	// [Policy] Auto 実結果を候補として指せるのは、位置が rankedGridCandidates 上で
	// 一意に決まる preserve / refine 経路だけ。convert 経路の出力は検出候補では
	// 表現できないため対象外とする。
	const autoResultCandidateIndex =
		o.processingMode !== "auto"
			? undefined
			: autoRoute.route === "preserve"
				? preserveCandidateIndex
				: autoRoute.route === "refine"
					? selectedCandidateIndex
					: undefined;
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
				autoResultCandidateIndex,
				additionalWarnings: [
					...(autoRoute.fellBackToPreserve
						? (["FALLBACK_TO_PRESERVE"] as const)
						: []),
					// [Intended] 分類が preserve を選んだ場合も、検出側の低信頼シグナルを
					// 握りつぶさず渡す。これが無いと候補選択の表示条件を満たさず、
					// 復元候補の存在をユーザーが知る手段が無くなる。
					...(autoRoute.route === "preserve"
						? detectedGridConfidenceWarnings(
								analysisGeometry,
								detectionGrid,
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
	const diagnosticGrid = detectionGrid;
	// [Intended] 被写体境界に揃えた格子は、トリムしない場合だけ同じ位相のまま
	// 元キャンバス全体へ広げる。被写体を再サンプリングせず余白セルだけを追加する。
	const grid =
		o.preserveProcessingScale && !trimToContent && gridAlignedToContent
			? expandContentGridToCanvas(detectionGrid, working)
			: detectionGrid;
	const down = downsample(working, grid, downsampleOptions);
	const geometryDown = downsampleGeminiWatermarkGeometry(
		geometryMask,
		analysisGeometry,
		working,
		down,
		grid,
		downsampleOptions,
	);
	log(
		`Downsampling done in ${(performance.now() - downsampleStart).toFixed(2)}ms`,
	);
	o.debugHook?.("05-downsampled", down, {
		sampleWindow: o.sampleWindow,
		cellSamplingMode: o.cellSamplingMode,
	});

	// 「処理前」比較: 元画像をリサイズするだけ（補正なし）。
	let compareBefore = cropRawImageNearestFromGrid(inputImage, grid);
	// 「処理前（補正済み）」比較: 同じグリッドとセルサンプリングで元画像をダウンサンプリングする。
	let compareBeforeSanitized = downsample(inputImage, grid, downsampleOptions);

	const needsLogicalMask = trimToContent || o.smallComponentMode !== "off";
	const logicalMask = needsLogicalMask
		? removeBackground(
				geometryDown,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
				backgroundBehavior,
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
			backgroundConfidenceGate: o.smallComponentBackgroundGate,
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
			compareBefore = cropRawImageNearestFromGrid(inputImage, trimmedGrid);
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
					autoResultCandidateIndex: preserveCandidateIndex,
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
	// [Intended] 縁の汚染除去は「補正する画像の透過を作った除去」が成立したかだけを見たい。
	// 診断は段階をまとめた結論を持つため、後段除去の結果は別の受け皿で取る。
	const postRemoval = {
		attempted: o.postRemoveBackground,
		rolledBack: false,
		removed: false,
	};
	const result = postRemoval.attempted
		? removeBackground(
				trimmed,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
				backgroundBehavior,
				postRemoval,
			)
		: trimmed;
	applyPostRemovalOutcome(backgroundDiagnostic, postRemoval);
	log(
		`Post-background removal done in ${(performance.now() - postBgStart).toFixed(2)}ms`,
	);

	// [Policy] 縁の汚染除去は背景クラスタ色を必要とするため auto 経路だけで行う。
	// 角シードや RGB 指定の経路は利用者が背景色を確定させており、手書きの期待値画像と
	// 完全一致することを前提にしているので触らない。
	if (
		o.backgroundEdgeCleanup &&
		canCleanBackgroundContaminatedEdges(
			backgroundModel,
			backgroundDiagnostic?.confidence,
			o.postRemoveBackground
				? postRemoval.rolledBack
				: (automaticBackground?.rolledBack ?? false),
			o.postRemoveBackground || preBackgroundRemoved,
		)
	) {
		const cleanupStart = performance.now();
		const cleaned = cleanBackgroundContaminatedEdgesInPlace(
			result,
			working,
			trimmedGrid,
			backgroundModel,
			o.cellAlphaThreshold,
		);
		log(
			`Background edge cleanup done in ${(performance.now() - cleanupStart).toFixed(2)}ms`,
			{ cleaned },
		);
	}

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
		inputImage,
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
		autoResultCandidateIndex,
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
