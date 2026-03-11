#!/usr/bin/env python3
import os
import subprocess
import sys

def main():
    agents_md = "AGENTS.md"

    # 1. Remove existing AGENTS.md
    if os.path.exists(agents_md):
        try:
            os.remove(agents_md)
            print(f"Removed existing {agents_md}")
        except Exception as e:
            print(f"Failed to remove {agents_md}: {e}")
            sys.exit(1)

    # 2. Run ruler apply
    print("Running npx --yes @intellectronica/ruler apply...")
    try:
        subprocess.run(["npx", "--yes", "@intellectronica/ruler", "apply"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"ruler apply failed: {e}")
        sys.exit(1)

    # 3. Remove metadata lines containing "Source: .ruler/"
    # If file paths are described, AI agents may mistakenly treat them as references and attempt unnecessary reads.
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
    # 4. Format as Markdown (run prettier)
    if os.path.exists(agents_md):
        print(f"Formatting {agents_md} with prettier...")
        try:
            # Trim leading and trailing whitespace/newlines
            with open(agents_md, "r", encoding="utf-8") as f:
                content = f.read().strip()
            with open(agents_md, "w", encoding="utf-8") as f:
                f.write(content + "\n")

            # Format with prettier
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
