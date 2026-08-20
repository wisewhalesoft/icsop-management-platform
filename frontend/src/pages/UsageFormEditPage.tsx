import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getOrgUnits, getUsageFormOverview, updateUsageForm } from '../api/endpoints';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { classifyFormat, formatSize } from '../domain/usage-form-format';
import {
  errorCodeOf,
  formNumberErrorMessage,
  normalizeFormNumber,
  FORM_NUMBER_MAX_LENGTH,
  FORM_NUMBER_PLACEHOLDER,
} from '../domain/usage-form-number';
import {
  WM_BURN_TEXT,
  WM_UNSUPPORTED_TEXT,
  isWatermarkSupportedFormat,
} from '../domain/watermark-note';
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
import type { OrgUnitRecord, UsageFormPoolItem } from '../api/types';

/**
 * F018 編輯使用表單（獨立整頁，路由 `/admin/usage-forms/:formId/edit`）。
 *
 * 版面／結構／文案權威＝`prototypes/19b-usage-form-edit.html`；
 * 規格權威＝`F018-usage-form-management.md#usage-form-page-delta`
 * （`AC-N41`／`AC-N42`／`AC-N44`／`AC-N45`／`AC-N48`／`AC-N49`／`AC-N79`）。
 *
 * 📝 **被取代之實作逐字保留供追溯**：OLD> `UsageFormManagementPage.tsx` 之「編輯表單編號」modal
 * （容器 DOM id `editNumberModal`）。`AC-N48` 明訂該容器 id **自此不存在**；欄位層三個 id
 * （`enNumber`／`enNumberErr`／`enFormName`）**逐字保留、仍為有效契約**。
 *
 * 🔴 編輯範圍＝**表單編號 ＋ 制定部門兩項 metadata**（`AC-N48`）：
 *   · **檔案不可於本頁更換**（換檔仍走清單頁「更新／覆蓋上傳」與其 `USAGE_FORM_OVERWRITE_SHARED`）。
 *   · **表單名稱不可編輯**（`AC-D20` 明訂 `name` 不得被本路徑更動）。
 * 🔒 `AC-N49` 副作用邊界：本頁只送 metadata，`blobPath`／`format`／`size`／`name`／`uploadedBy`／
 *    `uploadedAt` 六欄不變、Blob 位元組未讀未寫、`DOC_USAGE_FORM` 關聯不變——**由 body 形狀本身保證**。
 *
 * ⚠ `AC-N79` ③：prototype 之記錄切換器（`[data-prototype-demo]`／`#demoForm`）為**原型專用**，
 *    本頁一律以路由參數 `:formId` 取得被編輯之表單，**不得移植該切換器**
 *    （否則任何使用者都能在編輯頁任意切換到別人的表單）。
 */

/** 本頁為 write-only（比照 19b 之 blockOverlay）：非 ICSOPAdmin 一律封鎖。 */
const BLOCK_MESSAGE: Record<string, string> = {
  SysAdmin: '系統管理員對「使用表單」欄位為唯讀，無法編輯表單資訊。',
  Supervisor: '主管對「使用表單管理」為「無」，無法存取表單池。',
  DeptContact: '部門窗口對「使用表單管理」為「無」。',
  User: '一般使用者無後台存取權。',
};

/** F020 `AC-N20`：後台亦渲染浮水印註記（與前台同一組逐字常數，不得分歧）。 */
function WmNote({ format }: { format: string }): JSX.Element {
  return isWatermarkSupportedFormat(format) ? (
    <span
      data-wm-note=""
      className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 whitespace-nowrap"
    >
      {WM_BURN_TEXT}
    </span>
  ) : (
    <span
      data-wm-note=""
      className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 whitespace-nowrap"
    >
      <Icon name="info" className="w-3 h-3" />
      {WM_UNSUPPORTED_TEXT}
    </span>
  );
}

