# ボール代 積立帳（独立Webアプリ版）

Claudeやこの会話に依存せず、単独で動くWebアプリです。
データベースはFirebase Firestore（無料枠）、認証はFirebase Authentication（Googleログイン）、
ホスティングはFirebase Hostingを使っています。

- 会員：URLを開くだけで残高・履歴を閲覧可能（アカウント不要）
- 管理者（竜太さん）：Googleアカウントでログインすると記帳・編集・削除が可能

---

## 仕組み

- `transactions`コレクションに取引を保存
- Firestoreセキュリティルール（`firestore.rules`）で、**閲覧は誰でも可、書き込みは指定したFirebase UIDのみ可**という制御をしている
- 削除は物理削除ではなく、`deleted: true`への更新で行う（データを完全に消さない設計）
- `privateMemo`（非公開メモ）は画面上では管理者ログイン時のみ表示。ただしFirestoreのデータ自体は他のフィールドと同じドキュメントに入っているため、開発者ツールなどで意図的に調べれば読み取れる。機密情報（パスワード・個人情報など）は入れないこと

---

## 開発・デプロイの基本コマンド

```bash
npm install       # 依存パッケージのインストール（初回のみ）
npm run dev        # ローカルで動作確認（http://localhost:5173）
npm run build       # 本番用にビルド（distフォルダが生成される）
firebase deploy --only hosting,firestore   # アプリ本体とセキュリティルールを両方まとめて公開
```

**重要**：`firestore.rules`を変更した場合、`--only hosting`だけではFirestoreには反映されません。
必ず`hosting,firestore`の両方、またはルールだけなら`--only firestore`を実行してください。

---

## 管理者を交代・追加したいとき

1. 新しい管理者がGoogleアカウントでこのアプリにログインを試す（「管理者」ボタンを押すだけでOK。この時点ではまだ書き込みはできない）
2. Firebaseコンソール →「Authentication」→「Users」タブで、そのアカウントのUIDを確認
3. `firestore.rules`の`request.auth.uid == '...'`の部分を、そのUIDに書き換える（複数人に許可したい場合は`request.auth.uid in ['UID1', 'UID2']`のように書ける）
4. `src/App.jsx`内の`ADMIN_UID`定数も同じUIDに書き換える（画面表示の判定用。書き換えなくても書き込み自体はルール側で守られるが、UI表示が正しくなるよう合わせておくと親切）
5. `firebase deploy --only hosting,firestore`で反映

---

## 困ったときは

- 「Missing or insufficient permissions」というエラー → ログインしているGoogleアカウントのUIDが、`firestore.rules`に設定されているUIDと一致していません
- ログインできない → Firebaseコンソール →「Authentication」→「Sign-in method」でGoogleログインが有効になっているか確認してください
- 会員に見せる内容と実際のFirestoreの内容がズレて見える → ブラウザのキャッシュの可能性が高いです。スーパーリロード（Ctrl+Shift+R）またはシークレットウィンドウで確認してください