import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import { TopbarSlotsContext } from '../components/PageHeader';
import { ApiError } from '../api/client';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser,
  DocumentListItem,
  DocumentListPage as DocPage,
} from '../api/types';

/**
 * F017 §清單匯出（CSV）delta —— 後台文件清單頁之匯出鈕與匯出範圍（前端側約束環）。
 *
 * 權威：
 *  - `docs/specs/features/F017-backend-document-list.md`
 *    `AC-X9`（匯出鈕之位置、逐字文案與選擇器；🔴 **非** write-only，四種角色皆可見可按）｜
 *    `AC-X11` ①②（匯出範圍＝ `filtered`，**不是** `pageRows`、**不是** `all`；列序＝畫面當前排序）｜
 *    `AC-X12`（🔴 前端**不得**執行上限檢查、不得 `disabled` 匯出鈕）｜
 *    `AC-X13`（0 筆時匯出鈕仍可按）｜`AC-X14`（逐字回饋 ＋ 下載途徑）｜
 *    `AC-X16` ①②③④（零漣漪：15 欄、13 項篩選、chip、統計卡／排序／分頁／空狀態一律不變）
 *  - `docs/specs/architecture-spec.md` §13.4 (i) ①（🔴 fixture 必須使 `filtered`／`pageRows`／`all`
 *    **三者相異**——至少 3 頁資料 ＋ 一項生效篩選；否則此斷言在單頁無篩選之 fixture 下對三者皆成立＝假綠）
 *    ／§13.5 盲區 #6（同上）／§10.15 盲區 #16（topbar 動作區之 AC 必須提供真實 `TopbarSlotsContext`，
 *    否則命中的是 inline fallback、**portal 注入路徑從未被執行**）
 *  - `prototypes/13-document-list.html`：L270-277（匯出鈕逐字與位置）／L920-936（`filteredRows()`）／
 *    L1076-1091（`doExport()` 之範圍與回饋）
 *
 * ⚠ **對實作全盲**：匯出鈕與 `endpoints.exportDocumentList()` 於本環撰寫時**尚不存在**。
 *    以 `vi.mock` factory 於自動 mock 之上補齊該鍵，使「未實作」以**逐條斷言紅燈**呈現，
 *    而非 `beforeEach` 崩潰（後者會讓整檔為錯誤的理由而紅、診斷訊息毫無意義）。
 *
 * 🔴 **本檔刻意不做之事**：`AC-X12` 之「> 10,000 筆 → 400」錯誤路徑**不經畫面觸發**——
 *    `LOAD_SIZE = 2000 < EXPORT_ROW_LIMIT = 10000` 使該路徑在本頁**結構上不可達**，
 *    經畫面驅動的測試會寫成一條**永遠跑不到卻恆綠**的測試。該 AC 之錯誤路徑落在
 *    `backend/src/documents/documents.export.controller.spec.ts`（直接呼叫端點）。
 *    本檔只驗前端側之「**不得**擋下請求、**不得** `disabled`」。
 *
 * 🔒 本檔**不動**既有 `DocumentListPage*.test.tsx` 四檔。
 */

const exportDocumentListMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('../api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(actual)) mocked[k] = typeof v === 'function' ? vi.fn() : v;
  // 🔴 `exportDocumentList` 尚未存在時亦保證此鍵存在（見檔頭 ⚠）。
  mocked.exportDocumentList = exportDocumentListMock;
  return mocked;
});
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

/** `AC-X14` 逐字片段。 */
const SUCCESS = '已匯出程序書清單（CSV，UTF-8 BOM）';
const OVER_LIMIT = (n: number) => `符合條件之筆數為 ${n} 筆，超過匯出上限 10000 筆，請縮小篩選條件`;
const ERROR_BADGE = 'EXPORT_ROW_LIMIT_EXCEEDED · 400';
const FAILURE = (code: string) => `匯出失敗：${code}`;

/**
 * `AC-X16` ①：畫面欄之逐字集合與由左至右順序（樹狀圖仍在畫面上，只是不匯出）。
 * 🔴 2026-09-02 F043 delta（`AC-B1`）連坐修正（tdd-implementation 申訴）：15→16 欄，
 * 「業務/功能類別」為新增之最末欄——本檔為「本 delta 只在 topbar 加一顆鈕」之零漣漪回歸鎖定，
 * F043 才是動了畫面欄集合的那個 delta，此處就地同步，非弱化本測試之鑑別力。
 */
