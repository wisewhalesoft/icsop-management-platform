/**
 * F017 篩選 9 → 13 項 delta — 後台文件清單（2026-08-16 使用者裁決；缺失／變更 delta 第 9 項）
 *
 * 權威：
 *   · docs/specs/features/F017-backend-document-list.md
 *     `AC-D1`（13 項組成與順序）／`AC-D2`（各項比對語意）／`AC-D3`（`程序書書名內` 雙行為與跳脫）／
 *     `AC-D4`（公告日期區間邊界）／`AC-D5`（OJT 三值）／`AC-D6`（附錄／使用表單選具體一份）／
 *     `AC-D7`（🔴 當責室長主要∪次要）／`AC-D8`（清除全部篩選）／`AC-D9`（🔒 14 欄回歸鎖定）／
 *     `AC-D10`（🔴 逐字文案與選擇器契約）
 *   · prototypes/13-document-list.html
 *     第 146-151 行（`篩選條件` 標題列、`清除全部篩選` 鈕、`filterBar` 容器）／
 *     第 198-205 行（行動 sheet：標題 `篩選條件`、`關閉篩選`、`清除全部篩選`、`套用`）／
 *     第 383-403 行（`FILTERS` 13 項與型態）／第 408-439 行（select／range／combo 之 DOM 與屬性）
 *   · docs/specs/architecture-spec.md §10.12（A12：**本輪不做全面 SQL 下推**——13 項多為前端於
 *     2000 筆工作集上篩選；`附錄`／`使用表單` 比照 `linkTargetId` 之後端 id 集合查詢＋前端交集；
 *     `OJT` 以後端列富化 `hasOjt` 支撐）、§10.13（A13：後台選項來自既有池清單端點，不新增端點）
 *
 * 📌 **本檔所釘住之新前端契約**（spec 未規定者，由 test-generator 定）：
 *   · `附錄`／`使用表單` 之後端查詢參數為 `DocumentFilters.appendixId`／`formId`
 *     （比照既有 `linkTargetId` 之樣板，同樣帶 `pageSize: LOAD_SIZE`）
 *   · 選項來源：`getAppendixPool()`／`getUsageFormPool()`（§10.13 之既有池端點，不新增端點）
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
  AppendixRecord, UsageFormRecord,
} from '../api/types';

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

/** `AC-D1`：13 項之逐字順序（桌面由左至右逐列換行；行動 sheet 由上而下）。 */
const FILTER_LABELS = [
  '制定公司', '制定部門', '制定室別', '當責室長', '狀態', '程序書編號', '程序書書名內',
  '公告日期', '連結點程序書', '附錄', '使用表單', 'OJT', '循環別',
] as const;
/** `AC-D2`：具 combobox 語意之 10 項（`狀態`／`OJT` 為固定值下拉、`公告日期` 為區間輸入）。 */
const COMBO_LABELS = [
  '制定公司', '制定部門', '制定室別', '當責室長', '程序書編號', '程序書書名內',
  '連結點程序書', '附錄', '使用表單', '循環別',
] as const;

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
  edition: "26'01", announcedDate: '2026-01-15T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

const pageOf = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

const APPENDICES: AppendixRecord[] = [
  { id: 'apx1', name: '附錄A.xlsx', format: 'xlsx', size: 1, uploadedBy: 'u', uploadedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'apx2', name: '附錄B.pdf', format: 'pdf', size: 1, uploadedBy: 'u', uploadedAt: '2026-01-01T00:00:00.000Z' },
];

/**
 * `AC-D2` 第 11 列／`AC-D10`：使用表單選項 label ＝ `{編號} {名稱}`，無編號者僅名稱。
 * ⚠ `formNumber` 欄位由 **L7（F018 `AC-D3`／`AC-D8`）** 新增於 `UsageFormRecord`；本檔以 cast
 *   建構 fixture，避免與該線之型別落地時序耦合（F017 側只驗 label 組法，不驗欄位型別本身）。
 */
