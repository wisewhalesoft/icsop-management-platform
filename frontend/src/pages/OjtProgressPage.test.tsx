import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OjtProgressPage } from './OjtProgressPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';
/**
 * 🔴 2026-09-01（`AC-30`～`AC-36`）：TAB2 分組模式之逐字文案與百分比推導點，一律自
 * `ojt-progress-view` **import 常數／函式**作斷言，**不在本檔硬寫中文文案字面**——
 * 其逐字鎖只存在於 `ojt-progress-view.test.ts` §一（全環唯一一份）。同一組文案在兩處
 * 各打一份即為分歧之起點（本規格集之既有原則，`AC-35`）。
 */
import {
  GROUP_MODE_ORG_TEXT,
  GROUP_MODE_DOC_TEXT,
  GROUP_MODE_ARIA_TEXT,
  DOC_SEARCH_ARIA_TEXT,
  DOC_SEARCH_PLACEHOLDER_TEXT,
  DOC_GROUP_BASIS_NOTE_TEXT,
  docGroupRatioText,
  docGroupPercentText,
  EMPTY_ROWS_TEXT,
  EMPTY_ALL_TEXT,
  EMPTY_ALL_HINT,
} from './ojt-progress-view';

/**
 * F042 OJT 進度管理 — 後台獨立管理頁（AC-01~AC-29，DOM 契約權威＝prototypes/25-ojt-progress.html）。
 * 權威：docs/specs/features/F042-ojt-progress-management.md
 *   §prototype 25 DOM 掛鉤對照（`AC-28` 之落點）＋ AC-01~AC-29 正文。
 *
 * ⚠ 對實作全盲：`./OjtProgressPage` 尚不存在，`../api/endpoints` 尚不含本檔所需之 8 個函式
 * ——import 失敗即本環之預期紅燈。逐字文案與 `data-*` 掛鉤逐字取自 prototype 25（已由 ux-ojt
 * 定稿並回寫 F042 §prototype 25 DOM 掛鉤對照），非本檔臆造；凡標「設計裁量」者為本檔自行選定、
 * 非規格鎖定值。
 *
 * 🔴 本輪約束環為簡化版（僅 backend jest ＋ frontend vitest，無 Playwright fidelity）
 * ⇒ 本檔（連同 AC-28）是本 feature 前端行為唯一防線。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <OjtProgressPage />
      </MemoryRouter>
    </ToastProvider>,
  );

// ===================== 共用 fixtures =====================

/**
 * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，命名互斥）：`done`／`total` 與
 * `exclusion.inactiveCount`／`orphanedCount` 為本環自行命名，與 backend 環（`ojt-progress.test-support.ts`
 * 之 `docCoverage[].totalUnits`／`completedUnits`、`coverage.excludedInactive`／`excludedOrphaned`）
 * 互斥——同一個 `GET /admin/ojt-progress/summary` 回應不可能同時有兩組欄名。
 * 裁定＝**backend 環之命名為 canonical**：`docCoverage.totalUnits`／`completedUnits` 逐字取自
 * `docs/specs/data-model.md` §建議查詢形狀（AC-14 覆蓋率 SQL：`COUNT(*) AS totalUnits, SUM(completed)
 * AS completedUnits`，非任一環臆造）；`coverage.excludedInactive`／`excludedOrphaned` 為扁平掛在
 * `coverage` 物件下（與既有 `numerator`／`denominator`／`rate` 同一層、同一風格），不新開一個
 * `exclusion` 子物件（spec 全文查無 `exclusion` 或任何 `*Count` 字尾之排除計數欄名先例）。
 * 已同步補入 `docs/specs/features/F042-ojt-progress-management.md` §架構設計端點表，防再犯。
 */
const docCoverageRow = (over: Partial<{
  documentId: string; documentNumber: string; documentName: string; state: 'all' | 'partial' | 'none'; completedUnits: number; totalUnits: number;
}>) => ({
  documentId: 'd-cov-1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  state: 'partial' as const, completedUnits: 2, totalUnits: 3, ...over,
});

/**
 * 🔴 F042 節流修正（test-generator 建環 2026-08-28，`OQ-E11-21`）：`docCoverage` 由陣列改為
 * 物件——`{ scope, maxRows, items, shown, hidden, totalDocuments, byState, incompleteTotal }`
 * （§架構設計 一-2，刻意的 loud break）。本 helper 由 `items` 自動推導預設之計數欄（母體＝
 * 傳入之 items 本身、`scope` 預設為 `incomplete`、`hidden` 預設 0），個別測試可用 `over` 覆寫
 * 任一計數欄以模擬「母體大於呈現切片」之情境（節流測試之核心）。
 *
 * 🔴 就地改寫（`OQ-E11-22` 第二輪，2026-08-28）：`scope` 值域增 `'unassigned'`；`byState` 增
 * 第四鍵 `unassigned`（依 `items[].totalUnits===0` 自動推導，`none` 之子集、非第四個互斥
 * 類）；`incompleteTotal` 之預設公式就地更正為 ③′（`partial + none − unassigned`，原式
 * `partial + none` 已於本輪起不成立）。
 */
function docCoverageSlice(
  items: ReturnType<typeof docCoverageRow>[],
  over: Partial<{
    scope: 'incomplete' | 'completed' | 'unassigned' | 'all';
    maxRows: number;
    shown: number;
    hidden: number;
    totalDocuments: number;
    byState: { all: number; partial: number; none: number; unassigned: number };
    incompleteTotal: number;
  }> = {},
) {
  const byState = { all: 0, partial: 0, none: 0, unassigned: 0 };
  for (const it of items) {
    byState[it.state] += 1;
    if (it.totalUnits === 0) byState.unassigned += 1;
  }
  return {
    scope: 'incomplete' as const,
    maxRows: 15,
    items,
    shown: items.length,
    hidden: 0,
    totalDocuments: items.length,
    byState,
    incompleteTotal: byState.partial + byState.none - byState.unassigned,
    ...over,
  };
}

/**
 * 🔴 F042 仲裁補強（test-generator 仲裁 2026-08-28，ti-fe-ojt 主動回報之靜默洞）：`deptRollup`
 * 原型別含 `rate` 欄，且本檔每一筆 fixture 皆顯式提供該值——但查證 `prototypes/25-ojt-progress.html`
 * `renderRollup()`（:842-865）之 `pct=pctOf(g.done,g.total)`，逐部之百分比**恆為前端由
 * `done`／`total` 推導**（`pctOf(done,total){ return total? Math.round(done/total*100) : 0; }`，
 * :742），prototype 之資料模型本身**沒有** rollup 層級的 `rate` 欄；`docs/specs/data-model.md`
 * §建議查詢形狀之部門 rollup SQL（AC-15）同樣只 `SELECT ... AS totalUnits, ... AS completedUnits`，
 * 無 `rate` 別名。故 backend 真實回應之 `deptRollup` 陣列**不含** `rate`——先前 fixture 之
 * `rate: 100`／`rate: 0` 等值純屬本檔臆造，且無任何斷言檢查 `[data-rollup-rate]` 之百分比文字，
 * 使「元件直接讀取 `g.rate`（backend 未送、恆為 `undefined`）而印出 `undefined%`」這個真實發生過
 * 之缺陷（ti-fe-ojt 已依 canonical 形狀比對主動修正，非本環測出）完全逃出約束環。
 * 移除 fixture 之 `rate` 欄（貼合真實回應形狀）＋補上 `[data-rollup-rate]` 之正面斷言（見下方
 * `AC-15 rollup 列數不變性` 案），逼百分比必須由 `done`／`total` 現場推導才能轉綠。
 */
const summaryFixture = (over: Partial<{
  coverage: { numerator: number; denominator: number; rate?: number; excludedInactive?: number; excludedOrphaned?: number };
  deptRollup: Array<{ companyCode: string; deptOrgCode: string; deptName: string; totalUnits: number; completedUnits: number }>;
  recentSessions: Array<{ documentId: string; documentNumber: string; documentName: string; companyCode: string; orgCode: string; orgName: string; trainingDate: string }>;
  docCoverage: ReturnType<typeof docCoverageSlice>;
}> = {}) => ({
  coverage: { numerator: 2, denominator: 3, rate: 67, excludedInactive: 0, excludedOrphaned: 0 },
  deptRollup: [{ companyCode: 'AS', deptOrgCode: 'JA000', deptName: '營運管理部', totalUnits: 3, completedUnits: 2 }],
  recentSessions: [
    { documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', companyCode: 'AS', orgCode: 'JAC00', orgName: '審查室', trainingDate: '2026-08-20' },
  ],
  docCoverage: docCoverageSlice([docCoverageRow({})]),
  ...over,
});

const rowFixture = (over: Partial<{
  documentId: string; documentNumber: string; documentName: string;
  companyCode: string; orgCode: string; orgName: string; sessionCount: number; completed: boolean;
  inactive: boolean; orphaned: boolean;
}> = {}) => ({
  documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  companyCode: 'AS', orgCode: 'JAC00', orgName: '審查室', sessionCount: 1, completed: true,
  inactive: false, orphaned: false,
  ...over,
});

const sessionFixture = (over: Partial<{
  id: string; trainingDate: string; fileName: string; uploadedByName: string; uploadedAt: string;
}> = {}) => ({
  id: 's1', trainingDate: '2026-08-20', fileName: 'ojt.pdf', uploadedByName: '王志明', uploadedAt: '2026-08-20T10:00:00.000Z',
  ...over,
});

function setupMocks() {
  vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(summaryFixture());
  vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: [rowFixture()], total: 1 });
  vi.mocked(endpoints.getOjtProgressRowSessions).mockResolvedValue({ sessions: [sessionFixture()] });
  vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({ items: [] });
  vi.mocked(endpoints.addOjtSession).mockResolvedValue(sessionFixture({ id: 's2' }));
  vi.mocked(endpoints.deleteOjtSession).mockResolvedValue(undefined);
  vi.mocked(endpoints.downloadOjtSession).mockResolvedValue(undefined);
  vi.mocked(endpoints.assignOjtPendingSession).mockResolvedValue({} as never);
}

