import { describe, expect, it } from "vitest";
import { IMAGE_SIZE_CLASS, IMAGE_SIZE_MISMATCH_CLASS } from "./images";
import { DETAIL_REPORT_STYLES, INDEX_REPORT_STYLES } from "./styles";

describe("quality report image styles", () => {
	it("constrains images before their load handler sets dimensions", () => {
		for (const styles of [INDEX_REPORT_STYLES, DETAIL_REPORT_STYLES]) {
			expect(styles).toMatch(
				/\.image-stage img \{[^}]*max-width: 100%;[^}]*max-height: 100%;/,
			);
		}
	});

	// [Intended] 実寸とその警告色は一覧と詳細へ同じ規則を複製している。マークアップは
	// class を出し続けるので、片方の規則だけ欠けても HTML の目視では気付けない。
	it("styles the image size and its mismatch highlight in both views", () => {
		for (const styles of [INDEX_REPORT_STYLES, DETAIL_REPORT_STYLES]) {
			expect(styles).toContain(`.${IMAGE_SIZE_CLASS} {`);
			expect(styles).toContain(
				`.${IMAGE_SIZE_CLASS}.${IMAGE_SIZE_MISMATCH_CLASS} {`,
			);
		}
	});

	// [Intended] 劣化パターンのタグはケース詳細にしか出ない。一覧側へ残しても
	// 参照されないまま、一覧にもタグがあるように読めてしまう。
	it("keeps the tag style only where tags are rendered", () => {
		expect(DETAIL_REPORT_STYLES).toContain(".badge, .tag {");
		expect(INDEX_REPORT_STYLES).not.toContain(".tag");
	});
});
