import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string, name = '李慧玲') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const PREVIEW: LifecycleTreePreview = {
  lifecycle: { id: 'lc1', name: '銷售及收款循環' },
  graph: {
    nodes: [
      { id: 'a1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 2 },
      { id: 'a2', lifecycleId: 'lc1', name: '簽約對保作業', positionX: 0, positionY: 0, docCount: 1 },
      { id: 'a3', lifecycleId: 'lc1', name: '擔保設定作業', positionX: 0, positionY: 0, docCount: 0 },
      { id: 'a4', lifecycleId: 'lc1', name: '撥款核准作業', positionX: 0, positionY: 0, docCount: 1 },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' },
      { id: 'e2', sourceNodeId: 'a1', targetNodeId: 'a3' },
      { id: 'e3', sourceNodeId: 'a2', targetNodeId: 'a4' },
    ],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-23 10:00:00 (UTC+8)',
};

const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 4, updatedAt: '2026-06-18T07:02:00.000Z' },
  { id: 'lc2', name: '採購及付款循環', description: null, status: 'active', nodeCount: 6, updatedAt: '2026-05-05T02:20:00.000Z' },
];

function Probe() {
  const loc = useLocation();
  return (
    <>
      <div data-testid="loc">{loc.pathname}</div>
      {/* F036 `AC-D3`：`?from=` 之保留須以 search 斷言（既有案例僅看 pathname，看不見它消失）。 */}
      <div data-testid="loc-search">{loc.search}</div>
    </>
  );
}

