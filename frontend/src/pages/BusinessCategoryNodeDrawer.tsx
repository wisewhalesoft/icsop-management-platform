import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBusinessCategoryNodeDrawer,
  mountBusinessCategoryDoc,
  unmountBusinessCategoryDoc,
  updateBusinessCategoryNode,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/useToast';
import type {
  BusinessCategoryCandidateDoc,
  BusinessCategoryMountedDoc,
  BusinessCategoryNodeDrawerData,
  BusinessCategoryOtherMount,
} from '../api/types';

/** 循環別篩選下拉之單一選項（後端 `candidateLifecycles` 之元素）。 */
type CandidateLifecycleOption = NonNullable<
  BusinessCategoryNodeDrawerData['candidateLifecycles']
>[number];

/**
 * F043 §丙 業務/功能類別節點抽屜。版面權威＝`prototypes/28-business-category-node-drawer.html`
 * （鏡射 `12-node-drawer.html`）。
 *
 * 🔴🔴 **本頁與 F009 節點抽屜之兩處刻意差異，就是本功能存在的理由**（§A.8.2）：
 *  ① **候選＝全部 ICSOP 文件**（`AC-20`）——`12` 以 `lifecycleId` 過濾（僅同循環之文件）並在畫面上
 *     說「僅顯示所屬循環＝…」；本頁**不以任何循環條件過濾**，且每列候選標出其循環別（純資訊 chip），
 *     使「沒有過濾」肉眼可見。
 *  ② **無警示、無二次確認、無改派**（`AC-21`～`AC-23`）——掛載為 M:N，「已掛在別處」不是需要確認的
 *     例外而是正常狀態。取而代之的是**純資訊**標示，逐字 `此文件另掛於：{類別}／{節點}`。
 *     🔴 全檔**明文禁止**出現字串「已掛載於」與「改派」（`AC-21` 之負向斷言以此為載體）；
 *     標示刻意用「**另**掛於」而非「已掛載於」，正是為了不撞上該斷言。
 *
 * 🔴 架構決策（§14.9）：**不重用** `NodeDrawer.tsx`——它的改派警示 UI 是本功能明文不存在的行為，
 *    共用元件會把已被推翻的語意帶回來。
 * 🔴 本 aside **刻意不掛 `role="dialog"`**：`AC-21` 之可測形狀為「選取候選後**不彈出任何確認對話框**」
 *    （`queryByRole('dialog') === null`）；抽屜自己若宣稱是 dialog，那條斷言就永遠測不到真正的東西。
 */

interface DDoc {
  id: string;
  number: string;
  name: string;
  /** 🔴 純資訊、不參與過濾（`AC-20`）。 */
  lifecycleName: string | null;
  /** 已掛在其他類別／節點之清單（純資訊，`AC-21`～`AC-23`）。 */
  otherMounts: BusinessCategoryOtherMount[];
}

/**
 * 🔴 **後端之 `candidates` 依 `AC-20` 為「全部 ICSOP 文件」，因此會包含已掛於本節點者**
 * ——去重責任在前端。合併規則：以 `id` 為鍵，`mounted` 先入，候選同 id 者**只補上**其純資訊欄位
 * （循環別、另掛於），**不新增第二筆**。
 *
 * 🔴 這正是 2026-09-03 使用者實機揪到的缺陷：F009 單一歸屬模型下「候選必不含已掛載者」之前提
 * 在 M:N 下**不成立**，天真的 `[...mounted, ...candidates]` 會讓同一份文件在抽屜出現兩次
 * （「目前掛載文件 4 份」而畫布徽章寫 2），並讓 React 噴 `two children with the same key`。
 * ⚠ 合併時**不得**讓候選那一份覆蓋掉掛載身分——身分由 `baseline` 集合單獨承載，見 `baseline`。
 */
export function mergeDrawerDocs(
  mounted: BusinessCategoryMountedDoc[],
  candidates: BusinessCategoryCandidateDoc[],
): DDoc[] {
  const byId = new Map<string, DDoc>();
  for (const m of mounted) {
    byId.set(m.id, {
      id: m.id,
      number: m.documentNumber,
      name: m.documentName,
      lifecycleName: null,
      otherMounts: [],
    });
  }
  for (const c of candidates) {
    const existing = byId.get(c.id);
    if (existing) {
      // 已掛於本節點者：只補純資訊欄位（移除掛載後它會回到候選區，那時才需要這些欄位）。
      existing.lifecycleName = c.lifecycleName;
      existing.otherMounts = c.otherMounts ?? [];
      continue;
    }
    byId.set(c.id, {
      id: c.id,
      number: c.documentNumber,
      name: c.documentName,
      lifecycleName: c.lifecycleName,
      otherMounts: c.otherMounts ?? [],
    });
  }
  return [...byId.values()];
}

