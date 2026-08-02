#!/usr/bin/env python3
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

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


def find_typescript_files() -> list[Path]:
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            "*.ts",
            "*.tsx",
        ],
        check=True,
        stdout=subprocess.PIPE,
    )
    return sorted(
        Path(path.decode("utf-8"))
        for path in result.stdout.split(b"\0")
        if path and Path(path.decode("utf-8")).is_file()
    )


def count_lines(path: Path) -> int:
    with path.open(encoding="utf-8") as file:
        return sum(1 for _ in file)


def classify_file(path: Path) -> Violation | None:
    line_count = count_lines(path)
    if line_count > HARD_LINE_LIMIT:
        return Violation(path, line_count, "error")
    if line_count > WARNING_LINE_LIMIT:
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


def main() -> int:
    violations = []
    read_errors = []

    try:
        paths = find_typescript_files()
    except subprocess.CalledProcessError as error:
        print(f"Failed to list TypeScript files: {error}", file=sys.stderr)
        return 1

    for path in paths:
        if path in EXCLUDED_FILES:
            continue
        try:
            violation = classify_file(path)
        except (OSError, UnicodeError) as error:
            read_errors.append(f"{path}: failed to read file: {error}")
            continue
        if violation is not None:
            violations.append(violation)

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
