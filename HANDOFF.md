# 3Dモデルアプリ 引き継ぎ資料

Claude Desktop（デザインツール）での作業内容と、これから行う SharePoint 移行の計画をまとめたものです。
このファイルをリポジトリ直下に置いて、Claude Code に読ませてください。

---

## 1. プロジェクト概要

社内で撮影した3Dガウシアンスプラッティング（splat）ファイルを、工事番号・機械名ごとに整理して閲覧するツール。

- リポジトリ: `kemcokurosaki-oss/3d-viewer`（main ブランチ、ルート公開）
- 公開URL: https://kemcokurosaki-oss.github.io/3d-viewer/
- 公開場所: 社内ポータル（https://kemcojp.sharepoint.com/sites/portal ）の「Webツール」配下に別タブで開くリンクとして設置予定
- 利用者: 事務所のPC中心、現場での利用もあり
- 現在のデータ保存先: Supabase（プロジェクト `dgekjzkrybrswsxlcbvh`、Storage バケット `splat-files`）

### ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | メイン画面（今回リデザイン済み・CSSとJSを内包） |
| `viewer.html` / `viewer-core.js` | 全画面ビューア。three.js + @sparkjsdev/spark で splat を描画 |
| `upload.html` / `upload-core.js` | アップロード処理、Supabase CRUD、サムネイル自動撮影 |
| `supabase-client.js` | Supabase クライアントと定数 |
| `icons.js` | インラインSVGアイコン |

---

## 2. 今回 index.html に加えた変更（完了済み・main に反映済み）

デザイン刷新。「アプリ感があって見やすく」「ダーク／ライト切替は維持」という要望に対応。
プロツール寄りのダークUIを基調に、階層と選択状態の可読性、パーツ操作性を改善した。

### レイアウト

4カラム構成（左から）:

1. **案件ツリー** 230px — 工事番号／客先名／機械数。展開は中立色、選択中の機械のみアクセント色で塗る
2. **パーツ列** 268px — 2列グリッド。カードは固定高さ118px（サムネイル86px＋ラベル行30px）
3. **ビューア** 可変 — ヘッダーを廃してすべてオーバーレイ表示
4. **詳細パネル** 256px — 開閉可能（localStorage `3dmodel-inspector-open` に保存）

### 主な機能追加

- トップバーにパンくず（工事番号 › 客先名 › 機械名 › パーツ数）
- パーツの複数選択（ホバーでチェックボックス表示）と一括削除バー
- 並べ替えはパーツグリッドのドラッグ＋詳細パネルのリストドラッグの2箇所。どちらも `reorderParts(orderedIds)` を呼ぶ
- ビューアのオーバーレイ: パーツ名＋「1 / 8」、背景色スウォッチ、視点リセット、全画面、操作ヒント（6秒でフェード）、読み込み状態
- アップロードモーダルを2カラム化。ファイル入力は非表示にしドロップゾーン自体をクリック領域に
- ファビコンとヘッダーマークを立方体アイコンに統一
- `<meta name="build">` を追加（キャッシュ判別用。現在 `2026-08-04-10`）

### 注意点（重要）

**パーツカードのサイズ指定は JS のインラインスタイルで行っている。**

CSS グリッドの行高でカードが切り取られ、ラベルが表示されない不具合があったため、`buildPartCard()` 内で `style.cssText` を直接指定している。パーツ列は `display: flex; flex-wrap: wrap` で、カードは `width: calc(50% - 5px); height: 118px`。
リファクタする場合はこの経緯を踏まえること。CSSクラスに戻すと再発する可能性がある。

### 維持している既存仕様

- テーマ切替（localStorage `3dmodel-theme`、既定はダーク）
- 検索履歴（localStorage `3dmodel-recent-machines`、最大6件・表示3件）
- 工事番号 2000〜2999 のみ表示するフィルタ
- Supabase の全API（`fetchProjectMachineTree` / `fetchMachineFiles` / `uploadPart` / `updateThumbnail` / `updatePartLabel` / `deletePart` / `reorderParts` / `captureThumbnailCandidates`）

---

## 3. これから行う作業: SharePoint 方式への移行

### 背景

splat ファイルは平均約20MB。年間約50ファイル＝約1GB/年の増加見込み。
Supabase の無料枠は1GB、Pro（月$25）で100GBなので費用面は問題にならないが、
**既に SharePoint にアップして社内共有している運用があり、二重アップロードを避けたい**のが移行の主目的。

