#!/usr/bin/env python3
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

WARNING_LINE_LIMIT = 600
HARD_LINE_LIMIT = 1000

# [Policy] 翻訳リソースはすべてのロケールをまとめて保持し、キーの追加と
# 翻訳変更を同期した一単位としてレビューできるようにする。
EXCLUDED_FILES = {Path("src/browser/i18n.ts")}


@dataclass(frozen=True)
class Violation:
    path: Path
    line_count: int
    severity: str


@dataclass(frozen=True)
class DiffBase:
    commit: str | None
    detail: str


def run_git(args: Sequence[str]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def parse_git_paths(output: bytes) -> set[Path]:
    return {
        Path(os.fsdecode(raw_path))
        for raw_path in output.split(b"\0")
        if raw_path
    }


def list_git_paths(args: Sequence[str]) -> set[Path]:
    result = run_git(args)
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode,
            ["git", *args],
            output=result.stdout,
            stderr=result.stderr,
        )
    return parse_git_paths(result.stdout)


def find_typescript_files() -> list[Path]:
    paths = list_git_paths(
        [
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            "*.ts",
            "*.tsx",
        ],
    )
    return sorted(
        path for path in paths if path not in EXCLUDED_FILES and path.is_file()
    )


def find_nonignored_untracked_files() -> set[Path]:
    return list_git_paths(
        [
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            "*.ts",
            "*.tsx",
        ],
    )


def resolve_commit(candidate: str) -> str | None:
    value = candidate.strip()
    if not value:
        return None
    result = run_git(
        [
            "rev-parse",
            "--verify",
            "--quiet",
            "--end-of-options",
            f"{value}^{{commit}}",
        ],
    )
    if result.returncode != 0:
        return None
    if b"ambiguous" in result.stderr.lower():
        return None
    lines = result.stdout.decode("utf-8", errors="replace").splitlines()
    if len(lines) != 1 or not lines[0]:
        return None
    return lines[0]


def resolve_merge_base(candidate: str) -> str | None:
    commit = resolve_commit(candidate)
    if commit is None:
        return None
    result = run_git(["merge-base", "HEAD", commit])
    if result.returncode != 0:
        return None
    lines = result.stdout.decode("utf-8", errors="replace").splitlines()
    if len(lines) != 1 or not lines[0]:
        return None
    return resolve_commit(lines[0])


def get_git_value(args: Sequence[str]) -> str | None:
    result = run_git(args)
    if result.returncode != 0:
        return None
    value = result.stdout.decode("utf-8", errors="replace").strip()
    return value or None


def current_branch() -> str | None:
    return get_git_value(["symbolic-ref", "--quiet", "--short", "HEAD"])


def resolve_diff_base() -> DiffBase:
    attempts: list[str] = []

    def success_detail(source: str, candidate: str | None) -> str:
        detail = f"source: {source}"
        if candidate is not None:
            detail += f"={candidate.strip()}"
        detail += "; merge-base succeeded"
        if attempts:
            detail += "; fallback after: " + " | ".join(attempts)
        return detail

    def try_candidate(source: str, candidate: str | None) -> str | None:
        if candidate is None:
            attempts.append(f"{source} is not configured")
            return None
        commit = resolve_merge_base(candidate)
        if commit is not None:
            return commit
        attempts.append(f"{source} could not resolve or merge-base failed")
        return None

    environment_base = os.environ.get("PIXEL_REFINER_DIFF_BASE")
    if environment_base is not None and environment_base.strip():
        commit = try_candidate(
            "PIXEL_REFINER_DIFF_BASE",
            environment_base,
        )
        if commit is not None:
            return DiffBase(
                commit,
                success_detail("PIXEL_REFINER_DIFF_BASE", environment_base),
            )
        # [Policy] CI が明示した比較元を解決できない場合、別の参照で対象を
        # 狭めると変更を見落としうるため、全ファイルを変更扱いにする。
        return DiffBase(
            None,
            "fallback: all TypeScript files treated as changed; "
            + " | ".join(attempts),
        )

    branch = current_branch()
    if branch is not None:
        base_ref = get_git_value(
            ["config", "--get", f"branch.{branch}.pixelRefinerBaseRef"],
        )
        commit = try_candidate(
            f"branch.{branch}.pixelRefinerBaseRef",
            base_ref,
        )
        if commit is not None:
            return DiffBase(
                commit,
                success_detail(
                    f"branch.{branch}.pixelRefinerBaseRef",
                    base_ref,
                ),
            )

        base_sha = get_git_value(
            ["config", "--get", f"branch.{branch}.pixelRefinerBaseSha"],
        )
        commit = try_candidate(
            f"branch.{branch}.pixelRefinerBaseSha",
            base_sha,
        )
        if commit is not None:
            return DiffBase(
                commit,
                success_detail(
                    f"branch.{branch}.pixelRefinerBaseSha",
                    base_sha,
                ),
            )
    else:
        attempts.append("current branch is unavailable")

    for fallback in ("origin/main", "main"):
        commit = try_candidate(fallback, fallback)
        if commit is not None:
            return DiffBase(
                commit,
                success_detail(fallback, None),
            )

    reason = "; ".join(attempts) if attempts else "no valid comparison base"
    return DiffBase(
        None,
        "fallback: all TypeScript files treated as changed; " + reason,
    )


