import {
	GRID_CANDIDATE_SCORE_WEIGHTS,
	PROCESS_ANALYSIS_THRESHOLDS,
} from "../shared/config";
import type {
	GridCandidateReport,
	GridCandidateSubscores,
	PixelGrid,
	RawImage,
} from "../shared/types";

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

/** 再構成誤差の比を取るときの 0 除算よけ。 */
const RECONSTRUCTION_ERROR_EPSILON = 1e-6;

const gridGeometry = (grid: PixelGrid, source: RawImage) => {
	const outW =
		grid.outW ??
		Math.max(1, Math.floor((source.width - grid.offsetX) / grid.cellW));
	const outH =
		grid.outH ??
		Math.max(1, Math.floor((source.height - grid.offsetY) / grid.cellH));
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	return {
		outW,
		outH,
		cropX,
		cropY,
		cropW: grid.cropW ?? outW * grid.cellW,
		cropH: grid.cropH ?? outH * grid.cellH,
	};
};

const axisAgreement = (grid: PixelGrid): number => {
	if (grid.detectionFailedAxes?.length) return 0;
	if (grid.scoreX === undefined && grid.scoreY === undefined) return 1;
	if (grid.scoreX === undefined || grid.scoreY === undefined) return 0;
	const scale = Math.abs(grid.scoreX) + Math.abs(grid.scoreY) + 1;
	return clampUnit(1 - Math.abs(grid.scoreX - grid.scoreY) / scale);
};

const reconstructionError = (
	source: RawImage,
	grid: PixelGrid,
	offsetDeltaX = 0,
	offsetDeltaY = 0,
): number => {
	const geometry = gridGeometry(grid, source);
	const pixelCount = geometry.cropW * geometry.cropH;
	if (pixelCount <= 0) return 1;
	const sampleStride = Math.max(
		1,
		Math.ceil(
			Math.sqrt(
				pixelCount / PROCESS_ANALYSIS_THRESHOLDS.gridCandidateSampleLimit,
			),
		),
	);
	const cropEndX = Math.min(source.width, geometry.cropX + geometry.cropW);
	const cropEndY = Math.min(source.height, geometry.cropY + geometry.cropH);
	let difference = 0;
	let samples = 0;
	for (let y = Math.max(0, geometry.cropY); y < cropEndY; y += sampleStride) {
		const cellY = Math.floor((y - geometry.cropY) / grid.cellH);
		const centerY = Math.min(
			source.height - 1,
			Math.max(
				0,
				Math.floor(geometry.cropY + (cellY + 0.5) * grid.cellH + offsetDeltaY),
			),
		);
		for (let x = Math.max(0, geometry.cropX); x < cropEndX; x += sampleStride) {
			const cellX = Math.floor((x - geometry.cropX) / grid.cellW);
			const centerX = Math.min(
				source.width - 1,
				Math.max(
					0,
					Math.floor(
						geometry.cropX + (cellX + 0.5) * grid.cellW + offsetDeltaX,
					),
				),
			);
			const sourceIndex = (y * source.width + x) * 4;
			const centerIndex = (centerY * source.width + centerX) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				difference += Math.abs(
					source.data[sourceIndex + channel] -
						source.data[centerIndex + channel],
				);
			}
			samples += 1;
		}
	}
	return samples === 0 ? 1 : difference / (samples * 4 * 255);
};

const isPreserveGrid = (grid: PixelGrid, source: RawImage): boolean => {
	const geometry = gridGeometry(grid, source);
	return (
		grid.cellW === 1 &&
		grid.cellH === 1 &&
		geometry.outW === source.width &&
		geometry.outH === source.height
	);
};

const candidateKey = (grid: PixelGrid, source: RawImage): string => {
	const geometry = gridGeometry(grid, source);
	return [
		grid.cellW,
		grid.cellH,
		grid.offsetX,
		grid.offsetY,
		geometry.outW,
		geometry.outH,
	].join(":");
};

