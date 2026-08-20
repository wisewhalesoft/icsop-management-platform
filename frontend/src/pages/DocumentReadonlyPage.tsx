import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getDocument,
  getDocumentLinks,
  getLifecycles,
  getOrgUnits,
  getDocumentForms,
  getDocumentAttachments,
  searchPersons,
  downloadUsageForm,
  downloadAttachment,
  getDocumentAppendices,
  downloadAppendixFromPool,
  uploadOjtAttachment,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { WM_BURN_TEXT, WM_UNSUPPORTED_TEXT, isWatermarkSupportedFormat } from '../domain/watermark-note';
import {
  ATTACH_NOTE_OJT,
  ATTACH_NOTE_RO,
  FIELD_RO_NOTE,
  RO_NOTICE_FULL,
  RO_NOTICE_OJT_EXCEPTION,
  canWriteOjt,
} from '../domain/readonly-notice';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import type {
  DocumentView,
  DocumentStatus,
  DocumentLinkView,
  LifecycleView,
  OrgUnitRecord,
  UsageFormRecord,
  DocumentAttachmentRecord,
  DocumentAppendixRecord,
} from '../api/types';

/**
 * 檢視 ICSOP 文件（唯讀，F016）。版面權威來源：prototypes/16-document-readonly.html。
 * 16 欄位唯讀呈現＋附件（使用表單）僅下載（伺服器端燒錄浮水印並寫入稽核）。
 * RBAC：ICSOP文件管理 read（SysAdmin/ICSOPAdmin/Supervisor/DeptContact）可檢視；ICSOPAdmin 另顯示
 * 「前往編輯」；User→403。名稱解析：組織經 /org-units、當責室長經 /persons（best-effort，查無回員編）。
 * 附件清單＝ICSOP PDF → OJT 實體簽到表 → 使用表單（合併同一清單，缺者不列）；僅 ICSOP PDF 標示
 * 「下載燒錄浮水印」。ICSOP PDF／OJT 走受控下載端點（blobPath），使用表單走 F018 既有下載端點。
 */
const STATUS_META: Record<DocumentStatus, { label: string; cls: string }> = {
  active: { label: '有效', cls: 'text-emerald-700 bg-emerald-50' },
  inactive: { label: '失效', cls: 'text-amber-700 bg-amber-50' },
  void: { label: '作廢', cls: 'text-red-700 bg-red-50' },
};
const msgOf = (e: unknown) =>
  e instanceof ApiError && e.code === 'DOCUMENT_NOT_FOUND' ? '找不到文件' : '載入失敗';

/** 附件合併清單之標籤與排序（prototype 16 renderAttach）。 */
const ATTACH_LABEL: Record<DocumentAttachmentRecord['type'], string> = {
  ICSOP_PDF: '檔案（ICSOP PDF）',
  OJT_SIGNIN: 'OJT 實體簽到表',
};
const ATTACH_ORDER: Record<DocumentAttachmentRecord['type'], number> = {
  ICSOP_PDF: 0,
  OJT_SIGNIN: 1,
};

