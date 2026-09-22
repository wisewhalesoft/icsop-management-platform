/**
 * F042 UX16 delta — `AC-UX45`（本部四段顯示，pass-through）／`AC-UX49`（制定本部篩選，項 15）／
 * `AC-UX51`／`AC-UX52`／`AC-UX53`／`AC-UX55`（匯出，項 16）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md#ux16-delta。
 * docs/specs/architecture-spec.md §16.8（`ARCH-UX8`：`GET admin/ojt-progress/export?…`，
 * 非 `POST + documentIds`）。
 *
 * ⚠ 對實作全盲：`endpoints.exportOjtProgress` 尚不存在——比照既有
 * `DocumentListPage.export.test.tsx` 之 `vi.hoisted` ＋ `importOriginal` 展開寫法，使
 * automock 不因該鍵缺席而讓整檔死在錯的理由上（`beforeEach` 之 `undefined.then()` 陷阱）。
 * 端點函式命名（`exportOjtProgress`）為 test-generator 依既有 `exportDocumentList` 命名風格
 * 之決定，非規格鎖定值；若與 tdd-implementation 之實際命名不同，走 mailbox 申訴。
 *
 * 🔴 本檔不重複驗證既有 `OjtProgressPage.test.tsx` 之絕對值鎖就地改寫（見該檔）；亦不驗證
 * CSV 內容本身（見 `ojt-progress-export-columns.spec.ts`，後端純函式層）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OjtProgressPage } from './OjtProgressPage';
import { ToastProvider } from '../components/useToast';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

const exportOjtProgressMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('../api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(actual)) mocked[k] = typeof v === 'function' ? vi.fn() : v;
  mocked.exportOjtProgress = exportOjtProgressMock;
  return mocked;
});
vi.mock('../auth/useAuth');

// 匯入放在 vi.mock 之後，取得 mocked 版本（比照既有 DocumentListPage.export.test.tsx 慣例）。
import * as endpoints from '../api/endpoints';

function mockAuth(roleCode: string): void {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const rowFixture = (over: Partial<{
  documentId: string; documentNumber: string; documentName: string;
  companyCode: string; orgCode: string; orgName: string; sessionCount: number; completed: boolean;
  inactive: boolean; orphaned: boolean;
  currentEditionSessionCount: number; trainingEdition: string | null;
  documentEdition: string | null; announcedDate: string | null;
}> = {}) => ({
  documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  companyCode: 'AS', orgCode: 'JAC00', orgName: '和潤企業 / 營運管理部 / 審查室', sessionCount: 1, completed: true,
  inactive: false, orphaned: false,
  currentEditionSessionCount: 1, trainingEdition: null, documentEdition: null, announcedDate: null,
  ...over,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <OjtProgressPage />
      </MemoryRouter>
    </ToastProvider>,
  );

function setupMocks() {
  vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue({
    coverage: { numerator: 0, denominator: 0, excludedInactive: 0, excludedOrphaned: 0 },
    docCoverage: { scope: 'incomplete', maxRows: 15, items: [], shown: 0, hidden: 0, totalDocuments: 0, byState: { all: 0, partial: 0, none: 0, unassigned: 0 }, incompleteTotal: 0 },
    deptRollup: [], recentSessions: [],
  } as never);
  vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: [rowFixture()], total: 1 });
  vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({ items: [] });
  exportOjtProgressMock.mockReset();
  exportOjtProgressMock.mockResolvedValue(undefined);
}

/** `AC-UX55` ⑤-b：toast 容器之掛鉤為 `data-ojt-export-toast`（屬性選擇器，非 `data-testid`）。 */
async function findExportToast(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('[data-ojt-export-toast]')).not.toBeNull());
  return document.querySelector('[data-ojt-export-toast]') as HTMLElement;
}

async function gotoSessionsTab() {
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(document.querySelector('[data-ojt-tab="sessions"]')).not.toBeNull());
  if (document.querySelector('[data-ojt-tab="dashboard"]')) {
    await user.click(document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement);
  }
  await waitFor(() => expect(document.querySelector('[data-ojt-filter-bar]')).toBeInTheDocument());
}

describe('OjtProgressPage — UX16 delta AC-UX45（本部四段 orgName 之呈現，pass-through）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    setupMocks();
  });

  it('四段格式之 orgName（含本部）逐字顯示，不被截斷或重新格式化為三段', async () => {
    vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({
      items: [rowFixture({ orgName: '和潤企業 / 營運管理部 / 審查室' })],
      total: 1,
    });
    await gotoSessionsTab();
    await waitFor(() => expect(screen.getByText('和潤企業 / 營運管理部 / 審查室')).toBeInTheDocument());
  });
});

