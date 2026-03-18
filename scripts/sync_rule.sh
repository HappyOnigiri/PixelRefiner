#!/bin/sh
set -eu

# --- AGENTS.md ---
if [ -f .ai/AGENTS.md ]; then
  if ! cmp -s .ai/AGENTS.md AGENTS.md; then
    cp .ai/AGENTS.md AGENTS.md
    echo "sync-ruler: AGENTS.md updated"
  fi
fi

# --- skills ---
SKILLS_SRC=".ai/skills"
if [ -d "$SKILLS_SRC" ]; then
  if ! command -v rsync >/dev/null 2>&1; then
    echo "sync-ruler: rsync is required for this sync (src: $SKILLS_SRC)" >&2
    exit 1
  fi
  for dest in .claude/skills .cursor/skills .agent/skills; do
    mkdir -p "$dest"
    rsync -a --delete "$SKILLS_SRC/" "$dest/"
    echo "sync-ruler: $dest synced"
  done
fi
