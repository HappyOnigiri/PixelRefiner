import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKER_PATH = fileURLToPath(
	new URL("./check_file_line_count.py", import.meta.url),
);

interface CheckerResult {
	status: number | null;
	stdout: string;
}

function runChecker(
	files: Readonly<Record<string, number | string>>,
	githubActions = false,
): CheckerResult {
	const repository = mkdtempSync(join(tmpdir(), "file-line-count-test-"));
	try {
		execFileSync("git", ["init", "--quiet"], { cwd: repository });
		for (const [name, contents] of Object.entries(files)) {
			const path = join(repository, name);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(
				path,
				typeof contents === "number" ? "line\n".repeat(contents) : contents,
			);
		}

		const result = spawnSync("python3", [CHECKER_PATH], {
			cwd: repository,
			encoding: "utf8",
			env: {
				...process.env,
				GITHUB_ACTIONS: githubActions ? "true" : "false",
			},
		});
		return { status: result.status, stdout: result.stdout };
	} finally {
		rmSync(repository, { recursive: true, force: true });
	}
}

describe("check_file_line_count.py", () => {
	it("warns only above 600 lines and succeeds", () => {
		const result = runChecker({ "at-limit.ts": 600, "warning.ts": 601 });

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("at-limit.ts has");
		expect(result.stdout).toContain("WARNING: warning.ts has 601 lines");
		expect(result.stdout).toContain("Files above 1000 lines fail CI.");
		expect(result.stdout).toContain("Extract cohesive features");
	});

	it("fails only above 1000 lines", () => {
		const result = runChecker({ "at-hard-limit.ts": 1000, "error.ts": 1001 });

		expect(result.status).toBe(1);
		expect(result.stdout).toContain("WARNING: at-hard-limit.ts has 1000 lines");
		expect(result.stdout).not.toContain("ERROR: at-hard-limit.ts");
		expect(result.stdout).toContain("ERROR: error.ts has 1001 lines");
		expect(result.stdout).toContain("aim for 600 lines or fewer");
	});

	it("emits GitHub Actions annotations", () => {
		const result = runChecker({ "warning.ts": 601 }, true);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"::warning file=warning.ts,line=1,title=File line count::",
		);
	});

	it("excludes policy-approved TypeScript files", () => {
		const result = runChecker({ "src/browser/i18n.ts": 1001 });

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("i18n.ts has");
		expect(result.stdout).toContain(
			"0 warning(s), 0 line-count error(s), 0 read error(s)",
		);
	});

	it("ignores excluded and non-TypeScript files on the zero-violation path", () => {
		const result = runChecker({
			".gitignore": "ignored/\n",
			"ignored/large.ts": 1001,
			"notes.txt": 1001,
			"small.ts": 10,
		});

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("large.ts");
		expect(result.stdout).not.toContain("notes.txt");
		expect(result.stdout).toContain("Checked 1 TypeScript files");
	});
});
