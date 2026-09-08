/**
 * F043 `AC-56`（2026-09-08 使用者裁決）—— `13` 之**業務/功能類別**節點子樹 deep link（前端半）。
 *
 * 權威＝`docs/specs/features/F043-business-function-category.md` `AC-56`
 *      ＋ `docs/specs/features/F017-backend-document-list.md#subtree-filter-delta`（循環側之既有樣板）
 *      ＋ `prototypes/13-document-list.html`／`prototypes/29-business-category-tree-preview.html`。
 *
 * 🔴 **與循環側之機制刻意不同**：循環掛載是 `ICSOP_DOCUMENT.nodeId` 單一欄位（後端一條 `IN` 下推、
 *    回頂層 `subtreeFilter` 描述子）；業務/功能類別是 **M:N**，文件列上沒有節點維度可比對，故
 *    沿用同頁既有之 `linkTargetId`／`appendixId`／`formId` 樣板——**一次後端查詢取得 id 集合、
 *    再與工作集交集**。子樹展開／可見性／排序仍全部由後端完成（前端不自行走訪）。
 *
 * 🔴 兩種 deep link **並存**，鍵名必須不同：`businessCategoryId`／`bcNodeSubtreeId` vs
 *    `lifecycleId`／`nodeSubtreeId`。共用鍵會互相覆蓋，而兩邊之節點 id 分屬不同的圖。
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
  draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], hasOjt: false,
  edition: "26'01", announcedDate: '2026-01-15T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

/**
 * 🔴 語料之鑑別力：三份文件之中**只有兩份**在子樹內，且第三份（`d3`）與其他兩份同一循環、
 * 同一制定部門——若實作沒有真的做交集（例如只顯示 chip 而未過濾），`d3` 會留在畫面上而翻紅。
 */
const ALL_DOCS: DocumentListItem[] = [
  doc({ id: 'd1', documentNumber: 'ICSOP-A', documentName: '車輛分期進件作業' }),
  doc({ id: 'd2', documentNumber: 'ICSOP-B', documentName: '簽約對保作業' }),
  doc({ id: 'd3', documentNumber: 'ICSOP-C', documentName: '帳務處理作業' }),
];

const pageOf = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false, subtreeFilter: null,
});

const subtreeDoc = (id: string, num: string, name: string) => ({
  id, documentNumber: num, documentName: name, edition: "26'01",
  status: 'active' as const, announcedDate: null,
});

/**
 * 🔴 **跨組不去重**之語料（M:N）：`d1` 掛在 `r` 與 `c1` 兩個節點 ⇒ 列數 3、相異 2。
 * 交集用的是**相異 id 集合**，故清單必須恰為 `d1`／`d2` 兩列，而非三列。
 */
const SUBTREE = {
  nodeId: 'r',
  nodeName: '進件收件作業',
  businessCategoryDisplayName: '授信（消金）',
  totalCount: 2,
  groupedCount: 3,
  groups: [
    {
      nodeId: 'r',
      nodeName: '進件收件作業',
      documents: [subtreeDoc('d1', 'ICSOP-A', '車輛分期進件作業')],
    },
    {
      nodeId: 'c1',
      nodeName: '徵審作業',
      documents: [
        subtreeDoc('d1', 'ICSOP-A', '車輛分期進件作業'),
        subtreeDoc('d2', 'ICSOP-B', '簽約對保作業'),
      ],
    },
  ],
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
  vi.mocked(endpoints.getBusinessCategories).mockResolvedValue([]);
  vi.mocked(endpoints.getBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE);
});

