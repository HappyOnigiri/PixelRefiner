import type { RGB } from "../shared/types";

/**
 * GIMP Palette（.gpl）文字列を解析し、RGB カラー配列を返す。
 * コメントとヘッダー行は無視する。
 */
export const parseGPL = (text: string): RGB[] => {
	const lines = text.split(/\r?\n/);
	const colors: RGB[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// 数字を含む行が見つかるまでヘッダー行を飛ばす
		// GIMP Palette 形式は通常、「GIMP Palette」、「Name: ...」、「Columns: ...」の後に「#」またはデータが続く

		if (
			trimmed.startsWith("#") ||
			trimmed.startsWith("GIMP Palette") ||
			trimmed.includes(":")
		) {
			continue;
		}

		// 「R G B [名前]」形式として解析を試みる
		const parts = trimmed.split(/\s+/).filter(Boolean);
		if (parts.length >= 3) {
			const r = parseInt(parts[0], 10);
			const g = parseInt(parts[1], 10);
			const b = parseInt(parts[2], 10);

			if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
				colors.push({ r, g, b });
			}
		}
	}

	return colors;
};

/**
 * RGB カラー配列から GIMP Palette（.gpl）文字列を生成する。
 */
export const generateGPL = (colors: RGB[], name: string): string => {
	const lines = ["GIMP Palette", `Name: ${name}`, "Columns: 4", "#"];

	for (const c of colors) {
		// 形式: R G B 名前
		const r = c.r.toString().padStart(3, " ");
		const g = c.g.toString().padStart(3, " ");
		const b = c.b.toString().padStart(3, " ");

		// 名前部分用に 16 進数へ変換する
		const rHex = c.r.toString(16).padStart(2, "0").toUpperCase();
		const gHex = c.g.toString(16).padStart(2, "0").toUpperCase();
		const bHex = c.b.toString(16).padStart(2, "0").toUpperCase();
		const hex = `#${rHex}${gHex}${bHex}`;

		lines.push(`${r} ${g} ${b}\t${hex}`);
	}

	return lines.join("\n");
};

/**
 * RGB カラー配列から PNG Blob を生成する。
 * 画像の高さは 1px、幅は Npx となる。
 * 注: この関数は DOM API を使用するため、ブラウザーコンテキストで実行する必要がある。
 */
export const generatePaletteImage = (colors: RGB[]): Promise<Blob | null> => {
	return new Promise((resolve) => {
		if (colors.length === 0) {
			resolve(null);
			return;
		}

		const canvas = document.createElement("canvas");
		canvas.width = colors.length;
		canvas.height = 1;
		const ctx = canvas.getContext("2d");

		if (!ctx) {
			resolve(null);
			return;
		}

		const imgData = ctx.createImageData(colors.length, 1);
		for (let i = 0; i < colors.length; i++) {
			const c = colors[i];
			const idx = i * 4;
			imgData.data[idx] = c.r;
			imgData.data[idx + 1] = c.g;
			imgData.data[idx + 2] = c.b;
			imgData.data[idx + 3] = 255; // アルファ
		}
		ctx.putImageData(imgData, 0, 0);

		canvas.toBlob((blob) => {
			resolve(blob);
		}, "image/png");
	});
};

/**
 * ユークリッド距離を使用してパレット内の最も近い色を見つける。
 */
export const findNearestColor = (target: RGB, palette: RGB[]): RGB => {
	if (palette.length === 0) return target;

	let minDist = Infinity;
	let nearest = palette[0];

	for (const p of palette) {
		// RGB 空間における単純なユークリッド距離
		const dr = target.r - p.r;
		const dg = target.g - p.g;
		const db = target.b - p.b;
		const dist = dr * dr + dg * dg + db * db;

		if (dist < minDist) {
			minDist = dist;
			nearest = p;
		}
	}

	return nearest;
};

/**
 * パレットの色を相対輝度（知覚上の明るさ）で並べ替える。
 * 明るい順に並べる。
 */
