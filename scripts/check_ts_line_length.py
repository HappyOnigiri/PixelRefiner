#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

MAX_LINE_LENGTH = 160
TAB_WIDTH = 4

# [Policy] Translation resources contain intentionally uninterrupted localized
# strings. Splitting them would obscure the text and make translation reviews harder.
EXCLUDED_FILES = {Path("src/browser/i18n.ts")}


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
        if path
    )


def check_file(path: Path) -> list[str]:
    errors = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        1,
    ):
        line_length = len(line.expandtabs(TAB_WIDTH))
        if line_length > MAX_LINE_LENGTH:
            errors.append(
                f"{path}:{line_number}: line has {line_length} characters "
                f"(maximum is {MAX_LINE_LENGTH})",
            )
    return errors


def main() -> int:
    errors = []
    for path in find_typescript_files():
        if path in EXCLUDED_FILES:
            continue
        try:
            errors.extend(check_file(path))
        except (OSError, UnicodeError) as error:
            errors.append(f"{path}: failed to read file: {error}")

    if errors:
        print("\n".join(errors))
        print(f"\nTotal line-length violations: {len(errors)}")
        return 1

    print(f"No TypeScript lines exceed {MAX_LINE_LENGTH} characters.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
