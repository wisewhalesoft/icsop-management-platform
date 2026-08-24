/**
 * F017 §節點子樹篩選（deep link）delta（2026-08-21 三項裁決第 3 項）—— 前端半
 * （`AC-T42`／`AC-T43`／`AC-T44`／`AC-T45`／`AC-T46`／`AC-T47`）。
 *
 * 權威＝`docs/specs/features/F017-backend-document-list.md#subtree-filter-delta`
 *      ＋ `docs/ui-ux-design-overview.md` §A.7.2／§A.7.3 ＋ `prototypes/13-document-list.html`。
 *
 * 🔴 API 回應形狀為 test-generator 依 `architecture-spec.md` §12.3（決策 C3）逐字落地：
 * `getDocuments()` 回應新增頂層 `subtreeFilter: {lifecycleId, lifecycleName, nodeId, nodeName} | null`。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`#subtreeChipBar`／`[data-subtree-chip]` 系列選擇器、
 * `subtreeFilter` 回應欄位、`lifecycleId`／`nodeSubtreeId` 查詢參數傳遞，目前均不存在。
 *
 * 🔴 2026-08-21 team-lead 追問回應：本檔 10 案中 4 案（`TS-T42-001`／`TS-T43-002`／`TS-T44-003`／
 * `TS-T45-001`）在實作前即為綠——經逐一核對，**皆已在本檔內有一條現為紅的正向對照案**，並非孤立、
 * 零鑑別力之綠（比照 `AC-T18` 之正負向配對慣例）：
 *
 * | 綠案（起始即通過） | 正向對照（現為紅） | 配對關係 |
 * |---|---|---|
 * | `TS-T42-001`（循環別未被寫入） | `TS-T44-001`（同一 URL／同一 mock，chip 內容渲染） | 同一次 render 呼叫；證明子樹資料流確實被驅動，非兩段互不相干的邏輯 |
 * | `TS-T43-002`（模組不匯出子樹走訪函式，靜態檢查） | `TS-T43-001`（同一 describe，前端原樣傳遞兩鍵查詢參數） | 同一 `AC-T43` 之正負兩半：一半證「有傳遞」，一半證「不自行展開」 |
 * | `TS-T44-003`（無參數時 chip 不存在） | `TS-T44-001`／`TS-T44-002`（同一 describe，有參數時 chip 存在且內容正確） | 同一 `AC-T44` describe 內之正負向配對，`AC-T18` 同款寫法 |
 * | `TS-T45-001`（`subtreeFilter=null` 時 chip 不渲染） | `TS-T44-001`（`subtreeFilter=SUBTREE_FILTER` 時 chip 渲染） | 兩案唯一差異即 `subtreeFilter` 之有無，是該欄位存在與否的直接開關對照 |
 *
 * 各綠案內已加註 `📌 正向對照見 TS-T##-###` 之行內註解，供之後對照。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, DocumentListItem, DocumentListPage as DocPage } from '../api/types';

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'ICSOPAdmin'): void {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const doc = (over: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'd', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環（消金）', nodeId: 'a1',
  draftingCompanyId: '00000', draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], hasOjt: false,
  edition: "26'01", announcedDate: '2026-01-15T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

const ALL_DOCS: DocumentListItem[] = [
  doc({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', nodeId: 'a1' }),
  doc({ id: 'd2', documentNumber: 'ICSOP-SRC-101-1-02', documentName: '簽約對保作業', nodeId: 'a2' }),
];
const SUBTREE_DOCS: DocumentListItem[] = [ALL_DOCS[0]];

const pageOf = (items: DocumentListItem[], subtreeFilter: DocPage['subtreeFilter'] = null): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false, subtreeFilter,
});

const SUBTREE_FILTER: NonNullable<DocPage['subtreeFilter']> = {
  lifecycleId: 'lc1', lifecycleName: '銷售及收款循環（消金）', nodeId: 'a1', nodeName: '進件作業',
};

const renderAt = (search = '') =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/${search}`]}>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

const filterBar = (): HTMLElement => {
  const el = document.getElementById('filterBar');
  if (!el) throw new Error('找不到 DOM id 為 `filterBar` 之篩選區容器');
  return el;
};
const control = (label: string): HTMLElement => within(filterBar()).getByLabelText(label);

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(ALL_DOCS));
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.downloadAttachment).mockResolvedValue(undefined);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
});

describe('F017 AC-T43 前端原樣傳遞兩參數，不自行展開子樹', () => {
  it('TS-T43-001 帶 ?lifecycleId=lc1&nodeSubtreeId=a1 → getDocuments 收到相同兩鍵之查詢參數', async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(SUBTREE_DOCS, SUBTREE_FILTER));
    renderAt('?lifecycleId=lc1&nodeSubtreeId=a1');
    await waitFor(() =>
      expect(endpoints.getDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleId: 'lc1', nodeSubtreeId: 'a1' }),
      ),
    );
  });

  // 📌 正向對照見 TS-T43-001（同一 AC-T43 之正半：確實把兩鍵原樣傳給後端）——本案為靜態否定式檢查，
  // 起始即通過，但與上一案合起來才是完整的「有傳、沒展開」證明，非孤立零鑑別力之綠。
  it('TS-T43-002 🔴 模組不匯出任何子樹走訪函式／DAG 鏡像（前端不得自行展開子樹）', async () => {
    const mod = (await import('./DocumentListPage')) as Record<string, unknown>;
    const suspiciousKeys = Object.keys(mod).filter((k) => /descendants|NODE_DAG|dag/i.test(k));
    expect(suspiciousKeys).toEqual([]);
  });
});

describe('F017 AC-T42 lifecycleId 不寫入既有「循環別」篩選', () => {
  // 📌 正向對照見 TS-T44-001（同一 URL、同一 mock 之 render）：本案是否具鑑別力，繫於同一次
  // render 是否確實驅動了子樹資料流——TS-T44-001 現為紅正證明了這一點，本案並非憑空之綠。
  it('TS-T42-001 帶兩參數進入後，第 13 項「循環別」控制項之值仍為未選取（全部）', async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(SUBTREE_DOCS, SUBTREE_FILTER));
    renderAt('?lifecycleId=lc1&nodeSubtreeId=a1');
    await screen.findByText('車輛分期進件作業');
    const cycleControl = control('循環別') as HTMLInputElement;
    expect(cycleControl.value).toBe('');
  });
});

describe('F017 AC-T44 chip 之逐字文案與選擇器契約', () => {
  it('TS-T44-001 chip 逐字「循環：{循環顯示名稱} · 節點子樹：{節點名稱}」，取自回應之 subtreeFilter', async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(SUBTREE_DOCS, SUBTREE_FILTER));
    renderAt('?lifecycleId=lc1&nodeSubtreeId=a1');
    await screen.findByText('車輛分期進件作業');
    const bar = document.getElementById('subtreeChipBar');
    expect(bar).not.toBeNull();
    const chipText = (bar as HTMLElement).querySelector('[data-subtree-chip-text]');
    expect(chipText, '[data-subtree-chip-text] 不存在').not.toBeNull();
    expect(chipText!.textContent).toBe('循環：銷售及收款循環（消金） · 節點子樹：進件作業');
  });

  it('TS-T44-002 chip 清除鈕為 <button type="button">，aria-label 與 title 皆逐字「清除節點子樹篩選」', async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(SUBTREE_DOCS, SUBTREE_FILTER));
    renderAt('?lifecycleId=lc1&nodeSubtreeId=a1');
    await screen.findByText('車輛分期進件作業');
    const clear = screen.getByLabelText('清除節點子樹篩選');
    expect(clear.tagName).toBe('BUTTON');
    expect(clear.getAttribute('type')).toBe('button');
    expect(clear.getAttribute('title')).toBe('清除節點子樹篩選');
  });

  // 📌 正向對照見上兩案 TS-T44-001／TS-T44-002（同一 describe，有參數時 chip 存在且內容正確、
  // 現皆為紅）——本案（無參數）與上兩案（有參數）合起來即 AC-T18 同款之正負向配對寫法。
  it('🔴 TS-T44-003 未套用時 chip 整段內容不得存在於 DOM（=== null，不得以 hidden/CSS 保留）', async () => {
    renderAt(); // 無參數
    await screen.findByText('車輛分期進件作業');
    expect(document.querySelector('[data-subtree-chip]')).toBeNull();
  });
});

describe('F017 AC-T45 chip 之顯示與內容以後端解析結果為準（非前端自算）', () => {
  // 📌 正向對照見 TS-T44-001（同一組其餘條件，唯一差異即 subtreeFilter 由 null 換成 SUBTREE_FILTER
  // 後 chip 由不渲染變渲染，現為紅）——兩案是同一個欄位開關之兩端，非各自孤立之綠/紅。
  it('TS-T45-001 subtreeFilter 為 null（縱使網址帶參數）→ chip 不渲染（AC-T41 no-op 之畫面呈現）', async () => {
    // 模擬後端 no-op：即使網址帶參數，回應之 subtreeFilter 仍為 null（例如節點不存在）
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(ALL_DOCS, null));
    renderAt('?lifecycleId=lc1&nodeSubtreeId=ghost');
    await screen.findByText('車輛分期進件作業');
    expect(document.querySelector('[data-subtree-chip]')).toBeNull();
  });
});

describe('🔴 F017 AC-T46 清除之方向性不對稱（兩個方向必須各建一案）', () => {
  it('TS-T46-001 chip ✕ 只清 chip：chip 消失、網址參數移除，使用者自選之既有篩選仍生效', async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(SUBTREE_DOCS, SUBTREE_FILTER));
    renderAt('?lifecycleId=lc1&nodeSubtreeId=a1');
    await screen.findByText('車輛分期進件作業');

    // 使用者另外自選一項既有篩選
    await userEvent.click(control('制定部門'));
    const list = await within(filterBar()).findByRole('listbox');
    await userEvent.click(within(list).getByText('企劃部'));

    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(ALL_DOCS, null));
    await userEvent.click(screen.getByLabelText('清除節點子樹篩選'));

    await waitFor(() => expect(document.querySelector('[data-subtree-chip]')).toBeNull());
    // 制定部門仍顯示已選值（未被清空）
    expect((control('制定部門') as HTMLInputElement).value).toBe('企劃部');
  });

  it('TS-T46-002 「清除全部篩選」連 chip 一起清（AC-D8 已就地擴充）', async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(SUBTREE_DOCS, SUBTREE_FILTER));
    renderAt('?lifecycleId=lc1&nodeSubtreeId=a1');
    await screen.findByText('車輛分期進件作業');

    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(ALL_DOCS, null));
    await userEvent.click(screen.getByText('清除全部篩選'));

    await waitFor(() => expect(document.querySelector('[data-subtree-chip]')).toBeNull());
    await waitFor(() =>
      expect(endpoints.getDocuments).toHaveBeenCalledWith(
        expect.not.objectContaining({ lifecycleId: expect.anything(), nodeSubtreeId: expect.anything() }),
      ),
    );
  });
});

describe('F017 AC-T47 chip 納入「已套用篩選」之判定', () => {
  it('TS-T47-001 僅套用子樹 chip（13 項篩選與關鍵字皆空）→「清除全部篩選」按鈕可見', async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(SUBTREE_DOCS, SUBTREE_FILTER));
    renderAt('?lifecycleId=lc1&nodeSubtreeId=a1');
    await screen.findByText('車輛分期進件作業');
    expect(screen.getByText('清除全部篩選')).toBeInTheDocument();
  });
});
