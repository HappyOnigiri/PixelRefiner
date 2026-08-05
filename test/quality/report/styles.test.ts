import { describe, expect, it } from "vitest";
import { DETAIL_REPORT_STYLES, INDEX_REPORT_STYLES } from "./styles";

describe("quality report image styles", () => {
	it("constrains images before their load handler sets dimensions", () => {
		for (const styles of [INDEX_REPORT_STYLES, DETAIL_REPORT_STYLES]) {
			expect(styles).toMatch(
				/\.image-stage img \{[^}]*max-width: 100%;[^}]*max-height: 100%;/,
			);
		}
	});
});
