/**
 * F017 連結點程序書欄摺疊 delta — 後台文件清單第 12 欄（2026-08-18 使用者體驗缺失回報）
 *
 * 權威：
 *   · docs/specs/features/F017-backend-document-list.md §連結點程序書欄摺疊 delta
 *     `AC-E1`（三態與恆一行高）／`AC-E2`（編號可見、書名只在 tooltip）／`AC-E3`（`+N` 為真按鈕）／
 *     `AC-E4`（就地展開、非浮層）／`AC-E5`（展開逐列獨立、鍵為 documentId）／
 *     `AC-E6`（篩選命中者排第一顆）／`AC-E7`（下載路徑不變）／`AC-E8`（DOM 契約）
 *   · prototypes/13-document-list.html 檔頭 2026-08-18 區塊 ①～⑨ 與 `linkCell()`
 *
 * 缺失原文：「連結點程序書有多份時，會造成畫面排版被嚴重上下拉伸」——原實作為 flex-wrap ＋
 * 每連結一顆 pill，欄寬僅容一顆 ⇒ 一個連結換一行，6 個連結之列被拉伸成 6 行高。
 *
 * 📌 jsdom **不做版面計算**，量不到「列高相等」。故 `AC-E1` 之「恆一行高」在此以其**成因**
 *    斷言（收合態容器不得帶 `flex-wrap`、須帶 `whitespace-nowrap`，且 N ≥ 2 時只渲染一顆 pill）——
 *    真實列高已於 2026-08-18 以瀏覽器實測 prototype 驗證（收合列一律 57px、展開列 169px）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, DocumentListItem, DocumentListPage as DocPage,
  DocumentLinkView, DocumentAttachmentRecord,
} from '../api/types';

const navigateMock = vi.fn();
const openMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
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
  lifecycleName: '銷售及收款循環', nodeId: 'node1',
  draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], hasOjt: false,
  edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

const pageOf = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

/**
 * 🔴 連結目標**必須是清單內既存之文件**：`連結點程序書` 篩選之選項係由已載入之文件衍生
 * （value＝`documentId`、label＝`{編號} {書名}`），以憑空 id 當目標會使 `AC-E6` 無從測起。
 */
const link = (n: number, target: DocumentListItem): DocumentLinkView => ({
  linkId: `l${n}`, targetDocumentId: target.id, targetNumber: target.documentNumber,
  targetName: target.documentName, targetStatus: 'active',
});

const D_ONE = doc({
  id: 'd2', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業',
  draftingDeptName: '信用審查部',
});
const D_ZERO = doc({
  id: 'd3', documentNumber: 'ICSOP-GCA-100-2-00', documentName: '法遵作業',
  draftingDeptName: '經企公關部',
});
const D_TWO = doc({
  id: 'd4', documentNumber: 'ICSOP-SRC-101-1-06', documentName: '消費分期特約通路作業',
  draftingDeptName: '消費分期營業部',
});
const T5 = doc({ id: 'd5', documentNumber: 'ICSOP-SRC-102-1-01', documentName: '車輛分期對保作業' });
const T6 = doc({ id: 'd6', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '消費分期產品政策及規範作業' });
const T7 = doc({ id: 'd7', documentNumber: 'ICSOP-PPC-101-1-03', documentName: '消費分期-月目標設定作業' });
const T8 = doc({ id: 'd8', documentNumber: 'ICSOP-CIPS-104-1-01', documentName: '使用者權限管理與覆核' });

/** 長尾最壞情況：實測資料庫 591 筆中，連結最多者為 6 個（1 筆）。 */
const SIX = [
  link(1, D_ONE), link(2, T5), link(3, D_TWO), link(4, T6), link(5, T7), link(6, T8),
];

const D_SIX = doc({
  id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', links: SIX,
});
const DOCS = [
  D_SIX,
  { ...D_ONE, links: [link(9, D_ZERO)] },   // 1 個連結
  D_ZERO,                                   // 0 個連結
  { ...D_TWO, links: [SIX[0], SIX[1]] },    // 2 個連結
  T5, T6, T7, T8,                           // 純目標列（0 個連結）
];

