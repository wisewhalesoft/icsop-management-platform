import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UsageFormManagementPage } from './UsageFormManagementPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, UsageFormPoolItem } from '../api/types';

/**
 * F018 使用表單（表單池）管理頁（prototype 19 移植）。接真實端點 /admin/usage-forms/*。
 * RBAC：ICSOPAdmin CRUD、SysAdmin 唯讀（無上傳/覆蓋/移除）、主管/部門窗口/一般使用者無（自我守門封鎖）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

/** 頁面改用全域 toast（SYS-1）＋ useNavigate（G-ADM-025）；渲染需包 ToastProvider + Router。 */
const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <UsageFormManagementPage />
      </MemoryRouter>
    </ToastProvider>,
  );

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

/**
 * 🔴 2026-08-16 fixture 補欄（F018 `AC-D1`／`AC-D2` 之漣漪）：`UsageFormPoolItem.formNumber`
 * 為**必填**欄（`api/types.ts:630-634`，型別 `string | null`），三筆舊 fixture 皆缺 ⇒ `tsc --noEmit`
 * 紅燈（F002 `AC-D7` 之機器驗證載體）。
 *   OLD> `id: 'uf1', name: '進件申請書.xlsx', format: 'xlsx', size: 49152,`
 *   OLD> `id: 'uf3', name: '徵信照會表.pdf', format: 'pdf', size: 122880,`
 *   OLD> `id: 'uf7', name: '本票確認檢核表.xlsx', format: 'xlsx', size: 36864,`
 *
 * ⚠ **刻意不三筆皆填 `null`**：全 `null` 之 fixture 會使本檔任一渲染案例只走得到「無編號」分支，
 * 「有編號」分支（`AC-D15` ① 之 mono 呈現）在本檔永不執行——與 Lane A 那三條 `uploadUsageForms`
 * 全為「留空」情境、使 `AC-D2` 主線失去載體是同一型缺陷。故 `uf1` 帶實際編號、另二筆為 `null`，
 * 本檔既有案例即同時走過兩條分支（縱使其主題不是編號欄）。
 * 📌 **編號欄之斷言不在本檔重複造**——`UsageFormManagementPage.formNumber.test.tsx` 已完整持有
 * `AC-D1`：表頭七欄逐字順序（`TS-D18-060`）、有值者之 `data-form-number`＋mono（`TS-D18-061`）、
 * `null` → 逐字「—」＋ title「此表單未設定編號」（`TS-D18-062`）；該檔 fixture 亦為
 * `FM-001` ∕ `null` 之異質組合。
 */
