# ボール代 積立帳（独立Webアプリ版）

Claudeやこの会話に依存せず、単独で動くWebアプリです。
データベースはFirebase Firestore（無料枠）、ホスティングはFirebase Hostingを使います。

---

## 1. Firebaseプロジェクトを作る

1. https://console.firebase.google.com/ を開き、Googleアカウントでログイン
2. 「プロジェクトを作成」→ 好きな名前（例: ball-fund）で作成（Google Analyticsは不要なのでオフでOK）
3. 左メニュー「構築」→「Firestore Database」→「データベースの作成」
   - ロケーションは `asia-northeast1`（東京）を推奨
   - 「本番環境モード」を選択（ルールは後で自分たちのものに置き換えます）
4. 左メニュー「構築」→「Hosting」→「開始する」（画面の指示に従うだけでOK、後述のCLI手順と重複してもかまいません）
5. 左上の歯車アイコン →「プロジェクトの設定」→ 下にスクロールして「マイアプリ」→ `</>`（ウェブ）アイコンをクリック
6. アプリのニックネームを適当に入力して登録すると、`firebaseConfig` というオブジェクトが表示されます。これをコピーしておきます

---

## 2. コードに設定値を入れる

`src/firebase.js` を開き、以下の部分をコピーした値に置き換えてください。

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

---

## 3. セキュリティルールを設定する

1. Firebaseコンソール →「Firestore Database」→「ルール」タブ
2. このプロジェクトに含まれる `firestore.rules` の中身を全部コピーして貼り付け
3. 「公開」を押す

これで「誰でも閲覧できるが、PINが合っている時しか書き込めない」設定になります。

---

## 4. ローカルで動作確認する

ターミナル（またはVS Codeのターミナル）で、このフォルダに移動して:

```bash
npm install
npm run dev
```

表示されたURL（例: http://localhost:5173）をブラウザで開いて、今まで通りの画面が出るか確認してください。
管理者PINの初回設定〜記帳まで、一通り試してみてください。

---

## 5. 公開する（Firebase Hosting）

初回のみ、Firebase CLIをインストールしてログインします。

```bash
npm install -g firebase-tools
firebase login
```

ブラウザが開くのでGoogleアカウントでログインします。

プロジェクトを初期化します（このフォルダ内で実行）:

```bash
firebase init hosting
```

聞かれる項目は以下の通り選んでください。

- 「Use an existing project」→ 手順1で作ったプロジェクトを選択
- 「What do you want to use as your public directory?」→ `dist` と入力
- 「Configure as a single-page app?」→ `Yes`
- 「Set up automatic builds and deploys with GitHub?」→ 今回は `No`（後でGitHub Pagesに移行する際に別途検討します）
- 既存ファイルの上書き確認 → 基本的に `No`（`firestore.rules`等を上書きしないため）

ビルドしてデプロイします:

```bash
npm run build
firebase deploy --only hosting
```

完了すると `https://（プロジェクトID）.web.app` という公開URLが表示されます。
これが会員に共有するURLです。ログイン不要で誰でも開けます。

---

## 6. 更新するとき

コードやデータを直したら、毎回この2行を実行するだけです。

```bash
npm run build
firebase deploy --only hosting
```

同じURLのまま中身だけ更新されます。

---

## 7. 将来GitHub Pagesに移行したくなったら

このプロジェクトをそのままGitHubリポジトリにpushし、`npm run build` で生成される `dist` フォルダを
GitHub Pages用のブランチ（`gh-pages`など）にデプロイする形になります。
データベース（Firestore）はそのまま使い続けられるので、コードの置き場所だけを引っ越すイメージです。
その際はまた声をかけてください。

---

## 困ったときは

- 「Missing or insufficient permissions」というエラー → Firestoreのルールがまだ反映されていないか、PINが一致していません
- 管理者PINを忘れた場合 → Firebaseコンソールの「Firestore Database」→「データ」タブから `meta/admin` ドキュメントを手動で削除すれば、次回また初回設定からやり直せます
