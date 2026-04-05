from __future__ import annotations

import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# Exclusions follow Git's `linguist-generated` attribute (see `.gitattributes`).
# We use `git check-attr` so path pattern rules stay identical to Git's parser.


def _git_ls_files_z(repo_root: Path) -> bytes:
    res = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=repo_root,
        check=True,
        capture_output=True,
    )
    return res.stdout


def _paths_from_ls_files_z(data: bytes) -> list[str]:
    if not data:
        return []
    parts = data.split(b"\0")
    if parts and parts[-1] == b"":
        parts.pop()
    enc = sys.getfilesystemencoding()
    return [p.decode(enc, errors="surrogateescape") for p in parts if p]


def _linguist_generated_excluded(repo_root: Path, ls_files_z: bytes) -> set[str]:
    """Paths with linguist-generated (e.g. build outputs listed in `.gitattributes`)."""
    if not ls_files_z:
        return set()
    attr = subprocess.run(
        ["git", "check-attr", "-z", "--stdin", "linguist-generated"],
        cwd=repo_root,
        check=True,
        capture_output=True,
        input=ls_files_z,
    )
    raw = attr.stdout
    if not raw:
        return set()
    parts = raw.split(b"\0")
    if parts and parts[-1] == b"":
        parts.pop()
    excluded: set[str] = set()
    # NUL-delimited triplets: path, attribute name, value (see git-check-attr(1) -z).
    for i in range(0, len(parts), 3):
        if i + 2 >= len(parts):
            break
        path_b, _attr_b, value_b = parts[i], parts[i + 1], parts[i + 2]
        if not path_b:
            continue
        if value_b != b"set":
            continue
        rel = path_b.decode(sys.getfilesystemencoding(), errors="surrogateescape")
        excluded.add(rel)
    return excluded


def _count_lines(path: Path) -> int:
    # Count newline characters in binary for speed and to avoid decode issues.
    data = path.read_bytes()
    if not data:
        return 0
    return data.count(b"\n") + (0 if data.endswith(b"\n") else 1)


_EXT_TO_LANG: dict[str, str] = {
    "py": "Python",
    "ts": "TypeScript",
    "tsx": "TypeScript",
    "js": "JavaScript",
    "jsx": "JavaScript",
    "mjs": "JavaScript",
    "cjs": "JavaScript",
    "css": "CSS",
    "scss": "SCSS",
    "html": "HTML",
    "htm": "HTML",
    "sh": "Shell",
    "bash": "Shell",
    "zsh": "Shell",
    "sql": "SQL",
    "rs": "Rust",
    "go": "Go",
    "md": "Markdown",
    "yml": "YAML",
    "yaml": "YAML",
    "json": "JSON",
    "toml": "TOML",
    "ini": "INI",
    "txt": "Plain text",
    "xml": "XML",
}


def _classify_language(rel: str) -> str:
    p = Path(rel)
    name = p.name
    if name == "Makefile" or name.endswith(".mk"):
        return "Makefile"
    ext = p.suffix.lower().lstrip(".")
    if ext in _EXT_TO_LANG:
        return _EXT_TO_LANG[ext]
    norm = rel.replace("\\", "/")
    if not ext and "git-hooks/" in norm:
        return "Shell"
    if not ext and name in ("post-checkout", "post-merge", "pre-commit"):
        return "Shell"
    return f"Other ({ext or 'no extension'})"


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    ls_z = _git_ls_files_z(repo_root)
    excluded = _linguist_generated_excluded(repo_root, ls_z)
    files = [f for f in _paths_from_ls_files_z(ls_z) if f not in excluded]

    per_lang: dict[str, int] = defaultdict(int)

    for rel in files:
        p = repo_root / rel
        if not p.is_file():
            continue
        try:
            lines = _count_lines(p)
        except OSError:
            continue

        per_lang[_classify_language(rel)] += lines

    print("=== Lines of code (git-tracked, excluding linguist-generated) ===")
    print(
        "Excluded paths are detected via `git check-attr linguist-generated` "
        "(see .gitattributes)."
    )
    if excluded:
        print("")
        print("=== Excluded paths (linguist-generated) ===")
        for path in sorted(excluded):
            print(f"  {path}")
    else:
        print("")
        print("=== Excluded paths (linguist-generated) ===")
        print("  (none)")

    print("")
    print("=== Lines of code by language (heuristic) ===")
    for lang, total in sorted(per_lang.items(), key=lambda t: t[1], reverse=True):
        print(f"{total:10d} {lang}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
