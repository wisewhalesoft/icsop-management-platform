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
 * L7 · F018 表單編號 delta（`AC-D1`／`AC-D15`）＋「編輯編號」動作（`AC-D3` ①／`AC-D16`／`AC-D17`／
 * `AC-D19`／`AC-D21`）— 缺失 delta 第 18 項。
 *
 * 權威＝`docs/specs/features/F018-usage-form-management.md`（上列各 `AC-D#`）
 *      ＋ `prototypes/19-usage-form-management.html`（逐字文案與選擇器；designer 已零偏差實作）。
 *
 * 🔴 `AC-D17` 之前端呈現要求（designer 實測後裁定）：無寫入權角色之「編輯編號」元件
 *    **必須自 DOM 移除**，不得僅以 CSS 隱藏——Testing Library 之 `*ByLabelText`／`*ByText`
 *    **不尊重 `display:none`**。本頁其餘寫入動作（上傳／覆蓋／移除）沿用 `.write-only`
 *    CSS 隱藏，**此局部不一致為刻意，不得「順手統一」**（`OQ-D18-29` 定案前，任何統一
 *    為 `.write-only` 之重構都會使本檔紅燈，屬回歸而非整理）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

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
];

/**
 * 取清單中某表單所在之列。
 *
 * 🔴 **必須限縮於 `role="table"` 之內，不得用裸 `screen.getByText(name)`**（2026-08-16 修正，
 * implementer 申訴成立）：`AC-D1` 要求表單名稱出現在**清單列**，`AC-D21` ② 要求
 * 「編輯編號」介面內之 `#enFormName` 之文字**恰為該表單之 `name`**——兩條 AC 都滿足時，
 * 同一字串在 modal 開啟期間**必然**同時存在於兩處，裸查詢必拋
 * `Found multiple elements with the text: ...`。
 * `TS-D18-077` 的驗收點正是「錯誤發生時介面**不關閉**」，所以它必然落在該期間內
 * ——**不存在同時滿足兩條 AC 又能讓裸查詢綠燈的實作**，這是測試 helper 的缺陷而非產品缺陷。
 * ⚠ 修的是查詢範圍，**不是斷言強度**；不得改為 `getAllByText(...)[0]` 之類（會在
 * 列序改變時默默指到別列）。
 */
const rowOf = (name: string) =>
  within(screen.getByRole('table')).getByText(name).closest('tr') as HTMLElement;

/**
 * 🔴 2026-08-20 D9 delta（`AC-N41`／`AC-N48`）——「編輯編號」modal 已由獨立整頁取代，容器 id
 * `#editNumberModal` 自此不存在（`AC-N48` 明文記錄），入口動作之無障礙名稱同時由「編輯編號」
 * 改名「編輯」。點擊後**導頁**而非開 modal，本 helper 就地改為斷言導頁。
 * 📝 被取代之原 helper 逐字保留供追溯：
 *   OLD> async function openEditNumber(formName: string) {
 *   OLD>   const row = rowOf(formName);
 *   OLD>   await userEvent.click(within(row).getByLabelText('編輯編號'));
 *   OLD>   return document.querySelector('#editNumberModal') as HTMLElement;
 *   OLD> }
 * 原「編輯編號」modal 之逐案行為斷言（`TS-D18-066`～`077`：標題／說明句／欄位帶入現值／
 * 取消不呼叫端點／儲存往返／409/400 錯誤呈現）已遷移至 `UsageFormEditPage.test.tsx`
 * （新頁面 `/admin/usage-forms/:formId/edit` 之測試標的），本檔不再持有。
 */
async function clickEdit(formName: string): Promise<void> {
  const row = rowOf(formName);
  await userEvent.click(within(row).getByLabelText('編輯'));
}

