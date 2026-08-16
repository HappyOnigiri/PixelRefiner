# Pixel Refiner Project Rules

## Architecture

- Keep image-processing logic in `src/core` side-effect free and independent of DOM and Canvas APIs. Browser integration belongs in `src/browser` and calls into `src/core`.
- Define processing ranges and defaults in `src/shared/config.ts`; consume `PROCESS_RANGES` and `PROCESS_DEFAULTS` instead of duplicating setting values.
- In per-pixel core paths, use indexed `for` loops, avoid allocations inside large loops, and avoid unnecessary image-buffer copies.

## Settings Consistency

- 「おまかせ」は公開済みの選択肢から最適なものを選ぶだけにする。「おまかせ」だけで使う処理経路や処理条件が必要になった場合は、その内容を通常の選択肢として追加する。
- 組み込みの「プリセット」は「かんたん設定」の組み合わせだけで再現できるようにする。
- 「かんたん設定」は「詳細設定」の組み合わせだけで再現できるようにする。
- 再現先に同名の「おまかせ」は不要。自動選択で確定した具体的な選択肢や値を手動指定して同じ結果を得られれば、再現可能とみなす。

## Localization

Keys for `data-i18n` and `data-i18n-attr` in the app UI (`index.html` and `src/browser`) live in `src/browser/i18n/messages/`, one module per group of related key prefixes (a module owns several prefixes, e.g. `ui.ts` holds `app.` / `section.` / `ui.` and more), with the three languages written together in a single entry per key. `src/browser/i18n/messages.test.ts` checks the prefix-to-module mapping, keys referenced from HTML but never defined, and keys that nothing references anymore. When you introduce a new key prefix, add it to `MODULE_OF_PREFIX` in that test as well, naming the module that owns it.

`guide.*` belongs to `messages/guide.ts` and is deliberately left out of `appMessages`, so the recipe copy stays out of the app bundle; `src/browser/guide.ts` registers it with `i18n.registerMessages()`.

The quality report generated under `test/quality/report` is a standalone artifact with its own self-contained resource, so register the keys of its `data-i18n`, `data-i18n-alt`, and `data-i18n-placeholder` attributes in `test/quality/report/translations.ts` instead, writing the three languages together in a single entry per key as the app messages do. Do not add report-only keys to `src/browser/i18n/`. `test/quality/report/translations.test.ts` checks the same things for the report, but the report builds its markup in TypeScript, so keys it assembles at run time cannot be found by reading the source: when you add one, register where its value comes from in `GROUP_VALUES` (for `<group>.<value>` keys) or `DYNAMIC_FLAT_KEYS` (for flat keys) in that test, preferring a type or a constant the report already exports over a hand-written list.

## Guide Page

When `guide.html` publishes a converted example, add one quality case for it so the report keeps proving that the published result is reproducible: publish the generated source image at its original size under `public/guide/` and use that same file as the case `input`, and add a case to `test/quality/cases.json` whose `presetId` is the preset the page tells the reader to select — or whose `quickSettings` holds the Quick Settings changes when the page names those instead — and whose `expected` is the published output image. The page must offer that original for download, because the displayed copy is downscaled and does not reproduce the published result. See [Guide page examples](test/quality/README.md#guide-page-examples).

## Intent Comments

- コードコメントは日本語で記述する。
- `[Intended]` は意図的な挙動、`[Policy]` は運用上の制約、`[Workaround]` は一時的な外部要因への回避策を記録する。
- タグ付きコードは、コメントの根拠を確認して無効になった場合を除き保持する。特殊な形のために誤ったリファクタリングを招きうる新規コードにはタグを付ける。

## Verification

- Run `make ci` after changes.
- `make ci` leaves out the image quality cases, so also run `make quality` after changing processing in `src/core`, defaults or ranges in `src/shared/config.ts`, the presets or the Quick Settings mapping in `src/browser/quick-settings.ts`, `test/quality/cases.json`, or the case images under `test/fixtures/` and `public/guide/`. See [Commands](test/quality/README.md#commands) for the other quality commands.
- コミットを求められた場合は、Conventional Commits 形式を使い、説明を日本語で記述する。
