import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeHistoryPage } from './ChangeHistoryPage';
import { ApiError } from '../api/client';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  DocumentChangeView,
  LifecycleChangeView,
  LifecycleView,
  LifecycleTreeDiff,
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

const WM = '20233-李慧玲-和潤企業-債權管理部-法催一室-僅供內部使用-2026-07-16';
function dagNode(id: string, name: string, docCount = 0) {
  return { id, lifecycleId: 'LC-SRC', name, positionX: 0, positionY: 0, docCount };
}
// 預設 diff fixture：新增節點 n4（LC_CHANGE=NODE_ADDED），改接連線。
const TREE_DIFF: LifecycleTreeDiff = {
  lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
  before: {
    nodes: [dagNode('n1', '進件作業', 2), dagNode('n5', '案件執行作業', 1)],
    edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n5' }],
  },
  after: {
    nodes: [dagNode('n1', '進件作業', 2), dagNode('n4', '撥款核准作業', 1), dagNode('n5', '案件執行作業', 1)],
    edges: [
      { id: 'e2', sourceNodeId: 'n1', targetNodeId: 'n4' },
      { id: 'e3', sourceNodeId: 'n4', targetNodeId: 'n5' },
    ],
  },
  diff: { addNodes: ['n4'], rmNodes: [], amberNodes: [], addEdges: [['n1', 'n4'], ['n4', 'n5']], rmEdges: [['n1', 'n5']] },
  watermark: WM,
};

