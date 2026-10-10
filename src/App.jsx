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
  Settings2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  writeBatch,
  deleteField,
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
const TYPE_COLLECTION = collection(db, "ballTypes");
const COURT_COLLECTION = collection(db, "courts");
// 管理者だけが読み書きできる保存先（firestore.rules で制限）
const MEMBER_COLLECTION = collection(db, "members");
const PRIVATE_COLLECTION = collection(db, "privateDetails");
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
// 履歴を月ごとにまとめる（日付の新しい順に並んだリストを渡す前提）
const monthKey = (d) => (d || "").slice(0, 7);
const monthLabel = (k) => {
  const [y, m] = k.split("-");
  return `${y}年${Number(m)}月`;
};
const groupByMonth = (list) => {
  const groups = [];
  list.forEach((item) => {
    const k = monthKey(item.date);
    let g = groups[groups.length - 1];
    if (!g || g.key !== k) {
      g = { key: k, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  });
  return groups;
};

// マスタ（種類・コート・メンバー）の並び順：sortOrder → 未設定は登録順（先頭側）
const orderOf = (x) => (typeof x.sortOrder === "number" ? x.sortOrder : -Infinity);
const sortMasters = (a, b) =>
  orderOf(a) - orderOf(b) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
const nextOrder = (items) =>
  items.reduce((m, x) => Math.max(m, typeof x.sortOrder === "number" ? x.sortOrder : -1), -1) + 1;

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
.bft-move-btn { background:none; border:none; cursor:pointer; color:#B5B9B0; transition:color 0.15s; padding:0; }
.bft-move-btn:hover:not(:disabled) { color:#2B2E2C; }
.bft-move-btn:disabled { opacity:0.3; cursor:default; }
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
.bft-stock-row { display:flex; justify-content:space-between; align-items:baseline; padding:0.4rem 0; border-top:1px solid #EEF0EB; font-size:0.875rem; }
.bft-month-head {
  width:100%; display:flex; align-items:center; justify-content:space-between; gap:0.5rem;
  padding:0.5rem 0.25rem; margin-bottom:0.25rem; background:none; border:none;
  cursor:pointer; color:#2B2E2C; font-size:0.8rem;
}
.bft-month-head .chev { color:#8A8F87; transition:transform 0.15s; }
.bft-month-head.closed .chev { transform:rotate(-90deg); }
.bft-chips { display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.5rem; }
.bft-chip {
  font-size:0.8rem; padding:0.35rem 0.75rem; border-radius:9999px; border:1px solid #DADDD6;
  background:#fff; color:#2B2E2C; cursor:pointer; transition:all 0.15s;
}
.bft-chip.on { background:#8FAE3E; border-color:#8FAE3E; color:#fff; }
`;

export default function BallFundTracker() {
  const [activeTab, setActiveTab] = useState("money"); // "money" | "balls"

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [ballLoading, setBallLoading] = useState(true);
  const [ballEntries, setBallEntries] = useState([]);
  const [ballTypes, setBallTypes] = useState([]); // 削除済みも含む（表示名の参照用）
  const [courts, setCourts] = useState([]); // 削除済みも含む（表示名の参照用）

  // 月ごとの開閉状態（キー：YYYY-MM。未設定なら最新の月だけ開く）
  const [moneyMonthOpen, setMoneyMonthOpen] = useState({});
  const [ballMonthOpen, setBallMonthOpen] = useState({});

  // マスタ管理モーダル（"" | "types" | "courts" | "members"）
  const [masterModal, setMasterModal] = useState("");
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterError, setMasterError] = useState("");

  // 管理者だけが読める非公開データ（メンバー・参加者・非公開メモ・実質購入額）
  const [members, setMembers] = useState([]); // 削除済みも含む
  const [privateMap, setPrivateMap] = useState({}); // 記録ID → 非公開項目
  const [privateError, setPrivateError] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState("");

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
  const [formParticipantIds, setFormParticipantIds] = useState([]);
  const [formMemo, setFormMemo] = useState("");
  const [formPrivateMemo, setFormPrivateMemo] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formIsBallPurchase, setFormIsBallPurchase] = useState(false);
  const [formBallTypeId, setFormBallTypeId] = useState("");
  const [formCans, setFormCans] = useState(1);
  const [formIsPersonal, setFormIsPersonal] = useState(false); // 参加者私物（在庫には反映しない）
  const [formPersonalBalls, setFormPersonalBalls] = useState(4); // 私物の球数
  const [formBallsPerCan, setFormBallsPerCan] = useState(4);
  const [formUnitPrice, setFormUnitPrice] = useState(100);
  const [formCourtId, setFormCourtId] = useState("");
  const [formActualAmount, setFormActualAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // --- ボール使用フォーム（ボール在庫タブ） ---
  const [showBallUseForm, setShowBallUseForm] = useState(false);
  const [editingUseId, setEditingUseId] = useState(null);
  const [useDate, setUseDate] = useState(today());
  const [useBalls, setUseBalls] = useState(4);
  const [useTypeId, setUseTypeId] = useState("");
  const [useMemo, setUseMemo] = useState("");
  const [useCourtId, setUseCourtId] = useState("");
  const [useParticipantIds, setUseParticipantIds] = useState([]);
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

  const loadBallTypes = useCallback(async () => {
    const snap = await getDocs(TYPE_COLLECTION);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort(sortMasters);
    setBallTypes(list);
  }, []);

  const loadCourts = useCallback(async () => {
    const snap = await getDocs(COURT_COLLECTION);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort(sortMasters);
    setCourts(list);
  }, []);

  // 非公開データ（管理者のみ）。失敗しても例外は投げず、画面にエラーを出す
  const loadPrivate = useCallback(async () => {
    // メンバーと非公開詳細は別々に読む（片方が失敗しても、もう片方は表示できるようにする）
    const errors = [];
    try {
      const mSnap = await getDocs(MEMBER_COLLECTION);
      const list = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort(sortMasters);
      setMembers(list);
    } catch (e) {
      errors.push(`メンバー（members）：${e?.message || "不明なエラー"}`);
    }
    try {
      const pSnap = await getDocs(PRIVATE_COLLECTION);
      const map = {};
      pSnap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setPrivateMap(map);
    } catch (e) {
      errors.push(`非公開詳細（privateDetails）：${e?.message || "不明なエラー"}`);
    }
    setPrivateError(
      errors.length
        ? `非公開データの読み込みに失敗しました。${errors.join(" / ")}。firestore.rules を反映済みか確認してください`
        : ""
    );
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
        await Promise.all([loadBallEntries(), loadBallTypes()]);
      } catch (e) {
        setBallErrorMsg(`読み込みに失敗しました（${e?.message || "不明なエラー"}）`);
      }
      setBallLoading(false);
    })();
  }, [loadBallEntries, loadBallTypes]);

  // コートは単独で読み込む（ルール未反映などで失敗しても、残高・在庫の表示は止めない）
  useEffect(() => {
    (async () => {
      try {
        await loadCourts();
      } catch (e) {
        console.warn("コート一覧の読み込みに失敗しました", e);
      }
    })();
  }, [loadCourts]);

  // 管理者のときだけ非公開データを読む（それ以外は何も持たない）
  useEffect(() => {
    if (!isAdmin) {
      setPrivateMap({});
      setMembers([]);
      setPrivateError("");
      return;
    }
    loadPrivate();
  }, [isAdmin, loadPrivate]);

  const balance = transactions.reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
    0
  );

  const ballStock = ballEntries.reduce(
    (sum, b) => sum + (b.kind === "purchase" ? b.balls : -b.balls),
    0
  );

  const activeTypes = ballTypes.filter((t) => !t.deleted);
  const typeById = (id) => ballTypes.find((t) => t.id === id);

  const activeCourts = courts.filter((c) => !c.deleted);
  const courtById = (id) => courts.find((c) => c.id === id);
  const courtName = (x) => (x.courtId && courtById(x.courtId)?.name) || x.court || "";
  // 選択肢：有効なコート＋（編集中の記録が使っている）削除済みコート
  const courtOptionsFor = (selectedId) => [
    ...activeCourts,
    ...(selectedId && !activeCourts.some((c) => c.id === selectedId) && courtById(selectedId)
      ? [courtById(selectedId)]
      : []),
  ];

  // 旧デフォルト表記「練習日徴収（x人）」は表示だけ新表記に読み替える（保存データは変えない）
  const displayMemo = (memo) => (memo || "").replace(/^練習日徴収（(\d+)人）$/, "参加者からの集金（$1人）");

  // メンバーごとの集金累計（参加者を記録した徴収のみ。1人あたり＝その回の単価）
  const memberTotals = {};
  transactions.forEach((t) => {
    if (t.deleted || t.type !== "income") return;
    const ids = privateMap[t.id]?.participantIds || [];
    if (ids.length === 0) return;
    const per = t.unitPrice || (t.participants ? Math.round(t.amount / t.participants) : 0);
    ids.forEach((id) => {
      const cur = memberTotals[id] || { total: 0, count: 0 };
      cur.total += per;
      cur.count += 1;
      memberTotals[id] = cur;
    });
  });

  const activeMembers = members.filter((m) => !m.deleted);
  const memberById = (id) => members.find((m) => m.id === id);
  // チップに出すメンバー：有効なメンバー＋（編集中の記録に入っている）削除済みメンバー
  const membersFor = (selectedIds) => [
    ...activeMembers,
    ...selectedIds
      .filter((id) => !activeMembers.some((m) => m.id === id))
      .map((id) => memberById(id))
      .filter(Boolean),
  ];
  const participantNames = (ids) =>
    ids
      .map((id) => memberById(id)?.name)
      .filter(Boolean)
      .join("、");

  // 非公開項目の取り出し（管理者のみ使う）。新しい保存先を優先し、なければ旧データ（公開側）を見る
  const txPrivate = (t) => {
    const p = privateMap[t.id];
    return {
      memo: p ? p.privateMemo || "" : t.privateMemo || "",
      actual: p ? p.actualAmount ?? null : t.privateActualAmount ?? null,
      participantIds: p?.participantIds || [],
    };
  };
  const ballPrivateIds = (b) => privateMap[b.id]?.participantIds || [];

  // 在庫の集計キー：マスタID → なければ旧データの種類名 → なければ未指定
  const entryKey = (b) =>
    b.ballTypeId && typeById(b.ballTypeId)
      ? b.ballTypeId
      : b.ballType
      ? `name:${b.ballType}`
      : "none";
  const entryTypeName = (b) =>
    (b.ballTypeId && typeById(b.ballTypeId)?.name) || b.ballType || "種類未指定";

  const stockByType = (() => {
    const map = new Map();
    activeTypes.forEach((t) => map.set(t.id, { key: t.id, name: t.name, qty: 0 }));
    ballEntries.forEach((b) => {
      const key = entryKey(b);
      if (!map.has(key)) map.set(key, { key, name: entryTypeName(b), qty: 0 });
      map.get(key).qty += b.kind === "purchase" ? b.balls : -b.balls;
    });
    // 在庫0の種類は表示しない（マイナスは異常のため残す）
    return [...map.values()].filter((r) => r.qty !== 0);
  })();

  // 指定した種類の在庫（編集中の使用記録は除いて数える）
  const stockOfType = (typeId, excludeEntryId) =>
    ballEntries
      .filter((b) => b.id !== excludeEntryId && entryKey(b) === typeId)
      .reduce((sum, b) => sum + (b.kind === "purchase" ? b.balls : -b.balls), 0);

  // 使用フォームの在庫プレビュー（種類未選択のときは null）
  const useStockBefore = useTypeId ? stockOfType(useTypeId, editingUseId) : null;
  const useStockAfter =
    useStockBefore === null ? null : useStockBefore - (Number.isInteger(useBalls) ? useBalls : 0);

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
    setFormParticipantIds([]);
    setFormMemo("");
    setFormPrivateMemo("");
    setFormAmount("");
    setFormIsBallPurchase(false);
    setFormIsPersonal(false);
    setFormPersonalBalls(4);
    setFormBallTypeId("");
    setFormCans(1);
    setFormBallsPerCan(4);
    setFormUnitPrice(100);
    setFormCourtId("");
    setFormActualAmount("");
    setErrorMsg("");
    setEditingId(null);
    setEditingBallEntryId(null);
  };

  const openForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (t) => {
    const pv = txPrivate(t);
    setErrorMsg("");
    setEditingId(t.id);
    setFormType(t.type);
    setFormDate(t.date);
    setFormMemo(t.memo || "");
    // 購入の摘要は非公開になったため、旧データの公開摘要（自動表記でないもの）は非公開メモ側に引き継ぐ
    const legacyMemo =
      t.type === "expense" && t.memo && t.memo !== "購入" && !/ x \d+球? 購入(（参加者私物）)?$/.test(t.memo) ? t.memo : "";
    setFormPrivateMemo([legacyMemo, pv.memo].filter(Boolean).join(" / "));
    setFormUnitPrice(t.unitPrice || 100);
    setFormCourtId(t.courtId || "");
    setFormActualAmount(pv.actual != null ? String(pv.actual) : "");
    setFormParticipantIds(pv.participantIds);
    if (t.type === "income") {
      setFormParticipants(t.participants || Math.round(t.amount / 100) || 1);
      setFormAmount("");
      setFormIsBallPurchase(false);
      setFormBallTypeId("");
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
        setFormBallTypeId(
          linked.ballTypeId && activeTypes.some((x) => x.id === linked.ballTypeId)
            ? linked.ballTypeId
            : activeTypes.find((x) => x.name === linked.ballType)?.id || ""
        );
        setFormCans(linked.cans || 1);
        setFormBallsPerCan(linked.ballsPerCan || 4);
        setEditingBallEntryId(linked.id);
        setFormIsPersonal(false);
      } else {
        setFormIsBallPurchase(false);
        setFormIsPersonal(!!t.personal);
        setFormBallTypeId(
          t.personal && t.ballTypeId && activeTypes.some((x) => x.id === t.ballTypeId) ? t.ballTypeId : ""
        );
        setFormCans(1);
        setFormBallsPerCan(4);
        setFormPersonalBalls(t.personal ? t.balls || 4 : 4);
        setEditingBallEntryId(null);
      }
    }
    setShowForm(true);
  };

  const computedIncomeAmount = formParticipants * formUnitPrice;
  const computedBalls = formCans * formBallsPerCan;

  // 参加者を選ぶと、参加人数を選んだ人数に合わせる（ゲストがいる場合は人数を手で増やす）
  const toggleFormParticipant = (id) => {
    const next = formParticipantIds.includes(id)
      ? formParticipantIds.filter((x) => x !== id)
      : [...formParticipantIds, id];
    setFormParticipantIds(next);
    if (next.length > 0) setFormParticipants(next.length);
  };

  const handleAdd = async () => {
    setErrorMsg("");
    const amount = formType === "income" ? computedIncomeAmount : Number(formAmount);

    if (formType === "income" && !Number.isInteger(formParticipants)) {
      setErrorMsg("参加人数は整数で入力してください");
      return;
    }
    if (formType === "income" && (!Number.isInteger(formUnitPrice) || formUnitPrice <= 0)) {
      setErrorMsg("単価は1以上の整数で入力してください");
      return;
    }
    if (!amount || amount <= 0) {
      setErrorMsg("金額を正しく入力してください");
      return;
    }
    if (formType === "expense" && formIsPersonal) {
      if (!formBallTypeId) {
        setErrorMsg("ボールの種類を選択してください");
        return;
      }
      if (!Number.isInteger(formPersonalBalls) || formPersonalBalls <= 0) {
        setErrorMsg("球数は1以上の整数で入力してください");
        return;
      }
    }
    if (formType === "expense" && formIsBallPurchase) {
      if (!formBallTypeId) {
        setErrorMsg("ボールの種類を選択してください");
        return;
      }
      if (!Number.isInteger(formCans) || formCans <= 0) {
        setErrorMsg("缶数は1以上の整数で入力してください");
        return;
      }
      if (formIsBallPurchase && (!Number.isInteger(formBallsPerCan) || formBallsPerCan <= 0)) {
        setErrorMsg("1缶あたりの球数は1以上の整数で入力してください");
        return;
      }
    }

    let actualAmount = null;
    if (formType === "expense" && formActualAmount.trim() !== "") {
      actualAmount = Number(formActualAmount);
      if (!Number.isFinite(actualAmount) || actualAmount < 0) {
        setErrorMsg("実質購入額は0以上の数値で入力してください");
        return;
      }
    }

    const memo =
      formType === "income"
        ? formMemo.trim() || `参加者からの集金（${formParticipants}人）`
        : formIsBallPurchase
          ? `${typeById(formBallTypeId)?.name || "ボール"} x ${computedBalls}球 購入`
          : formIsPersonal
            ? `${typeById(formBallTypeId)?.name || "ボール"} x ${formPersonalBalls}球 購入（参加者私物）`
            : "購入";

    // 公開側に保存する項目（非公開メモ・実質購入額・参加者は含めない）
    const payload = {
      date: formDate,
      type: formType,
      memo,
      amount,
      participants: formType === "income" ? formParticipants : null,
      unitPrice: formType === "income" ? formUnitPrice : null,
      courtId: formType === "income" ? formCourtId || null : null,
      court: formType === "income" ? courtById(formCourtId)?.name || "" : "",
      // 参加者私物（在庫には反映しない。種類と缶数だけ記録する）
      personal: formType === "expense" && formIsPersonal,
      ballTypeId: formType === "expense" && formIsPersonal ? formBallTypeId : null,
      ballType: formType === "expense" && formIsPersonal ? typeById(formBallTypeId)?.name || "" : "",
      balls: formType === "expense" && formIsPersonal ? formPersonalBalls : null,
      deleted: false,
    };

    setSaving(true);
    try {
      // 記帳・非公開項目・ボール在庫連携を1回のバッチで保存する（途中で失敗しても半端に残らない）
      const batch = writeBatch(db);
      const txRef = editingId ? doc(db, "transactions", editingId) : doc(TX_COLLECTION);
      if (editingId) {
        // 旧バージョンが公開側に残した非公開項目も、ここで取り除く
        batch.update(txRef, {
          ...payload,
          privateMemo: deleteField(),
          privateActualAmount: deleteField(),
        });
      } else {
        batch.set(txRef, { ...payload, createdAt: serverTimestamp() });
      }

      batch.set(doc(db, "privateDetails", txRef.id), {
        kind: "tx",
        privateMemo: formPrivateMemo.trim(),
        actualAmount: formType === "expense" ? actualAmount : null,
        participantIds: formType === "income" ? formParticipantIds : [],
        updatedAt: serverTimestamp(),
      });

      // ボール在庫との連携
      if (formType === "expense" && formIsBallPurchase) {
        const ballPayload = {
          date: formDate,
          kind: "purchase",
          ballTypeId: formBallTypeId,
          ballType: typeById(formBallTypeId)?.name || "",
          cans: formCans,
          ballsPerCan: formBallsPerCan,
          balls: computedBalls,
          memo: memo,
          sourceTxId: txRef.id,
          deleted: false,
        };
        if (editingBallEntryId) {
          batch.update(doc(db, "ballEntries", editingBallEntryId), ballPayload);
        } else {
          batch.set(doc(BALL_COLLECTION), { ...ballPayload, createdAt: serverTimestamp() });
        }
      } else if (editingBallEntryId) {
        // ボール購入のチェックを外した場合は連携エントリを削除扱いに
        batch.update(doc(db, "ballEntries", editingBallEntryId), { deleted: true });
      }

      await batch.commit();

      await Promise.all([loadTransactions(), loadBallEntries(), loadPrivate()]);
      setShowForm(false);
      resetForm();
    } catch (e) {
      setErrorMsg(`保存に失敗しました（${e?.message || "不明なエラー"}）`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    const label = `${fmtDate(t.date)}「${displayMemo(t.memo)}」（${t.type === "income" ? "+" : "−"}${yen(t.amount)}）`;
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

  // ---------- 非公開データの移行（初回のみ） ----------
  // 旧バージョンで公開側（transactions）に保存していた非公開メモ・実質購入額を、
  // 管理者だけが読める privateDetails へ移し、公開側からは取り除く。何度実行しても安全。
  const handleMigratePrivate = async () => {
    if (
      !window.confirm(
        "公開側に残っている非公開メモ・実質購入額を、管理者だけが読める保存先へ移します。\n移行後は公開側から消えます。実行しますか？"
      )
    )
      return;
    setMigrating(true);
    setMigrateMsg("");
    try {
      const snap = await getDocs(TX_COLLECTION); // 削除済みの記録も含めて確認する
      const targets = snap.docs.filter((d) => {
        const x = d.data();
        return (
          (typeof x.privateMemo === "string" && x.privateMemo.trim() !== "") ||
          x.privateActualAmount != null
        );
      });
      for (let i = 0; i < targets.length; i += 200) {
        const batch = writeBatch(db);
        targets.slice(i, i + 200).forEach((d) => {
          const x = d.data();
          batch.set(
            doc(db, "privateDetails", d.id),
            {
              kind: "tx",
              privateMemo: (x.privateMemo || "").trim(),
              actualAmount: x.privateActualAmount ?? null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          batch.update(d.ref, { privateMemo: deleteField(), privateActualAmount: deleteField() });
        });
        await batch.commit();
      }
      await Promise.all([loadTransactions(), loadPrivate()]);
      setMigrateMsg(
        targets.length === 0 ? "移行する対象はありませんでした" : `${targets.length}件を移行しました`
      );
    } catch (e) {
      setMigrateMsg(`移行に失敗しました（${e?.message || "不明なエラー"}）`);
    } finally {
      setMigrating(false);
    }
  };

  // ---------- ボール使用フォーム（ボール在庫タブ） ----------

  const resetBallUseForm = () => {
    setUseDate(today());
    setUseBalls(4);
    setUseTypeId("");
    setUseMemo("");
    setUseCourtId("");
    setUseParticipantIds([]);
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
    setUseTypeId(
      b.ballTypeId && activeTypes.some((x) => x.id === b.ballTypeId) ? b.ballTypeId : ""
    );
    setUseMemo(b.memo || "");
    setUseCourtId(b.courtId || "");
    setUseParticipantIds(ballPrivateIds(b));
    setShowBallUseForm(true);
  };

  const toggleUseParticipant = (id) => {
    setUseParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveBallUse = async () => {
    setBallErrorMsg("");
    if (!Number.isInteger(useBalls) || useBalls <= 0) {
      setBallErrorMsg("球数は1以上の整数で入力してください");
      return;
    }
    if (!useTypeId) {
      setBallErrorMsg("ボールの種類を選択してください");
      return;
    }
    // 在庫を超える使用は、確認のうえで記録できる（禁止はしない）
    if (useStockAfter !== null && useStockAfter < 0) {
      const name = typeById(useTypeId)?.name || "この種類";
      const ok = window.confirm(
        `「${name}」の在庫は${useStockBefore}球ですが、${useBalls}球を使用すると${useStockAfter}球（マイナス）になります。\nこのまま記録しますか？`
      );
      if (!ok) return;
    }
    const payload = {
      date: useDate,
      kind: "use",
      ballTypeId: useTypeId,
      ballType: typeById(useTypeId)?.name || "",
      balls: useBalls,
      memo: useMemo.trim(),
      courtId: useCourtId || null,
      court: courtById(useCourtId)?.name || "",
      sourceTxId: null,
      deleted: false,
    };
    setBallSaving(true);
    try {
      const batch = writeBatch(db);
      const ref = editingUseId ? doc(db, "ballEntries", editingUseId) : doc(BALL_COLLECTION);
      if (editingUseId) {
        batch.update(ref, payload);
      } else {
        batch.set(ref, { ...payload, createdAt: serverTimestamp() });
      }
      batch.set(doc(db, "privateDetails", ref.id), {
        kind: "ball",
        participantIds: useParticipantIds,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await Promise.all([loadBallEntries(), loadPrivate()]);
      setShowBallUseForm(false);
      resetBallUseForm();
    } catch (e) {
      setBallErrorMsg(`保存に失敗しました（${e?.message || "不明なエラー"}）`);
    } finally {
      setBallSaving(false);
    }
  };

  const handleDeleteBallUse = async (b) => {
    if (!window.confirm(`この使用記録を削除しますか？\n${fmtDate(b.date)}「使用 ${b.balls}球」`)) return;
    try {
      await updateDoc(doc(db, "ballEntries", b.id), { deleted: true });
      await loadBallEntries();
    } catch (e) {
      setBallErrorMsg(`削除に失敗しました（${e?.message || "不明なエラー"}）`);
    }
  };

  // ---------- マスタ管理（ボールの種類・コート・メンバー共通） ----------

  const masterConfigs = {
    types: {
      title: "ボールの種類を管理",
      coll: "ballTypes",
      items: activeTypes,
      reload: loadBallTypes,
      placeholder: "例：ダンロップ フォート",
      deleteMessage: (m) =>
        ballEntries.some((b) => b.ballTypeId === m.id)
          ? `「${m.name}」は過去の記録で使われています。\n削除しても過去の記録・在庫は残りますが、プルダウンには出なくなります。削除しますか？`
          : `「${m.name}」を削除しますか？`,
    },
    courts: {
      title: "コートを管理",
      coll: "courts",
      items: activeCourts,
      reload: loadCourts,
      placeholder: "例：1番コート",
      deleteMessage: (m) =>
        transactions.some((t) => t.courtId === m.id) || ballEntries.some((b) => b.courtId === m.id)
          ? `「${m.name}」は過去の記録で使われています。\n削除しても過去の記録のコート名は残りますが、選択肢には出なくなります。削除しますか？`
          : `「${m.name}」を削除しますか？`,
    },
    members: {
      title: "メンバーを管理（管理者のみ表示）",
      coll: "members",
      items: activeMembers,
      valueOf: (m) => {
        const v = memberTotals[m.id] || { total: 0, count: 0 };
        return `${yen(v.total)}（${v.count}回）`;
      },
      reload: loadPrivate,
      placeholder: "例：ニックネーム",
      deleteMessage: (m) =>
        Object.values(privateMap).some((p) => (p.participantIds || []).includes(m.id))
          ? `「${m.name}」は過去の記録の参加者に入っています。\n削除しても過去の記録には残りますが、選択肢には出なくなります。削除しますか？`
          : `「${m.name}」を削除しますか？`,
    },
  };
  const master = masterModal ? masterConfigs[masterModal] : null;

  const openMaster = (key) => {
    setMasterError("");
    setMasterModal(key);
  };

  // 追加・名前変更は成功したら true を返す（モーダル側の入力欄の後始末に使う）
  const handleMasterAdd = async (raw) => {
    if (!master) return false;
    setMasterError("");
    const name = raw.trim();
    if (!name) {
      setMasterError("名前を入力してください");
      return false;
    }
    if (master.items.some((x) => x.name === name)) {
      setMasterError("同じ名前がすでにあります");
      return false;
    }
    setMasterSaving(true);
    try {
      await addDoc(collection(db, master.coll), {
        name,
        deleted: false,
        sortOrder: nextOrder(master.items),
        createdAt: serverTimestamp(),
      });
      await master.reload();
      return true;
    } catch (e) {
      setMasterError(`保存に失敗しました（${e?.message || "不明なエラー"}）`);
      return false;
    } finally {
      setMasterSaving(false);
    }
  };

  const handleMasterRename = async (item, raw) => {
    if (!master) return false;
    setMasterError("");
    const name = raw.trim();
    if (!name) {
      setMasterError("名前を入力してください");
      return false;
    }
    if (master.items.some((x) => x.id !== item.id && x.name === name)) {
      setMasterError("同じ名前がすでにあります");
      return false;
    }
    setMasterSaving(true);
    try {
      await updateDoc(doc(db, master.coll, item.id), { name });
      await master.reload();
      return true;
    } catch (e) {
      setMasterError(`保存に失敗しました（${e?.message || "不明なエラー"}）`);
      return false;
    } finally {
      setMasterSaving(false);
    }
  };

  const handleMasterDelete = async (item) => {
    if (!master) return;
    if (!window.confirm(master.deleteMessage(item))) return;
    setMasterError("");
    try {
      await updateDoc(doc(db, master.coll, item.id), { deleted: true });
      await master.reload();
    } catch (e) {
      setMasterError(`削除に失敗しました（${e?.message || "不明なエラー"}）`);
    }
  };

  // 上下に1つ動かす。表示中の全項目に 0,1,2… の順番を振り直して保存する
  const handleMasterMove = async (item, dir) => {
    if (!master) return;
    const items = master.items;
    const idx = items.findIndex((x) => x.id === item.id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    [next[idx], next[to]] = [next[to], next[idx]];
    setMasterError("");
    setMasterSaving(true);
    try {
      const batch = writeBatch(db);
      next.forEach((x, i) => batch.update(doc(db, master.coll, x.id), { sortOrder: i }));
      await batch.commit();
      await master.reload();
    } catch (e) {
      setMasterError(`並び替えに失敗しました（${e?.message || "不明なエラー"}）`);
    } finally {
      setMasterSaving(false);
    }
  };

  const sortedBallEntries = [...ballEntries].sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    const at = a.createdAt?.seconds || 0;
    const bt = b.createdAt?.seconds || 0;
    return bt - at;
  });

  const moneyGroups = groupByMonth(sorted);
  const ballGroups = groupByMonth(sortedBallEntries);

  return (
    <div className="bft-page">
      <style>{styles}</style>
      <div className="max-w-md mx-auto px-5 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="bft-muted text-xs tracking-widest uppercase mb-1">Circle Ball Fund</p>
            <h1 className="text-lg font-semibold">ボール/ボール代 残高表</h1>
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
            資金残高
          </button>
          <button
            className={`bft-tab ${activeTab === "balls" ? "active" : ""}`}
            onClick={() => setActiveTab("balls")}
          >
            <CircleDot size={14} />
            ボール在庫
          </button>
        </div>

        {activeTab === "money" ? (
          <>
            <div className="bft-card px-6 py-7 mb-6">
              <p className="bft-muted text-xs mb-2">現在の資金残高</p>
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

            {isAdmin && !loading && (
              <div className="flex gap-2 mb-6">
                <button onClick={() => openMaster("courts")} className="bft-btn-outline">
                  <Settings2 size={14} />
                  コートを管理
                </button>
                <button onClick={() => openMaster("members")} className="bft-btn-outline">
                  <Settings2 size={14} />
                  メンバーを管理
                </button>
              </div>
            )}

            {isAdmin && privateError && <p className="bft-error mb-4">{privateError}</p>}

            <div className="mb-4">
              <p className="bft-muted text-xs mb-3 tracking-wide">履歴</p>
              {!loading && sorted.length === 0 && (
                <div className="text-center py-10 text-sm bft-muted bft-card" style={{ borderStyle: "dashed" }}>
                  まだ記録がありません。
                  {isAdmin ? "最初の徴収を記帳しましょう。" : "記録が増えるとここに表示されます。"}
                </div>
              )}
              <div className="space-y-3">
                {moneyGroups.map((g, gi) => {
                  const open = moneyMonthOpen[g.key] ?? gi === 0;
                  const net = g.items.reduce(
                    (s, t) => s + (t.type === "income" ? t.amount : -t.amount),
                    0
                  );
                  return (
                    <div key={g.key}>
                      <button
                        className={`bft-month-head ${open ? "" : "closed"}`}
                        onClick={() => setMoneyMonthOpen((m) => ({ ...m, [g.key]: !open }))}
                        aria-expanded={open}
                      >
                        <span className="flex items-center gap-1.5">
                          <ChevronDown size={14} className="chev" />
                          <span className="font-medium">{monthLabel(g.key)}</span>
                          <span className="bft-muted text-xs">{g.items.length}件</span>
                        </span>
                        <span
                          className="font-mono text-xs"
                          style={{ color: net < 0 ? "#B15E2E" : "#6B8A2E" }}
                        >
                          {net < 0 ? "−" : "+"}
                          {yen(net)}
                        </span>
                      </button>
                      {open && (
                        <ul className="space-y-2">
                          {g.items.map((t) => {
                            const pv = isAdmin ? txPrivate(t) : null;
                            return (
                              <li
                                key={t.id}
                                className="bft-card flex items-center justify-between px-4 py-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: t.type === "income" ? "#8FAE3E" : "#C97B4A" }}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm truncate">{displayMemo(t.memo)}</p>
                                    <p className="bft-muted text-xs font-mono">
                                      {fmtDate(t.date)}
                                      {courtName(t) ? ` ・${courtName(t)}` : ""}
                                    </p>
                                    {pv && pv.memo && (
                                      <p className="text-xs mt-0.5 truncate" style={{ color: "#B15E2E" }}>
                                        🔒 {pv.memo}
                                      </p>
                                    )}
                                    {pv && pv.actual != null && (
                                      <p className="text-xs mt-0.5" style={{ color: "#B15E2E" }}>
                                        🔒 実質購入額 {yen(pv.actual)}
                                      </p>
                                    )}
                                    {pv && pv.participantIds.length > 0 && (
                                      <p className="text-xs mt-0.5 truncate" style={{ color: "#B15E2E" }}>
                                        🔒 参加者：{participantNames(pv.participantIds)}
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
                                      <button
                                        onClick={() => openEditForm(t)}
                                        className="bft-delete-btn"
                                        aria-label="編集"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(t)}
                                        className="bft-delete-btn"
                                        aria-label="削除"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {isAdmin && (
              <div className="text-center mt-6">
                <button
                  onClick={handleMigratePrivate}
                  disabled={migrating}
                  className="bft-delete-btn text-xs"
                  style={{ textDecoration: "underline" }}
                >
                  {migrating ? "移行中…" : "非公開データを移行（初回のみ）"}
                </button>
                {migrateMsg && <p className="bft-muted text-xs mt-1">{migrateMsg}</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bft-card px-6 py-7 mb-6">
              <p className="bft-muted text-xs mb-2">現在のニューボール在庫</p>
              {ballLoading ? (
                <div className="flex items-center gap-2 bft-muted">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">読み込み中…</span>
                </div>
              ) : (
                <>
                  <p
                    className="font-mono text-4xl font-semibold tracking-tight"
                    style={{ color: ballStock < 0 ? "#B15E2E" : "#4A7FB5" }}
                  >
                    {ballStock}
                    <span className="text-lg ml-1">球</span>
                  </p>
                  {stockByType.length > 0 && (
                    <div className="mt-4">
                      <p className="bft-muted text-xs mb-1">種類別</p>
                      {stockByType.map((r) => (
                        <div key={r.key} className="bft-stock-row">
                          <span>{r.name}</span>
                          <span
                            className="font-mono"
                            style={{ color: r.qty < 0 ? "#B15E2E" : "#4A7FB5" }}
                          >
                            {r.qty}球
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {isAdmin && (
                <p className="bft-muted text-xs mt-3">
                  購入は「資金残高」タブでボール購入として記帳すると自動で加算されます
                </p>
              )}
            </div>

            {isAdmin && !ballLoading && (
              <button onClick={openBallUseForm} className="bft-btn-primary mb-6">
                <Plus size={16} />
                使用を記録（在庫を減らす）
              </button>
            )}

            {isAdmin && !ballLoading && (
              <button
                onClick={() => openMaster("types")}
                className="bft-btn-outline mb-6"
                style={{ width: "100%", flex: "none" }}
              >
                <Settings2 size={14} />
                ボールの種類を管理
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
              <div className="space-y-3">
                {ballGroups.map((g, gi) => {
                  const open = ballMonthOpen[g.key] ?? gi === 0;
                  const net = g.items.reduce(
                    (s, b) => s + (b.kind === "purchase" ? b.balls : -b.balls),
                    0
                  );
                  return (
                    <div key={g.key}>
                      <button
                        className={`bft-month-head ${open ? "" : "closed"}`}
                        onClick={() => setBallMonthOpen((m) => ({ ...m, [g.key]: !open }))}
                        aria-expanded={open}
                      >
                        <span className="flex items-center gap-1.5">
                          <ChevronDown size={14} className="chev" />
                          <span className="font-medium">{monthLabel(g.key)}</span>
                          <span className="bft-muted text-xs">{g.items.length}件</span>
                        </span>
                        <span
                          className="font-mono text-xs"
                          style={{ color: net < 0 ? "#B15E2E" : "#4A7FB5" }}
                        >
                          {net < 0 ? "−" : "+"}
                          {Math.abs(net)}球
                        </span>
                      </button>
                      {open && (
                        <ul className="space-y-2">
                          {g.items.map((b) => {
                            const pIds = isAdmin && b.kind === "use" ? ballPrivateIds(b) : [];
                            return (
                              <li
                                key={b.id}
                                className="bft-card flex items-center justify-between px-4 py-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: b.kind === "purchase" ? "#4A7FB5" : "#8A8F87" }}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm truncate">
                                      {b.kind === "purchase"
                                        ? `購入：${entryTypeName(b)}（${b.cans}缶×${b.ballsPerCan}球）`
                                        : `使用：${entryTypeName(b)}${b.memo ? `（${b.memo}）` : ""}`}
                                    </p>
                                    <p className="bft-muted text-xs font-mono">
                                      {fmtDate(b.date)}
                                      {b.kind === "use" && courtName(b) ? ` ・${courtName(b)}` : ""}
                                    </p>
                                    {pIds.length > 0 && (
                                      <p className="text-xs mt-0.5 truncate" style={{ color: "#B15E2E" }}>
                                        🔒 参加者：{participantNames(pIds)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span
                                    className="font-mono text-sm"
                                    style={{ color: b.kind === "purchase" ? "#4A7FB5" : "#B15E2E" }}
                                  >
                                    {b.kind === "purchase" ? "+" : "−"}
                                    {b.balls}球
                                  </span>
                                  {isAdmin && b.kind === "use" && (
                                    <>
                                      <button
                                        onClick={() => openEditBallUseForm(b)}
                                        className="bft-delete-btn"
                                        aria-label="編集"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteBallUse(b)}
                                        className="bft-delete-btn"
                                        aria-label="削除"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </>
                                  )}
                                  {isAdmin && b.kind === "purchase" && (
                                    <span className="bft-muted-light" style={{ fontSize: "10px" }}>
                                      資金残高タブで編集
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
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
              <div className="bft-row2 mb-3">
                <div>
                  <label className="bft-muted text-xs block mb-1">参加人数</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={formParticipants}
                    onChange={(e) => setFormParticipants(Math.round(Number(e.target.value)))}
                    className="bft-input"
                  />
                </div>
                <div>
                  <label className="bft-muted text-xs block mb-1">単価（円）</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={formUnitPrice}
                    onChange={(e) => setFormUnitPrice(Math.round(Number(e.target.value)))}
                    className="bft-input"
                  />
                </div>
              </div>
              <p className="bft-muted text-xs mb-3 font-mono">
                {formParticipants}人 × {yen(formUnitPrice)} ={" "}
                <span style={{ color: "#6B8A2E" }}>{yen(computedIncomeAmount)}</span>
              </p>

              <label className="bft-muted text-xs block mb-1">参加者（管理者のみ表示・任意）</label>
              {membersFor(formParticipantIds).length > 0 ? (
                <MemberPicker
                  members={membersFor(formParticipantIds)}
                  selectedIds={formParticipantIds}
                  onToggle={toggleFormParticipant}
                />
              ) : (
                <p className="bft-muted text-xs mb-3">
                  「資金残高」タブの「メンバーを管理」で登録すると、ここで選べます
                </p>
              )}
              {formParticipantIds.length > 0 && (
                <p className="bft-muted text-xs mb-3 font-mono">
                  選択中 {formParticipantIds.length}人
                  {formParticipantIds.length !== formParticipants && "（参加人数と異なります）"}
                </p>
              )}

              <label className="bft-muted text-xs block mb-1">コート（任意）</label>
              <select
                value={formCourtId}
                onChange={(e) => setFormCourtId(e.target.value)}
                className="bft-input mb-3"
              >
                <option value="">選択しない</option>
                {courtOptionsFor(formCourtId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.deleted ? "（削除済み）" : ""}
                  </option>
                ))}
              </select>
              {activeCourts.length === 0 && (
                <p className="bft-muted text-xs mb-3">
                  「資金残高」タブの「コートを管理」でコートを登録すると、ここで選べます
                </p>
              )}
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

          {formType === "income" && (
            <>
              <label className="bft-muted text-xs block mb-1">摘要（空欄でも可）</label>
              <input
                type="text"
                value={formMemo}
                onChange={(e) => setFormMemo(e.target.value)}
                placeholder="例：8/3練習分"
                className="bft-input mb-3"
              />
            </>
          )}
          {formType === "expense" && (
            <p className="bft-muted text-xs mb-3">
              公開される摘要は自動で付きます（例：ダンロップHD x 1 購入）。詳細は下の摘要欄（管理者のみ表示）に書けます。
            </p>
          )}

          {formType === "expense" && (
            <>
              <label className="bft-checkbox-row">
                <input
                  type="checkbox"
                  checked={formIsBallPurchase}
                  onChange={(e) => {
                    setFormIsBallPurchase(e.target.checked);
                    if (e.target.checked) setFormIsPersonal(false);
                  }}
                />
                <span className="text-xs">この購入はボール代（在庫に反映する）</span>
              </label>
              <label className="bft-checkbox-row">
                <input
                  type="checkbox"
                  checked={formIsPersonal}
                  onChange={(e) => {
                    setFormIsPersonal(e.target.checked);
                    if (e.target.checked) setFormIsBallPurchase(false);
                  }}
                />
                <span className="text-xs">参加者私物（在庫には反映しない）</span>
              </label>

              {(formIsBallPurchase || formIsPersonal) && (
                <div className="bft-ball-fields">
                  <label className="bft-muted text-xs block mb-1">ボールの種類</label>
                  <select
                    value={formBallTypeId}
                    onChange={(e) => setFormBallTypeId(e.target.value)}
                    className="bft-input mb-3"
                  >
                    <option value="">選択してください</option>
                    {activeTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {activeTypes.length === 0 && (
                    <p className="bft-muted text-xs mb-3">
                      先に「ボール在庫」タブの「ボールの種類を管理」で種類を登録してください
                    </p>
                  )}
                  {formIsBallPurchase && (
                    <>
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
                        合計 <span style={{ color: "#4A7FB5" }}>{computedBalls}球</span> がボール在庫に加算されます
                      </p>
                    </>
                  )}
                  {formIsPersonal && (
                    <>
                      <label className="bft-muted text-xs block mb-1">球数</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={formPersonalBalls}
                        onChange={(e) => setFormPersonalBalls(Math.round(Number(e.target.value)))}
                        className="bft-input mb-2"
                      />
                      <p className="bft-muted text-xs">参加者私物として記録します（ボール在庫には加算されません）</p>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <label className="bft-muted text-xs block mb-1">
            {formType === "expense" ? "摘要（管理者のみに表示・空欄でも可）" : "非公開メモ（管理者のみに表示・空欄でも可）"}
          </label>
          <input
            type="text"
            value={formPrivateMemo}
            onChange={(e) => setFormPrivateMemo(e.target.value)}
            placeholder={formType === "expense" ? "例：@584 ○○店で購入" : "例：〇〇さん分は後日徴収予定"}
            className="bft-input mb-3"
          />

          {formType === "expense" && (
            <>
              <label className="bft-muted text-xs block mb-1">
                実質購入額（管理者のみに表示・空欄でも可）
              </label>
              <input
                type="number"
                min={0}
                value={formActualAmount}
                onChange={(e) => setFormActualAmount(e.target.value)}
                placeholder="例：2800（ポイント・割引後の支払額など）"
                className="bft-input mb-3"
              />
            </>
          )}

          {errorMsg && <p className="bft-error mb-2">{errorMsg}</p>}

          <button onClick={handleAdd} disabled={saving} className="bft-btn-primary">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {editingId ? "更新する" : "記帳する"}
          </button>
        </Modal>
      )}

      {/* マスタ管理モーダル（ボールの種類・コート・メンバー共通） */}
      {master && (
        <MasterListModal
          title={master.title}
          items={master.items}
          valueOf={master.valueOf}
          placeholder={master.placeholder}
          saving={masterSaving}
          error={masterError}
          onClose={() => setMasterModal("")}
          onAdd={handleMasterAdd}
          onRename={handleMasterRename}
          onDelete={handleMasterDelete}
          onMove={handleMasterMove}
          onClearError={() => setMasterError("")}
        />
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

          <label className="bft-muted text-xs block mb-1">コート（任意）</label>
          <select
            value={useCourtId}
            onChange={(e) => setUseCourtId(e.target.value)}
            className="bft-input mb-3"
          >
            <option value="">選択しない</option>
            {courtOptionsFor(useCourtId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.deleted ? "（削除済み）" : ""}
              </option>
            ))}
          </select>
          {activeCourts.length === 0 && (
            <p className="bft-muted text-xs mb-3">
              「資金残高」タブの「コートを管理」でコートを登録すると、ここで選べます
            </p>
          )}

          <label className="bft-muted text-xs block mb-1">参加者（管理者のみ表示・任意）</label>
          {membersFor(useParticipantIds).length > 0 ? (
            <MemberPicker
              members={membersFor(useParticipantIds)}
              selectedIds={useParticipantIds}
              onToggle={toggleUseParticipant}
            />
          ) : (
            <p className="bft-muted text-xs mb-3">
              「資金残高」タブの「メンバーを管理」で登録すると、ここで選べます
            </p>
          )}
          {useParticipantIds.length > 0 && (
            <p className="bft-muted text-xs mb-3 font-mono">選択中 {useParticipantIds.length}人</p>
          )}

          <label className="bft-muted text-xs block mb-1">ボールの種類</label>
          <select
            value={useTypeId}
            onChange={(e) => setUseTypeId(e.target.value)}
            className="bft-input mb-3"
          >
            <option value="">選択してください</option>
            {activeTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <label className="bft-muted text-xs block mb-1">使用した球数</label>
          <input
            type="number"
            min={1}
            step={1}
            value={useBalls}
            onChange={(e) => setUseBalls(Math.round(Number(e.target.value)))}
            className="bft-input mb-3"
          />

          {useStockAfter !== null && (
            <p
              className="text-xs mb-3 font-mono"
              style={{ color: useStockAfter < 0 ? "#C0392B" : "#8A8F87" }}
            >
              在庫 {useStockBefore}球 → 記録後 {useStockAfter}球
              {useStockAfter < 0 && "（在庫が足りません）"}
            </p>
          )}

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

// メンバーをタップで選ぶチップ
function MemberPicker({ members, selectedIds, onToggle }) {
  return (
    <div className="bft-chips">
      {members.map((m) => (
        <button
          type="button"
          key={m.id}
          onClick={() => onToggle(m.id)}
          className={`bft-chip ${selectedIds.includes(m.id) ? "on" : ""}`}
        >
          {m.name}
          {m.deleted ? "（削除済み）" : ""}
        </button>
      ))}
    </div>
  );
}

// 名前だけを持つ選択肢マスタ（ボールの種類・コート・メンバー）の追加・名前変更・並び替え・削除モーダル
function MasterListModal({
  title,
  items,
  valueOf,
  placeholder,
  saving,
  error,
  onClose,
  onAdd,
  onRename,
  onDelete,
  onMove,
  onClearError,
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold mb-4">{title}</h2>

      <ul className="mb-4">
        {items.length === 0 && <li className="bft-muted text-xs py-2">まだ登録されていません</li>}
        {items.map((t, index) => (
          <li key={t.id} className="bft-stock-row" style={{ alignItems: "center" }}>
            {editingId === t.id ? (
              <>
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="bft-input"
                  style={{ marginRight: "0.5rem" }}
                />
                <button
                  onClick={async () => {
                    if (await onRename(t, editingName)) setEditingId(null);
                  }}
                  disabled={saving}
                  className="text-xs"
                  style={{ color: "#6B8A2E", whiteSpace: "nowrap" }}
                >
                  保存
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 truncate">{t.name}</span>
                {valueOf && (
                  <span className="bft-muted text-xs font-mono shrink-0" style={{ marginLeft: "auto", paddingRight: "0.75rem" }}>
                    {valueOf(t)}
                  </span>
                )}
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => onMove(t, -1)}
                    disabled={saving || index === 0}
                    className="bft-move-btn"
                    aria-label="上へ"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => onMove(t, 1)}
                    disabled={saving || index === items.length - 1}
                    className="bft-move-btn"
                    aria-label="下へ"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(t.id);
                      setEditingName(t.name);
                      onClearError();
                    }}
                    className="bft-delete-btn"
                    aria-label="名前を変更"
                  >
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => onDelete(t)} className="bft-delete-btn" aria-label="削除">
                    <Trash2 size={14} />
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <label className="bft-muted text-xs block mb-1">新しく追加</label>
      <input
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder={placeholder}
        className="bft-input mb-3"
      />
      {error && <p className="bft-error mb-2">{error}</p>}
      <button
        onClick={async () => {
          if (await onAdd(newName)) setNewName("");
        }}
        disabled={saving}
        className="bft-btn-primary"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        追加する
      </button>
    </Modal>
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