export function DocumentReadonlyPage(): JSX.Element {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');
  /**
   * 🔴 F026 `AC-N23`／`AC-N26`／`AC-N27`（2026-08-20 D9 delta）：該角色對「OJT 簽到表」是否可寫。
   * 判定取自 `FIELD_MATRIX`（單一權威），**不得**在本頁另寫角色白名單——`SysAdmin` 與 `User`
   * 已明文排除，自建白名單正是「開一個洞、鬆一片牆」之典型形狀。
   */
  const ojtWritable = canWriteOjt(role);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<DocumentView | null>(null);
  const [links, setLinks] = useState<DocumentLinkView[]>([]);
  const [lifecycles, setLifecycles] = useState<LifecycleView[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [forms, setForms] = useState<UsageFormRecord[]>([]);
  const [attachments, setAttachments] = useState<DocumentAttachmentRecord[]>([]);
  // F039 附錄：後端已依 sortOrder 遞增回傳（唯一排序權威），前端不再排序。
  const [appendices, setAppendices] = useState<DocumentAppendixRecord[]>([]);
  const [personNames, setPersonNames] = useState<Map<string, string>>(new Map());

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
      void getDocumentAttachments(id).then(setAttachments).catch(() => undefined);
      void getDocumentAppendices(id).then(setAppendices).catch(() => undefined);
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

  /**
   * 🔴 2026-08-17（F020 `AC-D3a` 後台側修訂）：本頁三支下載一律改為
   * 後端代理串流 ＋ `downloadViaBlob`（fetch → Blob → 程式化 `<a download>`）。
   * 原作法 `window.open(grant.url)` 導覽至 `*.blob.core.windows.net`，Chrome Safe Browsing
   * 對該網域出示「偵測到危險網站」紅底攔截頁，使用者根本下載不到檔案。
   *
   * 📝 **文案同步更正**：三支原本皆提示「已寫入稽核 DOWNLOAD」，但**後台路徑從來不寫調閱稽核**
   * （管理端存取，F026 OQ-FM-01 之既有裁決；F020 `AC-D4` 更明文「不寫入任何調閱稽核」）——
   * 該提示自始為假。稽核只發生於前台 `/public/...` 路徑。
   */
  const onDownloadForm = useCallback(
    async (formId: string, name: string) => {
      try {
        await downloadUsageForm(id, formId, name);
        toast.success(`下載「${name}」`);
      } catch {
        toast.error(`無法下載「${name}」`);
      }
    },
    [id, toast],
  );

  /**
   * 附錄下載（後台管理端存取）：走附錄池下載端點核發短效 URL；
   * **不燒錄浮水印、不寫前台調閱稽核**（F039／F026 OQ-FM-01 既有裁決）。
   */
  const onDownloadAppendix = useCallback(
    async (appendixId: string, name: string) => {
      try {
        await downloadAppendixFromPool(appendixId, name);
        toast.success(`下載附錄「${name}」（不燒錄浮水印；後台管理端存取不寫調閱稽核）`);
      } catch {
        toast.error(`無法下載「${name}」`);
      }
    },
    [toast],
  );

  /**
   * 🔴 F016 `AC-N28`／`AC-N29`（2026-08-20 D9 delta）：OJT 簽到表為主管／部門窗口在本頁之
   * **唯一**可寫項，沿用既有覆蓋式上傳端點（`POST /admin/documents/:id/attachments/ojt`）——
   * 端點與其路由層閘門逐字不變，實際擋住其他寫入者為服務層之欄位矩陣。
   * ⚠ 重傳即覆蓋、不留歷史版本（`AC-N29`，語意不因角色而異）。
   */
  const onUploadOjt = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const rec = await uploadOjtAttachment(id, file);
        setAttachments((prev) => [...prev.filter((a) => a.type !== rec.type), rec]);
        toast.success(`已上傳「${file.name}」（覆蓋式；舊檔不再可存取）`);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.code : `無法上傳「${file.name}」`);
      }
    },
    [id, toast],
  );

  /** ICSOP PDF／OJT：走後台受控下載端點（blobPath）——RAW 原檔，不燒錄浮水印（F020 `AC-D4`）。 */
  const onDownloadAttachment = useCallback(
    async (blobPath: string, name: string) => {
      try {
        await downloadAttachment(blobPath, name);
        toast.success(`下載「${name}」`);
      } catch {
        toast.error(`無法下載「${name}」`);
      }
    },
    [toast],
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

  /**
   * 附件合併清單（prototype 16 renderAttach 之 items 順序與 wm 旗標）：
   * 檔案（ICSOP PDF）→ OJT 實體簽到表 → 使用表單 ×N；缺者不列。
   * 「下載燒錄浮水印」徽章僅標示於 ICSOP PDF（伺服器端燒錄，前端不帶旗標）。
   */
  const attachItems: {
    key: string; label: string; name: string; icon: string; iconClass: string;
    watermark: boolean; onDownload: () => void;
    /**
     * `AC-N75` ①：本列之附件類別，值域逐字為 `icsop_pdf`／`ojt`／`usageform`／`appendix`
     * （**不得**改寫為駝峰或連字號）。它是「哪一列可寫」在畫面上唯一可機器驗證之定位基礎。
     */
    kind: 'icsop_pdf' | 'ojt' | 'usageform' | 'appendix';
    /** `AC-N20`：浮水印註記之判定依據（策略 A：僅 PDF 燒錄）。 */
    format: string;
    /** F039：附錄專屬之顯示序號（1..N）；非附錄項為 undefined。 */
    order?: number;
  }[] = [
    ...[...attachments]
      .sort((a, b) => ATTACH_ORDER[a.type] - ATTACH_ORDER[b.type])
      .map((a) => ({
        key: a.id,
        label: ATTACH_LABEL[a.type],
        name: a.fileName,
        icon: 'file-text',
        iconClass: 'text-red-500',
        watermark: a.type === 'ICSOP_PDF',
        kind: (a.type === 'ICSOP_PDF' ? 'icsop_pdf' : 'ojt') as 'icsop_pdf' | 'ojt',
        format: (a.fileName.split('.').pop() ?? '').toLowerCase(),
        onDownload: () => void onDownloadAttachment(a.blobPath, a.fileName),
      })),
    ...forms.map((f) => ({
      key: f.id,
      label: '使用表單',
      name: f.name,
      icon: 'sheet',
      iconClass: 'text-emerald-600',
      watermark: false,
      kind: 'usageform' as const,
      format: f.format,
      onDownload: () => void onDownloadForm(f.id, f.name),
    })),
    // F039：附錄依 sortOrder 遞增列於清單末段（與前台詳情 04 之順序完全一致）。
    ...appendices.map((a, i) => ({
      key: a.id,
      label: '附錄',
      name: a.name,
      icon: /xls/i.test(a.format) ? 'sheet' : 'file-text',
      iconClass: /xls/i.test(a.format) ? 'text-emerald-600' : 'text-red-500',
      watermark: false,
      kind: 'appendix' as const,
      format: a.format,
      onDownload: () => void onDownloadAppendix(a.id, a.name),
      order: i + 1,
    })),
  ];

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
          {view.nodeName ? view.nodeName : view.nodeId ? <span className="mono">{view.nodeId}</span> : '未指派'}
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
              {l.targetName ? ` ${l.targetName}` : ''}
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
      <PageHeader breadcrumb={[{ label: 'ICSOP 文件管理', to: '/admin/documents' }, { label: '檢視（唯讀）' }]} title={`檢視文件 · ${view.documentNumber}`}>
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
        /*
          🔴 F016 `AC-N74` ①（2026-08-20 D9 delta）：唯讀提示依角色分支。
          · 主管／部門窗口 → `RO_NOTICE_OJT_EXCEPTION`（原句「全欄位皆唯讀…不可上傳/取代」
            對其**已不成立**，OJT 為例外）。
          · 🔒 系統管理員 → `RO_NOTICE_FULL` **一字未改**（`AC-N26`：其對 OJT 亦唯讀）
            ⇒ 本分支同時是 `AC-N26` 在畫面上之載體。
        */
        <div role="note" className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2 rounded-lg flex items-start gap-2">
          <Icon name="eye" className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{ojtWritable ? RO_NOTICE_OJT_EXCEPTION : RO_NOTICE_FULL}</span>
        </div>
      )}

      {/* 16 欄位唯讀 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="file-text" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">文件欄位（唯讀）</h2>
        </div>
        {/*
          `AC-N75` ⑤／`AC-N74`：欄位區唯讀說明。僅對「被開放 OJT 的兩個角色」顯示——
          對 `SysAdmin` 顯示會讓它誤讀為「本頁有例外可寫」，與 `AC-N26` 相矛盾。
        */}
        {ojtWritable && !canWrite && (
          <p
            data-field-readonly-note=""
            className="mb-3 flex items-start gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2"
          >
            <Icon name="lock" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
            <span>{FIELD_RO_NOTE}</span>
          </p>
        )}
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

      {/*
        附件 — ICSOP PDF ／ OJT 實體簽到表 ／ 使用表單 ／ 附錄（合併清單，prototype 16 renderAttach）。
        🔴 `AC-N74` ③：區塊標題與說明依「本角色對 OJT 是否可寫」二擇一。
      */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 id="attachTitle" className="font-semibold text-slate-900">
            {ojtWritable ? '附件' : '附件（僅下載）'}
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-start gap-1.5">
          <Icon name="shield" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span id="attachNote">{ojtWritable ? ATTACH_NOTE_OJT : ATTACH_NOTE_RO}</span>
        </p>
        <div className="space-y-2">
          {attachItems.map((a) => {
            /*
              🔴 `AC-N75` ②③⑦（`AC-N24`／`AC-N25` 之畫面載體）：**恰一列可寫**（OJT），
              其餘三種 kind 之列一律唯讀。可寫／唯讀必須「看起來就不一樣」，且各自帶
              `data-writable-attachment`／`data-readonly-attachment` 以便機器驗證。
            */
            const writable = a.kind === 'ojt' && ojtWritable;
            return (
              <div
                key={a.key}
                data-attachment-kind={a.kind}
                {...(a.order ? { 'data-appendix-item': '', 'data-appendix-order': a.order } : {})}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  writable ? 'border-primary-300 bg-primary-50/40' : 'border-slate-200'
                }`}
              >
                {a.order && (
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {a.order}
                  </span>
                )}
                <Icon name={a.icon} className={`w-5 h-5 ${a.iconClass} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-400">{a.label}</div>
                  <div
                    {...(a.order ? { 'data-appendix-name': '' } : {})}
                    className="text-sm text-slate-700 truncate"
                  >
                    {a.name}
                  </div>
                </div>
                {/* `AC-N20`：後台亦渲染浮水印註記，文案與前台同一組逐字常數。 */}
                {isWatermarkSupportedFormat(a.format) ? (
                  <span
                    data-wm-note=""
                    className="text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 shrink-0 whitespace-nowrap"
                  >
                    {WM_BURN_TEXT}
                  </span>
                ) : (
                  <span
                    data-wm-note=""
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 shrink-0 whitespace-nowrap"
                  >
                    <Icon name="info" className="w-3 h-3" />
                    {WM_UNSUPPORTED_TEXT}
                  </span>
                )}
                {a.watermark && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 shrink-0">下載燒錄浮水印</span>
                )}
                {writable ? (
                  <span
                    data-writable-attachment=""
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary-600 text-white shrink-0 whitespace-nowrap"
                  >
                    <Icon name="pencil" className="w-3 h-3" />可上傳／覆蓋
                  </span>
                ) : (
                  <span
                    data-readonly-attachment=""
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0 whitespace-nowrap"
                  >
                    <Icon name="lock" className="w-3 h-3" />唯讀
                  </span>
                )}
                {writable && (
                  <label
                    data-ojt-upload=""
                    aria-label="上傳／取代 OJT 實體簽到表"
                    title="上傳／取代 OJT 實體簽到表"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-primary-300 bg-white text-primary-700 text-xs hover:bg-primary-50 shrink-0 cursor-pointer"
                  >
                    <Icon name="upload" className="w-3.5 h-3.5" />上傳／取代
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => void onUploadOjt(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
                <button onClick={a.onDownload} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs hover:bg-slate-50 shrink-0">
                  <Icon name="download" className="w-3.5 h-3.5" />下載
                </button>
              </div>
            );
          })}
          {/* F039 AC-26：無關聯附錄 → 顯示提示（非錯誤、非空白區塊）。 */}
          {appendices.length === 0 && (
            <div
              data-appendix-empty=""
              className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-400"
            >
              <Icon name="paperclip" className="w-4 h-4 shrink-0" />無附錄
            </div>
          )}
        </div>
      </section>
      <div className="h-4" />
    </div>
  );
}