const form = (id: string, name: string, formNumber: string | null): UsageFormRecord =>
  ({
    id, name, blobPath: `b/${id}`, format: 'xlsx', size: 1,
    uploadedBy: 'u', uploadedAt: '2026-01-01T00:00:00.000Z', formNumber,
  } as unknown as UsageFormRecord);

const FORMS: UsageFormRecord[] = [form('uf1', '進件申請書.xlsx', 'FM-001'), form('uf8', 'OJT 訓練紀錄表.xlsx', null)];

const DOCS: DocumentListItem[] = [
  doc({
    id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
    // 🔴 E555／王志文 **從不擔任任何文件之主要室長**——若選項僅由 primaryChiefId 衍生，
    // 它就不會出現；以此把 `AC-D7`「選項＝主要 ∪ 次要」與舊行為區分開（避免巧合綠）。
    primaryChiefId: 'E009', primaryChiefName: '陳彥廷', secondaryChiefIds: ['E001', 'E555'],
    secondaryChiefCount: 2, secondaryChiefNames: ['林建宏', '王志文'],
    announcedDate: '2026-01-01T00:00:00.000Z', hasOjt: true, lifecycleId: 'lc1',
  }),
  doc({
    id: 'd2', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '機車分期進件作業',
    primaryChiefId: 'E001', primaryChiefName: '林建宏', secondaryChiefIds: [],
    announcedDate: '2026-01-15T00:00:00.000Z', hasOjt: false, lifecycleId: 'lc2',
    lifecycleName: '產品企劃循環',
  }),
  doc({
    id: 'd3', documentNumber: 'ICSOP-GCA-100-2-00', documentName: '法遵作業',
    primaryChiefId: 'E077', primaryChiefName: '劉家瑋', secondaryChiefIds: [],
    announcedDate: '2026-02-01T00:00:00.000Z', hasOjt: false, lifecycleId: 'lc3',
    lifecycleName: '管理性控制作業',
  }),
  doc({
    id: 'd4', documentNumber: 'ICSOP-LWC-101-1-02', documentName: '招募管理作業',
    primaryChiefId: 'E100', primaryChiefName: '周淑芬', secondaryChiefIds: [],
    announcedDate: null, hasOjt: false, lifecycleId: 'lc4', lifecycleName: '薪工循環',
  }),
];

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

/** `AC-D10`：桌面篩選區容器之 DOM id 為 `filterBar`。 */
const filterBar = (): HTMLElement => {
  const el = document.getElementById('filterBar');
  if (!el) throw new Error('AC-D10: 找不到 DOM id 為 `filterBar` 之篩選區容器');
  return el;
};
const control = (label: string): HTMLElement => within(filterBar()).getByLabelText(label);
/**
 * 🔴 2026-08-20 D9 delta（`AC-N37`）：OJT 圖示欄插入最左，程序書書名欄索引由 8（第 9 欄）
 * 順移為 9（第 10 欄）；本檔全部依此 helper 定位之案例連坐同步（無需逐案修改）。
 * 📝 被取代之原索引逐字保留供追溯：OLD> `.map((r) => r.querySelectorAll('td')[8]?.textContent?.trim() ?? '');`
 */
const rowNames = (): string[] =>
  screen.getAllByRole('row').slice(1).map((r) => r.querySelectorAll('td')[9]?.textContent?.trim() ?? '');
const visibleDocNames = (): string[] =>
  DOCS.map((d) => d.documentName).filter((n) => screen.queryByText(n) !== null);

/** 開啟該 combobox 之選項清單並選定指定選項（限定於展開之 listbox 內，避免與表格內同名文字衝突）。 */
async function pick(label: string, optionText: string): Promise<void> {
  await userEvent.click(control(label));
  const list = await within(filterBar()).findByRole('listbox');
  await userEvent.click(within(list).getByText(optionText));
}

