import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { getSubtreeJumpCalls, resetSubtreeJumpCalls } from './subtree-jump-seam';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 3 項，第二輪「導向方式」裁決）—— 導向鈕之
 * 派送行為（`AC-T20` 主路徑／`AC-T21` 退化路徑／`AC-T22` 可觀測 seam／`AC-T23` opener 已關閉之
 * component 層級回聲）。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md#subtree-drawer-delta`
 *      ＋ `docs/ui-ux-design-overview.md` §A.7.3（`window.__subtreeJumpCalls` 之權威參考形狀）。
 *
 * 🔴 分檔理由（見 `LifecycleTreePreviewPage.subtreeDrawer.test.tsx` 檔頭）：本檔 import 尚不存在
 * 之 `./subtree-jump-seam` 模組，模組解析失敗會拖垮整檔收集，故獨立成檔，不影響抽屜內容/分組
 * 測試之收集與執行。
 *
 * 🔴 seam 模組落點為 test-generator 之命名決定（`AC-T22` 明文「具體形狀由 system-architect 定」，
 * 但 architecture-spec §12.6 承認本題**尚未定案**——本輪環無人等待即需建環，故由 test-generator
 * 先行拍板，供 tdd-implementation 對齊或申訴）：`frontend/src/pages/subtree-jump-seam.ts`，
 * 匯出 `recordSubtreeJump(call)`／`getSubtreeJumpCalls()`／`resetSubtreeJumpCalls()`，
 * `call` 形狀為 `{ mode: 'opener'|'self'; href: string; appHref: string; closedSelf: boolean }`
 * ——逐字比照 `AC-T22` 本文與 prototype `window.__subtreeJumpCalls` 之參考形狀，**不得掛 window**。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`./subtree-jump-seam` 模組尚不存在。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name: '李慧玲' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const PREVIEW: LifecycleTreePreview = {
  lifecycle: { id: 'lc1', name: '銷售及收款循環' },
  graph: {
    nodes: [{ id: 'r', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 1 }],
    edges: [],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-08-21 10:00:00 (UTC+8)',
};
const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 1, updatedAt: '2026-06-18T07:02:00.000Z' },
];
const SUBTREE = {
  nodeId: 'r',
  totalCount: 1,
  groups: [{ nodeId: 'r', nodeName: '進件作業', documents: [{
    id: 'd1', documentNumber: 'ICSOP-A', documentName: 'ICSOP-A 作業',
    edition: '1.0', status: 'active' as const, announcedDate: '2026-06-01T00:00:00.000Z',
  }] }],
};
const EXPECTED_HREF = '/admin/documents?lifecycleId=lc1&nodeSubtreeId=r';

function Probe() {
  const loc = useLocation();
  return (
    <>
      <div data-testid="loc">{loc.pathname}</div>
      <div data-testid="loc-search">{loc.search}</div>
    </>
  );
}

function renderAt(id = 'lc1') {
  return render(
    <MemoryRouter initialEntries={[`/lifecycles/${id}/tree`]}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

async function openDrawerAndGetJumpBtn(): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getByTestId('tree-node-r')).toBeInTheDocument());
  await userEvent.dblClick(screen.getByTestId('tree-node-r'));
  await waitFor(() => expect(screen.queryByLabelText(/在文件管理中檢視這 \d+ 份程序書/)).not.toBeNull());
  return screen.getByLabelText(/在文件管理中檢視這 \d+ 份程序書/);
}