const attachment = (over: Partial<DocumentAttachmentRecord>): DocumentAttachmentRecord => ({
  id: 'a1', documentId: 'd2', type: 'ICSOP_PDF', fileName: 'x.pdf',
  blobPath: 'documents/d2/icsop_pdf/x.pdf', contentType: 'application/pdf', size: 1,
  uploadedBy: 'admin', uploadedAt: '2026-06-01T00:00:00.000Z', ...over,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

/**
 * 以「程序書書名」欄（第 10 欄，index 9）定位列。
 * ⚠ 不可用 `getByText(name).closest('tr')`：展開態之連結列也會渲染目標**書名**，
 *   同一書名會同時命中「某列的書名欄」與「另一列展開後的連結列」而拋 multiple elements。
 *
 * 🔴 2026-08-20 D9 delta（`AC-N37`）：OJT 圖示欄插入最左，本欄索引由 8（第 9 欄）順移為
 * 9（第 10 欄）；本檔內以此 helper 定位之全部案例連坐同步（無需逐案修改）。
 * 📝 被取代之原索引逐字保留供追溯：OLD> `.find((r) => r.querySelectorAll('td')[8]?.textContent?.trim() === docName);`
 */
const rowOf = (docName: string): HTMLElement => {
  const row = screen
    .getAllByRole('row')
    .find((r) => r.querySelectorAll('td')[9]?.textContent?.trim() === docName);
  if (!row) throw new Error(`找不到程序書書名為「${docName}」之列`);
  return row;
};
/** `AC-E8`：第 13 欄之容器帶 `data-link-cell`（原第 12 欄，因 OJT 圖示欄插入最左而順移）。 */
const cellOf = (name: string): HTMLElement => {
  const el = rowOf(name).querySelector<HTMLElement>('[data-link-cell]');
  if (!el) throw new Error(`AC-E8: 「${name}」列找不到 [data-link-cell]`);
  return el;
};
const toggleOf = (name: string): HTMLElement | null =>
  rowOf(name).querySelector<HTMLElement>('[data-link-toggle]');

const filterBar = (): HTMLElement => document.getElementById('filterBar')!;
/** 開啟該 combobox 之選項清單並選定指定選項（限定於篩選區內，避免與表格內同名文字衝突）。 */
async function pick(label: string, optionText: string): Promise<void> {
  await userEvent.click(within(filterBar()).getByLabelText(label));
  const list = await within(filterBar()).findByRole('listbox');
  await userEvent.click(within(list).getByText(optionText));
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.stubGlobal('open', openMock);
  vi.mocked(endpoints.getDocuments).mockImplementation(async (params?: { linkTargetId?: string }) =>
    params?.linkTargetId
      ? pageOf(DOCS.filter((d) => d.links.some((l) => l.targetDocumentId === params.linkTargetId)))
      : pageOf(DOCS),
  );
  vi.mocked(endpoints.getDocumentAttachments).mockImplementation(async (id: string) => [
    attachment({ documentId: id, blobPath: `documents/${id}/icsop_pdf/x.pdf` }),
  ]);
  vi.mocked(endpoints.downloadAttachment).mockResolvedValue(undefined);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
});

describe('F017 AC-E1／AC-E8：三態與收合態之 DOM 契約', () => {
  it('TS-F017-E1-001 0／1／2／6 個連結之收合態：0 個＝「—」、1 個＝單顆 pill 無 +N、N≥2＝第一顆 pill ＋ +{N−1}', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');

    // 0 個：整格為「—」，且不產生 [data-link-cell] 容器（逐字沿用既有 DOM）
    // 🔴 AC-N37：連結點程序書欄索引由 11 順移為 12（OJT 圖示欄插入最左）。
    const zeroCell = rowOf('法遵作業').querySelectorAll('td')[12];
    expect(zeroCell.textContent).toBe('—');
    expect(zeroCell.querySelector('[data-link-cell]')).toBeNull();
    expect(toggleOf('法遵作業')).toBeNull();

    // 1 個：單顆 pill，**不得**出現 +N（Edge Case：不得出現 `+0`）
    expect(cellOf('消金審核作業').dataset.linkCount).toBe('1');
    expect(cellOf('消金審核作業').dataset.linkExpanded).toBe('false');
    expect(cellOf('消金審核作業').querySelectorAll('button')).toHaveLength(1);
    expect(toggleOf('消金審核作業')).toBeNull();

    // 2 個（N≥2 之最小值）：第一顆 pill ＋ 一顆 +1
    expect(cellOf('消費分期特約通路作業').dataset.linkCount).toBe('2');
    expect(toggleOf('消費分期特約通路作業')).toHaveTextContent('+1');

    // 6 個（長尾最壞情況）：仍只渲染**一顆** pill ＋ 一顆 +5
    const six = cellOf('車輛分期進件作業');
    expect(six.dataset.linkCount).toBe('6');
    expect(six.querySelectorAll('button')).toHaveLength(2);
    expect(six.textContent).toContain('ICSOP-SRC-101-2-00');
    expect(six.textContent).not.toContain('ICSOP-CIPS-104-1-01'); // 其餘 5 個不上清單
    expect(toggleOf('車輛分期進件作業')).toHaveTextContent('+5');
  });

  it('TS-F017-E1-002 收合態容器恆一行：帶 whitespace-nowrap、**不得**帶 flex-wrap（原缺失之成因）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    for (const name of ['消金審核作業', '消費分期特約通路作業', '車輛分期進件作業']) {
      const cls = cellOf(name).className;
      expect(cls, `「${name}」收合態應 whitespace-nowrap`).toContain('whitespace-nowrap');
      expect(cls, `「${name}」收合態不得 flex-wrap`).not.toContain('flex-wrap');
    }
  });
});

