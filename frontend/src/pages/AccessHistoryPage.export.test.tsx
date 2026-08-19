import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessHistoryPage } from './AccessHistoryPage';
import * as authHook from '../auth/useAuth';
import type { AccessHistoryPage as AccessHistoryPageResult, SessionUser } from '../api/types';

/**
 * F024 匯出鈕失效之修復 delta —— `AC-F1`／`AC-F3`／`AC-F9`／`AC-F16`／`AC-F19`（Lane L5）。
 *
 * 權威：
 *  - `docs/specs/features/F024-access-history-query.md#export-fix-delta`
 *  - `prototypes/17-access-history.html:53`（匯出鈕，`onclick="doExport()"`）
 *  - `prototypes/17a-access-history-export-limit-hint.html`（AC-F19 落點示範，非文案／版面權威）
 *
 * 🔴 **本檔刻意「不」全域 mock `../api/endpoints`**（與 `ChangeHistoryPage.export.test.tsx`／
 *    `AppendixManagementPage.export.test.tsx` 不同體例）——AC-F1 之機器驗證明文要求
 *    「以 stub 之 fetch 分別回 2xx CSV／400／reject，斷言 URL.createObjectURL 之呼叫次數」。
 *    若改為 mock `endpoints.exportAccessHistory`，則「下載副作用是否真的發生」會由測試自己的
 *    mock 決定，而非由被測程式碼決定——這正是本缺陷（成功回饋出現、但檔案從未產生）逃過先前
 *    測試的方式。故本檔僅選擇性 mock `getAccessHistory`（控制初始查詢結果），保留
 *    `exportAccessHistory()`／`downloadViaBlob()` 之**真實實作**，只在 fetch 這一層 stub。
 *
 * 📌 已查證之既有共用 helper 契約（非本環臆造，讀取既有 production 碼僅為確認 wiring）：
 *    `downloadViaBlob(path, fallbackName)` 內部呼叫 `URL.createObjectURL(await res.blob())`，
 *    建立 `<a>`、設 `.download`、`.click()`，再 `URL.revokeObjectURL()`（`api/download-blob.ts`）；
 *    `exportAccessHistory()` 之查詢字串組裝與 `getAccessHistory()` 共用 `accessHistoryQuery()`
 *    （`api/endpoints.ts`），故 AC-F7 ④「匯出與查詢共用同一份 filters 解析」之前端半已成立
 *    （屬既有正確行為，非本 delta 待修，不另立紅燈斷言）。
 *
 * ⚠ 對實作全盲：`exportAccessHistory()` 尚未改為 `Promise<void>`／`downloadViaBlob` 於本環撰寫
 *    時仍是舊行為（回 JSON、不下載）—— 下列以真實 fetch 驅動之測試於本環撰寫時即為紅燈。
 */

vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'SysAdmin') {
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
  watermarkSnapshot: 'wm', occurredAt: '2026-07-16T14:32:08.000Z', source: 'DIRECT',
};

function pageOf(items: object[], over: Partial<AccessHistoryPageResult> = {}): AccessHistoryPageResult {
  return {
    items: items as AccessHistoryPageResult['items'],
    total: items.length, page: 1, pageSize: 50, hasNext: false, appliedDefaultRange: false,
    ...over,
  };
}

const SUCCESS = '已匯出文件調閱歷程（CSV，UTF-8 BOM）';
const OLD_SUCCESS = '已匯出查詢結果（CSV，草案格式）';

/** CSV 位元組（UTF-8 BOM ＋ 一列表頭 ＋ 一列資料），供 fetch stub 回傳 2xx。 */
function csvBytes(): Uint8Array {
  const bom = [0xef, 0xbb, 0xbf];
  const text =
    '操作人員,員工編號,公司,部門,處/室,角色,類型,對象（文件／循環）,操作類型,操作時間\r\n' +
    '王小明,22345,和潤企業股份有限公司,營運管理部,審查室,一般使用者,文件,ICSOP-SRC-101-1-01,檢視,2026-07-16 14:32:08\r\n';
  const body = new TextEncoder().encode(text);
  return new Uint8Array([...bom, ...body]);
}

