import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  getUsageFormOverview,
  uploadUsageForms,
  overwriteUsageForm,
  deleteUsageForm,
  downloadPoolForm,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import type { UsageFormPoolItem } from '../api/types';

/**
 * F018 使用表單（表單池）管理。版面／結構／文案／欄寬權威來源：prototypes/19-usage-form-management.html。
 * 接真實端點：GET /admin/usage-forms/overview、POST /admin/usage-forms（multipart）、
 * PUT/DELETE /admin/usage-forms/:formId、GET /admin/usage-forms/:formId/download。
 *
 * RBAC：ICSOPAdmin CRUD、SysAdmin 唯讀（無上傳/覆蓋/移除，可查詢/下載/檢視關聯）、
 * 主管/部門窗口/一般使用者=無（自我守門封鎖，PERMISSION_DENIED）。後端 RBAC 為權威，前端另做自我守門。
 *
 * 覆蓋共用門檻：docCount≥2 → 二次確認（USAGE_FORM_OVERWRITE_SHARED，附引用文件清單）。
 * 移除保護：docCount≥1 → 二次確認（USAGE_FORM_IN_USE，解除全部關聯）。
 * 表單↔文件關聯之「編輯」屬文件建立/編輯側（F014）；本頁對關聯僅唯讀展開檢視（依 prototype 定位）。
 */

type FmtClass = 'excel' | 'pdf';

function classifyFormat(format: string): FmtClass {
  const f = format.toLowerCase();
  return f === 'xlsx' || f === 'xls' ? 'excel' : 'pdf';
}

/** 允許之上傳副檔名（與後端 file-rules USAGE_FORM 一致；權威為副檔名）。 */
function detectAllowedFmt(fileName: string): FmtClass | null {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  if (ext === 'pdf') return 'pdf';
  return null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('sv-SE');
}

interface Notice {
  tone: 'success' | 'danger' | 'info';
  text: string;
  code?: string;
}
const TONE_BADGE: Record<string, string> = {
  success: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  danger: 'text-red-700 bg-red-50 border-red-100',
  info: 'text-blue-700 bg-blue-50 border-blue-100',
};

interface ConfirmState {
  title: string;
  body: string;
  code?: string;
  okLabel: string;
  documents?: UsageFormPoolItem['documents'];
  onConfirm: () => void | Promise<void>;
}

function FormatBadge({ fmt }: { fmt: FmtClass }): JSX.Element {
  return fmt === 'excel' ? (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: '#047857', background: '#D1FAE5' }}
    >
      <Icon name="file-spreadsheet" className="w-3 h-3" />
      excel
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: '#B91C1C', background: '#FEE2E2' }}
    >
      <Icon name="file-text" className="w-3 h-3" />
      pdf
    </span>
  );
}