describe('UsageFormManagementPage — F018 AC-D1 清單欄位', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * 🔴 2026-08-20 D9 delta（`AC-N47`）—— 「表單名稱」欄之後新增「制定部門」欄，表頭由 7 欄
   * 擴為 8 欄；其餘 7 欄之相對順序不變。
   * 📝 被取代之原斷言逐字保留供追溯：
   *   OLD> expect(headers).toEqual(['表單編號','表單名稱','格式','大小','上傳者 / 上傳時間','關聯文件數','操作']);
   */
  it('TS-D18-060／AC-N47 表頭由左至右逐字為 表單編號／表單名稱／制定部門／格式／大小／上傳者 / 上傳時間／關聯文件數／操作', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      '表單編號',
      '表單名稱',
      '制定部門',
      '格式',
      '大小',
      '上傳者 / 上傳時間',
      '關聯文件數',
      '操作',
    ]);
  });

  /**
   * `AC-N47`：0 筆制定部門顯示逐字 `—`（比照 `AC-D15` ① 之既有慣例），該儲存格帶
   * `data-drafting-dept` 屬性。既有 fixture（`POOL`）之兩筆皆未設 `draftingDeptCodes`。
   */
  it('AC-N47 制定部門欄：0 筆時顯示逐字「—」，儲存格帶 data-drafting-dept', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const cell = within(rowOf('進件申請書.xlsx')).getByText('—', {
      selector: '[data-drafting-dept]',
    });
    expect(cell).toBeInTheDocument();
  });

  it('TS-D18-061 AC-D15 ① 編號欄儲存格帶 data-form-number；有值者以 mono 呈現', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(container.querySelectorAll('[data-form-number]')).toHaveLength(2);
    const cell = within(rowOf('進件申請書.xlsx')).getByText('FM-001');
    expect(cell.className).toMatch(/\bmono\b/);
  });

  /**
   * 🔴 2026-08-20 D9 delta（`impl-fe2` 申訴，已核實成立）：`AC-N47` 新增「制定部門」欄，0 筆時
   * 亦顯示逐字「—」——`uf3` fixture 之 `formNumber` 為 `null` 且無 `draftingDeptCodes`，
   * 同一列因而**同時**存在兩個「—」（編號欄＋制定部門欄），無範圍限縮之 `getByText('—')`
   * 必拋 `Found multiple elements`。改為先以 `data-form-number` 定位編號欄容器，再於其內尋找
   * 「—」文字節點——`data-form-number` 掛在外層 `<td>`，文字與 `title` 則在內層 `<span>`
   * （與 `AC-N47` 案之 `data-drafting-dept`＋文字同掛一元素不同構，故不可直接沿用
   * `{ selector: '[data-form-number]' }` 之單層寫法，已實測確認）。
   * 📝 被取代之原斷言逐字保留供追溯：OLD> const dash = within(row).getByText('—');
   */
  it('TS-D18-062 AC-D1／AC-D15 ① formNumber 為 null → 逐字「—」＋ title「此表單未設定編號」，不得顯示 null 或空白', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument());
    const row = rowOf('徵信照會表.pdf');
    const numberCell = row.querySelector('[data-form-number]') as HTMLElement;
    expect(numberCell, '找不到 data-form-number 儲存格').not.toBeNull();
    const dash = within(numberCell).getByText('—');
    expect(dash).toHaveAttribute('title', '此表單未設定編號');
    expect(within(row).queryByText('null')).toBeNull();
  });
});

/**
 * 🔴 2026-08-20 D9 delta（`AC-N41`）—— 原「上傳 modal 之編號欄」（`TS-D18-082`／`TS-D18-063`）之
 * 測試標的已隨新增流程整頁化遷移至 `UsageFormCreatePage.test.tsx`（`#upNumber` 之等價欄位、
 * 填入編號後隨 `uploadUsageForms` 送出之鑑別力斷言，見該檔 `AC-N44` 相關案例）。
 * 原兩案全文逐字保留於 git 歷史，不重複貼於此。
 */

/**
 * 🔴 2026-08-20 D9 delta（`AC-N41`／`AC-N48`）—— 列內「編輯」動作（原「編輯編號」）之範圍限縮
 * 為**入口與 icon 契約**：本檔只驗證清單頁如何觸發、導向何處；欄位帶入現值／儲存往返／
 * 取消不呼叫端點／409／400 錯誤呈現等**介面內部行為**，已整批遷移至
 * `UsageFormEditPage.test.tsx`（新頁面之測試標的）。
 * 📝 被取代之三個 describe 區塊全文（`TS-D18-066`～`077`，含「編輯表單編號」modal 之標題／
 *   說明句／`#enNumber`／`#enFormName`／`#enNumberErr` 諸斷言）逐字保留於 git 歷史，不重複貼於此。
 */
