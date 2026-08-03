import type {
	BackgroundDiagnostic,
	GridCandidateReport,
	InputClassificationResult,
	PixelGrid,
	ProcessingRoute,
	ProcessingWarningCode,
	ProcessResult,
	RawImage,
} from "../shared/types";
import type { BackgroundModel } from "./background";
import {
	removeBackground,
	removeSmallFloatingComponentsInPlace,
} from "./background-removal";
import { applyColorReduction, extractUsedColors } from "./color-reduction";
import {
	cropRawImage,
	cropRawImageNearestFromGrid,
	downsample,
	findOpaqueBounds,
	getAspectRatio,
	padImageToAspectRatio,
	padRawImage,
} from "./image-operations";
import { applyOutline } from "./outline";
import { createProcessingAnalysis } from "./processing-analysis";
import {
	getDownsampleOptions,
	type NormalizedProcessOptions,
} from "./processor-options";

export type SimpleRouteContext = {
	img: RawImage;
	o: NormalizedProcessOptions;
	working: RawImage;
	bgTargets: Array<[number, number, number]>;
	trimAlphaThreshold: number;
	startTime: number;
	log: (...args: unknown[]) => void;
	backgroundDiagnostic?: BackgroundDiagnostic;
	backgroundModel?: BackgroundModel;
	route?: ProcessingRoute;
	method?: string;
	classificationResult?: InputClassificationResult;
	additionalWarnings?: ProcessingWarningCode[];
	rankedCandidates?: GridCandidateReport[];
	/**
	 * 呼び出し元で算出済みの背景マスク。
	 * [Policy] これを渡す場合、孤立成分の除去も呼び出し元で済ませていること。
	 * 渡された側は背景除去も孤立成分除去も繰り返さない。
	 */
	preparedMask?: RawImage;
	/**
	 * 背景除去（後段）・アウトライン・アスペクト比維持を最終結果へ適用するか。
	 * [Policy] 既存の enableGridDetection=false 経路の出力を変えないため、
	 * processingMode で明示的に選ばれた経路（manual / auto）でのみ true にする。
	 */
	applyFinalAdjustments?: boolean;
};

