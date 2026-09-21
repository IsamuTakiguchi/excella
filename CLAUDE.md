# CLAUDE.md

Excel ライクな表計算アプリ **Excella** のリポジトリです。デスクトップ版（Electron）と
ブラウザ／PWA 版（スマホ向け、GitHub Pages に公開）が同じ renderer で動きます。
このファイルは、作業を始める前に押さえておくべき前提をまとめたものです。

## コマンド

```bash
npm install
npm run dev          # 開発用に起動（ホットリロードあり）
npm run lint         # ESLint（規約）
npm run format       # Prettier（整形）／確認だけなら format:check
npm run typecheck    # main / renderer / test の 3 つの tsconfig
npm test             # vitest
npm run build        # out/ に本番ビルド
npm run smoke        # ビルド＋実際に起動して描画を確認
npm run dist         # electron-builder でパッケージング
npm run build:web    # ブラウザ／PWA 版を out/web に（WEB_BASE=/excella/ でサブパス）
npm run smoke:web    # ブラウザ版を iPhone 相当でエミュレートしてタップ操作まで検査
```

**変更後は必ず `lint` → `format:check` → `typecheck` → `test` を通すこと。**
UI の見た目に関わる変更をしたら、`smoke` にスクリーンショットを撮らせて目視まで行う
（Canvas 描画はテストで担保できないため）。renderer を触ったら `smoke:web` も通す
（タッチ端末ではフォーカスの扱いが違うため、PC で動いてもスマホで壊れることがある）。

```bash
xvfb-run -a npx electron ./out/main/index.js --smoke --no-sandbox --screenshot shot.png
```

`--smoke` はサンプルデータを流し込んでから終了するので、描画が壊れていれば一目で分かります。

## 構成

```
src/
├─ main/       Electron main。ウィンドウ、メニュー、ダイアログ、ファイル読み書き
│   └─ io/     ExcelJS による xlsx の変換（main プロセスでのみ動く）
├─ preload/    contextBridge で renderer に公開する最小限の API
├─ shared/     main と renderer で共有する純粋モジュール（xlsx 変換もここ。fs には触らない）
└─ renderer/   React の UI（デスクトップ版・ブラウザ版で共通）
    ├─ bridge.ts     ファイル入出力の入口（Electron: preload / ブラウザ: webBridge.ts）
    ├─ engine/ HyperFormula のラッパ
    ├─ store/  zustand による状態管理と undo/redo
    ├─ grid/   Canvas によるグリッド描画と操作
    └─ ui/     ツールバー・数式バー・シートタブ・ステータスバー
```

## 守るべき設計判断

これらは意図して選んだもので、崩すと壊れます。

1. **ファイル I/O は main プロセスだけ**。renderer に fs を露出させないため、
   `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` を維持する。
   preload が公開するのはダイアログ経由の読み書きなど数個の操作だけで、
   任意パスへの read/write API は作らない。
2. **preload は CommonJS 出力**（`electron.vite.config.ts` で `format: 'cjs'`）。
   `sandbox: true` の preload は ESM を読めず、ESM にすると**画面が真っ白になる**。
3. **計算は HyperFormula、書式と寸法はモデル**という役割分担。
   値・数式の真実は常に HyperFormula 側にあり、行列の挿入削除のあとは
   `syncCellsFromEngine()` でモデルへ引き直す。
4. **undo/redo はアプリ側の単一スタック**。`hf.undo()` は使わない。
   変更前のモデル全体のスナップショットを積む方式で、書式・構造変更が混ざっても
   順序がずれない。ドラッグのような連続操作は `record: false` で積まず、
   確定時に `commitResize()` で 1 回だけ積む。
5. **グリッドは Canvas に可視範囲だけを描く**。`painter.ts` は副作用のない描画関数、
   `geometry.ts` は純粋な座標計算（テスト対象）、`SheetCanvas.tsx` がイベント処理。
6. **セル入力欄（`CellInput.tsx`）は常にマウントされ、常にフォーカスを持つ**。
   日本語入力は編集可能な要素にフォーカスが無いと変換が始まらないため。
   value は React で制御しない（変換中に書き戻すと未確定文字列が壊れる）。
   キー処理では必ず `isComposing` を見る。見落とすと変換確定の Enter で
   セルまで確定してしまう。
7. **オーバーレイ（入力欄・右クリックメニュー）はスクロール要素の外に置く**。
   中に入れると通常フローで canvas の下へ流れ、入力欄がグリッドの外に出る。
8. **タッチ端末（`pointer: coarse`）では入力欄を編集中だけフォーカスする**。
   フォーカス＝ソフトキーボード表示なので、常時フォーカスだとキーボードが出っぱなしになる。
   `focusGrid()` はタッチ端末では編集中以外 no-op。選択中セルの再タップで編集、長押しでメニュー。
9. **数式の参照選択（ポイントモード）は編集テキストの一部として持つ**。
   `pointing` は「差し込み位置の前後（prefix / suffix）＋選んでいる範囲」で、
   表示テキストは常にそこから組み立て直す。参照を別の状態として持つと、
   矢印で動かすたびに `=A1A2` のように積み重なる。文字を打った時点で `pointing` は消す。
   `=` で始まる編集中の矢印キーは、確定にもキャレット移動にも使わない（Excel と同じ）。
10. **renderer は Electron 専用 API を直接呼ばない**。ファイル入出力は `bridge` 経由にし、
    xlsx の変換は `shared/xlsx.ts`（バイト列 ⇄ モデル）に置く。ExcelJS は約 1 MB あるので
    ブラウザ版では動的 import で遅延読み込みする。

## テストの方針

`test/` は vitest（Node 環境）で、**純粋モジュールと main の I/O** を対象にします。
UI コンポーネントのテストはありません。バグを直すときは
**まず失敗する回帰テストを書き、修正を戻すと本当に失敗することを確かめる**こと。

## スコープ外

マクロ (VBA)、グラフ、ピボットテーブル、条件付き書式、オートフィルタ、データ検証、
画像・図形、コメント。xlsx から読み込んでもこれらは保持されません。
罫線は実線 3 段階（細線・中線・太線）のみで、点線や二重線には対応しません。

## ライセンス

GPLv3。数式エンジンの HyperFormula を GPL-3.0-only の無償枠
（`licenseKey: 'gpl-v3'`）で使っているため、本体も GPLv3 で配布します。
**MIT など緩いライセンスへ変更することはできません。**
