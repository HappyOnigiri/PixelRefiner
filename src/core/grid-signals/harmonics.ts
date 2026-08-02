type HarmonicAxisCandidate = {
	cell: number;
	score: number;
};

export type HarmonicPair = {
	x: HarmonicAxisCandidate;
	y: HarmonicAxisCandidate;
	score: number;
	reconstruction: number;
	harmonicPenalty: boolean;
};

export const applyHarmonicPenalties = (pairs: HarmonicPair[]): void => {
	for (let index = 0; index < pairs.length; index += 1) {
		const pair = pairs[index];
		if (pair.harmonicPenalty) {
			pair.score += 14;
			continue;
		}
		for (let otherIndex = 0; otherIndex < pairs.length; otherIndex += 1) {
			if (index === otherIndex) continue;
			const smaller = pairs[otherIndex];
			const factorX = Math.round(pair.x.cell / smaller.x.cell);
			const factorY = Math.round(pair.y.cell / smaller.y.cell);
			if (
				(factorX === 1 && factorY === 1) ||
				factorX < 1 ||
				factorX > 3 ||
				factorY < 1 ||
				factorY > 3 ||
				Math.abs(pair.x.cell - Math.round(pair.x.cell)) > 0.001 ||
				Math.abs(pair.y.cell - Math.round(pair.y.cell)) > 0.001 ||
				Math.abs(smaller.x.cell - Math.round(smaller.x.cell)) > 0.001 ||
				Math.abs(smaller.y.cell - Math.round(smaller.y.cell)) > 0.001 ||
				Math.abs(pair.x.cell / smaller.x.cell - factorX) > 0.02 ||
				Math.abs(pair.y.cell / smaller.y.cell - factorY) > 0.02
			)
				continue;
			if (
				smaller.reconstruction <= pair.reconstruction + 0.02 &&
				smaller.x.score >= pair.x.score * 0.9 &&
				smaller.y.score >= pair.y.score * 0.9
			) {
				// [Intended] 再構成品質が同等な倍周期は、基礎周期を残すため明示的に減点する。
				pair.harmonicPenalty = true;
				pair.score += 14;
				break;
			}
		}
	}
};