export function UsageFormManagementPage(): JSX.Element {
  const { user } = useAuth();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.USAGE_FORM_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.USAGE_FORM_MANAGEMENT, 'write');

  const [items, setItems] = useState<UsageFormPoolItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [fmtFilter, setFmtFilter] = useState<'' | FmtClass>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);

  // 上傳 modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadFmtErr, setUploadFmtErr] = useState(false);
  const [uploadNameErr, setUploadNameErr] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 覆蓋（以隱藏 input 選新檔）
  const overwriteInputRef = useRef<HTMLInputElement>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<UsageFormPoolItem | null>(null);

  // 二次確認 modal（覆蓋共用 / 移除保護共用）
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getUsageFormOverview());
    } catch (e) {
      setNotice({ tone: 'danger', text: e instanceof ApiError ? e.code : '載入表單池失敗' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const rows = useMemo(() => {
    const list = items ?? [];
    const kw = keyword.trim().toLowerCase();
    return list.filter(
      (f) =>
        (!kw || f.name.toLowerCase().includes(kw)) &&
        (!fmtFilter || classifyFormat(f.format) === fmtFilter),
    );
  }, [items, keyword, fmtFilter]);

  const toggleExpand = (id: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearFilters = (): void => {
    setKeyword('');
    setFmtFilter('');
  };

  // ── 下載 ──
  const onDownload = useCallback(async (form: UsageFormPoolItem) => {
    try {
      const grant = await downloadPoolForm(form.id);
      window.open(grant.url, '_blank', 'noopener,noreferrer');
      setNotice({ tone: 'success', text: `已下載表單「${form.name}」` });
    } catch (e) {
      setNotice({ tone: 'danger', text: e instanceof ApiError ? `下載失敗：${e.code}` : '下載失敗' });
    }
  }, []);

  // ── 上傳 ──
  const openUpload = (): void => {
    setUploadFile(null);
    setUploadName('');
    setUploadFmtErr(false);
    setUploadNameErr(false);
    setUploadOpen(true);
  };
  const onUploadPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!detectAllowedFmt(f.name)) {
      setUploadFile(null);
      setUploadFmtErr(true);
      return;
    }
    setUploadFmtErr(false);
    setUploadFile(f);
    if (!uploadName.trim()) setUploadName(f.name);
  };
  const submitUpload = async (): Promise<void> => {
    if (!uploadFile) {
      setUploadFmtErr(true);
      return;
    }
    if (!uploadName.trim()) {
      setUploadNameErr(true);
      return;
    }
    setSubmitting(true);
    try {
      // 表單名稱隨 multipart 一併送出（prototype 19 submitUpload 以 upName.trim() 為記錄名稱）。
      await uploadUsageForms([uploadFile], uploadName.trim());
      setUploadOpen(false);
      setNotice({ tone: 'success', text: `已上傳表單「${uploadName.trim()}」（初始關聯 0 份）` });
      await load();
    } catch (e) {
      setNotice({
        tone: 'danger',
        text: e instanceof ApiError ? `上傳失敗：${e.code}` : '上傳失敗',
        code: e instanceof ApiError ? e.code : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── 覆蓋 ──
  const onOverwriteClick = (form: UsageFormPoolItem): void => {
    setOverwriteTarget(form);
    overwriteInputRef.current?.click();
  };
  const onOverwritePick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const form = overwriteTarget;
    if (!file || !form) return;
    if (!detectAllowedFmt(file.name)) {
      setNotice({
        tone: 'danger',
        text: '檔案格式不支援，僅允許 excel（.xlsx / .xls）與 pdf',
        code: 'FILE_FORMAT_NOT_ALLOWED',
      });
      setOverwriteTarget(null);
      return;
    }
    const doOverwrite = async (): Promise<void> => {
      await overwriteUsageForm(form.id, file, true);
      setNotice({
        tone: 'success',
        text:
          form.docCount >= 2
            ? `已覆蓋，${form.docCount} 份引用文件所見同步更新`
            : `已覆蓋表單「${form.name}」`,
      });
      setOverwriteTarget(null);
      await load();
    };
    if (form.docCount >= 2) {
      setConfirm({
        title: `覆蓋共用表單「${form.name}」？`,
        body: `此表單另被 ${form.docCount} 份文件引用，覆蓋將同時更新全部引用文件所見內容。此為覆蓋上傳、不保留版本；取消則原檔不變。`,
        code: 'USAGE_FORM_OVERWRITE_SHARED',
        okLabel: '確認覆蓋',
        documents: form.documents,
        onConfirm: doOverwrite,
      });
    } else {
      setConfirm({
        title: `更新表單「${form.name}」？`,
        body:
          (form.docCount === 1
            ? '此表單目前僅被 1 份文件引用，'
            : '此表單目前尚無其他文件引用，') +
          '覆蓋上傳將以新檔取代原檔（不保留版本），不影響其他文件。',
        okLabel: '確認覆蓋',
        onConfirm: doOverwrite,
      });
    }
  };

  // ── 移除 ──
  const onRemoveClick = (form: UsageFormPoolItem): void => {
    const doDelete = async (confirmed: boolean): Promise<void> => {
      await deleteUsageForm(form.id, confirmed);
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(form.id);
        return next;
      });
      setNotice({
        tone: 'success',
        text:
          form.docCount >= 1
            ? `表單已移除，並解除 ${form.docCount} 份文件關聯`
            : '表單已移除',
      });
      await load();
    };
    if (form.docCount >= 1) {
      setNotice({
        tone: 'danger',
        text: `此表單已被 ${form.docCount} 份文件使用，無法直接移除`,
        code: 'USAGE_FORM_IN_USE',
      });
      setConfirm({
        title: `確認移除「${form.name}」？`,
        body: `此表單已被 ${form.docCount} 份文件使用，移除將一併解除這 ${form.docCount} 份文件的關聯，且無法復原。此操作將記錄稽核。`,
        code: 'USAGE_FORM_IN_USE · 409',
        okLabel: '仍要移除並解除關聯',
        documents: form.documents,
        onConfirm: () => doDelete(true),
      });
    } else {
      setConfirm({
        title: `移除表單「${form.name}」？`,
        body: '此表單目前無任何文件關聯，可安全移除。移除後將記錄稽核。',
        okLabel: '確認移除',
        onConfirm: () => doDelete(false),
      });
    }
  };

  const runConfirm = async (): Promise<void> => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
      setConfirm(null);
    } catch (e) {
      setNotice({
        tone: 'danger',
        text: e instanceof ApiError ? `操作失敗：${e.code}` : '操作失敗',
        code: e instanceof ApiError ? e.code : undefined,
      });
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  // ── 無權限封鎖（Supervisor/DeptContact/User）──
  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無使用表單管理權限</h1>
        <p className="text-sm text-slate-500 mt-1">
          僅 ICSOP 管理員（可維護）與系統管理員（唯讀）可存取表單池。
        </p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const filtersActive = keyword.trim() !== '' || fmtFilter !== '';

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={['使用表單管理', '表單池']} title="使用表單（表單池）管理">
        {canWrite && (
          <button
            onClick={openUpload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="upload" className="w-4 h-4" />
            上傳表單
          </button>
        )}
      </PageHeader>

      {/* 唯讀提示（SysAdmin） */}
      {canRead && !canWrite && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm border bg-cyan-50 border-cyan-200 text-cyan-800">
          <Icon name="eye" className="w-4 h-4" />
          唯讀模式 · 系統管理員僅可查詢與下載表單、檢視關聯文件，無法上傳或移除（FIELD_WRITE_FORBIDDEN）。
        </div>
      )}

      {/* 說明 */}
      <div className="flex items-start gap-2 text-sm text-slate-500">
        <Icon name="info" className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
        <p>
          表單池集中管理各 ICSOP 文件所引用的 excel / pdf 使用表單。文件於建立/編輯時由此表單池選取關聯；
          本頁負責上傳、下載、檢視關聯與移除。
        </p>
      </div>

      {notice && (
        <div role="status" className={`text-sm border rounded-md px-3 py-2 ${TONE_BADGE[notice.tone]}`}>
          {notice.text}
          {notice.code && <span className="ml-2 text-[10px] mono opacity-70">{notice.code}</span>}
        </div>
      )}

      {/* 工具列 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            aria-label="搜尋表單名稱"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            type="search"
            placeholder="搜尋表單名稱…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
          />
        </div>
        <select
          aria-label="格式篩選"
          value={fmtFilter}
          onChange={(e) => setFmtFilter(e.target.value as '' | FmtClass)}
          className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
        >
          <option value="">所有格式</option>
          <option value="excel">excel</option>
          <option value="pdf">pdf</option>
        </select>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 rounded-md text-sm text-primary-600 hover:bg-primary-50"
          >
            清除
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500">共 {rows.length} 個表單</span>
      </div>

      {/* 清單 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">表單名稱</th>
                <th className="text-left font-medium px-4 py-2.5">格式</th>
                <th className="text-left font-medium px-4 py-2.5">大小</th>
                <th className="text-left font-medium px-4 py-2.5">上傳者 / 上傳時間</th>
                <th className="text-left font-medium px-4 py-2.5">關聯文件數</th>
                <th className="text-left font-medium px-4 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((f) => {
                const fmt = classifyFormat(f.format);
                const isOpen = expanded.has(f.id);
                const n = f.docCount;
                return (
                  <FormRow
                    key={f.id}
                    form={f}
                    fmt={fmt}
                    isOpen={isOpen}
                    n={n}
                    canWrite={canWrite}
                    onToggle={() => toggleExpand(f.id)}
                    onDownload={() => void onDownload(f)}
                    onOverwrite={() => onOverwriteClick(f)}
                    onRemove={() => onRemoveClick(f)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-14">
            <Icon name="inbox" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">查無符合的表單</p>
          </div>
        ) : null}
      </section>

      {/* 覆蓋用隱藏 input（每列共用；overwriteTarget 記錄目標） */}
      <input
        ref={overwriteInputRef}
        type="file"
        accept=".xlsx,.xls,.pdf"
        aria-label="覆蓋檔案"
        className="sr-only"
        onChange={onOverwritePick}
      />

      {/* 上傳 modal */}
      {uploadOpen && (
        <div
          role="dialog"
          aria-label="上傳使用表單"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">上傳使用表單</h3>
              <button onClick={() => setUploadOpen(false)} aria-label="關閉" className="text-slate-400 hover:text-slate-600">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  選擇檔案 <span className="text-red-500">*</span>
                </label>
                <label className="w-full border border-dashed border-slate-300 rounded-lg px-4 py-5 flex flex-col items-center gap-1 text-slate-500 hover:border-primary-400 hover:bg-primary-50/40 cursor-pointer">
                  <Icon name="upload-cloud" className="w-6 h-6 text-slate-400" />
                  <span className="text-sm">點此選擇檔案</span>
                  <span className="text-xs text-slate-400">支援格式：excel（.xlsx / .xls）、pdf</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.pdf"
                    aria-label="選擇檔案"
                    className="sr-only"
                    onChange={onUploadPick}
                  />
                </label>
                {uploadFile && (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <Icon
                      name={detectAllowedFmt(uploadFile.name) === 'excel' ? 'file-spreadsheet' : 'file-text'}
                      className="w-4 h-4 text-slate-500"
                    />
                    <span className="text-slate-700 truncate">{uploadFile.name}</span>
                    <span className="ml-auto">
                      <FormatBadge fmt={detectAllowedFmt(uploadFile.name) ?? 'pdf'} />
                    </span>
                  </div>
                )}
                {uploadFmtErr && (
                  <p className="mt-2 text-xs text-red-600 flex items-start gap-1">
                    <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>檔案格式不支援，僅允許 excel（.xlsx / .xls）與 pdf（FILE_FORMAT_NOT_ALLOWED）。</span>
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="uf-upload-name" className="block text-sm font-medium text-slate-700 mb-1">
                  表單名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  id="uf-upload-name"
                  type="text"
                  value={uploadName}
                  onChange={(e) => {
                    setUploadName(e.target.value);
                    if (e.target.value.trim()) setUploadNameErr(false);
                  }}
                  placeholder="請輸入表單名稱（可沿用檔名）"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
                {uploadNameErr && <p className="mt-1 text-xs text-red-600">表單名稱不可為空。</p>}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                <Icon name="hard-drive" className="w-3.5 h-3.5 text-slate-400" />
                檔案大小上限 <span className="font-medium text-slate-600">50&nbsp;MB</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setUploadOpen(false)} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
                取消
              </button>
              <button
                onClick={() => void submitUpload()}
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50"
              >
                上傳
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 二次確認 modal（覆蓋共用 / 移除保護） */}
      {confirm && (
        <div
          role="dialog"
          aria-label="操作確認"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" className="w-5 h-5 text-red-500" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{confirm.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{confirm.body}</p>
                {confirm.code && <p className="text-[10px] mono text-red-500 mt-1.5">{confirm.code}</p>}
              </div>
            </div>
            {confirm.documents && confirm.documents.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 divide-y divide-slate-100">
                {confirm.documents.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-1.5">
                    <Icon name="file-text" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="mono text-xs text-slate-600 shrink-0">{d.documentNumber}</span>
                    <span className="text-sm text-slate-700 truncate">{d.documentName}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
                取消
              </button>
              <button
                onClick={() => void runConfirm()}
                disabled={confirmBusy}
                className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {confirm.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 單列（含可展開之關聯文件檢視）。 */
function FormRow({
  form,
  fmt,
  isOpen,
  n,
  canWrite,
  onToggle,
  onDownload,
  onOverwrite,
  onRemove,
}: {
  form: UsageFormPoolItem;
  fmt: FmtClass;
  isOpen: boolean;
  n: number;
  canWrite: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onOverwrite: () => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name={fmt === 'excel' ? 'file-spreadsheet' : 'file-text'} className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="font-medium text-slate-800">{form.name}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <FormatBadge fmt={fmt} />
        </td>
        <td className="px-4 py-3 text-slate-500 mono text-xs">{formatSize(form.size)}</td>
        <td className="px-4 py-3">
          <div className="text-slate-700">{form.uploadedBy}</div>
          <div className="text-slate-400 mono text-xs">{formatDate(form.uploadedAt)}</div>
        </td>
        <td className="px-4 py-3">
          {n > 0 ? (
            <button
              onClick={onToggle}
              title="展開檢視關聯文件"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100"
            >
              <Icon name="link" className="w-3 h-3" />
              {n} 份
              <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Icon name="link-2-off" className="w-3 h-3" />
              未關聯
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-start gap-1">
            <button
              onClick={onDownload}
              title="下載"
              className="w-8 h-8 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center"
            >
              <Icon name="download" className="w-4 h-4" />
            </button>
            {n > 0 && (
              <button
                onClick={onToggle}
                title={isOpen ? '收合關聯' : '展開檢視關聯'}
                className="w-8 h-8 rounded hover:bg-slate-100 text-slate-500 flex items-center justify-center"
              >
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="w-4 h-4" />
              </button>
            )}
            {canWrite && (
              <>
                <button
                  onClick={onOverwrite}
                  title="更新／覆蓋上傳"
                  className="w-8 h-8 rounded hover:bg-amber-50 text-amber-600 flex items-center justify-center"
                >
                  <Icon name="upload" className="w-4 h-4" />
                </button>
                <button
                  onClick={onRemove}
                  title="移除"
                  className="w-8 h-8 rounded hover:bg-red-50 text-red-500 flex items-center justify-center"
                >
                  <Icon name="trash-2" className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {isOpen && n > 0 && (
        <tr className="bg-slate-50/70">
          <td colSpan={6} className="px-4 py-3">
            <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
              <Icon name="corner-down-right" className="w-3.5 h-3.5" />
              使用此表單的 ICSOP 文件（{n}）
            </div>
            <div className="flex flex-col gap-1">
              {form.documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 border border-transparent"
                >
                  <span className="mono text-xs text-slate-600">{d.documentNumber}</span>
                  <span className="text-sm text-slate-800">{d.documentName}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