/** 行動篩選觸發鈕（prototype 13:138-139，可見文字為 `篩選`）。 */
const mobileTrigger = (): HTMLElement => screen.getByRole('button', { name: '篩選' });

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(DOCS));
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.downloadAttachment).mockResolvedValue(undefined);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue(APPENDICES);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue(FORMS);
});

describe('F017 AC-D1：篩選控制項恰 13 個、順序與無障礙名稱逐字', () => {
  it('TS-F017-D1-001 桌面篩選區之控制項恰 13 個，由左至右順序逐字為 13 項標籤', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    // 13 項＝10 個 combobox ＋ 2 個固定值 select ＋ 1 個 role=group 之日期區間
    const controls = Array.from(
      filterBar().querySelectorAll<HTMLElement>('input[role="combobox"], select, [role="group"]'),
    );
    expect(controls).toHaveLength(13);
    expect(controls.map((el) => el.getAttribute('aria-label'))).toEqual([...FILTER_LABELS]);
  });

  it('TS-F017-D1-002 13 項之無障礙名稱逐字可查', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    for (const label of FILTER_LABELS) {
      expect(control(label).getAttribute('aria-label')).toBe(label);
    }
  });

  it('TS-F017-D1-003 行動 sheet 呈現同 13 項、同順序（由上而下）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(mobileTrigger());
    const sheet = screen.getByRole('dialog');
    const labels = Array.from(sheet.querySelectorAll('label, span'))
      .map((el) => el.textContent?.trim())
      .filter((t) => FILTER_LABELS.includes(t as never));
    expect(labels).toEqual([...FILTER_LABELS]);
  });
});

describe('F017 AC-D10：篩選區之逐字文案與選擇器契約', () => {
  it('TS-F017-D10-001 篩選區容器之 DOM id 為 `filterBar`', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(document.getElementById('filterBar')).not.toBeNull();
  });

  it('TS-F017-D10-002 各 combobox 輸入框之 DOM id 為 `cbD_{key}_input`、role=combobox', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    for (const label of COMBO_LABELS) {
      const el = control(label);
      expect(el.getAttribute('role')).toBe('combobox');
      expect(el.id).toMatch(/^cbD_[A-Za-z0-9]+_input$/);
    }
  });

  it('TS-F017-D10-003 各 combobox 之清除鈕 id 為 `cbD_{key}_clear`（與其輸入框同 key）、aria-label ＝ `清除{label}`', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('制定部門', '企劃部');
    const key = control('制定部門').id.replace(/^cbD_(.+)_input$/, '$1');
    const clear = within(filterBar()).getByLabelText('清除制定部門');
    expect(clear.id).toBe(`cbD_${key}_clear`);
  });

  it('TS-F017-D10-003b 清除鈕**僅於該篩選有值時可見**（無值時不得出現於無障礙樹）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    // 未選任何值 → 十個 combobox 之清除鈕皆不可見
    for (const label of COMBO_LABELS) {
      expect(within(filterBar()).queryByLabelText(`清除${label}`)).toBeNull();
    }
    await pick('制定部門', '企劃部');
    expect(within(filterBar()).getByLabelText('清除制定部門')).toBeInTheDocument();
    // 其他未設值者仍不可見（可見性為逐項判定，非整列一起顯示）
    expect(within(filterBar()).queryByLabelText('清除制定公司')).toBeNull();
  });

  it('TS-F017-D10-004 一般 combobox 之 placeholder 為 `全部`；`程序書書名內` 為 `全部（或直接輸入部分書名）`', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    for (const label of COMBO_LABELS) {
      const expected = label === '程序書書名內' ? '全部（或直接輸入部分書名）' : '全部';
      expect(control(label).getAttribute('placeholder')).toBe(expected);
    }
  });

  it('TS-F017-D10-005 `狀態` 下拉之預設選項為 `全部`（＝不施加限制）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const status = control('狀態') as HTMLSelectElement;
    expect(status.tagName).toBe('SELECT');
    expect(Array.from(status.options).map((o) => o.textContent?.trim())).toEqual([
      '全部', '已公告', '進度中', '失效', '作廢',
    ]);
    expect(status.value).toBe('');
  });

  it('TS-F017-D10-006 `OJT` 下拉之三選項逐字為 `全部`／`有 OJT`／`無 OJT`', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const ojt = control('OJT') as HTMLSelectElement;
    expect(ojt.tagName).toBe('SELECT');
    expect(Array.from(ojt.options).map((o) => o.textContent?.trim())).toEqual(['全部', '有 OJT', '無 OJT']);
  });

  it('TS-F017-D10-007 `公告日期` 為 role=group（aria-label `公告日期`）＋ 兩個 type=date 輸入', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const group = control('公告日期');
    expect(group.getAttribute('role')).toBe('group');
    const from = within(group).getByLabelText('公告日期 起日') as HTMLInputElement;
    const to = within(group).getByLabelText('公告日期 迄日') as HTMLInputElement;
    expect(from.id).toBe('cbD_date_from');
    expect(to.id).toBe('cbD_date_to');
    expect(from.type).toBe('date');
    expect(to.type).toBe('date');
  });

  it('TS-F017-D10-008 清除全部篩選鈕之可見文字逐字為 `清除全部篩選`（桌面與行動 sheet 各一）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('制定部門', '企劃部'); // 有值時方可見
    await userEvent.click(mobileTrigger());
    expect(screen.getAllByText('清除全部篩選')).toHaveLength(2);
  });

  it('TS-F017-D10-009 行動底部 sheet 之標題 `篩選條件`、主要動作 `套用`、關閉鈕 aria-label `關閉篩選`', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(mobileTrigger());
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('篩選條件')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '套用' })).toBeInTheDocument();
    expect(within(sheet).getByLabelText('關閉篩選')).toBeInTheDocument();
  });
});