export const processForcedRoute = (
	context: SimpleRouteContext,
): ProcessResult | null => {
	const {
		img,
		o,
		working,
		bgTargets,
		trimAlphaThreshold,
		startTime,
		log,
		backgroundDiagnostic,
		backgroundModel,
	} = context;
	if (o.forcePixelsW === undefined || o.forcePixelsH === undefined) {
		return null;
	}

	// force: コンテンツ BBox でトリミングし、指定ピクセルサイズ（W x H）へ強制変換する（自動検出なし）
	const bgTol = o.backgroundTolerance;
	const masked = removeBackground(
		working,
		bgTol,
		o.bgRemovalScope,
		o.bgConnectivity,
		bgTargets,
		o.bgExtractionMethod,
		backgroundModel,
	);
	if (o.floatingMaxPixels > 0) {
		const floatingStart = performance.now();
		const { removedComponents, removedPixels } =
			removeSmallFloatingComponentsInPlace(
				working,
				masked,
				trimAlphaThreshold,
				o.floatingMaxPixels,
			);
		log(
			`Floating components removed in ${(performance.now() - floatingStart).toFixed(2)}ms`,
			{ removedComponents, removedPixels },
		);
		if (o.debugHook && removedPixels > 0) {
			o.debugHook("01b-working-ignore-floating", working, {
				floatingMaxPixels: o.floatingMaxPixels,
				removedComponents,
				removedPixels,
				forced: true,
			});
		}
	}
	o.debugHook?.("02-pre-downsample-masked", masked, {
		bgTol,
		forcePixels: { w: o.forcePixelsW, h: o.forcePixelsH },
	});
	const boundsStart = performance.now();
	const b = findOpaqueBounds(masked, trimAlphaThreshold);
	if (!b) {
		throw new Error(
			"Specified pixel conversion failed because no content was found.",
		);
	}
	log(
		`Opaque bounds found in ${(performance.now() - boundsStart).toFixed(2)}ms`,
		b,
	);
	const cropped = cropRawImage(working, b.x, b.y, b.w, b.h);
	o.debugHook?.("03-pre-downsample-bg-trimmed", cropped, {
		bounds: b,
		forcePixels: { w: o.forcePixelsW, h: o.forcePixelsH },
	});

	const outW = o.forcePixelsW;
	const outH = o.forcePixelsH;
	const cellW = cropped.width / outW;
	const cellH = cropped.height / outH;
	log(
		`Forced pixel size mode: ${outW}x${outH} (cell: ${cellW.toFixed(2)}x${cellH.toFixed(2)})`,
	);
	const g: PixelGrid = {
		cellW,
		cellH,
		offsetX: 0,
		offsetY: 0,
		outW,
		outH,
		cropX: 0,
		cropY: 0,
		cropW: cropped.width,
		cropH: cropped.height,
		score: 0,
	};

	// 2. ダウンサンプリング / 補正
	const sw = cellW < 1 || cellH < 1 ? 1 : o.sampleWindow;
	const downsampleStart = performance.now();
	const down2 = downsample(cropped, g, getDownsampleOptions(o, sw));
	log(
		`Downsampling (forced) done in ${(performance.now() - downsampleStart).toFixed(2)}ms`,
	);
	o.debugHook?.("05-downsampled", down2, {
		sampleWindow: sw,
		cellSamplingMode: o.cellSamplingMode,
		forced: true,
	});

	// 3. 後処理の透明化（背景除去）
	const postBgStart = performance.now();
	const result2 = o.postRemoveBackground
		? removeBackground(
				down2,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
				backgroundDiagnostic,
			)
		: down2;
	log(
		`Post-background removal done in ${(performance.now() - postBgStart).toFixed(2)}ms`,
	);

	// 色削減
	let finalResult = result2;
	if (o.reduceColors || o.fixedPalette) {
		finalResult = applyColorReduction(
			result2,
			o.reduceColorMode,
			o.ditherMode,
			o.colorCount,
			o.ditherStrength,
			log,
			o.fixedPalette,
		);
	}

	// compareBefore は、元画像 'img' を境界 'b' と強制グリッドを使って
	// リサイズする必要がある。
	const forcedTrimmedGridForOriginal: PixelGrid = {
		...g,
		cropX: b.x,
		cropY: b.y,
		cropW: b.w,
		cropH: b.h,
	};
	let compareBefore = cropRawImageNearestFromGrid(
		img,
		forcedTrimmedGridForOriginal,
	);

	// 補正済み比較: パイプラインと同じセルサンプリングを使用する。
	const croppedOriginal = cropRawImage(img, b.x, b.y, b.w, b.h);
	let compareBeforeSanitized = downsample(
		croppedOriginal,
		g,
		getDownsampleOptions(o, sw),
	);

	let finalGridForForce = g;
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

			const padLeftPx = Math.round(padLeft * finalGridForForce.cellW);
			const padTopPx = Math.round(padTop * finalGridForForce.cellH);
			const padRightPx = Math.round(padRight * finalGridForForce.cellW);
			const padBottomPx = Math.round(padBottom * finalGridForForce.cellH);

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
			const baseCropX = finalGridForForce.cropX ?? finalGridForForce.offsetX;
			const baseCropY = finalGridForForce.cropY ?? finalGridForForce.offsetY;
			finalGridForForce = {
				...finalGridForForce,
				outW: size,
				outH: size,
				cropX: baseCropX - padLeftPx,
				cropY: baseCropY - padTopPx,
				cropW: size * finalGridForForce.cellW,
				cropH: size * finalGridForForce.cellH,
			};
		}
	}

	o.debugHook?.("99-result", finalResult, {
		postRemoveBackground: o.postRemoveBackground,
		forced: true,
	});
	log(`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`);
	const extracted = extractUsedColors(finalResult);
	const analysis = createProcessingAnalysis(
		img,
		finalResult,
		compareBeforeSanitized,
		finalGridForForce,
		"convert",
		"forced-size",
		trimAlphaThreshold,
		context.rankedCandidates,
		backgroundDiagnostic,
		context.classificationResult,
		context.additionalWarnings,
	);
	log("Processing analysis", analysis);
	return {
		result: finalResult,
		grid: finalGridForForce,
		extractedPalette: extracted,
		compareBefore,
		compareBeforeSanitized,
		analysis,
	};
};

