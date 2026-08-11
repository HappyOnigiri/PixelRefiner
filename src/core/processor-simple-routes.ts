import type {
	BackgroundDiagnostic,
	GridCandidateReport,
	InputClassificationResult,
	PixelGrid,
	ProcessingRoute,
	ProcessingWarningCode,
	ProcessResult,
	RawImage,
	SmallComponentRemovalDiagnostic,
} from "../shared/types";
import type { BackgroundModel } from "./background";
import {
	removeBackground,
	removeSmallFloatingComponentsInPlace,
} from "./background-removal";
import { applyColorReduction, extractUsedColors } from "./color-reduction";
import { removeSmallComponents } from "./components";
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
import { applyPostRemovalOutcome } from "./processor-background";
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
	/** Auto 経路が実際に採用した検出候補の位置。 */
	autoResultCandidateIndex?: number;
	smallComponentRemoval?: SmallComponentRemovalDiagnostic;
	/**
	 * 呼び出し元で算出済みの背景マスク。
	 * [Policy] これを渡す場合、元画像基準の旧孤立成分除去は呼び出し元で済んでいる。
	 * 論理ピクセル基準の除去は各出力経路で一度だけ行う。
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

	// force: 指定ピクセルサイズ（W x H）へ強制変換する（自動検出なし）
	const bgTol = o.backgroundTolerance;
	// [Intended] 背景マスクはトリミング・浮遊成分除去・デバッグ出力でしか使わない。
	// トリミングしない強制変換では背景除去 1 回ぶんを丸ごと省く。
	let maskedCache: RawImage | undefined;
	const getMasked = (): RawImage => {
		maskedCache ??=
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
		return maskedCache;
	};
	let smallComponentRemoval = context.smallComponentRemoval;
	if (o.floatingMaxPixels > 0) {
		const floatingStart = performance.now();
		const { removedComponents, removedPixels } =
			removeSmallFloatingComponentsInPlace(
				working,
				getMasked(),
				trimAlphaThreshold,
				o.floatingMaxPixels,
			);
		smallComponentRemoval = {
			mode: "legacy",
			applied: true,
			removedComponents,
			removedPixels,
			pixelBasis: "source",
		};
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
	if (o.debugHook) {
		o.debugHook("02-pre-downsample-masked", getMasked(), {
			bgTol,
			forcePixels: { w: o.forcePixelsW, h: o.forcePixelsH },
		});
	}
	const boundsStart = performance.now();
	// [Intended] 強制サイズのセル境界は元キャンバスの位相に合わせる。トリミング無効時にも
	// コンテンツ BBox を基準にすると、透明余白のぶんだけグリッドの位相とセル倍率がずれ、
	// 整数倍で拡大されただけの画像すら元へ戻せない。
	let b = o.trimToContent
		? findOpaqueBounds(getMasked(), trimAlphaThreshold)
		: { x: 0, y: 0, w: working.width, h: working.height };
	if (!b) {
		throw new Error(
			"Specified pixel conversion failed because no content was found.",
		);
	}
	const outW = o.forcePixelsW;
	const outH = o.forcePixelsH;
	const downsampleStart = performance.now();
	// [Intended] 画像全体を覆う境界では切り抜きを行わず、元バッファをそのまま読む。
	const cropToBounds = (
		image: RawImage,
		bounds: { x: number; y: number; w: number; h: number },
	): RawImage =>
		bounds.x === 0 &&
		bounds.y === 0 &&
		bounds.w === image.width &&
		bounds.h === image.height
			? image
			: cropRawImage(image, bounds.x, bounds.y, bounds.w, bounds.h);
	const createLogicalPass = (bounds: NonNullable<typeof b>) => {
		const cropped = cropToBounds(working, bounds);
		const cellW = cropped.width / outW;
		const cellH = cropped.height / outH;
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
		const sw = cellW < 1 || cellH < 1 ? 1 : o.sampleWindow;
		const down2 = downsample(cropped, g, getDownsampleOptions(o, sw));
		const croppedOriginal = cropToBounds(img, bounds);
		const compareBeforeSanitized = downsample(
			croppedOriginal,
			g,
			getDownsampleOptions(o, sw),
		);
		const logicalMask = removeBackground(
			down2,
			o.backgroundTolerance,
			o.bgRemovalScope,
			o.bgConnectivity,
			bgTargets,
			o.bgExtractionMethod,
			backgroundModel,
		);
		const componentResult = removeSmallComponents(
			down2,
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
		return { cropped, g, sw, down2, compareBeforeSanitized, componentResult };
	};

	let logicalPass = createLogicalPass(b);
	const removalDiagnostic = logicalPass.componentResult.diagnostic;
	// [Intended] 生存成分での境界再構築はトリミング時だけ行う。トリミング無効時に縮めると、
	// 元キャンバス基準に揃えたセル境界の位相がここで崩れる。
	if (
		o.trimToContent &&
		o.smallComponentMode !== "off" &&
		logicalPass.componentResult.diagnostic.removedPixels > 0
	) {
		const survivingBounds = findOpaqueBounds(
			logicalPass.componentResult.mask,
			trimAlphaThreshold,
		);
		if (
			survivingBounds &&
			(survivingBounds.x !== 0 ||
				survivingBounds.y !== 0 ||
				survivingBounds.w !== outW ||
				survivingBounds.h !== outH)
		) {
			const mappedX = b.x + Math.floor(survivingBounds.x * logicalPass.g.cellW);
			const mappedY = b.y + Math.floor(survivingBounds.y * logicalPass.g.cellH);
			const mappedRight = Math.min(
				b.x + b.w,
				b.x +
					Math.ceil(
						(survivingBounds.x + survivingBounds.w) * logicalPass.g.cellW,
					),
			);
			const mappedBottom = Math.min(
				b.y + b.h,
				b.y +
					Math.ceil(
						(survivingBounds.y + survivingBounds.h) * logicalPass.g.cellH,
					),
			);
			const mappedMask = cropRawImage(
				getMasked(),
				mappedX,
				mappedY,
				mappedRight - mappedX,
				mappedBottom - mappedY,
			);
			const exactBounds = findOpaqueBounds(mappedMask, trimAlphaThreshold);
			if (exactBounds) {
				b = {
					x: mappedX + exactBounds.x,
					y: mappedY + exactBounds.y,
					w: exactBounds.w,
					h: exactBounds.h,
				};
				// [Intended] 除去済み成分が強制変換のセル倍率へ影響しないよう、
				// 生存成分のソース境界から最終グリッドを一度だけ再構築する。
				logicalPass = createLogicalPass(b);
			}
		}
	}

	const { cropped, g, sw, down2, componentResult } = logicalPass;
	let { compareBeforeSanitized } = logicalPass;
	log(
		`Opaque bounds found in ${(performance.now() - boundsStart).toFixed(2)}ms`,
		b,
	);
	o.debugHook?.("03-pre-downsample-bg-trimmed", cropped, {
		bounds: b,
		forcePixels: { w: o.forcePixelsW, h: o.forcePixelsH },
	});
	log(
		`Forced pixel size mode: ${outW}x${outH} (cell: ${g.cellW.toFixed(2)}x${g.cellH.toFixed(2)})`,
	);
	log(
		`Downsampling (forced) done in ${(performance.now() - downsampleStart).toFixed(2)}ms`,
	);
	o.debugHook?.("05-downsampled", down2, {
		sampleWindow: sw,
		cellSamplingMode: o.cellSamplingMode,
		forced: true,
	});

	if (o.smallComponentMode !== "off") {
		smallComponentRemoval = removalDiagnostic;
	}

	// 3. 後処理の透明化（背景除去）
	const postBgStart = performance.now();
	const postRemoval = {
		attempted: o.postRemoveBackground,
		rolledBack: false,
	};
	const result2 = o.postRemoveBackground
		? removeBackground(
				componentResult.image,
				o.backgroundTolerance,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
				postRemoval,
			)
		: componentResult.image;
	applyPostRemovalOutcome(backgroundDiagnostic, postRemoval);
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
	// [Intended] 元画像座標へ対応付ける後処理が切り抜き原点を失わないよう、返却グリッドにも保持する。
	let finalGridForForce = forcedTrimmedGridForOriginal;
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
		undefined,
		smallComponentRemoval,
		// [Policy] forced 経路は processingMode で明示指定された固定サイズ処理で、
		// Auto 実結果の位置を持たない。呼び出し元も設定しないため常に渡さない。
		undefined,
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
	let smallComponentRemoval = context.smallComponentRemoval;
	if (!context.preparedMask && o.floatingMaxPixels > 0) {
		const legacy = removeSmallFloatingComponentsInPlace(
			working,
			masked,
			trimAlphaThreshold,
			o.floatingMaxPixels,
		);
		smallComponentRemoval = {
			mode: "legacy",
			applied: true,
			removedComponents: legacy.removedComponents,
			removedPixels: legacy.removedPixels,
			pixelBasis: "source",
		};
	}
	const componentResult = removeSmallComponents(working, masked, img, {
		mode: o.smallComponentMode,
		alphaThreshold: trimAlphaThreshold,
		backgroundEnabled:
			o.bgExtractionMethod !== "none" && o.bgRemovalScope !== "off",
		automaticBackground: o.bgExtractionMethod === "auto",
		backgroundConfidence: backgroundDiagnostic?.confidence,
	});
	if (o.smallComponentMode !== "off") {
		smallComponentRemoval = componentResult.diagnostic;
	}

	const postRemoval = {
		attempted:
			(context.applyFinalAdjustments ?? false) && o.postRemoveBackground,
		rolledBack: false,
	};
	const base = postRemoval.attempted
		? removeBackground(
				componentResult.image,
				bgTol,
				o.bgRemovalScope,
				o.bgConnectivity,
				bgTargets,
				o.bgExtractionMethod,
				backgroundModel,
				postRemoval,
			)
		: componentResult.image;
	applyPostRemovalOutcome(backgroundDiagnostic, postRemoval);

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
		const b = findOpaqueBounds(componentResult.mask, trimAlphaThreshold);
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
		undefined,
		smallComponentRemoval,
		context.autoResultCandidateIndex,
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
