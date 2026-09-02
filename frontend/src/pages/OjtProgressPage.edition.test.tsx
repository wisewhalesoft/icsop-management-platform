import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OjtProgressPage } from './OjtProgressPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { OjtProgressRow, OjtSessionView, SessionUser } from '../api/types';
/**
 * 🔒 逐字文案一律 import 常數作斷言、不在本檔硬寫中文字面（沿用本 feature 之既有紀律）。
 * 其逐字鎖住在 `ojt-progress-view.edition.test.ts`（全環唯一一份）。
 */
import {
  DUE_DATE_LABEL,
  DUE_DATE_UNKNOWN_TEXT,
  EDITION_CURRENT_BADGE_TEXT,
  EDITION_NONE_KEY,
  EDITION_OUTDATED_BADGE_TEXT,
  RETRAIN_NOTE_TEXT,
  dueDateText,
  rowEditionText,
} from './ojt-progress-view';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

/**
 * F042 第五輪（2026-09-02 人類需求）之**元件層**約束環，三件事：
 *   ① 儀表板分頁對主管／部門窗口隱藏（分頁鈕與 panel 皆**不進 DOM**，且不發 summary 請求）
 *   ② 進度列在**程序書名之後**標示應完成訓練日期（公告日期 + 1 個月）
 *   ③ 場次明細依版次分組：當下版次展開、舊版次**收合且其場次列不進 DOM**
 *
 * 🔴 三條斷言紀律（違反其一即為假綠）：
 *   (a) 折疊一律驗「**不進 DOM**」而非 CSS 隱藏——沿用 `AC-33`① 之既有紀律。
 *   (b) 每一條負向斷言必須先有正向半句確立載體存在（例如「舊版次群組確實在、只是收合」）。
 *   (c) 「日期在書名之後」必須驗 **DOM 順序**，不得只驗兩者都存在。
 */

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

const row = (over: Partial<OjtProgressRow> = {}): OjtProgressRow => ({
  documentId: 'd1',
  documentNumber: 'ICSOP-SRC-101-1-01',
  documentName: '車輛分期進件作業',
  companyCode: 'AS',
  orgCode: 'JAC00',
  orgName: '和潤企業 / 營運管理部 / 審查室',
  sessionCount: 1,
  currentEditionSessionCount: 1,
  completed: true,
  inactive: false,
  orphaned: false,
  trainingEdition: "26'01",
  documentEdition: "26'01",
  announcedDate: '2026-03-10T00:00:00.000Z',
  ...over,
});

const session = (over: Partial<OjtSessionView> = {}): OjtSessionView => ({
  id: 's1',
  trainingDate: '2026-04-01',
  edition: "26'01",
  fileName: 'ojt.pdf',
  uploadedByName: '王志明',
  uploadedAt: '2026-04-01T10:00:00.000Z',
  ...over,
});

const SUMMARY = {
  coverage: { numerator: 1, denominator: 1, excludedInactive: 0, excludedOrphaned: 0 },
  docCoverage: {
    scope: 'incomplete' as const, maxRows: 15, items: [], shown: 0, hidden: 0,
    totalDocuments: 1, byState: { all: 1, partial: 0, none: 0, unassigned: 0 }, incompleteTotal: 0,
  },
  deptRollup: [],
  recentSessions: [],
};

function setupMocks(rows: OjtProgressRow[] = [row()], sessions: OjtSessionView[] = [session()]) {
  vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(SUMMARY);
  vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: rows, total: rows.length });
  vi.mocked(endpoints.getOjtProgressRowSessions).mockResolvedValue({ sessions });
  vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({ items: [] });
}

/** 到 TAB2（看得到儀表板者需先點分頁；看不到者本來就在 TAB2）。 */
async function gotoSessions() {
  const user = userEvent.setup();
  renderPage();
  await waitFor(() => expect(document.querySelector('[data-ojt-tab="sessions"]')).not.toBeNull());
  if (document.querySelector('[data-ojt-tab="dashboard"]')) {
    await user.click(document.querySelector('[data-ojt-tab="sessions"]') as HTMLElement);
  }
  await waitFor(() => expect(document.querySelector('[data-progress-row]')).not.toBeNull());
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  setupMocks();
});