const SCREEN_COLUMNS = [
  'OJT', '制定公司', '制定部門', '制定室別', '當責室長', '狀態', '檔案', '樹狀圖',
  '程序書編號', '程序書書名', '版次', '內容摘要', '連結點程序書', '公告日期', '循環別', '業務/功能類別',
];

function mockAuth(roleCode: string): void {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const doc = (over: Partial<DocumentListItem> & { id: string }): DocumentListItem => ({
  status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環', nodeId: 'node1',
  draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], ojtStatus: 'none',
  edition: "26'01", announcedDate: '2026-01-15T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
  ...over,
});

/**
 * 🔴 §13.4 (i) ① 之 fixture 要求：**120 筆（3 頁，每頁 50）＋ 一項生效之 OJT 篩選（命中 80 筆）**
 * ⇒ `all`(120) ≠ `filtered`(80) ≠ `pageRows`(50)，三者兩兩相異，斷言才有鑑別力。
 * 🔴 `documentNumber` 刻意**逆序**（i 越大編號越小），使「畫面載入序」與「依編號升冪排序後之序」相異
 *    ⇒ `AC-X11` ② 之排序案才測得出「送出的是**當前排序後**之序」。
 */
const TOTAL = 120;
const DOCS: DocumentListItem[] = Array.from({ length: TOTAL }, (_, i) =>
  doc({
    id: `d${String(i).padStart(3, '0')}`,
    documentNumber: `ICSOP-${String(TOTAL - 1 - i).padStart(3, '0')}`,
    documentName: `程序書-${String(i).padStart(3, '0')}`,
    ojtStatus: i % 3 === 0 ? 'none' : 'partial',
  }),
);
/** 篩選 `部分完成` 後之期望 id 序（＝ `filtered.map(d => d.id)`，載入序）。 */
const PARTIAL_IDS = DOCS.filter((d) => d.ojtStatus === 'partial').map((d) => d.id);
const ALL_IDS = DOCS.map((d) => d.id);

const pageOf = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

/** §10.15 #16：提供真實 topbar slots，使 `PageHeader` 走 **portal** 而非 inline fallback。 */
function renderWithTopbar(): { actionsEl: HTMLElement } {
  const titleEl = document.createElement('div');
  const actionsEl = document.createElement('div');
  titleEl.setAttribute('data-testid', 'topbar-title-slot');
  actionsEl.setAttribute('data-testid', 'topbar-actions-slot');
  document.body.append(titleEl, actionsEl);
  render(
    <ToastProvider>
      <MemoryRouter>
        <TopbarSlotsContext.Provider value={{ titleEl, actionsEl }}>
          <DocumentListPage />
        </TopbarSlotsContext.Provider>
      </MemoryRouter>
    </ToastProvider>,
  );
  return { actionsEl };
}

/** `AC-D10`：桌面篩選區容器之 DOM id 為 `filterBar`。 */
const filterBar = (): HTMLElement => {
  const el = document.getElementById('filterBar');
  if (!el) throw new Error('找不到 DOM id 為 `filterBar` 之篩選區容器');
  return el;
};
const control = (label: string): HTMLElement => within(filterBar()).getByLabelText(label);
const exportButton = (actionsEl: HTMLElement): HTMLElement =>
  within(actionsEl).getByRole('button', { name: '匯出' });

/** 以「元素之可見文字**起始於**片段」定位回饋（AC 只約束起始片段）。 */
const startsWith = (fragment: string) => (_c: string, el: Element | null): boolean => {
  if (!el) return false;
  if (!(el.textContent ?? '').trim().startsWith(fragment)) return false;
  return !Array.from(el.children).some((c) => (c.textContent ?? '').trim().startsWith(fragment));
};

const idsOfLastExportCall = (): string[] =>
  (exportDocumentListMock.mock.calls[0] as unknown as [string[], string?])[0];

beforeEach(() => {
  vi.resetAllMocks();
  exportDocumentListMock.mockReset();
  exportDocumentListMock.mockResolvedValue(undefined);
  vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(DOCS));
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.downloadAttachment).mockResolvedValue(undefined);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
});
afterEach(() => {
  document.querySelectorAll('[data-testid^="topbar-"]').forEach((n) => n.remove());
});

const waitLoaded = async (): Promise<void> => {
  await waitFor(() => expect(endpoints.getDocuments).toHaveBeenCalled());
  await screen.findByText('程序書-000');
};

