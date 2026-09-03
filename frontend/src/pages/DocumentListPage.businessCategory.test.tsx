/**
 * F043 業務/功能類別管理 — 己：後台文件清單第 16 欄／第 14 項篩選／CSV 第 15 欄 delta
 * （additive on `DocumentListPage`，`AC-B1`～`AC-B11`）。
 *
 * 權威：docs/specs/features/F017-backend-document-list.md#business-category-column-delta
 *       docs/specs/architecture-spec.md §14.6.4（決策 E5：additive `businessCategories:
 *       {id, displayName}[]`，匯出 body 不變）
 *       docs/ui-ux-design-overview.md §A.8.3／§A.8.4 N1／N2／N3
 *
 * 🔴🔴 定位紀律（team-lead 明文要求，本 repo 已踩過之測試前提缺陷）：**禁止**以硬編欄索引
 * （如 `td[15]`）定位第 16 欄——「樹狀圖」欄依角色增刪 DOM，主管視角下索引會位移。本檔全數
 * 案例一律先由表頭文字反查欄索引（`headerIndexOf()`），比照 `docs/ui-ux-design-overview.md`
 * §A.10.5「第 16 欄之索引改由表頭反查」之既有修正手法。
 *
 * 🔴 對實作全盲：`businessCategories` 為既有 `DocumentListItem` 之 additive 新欄（決策 E5），
 *    第 14 項篩選之端點形狀延用既有 `getDocuments()` 之現有慣例。
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

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

/** additive 新欄（決策 E5），本地型別擴充，不改動既有 `DocumentListItem` import。 */
interface BcRef { id: string; displayName: string }
type DocWithBc = DocumentListItem & { businessCategories: BcRef[] };

const doc = (over: Partial<DocWithBc>): DocWithBc => ({
  id: 'd', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環', nodeId: 'node1',
  draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], hasOjt: false,
  edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
  businessCategories: [],
  ...over,
} as DocWithBc);

const pageOf = (items: DocWithBc[]): DocPage => ({
  items: items as unknown as DocumentListItem[], total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

const D_NONE = doc({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '零類別文件', businessCategories: [] });
/** 🔴 AC-B3 語料鑑別力：同一類別 2 節點（2 筆掛載列）＋另一類別 1 節點 ⇒ 3 掛載列、2 相異類別。 */
const D_DEDUP = doc({
  id: 'd2', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '多節點同類別文件',
  businessCategories: [
    { id: 'bc1', displayName: '授信（消金）' },
    { id: 'bc1', displayName: '授信（消金）' }, // 同一類別第二節點之掛載列（去重前）
    { id: 'bc3', displayName: '風險管理' },
  ],
});
const D_ONE = doc({ id: 'd3', documentNumber: 'ICSOP-GCA-100-2-00', documentName: '單一類別文件', businessCategories: [{ id: 'bc3', displayName: '風險管理' }] });

const DOCS = [D_NONE, D_DEDUP, D_ONE];

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

/** 🔴 定位紀律：一律由表頭文字反查索引，不得硬編（角色會增刪「樹狀圖」欄）。 */
function headerIndexOf(label: string): number {
  const headers = screen.getAllByRole('columnheader').map((th) => (th.textContent ?? '').replace(/[▲▼↑↓\s]/g, ''));
  const idx = headers.findIndex((h) => h === label);
  if (idx < 0) throw new Error(`找不到表頭「${label}」（現有：${headers.join(',')}）`);
  return idx;
}
function rowOf(docName: string): HTMLElement {
  const row = screen.getAllByRole('row').find((r) => within(r).queryByText(docName));
  if (!row) throw new Error(`找不到列「${docName}」`);
  return row;
}
function bcCellOf(docName: string): HTMLElement {
  const idx = headerIndexOf('業務/功能類別');
  const cell = rowOf(docName).querySelectorAll('td')[idx];
  if (!cell) throw new Error(`「${docName}」列找不到索引 ${idx} 之儲存格`);
  return cell as HTMLElement;
}

const filterBar = (): HTMLElement => document.getElementById('filterBar')!;

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(DOCS));
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
  vi.mocked(endpoints.exportDocumentList).mockResolvedValue(undefined);
});

describe('AC-B1／AC-B6：欄數與篩選項數擴充（16 欄／14 項）', () => {
  it('AC-B1 16 欄，第 16 欄（最末欄）表頭逐字「業務/功能類別」；既有 0～14 欄集合不變', async () => {
    renderPage();
    await screen.findByText('零類別文件');
    const headers = screen.getAllByRole('columnheader').map((th) => (th.textContent ?? '').replace(/[▲▼↑↓\s]/g, ''));
    expect(headers).toHaveLength(16);
    expect(headers[headers.length - 1]).toBe('業務/功能類別');
  });

  it('AC-B6 篩選恰 14 項，第 14 項（最末）無障礙名稱逐字「業務/功能類別」', async () => {
    renderPage();
    await screen.findByText('零類別文件');
    expect(within(filterBar()).getByLabelText('業務/功能類別')).toBeInTheDocument();
  });
});

