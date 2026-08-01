# Pixel Refiner Project Rules

## Architecture

- Keep image-processing logic in `src/core` side-effect free and independent of DOM and Canvas APIs. Browser integration belongs in `src/browser` and calls into `src/core`.
- Define processing ranges and defaults in `src/shared/config.ts`; consume `PROCESS_RANGES` and `PROCESS_DEFAULTS` instead of duplicating setting values.
- In per-pixel core paths, use indexed `for` loops, avoid allocations inside large loops, and avoid unnecessary image-buffer copies.

## Localization

When adding or changing `data-i18n` or `data-i18n-attr` attributes, register their keys in the `ja`, `en`, and `zh-CN` resources in `src/browser/i18n.ts`.

## Intent Comments

- `[Intended]` records deliberate behavior, `[Policy]` records an operational constraint, and `[Workaround]` records a temporary external workaround.
- Preserve tagged code unless the comment's rationale has been checked and is no longer valid. Tag newly introduced code when its unusual shape would otherwise invite an incorrect refactor.

## Verification

- Run `make ci` after changes.
