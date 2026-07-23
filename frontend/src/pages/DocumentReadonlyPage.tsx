import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getDocument,
  getDocumentLinks,
  getLifecycles,
  getOrgUnits,
  getDocumentForms,
  searchPersons,
  downloadUsageForm,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import type {
  DocumentView,
  DocumentStatus,
  DocumentLinkView,
  LifecycleView,
  OrgUnitRecord,
  UsageFormRecord,
} from '../api/types';

/**
 * 檢視 ICSOP 文件（唯讀，F016）。版面權威來源：prototypes/16-document-readonly.html。
 * 16 欄位唯讀呈現＋附件（使用表單）僅下載（伺服器端燒錄浮水印並寫入稽核）。
 * RBAC：ICSOP文件管理 read（SysAdmin/ICSOPAdmin/Supervisor/DeptContact）可檢視；ICSOPAdmin 另顯示
 * 「前往編輯」；User→403。名稱解析：組織經 /org-units、當責室長經 /persons（best-effort，查無回員編）。
 * 已知後端缺口：ICSOP PDF／OJT 附件無列表端點 → 僅列出使用表單（getDocumentForms）之下載。
 */
const STATUS_META: Record<DocumentStatus, { label: string; cls: string }> = {
  active: { label: '有效', cls: 'text-emerald-700 bg-emerald-50' },
  inactive: { label: '失效', cls: 'text-amber-700 bg-amber-50' },
  void: { label: '作廢', cls: 'text-red-700 bg-red-50' },
};
const msgOf = (e: unknown) =>
  e instanceof ApiError && e.code === 'DOCUMENT_NOT_FOUND' ? '找不到文件' : '載入失敗';

