import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RUN_CI_PATH = fileURLToPath(new URL("./run_ci.py", import.meta.url));
const CHECK_TASKS = [
	"build",
	"check-file-line-count",
	"check-ts-line-length",
	"check-ts-rules",
	"html-check-diff",
	"test-unit",
	"ts-check-diff",
	"type-check",
];

interface RunCiResult {
	status: number | null;
	stdout: string;
	tasks: string[];
}

function runCi(failingTask?: string): RunCiResult {
	const directory = mkdtempSync(join(tmpdir(), "run-ci-test-"));
	try {
		const binDirectory = join(directory, "bin");
		const makeLog = join(directory, "make.log");
		const fakeMake = join(binDirectory, "make");
		mkdirSync(binDirectory);
		writeFileSync(
			fakeMake,
			'#!/bin/sh\nprintf "%s\\n" "$1" >> "$MAKE_LOG"\n[ "$1" != "$FAIL_TASK" ]\n',
		);
		chmodSync(fakeMake, 0o755);

		const result = spawnSync("python3", [RUN_CI_PATH], {
			encoding: "utf8",
			env: {
				...process.env,
				FAIL_TASK: failingTask ?? "",
				MAKE_LOG: makeLog,
				PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
			},
		});
		const tasks = readFileSync(makeLog, "utf8").trim().split("\n").sort();
		return { status: result.status, stdout: result.stdout, tasks };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

describe("run_ci.py", () => {
	it("runs every read-only check and the production build", () => {
		const result = runCi();

		expect(result.status).toBe(0);
		expect(result.tasks).toEqual(CHECK_TASKS);
		expect(result.tasks).not.toContain("ts-fix-diff");
		expect(result.tasks).not.toContain("html-fix-diff");
		expect(result.stdout).toContain("[DONE] All CI tasks passed!");
	});

	it("fails the CI process when any check fails", () => {
		const result = runCi("type-check");

		expect(result.status).toBe(1);
		expect(result.tasks).toEqual(CHECK_TASKS);
		expect(result.stdout).toContain("❌ Type Check");
		expect(result.stdout).toContain("Check phase failed.");
	});
});
