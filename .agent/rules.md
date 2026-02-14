---
alwaysApply: true
---

# Pixel Refiner Cursor Rules

## 基本ルール
- **言語:** ユーザーとの対話、説明、コミットメッセージ等はすべて**日本語**で行ってください。

## プロジェクト概要
このプロジェクトは、AI生成などで作られたドット絵（ピクセルアート）を最適化するためのWebツールです。
TypeScript (Vanilla), Vite, Vitest を使用しており、UIフレームワーク（React/Vue等）は使用していません。

## 技術スタック
- **言語:** TypeScript (Strict mode)
- **ビルドツール:** Vite
- **テスト:** Vitest
- **リンター/フォーマッター:** Biome (HTMLはPrettier)
- **CSS:** Standard CSS (Variables活用)
- **アーキテクチャ:** Core Logic (`src/core`) と UI Logic (`src/browser`) の分離

## ディレクトリ構造と責務
- `src/core/`: 画像処理の純粋なロジック。
    - **ルール:** DOM API（`document`, `window`, `HTMLCanvasElement`など）への依存を避けること。データ構造は `RawImage` (`Uint8ClampedArray`) を中心に扱う。
- `src/browser/`: UI操作、DOMイベント、Canvas描画。
    - **ルール:** `src/core` の関数を呼び出して処理を行う。DOM操作はここでのみ行う。
- `src/shared/`: 型定義 (`types.ts`) と定数設定 (`config.ts`)。

## コーディング規約

### TypeScript & スタイル
- **型定義:** `any` の使用は厳禁。`src/shared/types.ts` にある `RawImage`, `PixelGrid` 等の型を積極的に使用する。
- **配列操作:** ピクセルデータは `Uint8ClampedArray` (1次元配列) として扱う。`[r, g, b, a]` の順序を守る。
- **ループ:** 画像処理 (`src/core`) 内でのループはパフォーマンスを意識し、高階関数（map/filter）よりも `for` ループを使用する場合がある（パフォーマンスクリティカルな箇所）。
- **Null安全性:** Optional Chaining (`?.`) や Nullish Coalescing (`??`) を活用する。
- **フォーマット:** Biome の設定に従う（インデントはタブ、セミコロンあり）。

### 画像処理ロジック (src/core)
- `src/core/ops.ts` に基本的なピクセル操作（getPixel, setPixel, posterizeなど）を集約する。
- 関数は副作用を持たせないように設計する（入力 `RawImage` を受け取り、新しい `RawImage` または解析結果を返す）。
- 座標計算には `x + y * width` のインデックス計算を使用する。

### UI実装 (src/browser)
- UIフレームワークを使っていないため、`document.getElementById` や `querySelector` を使用する。
- 要素の取得は `app.ts` 内の `getElements` ヘルパーパターンのように、型安全に取得する関数を通すこと。
- 状態管理は `app.ts` 内のローカル変数やクロージャで行う。

### テスト (Vitest)
- ロジックのテストは `src/core/*.test.ts` に記述する。
- 実際の画像ファイル (`test/fixtures`) を読み込んで処理結果を検証するテストケースを推奨。
- `pngjs` を使用してテスト用の画像入出力を補助する。

### コミットメッセージ (SKILL.md準拠)
- **言語:** 日本語
- **形式:** `<type>: <説明>` (例: `feat: グリッド検出アルゴリズムを改善`)
- **Type一覧:**
    - `feat`: 新機能
    - `fix`: バグ修正
    - `docs`: ドキュメント
    - `style`: フォーマットなど
    - `refactor`: リファクタリング
    - `perf`: パフォーマンス改善
    - `test`: テスト関連
    - `chore`: その他ツールなど

## コード生成のガイドライン

### コードの修正・追加時
1. 既存の `src/core` と `src/browser` の分離原則を守る。
2. 新しい型が必要な場合は `src/shared/types.ts` に追加する。
3. 設定値はハードコードせず `src/shared/config.ts` の `PROCESS_RANGES` や `PROCESS_DEFAULTS` を使用・更新する。
4. 説明コメント（JSDoc等）は日本語で記述する。
5. **コード変更後は必ず `make ci` を実行し、リンターチェックとテストが通過することを確認する。**

### パフォーマンスへの配慮
- `Uint8ClampedArray` のコピーコストを意識する。
- 不要な `new Uint8ClampedArray` や `new ImageData` の生成を避ける。
- 大きなループ内でのオブジェクト生成を避ける。

## 重要なファイル/定数
- `src/shared/types.ts`: `RawImage` 型定義
- `src/core/processor.ts`: 画像処理のメインパイプライン
- `Makefile`: `make ci` でBiomeチェックとテストが走ることを考慮する
---
alwaysApply: true
---
- GitHub 上の操作には `gh` コマンドを利用できます。
