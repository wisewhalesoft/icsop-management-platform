import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeHistoryPage } from './ChangeHistoryPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  LifecycleChangeView,
  LifecycleView,
  LifecycleTreeDiff,
  SessionUser,
} from '../api/types';

/**
 * F038 #17 三層式浮水印 —— **新舊樹狀圖 diff 預覽**（Lane L2）。
 *
 * 權威：
 *  - F038 檔頭加註 #17（`BUG-IMPL`，**不新增 AC**：既有 AC「浮水印已燒錄於 PDF 內容層（機密聲明
 *    另起一行、比照 F020）」與 Main Flow 4「整頁疊加浮水印（比照 F036 viewer 手法）」已完整涵蓋；
 *    「實作以 `white-space: nowrap` 直接渲染後端之線性字串（本檔全檔無 `watermarkLines` 等價函式），
 *      屬缺陷；修法應**復用 F020 delta 所要求之共用 `watermarkLines()`**，而非再寫一份」）
 *  - `prototypes/05-public-viewer-watermark.html:106-110`（三層之權威呈現）
 *  - architecture-spec §10.14（`ChangeHistoryPage.tsx:851-860` 之 `DiffBoard`；
 *    🔴「**必須同時移除 `whiteSpace: 'nowrap'`** —— 它主動禁止換行，即使拆成三行也會被壓成一行或溢出」）
 *
 * ⚠ 對實作全盲：現況 `DiffBoard` 之 tile 直接渲染 `{watermark}` 線性字串 ⇒ 本檔為預期紅燈。
 *
 * 📌 既有 `ChangeHistoryPage.test.tsx` 之 `TS-LCC-D-008` **不受本條影響、維持不動**：其 fixture 之
 *    `WM` 使用縮寫「僅供內部使用」而非 NFR-007 之完整機密聲明，`watermarkLines()` 找不到錨點時
 *    優雅降級為單行 ⇒ 該案之 `toHaveTextContent(WM)` 仍然成立。本檔另以**完整**聲明之快照驅動。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const CONF = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';
const IDENTITY = '20233-李慧玲-和潤企業股份有限公司-債權管理部-法催一室';
const TIME = '2026-08-16 14:32:08 (UTC+8)';
/** 🔴 與 `frontend/src/domain/watermark-lines.test.ts` 之向量①同型（完整五欄）。 */
const WM = `${IDENTITY}-${CONF}-${TIME}`;

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

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
  id: 'LC-SRC', name: '銷售及收款循環', description: null, status: 'active',
  nodeCount: 5, updatedAt: '2026-07-16T00:00:00.000Z',
};

const node = (id: string, name: string, docCount = 0) => ({
  id, lifecycleId: 'LC-SRC', name, positionX: 0, positionY: 0, docCount,
});

const TREE_DIFF: LifecycleTreeDiff = {
  lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
  before: { nodes: [node('n1', '進件作業', 2)], edges: [] },
  after: { nodes: [node('n1', '進件作業', 2), node('n4', '撥款核准作業', 1)], edges: [{ id: 'e2', sourceNodeId: 'n1', targetNodeId: 'n4' }] },
  diff: { addNodes: ['n4'], rmNodes: [], amberNodes: [], addEdges: [['n1', 'n4']], rmEdges: [] },
  watermark: WM,
};

/** 取出浮水印 tile 所渲染之「行」（接受 `<br>` 或 block 子元素兩種形式）。 */
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

async function openTreePreview(): Promise<void> {
  mockAuth();
  render(<ChangeHistoryPage />);
  await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
  await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /預覽/ }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
}

