import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessHistoryPage } from './AccessHistoryPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { AccessHistoryPage as AccessHistoryPageResult, SessionUser } from '../api/types';

/**
 * F024 匯出鈕失效之修復 delta —— `AC-F19`（超限之事前提示）。
 *
 * 權威：
 *  - `docs/specs/features/F024-access-history-query.md#export-fix-delta` `AC-F19`
 *  - `prototypes/17a-access-history-export-limit-hint.html`（落點示範，非文案／版面權威；
 *    文案權威仍為 AC-F19 本文，落點權威為 `prototypes/17-access-history.html`）
 *
 * 📌 本檔獨立於 `AccessHistoryPage.export.test.tsx`（AC-F1/F3/F9/F16）之外，因本 AC 純屬「依
 *    查詢結果之 `total` 渲染提示」的關注點，不需要驅動真實 `fetch`／下載鏈，`vi.mock('../api/
 *    endpoints', ...)` 之全域 mock 在此反而是正確、精簡的做法——與姊妹檔案刻意保留真實
 *    `exportAccessHistory()` 互斥（vitest 之 `vi.mock` 為 hoisted、效力及於整個模組作用域，
 *    兩種策略無法共存於同一檔案）。
 *
 * ⚠ 對實作全盲：`#export-limit-hint`／`aria-describedby` 於本環撰寫時尚不存在 —— 找不到元素
 *    即為預期紅燈。
 *
 * 🔴 邊界值 off-by-one（AC-F19 明文）：`total > 10000` 才提示；**恰 10000 不提示**（合法可匯出）；
 *    寫成 `>=` 會測試綠而行為錯，故本檔以 9999／10000／10001 三值驅動，缺一不可。
 *
 * 🔴 斷言一律以容器定位（`#export-limit-hint`；`AC-F9` ② 為 `role="alert"`），不得以全頁
 *    `getByText(/符合查詢條件之筆數為…/)` 正則斷言——兩者共用前綴，超限後同時在場會命中多節點。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'SysAdmin') {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const DOC_ROW = {
  id: 'r1', accountId: 'a1', employeeNo: '22345', name: '王小明',
  company: '和潤企業股份有限公司', department: '營運管理部', section: '審查室', roleCode: 'User',
  targetType: 'DOCUMENT', actionType: 'VIEW',
  documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01',
  lifecycleId: null, lifecycleName: null, formId: null, targetName: '車輛分期進件作業',
  watermarkSnapshot: 'wm', occurredAt: '2026-07-16T14:32:08.000Z', source: 'DIRECT',
};

function pageOf(items: object[], over: Partial<AccessHistoryPageResult> = {}): AccessHistoryPageResult {
  return {
    items: items as AccessHistoryPageResult['items'],
    total: items.length, page: 1, pageSize: 50, hasNext: false, appliedDefaultRange: false,
    ...over,
  };
}

describe('AccessHistoryPage 匯出（AC-F19 超限之事前提示，off-by-one 邊界）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  async function renderWithTotal(total: number): Promise<void> {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW], { total }));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(endpoints.getAccessHistory).toHaveBeenCalled());
  }

  it('🔴 9999 筆 → 不提示，匯出鈕無 aria-describedby 指向 export-limit-hint', async () => {
    await renderWithTotal(9999);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    expect(document.getElementById('export-limit-hint')).toBeNull();
    const btn = screen.getByRole('button', { name: /匯出/ });
    expect(btn.getAttribute('aria-describedby')).not.toBe('export-limit-hint');
  });

  it('🔴 恰 10000 筆（邊界，off-by-one）→ 不提示（恰等於上限是合法可匯出的，不得用 >=）', async () => {
    await renderWithTotal(10000);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    expect(document.getElementById('export-limit-hint')).toBeNull();
  });

  it('🔴 10001 筆 → 提示逐字出現，容器 id 為 export-limit-hint，匯出鈕 aria-describedby 指向該 id', async () => {
    await renderWithTotal(10001);
    await waitFor(() => expect(document.getElementById('export-limit-hint')).not.toBeNull());
    const hint = document.getElementById('export-limit-hint');
    expect(hint?.textContent).toBe(
      '目前符合查詢條件之筆數為 10001 筆，已超過匯出上限 10000 筆，直接匯出將被拒絕，請先縮小查詢條件後再匯出。',
    );
    const btn = screen.getByRole('button', { name: /匯出/ });
    expect(btn.getAttribute('aria-describedby')).toBe('export-limit-hint');
  });

  it('提示與 aria-describedby 隨查詢結果重算而消失（改條件重查、total 降至上限以下）', async () => {
    await renderWithTotal(10001);
    await waitFor(() => expect(document.getElementById('export-limit-hint')).not.toBeNull());

    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW], { total: 5 }));
    await userEvent.click(screen.getByRole('button', { name: '查詢' }));

    await waitFor(() => expect(document.getElementById('export-limit-hint')).toBeNull());
    const btn = screen.getByRole('button', { name: /匯出/ });
    expect(btn.getAttribute('aria-describedby')).not.toBe('export-limit-hint');
  });

  it('匯出鈕維持可按，不得 disabled（AC-F19 明文禁令）', async () => {
    await renderWithTotal(10001);
    await waitFor(() => expect(document.getElementById('export-limit-hint')).not.toBeNull());
    expect(screen.getByRole('button', { name: /匯出/ })).toBeEnabled();
  });

  it('無查詢結果（查詢失敗）→ 不呈現提示，匯出鈕不帶 aria-describedby', async () => {
    vi.mocked(endpoints.getAccessHistory).mockRejectedValue(new Error('network'));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(endpoints.getAccessHistory).toHaveBeenCalled());
    expect(document.getElementById('export-limit-hint')).toBeNull();
  });

  /**
   * AC-F9 ② 錯誤回饋與本提示可同時可見（生命週期不同：提示隨查詢結果、錯誤回饋隨匯出操作），
   * 且以容器定位互不混淆。此處以 `exportAccessHistory` 之 mock 模擬超限錯誤觸發 AC-F9 ②，
   * 驗證兩容器可分別精準命中，不需要驅動真實 fetch 鏈（純渲染關注）。
   */
  it('🔴 事前提示與 AC-F9 ② 錯誤回饋可同時可見，且以容器定位互不混淆（不得用全頁 getByText 正則）', async () => {
    const { ApiError } = await import('../api/client');
    vi.mocked(endpoints.exportAccessHistory).mockRejectedValue(
      new ApiError(
        400,
        'EXPORT_ROW_LIMIT_EXCEEDED',
        '符合條件之筆數為 10001 筆，超過匯出上限 10000 筆',
      ),
    );
    await renderWithTotal(10001);
    await waitFor(() => expect(document.getElementById('export-limit-hint')).not.toBeNull());

    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));

    const alertRegion = await screen.findByRole('alert');
    expect(alertRegion.textContent).toContain(
      '符合查詢條件之筆數為 10001 筆，超過匯出上限 10000 筆，請縮小查詢條件',
    );
    expect(document.getElementById('export-limit-hint')?.textContent).toContain('直接匯出將被拒絕');
  });
});
