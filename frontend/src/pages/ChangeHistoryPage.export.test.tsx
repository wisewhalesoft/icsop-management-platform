import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeHistoryPage } from './ChangeHistoryPage';
import { ApiError } from '../api/client';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { DocumentChangeView, LifecycleChangeView, LifecycleView, SessionUser } from '../api/types';

/**
 * F037 `AC-D1`／`AC-D10`、F038 `AC-D1`／`AC-D6` —— 變更歷程兩 tab 各自匯出之 UI 契約（Lane L5）。
 *
 * 權威：
 *  - `prototypes/23-change-history.html:87-88`（`id="exportDoc"`／`id="exportTree"`，
 *    兩者 `aria-label="匯出"`、icon 鍵 `download`；`:544-545` 切 tab 時各自顯示）
 *  - `prototypes/23-change-history.html:567-578`（成功／超限之逐字回饋文案與錯誤碼標記）
 *  - F037 `AC-D10`（DOM id `exportDoc`；成功回饋以逐字片段
 *    `已匯出 ICSOP 程序書變更歷程（CSV，UTF-8 BOM）` **起始**；超限錯誤逐字
 *    `符合條件之事件為 {N} 筆，超過匯出上限 10000 筆，請縮小查詢條件` ＋ 標記 `EXPORT_ROW_LIMIT_EXCEEDED · 400`）
 *  - F038 `AC-D6`（DOM id `exportTree`；成功片段 `已匯出循環樹狀圖變更歷程（CSV，UTF-8 BOM）`；
 *    超限句式與錯誤碼與 F037 共用）
 *  - F037 `AC-D5`（權限沿用既有閘門：主管／部門窗口／一般使用者無權，頁面已封鎖）
 *
 * ⚠ 對實作全盲：匯出鈕與 `exportDocumentChanges()`／`exportLifecycleChanges()` 於本環撰寫時**尚不
 *    存在** —— 找不到元素／型別錯誤即為預期紅燈。
 *
 * 📌 **端點 helper 名稱為本環所訂之契約**（沿用本檔既有 `getDocumentChanges`／`getLifecycleChanges`
 *    之命名慣例）。若實作採不同名稱，請走 mailbox 向 test-generator 申訴，由 test-generator 修改本檔。
 *    ⚠ 逐字**文案**與 **DOM id** 由 AC 直接指定，不可協商。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const DOC_SUCCESS = '已匯出 ICSOP 程序書變更歷程（CSV，UTF-8 BOM）';
const TREE_SUCCESS = '已匯出循環樹狀圖變更歷程（CSV，UTF-8 BOM）';
const OVER_LIMIT = (n: number) => `符合條件之事件為 ${n} 筆，超過匯出上限 10000 筆，請縮小查詢條件`;
const ERROR_BADGE = 'EXPORT_ROW_LIMIT_EXCEEDED · 400';

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const DOC_CHANGE: DocumentChangeView = {
  id: 'c1', documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  changeType: 'CONTENT', field: 'documentName', oldValue: '舊書名', newValue: '新書名',
  actorId: 'a1', actorName: '李慧玲', actorEmployeeNo: '20233', reason: null,
  occurredAt: '2026-07-16T14:30:05.000Z',
};

const LC_CHANGE: LifecycleChangeView = {
  id: 'lc1', lifecycleId: 'LC-SRC', changeType: 'NODE_ADDED', summary: '新增節點『撥款核准作業』',
  oldValue: null, newValue: '撥款核准作業', nodeId: 'n4',
  actorId: 'a1', actorName: '李慧玲', actorEmployeeNo: '20233',
  occurredAt: '2026-07-16T15:12:04.000Z',
};

const CYCLE: LifecycleView = {
  id: 'LC-SRC', name: '銷售及收款循環', description: null, status: 'active',
  nodeCount: 5, updatedAt: '2026-07-16T00:00:00.000Z',
};

/** 以「元素之可見文字**起始於**片段」定位回饋（AC 只約束起始片段，其後可附筆數/表頭資訊）。 */
const startsWith = (fragment: string) => (_content: string, el: Element | null): boolean => {
  if (!el) return false;
  const own = (el.textContent ?? '').trim();
  if (!own.startsWith(fragment)) return false;
  // 取最內層命中者，避免同時命中所有祖先
  return !Array.from(el.children).some((c) => (c.textContent ?? '').trim().startsWith(fragment));
};

async function renderDocTab(): Promise<void> {
  mockAuth();
  render(<ChangeHistoryPage />);
  await waitFor(() => expect(endpoints.getDocumentChanges).toHaveBeenCalled());
}

async function renderTreeTab(): Promise<void> {
  await renderDocTab();
  await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
  await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
}

