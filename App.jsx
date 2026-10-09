import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  Pencil,
  Users,
  ShoppingCart,
  Loader2,
  X,
  Wallet,
  CircleDot,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { db, auth } from "./firebase";

const TX_COLLECTION = collection(db, "transactions");
const BALL_COLLECTION = collection(db, "ballEntries");
const ADMIN_UID = "D4ZDzT4bjlazjno8O0Xt93XujHo1";

const yen = (n) => `¥${Math.abs(n).toLocaleString("ja-JP")}`;
// JST基準で今日の日付を出す（端末のタイムゾーン設定に関係なく、UTC時刻に常に9時間を足すだけの方式）
const today = () => {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
};
const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
};

const styles = `
.bft-page { background:#F7F8F6; color:#2B2E2C; min-height:100vh; }
.bft-muted { color:#8A8F87; }
.bft-muted-light { color:#B5B9B0; }
.bft-card { background:#fff; border:1px solid #E7E9E4; border-radius:1rem; }
.bft-input {
  width:100%; border:1px solid #DADDD6; border-radius:0.5rem;
  padding:0.5rem 0.75rem; font-size:0.875rem; background:#fff; color:#2B2E2C;
}
.bft-input:focus { outline:none; box-shadow:0 0 0 2px #8FAE3E; border-color:#8FAE3E; }
.bft-btn-primary {
  width:100%; background:#8FAE3E; color:#fff; font-size:0.875rem; font-weight:500;
  padding:0.65rem 0; border-radius:0.65rem; display:flex; align-items:center;
  justify-content:center; gap:0.5rem; border:none; cursor:pointer;
  transition:background 0.15s;
}
.bft-btn-primary:hover:not(:disabled) { background:#7C9835; }
.bft-btn-primary:disabled { opacity:0.6; cursor:default; }
.bft-btn-outline {
  flex:1; display:flex; align-items:center; justify-content:center; gap:0.4rem;
  font-size:0.875rem; padding:0.6rem 0; border-radius:0.5rem; border:1px solid #DADDD6;
  background:#fff; color:#2B2E2C; cursor:pointer; transition:all 0.15s;
}
.bft-btn-outline.active-income { background:#8FAE3E; border-color:#8FAE3E; color:#fff; }
.bft-btn-outline.active-expense { background:#C97B4A; border-color:#C97B4A; color:#fff; }
.bft-pill {
  display:flex; align-items:center; gap:0.35rem; font-size:0.75rem; padding:0.5rem 0.75rem;
  border-radius:9999px; border:1px solid #DADDD6; background:#fff; cursor:pointer;
  transition:border-color 0.15s; color:#2B2E2C;
}
.bft-pill:hover { border-color:#8FAE3E; }
.bft-error { color:#C0392B; font-size:0.75rem; }
.bft-delete-btn { background:none; border:none; cursor:pointer; color:#B5B9B0; transition:color 0.15s; padding:0; }
.bft-delete-btn:hover { color:#C0392B; }
.bft-close-btn { background:none; border:none; cursor:pointer; color:#B5B9B0; transition:color 0.15s; padding:0; }
.bft-close-btn:hover { color:#2B2E2C; }
.bft-tabs { display:flex; gap:0.5rem; margin-bottom:1.25rem; }
.bft-tab {
  flex:1; display:flex; align-items:center; justify-content:center; gap:0.4rem;
  text-align:center; padding:0.55rem 0; border-radius:0.65rem; font-size:0.8rem;
  cursor:pointer; border:1px solid #DADDD6; background:#fff; color:#8A8F87;
  transition:all 0.15s;
}
.bft-tab.active { background:#2B2E2C; color:#fff; border-color:#2B2E2C; }
.bft-checkbox-row { display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; cursor:pointer; }
.bft-checkbox-row input { width:16px; height:16px; }
.bft-ball-fields { background:#F7F8F6; border:1px solid #E7E9E4; border-radius:0.65rem; padding:0.75rem; margin-bottom:0.75rem; }
.bft-row2 { display:flex; gap:0.5rem; }
.bft-row2 > div { flex:1; }
`;

