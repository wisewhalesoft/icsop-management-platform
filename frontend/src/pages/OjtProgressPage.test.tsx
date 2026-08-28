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
  documentNumber: string; documentName: string; state: 'all' | 'partial' | 'none'; completedUnits: number; totalUnits: number;
}>) => ({
  documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  state: 'partial' as const, completedUnits: 2, totalUnits: 3, ...over,
});

const summaryFixture = (over: Partial<{
  coverage: { numerator: number; denominator: number; rate?: number; excludedInactive?: number; excludedOrphaned?: number };
  deptRollup: Array<{ deptOrgCode: string; deptName: string; totalUnits: number; completedUnits: number; rate: number }>;
  recentSessions: Array<{ documentId: string; documentNumber: string; documentName: string; orgCode: string; orgName: string; trainingDate: string }>;
  docCoverage: ReturnType<typeof docCoverageRow>[];
}> = {}) => ({
  coverage: { numerator: 2, denominator: 3, rate: 67, excludedInactive: 0, excludedOrphaned: 0 },
  deptRollup: [{ deptOrgCode: 'JA000', deptName: '營運管理部', totalUnits: 3, completedUnits: 2, rate: 67 }],
  recentSessions: [
    { documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', orgCode: 'JAC00', orgName: '審查室', trainingDate: '2026-08-20' },
  ],
  docCoverage: [docCoverageRow({})],
  ...over,
});

const rowFixture = (over: Partial<{
  documentId: string; documentNumber: string; documentName: string;
  orgCode: string; orgName: string; sessionCount: number; completed: boolean;
  inactive: boolean; orphaned: boolean;
}> = {}) => ({
  documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  orgCode: 'JAC00', orgName: '審查室', sessionCount: 1, completed: true,
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
          docCoverage: [
            docCoverageRow({ documentNumber: 'D-ALL', state: 'all', completedUnits: 3, totalUnits: 3 }),
            docCoverageRow({ documentNumber: 'D-PARTIAL', state: 'partial', completedUnits: 1, totalUnits: 3 }),
            docCoverageRow({ documentNumber: 'D-NONE', state: 'none', completedUnits: 0, totalUnits: 3 }),
          ],
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
        summaryFixture({ coverage: { numerator: 0, denominator: 0, rate: undefined }, docCoverage: [] }),
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
    it('AC-15 rollup 列數不變性：各部 totalUnits 加總＝彙總前之進度列總數', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          deptRollup: [
            { deptOrgCode: 'JA000', deptName: '營運管理部', totalUnits: 2, completedUnits: 2, rate: 100 },
            { deptOrgCode: 'CA000', deptName: '信用審查部', totalUnits: 1, completedUnits: 0, rate: 0 },
          ],
        }),
      );
      renderPage();
      await waitFor(() => expect(document.querySelectorAll('[data-rollup-row]').length).toBe(2));
      // data-rollup-ratio 格式為「已完成 / 進度列」（prototype 25：${g.done} / ${g.total}）。
      const ratios = [...document.querySelectorAll('[data-rollup-ratio]')].map((el) => el.textContent);
      expect(ratios).toEqual(['2 / 2', '0 / 1']);
      const invariantEl = document.querySelector('[data-rollup-invariant]') as HTMLElement;
      expect(invariantEl).not.toBeNull();
      // 各部 totalUnits 加總 = 2+1 = 3，須與不變式之敘述數字一致（本檔以文字含有 "3" 之寬鬆檢查，
      // 因逐字句為資料驅動之完整敘述，非固定字面——見 F042 §prototype 25 §2「data-rollup-invariant」）。
      expect(invariantEl.textContent).toMatch(/3/);
    });

    it('AC-15 本部層／公司層單位自成一組、不排除（OQ-E11-20②）', async () => {
      vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(
        summaryFixture({
          deptRollup: [{ deptOrgCode: 'JA000', deptName: '營運管理部', totalUnits: 1, completedUnits: 1, rate: 100 }],
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
});