function renderAt(id = 'lc1', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/lifecycles/${id}/tree${search}`]}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

describe('LifecycleTreePreviewPage — F036 循環樹狀圖預覽', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/admin/lifecycles/${id}/tree-preview/download`);
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/admin/lifecycles/${id}/tree-preview/print`);
  });

  it('載入後渲染循環名稱、節點、浮水印字串（伺服器端）', async () => {
    mockAuth('ICSOPAdmin');
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    expect(endpoints.getLifecycleTreePreview).toHaveBeenCalledWith('lc1');
    expect(within(screen.getByTestId('tree-node-a1')).getByText('進件作業')).toBeInTheDocument();
    expect(screen.getByText('掛載 2 份程序書')).toBeInTheDocument();
    expect(screen.getByText('尚未掛載程序書')).toBeInTheDocument();
    // 浮水印疊加 + 底部格式字串（伺服器端一致）
    expect(screen.getAllByTestId('watermark-text').length).toBeGreaterThan(0);
    expect(screen.getByText(PREVIEW.watermark)).toBeInTheDocument();
  });

  it('點節點 → 醒目標示其所有下游、其餘淡化，並顯示標示提示；再點取消', async () => {
    mockAuth('ICSOPAdmin');
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a2')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('tree-node-a2'));
    // a2 選中，a2→a4 為下游 → a4 highlighted；a3（兄弟）非下游 → 未 highlighted
    expect(screen.getByTestId('tree-node-a2').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('tree-node-a4').getAttribute('data-highlighted')).toBe('true');
    expect(screen.getByTestId('tree-node-a3').getAttribute('data-highlighted')).toBe('false');
    expect(screen.getByText(/已標示「簽約對保作業」及其 1 個下游節點/)).toBeInTheDocument();

    // 再點同節點 → 取消
    await userEvent.click(screen.getByTestId('tree-node-a2'));
    expect(screen.getByTestId('tree-node-a2').getAttribute('data-selected')).toBe('false');
    expect(screen.queryByText(/已標示/)).not.toBeInTheDocument();
  });

  it('根節點下游涵蓋全部後代', async () => {
    mockAuth('SysAdmin'); // 🔴 2026-09-02：主管已無循環管理權，唯讀角色改由 SysAdmin 承載
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('tree-node-a1'));
    for (const nid of ['a1', 'a2', 'a3', 'a4']) {
      expect(screen.getByTestId(`tree-node-${nid}`).getAttribute('data-highlighted')).toBe('true');
    }
    expect(screen.getByText(/及其 3 個下游節點/)).toBeInTheDocument();
  });

  it('循環切換器：列出可視循環，切換 → 導向該循環並重新載入', async () => {
    mockAuth('ICSOPAdmin');
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    const sel = screen.getByLabelText('切換循環');
    expect(within(sel).getByRole('option', { name: '採購及付款循環' })).toBeInTheDocument();
    await userEvent.selectOptions(sel, 'lc2');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/lifecycles/lc2/tree'));
    await waitFor(() => expect(endpoints.getLifecycleTreePreview).toHaveBeenCalledWith('lc2'));
  });

  /**
   * 🔴 2026-08-17 缺失修正第 4 項（F036 `AC-D3`）。
   *
   * 本頁有兩個入口（循環管理清單／ICSOP 文件管理清單）且**以 `window.open` 開新分頁**。
   * 原返回鈕硬寫 `/admin/lifecycles` ⇒ 自文件清單進來的人被丟到循環管理頁。
   *
   * 🔴 **第一版修法（僅依 `?from=` 導覽）經使用者指出仍然不對**：在新分頁內導覽回清單，
   * 會留下**與來源一模一樣的第二個清單分頁**，且每看一次樹狀圖就多一個。
   * 定案語意：**預覽分頁的離開＝關閉本分頁**；`?from=` 退居 fallback（直連進入／關閉被拒）。
   *
   * 📌 jsdom 之 `window.opener` 恆為 `null` ⇒ 預設走「導覽」分支；`popup mode` 需明確 stub，
   *    見 `asPopup()`。這也正確反映真實情況：直接貼網址進來的分頁確實沒有 opener。
   */
  describe('F036 AC-D3：預覽分頁之離開語意（關閉優先、導覽為 fallback）', () => {
    /** 模擬「由清單以 window.open 開出」：opener 存在 ＋ 可觀察之 close()。 */
    function asPopup(): { close: ReturnType<typeof vi.fn> } {
      const close = vi.fn();
      vi.stubGlobal('opener', {});
      vi.spyOn(window, 'close').mockImplementation(close);
      return { close };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('TS-F036-D3-001 直連進入（無 opener）、未帶 from → 導覽回循環池', async () => {
      mockAuth('ICSOPAdmin');
      renderAt();
      await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '返回循環池' }));
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/lifecycles'));
    });

    it('TS-F036-D3-002 直連進入 ＋ `?from=documents` → 導覽回文件清單，無障礙名稱同步', async () => {
      mockAuth('ICSOPAdmin');
      renderAt('lc1', '?from=documents');
      await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: '返回循環池' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: '返回文件清單' }));
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/documents'));
    });

    /**
     * 🔒 open-redirect 回歸鎖：`from` 為白名單鍵、**不是**可導覽之網址。
     * 若實作改成 `navigate(from)`，本案之 `//evil.example` 會成為協定相對外部網址。
     */
    it('TS-F036-D3-003 `from` 為未知值／外部網址 → 落預設（循環池），不得據以導覽', async () => {
      mockAuth('ICSOPAdmin');
      renderAt('lc1', '?from=%2F%2Fevil.example');
      await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '返回循環池' }));
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/lifecycles'));
    });

    /**
     * 🔴 最容易漏的一格：切換循環後若不帶走 `from`，fallback 目標會悄悄改回循環池。
     */
    it('TS-F036-D3-004 切換循環後 `from` 仍保留，fallback 目標不變', async () => {
      mockAuth('ICSOPAdmin');
      renderAt('lc1', '?from=documents');
      await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
      await userEvent.selectOptions(screen.getByLabelText('切換循環'), 'lc2');
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/lifecycles/lc2/tree'));
      expect(screen.getByTestId('loc-search').textContent).toBe('?from=documents');
      await userEvent.click(screen.getByRole('button', { name: '返回文件清單' }));
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/documents'));
    });

    /**
     * 🔴 **本案為「無限長出新分頁」之直接回歸鎖**：由清單開出之預覽分頁，其離開動作必須是
     * **關閉本分頁**而非導覽——導覽會留下與來源重複的第二個清單分頁。
     */
    it('TS-F036-D3-005 自清單開出（有 opener）→ 按鈕為「關閉預覽」且呼叫 window.close()，**不導覽**', async () => {
      mockAuth('ICSOPAdmin');
      const { close } = asPopup();
      renderAt('lc1', '?from=documents');
      await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: '返回文件清單' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: '關閉預覽' }));

      expect(close).toHaveBeenCalledTimes(1);
      // 關閉成功時本頁已銷毀 ⇒ 不得同步導覽（否則使用者會看到重複清單一閃而過）。
      expect(screen.getByTestId('loc').textContent).toBe('/lifecycles/lc1/tree');
    });

    /**
     * 極少數瀏覽器拒絕 `window.close()` 之情況：不能讓使用者「按了沒反應」。
     * 逾時後退回 `?from=` 之導覽目標。
     */
    it('TS-F036-D3-006 close() 被瀏覽器拒絕（頁面仍在）→ 逾時後退回 `?from=` 之導覽目標', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        mockAuth('ICSOPAdmin');
        asPopup(); // close() 被 mock 成 no-op ＝ 模擬「呼叫了但分頁沒關掉」
        renderAt('lc1', '?from=documents');
        await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());

        await userEvent.click(screen.getByRole('button', { name: '關閉預覽' }));
        expect(screen.getByTestId('loc').textContent).toBe('/lifecycles/lc1/tree'); // 尚未導覽

        await vi.advanceTimersByTimeAsync(500);
        await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/documents'));
      } finally {
        vi.useRealTimers();
      }
    });
  });

  /**
   * 🔴 2026-08-26 載體遷移：下載／列印由 `<a href>` 改為代理串流。`<a href>` 是 top-level
   * navigation——session 逾時時預覽分頁整頁被後端 401 JSON 取代（真人回報）。端點不變。
   * 📝 已作廢（⚠ 不得復原）：
   *   OLD> expect(screen.getByRole('link', { name: '下載' })).toHaveAttribute('href', '/admin/lifecycles/lc1/tree-preview/download');
   *   OLD> expect(print).toHaveAttribute('href', '/admin/lifecycles/lc1/tree-preview/print');
   *   OLD> expect(print).toHaveAttribute('target', '_blank');
   */
  it('下載／列印走代理串流（非 <a href> 導覽），列印於新分頁開啟', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.downloadLifecycleTree).mockResolvedValue(undefined);
    vi.mocked(endpoints.printLifecycleTree).mockResolvedValue(undefined);
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());

    const download = screen.getByRole('button', { name: '下載' });
    expect(download).not.toHaveAttribute('href');
    await userEvent.click(download);
    await waitFor(() =>
      expect(endpoints.downloadLifecycleTree).toHaveBeenCalledWith('lc1', expect.any(String)),
    );

    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await userEvent.click(screen.getByRole('button', { name: '列印' }));
    await waitFor(() =>
      expect(endpoints.printLifecycleTree).toHaveBeenCalledWith('lc1', expect.anything()),
    );
    // 🔴 分頁必須於 click handler 內、任何 await 之前同步開好（transient user activation）。
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    openSpy.mockRestore();
  });

  it('DeptContact／User → 前端顯示無權限、不呼叫預覽 API', async () => {
    mockAuth('User');
    renderAt();
    await waitFor(() => expect(screen.getByText(/無循環樹狀圖檢視權限/)).toBeInTheDocument());
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getLifecycleTreePreview).not.toHaveBeenCalled();
  });

  it('無節點循環 → 顯示空狀態（非錯誤）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue({
      ...PREVIEW,
      graph: { nodes: [], edges: [] },
    });
    renderAt();
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
    expect(screen.getByText(/尚無任何節點/)).toBeInTheDocument();
  });

  it('預覽 API 403 → 顯示載入失敗（後端強制）', async () => {
    mockAuth('ICSOPAdmin');
    const { ApiError } = await import('../api/client');
    vi.mocked(endpoints.getLifecycleTreePreview).mockRejectedValue(new ApiError(403, 'PERMISSION_DENIED'));
    renderAt();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('PERMISSION_DENIED'));
  });
});