/** 設定 URL.createObjectURL/revokeObjectURL（jsdom 未內建）與 <a>.click 監看。 */
function stubDownloadPrimitives() {
  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true, configurable: true });
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return { createObjectURL, revokeObjectURL, clickSpy };
}

/** 以 URL 前綴分派之 fetch stub：查詢端點回 pageOf(...)；匯出端點依 exportBehavior 回應。 */
function stubFetch(
  queryPage: AccessHistoryPageResult,
  exportBehavior: 'success' | 'over-limit' | 'network-reject',
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const href = typeof input === 'string' ? input : input.toString();
    if (href.includes('/admin/access-history/export')) {
      if (exportBehavior === 'network-reject') {
        throw new TypeError('Failed to fetch');
      }
      if (exportBehavior === 'over-limit') {
        return new Response(
          JSON.stringify({
            statusCode: 400,
            message:
              'EXPORT_ROW_LIMIT_EXCEEDED: 符合條件之筆數為 10001 筆，超過匯出上限 10000 筆，請縮小查詢條件後再匯出',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(csvBytes(), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="access_history_20260818_120000.csv"',
        },
      });
    }
    if (href.includes('/admin/access-history')) {
      return new Response(JSON.stringify(queryPage), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch in test: ${href}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderAndWaitForQuery(): Promise<void> {
  render(<AccessHistoryPage />);
  await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
}

describe('AccessHistoryPage 匯出（AC-F1 缺陷本體之鎖定：成功回饋⟺下載副作用，真實 fetch 驅動）', () => {
  let dl: ReturnType<typeof stubDownloadPrimitives>;
  beforeEach(() => {
    mockAuth();
    dl = stubDownloadPrimitives();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('① 端點回 2xx CSV → 下載副作用發生（createObjectURL 恰一次、<a>.click 恰一次）且顯示成功回饋', async () => {
    stubFetch(pageOf([DOC_ROW]), 'success');
    await renderAndWaitForQuery();

    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));

    await waitFor(() => expect(dl.createObjectURL).toHaveBeenCalledTimes(1));
    expect(dl.clickSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(new RegExp(`^${SUCCESS}`))).toBeInTheDocument();
  });

  it('🔴 ② 端點回 400（超限）→ createObjectURL 呼叫次數為 0（本缺陷之唯一充分判準），且不顯示成功、不含「已匯出」', async () => {
    stubFetch(pageOf([DOC_ROW]), 'over-limit');
    await renderAndWaitForQuery();

    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));

    await waitFor(() => expect(screen.queryByText(/EXPORT_ROW_LIMIT_EXCEEDED/)).toBeInTheDocument());
    expect(dl.createObjectURL).toHaveBeenCalledTimes(0);
    expect(screen.queryByText(/已匯出/)).toBeNull();
    // tone='success' 之回饋不得出現：以既有 role="status" 容器之逐字內容間接驗證（見 AC-F9）。
  });

  it('🔴 ③ fetch 本身 reject（網路層失敗）→ createObjectURL 呼叫次數為 0，且不顯示成功、不含「已匯出」', async () => {
    stubFetch(pageOf([DOC_ROW]), 'network-reject');
    await renderAndWaitForQuery();

    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /匯出/ })).toBeEnabled());
    expect(dl.createObjectURL).toHaveBeenCalledTimes(0);
    expect(screen.queryByText(/已匯出/)).toBeNull();
  });

  it('🔒 舊文案 `已匯出查詢結果（CSV，草案格式）` 不得出現於任何情境（AC-F9 ③ 負向斷言）', async () => {
    stubFetch(pageOf([DOC_ROW]), 'success');
    await renderAndWaitForQuery();
    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));
    await waitFor(() => expect(dl.createObjectURL).toHaveBeenCalled());
    expect(screen.queryByText(OLD_SUCCESS)).toBeNull();
  });
});