// ══════════════════════════════════════════════════════════════════════════

describe('F017 AC-X9：匯出鈕之位置、逐字文案與選擇器', () => {
  it('🔴 AC-X9 匯出鈕位於 **topbar 動作區**（經 PageHeader portal 注入，非 inline fallback）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    const btn = exportButton(actionsEl);
    expect(btn).toBeInTheDocument();
    expect(actionsEl.contains(btn)).toBe(true);
  });

  it('AC-X9 可見文字與 `aria-label` 皆逐字為 `匯出`、`title` 逐字為 `匯出程序書清單（CSV）`', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    const btn = exportButton(actionsEl);
    expect(btn.getAttribute('aria-label')).toBe('匯出');
    expect(btn.textContent?.trim()).toBe('匯出');
    expect(btn.getAttribute('title')).toBe('匯出程序書清單（CSV）');
  });

  it('AC-X9 icon 鍵為 `download`', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    const svg = exportButton(actionsEl).querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class') ?? '').toMatch(/download/i);
  });

  it('🔴 AC-X9 位置在「建立程序書」鈕**之前（左側）**（比照 prototype 24 之「匯出」在「上傳附錄」之左）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    const names = within(actionsEl)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '');
    expect(names).toContain('匯出');
    expect(names).toContain('建立程序書');
    expect(names.indexOf('匯出')).toBeLessThan(names.indexOf('建立程序書'));
  });

  it.each(['ICSOPAdmin', 'SysAdmin', 'Supervisor', 'DeptContact'])(
    '🔴 AC-X9 %s 皆可見匯出鈕（匯出屬讀取類動作，**不得**套用 write-only／canWrite 條件式渲染）',
    async (role) => {
      mockAuth(role);
      const { actionsEl } = renderWithTopbar();
      await waitLoaded();
      expect(exportButton(actionsEl)).toBeInTheDocument();
    },
  );

  it('🔒 AC-X9 `建立程序書` 之既有 `canWrite` 行為不變——僅 ICSOPAdmin 有，三個唯讀角色皆無', async () => {
    for (const role of ['SysAdmin', 'Supervisor', 'DeptContact']) {
      mockAuth(role);
      const { actionsEl } = renderWithTopbar();
      await waitLoaded();
      expect(within(actionsEl).queryByText('建立程序書')).toBeNull();
      expect(exportButton(actionsEl)).toBeInTheDocument();
      document.body.innerHTML = '';
      document.querySelectorAll('[data-testid^="topbar-"]').forEach((n) => n.remove());
    }
  });

  it('AC-X10 一般使用者（User）本頁本就被擋下 → 無匯出鈕、不呼叫匯出端點', async () => {
    mockAuth('User');
    const { actionsEl } = renderWithTopbar();
    await screen.findByText('PERMISSION_DENIED · 403');
    expect(within(actionsEl).queryByRole('button', { name: '匯出' })).toBeNull();
    expect(exportDocumentListMock).not.toHaveBeenCalled();
  });

  it('🔴 AC-X12／AC-X13 匯出鈕**不得** `disabled`（事前提示不得以 disabled 實作）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    const btn = exportButton(actionsEl) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('🔴 F017 AC-X11 ①／§13.4 (i)：documentIds ＝ `filtered`，不是 `pageRows`、不是 `all`', () => {
  it('🔒 自證：本 fixture 使 `all`(120)／`filtered`(80)／`pageRows`(50) **三者相異**（否則斷言零鑑別力）', () => {
    expect(ALL_IDS).toHaveLength(120);
    expect(PARTIAL_IDS).toHaveLength(80);
    expect(PARTIAL_IDS).not.toEqual(ALL_IDS);
    expect(PARTIAL_IDS.slice(0, 50)).not.toEqual(PARTIAL_IDS);
  });

  it('🔴 套用 OJT＝`部分完成` 篩選（命中 80 筆、當前在第 1 頁）→ 送出之 id 陣列逐字等於 `filtered.map(d => d.id)`', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.selectOptions(control('OJT') as HTMLSelectElement, '部分完成');
    await waitFor(() => expect(screen.getByText('共 80 筆')).toBeInTheDocument());

    await userEvent.click(exportButton(actionsEl));
    await waitFor(() => expect(exportDocumentListMock).toHaveBeenCalledTimes(1));

    const ids = idsOfLastExportCall();
    expect(ids).toEqual(PARTIAL_IDS);
    // 三個負向對照——任一成立即代表送錯了陣列。
    expect(ids).toHaveLength(80);
    expect(ids).not.toEqual(ALL_IDS);              // ❌ 送了 `all`
    expect(ids).not.toEqual(PARTIAL_IDS.slice(0, 50)); // ❌ 送了 `pageRows`（當前頁 50 筆）
  });

  it('AC-X11 ① 未套用任何篩選 → 送出全部 120 筆（非當前頁之 50 筆）', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.click(exportButton(actionsEl));
    await waitFor(() => expect(exportDocumentListMock).toHaveBeenCalledTimes(1));
    const ids = idsOfLastExportCall();
    expect(ids).toEqual(ALL_IDS);
    expect(ids).toHaveLength(120);
  });

  it('🔴 AC-X11 ② 列序＝畫面**當前排序**——依「程序書編號」升冪排序後匯出，送出之序為排序後之序', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.click(screen.getByRole('button', { name: '依程序書編號排序' }));
    await waitFor(() => expect(screen.getAllByRole('row')[1].textContent).toContain('ICSOP-000'));

    await userEvent.click(exportButton(actionsEl));
    await waitFor(() => expect(exportDocumentListMock).toHaveBeenCalledTimes(1));

    const sortedIds = [...DOCS]
      .sort((a, b) => (a.documentNumber < b.documentNumber ? -1 : a.documentNumber > b.documentNumber ? 1 : 0))
      .map((d) => d.id);
    const ids = idsOfLastExportCall();
    expect(ids).toEqual(sortedIds);
    // 🔒 自證：排序後之序與載入序相異，否則本案對「完全不套排序」之實作恆真。
    expect(sortedIds).not.toEqual(ALL_IDS);
    expect(ids).not.toEqual(ALL_IDS);
  });

  it('AC-X13 篩選後 0 筆（畫面空狀態 `查無符合結果`）→ 匯出鈕仍可按，且以**空陣列**呼叫端點', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(DOCS));
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.selectOptions(control('OJT') as HTMLSelectElement, '已全部完成');
    await waitFor(() => expect(screen.getByText('查無符合結果')).toBeInTheDocument());

    const btn = exportButton(actionsEl) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    await userEvent.click(btn);
    await waitFor(() => expect(exportDocumentListMock).toHaveBeenCalledTimes(1));
    expect(idsOfLastExportCall()).toEqual([]);
  });

  it('🔒 §Interface Contract：呼叫端恰傳兩個引數（id 清單 ＋ 選填 `linkTargetId`），不得夾帶篩選物件', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.click(exportButton(actionsEl));
    await waitFor(() => expect(exportDocumentListMock).toHaveBeenCalledTimes(1));
    const args = exportDocumentListMock.mock.calls[0] as unknown[];
    expect(args.length).toBeLessThanOrEqual(2);
    expect(Array.isArray(args[0])).toBe(true);
    if (args.length === 2) expect(['string', 'undefined']).toContain(typeof args[1]);
  });
});

