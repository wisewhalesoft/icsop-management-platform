import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UsageFormManagementPage } from './UsageFormManagementPage';
import { ToastProvider } from '../components/useToast';
import { TopbarSlotsContext } from '../components/PageHeader';
import { ApiError } from '../api/client';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, UsageFormPoolItem } from '../api/types';

/**
 * 🔵 F018 表單池匯出之 UI 契約（2026-08-27 使用者裁決 `AC-X6`／`AC-X7`／`AC-X10`）。
 *
 * 權威與同型依據：
 *  - `AC-X6`（topbar 動作區之「匯出」鈕；`aria-label="匯出"`、icon 鍵 `download`；
 *    📌 **匯出為讀取類動作**：SysAdmin 唯讀角色**允許**匯出，故本鈕**非** write-only）
 *  - `AC-X7`（匯出帶入與清單查詢**相同**之篩選 ⇒ 範圍＝當前篩選之全部結果，非當前頁）
 *  - `AC-X10`（成功片段 `已匯出表單清單（CSV，UTF-8 BOM）`；超限逐字
 *    `符合條件之筆數為 {N} 筆，超過匯出上限 10000 筆，請縮小篩選條件` ＋ `EXPORT_ROW_LIMIT_EXCEEDED · 400`；
 *    ⚠ 與 F037／F038 之句式差異為**刻意**——本頁量詞為「筆數」、限定詞為「篩選條件」，
 *    與 F039 附錄匯出同型）
 *  - architecture-spec §10.15 盲區 #16（🔴「凡 AC 措辭為『於 **topbar 動作區**存在某按鈕』者，
 *    元件測試若未包 `AppShell`／未提供 `TopbarSlotsContext`，命中的是 inline fallback 的 DOM，
 *    **topbar 之 portal 注入路徑從未被執行**」⇒ 本檔提供真實 slots 以驗到 AC 所述位置）
 *
 * 🔒 本檔**不動**既有 `UsageFormManagementPage.test.tsx` 與 `.formNumber.test.tsx`。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const SUCCESS = '已匯出表單清單（CSV，UTF-8 BOM）';
const OVER_LIMIT = (n: number) => `符合條件之筆數為 ${n} 筆，超過匯出上限 10000 筆，請縮小篩選條件`;
const ERROR_BADGE = 'EXPORT_ROW_LIMIT_EXCEEDED · 400';

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const POOL: UsageFormPoolItem[] = [
  {
    id: 'uf1',
    name: '進件申請書',
    formNumber: 'FM-001',
    format: 'xlsx',
    size: 49152,
    uploadedBy: 'acct-uuid-1',
    uploadedByName: '李慧玲',
    uploadedAt: '2026-06-10T00:00:00Z',
    docCount: 1,
    documents: [
      { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' },
    ],
  },
  {
    id: 'uf3',
    name: '徵信照會表',
    formNumber: null,
    format: 'pdf',
    size: 122880,
    uploadedBy: '陳彥廷',
    uploadedAt: '2026-05-22T00:00:00Z',
    docCount: 0,
    documents: [],
  },
];

/** §10.15 #16：提供真實 topbar slots，使 `PageHeader` 走 **portal** 而非 inline fallback。 */
function renderWithTopbar(): { actionsEl: HTMLElement } {
  const titleEl = document.createElement('div');
  const actionsEl = document.createElement('div');
  titleEl.setAttribute('data-testid', 'topbar-title-slot');
  actionsEl.setAttribute('data-testid', 'topbar-actions-slot');
  document.body.append(titleEl, actionsEl);
  render(
    <ToastProvider>
      <MemoryRouter>
        <TopbarSlotsContext.Provider value={{ titleEl, actionsEl }}>
          <UsageFormManagementPage />
        </TopbarSlotsContext.Provider>
      </MemoryRouter>
    </ToastProvider>,
  );
  return { actionsEl };
}

/** 以「元素之可見文字**起始於**片段」定位回饋（AC 只約束起始片段）。 */
const startsWith = (fragment: string) => (_c: string, el: Element | null): boolean => {
  if (!el) return false;
  if (!(el.textContent ?? '').trim().startsWith(fragment)) return false;
  return !Array.from(el.children).some((c) => (c.textContent ?? '').trim().startsWith(fragment));
};