def find_changed_files(base: DiffBase, all_paths: set[Path]) -> tuple[set[Path], str | None]:
    if base.commit is None:
        return set(all_paths), None

    result = run_git(
        [
            "diff",
            "--name-only",
            "-z",
            "--diff-filter=ACMRTUXB",
            base.commit,
            "--",
            "*.ts",
            "*.tsx",
        ],
    )
    if result.returncode != 0:
        return set(all_paths), "git diff failed; all TypeScript files treated as changed"

    try:
        untracked = find_nonignored_untracked_files()
    except subprocess.CalledProcessError:
        return (
            set(all_paths),
            "untracked file listing failed; all TypeScript files treated as changed",
        )

    changed = parse_git_paths(result.stdout)
    changed.update(untracked)
    return changed & all_paths, None


def count_lines(path: Path) -> int:
    with path.open(encoding="utf-8") as file:
        return sum(1 for _ in file)


def classify_file(path: Path, warning_enabled: bool) -> Violation | None:
    line_count = count_lines(path)
    if line_count > HARD_LINE_LIMIT:
        return Violation(path, line_count, "error")
    if warning_enabled and line_count > WARNING_LINE_LIMIT:
        return Violation(path, line_count, "warning")
    return None


def emit_violation(violation: Violation) -> None:
    message = (
        f"{violation.path} has {violation.line_count} lines "
        f"(warning above {WARNING_LINE_LIMIT}; hard limit {HARD_LINE_LIMIT})"
    )
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(
            f"::{violation.severity} file={violation.path},line=1,"
            f"title=File line count::{message}",
        )
    else:
        print(f"{violation.severity.upper()}: {message}")


def print_shared_guidance() -> None:
    print(
        "- Do not remove comments or code-golf small pieces merely to satisfy the "
        "line limit. Extract cohesive features into separate modules.",
    )


def print_warning_guidance() -> None:
    print(f"\nWarning guidance ({WARNING_LINE_LIMIT + 1}-{HARD_LINE_LIMIT} lines):")
    print(f"- Files above {HARD_LINE_LIMIT} lines fail CI.")
    print(
        "- Prefer splitting the file. You may defer it when the file is clearly "
        "limited to one feature or splitting is outside the current change scope.",
    )
    print(
        "- If functionality added by the current change can be isolated as one "
        "module, extract it whenever practical.",
    )
    print_shared_guidance()


def print_error_guidance() -> None:
    print(f"\nError guidance (more than {HARD_LINE_LIMIT} lines):")
    print(
        "- You must address this violation even when the refactoring extends beyond "
        "the original change scope.",
    )
    print(
        f"- Do not stop just below {HARD_LINE_LIMIT} lines. Split modules by feature "
        f"and aim for {WARNING_LINE_LIMIT} lines or fewer per file.",
    )
    print_shared_guidance()


def print_scopes(
    all_warnings: bool,
    base: DiffBase | None,
    changed_count: int | None,
    change_fallback: str | None,
) -> None:
    print(
        "Hard-limit scope: all TypeScript files "
        f"(>{HARD_LINE_LIMIT} lines and read errors)",
    )
    if all_warnings:
        print(
            "Warning scope: all TypeScript files "
            f"({WARNING_LINE_LIMIT + 1}-{HARD_LINE_LIMIT} lines; --all-warnings)",
        )
        return

    if base is None or base.commit is None:
        print("Warning scope: all TypeScript files (no valid comparison base)")
    elif change_fallback is not None:
        print("Warning scope: all TypeScript files (change detection fallback)")
    else:
        print(
            "Warning scope: changed TypeScript files "
            f"({WARNING_LINE_LIMIT + 1}-{HARD_LINE_LIMIT} lines; "
            f"{changed_count} changed file(s))",
        )
    if base is not None:
        detail = base.detail
        if change_fallback is not None:
            detail += f"; {change_fallback}"
        print(
            f"Diff base: {base.commit or 'unavailable'} ({detail})",
        )


def main(argv: Sequence[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    if list(argv) == ["--all-warnings"]:
        all_warnings = True
    elif list(argv):
        print("Usage: check_file_line_count.py [--all-warnings]", file=sys.stderr)
        return 2
    else:
        all_warnings = False

    violations = []
    read_errors = []

    try:
        paths = find_typescript_files()
    except subprocess.CalledProcessError as error:
        print(f"Failed to list TypeScript files: {error}", file=sys.stderr)
        return 1

    if all_warnings:
        base = None
        changed_paths = None
        change_fallback = None
    else:
        base = resolve_diff_base()
        changed_paths, change_fallback = find_changed_files(
            base,
            set(paths),
        )

    for path in paths:
        try:
            warning_enabled = all_warnings or path in changed_paths
            violation = classify_file(path, warning_enabled)
        except (OSError, UnicodeError) as error:
            read_errors.append(f"{path}: failed to read file: {error}")
            continue
        if violation is not None:
            violations.append(violation)

    if all_warnings:
        print_scopes(True, None, None, None)
    else:
        print_scopes(False, base, len(changed_paths), change_fallback)

    for violation in violations:
        emit_violation(violation)

    warnings = [item for item in violations if item.severity == "warning"]
    errors = [item for item in violations if item.severity == "error"]

    if warnings:
        print_warning_guidance()
    if errors:
        print_error_guidance()

    if read_errors:
        print("\nFile read errors:", file=sys.stderr)
        print("\n".join(read_errors), file=sys.stderr)

    print(
        f"\nChecked {len(paths)} TypeScript files: "
        f"{len(warnings)} warning(s), {len(errors)} line-count error(s), "
        f"{len(read_errors)} read error(s).",
    )
    return 1 if errors or read_errors else 0


if __name__ == "__main__":
    sys.exit(main())
