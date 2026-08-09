import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, Plus, Trash2, Pencil, Users, ShoppingCart, Loader2, X } from "lucide-react";
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
`;

export default function BallFundTracker() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formType, setFormType] = useState("income");
  const [formDate, setFormDate] = useState(today());
  const [formParticipants, setFormParticipants] = useState(4);
  const [formMemo, setFormMemo] = useState("");
  const [formPrivateMemo, setFormPrivateMemo] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const ADMIN_UID = "D4ZDzT4bjlazjno8O0Xt93XujHo1";
  const isAdmin = user?.uid === ADMIN_UID;

  const loadTransactions = useCallback(async () => {
    const snap = await getDocs(TX_COLLECTION);
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => !t.deleted);
    setTransactions(list);
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

  const balance = transactions.reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
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

  const resetForm = () => {
    setFormType("income");
    setFormDate(today());
    setFormParticipants(4);
    setFormMemo("");
    setFormPrivateMemo("");
    setFormAmount("");
    setErrorMsg("");
    setEditingId(null);
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
    } else {
      setFormAmount(String(t.amount));
      setFormParticipants(4);
    }
    setShowForm(true);
  };

  const computedIncomeAmount = formParticipants * 100;

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
      if (editingId) {
        await updateDoc(doc(db, "transactions", editingId), payload);
      } else {
        await addDoc(TX_COLLECTION, { ...payload, createdAt: serverTimestamp() });
      }
      await loadTransactions();
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
      await loadTransactions();
    } catch (e) {
      setErrorMsg(`削除に失敗しました（${e?.message || "不明なエラー"}）`);
    }
  };

  const sorted = [...transactions].sort((a, b) =>
    a.date === b.date ? 0 : a.date > b.date ? -1 : 1
  );

  return (
    <div className="bft-page">
      <style>{styles}</style>
      <div className="max-w-md mx-auto px-5 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="bft-muted text-xs tracking-widest uppercase mb-1">Ball Fund</p>
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

        {errorMsg && !showForm && <p className="bft-error text-center mb-4">{errorMsg}</p>}

        <p className="bft-muted-light text-center mt-8" style={{ fontSize: "11px" }}>
          このページはアカウントなしで誰でも閲覧できます
        </p>
      </div>

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