export const processGridDisabledRoute = (
	context: SimpleRouteContext,
): ProcessResult | null => {
	const {
		img,
		o,
		working,
		bgTargets,
		trimAlphaThreshold,
		startTime,
		log,
		backgroundDiagnostic,
		backgroundModel,
	} = context;
	if (o.enableGridDetection) {
		return null;
	}

	// enableGridDetection: グリッド検出とダウンサンプリングを省略する
	const bgTol = o.backgroundTolerance;
	// [Intended] 呼び出し元が同じマスクを算出済みなら再計算しない。
	// 孤立成分の除去は working を破壊的に書き換えるため、2 度走らせると
	// 1 回目の結果から作り直したマスクで別の成分まで消えうる。
	const masked =
		context.preparedMask ??
		removeBackground(
			working,
			bgTol,
			o.bgRemovalScope,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
			backgroundModel,
		);
	if (!context.preparedMask && o.floatingMaxPixels > 0) {
		removeSmallFloatingComponentsInPlace(
			working,
			masked,
			trimAlphaThreshold,
			o.floatingMaxPixels,
		);
	}

	const base =
		context.applyFinalAdjustments && o.postRemoveBackground
			? removeBackground(
					working,
					bgTol,
					o.bgRemovalScope,
					o.bgConnectivity,
					bgTargets,
					o.bgExtractionMethod,
					backgroundModel,
					backgroundDiagnostic,
				)
			: working;

	let finalResult = base;
	let compareBefore = img;
	let compareBeforeSanitized = img;
	let outW = base.width;
	let outH = base.height;
	let cropX = 0;
	let cropY = 0;

	if (o.reduceColors || o.fixedPalette) {
		finalResult = applyColorReduction(
			base,
			o.reduceColorMode,
			o.ditherMode,
			o.colorCount,
			o.ditherStrength,
			log,
			o.fixedPalette,
		);
	}

	if (o.trimToContent) {
		const b = findOpaqueBounds(masked, trimAlphaThreshold);
		if (b) {
			finalResult = cropRawImage(finalResult, b.x, b.y, b.w, b.h);
			compareBefore = cropRawImage(compareBefore, b.x, b.y, b.w, b.h);
			compareBeforeSanitized = cropRawImage(
				compareBeforeSanitized,
				b.x,
				b.y,
				b.w,
				b.h,
			);
			outW = b.w;
			outH = b.h;
			cropX = b.x;
			cropY = b.y;
		}
	}

	let finalGridForNoGrid = {
		cellW: 1,
		cellH: 1,
		offsetX: 0,
		offsetY: 0,
		outW,
		outH,
		cropX,
		cropY,
		cropW: outW,
		cropH: outH,
		score: 0,
	};

	// この経路はセルサイズが 1 なので、比較画像のパディング量は出力と同じで済む。
	const padCompanions = (
		padLeft: number,
		padTop: number,
		padRight: number,
		padBottom: number,
	) => {
		compareBefore = padRawImage(
			compareBefore,
			padLeft,
			padTop,
			padRight,
			padBottom,
		);
		compareBeforeSanitized = padRawImage(
			compareBeforeSanitized,
			padLeft,
			padTop,
			padRight,
			padBottom,
		);
		const baseCropX = finalGridForNoGrid.cropX ?? finalGridForNoGrid.offsetX;
		const baseCropY = finalGridForNoGrid.cropY ?? finalGridForNoGrid.offsetY;
		finalGridForNoGrid = {
			...finalGridForNoGrid,
			outW: finalResult.width,
			outH: finalResult.height,
			cropX: baseCropX - padLeft,
			cropY: baseCropY - padTop,
			cropW: finalResult.width,
			cropH: finalResult.height,
		};
	};

	if (context.applyFinalAdjustments && o.outlineStyle !== "none") {
		const prevW = finalResult.width;
		const prevH = finalResult.height;
		finalResult = applyOutline(finalResult, o.outlineColor, o.outlineStyle);
		const dw = finalResult.width - prevW;
		const dh = finalResult.height - prevH;
		if (dw !== 0 || dh !== 0) {
			const padLeft = Math.floor(dw / 2);
			const padTop = Math.floor(dh / 2);
			padCompanions(padLeft, padTop, dw - padLeft, dh - padTop);
		}
	}

	if (context.applyFinalAdjustments && o.keepAspectRatio && !o.makeSquare) {
		const { image: paddedResult, padding } = padImageToAspectRatio(
			finalResult,
			getAspectRatio(img),
		);
		if (paddedResult !== finalResult) {
			finalResult = paddedResult;
			padCompanions(padding.left, padding.top, padding.right, padding.bottom);
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

			const padLeftPx = Math.round(padLeft * finalGridForNoGrid.cellW);
			const padTopPx = Math.round(padTop * finalGridForNoGrid.cellH);
			const padRightPx = Math.round(padRight * finalGridForNoGrid.cellW);
			const padBottomPx = Math.round(padBottom * finalGridForNoGrid.cellH);

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
			const baseCropX = finalGridForNoGrid.cropX ?? finalGridForNoGrid.offsetX;
			const baseCropY = finalGridForNoGrid.cropY ?? finalGridForNoGrid.offsetY;
			finalGridForNoGrid = {
				...finalGridForNoGrid,
				outW: size,
				outH: size,
				cropX: baseCropX - padLeftPx,
				cropY: baseCropY - padTopPx,
				cropW: size * finalGridForNoGrid.cellW,
				cropH: size * finalGridForNoGrid.cellH,
			};
		}
	}

	o.debugHook?.("99-result", finalResult, {
		noGridDetection: true,
		trimmed: o.trimToContent,
	});

	const extracted = extractUsedColors(finalResult);
	log(`Total processing time: ${(performance.now() - startTime).toFixed(2)}ms`);

	const analysis = createProcessingAnalysis(
		img,
		finalResult,
		compareBeforeSanitized,
		finalGridForNoGrid,
		context.route ?? "preserve",
		context.method ?? "grid-disabled",
		trimAlphaThreshold,
		context.rankedCandidates,
		backgroundDiagnostic,
		context.classificationResult,
		context.additionalWarnings,
	);
	log("Processing analysis", analysis);
	return {
		result: finalResult,
		grid: finalGridForNoGrid,
		extractedPalette: extracted,
		compareBefore,
		compareBeforeSanitized,
		analysis,
	};
};

// [Intended] 明示経路（manual / auto）はグリッド検出を無効化して呼ぶため null は返らない。
// 型上の null を as で潰さず、想定外の早期 return を実行時に検知できるようにする。
export const processExplicitSimpleRoute = (
	context: SimpleRouteContext,
): ProcessResult => {
	const result = processGridDisabledRoute({
		...context,
		o: { ...context.o, enableGridDetection: false },
		applyFinalAdjustments: true,
	});
	if (!result) {
		throw new Error("grid-disabled route must return a result");
	}
	return result;
};