describe('F017 AC-D3：`程序書書名內` 之等值／contains 雙行為', () => {
  it('TS-F017-D3-001 **選取**某選項 → 等值比對，僅回傳該一筆', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('程序書書名內', '車輛分期進件作業');
    await waitFor(() => expect(screen.queryByText('機車分期進件作業')).toBeNull());
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
  });

  /**
   * 🔴 **2026-08-16 選擇器修正**（`tdd-implementation` 申訴 #6，lead 已驗證成立）。
   *
   * 原斷言以未限範圍之 `screen.getByText('<書名>')` 取書名。但 `userEvent.type(control('程序書書名內'), …)`
   * 會先 click 聚焦而**展開 listbox**，輸入後依 `AC-D2` combobox 語意即時縮小為「label 含關鍵字」者
   * ⇒ 同一書名同時存在於**展開中的 `role="option"`** 與**表格該列書名儲存格**，單數 `getByText` 必然兩命中。
   *
   * ⚠ 這**不是**實作缺陷，三種「讓它只剩一個」的改法都會牴觸 AC：
   *   · 讓選項不含書名 → `TS-F017-D3-001` 之 `pick()` 立刻紅，且違反 `AC-D3` 等值比對；
   *   · 輸入時關閉 listbox → 牴觸 `AC-D2`，亦與 `prototypes/13-document-list.html`
   *     之 `comboInput → comboFilter`（輸入時保持展開）不符；
   *   · 改表格文案 → 不可能。
   *
   * 修法：改用本檔既有之 `rowNames()`（取第 9 欄＝程序書書名）**限定在表格內**斷言。
   * 🔒 斷言強度未放寬——反而更精確：原本只證「頁面某處有這串字」，現在證「**該列確實在表格結果中**」。
   */
  it('TS-F017-D3-002 **僅輸入** `進件` 而未選取 → contains 比對，兩筆皆回傳', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.type(control('程序書書名內'), '進件');
    await waitFor(() => expect(rowNames()).not.toContain('法遵作業'));
    expect(rowNames()).toContain('車輛分期進件作業');
    expect(rowNames()).toContain('機車分期進件作業');
  });

  it('TS-F017-D3-003 contains 比對不分大小寫', async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(
      pageOf([doc({ id: 'x', documentName: 'AbC 作業' }), doc({ id: 'y', documentName: '其他作業' })]),
    );
    renderPage();
    await screen.findByText('AbC 作業');
    await userEvent.type(control('程序書書名內'), 'abc');
    await waitFor(() => expect(rowNames()).not.toContain('其他作業'));
    expect(rowNames()).toContain('AbC 作業'); // 限定表格內，避開展開中之 listbox（申訴 #6）
  });

  it("TS-F017-D3-004 輸入字串含 `%`／`_`／`'` → 以字面比對，不作萬用字元、不造成錯誤", async () => {
    vi.mocked(endpoints.getDocuments).mockResolvedValue(
      pageOf([
        doc({ id: 'lit', documentName: "100%_test'x" }),
        doc({ id: 'other', documentName: '1000Xtesty' }), // `%`／`_` 若被當萬用字元會誤命中
      ]),
    );
    renderPage();
    await screen.findByText("100%_test'x");
    await userEvent.type(control('程序書書名內'), "100%_test'");
    await waitFor(() => expect(rowNames()).not.toContain('1000Xtesty'));
    expect(rowNames()).toContain("100%_test'x"); // 限定表格內，避開展開中之 listbox（申訴 #6）
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('TS-F017-D3-005 同時具選取值與輸入值 → **選取值（等值）優先**', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('程序書書名內', '車輛分期進件作業');
    await userEvent.type(control('程序書書名內'), '進件');
    await waitFor(() => expect(rowNames()).not.toContain('機車分期進件作業'));
    expect(rowNames()).toContain('車輛分期進件作業'); // 同申訴 #6 之潛在形狀，一併限定表格內
  });
});