export function DocumentReadonlyPage(): JSX.Element {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<DocumentView | null>(null);
  const [links, setLinks] = useState<DocumentLinkView[]>([]);
  const [lifecycles, setLifecycles] = useState<LifecycleView[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [forms, setForms] = useState<UsageFormRecord[]>([]);
  const [personNames, setPersonNames] = useState<Map<string, string>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [v, lk] = await Promise.all([getDocument(id), getDocumentLinks(id)]);
      setView(v);
      setLinks(lk);
      void getLifecycles().then(setLifecycles).catch(() => undefined);
      void getOrgUnits().then(setOrgUnits).catch(() => undefined);
      void getDocumentForms(id).then(setForms).catch(() => undefined);
      // 當責室長姓名 best-effort 解析（單筆讀取僅回員編；PERSON 表為已知限制，查無回員編）。
      const chiefIds = [...new Set([v.primaryChiefId, ...v.secondaryChiefIds].filter((x): x is string => !!x))];
      if (chiefIds.length) {
        void Promise.all(
          chiefIds.map(async (empNo) => {
            try {
              const rs = await searchPersons(empNo, 5);
              const m = rs.find((p) => p.employeeNo === empNo);
              return [empNo, m?.name ?? empNo] as const;
            } catch {
              return [empNo, empNo] as const;
            }
          }),
        ).then((pairs) => setPersonNames(new Map(pairs)));
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

  const orgByCode = useMemo(() => {
    const m = new Map<string, OrgUnitRecord>();
    for (const u of orgUnits) m.set(u.orgCode, u);
    return m;
  }, [orgUnits]);
  const orgName = useCallback((code: string | null) => (code ? orgByCode.get(code)?.name ?? code : '—'), [orgByCode]);
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
  const personName = useCallback((empNo: string | null) => (empNo ? personNames.get(empNo) ?? empNo : '—'), [personNames]);

  const onDownloadForm = useCallback(
    async (formId: string, name: string) => {
      try {
        const grant = await downloadUsageForm(id, formId);
        window.open(grant.url, '_blank', 'noopener,noreferrer');
        setNotice(`下載「${name}」（已寫入稽核 DOWNLOAD）`);
      } catch {
        setNotice(`無法下載「${name}」`);
      }
    },
    [id],
  );

  if (!canRead) {
    return (
      <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無文件檢視權限</h1>
        <p className="text-sm text-slate-500 mt-1">一般使用者無後台存取權（前台可瀏覽有效文件）。</p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
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
  if (loadError || !view) {
    return (
      <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <Icon name="alert-circle" className="w-7 h-7 text-red-500 mx-auto mb-3" />
        <h1 className="font-semibold text-slate-900">{loadError ?? '找不到文件'}</h1>
      </div>
    );
  }

  const sm = STATUS_META[view.status];
  const cycleName = lifecycles.find((l) => l.id === view.lifecycleId)?.name ?? view.lifecycleId;
  const statusPill = (s: DocumentStatus) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_META[s].cls}`}>{STATUS_META[s].label}</span>
  );

  const ROWS: { label: string; note?: string; value: React.ReactNode }[] = [
    { label: '系統 UUID', note: '系統產生', value: <span className="mono text-slate-500">{view.id}</span> },
    { label: '文件狀態', value: <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}>{sm.label}</span> },
    { label: '制定公司', value: orgName(view.draftingCompanyId) },
    { label: '制定部門', value: orgName(view.draftingDeptId) },
    { label: '制定室別', value: orgName(view.draftingSectionId) },
    { label: '程序書編號', value: <span className="mono">{view.documentNumber}</span> },
    { label: '程序書書名', value: view.documentName },
    { label: '版次', value: <span className="mono">{view.edition ?? '—'}</span> },
    { label: '內容摘要', value: view.contentSummary ?? '—' },
    { label: '當責室長-主要', value: personName(view.primaryChiefId) },
    { label: '當責室長-次要', value: view.secondaryChiefIds.length ? view.secondaryChiefIds.map(personName).join('、') : '—' },
    { label: '文件使用部門', value: view.usingDeptIds.length ? view.usingDeptIds.map(orgPath).join('、') : '—' },
    { label: '循環別', value: cycleName },
    {
      label: '所屬節點', note: '唯讀 · 由節點抽屜維護',
      value: (
        <span className="inline-flex items-center gap-2">
          {view.nodeId ? <span className="mono">{view.nodeId}</span> : '未指派'}
          <button onClick={() => navigate(`/admin/lifecycles/${view.lifecycleId}/canvas`)} className="inline-flex items-center gap-1 text-primary-600 hover:underline text-xs">
            <Icon name="external-link" className="w-3.5 h-3.5" />跳轉檢視畫布
          </button>
        </span>
      ),
    },
    {
      label: '連結點程序書',
      value: links.length ? (
        <div className="space-y-1">
          {links.map((l) => (
            <button key={l.linkId} onClick={() => navigate(`/admin/documents/${l.targetDocumentId}`)} className="inline-flex items-center gap-1 text-primary-600 hover:underline text-sm">
              <Icon name="link" className="w-3.5 h-3.5" />
              {l.targetNumber ?? l.targetDocumentId}
              {l.targetName ? ` · ${l.targetName}` : ''}
              {l.targetStatus ? <> · {statusPill(l.targetStatus)}</> : null}
            </button>
          ))}
        </div>
      ) : '—',
    },
    { label: '公告日期', value: <span className="mono">{view.announcedDate ? view.announcedDate.slice(0, 10) : '—'}</span> },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader breadcrumb={['ICSOP 文件管理', '檢視（唯讀）']} title={`檢視文件 · ${view.documentNumber}`}>
        {canWrite && (
          <button onClick={() => navigate(`/admin/documents/${id}/edit`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700">
            <Icon name="pencil" className="w-4 h-4" />前往編輯
          </button>
        )}
      </PageHeader>

      {canWrite ? (
        <div role="note" className="bg-primary-50 border border-primary-100 text-primary-700 text-sm px-4 py-2 rounded-lg flex items-center gap-2">
          <Icon name="info" className="w-4 h-4" />您是 ICSOP 管理員 · 可修改此文件，請前往編輯頁。
        </div>
      ) : (
        <div role="note" className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4" />
          <span>唯讀模式 · <strong>此角色對 ICSOP 文件全欄位皆唯讀</strong>；附件可下載（燒錄浮水印），但不可上傳/取代（FIELD_WRITE_FORBIDDEN）。</span>
        </div>
      )}
      {notice && (
        <div role="status" className="text-sm border rounded-md px-3 py-2 text-emerald-700 bg-emerald-50 border-emerald-100">{notice}</div>
      )}

      {/* 16 欄位唯讀 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="file-text" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">文件欄位（唯讀）</h2>
        </div>
        <dl className="divide-y divide-slate-100">
          {ROWS.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-3 items-center py-2.5">
              <dt className="col-span-12 sm:col-span-4 text-sm text-slate-500">
                {r.label}
                {r.note && <span className="block text-[10px] text-slate-400">{r.note}</span>}
              </dt>
              <dd className="col-span-12 sm:col-span-8 text-sm text-slate-800">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 附件（僅下載） — 使用表單 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">附件（僅下載）</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
          <Icon name="shield" className="w-3.5 h-3.5" />
          下載/列印時伺服器端<strong className="text-slate-500">燒錄浮水印</strong>並寫入稽核；無上傳/取代入口。
        </p>
        <div className="space-y-2">
          {forms.length ? forms.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <Icon name="sheet" className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-400">使用表單</div>
                <div className="text-sm text-slate-700 truncate">{f.name}</div>
              </div>
              <button onClick={() => void onDownloadForm(f.id, f.name)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs hover:bg-slate-50 shrink-0">
                <Icon name="download" className="w-3.5 h-3.5" />下載
              </button>
            </div>
          )) : (
            <p className="text-sm text-slate-400">尚無關聯使用表單。</p>
          )}
          <p className="text-[10px] text-slate-400 flex items-start gap-1.5 pt-1">
            <Icon name="info" className="w-3.5 h-3.5 mt-px" />
            <span>ICSOP PDF／OJT 簽到表附件之列示待附件列表端點就緒；目前僅列出關聯之使用表單。</span>
          </p>
        </div>
      </section>
      <div className="h-4" />
    </div>
  );
}