const preserveGrid = (source: RawImage): PixelGrid => ({
	cellW: 1,
	cellH: 1,
	offsetX: 0,
	offsetY: 0,
	score: PROCESS_ANALYSIS_THRESHOLDS.legacyPreserveCandidateScore,
	cropX: 0,
	cropY: 0,
	cropW: source.width,
	cropH: source.height,
	outW: source.width,
	outH: source.height,
});

/**
 * 実測できた信号だけで重み付き平均を取る。
 *
 * [Intended] 未計測の信号を中立値 0.5 のまま総和へ混ぜると、その重み分は
 * どの候補でも同じ定数になり、スコアの上限を機械的に押し下げる。高速経路は
 * アンサンブル信号を測らないため、重み 0.42 分が常に半分しか得られず、
 * 正しく処理できた画像でも信頼度が下限付近へ張り付いていた。
 * 計測できた重みで割り、「集めた証拠の平均的な強さ」を表す値にする。
 */
const weightedScore = (
	subscores: GridCandidateSubscores,
	measuredKeys: ReadonlySet<keyof GridCandidateSubscores>,
): number => {
	let score = 0;
	let weightSum = 0;
	for (const key of Object.keys(GRID_CANDIDATE_SCORE_WEIGHTS) as Array<
		keyof GridCandidateSubscores
	>) {
		if (!measuredKeys.has(key)) continue;
		score += subscores[key] * GRID_CANDIDATE_SCORE_WEIGHTS[key];
		weightSum += GRID_CANDIDATE_SCORE_WEIGHTS[key];
	}
	return weightSum === 0 ? 0 : clampUnit(score / weightSum);
};

/**
 * 検出器によらず候補ごとに必ず計測できる信号。
 *
 * [Intended] coverage と outputSize は含めない。どちらの検出器も候補すべてに同じ
 * 解析領域を与えるため（Auto は共通のトリム BBox、格子検出はキャンバス全体）、
 * 実測すると候補によらず 1.0 の定数になる。定数を実測扱いで平均へ混ぜると、
 * 誤った候補の総合点まで一律に押し上げて信頼度のしきい値が緩む。
 * 極端な出力サイズは getGridSafety と EXTREME_OUTPUT_SIZE の警告が受け持つ。
 */
const ALWAYS_MEASURED_SUBSCORES = [
	"periodicity",
	"edgeAlignment",
	"reconstruction",
	"complexity",
	"axisAgreement",
	"stability",
] as const satisfies ReadonlyArray<keyof GridCandidateSubscores>;

/** アンサンブル検出器を通ったときだけ得られる信号。 */
const ENSEMBLE_SUBSCORES = [
	"colorBoundary",
	"luminanceGradient",
	"alphaGradient",
	"autocorrelation",
	"localPhaseStability",
	"methodAgreement",
] as const satisfies ReadonlyArray<keyof GridCandidateSubscores>;

