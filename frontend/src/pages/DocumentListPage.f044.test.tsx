import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, DocumentListItem, DocumentListPage as DocPage } from '../api/types';

/**
 * F044 `AC-G59` — ICSOP 文件管理清單新增 **URL 排序參數之讀取**（`查看更多` 之接收端）。
 *
 * 🔴 **本檔對實作全盲**：`DocumentListPage` 目前之 `sortBy`／`sortDir` 為純前端 `useState`、
 *    **不讀 URL**（F044 §已查證之既有事實 #16）⇒ 預期紅燈為列序斷言失敗。
 *
 * 🔒 `AC-G59` 之四條硬約束：
 *  ① 於 `useState` 之**初始化函式**即取樣（照抄同頁 `readSubtreeParams`／`readBcSubtreeParams`
 *    之既有紀律，否則首屏會先閃一次未排序之清單）；
 *  ② 參數名與值域**逐字沿用既有型別**：`sortBy ∈ {'documentNumber','announcedDate'}`、
 *    `sortDir ∈ {'asc','desc'}`（§命名鎖定第 21 列）；
 *  ③ 缺席或值不可辨識 ⇒ **靜默 no-op**、退回既有預設（`sortBy=''`／`sortDir='asc'`）；
 *  ④ 🔴 **排序仍在客端執行、仍不送後端**——本條只新增「初始值從哪裡來」。
 *
 * 🔒 `AC-G82`：清單之 16 欄／14 項篩選／CSV 15 欄與**不帶新參數時之行為**一格不動
 *    （其載體為 F017 之既有測試，本檔不重複）。
 */

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'ICSOPAdmin'): void {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const doc = (over: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'd',
  status: 'active',
  documentNumber: 'N',
  documentName: '名',
  lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環（消金）',
  nodeId: 'a1',
  draftingDeptId: 'A2000',
  draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司',
  draftingDeptName: '企劃部',
  draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050',
  primaryChiefName: '陳彥廷',
  secondaryChiefCount: 0,
  secondaryChiefNames: [],
  secondaryChiefIds: [],
  hasOjt: false,
  edition: "26'01",
  announcedDate: '2026-01-15T00:00:00.000Z',
  contentSummary: '摘要',
  icsopPdfBlobPath: null,
  icsopPdfFileName: null,
  links: [],
  ...over,
});

/**
 * 語料刻意讓「載入次序」與「公告日降冪」**不同**——否則本檔每一條斷言在
 * 「參數完全沒被讀到」之下也會通過，整份恆真。
 * 🔴 另含一筆 `announcedDate` 為 `null` 者，用以鎖住 `AC-G59` 明文「本輪不動」之既有落差。
 *
 * 🔵 2026-09-23：未指定排序時之**預設次序**由「沿用載入次序」改為「制定單位相近程度」
 * （`draftingProximity` 昇冪、同層編號降冪）。語料因此改為：相近程度 N-A 0／N-B 1／N-C 2／N-D 3，
 * 且**載入次序刻意打亂**（C, A, D, B）⇒ 預設次序 A,B,C,D 與載入次序、編號降冪（D,C,B,A）、
 * 公告日降冪（B,C,A,D）四者兩兩相異——下方「no-op ⇒ A,B,C,D」只能由相近程度排序產生。
 * 📝 已作廢（⚠ 不得復原）：OLD> 載入次序 A,B,C,D 且無 `draftingProximity`（預設＝載入次序）。
 */
const DOCS: DocumentListItem[] = [
  doc({ id: 'x3', documentNumber: 'N-C', announcedDate: '2026-02-05T00:00:00.000Z', draftingProximity: 2 }),
  doc({ id: 'x1', documentNumber: 'N-A', announcedDate: '2026-01-10T00:00:00.000Z', draftingProximity: 0 }),
  doc({ id: 'x4', documentNumber: 'N-D', announcedDate: null, draftingProximity: 3 }),
  doc({ id: 'x2', documentNumber: 'N-B', announcedDate: '2026-03-20T00:00:00.000Z', draftingProximity: 1 }),
];

const pageOf = (items: DocumentListItem[]): DocPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 2000,
  hasNext: false,
  subtreeFilter: null,
});