describe('ChangeHistoryPage 匯出鈕（F037 AC-D1／AC-D10；F038 AC-D1／AC-D6；prototype 23）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE], total: 1 });
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([CYCLE]);
    vi.mocked(endpoints.exportDocumentChanges).mockResolvedValue(undefined);
    vi.mocked(endpoints.exportLifecycleChanges).mockResolvedValue(undefined);
  });

  it('F037 AC-D10 程序書 tab 之匯出鈕 DOM id 為 `exportDoc`，無障礙名稱逐字為 `匯出`', async () => {
    await renderDocTab();
    const btn = document.getElementById('exportDoc');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('匯出');
  });

  it('F038 AC-D6 循環樹狀圖 tab 之匯出鈕 DOM id 為 `exportTree`，無障礙名稱逐字為 `匯出`', async () => {
    await renderTreeTab();
    const btn = document.getElementById('exportTree');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('匯出');
  });

  it('🔴 AC-D1 兩鈕為**兩個獨立控制項**（各自匯出各自 tab 之結果，不合併）', async () => {
    await renderTreeTab();
    await userEvent.click(document.getElementById('exportTree') as HTMLElement);
    await waitFor(() => expect(endpoints.exportLifecycleChanges).toHaveBeenCalledTimes(1));
    expect(endpoints.exportDocumentChanges).not.toHaveBeenCalled();
  });

  it('AC-D1 程序書 tab 之匯出僅呼叫程序書匯出端點', async () => {
    await renderDocTab();
    await userEvent.click(document.getElementById('exportDoc') as HTMLElement);
    await waitFor(() => expect(endpoints.exportDocumentChanges).toHaveBeenCalledTimes(1));
    expect(endpoints.exportLifecycleChanges).not.toHaveBeenCalled();
  });

  it('AC-D1 匯出帶入與當前查詢**相同**之條件（避免兩份參數解析漂移）', async () => {
    await renderDocTab();
    await userEvent.click(document.getElementById('exportDoc') as HTMLElement);
    await waitFor(() => expect(endpoints.exportDocumentChanges).toHaveBeenCalled());
    const queryArgs = vi.mocked(endpoints.getDocumentChanges).mock.calls[0]?.[0] ?? {};
    const exportArgs = vi.mocked(endpoints.exportDocumentChanges).mock.calls[0]?.[0] ?? {};
    for (const [k, v] of Object.entries(queryArgs as Record<string, unknown>)) {
      if (k === 'page' || k === 'pageSize') continue; // 匯出＝全部結果，分頁參數刻意不帶
      expect((exportArgs as Record<string, unknown>)[k]).toEqual(v);
    }
  });
});

describe('ChangeHistoryPage 匯出之使用者可見回饋（F037 AC-D10／F038 AC-D6 逐字文案）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([CYCLE]);
  });

  it('F037 AC-D10 成功 → 回饋以逐字片段 `已匯出 ICSOP 程序書變更歷程（CSV，UTF-8 BOM）` 起始', async () => {
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE], total: 1 });
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
    vi.mocked(endpoints.exportDocumentChanges).mockResolvedValue(undefined);
    await renderDocTab();
    await userEvent.click(document.getElementById('exportDoc') as HTMLElement);
    expect(await screen.findByText(startsWith(DOC_SUCCESS))).toBeInTheDocument();
  });

  it('F038 AC-D6 成功 → 回饋以逐字片段 `已匯出循環樹狀圖變更歷程（CSV，UTF-8 BOM）` 起始', async () => {
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE], total: 1 });
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
    vi.mocked(endpoints.exportLifecycleChanges).mockResolvedValue(undefined);
    await renderTreeTab();
    await userEvent.click(document.getElementById('exportTree') as HTMLElement);
    expect(await screen.findByText(startsWith(TREE_SUCCESS))).toBeInTheDocument();
  });

  it('🔴 F037 AC-D10 超限 → 錯誤回饋**逐字**為指定句，並附錯誤碼標記', async () => {
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE], total: 10_001 });
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
    vi.mocked(endpoints.exportDocumentChanges).mockRejectedValue(
      new ApiError(400, 'EXPORT_ROW_LIMIT_EXCEEDED', '符合條件之事件為 10001 筆，超過匯出上限 10000 筆'),
    );
    await renderDocTab();
    await userEvent.click(document.getElementById('exportDoc') as HTMLElement);
    expect(await screen.findByText(OVER_LIMIT(10_001))).toBeInTheDocument();
    expect(screen.getByText(ERROR_BADGE)).toBeInTheDocument();
  });

  it('🔴 F038 AC-D6 超限 → 與 F037 **共用同一句式與同一錯誤碼**（量詞為「事件」、範圍限定詞為「查詢條件」）', async () => {
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE], total: 1 });
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 10_001 });
    vi.mocked(endpoints.exportLifecycleChanges).mockRejectedValue(
      new ApiError(400, 'EXPORT_ROW_LIMIT_EXCEEDED', '符合條件之事件為 10001 筆，超過匯出上限 10000 筆'),
    );
    await renderTreeTab();
    await userEvent.click(document.getElementById('exportTree') as HTMLElement);
    const msg = await screen.findByText(OVER_LIMIT(10_001));
    expect(msg).toBeInTheDocument();
    // 🔒 與 F039 附錄頁之句式**刻意不同**（該頁為「筆數」＋「篩選條件」），不得互相對齊
    expect(msg.textContent).not.toContain('符合條件之筆數為');
    expect(msg.textContent).not.toContain('請縮小篩選條件');
  });
});
