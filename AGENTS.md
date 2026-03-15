## Cursor Cloud specific instructions

### Product overview

Pixel Refiner is a client-side web tool for optimizing AI-generated pixel art. No backend server or database — everything runs in the browser. Built with TypeScript + Vite.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (serves at `http://localhost:5173`) |
| Full CI (fix + check + test) | `make ci` |
| Tests only | `npm test` |
| Build | `npm run build` |
| Type check | `npx tsc --noEmit` |

### Git config

- **Do NOT include `Co-authored-by` trailers in commit messages.**
- Commit message format follows Conventional Commits — see `.cursor/skills/commit/SKILL.md`.

### Non-obvious notes

- `make ci` runs `python3 scripts/run_ci.py`, which auto-fixes lint issues before checking. Use this locally instead of `make ci-check` (which does not auto-fix and is intended for CI servers).
- Biome and Prettier are invoked via `npx` (not installed locally), so they are fetched on first use. Lint targets in the Makefile only check git-changed files, not the full codebase.
- Test fixtures live in `test/fixtures/`. To generate debug images from tests: `PIXELATE_DEBUG_IMAGES=1 npm run test` (output goes to `tmp/debug`).
- The dev server supports `--host 0.0.0.0` for external access: `npm run dev -- --host 0.0.0.0`.
