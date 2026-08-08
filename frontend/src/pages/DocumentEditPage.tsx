import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getDocument,
  getDocumentLinks,
  getDocuments,
  getLifecycles,
  getOrgUnits,
  searchPersons,
  getUsageFormPool,
  getDocumentForms,
  getAppendixPool,
  getDocumentAppendices,
  replaceDocumentAppendices,
  getDocumentAttachments,
  updateDocument,
  linkUsageForms,
  unlinkUsageForm,
  uploadIcsopPdf,
  uploadOjtAttachment,
  downloadAttachment,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { cycleCodeOf } from '../domain/cycle-codes';
import {
  LifecycleIdentity,
  lifecycleDisplayName,
  lifecycleNameOptions,
  normalizeSubcategory,
  resolveLifecycleSelection,
  subcategoriesOf,
} from '../domain/lifecycle-subcategory';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SearchCombobox, MultiSearchCombobox, type ComboOption } from '../components/SearchCombobox';
import { useToast } from '../components/useToast';
import type {
  DocumentView,
  DocumentStatus,
  DocumentListItem,
  LifecycleView,
  OrgUnitRecord,
  PersonRecord,
  UsageFormRecord,
  DocumentAttachmentRecord,
} from '../api/types';

/**
 * 編輯 ICSOP 文件與版本對照（F011＋F015 連結點）。版面權威來源：prototypes/15-document-edit.html。
 * 每個可編輯欄位並列「目前值／新值」，變更欄位標示「已變更」並可還原；儲存以新值覆蓋（UUID 不變、
 * 不留歷史）。所屬節點唯讀＋前往 DAG 畫布改派。取消還原為載入前原值。編輯側編號唯一性排除自身。
 * RBAC：ICSOP文件管理 write=ICSOPAdmin（可編輯）；read（Supervisor/DeptContact/SysAdmin）唯讀；User→403。
 *
 * 後端契約：GET :id（DocumentView，含 org 欄＋secondaryChiefIds[]＋usingDeptIds[]）、GET :id/links、
 * GET :id/attachments（既有 ICSOP PDF／OJT 檔名與 blobPath）、PATCH :id（scalar 覆寫＋links[]／
 * secondaryChiefIds[]／usingDeptIds[] 整批同步；未帶鍵＝不觸碰）。
 * 次要室長／使用部門與連結點/使用表單同採可搜尋多選（chips）；唯讀角色僅見 chips（無搜尋框/移除鈕）。
 */
const STATUS_LABEL: Record<DocumentStatus, string> = { active: '有效', inactive: '失效', void: '作廢' };
const STATUS_ORDER: DocumentStatus[] = ['active', 'inactive', 'void'];
const occupiesNumber = (s: DocumentStatus) => s === 'active' || s === 'void';

const ERROR_MSG: Record<string, string> = {
  DOCUMENT_NUMBER_DUPLICATE: '文件編號已存在（比對有效＋作廢；失效可重用）',
  DOCUMENT_REQUIRED_FIELD_MISSING: '必填欄位未填寫',
  DOCUMENT_STATUS_INVALID: '狀態值不合法',
  DOCUMENT_LINK_TARGET_NOT_FOUND: '連結目標文件不存在',
  FIELD_WRITE_FORBIDDEN: '無權修改此欄位',
  DOCUMENT_NOT_FOUND: '找不到文件',
};
const msgOf = (e: unknown) => (e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '操作失敗');

interface Draft {
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  edition: string;
  announcedDate: string;
  contentSummary: string;
  draftingCompanyId: string;
  draftingDeptId: string;
  draftingSectionId: string;
  primaryChiefId: string;
  lifecycleId: string;
  links: string[];
  /** F014 多值：當責室長-次要（employeeNo 集合，允許為空）。 */
  secondaryChiefIds: string[];
  /** F014 多值：文件使用部門（ORG_UNIT.orgCode 集合，允許為空）。 */
  usingDeptIds: string[];
}

function draftOf(v: DocumentView, links: string[]): Draft {
  return {
    status: v.status,
    documentNumber: v.documentNumber,
    documentName: v.documentName,
    edition: v.edition ?? '',
    announcedDate: v.announcedDate ? v.announcedDate.slice(0, 10) : '',
    contentSummary: v.contentSummary ?? '',
    draftingCompanyId: v.draftingCompanyId ?? '',
    draftingDeptId: v.draftingDeptId ?? '',
    draftingSectionId: v.draftingSectionId ?? '',
    primaryChiefId: v.primaryChiefId ?? '',
    lifecycleId: v.lifecycleId,
    links,
    secondaryChiefIds: [...v.secondaryChiefIds],
    usingDeptIds: [...v.usingDeptIds],
  };
}
/** draft 之陣列欄（比對與複製皆需逐一處理）。 */
const LIST_KEYS = ['links', 'secondaryChiefIds', 'usingDeptIds'] as const;
const copyDraft = (d: Draft): Draft => ({
  ...d,
  links: [...d.links],
  secondaryChiefIds: [...d.secondaryChiefIds],
  usingDeptIds: [...d.usingDeptIds],
});
const personOpt = (p: PersonRecord): ComboOption => ({
  value: p.employeeNo,
  label: p.name ? `${p.name}（${p.orgCode ?? '—'}）` : p.employeeNo,
});
const suffixOf = (full: string) => full.replace(/^ICSOP-[A-Za-z]+-/, '');