function SectionHeading({
  badge,
  badgeTone,
  icon,
  title,
  children,
}: {
  badge: string;
  badgeTone?: string;
  icon: string;
  title: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <>
      {/* `AC-N78` ①：三個區塊各帶一枚序號徽章，可見文字由上而下逐字為 1／2／3。 */}
      <span
        data-section-badge=""
        className={`w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0 ${
          badgeTone ?? 'bg-primary-600'
        }`}
      >
        {badge}
      </span>
      <Icon name={icon} className="w-4 h-4 text-primary-600" />
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {children}
    </>
  );
}

export function UsageFormEditPage(): JSX.Element {
  const { formId } = useParams<{ formId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canWrite = canPerform(role, FunctionKey.USAGE_FORM_MANAGEMENT, 'write');

  const [form, setForm] = useState<UsageFormPoolItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [formNumber, setFormNumber] = useState('');
  const [numberErr, setNumberErr] = useState<string | null>(null);
  const [deptCodes, setDeptCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canWrite) return;
    void (async () => {
      try {
        // 資料來源沿用既有表單池總覽，以路由 `:formId` 篩出被編輯之單筆。
        const pool = await getUsageFormOverview();
        const found = (Array.isArray(pool) ? pool : []).find((f) => f.id === formId) ?? null;
        if (!found) {
          setLoadError('找不到此使用表單');
          return;
        }
        setForm(found);
        setFormNumber(found.formNumber ?? '');
        // `AC-N45`：原選取項完整回填且順序穩定（依 orgCode 昇冪）。
        setDeptCodes(normalizeDeptCodes(found.draftingDeptCodes));
      } catch (e) {
        setLoadError(errorCodeOf(e) ?? '載入表單失敗');
      }
    })();
  }, [canWrite, formId]);

  useEffect(() => {
    if (!canWrite) return;
    void (async () => {
      try {
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
  const deptOptions = useMemo<DraftingDeptOption[]>(
    () => orgUnits.map((u) => ({ value: u.orgCode, label: orgPathLabel(orgByCode, u.orgCode) })),
    [orgUnits, orgByCode],
  );

  const onCancel = (): void => {
    // `AC-N42` ④：導回清單頁，不呼叫更新端點（該列逐欄不變）。
    navigate('/admin/usage-forms');
  };

  const onSave = async (): Promise<void> => {
    if (!form) return;
    setNumberErr(null);
    setSaving(true);
    const next = normalizeFormNumber(formNumber);
    try {
      // 🔒 `AC-N49`：只送兩項 metadata；本頁不涉檔案覆蓋，故**不**出現二次確認 dialog。
      await updateUsageForm(form.id, { formNumber: next, draftingDeptCodes: deptCodes });
      // 逐字沿用之成功回饋（`AC-D16` 定稿表／`AC-N48`）。
      toast.success(next ? '已更新表單編號。' : '已清除表單編號。');
      navigate('/admin/usage-forms');
    } catch (e) {
      // `AC-N44`／`AC-D21` ④：錯誤時介面不關閉、該列不變，訊息就地顯示於 enNumberErr。
      const numberMessage = formNumberErrorMessage(e);
      if (numberMessage) setNumberErr(numberMessage);
      else toast.error(`更新失敗：${errorCodeOf(e) ?? '未知錯誤'}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無編輯使用表單權限</h1>
        <p className="text-sm text-slate-500 mt-1">{BLOCK_MESSAGE[role ?? ''] ?? ''}</p>
        <p className="text-xs mono text-slate-400 mt-2">
          {role === 'SysAdmin' ? 'FIELD_WRITE_FORBIDDEN · 403' : 'PERMISSION_DENIED · 403'}
        </p>
      </div>
    );
  }

  const fmt = form ? classifyFormat(form.format) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        breadcrumb={[{ label: '使用表單管理', to: '/admin/usage-forms' }, { label: '編輯使用表單' }]}
        title="編輯使用表單"
      >
        {/* `AC-N42` ②：動作鈕投遞至 admin shell topbar 右側。 */}
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || !form}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          <Icon name="save" className="w-4 h-4" />
          儲存
        </button>
      </PageHeader>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm border bg-red-50 border-red-200 text-red-700">
          <Icon name="alert-circle" className="w-4 h-4" />
          {loadError}
        </div>
      )}

      {form && (
        <>
          {/* ===== 區塊 1／3：表單檔案（唯讀；`AC-N48` 檔案不可於本頁更換）===== */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <SectionHeading badge="1" badgeTone="bg-slate-300" icon="paperclip" title="表單檔案">
                {/* `AC-N79` ①：檔案區之唯讀徽章，可見文字逐字為「唯讀」。 */}
                <span
                  data-file-readonly=""
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
                >
                  <Icon name="lock" className="w-3 h-3" />
                  唯讀
                </span>
              </SectionHeading>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Icon
                name={fmt === 'excel' ? 'file-spreadsheet' : 'file-text'}
                className="w-5 h-5 text-slate-400 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-400">表單名稱（不可編輯）</div>
                {/* `AC-D21` ②：`enFormName` 之文字**恰為該表單之 name**，無前綴後綴。 */}
                <div id="enFormName" className="text-sm text-slate-700 truncate">
                  {form.name}
                </div>
              </div>
              <span className="shrink-0">
                <FormatBadge fmt={fmt ?? 'pdf'} />
              </span>
              <span className="mono text-xs text-slate-500 shrink-0">{formatSize(form.size)}</span>
              <WmNote format={form.format} />
            </div>
            {/*
              🔴 `AC-N48` 之逐字說明句——本 delta **唯一改動之逐字文案**（因本頁範圍已含制定部門）。
              📝 被取代之原句逐字保留供追溯：OLD> 僅更新編號，不會變更表單檔案。
            */}
            <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
              <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              僅更新表單資訊，不會變更表單檔案。
            </p>
            {/* `AC-N79` ②：只鎖住而不指路，使用者會誤以為系統不支援換檔。 */}
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
              <Icon name="upload" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              <span>
                需要換檔請回
                <Link to="/admin/usage-forms" className="text-primary-600 hover:underline">
                  使用表單管理
                </Link>
                使用該列之「更新／覆蓋上傳」——該路徑才會做跨文件引用之二次確認（
                <span className="mono">USAGE_FORM_OVERWRITE_SHARED</span>
                ）。本頁儲存<strong className="text-slate-700">不會</strong>觸發該警示。
              </span>
            </p>
          </section>

          {/* ===== 區塊 2／3：基本資訊 ===== */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <SectionHeading badge="2" icon="hash" title="基本資訊" />
            </div>
            <div className="max-w-sm">
              <label htmlFor="enNumber" className="block text-sm font-medium text-slate-700 mb-1">
                表單編號 <span className="text-xs font-normal text-slate-400">（選填）</span>
              </label>
              <input
                id="enNumber"
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
                <p id="enNumberErr" className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0" />
                  <span>{numberErr}</span>
                </p>
              )}
              <p className="mt-1.5 text-xs text-slate-400">
                唯一性比對前 trim、不分大小寫，且<strong className="text-slate-500">排除自身列</strong>
                ；清空為合法操作（落地為 null，清單該格回復「—」）。
              </p>
            </div>
          </section>

          {/* ===== 區塊 3／3：制定部門 ===== */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <SectionHeading badge="3" icon="building-2" title="制定部門">
                <span className="text-xs text-slate-400">（選填，可多個）</span>
              </SectionHeading>
            </div>
            <p className="text-xs text-slate-500 mb-1 flex items-start gap-1.5">
              <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-600" />
              <span>
                可指定<strong className="text-slate-700">任意層級</strong>
                （本部／部／處室／課），各筆層級可不同。
                <strong className="text-slate-700">未勾選任何部門為合法</strong>（0 筆，非錯誤）。
                重新開啟本頁時原選取項完整回填，順序穩定（實作依 <span className="mono">orgCode</span>{' '}
                昇冪）。
              </span>
            </p>
            <p className="text-xs text-amber-700 mb-2 flex items-start gap-1.5">
              <Icon name="alert-triangle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                ⚠ 本欄為<strong>純顯示與清單篩選用之 metadata</strong>，
                <strong>不影響任何可見性或權限判定</strong>（AC-N46）
                ——與「文件使用部門」結構同構但用途完全不同，
                <strong>不得</strong>接進同一套子樹判定。
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
        </>
      )}
    </div>
  );
}
