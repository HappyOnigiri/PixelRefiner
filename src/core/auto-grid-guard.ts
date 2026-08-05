import { AUTO_GRID_GUARD_LIMITS } from "../shared/config";
import type { PixelGrid, RawImage } from "../shared/types";
import { detectNativePixelScale, type NativePixelScale } from "./native-scale";

export type AutoGridDegeneracy = {
	degenerate: boolean;
	nativeScale?: NativePixelScale;
};

const cellAspectRatio = (grid: Pick<PixelGrid, "cellW" | "cellH">): number => {
	const shortest = Math.max(1e-6, Math.min(grid.cellW, grid.cellH));
	return Math.max(grid.cellW, grid.cellH) / shortest;
};

/**
 * 選んだグリッドが「整数倍拡大された入力を元へ戻す」ものとして説明できるかを判定する。
 *
 * [Intended] 8x8 を 8 倍に拡大した 64x64 のような入力では、出力が 8x8 と小さくても
 * 縮退ではない。検出した整数倍格子と出力サイズが概ね一致する場合は縮小を尊重する。
 */
const matchesNativeLattice = (
	source: Pick<RawImage, "width" | "height">,
	outW: number,
	outH: number,
	scale: NativePixelScale,
): boolean => {
	if (!scale.measured) return false;
	if (scale.scaleX < 2 || scale.scaleY < 2) return false;
	const ratio = AUTO_GRID_GUARD_LIMITS.nativeLatticeMatchRatio;
	return (
		outW * scale.scaleX >= source.width * ratio &&
		outH * scale.scaleY >= source.height * ratio
	);
};

/**
 * auto 経路で選んだグリッドの出力が縮退しているかを判定する。
 *
 * [Policy] 大きな入力では出力が小さくても妥当な復元であることが多く、
 * 既存の出力（低信頼の警告付きで結果を残す挙動）を変えたくない。
 * そのため、1 セルあたりの原画素が少なく縮退の損害が大きい小入力に限って適用する。
 */
export const evaluateAutoGridDegeneracy = (
	source: RawImage,
	outW: number,
	outH: number,
	grid: Pick<PixelGrid, "cellW" | "cellH">,
): AutoGridDegeneracy => {
	const limits = AUTO_GRID_GUARD_LIMITS;
	if (Math.max(source.width, source.height) > limits.maxGuardedInputDimension) {
		return { degenerate: false };
	}
	const tooSmall = Math.min(outW, outH) < limits.minOutputDimension;
	const tooSkewed = cellAspectRatio(grid) > limits.maxCellAspectRatio;
	if (!tooSmall && !tooSkewed) return { degenerate: false };
	if (outW >= source.width && outH >= source.height) {
		// [Intended] 等倍のまま小さいだけの入力は、縮小していないので縮退ではない。
		return { degenerate: false };
	}
	const nativeScale = detectNativePixelScale(source);
	return {
		degenerate: !matchesNativeLattice(source, outW, outH, nativeScale),
		nativeScale,
	};
};