describe('① 儀表板分頁對主管／部門窗口隱藏（2026-09-02 人類裁決）', () => {
  it.each(['ICSOPAdmin', 'SysAdmin'])('%s：儀表板分頁鈕與 panel 皆在 DOM', async (role) => {
    mockAuth(role);
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-ojt-tab="dashboard"]')).not.toBeNull());
    expect(document.querySelector('[data-ojt-panel="dashboard"]')).not.toBeNull();
  });

  /**
   * 🔴 (b) 正向半句：`[data-ojt-tab="sessions"]` 必須在——否則「儀表板分頁鈕不在」在
   * 整個分頁列都沒渲染（例如全頁 403）時亦恆真。
   */
  it.each(['Supervisor', 'DeptContact'])(
    '%s：儀表板分頁鈕與 panel **完全不進 DOM**（非 CSS 隱藏），但 OJT 資料清單分頁在',
    async (role) => {
      mockAuth(role);
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-ojt-tab="sessions"]')).not.toBeNull());
      expect(document.querySelector('[data-ojt-tab="dashboard"]')).toBeNull();
      expect(document.querySelector('[data-ojt-panel="dashboard"]')).toBeNull();
    },
  );

  it.each(['Supervisor', 'DeptContact'])(
    '%s：初始即位於 OJT 資料清單（panel 未被 hidden，列直接看得到）',
    async (role) => {
      mockAuth(role);
      renderPage();
      await waitFor(() => expect(document.querySelector('[data-progress-row]')).not.toBeNull());
      const panel = document.querySelector('[data-ojt-panel="sessions"]') as HTMLElement;
      expect(panel.className).not.toContain('hidden');
    },
  );

  /**
   * 🔴 看不到儀表板者**完全不發** summary 請求（591 份文件之全池聚合，純浪費的往返）。
   * (b) 正向半句＝rows 確實有被請求，否則「summary 沒被呼叫」在整頁沒載入時恆真。
   */
  it.each(['Supervisor', 'DeptContact'])('%s：不發 GET summary，但仍發 GET rows', async (role) => {
    mockAuth(role);
    renderPage();
    await waitFor(() => expect(endpoints.getOjtProgressRows).toHaveBeenCalled());
    expect(endpoints.getOjtProgressSummary).not.toHaveBeenCalled();
  });

  it('ICSOPAdmin：仍會發 GET summary（對偶鎖，防「乾脆都不發」之過度修正）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(endpoints.getOjtProgressSummary).toHaveBeenCalled());
  });
});

