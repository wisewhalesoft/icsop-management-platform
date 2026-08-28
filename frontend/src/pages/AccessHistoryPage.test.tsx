import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessHistoryPage } from './AccessHistoryPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { AccessHistoryPage as AccessHistoryPageResult, SessionUser } from '../api/types';

/**
 * F024 文件調閱歷程查詢頁（prototype 17 移植）。接真實端點 GET /admin/access-history。
 * RBAC：SysAdmin/ICSOPAdmin 全公司唯讀；主管/部門窗口/一般使用者無此功能（自我守門封鎖）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const DOC_ROW = {
  id: 'r1', accountId: 'a1', employeeNo: '22345', name: '王小明',
  company: '和潤企業股份有限公司', department: '營運管理部', section: '審查室', roleCode: 'User',
  targetType: 'DOCUMENT', actionType: 'VIEW',
  documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01',
  lifecycleId: null, lifecycleName: null, formId: null, targetName: '車輛分期進件作業',
  watermarkSnapshot: '22345-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-16 14:32:08',
  occurredAt: '2026-07-16T14:32:08.000Z', source: 'DIRECT',
};
const CHANGELOG_ROW = {
  id: 'r2', accountId: 'a2', employeeNo: '20233', name: '李慧玲',
  company: '和潤企業股份有限公司', department: '債權管理部', section: '法催一室', roleCode: 'ICSOPAdmin',
  targetType: 'DOCUMENT_CHANGE_LOG', actionType: 'CHANGE_LOG_VIEW',
  documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01',
  lifecycleId: null, lifecycleName: null, formId: null, targetName: '文件欄位變更歷程檢視',
  watermarkSnapshot: null,
  occurredAt: '2026-07-16T15:05:19.000Z', source: 'DIRECT',
};
const DOWNLOAD_ROW = {
  id: 'r3', accountId: 'a3', employeeNo: '20088', name: '陳彥廷',
  company: '和潤企業股份有限公司', department: '企劃部', section: '車輛行銷室', roleCode: 'Supervisor',
  targetType: 'DOCUMENT', actionType: 'DOWNLOAD',
  documentId: 'd2', documentNumber: 'ICSOP-SRC-101-2-00',
  lifecycleId: null, lifecycleName: null, formId: null, targetName: '消金審核作業',
  watermarkSnapshot: 'wm', occurredAt: '2026-07-16T11:20:33.000Z', source: 'DIRECT',
};
const LIFECYCLE_ROW = {
  id: 'r4', accountId: 'a4', employeeNo: '20233', name: '李慧玲',
  company: '和潤企業股份有限公司', department: '債權管理部', section: '法催一室', roleCode: 'ICSOPAdmin',
  targetType: 'LIFECYCLE', actionType: 'LIFECYCLE_VIEW',
  documentId: null, documentNumber: null,
  lifecycleId: 'l1', lifecycleName: '銷售及收款循環', formId: null, targetName: null,
  watermarkSnapshot: 'wm', occurredAt: '2026-07-16T15:40:26.000Z', source: 'DIRECT',
};

function pageOf(items: object[], over: Partial<AccessHistoryPageResult> = {}): AccessHistoryPageResult {
  return {
    items: items as AccessHistoryPageResult['items'],
    total: items.length, page: 1, pageSize: 50, hasNext: false, appliedDefaultRange: false,
    ...over,
  };
}

const UPLOAD_ROW = {
  id: 'r5', accountId: 'a5', employeeNo: '20541', name: '林建宏',
  company: '和潤企業股份有限公司', department: '企劃部', section: '車輛行銷室', roleCode: 'Supervisor',
  targetType: 'DOCUMENT_ATTACHMENT', actionType: 'ATTACHMENT_UPLOAD',
  documentId: 'd3', documentNumber: 'ICSOP-SRC-101-1-06',
  lifecycleId: null, lifecycleName: null, formId: null, targetName: '消費分期特約通路作業',
  watermarkSnapshot: null, occurredAt: '2026-08-20T09:12:00.000Z', source: 'DIRECT',
};

/**
 * 🔴 [2026-08-28 E11] `AC-J22`／`AC-J23`（[F024#ojt-progress-audit-view-delta]；權威＝
 * `prototypes/17-access-history.html`）：F042 場次登記／刪除寫入本表，新立
 * `targetType='OJT_SESSION'`（第 9 個值）＋兩個新 `actionType`。「使用單位」不新增欄位，
 * 承載於既有「對象名稱／說明」欄之文字（本檔以 `targetName` 欄位模擬，格式如
 * `OJT 場次登記（營運管理部 / 審查室 · 訓練日期 2026-06-18）`，逐字取自 prototypes/17 定稿）。
 */