/** `AC-21`～`AC-23`／§A.8.4 N13：純資訊標示之逐字組字點（多筆以全形頓號相接）。 */
export function otherMountText(mounts: BusinessCategoryOtherMount[]): string {
  return `此文件另掛於：${mounts
    .map((m) => `${m.businessCategoryDisplayName}／${m.nodeName ?? '未命名節點'}`)
    .join('、')}`;
}

export function BusinessCategoryNodeDrawer({
  businessCategoryId,
  nodeId,
  canWrite,
  onClose,
  onNodeRenamed,
  onChanged,
}: {
  businessCategoryId: string;
  nodeId: string;
  canWrite: boolean;
  onClose: () => void;
  onNodeRenamed: (nodeId: string, name: string) => void;
  onChanged: () => void;
}): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [kw, setKw] = useState('');
  const [docs, setDocs] = useState<DDoc[]>([]);
  /**
   * 🔴 **已持久化之掛載集合**（載入當下後端回傳之 `mounted`）——`pending` 與送出之 diff **一律以它為基準**。
   * ⚠ 刻意獨立於 `docs`：把「是不是已掛載」寄生在合併後的清單上，就會像本次缺陷那樣被重複列污染
   * （載入後未做任何互動卻顯示「待送出：新增掛載 2 筆」）。
   */
  const [baseline, setBaseline] = useState<Set<string>>(new Set());
  /** 草稿：目前（含未送出之變更）掛於本節點之文件 id 集合。 */
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  /**
   * 🔴 候選之**全量統計**與**當前頁載入筆數**——三者皆為載入當下之事實，各自獨立持有。
   * `candidateTotal`／`candidateLifecycleCount` **一律取自後端**（見 `BusinessCategoryNodeDrawerData`
   * 之註解：由前端推導會把 591 份講成 22 份、把 7 個循環講成 1 個）；`candidateLoaded` 則是
   * 誠實揭露「這份清單是分頁的」所需之另一個數字。
   */
  const [candidateTotal, setCandidateTotal] = useState<number | null>(null);
  const [candidateLifecycleCount, setCandidateLifecycleCount] = useState<number | null>(null);
  const [candidateLoaded, setCandidateLoaded] = useState(0);
  /**
   * 🔒 **使用者主動選擇**之循環別（`''`＝全部循環）。
   * `AC-20` 禁的是「系統靜默地只給同循環文件」；本狀態唯一的寫入者是使用者的下拉互動，
   * **不得**由節點／類別推導初值——那會把 `AC-20` 從後門推翻。
   */
  const [selectedLifecycleId, setSelectedLifecycleId] = useState('');
  /** 下拉選項來源：後端「未套用使用者篩選」之全集分組（🔴 不得由當前頁 `docs` 推導）。 */
  const [candidateLifecycles, setCandidateLifecycles] = useState<CandidateLifecycleOption[]>([]);
  /**
   * 🔴 **當前回應**所回傳之候選 id（＝目前篩選條件下應可見者）。
   * `docs` 是**累積**的（見載入 effect），故必須另外持有「這一次查到的是哪些」，
   * 否則切換循環別時清單不會收斂。
   */
  const [visibleCandidateIds, setVisibleCandidateIds] = useState<Set<string>>(new Set());
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(true);
  }, []);

  /** 已完成首次載入之 (類別, 節點)——用以區分「首載」與「循環別重新查詢」。 */
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        /**
         * 🔴 `AC-20`：未選任何循環時，引數**恰為** (businessCategoryId, nodeId)，
         * 連 `undefined` 都不傳——不得夾帶任何系統自行推導之循環鍵。
         * 🔒 選了循環才帶第三引數：那是**使用者主動**縮小範圍，與 `AC-20` 所禁之
         * 「系統靜默過濾」是兩件事，故鍵名逐字為 `userSelectedLifecycleId`。
         */
        const d = selectedLifecycleId
          ? await getBusinessCategoryNodeDrawer(businessCategoryId, nodeId, selectedLifecycleId)
          : await getBusinessCategoryNodeDrawer(businessCategoryId, nodeId);
        if (!alive) return;
        const fresh = mergeDrawerDocs(d.mounted ?? [], d.candidates ?? []);
        const key = `${businessCategoryId}\0${nodeId}`;
        if (loadedKey.current !== key) {
          loadedKey.current = key;
          const mountedIds = new Set((d.mounted ?? []).map((m) => m.id));
          setName(d.node.name ?? '');
          setOriginalName(d.node.name ?? '');
          setDocs(fresh);
          setBaseline(mountedIds);
          setDraft(new Set(mountedIds));
          setSelectedLifecycleId(''); // 換節點 → 篩選歸零（首次載入時為 no-op）
        } else {
          /**
           * 🔴 循環別之重新查詢**只併入新認識的文件**，不動節點名稱／`baseline`／`draft`。
           * 天真地整份取代會讓使用者「先選了幾份候選、再換循環別去找更多」時，**已選但不屬於
           * 新循環的那幾份從 `docs` 消失** ⇒ 既不顯示於「目前掛載文件」、送出時也不在 `toMount`
           * 內——一個沒有任何錯誤訊息的靜默資料遺失（同理，重新查詢若覆寫 `name`，使用者尚未
           * 送出的改名也會被吞掉）。
           */
          setDocs((prev) => {
            const byId = new Map(prev.map((x) => [x.id, x]));
            for (const x of fresh) if (!byId.has(x.id)) byId.set(x.id, x);
            return [...byId.values()];
          });
        }
        setVisibleCandidateIds(new Set((d.candidates ?? []).map((c) => c.id)));
        setCandidateTotal(d.candidateTotal ?? null);
        setCandidateLifecycleCount(d.candidateLifecycleCount ?? null);
        setCandidateLoaded((d.candidates ?? []).length);
        setCandidateLifecycles(d.candidateLifecycles ?? []);
      } catch (e) {
        if (alive) toast.error(e instanceof ApiError ? e.code : '載入失敗');
      }
    })();
    return () => {
      alive = false;
    };
    // toast 為 provider 之穩定 API，刻意不入依賴（比照既有 NodeDrawer）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessCategoryId, nodeId, selectedLifecycleId]);

  const cancel = useCallback(() => {
    onNodeRenamed(nodeId, originalName.trim() || '未命名節點'); // 還原畫布即時預覽
    onClose();
  }, [nodeId, originalName, onNodeRenamed, onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [cancel]);

  const onNameChange = useCallback(
    (v: string) => {
      if (!canWrite) return;
      setName(v);
      onNodeRenamed(nodeId, v.trim() || '未命名節點'); // 即時反映於畫布
    },
    [canWrite, nodeId, onNodeRenamed],
  );

  /**
   * 🔴 `AC-21`～`AC-23`：選取候選 → **直接完成掛載**（草稿）。
   * 無警示、無二次確認、無改派語意——即使該文件已掛在其他類別／節點亦然。
   */
  const selectCandidate = useCallback(
    (id: string) => {
      if (!canWrite) return;
      setDraft((s) => new Set(s).add(id));
    },
    [canWrite],
  );

  const unmount = useCallback((id: string) => {
    setDraft((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  const mountedDocs = useMemo(() => docs.filter((d) => draft.has(d.id)), [docs, draft]);
  const candidates = useMemo(() => {
    const q = kw.trim().toLowerCase();
    // `AC-28`：搜尋比對＝documentNumber ∪ documentName 之 contains（記憶體 includes 天然字面安全）。
    return docs
      .filter((d) => !draft.has(d.id))
      /**
       * 🔒 `baseline` 亦視為可見：載入當時已掛於本節點者不在候選回應內，但使用者把它移除後
       * 必須看得到、也才回得去（＝新增本篩選前之既有行為，一格未變）。
       */
      .filter((d) => visibleCandidateIds.has(d.id) || baseline.has(d.id))
      .filter((d) => !q || d.number.toLowerCase().includes(q) || d.name.toLowerCase().includes(q));
  }, [docs, draft, kw, visibleCandidateIds, baseline]);

  const pending = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const id of draft) if (!baseline.has(id)) added += 1;
    for (const id of baseline) if (!draft.has(id)) removed += 1;
    return { added, removed };
  }, [baseline, draft]);

  /**
   * `AC-30`：掛載／移除各自為**獨立之原子動作**——逐筆送出，各寫入一筆結構變更事件；
   * 🔴 **不得**把「移除 A ＋ 新增 B」合併成一次改派（那會憑空捏造兩者間並不存在的因果關係）。
   */
  const save = useCallback(async () => {
    if (!canWrite) return;
    const toUnmount = docs.filter((d) => baseline.has(d.id) && !draft.has(d.id));
    const toMount = docs.filter((d) => !baseline.has(d.id) && draft.has(d.id));
    setSaving(true);
    try {
      if (name.trim() !== originalName.trim()) {
        await updateBusinessCategoryNode(businessCategoryId, nodeId, { name: name.trim() });
      }
      for (const d of toUnmount) await unmountBusinessCategoryDoc(businessCategoryId, nodeId, d.id);
      for (const d of toMount) await mountBusinessCategoryDoc(businessCategoryId, nodeId, d.id);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.code : '儲存失敗');
      setSaving(false);
    }
  }, [canWrite, docs, draft, baseline, name, originalName, businessCategoryId, nodeId, onChanged, onClose, toast]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={cancel} />
      <aside
        aria-label="節點維護"
        className={`fixed top-0 right-0 z-50 h-full w-[420px] max-w-full bg-white shadow-2xl flex flex-col transition-transform duration-300 ${entered ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="git-commit-vertical" className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-slate-900">節點維護</h3>
          </div>
          <button onClick={cancel} aria-label="關閉" className="text-slate-400 hover:text-slate-600">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-5">
          {/* 節點名稱 */}
          <div>
            <label htmlFor="bcNdName" className="block text-sm font-medium text-slate-700 mb-1">
              節點名稱
            </label>
            <input
              id="bcNdName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              readOnly={!canWrite}
              placeholder="輸入節點名稱"
              className={`w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600 ${canWrite ? '' : 'bg-slate-50'}`}
            />
            {canWrite && <p className="text-xs text-slate-400 mt-1">變更會即時反映於左側畫布。</p>}
          </div>

          {/* 目前掛載文件 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">目前掛載文件</span>
              <span className="text-xs text-slate-400">{mountedDocs.length} 份</span>
            </div>
            {/*
              🔵 環之新契約（`BusinessCategoryNodeDrawer.test.tsx`）：容器掛鉤 ＋ 機器可讀列數。
              🔒 兩者與可見之「{N} 份」為**同一個** `mountedDocs.length`，不得各自算一次。
            */}
            <div className="space-y-2" data-mounted-list="" data-mounted-count={mountedDocs.length}>
              {mountedDocs.length > 0 ? (
                mountedDocs.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                    <Icon name="file-check-2" className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="mono text-xs text-slate-500">{d.number}</div>
                      <div className="text-sm text-slate-800 truncate">{d.name}</div>
                    </div>
                    {canWrite && (
                      <button
                        onClick={() => unmount(d.id)}
                        aria-label="移除掛載"
                        title={`移除掛載：${d.name}`}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                // `AC-29` 逐字空狀態。
                <div
                  data-mounted-empty=""
                  className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center"
                >
                  尚未掛載任何程序書
                </div>
              )}
            </div>
          </div>

          {/* 候選文件 */}
          <div>
            <span className="text-sm font-medium text-slate-700 mb-1.5 block">候選文件</span>
            {/* 🔴 差異 ①：本段取代 `12` 的「僅顯示所屬循環＝…」提示——兩頁在此處刻意說相反的事。 */}
            {/*
              🔴 兩個數字一律取自後端之**全量**統計；🔒 **明文禁止**改回 `docs.length` 或
              `new Set(docs.map(...))`——本句的用途是**證明候選不以循環過濾**（`AC-20`），
              由當前頁推導只會看到 1 個循環，反而像是「候選被循環過濾了」（2026-09-03 真實缺陷）。
              ⚠ 候選是**分頁**的，故另外揭露「目前已載入」——舊文案只寫「共 N 份」而 N 取自當前頁，
              在真庫上是一句假話。
            */}
            <div data-candidate-scope-note="" className="flex items-start gap-1.5 text-xs text-slate-400 mb-2">
              <Icon name="layers" className="w-3.5 h-3.5 mt-0.5" />
              <span>
                候選＝<span className="text-slate-600">全部 ICSOP 文件</span>
                {candidateTotal !== null && candidateLifecycleCount !== null && (
                  <>
                    （共 <span className="text-slate-600">{candidateTotal}</span> 份，分屬{' '}
                    <span className="text-slate-600">{candidateLifecycleCount}</span> 個相異循環）
                  </>
                )}
                。<strong className="text-slate-500">不以循環過濾</strong>
                ，也不因該文件已掛在其他節點或其他業務/功能類別而排除——一份文件可同時歸屬多個業務/功能類別。
                本清單<strong className="text-slate-500">分頁載入</strong>：目前已載入{' '}
                <span className="text-slate-600" data-candidate-loaded={candidateLoaded}>
                  {candidateLoaded}
                </span>{' '}
                份，請用上方搜尋縮小範圍。
              </span>
            </div>
            {/*
              🔴 循環別篩選（2026-09-03 第三個 delta）。
              候選依 `documentNumber` 排序，而文件編號第 2 段即循環代碼 ⇒ 依編號排序＝依循環分群；
              真庫 591 份／14 個循環而本抽屜只取第一頁，第一頁幾乎全部落在同一個循環，其餘只能靠
              關鍵字搜到 ⇒ 使用者需要能自己挑循環。
              🔒 選項來自後端之 `candidateLifecycles`（未套用本篩選之全集分組），**不得**由當前頁
              `candidates` 推導——那只會列出頁內僅有的那 1 個循環，恰好把本功能存在的理由消滅掉。
              🔒 這是**使用者主動**縮小範圍，與 `AC-20` 所禁之「系統靜默只給同循環文件」是兩件事；
              未選時（`''`）完全不送出任何循環參數，行為與本篩選存在之前逐位元組相同。
              ⚠ 選項文字**不帶筆數**——比照本 repo 唯一先例 `ChangeHistoryPage.tsx` 之循環別下拉。
            */}
            <div className="relative mb-2">
              <Icon name="filter" className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <select
                value={selectedLifecycleId}
                onChange={(e) => setSelectedLifecycleId(e.target.value)}
                aria-label="循環別篩選"
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-sm bg-white"
              >
                <option value="">全部循環</option>
                {candidateLifecycles.map((lc) => (
                  <option key={lc.lifecycleId} value={lc.lifecycleId}>
                    {lc.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative mb-2">
              <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                placeholder="搜尋候選文件…"
                aria-label="搜尋候選文件"
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-sm"
              />
            </div>
            {candidates.length === 0 ? (
              // `AC-28` 逐字空狀態（**非錯誤**）。
              <div data-candidate-empty="" className="text-center border border-dashed border-slate-200 rounded-lg px-3 py-6">
                <Icon name="inbox" className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                <p className="text-sm text-slate-500">尚無可掛載文件</p>
              </div>
            ) : (
              <ul className="space-y-2 list-none p-0 m-0">
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    onClick={() => selectCandidate(c.id)}
                    className={`flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-primary-300 ${canWrite ? 'cursor-pointer' : ''}`}
                  >
                    <Icon name="file-text" className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="mono text-xs text-slate-500">{c.number}</div>
                      <div className="text-sm text-slate-700 truncate">{c.name}</div>
                      {/* 🔴 循環別為**純資訊 chip**（不參與過濾）：讓「沒有以循環過濾」肉眼可見。 */}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                          {c.lifecycleName ?? '未指定循環'}
                        </span>
                      </div>
                      {/* 🔴 差異 ②：純資訊「另掛於」標示（中性色、不擋操作、不觸發任何確認）。 */}
                      {c.otherMounts.length > 0 && (
                        <div
                          data-also-mounted=""
                          className="mt-1 flex items-start gap-1 text-[11px] text-slate-500"
                        >
                          <Icon name="info" className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{otherMountText(c.otherMounts)}</span>
                        </div>
                      )}
                    </div>
                    {canWrite && <Icon name="plus-circle" className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 p-3 flex items-center justify-between shrink-0 bg-white">
          <span className="text-xs text-slate-400">
            {pending.added || pending.removed
              ? `待送出：新增掛載 ${pending.added} 筆 · 移除掛載 ${pending.removed} 筆`
              : canWrite
                ? '關閉即送出變更'
                : '唯讀模式'}
          </span>
          <div className="flex gap-2">
            <button onClick={cancel} className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
              取消
            </button>
            {canWrite && (
              <button
                onClick={() => void save()}
                disabled={saving}
                className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                儲存並關閉
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