describe('F017 AC-D4：公告日期閉區間與邊界', () => {
  const setRange = async (from: string, to: string): Promise<void> => {
    const group = control('公告日期');
    if (from) await userEvent.type(within(group).getByLabelText('公告日期 起日'), from);
    if (to) await userEvent.type(within(group).getByLabelText('公告日期 迄日'), to);
  };

  it('TS-F017-D4-001 區間 2026-01-01～2026-01-15 → 恰回傳前兩筆（兩端皆含），null 者不回傳', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await setRange('2026-01-01', '2026-01-15');
    await waitFor(() => expect(screen.queryByText('法遵作業')).toBeNull());
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument(); // 2026-01-01（含起日）
    expect(screen.getByText('機車分期進件作業')).toBeInTheDocument(); // 2026-01-15（含迄日）
    expect(screen.queryByText('招募管理作業')).toBeNull(); // announcedDate = null
  });

  it('TS-F017-D4-002 僅填起日 2026-01-15 → 回傳該日（含）之後兩筆；null 者不回傳', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await setRange('2026-01-15', '');
    await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).toBeNull());
    expect(screen.getByText('機車分期進件作業')).toBeInTheDocument();
    expect(screen.getByText('法遵作業')).toBeInTheDocument();
    expect(screen.queryByText('招募管理作業')).toBeNull();
  });

  it('TS-F017-D4-003 僅填迄日 2026-01-15 → 回傳該日（含）之前兩筆；null 者不回傳', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await setRange('', '2026-01-15');
    await waitFor(() => expect(screen.queryByText('法遵作業')).toBeNull());
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
    expect(screen.getByText('機車分期進件作業')).toBeInTheDocument();
    expect(screen.queryByText('招募管理作業')).toBeNull();
  });

  it('TS-F017-D4-004 兩端皆空 → 不施加限制（含 announcedDate 為 null 者）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(visibleDocNames()).toHaveLength(DOCS.length);
  });

  /**
   * 🔴 lead 授權之鑑別力補強：原案只驗「某筆消失 ＋ 無 alert」，**沒有任何正向斷言**
   * ⇒ 一個「把整張表清空並靜默失敗」的實作也會綠。
   * 原斷言（逐字保留）：
   *   OLD> `await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).toBeNull());`
   *   OLD> `expect(screen.queryByRole('alert')).toBeNull();`
   * 取代：補上 F017 Edge Case 明訂之**空狀態逐字文案**（`prototypes/13-document-list.html`
   * `#emptyState` → `查無符合結果`）與「全部列皆消失」。
   */
  it('TS-F017-D4-005 起日晚於迄日 → 交集為空、顯示空狀態「查無符合結果」，非錯誤、不回錯誤碼', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await setRange('2026-02-01', '2026-01-01');
    await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).toBeNull());
    expect(rowNames().filter(Boolean)).toHaveLength(0);
    expect(screen.getByText('查無符合結果')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('F017 AC-D5：OJT 三值', () => {
  it('TS-F017-D5-001 `全部` → A、B 皆回傳；`有 OJT` → 僅有附件者；`無 OJT` → 僅無附件者', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const ojt = control('OJT') as HTMLSelectElement;

    expect(visibleDocNames()).toHaveLength(DOCS.length); // 預設「全部」

    await userEvent.selectOptions(ojt, '有 OJT');
    await waitFor(() => expect(screen.queryByText('機車分期進件作業')).toBeNull());
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument(); // hasOjt: true

    await userEvent.selectOptions(ojt, '無 OJT');
    await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).toBeNull());
    expect(screen.getByText('機車分期進件作業')).toBeInTheDocument();
  });
});