const OJT_UPLOAD_ROW = {
  id: 'r9', accountId: 'a9', employeeNo: '20233', name: '李慧玲',
  company: '和潤企業股份有限公司', department: '債權管理部', section: '法催一室', roleCode: 'ICSOPAdmin',
  targetType: 'OJT_SESSION', actionType: 'OJT_SESSION_UPLOAD',
  documentId: 'd9', documentNumber: 'ICSOP-SRC-101-1-01',
  lifecycleId: null, lifecycleName: null, formId: null,
  targetName: 'OJT 場次登記（營運管理部 / 審查室 · 訓練日期 2026-06-18）',
  watermarkSnapshot: null, occurredAt: '2026-07-16T18:24:05.000Z', source: 'DIRECT',
};
const OJT_DELETE_ROW = {
  ...OJT_UPLOAD_ROW,
  id: 'r10', accountId: 'a9', employeeNo: '20233', name: '李慧玲', roleCode: 'ICSOPAdmin',
  actionType: 'OJT_SESSION_DELETE',
  targetName: 'OJT 場次刪除（供應商金融部 / 醫療一課 · 訓練日期 2026-05-20）',
  occurredAt: '2026-07-14T16:47:52.000Z',
};

/**
 * 2026-08-20 D9 delta（缺失／變更 delta 第 5／8 項之連動）—— 新增之稽核事件（後台燒錄下載、
 * OJT 上傳）於查詢／匯出之呈現。權威：`docs/specs/features/F024-access-history-query.md
 * #d9-audit-view-delta`（`AC-N53`／`AC-N54`／`AC-N69`／`AC-N70`）＋ `#prototype 17`（`AC-N80`／
 * `AC-N81`）。
 */
