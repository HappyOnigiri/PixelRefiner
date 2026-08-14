import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { QUALITY_BASELINE_VERSION, type QualityBaseline } from "./types";

const DEFAULT_BASELINE_ROOT = path.resolve("test/quality/baseline");
const DEFAULT_BASELINE_FILE = path.resolve("test/quality/baseline.json");

// [Workaround] 一度限りのケース ID 改名後も PR ベース比較を継続できるようにする。
const PREVIOUS_CASE_IDS: Record<string, string> = {
	"remove-background-trim-auto-grid": "legacy-resize-remove-background",
	"remove-background-trim-resize-46x13": "legacy-resize-trimming",
	"trim-auto-grid": "legacy-auto-grid",
	"remove-inner-background-auto-grid": "legacy-inner-background",
	"remove-background-preserve-canvas": "legacy-no-trimming",
	"convert-game-boy-pocket-palette": "legacy-game-boy-palette",
	"convert-monochrome-floyd-steinberg": "legacy-floyd-steinberg",
	"remove-background-auto-grid-keep-aspect": "legacy-keep-aspect-ratio",
	"pad-wide-image-to-square": "legacy-make-square-wide",
	"pad-tall-image-to-square": "legacy-make-square-tall",
	"restore-high-resolution-pixel-grid": "legacy-high-resolution",
	"preserve-native-pixel-art": "generated-pixel-art-1x",
	"restore-nearest-2x-to-8x8": "generated-nearest-2x",
	"restore-nearest-3x-to-8x8": "generated-nearest-3x",
	"restore-nearest-4x-to-8x8": "generated-nearest-4x",
	"restore-nearest-8x-to-8x8": "generated-nearest-8x",
	"restore-nearest-16x-to-8x8": "generated-nearest-16x",
	"restore-nearest-32x-to-8x8": "generated-nearest-32x",
	"restore-nearest-1-5x-to-8x8": "generated-nearest-1-5x",
	"restore-nearest-2-5x-to-8x8": "generated-nearest-2-5x",
	"restore-nearest-3-2x-to-8x8": "generated-nearest-3-2x",
	"restore-bilinear-to-8x8": "generated-bilinear",
	"restore-bicubic-to-8x8": "generated-bicubic-equivalent",
	"restore-gaussian-blur-to-8x8": "generated-light-blur",
	"restore-rgb-noise-to-8x8": "generated-rgb-noise",
	"restore-alpha-edge-blur-to-8x8": "generated-alpha-edge-blur",
	"restore-crop-shifts-to-8x8": "generated-crop-shifts",
	"remove-white-padding-to-8x8": "generated-padding-white",
	"remove-black-padding-to-8x8": "generated-padding-black",
	"remove-solid-padding-to-8x8": "generated-padding-solid",
	"remove-gradient-padding-to-8x8": "generated-padding-gradient",
	"restore-anisotropic-scale-to-8x8": "generated-anisotropic",
	"preserve-continuous-tone": "generated-continuous-tone",
};

const CURRENT_CASE_IDS = Object.fromEntries(
	Object.entries(PREVIOUS_CASE_IDS).map(([current, previous]) => [
		previous,
		current,
	]),
) as Record<string, string>;

export const baselineRoot = (): string =>
	path.resolve(process.env.QUALITY_BASELINE_ROOT ?? DEFAULT_BASELINE_ROOT);

export const baselineFile = (): string =>
	path.resolve(process.env.QUALITY_BASELINE_FILE ?? DEFAULT_BASELINE_FILE);

const resolveBaselineImagePath = (root: string, caseId: string): string => {
	const currentPath = path.join(root, `${caseId}.png`);
	if (existsSync(currentPath)) return currentPath;
	return path.join(root, `${PREVIOUS_CASE_IDS[caseId] ?? caseId}.png`);
};

export const baselineImagePath = (caseId: string): string =>
	resolveBaselineImagePath(baselineRoot(), caseId);

/**
 * PR ベース側への差し替えを無視して、リポジトリにチェックイン済みのベースラインを指す。
 * 目標画像の初期化やマニフェスト検証のように、head の資産そのものを見たいときに使う。
 */
export const checkedInBaselineRoot = (): string => DEFAULT_BASELINE_ROOT;

export const checkedInBaselineImagePath = (caseId: string): string =>
	resolveBaselineImagePath(DEFAULT_BASELINE_ROOT, caseId);

/**
 * [Intended] head 側でこのケースのベースライン画像が更新済み（＝劣化が宣言済み）かを判定する。
 * QUALITY_BASELINE_ROOT が指す PR ベース時点の旧ベースラインと、リポジトリにチェックイン
 * された（＝ head の）ベースライン画像のバイト列を比較する。auto ケースの regression を
 * 「要人間レビューの警告」に降格してよいかの判定材料に使う（shard.ts）。
 * QUALITY_BASELINE_ROOT が未設定のローカル実行では比較対象の「旧」が存在しないため、
 * 常に false を返す（＝降格条件を満たさず、従来どおりゲートは厳格に働く）。
 */
export const isBaselineImageDeclaredUpdated = (caseId: string): boolean => {
	const overrideRoot = process.env.QUALITY_BASELINE_ROOT;
	if (overrideRoot === undefined) return false;
	const oldPath = resolveBaselineImagePath(path.resolve(overrideRoot), caseId);
	const headPath = resolveBaselineImagePath(DEFAULT_BASELINE_ROOT, caseId);
	if (!existsSync(oldPath)) return true;
	if (!existsSync(headPath)) return false;
	return !readFileSync(oldPath).equals(readFileSync(headPath));
};

export const assertBaselineUpdateIsSafe = (profile: string): void => {
	if (profile !== "full") {
		throw new Error("Quality baseline updates require the full profile");
	}
	if (
		process.env.QUALITY_BASELINE_ROOT !== undefined ||
		process.env.QUALITY_BASELINE_FILE !== undefined
	) {
		throw new Error(
			"Quality baseline updates cannot use QUALITY_BASELINE_ROOT or QUALITY_BASELINE_FILE",
		);
	}
};

export const loadBaseline = (): QualityBaseline => {
	return loadBaselineFile(baselineFile());
};

/**
 * PR ベース側への差し替えを無視し、head にチェックインされた指標を読み込む。
 * [Intended] PR レポートの比較対象は base のまま保ちつつ、head 自身のベースラインが
 * 現在の生成結果と同期しているかを別に検証するために使う。
 */
export const loadCheckedInBaseline = (): QualityBaseline =>
	loadBaselineFile(DEFAULT_BASELINE_FILE);

const loadBaselineFile = (file: string): QualityBaseline => {
	if (!existsSync(file))
		return {
			version: QUALITY_BASELINE_VERSION,
			commit: "unavailable",
			cases: [],
		};
	const baseline = JSON.parse(readFileSync(file, "utf8")) as QualityBaseline;
	if (baseline.version !== QUALITY_BASELINE_VERSION) {
		throw new Error(
			`Unsupported quality baseline version: ${String(baseline.version)}`,
		);
	}
	return {
		...baseline,
		cases: baseline.cases.map((qualityCase) => ({
			...qualityCase,
			id: CURRENT_CASE_IDS[qualityCase.id] ?? qualityCase.id,
		})),
	};
};
