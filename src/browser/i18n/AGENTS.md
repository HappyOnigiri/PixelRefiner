# App UI Localization

Keys for `data-i18n` and `data-i18n-attr` in the app UI (`partials/index/` and `src/browser`) live in `src/browser/i18n/messages/`, one module per group of related key prefixes (a module owns several prefixes, e.g. `ui.ts` holds `app.` / `section.` / `ui.` and more), with the three languages written together in a single entry per key. `src/browser/i18n/messages.test.ts` checks the prefix-to-module mapping, keys referenced from HTML but never defined, and keys that nothing references anymore. When you introduce a new key prefix, add it to `MODULE_OF_PREFIX` in that test as well, naming the module that owns it.

`guide.*` belongs to `messages/guide.ts` and is deliberately left out of `appMessages`, so the recipe copy stays out of the app bundle; the keys are referenced from `partials/guide/`, and `src/browser/guide.ts` registers the module with `i18n.registerMessages()`.

Keys that only the quality report emits are registered elsewhere: see [test/quality/report/AGENTS.md](../../../test/quality/report/AGENTS.md).