describe('AC-56 §deep link 之解析與交集', () => {
  it('帶 ?businessCategoryId=bc1&bcNodeSubtreeId=r → 以相同兩值呼叫子樹端點', async () => {
    renderAt('?businessCategoryId=bc1&bcNodeSubtreeId=r');
    await waitFor(() =>
      expect(endpoints.getBusinessCategorySubtreeDocuments).toHaveBeenCalledWith('bc1', 'r'),
    );
  });

  it('🔴 清單恰為子樹內之**相異**兩份（列數 3 之語料不得使畫面出現三列，子樹外之 d3 須被濾掉）', async () => {
    renderAt('?businessCategoryId=bc1&bcNodeSubtreeId=r');
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText('簽約對保作業')).toBeInTheDocument();
    expect(screen.queryByText('帳務處理作業')).toBeNull();
    expect(document.querySelectorAll('table tbody tr')).toHaveLength(2);
  });

  it('🔒 兩參數**恆成對**：只帶其一 → 靜默 no-op（不呼叫端點、不篩選、不顯示 chip、不報錯）', async () => {
    renderAt('?businessCategoryId=bc1');
    await waitFor(() => expect(screen.getByText('帳務處理作業')).toBeInTheDocument());
    expect(endpoints.getBusinessCategorySubtreeDocuments).not.toHaveBeenCalled();
    expect(document.querySelector('[data-bc-subtree-chip]')).toBeNull();
  });

  it('🔴 端點失敗（如無類別權限之 403）→ 靜默 no-op：不篩選、不顯示 chip、不跳錯誤訊息', async () => {
    vi.mocked(endpoints.getBusinessCategorySubtreeDocuments).mockRejectedValue(new Error('FORBIDDEN'));
    renderAt('?businessCategoryId=bc1&bcNodeSubtreeId=r');
    await waitFor(() => expect(screen.getByText('帳務處理作業')).toBeInTheDocument());
    expect(document.querySelector('[data-bc-subtree-chip]')).toBeNull();
    expect(screen.queryByText(/載入失敗|FORBIDDEN/)).toBeNull();
  });

  /**
   * 🔴 `AC-B7` 之第 14 項「業務/功能類別」篩選是**另一件事**：deep link 不得偷偷把它選起來
   * （兩個來源糾纏之後，chip 的 ✕ 與篩選的清除會互相打架——比照循環側之 `AC-T42`）。
   */
  it('AC-T42 之類別版：deep link 不得寫入第 14 項「業務/功能類別」篩選（其值仍為未選取）', async () => {
    renderAt('?businessCategoryId=bc1&bcNodeSubtreeId=r');
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect((control('業務/功能類別') as HTMLInputElement).value).toBe('');
  });
});

describe('AC-56 §chip 之呈現與清除', () => {
  it('chip 文案逐字＝「業務/功能類別：{類別顯示名} · 節點子樹：{節點名}」（兩值皆取自後端）', async () => {
    renderAt('?businessCategoryId=bc1&bcNodeSubtreeId=r');
    await waitFor(() => expect(document.querySelector('[data-bc-subtree-chip]')).not.toBeNull());
    expect(document.querySelector('[data-bc-subtree-chip-text]')!.textContent).toBe(
      '業務/功能類別：授信（消金） · 節點子樹：進件收件作業',
    );
    expect(screen.getByText('由業務/功能類別樹狀圖預覽帶入')).toBeInTheDocument();
  });

  it('未帶參數 → chip **不進 DOM**（非 hidden、非 CSS 隱藏）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByText('帳務處理作業')).toBeInTheDocument());
    expect(document.querySelector('[data-bc-subtree-chip]')).toBeNull();
  });

  it('chip 自己的 ✕ → 只清 chip；其餘篩選不動（此處以「已選之制定部門」為對照）', async () => {
    renderAt('?businessCategoryId=bc1&bcNodeSubtreeId=r');
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());

    await userEvent.click(control('制定部門'));
    await userEvent.click(await within(filterBar()).findByText('企劃部'));

    await userEvent.click(screen.getByLabelText('清除業務/功能類別節點子樹篩選'));
    await waitFor(() => expect(document.querySelector('[data-bc-subtree-chip]')).toBeNull());
    expect((control('制定部門') as HTMLInputElement).value).toBe('企劃部');
  });

  it('「清除全部篩選」連 chip 一起清（按鈕字面說的是「全部」）', async () => {
    renderAt('?businessCategoryId=bc1&bcNodeSubtreeId=r');
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByText('清除全部篩選'));
    await waitFor(() => expect(document.querySelector('[data-bc-subtree-chip]')).toBeNull());
    expect(await screen.findByText('帳務處理作業')).toBeInTheDocument();
  });

  it('僅套用 chip（14 項篩選與關鍵字皆空）→「清除全部篩選」按鈕可見', async () => {
    renderAt('?businessCategoryId=bc1&bcNodeSubtreeId=r');
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText('清除全部篩選')).toBeInTheDocument();
  });
});
