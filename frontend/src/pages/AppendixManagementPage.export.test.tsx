import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppendixManagementPage } from './AppendixManagementPage';
import { ToastProvider } from '../components/useToast';
import { TopbarSlotsContext } from '../components/PageHeader';
import { ApiError } from '../api/client';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { AppendixPoolItem, SessionUser } from '../api/types';

/**
 * F039 `AC-D4`／`AC-D12` 附錄池匯出之 UI 契約 ＋ 🔒 `AC-D3` 後台 RAW 之前端回歸鎖定（Lane L5／L2）。
 *
 * 權威：
 *  - `prototypes/24-appendix-management.html:61-65`（topbar 動作區之「匯出」鈕；`aria-label="匯出"`、
 *    icon 鍵 `download`；📌「匯出為讀取類動作：SysAdmin 唯讀角色**允許**匯出，故本鈕**非** write-only」）
 *  - `prototypes/24-appendix-management.html:360-368`（成功／超限之逐字回饋與錯誤碼標記）
 *  - F039 `AC-D4`（匯出鈕存在與權限）／`AC-D12`（成功片段 `已匯出附錄清單（CSV，UTF-8 BOM）`；
 *    超限逐字 `符合條件之筆數為 {N} 筆，超過匯出上限 10000 筆，請縮小篩選條件` ＋ `EXPORT_ROW_LIMIT_EXCEEDED · 400`；
 *    ⚠「與 F037 `AC-D10`／F038 `AC-D6` 之句式差異為**刻意**」——本頁量詞為「筆數」、限定詞為「篩選條件」）
 *  - F039 `AC-D3`／F020 `AC-D4`／`AC-D7` ④（🔒 後台恆 RAW：不呼叫前台燒錄端點、**不得**渲染
 *    `data-wm-note` 與兩條浮水印文案）
 *  - architecture-spec §10.15 盲區 #16（🔴「凡 AC 措辭為『於 **topbar 動作區**存在某按鈕』者，
 *    元件測試若未包 `AppShell`／未提供 `TopbarSlotsContext`，命中的是 inline fallback 的 DOM，
 *    **topbar 之 portal 注入路徑從未被執行**」⇒ 本檔提供真實 slots 以驗到 AC 所述位置）
 *
 * ⚠ 對實作全盲：匯出鈕與 `exportAppendixPool()` 於本環撰寫時**尚不存在** —— 預期紅燈。
 *
 * 📌 端點 helper 名稱（`exportAppendixPool`）為本環所訂之契約（沿用 `getAppendixPoolOverview` 之慣例）；
 *    若實作採不同名稱請走 mailbox 申訴。逐字**文案**由 `AC-D12` 直接指定，不可協商。
 *
 * 🔒 本檔**不動**既有 `AppendixManagementPage.test.tsx`。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const SUCCESS = '已匯出附錄清單（CSV，UTF-8 BOM）';
const OVER_LIMIT = (n: number) => `符合條件之筆數為 ${n} 筆，超過匯出上限 10000 筆，請縮小篩選條件`;
const ERROR_BADGE = 'EXPORT_ROW_LIMIT_EXCEEDED · 400';
const BURN_TEXT = '檢視/下載將燒錄浮水印';
const UNSUPPORTED_TEXT = '此格式不支援浮水印';

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const POOL: AppendixPoolItem[] = [
  {
    id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', size: 57344,
    uploadedBy: 'acct-1', uploadedByName: '李慧玲', uploadedAt: '2026-06-10T00:00:00Z',
    docCount: 1, documents: [{ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }],
  },
  {
    id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf', size: 98304,
    uploadedBy: 'acct-2', uploadedByName: '陳彥廷', uploadedAt: '2026-05-22T00:00:00Z',
    docCount: 0, documents: [],
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
          <AppendixManagementPage />
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

describe('AppendixManagementPage 匯出鈕（F039 AC-D4；prototype 24）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getAppendixPoolOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.downloadAppendixFromPool).mockResolvedValue({ url: 'blob:x', expiresInSeconds: 300 });
    vi.mocked(endpoints.exportAppendixPool).mockResolvedValue(undefined);
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-testid^="topbar-"]').forEach((n) => n.remove());
  });

  it('🔴 AC-D4 匯出鈕位於 **topbar 動作區**（經 PageHeader portal 注入，非 inline fallback）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getAppendixPoolOverview).toHaveBeenCalled());
    const btn = within(actionsEl).getByRole('button', { name: '匯出' });
    expect(btn).toBeInTheDocument();
    expect(actionsEl.contains(btn)).toBe(true);
  });

  it('AC-D4 匯出鈕之 icon 鍵為 `download`（比照 17-access-history 既有匯出鈕之呈現慣例）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getAppendixPoolOverview).toHaveBeenCalled());
    const svg = within(actionsEl).getByRole('button', { name: '匯出' }).querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class') ?? '').toMatch(/download/i);
  });

  it('🔴 AC-D4 SysAdmin（唯讀角色）**允許**匯出 → 匯出鈕存在（匯出屬讀取類動作，非 write-only）', async () => {
    mockAuth('SysAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getAppendixPoolOverview).toHaveBeenCalled());
    expect(within(actionsEl).getByRole('button', { name: '匯出' })).toBeInTheDocument();
  });

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'AC-D4 %s 無「附錄管理」權限 → 頁面封鎖、無匯出鈕、不呼叫匯出端點',
    async (role) => {
      mockAuth(role);
      const { actionsEl } = renderWithTopbar();
      expect(within(actionsEl).queryByRole('button', { name: '匯出' })).toBeNull();
      expect(endpoints.exportAppendixPool).not.toHaveBeenCalled();
    },
  );

  it('AC-D5 匯出帶入與清單查詢**相同**之篩選條件（範圍＝當前篩選之全部結果）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getAppendixPoolOverview).toHaveBeenCalled());
    await userEvent.type(screen.getByPlaceholderText('搜尋附錄名稱…'), '名詞');
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    await waitFor(() => expect(endpoints.exportAppendixPool).toHaveBeenCalledTimes(1));
    const args = (vi.mocked(endpoints.exportAppendixPool).mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(JSON.stringify(args)).toContain('名詞');
  });
});

describe('AppendixManagementPage 匯出之使用者可見回饋（F039 AC-D12 逐字文案）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getAppendixPoolOverview).mockResolvedValue(POOL);
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-testid^="topbar-"]').forEach((n) => n.remove());
  });

  it('AC-D12 成功 → 回饋以逐字片段 `已匯出附錄清單（CSV，UTF-8 BOM）` 起始', async () => {
    vi.mocked(endpoints.exportAppendixPool).mockResolvedValue(undefined);
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getAppendixPoolOverview).toHaveBeenCalled());
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    expect(await screen.findByText(startsWith(SUCCESS))).toBeInTheDocument();
  });

  it('🔴 AC-D12 超限 → 錯誤回饋**逐字**為本頁專屬句式（「筆數」＋「篩選條件」），並附錯誤碼標記', async () => {
    vi.mocked(endpoints.exportAppendixPool).mockRejectedValue(
      new ApiError(400, 'EXPORT_ROW_LIMIT_EXCEEDED', '符合條件之筆數為 10001 筆，超過匯出上限 10000 筆'),
    );
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getAppendixPoolOverview).toHaveBeenCalled());
    await userEvent.click(within(actionsEl).getByRole('button', { name: '匯出' }));
    const msg = await screen.findByText(OVER_LIMIT(10_001));
    expect(msg).toBeInTheDocument();
    expect(screen.getByText(ERROR_BADGE)).toBeInTheDocument();
    // 🔒 不得與變更歷程兩 tab 之句式對齊（該處為「事件」＋「查詢條件」）
    expect(msg.textContent).not.toContain('符合條件之事件為');
    expect(msg.textContent).not.toContain('請縮小查詢條件');
  });
});

describe('🔒 F039 AC-D3／F020 AC-D4·AC-D7 ④ 後台附錄管理頁維持 RAW（OQ-FM-01；#15 明確不做）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getAppendixPoolOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.downloadAppendixFromPool).mockResolvedValue({ url: 'blob:x', expiresInSeconds: 300 });
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-testid^="topbar-"]').forEach((n) => n.remove());
  });

  it('🔒 後台個別下載仍走既有 RAW helper `downloadAppendixFromPool`，**不得**改呼叫前台燒錄端點', async () => {
    mockAuth('ICSOPAdmin');
    renderWithTopbar();
    await waitFor(() => expect(screen.getByText('名詞定義說明.pdf')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '下載' })[0]);
    await waitFor(() => expect(endpoints.downloadAppendixFromPool).toHaveBeenCalledTimes(1));
    /**
     * 🔴 2026-08-16 標的更正（**意圖不變、強化**）：原斷言指向 `downloadDocumentAppendix`，
     * 但該 helper 經查為**死碼**（無任何 production 呼叫端，已於同日移除）——對一個沒人呼叫的
     * 函式斷言 `not.toHaveBeenCalled()` **恆真**，等於沒有守到「後台不得走前台路徑」這個意圖。
     * 改指向**真正的前台 helper** `downloadDocumentAppendixFront`（前台附錄下載，代理串流＋燒錄）。
     *   OLD> `expect(endpoints.downloadDocumentAppendix).not.toHaveBeenCalled();`
     */
    expect(endpoints.downloadDocumentAppendixFront).not.toHaveBeenCalled();
  });

  it('🔒 F020 AC-D7 ④ 後台頁面**不得**渲染 `data-wm-note` 與兩條浮水印文案（後台恆 RAW，顯示即誤導）', async () => {
    mockAuth('ICSOPAdmin');
    renderWithTopbar();
    await waitFor(() => expect(screen.getByText('名詞定義說明.pdf')).toBeInTheDocument());
    expect(document.querySelectorAll('[data-wm-note]')).toHaveLength(0);
    expect(screen.queryByText(BURN_TEXT)).toBeNull();
    expect(screen.queryByText(UNSUPPORTED_TEXT)).toBeNull();
  });
});