export function DocumentEditPage(): JSX.Element {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<DocumentView | null>(null);
  const [orig, setOrig] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lifecycles, setLifecycles] = useState<LifecycleView[]>([]);
  // F040 兩段式選取之 UI 狀態：第一段＝循環名稱、第二段＝該子分類列之 lifecycleId。
  const [lcNameSel, setLcNameSel] = useState('');
  const [lcSubId, setLcSubId] = useState('');
  const [subErr, setSubErr] = useState(false);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [existing, setExisting] = useState<DocumentListItem[]>([]);
  const [personResults, setPersonResults] = useState<ComboOption[]>([]);
  const [primaryChiefOrig, setPrimaryChiefOrig] = useState<ComboOption | null>(null);
  const [secondaryChiefOrig, setSecondaryChiefOrig] = useState<ComboOption[]>([]);
  const [attachments, setAttachments] = useState<DocumentAttachmentRecord[]>([]);
  const [formPool, setFormPool] = useState<UsageFormRecord[]>([]);
  const [origForms, setOrigForms] = useState<ComboOption[]>([]);
  const [draftForms, setDraftForms] = useState<ComboOption[]>([]);
  // F039 附錄：**有序**清單（載入即為後端依 sortOrder 遞增之順序；前端不再排序）。
  const [appendixPool, setAppendixPool] = useState<{ id: string; name: string }[]>([]);
  const [origAppendices, setOrigAppendices] = useState<ComboOption[]>([]);
  const [draftAppendices, setDraftAppendices] = useState<ComboOption[]>([]);
  const [busy, setBusy] = useState(false);
  /** F012 切換原因（選填；僅於狀態實際變更時顯示，儲存/取消/回原狀態時清空）。prototype 15 statusReasonWrap。 */
  const [statusReason, setStatusReason] = useState('');
  /** G-DOC-202 作廢確認 modal（切換為「作廢」屬破壞性動作，需二次確認）。 */
  const [voidConfirm, setVoidConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [v, links] = await Promise.all([getDocument(id), getDocumentLinks(id)]);
      setView(v);
      const d = draftOf(v, links.map((l) => l.targetDocumentId));
      setOrig(d);
      setDraft(copyDraft(d));
      // 輔助資料（失敗不阻擋主體）。
      void getLifecycles().then(setLifecycles).catch(() => undefined);
      void getOrgUnits().then(setOrgUnits).catch(() => undefined);
      void getDocuments({ pageSize: 2000 }).then((p) => setExisting(p.items)).catch(() => undefined);
      void getUsageFormPool().then(setFormPool).catch(() => undefined);
      void getDocumentForms(id)
        .then((fs) => {
          const opts = fs.map((f) => ({ value: f.id, label: f.name }));
          setOrigForms(opts);
          setDraftForms(opts);
        })
        .catch(() => undefined);
      void getAppendixPool().then(setAppendixPool).catch(() => undefined);
      void getDocumentAppendices(id)
        .then((axs) => {
          // 後端已依 sortOrder 遞增回傳（唯一排序權威）→ 直接沿用，不於前端再排序。
          const opts = axs.map((a) => ({ value: a.id, label: a.name }));
          setOrigAppendices(opts);
          setDraftAppendices(opts);
        })
        .catch(() => undefined);
      void getDocumentAttachments(id).then(setAttachments).catch(() => undefined);
      // 解析當責室長-主要之顯示名稱（單筆讀取僅回員編）。
      if (v.primaryChiefId) {
        void searchPersons(v.primaryChiefId, 5)
          .then((rs) => {
            const m = rs.find((p) => p.employeeNo === v.primaryChiefId);
            if (m) setPrimaryChiefOrig(personOpt(m));
          })
          .catch(() => undefined);
      }
      // 解析已載入之次要室長顯示名稱（best-effort，查無→顯示員編）。
      if (v.secondaryChiefIds.length) {
        void Promise.all(
          v.secondaryChiefIds.map(async (empNo): Promise<ComboOption> => {
            try {
              const rs = await searchPersons(empNo, 5);
              const m = rs.find((p) => p.employeeNo === empNo);
              return m ? personOpt(m) : { value: empNo, label: empNo };
            } catch {
              return { value: empNo, label: empNo };
            }
          }),
        ).then(setSecondaryChiefOrig);
      }
    } catch (e) {
      setLoadError(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  // ===== 組織三級選項（公司 ROOT → 部 DEPARTMENT → 室 SECTION）與名稱解析 =====
  const orgByCode = useMemo(() => {
    const m = new Map<string, OrgUnitRecord>();
    for (const u of orgUnits) m.set(u.orgCode, u);
    return m;
  }, [orgUnits]);
  const orgPath = useCallback(
    (code: string): string => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let cur = orgByCode.get(code);
      while (cur && !seen.has(cur.orgCode)) {
        seen.add(cur.orgCode);
        parts.unshift(cur.name);
        cur = cur.parentCode ? orgByCode.get(cur.parentCode) : undefined;
      }
      return parts.length ? parts.join(' / ') : code;
    },
    [orgByCode],
  );
  const orgName = useCallback((code: string) => orgByCode.get(code)?.name ?? code, [orgByCode]);
  const companyOptions = useMemo<ComboOption[]>(
    () => orgUnits.filter((u) => u.tier === 'ROOT').map((u) => ({ value: u.orgCode, label: u.name })),
    [orgUnits],
  );
  const deptOptions = useMemo<ComboOption[]>(
    () => orgUnits.filter((u) => u.tier === 'DEPARTMENT').map((u) => ({ value: u.orgCode, label: u.name })),
    [orgUnits],
  );
  const sectionOptions = useMemo<ComboOption[]>(
    () =>
      orgUnits
        .filter((u) => u.tier === 'SECTION' && u.parentCode === draft?.draftingDeptId)
        .map((u) => ({ value: u.orgCode, label: u.name })),
    [orgUnits, draft?.draftingDeptId],
  );
  const linkOptions = useMemo<ComboOption[]>(
    () => existing.filter((d) => d.id !== id).map((d) => ({ value: d.id, label: `${d.documentNumber} ${d.documentName}` })),
    [existing, id],
  );
  const formOptions = useMemo<ComboOption[]>(
    () => formPool.map((f) => ({ value: f.id, label: f.name })),
    [formPool],
  );
  const appendixOptions = useMemo<ComboOption[]>(
    () => appendixPool.map((a) => ({ value: a.id, label: a.name })),
    [appendixPool],
  );
  const primaryOptions = useMemo<ComboOption[]>(() => {
    if (primaryChiefOrig && !personResults.some((o) => o.value === primaryChiefOrig.value)) {
      return [primaryChiefOrig, ...personResults];
    }
    return personResults;
  }, [primaryChiefOrig, personResults]);
  /** 次要室長候選＝人員搜尋結果；已載入者之標籤自 secondaryChiefOrig 補齊。 */
  const secondaryOptions = useMemo<ComboOption[]>(() => {
    const seen = new Set(personResults.map((o) => o.value));
    return [...personResults, ...secondaryChiefOrig.filter((o) => !seen.has(o.value))];
  }, [personResults, secondaryChiefOrig]);
  /** 使用部門候選＝全部組織單位（任意層級），以「本部 / 部 / 處室 / 課」路徑呈現層級。 */
  const usingDeptOptions = useMemo<ComboOption[]>(
    () => orgUnits.map((u) => ({ value: u.orgCode, label: orgPath(u.orgCode) })),
    [orgUnits, orgPath],
  );
  const optionOf = (opts: ComboOption[], v: string): ComboOption =>
    opts.find((o) => o.value === v) ?? { value: v, label: v };

  const runPersonSearch = useCallback((q: string) => {
    void searchPersons(q).then((rs) => setPersonResults(rs.map(personOpt))).catch(() => setPersonResults([]));
  }, []);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }, []);
  const onCompanyChange = useCallback((v: string) => {
    setDraft((d) => (d ? { ...d, draftingCompanyId: v, draftingDeptId: '', draftingSectionId: '' } : d));
  }, []);
  const onDeptChange = useCallback((v: string) => {
    setDraft((d) => (d ? { ...d, draftingDeptId: v, draftingSectionId: '' } : d));
  }, []);
  /** 套用狀態：回到原狀態（未變更）時清空切換原因，避免殘留先前輸入（prototype 15 paintStatus 語意）。 */
  const applyStatus = useCallback(
    (s: DocumentStatus) => {
      setDraft((d) => (d ? { ...d, status: s } : d));
      if (orig && s === orig.status) setStatusReason('');
    },
    [orig],
  );
  /**
   * 切換狀態入口：切換為「作廢」（且目前非作廢）屬破壞性動作 → 先跳確認 modal（G-DOC-202）；
   * 其餘直接套用。確認後由 modal 之「確認」呼叫 applyStatus('void')。
   */
  const onStatusPick = useCallback(
    (s: DocumentStatus) => {
      if (s === 'void' && draft && draft.status !== 'void') {
        setVoidConfirm(true);
        return;
      }
      applyStatus(s);
    },
    [draft, applyStatus],
  );

  /**
   * F040 兩段式「所屬循環」選取（F011 AC-S1～AC-S3；prototype 15 之 #lc_name／#lc_subWrap／#lc_sub）。
   * 兩段皆為 UI 狀態；`draft.lifecycleId` 僅於解析出唯一循環時才更新，故「僅選名稱層」不會誤送出。
   */
  const lcPool = useMemo<LifecycleIdentity[]>(
    () => lifecycles.map((l) => ({ id: l.id, name: l.name, subcategory: l.subcategory ?? null })),
    [lifecycles],
  );
  const nameOptions = useMemo(() => lifecycleNameOptions(lcPool), [lcPool]);
  const subOptions = useMemo(() => subcategoriesOf(lcNameSel, lcPool), [lcNameSel, lcPool]);
  const selectedSub = useMemo(
    () => normalizeSubcategory(lcPool.find((l) => l.id === lcSubId)?.subcategory),
    [lcPool, lcSubId],
  );
  const lcSelection = useMemo(
    () => resolveLifecycleSelection(lcNameSel, selectedSub, lcPool),
    [lcNameSel, selectedSub, lcPool],
  );

  /** 載入（或儲存後重載）時由現值同步兩段式選取之初始狀態。 */
  useEffect(() => {
    const row = lcPool.find((l) => l.id === orig?.lifecycleId);
    if (!row) return;
    setLcNameSel(row.name);
    setLcSubId(normalizeSubcategory(row.subcategory) !== null ? row.id : '');
    setSubErr(false);
  }, [lcPool, orig?.lifecycleId]);

  // ===== 編號：前綴（依循環代碼）＋後段序號；編輯側唯一性排除自身 =====
  const cycleName = useMemo(
    () => lifecycles.find((l) => l.id === draft?.lifecycleId)?.name,
    [lifecycles, draft?.lifecycleId],
  );
  // AC-28：循環代碼僅依名稱推導，子分類不參與（同名三子分類代碼相同）。
  const code = cycleCodeOf(cycleName);
  const suffix = draft ? suffixOf(draft.documentNumber) : '';
  const onSuffixChange = useCallback(
    (raw: string) => {
      const c = cycleCodeOf(lifecycles.find((l) => l.id === draft?.lifecycleId)?.name);
      set('documentNumber', `ICSOP-${c}-${raw.trim()}`);
    },
    [set, lifecycles, draft?.lifecycleId],
  );
  /**
   * G-DOC-211：變更循環時，同步以新循環代碼重建 stored documentNumber（保留後段序號），
   * 避免僅更新顯示前綴而 stored 值未變、導致 display/value 脫鉤且 changed('documentNumber') 不觸發。
   */
  const onLifecycleChange = useCallback(
    (v: string) => {
      const newCode = cycleCodeOf(lifecycles.find((l) => l.id === v)?.name);
      setDraft((d) =>
        d ? { ...d, lifecycleId: v, documentNumber: `ICSOP-${newCode}-${suffixOf(d.documentNumber)}` } : d,
      );
    },
    [lifecycles],
  );

  /**
   * 第一段（名稱）變更：清空第二段；名稱底下無子分類者即刻解析為該筆 lifecycleId（AC-23），
   * 有子分類者暫不更新 `draft.lifecycleId`（待選定第二段），故僅選名稱層無法送出（AC-S1）。
   */
  const onCycleNameChange = useCallback(
    (name: string) => {
      setLcNameSel(name);
      setLcSubId('');
      setSubErr(false);
      const sel = resolveLifecycleSelection(name, null, lcPool);
      if (sel.ok) onLifecycleChange(sel.lifecycleId);
    },
    [lcPool, onLifecycleChange],
  );

  /** 第二段（子分類）變更：值即為該具體循環之 lifecycleId（AC-31）。 */
  const onCycleSubChange = useCallback(
    (v: string) => {
      setLcSubId(v);
      setSubErr(false);
      if (v) onLifecycleChange(v);
    },
    [onLifecycleChange],
  );

  /** 「還原」：連同兩段式選取狀態一併回到原值（否則名稱層會停在使用者改過的值）。 */
  const revertLifecycle = useCallback(
    (origId: string) => {
      const row = lcPool.find((l) => l.id === origId);
      setLcNameSel(row?.name ?? '');
      setLcSubId(row && normalizeSubcategory(row.subcategory) !== null ? row.id : '');
      setSubErr(false);
      onLifecycleChange(origId);
    },
    [lcPool, onLifecycleChange],
  );
  const dupHit = useMemo(() => {
    if (!draft || !orig) return undefined;
    const v = draft.documentNumber.trim();
    if (!v || v === orig.documentNumber) return undefined;
    return existing.find((d) => d.documentNumber === v && d.id !== id && occupiesNumber(d.status));
  }, [draft, orig, existing, id]);

  const changed = useCallback(
    <K extends keyof Draft>(key: K): boolean => {
      if (!draft || !orig) return false;
      // 陣列欄（links／多值）以內容比對（順序敏感），純量欄以值比對。
      if ((LIST_KEYS as readonly string[]).includes(key as string)) {
        return JSON.stringify(draft[key]) !== JSON.stringify(orig[key]);
      }
      return draft[key] !== orig[key];
    },
    [draft, orig],
  );
  const formsChanged = useMemo(
    () => JSON.stringify(draftForms.map((f) => f.value).sort()) !== JSON.stringify(origForms.map((f) => f.value).sort()),
    [draftForms, origForms],
  );
  /** ⚠ 附錄之比對**順序敏感**（純重排亦屬變更，AC-20/AC-23）；使用表單則為集合比對（無序）。 */
  const appendicesChanged = useMemo(
    () =>
      JSON.stringify(draftAppendices.map((a) => a.value)) !==
      JSON.stringify(origAppendices.map((a) => a.value)),
    [draftAppendices, origAppendices],
  );
  const changeCount = useMemo(() => {
    if (!draft || !orig) return 0;
    let c = 0;
    for (const k of Object.keys(orig) as (keyof Draft)[]) if (changed(k)) c++;
    if (formsChanged) c++;
    if (appendicesChanged) c++;
    return c;
  }, [draft, orig, changed, formsChanged, appendicesChanged]);

  /** 附錄上移／下移（AC-20）：首項上移、末項下移皆為 no-op，順序不變且不產生錯誤。 */
  const moveAppendix = useCallback((index: number, delta: number) => {
    setDraftAppendices((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }, []);

  const cancelAll = useCallback(() => {
    if (!orig) return;
    setDraft(copyDraft(orig));
    setDraftForms(origForms);
    setDraftAppendices(origAppendices);
    setStatusReason(''); // 比照 prototype 15 cancelAll 之 reasonEl.value=''。
    toast.info('已取消變更，欄位回復為編輯前原值');
  }, [orig, origForms, origAppendices, toast]);

  const save = useCallback(async () => {
    if (!draft || !orig || !canWrite) return;
    // 必填 4 核心。
    setSubErr(false);
    if (!suffix.trim() || !draft.documentName.trim() || !draft.lifecycleId || !draft.status) {
      toast.error('必填欄位未填寫（循環別／文件狀態／程序書編號／書名）');
      return;
    }
    // F011 AC-S1／AC-21：名稱底下設有子分類而未選到具體子分類 → 阻擋儲存，原文件資料完全不變。
    if (!lcSelection.ok) {
      setSubErr(true);
      // prototype 15 之內嵌提示（行 519）與 toast（行 803）**共用同一句話**，為已裁決之設計，逐字保留。
      toast.error('此循環名稱底下設有子分類，請選擇具體子分類後再送出');
      return;
    }
    if (dupHit) {
      toast.error(`此編號已被「${STATUS_LABEL[dupHit.status]}」文件（${dupHit.documentName}）佔用（DOCUMENT_NUMBER_DUPLICATE）`);
      return;
    }
    const patch: Record<string, unknown> = {};
    if (changed('status')) {
      patch.status = draft.status;
      // F012 切換原因（ruling 2）：折入同一次 PATCH；未填則不帶 reason 鍵（後端視同未填）。
      const r = statusReason.trim();
      if (r) patch.reason = r;
    }
    if (changed('documentNumber')) patch.documentNumber = draft.documentNumber;
    if (changed('documentName')) patch.documentName = draft.documentName.trim();
    if (changed('edition')) patch.edition = draft.edition || null;
    if (changed('announcedDate')) patch.announcedDate = draft.announcedDate || null;
    if (changed('contentSummary')) patch.contentSummary = draft.contentSummary || null;
    if (changed('draftingCompanyId')) patch.draftingCompanyId = draft.draftingCompanyId || null;
    if (changed('draftingDeptId')) patch.draftingDeptId = draft.draftingDeptId || null;
    if (changed('draftingSectionId')) patch.draftingSectionId = draft.draftingSectionId || null;
    if (changed('primaryChiefId')) patch.primaryChiefId = draft.primaryChiefId || null;
    if (changed('lifecycleId')) patch.lifecycleId = draft.lifecycleId;
    if (changed('links')) patch.links = draft.links;
    // F014 多值：僅實際變更時才帶鍵（未帶鍵＝後端不觸碰既有集合；空陣列＝顯式清空）。
    if (changed('secondaryChiefIds')) patch.secondaryChiefIds = draft.secondaryChiefIds;
    if (changed('usingDeptIds')) patch.usingDeptIds = draft.usingDeptIds;

    setBusy(true);
    try {
      const hasScalar = Object.keys(patch).length > 0;
      if (hasScalar) {
        const res = await updateDocument(id, patch);
        const nd = draftOf(res.document, draft.links);
        setView(res.document);
        setOrig(nd);
        setDraft(copyDraft(nd));
      }
      // F018 使用表單關聯差集（獨立端點，非 PATCH 範圍）。
      if (formsChanged) {
        const origIds = new Set(origForms.map((f) => f.value));
        const draftIds = new Set(draftForms.map((f) => f.value));
        const toAdd = draftForms.filter((f) => !origIds.has(f.value)).map((f) => f.value);
        if (toAdd.length) await linkUsageForms(id, toAdd);
        for (const f of origForms) if (!draftIds.has(f.value)) await unlinkUsageForm(id, f.value);
        setOrigForms(draftForms);
      }
      // F039（architecture-spec §3.6 決策二）：附錄以畫面最終順序**整組覆寫**（PUT replace-set），
      // 刻意**不**採使用表單之 diff-based link/unlink——後者無法表達「純重排」之最終狀態。
      if (appendicesChanged) {
        await replaceDocumentAppendices(id, draftAppendices.map((a) => a.value));
        setOrigAppendices(draftAppendices);
      }
      // 切換原因已隨 PATCH 送出並記入變更歷程 → 清空（比照 prototype 15 saveAll 之 reasonEl.value=''）。
      setStatusReason('');
      toast.success('已儲存：以新值覆蓋，UUID 不變、不留歷史版本');
    } catch (e) {
      toast.error(msgOf(e));
    } finally {
      setBusy(false);
    }
  }, [draft, orig, canWrite, suffix, dupHit, lcSelection, changed, formsChanged, origForms, draftForms, appendicesChanged, draftAppendices, id, statusReason, toast]);

  const onUpload = useCallback(
    async (kind: 'pdf' | 'ojt', file: File | null) => {
      if (!file) return;
      try {
        const rec = kind === 'pdf' ? await uploadIcsopPdf(id, file) : await uploadOjtAttachment(id, file);
        // 覆蓋式：以新列取代同型別之舊列（維持卡片顯示最新檔名/blobPath）。
        setAttachments((prev) => [...prev.filter((a) => a.type !== rec.type), rec]);
        toast.success(`已上傳「${file.name}」（覆蓋式；舊檔不再可存取）`);
      } catch (e) {
        toast.error(msgOf(e));
      }
    },
    [id, toast],
  );

  /** 附件受控下載（核發短效期 URL → 開新分頁；浮水印與否由伺服器端依 F020 決定）。 */
  const onDownloadAttachment = useCallback(async (a: DocumentAttachmentRecord) => {
    try {
      const grant = await downloadAttachment(a.blobPath);
      window.open(grant.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(msgOf(e));
    }
  }, [toast]);

  if (!canRead) {
    return <Blocked message="您無 ICSOP 文件管理權限。" />;
  }
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6" role="status">
        <div className="animate-pulse space-y-3">
          <div className="h-3 bg-slate-200 rounded w-1/3" />
          <div className="h-24 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }
  if (loadError || !draft || !orig || !view) {
    return (
      <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <Icon name="alert-circle" className="w-7 h-7 text-red-500 mx-auto mb-3" />
        <h1 className="font-semibold text-slate-900">{loadError ?? '找不到文件'}</h1>
      </div>
    );
  }

  const ro = !canWrite;
  const edition = draft.edition;
  const editionParts = (draft.edition.match(/^(\d{0,2})'(\d{0,2})$/) ?? ['', '', '']).slice(1);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        breadcrumb={['ICSOP 文件管理', '編輯']}
        title={`編輯文件 · ${view.documentNumber}`}
      >
        {canWrite && (
          <>
            <button onClick={cancelAll} className="px-3 py-1.5 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              <Icon name="save" className="w-4 h-4" />
              儲存
            </button>
          </>
        )}
      </PageHeader>

      {canWrite && changeCount > 0 && (
        <div role="status" className="bg-primary-50 border border-primary-100 text-primary-700 text-xs px-4 py-2 rounded-md flex items-center gap-2">
          <Icon name="git-compare" className="w-3.5 h-3.5" />
          <span>已變更 {changeCount} 個欄位</span>
          <span className="text-primary-400">·</span>
          <span className="text-primary-500">儲存後將以新值覆蓋，UUID 不變、不留歷史版本</span>
        </div>
      )}
      {ro && (
        <div role="note" className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色對所有文件欄位皆唯讀，附件可下載但不可上傳/取代（FIELD_WRITE_FORBIDDEN）。
        </div>
      )}
      {/* 基本資訊 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="file-text" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">基本資訊</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">每個可編輯欄位並列「目前值 / 新值」；變更欄位會標示。含數十個選項之欄位（制定室別、室長、連結點、使用表單）改為可搜尋下拉；版次採兩段輸入（年度＇序號）。</p>

        {/* UUID readonly */}
        <div className="grid grid-cols-12 gap-3 items-center py-3 border-b border-slate-100">
          <div className="col-span-12 sm:col-span-3">
            <label className="text-sm font-medium text-slate-600">系統 UUID</label>
            <div className="text-[10px] text-slate-400">系統產生 · 唯讀</div>
          </div>
          <div className="col-span-12 sm:col-span-9">
            <div className="mono text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">{view.id}</div>
          </div>
        </div>

        {/* status segmented */}
        <div className={`grid grid-cols-12 gap-3 items-start py-3 px-2 -mx-2 border-b border-slate-100 rounded-lg ${changed('status') ? 'bg-primary-50' : ''}`}>
          <div className="col-span-12 sm:col-span-3">
            <label className="text-sm font-medium text-slate-700">文件狀態 {canWrite && <span className="text-red-500">*</span>}</label>
            {changed('status') && <ChangedPill />}
          </div>
          <div className="col-span-12 sm:col-span-9">
            <div className="flex items-center gap-4">
              <div className="text-xs text-slate-400">目前：<span className="font-medium">{STATUS_LABEL[orig.status]}</span></div>
              <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    disabled={ro}
                    onClick={() => onStatusPick(s)}
                    aria-pressed={draft.status === s}
                    className={`px-3 py-1.5 border-r border-slate-300 last:border-r-0 ${draft.status === s ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-700'} disabled:opacity-60`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            {/* 切換原因（選填）：僅於狀態實際變更且可寫時顯示（prototype 15 statusReasonWrap；F012 AC）。 */}
            {canWrite && changed('status') && (
              <div className="mt-2.5">
                <label htmlFor="edStatusReason" className="block text-[11px] font-medium text-slate-500 mb-1">
                  切換原因 <span className="font-normal text-slate-400">（選填）</span>
                </label>
                <input
                  id="edStatusReason"
                  type="text"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="例：內容已過時、依法規更新、由新版取代…"
                  className="w-full sm:max-w-md px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
                <p className="text-[10px] text-slate-400 mt-1">非必填；若填寫將一併記入變更歷程（F037「文件狀態」事件）。</p>
              </div>
            )}
          </div>
        </div>

        {/* number (prefix + suffix) */}
        <DiffRow inputId="edNumber" label="ICSOP 文件編號（程序書編號）" required={canWrite} changed={changed('documentNumber') || !!dupHit} currentText={orig.documentNumber} onRevert={() => set('documentNumber', orig.documentNumber)} mono showRevert={canWrite && changed('documentNumber')}>
          <div className={`flex items-stretch rounded-md border overflow-hidden ${dupHit ? 'border-red-500' : 'border-slate-300'}`}>
            <span className="px-3 py-2 bg-slate-50 text-slate-500 text-sm mono border-r border-slate-200 whitespace-nowrap select-none">ICSOP-{code || '—'}-</span>
            <input id="edNumber" disabled={ro} value={suffix} onChange={(e) => onSuffixChange(e.target.value)} placeholder="101-1-XX" className="flex-1 min-w-0 px-3 py-2 text-sm mono focus:outline-none disabled:bg-slate-50" />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            前綴「ICSOP-{code || '—'}-」依所屬循環自動帶入、不可修改；僅需填寫後段序號。唯一性比對「有效」＋「作廢」文件（佔用中）；
            <strong className="text-slate-500">「失效」文件之編號已釋出、可重用</strong>。
          </p>
          {dupHit && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <Icon name="alert-circle" className="w-3.5 h-3.5" />
              <span>此編號已被「{STATUS_LABEL[dupHit.status]}」文件（{dupHit.documentName}）佔用（DOCUMENT_NUMBER_DUPLICATE）</span>
            </p>
          )}
        </DiffRow>

        <DiffRow inputId="edName" label="文件名稱（程序書書名）" required={canWrite} changed={changed('documentName')} currentText={orig.documentName} onRevert={() => set('documentName', orig.documentName)} showRevert={canWrite && changed('documentName')}>
          <input id="edName" disabled={ro} value={draft.documentName} onChange={(e) => set('documentName', e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm disabled:bg-slate-50" />
        </DiffRow>

        <DiffRow inputId="edEdYear" label="版次" changed={changed('edition')} currentText={orig.edition || '—'} onRevert={() => set('edition', orig.edition)} mono showRevert={canWrite && changed('edition')}>
          <div className="flex items-center gap-2">
            <div className="flex items-stretch rounded-md border border-slate-300 overflow-hidden">
              <input id="edEdYear" aria-label="版次年度" disabled={ro} value={editionParts[0]} maxLength={2} inputMode="numeric"
                onChange={(e) => { const y = e.target.value.replace(/\D/g, '').slice(0, 2); const n = editionParts[1]; set('edition', y || n ? `${y}'${n}` : ''); }}
                placeholder="YY" className="w-14 px-2 py-2 text-sm mono text-center focus:outline-none disabled:bg-slate-50" />
              <span className="px-1.5 py-2 bg-slate-50 text-slate-500 text-sm mono border-x border-slate-200 select-none">'</span>
              <input aria-label="版次序號" disabled={ro} value={editionParts[1]} maxLength={2} inputMode="numeric"
                onChange={(e) => { const n = e.target.value.replace(/\D/g, '').slice(0, 2); const y = editionParts[0]; set('edition', y || n ? `${y}'${n.padStart(n ? 2 : 0, '0')}` : ''); }}
                placeholder="NN" className="w-14 px-2 py-2 text-sm mono text-center focus:outline-none disabled:bg-slate-50" />
            </div>
            <span className="text-xs text-slate-400">顯示 <span className="mono text-slate-700">{edition || '—'}</span></span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">格式「年度＇序號」＝<span className="mono">{'{YY}'}'{'{NN}'}</span>（例：<span className="mono">26'01</span>）。</p>
        </DiffRow>

        <DiffRow inputId="edDate" label="公告日期" changed={changed('announcedDate')} currentText={orig.announcedDate || '—'} onRevert={() => set('announcedDate', orig.announcedDate)} mono showRevert={canWrite && changed('announcedDate')}>
          <input id="edDate" type="date" disabled={ro} value={draft.announcedDate} onChange={(e) => set('announcedDate', e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm disabled:bg-slate-50" />
        </DiffRow>

        <DiffRow inputId="edSummary" label="內容摘要" changed={changed('contentSummary')} currentText={orig.contentSummary || '—'} onRevert={() => set('contentSummary', orig.contentSummary)} wrap showRevert={canWrite && changed('contentSummary')}>
          <textarea id="edSummary" rows={3} disabled={ro} value={draft.contentSummary} onChange={(e) => set('contentSummary', e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm resize-y disabled:bg-slate-50" />
        </DiffRow>
      </section>

      {/* 制定組織與當責室長 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="building-2" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">制定組織與當責室長</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">制定組織為三級相依（由上而下）：公司 → 部門 → 室別；變更上層將清空下層。當責室長保留。</p>
        <div className="space-y-4">
          <ComboDiff label="制定公司" changed={changed('draftingCompanyId')} currentText={orig.draftingCompanyId ? orgName(orig.draftingCompanyId) : '—'}>
            <SearchCombobox id="edCompany" label={<span className="sr-only">制定公司</span>} options={companyOptions} value={draft.draftingCompanyId} onChange={onCompanyChange} disabled={ro} placeholder="搜尋制定公司…" />
          </ComboDiff>
          <ComboDiff label="制定部門" changed={changed('draftingDeptId')} currentText={orig.draftingDeptId ? orgName(orig.draftingDeptId) : '—'}>
            <SearchCombobox id="edDept" label={<span className="sr-only">制定部門</span>} options={deptOptions} value={draft.draftingDeptId} onChange={onDeptChange} disabled={ro || !draft.draftingCompanyId} placeholder={draft.draftingCompanyId ? '搜尋制定部門…' : '請先選擇制定公司'} />
          </ComboDiff>
          <ComboDiff label="制定室別" changed={changed('draftingSectionId')} currentText={orig.draftingSectionId ? orgName(orig.draftingSectionId) : '—'}>
            <SearchCombobox id="edSection" label={<span className="sr-only">制定室別</span>} options={sectionOptions} value={draft.draftingSectionId} onChange={(v) => set('draftingSectionId', v)} disabled={ro || !draft.draftingDeptId || sectionOptions.length === 0} placeholder={!draft.draftingDeptId ? '請先選擇制定部門' : sectionOptions.length === 0 ? '此部之下無處/室（留空）' : '搜尋制定室別…'} />
          </ComboDiff>
        </div>

        <div className="mt-4">
          <ComboDiff label="當責室長-主要" changed={changed('primaryChiefId')} currentText={primaryChiefOrig?.label ?? (orig.primaryChiefId || '—')}>
            <SearchCombobox id="edPrimaryChief" label={<span className="sr-only">當責室長-主要</span>} options={primaryOptions} value={draft.primaryChiefId} onChange={(v) => set('primaryChiefId', v)} onQueryChange={runPersonSearch} disabled={ro} placeholder="搜尋室長姓名/員編…" />
          </ComboDiff>
        </div>

        {/* 當責室長-次要（F014 多值，可搜尋多選；唯讀角色僅見 chips） */}
        <div className="mt-4 py-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">當責室長-次要（可多位，允許為空）</span>
            {changed('secondaryChiefIds') && <ChangedPill />}
          </div>
          {canWrite ? (
            <MultiSearchCombobox
              id="edSecondaryChiefs"
              label={<span className="sr-only">當責室長-次要（可多位，允許為空）</span>}
              options={secondaryOptions}
              values={draft.secondaryChiefIds.map((v) => optionOf(secondaryOptions, v))}
              onAdd={(opt) => set('secondaryChiefIds', [...draft.secondaryChiefIds, opt.value])}
              onRemove={(v) => set('secondaryChiefIds', draft.secondaryChiefIds.filter((x) => x !== v))}
              onQueryChange={runPersonSearch}
              placeholder="搜尋並新增次要室長…"
              emptyChipText="（無次要室長，允許為空）"
            />
          ) : (
            <ReadonlyChips
              values={draft.secondaryChiefIds.map((v) => optionOf(secondaryOptions, v))}
              emptyText="（無次要室長，允許為空）"
            />
          )}
        </div>

        {/* 文件使用部門（F014 多值，任意層級） */}
        <div className="py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-slate-700">文件使用部門（0..*）</span>
            {changed('usingDeptIds') && <ChangedPill />}
          </div>
          <p className="text-xs text-slate-500 mb-2 flex items-start gap-1.5">
            <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-600" />
            <span>
              可指定任意層級（本部／部／處室／課）；清單以「本部 / 部 / 處室 / 課」路徑呈現層級關係，
              <strong className="text-slate-700">選擇上層將自動涵蓋其下所有單位</strong>（權限判定時自動展開子樹）。
            </span>
          </p>
          {canWrite ? (
            <MultiSearchCombobox
              id="edUsingDepts"
              label={<span className="sr-only">文件使用部門（0..*）</span>}
              options={usingDeptOptions}
              values={draft.usingDeptIds.map((v) => optionOf(usingDeptOptions, v))}
              onAdd={(opt) => set('usingDeptIds', [...draft.usingDeptIds, opt.value])}
              onRemove={(v) => set('usingDeptIds', draft.usingDeptIds.filter((x) => x !== v))}
              placeholder="搜尋並新增使用部門…"
              emptyChipText="（未指定使用部門）"
            />
          ) : (
            <ReadonlyChips
              values={draft.usingDeptIds.map((v) => optionOf(usingDeptOptions, v))}
              emptyText="（未指定使用部門）"
            />
          )}
        </div>
      </section>

      {/* 循環與節點歸屬 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="workflow" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">循環與節點歸屬</h2>
        </div>
        {/* F040 兩段式選取（prototype 15）：目前值與選項字串皆經 lifecycleDisplayName（AC-S2）。 */}
        <DiffRow
          inputId="lc_name"
          label="所屬循環（循環別）"
          required={canWrite}
          changed={changed('lifecycleId')}
          currentText={
            lifecycleDisplayName(lifecycles.find((l) => l.id === orig.lifecycleId)) ||
            orig.lifecycleId
          }
          onRevert={() => revertLifecycle(orig.lifecycleId)}
          showRevert={canWrite && changed('lifecycleId')}
        >
          <select
            id="lc_name"
            aria-label="所屬循環－循環名稱"
            disabled={ro}
            value={lcNameSel}
            onChange={(e) => onCycleNameChange(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white disabled:bg-slate-50"
          >
            {!nameOptions.includes(lcNameSel) && <option value={lcNameSel}>{lcNameSel}</option>}
            {nameOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {/* 第二段採條件式渲染：名稱底下無子分類時不呈現（AC-23／AC-S3）。 */}
          {subOptions.length > 0 && (
            <div id="lc_subWrap" className="mt-2">
              <select
                id="lc_sub"
                aria-label="所屬循環－子分類"
                disabled={ro}
                value={lcSubId}
                onChange={(e) => onCycleSubChange(e.target.value)}
                className={`w-full px-3 py-2 rounded-md border text-sm bg-white disabled:bg-slate-50 ${subErr ? 'border-red-500' : 'border-slate-300'}`}
              >
                <option value="">請選擇子分類</option>
                {subOptions.map((l) => (
                  <option key={l.id} value={l.id}>{lifecycleDisplayName(l)}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                此循環名稱底下設有子分類，須選到具體子分類才能定位唯一循環（各子分類為
                <strong className="text-slate-500">彼此獨立的循環</strong>）。
              </p>
            </div>
          )}
          {subErr && (
            <p id="lc_subErr" className="mt-1 text-xs text-red-600 flex items-start gap-1">
              <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                此循環名稱底下設有子分類，請選擇具體子分類後再送出（LIFECYCLE_SUBCATEGORY_REQUIRED）
              </span>
            </p>
          )}
        </DiffRow>
        {/* node readonly + jump */}
        <div className="grid grid-cols-12 gap-3 items-center py-3">
          <div className="col-span-12 sm:col-span-3">
            <label className="text-sm font-medium text-slate-600">所屬節點</label>
            <div className="text-[10px] text-slate-400">唯讀 · 由節點抽屜維護</div>
          </div>
          <div className="col-span-12 sm:col-span-9 flex items-center gap-2">
            <div className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 flex items-center gap-2">
              <Icon name="git-commit-vertical" className="w-4 h-4 text-slate-400" />
              {view.nodeName ? <span>{view.nodeName}</span> : view.nodeId ? <span className="mono">{view.nodeId}</span> : '未指派'}
            </div>
            <button onClick={() => navigate(`/admin/lifecycles/${draft.lifecycleId}/canvas`)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 text-sm text-primary-600 hover:bg-primary-50">
              <Icon name="external-link" className="w-4 h-4" />前往畫布改派
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 -mt-1 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-0.5" />「所屬節點」為唯讀顯示；變更節點須至 DAG 畫布，透過節點抽屜改派（唯一權威寫入路徑）。
        </p>
      </section>

      {/* 連結點（F015） */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="link" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">文件連結點</h2>
          {changed('links') && <ChangedPill />}
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5" />連結至其他 ICSOP 文件（編號＋名稱），可多個、允許為空；選項可能達數十筆，故以可搜尋下拉選取。
        </p>
        {canWrite ? (
          <MultiSearchCombobox
            id="edLinks"
            label={<span className="sr-only">文件連結點</span>}
            options={linkOptions.filter((o) => !draft.links.includes(o.value))}
            values={draft.links.map((v) => linkOptions.find((o) => o.value === v) ?? { value: v, label: v })}
            onAdd={(opt) => canWrite && set('links', [...draft.links, opt.value])}
            onRemove={(v) => canWrite && set('links', draft.links.filter((x) => x !== v))}
            placeholder="搜尋要連結的 ICSOP 文件（編號/名稱）…"
            emptyChipText="（尚無連結點，允許為空）"
          />
        ) : (
          <ReadonlyChips
            values={draft.links.map((v) => linkOptions.find((o) => o.value === v) ?? { value: v, label: v })}
            emptyText="（尚無連結點，允許為空）"
          />
        )}
      </section>

      {/* 附件 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">附件</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5" />允許格式：ICSOP PDF／OJT＝.pdf/.jpg/.png、ICSOP 原始檔＝.xls；單檔上限 50MB（OQ-E04-06 定案）。上傳為覆蓋式（舊檔不再可存取）。
        </p>
        {/* OQ-E09-10：ICSOP PDF（呈現用）與 ICSOP 原始檔 .xls（AI 檢索來源）各自獨立上傳、不自動轉檔（比照建立頁）。 */}
        <div className="flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50/40 px-3 py-2.5 mb-4 text-[11px] text-slate-600">
          <Icon name="info" className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" />
          <span>
            <strong className="text-slate-800">ICSOP PDF（呈現／下載用）與 ICSOP 原始檔 .xls（AI 智慧問答檢索來源）為兩個各自獨立的上傳</strong>，系統
            <strong className="text-slate-800">不自動轉檔</strong>（OQ-E09-10 定案）；兩者內容一致性由 ICSOP 管理員負責維護。
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <ReplaceCard
            title="ICSOP PDF（呈現用，1 份，覆蓋式）"
            accept=".pdf,.jpg,.jpeg,.png"
            disabled={ro}
            existing={attachments.find((a) => a.type === 'ICSOP_PDF') ?? null}
            onDownload={onDownloadAttachment}
            onSelect={(f) => void onUpload('pdf', f)}
          />
          <ReplaceCard
            title="OJT 實體簽到表（1 份，覆蓋式）"
            accept=".pdf,.jpg,.jpeg,.png"
            disabled={ro}
            existing={attachments.find((a) => a.type === 'OJT_SIGNIN') ?? null}
            onDownload={onDownloadAttachment}
            onSelect={(f) => void onUpload('ojt', f)}
          />
          {/* ICSOP 原始檔 .xls：保存待 AI 索引管線（F027/F029）就緒；本輪停用（比照建立頁佔位卡，copy 一致）。 */}
          <div
            className="border border-dashed border-primary-200 rounded-lg p-4 text-center bg-primary-50/20 opacity-60 sm:col-span-2"
            title="ICSOP 原始檔 .xls 之保存待 AI 索引管線（F027/F029）就緒"
          >
            <Icon name="file-spreadsheet" className="w-6 h-6 text-primary-400 mx-auto mb-1.5" />
            <div className="text-sm font-medium text-slate-500">上傳 ICSOP 原始檔（.xls，1 份）</div>
            <div className="text-xs text-slate-400 mt-1">待 AI 索引管線就緒（F027/F029）</div>
          </div>
        </div>
      </section>

      {/* 使用表單（F018） */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="files" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">使用表單</h2>
          <span className="text-xs text-slate-400">（自「使用表單管理」表單池選取）</span>
          {formsChanged && <ChangedPill />}
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5" />此處為「選取關聯」而非上傳；表單本體於「使用表單管理」維護。可多選、允許為空；前台詳情頁可個別下載（下載寫入稽核）。
        </p>
        {canWrite ? (
          <MultiSearchCombobox
            id="edForms"
            label={<span className="sr-only">使用表單</span>}
            options={formOptions.filter((o) => !draftForms.some((f) => f.value === o.value))}
            values={draftForms}
            onAdd={(opt) => canWrite && setDraftForms((prev) => [...prev, opt])}
            onRemove={(v) => canWrite && setDraftForms((prev) => prev.filter((o) => o.value !== v))}
            placeholder="搜尋並選取使用表單（自表單池）…"
            emptyChipText="（尚無使用表單，允許為空）"
          />
        ) : (
          <ReadonlyChips values={draftForms} emptyText="（尚無使用表單，允許為空）" />
        )}
      </section>

      {/* 附錄（F039；prototype 15「附錄」section） */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">附錄</h2>
          <span className="text-xs text-slate-400">（自「附錄管理」附錄池選取）</span>
          {appendicesChanged && <ChangedPill />}
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            此處為「選取關聯」而非上傳；附錄本體於「附錄管理」維護。可多選、允許為空；
            <strong className="text-slate-500">新選取者一律加入末位</strong>
            ，以「上移／下移」調整顯示順序（<strong className="text-slate-500">不支援拖曳</strong>
            ），解除其中一筆後其餘相對順序不變、重新編號為連續 1..N；前台與後台詳情頁一律依此順序呈現，
            可個別下載（下載寫入稽核）。
          </span>
        </p>
        {canWrite ? (
          <MultiSearchCombobox
            id="edAppendices"
            label={<span className="sr-only">附錄</span>}
            options={appendixOptions.filter((o) => !draftAppendices.some((a) => a.value === o.value))}
            values={draftAppendices}
            onAdd={(opt) => setDraftAppendices((prev) => [...prev, opt])}
            onRemove={(v) => setDraftAppendices((prev) => prev.filter((o) => o.value !== v))}
            placeholder="搜尋並選取附錄（自附錄池）…"
            emptyChipText="（尚無附錄，允許為空）"
            orderable
            onMoveUp={(i) => moveAppendix(i, -1)}
            onMoveDown={(i) => moveAppendix(i, 1)}
            removeTitle="解除此附錄關聯"
            itemIcon={(o) => (/\.pdf$/i.test(o.label) ? 'file-text' : 'file-spreadsheet')}
          />
        ) : (
          <ReadonlyOrderedAppendices
            values={draftAppendices}
            emptyText="（尚無附錄，允許為空）"
          />
        )}
      </section>

      <div className="h-4" />

      {/* G-DOC-202：切換為「作廢」之確認 modal（破壞性動作二次確認；逐字比對 prototype 15 confirmModal）。 */}
      {voidConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">切換為「作廢」？</h3>
                <p className="text-sm text-slate-500 mt-1">作廢後前台將立即隱藏此文件。此動作可再切回其他狀態。</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setVoidConfirm(false)} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
                取消
              </button>
              <button
                onClick={() => { applyStatus('void'); setVoidConfirm(false); }}
                className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 目前值／新值並列之通用列（scalar 欄位）。 */
function DiffRow({
  inputId, label, required, changed, currentText, onRevert, showRevert, mono, wrap, children,
}: {
  inputId: string; label: string; required?: boolean; changed: boolean;
  currentText: string; onRevert?: () => void; showRevert?: boolean;
  mono?: boolean; wrap?: boolean; children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={`grid grid-cols-12 gap-3 items-start py-3 px-2 -mx-2 border-b border-slate-100 rounded-lg ${changed ? 'bg-primary-50' : ''}`}>
      <div className="col-span-12 sm:col-span-3">
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {changed && <ChangedPill />}
      </div>
      <div className="col-span-12 sm:col-span-9 grid sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-slate-400 mb-1">目前值</div>
          <div className={`text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 ${mono ? 'mono' : ''} ${wrap ? 'whitespace-pre-wrap' : 'truncate'}`}>{currentText}</div>
        </div>
        <div>
          <div className="text-[10px] text-primary-600 mb-1 flex items-center justify-between">
            <span>新值</span>
            {showRevert && onRevert && (
              <button onClick={onRevert} className="text-[10px] text-slate-400 hover:text-primary-600">還原</button>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * 組織/室長可搜尋欄之「目前值 / 新值」全寬對照列（G-DOC-203）：與純量 DiffRow 同版面
 * （grid-cols-12：label 佔 3 欄，目前值｜新值 佔 9 欄），新值控制為 children＝SearchCombobox。
 */
function ComboDiff({ label, changed, currentText, children }: {
  label: string; changed: boolean; currentText: string; children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={`grid grid-cols-12 gap-3 items-start py-3 px-2 -mx-2 border-b border-slate-100 rounded-lg ${changed ? 'bg-primary-50' : ''}`}>
      <div className="col-span-12 sm:col-span-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {changed && <ChangedPill />}
      </div>
      <div className="col-span-12 sm:col-span-9 grid sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-slate-400 mb-1">目前值</div>
          <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 truncate">{currentText}</div>
        </div>
        <div>
          <div className="text-[10px] text-primary-600 mb-1">新值</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function ChangedPill(): JSX.Element {
  return <span className="ml-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-primary-700">已變更</span>;
}

/**
 * 唯讀有序附錄清單（F039）：唯讀角色僅見序號＋名稱，無搜尋框、無上移／下移／解除入口。
 * DOM 標記沿用 prototype 15 之 data-appendix-* 契約（與 e2e fidelity 斷言一致）。
 */
function ReadonlyOrderedAppendices({ values, emptyText }: {
  values: ComboOption[]; emptyText: string;
}): JSX.Element {
  if (values.length === 0) {
    return <span className="text-xs text-slate-400">{emptyText}</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {values.map((v, i) => (
        <div
          key={v.value}
          data-appendix-item=""
          data-appendix-order={i + 1}
          className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"
        >
          <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <Icon
            name={/\.pdf$/i.test(v.label) ? 'file-text' : 'file-spreadsheet'}
            className="w-4 h-4 text-slate-400 shrink-0"
          />
          <span data-appendix-name className="text-sm text-slate-700 flex-1 truncate">
            {v.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 唯讀多值 chips（唯讀角色：prototype 15 之 write-only 入口不顯示，僅保留 chips）。 */
function ReadonlyChips({ values, emptyText }: {
  values: ComboOption[]; emptyText: string;
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {values.length ? (
        values.map((v) => (
          <span key={v.value} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">
            {v.label}
          </span>
        ))
      ) : (
        <span className="text-xs text-slate-400">{emptyText}</span>
      )}
    </div>
  );
}

/**
 * 附件卡（prototype 15）：現有檔名 ＋「下載」＋「取代」。
 * 尚未上傳 → 無檔名列與下載鈕；唯讀角色 → 無「取代」入口（write-only）。
 */
function ReplaceCard({ title, accept, disabled, existing, onDownload, onSelect }: {
  title: string; accept: string; disabled?: boolean;
  existing: DocumentAttachmentRecord | null;
  onDownload: (a: DocumentAttachmentRecord) => void;
  onSelect: (f: File | null) => void;
}): JSX.Element {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="text-xs font-medium text-slate-500 mb-2">{title}</div>
      {existing && (
        <div className="flex items-center gap-2">
          <Icon name="file-text" className="w-5 h-5 text-red-500" />
          <span className="text-sm text-slate-700 truncate flex-1">{existing.fileName}</span>
        </div>
      )}
      <div className="flex gap-2 mt-3">
        {existing && (
          <button
            onClick={() => onDownload(existing)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs hover:bg-slate-50"
          >
            <Icon name="download" className="w-3.5 h-3.5" />下載
          </button>
        )}
        {!disabled && (
          <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs hover:bg-slate-50 cursor-pointer">
            <Icon name="upload" className="w-3.5 h-3.5" />取代
            <input type="file" accept={accept} aria-label={`上傳取代 ${title}`} className="hidden" onChange={(e) => onSelect(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>
    </div>
  );
}

function Blocked({ message }: { message: string }): JSX.Element {
  return (
    <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
        <Icon name="lock" className="w-7 h-7 text-red-500" />
      </div>
      <h1 className="font-semibold text-slate-900">無文件管理權限</h1>
      <p className="text-sm text-slate-500 mt-1">{message}</p>
      <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
    </div>
  );
}