### 移行後の構成

| 保存先 | 内容 |
| --- | --- |
| SharePoint | splat ファイル本体 |
| Supabase | サムネイル画像、パーツ表示名、並び順のみ（1件数十KB） |

- 一覧の階層は SharePoint のフォルダ構成から自動生成する。アプリからのアップロード機能は不要になる
- 代わりに「SharePointを開く」ボタンを置く想定

### SharePoint 側

- サイト: `https://kemcojp.sharepoint.com/sites/portal`
- ライブラリ: `写真・動画`
- フォルダ: `★3Dモデル`（旧称 `★3DGS(動画から作成した3D写真)` から変更済み）
- 配下の構成: **確定**。`★3Dモデル/工事番号_客先名/機械名/ファイル名`
  - 例: `★3Dモデル/2815_日鉄建材仙台/WA/全体.splat`
  - テスト整理済み: 工番2815
  - ファイル名（パーツラベル）は 正面／裏側／入側／出側／全体 などで対応
- **工事番号・客先名の一覧はSupabase（工程表 tasks テーブル）からこれまで通り取得する。** SharePoint側のフォルダを再帰的に走査して階層を構築する必要はなく、`工事番号_客先名/機械名` のパスを直接指定してファイル一覧のみ取得する方式に変更（`sharepoint-client.js` 参照）

### 実装方針

1. **認証**: MSAL.js（SPA、Authorization Code Flow + PKCE）
2. **Entra ID アプリ登録**
   - 種類: シングルページアプリケーション
   - リダイレクトURI: `https://kemcokurosaki-oss.github.io/3d-viewer/`
   - 委任アクセス許可 `Files.Read.All`（または `Sites.Selected`）＋**管理者の同意が必要**
   - クライアントID・テナントIDは登録後に確定
3. **ファイル一覧**: Graph API でフォルダを再帰的に走査し、工事番号／機械名／splat の階層を構築
4. **ファイル読み込み**: **必ず `@microsoft.graph.downloadUrl` を使う**

   `/content` エンドポイントは302リダイレクトを返し、Authorizationヘッダーを付けるとCORSプリフライトが必要になるためブラウザからは使えない。
   `@microsoft.graph.downloadUrl` は事前認証済みURLなのでプリフライトなしで直接取得できる。
   ただし**1時間程度で失効する**ため、表示のたびに取得し直す実装にすること。
   参考: https://learn.microsoft.com/en-us/graph/api/driveitem-get-content

5. **サムネイル**: SharePoint 上の splat からは自動生成されないので、初回表示時にブラウザで撮影して Supabase に保存する
6. **メタ情報**: パーツ表示名・並び順は Supabase に残す。SharePoint の driveItem ID をキーにする

### 既存データの扱い

SharePoint に統一する方向で確定。Supabase 登録済み約20件について、SharePoint 側に同等ファイルがあるか突き合わせ、無いものは `★3Dモデル` 配下へアップし直す（誰がいつやるかは未確定）。サムネイル・パーツ表示名・並び順は引き続き Supabase に保持する。

### 想定される課題

- **iframe 埋め込み不可**: ポータルに iframe で埋め込むと Microsoft のサインインがブロックされる場合がある。Webツール配下に「別タブで開くリンク」として設置する
- **テナント外からアクセス不可**: SharePoint 認証が必要になるため、社外の人は閲覧できなくなる
- **フォルダ命名規則の順守**: 規則が崩れると自動読み取りが機能しない
- **読み込み速度**: SharePoint 配信になるため Supabase Storage より遅くなる可能性がある。実ファイルでの検証が必要

### 進め方の提案

いきなり全体を作り替えず、1機械分のフォルダだけを Graph で読んで一覧表示する検証版で疎通を確認してから本実装に進む。

---

## 4. 未確定事項

- [x] SharePoint のフォルダ構成 → 確定（上記参照）
- [ ] 既存 Supabase データの扱い（SharePointへの再アップ作業は誰がいつやるか未確定）
- [ ] Entra ID のクライアントID・テナントID（明日の打ち合わせでアプリ登録を依頼予定）
- [ ] 管理者による `Files.Read.All` への同意
- [ ] `★3Dモデル` フォルダの編集権限設定（誰でも削除できる問題への対応、添付③4番）
- [ ] `sharepoint-client.js` 作成済み。MSAL_CONFIG の TODO 部分（clientId / tenantId）をEntra ID登録後に差し替えて疎通確認する
