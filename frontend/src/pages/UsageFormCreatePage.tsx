import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getOrgUnits, uploadUsageForms } from '../api/endpoints';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import {
  detectAllowedFmt,
  FILE_FORMAT_NOT_ALLOWED_MESSAGE,
  FILE_REQUIRED_MESSAGE,
} from '../domain/usage-form-format';
import {
  errorCodeOf,
  formNumberErrorMessage,
  FORM_NUMBER_MAX_LENGTH,
  FORM_NUMBER_PLACEHOLDER,
} from '../domain/usage-form-number';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { FormatBadge } from '../components/UsageFormFormatBadge';
import {
  DraftingDeptPicker,
  normalizeDeptCodes,
  orgPathLabel,
  type DraftingDeptOption,
} from '../components/DraftingDeptPicker';
import { useToast } from '../components/useToast';
import type { OrgUnitRecord } from '../api/types';

/**
 * F018 新增使用表單（獨立整頁，路由 `/admin/usage-forms/new`）。
 *
 * 版面／結構／文案權威＝`prototypes/19a-usage-form-create.html`；
 * 規格權威＝`docs/specs/features/F018-usage-form-management.md#usage-form-page-delta`
 * （`AC-N41`～`AC-N45`／`AC-N77`／`AC-N78`）＋ `architecture-spec.md` §11.10（決策 B10）。
 *
 * 📝 **被取代之實作逐字保留供追溯**：OLD> `UsageFormManagementPage.tsx` 之「上傳使用表單」modal
 * （`uploadOpen` 狀態與其 `role="dialog"` 容器）。`AC-N41` 明訂改為獨立整頁 ⇒ **本頁刻意不含任何
 * modal**（移除／覆蓋等需二次確認之動作仍留在清單頁）。
 *
 * 🔒 `AC-N43`（純版面搬遷）：仍為**單一動作一次送出**——按「儲存」時檔案、名稱、編號與制定部門
 * 一併建立，不先建立無檔案之空殼記錄；後端 multipart 建立端點之語意、欄位名與錯誤碼逐字不變，
 * `draftingDeptCodes` 為 additive 欄位。
 *
 * 🔴 `AC-N46`：制定部門為**純 metadata**，不參與任何可見性／RBAC 判定——本頁只把選取集合原樣送出。
 */

/** 本頁為 write-only（比照 14-document-create）：非 ICSOPAdmin 一律封鎖。 */
const BLOCK_MESSAGE: Record<string, string> = {
  SysAdmin: '系統管理員對「使用表單管理」為唯讀，無法新增表單。',
  Supervisor: '主管對「使用表單管理」為「無」，無法存取表單池。',
  DeptContact: '部門窗口對「使用表單管理」為「無」。',
  User: '一般使用者無後台存取權。',
};

function SectionHeading({
  badge,
  icon,
  title,
  hint,
}: {
  badge: string;
  icon: string;
  title: string;
  hint?: string;
}): JSX.Element {
  return (
    <>
      {/* `AC-N78` ①：三個區塊各帶一枚序號徽章，可見文字由上而下逐字為 1／2／3。 */}
      <span
        data-section-badge=""
        className="w-5 h-5 rounded-full bg-primary-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0"
      >
        {badge}
      </span>
      <Icon name={icon} className="w-4 h-4 text-primary-600" />
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </>
  );
}

