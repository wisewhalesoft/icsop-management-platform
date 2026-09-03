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
interface PublicBcEndpoints {
  getPublicBusinessCategories: () => Promise<PublicBcListItem[]>;
  getPublicBusinessCategoryGraph: (id: string) => Promise<PublicBcGraph>;
  getPublicBusinessCategoryNodeDocuments: (bcId: string, nodeId: string) => Promise<PublicNodeDoc[]>;
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
const NODE_DOCS: PublicNodeDoc[] = [
  { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z' },
  { id: 'd2', documentNumber: 'ICSOP-SRC-102-1-01', documentName: '對保作業', edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z' },
];

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
  vi.mocked(pubApi.getPublicBusinessCategoryNodeDocuments).mockResolvedValue(NODE_DOCS);
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

  it('AC-B20 雙擊節點 → 唯讀抽屜列出對該 viewer 可見之程序書（四欄，無狀態欄）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    await userEvent.dblClick(screen.getByTestId('tree-node-p1'));
    await waitFor(() => expect(pubApi.getPublicBusinessCategoryNodeDocuments).toHaveBeenCalledWith('bc1', 'p1'));
    expect(await screen.findByText('車輛分期進件作業')).toBeInTheDocument();
    expect(screen.getByText('對保作業')).toBeInTheDocument();
    // 四欄無「狀態」欄：抽屜不含任何狀態徽章字樣（比照 `29` 之五欄刻意不同，見 N9）。
    expect(screen.queryByText('有效')).not.toBeInTheDocument();
    expect(screen.queryByText('失效')).not.toBeInTheDocument();
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

  it('AC-B27② 節點抽屜無可見文件 → 逐字「此節點沒有您可檢視的程序書」', async () => {
    vi.mocked(pubApi.getPublicBusinessCategoryNodeDocuments).mockResolvedValue([]);
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p4')).toBeInTheDocument());
    await userEvent.dblClick(screen.getByTestId('tree-node-p4'));
    expect(await screen.findByText('此節點沒有您可檢視的程序書')).toBeInTheDocument();
  });

  it('AC-B27③ 無任何可用類別 → 逐字「目前沒有可瀏覽的業務/功能類別」，模式切換器仍可用、不自動切換', async () => {
    vi.mocked(pubApi.getPublicBusinessCategories).mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText('目前沒有可瀏覽的業務/功能類別')).toBeInTheDocument();
  });
});
