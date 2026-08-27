import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';
import { WATERMARK_FONT_SIZE } from '../domain/watermark-style';

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

  /**
   * 🔴 2026-08-20 D9 delta（`OQ-D9-01`／`OQ-D9-02`／`OQ-D9-31`）——浮水印加深：色值／不透明度
   * 定稿為 `#334155` @ `0.30`。權威：`docs/specs/features/F020-watermark.md#d9-watermark-delta`
   * `AC-N2`（本頁為表列 4 處有效載體之一，🔒 `AC-N66` 正向鎖定：本頁渲染 HTML DAG 節點、
   * 無內容層可燒錄，疊加層是唯一浮水印載體，不受 `AC-N7`——僅限 `PublicViewerPage`——影響）。
   * 🔴 2026-08-27 就地改寫（使用者裁決 UX ①「顏色淡一點點」）：色值 slate-700 → **slate-600**
   *    （`#475569`，對比度 ≈1.613 ≥ 就地下修後之 `AC-N1` 門檻 1.60）；不透明度 `0.30` 不動。
   * 📝 被推翻之值逐字保留供追溯：OLD> `#334155`（slate-700）｜OLD> `#64748B` ＋ `opacity: 0.12`。
   * 📌 CSS 慣例參考＝`prototypes/22-lifecycle-tree-preview.html:46-47`
   *    （`.wm-layer{opacity:.30}`／`.wm-layer span{color:#334155}`）——同時檢查疊加層容器與
   *    文字節點兩處之聯集，不臆測實作是否逐字沿用該分佈。
   */
  it('🔴 浮水印疊加：色值 #475569（rgb(71, 85, 105)）／不透明度 0.30（AC-N2）', async () => {
    renderAt();
    const overlay = await screen.findByTestId('watermark-overlay');
    const tile = (await screen.findAllByTestId('watermark-text'))[0];
    const opacity = tile.style.opacity || overlay.style.opacity;
    const color = tile.style.color || overlay.style.color;
    expect(opacity, '不透明度既非疊加層亦非文字節點之 inline style').toBe('0.3');
    expect(color, '色值既非疊加層亦非文字節點之 inline style').toBe('rgb(71, 85, 105)');
    expect(color, '📝 已作廢之 slate-700 不得殘留').not.toBe('rgb(51, 65, 85)');
  });
});

/**
 * 🔴 2026-08-27 使用者裁決 —— UX ①（字級放大）與 UX ②（疊加層滿版）於**本頁 DOM** 之落地契約。
 *
 * 幾何本身之數學在 `frontend/src/domain/watermark-overlay-geometry.test.ts`（純函式、可餵極寬畫板）；
 * 本區塊只釘「頁面確實用了那套幾何」——兩者缺一，都會讓「函式算對了但頁面沒接線」這種
 * 本 repo 已踩過的缺陷形狀重演。
 */
describe('🔴 UX ①／② —— 浮水印疊加層之字級與滿版幾何（LifecycleTreePreviewPage）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockReturnValue('/dl');
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockReturnValue('/pr');
  });

  it('UX ①：tile 字級取自具名常數 WATERMARK_FONT_SIZE（16px；OLD> 14px 之字面值）', async () => {
    renderAt();
    const tile = (await screen.findAllByTestId('watermark-text'))[0];
    expect(tile.style.fontSize).toBe(`${WATERMARK_FONT_SIZE}px`);
    expect(tile.style.fontSize, '📝 已作廢之 14px 不得殘留').not.toBe('14px');
  });

  it('🔴 UX ②：疊加層為正方形、且自行裁切溢出（不得再以 inset 撐開）', async () => {
    renderAt();
    const overlay = await screen.findByTestId('watermark-overlay');
    expect(overlay.style.width).not.toBe('');
    expect(overlay.style.width).toBe(overlay.style.height);
    expect(overlay.style.overflow).toBe('hidden');
    expect(overlay.style.transform).toBe('rotate(-45deg)');
  });

  it('🔴 UX ② 負向回歸鎖：不得復原 inset:-40% ＋ flex-wrap 置中之舊寫法', async () => {
    renderAt();
    const overlay = await screen.findByTestId('watermark-overlay');
    expect(overlay.style.inset).toBe('');
    expect(overlay.style.alignContent).not.toBe('center');
    expect(overlay.style.flexWrap).not.toBe('wrap');
  });
});
