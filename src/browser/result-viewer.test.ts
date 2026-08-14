import { describe, expect, it } from "vitest";
import { ResultViewer } from "./result-viewer";

const createViewer = () => {
	const attributes = new Map<string, string>();
	const dataset: Record<string, string> = {};
	const indicator = {
		hidden: true,
		dataset,
		setAttribute: (name: string, value: string) => {
			attributes.set(name, value);
			if (name === "data-tooltip") dataset.tooltip = value;
		},
		removeAttribute: (name: string) => {
			attributes.delete(name);
			if (name === "data-tooltip") delete dataset.tooltip;
		},
	} as unknown as HTMLElement;
	const viewer = Object.create(ResultViewer.prototype) as ResultViewer;
	Object.assign(viewer, { warningIndicator: indicator });
	return { attributes, indicator, viewer };
};

describe("ResultViewer.updateWarnings", () => {
	it("警告をアイコンのツールチップとアクセシブル名に表示する", () => {
		const { attributes, indicator, viewer } = createViewer();

		viewer.updateWarnings(["信頼度が低いです。", "結果を確認してください。"]);

		expect(indicator.hidden).toBe(false);
		expect(indicator.dataset.tooltip).toBe(
			"信頼度が低いです。\n結果を確認してください。",
		);
		expect(attributes.get("aria-label")).toBe(
			"信頼度が低いです。\n結果を確認してください。",
		);
	});

	it("再処理開始時は前回の警告を非表示にする", () => {
		const { attributes, indicator, viewer } = createViewer();
		viewer.updateWarnings(["前回の警告"]);

		viewer.updateWarnings([]);

		expect(indicator.hidden).toBe(true);
		expect(indicator.dataset.tooltip).toBeUndefined();
		expect(attributes.has("aria-label")).toBe(false);
	});
});
