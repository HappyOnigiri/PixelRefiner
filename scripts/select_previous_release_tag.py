#!/usr/bin/env python3
"""リリースタグの一覧から「1つ前のバージョン」のタグを選ぶ。

標準入力で 1 行 1 タグを受け取り、選んだタグ名を標準出力へ 1 行で出す。
該当するタグが無い場合は何も出力しない（終了コードは 0）。

最新タグと同じ major.minor は今回のリリース系列とみなして除外し、残りのうち
最大の major.minor 系列の最大パッチを返す。最新が 1.2.0 なら 1.1.2 のような
1 つ前のマイナーバージョンの最終パッチが選ばれる。

品質レポートの「前回生成」を、直前のコミットではなく前バージョンの成果物に
そろえるために使う。main へのマージ時点では最新タグが今回のリリースを指すため、
最新タグと比べても差が出ない。
"""

import re
import sys

# [Policy] プレリリースやビルドメタデータ付きのタグは比較対象にしない。
# 前回生成は「公開済みの前バージョン」を指すべきで、途中版を混ぜると
# レポートの基準がリリースごとに揺れる。
TAG_PATTERN = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def parse_tag(tag: str) -> tuple[int, int, int] | None:
    """タグ名を (major, minor, patch) にする。形式が違えば None。"""
    matched = TAG_PATTERN.match(tag.strip())
    if matched is None:
        return None
    return (int(matched[1]), int(matched[2]), int(matched[3]))


def select_previous_release_tag(tags: list[str]) -> str | None:
    """最新タグの 1 つ前のマイナーバージョン系列で、最大パッチのタグを返す。"""
    parsed = [
        (version, tag)
        for tag in tags
        if (version := parse_tag(tag)) is not None
    ]
    if not parsed:
        return None
    latest_version = max(version for version, _ in parsed)
    latest_series = latest_version[:2]
    candidates = [
        (version, tag) for version, tag in parsed if version[:2] < latest_series
    ]
    if not candidates:
        return None
    return max(candidates)[1]


def main() -> None:
    tags = sys.stdin.read().splitlines()
    previous = select_previous_release_tag(tags)
    if previous is not None:
        print(previous)


if __name__ == "__main__":
    main()
