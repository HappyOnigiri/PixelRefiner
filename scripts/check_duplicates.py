#!/usr/bin/env python3
import os
import platform
import subprocess
import sys

# [Policy] jscpd 5.x は Rust 製バイナリを optionalDependencies で配る方式で、
# win32-arm64 と linux-arm64-musl 向けのパッケージが存在しない。素通しすると
# 「重複がない」ではなく「起動できなかった」で make ci が止まり、原因が読み取れない。
# 対象外の環境ではその旨を説明してスキップし、CI では検査の穴になるので失敗させる。
UNSUPPORTED_MARKERS = (
    "Unsupported platform",
    "not installed. Install it with",
)


def is_ci() -> bool:
    return os.environ.get("CI", "").lower() not in ("", "0", "false")


def main() -> int:
    result = subprocess.run(
        ["pnpm", "run", "check:duplicates"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    output = result.stdout.decode("utf-8", errors="replace")
    print(output, end="" if output.endswith("\n") else "\n")

    if result.returncode == 0:
        return 0

    if not any(marker in output for marker in UNSUPPORTED_MARKERS):
        return result.returncode

    print(
        f"jscpd could not resolve its native binary on "
        f"{sys.platform}/{platform.machine()}. "
        "The duplication check cannot run in this environment."
    )
    if is_ci():
        print(
            "Refusing to skip the check on CI. Run it on a platform jscpd "
            "supports, or replace jscpd with a platform-independent checker."
        )
        return result.returncode

    print("Skipping locally. CI still enforces this check on ubuntu-latest.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