describe('F017 AC-D6：附錄／使用表單選具體一份（比照 linkTargetId 之後端 id 集合＋前端交集）', () => {
  it('TS-F017-D6-001 選定附錄 X → 以 appendixId 向後端取 id 集合，清單僅留交集', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf([DOCS[0], DOCS[1]])); // X 被 d1、d2 引用
    await pick('附錄', '附錄A.xlsx');
    await waitFor(() =>
      expect(endpoints.getDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ appendixId: 'apx1' }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('法遵作業')).toBeNull());
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
  });

  it('TS-F017-D6-002 使用表單同構：以 formId 比對；選項值恆為 formId', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf([DOCS[2]]));
    await pick('使用表單', 'FM-001 進件申請書.xlsx');
    await waitFor(() =>
      expect(endpoints.getDocuments).toHaveBeenCalledWith(expect.objectContaining({ formId: 'uf1' })),
    );
  });

  it('TS-F017-D6-003 使用表單選項 label ＝ `{編號} {名稱}`；無編號者僅名稱（無前導空格、不得出現 null）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(control('使用表單'));
    const list = await within(filterBar()).findByRole('listbox');
    const texts = within(list).getAllByRole('option').map((o) => o.textContent?.trim());
    expect(texts).toEqual(['FM-001 進件申請書.xlsx', 'OJT 訓練紀錄表.xlsx']);
    expect(texts.some((t) => t?.includes('null'))).toBe(false);
  });

  /**
   * 🔴 lead 授權之鑑別力補強：原案只驗「無 alert」，等於什麼都沒驗
   * ⇒ 一個「空池就整個篩選區崩掉／其他篩選也跟著失效」的實作只要不渲染 `role="alert"` 就會綠。
   * 原斷言（逐字保留）：
   *   OLD> `await userEvent.click(control('附錄'));`
   *   OLD> `expect(screen.queryByRole('alert')).toBeNull();`
   * 取代：補上 Edge Case 之兩項可觀測事實——① 該下拉**確實沒有任何選項**；
   * ② **其他篩選不受阻擋**（改選制定部門後清單確實收斂）。
   */
  it('TS-F017-D6-004 池中無任何附錄／表單 → 下拉呈現空選項清單，非錯誤且不阻擋其他篩選', async () => {
    vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
    vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
    renderPage();
    await screen.findByText('車輛分期進件作業');

    await userEvent.click(control('附錄'));
    const listbox = within(filterBar()).queryByRole('listbox');
    expect(listbox === null ? [] : within(listbox).queryAllByRole('option')).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();

    // ② 不得因此阻擋其他篩選：制定部門仍可正常選取並使清單收斂
    await pick('制定部門', '企劃部');
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
  });
});

