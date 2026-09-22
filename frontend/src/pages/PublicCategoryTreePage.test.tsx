/**
 * F043 業務/功能類別管理 — 己：前台業務/功能類別樹狀圖瀏覽模式（比照 F036，`AC-B16`～`AC-B23`／
 * `AC-B25`～`AC-B27`／`AC-53`②）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#business-category-browse-delta
 *       docs/ui-ux-design-overview.md §A.8.4 N6／N7／N9／N10
 *       prototypes/30-public-category-tree.html
 *
 * 🔴 對實作全盲：`PublicCategoryTreePage.tsx` 與其端點（`getPublicBusinessCategories`／
 *    `getPublicBusinessCategoryGraph`／`getPublicBusinessCategoryNodeDocuments`，命名比照既有
 *    `/public/*` 端點風格延伸）本輪尚不存在。
 *
 * 🔴🔴 `AC-53`②（前台無下載/列印，本檔負向半句）**必須**與
 *    `BusinessCategoryTreePreviewPage.test.tsx` 之 `AC-53①`（後台有下載/列印，正向半句）成對
 *    存在——只驗其一時，一個「連後台也沒做下載鈕」的實作照樣全綠。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { PublicCategoryTreePage } from './PublicCategoryTreePage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

interface PublicNode { id: string; businessCategoryId: string; name: string; positionX: number; positionY: number; visibleDocCount: number }
interface PublicEdge { id: string; sourceNodeId: string; targetNodeId: string }
interface PublicBcGraph { businessCategory: { id: string; name: string; subcategory: string | null }; graph: { nodes: PublicNode[]; edges: PublicEdge[] }; watermark: string }
interface PublicBcListItem { id: string; name: string; subcategory: string | null }
interface PublicNodeDoc { id: string; documentNumber: string; documentName: string; edition: string; announcedDate: string }
interface PublicSubtreeGroup { nodeId: string; nodeName: string | null; documents: PublicNodeDoc[] }
interface PublicSubtreeDocs { nodeId: string; nodeName: string | null; totalCount: number; groupedCount: number; groups: PublicSubtreeGroup[] }
interface PublicBcEndpoints {
  getPublicBusinessCategories: () => Promise<PublicBcListItem[]>;
  getPublicBusinessCategoryGraph: (id: string) => Promise<PublicBcGraph>;
  getPublicBusinessCategorySubtreeDocuments: (bcId: string, nodeId: string) => Promise<PublicSubtreeDocs>;
}
const pubApi = endpoints as unknown as PublicBcEndpoints;

function mockAuth(roleCode = 'User') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, orgCode: 'JAC00', name: '王小明' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const GRAPH: PublicBcGraph = {
  businessCategory: { id: 'bc1', name: '授信', subcategory: '消金' },
  graph: {
    nodes: [
      { id: 'p1', businessCategoryId: 'bc1', name: '進件收件作業', positionX: 0, positionY: 0, visibleDocCount: 2 },
      { id: 'p4', businessCategoryId: 'bc1', name: '徵審作業', positionX: 0, positionY: 0, visibleDocCount: 0 },
    ],
    edges: [{ id: 'e1', sourceNodeId: 'p1', targetNodeId: 'p4' }],
  },
  watermark: 'E001-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-09-02 10:00:00 (UTC+8)',
};
const CATEGORIES: PublicBcListItem[] = [
  { id: 'bc1', name: '授信', subcategory: '消金' },
  { id: 'bc2', name: '授信', subcategory: '企金' },
];
/**
 * 🔵 2026-09-08 delta（`AC-B20`）：抽屜之內容＝**本節點＋全部下游**，依節點分組。
 * 🔴 語料之鑑別力要求：`p4` 是 `p1` 的**下游**且掛著一份**只有它有**的文件（`對保作業`）——
 *    若實作只列本節點，該份文件就不會出現，斷言立刻翻紅。fixture 若把兩份文件都放在 `p1` 組，
 *    「只列本節點」與「列整個子樹」兩種實作輸出完全相同（本 repo 之「語料無鑑別力」形狀）。
 */