describe('AccessHistoryPage — D9 delta：上傳事件呈現與排除／篩出（AC-N53、AC-N69、AC-N80、AC-N81）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('SysAdmin');
  });

  /**
   * 🔴 2026-08-20 D9 delta（`impl-fe`／`impl-fe2` 申訴，已核實成立）：`prototypes/17-access-
   * history.html:315` 之操作類型 pill 為**單一** `<span>${r.act} · ${lbl}</span>`（`ACT_STYLE`
   * 對映之既有渲染式），與既有回歸鎖定 `TS-AQ-FE-001`（`screen.getByText('DOWNLOAD · 下載')`
   * 且該元素本身帶顏色 class）同形——DTL 之 `getNodeText` 只串接元素之直屬 text node，故
   * pill 之直屬文字**必為**組合字串，不可能同時有一個「僅含中文標籤」的獨立節點可供
   * `getByText('附件上傳')` 命中，除非改變 pill 之 DOM 結構而使 `TS-AQ-FE-001` 轉紅。
   * `AC-N53` 之規格文字本身是**對映函式**層級（`actionTypeLabel('ATTACHMENT_UPLOAD') ===
   * '附件上傳'`），並未要求標籤在 DOM 中自成節點——原斷言把它過度收緊為 DOM 文字獨立性。
   * 改為與 `TS-AQ-FE-001` 同形之組合字串斷言。
   * 📝 被取代之原斷言逐字保留供追溯：OLD> expect(within(row).getByText('附件上傳')).toBeInTheDocument();
   */
  it('AC-N53 上傳事件之「類型」欄逐字為「上傳」、「操作類型」pill 含逐字標籤「附件上傳」、浮水印快照欄留空', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([UPLOAD_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('林建宏')).toBeInTheDocument());
    const row = screen.getByText('林建宏').closest('tr') as HTMLElement;
    expect(within(row).getByText('上傳')).toBeInTheDocument();
    expect(within(row).getByText('ATTACHMENT_UPLOAD · 附件上傳')).toBeInTheDocument();
  });

  it('AC-N80 浮水印快照留空時，該欄帶 data-wm-snapshot 且文字逐字為「（此動作類型無浮水印，該欄留空）」', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([UPLOAD_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('林建宏')).toBeInTheDocument());
    await userEvent.click(screen.getByText('林建宏'));
    await waitFor(() => {
      const el = document.querySelector('[data-wm-snapshot]');
      expect(el, '找不到 data-wm-snapshot 節點').not.toBeNull();
      expect(el!.textContent).toBe('（此動作類型無浮水印，該欄留空）');
    });
  });

  it('AC-N69① 類型＝文件 → 僅回傳文件類、不含上傳事件（排除）', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('類型'), '文件');
    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(expect.objectContaining({ kind: '文件' })),
    );
  });

  it('AC-N69② 類型＝上傳（新增之第四種類型篩選值）→ 以 kind=上傳 重新查詢（篩出）', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW, UPLOAD_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('類型'), '上傳');
    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(expect.objectContaining({ kind: '上傳' })),
    );
  });

  /**
   * 🔴 [2026-08-28 E11] `AC-J23`（`OQ-E11-17` 覆核核可）：類型值集合由四種增為**五種**、控制項
   * 連同預設項共 **6 個** option（原「恰四種／5 個」已就地推翻）。既有四者之字面與相對順序
   * 逐字不動，`OJT 場次` 置於其後。
   * 📝 被反轉之原斷言逐字保留供追溯：
   *   OLD> expect(values).toEqual(['全部', '文件', '循環', '變更', '上傳']);
   */
  it('AC-N69→AC-J23 🔴 篩選控制項之類型值恰為五種＋預設「全部」共 6 個 option，「OJT 場次」置於既有四者之後', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    const select = screen.getByLabelText('類型') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['全部', '文件', '循環', '變更', '上傳', 'OJT 場次']);
  });

  /**
   * 🔴 `AC-J23`：新事件必須可「排除」與「篩出」——兩者是兩件事，須各自斷言（沿用 `AC-N69` 之
   * 既有明文）。「類型＝文件」不含 OJT 場次事件（排除）；「類型＝OJT 場次」不含一般調閱事件
   * （篩出）。
   */
  it('AC-J23① 類型＝文件 → 僅回傳文件類、不含 OJT 場次事件（排除）', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('類型'), '文件');
    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(expect.objectContaining({ kind: '文件' })),
    );
  });

  it('AC-J23② 類型＝OJT 場次 → 以 kind=OJT 場次 重新查詢（篩出），兩個新 actionType 同屬本類型皆回傳', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([OJT_UPLOAD_ROW, OJT_DELETE_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getAllByText('李慧玲').length).toBeGreaterThan(0));
    await userEvent.selectOptions(screen.getByLabelText('類型'), 'OJT 場次');
    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(expect.objectContaining({ kind: 'OJT 場次' })),
    );
  });

  it('AC-J22① OJT_SESSION_UPLOAD → 場次登記；OJT_SESSION_DELETE → 場次刪除（兩標籤互異，硬性要求）', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([OJT_UPLOAD_ROW, OJT_DELETE_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getAllByText('李慧玲').length).toBeGreaterThan(0));
    expect(screen.getByText(/OJT_SESSION_UPLOAD · 場次登記/)).toBeInTheDocument();
    expect(screen.getByText(/OJT_SESSION_DELETE · 場次刪除/)).toBeInTheDocument();
    // 互異性本身為硬性要求（AC-J22①）：字面日後若改，這條才是真正要保住的東西。
    const uploadLabel = screen.getByText(/OJT_SESSION_UPLOAD · /).textContent;
    const deleteLabel = screen.getByText(/OJT_SESSION_DELETE · /).textContent;
    expect(uploadLabel).not.toBe(deleteLabel);
  });

  it('AC-J23 OJT_SESSION 之「類型」欄逐字為「OJT 場次」，明確不得落入既有「上傳」類（AC-N69 之分類學污染同型風險）', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([OJT_UPLOAD_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getAllByText('李慧玲').length).toBeGreaterThan(0));
    const row = screen.getAllByText('李慧玲')[0].closest('tr') as HTMLElement;
    expect(within(row).getByText('OJT 場次')).toBeInTheDocument();
    expect(within(row).queryByText('上傳')).not.toBeInTheDocument();
  });

  it('AC-J25 使用單位不新增欄位，承載於「對象」欄文字（可被既有文件搜尋框搜到）', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([OJT_UPLOAD_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getAllByText('李慧玲').length).toBeGreaterThan(0));
    expect(
      screen.getByText(/OJT 場次登記（營運管理部 \/ 審查室 · 訓練日期 2026-06-18）/),
    ).toBeInTheDocument();
  });

  it('AC-J25／AC-N80 兩個新 actionType 之浮水印快照欄皆留空，文字逐字「（此動作類型無浮水印，該欄留空）」', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([OJT_UPLOAD_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getAllByText('李慧玲').length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByText('李慧玲')[0]);
    await waitFor(() => {
      const el = document.querySelector('[data-wm-snapshot]');
      expect(el, '找不到 data-wm-snapshot 節點').not.toBeNull();
      expect(el!.textContent).toBe('（此動作類型無浮水印，該欄留空）');
    });
  });

  /**
   * 🔒 append-only 回歸鎖定：AUDIT_LOG 為 append-only，2026-08-20～E11 上線期間之
   * `ATTACHMENT_UPLOAD` 歷史列永久存在，本頁仍須渲染得出它——新增 OJT 事件時最容易「順手清乾淨」
   * 而使歷史列渲染成空白。
   */
  it('🔒 既有 ATTACHMENT_UPLOAD 之「上傳」類標籤與對映，於新增 OJT 場次類型後仍不得移除（append-only 歷史）', async () => {
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([UPLOAD_ROW, OJT_UPLOAD_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('林建宏')).toBeInTheDocument());
    const uploadRow = screen.getByText('林建宏').closest('tr') as HTMLElement;
    expect(within(uploadRow).getByText('上傳')).toBeInTheDocument();
    expect(within(uploadRow).getByText('ATTACHMENT_UPLOAD · 附件上傳')).toBeInTheDocument();
  });

  /**
   * `AC-N81`：本頁同時呈現簡稱（浮水印快照）與全稱（表格公司欄）兩種公司名稱寫法，
   * 兩者不同源是刻意的（`OQ-D9-06`），不得被「統一」。
   */
  it('AC-N81 同一頁同時呈現：表格「公司」欄為全稱、展開明細之浮水印快照片段為簡稱', async () => {
    const rowWithFullSnapshot = {
      ...DOC_ROW,
      watermarkSnapshot:
        '22345-王小明-和潤企業-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-16 14:32:08',
    };
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([rowWithFullSnapshot]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    const row = screen.getByText('王小明').closest('tr') as HTMLElement;
    // ① 表格「公司」欄仍為全稱（AC-N13 ③ 之回歸鎖定，本頁不受浮水印簡稱影響）。
    expect(within(row).getByText('和潤企業股份有限公司')).toBeInTheDocument();
    // ② 展開後之浮水印快照片段為簡稱（本案 fixture 之快照字串本身已是簡稱，模擬後端產出）。
    await userEvent.click(screen.getByText('王小明'));
    await waitFor(() =>
      expect(screen.getByText(/22345-王小明-和潤企業-營運管理部-審查室/)).toBeInTheDocument(),
    );
  });
});

