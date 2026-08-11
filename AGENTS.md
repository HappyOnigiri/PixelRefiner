# Pixel Refiner Project Rules

## Architecture

- Keep image-processing logic in `src/core` side-effect free and independent of DOM and Canvas APIs. Browser integration belongs in `src/browser` and calls into `src/core`.
- Define processing ranges and defaults in `src/shared/config.ts`; consume `PROCESS_RANGES` and `PROCESS_DEFAULTS` instead of duplicating setting values.
- In per-pixel core paths, use indexed `for` loops, avoid allocations inside large loops, and avoid unnecessary image-buffer copies.

## Localization

When adding or changing `data-i18n` or `data-i18n-attr` attributes in the app UI (`index.html` and `src/browser`), register their keys in the `ja`, `en`, and `zh-CN` resources in `src/browser/i18n.ts`.

The quality report generated under `test/quality/report` is a standalone artifact with its own self-contained resource, so register the keys of its `data-i18n`, `data-i18n-alt`, and `data-i18n-placeholder` attributes in the `en`, `ja`, and `zh-CN` resources in `test/quality/report/translations.ts` instead. Do not add report-only keys to `src/browser/i18n.ts`.

## Intent Comments

- コードコメントは日本語で記述する。
- `[Intended]` は意図的な挙動、`[Policy]` は運用上の制約、`[Workaround]` は一時的な外部要因への回避策を記録する。
- タグ付きコードは、コメントの根拠を確認して無効になった場合を除き保持する。特殊な形のために誤ったリファクタリングを招きうる新規コードにはタグを付ける。

## Verification

- Run `make ci` after changes.
- コミットを求められた場合は、Conventional Commits 形式を使い、説明を日本語で記述する。