describe('F017 AC-E2：編號可見、書名只在 tooltip', () => {
  it('TS-F017-E2-001 pill 之可見文字恰為編號，title 逐字為「下載連結點程序書：{編號} {書名}」', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const pill = within(rowOf('車輛分期進件作業')).getByTitle(
      '下載連結點程序書：ICSOP-SRC-101-2-00 消金審核作業',
    );
    expect(pill).toHaveTextContent('ICSOP-SRC-101-2-00');
    expect(pill).not.toHaveTextContent('消金審核作業');
  });
});

describe('F017 AC-E3：`+N` 為真按鈕（非僅具 hover tooltip 之 span）', () => {
  it('TS-F017-E3-001 `+5` 為 <button>、可聚焦、aria-expanded=false、aria-label 與 title 逐字', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const badge = toggleOf('車輛分期進件作業')!;
    expect(badge.tagName).toBe('BUTTON');
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    expect(badge).toHaveAttribute('aria-label', '展開其餘 5 個連結點程序書');
    expect(badge).toHaveAttribute(
      'title',
      '其餘 5 個：ICSOP-SRC-102-1-01、ICSOP-SRC-101-1-06、ICSOP-PPC-101-2-02、ICSOP-PPC-101-1-03、ICSOP-CIPS-104-1-01',
    );
    badge.focus();
    expect(document.activeElement).toBe(badge);
  });
});

describe('F017 AC-E4：點 `+N` 就地展開／再點收合', () => {
  it('TS-F017-E4-001 展開後逐列列出全部 6 個（編號 · 書名 · 下載鈕），toggle 轉為「收合」；再點回收合態', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');

    await userEvent.click(toggleOf('車輛分期進件作業')!);

    const cell = cellOf('車輛分期進件作業');
    expect(cell.dataset.linkExpanded).toBe('true');
    expect(cell.querySelectorAll('[data-link-item]')).toHaveLength(6);
    for (const l of SIX) {
      expect(cell.textContent).toContain(l.targetNumber!);
      expect(cell.textContent).toContain(l.targetName!);
    }
    // 6 顆逐列下載鈕 ＋ 第一列尾端之收合鈕
    expect(cell.querySelectorAll('[data-link-item] button')).toHaveLength(7);

    const collapse = toggleOf('車輛分期進件作業')!;
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('aria-label', '收合連結點程序書');
    // 焦點回到同一顆 toggle，鍵盤操作不掉回 body
    await waitFor(() => expect(document.activeElement).toBe(toggleOf('車輛分期進件作業')));

    await userEvent.click(collapse);
    expect(cellOf('車輛分期進件作業').dataset.linkExpanded).toBe('false');
    expect(toggleOf('車輛分期進件作業')).toHaveTextContent('+5');
  });

  it('TS-F017-E4-002 被摺疊之目標展開後**每一個都可下載**（不是只存在於 tooltip）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(toggleOf('車輛分期進件作業')!);

    // 第 6 個：收合態完全看不到者
    await userEvent.click(
      within(rowOf('車輛分期進件作業')).getByTitle(
        '下載連結點程序書：ICSOP-CIPS-104-1-01 使用者權限管理與覆核',
      ),
    );
    await waitFor(() => expect(endpoints.getDocumentAttachments).toHaveBeenCalledWith('d8'));
    await waitFor(() =>
      expect(endpoints.downloadAttachment).toHaveBeenCalledWith(
        'documents/d8/icsop_pdf/x.pdf',
        expect.any(String),
      ),
    );
  });
});

