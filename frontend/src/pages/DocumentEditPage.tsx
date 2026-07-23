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
  updateDocument,
  linkUsageForms,
  unlinkUsageForm,
  uploadIcsopPdf,
  uploadOjtAttachment,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { cycleCodeOf } from '../domain/cycle-codes';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SearchCombobox, MultiSearchCombobox, type ComboOption } from '../components/SearchCombobox';
import type {
  DocumentView,
  DocumentStatus,
  DocumentListItem,
  LifecycleView,
  OrgUnitRecord,
  PersonRecord,
  UsageFormRecord,
} from '../api/types';

/**
 * 編輯 ICSOP 文件與版本對照（F011＋F015 連結點）。版面權威來源：prototypes/15-document-edit.html。
 * 每個可編輯欄位並列「目前值／新值」，變更欄位標示「已變更」並可還原；儲存以新值覆蓋（UUID 不變、
 * 不留歷史）。所屬節點唯讀＋前往 DAG 畫布改派。取消還原為載入前原值。編輯側編號唯一性排除自身。
 * RBAC：ICSOP文件管理 write=ICSOPAdmin（可編輯）；read（Supervisor/DeptContact/SysAdmin）唯讀；User→403。
 *
 * 後端契約：GET :id（DocumentView，含 org 欄＋secondaryChiefIds[]＋usingDeptIds[]）、GET :id/links、
 * PATCH :id（scalar 覆寫＋links[] 整批同步）。已知後端缺口：update() 剔除多值（次要室長／使用部門
 * 之編輯端持久化為 F014 create-side only，deferred）→ 此二欄於本頁以唯讀呈現；附件無列表端點 →
 * 僅提供上傳/取代（不顯示現有檔名）。
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
  };
}
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

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<DocumentView | null>(null);
  const [orig, setOrig] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lifecycles, setLifecycles] = useState<LifecycleView[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [existing, setExisting] = useState<DocumentListItem[]>([]);
  const [personResults, setPersonResults] = useState<ComboOption[]>([]);
  const [primaryChiefOrig, setPrimaryChiefOrig] = useState<ComboOption | null>(null);
  const [formPool, setFormPool] = useState<UsageFormRecord[]>([]);
  const [origForms, setOrigForms] = useState<ComboOption[]>([]);
  const [draftForms, setDraftForms] = useState<ComboOption[]>([]);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [v, links] = await Promise.all([getDocument(id), getDocumentLinks(id)]);
      setView(v);
      const d = draftOf(v, links.map((l) => l.targetDocumentId));
      setOrig(d);
      setDraft({ ...d, links: [...d.links] });
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
      // 解析當責室長-主要之顯示名稱（單筆讀取僅回員編）。
      if (v.primaryChiefId) {
        void searchPersons(v.primaryChiefId, 5)
          .then((rs) => {
            const m = rs.find((p) => p.employeeNo === v.primaryChiefId);
            if (m) setPrimaryChiefOrig(personOpt(m));
          })
          .catch(() => undefined);
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
  const primaryOptions = useMemo<ComboOption[]>(() => {
    if (primaryChiefOrig && !personResults.some((o) => o.value === primaryChiefOrig.value)) {
      return [primaryChiefOrig, ...personResults];
    }
    return personResults;
  }, [primaryChiefOrig, personResults]);

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

  // ===== 編號：前綴（依循環代碼）＋後段序號；編輯側唯一性排除自身 =====
  const cycleName = useMemo(
    () => lifecycles.find((l) => l.id === draft?.lifecycleId)?.name,
    [lifecycles, draft?.lifecycleId],
  );
  const code = cycleCodeOf(cycleName);
  const suffix = draft ? suffixOf(draft.documentNumber) : '';
  const onSuffixChange = useCallback(
    (raw: string) => {
      const c = cycleCodeOf(lifecycles.find((l) => l.id === draft?.lifecycleId)?.name);
      set('documentNumber', `ICSOP-${c}-${raw.trim()}`);
    },
    [set, lifecycles, draft?.lifecycleId],
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
      if (key === 'links') return JSON.stringify(draft.links) !== JSON.stringify(orig.links);
      return draft[key] !== orig[key];
    },
    [draft, orig],
  );
  const formsChanged = useMemo(
    () => JSON.stringify(draftForms.map((f) => f.value).sort()) !== JSON.stringify(origForms.map((f) => f.value).sort()),
    [draftForms, origForms],
  );
  const changeCount = useMemo(() => {
    if (!draft || !orig) return 0;
    let c = 0;
    for (const k of Object.keys(orig) as (keyof Draft)[]) if (changed(k)) c++;
    if (formsChanged) c++;
    return c;
  }, [draft, orig, changed, formsChanged]);

  const cancelAll = useCallback(() => {
    if (!orig) return;
    setDraft({ ...orig, links: [...orig.links] });
    setDraftForms(origForms);
    setNotice({ tone: 'ok', text: '已取消變更，欄位回復為編輯前原值' });
  }, [orig, origForms]);

  const save = useCallback(async () => {
    if (!draft || !orig || !canWrite) return;
    // 必填 4 核心。
    if (!suffix.trim() || !draft.documentName.trim() || !draft.lifecycleId || !draft.status) {
      setNotice({ tone: 'err', text: '必填欄位未填寫（循環別／文件狀態／程序書編號／書名）' });
      return;
    }
    if (dupHit) {
      setNotice({ tone: 'err', text: `此編號已被「${STATUS_LABEL[dupHit.status]}」文件（${dupHit.documentName}）佔用（DOCUMENT_NUMBER_DUPLICATE）` });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (changed('status')) patch.status = draft.status;
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

    setBusy(true);
    setNotice(null);
    try {
      const hasScalar = Object.keys(patch).length > 0;
      if (hasScalar) {
        const res = await updateDocument(id, patch);
        const nd = draftOf(res.document, draft.links);
        setView(res.document);
        setOrig(nd);
        setDraft({ ...nd, links: [...nd.links] });
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
      setNotice({ tone: 'ok', text: '已儲存：以新值覆蓋，UUID 不變、不留歷史版本' });
    } catch (e) {
      setNotice({ tone: 'err', text: msgOf(e) });
    } finally {
      setBusy(false);
    }
  }, [draft, orig, canWrite, suffix, dupHit, changed, formsChanged, origForms, draftForms, id]);

  const onUpload = useCallback(
    async (kind: 'pdf' | 'ojt', file: File | null) => {
      if (!file) return;
      try {
        if (kind === 'pdf') await uploadIcsopPdf(id, file);
        else await uploadOjtAttachment(id, file);
        setNotice({ tone: 'ok', text: `已上傳「${file.name}」（覆蓋式；舊檔不再可存取）` });
      } catch (e) {
        setNotice({ tone: 'err', text: msgOf(e) });
      }
    },
    [id],
  );

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
      {notice && (
        <div role={notice.tone === 'err' ? 'alert' : 'status'} className={`text-sm border rounded-md px-3 py-2 ${notice.tone === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-700 bg-red-50 border-red-100'}`}>
          {notice.text}
        </div>
      )}

      {/* 基本資訊 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="file-text" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">基本資訊</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">每個可編輯欄位並列「目前值 / 新值」；變更欄位會標示。</p>

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
                    onClick={() => set('status', s)}
                    aria-pressed={draft.status === s}
                    className={`px-3 py-1.5 border-r border-slate-300 last:border-r-0 ${draft.status === s ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-700'} disabled:opacity-60`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* number (prefix + suffix) */}
        <DiffRow inputId="edNumber" label="ICSOP 文件編號（程序書編號）" required={canWrite} changed={changed('documentNumber') || !!dupHit} currentText={orig.documentNumber} onRevert={() => set('documentNumber', orig.documentNumber)} mono showRevert={canWrite && changed('documentNumber')}>
          <div className={`flex items-stretch rounded-md border overflow-hidden ${dupHit ? 'border-red-500' : 'border-slate-300'}`}>
            <span className="px-3 py-2 bg-slate-50 text-slate-500 text-sm mono border-r border-slate-200 whitespace-nowrap select-none">ICSOP-{code || '—'}-</span>
            <input id="edNumber" disabled={ro} value={suffix} onChange={(e) => onSuffixChange(e.target.value)} placeholder="101-1-XX" className="flex-1 min-w-0 px-3 py-2 text-sm mono focus:outline-none disabled:bg-slate-50" />
          </div>
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
              <span className="px-1.5 py-2 bg-slate-50 text-slate-500 text-sm mono border-x border-slate-200 select-none">&rsquo;</span>
              <input aria-label="版次序號" disabled={ro} value={editionParts[1]} maxLength={2} inputMode="numeric"
                onChange={(e) => { const n = e.target.value.replace(/\D/g, '').slice(0, 2); const y = editionParts[0]; set('edition', y || n ? `${y}'${n.padStart(n ? 2 : 0, '0')}` : ''); }}
                placeholder="NN" className="w-14 px-2 py-2 text-sm mono text-center focus:outline-none disabled:bg-slate-50" />
            </div>
            <span className="text-xs text-slate-400">顯示 <span className="mono text-slate-700">{edition || '—'}</span></span>
          </div>
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
        <p className="text-xs text-slate-400 mb-3">制定組織為三級相依（由上而下）：公司 → 部門 → 室別；變更上層將清空下層。</p>
        <div className="space-y-4 sm:max-w-md">
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

        <div className="mt-4 sm:max-w-md">
          <ComboDiff label="當責室長-主要" changed={changed('primaryChiefId')} currentText={primaryChiefOrig?.label ?? (orig.primaryChiefId || '—')}>
            <SearchCombobox id="edPrimaryChief" label={<span className="sr-only">當責室長-主要</span>} options={primaryOptions} value={draft.primaryChiefId} onChange={(v) => set('primaryChiefId', v)} onQueryChange={runPersonSearch} disabled={ro} placeholder="搜尋室長姓名/員編…" />
          </ComboDiff>
        </div>

        {/* 次要室長 / 使用部門：後端 update 剔除多值（F014 edit-side deferred）→ 唯讀呈現 */}
        <div className="mt-4 py-3 border-t border-slate-100">
          <label className="text-sm font-medium text-slate-700 block mb-2">當責室長-次要（唯讀）</label>
          <div className="flex flex-wrap gap-2">
            {view.secondaryChiefIds.length ? view.secondaryChiefIds.map((c) => (
              <span key={c} className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs mono">{c}</span>
            )) : <span className="text-xs text-slate-400">（無次要室長）</span>}
          </div>
        </div>
        <div className="mt-2 py-3">
          <label className="text-sm font-medium text-slate-700 block mb-2">文件使用部門（唯讀）</label>
          <div className="flex flex-wrap gap-2">
            {view.usingDeptIds.length ? view.usingDeptIds.map((c) => (
              <span key={c} className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">{orgPath(c)}</span>
            )) : <span className="text-xs text-slate-400">（未指定使用部門）</span>}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 flex items-start gap-1.5">
            <Icon name="info" className="w-3.5 h-3.5 mt-px" />
            次要室長／使用部門之編輯將於後續開放（F014 編輯端持久化 deferred）；目前顯示載入值。
          </p>
        </div>
      </section>

      {/* 循環與節點歸屬 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="workflow" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">循環與節點歸屬</h2>
        </div>
        <DiffRow inputId="edCycle" label="所屬循環（循環別）" required={canWrite} changed={changed('lifecycleId')} currentText={lifecycles.find((l) => l.id === orig.lifecycleId)?.name ?? orig.lifecycleId} onRevert={() => set('lifecycleId', orig.lifecycleId)} showRevert={canWrite && changed('lifecycleId')}>
          <select id="edCycle" disabled={ro} value={draft.lifecycleId} onChange={(e) => set('lifecycleId', e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white disabled:bg-slate-50">
            {!lifecycles.some((l) => l.id === draft.lifecycleId) && <option value={draft.lifecycleId}>{draft.lifecycleId}</option>}
            {lifecycles.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
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
              {view.nodeId ? <span className="mono">{view.nodeId}</span> : '未指派'}
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
          <Icon name="info" className="w-3.5 h-3.5" />連結至其他 ICSOP 文件（編號＋名稱），可多個、允許為空；以可搜尋下拉選取。
        </p>
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
      </section>

      {/* 附件 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">附件</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5" />允許格式：ICSOP PDF／OJT＝.pdf/.jpg/.png；單檔上限 50MB。上傳為覆蓋式（舊檔不再可存取）。
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <ReplaceCard title="ICSOP PDF（呈現用，1 份，覆蓋式）" accept=".pdf,.jpg,.jpeg,.png" disabled={ro} onSelect={(f) => void onUpload('pdf', f)} />
          <ReplaceCard title="OJT 實體簽到表（1 份，覆蓋式）" accept=".pdf,.jpg,.jpeg,.png" disabled={ro} onSelect={(f) => void onUpload('ojt', f)} />
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
          <Icon name="info" className="w-3.5 h-3.5" />此處為「選取關聯」而非上傳；可多選、允許為空。儲存時套用關聯差集。
        </p>
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
      </section>

      <div className="h-4" />
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

/** 組織/室長可搜尋欄之目前/變更提示（新值控制為 children＝SearchCombobox）。 */
function ComboDiff({ label, changed, currentText, children }: {
  label: string; changed: boolean; currentText: string; children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={`${changed ? 'bg-primary-50 -mx-2 px-2 py-2 rounded-lg' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {changed && <ChangedPill />}
      </div>
      {children}
      <div className="text-[10px] text-slate-400 mt-1">目前：<span className="text-slate-600">{currentText}</span></div>
    </div>
  );
}

function ChangedPill(): JSX.Element {
  return <span className="ml-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-primary-700">已變更</span>;
}

function ReplaceCard({ title, accept, disabled, onSelect }: {
  title: string; accept: string; disabled?: boolean; onSelect: (f: File | null) => void;
}): JSX.Element {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="text-xs font-medium text-slate-500 mb-2">{title}</div>
      <label className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs ${disabled ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 hover:bg-slate-50 cursor-pointer'}`}>
        <Icon name="upload" className="w-3.5 h-3.5" />取代
        <input type="file" accept={accept} aria-label={`上傳取代 ${title}`} disabled={disabled} className="hidden" onChange={(e) => onSelect(e.target.files?.[0] ?? null)} />
      </label>
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
