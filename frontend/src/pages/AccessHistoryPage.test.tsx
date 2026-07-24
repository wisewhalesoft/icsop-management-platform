import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessHistoryPage } from './AccessHistoryPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { AccessHistoryPage as AccessHistoryPageResult, SessionUser } from '../api/types';

/**
 * F024 文件調閱歷程查詢頁（prototype 17 移植）。接真實端點 GET /admin/access-history。
 * RBAC：SysAdmin/ICSOPAdmin 全公司唯讀；主管/部門窗口/一般使用者無此功能（自我守門封鎖）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
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
  watermarkSnapshot: '22345-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-16 14:32:08',
  occurredAt: '2026-07-16T14:32:08.000Z', source: 'DIRECT',
};
const CHANGELOG_ROW = {
  id: 'r2', accountId: 'a2', employeeNo: '20233', name: '李慧玲',
  company: '和潤企業股份有限公司', department: '債權管理部', section: '法催一室', roleCode: 'ICSOPAdmin',
  targetType: 'DOCUMENT_CHANGE_LOG', actionType: 'CHANGE_LOG_VIEW',
  documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01',
  lifecycleId: null, lifecycleName: null, formId: null, targetName: '文件欄位變更歷程檢視',
  watermarkSnapshot: null,
  occurredAt: '2026-07-16T15:05:19.000Z', source: 'DIRECT',
};
const DOWNLOAD_ROW = {
  id: 'r3', accountId: 'a3', employeeNo: '20088', name: '陳彥廷',
  company: '和潤企業股份有限公司', department: '企劃部', section: '車輛行銷室', roleCode: 'Supervisor',
  targetType: 'DOCUMENT', actionType: 'DOWNLOAD',
  documentId: 'd2', documentNumber: 'ICSOP-SRC-101-2-00',
  lifecycleId: null, lifecycleName: null, formId: null, targetName: '消金審核作業',
  watermarkSnapshot: 'wm', occurredAt: '2026-07-16T11:20:33.000Z', source: 'DIRECT',
};
const LIFECYCLE_ROW = {
  id: 'r4', accountId: 'a4', employeeNo: '20233', name: '李慧玲',
  company: '和潤企業股份有限公司', department: '債權管理部', section: '法催一室', roleCode: 'ICSOPAdmin',
  targetType: 'LIFECYCLE', actionType: 'LIFECYCLE_VIEW',
  documentId: null, documentNumber: null,
  lifecycleId: 'l1', lifecycleName: '銷售及收款循環', formId: null, targetName: null,
  watermarkSnapshot: 'wm', occurredAt: '2026-07-16T15:40:26.000Z', source: 'DIRECT',
};

function pageOf(items: object[], over: Partial<AccessHistoryPageResult> = {}): AccessHistoryPageResult {
  return {
    items: items as AccessHistoryPageResult['items'],
    total: items.length, page: 1, pageSize: 50, hasNext: false, appliedDefaultRange: false,
    ...over,
  };
}

describe('AccessHistoryPage — 文件調閱歷程查詢（F024）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW, CHANGELOG_ROW]));
  });

  it('載入後渲染調閱列（操作人員、對象文件編號、角色標籤）', async () => {
    mockAuth('SysAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    expect(screen.getAllByText('ICSOP-SRC-101-1-01').length).toBeGreaterThan(0);
    expect(screen.getByText('一般使用者')).toBeInTheDocument(); // roleCode→label
  });

  it('TS-004 主管無查詢權 → 顯示封鎖畫面、不呼叫查詢端點', async () => {
    mockAuth('Supervisor');
    render(<AccessHistoryPage />);
    expect(screen.getByText('無文件調閱歷程查詢權限')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getAccessHistory).not.toHaveBeenCalled();
  });

  it('TS-007 類型篩選＝循環 → 以 kind=循環 重新查詢', async () => {
    mockAuth('ICSOPAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText('類型'), '循環');

    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(
        expect.objectContaining({ kind: '循環' }),
      ),
    );
  });

  it('TS-006 展開含浮水印動作 → 顯示浮水印快照原樣', async () => {
    mockAuth('SysAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    await userEvent.click(screen.getByText('王小明'));

    await waitFor(() =>
      expect(screen.getByText(/僅供內部使用非經許可不得複製翻印/)).toBeInTheDocument(),
    );
  });

  it('TS-006 展開變更歷程（無浮水印）→ 該欄留空提示、不視為錯誤', async () => {
    mockAuth('SysAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());

    await userEvent.click(screen.getByText('李慧玲'));

    await waitFor(() => expect(screen.getByText(/無浮水印/)).toBeInTheDocument());
  });

  it('空結果 → 顯示空狀態', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText(/查無符合結果/)).toBeInTheDocument());
  });

  it('TS-005 空條件套用近 30 天預設 → 顯示提示', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(
      pageOf([DOC_ROW], { appliedDefaultRange: true }),
    );
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText(/近 30 天/)).toBeInTheDocument());
  });

  it('匯出 → 呼叫 exportAccessHistory（遵循當前查詢條件）', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.exportAccessHistory).mockResolvedValue({ rows: [], total: 0 });
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));

    await waitFor(() => expect(endpoints.exportAccessHistory).toHaveBeenCalledOnce());
  });

  it('查詢列可依人員與時間組合送出（AND）', async () => {
    mockAuth('SysAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/人員/), '王小明');
    await userEvent.click(screen.getByRole('button', { name: '查詢' }));

    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(
        expect.objectContaining({ person: '王小明' }),
      ),
    );
    // 用 within 限縮避免多重匹配
    const table = screen.getByRole('table');
    expect(within(table).getByText('王小明')).toBeInTheDocument();
  });

  it('TS-AQ-FE-001 操作類型 pill 顏色依 actionType 對映（逐字比對 prototype ACT_STYLE）', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOWNLOAD_ROW, LIFECYCLE_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('陳彥廷')).toBeInTheDocument());

    // DOWNLOAD → blue（非現況 slate）；LIFECYCLE_VIEW → emerald。
    const dlPill = screen.getByText('DOWNLOAD · 下載');
    expect(dlPill.className).toContain('bg-blue-50');
    expect(dlPill.className).not.toContain('bg-slate-50');
    const lcPill = screen.getByText('LIFECYCLE_VIEW · 循環樹狀圖檢視');
    expect(lcPill.className).toContain('bg-emerald-50');
  });

  it('TS-AQ-FE-002 展開後箭頭圖示由 chevron-right 變為 chevron-down', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW]));
    const { container } = render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    // 初始未展開：僅 chevron-right、無 chevron-down。
    expect(container.querySelector('.lucide-chevron-down')).toBeNull();
    expect(container.querySelector('.lucide-chevron-right')).not.toBeNull();

    await userEvent.click(screen.getByText('王小明'));

    // 展開後：出現 chevron-down。
    await waitFor(() =>
      expect(container.querySelector('.lucide-chevron-down')).not.toBeNull(),
    );
  });

  it('TS-AQ-FE-003 結果超過一頁 → 顯示換頁控制項；下一頁以 page+1 重新查詢；末頁停用下一頁', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(
      pageOf([DOC_ROW], { total: 75, page: 1, pageSize: 50, hasNext: true }),
    );
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    // (1) 換頁控制項存在，「下一頁」可點擊。
    const next = screen.getByRole('button', { name: '下一頁' });
    expect(next).toBeEnabled();

    // (2) 點「下一頁」→ 以 page:2 重新查詢。
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(
      pageOf([DOC_ROW], { total: 75, page: 2, pageSize: 50, hasNext: false }),
    );
    await userEvent.click(next);
    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );

    // (3) 第 2 頁（末頁）：上一頁可點、下一頁停用。
    await waitFor(() => expect(screen.getByRole('button', { name: '上一頁' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled();
  });
});
