import re
import sys
from pathlib import Path

# 検査ルール
# 1. 明示的な 'any' 型を使用しない（例: ': any'、'as any'）
# 2. '@ts-ignore' または '@ts-nocheck' を使用しない
EXPLICIT_ANY_RE = re.compile(r"(:|as)\s+any\b")
TS_IGNORE_RE = re.compile(r"@ts-(ignore|nocheck)")

def check_file(path: Path) -> list[str]:
    errors = []
    try:
        content = path.read_text(encoding="utf-8")
        for i, line in enumerate(content.splitlines(), 1):
            if EXPLICIT_ANY_RE.search(line):
                errors.append(f"{path}:{i}: Found explicit 'any'")
            if TS_IGNORE_RE.search(line):
                errors.append(f"{path}:{i}: Found @ts-ignore or @ts-nocheck")
    except Exception as e:
        errors.append(f"{path}: Error reading file: {e}")
    return errors

def main():
    src_dir = Path("src")
    all_errors = []
    
    # src ディレクトリ内のすべての .ts および .tsx ファイルを走査する
    for path in src_dir.rglob("*.ts"):
        if path.name.endswith(".test.ts"):
            continue
        all_errors.extend(check_file(path))
    
    for path in src_dir.rglob("*.tsx"):
        all_errors.extend(check_file(path))

    if all_errors:
        print("\n".join(all_errors))
        print(f"\nTotal errors found: {len(all_errors)}")
        sys.exit(1)
    else:
        print("No TS rule violations found.")
        sys.exit(0)

if __name__ == "__main__":
    main()