beforeEach(() => {
  vi.resetAllMocks();
  resetSubtreeJumpCalls();
  mockAuth();
  vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
  vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockReturnValue('/dl');
  vi.mocked(endpoints.lifecycleTreePrintUrl).mockReturnValue('/pr');
  vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue(SUBTREE);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('🔴 F036 AC-T20 導向 · 主路徑：openedAsPopup() 為 true → 導回 opener 分頁並自關', () => {
  it('TS-T20-F01 依序：① opener.location.href 設為 appHref ② opener.focus() 恰 1 次 ③ window.close() 恰 1 次；本分頁不自行導覽', async () => {
    const focus = vi.fn();
    const close = vi.fn();
    vi.stubGlobal('opener', { closed: false, location: { href: '' }, focus });
    vi.spyOn(window, 'close').mockImplementation(close);

    renderAt();
    const btn = await openDrawerAndGetJumpBtn();
    await userEvent.click(btn);

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect((window.opener as { location: { href: string } }).location.href).toBe(EXPECTED_HREF);
    expect(focus).toHaveBeenCalledTimes(1);
    // 本分頁未自行導覽——仍在 /lifecycles/lc1/tree
    expect(screen.getByTestId('loc').textContent).toBe('/lifecycles/lc1/tree');
  });
});

describe('🔴 F036 AC-T21 導向 · 退化路徑：openedAsPopup() 為 false → 同分頁 navigate 且不得自關', () => {
  it('TS-T21-F01 無 opener（直連）→ 本分頁導覽至 appHref，window.close() 呼叫次數恆為 0', async () => {
    vi.stubGlobal('opener', null);
    const close = vi.fn();
    vi.spyOn(window, 'close').mockImplementation(close);

    renderAt();
    const btn = await openDrawerAndGetJumpBtn();
    await userEvent.click(btn);

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/documents'));
    expect(screen.getByTestId('loc-search').textContent).toBe('?lifecycleId=lc1&nodeSubtreeId=r');
    expect(close).not.toHaveBeenCalled();
  });
});

describe('🔴 F036 AC-T22 可觀測 seam：每次派送恰新增一筆 { mode, href, appHref, closedSelf }', () => {
  it('TS-T22-F01 主路徑 → seam 恰新增一筆，mode="opener"、appHref 逐字相符、closedSelf=true', async () => {
    vi.stubGlobal('opener', { closed: false, location: { href: '' }, focus: vi.fn() });
    vi.spyOn(window, 'close').mockImplementation(vi.fn());

    renderAt();
    const btn = await openDrawerAndGetJumpBtn();
    await userEvent.click(btn);

    await waitFor(() => expect(getSubtreeJumpCalls()).toHaveLength(1));
    const [call] = getSubtreeJumpCalls();
    expect(call.mode).toBe('opener');
    expect(call.appHref).toBe(EXPECTED_HREF);
    expect(call.closedSelf).toBe(true);
  });

  it('TS-T22-F02 🔴 退化路徑 → seam 恰新增一筆，mode="self"、closedSelf 必為 false（AC-T21 之硬性斷言）', async () => {
    vi.stubGlobal('opener', null);
    vi.spyOn(window, 'close').mockImplementation(vi.fn());

    renderAt();
    const btn = await openDrawerAndGetJumpBtn();
    await userEvent.click(btn);

    await waitFor(() => expect(getSubtreeJumpCalls()).toHaveLength(1));
    const [call] = getSubtreeJumpCalls();
    expect(call.mode).toBe('self');
    expect(call.closedSelf).toBe(false);
    expect(call.appHref).toBe(EXPECTED_HREF);
  });
});

describe('🔴 F036 AC-T23 component 層級回聲：opener.closed === true 走退化路徑（不得誤判為 popup）', () => {
  /**
   * 本案為 `opened-as-popup.test.ts` 之獨立單元測試在元件整合層級的回聲——證明
   * `LifecycleTreePreviewPage` 之導向鈕確實消費 `openedAsPopup()` 而非自行以
   * `Boolean(window.opener)` 之類的舊寫法判斷（舊寫法會把「opener 已關閉」誤判為 popup）。
   */
  it('TS-T23-F01 opener 存在但 closed=true → 視同無 popup：本分頁導覽、close() 0 次、seam mode="self"', async () => {
    vi.stubGlobal('opener', { closed: true });
    const close = vi.fn();
    vi.spyOn(window, 'close').mockImplementation(close);

    renderAt();
    const btn = await openDrawerAndGetJumpBtn();
    await userEvent.click(btn);

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/documents'));
    expect(close).not.toHaveBeenCalled();
    const [call] = getSubtreeJumpCalls();
    expect(call.mode).toBe('self');
    expect(call.closedSelf).toBe(false);
  });
});