describe('UsageFormManagementPage — F018 AC-D16／AC-D21 「編輯」入口（AC-N41／AC-N48 改名與導頁）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * 📝 被取代之原斷言逐字保留供追溯：
   *   OLD> expect(screen.getAllByLabelText('編輯編號')).toHaveLength(2);
   *   OLD> expect(within(rowOf('進件申請書.xlsx')).getByLabelText('編輯編號')).toBeInTheDocument();
   */
  it('TS-D18-064／AC-N48① 每列「操作」欄存在無障礙名稱逐字「編輯」之動作，帶 data-edit-number', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getAllByLabelText('編輯')).toHaveLength(2);
    expect(container.querySelectorAll('[data-edit-number]')).toHaveLength(2);
    expect(within(rowOf('進件申請書.xlsx')).getByLabelText('編輯')).toBeInTheDocument();
  });

  it('TS-D18-065 AC-D21 ① 列內動作之 icon 鍵為 hash（非 pencil／edit）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const action = within(rowOf('進件申請書.xlsx')).getByLabelText('編輯');
    expect(action.querySelector('.lucide-hash'), 'icon 鍵應為 hash').not.toBeNull();
    expect(action.querySelector('.lucide-pencil')).toBeNull();
  });

  it('AC-N41／AC-N48 點擊「編輯」→ 導向 /admin/usage-forms/:formId/edit（非開啟 modal）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await clickEdit('進件申請書.xlsx');
    expect(navigateMock).toHaveBeenCalledWith('/admin/usage-forms/uf1/edit');
    expect(document.querySelector('#editNumberModal')).toBeNull();
  });
});

describe('UsageFormManagementPage — F018 AC-D17 🔴 無寫入權角色之「編輯」自 DOM 移除', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * 📝 被取代之原斷言逐字保留供追溯（`AC-N48` 改名，行為與掛鉤不變）：
   *   OLD> expect(screen.queryByLabelText('編輯編號')).toBeNull();
   */
  it('TS-D18-078／AC-N48 SysAdmin（唯讀）→ queryByLabelText("編輯") 與 [data-edit-number] 皆為 null', async () => {
    mockAuth('SysAdmin');
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.queryByLabelText('編輯')).toBeNull();
    expect(container.querySelector('[data-edit-number]')).toBeNull();
  });

  it('TS-D18-079／AC-N48 ICSOPAdmin → 兩者皆非 null（切角色須即時重繪）', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getAllByLabelText('編輯').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-edit-number]')).not.toBeNull();
  });

  it('TS-D18-080 🔒 對照組：其餘寫入動作（覆蓋／移除）沿用 .write-only CSS 隱藏之既有機制，不得一併改為 DOM 移除', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: '更新／覆蓋上傳' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '移除' }).length).toBeGreaterThan(0);
  });
});

/**
 * 🔴 2026-08-20 D9 delta（`OQ-D9-08`，全面推翻 `OQ-FM-01`）—— 後台個別下載端點自本輪起
 * **一律燒錄浮水印並寫稽核**（`AC-N14`／`AC-N17`），描述由「維持既有 RAW 路徑」就地改寫。
 * 📝 被推翻之原 describe 標題與註解逐字保留供追溯：
 *   OLD> describe('UsageFormManagementPage — F018 AC-D13 🔒 後台個別下載維持既有 RAW 路徑', ...)
 *   OLD> // OQ-FM-01 維持有效：後台一律 RAW、不燒錄、不寫稽核（缺失 delta #12/#13/#15 明確不做）。
 * ⚠ **本案唯一存活之斷言（downloadPoolForm 之呼叫參數、不開新分頁）不受本次改寫影響**——
 *   燒錄與寫稽核自本輪起發生於**同一個既有端點之伺服器端**，前端呼叫之函式與參數形狀不變；
 *   「未呼叫額外之 front/burn/watermark 具名函式」之守衛依然成立且仍有意義（防止前端誤走
 *   前台專用端點，而非宣稱後端不燒錄）。
 */
describe('UsageFormManagementPage — F018 後台個別下載（AC-N14／AC-N17：一律燒錄並寫稽核，端點與呼叫參數不變）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.downloadPoolForm).mockResolvedValue(undefined);
    vi.spyOn(window, 'open').mockReturnValue(null);
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-D18-081 下載仍呼叫既有後台 helper downloadPoolForm（燒錄與寫稽核發生於同端點之伺服器端），未改呼叫其他具名端點', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(within(rowOf('進件申請書.xlsx')).getByRole('button', { name: '下載' }));
    // 🔴 2026-08-17：第二引數為 fallback 檔名（代理串流之 Content-Disposition 缺漏時才採用）。
    await waitFor(() =>
      expect(endpoints.downloadPoolForm).toHaveBeenCalledWith('uf1', expect.any(String)),
    );
    expect(window.open).not.toHaveBeenCalled(); // 不再導覽至第三方 Blob 網域
    const called = Object.entries(endpoints)
      .filter(([, v]) => typeof v === 'function' && vi.isMockFunction(v) && v.mock.calls.length > 0)
      .map(([k]) => k);
    expect(called.filter((k) => /front|burn|watermark/i.test(k))).toEqual([]);
  });
});