describe('OjtProgressPage — UX16 delta AC-UX49（TAB2 新增「制定本部」篩選）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    setupMocks();
  });

  it('新控制項之 placeholder option 逐字「所有制定本部」，value 為空字串（不施加限制）', async () => {
    await gotoSessionsTab();
    const select = document.querySelector('[data-ojt-filter="division"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options[0]?.textContent).toBe('所有制定本部');
    expect(select.options[0]?.value).toBe('');
  });

  it('既有「所有完成狀態」仍在（AC-UX54⑦ 之對偶鎖：新控制項不得取代既有選項文案）', async () => {
    await gotoSessionsTab();
    const statusSelect = document.querySelector('[data-ojt-filter="status"]') as HTMLSelectElement;
    expect(statusSelect.options[0]?.textContent).toBe('所有完成狀態');
  });

  it('aria-label 逐字為「制定本部」', async () => {
    await gotoSessionsTab();
    const select = document.querySelector('[data-ojt-filter="division"]') as HTMLSelectElement;
    expect(select.getAttribute('aria-label')).toBe('制定本部');
  });
});

describe('OjtProgressPage — UX16 delta AC-UX51（匯出鈕）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    setupMocks();
  });

  it('TAB2 存在恰一顆匯出鈕，aria-label 逐字「匯出」，掛鉤 data-ojt-export', async () => {
    await gotoSessionsTab();
    const buttons = screen.getAllByRole('button', { name: '匯出' });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].hasAttribute('data-ojt-export')).toBe(true);
  });

  it('點擊匯出 → 呼叫 exportOjtProgress（依當前三項篩選）', async () => {
    const user = userEvent.setup();
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    await waitFor(() => expect(exportOjtProgressMock).toHaveBeenCalled());
  });
});

