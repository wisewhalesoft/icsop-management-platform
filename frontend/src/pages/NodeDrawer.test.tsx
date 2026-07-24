import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeDrawer } from './NodeDrawer';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import type { NodeDrawerData } from '../api/types';

vi.mock('../api/endpoints');

const DRAWER: NodeDrawerData = {
  node: { id: 'n1', name: '進件作業' },
  mounted: [{ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }],
  candidates: [
    { id: 'd2', documentNumber: 'ICSOP-SRC-101-1-03', documentName: '電銷進件作業', assignedNode: null },
    {
      id: 'd3',
      documentNumber: 'ICSOP-SRC-102-1-01',
      documentName: '車輛分期對保作業',
      assignedNode: { id: 'n2', name: '簽約對保作業' },
    },
  ],
};

function renderDrawer(canWrite = true, cycleName?: string) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const onNodeRenamed = vi.fn();
  render(
    <ToastProvider>
      <NodeDrawer
        lifecycleId="lc1"
        nodeId="n1"
        canWrite={canWrite}
        cycleName={cycleName}
        onClose={onClose}
        onChanged={onChanged}
        onNodeRenamed={onNodeRenamed}
      />
    </ToastProvider>,
  );
  return { onClose, onChanged, onNodeRenamed };
}

describe('NodeDrawer — F009 節點抽屜（文件掛載）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getNodeDrawer).mockResolvedValue(DRAWER);
    vi.mocked(endpoints.mountNodeDoc).mockResolvedValue(undefined);
    vi.mocked(endpoints.unmountNodeDoc).mockResolvedValue(undefined);
    vi.mocked(endpoints.updateDagNode).mockResolvedValue({
      id: 'n1', lifecycleId: 'lc1', name: 'x', positionX: 0, positionY: 0,
    });
  });

  it('載入後顯示節點名稱、已掛載與候選文件', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByLabelText('節點名稱')).toHaveValue('進件作業'));
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument(); // 已掛載
    expect(screen.getByText('ICSOP-SRC-101-1-03')).toBeInTheDocument(); // 候選（未掛載）
    expect(screen.getByText('已掛載於 簽約對保作業')).toBeInTheDocument(); // 候選（他節點）
  });

  it('掛載未掛載候選 → 儲存送出 mountNodeDoc(confirm=false)', async () => {
    const user = userEvent.setup();
    const { onChanged, onClose } = renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-101-1-03')).toBeInTheDocument());
    await user.click(screen.getByText('ICSOP-SRC-101-1-03'));
    await user.click(screen.getByRole('button', { name: '儲存並關閉' }));
    await waitFor(() => expect(endpoints.mountNodeDoc).toHaveBeenCalledWith('lc1', 'n1', 'd2', false));
    expect(endpoints.updateDagNode).not.toHaveBeenCalled(); // 名稱未改
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('點他節點文件出現改派警示；確認改派後儲存送出 mountNodeDoc(confirm=true)', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-102-1-01')).toBeInTheDocument());
    await user.click(screen.getByText('ICSOP-SRC-102-1-01'));
    expect(await screen.findByText('NODE_DOC_ALREADY_ASSIGNED')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '確認改派' }));
    await user.click(screen.getByRole('button', { name: '儲存並關閉' }));
    await waitFor(() => expect(endpoints.mountNodeDoc).toHaveBeenCalledWith('lc1', 'n1', 'd3', true));
  });

  it('有未確認改派警示時阻擋儲存', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-102-1-01')).toBeInTheDocument());
    await user.click(screen.getByText('ICSOP-SRC-102-1-01'));
    await user.click(screen.getByRole('button', { name: '儲存並關閉' }));
    expect(await screen.findByText(/改派警示/)).toBeInTheDocument();
    expect(endpoints.mountNodeDoc).not.toHaveBeenCalled();
  });

  it('移除已掛載文件 → 儲存送出 unmountNodeDoc', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '移除掛載' }));
    await user.click(screen.getByRole('button', { name: '儲存並關閉' }));
    await waitFor(() => expect(endpoints.unmountNodeDoc).toHaveBeenCalledWith('lc1', 'n1', 'd1'));
  });

  it('改節點名稱 → 即時反映畫布並於儲存送出 updateDagNode', async () => {
    const user = userEvent.setup();
    const { onNodeRenamed } = renderDrawer();
    await waitFor(() => expect(screen.getByLabelText('節點名稱')).toHaveValue('進件作業'));
    const input = screen.getByLabelText('節點名稱');
    await user.clear(input);
    await user.type(input, '進件審核作業');
    expect(onNodeRenamed).toHaveBeenCalledWith('n1', '進件審核作業'); // 即時反映
    await user.click(screen.getByRole('button', { name: '儲存並關閉' }));
    await waitFor(() =>
      expect(endpoints.updateDagNode).toHaveBeenCalledWith('lc1', 'n1', { name: '進件審核作業' }),
    );
  });

  it('唯讀角色：名稱唯讀、無「儲存並關閉」', async () => {
    renderDrawer(false);
    await waitFor(() => expect(screen.getByLabelText('節點名稱')).toHaveAttribute('readonly'));
    expect(screen.queryByRole('button', { name: '儲存並關閉' })).not.toBeInTheDocument();
  });

  // ===== prototype-alignment G-LC-015/016/018（prototypes/12-node-drawer.html）=====
  it('G-LC-015 候選過濾註記顯示循環名稱與 excludedCount', async () => {
    vi.mocked(endpoints.getNodeDrawer).mockResolvedValue({ ...DRAWER, excludedCount: 3 });
    renderDrawer(true, '銷售及收款循環');
    await waitFor(() => expect(screen.getByText(/已排除其他循環 3 筆/)).toBeInTheDocument());
    expect(screen.getByText('銷售及收款循環')).toBeInTheDocument();
  });

  it('G-LC-016 footer 提示為「關閉即送出變更」', async () => {
    renderDrawer(true);
    await waitFor(() => expect(screen.getByLabelText('節點名稱')).toHaveValue('進件作業'));
    expect(screen.getByText('關閉即送出變更')).toBeInTheDocument();
  });

  it('G-LC-018 抽屜具滑入動畫（transition-transform，掛載後 translate-x-0）', async () => {
    renderDrawer(true);
    const aside = screen.getByRole('dialog', { name: '節點維護' });
    expect(aside.className).toContain('transition-transform');
    await waitFor(() => expect(aside.className).toContain('translate-x-0'));
  });
});
