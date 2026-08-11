import path from "node:path";
import type { QualityCaseResult, QualityImageSize } from "../types";
import { escapeHtml, formatImageSize } from "./format";

type ReportImage = {
	/** 見出しの翻訳キー。 */
	key: string;
	label: string;
	source: string | null;
	size: QualityImageSize | null;
	/** 目標と寸法が食い違う画像。実寸を警告色で出す。 */
	sizeMismatched?: boolean;
};

/**
 * 今回生成が目標と違う寸法か。目標を持たないケースは比べられないので false。
 * 一覧と詳細で同じ判定を使い、片方だけ警告色になることを防ぐ。
 */
const resultSizeMismatched = (result: QualityCaseResult): boolean => {
	const target = result.imageSizes.groundTruth;
	const current = result.imageSizes.result;
	if (target === null || current === null) return false;
	return target.width !== current.width || target.height !== current.height;
};

/**
 * 実寸の class 名。CSS 側の規則と対応していることをテストで確かめるため、
 * マークアップに直書きせずここから配る。
 */
export const IMAGE_SIZE_CLASS = "image-size";

/** 目標と寸法が食い違う実寸へ足す修飾。 */
export const IMAGE_SIZE_MISMATCH_CLASS = "size-mismatch";

/**
 * 画像の見出しへ添える実寸。
 * [Intended] 翻訳は data-i18n を持つ要素の textContent を丸ごと置き換えるので、実寸は
 * 見出しの span の外へ出す。figcaption 直下へ置くと言語切り替えで消える。
 */
const renderImageSize = (image: ReportImage): string => {
	if (image.size === null) return "";
	const className = image.sizeMismatched
		? `${IMAGE_SIZE_CLASS} ${IMAGE_SIZE_MISMATCH_CLASS}`
		: IMAGE_SIZE_CLASS;
	return ` <small class="${className}">(${formatImageSize(image.size)})</small>`;
};

/**
 * 画像一式の figure。src の書き方が一覧（レポート起点の相対パス）と詳細
 * （ケースディレクトリ内のファイル名）で違うので、変換だけを呼び出し側から受け取る。
 */
const renderImages = (
	images: ReportImage[],
	toSource: (source: string) => string,
): string =>
	images
		.filter(
			(image): image is ReportImage & { source: string } =>
				image.source !== null,
		)
		.map(
			(image) =>
				`<figure><figcaption><span data-i18n="${image.key}">${image.label}</span>` +
				`${renderImageSize(image)}</figcaption>` +
				`<div class="image-stage"><img src="${escapeHtml(toSource(image.source))}" alt="${image.label}" ` +
				`data-i18n-alt="${image.key}" loading="lazy"></div></figure>`,
		)
		.join("");

/** 一覧のカードに並べる画像。目標・今回生成・目標との差分だけを出す。 */
export const renderPrimaryImages = (result: QualityCaseResult): string =>
	renderImages(
		[
			{
				key: "groundTruth",
				label: "Target",
				source: result.files.groundTruth,
				size: result.imageSizes.groundTruth,
			},
			{
				key: "result",
				label: "Result",
				source: result.files.result,
				size: result.imageSizes.result,
				sizeMismatched: resultSizeMismatched(result),
			},
			{
				key: "groundTruthDifference",
				label: "Target difference",
				source: result.files.diff,
				size: result.imageSizes.diff,
			},
		],
		(source) => source,
	);

/** ケース詳細に並べる画像。書き出した画像をすべて出す。 */
export const renderAllImages = (result: QualityCaseResult): string =>
	renderImages(
		[
			{
				key: "input",
				label: "Input",
				source: result.files.input,
				size: result.imageSizes.input,
			},
			{
				key: "groundTruth",
				label: "Ground truth",
				source: result.files.groundTruth,
				size: result.imageSizes.groundTruth,
			},
			{
				key: "baseline",
				label: "Baseline",
				source: result.files.baseline,
				size: result.imageSizes.baseline,
			},
			{
				key: "result",
				label: "Result",
				source: result.files.result,
				size: result.imageSizes.result,
				sizeMismatched: resultSizeMismatched(result),
			},
			{
				key: "groundTruthDifference",
				label: "Ground-truth difference",
				source: result.files.diff,
				size: result.imageSizes.diff,
			},
			{
				key: "baselineDifference",
				label: "Baseline difference",
				source: result.files.baselineDiff,
				size: result.imageSizes.baselineDiff,
			},
			{
				key: "backgroundMask",
				label: "Background mask",
				source: result.files.backgroundMask,
				size: result.imageSizes.backgroundMask,
			},
		],
		(source) => path.posix.basename(source),
	);

export const renderImageDialog = (): string => `
<dialog id="image-dialog">
	<button id="dialog-close">&times;</button>
	<div class="image-stage dialog-stage"><img alt=""></div>
</dialog>`;