const renderAt = (search = '') =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/${search}`]}>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

/** 列序之可觀測載體：表格列中文件編號之出現次序。 */
async function rowOrder(): Promise<string[]> {
  await screen.findByText('N-A');
  const rows = [...document.querySelectorAll('tbody tr')];
  const out: string[] = [];
  for (const r of rows) {
    const m = /N-[A-D]/.exec(r.textContent ?? '');
    if (m && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(DOCS));
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.downloadAttachment).mockResolvedValue(undefined);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
});

describe('AC-G59 — 自 URL 取樣 sortBy／sortDir（客端排序之初始值）', () => {
  it('語料自我守護：預設次序（制定單位相近程度）≠ 公告日降冪（否則本檔每一條皆恆真）', async () => {
    renderAt('');
    expect(await rowOrder()).toEqual(['N-A', 'N-B', 'N-C', 'N-D']);
  });

  it('?sortBy=announcedDate&sortDir=desc ⇒ 首屏即依公告日**降冪**', async () => {
    renderAt('?sortBy=announcedDate&sortDir=desc');
    // 2026-03-20 > 2026-02-05 > 2026-01-10 > null
    expect(await rowOrder()).toEqual(['N-B', 'N-C', 'N-A', 'N-D']);
  });

  it('?sortBy=announcedDate&sortDir=asc ⇒ 依公告日昇冪（值域之另一半亦生效）', async () => {
    renderAt('?sortBy=announcedDate&sortDir=asc');
    // 客端排序之 `?? ''` 使 null 在昇冪時排最前（🔒 既有落差，見下）
    expect(await rowOrder()).toEqual(['N-D', 'N-A', 'N-C', 'N-B']);
  });

  it('?sortBy=documentNumber&sortDir=desc ⇒ 依文件編號降冪（值域之另一鍵亦生效）', async () => {
    renderAt('?sortBy=documentNumber&sortDir=desc');
    expect(await rowOrder()).toEqual(['N-D', 'N-C', 'N-B', 'N-A']);
  });

  it.each([
    ['參數缺席', ''],
    ['只帶 sortBy（🔒 值域可辨識，方向退回預設 asc）', '?sortBy=announcedDate'],
    ['sortBy 值不可辨識', '?sortBy=announcedDateX&sortDir=desc'],
    ['sortBy 為既有型別以外之欄位', '?sortBy=documentName&sortDir=desc'],
    ['sortDir 值不可辨識', '?sortBy=announcedDate&sortDir=descending'],
  ])('%s ⇒ 靜默 no-op（不回錯誤、不 toast）', async (label, search) => {
    renderAt(search);
    const order = await rowOrder();
    if (label.startsWith('只帶 sortBy')) {
      // 🔒 `sortDir` 缺席 ⇒ 退回既有預設 `asc`（**不是**整組忽略——本頁之「恰成對」紀律
      //    只適用於子樹 deep link，不適用於排序）
      expect(order).toEqual(['N-D', 'N-A', 'N-C', 'N-B']);
    } else {
      expect(order).toEqual(['N-A', 'N-B', 'N-C', 'N-D']);
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * 🔴 `AC-G59` ④：**排序仍在客端執行、仍不送後端**——本條只新增「初始值從哪裡來」，
   * 不改變排序的執行位置。
   */
  it('🔴 排序參數**不得**被送到後端（getDocuments 之參數不含 sortBy／sortDir）', async () => {
    renderAt('?sortBy=announcedDate&sortDir=desc');
    await rowOrder();
    await waitFor(() => expect(endpoints.getDocuments).toHaveBeenCalled());
    for (const call of vi.mocked(endpoints.getDocuments).mock.calls) {
      const arg = (call[0] ?? {}) as Record<string, unknown>;
      expect(Object.keys(arg)).not.toContain('sortBy');
      expect(Object.keys(arg)).not.toContain('sortDir');
    }
  });

  /**
   * 🔒 **既有落差本輪不動**（`AC-G59` 末段、`OQ-D44-23` 第三題）：
   * 客端排序對 `announcedDate` 為 `null` 之處置為 `?? ''`（空字串參與比較，故降冪時排最後、
   * 昇冪時排最前），與後端 `applyDocumentQuery`（null **一律排最後、不受方向影響**）
   * **語意不同**。🔴 **明文禁止本輪順手對齊**——對齊會改動 F017 之既有行為與測試期望值。
   * ⇒ 本案即該落差之回歸鎖：若有人「順手修好」，它會翻紅並強迫重新取得授權。
   */
  it('🔒 既有落差之回歸鎖：null 之公告日在客端**受方向影響**（降冪最後、昇冪最前）', async () => {
    const desc = renderAt('?sortBy=announcedDate&sortDir=desc');
    expect((await rowOrder()).at(-1)).toBe('N-D');
    desc.unmount();

    renderAt('?sortBy=announcedDate&sortDir=asc');
    expect((await rowOrder())[0]).toBe('N-D');
  });
});

/**
 * 🔵 2026-09-23 使用者裁定：水平捲軸比照前台樹狀圖**固定在當前畫面下方**。
 * 🔴 jsdom 無版面——此處只鎖接線（代理捲軸存在、sticky 貼底、位於表格捲動容器之後、外框不建立捲動容器），
 *    「捲軸真的貼在視窗底」須以真實瀏覽器覆核。
 */
describe('2026-09-23 — 表格水平捲軸固定於畫面下方（接線契約）', () => {
  it('代理捲軸緊接在表格捲動容器之後，sticky 貼底；外框為 overflow-clip（非 overflow-hidden）', async () => {
    renderAt('');
    await rowOrder();
    const scroller = screen.getByTestId('document-table-scroll');
    const bar = screen.getByTestId('document-table-hscroll');
    expect(scroller.nextElementSibling).toBe(bar);
    expect(bar.className).toMatch(/\bsticky\b/);
    expect(bar.className).toMatch(/\bbottom-0\b/);
    const card = scroller.parentElement!;
    expect(card.className).toMatch(/\boverflow-clip\b/);
    // 🔴 overflow-hidden 會成為 sticky 之參考框 ⇒ 捲軸只貼在外框底（＝原 bug）。
    expect(card.className).not.toMatch(/\boverflow-hidden\b/);
  });
});
