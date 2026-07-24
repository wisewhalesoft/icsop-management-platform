import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeHistoryPage } from './ChangeHistoryPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  DocumentChangeView,
  LifecycleChangeView,
  LifecycleView,
  SessionUser,
} from '../api/types';

/**
 * F037/F038 文件變更歷程頁（prototype 23 移植）。RBAC 僅 SysAdmin/ICSOPAdmin。
 * 程序書 tab：欄位 before/after，展開觸發 viewDocumentChanges（記 CHANGE_LOG_VIEW）。
 * 循環樹狀圖 tab：結構變更清單。
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

const DOC_CHANGE: DocumentChangeView = {
  id: 'c1',
  documentId: 'd1',
  documentNumber: 'ICSOP-SRC-101-1-01',
  changeType: 'CONTENT',
  field: 'documentName',
  oldValue: '舊書名',
  newValue: '新書名',
  actorId: 'a1',
  actorName: '李慧玲',
  actorEmployeeNo: '20233',
  occurredAt: '2026-07-16T14:30:05.000Z',
};
const STATUS_CHANGE: DocumentChangeView = {
  ...DOC_CHANGE,
  id: 'c2',
  changeType: 'STATUS',
  field: 'status',
  oldValue: 'active',
  newValue: 'void',
  occurredAt: '2026-07-13T10:00:00.000Z',
};

const LC_CHANGE: LifecycleChangeView = {
  id: 'lc1',
  lifecycleId: 'LC-SRC',
  changeType: 'NODE_ADDED',
  summary: '新增節點『撥款核准作業』',
  oldValue: null,
  newValue: '撥款核准作業',
  nodeId: 'n4',
  actorId: 'a1',
  actorName: '李慧玲',
  actorEmployeeNo: '20233',
  occurredAt: '2026-07-16T15:12:04.000Z',
};
const CYCLE: LifecycleView = {
  id: 'LC-SRC',
  name: '銷售及收款循環',
  description: null,
  status: 'active',
  nodeCount: 5,
  updatedAt: '2026-07-16T00:00:00.000Z',
};

describe('ChangeHistoryPage — F037/F038', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE, STATUS_CHANGE], total: 2 });
    vi.mocked(endpoints.viewDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE] });
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
    vi.mocked(endpoints.viewLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE] });
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([CYCLE]);
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue({
      lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
      graph: {
        nodes: [{ id: 'n4', lifecycleId: 'LC-SRC', name: '撥款核准作業', positionX: 0, positionY: 0, docCount: 1 }],
        edges: [],
      },
      watermark: '20233-李慧玲-和潤企業-債權管理部-法催一室-僅供內部使用-2026-07-16',
    });
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockReturnValue('/admin/lifecycles/LC-SRC/tree-preview/download');
  });

  it('程序書 tab：載入後渲染變更列（文件編號、before/after 摘要、操作人）', async () => {
    mockAuth('SysAdmin');
    render(<ChangeHistoryPage />);
    await waitFor(() => expect(screen.getAllByText('ICSOP-SRC-101-1-01').length).toBeGreaterThan(0));
    expect(screen.getByText(/程序書書名：舊書名 → 新書名/)).toBeInTheDocument();
    expect(screen.getAllByText(/李慧玲/).length).toBeGreaterThan(0);
  });

  it('展開某文件 → 呼叫 viewDocumentChanges（記 CHANGE_LOG_VIEW）並顯示 before/after', async () => {
    mockAuth('ICSOPAdmin');
    render(<ChangeHistoryPage />);
    await waitFor(() => expect(screen.getByText(/程序書書名：舊書名 → 新書名/)).toBeInTheDocument());

    await userEvent.click(screen.getByText(/程序書書名：舊書名 → 新書名/));

    await waitFor(() => expect(endpoints.viewDocumentChanges).toHaveBeenCalledWith('d1'));
    expect(screen.getByText(/展開檢視已寫入/)).toBeInTheDocument();
  });

  it('主管無權 → 顯示封鎖畫面、不呼叫任何端點', () => {
    mockAuth('Supervisor');
    render(<ChangeHistoryPage />);
    expect(screen.getByText('無變更歷程查詢權限')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getDocumentChanges).not.toHaveBeenCalled();
  });

  it('切換至循環樹狀圖 tab → 渲染結構變更清單', async () => {
    mockAuth('SysAdmin');
    render(<ChangeHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));

    await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
    expect(screen.getAllByText('銷售及收款循環').length).toBeGreaterThan(0);
  });

  it('循環 tab 預覽 → 記 LIFECYCLE_CHANGELOG_VIEW ＋重用 F036 樹圖渲染（節點醒目標示）', async () => {
    mockAuth('SysAdmin');
    render(<ChangeHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
    await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /預覽/ }));

    await waitFor(() => expect(endpoints.viewLifecycleChanges).toHaveBeenCalledWith('LC-SRC', '銷售及收款循環'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const node = await screen.findByTestId('tree-node-n4');
    expect(node.getAttribute('data-highlighted')).toBe('true');
    expect(within(screen.getByRole('dialog')).getByText(/LIFECYCLE_CHANGELOG_VIEW/)).toBeInTheDocument();
  });

  it('TS-DCL-D-011 changeType=CREATE 事件 → 來源標籤顯示「建立」', async () => {
    mockAuth('SysAdmin');
    const CREATE_ROW: DocumentChangeView = {
      ...DOC_CHANGE,
      id: 'cr1',
      changeType: 'CREATE',
      field: 'documentName',
      oldValue: null,
      newValue: '車輛分期進件作業',
      occurredAt: '2026-07-10T09:00:00.000Z',
    };
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [CREATE_ROW], total: 1 });
    render(<ChangeHistoryPage />);
    await waitFor(() =>
      expect(screen.getByText(/程序書書名：（空） → 車輛分期進件作業/)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText(/程序書書名：（空） → 車輛分期進件作業/));
    expect(await screen.findByText('建立')).toBeInTheDocument();
  });

  it('TS-DCL-D-012 同文件同時間多筆 CREATE → 沿用 60 秒聚合顯示「N 項欄位變更」', async () => {
    mockAuth('SysAdmin');
    const t = '2026-07-10T09:00:00.000Z';
    const mk = (id: string, field: string, newValue: string): DocumentChangeView => ({
      ...DOC_CHANGE,
      id,
      changeType: 'CREATE',
      field,
      oldValue: null,
      newValue,
      occurredAt: t,
    });
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({
      items: [
        mk('a', 'lifecycleId', 'lc1'),
        mk('b', 'status', 'active'),
        mk('c', 'documentNumber', 'ICSOP-SRC-101-1-01'),
        mk('d', 'documentName', '車輛分期進件作業'),
      ],
      total: 4,
    });
    render(<ChangeHistoryPage />);
    await waitFor(() => expect(screen.getByText(/4 項欄位變更/)).toBeInTheDocument());
  });

  it('TS-DCL-D-013 STATUS 事件含 reason → 展開顯示「切換原因：{reason}」', async () => {
    mockAuth('SysAdmin');
    const STATUS_WITH_REASON: DocumentChangeView = {
      ...STATUS_CHANGE,
      id: 'sr1',
      oldValue: 'active',
      newValue: 'inactive',
      reason: '依法規更新',
    };
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [STATUS_WITH_REASON], total: 1 });
    vi.mocked(endpoints.viewDocumentChanges).mockResolvedValue({ items: [STATUS_WITH_REASON] });
    render(<ChangeHistoryPage />);
    await waitFor(() => expect(screen.getByText(/文件狀態：有效 → 失效/)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/文件狀態：有效 → 失效/));
    expect(await screen.findByText(/切換原因：依法規更新/)).toBeInTheDocument();
  });

  it('TS-DCL-D-014 reason 為 null → 不顯示原因列（非「（空）」）', async () => {
    mockAuth('SysAdmin');
    const STATUS_NO_REASON: DocumentChangeView = {
      ...STATUS_CHANGE,
      id: 'sr2',
      oldValue: 'active',
      newValue: 'inactive',
      reason: null,
    };
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [STATUS_NO_REASON], total: 1 });
    vi.mocked(endpoints.viewDocumentChanges).mockResolvedValue({ items: [STATUS_NO_REASON] });
    render(<ChangeHistoryPage />);
    await waitFor(() => expect(screen.getByText(/文件狀態：有效 → 失效/)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/文件狀態：有效 → 失效/));
    expect(await screen.findByText(/展開檢視已寫入/)).toBeInTheDocument();
    expect(screen.queryByText(/切換原因：/)).not.toBeInTheDocument();
  });
});
