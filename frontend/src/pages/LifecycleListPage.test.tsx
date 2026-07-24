import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LifecycleListPage } from './LifecycleListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SessionUser, LifecycleView } from '../api/types';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}
const renderWithLoc = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <LifecycleListPage />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 7, updatedAt: '2026-06-18T07:02:00.000Z' },
  { id: 'lc2', name: '採購及付款循環', description: null, status: 'inactive', nodeCount: 1, updatedAt: '2026-05-05T02:20:00.000Z' },
];

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter><LifecycleListPage /></MemoryRouter>
    </ToastProvider>,
  );

describe('LifecycleListPage — F007 循環池', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  });

  it('載入後渲染循環列（名稱、節點數）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    expect(screen.getByText('採購及付款循環')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('ICSOPAdmin 顯示新增與列操作', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /新增循環/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '編輯' }).length).toBeGreaterThan(0);
  });

  it('Supervisor 唯讀：無新增、無編輯、顯示唯讀說明', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /新增循環/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '編輯' })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('新增循環：填名稱送出 → createLifecycle', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createLifecycle).mockResolvedValue(LCS[0]);
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /新增循環/ }));
    const dialog = screen.getByRole('dialog', { name: /新增循環/ });
    await userEvent.type(within(dialog).getByLabelText(/循環名稱/), '融資循環');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(endpoints.createLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ name: '融資循環' }),
      ),
    );
  });

  it('名稱空白 → 前端擋下、不呼叫 createLifecycle', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /新增循環/ }));
    const dialog = screen.getByRole('dialog', { name: /新增循環/ });
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(endpoints.createLifecycle).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/名稱不可為空/)).toBeInTheDocument();
  });

  it('刪除仍有掛載 → 顯示 LIFECYCLE_HAS_DOCUMENTS 提示', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.deleteLifecycle).mockRejectedValue(new ApiError(409, 'LIFECYCLE_HAS_DOCUMENTS'));
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    const row = screen.getByText('銷售及收款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '刪除' }));
    const dialog = screen.getByRole('dialog', { name: /刪除循環/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /確認/ }));

    await waitFor(() => expect(screen.getByText(/需先解除全部/)).toBeInTheDocument());
  });

  it('停用切換 → setLifecycleStatus', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.setLifecycleStatus).mockResolvedValue({ ...LCS[0], status: 'inactive' });
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    const row = screen.getByText('銷售及收款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '停用' }));
    await waitFor(() => expect(endpoints.setLifecycleStatus).toHaveBeenCalledWith('lc1', 'inactive'));
  });

  // ===== F007 收尾（a）新增 → 導向 DAG 畫布編輯頁 =====
  it('新增循環成功 → 導向該循環 DAG 畫布（F007 AC）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createLifecycle).mockResolvedValue({
      id: 'lcNew', name: '融資循環', description: null, status: 'active', nodeCount: 0, updatedAt: '2026-07-23T00:00:00.000Z',
    });
    renderWithLoc();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /新增循環/ }));
    const dialog = screen.getByRole('dialog', { name: /新增循環/ });
    await userEvent.type(within(dialog).getByLabelText(/循環名稱/), '融資循環');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/lifecycles/lcNew/canvas'));
  });

  it('編輯循環成功 → 不導向（留在清單並重載）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.updateLifecycle).mockResolvedValue({ ...LCS[0], name: '銷售及收款循環（改）' });
    renderWithLoc();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    const row = screen.getByText('銷售及收款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯循環/ });
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(endpoints.updateLifecycle).toHaveBeenCalled());
    expect(screen.getByTestId('loc').textContent).toBe('/');
  });

  // ===== F036 入口（1）循環清單樹狀圖圖示 =====
  it('每列樹狀圖圖示 → 開新分頁至 viewer 路由（唯讀，讀權即可見）', async () => {
    mockAuth('Supervisor'); // 唯讀角色亦可見樹狀圖入口
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /檢視「銷售及收款循環」樹狀圖預覽/ }));
    expect(openSpy).toHaveBeenCalledWith('/lifecycles/lc1/tree', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  // ===== prototype-alignment G-LC-001..006 + SYS-1 toast（prototypes/10-lifecycle-list.html）=====
  it('G-LC-001 唯讀 banner 使用 eye 圖示（非 user-circle）', async () => {
    mockAuth('Supervisor');
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
    expect(container.querySelector('.lucide-eye')).toBeTruthy();
    // lucide 1.25：user-circle 別名渲染為 circle-user；確認已非該圖示。
    expect(container.querySelector('.lucide-circle-user')).toBeNull();
  });

  it('G-LC-002 掛載文件欄消費 mountedDocCount（N 份 / —）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([
      { ...LCS[0], mountedDocCount: 8 },
      { ...LCS[1], mountedDocCount: 0 },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('8 份')).toBeInTheDocument());
    const row = screen.getByText('採購及付款循環').closest('tr')!;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('G-LC-003 空狀態顯示 inbox 圖示', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([]);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('查無符合結果')).toBeInTheDocument());
    expect(container.querySelector('.lucide-inbox')).toBeTruthy();
  });

  it('G-LC-004 搜尋框為 flex-1（非固定 w-56）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    const wrap = screen.getByLabelText('搜尋循環名稱').closest('div')!;
    expect(wrap.className).toContain('flex-1');
    expect(screen.getByLabelText('搜尋循環名稱').className).not.toContain('w-56');
  });

  it('G-LC-005 名稱必填錯誤顯示 alert-circle 圖示', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /新增循環/ }));
    const dialog = screen.getByRole('dialog', { name: /新增循環/ });
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(within(dialog).getByText(/名稱不可為空/)).toBeInTheDocument();
    // lucide 1.25：alert-circle 別名渲染為 circle-alert。
    expect(container.querySelector('.lucide-circle-alert')).toBeTruthy();
  });

  it('G-LC-006 刪除確認（無掛載）文案對齊 F007', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([{ ...LCS[0], mountedDocCount: 0 }]);
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    const row = screen.getByText('銷售及收款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '刪除' }));
    const dialog = screen.getByRole('dialog', { name: /刪除循環/ });
    expect(within(dialog).getByText(/此循環已無文件掛載，刪除後將記錄稽核（不可復原）。/)).toBeInTheDocument();
  });

  it('SYS-1 編輯成功 → 顯示成功 toast（非 inline banner）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.updateLifecycle).mockResolvedValue({ ...LCS[0] });
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環')).toBeInTheDocument());
    const row = screen.getByText('銷售及收款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯循環/ });
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(screen.getByText('已儲存循環')).toBeInTheDocument());
  });
});
