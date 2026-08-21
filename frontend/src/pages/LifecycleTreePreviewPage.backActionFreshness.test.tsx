import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 2／3 項）—— `AC-D3b`／`AC-T19` 之「離開動作」
 * 消費者，是否須於**點擊當下**重新判定 `openedAsPopup()`，而非沿用掛載時之快取值。
 *
 * 🔴 本檔為 team-lead 人工抽查發現之 prototype 偏離，裁決見 mailbox（本人以 oracle 擁有者身分
 * 判定為 (a) 實作偏離，非可接受之未記錄 deviation）——**理由**：
 *
 * 1. **`AC-T19` 明文宣告 `openedAsPopup()` 恰三處消費者**：返回鈕之離開動作（`AC-D3b`）、返回鈕
 *    之標籤／圖示決定（`AC-D3c`）、導向鈕之派送（`AC-T20`／`AC-T21`）——**三個獨立消費點**，
 *    而非「一份快取值供多處共用」。若離開動作與標籤共用同一個掛載時快取值，`AC-T19` 沒有理由
 *    刻意宣告成三處而非兩處。
 * 2. **`AC-D3c` 之「僅於掛載時取樣一次」條文，其本文之①②兩點理由皆專屬「標籤」**（jsdom
 *    `undefined` 誤判、每次 render 重算導致按鈕文字閃爍）——不涉及離開動作之正確性，不足以
 *    推論離開動作也必須共用掛載時快取值。
 * 3. **導向鈕（`AC-T20`／`AC-T22`）已明文要求「點擊當下判定」**（`AC-T22`：「本條要求的是
 *    點擊當下判定 ＋ 派送後記錄」）——離開動作與導向鈕結構上同屬「點擊觸發之行為分支」
 *    （相對於「渲染時決定之標籤」），理應同一套取樣時機。
 * 4. **`prototypes/22-lifecycle-tree-preview.html` 之 `goBack()` 於點擊當下呼叫 `openedAsPopup()`**
 *    （而非讀取 `initBackBtn()` 掛載時快取之值），為本條之權威依據。
 * 5. **`AC-D3c` 本文自身之銜接語意亦支持此讀法**：「行為差異僅出現在舊寫法本來就會出錯的邊界：
 *    opener 曾存在但已被使用者關掉時，舊寫法顯示『關閉預覽』且 `close()` 被瀏覽器拒絕；新寫法
 *    顯示正確之返回標籤並直接導覽」——「新寫法」被形容為結果正確，隱含離開動作本應對「opener
 *    已被關閉」之當下狀態敏感，而非固守一個可能早已過期的掛載時判斷。
 *
 * ⚠ 對實作全盲之限制不適用於本檔——本檔之斷言依據為 AC 文字本身之結構性論證（`AC-T19` 之
 * 「恰三處」與 `AC-T20`/`AC-T22` 之既有明文），與 prototype 之既有明文行為，非讀取
 * production 原始碼決定斷言內容。team-lead 之發現本身即來自其對 `LifecycleTreePreviewPage.tsx`
 * 之閱讀，非本 agent 越界。
 *
 * ⚠ 本檔預期一開始為紅——現行實作以單一掛載時 `useState` 快取值同時驅動標籤與離開動作分支。
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
    nodes: [{ id: 'a1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 1 }],
    edges: [],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-08-21 10:00:00 (UTC+8)',
};
const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 1, updatedAt: '2026-06-18T07:02:00.000Z' },
];

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
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

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
  vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockReturnValue('/dl');
  vi.mocked(endpoints.lifecycleTreePrintUrl).mockReturnValue('/pr');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('🔴 F036 AC-D3b／AC-T19：離開動作須於點擊當下重新判定 openedAsPopup()（非沿用掛載時快取值）', () => {
  it('TS-D3B-FRESH-001 掛載時 opener 可用（標籤＝「關閉預覽」），點擊前 opener 變為已關閉 → 點擊時應導覽而非 close()', async () => {
    // 掛載時：opener 存在、closed=false ⇒ openedAsPopup() 為 true ⇒ 標籤應為「關閉預覽」（AC-D3c）。
    const openerRef: { closed: boolean; location: { href: string }; focus: () => void } = {
      closed: false,
      location: { href: '' },
      focus: vi.fn(),
    };
    vi.stubGlobal('opener', openerRef);
    const close = vi.fn();
    vi.spyOn(window, 'close').mockImplementation(close);

    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    const btn = await screen.findByRole('button', { name: '關閉預覽' });

    // 點擊前，來源分頁被使用者關閉（同一 opener 物件之 closed 由 false 變 true——
    // 模擬「掛載後、點擊前」之真實時序，而非重新 stub 一個新的 global）。
    openerRef.closed = true;

    await userEvent.click(btn);

    // 🔴 核心斷言：離開動作應反映點擊當下之 openedAsPopup()（此刻為 false），
    // 故不得呼叫 window.close()，應改為導覽至 fallback 目標。
    expect(close, '離開動作呼叫了 window.close()——沿用了掛載時之過期快取值，未於點擊當下重新判定').not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/lifecycles'));
  });

  it('📌 正向對照：opener 全程有效（掛載到點擊皆未變） → 點擊「關閉預覽」確實呼叫 window.close()，不導覽', async () => {
    vi.stubGlobal('opener', { closed: false, location: { href: '' }, focus: vi.fn() });
    const close = vi.fn();
    vi.spyOn(window, 'close').mockImplementation(close);

    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    const btn = await screen.findByRole('button', { name: '關閉預覽' });
    await userEvent.click(btn);

    expect(close).toHaveBeenCalledTimes(1);
    // 本分頁未自行導覽——仍在原路徑。
    expect(screen.getByTestId('loc').textContent).toBe('/lifecycles/lc1/tree');
  });
});