describe('AccessHistoryPage 匯出（AC-F3：downloadViaBlob 傳輸方式，非 window.open／apiFetch）', () => {
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mockAuth();
    stubDownloadPrimitives();
    windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('匯出流程全程不呼叫 window.open', async () => {
    stubFetch(pageOf([DOC_ROW]), 'success');
    await renderAndWaitForQuery();
    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));
    await waitFor(() => expect(screen.getByText(new RegExp(`^${SUCCESS}`))).toBeInTheDocument());
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  /**
   * 🔴 靜態原始碼掃描（AC-F3 ③）：`exportAccessHistory()` 函式本文（自其宣告起至下一個
   * `export function`/`export async function` 之前）**不得**出現 `window.open`／
   * `<a href={…export…}>`／`apiFetch(...export...)`，且**須**呼叫 `downloadViaBlob`。
   * 掃描之標的為原始碼文字，期望值取自 AC-F3，非讀取原始碼決定斷言（static-source-scan）。
   */
  it('🔴 靜態掃描：exportAccessHistory() 函式本文未出現 window.open／apiFetch(...export...)，已改呼叫 downloadViaBlob', () => {
    const src = readFileSync(join(__dirname, '..', 'api', 'endpoints.ts'), 'utf8');
    const start = src.indexOf('export function exportAccessHistory');
    expect(start).toBeGreaterThanOrEqual(0); // 自我守護：找不到函式本身即為掃描器失效

    const nextExport = src.indexOf('\nexport ', start + 1);
    const body = nextExport === -1 ? src.slice(start) : src.slice(start, nextExport);

    expect(body).not.toContain('window.open');
    expect(body).not.toMatch(/<a\s+href=/);
    expect(body).toContain('downloadViaBlob');
    expect(body).not.toMatch(/\bapiFetch\s*<[^>]*>\s*\(\s*`\/admin\/access-history\/export/);
  });
});

/**
 * AC-F9：使用者可見回饋之逐字文案（角色：成功 status、超限 alert）。
 */
describe('AccessHistoryPage 匯出（AC-F9 逐字文案與容器角色）', () => {
  beforeEach(() => {
    mockAuth();
    stubDownloadPrimitives();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('① 成功 → 回饋以逐字片段起始，容器角色為 status', async () => {
    stubFetch(pageOf([DOC_ROW]), 'success');
    await renderAndWaitForQuery();
    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));
    const msg = await screen.findByText(new RegExp(`^${SUCCESS}`));
    expect(msg.closest('[role="status"]') ?? screen.queryByRole('status')).not.toBeNull();
  });

  it('② 超限 → 逐字片段＋錯誤碼同容器可見，容器角色為 alert', async () => {
    stubFetch(pageOf([DOC_ROW]), 'over-limit');
    await renderAndWaitForQuery();
    await userEvent.click(screen.getByRole('button', { name: /匯出/ }));
    const alertRegion = await screen.findByRole('alert');
    expect(alertRegion.textContent).toContain('符合查詢條件之筆數為 10001 筆，超過匯出上限 10000 筆，請縮小查詢條件');
    expect(alertRegion.textContent).toContain('EXPORT_ROW_LIMIT_EXCEEDED');
  });
});

/** AC-F16：匯出鈕之 in-flight 狀態。 */
describe('AccessHistoryPage 匯出（AC-F16 匯出鈕 in-flight 狀態）', () => {
  beforeEach(() => {
    mockAuth();
    stubDownloadPrimitives();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accessible name 逐字為「匯出」之 button 存在；請求進行中 disabled，結束後恢復可用', async () => {
    let resolveExport: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const href = typeof input === 'string' ? input : input.toString();
      if (href.includes('/admin/access-history/export')) {
        return new Promise<Response>((resolve) => {
          resolveExport = resolve;
        });
      }
      if (href.includes('/admin/access-history')) {
        return new Response(JSON.stringify(pageOf([DOC_ROW])), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderAndWaitForQuery();

    const btn = screen.getByRole('button', { name: '匯出' });
    expect(btn).toBeEnabled();

    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());

    resolveExport(
      new Response(csvBytes(), {
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8' },
      }),
    );
    await waitFor(() => expect(btn).toBeEnabled());
  });
});

// 📌 AC-F19（超限之事前提示）獨立成 `AccessHistoryPage.export-limit-hint.test.tsx`：
// 該檔需要 `vi.mock('../api/endpoints', ...)`，而 vitest 的 `vi.mock` 於檔案內為
// **hoisted**（不論宣告於檔案何處，效力及於整個模組作用域）——與本檔刻意保留
// `exportAccessHistory()`／`downloadViaBlob()` 真實實作（AC-F1／AC-F3 之要求）互斥，
// 故不可同檔並存，見該檔標頭注解。