describe('UsageFormManagementPage 匯出鈕（AC-X6）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
    vi.mocked(endpoints.exportUsageFormPool).mockResolvedValue(undefined);
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-testid^="topbar-"]').forEach((n) => n.remove());
  });

  it('🔴 AC-X6 匯出鈕位於 **topbar 動作區**（經 PageHeader portal 注入，非 inline fallback）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    const btn = within(actionsEl).getByRole('button', { name: '匯出' });
    expect(btn).toBeInTheDocument();
    expect(actionsEl.contains(btn)).toBe(true);
  });

  it('AC-X6 匯出鈕之 icon 鍵為 `download`（比照 24-appendix-management 之匯出鈕）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    const svg = within(actionsEl).getByRole('button', { name: '匯出' }).querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class') ?? '').toMatch(/download/i);
  });

  it('🔴 AC-X6 SysAdmin（唯讀角色）**允許**匯出 → 匯出鈕存在（匯出屬讀取類動作，非 write-only）', async () => {
    mockAuth('SysAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    expect(within(actionsEl).getByRole('button', { name: '匯出' })).toBeInTheDocument();
    // 🔒 同時確認唯讀角色仍看不到寫入類動作（本 delta 不得順手放寬既有 RBAC）。
    expect(within(actionsEl).queryByRole('button', { name: '新增表單' })).toBeNull();
  });

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'AC-X6 %s 無「使用表單管理」權限 → 頁面封鎖、無匯出鈕、不呼叫匯出端點',
    async (role) => {
      mockAuth(role);
      const { actionsEl } = renderWithTopbar();
      expect(within(actionsEl).queryByRole('button', { name: '匯出' })).toBeNull();
      expect(endpoints.exportUsageFormPool).not.toHaveBeenCalled();
    },
  );

  it('AC-X7 匯出帶入與清單查詢**相同**之關鍵字（範圍＝當前篩選之全部結果）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText('搜尋表單名稱'), '徵信');
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    await waitFor(() => expect(endpoints.exportUsageFormPool).toHaveBeenCalledTimes(1));
    expect(vi.mocked(endpoints.exportUsageFormPool).mock.calls[0]?.[0]).toMatchObject({ q: '徵信' });
  });

  it('AC-X7 匯出帶入與清單查詢**相同**之格式篩選', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    await userEvent.selectOptions(screen.getByLabelText('格式篩選'), 'pdf');
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    await waitFor(() => expect(endpoints.exportUsageFormPool).toHaveBeenCalledTimes(1));
    expect(vi.mocked(endpoints.exportUsageFormPool).mock.calls[0]?.[0]).toMatchObject({
      format: 'pdf',
    });
  });

  it('無篩選 → 兩鍵皆不帶（`undefined`），不得送出空字串當成篩選值', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    await waitFor(() => expect(endpoints.exportUsageFormPool).toHaveBeenCalledTimes(1));
    expect(vi.mocked(endpoints.exportUsageFormPool).mock.calls[0]?.[0]).toEqual({
      q: undefined,
      format: undefined,
    });
  });
});

describe('UsageFormManagementPage 匯出之使用者可見回饋（AC-X10 逐字文案）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-testid^="topbar-"]').forEach((n) => n.remove());
  });

  it('AC-X10 成功 → 回饋以逐字片段 `已匯出表單清單（CSV，UTF-8 BOM）` 起始', async () => {
    vi.mocked(endpoints.exportUsageFormPool).mockResolvedValue(undefined);
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    expect(await screen.findByText(startsWith(SUCCESS))).toBeInTheDocument();
  });

  it('🔴 AC-X10 超限 → 錯誤回饋**逐字**為本頁句式（「筆數」＋「篩選條件」），並附錯誤碼標記', async () => {
    vi.mocked(endpoints.exportUsageFormPool).mockRejectedValue(
      new ApiError(
        400,
        'EXPORT_ROW_LIMIT_EXCEEDED',
        '符合條件之筆數為 10001 筆，超過匯出上限 10000 筆',
      ),
    );
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    const msg = await screen.findByText(OVER_LIMIT(10_001));
    expect(msg).toBeInTheDocument();
    expect(screen.getByText(ERROR_BADGE)).toBeInTheDocument();
    // 🔒 不得與變更歷程兩 tab 之句式對齊（該處為「事件」＋「查詢條件」）
    expect(msg.textContent).not.toContain('符合條件之事件為');
    expect(msg.textContent).not.toContain('請縮小查詢條件');
  });

  it('其他錯誤 → 以 `匯出失敗：{code}` 呈現（不吞錯、不顯示成功）', async () => {
    vi.mocked(endpoints.exportUsageFormPool).mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR'),
    );
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getUsageFormOverview).toHaveBeenCalled());
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    expect(await screen.findByText('匯出失敗：INTERNAL_ERROR')).toBeInTheDocument();
    expect(screen.queryByText(startsWith(SUCCESS))).toBeNull();
  });
});