describe('F017 AC-X14：匯出之使用者可見回饋（逐字文案）', () => {
  it('AC-X14 成功 → 回饋以逐字片段 `已匯出程序書清單（CSV，UTF-8 BOM）` 起始', async () => {
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.click(exportButton(actionsEl));
    expect(await screen.findByText(startsWith(SUCCESS))).toBeInTheDocument();
  });

  it('🔴 AC-X14 超限 → 逐字為本頁專屬句式（量詞「筆數」＋限定詞「篩選條件」）並附錯誤碼標記', async () => {
    exportDocumentListMock.mockRejectedValue(
      new ApiError(400, 'EXPORT_ROW_LIMIT_EXCEEDED', '符合條件之筆數為 10001 筆，超過匯出上限 10000 筆'),
    );
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.click(exportButton(actionsEl));
    const msg = await screen.findByText(OVER_LIMIT(10_001));
    expect(msg).toBeInTheDocument();
    expect(screen.getByText(ERROR_BADGE)).toBeInTheDocument();
    // 🔒 不得與 F037／F038 之句式對齊（該兩處為「事件」＋「查詢條件」）
    expect(msg.textContent).not.toContain('符合條件之事件為');
    expect(msg.textContent).not.toContain('請縮小查詢條件');
    expect(screen.queryByText(startsWith(SUCCESS))).toBeNull();
  });

  it('AC-X14 其他錯誤 → 回饋逐字為 `匯出失敗：{code}`', async () => {
    exportDocumentListMock.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR'));
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.click(exportButton(actionsEl));
    expect(await screen.findByText(startsWith(FAILURE('INTERNAL_ERROR')))).toBeInTheDocument();
    expect(screen.queryByText(startsWith(SUCCESS))).toBeNull();
  });

  it('🔴 AC-X12 前端**不得**執行上限檢查——端點回超限錯誤時，請求確實已送出（提示與檢查不得合流）', async () => {
    exportDocumentListMock.mockRejectedValue(
      new ApiError(400, 'EXPORT_ROW_LIMIT_EXCEEDED', '符合條件之筆數為 10001 筆，超過匯出上限 10000 筆'),
    );
    mockAuth('ICSOPAdmin');
    const { actionsEl } = renderWithTopbar();
    await waitLoaded();
    await userEvent.click(exportButton(actionsEl));
    await waitFor(() => expect(exportDocumentListMock).toHaveBeenCalledTimes(1));
  });
});

