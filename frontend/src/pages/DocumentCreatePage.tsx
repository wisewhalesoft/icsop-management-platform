import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getLifecycles,
  getDocuments,
  createDocument,
  updateDocument,
  getOrgUnits,
  getCompanies,
  searchPersons,
  getUsageFormPool,
  linkUsageForms,
  getAppendixPool,
  replaceDocumentAppendices,
  uploadIcsopPdf,
  uploadOjtAttachment,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { cycleCodeOf } from '../domain/cycle-codes';
import { usageFormOptionLabel } from '../domain/usage-form-label';
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
import { EditionInput } from '../components/EditionInput';
import { SearchCombobox, MultiSearchCombobox, type ComboOption } from '../components/SearchCombobox';
import { useToast } from '../components/useToast';
import type {
  LifecycleView,
  DocumentListItem,
  DocumentStatus,
  OrgUnitRecord,
  CompanyRecord,
  PersonRecord,
  UsageFormRecord,
  AppendixRecord,
} from '../api/types';

/** 人員 → 下拉選項（label＝姓名（部門碼），value＝員工編號）。 */
function personOpt(p: PersonRecord): ComboOption {
  return {
    value: p.employeeNo,
    label: p.name ? `${p.name}（${p.orgCode ?? '—'}）` : p.employeeNo,
  };
}

/**
 * 建立 ICSOP 文件（F010）。版面權威來源：prototypes/14-document-create.html。
 * 分步結構：STEP1 循環與節點歸屬（先填，決定編號前綴並解鎖後續）→ STEP2 基本資訊
 * （UUID 唯讀／狀態／編號前綴+後段序號+即時唯一性／名稱／版次 YY'NN／公告日／摘要）。
 * STEP3 制定組織與當責室長、STEP4 附件與關聯文件＝待 F014/F015/F016/F018 後端，本輪標示為後續步驟。
 * 建立時 4 核心必填：循環別／文件狀態／文件編號／文件名稱。RBAC：ICSOP文件管理 write（ICSOPAdmin）。
 */
const ERROR_MSG: Record<string, string> = {
  DOCUMENT_REQUIRED_FIELD_MISSING: '必填欄位未填寫',
  DOCUMENT_NUMBER_DUPLICATE: '文件編號已存在（比對有效＋作廢；失效可重用）',
  DOCUMENT_STATUS_INVALID: '狀態值不合法',
  FIELD_WRITE_FORBIDDEN: '無權修改此欄位',
};
const msgOf = (e: unknown) => (e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '建立失敗');

const STATUS_ZH: Record<DocumentStatus, string> = { active: '有效', inactive: '失效', void: '作廢' };
/** OQ-E04-01b：僅「有效」＋「作廢」佔用編號；「失效」已釋出、可重用。 */
const occupiesNumber = (s: DocumentStatus) => s === 'active' || s === 'void';

