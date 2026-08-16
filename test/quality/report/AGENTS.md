# Quality Report Localization

The quality report generated under `test/quality/report` is a standalone artifact with its own self-contained resource, so register the keys of its `data-i18n`, `data-i18n-alt`, and `data-i18n-placeholder` attributes in `test/quality/report/translations.ts`, writing the three languages together in a single entry per key as the app messages do. Do not add report-only keys to `src/browser/i18n/`.

`test/quality/report/translations.test.ts` matches the registered keys against the ones the report references in both directions and requires all three languages to be filled in. Because the report builds its markup in TypeScript, keys it assembles at run time cannot be found by reading the source: when you add one, register where its value comes from in `GROUP_VALUES` (for `<group>.<value>` keys) or `DYNAMIC_FLAT_KEYS` (for flat keys) in that test, preferring a type or a constant the report already exports over a hand-written list.

Keys the app UI emits are registered elsewhere: see [src/browser/i18n/AGENTS.md](../../../src/browser/i18n/AGENTS.md).