describe('ChangeHistoryPage — F037/F038', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE, STATUS_CHANGE], total: 2 });
    vi.mocked(endpoints.viewDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE] });
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
    vi.mocked(endpoints.viewLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE] });
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([CYCLE]);
    vi.mocked(endpoints.getLifecycleTreeDiff).mockResolvedValue(TREE_DIFF);
    vi.mocked(endpoints.lifecycleTreeDiffDownloadUrl).mockImplementation(
      (lifecycleId: string, changeLogId: string) =>
        `/admin/change-history/lifecycles/${lifecycleId}/changes/${changeLogId}/tree-diff/download`,
    );
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

  // ── F038 §D：新舊並列 modal（prototype 23 對齊）──

  async function openTreePreview(role = 'SysAdmin'): Promise<void> {
    mockAuth(role);
    render(<ChangeHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
    await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /預覽/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  }

  it('TS-LCC-D-002 預覽 → 呼叫 getLifecycleTreeDiff(lifecycleId, changeLogId)＋viewLifecycleChanges 各一次，且不呼叫 getLifecycleTreePreview', async () => {
    await openTreePreview();
    expect(endpoints.getLifecycleTreeDiff).toHaveBeenCalledTimes(1);
    expect(endpoints.getLifecycleTreeDiff).toHaveBeenCalledWith('LC-SRC', 'lc1');
    expect(endpoints.viewLifecycleChanges).toHaveBeenCalledTimes(1);
    expect(endpoints.viewLifecycleChanges).toHaveBeenCalledWith('LC-SRC', '銷售及收款循環');
    expect(endpoints.getLifecycleTreePreview).not.toHaveBeenCalled();
  });

  it('TS-LCC-D-003 Modal 雙欄：tree-board-before 與 tree-board-after 皆存在', async () => {
    await openTreePreview();
    expect(screen.getByTestId('tree-board-before')).toBeInTheDocument();
    expect(screen.getByTestId('tree-board-after')).toBeInTheDocument();
  });

  it('TS-LCC-D-004 addNodes 命中節點 → 僅出現於 after（data-diff="add"），before 無該節點', async () => {
    await openTreePreview();
    const afterNode = screen.getByTestId('tree-node-after-n4');
    expect(afterNode.getAttribute('data-diff')).toBe('add');
    expect(screen.queryByTestId('tree-node-before-n4')).not.toBeInTheDocument();
  });

  it('TS-LCC-D-005（取代舊案）rmNodes 命中節點 → 僅出現於 before（data-diff="remove"），after 無；且 modal 不再有 data-highlighted', async () => {
    const RM_DIFF: LifecycleTreeDiff = {
      lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
      before: {
        nodes: [dagNode('n5', '付款核准作業', 1), dagNode('n6', '付款執行作業', 1)],
        edges: [{ id: 'e1', sourceNodeId: 'n5', targetNodeId: 'n6' }],
      },
      after: { nodes: [dagNode('n5', '付款核准作業', 1)], edges: [] },
      diff: { addNodes: [], rmNodes: ['n6'], amberNodes: [], addEdges: [], rmEdges: [['n5', 'n6']] },
      watermark: WM,
    };
    vi.mocked(endpoints.getLifecycleTreeDiff).mockResolvedValue(RM_DIFF);
    await openTreePreview();
    const beforeNode = screen.getByTestId('tree-node-before-n6');
    expect(beforeNode.getAttribute('data-diff')).toBe('remove');
    expect(screen.queryByTestId('tree-node-after-n6')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('[data-highlighted]')).toBeNull();
  });

  it('TS-LCC-D-006 amberNodes → 兩欄皆出現 data-diff="amber"，before 顯示舊名、after 顯示新名（不互相覆蓋）', async () => {
    const AMBER_DIFF: LifecycleTreeDiff = {
      lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
      before: { nodes: [dagNode('n4', '撥款核准', 1)], edges: [] },
      after: { nodes: [dagNode('n4', '撥款核准作業', 2)], edges: [] },
      diff: { addNodes: [], rmNodes: [], amberNodes: ['n4'], addEdges: [], rmEdges: [] },
      watermark: WM,
    };
    vi.mocked(endpoints.getLifecycleTreeDiff).mockResolvedValue(AMBER_DIFF);
    await openTreePreview();
    const before = screen.getByTestId('tree-node-before-n4');
    const after = screen.getByTestId('tree-node-after-n4');
    expect(before.getAttribute('data-diff')).toBe('amber');
    expect(after.getAttribute('data-diff')).toBe('amber');
    expect(within(before).getByText('撥款核准')).toBeInTheDocument();
    expect(within(after).getByText('撥款核准作業')).toBeInTheDocument();
    expect(within(before).getByText('掛載 1 份')).toBeInTheDocument();
    expect(within(after).getByText('掛載 2 份')).toBeInTheDocument();
  });

  it('TS-LCC-D-007 三色圖例文字皆渲染：新增／移除／改名／掛載變更', async () => {
    // 中性 diff（無節點標籤）→ 三色圖例文字為唯一出現處，不與節點「新增」標籤混淆。
    const NEUTRAL: LifecycleTreeDiff = {
      lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
      before: { nodes: [dagNode('n1', '進件作業', 1)], edges: [] },
      after: { nodes: [dagNode('n1', '進件作業', 1)], edges: [] },
      diff: { addNodes: [], rmNodes: [], amberNodes: [], addEdges: [], rmEdges: [] },
      watermark: WM,
    };
    vi.mocked(endpoints.getLifecycleTreeDiff).mockResolvedValue(NEUTRAL);
    await openTreePreview();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('新增')).toBeInTheDocument();
    expect(dialog.getByText('移除')).toBeInTheDocument();
    expect(dialog.getByText('改名／掛載變更')).toBeInTheDocument();
  });

  it('TS-LCC-D-008 每欄各自浮水印層 watermark-overlay-before/-after，內容皆等於 API watermark', async () => {
    await openTreePreview();
    expect(screen.getByTestId('watermark-overlay-before')).toHaveTextContent(WM);
    expect(screen.getByTestId('watermark-overlay-after')).toHaveTextContent(WM);
  });

  it('TS-LCC-D-009 表格列下載 href 改用 lifecycleTreeDiffDownloadUrl(lifecycleId, changeLogId)', async () => {
    mockAuth('SysAdmin');
    render(<ChangeHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
    await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
    expect(endpoints.lifecycleTreeDiffDownloadUrl).toHaveBeenCalledWith('LC-SRC', 'lc1');
    expect(endpoints.lifecycleTreeDownloadUrl).not.toHaveBeenCalled();
  });

  it('TS-LCC-D-010 Modal 下載按鈕文案「下載新舊對照 PDF」，href 為新端點', async () => {
    await openTreePreview();
    const link = within(screen.getByRole('dialog')).getByRole('link', { name: /下載新舊對照 PDF/ });
    expect(link).toHaveAttribute(
      'href',
      '/admin/change-history/lifecycles/LC-SRC/changes/lc1/tree-diff/download',
    );
  });

  it('TS-LCC-D-011 頁尾說明文案含「架構決策」與「變更前＝前一筆快照」', async () => {
    mockAuth('SysAdmin');
    render(<ChangeHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
    await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
    expect(screen.getByText(/架構決策/)).toBeInTheDocument();
    expect(screen.getByText(/變更前＝前一筆快照/)).toBeInTheDocument();
  });

  it('TS-LCC-D-012 getLifecycleTreeDiff 失敗（404）→ 顯示錯誤、不開啟 modal', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getLifecycleTreeDiff).mockRejectedValue(
      new ApiError(404, 'LIFECYCLE_CHANGE_LOG_NOT_FOUND'),
    );
    render(<ChangeHistoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
    await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /預覽/ }));
    await waitFor(() =>
      expect(screen.getByText(/LIFECYCLE_CHANGE_LOG_NOT_FOUND/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('TS-LCC-D-013 before 為空圖（第一筆事件）→ tree-board-before 顯示空狀態', async () => {
    const FIRST_DIFF: LifecycleTreeDiff = {
      lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
      before: { nodes: [], edges: [] },
      after: { nodes: [dagNode('n1', '進件作業', 0)], edges: [] },
      diff: { addNodes: ['n1'], rmNodes: [], amberNodes: [], addEdges: [], rmEdges: [] },
      watermark: WM,
    };
    vi.mocked(endpoints.getLifecycleTreeDiff).mockResolvedValue(FIRST_DIFF);
    await openTreePreview();
    const board = screen.getByTestId('tree-board-before');
    expect(within(board).getByText(/空 DAG/)).toBeInTheDocument();
    expect(screen.queryByTestId('tree-node-before-n1')).not.toBeInTheDocument();
  });

  it('TS-LCC-D-014 RBAC 封鎖（Supervisor）→ 封鎖畫面、不呼叫 getLifecycleTreeDiff', () => {
    mockAuth('Supervisor');
    render(<ChangeHistoryPage />);
    expect(screen.getByText('無變更歷程查詢權限')).toBeInTheDocument();
    expect(endpoints.getLifecycleTreeDiff).not.toHaveBeenCalled();
  });

  it('TS-LCC-D-015 關閉 modal → 兩欄狀態清空，不殘留前次 diff', async () => {
    await openTreePreview();
    expect(screen.getByTestId('tree-board-after')).toBeInTheDocument();
    // 頁尾「關閉」按鈕（X 圖示鈕之 aria-label 亦為「關閉」，故取最後一個＝頁尾文字鈕）。
    const closes = within(screen.getByRole('dialog')).getAllByRole('button', { name: '關閉' });
    await userEvent.click(closes[closes.length - 1]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByTestId('tree-board-before')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tree-board-after')).not.toBeInTheDocument();
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