export function DocumentCreatePage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const canWrite = canPerform(user?.roleCode, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');

  const [lifecycles, setLifecycles] = useState<LifecycleView[]>([]);
  const [existing, setExisting] = useState<DocumentListItem[]>([]);
  /**
   * F040 兩段式「所屬循環」選取（純前端 UI 狀態；送出前解析為單一 lifecycleId）：
   *  - cycleName＝第一段（名稱字串，不送往後端）
   *  - cycleSubId＝第二段（該子分類列之 lifecycleId）
   */
  const [cycleName, setCycleName] = useState('');
  const [cycleSubId, setCycleSubId] = useState('');
  const [subErr, setSubErr] = useState(false);
  const [status, setStatus] = useState<DocumentStatus>('active');
  const [numberSuffix, setNumberSuffix] = useState('');
  const [documentName, setDocumentName] = useState('');
  // F011 AC-D7 ②：版次改由共用元件 EditionInput 持有兩段狀態與補零；本頁只保留最終字串。
  const [edition, setEdition] = useState('');
  /**
   * 「重設」用之 remount 鍵。`EditionInput` 之兩段顯示值為其自有 state、**刻意不回讀
   * `defaultValue`**（F011 `AC-D2-003`：每次 render 反解就是把補零 bug 換個地方重演），
   * 故本頁單靠 `setEdition('')` **清不掉已輸入的兩段數字**。重設時遞增本鍵令其重新掛載，
   * 回到 `defaultValue={null}` 之初始空狀態——與其他欄位之重設語意一致。
   */
  const [editionResetKey, setEditionResetKey] = useState(0);
  const [announcedDate, setAnnouncedDate] = useState('');
  const [contentSummary, setContentSummary] = useState('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  // STEP3 制定組織與當責室長（F014）。
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  /**
   * 🔴 B 階段（多公司）：公司主檔（`GET /companies`），取代舊版以 `tier='ROOT'` 之 org-unit
   * 充當公司清單之作法——四家公司之 Root 代碼**皆為 `00000`**（各公司獨立編碼），
   * 舊作法會產生多個值相同、標籤不同的選項；且 **AE 根本沒有 Root 列**，該公司使用者
   * 連制定公司都選不出來。
   */
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  /**
   * 🔴 B 階段（多公司）：本狀態承載的是**公司代碼**（`AS`／`AD`…），非 `ORG_UNIT.orgCode`。
   * 舊版以 ROOT 節點之 orgCode（`00000`）充當，兩種語意混用；`ICSOP_DOCUMENT` 於 B 階段
   * 新增 `companyCode` 欄位後即應分離：
   *  - `companyCode`（本狀態）→ 決定文件所屬公司，**即「制定公司」本身**（2026-08-27 裁定）。
   *  - 原先並存的 `draftingCompanyId`（該公司 ROOT 之 orgCode）已整個移除。
   */
  const [companyCode, setCompanyCode] = useState('');
  const [draftingDeptId, setDraftingDeptId] = useState('');
  const [draftingSectionId, setDraftingSectionId] = useState('');
  const [primaryChief, setPrimaryChief] = useState<ComboOption | null>(null);
  const [secondaryChiefs, setSecondaryChiefs] = useState<ComboOption[]>([]);
  const [usingDepts, setUsingDepts] = useState<ComboOption[]>([]);
  const [personResults, setPersonResults] = useState<ComboOption[]>([]);

  // STEP4 附件與關聯文件（F010/F016/F015/F018）。
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [ojtFile, setOjtFile] = useState<File | null>(null);
  const [formPool, setFormPool] = useState<UsageFormRecord[]>([]);
  const [selectedForms, setSelectedForms] = useState<ComboOption[]>([]);
  // F039 附錄：已選清單為**有序**清單（新選取者加入末位，以上移／下移調整；不支援拖曳）。
  const [appendixPool, setAppendixPool] = useState<AppendixRecord[]>([]);
  const [selectedAppendices, setSelectedAppendices] = useState<ComboOption[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<ComboOption[]>([]);

  useEffect(() => {
    if (!canWrite) return;
    void getLifecycles()
      .then((lcs) => setLifecycles(lcs.filter((l) => l.status === 'active')))
      .catch(() => toast.error('無法載入循環清單'));
    void getDocuments()
      .then((p) => setExisting(p.items))
      .catch(() => {
        /* 唯一性即時檢查為輔助；載入失敗不阻擋（後端 F013 為權威把關） */
      });
    // 🔴 B 階段（多公司）：公司主檔一次載入（變動頻率極低）；組織資料改為**依所選公司**
    // 於下方另一個 effect 載入——不可再無參數呼叫 getOrgUnits()，那會固定取登入者自己公司的組織，
    // 使「替其他公司建立文件」時部門下拉列出錯誤公司的部門。
    void Promise.resolve(getCompanies())
      .then((rows) => setCompanies(rows ?? []))
      .catch(() => toast.error('無法載入公司清單'));
    // F018：使用表單池（自「使用表單管理」選取關聯，非於此上傳）。
    void getUsageFormPool()
      .then(setFormPool)
      .catch(() => {
        /* 表單池載入失敗不阻擋建立（選填關聯） */
      });
    // F039：附錄池（自「附錄管理」選取關聯，非於此上傳）。
    void getAppendixPool()
      .then(setAppendixPool)
      .catch(() => {
        /* 附錄池載入失敗不阻擋建立（選填關聯） */
      });
  }, [canWrite, toast]);

  /**
   * 🔴 B 階段（多公司）：組織資料依**所選制定公司**載入。
   * 未選公司 → 清空（部門/室別下拉本就 disabled，不需資料）。
   * 變更公司 → 重新載入該公司組織；下層已選值由 `onCompanyChange` 清空。
   */
  useEffect(() => {
    if (!canWrite) return;
    if (!companyCode) {
      setOrgUnits([]);
      return;
    }
    let cancelled = false;
    void Promise.resolve(getOrgUnits(companyCode))
      .then((rows) => {
        if (!cancelled) setOrgUnits(rows ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error('無法載入組織資料');
      });
    return () => {
      cancelled = true;
    };
  }, [canWrite, companyCode, toast]);

  // F040 選取池（LifecycleView → LifecycleIdentity；subcategory 缺鍵＝無子分類）。
  const lcPool = useMemo<LifecycleIdentity[]>(
    () => lifecycles.map((l) => ({ id: l.id, name: l.name, subcategory: l.subcategory ?? null })),
    [lifecycles],
  );
  const nameOptions = useMemo(() => lifecycleNameOptions(lcPool), [lcPool]);
  const subOptions = useMemo(() => subcategoriesOf(cycleName, lcPool), [cycleName, lcPool]);
  // 目前選取之子分類字串（未選或無子分類層 → null）。
  const selectedSub = useMemo(
    () => normalizeSubcategory(lcPool.find((l) => l.id === cycleSubId)?.subcategory),
    [lcPool, cycleSubId],
  );
  const selection = useMemo(
    () => resolveLifecycleSelection(cycleName, selectedSub, lcPool),
    [cycleName, selectedSub, lcPool],
  );

  // AC-28：循環代碼僅依**名稱**推導，子分類不參與；故名稱一選定即可帶入前綴並解除 gating。
  const code = cycleCodeOf(cycleName);
  const gated = !cycleName;
  const prefix = code ? `ICSOP-${code}-` : 'ICSOP-—-';
  const suffix = numberSuffix.trim();
  const fullNumber = suffix ? (code ? `ICSOP-${code}-${suffix}` : suffix) : '';

  const dupHit = useMemo(
    () => (fullNumber ? existing.find((d) => d.documentNumber === fullNumber && occupiesNumber(d.status)) : undefined),
    [fullNumber, existing],
  );

  // ===== F014 制定組織三級（公司 ROOT → 部 DEPARTMENT → 室 SECTION）與使用部門選項 =====
  const orgByCode = useMemo(() => {
    const m = new Map<string, OrgUnitRecord>();
    for (const u of orgUnits) m.set(u.orgCode, u);
    return m;
  }, [orgUnits]);
  const orgPath = useCallback(
    (u: OrgUnitRecord): string => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let cur: OrgUnitRecord | undefined = u;
      while (cur && !seen.has(cur.orgCode)) {
        seen.add(cur.orgCode);
        parts.unshift(cur.name);
        cur = cur.parentCode ? orgByCode.get(cur.parentCode) : undefined;
      }
      return parts.join(' / ');
    },
    [orgByCode],
  );
  // 🔴 B 階段：來源為公司主檔（companyCode↔companyName），非 org-unit 之 ROOT 列。
  const companyOptions = useMemo<ComboOption[]>(
    () => companies.map((c) => ({ value: c.companyCode, label: c.companyName })),
    [companies],
  );
  const deptOptions = useMemo<ComboOption[]>(
    () => orgUnits.filter((u) => u.tier === 'DEPARTMENT').map((u) => ({ value: u.orgCode, label: u.name })),
    [orgUnits],
  );
  const sectionOptions = useMemo<ComboOption[]>(
    () =>
      orgUnits
        .filter((u) => u.tier === 'SECTION' && u.parentCode === draftingDeptId)
        .map((u) => ({ value: u.orgCode, label: u.name })),
    [orgUnits, draftingDeptId],
  );
  const usingDeptOptions = useMemo<ComboOption[]>(
    () => orgUnits.map((u) => ({ value: u.orgCode, label: orgPath(u) })),
    [orgUnits, orgPath],
  );

  // 制定公司 label（供使用部門/室別 disabled 提示）與 section 有無。
  const deptHasNoSection = !!draftingDeptId && sectionOptions.length === 0;

  // 三級由上而下相依：變更上層即清空下層已選值（AC「變更上層時清空下層」）。
  const onCompanyChange = useCallback((v: string) => {
    setCompanyCode(v);
    setDraftingDeptId('');
    setDraftingSectionId('');
  }, []);
  const onDeptChange = useCallback((v: string) => {
    setDraftingDeptId(v);
    setDraftingSectionId('');
  }, []);

  // 人員搜尋（當責室長候選；後端 /persons/search 僅回在職）。
  const runPersonSearch = useCallback((q: string) => {
    void searchPersons(q)
      .then((rs) => setPersonResults(rs.map(personOpt)))
      .catch(() => setPersonResults([]));
  }, []);

  // AC：選定制定室別後，以該單位 managerEmpNo 帶入「當責室長-主要」預設候選；
  // 離職者不在 searchActive 結果 → 不帶入（欄位維持空白）。僅在使用者尚未選擇時帶入。
  const onSectionChange = useCallback(
    (v: string) => {
      setDraftingSectionId(v);
      const sec = orgByCode.get(v);
      if (!v || !sec?.managerEmpNo) return;
      const empNo = sec.managerEmpNo;
      void searchPersons(empNo, 5)
        .then((rs) => {
          const match = rs.find((p) => p.employeeNo === empNo);
          if (match) setPrimaryChief((cur) => cur ?? personOpt(match));
        })
        .catch(() => undefined);
    },
    [orgByCode],
  );

  // 主要室長之候選需含目前已選（避免搜尋結果替換後 label 消失）。
  const primaryOptions = useMemo<ComboOption[]>(() => {
    if (primaryChief && !personResults.some((o) => o.value === primaryChief.value)) {
      return [primaryChief, ...personResults];
    }
    return personResults;
  }, [primaryChief, personResults]);

  // STEP4：文件連結點選項（既有 ICSOP 文件，value=id、label=編號+書名）與使用表單池選項。
  const linkOptions = useMemo<ComboOption[]>(
    () => existing.map((d) => ({ value: d.id, label: `${d.documentNumber} ${d.documentName}` })),
    [existing],
  );
  /**
   * F018 使用表單選項：label 一律經 `usageFormOptionLabel()`（`{編號} {名稱}`／無編號僅名稱），
   * 與 F017 後台清單之「使用表單」篩選同一組字點。
   *
   * 🔴 2026-08-26 使用者回報：本處原本只給 `f.name`——池裡的編號早已存在（F018 `AC-D2`），
   * 但新增／編輯文件時既看不到編號、也**搜不到編號**（`MultiSearchCombobox` 以 label 過濾），
   * 同名不同編號之表單在此完全無法區分。
   */
  const formOptions = useMemo<ComboOption[]>(
    () => formPool.map((f) => ({ value: f.id, label: usageFormOptionLabel(f) })),
    [formPool],
  );
  const appendixOptions = useMemo<ComboOption[]>(
    () => appendixPool.map((a) => ({ value: a.id, label: a.name })),
    [appendixPool],
  );

  /** 附錄上移／下移（AC-20）：首項上移、末項下移皆為 no-op，順序不變且不產生錯誤。 */
  const moveAppendix = useCallback((index: number, delta: number) => {
    setSelectedAppendices((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    // F040：兩段式選取一併清空（名稱層、子分類層與其錯誤提示）。
    setCycleName('');
    setCycleSubId('');
    setSubErr(false);
    setStatus('active');
    setNumberSuffix('');
    setDocumentName('');
    setEdition('');
    setEditionResetKey((k) => k + 1);
    setAnnouncedDate('');
    setContentSummary('');
    setCompanyCode('');
    setDraftingDeptId('');
    setDraftingSectionId('');
    setPrimaryChief(null);
    setSecondaryChiefs([]);
    setUsingDepts([]);
    setPersonResults([]);
    setPdfFile(null);
    setOjtFile(null);
    setSelectedForms([]);
    setSelectedAppendices([]);
    setSelectedLinks([]);
    setErrors({});
  }, []);

  const submit = useCallback(async () => {
    setSubErr(false);
    const req = { lifecycleId: !cycleName, documentNumber: !suffix, documentName: !documentName.trim() };
    setErrors(req);
    if (req.lifecycleId || req.documentNumber || req.documentName) {
      // AC-24：未選循環＝既有必填缺漏路徑（DOCUMENT_REQUIRED_FIELD_MISSING），**不**顯示 LIFECYCLE_SUBCATEGORY_REQUIRED。
      toast.error('必填欄位未填寫（僅 循環別／文件狀態／文件編號／文件名稱 為必填）');
      return;
    }
    // F010 AC-S1／AC-21：名稱底下設有子分類而未選到具體子分類 → 阻擋送出（不發出請求）。
    if (!selection.ok) {
      setSubErr(true);
      // prototype 14 之內嵌提示與 toast **共用同一句話**，為已裁決之設計，逐字保留。
      toast.error('此循環名稱底下設有子分類，請選擇具體子分類後再送出');
      return;
    }
    if (dupHit) {
      toast.error(`此編號已被「${STATUS_ZH[dupHit.status]}」文件（${dupHit.documentName}）佔用（DOCUMENT_NUMBER_DUPLICATE）`);
      return;
    }
    setBusy(true);
    try {
      const created = await createDocument({
        // AC-24 裁決 1：payload 之「所屬循環」恆僅 lifecycleId 一欄（不新增 lifecycleName／subcategory）。
        lifecycleId: selection.lifecycleId,
        status,
        documentNumber: fullNumber,
        documentName: documentName.trim(),
        ...(edition ? { edition } : {}),
        ...(announcedDate ? { announcedDate } : {}),
        ...(contentSummary.trim() ? { contentSummary: contentSummary.trim() } : {}),
        // F014 制定組織/當責室長/使用部門（皆選填；空值不送出，由後端正規化為空集合）。
        // 🔴 2026-08-27 裁定：制定公司只剩 companyCode 一欄（原本同時送出的
        //    `draftingCompanyId`＝該公司 ROOT 之 orgCode 已自 DB 與 API 移除）。
        ...(companyCode ? { companyCode } : {}),
        ...(draftingDeptId ? { draftingDeptId } : {}),
        ...(draftingSectionId ? { draftingSectionId } : {}),
        ...(primaryChief ? { primaryChiefId: primaryChief.value } : {}),
        ...(secondaryChiefs.length ? { secondaryChiefIds: secondaryChiefs.map((c) => c.value) } : {}),
        ...(usingDepts.length ? { usingDeptIds: usingDepts.map((d) => d.value) } : {}),
      });
      // STEP4 後續步驟：文件建立後方有 UUID，依序上傳附件、關聯使用表單、建立連結點（F016/F018/F015）。
      const newId = created?.id;
      if (newId) {
        if (pdfFile) await uploadIcsopPdf(newId, pdfFile);
        if (ojtFile) await uploadOjtAttachment(newId, ojtFile);
        if (selectedForms.length) await linkUsageForms(newId, selectedForms.map((f) => f.value));
        // F039（architecture-spec §3.6 決策二）：以畫面最終順序**整組覆寫**（PUT replace-set），
        // sortOrder 由後端依陣列索引重寫為 1..N；刻意不走 POST 附加端點。
        if (selectedAppendices.length) {
          await replaceDocumentAppendices(newId, selectedAppendices.map((a) => a.value));
        }
        if (selectedLinks.length) await updateDocument(newId, { links: selectedLinks.map((l) => l.value) });
      }
      navigate('/admin/documents');
    } catch (e) {
      toast.error(msgOf(e));
    } finally {
      setBusy(false);
    }
  }, [
    cycleName,
    selection,
    suffix,
    documentName,
    dupHit,
    status,
    fullNumber,
    edition,
    announcedDate,
    contentSummary,
    companyCode,
    draftingDeptId,
    draftingSectionId,
    primaryChief,
    secondaryChiefs,
    usingDepts,
    pdfFile,
    ojtFile,
    selectedForms,
    selectedAppendices,
    selectedLinks,
    navigate,
    toast,
  ]);

  if (!canWrite) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無建立文件權限</h1>
        <p className="text-sm text-slate-500 mt-1">僅 ICSOP 管理員可建立文件。</p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const badge = (n: number, active: boolean) => (
    <span className={`w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0 ${active ? 'bg-primary-600' : 'bg-slate-300'}`}>
      {n}
    </span>
  );
  /**
   * G-DOC-101：制定組織三級 label 前之編號徽章（1/2/3，編碼由上而下相依）。
   * aria-hidden：純視覺裝飾，不併入 label 可及名稱（維持 getByLabelText('制定部門') 精確比對）。
   */
  const orgNumBadge = (n: number) => (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold mr-1"
    >
      {n}
    </span>
  );
  const gatedCls = gated ? 'opacity-50 pointer-events-none' : '';

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader breadcrumb={[{ label: 'ICSOP 文件管理', to: '/admin/documents' }, { label: '建立' }]} title="建立 ICSOP 文件">
        <button onClick={reset} className="px-3 py-1.5 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
          重設
        </button>
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          <Icon name="save" className="w-4 h-4" />
          建立
        </button>
      </PageHeader>

      {/* STEP 1 · 循環與節點歸屬 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          {badge(1, true)}
          <Icon name="workflow" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">循環與節點歸屬</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              所屬循環 <span className="text-red-500">*</span>
            </label>
            {/* F040：兩段式選取（循環名稱 → 子分類）。名稱底下無子分類時不呈現子分類層（向後相容） */}
            <select
              id="f_cycleName"
              aria-label="所屬循環－循環名稱"
              value={cycleName}
              onChange={(e) => {
                setCycleName(e.target.value);
                setCycleSubId('');
                setSubErr(false);
              }}
              className={`w-full px-3 py-2 rounded-md border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 ${errors.lifecycleId ? 'border-red-500' : 'border-slate-300'}`}
            >
              <option value="">請選擇循環</option>
              {nameOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {/* 第二段採**條件式渲染**（非 CSS class 隱藏），使「不呈現」可被客觀驗證。 */}
            {subOptions.length > 0 && (
              <div id="subWrap" className="mt-2">
                <select
                  id="f_cycleSub"
                  aria-label="所屬循環－子分類"
                  value={cycleSubId}
                  onChange={(e) => {
                    setCycleSubId(e.target.value);
                    setSubErr(false);
                  }}
                  className={`w-full px-3 py-2 rounded-md border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 ${subErr ? 'border-red-500' : 'border-slate-300'}`}
                >
                  <option value="">請選擇子分類</option>
                  {/* AC-31：選項值＝各自 lifecycleId、顯示字串＝lifecycleDisplayName。 */}
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
            {errors.lifecycleId && (
              <p id="cycErr" className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5" />
                <span>必填欄位未填寫</span>
              </p>
            )}
            {subErr && (
              <p id="subErr" className="mt-1 text-xs text-red-600 flex items-start gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  此循環名稱底下設有子分類，請選擇具體子分類後再送出（LIFECYCLE_SUBCATEGORY_REQUIRED）
                </span>
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">所屬節點</label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
              <Icon name="git-commit-vertical" className="w-4 h-4 text-slate-400" />
              建立時為「未指派」
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-0.5" />
          「所屬節點」不在建立表單設定；稍後於 DAG 節點抽屜（F009）掛載/指派，為唯一權威寫入路徑。
        </p>
      </section>

      {/* gate hint（未選循環前顯示） */}
      {gated && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <Icon name="lock" className="w-4 h-4 shrink-0" />
          請先選擇「所屬循環」，以下欄位將於選定後開放填寫；文件編號前綴亦依循環自動帶入。
        </div>
      )}

      {/* STEP 2 · 基本資訊 */}
      <section className={`bg-white border border-slate-200 rounded-xl p-5 ${gatedCls}`}>
        <div className="flex items-center gap-2 mb-4">
          {badge(2, !gated)}
          <Icon name="file-plus-2" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">基本資訊</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">系統 UUID</label>
            <input disabled placeholder="儲存後由系統產生（唯讀）" className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm mono bg-slate-50 text-slate-500" />
          </div>
          <div>
            <label htmlFor="dStatus" className="block text-sm font-medium text-slate-700 mb-1">
              文件狀態 <span className="text-red-500">*</span>
            </label>
            <select
              id="dStatus"
              value={status}
              onChange={(e) => setStatus(e.target.value as DocumentStatus)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              <option value="active">有效</option>
              <option value="inactive">失效</option>
              <option value="void">作廢</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1">預設「有效」；有效文件依公告日期於清單顯示為已公告/進度中。</p>
          </div>
          <div>
            <label htmlFor="dNumber" className="block text-sm font-medium text-slate-700 mb-1">
              ICSOP 文件編號 <span className="text-red-500">*</span>
            </label>
            <div className={`flex items-stretch rounded-md border focus-within:ring-2 focus-within:ring-primary-600 overflow-hidden ${errors.documentNumber || dupHit ? 'border-red-500' : 'border-slate-300'}`}>
              <span id="numPrefix" className="px-3 py-2 bg-slate-50 text-slate-500 text-sm mono border-r border-slate-200 whitespace-nowrap select-none">{prefix}</span>
              <input
                id="dNumber"
                value={numberSuffix}
                onChange={(e) => setNumberSuffix(e.target.value)}
                placeholder="101-1-XX"
                className="flex-1 min-w-0 px-3 py-2 text-sm mono focus:outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {/* prototype 14：代碼置於 <span id="numCode">，與前綴 span 分離（本段落自身不成為前綴字串之來源）。 */}
              前綴「ICSOP-<span id="numCode">{code || '—'}</span>-」依所屬循環自動帶入、不可修改；僅需填寫後段序號。唯一性比對「有效」＋「作廢」文件（佔用中）；
              <strong className="text-slate-500">「失效」文件之編號已釋出、可重用</strong>。
            </p>
            {dupHit && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5" />
                <span>此編號已被「{STATUS_ZH[dupHit.status]}」文件（{dupHit.documentName}）佔用（DOCUMENT_NUMBER_DUPLICATE）</span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="dName" className="block text-sm font-medium text-slate-700 mb-1">
              文件名稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="dName"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="例：車輛分期進件作業"
              className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 ${errors.documentName ? 'border-red-500' : 'border-slate-300'}`}
            />
            {errors.documentName && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5" />
                <span>必填欄位未填寫</span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="dEdYear" className="block text-sm font-medium text-slate-700 mb-1">
              版次 <span className="text-xs font-normal text-slate-400">（選填）</span>
            </label>
            <EditionInput key={editionResetKey} yearId="dEdYear" defaultValue={null} onChange={setEdition} />
            <p className="text-[10px] text-slate-400 mt-1">格式「年度＇序號」＝<span className="mono">{'{YY}'}'{'{NN}'}</span>（例：<span className="mono">26'01</span>）。</p>
          </div>
          <div>
            <label htmlFor="dAnnounced" className="block text-sm font-medium text-slate-700 mb-1">
              公告日期 <span className="text-xs font-normal text-slate-400">（選填）</span>
            </label>
            <input
              id="dAnnounced"
              type="date"
              value={announcedDate}
              onChange={(e) => setAnnouncedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            <p className="text-[10px] text-slate-400 mt-1">公告日期已到＝清單顯示「已公告」；未到或未填＝「進度中」（未公告）。</p>
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="dSummary" className="block text-sm font-medium text-slate-700 mb-1">
            內容摘要 <span className="text-xs font-normal text-slate-400">（選填）</span>
          </label>
          <textarea
            id="dSummary"
            rows={3}
            value={contentSummary}
            onChange={(e) => setContentSummary(e.target.value)}
            placeholder="以一至二句摘述本程序書之目的與涵蓋範圍…"
            className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 resize-y"
          />
        </div>
      </section>

      {/* STEP 3 · 制定組織與當責室長（F014；選定循環後開放） */}
      <section className={`bg-white border border-slate-200 rounded-xl p-5 ${gatedCls}`}>
        <div className="flex items-center gap-2 mb-4">
          {badge(3, !gated)}
          <Icon name="building-2" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">制定組織與當責室長</h2>
        </div>

        {/* 制定組織三級相依（公司 → 部 → 室別，由上而下） */}
        <div className="space-y-4 sm:max-w-md">
          <SearchCombobox
            id="dCompany"
            label={
              <>
                {orgNumBadge(1)}制定公司 <span className="text-xs font-normal text-slate-400">（選填）</span>
              </>
            }
            options={companyOptions}
            value={companyCode}
            onChange={onCompanyChange}
            placeholder="搜尋制定公司…"
          />
          <SearchCombobox
            id="dDept"
            label={<>{orgNumBadge(2)}制定部門</>}
            options={deptOptions}
            value={draftingDeptId}
            onChange={onDeptChange}
            disabled={!companyCode}
            placeholder={companyCode ? '搜尋制定部門…' : '請先選擇制定公司'}
          />
          <SearchCombobox
            id="dSection"
            label={<>{orgNumBadge(3)}制定室別</>}
            options={sectionOptions}
            value={draftingSectionId}
            onChange={onSectionChange}
            disabled={!draftingDeptId || deptHasNoSection}
            placeholder={
              !draftingDeptId
                ? '請先選擇制定部門'
                : deptHasNoSection
                  ? '此部之下無處/室（留空）'
                  : '搜尋制定室別…'
            }
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-px" />
          三級相依（由上而下）：選「制定公司」後方可選其下「制定部門」，再選其下「制定室別」；變更上層將清空下層。部之下無處/室者該欄留空。來源：最新同步之組織資料（不含離職）。
        </p>

        {/* 當責室長-主要（可搜尋人員，選定制定室別後帶入該室主管為預設候選） */}
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <SearchCombobox
            id="dPrimaryChief"
            label={
              <>
                當責室長-主要 <span className="text-xs font-normal text-slate-400">（選填）</span>
              </>
            }
            options={primaryOptions}
            value={primaryChief?.value ?? ''}
            onChange={(v) => setPrimaryChief(primaryOptions.find((o) => o.value === v) ?? null)}
            onQueryChange={runPersonSearch}
            placeholder="搜尋室長姓名/員編…"
          />
        </div>

        {/* 當責室長-次要（可多位，允許為空） */}
        <div className="mt-4">
          <MultiSearchCombobox
            id="dSecondaryChiefs"
            label="當責室長-次要（可多位，允許為空）"
            options={personResults}
            values={secondaryChiefs}
            onAdd={(opt) => setSecondaryChiefs((prev) => [...prev, opt])}
            onRemove={(v) => setSecondaryChiefs((prev) => prev.filter((o) => o.value !== v))}
            onQueryChange={runPersonSearch}
            placeholder="搜尋並新增次要室長…"
          />
        </div>

        {/* 文件使用部門（可多個，允許為空；任意層級） */}
        {/* 文件使用部門：說明置於欄位「之上」（比照編輯頁 / prototype 14），含「路徑呈現層級關係」語意（G-DOC-104/106）。 */}
        <div className="mt-4">
          <span className="block text-sm font-medium text-slate-700 mb-1">
            文件使用部門 <span className="text-xs font-normal text-slate-400">（選填，可多個）</span>
          </span>
          <p className="text-xs text-slate-500 mb-2 flex items-start gap-1.5">
            <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-600" />
            <span>
              可指定任意層級（本部／部／處室／課）；清單以「本部 / 部 / 處室 / 課」路徑呈現層級關係，
              <strong className="text-slate-700">選擇上層將自動涵蓋其下所有單位</strong>（權限判定時自動展開子樹）。
            </span>
          </p>
          <MultiSearchCombobox
            id="dUsingDepts"
            label={<span className="sr-only">文件使用部門（選填，可多個）</span>}
            options={usingDeptOptions}
            values={usingDepts}
            onAdd={(opt) => setUsingDepts((prev) => [...prev, opt])}
            onRemove={(v) => setUsingDepts((prev) => prev.filter((o) => o.value !== v))}
            placeholder="搜尋並新增使用部門…"
            emptyChipText="（尚未選擇）"
          />
        </div>
      </section>

      {/* STEP 4 · 附件與關聯文件（F016 附件／F018 使用表單／F015 連結點；選定循環後開放） */}
      <section className={`bg-white border border-slate-200 rounded-xl p-5 ${gatedCls}`}>
        <div className="flex items-center gap-2 mb-1">
          {badge(4, !gated)}
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">附件與關聯文件</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5" />
          允許格式：ICSOP PDF／OJT＝.pdf/.jpg/.png、ICSOP 原始檔＝.xls、使用表單＝.xlsx/.xls/.pdf；單檔上限 50MB（OQ-E04-06 定案）。
        </p>
        <div className="flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50/40 px-3 py-2.5 mb-4 text-[11px] text-slate-600">
          <Icon name="info" className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" />
          <span>
            <strong className="text-slate-800">ICSOP PDF（呈現／下載用）與 ICSOP 原始檔 .xls（AI 智慧問答檢索來源）為兩個各自獨立的上傳</strong>，系統
            <strong className="text-slate-800">不自動轉檔</strong>（OQ-E09-10 定案）；兩者內容一致性由 ICSOP 管理員負責維護。
          </span>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <UploadCard
            iconName="file-text"
            iconClass="text-red-500"
            title="上傳 ICSOP PDF（呈現用，1 份）"
            accept=".pdf,.jpg,.jpeg,.png"
            hint="尚未選擇 · .pdf/.jpg/.png"
            file={pdfFile}
            onSelect={setPdfFile}
          />
          {/* ICSOP 原始檔 .xls：保存需 AI 索引管線之模板解析（F027/F029，[integration]），非單純 multipart；本頁暫不提供。 */}
          <div
            className="border border-dashed border-primary-200 rounded-lg p-4 text-center bg-primary-50/20 opacity-60"
            title="ICSOP 原始檔 .xls 之保存待 AI 索引管線（F027/F029）就緒"
          >
            <Icon name="file-spreadsheet" className="w-6 h-6 text-primary-400 mx-auto mb-1.5" />
            <div className="text-sm font-medium text-slate-500">上傳 ICSOP 原始檔（.xls，1 份）</div>
            <div className="text-xs text-slate-400 mt-1">待 AI 索引管線就緒（F027/F029）</div>
          </div>
          <UploadCard
            iconName="upload"
            iconClass="text-slate-400"
            title="上傳 OJT 簽到表（1 份）"
            accept=".pdf,.jpg,.jpeg,.png"
            hint="尚未選擇 · .pdf/.jpg/.png"
            file={ojtFile}
            onSelect={setOjtFile}
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
          <Icon name="sparkles" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-500" />
          .xls 供 AI <strong>chunk 提取／索引</strong>（F028/F029）；不符 ICSOP 標準五表模板將於抽取階段阻擋並提示（
          <span className="mono">XLS_TEMPLATE_INVALID</span>）。
        </p>

        {/* 使用表單（自「使用表單管理」表單池選取，可搜尋多選） */}
        <div className="mt-4">
          <MultiSearchCombobox
            id="dForms"
            label="使用表單（自「使用表單管理」選取，可多個、允許為空）"
            options={formOptions}
            values={selectedForms}
            onAdd={(opt) => setSelectedForms((prev) => [...prev, opt])}
            onRemove={(v) => setSelectedForms((prev) => prev.filter((o) => o.value !== v))}
            placeholder="搜尋使用表單（excel/pdf）…"
          />
          <p className="text-[10px] text-slate-400 mt-1">來源：「使用表單管理」表單池；如需新增新表單請至該功能上傳。</p>
        </div>

        {/* 附錄（自「附錄管理」附錄池選取，可搜尋多選；已選清單以上移／下移排序，F039） */}
        <div className="mt-4">
          <MultiSearchCombobox
            id="dAppendices"
            label="附錄（自「附錄管理」選取，可多個、允許為空、可排序）"
            options={appendixOptions}
            values={selectedAppendices}
            onAdd={(opt) => setSelectedAppendices((prev) => [...prev, opt])}
            onRemove={(v) => setSelectedAppendices((prev) => prev.filter((o) => o.value !== v))}
            placeholder="搜尋附錄（excel/pdf）…"
            emptyChipText="（尚無附錄，允許為空）"
            orderable
            onMoveUp={(i) => moveAppendix(i, -1)}
            onMoveDown={(i) => moveAppendix(i, 1)}
            removeTitle="取消選取"
            itemIcon={(o) => (/\.pdf$/i.test(o.label) ? 'file-text' : 'file-spreadsheet')}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            來源：「附錄管理」附錄池；如需新增請至該功能上傳。
            <strong className="text-slate-500">新選取者一律加入末位</strong>
            ，以「上移／下移」調整顯示順序（<strong className="text-slate-500">不支援拖曳</strong>
            ）；前台與後台文件詳情頁一律依此順序呈現。
          </p>
        </div>

        {/* 文件連結點（可搜尋，連結其他 ICSOP 文件） */}
        <div className="mt-4">
          <MultiSearchCombobox
            id="dLinks"
            label="文件連結點（連結其他 ICSOP 文件，可多個、允許為空）"
            options={linkOptions}
            values={selectedLinks}
            onAdd={(opt) => setSelectedLinks((prev) => [...prev, opt])}
            onRemove={(v) => setSelectedLinks((prev) => prev.filter((o) => o.value !== v))}
            placeholder="搜尋要連結的 ICSOP 文件（編號/名稱）…"
          />
        </div>
      </section>
    </div>
  );
}

/** STEP4 附件上傳卡（點擊選檔，顯示已選檔名；實際上傳於文件建立取得 UUID 後執行）。 */
function UploadCard({
  iconName,
  iconClass,
  title,
  accept,
  hint,
  file,
  onSelect,
}: {
  iconName: string;
  iconClass: string;
  title: string;
  accept: string;
  hint: string;
  file: File | null;
  onSelect: (f: File | null) => void;
}): JSX.Element {
  return (
    <label className="border border-dashed border-slate-300 rounded-lg p-4 text-center hover:bg-slate-50 cursor-pointer block">
      <Icon name={iconName} className={`w-6 h-6 mx-auto mb-1.5 ${iconClass}`} />
      <div className="text-sm font-medium text-slate-700">{title}</div>
      <div className={`text-xs mt-1 ${file ? 'text-emerald-600' : 'text-slate-400'}`}>
        {file ? `已選擇：${file.name}` : hint}
      </div>
      <input
        type="file"
        accept={accept}
        aria-label={title}
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