export function UsageFormCreatePage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canWrite = canPerform(role, FunctionKey.USAGE_FORM_MANAGEMENT, 'write');

  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState(false);
  const [formNumber, setFormNumber] = useState('');
  const [numberErr, setNumberErr] = useState<string | null>(null);
  const [deptCodes, setDeptCodes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!canWrite) return;
    void (async () => {
      try {
        // 組織清單載入失敗／尚未提供 → 空陣列（chip 退回顯示 orgCode，本頁其餘功能不受影響）。
        const units = await getOrgUnits();
        setOrgUnits(Array.isArray(units) ? units : []);
      } catch {
        setOrgUnits([]);
      }
    })();
  }, [canWrite]);

  const orgByCode = useMemo(() => {
    const m = new Map<string, OrgUnitRecord>();
    for (const u of orgUnits) m.set(u.orgCode, u);
    return m;
  }, [orgUnits]);
  const labelOf = useCallback((code: string) => orgPathLabel(orgByCode, code), [orgByCode]);
  /** 候選＝全部組織單位（任意層級，`AC-N45`），以「本部 / 部 / 處室 / 課」路徑呈現層級。 */
  const deptOptions = useMemo<DraftingDeptOption[]>(
    () => orgUnits.map((u) => ({ value: u.orgCode, label: orgPathLabel(orgByCode, u.orgCode) })),
    [orgUnits, orgByCode],
  );

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (!detectAllowedFmt(picked.name)) {
      setFile(null);
      setFileErr(FILE_FORMAT_NOT_ALLOWED_MESSAGE);
      return;
    }
    setFileErr(null);
    setFile(picked);
    // 名稱自動帶入檔名；**已手動輸入者不覆蓋**（prototype 19a `applyPick()` 同語意）。
    if (!name.trim()) setName(picked.name);
  };

  const onCancel = (): void => {
    // `AC-N42` ④：導回清單頁，且不送出任何寫入請求。
    navigate('/admin/usage-forms');
  };

  const onSubmit = async (): Promise<void> => {
    setNumberErr(null);
    if (!file) {
      setFileErr(FILE_REQUIRED_MESSAGE);
      return;
    }
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    setSubmitting(true);
    try {
      // 🔒 `AC-N43`：單一動作一次送出（檔案＋名稱＋編號＋制定部門）。
      await uploadUsageForms([file], name.trim(), formNumber, deptCodes);
      toast.success(`已建立表單「${name.trim()}」（初始關聯 0 份）`);
      navigate('/admin/usage-forms');
    } catch (e) {
      // `AC-N44`：編號相關錯誤就地顯示於編號欄；**未建立任何記錄、未上傳檔案**，本頁不關閉。
      const numberMessage = formNumberErrorMessage(e);
      if (numberMessage) setNumberErr(numberMessage);
      else toast.error(`上傳失敗：${errorCodeOf(e) ?? '未知錯誤'}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無新增使用表單權限</h1>
        <p className="text-sm text-slate-500 mt-1">{BLOCK_MESSAGE[role ?? ''] ?? ''}</p>
        <p className="text-xs mono text-slate-400 mt-2">
          {role === 'SysAdmin' ? 'FIELD_WRITE_FORBIDDEN · 403' : 'PERMISSION_DENIED · 403'}
        </p>
      </div>
    );
  }

  const pickedFmt = file ? detectAllowedFmt(file.name) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        breadcrumb={[{ label: '使用表單管理', to: '/admin/usage-forms' }, { label: '新增使用表單' }]}
        title="新增使用表單"
      >
        {/* `AC-N42` ②：主要／次要動作鈕投遞至 admin shell topbar 右側（不得留在內容區底部）。 */}
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          <Icon name="save" className="w-4 h-4" />
          儲存
        </button>
      </PageHeader>

      {/* 單一動作一次送出之明示（`AC-N43` 回歸鎖定；純版面搬遷、後端契約不變）。 */}
      <div className="flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50/50 px-3 py-2.5 text-xs text-slate-600">
        <Icon name="info" className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" />
        <span>
          本頁為<strong className="text-slate-800">純版面搬遷</strong>（彈窗 → 獨立整頁）：仍是
          <strong className="text-slate-800">單一動作一次送出</strong>
          ——按「儲存」時檔案、名稱、編號與制定部門一併建立，
          <strong className="text-slate-800">不會</strong>
          先建立一筆無檔案的空殼記錄。後端建立端點之語意、欄位名與錯誤碼逐字不變。
        </span>
      </div>

      {/* ===== 區塊 1／3：表單檔案 ===== */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <SectionHeading badge="1" icon="upload-cloud" title="表單檔案" />
        </div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          選擇檔案 <span className="text-red-500">*</span>
        </label>
        <label className="w-full border border-dashed border-slate-300 rounded-lg px-4 py-6 flex flex-col items-center gap-1 text-slate-500 hover:border-primary-400 hover:bg-primary-50/40 cursor-pointer">
          <Icon name="upload-cloud" className="w-7 h-7 text-slate-400" />
          <span className="text-sm">點此選擇檔案</span>
          <span className="text-xs text-slate-400">支援格式：excel（.xlsx / .xls）、pdf</span>
          <input
            type="file"
            accept=".xlsx,.xls,.pdf"
            aria-label="選擇檔案"
            className="sr-only"
            onChange={onPickFile}
          />
        </label>
        {file && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <Icon
              name={pickedFmt === 'excel' ? 'file-spreadsheet' : 'file-text'}
              className="w-4 h-4 text-slate-500"
            />
            <span className="text-slate-700 truncate">{file.name}</span>
            <span className="ml-auto">
              <FormatBadge fmt={pickedFmt ?? 'pdf'} />
            </span>
          </div>
        )}
        {fileErr && (
          <p className="mt-2 text-xs text-red-600 flex items-start gap-1">
            <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{fileErr}</span>
          </p>
        )}
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mt-3">
          <Icon name="hard-drive" className="w-3.5 h-3.5 text-slate-400" />
          檔案大小上限 <span className="font-medium text-slate-600">50&nbsp;MB</span>
        </div>
      </section>

      {/* ===== 區塊 2／3：基本資訊 ===== */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <SectionHeading badge="2" icon="file-text" title="基本資訊" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="upNumber" className="block text-sm font-medium text-slate-700 mb-1">
              表單編號 <span className="text-xs font-normal text-slate-400">（選填）</span>
            </label>
            <input
              id="upNumber"
              type="text"
              maxLength={FORM_NUMBER_MAX_LENGTH}
              value={formNumber}
              onChange={(e) => {
                setFormNumber(e.target.value);
                setNumberErr(null);
              }}
              placeholder={FORM_NUMBER_PLACEHOLDER}
              className={`w-full px-3 py-2 rounded-md border text-sm mono focus:outline-none focus:ring-2 focus:ring-primary-600 ${
                numberErr ? 'border-red-500' : 'border-slate-300'
              }`}
            />
            {numberErr && (
              <p id="upNumberErr" className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0" />
                <span>{numberErr}</span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="upName" className="block text-sm font-medium text-slate-700 mb-1">
              表單名稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="upName"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameErr(false);
              }}
              placeholder="請輸入表單名稱（可沿用檔名）"
              className={`w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 ${
                nameErr ? 'border-red-500' : 'border-slate-300'
              }`}
            />
            {nameErr && (
              <p id="upNameErr" className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0" />
                表單名稱不可為空。
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ===== 區塊 3／3：制定部門 ===== */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <SectionHeading badge="3" icon="building-2" title="制定部門" hint="（選填，可多個）" />
        </div>
        <p className="text-xs text-slate-500 mb-1 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-600" />
          <span>
            可指定<strong className="text-slate-700">任意層級</strong>
            （本部／部／處室／課），各筆層級可不同；清單以「本部 / 部 / 處室 / 課」路徑呈現層級關係。
            <strong className="text-slate-700">未勾選任何部門為合法</strong>（0 筆，非錯誤）。
          </span>
        </p>
        <p className="text-xs text-amber-700 mb-2 flex items-start gap-1.5">
          <Icon name="alert-triangle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            ⚠ 本欄為<strong>純顯示與清單篩選用之 metadata</strong>，
            <strong>不影響任何可見性或權限判定</strong>
            ——與「文件使用部門」（DOC_USING_DEPT，會展開子樹判權限）結構同構但用途完全不同，
            <strong>不得</strong>接進同一套子樹判定（AC-N46）。
          </span>
        </p>
        <DraftingDeptPicker
          options={deptOptions}
          values={deptCodes}
          labelOf={labelOf}
          onAdd={(code) => setDeptCodes((prev) => normalizeDeptCodes([...prev, code]))}
          onRemove={(code) => setDeptCodes((prev) => prev.filter((c) => c !== code))}
        />
      </section>
    </div>
  );
}
