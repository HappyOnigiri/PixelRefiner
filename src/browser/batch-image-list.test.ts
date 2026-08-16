import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProcessingAnalysis } from "../shared/types";
import { renderBatchImageList } from "./batch-image-list";
import { i18n } from "./i18n";
import type { ImageItem } from "./session";

type FakeEvent = { stopPropagation: () => void };
type FakeListener = (event: FakeEvent) => void;

// [Policy] このリポジトリのテストは DOM 環境を持たないため、
// 一覧の描画が使う要素の振る舞いだけを自前で用意する。
class FakeElement {
	public className = "";
	public title = "";
	public src = "";
	public textContent = "";
	public readonly dataset: Record<string, string> = {};
	public readonly attributes: Record<string, string> = {};
	public readonly children: FakeElement[] = [];
	private readonly listeners = new Map<string, FakeListener[]>();

	constructor(public readonly tagName: string) {}

	public set innerHTML(_value: string) {
		this.children.length = 0;
	}

	public setAttribute(name: string, value: string): void {
		this.attributes[name] = value;
	}

	public appendChild(child: FakeElement): FakeElement {
		this.children.push(child);
		return child;
	}

	public addEventListener(type: string, listener: FakeListener): void {
		const registered = this.listeners.get(type) ?? [];
		registered.push(listener);
		this.listeners.set(type, registered);
	}

	public dispatchClick(): { propagationStopped: boolean } {
		let propagationStopped = false;
		const event: FakeEvent = {
			stopPropagation: () => {
				propagationStopped = true;
			},
		};
		const registered = this.listeners.get("click") ?? [];
		for (let index = 0; index < registered.length; index += 1) {
			registered[index](event);
		}
		return { propagationStopped };
	}
}

const originalDocument = Object.getOwnPropertyDescriptor(
	globalThis,
	"document",
);

beforeAll(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		writable: true,
		value: { createElement: (tag: string) => new FakeElement(tag) },
	});
});

afterAll(() => {
	if (originalDocument) {
		Object.defineProperty(globalThis, "document", originalDocument);
		return;
	}
	Reflect.deleteProperty(globalThis, "document");
});

const analysis: ProcessingAnalysis = {
	classification: "scaled-pixel",
	classificationConfidence: 0.77,
	route: "refine",
	confidence: 0.77,
	warnings: ["LOW_GRID_CONFIDENCE"],
	gridCandidates: [],
};

const createImage = (overrides: Partial<ImageItem> = {}): ImageItem => ({
	id: "image-1",
	file: new File([], "sample.png"),
	original: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
	thumbnail: "data:image/png;base64,",
	status: "done",
	...overrides,
});

const render = (images: readonly ImageItem[], activeId?: string) => {
	const container = new FakeElement("div");
	const selected: string[] = [];
	const removed: string[] = [];
	renderBatchImageList({
		container: container as unknown as HTMLElement,
		images,
		activeId,
		onSelect: (id) => selected.push(id),
		onRemove: (id) => removed.push(id),
	});
	return { container, selected, removed };
};

describe("renderBatchImageList", () => {
	it("判定方式と信頼度のラベルを描画しない", () => {
		const { container } = render([createImage({ analysis })]);

		const item = container.children[0];
		const classNames = item.children.map((child) => child.className);
		expect(classNames).not.toContain("image-item-diagnostic");
		expect(item.children.some((child) => child.textContent.includes("%"))).toBe(
			false,
		);
		expect(item.title).toBe(`sample.png\n${i18n.t("batch.status.done")}`);
		expect(item.attributes["aria-label"]).toBe(item.title);
	});

	it("要確認の画像でも枠の装飾用クラスを付けない", () => {
		const { container } = render([createImage({ analysis })], "image-1");

		expect(container.children[0].className).toBe("image-item active");
		expect(container.children[0].dataset.status).toBe("done");
	});

	it("失敗した画像の理由を title と aria-label に残す", () => {
		const { container } = render([
			createImage({ status: "error", error: "decode failed" }),
		]);

		const item = container.children[0];
		expect(item.title).toBe(
			`sample.png\n${i18n.t("batch.status.error")}\ndecode failed`,
		);
		expect(item.attributes["aria-label"]).toBe(item.title);
	});

	it("選択と削除のコールバックを呼び、削除では選択へ伝播させない", () => {
		const { container, selected, removed } = render([createImage()]);

		const item = container.children[0];
		const removeButton = item.children[item.children.length - 1];
		const result = removeButton.dispatchClick();
		expect(removed).toEqual(["image-1"]);
		expect(result.propagationStopped).toBe(true);

		item.dispatchClick();
		expect(selected).toEqual(["image-1"]);
	});
});
