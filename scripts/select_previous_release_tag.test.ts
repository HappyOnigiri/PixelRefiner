import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = fileURLToPath(
	new URL("./select_previous_release_tag.py", import.meta.url),
);

const selectPreviousReleaseTag = (tags: string[]): string => {
	const result = spawnSync("python3", [SCRIPT_PATH], {
		encoding: "utf8",
		input: tags.join("\n"),
	});
	expect(result.stderr).toBe("");
	expect(result.status).toBe(0);
	return result.stdout.trim();
};

describe("select_previous_release_tag", () => {
	it("selects the last patch of the previous minor series", () => {
		expect(
			selectPreviousReleaseTag([
				"v1.0.0",
				"v1.1.0",
				"v1.1.2",
				"v1.1.1",
				"v1.2.0",
			]),
		).toBe("v1.1.2");
	});

	it("skips every tag of the latest series", () => {
		expect(
			selectPreviousReleaseTag(["v1.1.0", "v1.2.0", "v1.2.1", "v1.2.3"]),
		).toBe("v1.1.0");
	});

	it("crosses a major boundary when no earlier minor exists", () => {
		expect(selectPreviousReleaseTag(["v0.11.1", "v1.0.0"])).toBe("v0.11.1");
	});

	it("ignores tags that are not plain releases", () => {
		expect(
			selectPreviousReleaseTag([
				"v1.1.0",
				"v1.2.0-rc.1",
				"nightly",
				"",
				"v1.2.0",
			]),
		).toBe("v1.1.0");
	});

	it("outputs nothing when only the latest series exists", () => {
		expect(selectPreviousReleaseTag(["v1.2.0", "v1.2.1"])).toBe("");
	});

	it("outputs nothing when no tag exists", () => {
		expect(selectPreviousReleaseTag([])).toBe("");
	});

	it("compares versions numerically instead of lexicographically", () => {
		expect(
			selectPreviousReleaseTag(["v1.9.0", "v1.10.0", "v2.0.0", "v1.10.1"]),
		).toBe("v1.10.1");
	});
});