export const sortPalette = (palette: RGB[]): RGB[] => {
	return [...palette].sort((a, b) => {
		// 相対輝度を計算する
		// L = 0.2126*R + 0.7152*G + 0.0722*B (Rec. 709)
		// より単純な式: 0.299*R + 0.587*G + 0.114*B（Rec. 601）
		// 一般的な知覚と十分一致するため、簡潔な Rec. 601 を使用する
		const getLum = (c: RGB) => c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
		return getLum(b) - getLum(a); // 降順（高い輝度から低い輝度へ）
	});
};

/**
 * 中央値分割法でパレットから代表色を選択する。
 * 色空間を再帰的に分割して、最も多様な色を見つける。
 */
const medianCut = (colors: RGB[], maxColors: number): RGB[] => {
	if (colors.length <= maxColors) {
		return colors;
	}

	// 再帰的に分割するためのバケットを作成する
	const buckets: RGB[][] = [colors];

	while (buckets.length < maxColors) {
		// 範囲が最も大きいバケットを見つける
		let maxRange = -1;
		let maxBucketIndex = 0;
		let maxChannel: "r" | "g" | "b" = "r";

		for (let i = 0; i < buckets.length; i++) {
			const bucket = buckets[i];
			if (bucket.length === 1) continue;

			// 各チャンネルの範囲を計算する
			const rRange = getRange(bucket, "r");
			const gRange = getRange(bucket, "g");
			const bRange = getRange(bucket, "b");

			const range = Math.max(rRange, gRange, bRange);
			if (range > maxRange) {
				maxRange = range;
				maxBucketIndex = i;
				if (rRange >= gRange && rRange >= bRange) {
					maxChannel = "r";
				} else if (gRange >= bRange) {
					maxChannel = "g";
				} else {
					maxChannel = "b";
				}
			}
		}

		// 分割できるバケットがなければ終了する
		if (maxRange === -1) break;

		// バケットを中央値で分割する
		const bucket = buckets[maxBucketIndex];
		bucket.sort((a, b) => a[maxChannel] - b[maxChannel]);
		const median = Math.floor(bucket.length / 2);

		buckets.splice(
			maxBucketIndex,
			1,
			bucket.slice(0, median),
			bucket.slice(median),
		);
	}

	// 各バケットの平均色を返す
	return buckets.map((bucket) => {
		const sum = bucket.reduce(
			(acc, c) => ({
				r: acc.r + c.r,
				g: acc.g + c.g,
				b: acc.b + c.b,
			}),
			{ r: 0, g: 0, b: 0 },
		);
		return {
			r: Math.round(sum.r / bucket.length),
			g: Math.round(sum.g / bucket.length),
			b: Math.round(sum.b / bucket.length),
		};
	});
};

/**
 * バケット内の色チャンネルの範囲を計算する。
 */
const getRange = (colors: RGB[], channel: "r" | "g" | "b"): number => {
	let min = 255;
	let max = 0;
	for (const c of colors) {
		if (c[channel] < min) min = c[channel];
		if (c[channel] > max) max = c[channel];
	}
	return max - min;
};

/**
 * ImageData から重複しない色を抽出する。
 * @param imageData - 色を抽出する対象の ImageData
 * @param maxColors - 返す色数の上限（デフォルト: 上限なし）
 * @returns 抽出した色の配列と重複しない色の総数を含むオブジェクト
 */
export const extractColorsFromImage = (
	imageData: ImageData,
	maxColors?: number,
): { colors: RGB[]; totalColors: number } => {
	const colors: RGB[] = [];
	const seen = new Set<string>();
	const data = imageData.data;

	// 重複しないすべての色を抽出する
	for (let i = 0; i < data.length; i += 4) {
		// 透明ピクセルを飛ばす（アルファ < 128）
		if (data[i + 3] < 128) continue;

		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const key = `${r},${g},${b}`;

		if (!seen.has(key)) {
			seen.add(key);
			colors.push({ r, g, b });
		}
	}

	const totalColors = colors.length;

	// maxColors が指定され、色数が上限を超える場合は、
	// 中央値分割法で代表色を選択する
	if (maxColors !== undefined && colors.length > maxColors) {
		const selected = medianCut(colors, maxColors);
		// 表示を一貫させるため、選択した色を輝度順に並べる
		const sorted = sortPalette(selected);
		return {
			colors: sorted,
			totalColors,
		};
	}

	return { colors, totalColors };
};