describe('OjtProgressPage — F042 OJT 進度管理（移植 prototype 25）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    setupMocks();
  });

  // ===================== A. 分頁與骨架（AC-11／AC-28①） =====================
  describe('A. TAB 分頁骨架', () => {
    it('預設停留於 TAB1 儀表板；兩個分頁皆存在且 role=tab／role=tabpanel', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('文件-訓練覆蓋率')).toBeInTheDocument());
      const dashTab = document.querySelector('[data-ojt-tab="dashboard"]') as HTMLElement;
      const sessTab = document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement;
      expect(dashTab).not.toBeNull();
      expect(sessTab).not.toBeNull();
      expect(dashTab.getAttribute('role')).toBe('tab');
      expect(dashTab.getAttribute('aria-selected')).toBe('true');
      expect(sessTab.getAttribute('aria-selected')).toBe('false');
      expect(document.querySelector('[data-ojt-panel="dashboard"]')?.getAttribute('role')).toBe('tabpanel');
      expect(document.querySelector('[data-ojt-panel="sessions"]')?.getAttribute('role')).toBe('tabpanel');
    });

    it('點擊 OJT 資料清單分頁 → aria-selected 互換、TAB2 內容顯示', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('文件-訓練覆蓋率')).toBeInTheDocument());
      await user.click(document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement);
      await waitFor(() => {
        expect(document.querySelector('[data-ojt-tab="sessions"]')?.getAttribute('aria-selected')).toBe('true');
        expect(document.querySelector('[data-ojt-tab="dashboard"]')?.getAttribute('aria-selected')).toBe('false');
      });
      expect(document.querySelector('[data-ojt-filter-bar]')).toBeInTheDocument();
    });
  });

  // ===================== B. TAB1 儀表板（AC-14/15/16/17／AC-28②⑦） =====================
  describe('B. TAB1 儀表板三區', () => {
    it('區一標題逐字「文件-訓練覆蓋率」（半形連字號，prototype 25）', async () => {
      renderPage();
      await waitFor(() => {
        const sec = document.querySelector('[data-ojt-section="coverage"]');
        expect(sec).not.toBeNull();
        expect(within(sec as HTMLElement).getByText('文件-訓練覆蓋率')).toBeInTheDocument();
      });
    });

    it('區二標題逐字「部門完成率」（2026-08-28 定稿，無「處室」字樣、無斜線）', async () => {
      renderPage();
      await waitFor(() => {
        const sec = document.querySelector('[data-ojt-section="rollup"]');
        expect(sec).not.toBeNull();
        expect(within(sec as HTMLElement).getByText('部門完成率')).toBeInTheDocument();
        expect(within(sec as HTMLElement).queryByText('處室／部門完成率')).toBeNull();
      });
    });

    it('區三標題逐字「最近完成 OJT 的單位」', async () => {
      renderPage();
      await waitFor(() => {
        const sec = document.querySelector('[data-ojt-section="recent"]');
        expect(within(sec as HTMLElement).getByText('最近完成 OJT 的單位')).toBeInTheDocument();
      });
    });

    it('AC-04：三態文件逐筆列 chip（已全部完成／部分完成／尚未開始）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice([
            docCoverageRow({ documentId: 'd-all', documentNumber: 'D-ALL', state: 'all', completedUnits: 3, totalUnits: 3 }),
            docCoverageRow({ documentId: 'd-partial', documentNumber: 'D-PARTIAL', state: 'partial', completedUnits: 1, totalUnits: 3 }),
            docCoverageRow({ documentId: 'd-none', documentNumber: 'D-NONE', state: 'none', completedUnits: 0, totalUnits: 3 }),
          ], { scope: 'all' }),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-row="D-ALL"]')).not.toBeNull());
      const chip = (num: string) =>
        document.querySelector(`[data-doc-coverage-row="${num}"] [data-doc-ojt-state-chip]`);
      expect(document.querySelector('[data-doc-coverage-row="D-ALL"]')?.getAttribute('data-doc-ojt-state')).toBe('all');
      expect(chip('D-ALL')?.textContent).toBe('已全部完成');
      expect(document.querySelector('[data-doc-coverage-row="D-PARTIAL"]')?.getAttribute('data-doc-ojt-state')).toBe('partial');
      expect(chip('D-PARTIAL')?.textContent).toBe('部分完成');
      expect(document.querySelector('[data-doc-coverage-row="D-NONE"]')?.getAttribute('data-doc-ojt-state')).toBe('none');
      expect(chip('D-NONE')?.textContent).toBe('尚未開始');
    });

    /**
     * AC-14：分母為零時之防線——0/0 在 JS 為 NaN，直接渲染會出現 NaN%；退化為 0% 與「全部未完成」
     * 無從分辨；退化為 100% 更會謊報。三者皆須被排除。
     * 📌 呈現用之確切訊息字面非 F042 §6 逐字文案表所鎖定，屬本檔自行選定之合理文案，非規格權威值。
     */
    it('AC-14 分母為零 → 呈現「尚無可統計」訊息，不得出現 NaN／NaN%／逕自呈現 0%／100%', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ coverage: { numerator: 0, denominator: 0, rate: undefined }, docCoverage: docCoverageSlice([]) }),
      );
      renderPage();
      await waitFor(() => {
        const sec = document.querySelector('[data-ojt-section="coverage"]') as HTMLElement;
        expect(sec.textContent).not.toMatch(/NaN/);
        // 設計裁量：本檔以「尚無可統計」為必要子字串斷言，不逐字鎖定完整句子。
        expect(sec.textContent).toMatch(/尚無可統計/);
      });
    });

    it('AC-14 全部未完成 → 呈現 0%（非錯誤、非空白）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ coverage: { numerator: 0, denominator: 3, rate: 0 } }),
      );
      renderPage();
      await waitFor(() => {
        const sec = document.querySelector('[data-ojt-section="coverage"]') as HTMLElement;
        expect(sec.textContent).toMatch(/0%/);
      });
    });

    /**
     * AC-15 建議斷言形狀：列數不因 rollup 而改變——彙總前列數（來自各部之 completedUnits/totalUnits
     * 加總）須等於 fixture 餵入之 rollup 分母總和，防止實作在「列產生階段」偷偷展開 AC-01 之列。
     */
    it('AC-15 rollup 列數不變性：各部 totalUnits 加總＝彙總前之進度列總數；百分比由 done/total 現場推導（非讀取 API 未送之 rate 欄，round 取整）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          deptRollup: [
            { companyCode: 'AS', deptOrgCode: 'JA000', deptName: '營運管理部', totalUnits: 2, completedUnits: 2 },
            { companyCode: 'AS', deptOrgCode: 'CA000', deptName: '信用審查部', totalUnits: 3, completedUnits: 2 },
          ],
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelectorAll('[data-rollup-row]').length).toBe(2));
      // data-rollup-ratio 格式為「已完成 / 進度列」（prototype 25：${g.done} / ${g.total}）。
      const ratios = [...document.querySelectorAll('[data-rollup-ratio]')].map((el) => el.textContent);
      expect(ratios).toEqual(['2 / 2', '2 / 3']);
      // 🔴 百分比文字：fixture 未提供 rate，元件必須自行以 pctOf(done,total)=Math.round(done/total*100)
      // 推導；100% 與 2/3→67%（非 66% 或 66.67%，驗證 round 而非 floor）兩案互不相同，具鑑別力。
      const rates = [...document.querySelectorAll('[data-rollup-rate]')].map((el) => el.textContent);
      expect(rates).toEqual(['100%', '67%']);
      const invariantEl = document.querySelector('[data-rollup-invariant]') as HTMLElement;
      expect(invariantEl).not.toBeNull();
      // 各部 totalUnits 加總 = 2+3 = 5，須與不變式之敘述數字一致（本檔以文字含有 "5" 之寬鬆檢查，
      // 因逐字句為資料驅動之完整敘述，非固定字面——見 F042 §prototype 25 §2「data-rollup-invariant」）。
      expect(invariantEl.textContent).toMatch(/5/);
    });

    it('AC-15 本部層／公司層單位自成一組、不排除（OQ-E11-20②）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          deptRollup: [{ companyCode: 'AS', deptOrgCode: 'JA000', deptName: '營運管理部', totalUnits: 1, completedUnits: 1 }],
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-rollup-row="JA000"]')).not.toBeNull());
    });

    it('AC-16 區三：恰三個資料維度（文件／單位／日期），不含第四個', async () => {
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-recent-row]')).not.toBeNull());
      const row = document.querySelector('[data-recent-row]') as HTMLElement;
      expect(row.querySelector('[data-recent-doc]')).not.toBeNull();
      expect(row.querySelector('[data-recent-org]')).not.toBeNull();
      expect(row.querySelector('[data-recent-date]')).not.toBeNull();
    });

    /**
     * 🔴 AC-16 PII 硬性防線（不隨任何裁決改變、可最先建）：即使 fixture 之型別不允許夾帶姓名
     * （架構契約 recentSessions 明文不含 uploader），本斷言仍以字串負向掃描全區文字，
     * 防止任何實作以字串拼接等旁路洩漏個資。
     */
    it('AC-16 PII 硬性防線：區三 textContent 不得包含姓名「王志明」或員工編號', async () => {
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-ojt-section="recent"]')).not.toBeNull());
      const sec = document.querySelector('[data-ojt-section="recent"]') as HTMLElement;
      expect(sec.textContent).not.toContain('王志明');
      expect(sec.textContent).not.toMatch(/\b\d{5}\b/); // 員工編號形狀（5 碼數字）不得出現
    });

    it('AC-16 [data-pii-note] 逐字說明句存在', async () => {
      renderPage();
      await waitFor(() => {
        const note = document.querySelector('[data-pii-note]');
        expect(note?.textContent).toBe(
          '本區僅呈現單位／文件／日期層級之聚合資訊，不揭露個別受訓人員之姓名或員工編號。',
        );
      });
    });

    it('AC-16 空窗口狀態：[data-recent-empty] 逐字「此時間窗口內尚無新登記之教育訓練場次」', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(summaryFixture({ recentSessions: [] }));
      renderPage();
      await waitFor(() => {
        expect(document.querySelector('[data-recent-empty]')?.textContent).toBe(
          '此時間窗口內尚無新登記之教育訓練場次',
        );
      });
    });

    it('AC-06 SysAdmin 唯讀橫幅逐字文案', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(
          '唯讀模式 · 系統管理員可檢視儀表板與 OJT 資料清單之全部內容，並下載簽到表；無法新增教育訓練場次（PERMISSION_DENIED）。',
        )).toBeInTheDocument();
      });
    });

    it('AC-17 排除註記：同時列出「已裁撤單位」與「單位已移出使用部門」兩個原因', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ coverage: { numerator: 2, denominator: 3, rate: 67, excludedInactive: 1, excludedOrphaned: 1 } }),
      );
      renderPage();
      await waitFor(() => {
        const sec = document.querySelector('[data-ojt-section="coverage"]') as HTMLElement;
        expect(sec.textContent).toContain('已裁撤單位');
        expect(sec.textContent).toContain('單位已移出使用部門');
      });
    });
  });

  /**
   * ===================== B-2. TAB1 區一逐筆表之節流（OQ-E11-21，AC-14 節流七項＋四道負向鎖定，AC-28⑯） =====================
   * 🔴 使用者實機檢視回報：dev 環境近 600 份文件下，本表原本無上限，把整個儀表板撐成 600 列
   * 巨長頁面。定稿＝「預設僅未全部完成 ＋ 上限 15 ＋ 三值顯示範圍 ＋ 截斷告知（三要素）」。
   * 逐字值與掛鉤權威：F042-ojt-progress-management.md §6 ⑯ 群列；測試方向：F042-test.md §三-2 乙。
   */
  describe('B-2. TAB1 區一逐筆表節流（OQ-E11-21／AC-14 節流／AC-28⑯）', () => {
    /** 建 N 份文件之 docCoverageRow 陣列，覆蓋率遞增（0%→100%），供上限與排序測試。 */
    function manyRows(n: number, over: (i: number) => Partial<Parameters<typeof docCoverageRow>[0]> = () => ({})) {
      return Array.from({ length: n }, (_, i) =>
        docCoverageRow({
          documentId: `d${i}`,
          documentNumber: `N${String(i).padStart(2, '0')}`,
          state: 'none',
          completedUnits: 0,
          totalUnits: 1,
          ...over(i),
        }),
      );
    }

    /**
     * 🔴 就地改寫（`OQ-E11-22` 第二輪，2026-08-28）：`option` 由恰 3 個增為恰 4 個（新增
     * `unassigned`／「僅未指定使用部門」，順序落在 `completed` 之後、`all` 之前）——與
     * 「截斷句名詞表由三變體增為四變體」兩案必須一起改，否則會出現「改了選項卻沒改名詞表」
     * 之半套（見下方 it.each 案）。
     */
    it('AC-28⑲ 顯示範圍 select：option 恰 4 個，新增 unassigned/僅未指定使用部門（順序＝incomplete/completed/unassigned/all）；預設仍選中 incomplete；aria-label 一字未改', async () => {
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-scope]')).not.toBeNull());
      const sel = document.querySelector('[data-doc-coverage-scope]') as HTMLSelectElement;
      expect(sel.getAttribute('aria-label')).toBe('依文件逐筆之顯示範圍');
      const opts = [...sel.options].map((o) => ({ value: o.value, text: o.textContent }));
      expect(opts).toEqual([
        { value: 'incomplete', text: '僅未全部完成' },
        { value: 'completed', text: '僅已全部完成' },
        { value: 'unassigned', text: '僅未指定使用部門' },
        { value: 'all', text: '全部文件' },
      ]);
      expect(sel.value).toBe('incomplete');
    });

    /**
     * 🔴 假綠陷阱 10（F042-test.md §三-2 丁）：若日後把顯示範圍簡化為二值，本表仍能正常渲染、
     * 截斷告知仍會出現、其餘既有斷言仍綠——上一案（option 恰 3 個）與本案（completed 範圍下
     * 截斷不存在）合力擋住這個退化：completed 是全檔唯一「截斷提示不存在」之可達狀態，
     * 二值化會使這條負向案恆為截斷態、失去鑑別力。
     */
    it('🔴 假綠陷阱 10 防線：docScope=completed 之範圍（母體 ≤15）⇒ [data-doc-coverage-truncation] 不進 DOM', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ docCoverage: docCoverageSlice(manyRows(3, () => ({ state: 'all', completedUnits: 1 })), { scope: 'completed' }) }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-summary]')).not.toBeNull());
      expect(document.querySelectorAll('[data-doc-coverage-truncation]')).toHaveLength(0);
    });

    /**
     * 🔴 假綠陷阱 13（客端切換之假綠）：以「畫面列數改變」斷言切換行為時，先取 600 列再於
     * 客端過濾之實作同樣通過。斷言標的必須是「發出一次帶新 docScope 之請求」。
     */
    it('🔴 假綠陷阱 13 防線：切換顯示範圍 ⇒ 發出一次帶新 docScope 之 GET /admin/ojt-progress/summary（非客端切換）', async () => {
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-scope]')).not.toBeNull());
      const callsBefore = vi.mocked(endpoints.getOjtProgressSummary).mock.calls.length;
      const sel = document.querySelector('[data-doc-coverage-scope]') as HTMLSelectElement;
      fireEvent.change(sel, { target: { value: 'completed' } });
      await waitFor(() => expect(vi.mocked(endpoints.getOjtProgressSummary).mock.calls.length).toBeGreaterThan(callsBefore));
      const lastCall = vi.mocked(endpoints.getOjtProgressSummary).mock.calls.at(-1);
      expect(lastCall).toContain('completed');
    });

    /**
     * 🔴 假綠陷阱 12（摘要行整行 textContent 斷言）：`[data-doc-coverage-summary]` 之整行串接
     * 恆含三個狀態字面 ⇒ 整區斷言恆真、零鑑別力；且各 span 之間無空白字元，整行逐字斷言本身
     * 也對不上。一律逐掛鉤斷言。
     */
    it('AC-28⑯ 摘要行五片段逐掛鉤斷言（禁止整行 textContent 逐字比對）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice(
            [
              ...manyRows(2, (i) => ({ documentId: `all${i}`, state: 'all', completedUnits: 1, totalUnits: 1 })),
              ...manyRows(3, (i) => ({ documentId: `partial${i}`, state: 'partial', completedUnits: 1, totalUnits: 2 })),
              ...manyRows(4, (i) => ({ documentId: `none${i}`, state: 'none', completedUnits: 0, totalUnits: 1 })),
            ],
            { scope: 'all', totalDocuments: 9, byState: { all: 2, partial: 3, none: 4, unassigned: 0 }, incompleteTotal: 7 },
          ),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-summary]')).not.toBeNull());
      const summaryEl = document.querySelector('[data-doc-coverage-summary]') as HTMLElement;
      expect(summaryEl.getAttribute('data-doc-coverage-scope-value')).toBe('all');
      expect(summaryEl.getAttribute('data-doc-coverage-shown')).toBe('9');
      expect(document.querySelector('[data-doc-coverage-total="9"]')?.textContent).toBe('共 9 份文件');
      expect(document.querySelector('[data-doc-coverage-stat="all"]')?.textContent).toBe('已全部完成 2 份');
      expect(document.querySelector('[data-doc-coverage-stat="partial"]')?.textContent).toBe('部分完成 3 份');
      expect(document.querySelector('[data-doc-coverage-stat="none"]')?.textContent).toBe('尚未開始 4 份');
      expect(document.querySelector('[data-doc-coverage-incomplete="7"]')?.textContent).toBe('尚未全部完成合計 7 份');
      // 🔴 -total 若跟著切片走即為缺陷（ux-fix 之注入驗證）：totalDocuments 必須是完整母體 9，非本次切片之 items.length。
      expect(document.querySelector('[data-doc-coverage-total]')?.getAttribute('data-doc-coverage-total')).toBe('9');
    });

    /**
     * 🔴 假綠陷阱 14（CSS 隱藏之假綠）：`toBeVisible()` 之否定在 jsdom 下不可靠且會放行 CSS
     * 隱藏實作。斷言必須是「完全不進 DOM」。
     */
    /**
     * 🔴 仲裁修正（test-generator 仲裁 2026-08-28，ti-fe-ojt 申訴屬實）：原案在同一個 `it` 內
     * 呼叫兩次 `renderPage()`，但 RTL 之 `cleanup()` 僅掛在 `afterEach`（`src/test/setup.ts`），
     * 不會在同一測試內之兩次 `render()` 之間執行——第一次渲染之樹（其 `[data-doc-coverage-
     * truncation]` 已被本案自己斷言存在）不會被移除，第二次渲染只是疊加一棵新樹，故末段之
     * 全域 `querySelectorAll(...).toHaveLength(0)` 恆 ≥ 1，不存在任何實作能同時滿足前後兩段。
     * 拆為兩個獨立 `it`（正向／負向），比照本檔既有之區三同型負向案（獨立成案）之風格。
     */
    it('截斷告知：hidden>0 ⇒ 存在且三要素齊備（假綠陷阱14 正向對照）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice(manyRows(15), {
            scope: 'incomplete', maxRows: 15, shown: 15, hidden: 6, totalDocuments: 21, byState: { all: 0, partial: 0, none: 21, unassigned: 0 }, incompleteTotal: 21,
          }),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-truncation]')).not.toBeNull());
      const trunc = document.querySelector('[data-doc-coverage-truncation]') as HTMLElement;
      expect(trunc.getAttribute('data-doc-coverage-hidden')).toBe('6');
      expect(trunc.textContent).toContain('本表僅列出前 15 份');
      expect(trunc.textContent).toContain('另有 6 份');
      expect(trunc.textContent).toContain('依覆蓋率由低至高排序');
      expect(trunc.textContent).toContain('OJT 資料清單');
    });

    it('截斷告知：hidden===0 ⇒ 完全不進 DOM（非 CSS 隱藏，假綠陷阱14）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ docCoverage: docCoverageSlice(manyRows(5), { hidden: 0, totalDocuments: 5, byState: { all: 0, partial: 0, none: 5, unassigned: 0 }, incompleteTotal: 5 }) }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelectorAll('[data-doc-coverage-row]').length).toBeGreaterThan(0));
      expect(document.querySelectorAll('[data-doc-coverage-truncation]')).toHaveLength(0);
    });

    // 🔴 就地改寫（`OQ-E11-22` 第二輪）：名詞表由三變體增為恰四個，與上方 select 之 4 個 option 一起改。
    it.each([
      ['incomplete', '尚未全部完成之文件'],
      ['completed', '已全部完成之文件'],
      ['unassigned', '未指定使用部門之文件'],
      ['all', '文件'],
    ] as const)('截斷句之 {名詞} 變體——scope=%s ⇒ 名詞為「%s」（其餘句子完全相同）', async (scope, noun) => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ docCoverage: docCoverageSlice(manyRows(15), { scope, hidden: 2, totalDocuments: 17 }) }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-truncation]')).not.toBeNull());
      expect(document.querySelector('[data-doc-coverage-truncation]')?.textContent).toContain(`另有 2 份${noun}未列出`);
    });

    /**
     * 🔴 假綠陷阱 11（截斷上限硬寫於前端）：只用 maxRows:15 一組 fixture 時，「讀回應」與
     * 「硬寫 15」兩種實作皆綠。必須以第二組 maxRows（如 3）驗證數字跟著回應變。
     */
    it('🔴 假綠陷阱 11 防線：截斷句之上限數字取自回應之 docCoverage.maxRows（非前端硬寫 15）——第二組 maxRows=3 驗證', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ docCoverage: docCoverageSlice(manyRows(3), { maxRows: 3, hidden: 2, totalDocuments: 5 }) }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-truncation]')).not.toBeNull());
      expect(document.querySelector('[data-doc-coverage-truncation]')?.textContent).toContain('本表僅列出前 3 份');
      expect(document.querySelector('[data-doc-coverage-truncation]')?.textContent).not.toContain('本表僅列出前 15 份');
    });

    // 🔴 就地改寫（`OQ-E11-22` 第二輪）：範圍空狀態由兩句增為三句，新增 unassigned →「所有文件皆已指定使用部門」。
    it.each([
      ['incomplete', '所有文件之教育訓練皆已全部完成'],
      ['completed', '尚無任何文件之教育訓練已全部完成'],
      ['unassigned', '所有文件皆已指定使用部門'],
    ] as const)('範圍空狀態逐字（scope=%s）：「%s」＋共用補充提示；與全域空狀態 no-docs 互不相同', async (scope, text) => {
      /**
       * 🔴 仲裁修正（test-generator 仲裁 2026-08-28，ti-fe-ojt 提報）：原 fixture 於 `incomplete`
       * 分支誤用 `totalDocuments: 0`（＋ `byState` 全零），把「21 份文件皆已全部完成、`incomplete`
       * 範圍下自然無項目可顯示」誤寫成「系統中根本沒有文件」——後者才是 `no-docs`（全域無任何
       * 進度列）之真正觸發條件，兩者不可混淆。且 `incomplete`／`completed` 兩分支之 `byState`
       * 原本互相寫反（`completed` 空狀態卻標 `all: 21`，等同宣告 21 份文件皆已完成，與「completed
       * 範圍下查無項目」自相矛盾）。改為兩分支皆 `totalDocuments: 21`（真有文件、只是不match
       * 當前範圍），`byState` 依各自語意正確設定；`coverage.denominator` 沿用預設值 3（非 0，
       * 確保不會意外觸發 no-docs 之判準——no-docs 之真正觸發條件為「系統無任何有效進度列」，
       * 非「本次篩選範圍恰無項目」，兩者刻意不同）。
       *
       * 🔴 就地改寫（`OQ-E11-22` 第二輪）：新增 `unassigned` 分支——該範圍下查無項目，代表母體中
       * 沒有任何 `totalUnits=0` 之文件（`byState.unassigned` 為 0），21 份文件均為 `incomplete`／
       * `completed` 之組合（13/8，恰對應下方 ⑬ 案外之另一組合理拆分，具體數字不影響本案斷言）。
       */
      const byState =
        scope === 'incomplete' ? { all: 21, partial: 0, none: 0, unassigned: 0 }
        : scope === 'completed' ? { all: 0, partial: 13, none: 8, unassigned: 0 }
        : { all: 13, partial: 8, none: 0, unassigned: 0 };
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice([], {
            scope, totalDocuments: 21, byState, incompleteTotal: byState.partial + byState.none - byState.unassigned,
          }),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector(`[data-doc-coverage-empty="${scope}"]`)).not.toBeNull());
      const empty = document.querySelector(`[data-doc-coverage-empty="${scope}"]`) as HTMLElement;
      expect(empty.textContent).toContain(text);
      expect(empty.textContent).toContain('切換顯示範圍為「全部文件」可檢視全部文件之覆蓋率。');
      // 🔴 範圍空狀態刻意不帶「進度列從哪裡來」那句——那句只給全域無任何進度列（TAB2）之空狀態。
      expect(empty.textContent).not.toContain('進度列由各 ICSOP 文件之「文件使用部門」衍生而得');
      expect(document.querySelector('[data-doc-coverage-empty="no-docs"]')).toBeNull();
    });

    it('導向 TAB2 入口：恆存在（未截斷案）；點擊 ⇒ 切至 TAB2、完成狀態設為「尚未完成」、單位關鍵字清空；TAB2 篩選項仍恰兩項', async () => {
      const user = userEvent.setup();
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ docCoverage: docCoverageSlice(manyRows(2)) }), // 未截斷（母體=2 < 15）
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-more]')).not.toBeNull());
      const more = document.querySelector('[data-doc-coverage-more]') as HTMLElement;
      expect(more.textContent).toBe('至「OJT 資料清單」檢視尚未完成之進度列');
      expect(more.getAttribute('aria-label')).toBe('至「OJT 資料清單」分頁，並將完成狀態篩選設為「尚未完成」');

      await user.click(more);
      await waitFor(() => expect(document.querySelector('[data-ojt-tab="sessions"]')?.getAttribute('aria-selected')).toBe('true'));
      const statusSelect = document.querySelector('[data-ojt-filter="status"]') as HTMLSelectElement;
      const orgInput = document.querySelector('[data-ojt-filter="org"]') as HTMLInputElement;
      expect(statusSelect.value).toBe('pending'); // 「尚未完成」選項之底層值，比照 AC-13 之既有三值
      expect(orgInput.value).toBe('');
      // 🔒 未新增任何 TAB2 篩選項。
      expect(document.querySelectorAll('[data-ojt-filter]')).toHaveLength(2);
      expect([...statusSelect.options]).toHaveLength(3);
    });

    it('捲軸容器：role="region"＋aria-label 逐字「依文件逐筆之覆蓋率表格」＋tabindex="0"（WCAG 2.1.1）', async () => {
      renderPage();
      await waitFor(() => expect(document.querySelector('[role="region"][aria-label="依文件逐筆之覆蓋率表格"]')).not.toBeNull());
      const region = document.querySelector('[role="region"][aria-label="依文件逐筆之覆蓋率表格"]') as HTMLElement;
      expect(region.getAttribute('tabindex')).toBe('0');
    });

    it('口徑說明行 [data-doc-coverage-basis-note]：必要載體，位置＝摘要行下方、表格上方，不得掛 chip 掛鉤', async () => {
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-basis-note]')).not.toBeNull());
      const note = document.querySelector('[data-doc-coverage-basis-note]') as HTMLElement;
      expect(note.textContent).toBe(
        '本表之「已完成 / 使用單位」以該文件之全部使用單位為分母（含已裁撤單位），與上方覆蓋率之分母刻意不同：上方是「還追得動的部分」，本表是「這份文件的實際訓練狀況」。',
      );
      expect(note.querySelector('[data-doc-ojt-state-chip]')).toBeNull();
      // 位置順序：summary → basis-note → 表格捲軸容器。
      const summaryEl = document.querySelector('[data-doc-coverage-summary]') as HTMLElement;
      const region = document.querySelector('[role="region"][aria-label="依文件逐筆之覆蓋率表格"]') as HTMLElement;
      expect(summaryEl.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(note.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    /**
     * 🔴 母體 > 15 之上限與排序（依 F042-test.md §三-2 甲之 backend 斷言形狀的前端對應——前端不
     * 重算排序，只驗「伺服器回傳之 items 依序渲染」，真正之排序正確性由 backend 環把關）。
     */
    it('母體 > 15（伺服器已切片）⇒ 恰渲染 15 列，逐列依回應順序渲染（前端不重排、不二次過濾）', async () => {
      const rows = manyRows(15, (i) => ({ documentNumber: `SVR${String(i).padStart(2, '0')}` }));
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ docCoverage: docCoverageSlice(rows, { hidden: 6, totalDocuments: 21 }) }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelectorAll('[data-doc-coverage-row]').length).toBe(15));
      const renderedOrder = [...document.querySelectorAll('[data-doc-coverage-row]')].map((el) => el.getAttribute('data-doc-coverage-row'));
      expect(renderedOrder).toEqual(rows.map((r) => r.documentNumber));
    });
  });

  /**
   * ===================== B-2b. TAB1 區一第四態「未指定使用部門」（OQ-E11-22，AC-14 ⑧～⑮，AC-28⑲） =====================
   * 🔴 使用者實機檢視回報：backend 對 dev 真庫實打揭露 591 份文件中 587 份 `totalUnits=0`
   * （未指定使用部門），其覆蓋率退化為 `0/0`⇒`0%`，與「有使用部門卻一列都沒完成」共用同一個
   * 排序鍵、數量壓倒性 ⇒ 上一輪節流之升冪排序把前 15 名整批占滿。裁決＝拆成獨立一態 ＋ 排序
   * 沉底 ＋ 不計入未完成合計。🔒 上一輪節流之七項與四道負向鎖定原文一字未動（B-2 全數保留）。
   * 逐字值與掛鉤權威：F042-ojt-progress-management.md §6 ⑲ 群列；測試方向：F042-test.md §三-3 乙。
   */
  describe('B-2b. TAB1 區一第四態「未指定使用部門」（OQ-E11-22／AC-14 ⑧～⑮／AC-28⑲）', () => {
    const unassignedRow = (over: Partial<Parameters<typeof docCoverageRow>[0]> = {}) =>
      docCoverageRow({ state: 'none', completedUnits: 0, totalUnits: 0, ...over });

    /** 建 N 份 totalUnits=0（未指定使用部門）之文件——本區塊局部版之 B-2 `manyRows`（不同 describe 作用域）。 */
    function manyUnassignedRows(n: number, over: (i: number) => Partial<Parameters<typeof docCoverageRow>[0]> = () => ({})) {
      return Array.from({ length: n }, (_, i) =>
        unassignedRow({ documentId: `u${i}`, documentNumber: `U${String(i).padStart(2, '0')}`, ...over(i) }),
      );
    }

    /**
     * 🔴 負向鎖定①（F042 AC-14 本輪負向鎖定①）：`data-doc-ojt-state` 值域維持三值，第四態另以
     * `[data-doc-no-using-dept]`（無值屬性）表達；同一列可同時是 `data-doc-ojt-state="none"`
     * 且帶本屬性——這正是事實，(a)(b) 必須同時成立、不得寫成互斥斷言。
     */
    it('⑧⑨ 第四態列：<tr> 帶 [data-doc-no-using-dept]（無值屬性）且 [data-doc-ojt-state]="none"（不是 "unassigned"）；晶片逐字「未指定使用部門」', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice(
            [unassignedRow({ documentId: 'd-u1', documentNumber: 'D-UNASSIGNED' })],
            { scope: 'all', totalDocuments: 1, byState: { all: 0, partial: 0, none: 1, unassigned: 1 }, incompleteTotal: 0 },
          ),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-row="D-UNASSIGNED"]')).not.toBeNull());
      const row = document.querySelector('[data-doc-coverage-row="D-UNASSIGNED"]') as HTMLElement;
      expect(row.hasAttribute('data-doc-no-using-dept')).toBe(true);
      expect(row.getAttribute('data-doc-ojt-state')).toBe('none');
      expect(row.querySelector('[data-doc-ojt-state-chip]')?.textContent).toBe('未指定使用部門');
    });

    it('🔴 值域負向案：querySelectorAll(\'[data-doc-ojt-state="unassigned"]\').length === 0（值域明文禁止增為四值）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice(
            [unassignedRow({ documentId: 'd-u1', documentNumber: 'D-U1' })],
            { scope: 'all', totalDocuments: 1, byState: { all: 0, partial: 0, none: 1, unassigned: 1 }, incompleteTotal: 0 },
          ),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-row="D-U1"]')).not.toBeNull());
      expect(document.querySelectorAll('[data-doc-ojt-state="unassigned"]')).toHaveLength(0);
    });

    it('[data-doc-no-using-dept] 僅出現於 totalUnits=0 之列（進 DOM／不進 DOM，非 CSS 隱藏）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice(
            [
              docCoverageRow({ documentId: 'd-normal', documentNumber: 'D-NORMAL', state: 'partial', completedUnits: 1, totalUnits: 2 }),
              unassignedRow({ documentId: 'd-u1', documentNumber: 'D-U1' }),
            ],
            { scope: 'all' },
          ),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-row="D-NORMAL"]')).not.toBeNull());
      expect(document.querySelector('[data-doc-coverage-row="D-NORMAL"]')?.hasAttribute('data-doc-no-using-dept')).toBe(false);
      expect(document.querySelector('[data-doc-coverage-row="D-U1"]')?.hasAttribute('data-doc-no-using-dept')).toBe(true);
    });

    it('⑫ 第四態之比值與百分比欄呈現「—」（非 "0 / 0"、非 "0%"），且不畫進度條', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({ docCoverage: docCoverageSlice([unassignedRow({ documentId: 'd-u1', documentNumber: 'D-U1' })], { scope: 'all' }) }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-row="D-U1"]')).not.toBeNull());
      const row = document.querySelector('[data-doc-coverage-row="D-U1"]') as HTMLElement;
      expect(row.querySelector('[data-doc-coverage-ratio]')?.textContent).toBe('—');
      expect(row.querySelector('[data-doc-coverage-pct]')?.textContent).toBe('—');
      // 不畫進度條：本列不得含任何以行內 style 驅動寬度之元素——見下一案之正向對照，
      // 兩案合力才使本斷言具鑑別力（只驗負向，實作把有義務列的進度條也一併拿掉照樣通過）。
      expect(row.querySelectorAll('[style]')).toHaveLength(0);
    });

    /**
     * 🔴 正向對照（team-lead 交辦，2026-08-28）：上一案僅驗「無義務列不畫進度條」，若實作把
     * 「有義務列的進度條」也一併拿掉，上一案仍然全綠——`1b71595` 起 React 端確實未畫覆蓋率進度條
     * （prototype 25 對有義務之列會畫 `w-24 h-1.5` ＋ `style="width:{pct}%"`），此 fidelity 落差
     * 曾靜默一整輪，因為環從未斷言「進度條存在」，只斷言過「（無義務列）不存在」。本案補上正向
     * 存在性與寬度反映覆蓋率之斷言，使上一案之負向斷言重新具有鑑別力。
     */
    it('🔴 正向對照：有義務之列（totalUnits>0）必須畫出覆蓋率進度條，且其寬度反映覆蓋率百分比', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice(
            [docCoverageRow({ documentId: 'd-p1', documentNumber: 'D-P1', state: 'partial', completedUnits: 1, totalUnits: 4 })], // 25%
            { scope: 'all' },
          ),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-row="D-P1"]')).not.toBeNull());
      const row = document.querySelector('[data-doc-coverage-row="D-P1"]') as HTMLElement;
      expect(row.querySelector('[data-doc-coverage-pct]')?.textContent).toBe('25%');
      const bar = row.querySelector('[style]') as HTMLElement | null;
      expect(bar, '有義務之列必須含至少一個以行內 style 呈現寬度之進度條元素（prototype 25：w-24 h-1.5 內層 div，style="width:{pct}%"）').not.toBeNull();
      expect(bar?.style.width).toBe('25%');
    });

    it('⑬ 摘要行兩行結構：[data-doc-coverage-summary] 恰 2 個元素子節點', async () => {
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-summary]')).not.toBeNull());
      const summaryEl = document.querySelector('[data-doc-coverage-summary]') as HTMLElement;
      expect(summaryEl.children).toHaveLength(2);
    });

    it('⑬ 摘要行上行新增兩掛鉤：[data-doc-coverage-tracked]／[data-doc-coverage-unassigned] 逐字與加總關係 tracked+unassigned===total（34+18=52）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice([unassignedRow({})], {
            scope: 'all', totalDocuments: 52, byState: { all: 13, partial: 9, none: 30, unassigned: 18 }, incompleteTotal: 21,
          }),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-summary]')).not.toBeNull());
      expect(document.querySelector('[data-doc-coverage-total="52"]')?.textContent).toBe('共 52 份文件');
      expect(document.querySelector('[data-doc-coverage-tracked="34"]')?.textContent).toBe('已指定使用部門 34 份');
      expect(document.querySelector('[data-doc-coverage-unassigned="18"]')?.textContent).toBe('未指定使用部門 18 份');
    });

    /**
     * 🔴 高風險假綠陷阱（team lead 交辦）：摘要行下行之 [data-doc-coverage-stat="none"] 顯示的是
     * 「有義務卻一列都沒完成」（12），刻意不等於端點之 byState.none（30，含 18 份無義務者）。若
     * 實作直接渲染 byState.none，畫面會顯示「尚未開始 30 份」——本案讓這個錯誤紅。加總關係
     * stat.all+partial+none===tracked（13+9+12=34）一併驗證。
     */
    it('🔴 下行「尚未開始」顯示之份數＝byState.none−byState.unassigned（12），不得直接渲染 byState.none（30）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice([unassignedRow({})], {
            scope: 'all', totalDocuments: 52, byState: { all: 13, partial: 9, none: 30, unassigned: 18 }, incompleteTotal: 21,
          }),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-stat="none"]')).not.toBeNull());
      expect(document.querySelector('[data-doc-coverage-stat="all"]')?.textContent).toBe('已全部完成 13 份');
      expect(document.querySelector('[data-doc-coverage-stat="partial"]')?.textContent).toBe('部分完成 9 份');
      expect(document.querySelector('[data-doc-coverage-stat="none"]')?.textContent).toBe('尚未開始 12 份');
      expect(document.querySelector('[data-doc-coverage-stat="none"]')?.textContent).not.toBe('尚未開始 30 份');
      // 🔒 下行恰 3 個 -stat，不得多出 [data-doc-coverage-stat="unassigned"]（那有自己的掛鉤與自己的行）。
      expect(document.querySelectorAll('[data-doc-coverage-stat]')).toHaveLength(3);
      expect(document.querySelector('[data-doc-coverage-stat="unassigned"]')).toBeNull();
    });

    it.each(['incomplete', 'completed', 'unassigned', 'all'] as const)(
      '🔴 -tracked／-unassigned 不得跟著切片走：docScope=%s 下屬性值仍為完整母體（34／18）',
      async (scope) => {
        vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
          summaryFixture({
            docCoverage: docCoverageSlice([unassignedRow({})], {
              scope, totalDocuments: 52, byState: { all: 13, partial: 9, none: 30, unassigned: 18 }, incompleteTotal: 21,
            }),
          }),
        );
        renderPage();
        await waitFor(() => expect(document.querySelector('[data-doc-coverage-tracked]')).not.toBeNull());
        expect(document.querySelector('[data-doc-coverage-tracked]')?.getAttribute('data-doc-coverage-tracked')).toBe('34');
        expect(document.querySelector('[data-doc-coverage-unassigned]')?.getAttribute('data-doc-coverage-unassigned')).toBe('18');
      },
    );

    /**
     * ⑭ unassigned 範圍之截斷句兩處分岔（實質內容改變、非文案潤飾）：(a) 排序描述改為
     * 「依程序書編號昇冪排序」，不得宣稱「依覆蓋率」——該範圍下所有列之覆蓋率皆為「—」，那是
     * 假話；(b) 完整清單導向「ICSOP 文件管理」，不得導向「OJT 資料清單」——這些文件沒有使用
     * 部門就沒有進度列，過去只會看到空的。
     */
    it('⑭ unassigned 範圍之截斷句兩處分岔：排序描述改為「依程序書編號昇冪排序」；完整清單導向「ICSOP 文件管理」（非「OJT 資料清單」）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          docCoverage: docCoverageSlice(
            manyUnassignedRows(15),
            { scope: 'unassigned', hidden: 3, totalDocuments: 52, byState: { all: 13, partial: 9, none: 30, unassigned: 18 }, incompleteTotal: 21 },
          ),
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-truncation]')).not.toBeNull());
      const text = document.querySelector('[data-doc-coverage-truncation]')?.textContent ?? '';
      expect(text).toContain('本表依程序書編號昇冪排序');
      expect(text).not.toContain('依覆蓋率');
      expect(text).toContain('請至「ICSOP 文件管理」');
      expect(text).not.toContain('OJT 資料清單');
      expect(text).toContain('另有 3 份未指定使用部門之文件未列出');
    });

    it('⑨ 切換至 unassigned 範圍 ⇒ 發出一次帶 docScope=unassigned 之 GET /admin/ojt-progress/summary（非客端切換）', async () => {
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-doc-coverage-scope]')).not.toBeNull());
      const callsBefore = vi.mocked(endpoints.getOjtProgressSummary).mock.calls.length;
      const sel = document.querySelector('[data-doc-coverage-scope]') as HTMLSelectElement;
      fireEvent.change(sel, { target: { value: 'unassigned' } });
      await waitFor(() => expect(vi.mocked(endpoints.getOjtProgressSummary).mock.calls.length).toBeGreaterThan(callsBefore));
      const lastCall = vi.mocked(endpoints.getOjtProgressSummary).mock.calls.at(-1);
      expect(lastCall).toContain('unassigned');
    });
  });

  /**
   * ===================== B-3. TAB1 區三「最近完成」之節流（OQ-E11-21，AC-16 節流八項，AC-28⑱） =====================
   * 🔒 後端 `recentSessions` 形狀不變（仍回傳 30 天窗口內之全部，未動）——上限 8 為**純前端呈現層
   * 切片**（§架構設計 一-2 末段）。🔴 與區一刻意不同、不得互相對齊：上限 8 vs 15／無 vs 有捲軸／
   * 無 vs 有顯示範圍控制項／截斷句無 vs 有名詞變體。
   */
  describe('B-3. TAB1 區三節流（OQ-E11-21／AC-16 節流／AC-28⑱）', () => {
    /** 12 筆 30 天窗口內之場次，array 順序刻意打散（非日期排序），驗證「排序在切片之前」。 */
    function twelveRecentSessions() {
      const dates = [
        '2026-08-18', '2026-08-27', '2026-08-16', '2026-08-25', '2026-08-22', '2026-08-20',
        '2026-08-24', '2026-08-19', '2026-08-23', '2026-08-17', '2026-08-26', '2026-08-21',
      ];
      return dates.map((trainingDate, i) => ({
        documentId: `d${i}`, documentNumber: `N${String(i).padStart(2, '0')}`, documentName: `文件-${i}`,
        companyCode: 'AS', orgCode: `ORG${i}`, orgName: `單位${i}`, trainingDate,
      }));
    }

    it('上限與筆數：母體（30 天窗口）> 8 ⇒ [data-recent-row] 恰 8 個', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(summaryFixture({ recentSessions: twelveRecentSessions() }));
      renderPage();
      await waitFor(() => expect(document.querySelectorAll('[data-recent-row]').length).toBe(8));
    });

    /**
     * 🔴 假綠陷阱 15（區三取錯哪 8 筆之筆數假綠，ux-fix 已實跑注入證實）：把 slice(0,N) 換成
     * slice(-N)（取最舊 8 筆）時，筆數斷言仍全綠，只有日期序列之非遞增斷言與首尾列斷言會紅。
     * 「保留的是最新 8 筆」必須是一條獨立於筆數之方向斷言。
     */
    it('🔴 假綠陷阱 15 防線：日期序列非遞增（保留最新 8 筆，非任意 8 筆）；首列為最新、尾列為第 8 新（非最舊）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(summaryFixture({ recentSessions: twelveRecentSessions() }));
      renderPage();
      await waitFor(() => expect(document.querySelectorAll('[data-recent-row]').length).toBe(8));
      const dates = [...document.querySelectorAll('[data-recent-date]')].map((el) => el.textContent ?? '');
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] <= dates[i - 1]).toBe(true); // 非遞增
      }
      const rows = [...document.querySelectorAll('[data-recent-row]')].map((el) => el.getAttribute('data-recent-row'));
      // 12 筆中最新 8 筆之日期（由新到舊）：27,26,25,24,23,22,21,20 → 對應 i=1,10,3,6,8,4,11,5。
      expect(rows[0]).toBe('d1__ORG1'); // 2026-08-27，全體最新
      expect(rows[7]).toBe('d5__ORG5'); // 2026-08-20，第 8 新（非最舊之 08-16）
      expect(rows).not.toContain('d2__ORG2'); // 2026-08-16，全體最舊，必須被截掉
    });

    it('🔴 排序在切片之前：最舊者即使在資料陣列順序上排最前，仍不得因此擠進呈現之 8 筆', async () => {
      const sessions = twelveRecentSessions(); // dates[0] = '2026-08-18'，非全體最舊（08-16 才是）；改造成最舊者排陣列第一筆
      const oldest = sessions.find((s) => s.trainingDate === '2026-08-16')!;
      const reordered = [oldest, ...sessions.filter((s) => s.trainingDate !== '2026-08-16')];
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(summaryFixture({ recentSessions: reordered }));
      renderPage();
      await waitFor(() => expect(document.querySelectorAll('[data-recent-row]').length).toBe(8));
      const rows = [...document.querySelectorAll('[data-recent-row]')].map((el) => el.getAttribute('data-recent-row'));
      expect(rows).not.toContain(`${oldest.documentId}__${oldest.orgCode}`);
    });

    it('截斷告知：存在時三要素齊備，逐字比對現行語料之完整句（12 筆／8 筆／4 筆）；末句逐字鎖，不得改寫為「查看完整清單」', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(summaryFixture({ recentSessions: twelveRecentSessions() }));
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-recent-truncation]')).not.toBeNull());
      const trunc = document.querySelector('[data-recent-truncation]') as HTMLElement;
      expect(trunc.getAttribute('data-recent-total')).toBe('12');
      expect(trunc.getAttribute('data-recent-hidden')).toBe('4');
      expect(trunc.textContent).toBe(
        '近 30 天內共 12 筆，本區僅列出最近 8 筆、另有 4 筆未列出；本區依最近一次訓練日期由新至舊排序，未列出者之日期均不晚於已列出者。各單位之完整場次紀錄請至「OJT 資料清單」分頁展開該進度列檢視。',
      );
      expect(trunc.textContent).toContain('展開該進度列檢視');
      expect(trunc.textContent).not.toContain('查看完整清單');
    });

    /**
     * 🔴 假綠陷阱 14 之區三變體：宿主 `<div id="recentTruncation">` 未截斷時仍在（innerHTML 為
     * 空字串）——不得以「宿主不存在」為斷言標的，必須驗證「掛鉤本身不進 DOM」。
     */
    it('🔴 未截斷之負向案（母體 ≤ 8）：[data-recent-truncation] 完全不進 DOM（非 CSS 隱藏，假綠陷阱14 之區三變體）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          recentSessions: [
            { documentId: 'd1', documentNumber: 'N01', documentName: '文件一', companyCode: 'AS', orgCode: 'A', orgName: '單位A', trainingDate: '2026-08-27' },
          ],
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-recent-row]')).not.toBeNull());
      expect(document.querySelectorAll('[data-recent-truncation]')).toHaveLength(0);
    });

    it('🔒 正向案：不排除裁撤單位（本區為事實列表，非覆蓋率分母，防範圍擴大）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          recentSessions: [
            { documentId: 'd1', documentNumber: 'N01', documentName: '裁撤單位之文件', companyCode: 'AS', orgCode: 'INACTIVE01', orgName: '已裁撤室', trainingDate: '2026-08-20' },
          ],
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-recent-row]')).not.toBeNull());
      expect(document.querySelector('[data-recent-row="d1__INACTIVE01"]')).not.toBeNull();
    });

    it('🔒 負向：本區無捲軸容器（role="region"）、無任何顯示範圍或篩選控制項（防「區一有就順手補一個」）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(summaryFixture({ recentSessions: twelveRecentSessions() }));
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-ojt-section="recent"]')).not.toBeNull());
      const sec = document.querySelector('[data-ojt-section="recent"]') as HTMLElement;
      expect(sec.querySelector('[role="region"]')).toBeNull();
      expect(sec.querySelector('select')).toBeNull();
    });
  });

  // ===================== C. TAB2 資料清單（AC-01/03/11/12/13/17/25／AC-28③④） =====================
  describe('C. TAB2 單位分組清單', () => {
    async function gotoSessionsTab() {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('文件-訓練覆蓋率')).toBeInTheDocument());
      await user.click(document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement);
      await waitFor(() => expect(document.querySelector('[data-ojt-filter-bar]')).toBeInTheDocument());
    }

    it('AC-13 篩選恰兩項；完成狀態恰三選項（所有完成狀態／已完成／尚未完成，不含「部分完成」）', async () => {
      await gotoSessionsTab();
      expect(document.querySelector('[data-ojt-filter="org"]')).not.toBeNull();
      const statusSelect = document.querySelector('[data-ojt-filter="status"]') as HTMLSelectElement;
      expect(statusSelect).not.toBeNull();
      const options = [...statusSelect.options].map((o) => o.textContent);
      expect(options).toEqual(['所有完成狀態', '已完成', '尚未完成']);
      expect(options).not.toContain('部分完成');
    });

    it('AC-11 群組容器帶單位名稱／代碼；裁撤單位帶 [data-org-inactive]=「已裁撤」', async () => {
      vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({
        items: [rowFixture({ orgCode: 'ABA00', orgName: '應用發展室', inactive: true })],
        total: 1,
      });
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-group="ABA00"]')).not.toBeNull());
      const group = document.querySelector('[data-progress-group="ABA00"]') as HTMLElement;
      expect(group.querySelector('[data-progress-group-name]')).not.toBeNull();
      expect(group.querySelector('[data-progress-group-code]')).not.toBeNull();
      expect(group.querySelector('[data-org-inactive]')?.textContent).toBe('已裁撤');
    });

    it('AC-11 進度列帶文件編號/書名、完成徽章（恰二值）、場次數', async () => {
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-row="d1__JAC00"]')).not.toBeNull());
      const row = document.querySelector('[data-progress-row="d1__JAC00"]') as HTMLElement;
      expect(row.querySelector('[data-progress-doc-number]')).not.toBeNull();
      expect(row.querySelector('[data-progress-doc-name]')).not.toBeNull();
      const badge = row.querySelector('[data-completion-badge]') as HTMLElement;
      expect(['completed', 'pending']).toContain(badge.getAttribute('data-completion-badge'));
      expect(badge.getAttribute('aria-label')).toBe(badge.textContent);
      expect(row.querySelector('[data-session-count="1"]')).not.toBeNull();
    });

    /**
     * 🔴 AC-01 現場示範：同一文件之 JA000（部層）與 JAC00（其下處室）同為使用單位，
     * 各自獨立一列——子單位已辦訓練不得使上層單位列變成已完成。
     */
    it('AC-01：父層單位（JA000，未完成）與子層單位（JAC00，已完成）各自獨立、互不影響', async () => {
      vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({
        items: [
          rowFixture({ documentId: 'd5', orgCode: 'JA000', orgName: '營運管理部', sessionCount: 0, completed: false }),
          rowFixture({ documentId: 'd5', orgCode: 'JAC00', orgName: '審查室', sessionCount: 1, completed: true }),
        ],
        total: 2,
      });
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-row="d5__JA000"]')).not.toBeNull());
      expect(
        document.querySelector('[data-progress-row="d5__JA000"] [data-completion-badge]')?.getAttribute('data-completion-badge'),
      ).toBe('pending');
      expect(
        document.querySelector('[data-progress-row="d5__JAC00"] [data-completion-badge]')?.getAttribute('data-completion-badge'),
      ).toBe('completed');
    });

    it.each(['ICSOPAdmin', 'Supervisor', 'DeptContact'] as const)(
      'AC-05 %s：可見「新增場次」控制項（[data-add-session] 存在）',
      async (role) => {
        mockAuth(role);
        await gotoSessionsTab();
        await waitFor(() => expect(document.querySelectorAll('[data-add-session]').length).toBeGreaterThan(0));
      },
    );

    it('AC-06 SysAdmin：不存在任何 [data-add-session]（DOM 不產生，非 CSS 隱藏）', async () => {
      mockAuth('SysAdmin');
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-row]')).not.toBeNull());
      expect(document.querySelectorAll('[data-add-session]').length).toBe(0);
    });

    it('AC-25 孤兒列：無「新增場次」入口（即使角色可寫），且帶 [data-row-orphaned] 逐字註記', async () => {
      vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({
        items: [rowFixture({ orgCode: 'DAB00', orgName: '客服室', orphaned: true, sessionCount: 1, completed: true })],
        total: 1,
      });
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-row="d1__DAB00"]')).not.toBeNull());
      const row = document.querySelector('[data-progress-row="d1__DAB00"]') as HTMLElement;
      expect(row.querySelector('[data-add-session]')).toBeNull();
      expect(row.querySelector('[data-row-orphaned]')?.textContent).toBe('單位已移出使用部門，不計統計');
    });

    it('AC-12 展開列 → 顯示場次明細（日期/上傳者/檔案/下載）', async () => {
      const user = userEvent.setup();
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-expand="d1__JAC00"]')).not.toBeNull());
      await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
      await waitFor(() => expect(document.querySelector('[data-session-detail="d1__JAC00"]')).not.toBeNull());
      const detail = document.querySelector('[data-session-detail="d1__JAC00"]') as HTMLElement;
      const row = detail.querySelector('[data-session-row]') as HTMLElement;
      expect(row.querySelector('[data-session-date]')).not.toBeNull();
      expect(row.querySelector('[data-session-uploader]')).not.toBeNull();
      expect(row.querySelector('[data-session-file]')).not.toBeNull();
      expect(row.querySelector('[data-session-download]')).not.toBeNull();
    });

    it('AC-12 0 筆場次展開 → [data-session-empty] 逐字「此單位尚未登記任何教育訓練場次」', async () => {
      vi.mocked(endpoints.getOjtProgressRowSessions).mockResolvedValue({ sessions: [] });
      const user = userEvent.setup();
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-expand="d1__JAC00"]')).not.toBeNull());
      await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
      await waitFor(() => {
        expect(document.querySelector('[data-session-empty]')?.textContent).toBe('此單位尚未登記任何教育訓練場次');
      });
    });

    it('AC-28⑩ 同日兩梯之下載鈕 aria-label 帶檔名以資區辨（不因同日期而重名）', async () => {
      vi.mocked(endpoints.getOjtProgressRowSessions).mockResolvedValue({
        sessions: [
          sessionFixture({ id: 's9', trainingDate: '2026-02-14', fileName: '上午梯.pdf' }),
          sessionFixture({ id: 's10', trainingDate: '2026-02-14', fileName: '下午梯.jpg' }),
        ],
      });
      const user = userEvent.setup();
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-expand="d1__JAC00"]')).not.toBeNull());
      await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
      await waitFor(() => expect(document.querySelectorAll('[data-session-download]').length).toBe(2));
      const [a, b] = [...document.querySelectorAll('[data-session-download]')];
      expect(a.getAttribute('aria-label')).not.toBe(b.getAttribute('aria-label'));
    });

    /**
     * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，frontend ring 異議）：原案與下一案
     * （「全域無任何進度列」）在完全相同的前提下互斥——同一 `beforeEach`、同一 mock
     * `getOjtProgressRows → { items: [], total: 0 }`、同一 `gotoSessionsTab()`（未觸碰任何
     * 篩選控制項），任何實作皆不可能同時滿足「`查無符合條件的進度列` 存在且 `目前沒有任何
     * OJT 進度列` 為 null」與「`目前沒有任何 OJT 進度列` 存在」。
     * 權威 `prototypes/25-ojt-progress.html` `renderRows()`（:941-955）之 `filtered=!!(kw||st)`
     * 二分：**未套用任何篩選** ⇒ 一律走 `EMPTY_ALL_TEXT`（全域空狀態）分支，與是否曾經有列
     * 無關——本案原本之共同前提正是「未套用篩選」，站不住「篩選無結果」這個判定。
     * 改法：於 `gotoSessionsTab()` 之後、斷言之前實際對 `[data-ojt-filter="org"]` 套用一個
     * 篩選字串，使 `kw` 非空、`filtered=true`，前提與下一案（真正未套用篩選）不再相同，
     * 兩案之鑑別力皆保留。
     */
    it('AC-13 篩選無結果 → 「查無符合條件的進度列」（與全域空狀態為不同字串）', async () => {
      vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: [], total: 0 });
      const user = userEvent.setup();
      await gotoSessionsTab();
      await user.type(document.querySelector('[data-ojt-filter="org"]') as HTMLElement, '審查室');
      await waitFor(() => {
        expect(screen.getByText('查無符合條件的進度列')).toBeInTheDocument();
        expect(screen.queryByText('目前沒有任何 OJT 進度列')).toBeNull();
      });
    });

    it('全域無任何進度列 → 「目前沒有任何 OJT 進度列」＋補充提示（正確補救路徑在文件表單）', async () => {
      vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: [], total: 0 });
      await gotoSessionsTab();
      await waitFor(() => {
        expect(screen.getByText('目前沒有任何 OJT 進度列')).toBeInTheDocument();
        expect(screen.getByText(
          '進度列由各 ICSOP 文件之「文件使用部門」衍生而得，無法於本頁建立；請先至「ICSOP 文件管理」為文件指定使用部門。',
        )).toBeInTheDocument();
      });
    });

    it('AC-26 待歸位區：無任何待歸位項目時，區塊不進 DOM（歸位完畢＝一次性工作，不留永久空框）', async () => {
      vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({ items: [] });
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-row]')).not.toBeNull());
      expect(document.querySelector('[data-ojt-pending-block]')).toBeNull();
    });

    it('AC-26 待歸位區：有項目時列出每筆並僅 ICSOPAdmin 可見指派鈕', async () => {
      vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({
        items: [{ id: 'lg1', documentId: 'd4', documentNumber: 'ICSOP-SRC-104-1-05', documentName: '作服撥款作業（車輛）', fileName: '作服撥款作業_OJT簽到表.pdf', trainingDate: null, uploadedAt: '2025-11-14T09:32:00.000Z' }],
      });
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-ojt-pending-block]')).not.toBeNull());
      const row = document.querySelector('[data-pending-row="lg1"]') as HTMLElement;
      expect(row.querySelector('[data-pending-doc]')).not.toBeNull();
      expect(row.querySelector('[data-pending-file]')).not.toBeNull();
      expect(document.querySelector('[data-assign-org="lg1"]')).not.toBeNull();
    });

    it('AC-26 待歸位區：非 ICSOPAdmin 角色看得到清單但看不到指派鈕', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({
        items: [{ id: 'lg1', documentId: 'd4', documentNumber: 'ICSOP-SRC-104-1-05', documentName: '作服撥款作業（車輛）', fileName: 'x.pdf', trainingDate: null, uploadedAt: '2025-11-14T09:32:00.000Z' }],
      });
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-pending-row="lg1"]')).not.toBeNull());
      expect(document.querySelector('[data-assign-org="lg1"]')).toBeNull();
    });

    // 🔒 User 角色全頁 403、無法進入 TAB2，其守門另案覆蓋於「E. 角色守門」，故本 it.each 不含 User
    // （避免出現一個提前 return、實質零斷言的假案例）。
    it.each(['Supervisor', 'DeptContact', 'SysAdmin'] as const)(
      'AC-19 %s：無任何 [data-session-delete]（僅 ICSOPAdmin 可見刪除控制項）',
      async (role) => {
        mockAuth(role);
        const user = userEvent.setup();
        renderPage();
        await waitFor(() => expect(screen.getByText('文件-訓練覆蓋率')).toBeInTheDocument());
        await user.click(document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement);
        await waitFor(() => expect(document.querySelector('[data-progress-row]')).not.toBeNull());
        await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
        await waitFor(() => expect(document.querySelectorAll('[data-session-delete]').length).toBe(0));
      },
    );

    it('AC-19 ICSOPAdmin：恰 1 個 [data-session-delete]（每筆場次各 1 個）', async () => {
      const user = userEvent.setup();
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-expand="d1__JAC00"]')).not.toBeNull());
      await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
      await waitFor(() => expect(document.querySelectorAll('[data-session-delete="s1"]').length).toBe(1));
    });

    it('AC-20 負向：全域不存在任何 [data-session-edit]（含 ICSOPAdmin）', async () => {
      const user = userEvent.setup();
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-expand="d1__JAC00"]')).not.toBeNull());
      await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
      expect(document.querySelectorAll('[data-session-edit]').length).toBe(0);
    });

    describe('AC-19 刪除確認之三分支（AC-28⑬）', () => {
      async function openSessionDetailAndDelete(sessionId: string) {
        const user = userEvent.setup();
        await gotoSessionsTab();
        await waitFor(() => expect(document.querySelector('[data-progress-expand="d1__JAC00"]')).not.toBeNull());
        await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
        await waitFor(() => expect(document.querySelector(`[data-session-delete="${sessionId}"]`)).not.toBeNull());
        await user.click(document.querySelector(`[data-session-delete="${sessionId}"]`) as HTMLElement);
        await waitFor(() => expect(document.querySelector('[data-confirm-modal]')).not.toBeNull());
        return document.querySelector('[data-confirm-modal]') as HTMLElement;
      }

      it('(a) 一般列尚有其他場次 → 確認內文提及刪除後仍為「已完成」', async () => {
        vi.mocked(endpoints.getOjtProgressRowSessions).mockResolvedValue({
          sessions: [sessionFixture({ id: 's1' }), sessionFixture({ id: 's2', trainingDate: '2026-06-01' })],
        });
        const modal = await openSessionDetailAndDelete('s1');
        expect(modal.textContent).toContain('已完成');
      });

      it('(b) 一般列最後一筆 → 確認內文提及退回「尚未完成」', async () => {
        vi.mocked(endpoints.getOjtProgressRowSessions).mockResolvedValue({ sessions: [sessionFixture({ id: 's1' })] });
        const modal = await openSessionDetailAndDelete('s1');
        expect(modal.textContent).toContain('尚未完成');
      });

      it('(c) 🔴 孤兒列最後一筆 → 確認內文明講該列整列消失且無法重新登記（與 a/b 皆不同之第 3 種措辭）', async () => {
        vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({
          items: [rowFixture({ orgCode: 'DAB00', orgName: '客服室', orphaned: true, sessionCount: 1, completed: true })],
          total: 1,
        });
        vi.mocked(endpoints.getOjtProgressRowSessions).mockResolvedValue({ sessions: [sessionFixture({ id: 's1' })] });
        const user = userEvent.setup();
        await gotoSessionsTab();
        await waitFor(() => expect(document.querySelector('[data-progress-expand="d1__DAB00"]')).not.toBeNull());
        await user.click(document.querySelector('[data-progress-expand="d1__DAB00"]') as HTMLElement);
        await waitFor(() => expect(document.querySelector('[data-session-delete="s1"]')).not.toBeNull());
        await user.click(document.querySelector('[data-session-delete="s1"]') as HTMLElement);
        await waitFor(() => expect(document.querySelector('[data-confirm-modal]')).not.toBeNull());
        const modal = document.querySelector('[data-confirm-modal]') as HTMLElement;
        expect(modal.textContent).toMatch(/無法.*重新登記|無法.*再.*登記/);
      });

      it('確認刪除 → 呼叫 deleteOjtSession 並關閉 modal', async () => {
        const user = userEvent.setup();
        const modal = await openSessionDetailAndDelete('s1');
        await user.click(within(modal).getByRole('button', { name: /確認/ }));
        await waitFor(() => expect(endpoints.deleteOjtSession).toHaveBeenCalledWith('s1'));
      });
    });
  });

  // ===================== D. 新增場次 modal（AC-02/09/10／AC-28⑤） =====================
  describe('D. 新增場次 modal', () => {
    async function openAddModal() {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('文件-訓練覆蓋率')).toBeInTheDocument());
      await user.click(document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement);
      await waitFor(() => expect(document.querySelector('[data-add-session]')).not.toBeNull());
      await user.click(document.querySelector('[data-add-session]') as HTMLElement);
      await waitFor(() => expect(document.querySelector('[data-add-session-modal]')).not.toBeNull());
      return user;
    }

    it('開啟 modal：目標摘要／訓練日期 label／簽到表檔案 label 存在', async () => {
      await openAddModal();
      expect(document.querySelector('[data-add-session-target]')).not.toBeNull();
      expect(screen.getByText('訓練日期')).toBeInTheDocument();
      expect(screen.getByText('簽到表檔案')).toBeInTheDocument();
    });

    it('AC-09① 未填日期送出 → 錯誤逐字「請選擇訓練日期。」（非「請填寫」）', async () => {
      const user = await openAddModal();
      await user.click(document.querySelector('[data-session-submit]') as HTMLElement);
      await waitFor(() => {
        expect(document.querySelector('[data-session-error]')?.textContent).toBe('請選擇訓練日期。');
      });
    });

    it('AC-09② 未來日 → 錯誤逐字「訓練日期不得晚於今日；場次記錄的是已發生之教育訓練事實。」', async () => {
      const user = await openAddModal();
      const dateInput = document.querySelector('[data-session-date-input]') as HTMLInputElement;
      const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
      // 🔴 原生 <input type="date"> 之逐字元輸入在 jsdom 下不可靠，比照 RTL 慣例以 fireEvent.change 直接設值。
      fireEvent.change(dateInput, { target: { value: future } });
      await user.click(document.querySelector('[data-session-submit]') as HTMLElement);
      await waitFor(() => {
        expect(document.querySelector('[data-session-error]')?.textContent).toBe(
          '訓練日期不得晚於今日；場次記錄的是已發生之教育訓練事實。',
        );
      });
    });

    it('AC-09② 當日（伺服器今日）合法，不觸發未來日錯誤', async () => {
      const user = await openAddModal();
      const dateInput = document.querySelector('[data-session-date-input]') as HTMLInputElement;
      const today = new Date().toISOString().slice(0, 10);
      fireEvent.change(dateInput, { target: { value: today } });
      const file = new File(['x'], 'ojt.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('[data-session-file-input]') as HTMLInputElement;
      await user.upload(fileInput, file);
      await user.click(document.querySelector('[data-session-submit]') as HTMLElement);
      await waitFor(() => {
        const err = document.querySelector('[data-session-error]');
        expect(err?.textContent ?? '').not.toMatch(/不得晚於今日/);
      });
    });

    it('AC-09③／AC-10 未選檔案送出（日期已填）→ 錯誤逐字「請選擇簽到表檔案（pdf / jpg / jpeg / png，單檔 ≤ 50 MB）。」', async () => {
      const user = await openAddModal();
      const dateInput = document.querySelector('[data-session-date-input]') as HTMLInputElement;
      const today = new Date().toISOString().slice(0, 10);
      fireEvent.change(dateInput, { target: { value: today } });
      await user.click(document.querySelector('[data-session-submit]') as HTMLElement);
      await waitFor(() => {
        expect(document.querySelector('[data-session-error]')?.textContent).toBe(
          '請選擇簽到表檔案（pdf / jpg / jpeg / png，單檔 ≤ 50 MB）。',
        );
      });
    });

    it('AC-02／AC-18 成功送出 → 呼叫 addOjtSession(documentId, orgCode, {...})，modal 關閉、場次數遞增', async () => {
      const user = await openAddModal();
      const dateInput = document.querySelector('[data-session-date-input]') as HTMLInputElement;
      const today = new Date().toISOString().slice(0, 10);
      fireEvent.change(dateInput, { target: { value: today } });
      const file = new File(['x'], 'ojt.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('[data-session-file-input]') as HTMLInputElement;
      await user.upload(fileInput, file);
      await user.click(document.querySelector('[data-session-submit]') as HTMLElement);
      await waitFor(() => expect(endpoints.addOjtSession).toHaveBeenCalledWith(
        'd1', 'JAC00', expect.objectContaining({ trainingDate: today, file: expect.any(File) }),
      ));
      await waitFor(() => expect(document.querySelector('[data-add-session-modal]')).toBeNull());
    });
  });

  // ===================== E. 角色守門（AC-06／AC-07） =====================
  describe('E. 角色守門', () => {
    it('AC-07 User：全頁 403（不採 F041 之 404 隱藏存在性例外）', async () => {
      mockAuth('User');
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
      });
      expect(screen.queryByText('文件-訓練覆蓋率')).toBeNull();
    });

    it('AC-06 SysAdmin：可讀兩分頁全部內容，但寫入型控制項不存在（新增場次鈕 0 個）', async () => {
      mockAuth('SysAdmin');
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('文件-訓練覆蓋率')).toBeInTheDocument());
      await user.click(document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement);
      await waitFor(() => expect(document.querySelector('[data-progress-row]')).not.toBeNull());
      expect(document.querySelectorAll('[data-add-session]').length).toBe(0);
    });
  });

  /**
   * ===================== F. TAB2 第二種分組模式「以文件分組」（AC-30～AC-36／AC-28⑳） =====================
   * 🔴 2026-09-01 人類核可之需求：TAB2 恆以使用單位為群組（`AC-11`），要回答「這一份文件，各使用
   * 單位辦得如何」得把同一份文件散落在各單位群組下的列逐一湊起來。本輪新增分組模式切換（恰二態），
   * 🔒 **預設仍為「以使用單位分組」＝現況一格不改**（`AC-36` 之零漣漪鎖）。
   * 權威：F042-ojt-progress-management.md §九（`AC-30`～`AC-36`）＋ §3-B（掛鉤）＋ §6 ⑳（逐字）。
   *
   * ⚠ 對實作全盲：`[data-ojt-group-mode]` 等 8 組掛鉤與 `ojt-progress-view` 之新符號皆尚不存在
   * ⇒ 本 describe 全紅即為本環之預期紅燈。
   *
   * 🔴 **本 describe 之三個防假綠設計（本 repo 反覆踩過的形狀，逐條對應）**：
   *   ① **折疊驗「不進 DOM」、且配正向對照**——同一份語料在 `org` 模式下先斷言渲染出 3 列，
   *      再切到 `document` 模式斷言 0 列。少了正向那半句，「列根本沒載進來」與「列被折疊起來」
   *      在斷言上無從分辨，該負向斷言退化為恆真（假綠）。
   *   ② **口徑語料刻意分岔**——`d-cal` 在 TAB2 有 3 列（含 1 列孤兒、1 列裁撤、2 列已完成），
   *      而 `summaryFixture` 之 `docCoverage` 對同一份文件給 `1 / 2`。⚠ **只放裁撤列造不出差異**：
   *      `AC-04`／`docCoverage` 同樣不套 `isActive` 過濾，兩邊會剛好相等 ⇒ 那條斷言等於沒寫。
   *      **真正的分岔在孤兒列**（`docCoverage` 之列由 `DOC_USING_DEPT` 驅動，孤兒天然不成列）。
   *   ③ **中文文案字面一律不寫在本檔**——逐字鎖只在 `ojt-progress-view.test.ts` §一（全環唯一
   *      一份），本檔一律 import 常數（`AC-35`）。
   */
  describe('F. TAB2 以文件分組（AC-30～AC-36／AC-28⑳）', () => {
    const CAL_DOC_ID = 'd-cal';
    const CAL_DOC_NUMBER = 'ICSOP-CAL-002';
    const CAL_DOC_NAME = '徵信作業要點';
    const OTHER_DOC_ID = 'd-abc';
    const OTHER_DOC_NUMBER = 'ICSOP-ABC-001';
    const OTHER_DOC_NAME = '車輛分期進件作業';

    /**
     * 🔴 口徑分岔語料（`AC-32` 之核心）：同一份文件 `d-cal` 在 TAB2 有 **3 列**、其中 2 列已完成
     * ⇒ TAB2 口徑為 `2 / 3`（67%）；而 `docCoverage` 對同一份文件為 `1 / 2`（50%）。
     * 🔒 列之順序刻意亂序（C／A／B），使 `AC-34` 之組內排序斷言真的在驗排序而非驗輸入順序。
     */
    const calRows = () => [
      rowFixture({
        documentId: CAL_DOC_ID, documentNumber: CAL_DOC_NUMBER, documentName: CAL_DOC_NAME,
        companyCode: 'AS', orgCode: 'CCC00', orgName: '和潤企業 / 財務會計部 / C 室',
        sessionCount: 1, completed: true, orphaned: true,
      }),
      rowFixture({
        documentId: CAL_DOC_ID, documentNumber: CAL_DOC_NUMBER, documentName: CAL_DOC_NAME,
        companyCode: 'AS', orgCode: 'AAA00', orgName: '和潤企業 / 財務會計部 / A 室',
        sessionCount: 1, completed: true,
      }),
      rowFixture({
        documentId: CAL_DOC_ID, documentNumber: CAL_DOC_NUMBER, documentName: CAL_DOC_NAME,
        companyCode: 'AS', orgCode: 'BBB00', orgName: '和潤企業 / 財務會計部 / B 室',
        sessionCount: 0, completed: false, inactive: true,
      }),
    ];

    /** 兩份文件之語料；🔒 編號刻意讓亂序輸入（CAL 在前）與排序後（ABC 在前）不同（`AC-34`）。 */
    const twoDocRows = () => [
      ...calRows(),
      rowFixture({
        documentId: OTHER_DOC_ID, documentNumber: OTHER_DOC_NUMBER, documentName: OTHER_DOC_NAME,
        companyCode: 'AS', orgCode: 'ZZZ00', orgName: '和潤企業 / 營運管理部 / Z 室',
        sessionCount: 0, completed: false,
      }),
    ];

    /** 🔴 TAB1 之 `docCoverage` 對 `d-cal` 給 `1 / 2`——與 TAB2 之 `2 / 3` 刻意不同口徑。 */
    const calSummary = () =>
      summaryFixture({
        docCoverage: docCoverageSlice(
          [docCoverageRow({
            documentId: CAL_DOC_ID, documentNumber: CAL_DOC_NUMBER, documentName: CAL_DOC_NAME,
            state: 'partial', completedUnits: 1, totalUnits: 2,
          })],
          { scope: 'all' },
        ),
      });

    async function gotoSessionsTab(rows = calRows()) {
      vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: rows, total: rows.length });
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(calSummary());
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => expect(screen.getByText('文件-訓練覆蓋率')).toBeInTheDocument());
      await user.click(document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement);
      await waitFor(() => expect(document.querySelector('[data-ojt-filter-bar]')).toBeInTheDocument());
      return user;
    }

    const groupMode = () => document.querySelector('[data-ojt-group-mode]') as HTMLSelectElement;
    const docSearch = () => document.querySelector('[data-ojt-doc-search]') as HTMLInputElement;
    const calGroup = () => document.querySelector(`[data-doc-group="${CAL_DOC_ID}"]`) as HTMLElement;
    const calToggle = () => document.querySelector(`[data-doc-group-toggle="${CAL_DOC_ID}"]`) as HTMLElement;

    /** 切換分組模式；等待點刻意落在 select 自身之值（空語料下亦適用，不預設一定畫得出群組）。 */
    async function switchTo(mode: 'org' | 'document') {
      fireEvent.change(groupMode(), { target: { value: mode } });
      await waitFor(() => expect(groupMode().value).toBe(mode));
    }

    // ---------- F-1. 分組模式切換（AC-30／AC-36） ----------

    it('AC-30 分組模式控制項：恰兩個 option（逐字＝具名常數）、預設 org；🔴 不得掛 data-ojt-filter（AC-13「篩選恰兩項」為既有鎖）', async () => {
      await gotoSessionsTab();
      const sel = groupMode();
      expect(sel).not.toBeNull();
      expect(sel.getAttribute('aria-label')).toBe(GROUP_MODE_ARIA_TEXT);
      expect([...sel.options].map((o) => ({ value: o.value, text: o.textContent }))).toEqual([
        { value: 'org', text: GROUP_MODE_ORG_TEXT },
        { value: 'document', text: GROUP_MODE_DOC_TEXT },
      ]);
      expect(sel.value).toBe('org');
      // 🔴 它不是篩選：不移除任何列，只改列的組織方式；算成第三個篩選會直接推翻 OQ-E11-15→A。
      expect(sel.hasAttribute('data-ojt-filter')).toBe(false);
      expect(document.querySelectorAll('[data-ojt-filter]')).toHaveLength(2);
    });

    it('AC-30／AC-31 兩種群組容器互斥渲染（各自先以正向斷言確立當下模式之群組存在）', async () => {
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-group="AAA00"]')).not.toBeNull());
      expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(0);
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      expect(document.querySelectorAll('[data-progress-group]')).toHaveLength(0);
    });

    /**
     * 🔴 `AC-30`：分組純為前端行為——`GET /admin/ojt-progress/rows` 已回傳完整、未分頁之列。
     * 為分組再打一次 API，等於把一個純呈現決策做成一次網路往返。
     * 🔒 先斷言 `before > 0`：否則「切換前後次數相同」在兩邊都是 0 時恆真（假綠）。
     */
    it('🔴 AC-30 切換分組模式不重新請求 rows（同一份資料來源）', async () => {
      await gotoSessionsTab();
      const before = vi.mocked(endpoints.getOjtProgressRows).mock.calls.length;
      expect(before).toBeGreaterThan(0);
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      expect(vi.mocked(endpoints.getOjtProgressRows).mock.calls.length).toBe(before);
    });

    it('AC-36 [data-ojt-row-count] 之文字不因分組模式改變（同一批列、同一口徑）', async () => {
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-ojt-row-count]')?.textContent).toBeTruthy());
      const before = document.querySelector('[data-ojt-row-count]')?.textContent;
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      expect(document.querySelector('[data-ojt-row-count]')?.textContent).toBe(before);
    });

    // ---------- F-2. 群組形狀與口徑（AC-31／AC-32） ----------

    it('AC-31② 群組標題：文件編號與書名各有專屬掛鉤', async () => {
      await gotoSessionsTab();
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      expect(calGroup().querySelector('[data-doc-group-number]')?.textContent).toBe(CAL_DOC_NUMBER);
      expect(calGroup().querySelector('[data-doc-group-name]')?.textContent).toBe(CAL_DOC_NAME);
    });

    it('🔴 AC-32 口徑鎖：完成度取自 TAB2 當下呈現之列（2 / 3），非 docCoverage 之 1 / 2', async () => {
      await gotoSessionsTab();
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      const ratio = calGroup().querySelector('[data-doc-group-ratio]') as HTMLElement;
      expect(ratio, '文件群組缺 [data-doc-group-ratio] 完成度載體').not.toBeNull();
      expect(ratio.textContent).toBe(docGroupRatioText(2, 3));
      // 🔴 負向（上一句已確立載體存在，故具鑑別力）：讀 docCoverage 就會落在 1 / 2。
      expect(ratio.textContent).not.toBe(docGroupRatioText(1, 2));
    });

    it('🔴 AC-32 百分比＝docGroupPercentText（其內部委派既有 coveragePercent，全頁單一推導點）：2/3 ⇒ 67%，非 docCoverage 之 1/2 ⇒ 50%', async () => {
      await gotoSessionsTab();
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      const pct = calGroup().querySelector('[data-doc-group-pct]') as HTMLElement;
      expect(pct, '文件群組缺 [data-doc-group-pct] 百分比載體').not.toBeNull();
      expect(pct.textContent).toBe(docGroupPercentText(2, 3));
      expect(pct.textContent).not.toBe(docGroupPercentText(1, 2));
    });

    it('AC-32 口徑說明行：🔒 全頁恰 1 個、逐字＝常數；🔒 僅 document 模式進 DOM', async () => {
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-progress-group="AAA00"]')).not.toBeNull());
      expect(document.querySelectorAll('[data-doc-group-basis-note]')).toHaveLength(0);
      await switchTo('document');
      await waitFor(() => expect(document.querySelector('[data-doc-group-basis-note]')).not.toBeNull());
      expect(document.querySelectorAll('[data-doc-group-basis-note]')).toHaveLength(1);
      expect(document.querySelector('[data-doc-group-basis-note]')?.textContent).toBe(DOC_GROUP_BASIS_NOTE_TEXT);
    });

    /**
     * 🔴 `AC-32` 之「**當下呈現之列**」：既有兩項篩選在 document 模式下持續生效（`AC-30`），
     * 且完成度必須跟著呈現集合走——若實作以「未篩選之全部列」計算，本案即紅。
     */
    it('🔴 AC-32「當下呈現之列」：完成狀態篩選為「已完成」⇒ 完成度改為 2 / 2（100%）', async () => {
      await gotoSessionsTab();
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      const ratioText = () => calGroup().querySelector('[data-doc-group-ratio]')?.textContent;
      expect(ratioText()).toBe(docGroupRatioText(2, 3)); // 正向：未篩選時之口徑
      const statusSelect = document.querySelector('[data-ojt-filter="status"]') as HTMLSelectElement;
      const completedOpt = [...statusSelect.options].find((o) => o.textContent === '已完成');
      expect(completedOpt, '完成狀態篩選缺「已完成」選項（AC-13 之既有三值）').toBeTruthy();
      fireEvent.change(statusSelect, { target: { value: completedOpt!.value } });
      await waitFor(() => expect(ratioText()).toBe(docGroupRatioText(2, 2)));
      expect(calGroup().querySelector('[data-doc-group-pct]')?.textContent).toBe(docGroupPercentText(2, 2));
    });

    // ---------- F-3. 規模收斂之硬需求 ①：預設折疊、展開才渲染（AC-33①） ----------

    /**
     * 🔴 本輪唯一要消除的缺陷：正式站 591 份文件若都指定了使用部門，群組數逼近文件數 ⇒ 一次
     * 渲染近 600 組與其全部列。斷言必須是「**完全不進 DOM**」——只驗 CSS class 或
     * `toBeVisible()` 之否定，該效能缺陷會整個逃掉。
     * 🔒 正向對照（同一份語料在 org 模式為 3 列）使本負向斷言具鑑別力。
     */
    it('🔴 AC-33① 預設折疊：群組進 DOM 但組內列完全不進 DOM（正向對照：同語料在 org 模式為 3 列）', async () => {
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelectorAll('[data-progress-row]')).toHaveLength(3));
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      expect(calToggle(), '文件群組缺 [data-doc-group-toggle] 折疊控制項').not.toBeNull();
      expect(calToggle().getAttribute('aria-expanded')).toBe('false');
      expect(document.querySelectorAll('[data-progress-row]')).toHaveLength(0);
    });

    it('AC-33①／AC-34 展開才渲染：aria-expanded 轉 true、組內 3 列進 DOM，且依 orgName 昇冪', async () => {
      const user = await gotoSessionsTab();
      await switchTo('document');
      await waitFor(() => expect(calToggle()).not.toBeNull());
      await user.click(calToggle());
      await waitFor(() => expect(document.querySelectorAll('[data-progress-row]')).toHaveLength(3));
      expect(calToggle().getAttribute('aria-expanded')).toBe('true');
      // A 室／B 室／C 室 ⇒ AAA00／BBB00／CCC00；語料刻意以 C／A／B 之順序餵入。
      expect(
        [...document.querySelectorAll('[data-progress-row]')].map((el) => el.getAttribute('data-progress-row')),
      ).toEqual([`${CAL_DOC_ID}__AAA00`, `${CAL_DOC_ID}__BBB00`, `${CAL_DOC_ID}__CCC00`]);
    });

    it('AC-33① 再點一次收合 ⇒ 組內列再次自 DOM 移除（非 CSS 隱藏）', async () => {
      const user = await gotoSessionsTab();
      await switchTo('document');
      await waitFor(() => expect(calToggle()).not.toBeNull());
      await user.click(calToggle());
      await waitFor(() => expect(document.querySelectorAll('[data-progress-row]')).toHaveLength(3)); // 正向
      await user.click(calToggle());
      await waitFor(() => expect(document.querySelectorAll('[data-progress-row]')).toHaveLength(0));
      expect(calToggle().getAttribute('aria-expanded')).toBe('false');
    });

    /**
     * 🔒 理由同 `AC-28`⑩（下載鈕之 `aria-label` 必須帶檔名）：591 組之折疊鈕若無從分辨，
     * 螢幕閱讀器與 `getByRole` 皆點不到正確的那一顆。🔵 完整句型為設計裁量、不入約束。
     */
    it('AC-33① 折疊鈕之 aria-label 須含該文件之程序書編號（多群組時可資分辨）', async () => {
      await gotoSessionsTab();
      await switchTo('document');
      await waitFor(() => expect(calToggle()).not.toBeNull());
      const aria = calToggle().getAttribute('aria-label') ?? '';
      expect(aria).not.toBe('');
      expect(aria).toContain(CAL_DOC_NUMBER);
    });

    it('AC-31④ 展開後之組內列沿用既有進度列之全部掛鉤與行為（含孤兒列之既有規則，一格不改）', async () => {
      const user = await gotoSessionsTab();
      await switchTo('document');
      await waitFor(() => expect(calToggle()).not.toBeNull());
      await user.click(calToggle());
      await waitFor(() => expect(document.querySelector(`[data-progress-row="${CAL_DOC_ID}__AAA00"]`)).not.toBeNull());
      const r = document.querySelector(`[data-progress-row="${CAL_DOC_ID}__AAA00"]`) as HTMLElement;
      expect(r.getAttribute('data-progress-doc')).toBe(CAL_DOC_ID);
      expect(r.getAttribute('data-progress-org')).toBe('AAA00');
      expect(r.querySelector('[data-progress-doc-number]')).not.toBeNull();
      expect(r.querySelector('[data-progress-doc-name]')).not.toBeNull();
      expect(r.querySelector('[data-completion-badge]')).not.toBeNull();
      expect(r.querySelector('[data-session-count]')).not.toBeNull();
      expect(r.querySelector('[data-progress-expand]')).not.toBeNull();
      expect(r.querySelector('[data-add-session]'), 'ICSOPAdmin 之一般列應有新增場次入口').not.toBeNull();
      // 🔒 AC-25 孤兒列之既有規則在本模式下亦不變（上一句之正向對照使本負向具鑑別力）。
      const orphan = document.querySelector(`[data-progress-row="${CAL_DOC_ID}__CCC00"]`) as HTMLElement;
      expect(orphan.querySelector('[data-row-orphaned]')).not.toBeNull();
      expect(orphan.querySelector('[data-add-session]')).toBeNull();
    });

    // ---------- F-4. 規模收斂之硬需求 ②：文件搜尋（AC-33②） ----------

    it('AC-33② 文件搜尋：🔒 僅 document 模式進 DOM；aria-label／placeholder 逐字＝常數；🔴 不得掛 data-ojt-filter', async () => {
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelector('[data-ojt-filter="org"]')).not.toBeNull());
      expect(document.querySelectorAll('[data-ojt-doc-search]')).toHaveLength(0);
      await switchTo('document');
      await waitFor(() => expect(docSearch()).not.toBeNull());
      expect(docSearch().getAttribute('aria-label')).toBe(DOC_SEARCH_ARIA_TEXT);
      expect(docSearch().getAttribute('placeholder')).toBe(DOC_SEARCH_PLACEHOLDER_TEXT);
      expect(docSearch().hasAttribute('data-ojt-filter')).toBe(false);
      expect(document.querySelectorAll('[data-ojt-filter]')).toHaveLength(2);
    });

    it('AC-33② 比對文件編號之不分大小寫子字串（先正向確立兩組皆在）', async () => {
      await gotoSessionsTab(twoDocRows());
      await switchTo('document');
      await waitFor(() => expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(2));
      fireEvent.change(docSearch(), { target: { value: 'icsop-cal' } });
      await waitFor(() => expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(1));
      expect(calGroup()).not.toBeNull();
      expect(document.querySelector(`[data-doc-group="${OTHER_DOC_ID}"]`)).toBeNull();
    });

    it('AC-33② 比對書名之子字串', async () => {
      await gotoSessionsTab(twoDocRows());
      await switchTo('document');
      await waitFor(() => expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(2));
      fireEvent.change(docSearch(), { target: { value: '徵信' } });
      await waitFor(() => expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(1));
      expect(calGroup()).not.toBeNull();
    });

    it('AC-33②／AC-35 文件搜尋無命中 ⇒ 沿用既有 EMPTY_ROWS_TEXT，不另造詞；與全域空狀態互不相同', async () => {
      await gotoSessionsTab(twoDocRows());
      await switchTo('document');
      await waitFor(() => expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(2));
      fireEvent.change(docSearch(), { target: { value: 'ZZZ-NO-SUCH-DOC' } });
      await waitFor(() => expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(0));
      expect(screen.getByText(EMPTY_ROWS_TEXT)).toBeInTheDocument();
      // 🔴 篩選無結果 ≠ 全域無列：兩者刻意為不同字串、不得混用（AC-13 之既有規則）。
      expect(screen.queryByText(EMPTY_ALL_TEXT)).toBeNull();
    });

    /**
     * 🔴 `AC-33②`：切回 `org` 模式時清空關鍵字——理由與 `AC-14`⑦ 之既有處置同源：一個看不見
     * 的條件仍在過濾列，就是畫面說謊。
     */
    it('🔴 AC-33② 切回 org 模式 ⇒ 文件搜尋不進 DOM 且關鍵字已清空（看不見的條件不得繼續過濾）', async () => {
      await gotoSessionsTab(twoDocRows());
      await switchTo('document');
      await waitFor(() => expect(docSearch()).not.toBeNull());
      fireEvent.change(docSearch(), { target: { value: '徵信' } });
      await waitFor(() => expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(1)); // 正向：關鍵字確實生效過
      await switchTo('org');
      await waitFor(() => expect(document.querySelectorAll('[data-progress-group]').length).toBeGreaterThan(0));
      expect(document.querySelectorAll('[data-ojt-doc-search]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-progress-row]')).toHaveLength(4); // 四列全在，關鍵字未殘留生效
      await switchTo('document');
      await waitFor(() => expect(docSearch()).not.toBeNull());
      expect(docSearch().value).toBe('');
      expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(2);
    });

    // ---------- F-5. 排序、空狀態與零漣漪（AC-34／AC-35／AC-36） ----------

    it('AC-34 文件群組依 documentNumber 昇冪（語料刻意亂序：CAL 先進、ABC 後進）', async () => {
      await gotoSessionsTab(twoDocRows());
      await switchTo('document');
      await waitFor(() => expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(2));
      expect(
        [...document.querySelectorAll('[data-doc-group]')].map((el) => el.getAttribute('data-doc-group')),
      ).toEqual([OTHER_DOC_ID, CAL_DOC_ID]);
    });

    it('AC-35 document 模式、全域無任何進度列 ⇒ 沿用 EMPTY_ALL_TEXT ＋ EMPTY_ALL_HINT（不另造詞）', async () => {
      await gotoSessionsTab([]);
      expect(groupMode(), '分組模式控制項應恆存在於篩選列（不因無列而消失）').not.toBeNull();
      await switchTo('document');
      await waitFor(() => expect(screen.getByText(EMPTY_ALL_TEXT)).toBeInTheDocument());
      expect(screen.getByText(EMPTY_ALL_HINT)).toBeInTheDocument();
      expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(0);
    });

    it('AC-36 往返鎖：org → document → org 之後，既有掛鉤之值與數量與從未切換過時相同', async () => {
      await gotoSessionsTab();
      await waitFor(() => expect(document.querySelectorAll('[data-progress-group]')).toHaveLength(3));
      const snapshot = () =>
        [...document.querySelectorAll('[data-progress-group]')].map((el) => el.getAttribute('data-progress-group'));
      const before = snapshot();
      expect(before).toEqual(['AAA00', 'BBB00', 'CCC00']);
      await switchTo('document');
      await waitFor(() => expect(calGroup()).not.toBeNull());
      await switchTo('org');
      await waitFor(() => expect(document.querySelectorAll('[data-progress-group]')).toHaveLength(3));
      expect(snapshot()).toEqual(before);
      expect(document.querySelectorAll('[data-progress-row]')).toHaveLength(3);
      expect(document.querySelectorAll('[data-doc-group]')).toHaveLength(0);
    });
  });
});
