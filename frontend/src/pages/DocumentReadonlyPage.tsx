import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { orgUnitDisplayName } from '../domain/org-path';
import { Icon } from '../components/Icon';
import { WM_BURN_TEXT, WM_UNSUPPORTED_TEXT, isWatermarkSupportedFormat } from '../domain/watermark-note';
import {
  ATTACH_NOTE_RO,
  FIELD_RO_NOTE,
  RO_NOTICE_FULL,
} from '../domain/readonly-notice';
import {
  OjtDerivedBlock,
  OJT_PROGRESS_LINK_TEXT,
  loadOjtCompletion,
} from '../components/OjtDerivedBlock';
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

/**
 * 附件合併清單之標籤與排序（prototype 16 renderAttach）。
 * 📝 F042 `AC-J1`：`OJT_SIGNIN: 'OJT 實體簽到表'`／`OJT_SIGNIN: 1` 兩列已隨型別收斂而移除
 * （OJT 不再是附件；其呈現改由 `OjtDerivedBlock` 承擔）。
 */
const ATTACH_LABEL: Record<DocumentAttachmentRecord['type'], string> = {
  ICSOP_PDF: '檔案（ICSOP PDF）',
};
const ATTACH_ORDER: Record<DocumentAttachmentRecord['type'], number> = {
  ICSOP_PDF: 0,
};

/**
 * 📝 **OJT 空狀態上傳入口（`OjtEmptyRow`／`OJT_EMPTY_TEXT`／`OJT_UPLOAD_FIRST_TEXT`／
 * `OJT_UPLOAD_FIRST_ARIA`）已於 2026-08-28 隨 F042 `AC-J11`③ 整段移除**——`data-ojt-empty`／
 * `data-ojt-upload`／`data-ojt-upload-mode` 三個掛鉤自此於本頁恆為 0 個。
 *
 * 🔴 移除之理由不是推翻「主管／部門窗口需要能登記 OJT」之原始需求（該需求由 F042 `AC-05` 之
 * 獨立管理頁承接），而是**模型本身已改變**：單份覆蓋式附件 → 多使用單位 × 多場次，文件表單之
 * 附件列形狀已無法承載新模型。取而代之者為 `OjtDerivedBlock`（唯讀衍生列）。
 * 原逐字內容見本檔 git 歷史（2026-08-21 `724532e` 之 prototype 補正）。
 */

/**
 * 把 OJT 唯讀衍生列插在**原 OJT 檔案列之列序位置**（prototype 16 `renderAttach()` 之
 * `rows.splice(1,0,…)`；`at` ＝伺服器附件段長度，有 ICSOP PDF 時即索引 1）。
 *
 * 🔒 OJT **仍是附件合併清單之一員**（`data-attachment-kind="ojt"`），只是其內容由「一份檔案」
 * 改為「已完成單位之衍生清單」——列本身不消失、列序不變，故標籤序列恆為
 * `檔案（ICSOP PDF）→ OJT 實體簽到表 → 使用表單…`。
 * 📝 本函式即原 `withOjtEmptyRow()` 之後繼（同一插入語意，插入物由空狀態列換成衍生列）。
 */
