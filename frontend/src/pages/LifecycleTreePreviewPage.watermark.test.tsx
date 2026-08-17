import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';

/**
 * F036 樹狀圖預覽之三層式浮水印 —— 🔒 **綠燈回歸鎖定**（Lane L2）。
 *
 * 權威：
 *  - architecture-spec §10.14：「已存在**正確**參考實作（`LifecycleTreePreviewPage` 之
 *    `watermarkLines()`）；修法應抽為共用函式供三處消費，而非再寫第三、第四份」
 *    ⇒ 本頁改為 `import { watermarkLines } from '../domain/watermark-lines'` 並**刪除本地副本**，
 *      其可觀測行為必須**一字不變**。
 *  - `prototypes/05-public-viewer-watermark.html:106-110`（三層之權威呈現）
 *
 * 📌 **本檔預期一開始就是綠的**（本頁是三個消費者中唯一原本就正確者）。它的價值在於：
 *    L2 把函式搬走時，若搬動過程改了語意（例如少了 `.filter(s => s.trim() !== '')`
 *    或錨點比對方式改變），本檔立刻紅。**不得**因「一開始就綠」而刪除它。
 *
 * 🔒 本檔**不動**既有 `LifecycleTreePreviewPage.test.tsx`／`.subcategory.test.tsx`（屬其他 lane）。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const CONF = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';
const IDENTITY = 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室';
const TIME = '2026-08-16 10:00:00 (UTC+8)';
const WM = `${IDENTITY}-${CONF}-${TIME}`;

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
    nodes: [{ id: 'a1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 2 }],
    edges: [],
  },
  watermark: WM,
};

const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 1, updatedAt: '2026-06-18T07:02:00.000Z' },
];

function renderedLines(el: HTMLElement): string[] {
  if (el.querySelectorAll('br').length > 0) {
    return el.innerHTML
      .split(/<br\s*\/?>/i)
      .map((s) => s.replace(/<[^>]*>/g, '').trim())
      .filter((s) => s !== '');
  }
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length > 0) return kids.map((k) => (k.textContent ?? '').trim()).filter((s) => s !== '');
  return [(el.textContent ?? '').trim()];
}

function renderAt(id = 'lc1') {
  return render(
    <MemoryRouter initialEntries={[`/lifecycles/${id}/tree`]}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('🔒 LifecycleTreePreviewPage 三層式浮水印（§10.14 共用化前後行為必須一字不變）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockReturnValue('/dl');
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockReturnValue('/pr');
  });

  it('每枚浮水印呈現為三行：①身分列 ②機密聲明 ③時間戳', async () => {
    renderAt();
    const texts = await screen.findAllByTestId('watermark-text');
    expect(texts.length).toBeGreaterThan(0);
    for (const el of texts) {
      expect(renderedLines(el)).toEqual([IDENTITY, CONF, TIME]);
    }
  });

  it('缺「處/室」之收合快照同樣拆為三行（§10.14 向量②）', async () => {
    const collapsed = `E001-李慧玲-和潤企業股份有限公司-債權管理部-${CONF}-${TIME}`;
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue({ ...PREVIEW, watermark: collapsed });
    renderAt();
    const el = (await screen.findAllByTestId('watermark-text'))[0];
    expect(renderedLines(el)).toEqual(['E001-李慧玲-和潤企業股份有限公司-債權管理部', CONF, TIME]);
  });

  it('三行以 `-` 接回即為後端回傳之線性快照（純顯示層轉換）', async () => {
    renderAt();
    await waitFor(() => expect(endpoints.getLifecycleTreePreview).toHaveBeenCalled());
    const el = (await screen.findAllByTestId('watermark-text'))[0];
    expect(renderedLines(el).join('-')).toBe(WM);
  });
});
