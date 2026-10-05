import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeHistoryPage } from './ChangeHistoryPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { DocumentChangeView, SessionUser } from '../api/types';

/**
 * 🔴 2026-10-05 delta：文件變更歷程之使用部門跑版（prototypes/23 `listSummary()`／`listDetail()`）。
 *
 * 使用者實機回報：使用部門掛上大量部門後，原始代碼串（`["AI000","AN000",…]`，整串無空白）撐爆
 * 「變更摘要」欄。改為：摘要只寫增減數量、展開分三組標籤（標籤＝名稱、title＝代碼）、
 * 其餘代碼欄位以後端 `oldDisplay`／`newDisplay`（已轉名稱）呈現。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

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

const MANY_OLD = ['AI000', 'CF000', 'DAA00', 'DBA00', 'DD000', 'CBA00', 'CC000', 'CD000', 'AF000'];
const MANY_NEW = ['AI000', 'AN000', 'AP000', 'DAA00', 'DBA00', 'DD000', 'CBA00', 'CC000', 'CD000', 'JAB00', 'AF000'];

const USING_DEPT: DocumentChangeView = {
  id: 'u1',
  documentId: 'd1',
  documentNumber: 'ICSOP-CIPS-109-1-02',
  changeType: 'CONTENT',
  field: 'usingDeptIds',
  oldValue: JSON.stringify(MANY_OLD),
  newValue: JSON.stringify(MANY_NEW),
  actorId: 'a1',
  actorName: '李慧玲',
  actorEmployeeNo: '20233',
  occurredAt: '2026-10-01T02:00:00.000Z',
  oldDisplay: '資訊部、作業服務部、…',
  newDisplay: '資訊部、法務部、…',
  listDiff: {
    added: [
      { code: 'AN000', label: '法務部' },
      { code: 'AP000', label: '經企公關部' },
      { code: 'JAB00', label: '風險分析室' },
    ],
    removed: [{ code: 'CF000', label: '作業服務部' }],
    unchanged: [
      { code: 'AI000', label: '資訊部' },
      { code: 'DAA00', label: '企劃部' },
      { code: 'DBA00', label: '管理部' },
      { code: 'DD000', label: '財會管理室/和潤暨海外事業' },
      { code: 'CBA00', label: '資金管理室' },
      { code: 'CC000', label: '債權管理部' },
      { code: 'CD000', label: '信用審查部' },
      { code: 'AF000', label: '稽核部' },
    ],
  },
};

const CHIEF: DocumentChangeView = {
  ...USING_DEPT,
  id: 'p1',
  documentId: 'd2',
  documentNumber: 'ICSOP-SRC-101-1-01',
  field: 'primaryChiefId',
  oldValue: '20050',
  newValue: '20071',
  oldDisplay: '陳彥廷（20050）',
  newDisplay: '黃雅琪（20071）',
  listDiff: null,
  occurredAt: '2026-09-30T02:00:00.000Z',
};

describe('ChangeHistoryPage — 2026-10-05 使用部門增減呈現與代碼轉名稱', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [USING_DEPT, CHIEF], total: 2 });
    vi.mocked(endpoints.viewDocumentChanges).mockImplementation((id: string) =>
      Promise.resolve({ items: id === 'd1' ? [USING_DEPT] : [CHIEF] }),
    );
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([]);
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [], total: 0 });
  });

  it('清單型欄位之摘要只寫增減數量，不輸出任何原始代碼', async () => {
    render(<ChangeHistoryPage />);
    const cell = await screen.findByText('文件使用部門：新增 3 個、移除 1 個（共 11 個）');
    expect(cell.textContent).not.toMatch(/AI000|\["/);
  });

  it('摘要欄帶寬度上限與任意處斷行（任何長值都不得撐寬表格）', async () => {
    render(<ChangeHistoryPage />);
    await screen.findByText(/文件使用部門：新增 3 個/);
    for (const cell of screen.getAllByTestId('change-summary-cell')) {
      expect(cell.className).toMatch(/max-w-/);
      expect(cell.className).toMatch(/overflow-wrap:anywhere/);
    }
  });

  it('非清單型代碼欄位 → 以後端顯示值（名稱）呈現，不顯示裸員編', async () => {
    render(<ChangeHistoryPage />);
    expect(await screen.findByText('當責室長-主要：陳彥廷（20050） → 黃雅琪（20071）')).toBeInTheDocument();
  });

  it('展開 → 新增／移除各一組標籤（名稱、title＝代碼）；未變動預設收合、只顯示數量', async () => {
    render(<ChangeHistoryPage />);
    await userEvent.click(await screen.findByText(/文件使用部門：新增 3 個/));
    await waitFor(() => expect(endpoints.viewDocumentChanges).toHaveBeenCalledWith('d1'));

    const added = await screen.findByTestId('list-diff-add');
    expect(within(added).getByText('新增 3')).toBeInTheDocument();
    expect(within(added).getByText('法務部')).toHaveAttribute('title', 'AN000');
    const removed = screen.getByTestId('list-diff-rm');
    expect(within(removed).getByText('作業服務部')).toHaveAttribute('title', 'CF000');

    const keep = screen.getByTestId('list-diff-keep') as HTMLDetailsElement;
    expect(keep.open).toBe(false);
    expect(within(keep).getByText('未變動 8 個')).toBeInTheDocument();
  });

  it('🔒 舊版後端（無 oldDisplay／listDiff）→ 退回原始值，不崩潰', async () => {
    const legacy: DocumentChangeView = {
      ...CHIEF,
      oldDisplay: undefined,
      newDisplay: undefined,
      listDiff: undefined,
    };
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [legacy], total: 1 });
    render(<ChangeHistoryPage />);
    expect(await screen.findByText('當責室長-主要：20050 → 20071')).toBeInTheDocument();
  });
});
