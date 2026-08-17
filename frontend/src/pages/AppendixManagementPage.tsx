import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getAppendixPoolOverview,
  uploadAppendix,
  overwriteAppendix,
  deleteAppendix,
  downloadAppendixFromPool,
  exportAppendixPool,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import {
  EXPORT_LIMIT_BADGE,
  EXPORT_ROW_LIMIT,
  countFromLimitError,
  isExportLimitError,
} from '../domain/export-feedback';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import type { AppendixPoolItem } from '../api/types';

/**
 * F039 附錄（附錄池）管理。版面／結構／文案／欄寬權威來源：prototypes/24-appendix-management.html。
 * 接真實端點：GET /admin/appendices/overview、POST /admin/appendices（multipart，欄位名 files）、
 * PUT/DELETE /admin/appendices/:appendixId、GET /admin/appendices/:appendixId/download。
 *
 * RBAC（AC-31～AC-33）：ICSOPAdmin CRUD、SysAdmin 唯讀（可查詢/下載/展開關聯，無上傳/覆蓋/移除）、
 * 主管/部門窗口/一般使用者＝無（自我守門封鎖，PERMISSION_DENIED）。後端 RBAC 為權威，前端另做自我守門。
 *
 * 覆蓋共用門檻（AC-11/AC-12）：docCount≥2 → 二次確認（APPENDIX_OVERWRITE_SHARED，附引用文件清單）；
 * ≤1 直接一般確認。移除保護（AC-08/AC-10）：docCount≥1 → 二次確認（APPENDIX_IN_USE，解除全部關聯）。
 * 附錄↔文件之關聯與**顯示順序**於文件建立/編輯畫面維護（本頁對關聯僅唯讀展開檢視）。
 */

type FmtClass = 'excel' | 'pdf';

/** 附錄格式（xlsx/xls/pdf）→ 清單顯示之兩類（prototype 24 fmtBadge）。 */
function classifyFormat(format: string): FmtClass {
  const f = format.toLowerCase();
  return f === 'xlsx' || f === 'xls' ? 'excel' : 'pdf';
}

/** 允許之上傳副檔名（與後端 file-rules APPENDIX 一致；權威為副檔名）。 */
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

const FMT_ERROR =
  '格式不支援，僅允許 excel（.xlsx / .xls）與 pdf；本批次不建立任何附錄（FILE_FORMAT_NOT_ALLOWED）。';