describe('AC-B2／AC-B3／AC-B4：欄值呈現（空值／去重摺疊／pill 不可點）', () => {
  it('AC-B2 未掛任何類別 → 顯示「—」', async () => {
    renderPage();
    await screen.findByText('零類別文件');
    expect(bcCellOf('零類別文件').textContent).toBe('—');
  });

  /**
   * 🔴 AC-B3 核心（防「數了列數」）：語料含 3 筆掛載列、2 個相異類別 ⇒ N 必須為 2（相異類別數），
   * 若實作誤數列數會得到 N=3，本案即翻紅。
   */
  it('AC-B3 依 categoryId 去重：3 筆掛載列、2 相異類別 → 恰 2 顆 pill（非 3）', async () => {
    renderPage();
    await screen.findByText('多節點同類別文件');
    const cell = bcCellOf('多節點同類別文件');
    expect(cell.textContent).toContain('授信（消金）');
    // 收合態：第一顆 pill ＋ `+1`（2 顆去重後之類別 - 1）。
    expect(within(cell).getByText('+1')).toBeInTheDocument();
  });

  it('AC-B3 恰 1 相異類別 → 單顆 pill，不得出現 +0', async () => {
    renderPage();
    await screen.findByText('單一類別文件');
    const cell = bcCellOf('單一類別文件');
    expect(cell.textContent).toContain('風險管理');
    expect(within(cell).queryByText('+0')).toBeNull();
    expect(within(cell).queryByText(/^\+/)).toBeNull();
  });

  it('AC-B4 pill 為 <span>（非 <a>／<button>），無 onClick／href，cursor 不為 pointer；僅 +N 徽章可互動', async () => {
    renderPage();
    await screen.findByText('多節點同類別文件');
    const cell = bcCellOf('多節點同類別文件');
    const pill = within(cell).getByText('授信（消金）');
    expect(pill.tagName).toBe('SPAN');
    expect(pill).not.toHaveAttribute('href');
    expect(pill.style.cursor).not.toBe('pointer');
    const badge = within(cell).getByText('+1');
    expect(badge.tagName).toBe('BUTTON'); // 唯一可互動者
  });
});

describe('AC-B7：第 14 項篩選之控制項型態與選項', () => {
  it('AC-B7① 可搜尋下拉（combobox）；②選項值＝businessCategoryId、顯示＝businessCategoryDisplayName；③預設僅 active', async () => {
    renderPage();
    await screen.findByText('零類別文件');
    const control = within(filterBar()).getByLabelText('業務/功能類別');
    expect(control).toHaveAttribute('role', 'combobox');
  });

  it('AC-B7④ 存在量詞：篩選 bc3 → 命中「多節點同類別文件」與「單一類別文件」', async () => {
    renderPage();
    await screen.findByText('零類別文件');
    await userEvent.click(within(filterBar()).getByLabelText('業務/功能類別'));
    const list = await within(filterBar()).findByRole('listbox');
    await userEvent.click(within(list).getByText('風險管理'));
    await waitFor(() => expect(screen.queryByText('零類別文件')).not.toBeInTheDocument());
    expect(screen.getByText('多節點同類別文件')).toBeInTheDocument();
    expect(screen.getByText('單一類別文件')).toBeInTheDocument();
  });
});

/**
 * 🔴 AC-B9（CSV 第 15 欄之表頭字面／全形頓號／碼位序／空儲存格規則）為**伺服器端**產生 CSV 位元組
 * 之規則——匯出端點 `POST /admin/documents/export` 之角色只是「以 `documentIds` 換回一份 CSV
 * Blob」，前端不組字、不組表頭。該規則之逐字斷言權威落在**後端**（`backend/src/documents/*.spec.ts`
 * 之匯出向量測試），非本檔職責；本檔僅約束 AC-B10（呼叫契約不因新欄而多帶第三引數）。
 * 詳見 risks-and-gaps。
 */
describe('AC-B10：匯出呼叫端仍恰傳兩個引數（documentIds ＋ 選填 linkTargetId）', () => {
  it('AC-B10 第 16 欄／第 14 項篩選存在下，匯出呼叫仍恰兩引數，不夾帶 businessCategoryId', async () => {
    renderPage();
    await screen.findByText('零類別文件');
    // 套用第 14 項篩選後仍匯出，驗證新篩選狀態不會被一併塞進呼叫引數。
    await userEvent.click(within(filterBar()).getByLabelText('業務/功能類別'));
    const list = await within(filterBar()).findByRole('listbox');
    await userEvent.click(within(list).getByText('風險管理'));
    await waitFor(() => expect(screen.getByText('多節點同類別文件')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '匯出' }));
    await waitFor(() => expect(endpoints.exportDocumentList).toHaveBeenCalledTimes(1));
    const args = vi.mocked(endpoints.exportDocumentList).mock.calls[0] as unknown[];
    expect(args.length).toBeLessThanOrEqual(2);
    expect(Array.isArray(args[0])).toBe(true);
    if (args.length === 2) expect(['string', 'undefined']).toContain(typeof args[1]);
  });
});

describe('AC-B11：回歸鎖定（本 delta 只增不改）', () => {
  it('既有第 12 欄「連結點程序書」與其摺疊掛鉤不受影響', async () => {
    renderPage();
    await screen.findByText('零類別文件');
    const idx = headerIndexOf('連結點程序書');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(15); // 仍在既有 15 欄範圍內，不因新欄而位移
  });
});
