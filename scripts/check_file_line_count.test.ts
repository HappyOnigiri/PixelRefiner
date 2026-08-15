import { execFileSync, spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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
	stderr: string;
}

type TestFileContents = number | string | Uint8Array;

interface CheckerOptions {
	githubActions?: boolean;
	allWarnings?: boolean;
	diffBase?: string;
	prepare?: (repository: string) => void;
}

function git(repository: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd: repository,
		encoding: "utf8",
	}).trim();
}

function commit(repository: string, message: string): string {
	git(repository, ["add", "--all"]);
	git(repository, ["commit", "--quiet", "-m", message]);
	return git(repository, ["rev-parse", "HEAD"]);
}

function setVsCodeMergeBase(repository: string, base: string): void {
	const branch = git(repository, ["branch", "--show-current"]);
	git(repository, ["config", `branch.${branch}.vscode-merge-base`, base]);
}

function setPullRequestBase(repository: string, base: string): void {
	writeFileSync(join(repository, ".test-bin", "gh-base"), `${base}\n`);
}

function runChecker(
	files: Readonly<Record<string, TestFileContents>>,
	options: CheckerOptions = {},
): CheckerResult {
	const repository = mkdtempSync(join(tmpdir(), "file-line-count-test-"));
	try {
		execFileSync("git", ["init", "--quiet"], { cwd: repository });
		git(repository, ["config", "user.name", "File line count test"]);
		git(repository, ["config", "user.email", "file-line-count@example.test"]);
		git(repository, ["config", "commit.gpgsign", "false"]);
		const testBin = join(repository, ".test-bin");
		const fakeGh = join(testBin, "gh");
		mkdirSync(testBin);
		writeFileSync(
			fakeGh,
			'#!/bin/sh\n[ -f "$0-base" ] || exit 1\nexec sed -n "1p" "$0-base"\n',
		);
		chmodSync(fakeGh, 0o755);
		for (const [name, contents] of Object.entries(files)) {
			const path = join(repository, name);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(
				path,
				typeof contents === "number" ? "line\n".repeat(contents) : contents,
			);
		}
		options.prepare?.(repository);

		const args = [CHECKER_PATH];
		if (options.allWarnings) {
			args.push("--all-warnings");
		}
		const result = spawnSync("python3", args, {
			cwd: repository,
			encoding: "utf8",
			env: {
				...process.env,
				GITHUB_ACTIONS: options.githubActions ? "true" : "false",
				PATH: `${testBin}:${process.env.PATH ?? ""}`,
				PIXEL_REFINER_DIFF_BASE: options.diffBase ?? "",
			},
		});
		return {
			status: result.status,
			stdout: result.stdout,
			stderr: result.stderr,
		};
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
		const result = runChecker({ "warning.ts": 601 }, { githubActions: true });

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"::warning file=warning.ts,line=1,title=File line count::",
		);
	});

	it("excludes policy-approved TypeScript files from warning and hard limits", () => {
		const warningResult = runChecker(
			{ "src/browser/i18n/messages/guide.ts": 601 },
			{ allWarnings: true },
		);
		const hardResult = runChecker({
			"src/browser/i18n/messages/guide.ts": 1001,
		});

		expect(warningResult.status).toBe(0);
		expect(warningResult.stdout).not.toContain("guide.ts has");
		expect(hardResult.status).toBe(0);
		expect(hardResult.stdout).not.toContain("guide.ts has");
		expect(hardResult.stdout).toContain(
			"0 warning(s), 0 line-count error(s), 0 read error(s)",
		);
	});

	it("rejects unsupported arguments", () => {
		const result = spawnSync("python3", [CHECKER_PATH, "--unknown"], {
			encoding: "utf8",
		});

		expect(result.status).toBe(2);
		expect(result.stderr).toContain(
			"Usage: check_file_line_count.py [--all-warnings]",
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

	it("warns only changed warning-range files, including reduced files", () => {
		const result = runChecker(
			{
				"unchanged.ts": 650,
				"reduced.ts": 700,
				"increased.ts": 600,
			},
			{
				prepare(repository) {
					const base = commit(repository, "base");
					setVsCodeMergeBase(repository, base);
					writeFileSync(join(repository, "reduced.ts"), "line\n".repeat(601));
					writeFileSync(join(repository, "increased.ts"), "line\n".repeat(601));
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("unchanged.ts has");
		expect(result.stdout).toContain("WARNING: reduced.ts has 601 lines");
		expect(result.stdout).toContain("WARNING: increased.ts has 601 lines");
		expect(result.stdout).toContain("Warning scope: changed TypeScript files");
	});

	it("fails for an unchanged hard-limit violation", () => {
		const result = runChecker(
			{
				"unchanged-warning.ts": 601,
				"unchanged-hard.ts": 1001,
			},
			{
				prepare(repository) {
					const base = commit(repository, "base");
					setVsCodeMergeBase(repository, base);
				},
			},
		);

		expect(result.status).toBe(1);
		expect(result.stdout).not.toContain("WARNING: unchanged-warning.ts");
		expect(result.stdout).toContain("ERROR: unchanged-hard.ts has 1001 lines");
	});

	it("includes committed, staged, unstaged, and untracked changes", () => {
		const result = runChecker(
			{
				"unchanged.ts": 601,
				"committed.ts": 600,
				"staged.ts": 600,
				"unstaged.ts": 600,
			},
			{
				prepare(repository) {
					const base = commit(repository, "base");
					setVsCodeMergeBase(repository, base);
					writeFileSync(join(repository, "committed.ts"), "line\n".repeat(601));
					git(repository, ["add", "committed.ts"]);
					git(repository, [
						"commit",
						"--quiet",
						"--only",
						"-m",
						"committed change",
						"committed.ts",
					]);
					writeFileSync(join(repository, "staged.ts"), "line\n".repeat(601));
					git(repository, ["add", "staged.ts"]);
					writeFileSync(join(repository, "unstaged.ts"), "line\n".repeat(601));
					writeFileSync(join(repository, "untracked.ts"), "line\n".repeat(601));
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("unchanged.ts has");
		for (const name of [
			"committed.ts",
			"staged.ts",
			"unstaged.ts",
			"untracked.ts",
		]) {
			expect(result.stdout).toContain(`WARNING: ${name} has 601 lines`);
		}
	});

	it("warns unchanged files in the all-warning audit mode", () => {
		const result = runChecker(
			{ "unchanged.ts": 601 },
			{
				allWarnings: true,
				prepare(repository) {
					const base = commit(repository, "base");
					setVsCodeMergeBase(repository, base);
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: unchanged.ts has 601 lines");
		expect(result.stdout).toContain(
			"Warning scope: all TypeScript files (601-1000 lines; --all-warnings)",
		);
	});

	it("fails for hard-limit violations in the all-warning audit mode", () => {
		const result = runChecker({ "error.ts": 1001 }, { allWarnings: true });

		expect(result.status).toBe(1);
		expect(result.stdout).toContain("ERROR: error.ts has 1001 lines");
	});

	it("prioritizes PIXEL_REFINER_DIFF_BASE over branch configuration", () => {
		const result = runChecker(
			{ "changed.ts": 600 },
			{
				diffBase: "env-base",
				prepare(repository) {
					commit(repository, "base");
					git(repository, ["tag", "env-base"]);
					writeFileSync(join(repository, "changed.ts"), "line\n".repeat(601));
					const current = commit(repository, "changed branch");
					setVsCodeMergeBase(repository, current);
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: changed.ts has 601 lines");
		expect(result.stdout).toContain("source: PIXEL_REFINER_DIFF_BASE=env-base");
	});

	it("treats all files as changed when the configured environment base is invalid", () => {
		const result = runChecker(
			{ "unchanged.ts": 601 },
			{
				diffBase: "missing-ci-base",
				prepare(repository) {
					const base = commit(repository, "base");
					setVsCodeMergeBase(repository, base);
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: unchanged.ts has 601 lines");
		expect(result.stdout).toContain(
			"fallback: all TypeScript files treated as changed",
		);
	});

	it("uses the recorded parent branch for stacked changes", () => {
		const result = runChecker(
			{
				"feature-a.ts": 600,
				"feature-b.ts": 600,
				"current.ts": 600,
			},
			{
				prepare(repository) {
					commit(repository, "main");
					git(repository, ["branch", "-M", "main"]);
					git(repository, ["checkout", "--quiet", "-b", "feature/a"]);
					writeFileSync(join(repository, "feature-a.ts"), "line\n".repeat(601));
					commit(repository, "feature a");
					git(repository, ["checkout", "--quiet", "-b", "feature/b"]);
					writeFileSync(join(repository, "feature-b.ts"), "line\n".repeat(601));
					commit(repository, "feature b");
					git(repository, ["checkout", "--quiet", "-b", "feature/current"]);
					setVsCodeMergeBase(repository, "origin/feature/b");
					git(repository, [
						"update-ref",
						"refs/remotes/origin/feature/b",
						"feature/b",
					]);
					writeFileSync(join(repository, "current.ts"), "line\n".repeat(601));
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).not.toContain("feature-a.ts has");
		expect(result.stdout).not.toContain("feature-b.ts has");
		expect(result.stdout).toContain("WARNING: current.ts has 601 lines");
		expect(result.stdout).toContain(
			"source: branch.feature/current.vscode-merge-base=origin/feature/b",
		);
	});

	it("uses the pull request base before the VS Code merge base", () => {
		const result = runChecker(
			{ "changed.ts": 600 },
			{
				prepare(repository) {
					const base = commit(repository, "base");
					setPullRequestBase(repository, base);
					writeFileSync(join(repository, "changed.ts"), "line\n".repeat(601));
					const current = commit(repository, "changed branch");
					setVsCodeMergeBase(repository, current);
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: changed.ts has 601 lines");
		expect(result.stdout).toContain("source: gh pr baseRefOid=");
	});

	it("treats all files as changed when the PR base is missing locally", () => {
		const result = runChecker(
			{ "unchanged.ts": 601 },
			{
				prepare(repository) {
					const current = commit(repository, "base");
					setPullRequestBase(repository, "a".repeat(40));
					setVsCodeMergeBase(repository, current);
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: unchanged.ts has 601 lines");
		expect(result.stdout).toContain(
			"fallback: all TypeScript files treated as changed",
		);
	});

	it("uses origin/main when branch-specific bases are unavailable", () => {
		const result = runChecker(
			{ "changed.ts": 600 },
			{
				prepare(repository) {
					const base = commit(repository, "base");
					git(repository, ["branch", "-M", "feature"]);
					git(repository, ["update-ref", "refs/remotes/origin/main", base]);
					writeFileSync(join(repository, "changed.ts"), "line\n".repeat(601));
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: changed.ts has 601 lines");
		expect(result.stdout).toContain("source: origin/main");
	});

	it("uses main when origin/main is unavailable", () => {
		const result = runChecker(
			{ "changed.ts": 600 },
			{
				prepare(repository) {
					const base = commit(repository, "base");
					git(repository, ["branch", "-M", "feature"]);
					git(repository, ["update-ref", "refs/heads/main", base]);
					writeFileSync(join(repository, "changed.ts"), "line\n".repeat(601));
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: changed.ts has 601 lines");
		expect(result.stdout).toContain("source: main");
	});

	it("treats all files as changed when no comparison base resolves", () => {
		const result = runChecker(
			{ "unchanged.ts": 601 },
			{
				prepare(repository) {
					commit(repository, "base");
					git(repository, ["branch", "-M", "feature"]);
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: unchanged.ts has 601 lines");
		expect(result.stdout).toContain(
			"fallback: all TypeScript files treated as changed",
		);
	});

	it("handles rename and deletion without checking deleted paths", () => {
		const result = runChecker(
			{
				"old.ts": 601,
				"deleted.ts": 1001,
			},
			{
				prepare(repository) {
					const base = commit(repository, "base");
					setVsCodeMergeBase(repository, base);
					git(repository, ["mv", "old.ts", "renamed.ts"]);
					git(repository, ["rm", "--quiet", "deleted.ts"]);
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("WARNING: renamed.ts has 601 lines");
		expect(result.stdout).not.toContain("deleted.ts");
	});

	it("reports read errors as failures", () => {
		const result = runChecker({
			"invalid-utf8.ts": new Uint8Array([0xff, 0x0a]),
		});

		expect(result.status).toBe(1);
		expect(result.stdout).toContain("1 read error(s)");
		expect(result.stderr).toContain("File read errors:");
		expect(result.stderr).toContain("invalid-utf8.ts");
	});
});