interface ConfirmState {
  title: string;
  body: string;
  code?: string;
  okLabel: string;
  documents?: AppendixPoolItem['documents'];
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

export function AppendixManagementPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.APPENDIX_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.APPENDIX_MANAGEMENT, 'write');

  const [items, setItems] = useState<AppendixPoolItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [fmtFilter, setFmtFilter] = useState<'' | FmtClass>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 上傳 modal（可一次選取多檔；名稱僅單檔路徑提供）
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadName, setUploadName] = useState('');
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 覆蓋（以隱藏 input 選新檔；目標由 overwriteTarget 記錄）
  const overwriteInputRef = useRef<HTMLInputElement>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<AppendixPoolItem | null>(null);

  // 二次確認 modal（覆蓋共用 / 移除保護共用）
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getAppendixPoolOverview());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.code : '載入附錄池失敗');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const rows = useMemo(() => {
    const list = items ?? [];
    const kw = keyword.trim().toLowerCase();
    return list.filter(
      (a) =>
        (!kw || a.name.toLowerCase().includes(kw)) &&
        (!fmtFilter || classifyFormat(a.format) === fmtFilter),
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

  /**
   * F039 `AC-D5`／`AC-D12`：匯出當前篩選之全部結果。
   * 逐字回饋文案為**本頁專屬句式**（量詞「筆數」、限定詞「篩選條件」）——與變更歷程兩 tab
   * 之「事件」／「查詢條件」刻意不同，不得互相對齊。
   */
  const onExport = useCallback(async () => {
    try {
      await exportAppendixPool({ q: keyword.trim() || undefined, format: fmtFilter || undefined });
      toast.success('已匯出附錄清單（CSV，UTF-8 BOM）');
    } catch (e) {
      if (isExportLimitError(e)) {
        toast.error(
          `符合條件之筆數為 ${countFromLimitError(e)} 筆，超過匯出上限 ${EXPORT_ROW_LIMIT} 筆，請縮小篩選條件`,
          { code: EXPORT_LIMIT_BADGE },
        );
        return;
      }
      toast.error(e instanceof ApiError ? `匯出失敗：${e.code}` : '匯出失敗');
    }
  }, [keyword, fmtFilter, toast]);

  // ── 下載（後台管理端存取：不寫稽核、不燒錄浮水印）──
  const onDownload = useCallback(
    async (appendix: AppendixPoolItem) => {
      try {
        const grant = await downloadAppendixFromPool(appendix.id);
        window.open(grant.url, '_blank', 'noopener,noreferrer');
        toast.success(`已下載附錄「${appendix.name}」（管理端存取，不寫稽核、不燒錄浮水印）`);
      } catch (e) {
        toast.error(e instanceof ApiError ? `下載失敗：${e.code}` : '下載失敗');
      }
    },
    [toast],
  );

  // ── 上傳（AC-01～AC-07）──
  const openUpload = (): void => {
    setUploadFiles([]);
    setUploadName('');
    setUploadErr(null);
    setUploadOpen(true);
  };
  /**
   * AC-02「先全部驗證、再全部建立」之前端對位：任一檔格式不合法 → 整批不採用（picked 清空），
   * 送出鈕不會發出請求（後端仍為權威把關）。
   */
  const onUploadPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;
    const bad = picked.find((f) => !detectAllowedFmt(f.name));
    if (bad) {
      setUploadFiles([]);
      setUploadErr(`「${bad.name}」${FMT_ERROR}`);
      toast.error('檔案格式不支援，僅允許 excel / pdf（FILE_FORMAT_NOT_ALLOWED · 400）');
      return;
    }
    setUploadErr(null);
    setUploadFiles(picked);
    // 單檔：選檔後自動帶入檔名（仍為選填，可清空 → fallback 檔名）；多檔：不提供自訂名稱。
    setUploadName(picked.length === 1 ? picked[0].name : '');
  };
  const submitUpload = async (): Promise<void> => {
    if (uploadFiles.length === 0) {
      setUploadErr('請先選擇檔案（excel / pdf，可一次選取多個）。');
      return;
    }
    const multi = uploadFiles.length > 1;
    const name = uploadName.trim();
    setSubmitting(true);
    try {
      // 多檔不接受自訂名稱（F039 Alt Flow）；單檔留空則由後端 fallback 原始檔名（AC-06）。
      await uploadAppendix(uploadFiles, multi ? undefined : name || undefined);
      setUploadOpen(false);
      toast.success(
        multi
          ? `已上傳 ${uploadFiles.length} 個附錄（各以原始檔名建檔，初始關聯 0 份）`
          : `已上傳附錄「${name || uploadFiles[0].name}」（初始關聯 0 份）`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? `上傳失敗：${e.code}` : '上傳失敗');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 覆蓋（AC-11～AC-15）──
  const onOverwriteClick = (appendix: AppendixPoolItem): void => {
    setOverwriteTarget(appendix);
    overwriteInputRef.current?.click();
  };
  const onOverwritePick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const appendix = overwriteTarget;
    if (!file || !appendix) return;
    // AC-15：格式驗證優先於共用引用數判斷——不合法一律先擋，不進入 409 警示流程。
    if (!detectAllowedFmt(file.name)) {
      toast.error(
        '檔案格式不支援，僅允許 excel（.xlsx / .xls）與 pdf；原檔不變（FILE_FORMAT_NOT_ALLOWED）',
      );
      setOverwriteTarget(null);
      return;
    }
    const shared = appendix.docCount >= 2;
    const doOverwrite = async (): Promise<void> => {
      await overwriteAppendix(appendix.id, file, shared);
      toast.success(
        shared
          ? `已覆蓋，${appendix.docCount} 份引用文件所見同步更新（舊檔即時失效、不留歷史版本）`
          : `已覆蓋附錄「${appendix.name}」`,
      );
      setOverwriteTarget(null);
      await load();
    };
    setConfirm(
      shared
        ? {
            title: `覆蓋共用附錄「${appendix.name}」？`,
            body: `此附錄另被 ${appendix.docCount} 份文件引用，覆蓋將同時更新全部引用文件所見內容。此為覆蓋上傳、不保留版本，且不變更附錄名稱；取消則原檔與全部既有關聯不變。`,
            code: 'APPENDIX_OVERWRITE_SHARED · 409',
            okLabel: '確認覆蓋',
            documents: appendix.documents,
            onConfirm: doOverwrite,
          }
        : {
            title: `更新附錄「${appendix.name}」？`,
            body:
              (appendix.docCount === 1
                ? '此附錄目前僅被 1 份文件引用，'
                : '此附錄目前尚無文件引用，') +
              `覆蓋上傳將以新檔「${file.name}」取代原檔（不保留版本、不變更附錄名稱），不影響其他文件。`,
            okLabel: '確認覆蓋',
            onConfirm: doOverwrite,
          },
    );
  };

  // ── 移除（AC-08～AC-10）──
  const onRemoveClick = (appendix: AppendixPoolItem): void => {
    const inUse = appendix.docCount >= 1;
    const doDelete = async (): Promise<void> => {
      await deleteAppendix(appendix.id, inUse);
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(appendix.id);
        return next;
      });
      toast.success(
        inUse ? `附錄已移除，並解除 ${appendix.docCount} 份文件關聯` : '附錄已移除',
      );
      await load();
    };
    if (inUse) {
      toast.error(
        `此附錄已被 ${appendix.docCount} 份文件使用，無法直接移除（APPENDIX_IN_USE · 409）`,
      );
      setConfirm({
        title: `確認移除「${appendix.name}」？`,
        body: `此附錄已被 ${appendix.docCount} 份文件使用，移除將一併解除這 ${appendix.docCount} 份文件的關聯，且無法復原。其餘附錄於各文件內之順序將重新編號為連續 1..N。`,
        code: 'APPENDIX_IN_USE · 409',
        okLabel: '仍要移除並解除關聯',
        documents: appendix.documents,
        onConfirm: doDelete,
      });
    } else {
      setConfirm({
        title: `移除附錄「${appendix.name}」？`,
        body: '此附錄目前無任何文件關聯，可安全移除。移除後不可再被任何文件搜尋或關聯。',
        okLabel: '確認移除',
        onConfirm: doDelete,
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
      toast.error(e instanceof ApiError ? `操作失敗：${e.code}` : '操作失敗');
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  // ── 無權限封鎖（主管／部門窗口／一般使用者，AC-33；prototype 24 blockOverlay）──
  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無附錄管理權限</h1>
        <p className="text-sm text-slate-500 mt-1">
          僅 ICSOP 管理員（可維護）與系統管理員（唯讀）可存取附錄池。
        </p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const filtersActive = keyword.trim() !== '' || fmtFilter !== '';
  const multiPick = uploadFiles.length > 1;

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={[{ label: '附錄管理' }, { label: '附錄池' }]} title="附錄（附錄池）管理">
        {/*
          F039 `AC-D4`：topbar 動作區之「匯出」鈕。
          🔴 **非** write-only——匯出屬讀取類動作，SysAdmin（唯讀）亦允許（prototype 24 行 61-65 明注）。
        */}
        <button
          onClick={() => void onExport()}
          aria-label="匯出"
          title="匯出附錄清單（CSV）"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Icon name="download" className="w-4 h-4" />
          匯出
        </button>
        {canWrite && (
          <button
            onClick={openUpload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="upload" className="w-4 h-4" />
            上傳附錄
          </button>
        )}
      </PageHeader>

      {/* 唯讀提示（SysAdmin，AC-32；prototype 24 roBanner） */}
      {canRead && !canWrite && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm border bg-cyan-50 border-cyan-200 text-cyan-800">
          <Icon name="eye" className="w-4 h-4" />
          唯讀模式 · 系統管理員僅可查詢與下載附錄、檢視關聯文件，無法上傳、更新或移除（FIELD_WRITE_FORBIDDEN）。
        </div>
      )}

      {/* 說明（prototype 24 intro） */}
      <div className="flex items-start gap-2 text-sm text-slate-500">
        <Icon name="info" className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
        <p>
          附錄池集中管理各 ICSOP 文件所引用的 excel / pdf 附錄。本頁負責上傳、下載、更新（覆蓋）、檢視關聯與移除；
          <strong className="text-slate-600">文件與附錄之關聯與顯示順序</strong>
          於「ICSOP 文件管理」建立／編輯畫面以上移／下移排定。
        </p>
      </div>

      {/* 工具列 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            aria-label="搜尋附錄名稱"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            type="search"
            placeholder="搜尋附錄名稱…"
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
        <span className="ml-auto text-sm text-slate-500">共 {rows.length} 個附錄</span>
      </div>

      {/* 清單（六欄，逐字對照 prototype 24 thead） */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">附錄名稱</th>
                <th className="text-left font-medium px-4 py-2.5">格式</th>
                <th className="text-left font-medium px-4 py-2.5">大小</th>
                <th className="text-left font-medium px-4 py-2.5">上傳者 / 上傳時間</th>
                <th className="text-left font-medium px-4 py-2.5">關聯文件數</th>
                <th className="text-left font-medium px-4 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <AppendixRow
                  key={a.id}
                  appendix={a}
                  fmt={classifyFormat(a.format)}
                  isOpen={expanded.has(a.id)}
                  canWrite={canWrite}
                  onToggle={() => toggleExpand(a.id)}
                  onDownload={() => void onDownload(a)}
                  onOverwrite={() => onOverwriteClick(a)}
                  onRemove={() => onRemoveClick(a)}
                  onJump={(documentId) => navigate(`/admin/documents/${documentId}`)}
                />
              ))}
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
            <p className="text-slate-500 text-sm">查無符合的附錄</p>
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

      {/* 上傳 modal（prototype 24 upModal） */}
      {uploadOpen && (
        <div
          role="dialog"
          aria-label="上傳附錄"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">上傳附錄</h3>
              <button
                onClick={() => setUploadOpen(false)}
                aria-label="關閉"
                className="text-slate-400 hover:text-slate-600"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  選擇檔案 <span className="text-red-500">*</span>{' '}
                  <span className="text-xs font-normal text-slate-400">（可一次選取多個）</span>
                </label>
                <label className="w-full border border-dashed border-slate-300 rounded-lg px-4 py-5 flex flex-col items-center gap-1 text-slate-500 hover:border-primary-400 hover:bg-primary-50/40 cursor-pointer">
                  <Icon name="upload-cloud" className="w-6 h-6 text-slate-400" />
                  <span className="text-sm">點此選擇檔案（可多選）</span>
                  <span className="text-xs text-slate-400">
                    支援格式：excel（.xlsx / .xls）、pdf；單檔上限 50 MB
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.pdf"
                    multiple
                    aria-label="選擇檔案"
                    className="sr-only"
                    onChange={onUploadPick}
                  />
                </label>
                {uploadFiles.length > 0 && (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {uploadFiles.map((f) => (
                      <div key={f.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <Icon
                          name={detectAllowedFmt(f.name) === 'excel' ? 'file-spreadsheet' : 'file-text'}
                          className="w-4 h-4 text-slate-500 shrink-0"
                        />
                        <span className="text-slate-700 truncate flex-1">{f.name}</span>
                        <span className="ml-auto shrink-0">
                          <FormatBadge fmt={detectAllowedFmt(f.name) ?? 'pdf'} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {uploadErr && (
                  <p className="mt-2 text-xs text-red-600 flex items-start gap-1">
                    <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{uploadErr}</span>
                  </p>
                )}
                {multiPick && (
                  <p className="mt-2 text-[11px] text-slate-500 flex items-start gap-1">
                    <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                    <span>
                      多檔一次送出採「<strong className="text-slate-600">先全部驗證、再全部建立</strong>
                      」；任一檔格式或大小不合法，整批皆不建立。
                    </span>
                  </p>
                )}
              </div>

              {/* 名稱：僅單檔路徑提供（選填，留空 fallback 檔名） */}
              {multiPick ? (
                <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                  <Icon name="files" className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                  <span>
                    多檔上傳<strong className="text-slate-600">不提供自訂名稱</strong>
                    ，各檔一律以其原始檔名建檔。如需自訂名稱請改為單檔上傳。
                  </span>
                </div>
              ) : (
                <div>
                  <label htmlFor="ax-upload-name" className="block text-sm font-medium text-slate-700 mb-1">
                    附錄名稱{' '}
                    <span className="text-xs font-normal text-slate-400">
                      （選填；留空自動採用檔名）
                    </span>
                  </label>
                  <input
                    id="ax-upload-name"
                    type="text"
                    maxLength={500}
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="留空則以原始檔名建檔"
                    className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    選檔後自動帶入檔名，可自行改寫；前後空白會自動去除，上限 400 字元。
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                <Icon name="hard-drive" className="w-3.5 h-3.5 text-slate-400" />
                檔案大小上限 <span className="font-medium text-slate-600">50&nbsp;MB</span> · 允許格式{' '}
                <span className="font-medium text-slate-600">xlsx / xls / pdf</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setUploadOpen(false)}
                className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
              >
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

      {/* 二次確認 modal（覆蓋共用 / 移除保護；prototype 24 confirmModal） */}
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
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
              >
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

/** 單列（含可展開之關聯文件檢視，AC-17；逐字對照 prototype 24 renderTable 之列版面）。 */
function AppendixRow({
  appendix,
  fmt,
  isOpen,
  canWrite,
  onToggle,
  onDownload,
  onOverwrite,
  onRemove,
  onJump,
}: {
  appendix: AppendixPoolItem;
  fmt: FmtClass;
  isOpen: boolean;
  canWrite: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onOverwrite: () => void;
  onRemove: () => void;
  onJump: (documentId: string) => void;
}): JSX.Element {
  const n = appendix.docCount;
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon
              name={fmt === 'excel' ? 'file-spreadsheet' : 'file-text'}
              className="w-4 h-4 text-slate-400 shrink-0"
            />
            <span className="font-medium text-slate-800">{appendix.name}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <FormatBadge fmt={fmt} />
        </td>
        <td className="px-4 py-3 text-slate-500 mono text-xs">{formatSize(appendix.size)}</td>
        <td className="px-4 py-3">
          <div className="text-slate-700">
            {appendix.uploadedByName ?? appendix.uploadedBy}
            {appendix.uploadedByDept && (
              <span className="text-slate-400 text-xs ml-1">{appendix.uploadedByDept}</span>
            )}
          </div>
          <div className="text-slate-400 mono text-xs">{formatDate(appendix.uploadedAt)}</div>
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
              使用此附錄的 ICSOP 文件（{n}）
            </div>
            <div className="flex flex-col gap-1">
              {appendix.documents.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onJump(d.id)}
                  className="group flex items-center gap-2 text-left rounded-md px-2.5 py-1.5 hover:bg-white border border-transparent hover:border-slate-200"
                >
                  <span className="mono text-xs text-slate-600">{d.documentNumber}</span>
                  <span className="text-sm text-slate-800">{d.documentName}</span>
                  <Icon
                    name="external-link"
                    className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary-500 ml-auto"
                  />
                </button>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
