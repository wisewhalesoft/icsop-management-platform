import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getLifecycles,
  getDocuments,
  createDocument,
  getOrgUnits,
  searchPersons,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { cycleCodeOf } from '../domain/cycle-codes';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SearchCombobox, MultiSearchCombobox, type ComboOption } from '../components/SearchCombobox';
import type {
  LifecycleView,
  DocumentListItem,
  DocumentStatus,
  OrgUnitRecord,
  PersonRecord,
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
  const canWrite = canPerform(user?.roleCode, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');

  const [lifecycles, setLifecycles] = useState<LifecycleView[]>([]);
  const [existing, setExisting] = useState<DocumentListItem[]>([]);
  const [lifecycleId, setLifecycleId] = useState('');
  const [status, setStatus] = useState<DocumentStatus>('active');
  const [numberSuffix, setNumberSuffix] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [edYear, setEdYear] = useState('');
  const [edSeq, setEdSeq] = useState('');
  const [announcedDate, setAnnouncedDate] = useState('');
  const [contentSummary, setContentSummary] = useState('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // STEP3 制定組織與當責室長（F014）。
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [draftingCompanyId, setDraftingCompanyId] = useState('');
  const [draftingDeptId, setDraftingDeptId] = useState('');
  const [draftingSectionId, setDraftingSectionId] = useState('');
  const [primaryChief, setPrimaryChief] = useState<ComboOption | null>(null);
  const [secondaryChiefs, setSecondaryChiefs] = useState<ComboOption[]>([]);
  const [usingDepts, setUsingDepts] = useState<ComboOption[]>([]);
  const [personResults, setPersonResults] = useState<ComboOption[]>([]);

  useEffect(() => {
    if (!canWrite) return;
    void getLifecycles()
      .then((lcs) => setLifecycles(lcs.filter((l) => l.status === 'active')))
      .catch(() => setNotice('無法載入循環清單'));
    void getDocuments()
      .then(setExisting)
      .catch(() => {
        /* 唯一性即時檢查為輔助；載入失敗不阻擋（後端 F013 為權威把關） */
      });
    // F014：制定組織三級與使用部門之來源（最新同步組織資料）。
    void getOrgUnits()
      .then(setOrgUnits)
      .catch(() => setNotice('無法載入組織資料'));
  }, [canWrite]);

  const selectedLc = lifecycles.find((l) => l.id === lifecycleId);
  const code = cycleCodeOf(selectedLc?.name);
  const gated = !lifecycleId;
  const prefix = code ? `ICSOP-${code}-` : 'ICSOP-—-';
  const suffix = numberSuffix.trim();
  const fullNumber = suffix ? (code ? `ICSOP-${code}-${suffix}` : suffix) : '';
  const edition = edYear && edSeq ? `${edYear}'${edSeq.padStart(2, '0')}` : '';
  const edPreview = edition || '—';

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
    setDraftingCompanyId(v);
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

  const reset = useCallback(() => {
    setLifecycleId('');
    setStatus('active');
    setNumberSuffix('');
    setDocumentName('');
    setEdYear('');
    setEdSeq('');
    setAnnouncedDate('');
    setContentSummary('');
    setDraftingCompanyId('');
    setDraftingDeptId('');
    setDraftingSectionId('');
    setPrimaryChief(null);
    setSecondaryChiefs([]);
    setUsingDepts([]);
    setPersonResults([]);
    setErrors({});
    setNotice(null);
  }, []);

  const submit = useCallback(async () => {
    const req = { lifecycleId: !lifecycleId, documentNumber: !suffix, documentName: !documentName.trim() };
    setErrors(req);
    if (req.lifecycleId || req.documentNumber || req.documentName) {
      setNotice('必填欄位未填寫（僅 循環別／文件狀態／文件編號／文件名稱 為必填）');
      return;
    }
    if (dupHit) {
      setNotice(`此編號已被「${STATUS_ZH[dupHit.status]}」文件（${dupHit.documentName}）佔用（DOCUMENT_NUMBER_DUPLICATE）`);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await createDocument({
        lifecycleId,
        status,
        documentNumber: fullNumber,
        documentName: documentName.trim(),
        ...(edition ? { edition } : {}),
        ...(announcedDate ? { announcedDate } : {}),
        ...(contentSummary.trim() ? { contentSummary: contentSummary.trim() } : {}),
        // F014 制定組織/當責室長/使用部門（皆選填；空值不送出，由後端正規化為空集合）。
        ...(draftingCompanyId ? { draftingCompanyId } : {}),
        ...(draftingDeptId ? { draftingDeptId } : {}),
        ...(draftingSectionId ? { draftingSectionId } : {}),
        ...(primaryChief ? { primaryChiefId: primaryChief.value } : {}),
        ...(secondaryChiefs.length ? { secondaryChiefIds: secondaryChiefs.map((c) => c.value) } : {}),
        ...(usingDepts.length ? { usingDeptIds: usingDepts.map((d) => d.value) } : {}),
      });
      navigate('/admin/documents');
    } catch (e) {
      setNotice(msgOf(e));
    } finally {
      setBusy(false);
    }
  }, [
    lifecycleId,
    suffix,
    documentName,
    dupHit,
    status,
    fullNumber,
    edition,
    announcedDate,
    contentSummary,
    draftingCompanyId,
    draftingDeptId,
    draftingSectionId,
    primaryChief,
    secondaryChiefs,
    usingDepts,
    navigate,
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
  const gatedCls = gated ? 'opacity-50 pointer-events-none' : '';

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader breadcrumb={['ICSOP 文件管理', '建立']} title="建立 ICSOP 文件">
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

      {notice && (
        <div role="alert" className="text-sm border rounded-md px-3 py-2 text-red-700 bg-red-50 border-red-100">
          {notice}
        </div>
      )}

      {/* STEP 1 · 循環與節點歸屬 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          {badge(1, true)}
          <Icon name="workflow" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">循環與節點歸屬</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dLifecycle" className="block text-sm font-medium text-slate-700 mb-1">
              所屬循環 <span className="text-red-500">*</span>
            </label>
            <select
              id="dLifecycle"
              value={lifecycleId}
              onChange={(e) => setLifecycleId(e.target.value)}
              className={`w-full px-3 py-2 rounded-md border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 ${errors.lifecycleId ? 'border-red-500' : 'border-slate-300'}`}
            >
              <option value="">請選擇循環</option>
              {lifecycles.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {errors.lifecycleId && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5" />
                <span>必填欄位未填寫</span>
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
              <span className="px-3 py-2 bg-slate-50 text-slate-500 text-sm mono border-r border-slate-200 whitespace-nowrap select-none">{prefix}</span>
              <input
                id="dNumber"
                value={numberSuffix}
                onChange={(e) => setNumberSuffix(e.target.value)}
                placeholder="101-1-XX"
                className="flex-1 min-w-0 px-3 py-2 text-sm mono focus:outline-none"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              前綴「ICSOP-{code || '—'}-」依所屬循環自動帶入、不可修改；僅需填寫後段序號。唯一性比對「有效」＋「作廢」文件（佔用中）；
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
            <div className="flex items-center gap-2">
              <div className="flex items-stretch rounded-md border border-slate-300 focus-within:ring-2 focus-within:ring-primary-600 overflow-hidden">
                <input
                  id="dEdYear"
                  aria-label="版次年度"
                  value={edYear}
                  onChange={(e) => setEdYear(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="YY"
                  className="w-16 px-3 py-2 text-sm mono text-center focus:outline-none"
                />
                <span className="px-1.5 py-2 bg-slate-50 text-slate-500 text-sm mono border-x border-slate-200 select-none">&rsquo;</span>
                <input
                  aria-label="版次序號"
                  value={edSeq}
                  onChange={(e) => setEdSeq(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="NN"
                  className="w-16 px-3 py-2 text-sm mono text-center focus:outline-none"
                />
              </div>
              <span className="text-sm text-slate-400">顯示：<span className="mono text-slate-700 font-medium">{edPreview}</span></span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">格式「年度&rsquo;序號」＝<span className="mono">{'{YY}'}&rsquo;{'{NN}'}</span>（例：<span className="mono">26&rsquo;01</span>）。</p>
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
                制定公司 <span className="text-xs font-normal text-slate-400">（選填）</span>
              </>
            }
            options={companyOptions}
            value={draftingCompanyId}
            onChange={onCompanyChange}
            placeholder="搜尋制定公司…"
          />
          <SearchCombobox
            id="dDept"
            label="制定部門"
            options={deptOptions}
            value={draftingDeptId}
            onChange={onDeptChange}
            disabled={!draftingCompanyId}
            placeholder={draftingCompanyId ? '搜尋制定部門…' : '請先選擇制定公司'}
          />
          <SearchCombobox
            id="dSection"
            label="制定室別"
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
        <div className="mt-4">
          <MultiSearchCombobox
            id="dUsingDepts"
            label={
              <>
                文件使用部門 <span className="text-xs font-normal text-slate-400">（選填，可多個）</span>
              </>
            }
            options={usingDeptOptions}
            values={usingDepts}
            onAdd={(opt) => setUsingDepts((prev) => [...prev, opt])}
            onRemove={(v) => setUsingDepts((prev) => prev.filter((o) => o.value !== v))}
            placeholder="搜尋並新增使用部門…"
            emptyChipText="（尚未選擇）"
          />
          <p className="text-[10px] text-slate-400 mt-1 flex items-start gap-1.5">
            <Icon name="info" className="w-3.5 h-3.5 mt-px" />
            可指定任意層級（本部／部／處室／課）；選擇上層將於權限判定時自動涵蓋其下所有單位（子樹展開）。
          </p>
        </div>
      </section>

      {/* STEP 4 · 附件與關聯文件（待各自後端 F015/F016/F018） */}
      <section className="bg-white border border-dashed border-slate-300 rounded-xl p-5 opacity-70">
        <div className="flex items-center gap-2 mb-2">
          {badge(4, false)}
          <Icon name="paperclip" className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-500">附件與關聯文件</h2>
        </div>
        <p className="text-xs text-slate-400 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-0.5" />
          附件（F016）、使用表單（F018）、文件連結（F015）為後續步驟，將於各自後端就緒時開放；建立後可於編輯頁補齊。
        </p>
      </section>
    </div>
  );
}