const POOL: UsageFormPoolItem[] = [
  {
    id: 'uf1', name: '進件申請書.xlsx', formNumber: 'FM-001', format: 'xlsx', size: 49152,
    uploadedBy: 'acct-uuid-1', uploadedByName: '李慧玲', uploadedByDept: '債權管理部 / 法催一室',
    uploadedAt: '2026-06-10T00:00:00Z', docCount: 2,
    documents: [
      { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' },
      { id: 'd2', documentNumber: 'ICSOP-SRC-101-1-06', documentName: '消費分期特約通路作業' },
    ],
  },
  {
    id: 'uf3', name: '徵信照會表.pdf', formNumber: null, format: 'pdf', size: 122880,
    uploadedBy: '陳彥廷', uploadedAt: '2026-05-22T00:00:00Z', docCount: 1,
    documents: [{ id: 'd3', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業' }],
  },
  {
    id: 'uf7', name: '本票確認檢核表.xlsx', formNumber: null, format: 'xlsx', size: 36864,
    uploadedBy: '張家豪', uploadedAt: '2026-04-18T00:00:00Z', docCount: 0, documents: [],
  },
];

const xlsxFile = (name = 'new.xlsx') =>
  new File(['zzz'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('UsageFormManagementPage — 使用表單管理（F018）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.uploadUsageForms).mockResolvedValue(undefined);
    vi.mocked(endpoints.overwriteUsageForm).mockResolvedValue(undefined);
    vi.mocked(endpoints.deleteUsageForm).mockResolvedValue(undefined);
    vi.mocked(endpoints.downloadPoolForm).mockResolvedValue(undefined);
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-F018-026 主管無權 → 顯示封鎖畫面、不呼叫查詢端點', () => {
    mockAuth('Supervisor');
    renderPage();
    expect(screen.getByText('無使用表單管理權限')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getUsageFormOverview).not.toHaveBeenCalled();
  });

  /**
   * 🔴 2026-08-20 D9 delta（缺失／變更 delta 第 7 項；`AC-N41`／`AC-N77`）—— 新增改為獨立整頁，
   * 入口鈕由「上傳表單」改名「新增表單」（`data-create-usage-form`），點擊後**導向新頁**、
   * 不再開啟 modal。清單頁本身之覆蓋／移除／下載三動作**不受影響**（見 `AC-N48` 之範圍界線：
   * 僅「新增」與「編輯編號」兩入口改版，其餘列內動作維持原樣）。
   * 📝 被取代之原斷言逐字保留供追溯：
   *   OLD> expect(screen.getByRole('button', { name: /上傳表單/ })).toBeInTheDocument();
   *   OLD> expect(screen.queryByRole('button', { name: /上傳表單/ })).toBeNull();
   * 📌 原「上傳表單」modal 之逐案行為斷言（名稱自動帶入檔名／自訂名稱／留空驗證／格式驗證）
   *   已遷移至 `UsageFormCreatePage.test.tsx`（新頁面之測試標的），本檔不重複持有。
   */
  it('TS-F018-024／AC-N77 ICSOPAdmin → 清單渲染 + 「新增表單」導頁鈕 + 覆蓋/移除按鈕', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument();
    const createBtn = document.querySelector('[data-create-usage-form]') as HTMLElement;
    expect(createBtn, '找不到 data-create-usage-form 動作元件').not.toBeNull();
    expect(createBtn.textContent).toBe('新增表單');
    expect(createBtn.getAttribute('aria-label')).toBe('新增表單');
    await userEvent.click(createBtn);
    expect(navigateMock).toHaveBeenCalledWith('/admin/usage-forms/new');
    // 每列可寫入操作（覆蓋/移除）— 至少各一（不受本 delta 影響）。
    expect(screen.getAllByRole('button', { name: '更新／覆蓋上傳' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '移除' }).length).toBeGreaterThan(0);
    expect(screen.getByText('共 3 個表單')).toBeInTheDocument();
    // 舊「上傳使用表單」modal 之入口不復存在。
    expect(screen.queryByRole('button', { name: /^上傳表單$/ })).toBeNull();
  });

  it('TS-F018-025 SysAdmin → 唯讀提示、無「新增表單」/覆蓋/移除', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
    // 🔒 `AC-N77`：無寫入權角色沿用既有 `.write-only` CSS 隱藏（非 DOM 移除）——
    //    jsdom 不做版面計算，改以「導頁不生效」驗證其不可用，而非 toBeNull（class-hidden 元素仍在 DOM）。
    expect(screen.queryByRole('button', { name: '更新／覆蓋上傳' })).toBeNull();
    expect(screen.queryByRole('button', { name: '移除' })).toBeNull();
    // 下載仍可用
    expect(screen.getAllByRole('button', { name: '下載' }).length).toBeGreaterThan(0);
  });

  /**
   * 🔴 2026-08-20 D9 delta（`OQ-D9-08`／`OQ-D9-33`）—— 後台各檔案列亦渲染浮水印註記文案。
   * 權威：`docs/specs/features/F020-watermark.md#backend-burn-delta` `AC-N20`。
   */
  it('AC-N20 pdf 格式列帶 data-wm-note，逐字為「檢視/下載將燒錄浮水印」', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument());
    const row = screen.getByText('徵信照會表.pdf').closest('tr') as HTMLElement;
    const note = row.querySelector('[data-wm-note]');
    expect(note, '找不到 data-wm-note').not.toBeNull();
    expect(note!.textContent).toBe('檢視/下載將燒錄浮水印');
  });

  it('AC-N20 非 pdf 格式列帶 data-wm-note，逐字為「此格式不支援浮水印」', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const row = screen.getByText('進件申請書.xlsx').closest('tr') as HTMLElement;
    const note = row.querySelector('[data-wm-note]');
    expect(note, '找不到 data-wm-note').not.toBeNull();
    expect(note!.textContent).toBe('此格式不支援浮水印');
  });

  it('搜尋表單名稱 → 過濾清單', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('搜尋表單名稱'), '徵信');
    expect(screen.queryByText('進件申請書.xlsx')).toBeNull();
    expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument();
    expect(screen.getByText('共 1 個表單')).toBeInTheDocument();
  });

  it('格式篩選 pdf → 僅顯示 pdf 表單', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('格式篩選'), 'pdf');
    expect(screen.queryByText('進件申請書.xlsx')).toBeNull();
    expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument();
  });

  it('TS-F018-010 展開關聯文件數 → 顯示使用此表單的文件', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    // uf1 之關聯 pill（2 份）
    await userEvent.click(screen.getByRole('button', { name: /2 份/ }));
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
    expect(screen.getByText('消費分期特約通路作業')).toBeInTheDocument();
  });

  /**
   * 🔴 2026-08-20 D9 delta（`AC-N41`）—— 以下 5 案之測試標的（「上傳使用表單」modal 內之名稱
   * 自動帶入／自訂名稱／留空驗證／格式驗證）已隨新增流程整頁化而**遷移至**
   * `UsageFormCreatePage.test.tsx`（新頁面 `/admin/usage-forms/new`），本檔不再持有——
   * 該 modal（`role="dialog"` name「上傳使用表單」）本身已被 `AC-N41` 要求之獨立整頁取代，
   * `container.querySelector('[role="dialog"]')` 於新頁**必須為 `null`**。
   * 原 5 案全文（含 `TS-PS-F018-FE-001`～`004`／`TS-F018-005`）逐字保留於 git 歷史，不重複貼於此。
   */

  it('TS-F018-017/018 覆蓋共用表單（docCount≥2）→ USAGE_FORM_OVERWRITE_SHARED 二次確認後覆蓋', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    // uf1（docCount 2）之覆蓋鈕（第一列）
    await userEvent.click(screen.getAllByRole('button', { name: '更新／覆蓋上傳' })[0]);
    const file = xlsxFile('進件申請書_v2.xlsx');
    await userEvent.upload(screen.getByLabelText('覆蓋檔案'), file);
    // 共用覆蓋警示 + 引用文件清單
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).getByText(/USAGE_FORM_OVERWRITE_SHARED/)).toBeInTheDocument();
    expect(within(dialog).getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '確認覆蓋' }));
    await waitFor(() => expect(endpoints.overwriteUsageForm).toHaveBeenCalledWith('uf1', file, true));
  });

  it('TS-F018-022 移除 in-use 表單（docCount≥1）→ USAGE_FORM_IN_USE 二次確認後刪除', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '移除' })[0]); // uf1
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).getByText(/USAGE_FORM_IN_USE/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '仍要移除並解除關聯' }));
    await waitFor(() => expect(endpoints.deleteUsageForm).toHaveBeenCalledWith('uf1', true));
  });

  it('TS-F018-021 移除無關聯表單（docCount=0）→ 一般確認、confirmed=false', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('本票確認檢核表.xlsx')).toBeInTheDocument());
    // uf7 為第三列（docCount 0）
    await userEvent.click(screen.getAllByRole('button', { name: '移除' })[2]);
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).queryByText(/USAGE_FORM_IN_USE/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: '確認移除' }));
    await waitFor(() => expect(endpoints.deleteUsageForm).toHaveBeenCalledWith('uf7', false));
  });

  /**
   * 🔴 2026-08-17：後台下載由「SAS URL ＋ `window.open`」改為「代理串流 ＋ `downloadViaBlob`」
   * （F020 `AC-D3a` 後台側修訂）——`window.open(sasUrl)` 導覽至 `*.blob.core.windows.net`，
   * Chrome Safe Browsing 對該網域出示「偵測到危險網站」紅底攔截頁。
   * 原斷言（供追溯）：OLD> `expect(window.open).toHaveBeenCalledWith('blob:zzz', '_blank', 'noopener,noreferrer');`
   * 🔒 `window.open` 之**反向**斷言留著：改回導覽即紅。
   */
  it('TS-F018-013 個別下載 → 以 downloadPoolForm(formId, 檔名) 代理串流，不開新分頁', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '下載' })[0]);
    await waitFor(() =>
      expect(endpoints.downloadPoolForm).toHaveBeenCalledWith('uf1', '進件申請書.xlsx'),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it('G-ADM-024 上傳者：顯示姓名 + 部門（不顯示原始 accountId）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const row = screen.getByText('進件申請書.xlsx').closest('tr')!;
    expect(within(row).getByText('李慧玲')).toBeInTheDocument();
    expect(within(row).getByText('債權管理部 / 法催一室')).toBeInTheDocument();
    // 不得洩漏原始 accountId
    expect(within(row).queryByText('acct-uuid-1')).toBeNull();
  });

  it('G-ADM-025 展開關聯文件 → 可點擊跳轉文件（external-link）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /2 份/ }));
    // 關聯列為可點擊 button（前往文件）
    const jump = screen.getByRole('button', { name: /車輛分期進件作業/ });
    expect(jump.querySelector('.lucide-external-link')).not.toBeNull();
    await userEvent.click(jump);
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d1');
  });
});