function withOjtDerivedRow(rows: JSX.Element[], row: JSX.Element, at: number): JSX.Element[] {
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

export function DocumentReadonlyPage(): JSX.Element {
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
  const [links, setLinks] = useState<DocumentLinkView[]>([]);
  const [lifecycles, setLifecycles] = useState<LifecycleView[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [forms, setForms] = useState<UsageFormRecord[]>([]);
  const [attachments, setAttachments] = useState<DocumentAttachmentRecord[]>([]);
  // F039 附錄：後端已依 sortOrder 遞增回傳（唯一排序權威），前端不再排序。
  const [appendices, setAppendices] = useState<DocumentAppendixRecord[]>([]);
  const [personNames, setPersonNames] = useState<Map<string, string>>(new Map());
  /**
   * F042 `AC-21`：已完成 OJT 之使用單位代碼（與清單頁之文件層三值狀態同源，見
   * `getDocumentOjtCompletion` 之註解）。載入失敗一律降級為空集合——本區塊為唯讀資訊，
   * 不應讓它的失敗擋住整頁文件檢視。
   */
  const [ojtCompletedOrgs, setOjtCompletedOrgs] = useState<string[]>([]);

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
      void loadOjtCompletion(id, setOjtCompletedOrgs);
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
  /** 單位原字串（`ORG_UNIT.name` ← DESC_CHI）。F042 已完成 OJT 單位清單用，與後端該欄一致。 */
  const orgName = useCallback((code: string | null) => (code ? orgByCode.get(code)?.name ?? code : '—'), [orgByCode]);
  /**
   * `orgUnitDisplayName` 之部層查表（處/室需以部層 `descFull` 為前綴自 `descFull` 切出室全名）。
   * 🔴 該參數為**必填**——設成選填的話，忘記傳的呼叫端會靜默退化回末段簡稱且測試照樣全綠。
   */
  const lookupOrg = useCallback(
    (code: string) => orgByCode.get(code) ?? null,
    [orgByCode],
  );
  /**
   * 制定部門／制定室別之顯示名（部＝descFull 全名、處/室＝DESC_CHI 末段）。
   * 🔴 與後端 `resolveOrgUnitDisplayName` 同一規則——本頁與後台清單頁必須顯示同一個字串。
   */
  const orgDisplayName = useCallback(
    (code: string | null) => {
      if (!code) return '—';
      const u = orgByCode.get(code);
      return u ? orgUnitDisplayName(u, lookupOrg) : code;
    },
    [orgByCode, lookupOrg],
  );
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
   * 📝 **`onUploadOjt` 已於 2026-08-28 隨 F042 `AC-22`／`AC-J11`③ 整條移除**——文件表單自此
   * 不提供任何 OJT 上傳、取代或覆蓋入口（含 ICSOPAdmin），其登記入口整批搬至「OJT 進度管理」
   * （`AC-05`）；後端之 `POST /admin/documents/:id/attachments/ojt` 亦已移除、現回 404（`AC-J2`）。
   */

  /** ICSOP PDF：走後台受控下載端點（blobPath）——RAW 原檔，不燒錄浮水印（F020 `AC-D4`）。 */
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
   * 檔案（ICSOP PDF）→ 使用表單 ×N → 附錄 ×N；缺者不列。
   * 「下載燒錄浮水印」徽章僅標示於 ICSOP PDF（伺服器端燒錄，前端不帶旗標）。
   *
   * 🔴 F042 `AC-J1`：**OJT 已非本清單之成員**（含其空狀態列），改由 `OjtDerivedBlock` 於清單
   * 之後獨立呈現；`kind` 值域仍保留 `ojt` 一格供該區塊使用（`AC-N75`① 之四值逐字不變）。
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
        // F042 `AC-J1`：附件型別已收斂為單一 `ICSOP_PDF`（OJT 不再是附件）。
        kind: 'icsop_pdf' as const,
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
    { label: '制定公司', value: view.companyName ?? view.companyCode },
    { label: '制定部門', value: orgDisplayName(view.draftingDeptId) },
    { label: '制定室別', value: orgDisplayName(view.draftingSectionId) },
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
          🔴 F042 `AC-J4` ①（2026-08-28）：唯讀提示**不再依角色分支**——`RO_NOTICE_FULL` 逐字一字
          未改，但適用範圍由「僅 SysAdmin」擴為 SysAdmin／Supervisor／DeptContact 三個唯讀角色。
          📝 被取代之原分支逐字保留供追溯：`{ojtWritable ? RO_NOTICE_OJT_EXCEPTION : RO_NOTICE_FULL}`。
        */
        <div role="note" className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2 rounded-lg flex items-start gap-2">
          <Icon name="eye" className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{RO_NOTICE_FULL}</span>
        </div>
      )}

      {/* 16 欄位唯讀 */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="file-text" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900">文件欄位（唯讀）</h2>
        </div>
        {/*
          🔴 F042 `AC-J8`／`AC-J9`：欄位區唯讀說明對**全部三個唯讀角色**顯示（原條件為
          「僅被開放 OJT 的兩個角色」，其存在理由隨破例收回而消失）——說明句本身亦已改為
          「全部 20 個欄位…本頁無任何可寫項」，對 SysAdmin 同樣為真，不再有誤讀之虞。
          📝 被取代之原條件逐字保留供追溯：`{ojtWritable && !canWrite && (...)}`。
        */}
        {!canWrite && (
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
        附件 — ICSOP PDF ／ 使用表單 ／ 附錄（合併清單，prototype 16 renderAttach）。
        🔴 F042 `AC-J1`：**OJT 已不是本清單之成員**——它自此不是一份「附件」，而是場次彙總而得
        之衍生值，改由下方 `OjtDerivedBlock` 唯讀呈現。
        🔴 F042 `AC-J4` ④：區塊標題與說明**收斂為單一值**，不再依角色或 OJT 可寫性分支。
        📝 被取代之原分支逐字保留供追溯：標題 `{ojtWritable ? '附件' : '附件（僅下載）'}`、
           說明 `{ojtWritable ? ATTACH_NOTE_OJT : ATTACH_NOTE_RO}`。
      */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 id="attachTitle" className="font-semibold text-slate-900">附件（僅下載）</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3 flex items-start gap-1.5">
          <Icon name="shield" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span id="attachNote">{ATTACH_NOTE_RO}</span>
        </p>
        <div className="space-y-2">
          {withOjtDerivedRow(
            attachItems.map((a) => {
              /*
                🔴 F042 `AC-J11` ①：`AC-N75` 之「恰 1 列可寫（OJT）」已反轉為**恰 0 個
                `data-writable-attachment`**——四種 kind 之列一律唯讀（含 ICSOPAdmin，其對 OJT
                本即 CRUD，但 OJT 欄本身已改為系統衍生、無人可寫）。
                📝 被反轉之原判定逐字保留供追溯：`const writable = a.kind === 'ojt' && ojtWritable;`。
              */
              const writable = false;
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
                  {/*
                    📝 **OJT 之「上傳／取代」`<label data-ojt-upload data-ojt-upload-mode="replace">`
                    已於 2026-08-28 隨 `AC-J11`③ 整段移除**——文件表單不再提供任何 OJT 寫入入口。
                  */}
                  <button onClick={a.onDownload} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs hover:bg-slate-50 shrink-0">
                    <Icon name="download" className="w-3.5 h-3.5" />下載
                  </button>
                </div>
              );
            }),
            /*
              F042 `AC-21`：OJT 唯讀衍生列——列出已完成 OJT 之使用單位；與後台清單頁之文件層
              三值狀態同源（`getDocumentOjtCompletion`），不另實作一套判定。
              🔒 **本列仍屬同一份附件合併清單**（prototype 16 `ojtDerivedRow()`），插在**原 OJT
              檔案列之列序位置**（伺服器附件段之後、使用表單段之前）⇒ 標籤序列恆為
              `檔案（ICSOP PDF）→ OJT 實體簽到表 → 使用表單…`。
              🔒 分母＝該文件之**全部**使用單位（`usingDeptIds`），**不套用 `isActive` 過濾**——
              與 TAB1 統計之口徑刻意不同（統計要的是「還追得動的部分」，本欄要的是「實際狀況」）。
              📌 本列**刻意不帶 `data-wm-note`、亦無下載鈕**：無檔案可下載、無浮水印可言；
              逐場次之下載入口在「OJT 進度管理」TAB2。
            */
            <OjtDerivedBlock
              key="ojt-derived"
              completedUnits={ojtCompletedOrgs.map((code) => orgName(code))}
              totalUnits={view.usingDeptIds.length}
              progressLink={
                <Link
                  data-ojt-progress-link=""
                  to="/admin/ojt-progress"
                  className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline shrink-0"
                >
                  <Icon name="external-link" className="w-3.5 h-3.5" />
                  {OJT_PROGRESS_LINK_TEXT}
                </Link>
              }
            />,
            attachments.length,
          )}
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