describe('OjtProgressPage — UX16 delta AC-UX55（匯出成功之 toast，三段文字）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    setupMocks();
  });

  it('① 第 1 句恆出現：已匯出 OJT 進度清單（CSV，UTF-8 BOM）：共 {N} 筆——N 為匯出筆數，非畫面列數', async () => {
    const user = userEvent.setup();
    // 🔴 語料鑑別力（AC-UX55①）：畫面僅 1 列，但 exportOjtProgress 之回應宣稱匯出 340 筆。
    exportOjtProgressMock.mockResolvedValue({ count: 340 } as never);
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    const toast = await findExportToast();
    expect(toast.textContent).toContain('共 340 筆');
    expect(toast.textContent).not.toContain('共 1 筆');
  });

  /**
   * 🔴 降級行為（本批新增，`X-Export-Row-Count` 標頭缺失／不可解析）——lead 已核准（2026-09-22）：
   * `GET /admin/ojt-progress/export` 之匯出筆數改由回應標頭 `X-Export-Row-Count` 提供，
   * `downloadViaBlob()` 回傳型別 additive 擴充以攜帶回應標頭（擁有權：`impl-ojt`）。
   * 本專案代理白名單（nginx／vite）**已經漏過標頭四次**（見 `docs/specs/implementation-log/UX16-SESSION-HANDOFF.md`），
   * 標頭被中間層吃掉是真實會發生的形狀，非假設性防禦。
   *
   * 🔴 硬條件（lead 指定，不得妥協）：標頭缺失時**不得回退為畫面列數**——那正是 `AC-UX55` ①
   * 明令禁止的「說了假話」（跟著畫面說 12，就從『沒說清楚』惡化為『說了假話』）。
   *
   * 🔴 wire 形狀（test-generator 決定，additive，向下相容既有 `{ count: number }` 夾具）：
   * `exportOjtProgress()` 解析回應為 `{ count: number | null }`——標頭缺失或 `Number.isFinite`
   * 為 `false`（含 `NaN`，即標頭存在但值不可解析）時，`count` 為 `null`；兩種根因皆收斂為
   * 同一降級文案，**不區分**「缺失」與「不可解析」給使用者看（區分對使用者無意義，見 AC-UX55④
   * 「使用者語言」判準）。若實際落點不同（如另包一層 `{ count, source }`），屬合理 test-dispute。
   *
   * 🔒 降級文案（test-generator 定案，逐字）：
   * `已匯出 OJT 進度清單（CSV，UTF-8 BOM）；系統暫時無法確認筆數，請以下載檔案為準。`
   * ——不含任何數字（不捏造、不回退畫面列數）、不含內部詞彙（無「標頭」「header」「X-Export-Row-Count」），
   * 回答的是「我拿到的是什麼」之同一個使用者問題（AC-UX55④ 之判準）。第 2、3 句之出現條件不受影響
   * （AC-UX55⑦：本條改的是「有沒有告訴使用者」，不是「匯出什麼」）。
   */
  it('🔴 降級：X-Export-Row-Count 標頭缺失（count 為 null）→ 不得回退為畫面列數，且不得捏造任何數字', async () => {
    const user = userEvent.setup();
    // 語料鑑別力：畫面仍是 1 列。若實作偷懶回退為畫面列數，toast 會冒出「共 1 筆」。
    exportOjtProgressMock.mockResolvedValue({ count: null } as never);
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    const toast = await findExportToast();
    expect(toast.textContent).not.toMatch(/共\s*\d+\s*筆/);
    expect(toast.textContent).toContain('已匯出 OJT 進度清單（CSV，UTF-8 BOM）');
    expect(toast.textContent).toContain('請以下載檔案為準');
    // 第 2 句仍在（AC-UX55⑦）：降級的是「有沒有告訴使用者筆數」，不是整段範圍說明。
    expect(toast.textContent).toContain('匯出內容依「制定本部」「搜尋使用單位」「完成狀態」三項條件。');
  });

  it('🔴 降級：X-Export-Row-Count 標頭存在但不可解析（count 為 NaN）→ 比照標頭缺失之同一降級處置', async () => {
    const user = userEvent.setup();
    exportOjtProgressMock.mockResolvedValue({ count: NaN } as never);
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    const toast = await findExportToast();
    expect(toast.textContent).not.toMatch(/共\s*\d+\s*筆/);
    expect(toast.textContent).toContain('請以下載檔案為準');
  });

  it('🔴 降級文案同樣不得出現只對實作者有意義之內部詞彙（呼應 AC-UX55④，度量對象換成降級分支）', async () => {
    const user = userEvent.setup();
    exportOjtProgressMock.mockResolvedValue({ count: null } as never);
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    const toast = await findExportToast();
    expect(toast.textContent).not.toMatch(/data-ojt/);
    expect(toast.textContent).not.toMatch(/AC-UX/);
    expect(toast.textContent).not.toMatch(/篩選項/);
    expect(toast.textContent).not.toMatch(/header|標頭|X-Export-Row-Count/i);
    // 正向探針：確保 toast 確實渲染（否則裸掃描在空字串上也是綠的）。
    expect(toast.textContent).toContain('已匯出 OJT 進度清單');
  });

  it('🔴 count 為 0（真實匯出 0 筆）與「標頭缺失/不可解析」不得混淆——0 為合法數字，須逐字顯示「共 0 筆」', async () => {
    // 🔴 語料鑑別力：guard 一種常見偷懶寫法 `if (!count)`——0 是 falsy，天真判斷會誤觸降級分支。
    const user = userEvent.setup();
    exportOjtProgressMock.mockResolvedValue({ count: 0 } as never);
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    const toast = await findExportToast();
    expect(toast.textContent).toContain('共 0 筆');
    expect(toast.textContent).not.toContain('請以下載檔案為準');
  });

  it('② 第 2 句恆出現：匯出內容依「制定本部」「搜尋使用單位」「完成狀態」三項條件。', async () => {
    const user = userEvent.setup();
    exportOjtProgressMock.mockResolvedValue({ count: 1 } as never);
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    const toast = await findExportToast();
    expect(toast.textContent).toContain('匯出內容依「制定本部」「搜尋使用單位」「完成狀態」三項條件。');
  });

  it('🔴 ④ 使用者語言：toast 文字不得出現內部詞彙（data-ojt-*／AC-UX 編號／「篩選項」）', async () => {
    const user = userEvent.setup();
    exportOjtProgressMock.mockResolvedValue({ count: 1 } as never);
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    const toast = await findExportToast();
    expect(toast.textContent).not.toMatch(/data-ojt/);
    expect(toast.textContent).not.toMatch(/AC-UX/);
    expect(toast.textContent).not.toMatch(/篩選項/);
    // 正向探針：確保 toast 確實渲染（否則上面的裸掃描在空字串上也是綠的）。
    expect(toast.textContent).toContain('已匯出 OJT 進度清單');
  });

  it('⑤-b DOM 掛鉤：toast 容器帶 data-ojt-export-toast（本條全部斷言之定位點）', async () => {
    const user = userEvent.setup();
    exportOjtProgressMock.mockResolvedValue({ count: 1 } as never);
    await gotoSessionsTab();
    await user.click(screen.getByRole('button', { name: '匯出' }));
    const toast = await findExportToast();
    expect(toast.hasAttribute('data-ojt-export-toast')).toBe(true);
  });
});