describe('🔒 F017 AC-X16：零漣漪回歸鎖定（本 delta 只在 topbar 加一顆鈕）', () => {
  /**
   * 🔴 2026-09-02 F043 delta（`AC-B1`）連坐修正（tdd-implementation 申訴）：15→16 欄。
   * 本測試守護的不變式是「除本 export delta 之外，沒有東西動了畫面」——F043 是**另一個**
   * 合法 delta 動的欄集合，此處就地同步為新的正確基準，並非放寬守衛本身。
   */
  it('AC-X16 ① 表格 16 欄之集合與由左至右順序逐字不變——**特別是「樹狀圖」欄仍在畫面上**', async () => {
    mockAuth('ICSOPAdmin');
    renderWithTopbar();
    await waitLoaded();
    const headers = Array.from(screen.getAllByRole('row')[0].querySelectorAll('th')).map(
      (th) => th.textContent?.trim() ?? '',
    );
    expect(headers).toEqual(SCREEN_COLUMNS);
    expect(headers).toContain('樹狀圖');
    expect(headers).toHaveLength(16);
  });

  /**
   * 🔴 2026-09-02 F043 delta（`AC-B6`）連坐修正（tdd-implementation 申訴）：13→14 項篩選，
   * 「業務/功能類別」為新增之最末項。
   */
  it('AC-X16 ② 14 項篩選之組成與順序逐字不變——F017 匯出 delta 本身不新增任何篩選控制項', async () => {
    mockAuth('ICSOPAdmin');
    renderWithTopbar();
    await waitLoaded();
    const controls = Array.from(
      filterBar().querySelectorAll<HTMLElement>('input[role="combobox"], select, [role="group"]'),
    );
    expect(controls).toHaveLength(14);
    expect(controls.map((el) => el.getAttribute('aria-label'))).toEqual([
      '制定公司', '制定部門', '制定室別', '當責室長', '狀態', '程序書編號', '程序書書名內',
      '公告日期', '連結點程序書', '附錄', '使用表單', 'OJT', '循環別', '業務/功能類別',
    ]);
  });

  it('AC-X16 ④ 3 張統計卡、分頁列與空狀態文案不變', async () => {
    mockAuth('ICSOPAdmin');
    renderWithTopbar();
    await waitLoaded();
    expect(screen.getByText('程序書數量（總數）')).toBeInTheDocument();
    expect(screen.getByText('已公告（公告日期已到）')).toBeInTheDocument();
    expect(screen.getByText('進度中（公告日期未到）')).toBeInTheDocument();
    expect(screen.getByText('共 120 筆 · 每頁 50 筆')).toBeInTheDocument();
  });

  it('AC-X16 ③「清除全部篩選」之涵蓋範圍不因新增匯出鈕而改變（清除後回到 120 筆）', async () => {
    mockAuth('ICSOPAdmin');
    renderWithTopbar();
    await waitLoaded();
    await userEvent.selectOptions(control('OJT') as HTMLSelectElement, '部分完成');
    await waitFor(() => expect(screen.getByText('共 80 筆')).toBeInTheDocument());
    await userEvent.click(screen.getByText('清除全部篩選'));
    await waitFor(() => expect(screen.getByText('共 120 筆')).toBeInTheDocument());
  });
});
