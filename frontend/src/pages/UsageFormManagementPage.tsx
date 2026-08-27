import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getOrgUnits,
  getUsageFormOverview,
  overwriteUsageForm,
  deleteUsageForm,
  downloadPoolForm,
  exportUsageFormPool,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import {
  EXPORT_LIMIT_BADGE,
  EXPORT_ROW_LIMIT,
  countFromLimitError,
  isExportLimitError,
} from '../domain/export-feedback';
import { Icon } from '../components/Icon';
import { WM_BURN_TEXT, WM_UNSUPPORTED_TEXT, isWatermarkSupportedFormat } from '../domain/watermark-note';
import { PageHeader } from '../components/PageHeader';
import { FormatBadge } from '../components/UsageFormFormatBadge';
import { orgPathLabel } from '../components/DraftingDeptPicker';
import {
  classifyFormat,
  detectAllowedFmt,
  formatSize,
  type FmtClass,
} from '../domain/usage-form-format';
import { useToast } from '../components/useToast';
import type { OrgUnitRecord, UsageFormPoolItem } from '../api/types';

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

/**
 * 列內浮水印註記（F020 `AC-N20`；`OQ-D9-08` 選項 B ＋ `OQ-D9-33`）。
 * 🔴 文案與前台詳情頁**同一組逐字常數**（`domain/watermark-note.ts`），不得分歧；
 *    版面權威＝`prototypes/19-usage-form-management.html`（列內小字，非前台之 `text-sm` 純文字）。
 */
