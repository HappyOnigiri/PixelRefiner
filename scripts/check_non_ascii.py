from __future__ import annotations

import re
import subprocess
from pathlib import Path

EXCLUDE_RE = re.compile(
    r"(?i)\.(png|jpe?g|gif|ico|webp|woff2?|ttf|eot|mp4|webm|zip|exe|dll)$|\.ja\.|i18n\.(ts|test\.ts)|README(\.zh-CN)?\.md|\.(cursor|ai)/skills/.*\.md|run-refix\.yml"
)

# Allowed non-ASCII characters (e.g., symbols, arrows, and punctuation used in documentation)
# Range \u2000-\u2bff covers:
# - General Punctuation, Superscripts/Subscripts, Currency Symbols
# - Letterlike Symbols, Number Forms, Arrows, Math Operators
# - Box Drawing, Geometric Shapes, Misc Symbols, Dingbats, etc.
# \ufe19 is Vertical Ellipsis used for menu icons.
ALLOWED_NON_ASCII_RE = re.compile(r"[\u2000-\u2bff\ufe19]")


def _git_ls_files() -> list[str]:
    res = subprocess.run(
        ["git", "ls-files"],
        check=True,
        capture_output=True,
        text=True,
    )
    return [line.strip() for line in res.stdout.splitlines() if line.strip()]


def _first_non_ascii_locations(data: bytes, max_hits: int = 100) -> list[tuple[int, int]]:
    """
    Return (line_no, col_no) pairs (1-based) for non-ASCII characters.
    Each line will have at most one hit.
    This check allows specific characters like arrows while enforcing ASCII for the rest.
    """
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        # Fallback to byte-based check if not valid UTF-8
        byte_hits: list[tuple[int, int]] = []
        l_no = 1
        c_no = 1
        last_hit_line = -1
        for b in data:
            if b == 0x0A:  # \n
                l_no += 1
                c_no = 1
                continue
            if b > 0x7F and l_no != last_hit_line:
                byte_hits.append((l_no, c_no))
                last_hit_line = l_no
                if len(byte_hits) >= max_hits:
                    break
            c_no += 1
        return byte_hits

    hits: list[tuple[int, int]] = []
    line_no = 1
    col_no = 1
    last_hit_line = -1
    for char in text:
        if char == "\n":
            line_no += 1
            col_no = 1
            continue
        if ord(char) > 0x7F and line_no != last_hit_line:
            if not ALLOWED_NON_ASCII_RE.match(char):
                hits.append((line_no, col_no))
                last_hit_line = line_no
                if len(hits) >= max_hits:
                    break
        col_no += 1
    return hits


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]

    print("Checking for prohibited non-ASCII characters...")

    files = _git_ls_files()
    targets = [f for f in files if not EXCLUDE_RE.search(f)]

    any_errors = False
    for rel in targets:
        p = repo_root / rel
        if not p.is_file():
            continue
        try:
            data = p.read_bytes()
        except OSError:
            continue

        hits = _first_non_ascii_locations(data)
        if not hits:
            continue

        any_errors = True
        for line_no, col_no in hits:
            print(f"{rel}:{line_no}:{col_no}: prohibited non-ASCII character found")

    if any_errors:
        print("Error: Prohibited non-ASCII characters found!")
        return 1

    print("All files passed non-ASCII character check (ASCII + allowed documentation symbols).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
