#!/usr/bin/env python3
import os
import subprocess
import sys

def main():
    agents_md = "AGENTS.md"

    # 1. 既存のAGENTS.mdを削除
    if os.path.exists(agents_md):
        try:
            os.remove(agents_md)
            print(f"Removed existing {agents_md}")
        except Exception as e:
            print(f"Failed to remove {agents_md}: {e}")
            sys.exit(1)

    # 2. ruler applyの実行
    print("Running npx --yes @intellectronica/ruler apply...")
    try:
        subprocess.run(["npx", "--yes", "@intellectronica/ruler", "apply"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"ruler apply failed: {e}")
        sys.exit(1)

    # 3. "Source: .ruler/" を含むメタ情報行を削除
    # ファイルパスが記述されていると、AIエージェントがそれを参照先と判断して不要な読み込みを試みる可能性があるため
    if os.path.exists(agents_md):
        print(f"Removing 'Source: .ruler/' lines from {agents_md}...")
        try:
            with open(agents_md, "r", encoding="utf-8") as f:
                lines = f.readlines()

            with open(agents_md, "w", encoding="utf-8") as f:
                for line in lines:
                    if "Source: .ruler/" not in line:
                        f.write(line)
            print("Successfully processed AGENTS.md")
        except Exception as e:
            print(f"Failed to process {agents_md}: {e}")
            sys.exit(1)
    # 4. Markdownとして整形 (prettierを実行)
    if os.path.exists(agents_md):
        print(f"Formatting {agents_md} with prettier...")
        try:
            # 先頭と末尾の余分な改行を削除
            with open(agents_md, "r", encoding="utf-8") as f:
                content = f.read().strip()
            with open(agents_md, "w", encoding="utf-8") as f:
                f.write(content + "\n")

            # prettierによるフォーマット
            subprocess.run(["npx", "prettier", "--write", agents_md], check=True)
            print(f"Successfully formatted {agents_md}")
        except subprocess.CalledProcessError as e:
            print(f"prettier formatting failed: {e}")
            sys.exit(1)
        except Exception as e:
            print(f"Failed to clean up {agents_md}: {e}")
            sys.exit(1)
    else:
        print(f"Warning: {agents_md} not found for formatting.")

if __name__ == "__main__":
    main()
