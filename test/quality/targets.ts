import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import path from "node:path";
import { checkedInBaselineImagePath } from "./baseline";
import { caseParameterMode } from "./manifest";
import type { QualityImageCase } from "./types";

const TARGET_DIRECTORY = "test/quality/targets";
const TARGET_ROOT = path.resolve(TARGET_DIRECTORY);
const REGISTRY_PATH = path.resolve("test/quality/auto-targets.json");

type AutoTargetEntry = {
	/** 目標画像の由来となる explicit ケースの ID。 */
	source: string;
	/** 由来が自明でないときの理由。 */
	note?: string;
};

type AutoTargetRegistry = {
	comment: string;
	/** 目標を置けない auto ケースと、その理由。 */
	excluded: Record<string, string>;
	targets: Record<string, AutoTargetEntry>;
};

let cachedRegistry: AutoTargetRegistry | null = null;

export const loadAutoTargetRegistry = (): AutoTargetRegistry => {
	cachedRegistry ??= JSON.parse(
		readFileSync(REGISTRY_PATH, "utf8"),
	) as AutoTargetRegistry;
	return cachedRegistry;
};

/**
 * 自動判定ケースの目標画像パス。ベースラインと違い PR ベース側へ差し替えないので、
 * 常にチェックイン済みの 1 枚を指す。
 */
export const autoTargetImage = (caseId: string): string | undefined =>
	caseId in loadAutoTargetRegistry().targets
		? `${TARGET_DIRECTORY}/${caseId}.png`
		: undefined;

/** 目標画像の由来となった explicit ケースの ID。レポートに出典として載せる。 */
export const autoTargetSource = (caseId: string): string | undefined =>
	loadAutoTargetRegistry().targets[caseId]?.source;

/**
 * ケースの目標画像。explicit はケース定義の正解画像、auto は固定した目標画像。
 * [Intended] auto の目標はベースラインと別物として保持する。ベースラインは PR ごとに
 * 動く「前回の出力」なので、これを目標に使うと基準が現状に引きずられて下がっていく。
 */
export const caseTargetImage = (
	qualityCase: QualityImageCase,
): string | undefined =>
	caseParameterMode(qualityCase) === "auto"
		? autoTargetImage(qualityCase.id)
		: qualityCase.expected;

export const validateAutoTargets = (cases: QualityImageCase[]): string[] => {
	const errors: string[] = [];
	const registry = loadAutoTargetRegistry();
	const explicitIds = new Set(
		cases
			.filter((qualityCase) => caseParameterMode(qualityCase) !== "auto")
			.map((qualityCase) => qualityCase.id),
	);
	const autoIds = new Set(
		cases
			.filter((qualityCase) => caseParameterMode(qualityCase) === "auto")
			.map((qualityCase) => qualityCase.id),
	);
	for (const [caseId, entry] of Object.entries(registry.targets)) {
		if (!autoIds.has(caseId)) {
			errors.push(`Unregistered auto target: ${caseId}`);
		}
		if (!explicitIds.has(entry.source)) {
			errors.push(`${caseId}: unknown target source case ${entry.source}`);
		}
		if (!existsSync(path.join(TARGET_ROOT, `${caseId}.png`))) {
			errors.push(`${caseId}: missing target image`);
		}
	}
	for (const caseId of Object.keys(registry.excluded)) {
		if (!autoIds.has(caseId)) {
			errors.push(`Unregistered excluded auto target: ${caseId}`);
		}
		if (caseId in registry.targets) {
			errors.push(`${caseId}: listed as both target and excluded`);
		}
	}
	// [Intended] 目標の登録漏れを見逃さない。fixture を足すと auto ケースは自動で増えるので、
	// 目標か除外理由のどちらかを必ず書かせないと、黙って目標なしのケースが混ざる。
	for (const caseId of autoIds) {
		if (caseId in registry.targets || caseId in registry.excluded) continue;
		errors.push(`${caseId}: missing target registration`);
	}
	if (!existsSync(TARGET_ROOT)) {
		errors.push("Missing quality target directory");
		return errors;
	}
	for (const fileName of readdirSync(TARGET_ROOT)) {
		if (!fileName.endsWith(".png")) continue;
		const caseId = fileName.slice(0, -4);
		if (caseId in registry.targets) continue;
		errors.push(`Unregistered target image: ${TARGET_DIRECTORY}/${fileName}`);
	}
	return errors;
};

/**
 * 目標画像の不足分だけを由来ケースのベースラインから作る初期化。
 * [Policy] 既存の目標画像は決して上書きしない。目標は現状の出力に合わせて動かさない
 * ためのものなので、更新するなら意図的な差し替えとして手で行う。
 */
export const syncAutoTargets = (): { created: string[]; kept: string[] } => {
	const registry = loadAutoTargetRegistry();
	const created: string[] = [];
	const kept: string[] = [];
	mkdirSync(TARGET_ROOT, { recursive: true });
	for (const [caseId, entry] of Object.entries(registry.targets)) {
		const targetPath = path.join(TARGET_ROOT, `${caseId}.png`);
		if (existsSync(targetPath)) {
			kept.push(caseId);
			continue;
		}
		copyFileSync(checkedInBaselineImagePath(entry.source), targetPath);
		created.push(caseId);
	}
	return { created, kept };
};