describe('② 應完成訓練日期＝公告日期 + 1 個月，標示於程序書名之後', () => {
  it('org 模式：列上呈現「應完成訓練 {公告日期+1月}」', async () => {
    mockAuth('ICSOPAdmin');
    await gotoSessions();
    const chip = document.querySelector('[data-training-due]') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.getAttribute('data-training-due')).toBe('2026-04-10');
    expect(chip.textContent).toBe(`${DUE_DATE_LABEL} ${dueDateText('2026-03-10T00:00:00.000Z')}`);
  });

  /**
   * 🔴 (c)：**DOM 順序**——日期必須在程序書名**之後**。只驗兩者都存在的斷言，
   * 對「日期印在編號前面」完全無感。
   */
  it('org 模式：日期節點在 [data-progress-doc-name] 之後（DOM 順序＝閱讀順序）', async () => {
    mockAuth('ICSOPAdmin');
    await gotoSessions();
    const name = document.querySelector('[data-progress-doc-name]') as HTMLElement;
    const due = document.querySelector('[data-training-due]') as HTMLElement;
    expect(name).not.toBeNull();
    expect(due).not.toBeNull();
    expect(name.compareDocumentPosition(due) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('無公告日期 → 仍進 DOM，值為「—」（不整個消失，否則會被讀成「沒有期限」）', async () => {
    mockAuth('ICSOPAdmin');
    setupMocks([row({ announcedDate: null })]);
    await gotoSessions();
    const chip = document.querySelector('[data-training-due]') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain(DUE_DATE_UNKNOWN_TEXT);
  });

  it('document 模式：日期改掛在群組標題之書名之後（列上不再重複一份）', async () => {
    mockAuth('ICSOPAdmin');
    const user = await gotoSessions();
    await user.selectOptions(document.querySelector('[data-ojt-group-mode]') as HTMLElement, 'document');
    await waitFor(() => expect(document.querySelector('[data-doc-group]')).not.toBeNull());
    const groupName = document.querySelector('[data-doc-group-name]') as HTMLElement;
    const dues = document.querySelectorAll('[data-training-due]');
    expect(dues).toHaveLength(1);
    expect(
      groupName.compareDocumentPosition(dues[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('③ 版次：列標籤、需重訓註記、場次明細之版次分組', () => {
  it('列上呈現當下訓練基準版次', async () => {
    mockAuth('ICSOPAdmin');
    await gotoSessions();
    const badge = document.querySelector('[data-progress-edition]') as HTMLElement;
    expect(badge.textContent).toBe(rowEditionText("26'01"));
  });

  /**
   * 🔴 「辦過訓練、但那是改版前的事」＝有場次、卻沒有任何一場符合當下基準版次。
   * 🔒 完成徽章**照實說「尚未完成」**，由獨立註記說明原因（處置同既有之孤兒列註記）。
   */
  it('有場次但無當下版次場次 → 出現需重訓註記，且徽章仍為 pending', async () => {
    mockAuth('ICSOPAdmin');
    setupMocks([row({ sessionCount: 2, currentEditionSessionCount: 0, completed: false })]);
    await gotoSessions();
    const note = document.querySelector('[data-row-retrain]') as HTMLElement;
    expect(note).not.toBeNull();
    expect(note.textContent).toContain(RETRAIN_NOTE_TEXT);
    expect(document.querySelector('[data-completion-badge="pending"]')).not.toBeNull();
  });

  it('當下版次已有場次 → 需重訓註記不進 DOM（對偶鎖）', async () => {
    mockAuth('ICSOPAdmin');
    await gotoSessions();
    // 正向半句：列確實畫出來了。
    expect(document.querySelector('[data-progress-row]')).not.toBeNull();
    expect(document.querySelector('[data-row-retrain]')).toBeNull();
  });

  it('展開列 → 依版次分組；當下版次組展開、舊版次組收合且其場次列不進 DOM', async () => {
    mockAuth('ICSOPAdmin');
    setupMocks(
      [row()],
      [
        session({ id: 'old1', trainingDate: '2025-05-01', edition: "25'01" }),
        session({ id: 'cur1', trainingDate: '2026-04-01', edition: "26'01" }),
      ],
    );
    const user = await gotoSessions();
    await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-session-edition-group]')).not.toBeNull());

    // 兩個版次群組都在（正向半句）。
    const groups = [...document.querySelectorAll('[data-session-edition-group]')];
    expect(groups.map((g) => g.getAttribute('data-session-edition-group'))).toEqual([
      "26'01",
      "25'01",
    ]);
    // 當下版次之場次列在 DOM；舊版次之場次列**不在**（收合＝不進 DOM，非 CSS 隱藏）。
    expect(document.querySelector('[data-session-row="cur1"]')).not.toBeNull();
    expect(document.querySelector('[data-session-row="old1"]')).toBeNull();
    // 徽章逐字。
    expect(groups[0]!.textContent).toContain(EDITION_CURRENT_BADGE_TEXT);
    expect(groups[1]!.textContent).toContain(EDITION_OUTDATED_BADGE_TEXT);
  });

  it('點舊版次之折疊鈕 → 其場次列進 DOM；再點一次又移除', async () => {
    mockAuth('ICSOPAdmin');
    setupMocks(
      [row()],
      [
        session({ id: 'old1', trainingDate: '2025-05-01', edition: "25'01" }),
        session({ id: 'cur1', trainingDate: '2026-04-01', edition: "26'01" }),
      ],
    );
    const user = await gotoSessions();
    await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
    const toggle = await waitFor(() => {
      const t = document.querySelector(`[data-session-edition-toggle="25'01"]`) as HTMLElement;
      expect(t).not.toBeNull();
      return t;
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await user.click(toggle);
    await waitFor(() => expect(document.querySelector('[data-session-row="old1"]')).not.toBeNull());
    expect(
      (document.querySelector(`[data-session-edition-toggle="25'01"]`) as HTMLElement).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');

    await user.click(document.querySelector(`[data-session-edition-toggle="25'01"]`) as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-session-row="old1"]')).toBeNull());
  });

  /**
   * 🔴 場次列之**行為**在版次分組下一格不改（共用同一個 `SessionRow` 渲染點）。
   * 📌 本 feature 於 2026-09-02 已因複製出第二份列而踩過一次；此案是那個教訓的直接對策。
   */
  it('組內場次列之下載鈕仍在、ICSOPAdmin 之刪除鈕仍在（行為零漣漪）', async () => {
    mockAuth('ICSOPAdmin');
    await gotoSessions();
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-session-row="s1"]')).not.toBeNull());
    expect(document.querySelector('[data-session-download="s1"]')).not.toBeNull();
    expect(document.querySelector('[data-session-delete="s1"]')).not.toBeNull();
  });

  it('全部場次皆無版次（null）→ 恰一組、鍵為哨兵值、標記為目前版次', async () => {
    mockAuth('ICSOPAdmin');
    setupMocks(
      [row({ trainingEdition: null, documentEdition: null })],
      [session({ id: 'n1', edition: null })],
    );
    const user = await gotoSessions();
    await user.click(document.querySelector('[data-progress-expand="d1__JAC00"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-session-row="n1"]')).not.toBeNull());
    const groups = document.querySelectorAll('[data-session-edition-group]');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.getAttribute('data-session-edition-group')).toBe(EDITION_NONE_KEY);
    expect(groups[0]!.textContent).toContain(EDITION_CURRENT_BADGE_TEXT);
  });
});