describe('ChangeHistoryPage · DiffBoard 三層式浮水印（F038 #17）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
    vi.mocked(endpoints.viewLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE] });
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([CYCLE]);
    vi.mocked(endpoints.getLifecycleTreeDiff).mockResolvedValue(TREE_DIFF);
    vi.mocked(endpoints.lifecycleTreeDiffDownloadUrl).mockReturnValue('/x');
  });

  /**
   * 🔴 2026-08-27 第三輪就地改寫：**機密聲明只在正中央出現一次**，tile 只重複兩行。
   * 📝 已作廢（⚠ 不得復原）：OLD> 每枚 tile 斷言 toEqual([IDENTITY, CONF, TIME])。
   */
  it.each(['before', 'after'])(
    '🔴 %s 欄之每枚 tile 呈現為**兩行**（①身分列 ②時間戳），非單行線性字串',
    async (side) => {
      await openTreePreview();
      const overlay = screen.getByTestId(`watermark-overlay-${side}`);
      const tiles = screen.getAllByTestId('watermark-text').filter((t) => overlay.contains(t));
      expect(tiles.length).toBeGreaterThan(0);
      for (const tile of tiles) {
        expect(renderedLines(tile)).toEqual([IDENTITY, TIME]);
      }
    },
  );

  it.each(['before', 'after'])('🔴 %s 欄之機密聲明恰一份、位於正中央', async (side) => {
    await openTreePreview();
    const centre = screen.getByTestId(`watermark-confidentiality-${side}`);
    expect(centre).toHaveTextContent(CONF);
    expect(centre.style.left).toBe('50%');
    expect(centre.style.top).toBe('50%');
  });

  it('🔴 負向回歸鎖：機密聲明不得出現在任何一枚 tile 內', async () => {
    await openTreePreview();
    for (const tile of screen.getAllByTestId('watermark-text')) {
      expect(tile.textContent ?? '').not.toContain(CONF);
    }
  });

  it('🔴 身分列必含員工編號與姓名（#17 之欄位不完整半）', async () => {
    await openTreePreview();
    const tile = screen.getAllByTestId('watermark-text')[0];
    expect(renderedLines(tile)[0]).toContain('20233');
    expect(renderedLines(tile)[0]).toContain('李慧玲');
  });

  it('🔴 §10.14：tile 之 `white-space: nowrap` 不得**單獨**套在承載多行文字之節點上（會壓成一行）', async () => {
    await openTreePreview();
    const tile = screen.getAllByTestId('watermark-text')[0];
    const hasBlockChildren = Array.from(tile.children).length >= 2;
    const hasBr = tile.querySelectorAll('br').length >= 1;
    // nowrap 只有在「已經以 <br> 或 block 子元素明確分行」時才無害（比照 LifecycleTreePreviewPage）。
    if (tile.style.whiteSpace === 'nowrap') {
      expect(hasBlockChildren || hasBr).toBe(true);
    }
    expect(hasBlockChildren || hasBr).toBe(true);
  });

  it('🔒 拆行為純顯示層轉換：tile 兩行與中央聲明接回即為後端回傳之線性快照', async () => {
    await openTreePreview();
    const tile = screen.getAllByTestId('watermark-text')[0];
    const centre = screen.getByTestId('watermark-confidentiality-before').textContent ?? '';
    const [a, b] = renderedLines(tile);
    expect([a, centre, b].join('-')).toBe(WM);
  });

  /**
   * 🔴 2026-08-20 D9 delta（`OQ-D9-01`／`OQ-D9-02`／`OQ-D9-31`）——浮水印加深：色值／不透明度
   * 🔴 2026-08-27 第二輪就地改寫（比照 `reference/企金撥款作業調整.pdf` 之像素量測）：
   * 定稿為中性灰 `#7C7C7C` @ `0.388`（對比度 ≈1.603:1 ≥ `AC-N1` 門檻 1.60；門檻不動）。
   * 📝 OLD> `#475569` @ `0.30`（≈1.613）｜OLD> `#334155` @ `0.30`（≈1.716）。
   * 權威：`docs/specs/features/F020-watermark.md#d9-watermark-delta` `AC-N2`（本頁為表列 4 處
   * 有效載體之一，🔒 `AC-N66` 正向鎖定：本頁渲染 HTML、無內容層可燒錄，疊加層是唯一浮水印載體，
   * 不受 `AC-N7`（僅限 `PublicViewerPage`）影響）。
   * 📝 被推翻之現行值逐字保留供追溯：`#64748B` ＋ `opacity: 0.12`（`ChangeHistoryPage.tsx:992,1000`）。
   * 📌 CSS 慣例參考＝`prototypes/23-change-history.html:34-35`（`.wm-layer{opacity:.30}`／
   *    `.wm-layer span{color:#334155}`）——不臆測實作是否逐字沿用該分佈，故同時檢查疊加層容器
   *    與文字節點兩處之聯集。
   */
  it.each(['before', 'after'])(
    '🔴 %s 欄之浮水印疊加：色值 #7C7C7C（rgb(124, 124, 124)）／不透明度 0.30（AC-N2）',
    async (side) => {
      await openTreePreview();
      const overlay = screen.getByTestId(`watermark-overlay-${side}`);
      const tile = screen.getAllByTestId('watermark-text').filter((t) => overlay.contains(t))[0];
      const opacity = tile.style.opacity || overlay.style.opacity;
      const color = tile.style.color || overlay.style.color;
      expect(opacity, `${side} 欄之不透明度既非疊加層亦非文字節點之 inline style`).toBe('0.3');
      expect(opacity, '📝 已作廢之 0.388 不得殘留').not.toBe('0.388');
      expect(color, `${side} 欄之色值既非疊加層亦非文字節點之 inline style`).toBe('rgb(124, 124, 124)');
      expect(color, '📝 已作廢之 slate-700 不得殘留').not.toBe('rgb(51, 65, 85)');
      expect(color, '📝 已作廢之 slate-600 不得殘留').not.toBe('rgb(71, 85, 105)');
    },
  );

  it('🔒 F038 AC-D3 diff 樹狀圖**不支援節點雙擊**（F036 之能力刻意不擴及本 feature）', async () => {
    await openTreePreview();
    const before = screen.getByTestId('watermark-overlay-before').parentElement as HTMLElement;
    const nodeEl = Array.from(before.querySelectorAll('div')).find(
      (d) => d.textContent?.trim() === '進件作業',
    );
    expect(nodeEl).toBeDefined();
    await userEvent.dblClick(nodeEl as HTMLElement);
    // 仍只有原本那一個 diff 預覽 dialog，不得開出第二個抽屜／彈窗
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(endpoints.getNodeDrawer).not.toHaveBeenCalled();
  });
});