export const rankGridCandidates = (
	source: RawImage,
	selectedGrid: PixelGrid,
	method: string,
): GridCandidateReport[] => {
	const grids = [selectedGrid, ...(selectedGrid.candidates ?? [])];
	const preserve = preserveGrid(source);
	grids.push(preserve);
	const unique: PixelGrid[] = [];
	const seen = new Set<string>();
	for (const grid of grids) {
		const key = candidateKey(grid, source);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(grid);
	}

	// [Intended] coverage の基準は元キャンバスではなく、候補が実際に解析した領域。
	// トリミング前提の Auto 経路は内容 BBox だけを解析するため、キャンバス基準では
	// 余白が広い画像ほど減点され、正しく検出できた格子ほど不利になっていた。
	const analysisArea = Math.max(
		1,
		...unique.map((grid) => {
			if (isPreserveGrid(grid, source)) return 1;
			const geometry = gridGeometry(grid, source);
			return geometry.cropW * geometry.cropH;
		}),
	);

	const reports: GridCandidateReport[] = [];
	const measuredKeysByReport = new Map<
		GridCandidateReport,
		Set<keyof GridCandidateSubscores>
	>();
	for (const grid of unique) {
		const geometry = gridGeometry(grid, source);
		const preserveCandidate = isPreserveGrid(grid, source);
		const baseError = reconstructionError(source, grid);
		let shiftedError = baseError;
		if (!preserveCandidate && (grid.cellW > 1 || grid.cellH > 1)) {
			shiftedError = Math.min(
				reconstructionError(source, grid, 1, 0),
				reconstructionError(source, grid, 0, 1),
			);
		}
		const sourceArea = Math.max(1, source.width * source.height);
		const outputArea = geometry.outW * geometry.outH;
		const coverage = clampUnit(
			(geometry.cropW * geometry.cropH) /
				(preserveCandidate ? sourceArea : analysisArea),
		);
		const edgeRemainder =
			Math.abs(source.width - (geometry.cropX + geometry.cropW)) +
			Math.abs(source.height - (geometry.cropY + geometry.cropH));
		const cellScale = Math.sqrt(grid.cellW * grid.cellH);
		const signalScores = grid.signalScores;
		// [Intended] アンサンブルを実行しない旧検出器では、未計測信号を否定票にしない。
		const unmeasuredSignalScore = 0.5;
		const subscores: GridCandidateSubscores = {
			colorBoundary: preserveCandidate
				? 0
				: (signalScores?.colorBoundary ?? unmeasuredSignalScore),
			luminanceGradient: preserveCandidate
				? 0
				: (signalScores?.luminanceGradient ?? unmeasuredSignalScore),
			alphaGradient: preserveCandidate
				? 0
				: (signalScores?.alphaGradient ?? unmeasuredSignalScore),
			autocorrelation: preserveCandidate
				? 0
				: (signalScores?.autocorrelation ?? unmeasuredSignalScore),
			localPhaseStability: preserveCandidate
				? 0
				: (signalScores?.localPhaseStability ?? unmeasuredSignalScore),
			periodicity: preserveCandidate
				? 0
				: 1 /
					(1 +
						Math.max(0, grid.score) /
							PROCESS_ANALYSIS_THRESHOLDS.gridScoreScale),
			edgeAlignment: clampUnit(
				1 - edgeRemainder / Math.max(1, source.width + source.height),
			),
			// [Intended] 誤差はアンサンブル側と同じ飽和曲線で点数化する。線形に引くと
			// アンチエイリアスや圧縮ノイズを含む入力が軒並み 0 へ潰れ、候補間で最も
			// 識別力のある信号が死んでいた。
			reconstruction:
				signalScores?.reconstruction ??
				1 /
					(1 +
						baseError *
							PROCESS_ANALYSIS_THRESHOLDS.gridCandidateReconstructionScale),
			complexity: preserveCandidate
				? 0
				: clampUnit(Math.log2(Math.max(1, cellScale)) / 4),
			coverage,
			axisAgreement: axisAgreement(grid),
			methodAgreement: preserveCandidate
				? 0
				: (signalScores?.methodAgreement ?? 0.5),
			// [Intended] 位相を 1px ずらしたときの誤差増加は、絶対値ではなく元の誤差との
			// 比で見る。絶対差は誤差が小さい良い格子ほど小さくなり、正しい検出ほど
			// 0 点に近づいてしまう。
			stability: preserveCandidate
				? 0
				: (signalScores?.localPhaseStability ??
					clampUnit(
						(shiftedError - baseError) /
							Math.max(baseError, RECONSTRUCTION_ERROR_EPSILON),
					)),
			harmonic: 0.5,
			// [Intended] 出力が極端かどうかだけを表す。coverage を写しても候補間で
			// 差が出ず、同じ量を二重に数えるだけになる。
			outputSize: outputArea <= 1 || outputArea > sourceArea ? 0 : 1,
		};
		const { candidates: _candidates, ...reportGrid } = grid;
		// [Intended] preserve は比較用の擬似候補で、信号を測っていない項目を 0 で
		// 埋めている。実測扱いにすると平均が不当に下がるため常に総合 0 のままとする。
		const measuredKeys = new Set<keyof GridCandidateSubscores>(
			preserveCandidate ? [] : ALWAYS_MEASURED_SUBSCORES,
		);
		if (!preserveCandidate && signalScores) {
			for (const key of ENSEMBLE_SUBSCORES) measuredKeys.add(key);
		}
		const report: GridCandidateReport = {
			grid: reportGrid,
			...geometry,
			method: preserveCandidate ? "preserve" : method,
			totalScore: preserveCandidate
				? 0
				: weightedScore(subscores, measuredKeys),
			confidence: 0,
			subscores,
		};
		measuredKeysByReport.set(report, measuredKeys);
		reports.push(report);
	}
	for (const report of reports) {
		if (report.method === "preserve" || !report.subscores) continue;
		const reportSubscores = report.subscores as GridCandidateSubscores;
		let harmonicScore = 0.5;
		let harmonicMeasured = false;
		for (const other of reports) {
			if (other === report || other.method === "preserve") continue;
			if (!other.subscores) continue;
			const ratioW = report.grid.cellW / Math.max(1, other.grid.cellW);
			const ratioH = report.grid.cellH / Math.max(1, other.grid.cellH);
			const factorW = Math.round(ratioW);
			const factorH = Math.round(ratioH);
			if (
				factorW < 2 ||
				factorW > 3 ||
				factorH < 2 ||
				factorH > 3 ||
				Math.abs(ratioW - factorW) > 0.02 ||
				Math.abs(ratioH - factorH) > 0.02
			)
				continue;
			const smaller = other.subscores as GridCandidateSubscores;
			const reconstructionGain =
				reportSubscores.reconstruction - smaller.reconstruction;
			// [Intended] 2倍・3倍周期は、再構成が明確に良い場合だけ基礎周期を上回れる。
			harmonicScore = Math.min(
				harmonicScore,
				clampUnit(0.25 + reconstructionGain * 2),
			);
			harmonicMeasured = true;
		}
		reportSubscores.harmonic = harmonicScore;
		const measuredKeys = measuredKeysByReport.get(report);
		if (measuredKeys === undefined) continue;
		// [Intended] 倍音関係にある候補が無ければ harmonic は判定材料が無く、
		// 既定値 0.5 が入っているだけなので平均へ含めない。
		if (harmonicMeasured) measuredKeys.add("harmonic");
		report.totalScore = weightedScore(reportSubscores, measuredKeys);
	}

	return rerankGridCandidateReports(reports);
};

const rerankGridCandidateReports = (
	reports: GridCandidateReport[],
): GridCandidateReport[] => {
	reports.sort(
		(left, right) =>
			right.totalScore - left.totalScore ||
			left.outW - right.outW ||
			left.outH - right.outH,
	);
	const rankedGridReports = reports.filter(
		(report) => report.method !== "preserve",
	);
	for (let index = 0; index < rankedGridReports.length; index += 1) {
		const report = rankedGridReports[index];
		const runnerUp = rankedGridReports[index + 1];
		// [Intended] 次点との差が無い最下位候補に自分の総合点をそのまま余裕として
		// 与えると、最も弱い候補が採用候補より高い信頼度を持つことがあった。
		// 余裕を主張できるのは競合が存在しない唯一の候補だけとする。
		const margin = runnerUp
			? clampUnit(report.totalScore - runnerUp.totalScore)
			: index === 0
				? report.totalScore
				: 0;
		report.confidence =
			clampUnit(
				report.totalScore * 0.7 +
					margin * 0.2 +
					(report.subscores?.stability ?? 0) * 0.1,
			) * (report.subscores?.axisAgreement ?? 0);
	}
	return reports;
};