function WmNote({ format }: { format: string }): JSX.Element {
  return isWatermarkSupportedFormat(format) ? (
    <div data-wm-note="" className="mt-0.5 text-[10px] text-primary-700 whitespace-nowrap">
      {WM_BURN_TEXT}
    </div>
  ) : (
    <div
      data-wm-note=""
      className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-700 whitespace-nowrap"
    >
      <Icon name="info" className="w-3 h-3" />
      {WM_UNSUPPORTED_TEXT}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('sv-SE');
}

interface ConfirmState {
  title: string;
  body: string;
  code?: string;
  okLabel: string;
  documents?: UsageFormPoolItem['documents'];
  onConfirm: () => void | Promise<void>;
}

export function UsageFormManagementPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.USAGE_FORM_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.USAGE_FORM_MANAGEMENT, 'write');

  const [items, setItems] = useState<UsageFormPoolItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [fmtFilter, setFmtFilter] = useState<'' | FmtClass>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /**
   * 制定部門欄之名稱解析來源（F018 `AC-N47`）。
   * 後端列富化只回 `draftingDeptCodes`（代碼），名稱沿用既有 `/org-units` 解析。
   * 載入失敗／未提供 → 空陣列 ⇒ 該格退回顯示代碼本身，不顯示 undefined、不阻斷清單。
   */
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);

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
      toast.error(e instanceof ApiError ? e.code : '載入表單池失敗');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  useEffect(() => {
    if (!canRead) return;
    void (async () => {
      try {
        const units = await getOrgUnits();
        setOrgUnits(Array.isArray(units) ? units : []);
      } catch {
        setOrgUnits([]);
      }
    })();
  }, [canRead]);

  const orgByCode = useMemo(() => {
    const m = new Map<string, OrgUnitRecord>();
    for (const u of orgUnits) m.set(u.orgCode, u);
    return m;
  }, [orgUnits]);

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

  /**
   * ── 下載 ──
   * 🔴 2026-08-17：由 SAS ＋ `window.open` 改為代理串流 ＋ `downloadViaBlob`
   * （Chrome Safe Browsing 對 `*.blob.core.windows.net` 出示「偵測到危險網站」攔截頁；
   * F020 `AC-D3a` 後台側修訂）。RAW 與不寫稽核之語意未動。
   */
  const onDownload = useCallback(
    async (form: UsageFormPoolItem) => {
      try {
        await downloadPoolForm(form.id, form.name);
        toast.success(`已下載表單「${form.name}」`);
      } catch (e) {
        toast.error(e instanceof ApiError ? `下載失敗：${e.code}` : '下載失敗');
      }
    },
    [toast],
  );

  /**
   * 🔵 `AC-X6`／`AC-X7`：匯出當前篩選之全部結果（非當前頁）。
   * 逐條比照 F039 附錄池匯出之既有實作（`AppendixManagementPage.onExport`），
   * **唯逐字文案不同**——本頁之量詞為「筆數」、限定詞為「篩選條件」，與該頁同型但各自成句。
   */
  const onExport = useCallback(async () => {
    try {
      await exportUsageFormPool({ q: keyword.trim() || undefined, format: fmtFilter || undefined });
      toast.success('已匯出表單清單（CSV，UTF-8 BOM）');
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
      toast.error('檔案格式不支援，僅允許 excel（.xlsx / .xls）與 pdf（FILE_FORMAT_NOT_ALLOWED）');
      setOverwriteTarget(null);
      return;
    }
    const doOverwrite = async (): Promise<void> => {
      await overwriteUsageForm(form.id, file, true);
      toast.success(
        form.docCount >= 2
          ? `已覆蓋，${form.docCount} 份引用文件所見同步更新`
          : `已覆蓋表單「${form.name}」`,
      );
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
      toast.success(
        form.docCount >= 1
          ? `表單已移除，並解除 ${form.docCount} 份文件關聯`
          : '表單已移除',
      );
      await load();
    };
    if (form.docCount >= 1) {
      toast.error(`此表單已被 ${form.docCount} 份文件使用，無法直接移除（USAGE_FORM_IN_USE）`);
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
      toast.error(e instanceof ApiError ? `操作失敗：${e.code}` : '操作失敗');
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
      <PageHeader breadcrumb={[{ label: '使用表單管理' }, { label: '表單池' }]} title="使用表單（表單池）管理">
        {/*
          🔵 `AC-X6`：topbar 動作區之「匯出」鈕（與 prototype 24 附錄管理逐條同型）。
          🔴 **非** write-only——匯出屬讀取類動作，SysAdmin（唯讀）亦允許。
        */}
        <button
          type="button"
          onClick={() => void onExport()}
          aria-label="匯出"
          title="匯出表單清單（CSV）"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Icon name="download" className="w-4 h-4" />
          匯出
        </button>
        {/*
          🔴 F018 `AC-N41`／`AC-N77`：新增改為**導向獨立整頁**（非開 modal）；可見文字與
          `aria-label` 皆逐字為「新增表單」。
          📝 被改寫之原逐字值保留供追溯：OLD> `上傳表單`（該動作已不只是上傳檔案，
             同時設定表單編號與制定部門）。
        */}
        {canWrite && (
          <button
            type="button"
            data-create-usage-form=""
            aria-label="新增表單"
            onClick={() => navigate('/admin/usage-forms/new')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="plus" className="w-4 h-4" />
            新增表單
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
                <th className="text-left font-medium px-4 py-2.5">表單編號</th>
                <th className="text-left font-medium px-4 py-2.5">表單名稱</th>
                {/* 🔵 F018 `AC-N47`（D9 delta）：新增欄置於「表單名稱」之後，表頭逐字為「制定部門」。 */}
                <th className="text-left font-medium px-4 py-2.5">制定部門</th>
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
                    draftingDeptNames={(f.draftingDeptCodes ?? []).map((c) =>
                      orgPathLabel(orgByCode, c),
                    )}
                    onToggle={() => toggleExpand(f.id)}
                    onDownload={() => void onDownload(f)}
                    onOverwrite={() => onOverwriteClick(f)}
                    onRemove={() => onRemoveClick(f)}
                    onEdit={() => navigate(`/admin/usage-forms/${f.id}/edit`)}
                    onJump={(documentId) => navigate(`/admin/documents/${documentId}`)}
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

      {/*
        📝 **被取代之兩個 modal 逐字保留於 git 歷史**（F018 `AC-N41`）：
        「上傳使用表單」modal → `UsageFormCreatePage`（/admin/usage-forms/new）；
        「編輯表單編號」modal（容器 id `editNumberModal`）→ `UsageFormEditPage`
        （/admin/usage-forms/:formId/edit）。`AC-N48` 明訂 `editNumberModal` **自此不存在**。
        ⚠ 本頁其餘 modal（覆蓋共用／移除保護之二次確認）**不受本 delta 影響**，維持原樣。
      */}

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
  draftingDeptNames,
  onToggle,
  onDownload,
  onOverwrite,
  onRemove,
  onEdit,
  onJump,
}: {
  form: UsageFormPoolItem;
  fmt: FmtClass;
  isOpen: boolean;
  n: number;
  canWrite: boolean;
  /** 已解析之制定部門名稱（F018 `AC-N47`；0 筆為合法，該格顯示逐字「—」）。 */
  draftingDeptNames: string[];
  onToggle: () => void;
  onDownload: () => void;
  onOverwrite: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onJump: (documentId: string) => void;
}): JSX.Element {
  return (
    <>
      <tr className="hover:bg-slate-50">
        {/*
          AC-D1／AC-D15 ①：表單編號首欄；null 顯示「—」＋ title（不得顯示 null 或空白）。
          ⚠ **無值分支之 `data-form-number`、逐字「—」與 `title` 必須落在同一個元素上**——
             `TS-D18-062` 以 `getByText('—', { selector: '[data-form-number]' })` 定位後直接斷言
             其 `title`（`AC-N47` 新增之制定部門欄同列亦有一個「—」，不限縮就會多重命中）。
             把掛鉤留在 `<td>`、文字包進內層 `<span>` 會使兩者分屬不同元素而永遠找不到；
             故此處把 `text-slate-300` 與 `title` 一併移到 `<td>`（視覺相同）。
             有值分支維持內層 `<span className="mono">`——`TS-D18-061` 斷言的正是該 span 之 class。
        */}
        {form.formNumber ? (
          <td className="px-4 py-3" data-form-number>
            <span className="mono text-xs text-slate-700">{form.formNumber}</span>
          </td>
        ) : (
          <td className="px-4 py-3 text-slate-300" data-form-number title="此表單未設定編號">
            —
          </td>
        )}
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            <Icon name={fmt === 'excel' ? 'file-spreadsheet' : 'file-text'} className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-medium text-slate-800">{form.name}</span>
              <WmNote format={form.format} />
            </div>
          </div>
        </td>
        {/*
          🔵 F018 `AC-N47`：制定部門欄。多筆以全形頓號「、」分隔；**0 筆顯示逐字「—」**
          （U+2014，比照 `AC-D15` ① 之既有慣例，不得顯示 null 或空白）。
          ⚠ `data-drafting-dept` 與該逐字文字**必須落在同一個元素上**——`AC-N47` 之斷言以
             `getByText('—', { selector: '[data-drafting-dept]' })` 定位，掛在外層而把文字包進
             內層 `<span>` 會使該掛鉤與文字分屬兩個元素而永遠找不到。
          🔴 `AC-N46`：本欄為**純 metadata**，不參與任何可見性／RBAC 判定。
        */}
        {draftingDeptNames.length > 0 ? (
          <td className="px-4 py-3 text-slate-600" data-drafting-dept>
            {draftingDeptNames.join('、')}
          </td>
        ) : (
          <td
            className="px-4 py-3 text-slate-300"
            data-drafting-dept
            title="此表單未指定制定部門"
          >
            —
          </td>
        )}
        <td className="px-4 py-3">
          <FormatBadge fmt={fmt} />
        </td>
        <td className="px-4 py-3 text-slate-500 mono text-xs">{formatSize(form.size)}</td>
        <td className="px-4 py-3">
          <div className="text-slate-700">
            {form.uploadedByName ?? form.uploadedBy}
            {form.uploadedByDept && (
              <span className="text-slate-400 text-xs ml-1">{form.uploadedByDept}</span>
            )}
          </div>
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
            {/*
              🔴 AC-D17：無寫入權角色之列內「編輯」動作必須**自 DOM 移除**，不得僅以 CSS 隱藏
              ——Testing Library 之 *ByLabelText 不尊重 display:none。本頁其餘寫入動作沿用
              既有 CSS 隱藏機制，此局部不一致為刻意，不得「順手統一」。
              🔴 `AC-N48` ①：可見文字與無障礙名稱自 2026-08-20 第三輪起逐字改為「編輯」
                 （lead 裁決，「逐字沿用」原則之明文例外——本入口導向之頁面已可改制定部門，
                 停在「編輯編號」名不副實）。
              📝 被改寫之原逐字值保留供追溯：OLD> `編輯編號`。
              🔒 屬性名 `data-edit-number` 與 icon 鍵 `hash` **逐字不變**（穩定之定位掛鉤）。
              🔴 `AC-N41`：點擊後**導向** /admin/usage-forms/:formId/edit，不再開啟 modal。
            */}
            {canWrite && (
              <button
                onClick={onEdit}
                data-edit-number={form.id}
                aria-label="編輯"
                title="編輯"
                className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-slate-200 hover:bg-primary-50 text-primary-600 text-[11px] shrink-0"
              >
                <Icon name="hash" className="w-3 h-3" />
                編輯
              </button>
            )}
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
          {/* `AC-N47`：表頭由 7 欄擴為 8 欄（新增「制定部門」），展開列之 colSpan 隨之。 */}
          <td colSpan={8} className="px-4 py-3">
            <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
              <Icon name="corner-down-right" className="w-3.5 h-3.5" />
              使用此表單的 ICSOP 文件（{n}）
            </div>
            <div className="flex flex-col gap-1">
              {form.documents.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onJump(d.id)}
                  className="group flex items-center gap-2 text-left rounded-md px-2.5 py-1.5 hover:bg-white border border-transparent hover:border-slate-200"
                >
                  <span className="mono text-xs text-slate-600">{d.documentNumber}</span>
                  <span className="text-sm text-slate-800">{d.documentName}</span>
                  <Icon name="external-link" className="w-3.5 h-3.5 text-slate-300 group-hover:text-primary-500 ml-auto" />
                </button>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
