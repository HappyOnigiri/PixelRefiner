# Pixel Refiner Project Rules

## Project Overview & Architecture
Vanilla TypeScript + Vite client-side web tool for optimizing pixel art. No backend server.
- **Architecture**: Strict separation between core logic (`src/core`) and UI logic (`src/browser`).

## Directory Structure & Responsibilities
- `src/core/`: Image processing logic. **No DOM APIs allowed.** Treat pixel data as `Uint8ClampedArray` (1D array) maintaining `[r, g, b, a]` order.
  - Basic ops are aggregated in `src/core/ops.ts`.
  - Functions should be side-effect free.
- `src/browser/`: UI manipulation and Canvas rendering. Call `src/core` for processing.
  - State is managed via local variables/closures in `app.ts`.
  - Retrieve elements using type-safe helpers like `getElements` in `app.ts`.
- `src/shared/`: Types (`types.ts`) and constants (`config.ts`).
  - **Rule:** Do not hardcode settings; use `PROCESS_RANGES` or `PROCESS_DEFAULTS`.

## Coding Conventions & Performance
- **Type Definitions**: `any` is strictly prohibited.
- **Comments**: Write description comments (JSDoc, etc.) in English.
- **Loops & Performance**: Use `for` loops instead of map/filter in `src/core` for performance. Avoid object/array creation inside large loops. Be mindful of `Uint8ClampedArray` copy costs. Use `x + y * width` for index calculations.
- **i18n**: When adding/editing HTML UI attributes (`data-i18n`, `data-i18n-attr`), you MUST register translation keys in **both `ja` and `en`** within `src/browser/i18n.ts`.

## Commands & CI
- **Dev Server**: `npm run dev` (`--host 0.0.0.0` available).
- **CI & Formatting**: **Always run `make ci`** after changes. It executes `python3 scripts/run_ci.py` which auto-fixes formatting (Biome), runs tests (Vitest), and synchronizes ruler configuration.
- **Tests**: Write logic tests in `src/core/*.test.ts`. Test fixtures are in `test/fixtures/`. Set `PIXELATE_DEBUG_IMAGES=1 npm test` to output debug images to `tmp/debug`.
- **Git/Commits**: Use Conventional Commits in English. Never push/commit/PR without explicit user instruction.

## Intent Comments (`[Intended]` / `[Policy]` / `[Workaround]`)

Code that may look like a bug, inefficiency, or over-engineering but is intentionally implemented has the following tag comments.

- `// [Intended] reason` — Design intent; do not refactor or optimize.
- `// [Policy] reason` — Operational constraint; keep until the rule changes.
- `// [Workaround] reason` — Workaround for external bug/library; remove when resolved.

### Instructions for Agents

1. Do not change, delete, or refactor code with these tags.
2. When change is required, first confirm the reason in the comment and judge if it is still valid.
3. When writing new code, add appropriate tag comments if the implementation falls under the above.