export default function BallFundTracker() {
  const [activeTab, setActiveTab] = useState("money"); // "money" | "balls"

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [ballLoading, setBallLoading] = useState(true);
  const [ballEntries, setBallEntries] = useState([]);

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");

  // --- 記帳フォーム（お金：徴収／購入） ---
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBallEntryId, setEditingBallEntryId] = useState(null);
  const [formType, setFormType] = useState("income");
  const [formDate, setFormDate] = useState(today());
  const [formParticipants, setFormParticipants] = useState(4);
  const [formMemo, setFormMemo] = useState("");
  const [formPrivateMemo, setFormPrivateMemo] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formIsBallPurchase, setFormIsBallPurchase] = useState(false);
  const [formBallType, setFormBallType] = useState("");
  const [formCans, setFormCans] = useState(1);
  const [formBallsPerCan, setFormBallsPerCan] = useState(4);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // --- ボール使用フォーム（ボール残高タブ） ---
  const [showBallUseForm, setShowBallUseForm] = useState(false);
  const [editingUseId, setEditingUseId] = useState(null);
  const [useDate, setUseDate] = useState(today());
  const [useBalls, setUseBalls] = useState(4);
  const [useMemo, setUseMemo] = useState("");
  const [ballSaving, setBallSaving] = useState(false);
  const [ballErrorMsg, setBallErrorMsg] = useState("");

  const isAdmin = user?.uid === ADMIN_UID;

  const loadTransactions = useCallback(async () => {
    const snap = await getDocs(TX_COLLECTION);
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => !t.deleted);
    setTransactions(list);
  }, []);

  const loadBallEntries = useCallback(async () => {
    const snap = await getDocs(BALL_COLLECTION);
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => !b.deleted);
    setBallEntries(list);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadTransactions();
      } catch (e) {
        setErrorMsg(`読み込みに失敗しました（${e?.message || "不明なエラー"}）`);
      }
      setLoading(false);
    })();
  }, [loadTransactions]);

  useEffect(() => {
    (async () => {
      setBallLoading(true);
      try {
        await loadBallEntries();
      } catch (e) {
        setBallErrorMsg(`読み込みに失敗しました（${e?.message || "不明なエラー"}）`);
      }
      setBallLoading(false);
    })();
  }, [loadBallEntries]);

  const balance = transactions.reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
    0
  );

  const ballStock = ballEntries.reduce(
    (sum, b) => sum + (b.kind === "purchase" ? b.balls : -b.balls),
    0
  );

  const handleSignIn = async () => {
    setAuthError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setAuthError(`ログインに失敗しました（${e?.message || "不明なエラー"}）`);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // ---------- お金の記帳フォーム ----------

  const resetForm = () => {
    setFormType("income");
    setFormDate(today());
    setFormParticipants(4);
    setFormMemo("");
    setFormPrivateMemo("");
    setFormAmount("");
    setFormIsBallPurchase(false);
    setFormBallType("");
    setFormCans(1);
    setFormBallsPerCan(4);
    setErrorMsg("");
    setEditingId(null);
    setEditingBallEntryId(null);
  };

  const openForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (t) => {
    setErrorMsg("");
    setEditingId(t.id);
    setFormType(t.type);
    setFormDate(t.date);
    setFormMemo(t.memo || "");
    setFormPrivateMemo(t.privateMemo || "");
    if (t.type === "income") {
      setFormParticipants(t.participants || Math.round(t.amount / 100) || 1);
      setFormAmount("");
      setFormIsBallPurchase(false);
      setFormBallType("");
      setFormCans(1);
      setFormBallsPerCan(4);
      setEditingBallEntryId(null);
    } else {
      setFormAmount(String(t.amount));
      setFormParticipants(4);
      // この購入に連携しているボール在庫エントリがあれば読み込む
      const linked = ballEntries.find((b) => b.sourceTxId === t.id);
      if (linked) {
        setFormIsBallPurchase(true);
        setFormBallType(linked.ballType || "");
        setFormCans(linked.cans || 1);
        setFormBallsPerCan(linked.ballsPerCan || 4);
        setEditingBallEntryId(linked.id);
      } else {
        setFormIsBallPurchase(false);
        setFormBallType("");
        setFormCans(1);
        setFormBallsPerCan(4);
        setEditingBallEntryId(null);
      }
    }
    setShowForm(true);
  };

  const computedIncomeAmount = formParticipants * 100;
  const computedBalls = formCans * formBallsPerCan;

  const handleAdd = async () => {
    setErrorMsg("");
    const amount = formType === "income" ? computedIncomeAmount : Number(formAmount);

    if (formType === "income" && !Number.isInteger(formParticipants)) {
      setErrorMsg("参加人数は整数で入力してください");
      return;
    }
    if (!amount || amount <= 0) {
      setErrorMsg("金額を正しく入力してください");
      return;
    }
    if (formType === "expense" && !formMemo.trim()) {
      setErrorMsg("購入内容を入力してください");
      return;
    }
    if (formType === "expense" && formIsBallPurchase) {
      if (!formBallType.trim()) {
        setErrorMsg("ボールの種類を入力してください");
        return;
      }
      if (!Number.isInteger(formCans) || formCans <= 0) {
        setErrorMsg("缶数は1以上の整数で入力してください");
        return;
      }
      if (!Number.isInteger(formBallsPerCan) || formBallsPerCan <= 0) {
        setErrorMsg("1缶あたりの球数は1以上の整数で入力してください");
        return;
      }
    }

    const memo =
      formType === "income"
        ? formMemo.trim() || `練習日徴収（${formParticipants}人）`
        : formMemo.trim();

    const payload = {
      date: formDate,
      type: formType,
      memo,
      privateMemo: formPrivateMemo.trim() || "",
      amount,
      participants: formType === "income" ? formParticipants : null,
      deleted: false,
    };

    setSaving(true);
    try {
      let txId = editingId;
      if (editingId) {
        await updateDoc(doc(db, "transactions", editingId), payload);
      } else {
        const ref = await addDoc(TX_COLLECTION, { ...payload, createdAt: serverTimestamp() });
        txId = ref.id;
      }

      // ボール在庫との連携
      if (formType === "expense" && formIsBallPurchase) {
        const ballPayload = {
          date: formDate,
          kind: "purchase",
          ballType: formBallType.trim(),
          cans: formCans,
          ballsPerCan: formBallsPerCan,
          balls: computedBalls,
          memo: memo,
          sourceTxId: txId,
          deleted: false,
        };
        if (editingBallEntryId) {
          await updateDoc(doc(db, "ballEntries", editingBallEntryId), ballPayload);
        } else {
          await addDoc(BALL_COLLECTION, { ...ballPayload, createdAt: serverTimestamp() });
        }
      } else if (editingBallEntryId) {
        // ボール購入のチェックを外した場合は連携エントリを削除扱いに
        await updateDoc(doc(db, "ballEntries", editingBallEntryId), { deleted: true });
      }

      await loadTransactions();
      await loadBallEntries();
      setShowForm(false);
      resetForm();
    } catch (e) {
      setErrorMsg(`保存に失敗しました（${e?.message || "不明なエラー"}）`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    const label = `${fmtDate(t.date)}「${t.memo}」（${t.type === "income" ? "+" : "−"}${yen(t.amount)}）`;
    if (!window.confirm(`この記帳を削除しますか？\n${label}`)) return;
    try {
      await updateDoc(doc(db, "transactions", t.id), {
        deleted: true,
      });
      // 連携しているボール在庫エントリがあれば一緒に削除
      const linked = ballEntries.find((b) => b.sourceTxId === t.id);
      if (linked) {
        await updateDoc(doc(db, "ballEntries", linked.id), { deleted: true });
      }
      await loadTransactions();
      await loadBallEntries();
    } catch (e) {
      setErrorMsg(`削除に失敗しました（${e?.message || "不明なエラー"}）`);
    }
  };

  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    const at = a.createdAt?.seconds || 0;
    const bt = b.createdAt?.seconds || 0;
    return bt - at;
  });

  // ---------- ボール使用フォーム（ボール残高タブ） ----------

  const resetBallUseForm = () => {
    setUseDate(today());
    setUseBalls(4);
    setUseMemo("");
    setBallErrorMsg("");
    setEditingUseId(null);
  };

  const openBallUseForm = () => {
    resetBallUseForm();
    setShowBallUseForm(true);
  };

  const openEditBallUseForm = (b) => {
    setBallErrorMsg("");
    setEditingUseId(b.id);
    setUseDate(b.date);
    setUseBalls(b.balls);
    setUseMemo(b.memo || "");
    setShowBallUseForm(true);
  };

  const handleSaveBallUse = async () => {
    setBallErrorMsg("");
    if (!Number.isInteger(useBalls) || useBalls <= 0) {
      setBallErrorMsg("本数は1以上の整数で入力してください");
      return;
    }
    const payload = {
      date: useDate,
      kind: "use",
      balls: useBalls,
      memo: useMemo.trim(),
      sourceTxId: null,
      deleted: false,
    };
    setBallSaving(true);
    try {
      if (editingUseId) {
        await updateDoc(doc(db, "ballEntries", editingUseId), payload);
      } else {
        await addDoc(BALL_COLLECTION, { ...payload, createdAt: serverTimestamp() });
      }
      await loadBallEntries();
      setShowBallUseForm(false);
      resetBallUseForm();
    } catch (e) {
      setBallErrorMsg(`保存に失敗しました（${e?.message || "不明なエラー"}）`);
    } finally {
      setBallSaving(false);
    }
  };

  const handleDeleteBallUse = async (b) => {
    if (!window.confirm(`この使用記録を削除しますか？\n${fmtDate(b.date)}「使用 ${b.balls}本」`)) return;
    try {
      await updateDoc(doc(db, "ballEntries", b.id), { deleted: true });
      await loadBallEntries();
    } catch (e) {
      setBallErrorMsg(`削除に失敗しました（${e?.message || "不明なエラー"}）`);
    }
  };

  const sortedBallEntries = [...ballEntries].sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    const at = a.createdAt?.seconds || 0;
    const bt = b.createdAt?.seconds || 0;
    return bt - at;
  });

  return (
    <div className="bft-page">
      <style>{styles}</style>
      <div className="max-w-md mx-auto px-5 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="bft-muted text-xs tracking-widest uppercase mb-1">Circle Ball Fund</p>
            <h1 className="text-lg font-semibold">ボール代 残高表</h1>
          </div>
          {authChecked && (
            <button
              onClick={isAdmin ? handleSignOut : handleSignIn}
              className="bft-pill"
              aria-label={isAdmin ? "管理モードを終了" : "管理者としてログイン"}
            >
              {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
              {isAdmin ? "管理中" : "管理者"}
            </button>
          )}
        </div>

        {authError && <p className="bft-error mb-4">{authError}</p>}

        {/* タブ切り替え */}
        <div className="bft-tabs">
          <button
            className={`bft-tab ${activeTab === "money" ? "active" : ""}`}
            onClick={() => setActiveTab("money")}
          >
            <Wallet size={14} />
            残高
          </button>
          <button
            className={`bft-tab ${activeTab === "balls" ? "active" : ""}`}
            onClick={() => setActiveTab("balls")}
          >
            <CircleDot size={14} />
            ボール残高
          </button>
        </div>

        {activeTab === "money" ? (
          <>
            <div className="bft-card px-6 py-7 mb-6">
              <p className="bft-muted text-xs mb-2">現在の残高</p>
              {loading ? (
                <div className="flex items-center gap-2 bft-muted">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">読み込み中…</span>
                </div>
              ) : (
                <p
                  className="font-mono text-4xl font-semibold tracking-tight"
                  style={{ color: balance < 0 ? "#B15E2E" : "#6B8A2E" }}
                >
                  {balance < 0 ? "−" : ""}
                  {yen(balance)}
                </p>
              )}
            </div>

            {isAdmin && !loading && (
              <button onClick={openForm} className="bft-btn-primary mb-6">
                <Plus size={16} />
                記帳する
              </button>
            )}

            <div className="mb-4">
              <p className="bft-muted text-xs mb-3 tracking-wide">履歴</p>
              {!loading && sorted.length === 0 && (
                <div className="text-center py-10 text-sm bft-muted bft-card" style={{ borderStyle: "dashed" }}>
                  まだ記録がありません。
                  {isAdmin ? "最初の徴収を記帳しましょう。" : "記録が増えるとここに表示されます。"}
                </div>
              )}
              <ul className="space-y-2">
                {sorted.map((t) => (
                  <li key={t.id} className="bft-card flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: t.type === "income" ? "#8FAE3E" : "#C97B4A" }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{t.memo}</p>
                        <p className="bft-muted text-xs font-mono">{fmtDate(t.date)}</p>
                        {isAdmin && t.privateMemo && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: "#B15E2E" }}>
                            🔒 {t.privateMemo}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className="font-mono text-sm"
                        style={{ color: t.type === "income" ? "#6B8A2E" : "#B15E2E" }}
                      >
                        {t.type === "income" ? "+" : "−"}
                        {yen(t.amount)}
                      </span>
                      {isAdmin && (
                        <>
                          <button onClick={() => openEditForm(t)} className="bft-delete-btn" aria-label="編集">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(t)} className="bft-delete-btn" aria-label="削除">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <>
            <div className="bft-card px-6 py-7 mb-6">
              <p className="bft-muted text-xs mb-2">現在のボール在庫</p>
              {ballLoading ? (
                <div className="flex items-center gap-2 bft-muted">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">読み込み中…</span>
                </div>
              ) : (
                <p
                  className="font-mono text-4xl font-semibold tracking-tight"
                  style={{ color: ballStock < 0 ? "#B15E2E" : "#4A7FB5" }}
                >
                  {ballStock}
                  <span className="text-lg ml-1">本</span>
                </p>
              )}
              <p className="bft-muted text-xs mt-2">
                購入は「残高」タブでボール購入として記帳すると自動で加算されます
              </p>
            </div>

            {isAdmin && !ballLoading && (
              <button onClick={openBallUseForm} className="bft-btn-primary mb-6">
                <Plus size={16} />
                使用を記録（在庫を減らす）
              </button>
            )}

            {ballErrorMsg && !showBallUseForm && <p className="bft-error text-center mb-4">{ballErrorMsg}</p>}

            <div className="mb-4">
              <p className="bft-muted text-xs mb-3 tracking-wide">履歴</p>
              {!ballLoading && sortedBallEntries.length === 0 && (
                <div className="text-center py-10 text-sm bft-muted bft-card" style={{ borderStyle: "dashed" }}>
                  まだ記録がありません。
                </div>
              )}
              <ul className="space-y-2">
                {sortedBallEntries.map((b) => (
                  <li key={b.id} className="bft-card flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: b.kind === "purchase" ? "#4A7FB5" : "#8A8F87" }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm truncate">
                          {b.kind === "purchase"
                            ? `購入：${b.ballType}（${b.cans}缶×${b.ballsPerCan}球）`
                            : `使用${b.memo ? `：${b.memo}` : ""}`}
                        </p>
                        <p className="bft-muted text-xs font-mono">{fmtDate(b.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className="font-mono text-sm"
                        style={{ color: b.kind === "purchase" ? "#4A7FB5" : "#B15E2E" }}
                      >
                        {b.kind === "purchase" ? "+" : "−"}
                        {b.balls}本
                      </span>
                      {isAdmin && b.kind === "use" && (
                        <>
                          <button onClick={() => openEditBallUseForm(b)} className="bft-delete-btn" aria-label="編集">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDeleteBallUse(b)} className="bft-delete-btn" aria-label="削除">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      {isAdmin && b.kind === "purchase" && (
                        <span className="bft-muted-light" style={{ fontSize: "10px" }}>
                          残高タブで編集
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {errorMsg && !showForm && activeTab === "money" && (
          <p className="bft-error text-center mb-4">{errorMsg}</p>
        )}

        <p className="bft-muted-light text-center mt-8" style={{ fontSize: "11px" }}>
          このページはアカウントなしで誰でも閲覧できます
        </p>
      </div>

      {/* お金の記帳モーダル */}
      {showForm && (
        <Modal onClose={() => { setShowForm(false); resetForm(); }}>
          <h2 className="text-sm font-semibold mb-4">{editingId ? "記帳を編集" : "記帳する"}</h2>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFormType("income")}
              className={`bft-btn-outline ${formType === "income" ? "active-income" : ""}`}
            >
              <Users size={14} />
              徴収
            </button>
            <button
              onClick={() => setFormType("expense")}
              className={`bft-btn-outline ${formType === "expense" ? "active-expense" : ""}`}
            >
              <ShoppingCart size={14} />
              購入
            </button>
          </div>

          <label className="bft-muted text-xs block mb-1">日付</label>
          <input
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            className="bft-input mb-3"
          />

          {formType === "income" ? (
            <>
              <label className="bft-muted text-xs block mb-1">参加人数</label>
              <input
                type="number"
                min={1}
                step={1}
                value={formParticipants}
                onChange={(e) => setFormParticipants(Math.round(Number(e.target.value)))}
                className="bft-input mb-3"
              />
              <p className="bft-muted text-xs mb-3 font-mono">
                {formParticipants}人 × ¥100 ={" "}
                <span style={{ color: "#6B8A2E" }}>{yen(computedIncomeAmount)}</span>
              </p>
            </>
          ) : (
            <>
              <label className="bft-muted text-xs block mb-1">金額</label>
              <input
                type="number"
                min={1}
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="例：3200"
                className="bft-input mb-3"
              />
            </>
          )}

          <label className="bft-muted text-xs block mb-1">
            摘要{formType === "income" ? "（空欄でも可）" : ""}
          </label>
          <input
            type="text"
            value={formMemo}
            onChange={(e) => setFormMemo(e.target.value)}
            placeholder={formType === "income" ? "例：8/3練習分" : "例：テニスボール4缶購入"}
            className="bft-input mb-3"
          />

          {formType === "expense" && (
            <>
              <label className="bft-checkbox-row">
                <input
                  type="checkbox"
                  checked={formIsBallPurchase}
                  onChange={(e) => setFormIsBallPurchase(e.target.checked)}
                />
                <span className="text-xs">この購入はボール代（在庫に反映する）</span>
              </label>

              {formIsBallPurchase && (
                <div className="bft-ball-fields">
                  <label className="bft-muted text-xs block mb-1">ボールの種類</label>
                  <input
                    type="text"
                    value={formBallType}
                    onChange={(e) => setFormBallType(e.target.value)}
                    placeholder="例：ダンロップ EXD"
                    className="bft-input mb-3"
                  />
                  <div className="bft-row2 mb-2">
                    <div>
                      <label className="bft-muted text-xs block mb-1">缶数</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={formCans}
                        onChange={(e) => setFormCans(Math.round(Number(e.target.value)))}
                        className="bft-input"
                      />
                    </div>
                    <div>
                      <label className="bft-muted text-xs block mb-1">1缶あたりの球数</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={formBallsPerCan}
                        onChange={(e) => setFormBallsPerCan(Math.round(Number(e.target.value)))}
                        className="bft-input"
                      />
                    </div>
                  </div>
                  <p className="bft-muted text-xs font-mono">
                    合計 <span style={{ color: "#4A7FB5" }}>{computedBalls}本</span> がボール在庫に加算されます
                  </p>
                </div>
              )}
            </>
          )}

          <label className="bft-muted text-xs block mb-1">
            非公開メモ（管理者のみに表示・空欄でも可）
          </label>
          <input
            type="text"
            value={formPrivateMemo}
            onChange={(e) => setFormPrivateMemo(e.target.value)}
            placeholder="例：〇〇さん分は後日徴収予定"
            className="bft-input mb-3"
          />

          {errorMsg && <p className="bft-error mb-2">{errorMsg}</p>}

          <button onClick={handleAdd} disabled={saving} className="bft-btn-primary">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {editingId ? "更新する" : "記帳する"}
          </button>
        </Modal>
      )}

      {/* ボール使用の記帳モーダル */}
      {showBallUseForm && (
        <Modal onClose={() => { setShowBallUseForm(false); resetBallUseForm(); }}>
          <h2 className="text-sm font-semibold mb-4">{editingUseId ? "使用記録を編集" : "使用を記録"}</h2>

          <label className="bft-muted text-xs block mb-1">日付</label>
          <input
            type="date"
            value={useDate}
            onChange={(e) => setUseDate(e.target.value)}
            className="bft-input mb-3"
          />

          <label className="bft-muted text-xs block mb-1">使用した本数</label>
          <input
            type="number"
            min={1}
            step={1}
            value={useBalls}
            onChange={(e) => setUseBalls(Math.round(Number(e.target.value)))}
            className="bft-input mb-3"
          />

          <label className="bft-muted text-xs block mb-1">メモ（空欄でも可）</label>
          <input
            type="text"
            value={useMemo}
            onChange={(e) => setUseMemo(e.target.value)}
            placeholder="例：8/10練習で使用"
            className="bft-input mb-3"
          />

          {ballErrorMsg && <p className="bft-error mb-2">{ballErrorMsg}</p>}

          <button onClick={handleSaveBallUse} disabled={ballSaving} className="bft-btn-primary">
            {ballSaving && <Loader2 size={14} className="animate-spin" />}
            {editingUseId ? "更新する" : "記録する"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 flex items-start sm:items-center justify-center z-50 px-4 pt-16 sm:pt-0 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.3)" }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 relative my-auto max-h-[80vh] overflow-y-auto">
        <button onClick={onClose} className="bft-close-btn absolute top-4 right-4" aria-label="閉じる">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}