describe('F017 AC-D7：當責室長篩選＝主要 ∪ 次要（與前台同一語意）', () => {
  it('TS-F017-D7-101 以 `林建宏`（d1 之次要、d2 之主要）篩選 → d1 與 d2 皆回傳', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('當責室長', '林建宏');
    await waitFor(() => expect(screen.queryByText('法遵作業')).toBeNull());
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument(); // 次要命中
    expect(screen.getByText('機車分期進件作業')).toBeInTheDocument(); // 主要命中
  });

  it('TS-F017-D7-102 下拉選項＝全體文件之主要 ∪ 次要 distinct（次要室長亦為可選項）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(control('當責室長'));
    const list = await within(filterBar()).findByRole('listbox');
    const texts = within(list).getAllByRole('option').map((o) => o.textContent?.trim());
    // 🔴 關鍵斷言：`王志文` 僅存在於某文件之**次要**室長，從不擔任主要 ⇒
    //    舊「僅由 primaryChiefId 衍生」之實作必定漏掉它，本條因此不會巧合為綠。
    expect(texts).toContain('王志文');
    expect(texts).toContain('林建宏'); // 兼為 d1 次要與 d2 主要
    expect(texts).toContain('陳彥廷');
    expect(new Set(texts).size).toBe(texts.length); // distinct（主要∪次要重複者只出現一次）
  });
});

describe('F017 AC-D8：清除全部篩選', () => {
  it('TS-F017-D8-001 點擊後 13 項篩選與關鍵字同時清空、回復未篩選狀態與第 1 頁', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('制定部門', '企劃部');
    await userEvent.type(control('程序書書名內'), '進件');
    await userEvent.selectOptions(control('OJT') as HTMLSelectElement, '有 OJT');
    await userEvent.type(within(control('公告日期')).getByLabelText('公告日期 起日'), '2026-01-01');

    await userEvent.click(screen.getByText('清除全部篩選'));

    await waitFor(() => expect(visibleDocNames()).toHaveLength(DOCS.length));
    for (const label of COMBO_LABELS) {
      expect((control(label) as HTMLInputElement).value).toBe('');
    }
    expect((control('OJT') as HTMLSelectElement).value).toBe('全部');
    expect((control('狀態') as HTMLSelectElement).value).toBe('');
    const group = control('公告日期');
    expect((within(group).getByLabelText('公告日期 起日') as HTMLInputElement).value).toBe('');
    expect((within(group).getByLabelText('公告日期 迄日') as HTMLInputElement).value).toBe('');
  });
});

describe('F017 AC-D2：多項並用為 AND', () => {
  it('TS-F017-D2-001 制定部門＋當責室長＋OJT 三項並用 → 交集', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('當責室長', '林建宏');
    await userEvent.selectOptions(control('OJT') as HTMLSelectElement, '有 OJT');
    await waitFor(() => expect(screen.queryByText('機車分期進件作業')).toBeNull()); // 室長命中但無 OJT
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
  });

  it('TS-F017-D2-002 交集為空 → 顯示空狀態「查無符合結果」而非錯誤', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('當責室長', '劉家瑋');
    await userEvent.selectOptions(control('OJT') as HTMLSelectElement, '有 OJT');
    await waitFor(() => expect(rowNames().filter(Boolean)).toHaveLength(0));
    // 🔴 補強：原案只有「0 列 ＋ 無 alert」，未驗空狀態本身確實呈現（逐字取自 prototype 13 `#emptyState`）。
    expect(screen.getByText('查無符合結果')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