describe('AccessHistoryPage — 文件調閱歷程查詢（F024）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW, CHANGELOG_ROW]));
  });

  it('載入後渲染調閱列（操作人員、對象文件編號、角色標籤）', async () => {
    mockAuth('SysAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
    expect(screen.getAllByText('ICSOP-SRC-101-1-01').length).toBeGreaterThan(0);
    expect(screen.getByText('一般使用者')).toBeInTheDocument(); // roleCode→label
  });

  it('TS-004 主管無查詢權 → 顯示封鎖畫面、不呼叫查詢端點', async () => {
    mockAuth('Supervisor');
    render(<AccessHistoryPage />);
    expect(screen.getByText('無文件調閱歷程查詢權限')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getAccessHistory).not.toHaveBeenCalled();
  });

  it('TS-007 類型篩選＝循環 → 以 kind=循環 重新查詢', async () => {
    mockAuth('ICSOPAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText('類型'), '循環');

    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(
        expect.objectContaining({ kind: '循環' }),
      ),
    );
  });

  it('TS-006 展開含浮水印動作 → 顯示浮水印快照原樣', async () => {
    mockAuth('SysAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    await userEvent.click(screen.getByText('王小明'));

    await waitFor(() =>
      expect(screen.getByText(/僅供內部使用非經許可不得複製翻印/)).toBeInTheDocument(),
    );
  });

  it('TS-006 展開變更歷程（無浮水印）→ 該欄留空提示、不視為錯誤', async () => {
    mockAuth('SysAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());

    await userEvent.click(screen.getByText('李慧玲'));

    await waitFor(() => expect(screen.getByText(/無浮水印/)).toBeInTheDocument());
  });

  it('空結果 → 顯示空狀態', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText(/查無符合結果/)).toBeInTheDocument());
  });

  it('TS-005 空條件套用近 30 天預設 → 顯示提示', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(
      pageOf([DOC_ROW], { appliedDefaultRange: true }),
    );
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText(/近 30 天/)).toBeInTheDocument());
  });

  /**
   * 🔴 AC-F18 承接表就地改寫（F024 匯出鈕失效之修復 delta，2026-08-18）：`exportAccessHistory()`
   * 之回傳型別由 `Promise<{rows,total}>` 改為 `Promise<void>`（AC-F3 ①），且成功後之回饋文案
   * 已改為新逐字句（AC-F9 ①）。「下載副作用是否真的發生」不在本檔重複驗證——本檔全域 mock
   * `../api/endpoints`，`exportAccessHistory()` 的真實實作（`downloadViaBlob`／`createObjectURL`）
   * 被 mock 取代，此處驗證即為循環論證；該項改由 `AccessHistoryPage.export.test.tsx`（AC-F1，
   * 真實 fetch 驅動）承擔。本測試僅保留仍可在此驗證的兩件事：呼叫時遵循當前查詢條件、
   * 成功後顯示新逐字文案。
   *   OLD> `vi.mocked(endpoints.exportAccessHistory).mockResolvedValue({ rows: [], total: 0 });`
   *   OLD> 僅斷言 `expect(endpoints.exportAccessHistory).toHaveBeenCalledOnce();`（未斷言文案）
   */
  it('匯出 → 呼叫 exportAccessHistory（遵循當前查詢條件），成功後顯示新逐字回饋（AC-F9 ①）', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.exportAccessHistory).mockResolvedValue(undefined);
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/人員/), '王小明');
    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));

    await waitFor(() => expect(endpoints.exportAccessHistory).toHaveBeenCalledOnce());
    const exportArgs = vi.mocked(endpoints.exportAccessHistory).mock.calls[0]?.[0] ?? {};
    expect(exportArgs).toMatchObject({ person: '王小明' });
    expect(
      await screen.findByText(/^已匯出文件調閱歷程（CSV，UTF-8 BOM）/),
    ).toBeInTheDocument();
  });

  it('查詢列可依人員與時間組合送出（AND）', async () => {
    mockAuth('SysAdmin');
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/人員/), '王小明');
    await userEvent.click(screen.getByRole('button', { name: '查詢' }));

    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(
        expect.objectContaining({ person: '王小明' }),
      ),
    );
    // 用 within 限縮避免多重匹配
    const table = screen.getByRole('table');
    expect(within(table).getByText('王小明')).toBeInTheDocument();
  });

  it('TS-AQ-FE-001 操作類型 pill 顏色依 actionType 對映（逐字比對 prototype ACT_STYLE）', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOWNLOAD_ROW, LIFECYCLE_ROW]));
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('陳彥廷')).toBeInTheDocument());

    // DOWNLOAD → blue（非現況 slate）；LIFECYCLE_VIEW → emerald。
    const dlPill = screen.getByText('DOWNLOAD · 下載');
    expect(dlPill.className).toContain('bg-blue-50');
    expect(dlPill.className).not.toContain('bg-slate-50');
    const lcPill = screen.getByText('LIFECYCLE_VIEW · 循環樹狀圖檢視');
    expect(lcPill.className).toContain('bg-emerald-50');
  });

  it('TS-AQ-FE-002 展開後箭頭圖示由 chevron-right 變為 chevron-down', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(pageOf([DOC_ROW]));
    const { container } = render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    // 初始未展開：僅 chevron-right、無 chevron-down。
    expect(container.querySelector('.lucide-chevron-down')).toBeNull();
    expect(container.querySelector('.lucide-chevron-right')).not.toBeNull();

    await userEvent.click(screen.getByText('王小明'));

    // 展開後：出現 chevron-down。
    await waitFor(() =>
      expect(container.querySelector('.lucide-chevron-down')).not.toBeNull(),
    );
  });

  it('TS-AQ-FE-003 結果超過一頁 → 顯示換頁控制項；下一頁以 page+1 重新查詢；末頁停用下一頁', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(
      pageOf([DOC_ROW], { total: 75, page: 1, pageSize: 50, hasNext: true }),
    );
    render(<AccessHistoryPage />);
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    // (1) 換頁控制項存在，「下一頁」可點擊。
    const next = screen.getByRole('button', { name: '下一頁' });
    expect(next).toBeEnabled();

    // (2) 點「下一頁」→ 以 page:2 重新查詢。
    vi.mocked(endpoints.getAccessHistory).mockResolvedValue(
      pageOf([DOC_ROW], { total: 75, page: 2, pageSize: 50, hasNext: false }),
    );
    await userEvent.click(next);
    await waitFor(() =>
      expect(endpoints.getAccessHistory).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );

    // (3) 第 2 頁（末頁）：上一頁可點、下一頁停用。
    await waitFor(() => expect(screen.getByRole('button', { name: '上一頁' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled();
  });
});