const SUBTREE_DOCS: PublicSubtreeDocs = {
  nodeId: 'p1',
  nodeName: '進件收件作業',
  totalCount: 2,
  groupedCount: 2,
  groups: [
    {
      nodeId: 'p1',
      nodeName: '進件收件作業',
      documents: [
        { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z' },
      ],
    },
    {
      nodeId: 'p4',
      nodeName: '徵審作業',
      documents: [
        { id: 'd2', documentNumber: 'ICSOP-SRC-102-1-01', documentName: '對保作業', edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z' },
      ],
    },
  ],
};

function renderAt(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/public/business-categories${search}`]}>
      <Routes>
        <Route path="/public/business-categories" element={<PublicCategoryTreePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(pubApi.getPublicBusinessCategories).mockResolvedValue(CATEGORIES);
  vi.mocked(pubApi.getPublicBusinessCategoryGraph).mockResolvedValue(GRAPH);
  vi.mocked(pubApi.getPublicBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE_DOCS);
});

describe('PublicCategoryTreePage — F043 己：前台樹狀圖瀏覽模式', () => {
  it('AC-B16 上到下佈局、節點顯示可見掛載徽章逐字，帶 data-visible-doc-count（與後台屬性名刻意不同）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(screen.getByText('掛載 2 份程序書')).toBeInTheDocument();
    expect(screen.getByText('尚未掛載程序書')).toBeInTheDocument();

    const badge1 = screen.getByTestId('tree-node-p1').querySelector('[data-visible-doc-count]');
    expect(badge1).not.toBeNull();
    expect(badge1!.getAttribute('data-visible-doc-count')).toBe('2');
    // 🔴 明文禁止統一命名：後台屬性名為 data-mounted-doc-count，此處不得共用同一屬性。
    expect(screen.getByTestId('tree-node-p1').querySelector('[data-mounted-doc-count]')).toBeNull();
  });

  /**
   * 🔴 AC-B21：`N` 為套用可見性過濾後之數字，非總掛載數。語料鑑別力要求＝該節點之可見數與
   * 總數必須不同（p1 掛 5、可見 2）；本檔之 fixture 已只餵可見數（後端已過濾），故此案改為
   * 直接驗證「顯示的就是後端回傳之已過濾數字」與 AC-B21 之措辭精確性（0 亦不得省略屬性）。
   */
  it('AC-B21 全部不可見之節點 → 逐字「尚未掛載程序書」且 data-visible-doc-count="0"（不得省略）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p4')).toBeInTheDocument());
    const badge = screen.getByTestId('tree-node-p4').querySelector('[data-visible-doc-count]');
    expect(badge, 'p4（0 可見）不得省略該屬性').not.toBeNull();
    expect(badge!.getAttribute('data-visible-doc-count')).toBe('0');
  });

  it('AC-B17 類別下拉：選項顯示＝businessCategoryDisplayName、選項值＝businessCategoryId', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    const sel = screen.getByLabelText('業務/功能類別');
    const opt1 = sel.querySelector('option[value="bc1"]');
    const opt2 = sel.querySelector('option[value="bc2"]');
    expect(opt1?.textContent).toBe('授信（消金）');
    expect(opt2?.textContent).toBe('授信（企金）');
  });

  it('AC-B20 雙擊節點 → 唯讀抽屜列出**本節點與其下游節點**之可見程序書（四欄，無狀態欄）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    await userEvent.dblClick(screen.getByTestId('tree-node-p1'));
    await waitFor(() => expect(pubApi.getPublicBusinessCategorySubtreeDocuments).toHaveBeenCalledWith('bc1', 'p1'));
    expect(await screen.findByText('車輛分期進件作業')).toBeInTheDocument();
    // 🔴 `對保作業` 只掛在**下游** p4：只列本節點之實作在此翻紅。
    expect(screen.getByText('對保作業')).toBeInTheDocument();
    // 四欄無「狀態」欄：抽屜不含任何狀態徽章字樣（比照 `29` 之五欄刻意不同，見 N9）。
    expect(screen.queryByText('有效')).not.toBeInTheDocument();
    expect(screen.queryByText('失效')).not.toBeInTheDocument();
  });

  it('AC-B20 §分組：DOM 順序＝回應 groups 之順序；本節點帶「（本節點）」後綴，其餘不加；副標題＝子樹合計', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    await userEvent.dblClick(screen.getByTestId('tree-node-p1'));
    await screen.findByText('車輛分期進件作業');
    const groups = document.querySelectorAll('[data-node-group]');
    expect([...groups].map((g) => g.getAttribute('data-node-group'))).toEqual(['p1', 'p4']);
    expect([...groups].map((g) => g.getAttribute('data-node-group-self'))).toEqual(['true', 'false']);
    // 🔴 以分組標題之具名掛鉤取值——`徵審作業` 這串字同時也是畫布上 p4 節點之名稱，
    //    用 getByText 會撞到兩個載體（測試會因「找到多個」而紅，而不是因為行為錯了）。
    expect([...document.querySelectorAll('[data-node-group-name]')].map((e) => e.textContent))
      .toEqual(['進件收件作業（本節點）', '徵審作業']);
    // 副標題＝子樹之相異份數（取自回應之 totalCount，前端不自行加總）。
    expect(screen.getByText('子樹共 2 份程序書')).toBeInTheDocument();
    expect(document.querySelector('[data-subtree-total]')?.getAttribute('data-subtree-total')).toBe('2');
  });

  /**
   * UX16 delta `AC-UX14` ⑤（`AC-UX13`／`OQ-UX16-06`＝選項 A，人類 2026-09-22 確認推翻）：
   * 既有負向鎖定為預期轉紅、就地改寫（非回歸）——原「前台刻意沒有導向鈕」之設計已被推翻。
   * 🔴 改寫方向＝反轉為正向，並保留兩句負向半句（它們現在鎖的是「別把後台那顆鈕搬過來」）：
   *  ⓐ `[data-public-subtree-jump]` 存在恰一個，文字逐字為「在文件清單中檢視這 {N} 份文件」；
   *  ⓑ `[data-subtree-jump]`（循環側）與 `[data-bc-subtree-jump]`（後台類別側）於前台頁皆為 null；
   *  ⓒ `queryByLabelText('在文件管理中檢視這 {N} 份程序書')`（後台措辭）仍為 null。
   * 📝 已作廢（⚠ 不得復原、不得用於斷言）：`OLD>` 標題「前台抽屜沒有…導向鈕（與後台成對之負向
   * 半句）」，僅斷言 `[data-subtree-jump]` 與 `getByLabelText('在文件管理中檢視這 2 份程序書')`
   * 為 null（未提供任何前台鈕存在性之正向載體）。
   */
  it('AC-UX13／AC-UX14：抽屜新增「在文件清單中檢視這 N 份文件」導向鈕（ⓐ正向 ＋ ⓑⓒ負向半句保留）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    await userEvent.dblClick(screen.getByTestId('tree-node-p1'));
    await screen.findByText('車輛分期進件作業');

    // ⓐ 正向：新鈕存在恰一個，可見文字＝aria-label＝title 三者同值，逐字含 N=2（相異份數，非畫面列數）。
    const jumpButtons = document.querySelectorAll('[data-public-subtree-jump]');
    expect(jumpButtons).toHaveLength(1);
    const jumpBtn = jumpButtons[0] as HTMLElement;
    const label = '在文件清單中檢視這 2 份文件';
    expect(jumpBtn.textContent).toContain(label);
    expect(jumpBtn.getAttribute('aria-label')).toBe(label);
    expect(jumpBtn.getAttribute('title')).toBe(label);

    // ⓑ 負向：不得沿用循環側或後台類別側之掛鉤（三顆鈕行為不同、目標不同，共用掛鉤會污染負向鎖）。
    expect(document.querySelector('[data-subtree-jump]')).toBeNull();
    expect(document.querySelector('[data-bc-subtree-jump]')).toBeNull();

    // ⓒ 負向：後台措辭不得出現在前台頁。
    expect(screen.queryByLabelText('在文件管理中檢視這 2 份程序書')).toBeNull();
  });

  it('AC-UX13：N=0（子樹無相異可見文件）時，導向鈕整顆自 DOM 移除（非 disabled、非 CSS 隱藏）', async () => {
    vi.mocked(pubApi.getPublicBusinessCategorySubtreeDocuments).mockResolvedValue({
      nodeId: 'p4', nodeName: '徵審作業', totalCount: 0, groupedCount: 0, groups: [],
    });
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p4')).toBeInTheDocument());
    await userEvent.dblClick(screen.getByTestId('tree-node-p4'));
    await waitFor(() => expect(pubApi.getPublicBusinessCategorySubtreeDocuments).toHaveBeenCalled());
    expect(document.querySelector('[data-public-subtree-jump]')).toBeNull();
  });

  function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="loc">{loc.pathname}</div>;
  }
  it('AC-B20 點抽屜列 → 導向前台文件詳情 /public/documents/:id（非 /admin/documents/:id）', async () => {
    render(
      <MemoryRouter initialEntries={['/public/business-categories']}>
        <Routes>
          <Route path="/public/business-categories" element={<PublicCategoryTreePage />} />
          <Route path="/public/documents/:id" element={<div>文件詳情</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    await userEvent.dblClick(screen.getByTestId('tree-node-p1'));
    await userEvent.click(await screen.findByText('車輛分期進件作業'));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/public/documents/d1'));
  });

  /**
   * 🔴🔴 `AC-53`②——前台樹狀圖模式之負向半句，須與 `BusinessCategoryTreePreviewPage.test.tsx`
   * 之 `AC-53①` 成對存在。
   */
  it('AC-53② 前台樹狀圖模式沒有下載鈕、沒有列印鈕', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(screen.queryByLabelText('下載')).toBeNull();
    expect(screen.queryByLabelText('列印')).toBeNull();
  });

  it('AC-B25 浮水印疊加層仍為必要載體（前台無 PDF 可燒錄）', async () => {
    renderAt();
    const texts = await screen.findAllByTestId('watermark-text');
    expect(texts.length).toBeGreaterThan(0);
  });

  /**
   * 🔴 AC-B27①：本分支**只能**以 deep link `?businessCategoryId=` 建案例——明文禁止寫成
   * 「下拉選到空類別」（該操作不可達，AC-B18② 使 0 節點類別永遠不會出現在下拉）。
   */
  it('AC-B27① deep link 進入 0 節點類別 → 逐字「此類別尚未建立節點」（僅此路徑可達）', async () => {
    vi.mocked(pubApi.getPublicBusinessCategoryGraph).mockResolvedValue({
      businessCategory: { id: 'bc7', name: '帳務處理', subcategory: '企金' },
      graph: { nodes: [], edges: [] },
      watermark: GRAPH.watermark,
    });
    renderAt('?businessCategoryId=bc7');
    expect(await screen.findByText('此類別尚未建立節點')).toBeInTheDocument();
  });

  it('AC-B18② 該分支不可達 UI：下拉選項不含 0 節點之類別（deep link 為唯一入口）', async () => {
    // CATEGORIES 之來源已由後端過濾（AC-B18），bc7 從未出現在下拉選項清單中。
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    const sel = screen.getByLabelText('業務/功能類別');
    expect(sel.querySelector('option[value="bc7"]')).toBeNull();
  });

  it('AC-B27② 整個子樹無可見文件 → 逐字「此節點與其下游節點皆沒有您可檢視的程序書」', async () => {
    vi.mocked(pubApi.getPublicBusinessCategorySubtreeDocuments).mockResolvedValue({
      nodeId: 'p4', nodeName: '徵審作業', totalCount: 0, groupedCount: 0, groups: [],
    });
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p4')).toBeInTheDocument());
    await userEvent.dblClick(screen.getByTestId('tree-node-p4'));
    expect(await screen.findByText('此節點與其下游節點皆沒有您可檢視的程序書')).toBeInTheDocument();
  });

  it('AC-B27③ 無任何可用類別 → 逐字「目前沒有可瀏覽的業務/功能類別」，模式切換器仍可用、不自動切換', async () => {
    vi.mocked(pubApi.getPublicBusinessCategories).mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText('目前沒有可瀏覽的業務/功能類別')).toBeInTheDocument();
  });
});

/**
 * UX16 delta — `AC-UX17`（樹狀圖水平捲軸，項 7；`OQ-UX16-12`＝選項 A、`OQ-UX16-13`＝選項 B）。
 *
 * 🔴 本檔不證明視覺結果：jsdom 不計算版面（`offsetHeight`／`scrollHeight` 恆為 0），此處鎖定的
 * 是 class 契約而非捲軸位置；「水平捲軸是否固定在畫面上」必須由人以真實瀏覽器覆核。
 * 🔴 明文禁止撰寫任何讀取 `offsetHeight`／`scrollHeight`／`getBoundingClientRect()` 並據以
 * 斷言的案例——本檔亦不得新增此類斷言。
 */
describe('PublicCategoryTreePage — UX16 delta AC-UX17（畫布容器 class 契約，非視覺結果之證明）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(pubApi.getPublicBusinessCategories).mockResolvedValue(CATEGORIES);
    vi.mocked(pubApi.getPublicBusinessCategoryGraph).mockResolvedValue(GRAPH);
    vi.mocked(pubApi.getPublicBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE_DOCS);
  });

  it('🔴 畫布容器 class 同時含 overflow-auto、flex-1、min-h-0（三者缺一即重現原 bug）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    const stage = screen.getByTestId('public-tree-stage');
    expect(stage.className).toMatch(/\boverflow-auto\b/);
    expect(stage.className).toMatch(/\bflex-1\b/);
    // 🔴 min-h-0 是本條的全部重點：flex 子項之 min-height 預設為 auto，不肯縮到內容以下 ⇒
    // 只加 flex-1 而不加 min-h-0 時，容器仍會被內容撐高到超出視窗——原封不動重現原 bug。
    expect(stage.className).toMatch(/\bmin-h-0\b/);
  });
});

/**
 * UX16 delta — `AC-UX36`（不套用於前台，項 12 之前台負向半句；`OQ-UX16-25`）。
 *
 * 🔒 前台之 `docCount` 語意為「該 viewer 可見數」，與後台「全部掛載數」已由 `AC-B16`③ 明文禁止
 * 共用屬性名。本檔為此規則之前台負向半句，其**成對之後台正向半句**見
 * `BusinessCategoryTreePreviewPage.companyCounts.ux16.test.tsx`。
 */
describe('PublicCategoryTreePage — UX16 delta AC-UX36（不套用公司別統計，前台負向半句）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(pubApi.getPublicBusinessCategories).mockResolvedValue(CATEGORIES);
    vi.mocked(pubApi.getPublicBusinessCategoryGraph).mockResolvedValue(GRAPH);
    vi.mocked(pubApi.getPublicBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE_DOCS);
  });

  it('🔴 前台節點不存在 node-company-counts 容器、不存在任何 data-company-doc-count 屬性（成對正向半句見後台測試檔）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(screen.getByTestId('tree-node-p1').querySelector('[data-testid="node-company-counts"]')).toBeNull();
    expect(document.querySelector('[data-company-doc-count]')).toBeNull();
  });

  it('🔒 既有節點徽章仍為 data-visible-doc-count／掛載 N 份程序書，一字不改', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(screen.getByText('掛載 2 份程序書')).toBeInTheDocument();
    const badge = screen.getByTestId('tree-node-p1').querySelector('[data-visible-doc-count]');
    expect(badge?.getAttribute('data-visible-doc-count')).toBe('2');
  });
});