describe('F017 AC-E5：展開狀態逐列獨立、鍵為 documentId', () => {
  it('TS-F017-E5-001 展開一列不影響其他列；可同時展開多列', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');

    await userEvent.click(toggleOf('車輛分期進件作業')!);
    expect(cellOf('車輛分期進件作業').dataset.linkExpanded).toBe('true');
    expect(cellOf('消費分期特約通路作業').dataset.linkExpanded).toBe('false');
    expect(cellOf('消金審核作業').dataset.linkExpanded).toBe('false');

    await userEvent.click(toggleOf('消費分期特約通路作業')!);
    expect(cellOf('車輛分期進件作業').dataset.linkExpanded).toBe('true');
    expect(cellOf('消費分期特約通路作業').dataset.linkExpanded).toBe('true');
  });

  it('TS-F017-E5-002 展開後改變篩選使列集合改變 → 展開狀態不落到別列（鍵為 documentId 而非列索引）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(toggleOf('車輛分期進件作業')!); // 展開第 1 列

    // 篩掉第 1 列，使原本的第 4 列成為新的第 1 列
    await pick('制定部門', '消費分期營業部');
    await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).toBeNull());
    expect(cellOf('消費分期特約通路作業').dataset.linkExpanded).toBe('false');
  });
});

describe('F017 AC-E6：`連結點程序書` 篩選命中者排第一顆', () => {
  it('TS-F017-E6-001 以第 6 個連結之目標篩選 → 該連結成為收合態唯一可見的第一顆', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');

    await pick('連結點程序書', 'ICSOP-CIPS-104-1-01 使用者權限管理與覆核');

    await waitFor(() =>
      expect(cellOf('車輛分期進件作業').textContent).toContain('ICSOP-CIPS-104-1-01'),
    );
    const cell = cellOf('車輛分期進件作業');
    expect(cell.dataset.linkCount).toBe('6'); // 仍是全部 6 個，只是換了顯示順序
    expect(cell.textContent).not.toContain('ICSOP-SRC-101-2-00'); // 原第一顆改入 +5
    expect(toggleOf('車輛分期進件作業')).toHaveTextContent('+5');
    expect(toggleOf('車輛分期進件作業')).toHaveAttribute(
      'title',
      '其餘 5 個：ICSOP-SRC-101-2-00、ICSOP-SRC-102-1-01、ICSOP-SRC-101-1-06、ICSOP-PPC-101-2-02、ICSOP-PPC-101-1-03',
    );
  });
});

describe('F017 AC-E7：下載路徑不變（受控代理串流，非 SAS 導覽）', () => {
  it('TS-F017-E7-001 收合態 pill → getDocumentAttachments → downloadAttachment；不 window.open、不導覽', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');

    await userEvent.click(
      within(rowOf('消金審核作業')).getByTitle('下載連結點程序書：ICSOP-GCA-100-2-00 法遵作業'),
    );
    await waitFor(() => expect(endpoints.getDocumentAttachments).toHaveBeenCalledWith('d3'));
    await waitFor(() =>
      expect(endpoints.downloadAttachment).toHaveBeenCalledWith(
        'documents/d3/icsop_pdf/x.pdf',
        expect.any(String),
      ),
    );
    expect(openMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('TS-F017-E7-002 目標無 ICSOP PDF → toast 錯誤提示、不崩潰、不呼叫下載', async () => {
    vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
    renderPage();
    await screen.findByText('車輛分期進件作業');

    await userEvent.click(
      within(rowOf('消金審核作業')).getByTitle('下載連結點程序書：ICSOP-GCA-100-2-00 法遵作業'),
    );
    expect(await screen.findByText(/無法下載/)).toBeInTheDocument();
    expect(endpoints.downloadAttachment).not.toHaveBeenCalled();
    expect(screen.getByText('消金審核作業')).toBeInTheDocument();
  });
});
