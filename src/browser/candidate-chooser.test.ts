import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidatePreview } from "../shared/types";
import { CandidateChooser } from "./candidate-chooser";
import { i18n } from "./i18n";

class FakeElement {
	private rawText = "";
	private readonly selectorResults = new Map<string, FakeElement>();
	public hidden = false;
	public type = "";
	public className = "";
	public width = 0;
	public height = 0;
	public readonly dataset: Record<string, string> = {};
	public readonly attributes: Record<string, string> = {};
	public readonly children: FakeElement[] = [];
	public readonly classList: {
		toggle: (name: string, force: boolean) => void;
		contains: (name: string) => boolean;
	};

	constructor(public readonly tagName: string) {
		const names = new Set<string>();
		this.classList = {
			toggle: (name, force) => {
				if (force) names.add(name);
				else names.delete(name);
			},
			contains: (name) => names.has(name),
		};
	}

	public get textContent(): string {
		return (
			this.rawText + this.children.map((child) => child.textContent).join("")
		);
	}

	public set textContent(value: string | null) {
		this.rawText = value ?? "";
		this.children.length = 0;
	}

	public setSelectorResult(selector: string, element: FakeElement): void {
		this.selectorResults.set(selector, element);
	}

	public querySelector(selector: string): FakeElement | null {
		return this.selectorResults.get(selector) ?? null;
	}

	public querySelectorAll(selector: string): FakeElement[] {
		if (selector.startsWith("button")) {
			return this.children.filter((child) => child.tagName === "button");
		}
		return [];
	}

	public setAttribute(name: string, value: string): void {
		this.attributes[name] = value;
	}

	public appendChild(child: FakeElement): FakeElement {
		this.children.push(child);
		return child;
	}

	public append(...children: FakeElement[]): void {
		this.children.push(...children);
	}

	public replaceChildren(...children: FakeElement[]): void {
		this.children.length = 0;
		this.children.push(...children);
	}

	public addEventListener(
		_type: string,
		_listener: (...args: unknown[]) => unknown,
	): void {
		// テストではイベントの配線そのものは検証しない。
	}

	public getContext(_type: string): { putImageData: () => void } {
		return { putImageData: () => undefined };
	}
}

const candidate: CandidatePreview = {
	id: "preserve",
	kind: "preserve",
	recommended: true,
	processingMode: "preserve",
	preview: {
		width: 1,
		height: 1,
		data: new Uint8ClampedArray([0, 0, 0, 255]),
	},
	resultWidth: 1,
	resultHeight: 1,
	colorCount: 2,
};

const createChooser = () => {
	const section = new FakeElement("section");
	const list = new FakeElement("div");
	const reasons = new FakeElement("p");
	section.setSelectorResult(".js-candidate-list", list);
	section.setSelectorResult(".js-candidate-reasons", reasons);
	return {
		chooser: new CandidateChooser(section as unknown as HTMLElement),
		list,
		reasons,
	};
};

beforeEach(() => {
	vi.stubGlobal("document", {
		documentElement: { lang: "" },
		createElement: (tag: string) => new FakeElement(tag),
		querySelectorAll: () => [],
	});
	vi.stubGlobal(
		"ImageData",
		class {
			constructor(
				public readonly data: Uint8ClampedArray,
				public readonly width: number,
				public readonly height: number,
			) {}
		},
	);
	i18n.currentLang = "en";
});

afterEach(() => {
	vi.unstubAllGlobals();
	i18n.currentLang = "en";
});

describe("CandidateChooser", () => {
	it("言語切替後に候補の文言と警告理由を再描画する", () => {
		const { chooser, list, reasons } = createChooser();
		chooser.show([candidate], ["LOW_GRID_CONFIDENCE"], "image-1");
		chooser.setSelected(candidate.id);

		i18n.setLanguage("ja");
		chooser.updateLanguage();

		const details = list.children[0].children[1];
		expect(details.children[0].textContent).toContain("原寸維持");
		expect(details.children[0].textContent).toContain("おすすめ");
		expect(details.children[1].textContent).toBe("1 × 1 px・2色");
		expect(details.children[2].textContent).toBe(
			"縮小せず、安全に元の解像度を維持します。",
		);
		expect(reasons.textContent).toBe(
			"グリッド判定の信頼度が低いため、結果を確認してください。",
		);
		expect(list.children[0].classList.contains("is-selected")).toBe(true);
	});
});
