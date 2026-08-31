import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as downloadBlobModule from './download-blob';
import { downloadViaBlob } from './download-blob';
import * as endpoints from './endpoints';
import { ApiError } from './client';

/**
 * F017 `AC-X14`（下載途徑）＋ `AC-X16` ⑩ (ii) —— `downloadViaBlob()` 之 **additive** 第三參數
 * 與 `exportDocumentList()` 之請求形狀。
 *
 * 權威：
 *  - `docs/specs/features/F017-backend-document-list.md` `AC-X14`
 *    （🔴 必須走 `downloadViaBlob()` 之等價路徑（`fetch` → `Blob` → 程式化 `<a download>`），
 *      **不得**用 `window.open`／`<a href>`；本端點採 POST ⇒ `downloadViaBlob()` **新增第三個選填參數**
 *      `init?: { method?; body? }`，**additive**——既有全部呼叫端只傳兩個參數、`init` 為 `undefined`
 *      時行為**逐字不變**；有 `body` 時於**同一次** `fetch` 加上 `method: 'POST'` 與
 *      `Content-Type: application/json`，🔒 `Accept: application/octet-stream` **維持不變**；
 *      🔴 **明文禁止另寫一份 `postDownloadViaBlob()`**）
 *  - `docs/specs/architecture-spec.md` §13.2 ⑧（`downloadViaBlob` 簽章與 `exportDocumentList` 之逐字實作）
 *  - §Interface Contract：`POST /admin/documents/export`，body **恰兩鍵**
 *    `{ documentIds: string[]; linkTargetId?: string }`——🔒 多送任何一個篩選鍵即違反本契約
 *  - `frontend/src/api/download-blob.ts` 檔頭之明文禁令（2026-07-25 之 `Accept: text/html` 撞 SPA fallback）
 *
 * ⚠ **對實作全盲**：`downloadViaBlob()` 之第三參數與 `endpoints.exportDocumentList()` 於本環撰寫時
 *    **尚不存在**。以區域型別 cast 取用，使紅燈落在逐條斷言上。
 *
 * 📌 **本檔之前三個 describe 中，「既有 2 參數呼叫」之案為 `AC-X16` ⑩ (ii) 之零漣漪回歸鎖定
 *    （green regression guard，今日即綠）**——它守的是「additive 改造沒有動到既有 16 個呼叫端之行為」。
 */

type DownloadInit = { method?: string; body?: unknown };
type DownloadViaBlobWithInit = (
  path: string,
  fallbackName: string,
  init?: DownloadInit,
) => Promise<void>;
const downloadWithInit = downloadViaBlob as unknown as DownloadViaBlobWithInit;

type ExportDocumentListFn = (documentIds: string[], linkTargetId?: string) => Promise<void>;
const exportDocumentList = (): ExportDocumentListFn | undefined =>
  (endpoints as unknown as { exportDocumentList?: ExportDocumentListFn }).exportDocumentList;

function csvResponse(): Response {
  return new Response(new Blob(['\uFEFFOJT,制定公司\r\n']), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="documents_20260831_143208.csv"',
    },
  });
}

let clickedNames: string[] = [];

beforeEach(() => {
  clickedNames = [];
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:mock'),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clickedNames.push(this.download);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const lastInit = (): RequestInit | undefined =>
  vi.mocked(fetch).mock.calls[0][1] as RequestInit | undefined;
const lastHeaders = (): Record<string, string> =>
  (lastInit()?.headers ?? {}) as Record<string, string>;

describe('🔒 AC-X16 ⑩ (ii)：既有 2 參數呼叫端之行為**逐字不變**（零漣漪回歸鎖定）', () => {
  it('僅傳兩個參數 → GET（無 method）、無 body、無 Content-Type，且 `Accept: application/octet-stream`', async () => {
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await downloadViaBlob('/admin/appendices/export', 'appendices.csv');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/appendices/export');
    expect((init as RequestInit).method).toBeUndefined();
    expect((init as RequestInit).body).toBeUndefined();
    expect((init as RequestInit).credentials).toBe('include');
    expect(lastHeaders().Accept).toBe('application/octet-stream');
    expect(lastHeaders()['Content-Type']).toBeUndefined();
  });

  it('第三參數顯式為 `undefined` → 與只傳兩個參數之行為完全相同', async () => {
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await downloadWithInit('/admin/usage-forms/export', 'usage-forms.csv', undefined);
    const init = lastInit() as RequestInit;
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(lastHeaders().Accept).toBe('application/octet-stream');
  });

  it('🔒 檔名優先取 `Content-Disposition`、解析失敗才用 fallback（既有第 (ii) 條防線不變）', async () => {
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await downloadViaBlob('/admin/appendices/export', 'fallback.csv');
    expect(clickedNames).toEqual(['documents_20260831_143208.csv']);
  });

  it('🔒 錯誤走 `ApiError`（既有第 (iii) 條防線不變）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'EXPORT_ROW_LIMIT_EXCEEDED: 符合條件之筆數為 10001 筆' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(downloadViaBlob('/admin/appendices/export', 'x.csv')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('F017 AC-X14：`downloadViaBlob()` 之 additive 第三參數（POST ＋ JSON body）', () => {
  it('🔴 有 `body` 時於**同一次** fetch 加上 `method: POST` 與 `Content-Type: application/json`', async () => {
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await downloadWithInit('/admin/documents/export', 'documents.csv', {
      method: 'POST',
      body: { documentIds: ['a', 'b'] },
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1); // 同一次，不得先探再送
    const init = lastInit() as RequestInit;
    expect(init.method).toBe('POST');
    expect(lastHeaders()['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ documentIds: ['a', 'b'] });
  });

  it('🔒 `Accept: application/octet-stream` **維持不變**——不得改為 `text/html`（會撞 SPA fallback）', async () => {
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await downloadWithInit('/admin/documents/export', 'documents.csv', {
      method: 'POST',
      body: { documentIds: ['a'] },
    });
    // 🔴 正向半句不可省略：若實作**完全忽略**第三參數，Accept 當然也不變 ⇒ 只寫負向半句即恆真假綠。
    expect((lastInit() as RequestInit).method).toBe('POST');
    expect(lastHeaders().Accept).toBe('application/octet-stream');
    expect(JSON.stringify(lastHeaders())).not.toContain('text/html');
  });

  it('AC-X14 走 fetch → Blob → 程式化 `<a download>`，不得用 `window.open`', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await downloadWithInit('/admin/documents/export', 'documents.csv', {
      method: 'POST',
      body: { documentIds: ['a'] },
    });
    // 🔴 正向半句不可省略（同上）：先證明 POST 確實送出，`不 window.open` 之負向斷言才有鑑別力。
    expect((lastInit() as RequestInit).method).toBe('POST');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedNames).toEqual(['documents_20260831_143208.csv']);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('AC-X14 POST 路徑之錯誤仍走同一條 `ApiError` 防線（不得另立錯誤處理）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'EXPORT_ROW_LIMIT_EXCEEDED: 符合條件之筆數為 10001 筆' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      downloadWithInit('/admin/documents/export', 'documents.csv', {
        method: 'POST',
        body: { documentIds: ['a'] },
      }),
    ).rejects.toBeInstanceOf(ApiError);
    // 🔴 正向半句不可省略（同上）：證明錯誤是**這條 POST 請求**回來的，而非被忽略之第三參數。
    expect((lastInit() as RequestInit).method).toBe('POST');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('🔴 AC-X14 明文禁止另寫一份 `postDownloadViaBlob()`——模組不得匯出第二個下載函式', () => {
    const exported = Object.keys(downloadBlobModule);
    expect(exported).toContain('downloadViaBlob');
    expect(exported.filter((n) => /^post/i.test(n) && /download/i.test(n))).toEqual([]);
    expect(exported).not.toContain('postDownloadViaBlob');
  });
});

describe('F017 §Interface Contract：`exportDocumentList()` 之請求形狀（body 恰兩鍵）', () => {
  it('`exportDocumentList` 由 `api/endpoints.ts` 匯出', () => {
    expect(typeof exportDocumentList()).toBe('function');
  });

  it('🔴 POST `/admin/documents/export`，body 之 `documentIds` 逐字為傳入之陣列（含順序）', async () => {
    const fn = exportDocumentList();
    expect(typeof fn).toBe('function');
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await (fn as ExportDocumentListFn)(['c', 'a', 'b']);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/admin/documents/export');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string).documentIds).toEqual(['c', 'a', 'b']);
  });

  it('🔒 未提供 `linkTargetId` → body **恰一鍵**（不得送 `linkTargetId: undefined` 以外之任何鍵）', async () => {
    const fn = exportDocumentList();
    expect(typeof fn).toBe('function');
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await (fn as ExportDocumentListFn)(['a']);
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(Object.keys(body)).toEqual(['documentIds']);
  });

  it('🔒 提供 `linkTargetId` → body **恰兩鍵**，且不得夾帶任何篩選鍵', async () => {
    const fn = exportDocumentList();
    expect(typeof fn).toBe('function');
    vi.mocked(fetch).mockResolvedValue(csvResponse());
    await (fn as ExportDocumentListFn)(['a'], 'target-1');
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(Object.keys(body).sort()).toEqual(['documentIds', 'linkTargetId']);
    expect(body.linkTargetId).toBe('target-1');
    for (const forbidden of [
      'companyCode', 'draftingDeptId', 'draftingSectionId', 'primaryChiefId', 'status',
      'documentNumber', 'documentName', 'appendixId', 'formId', 'ojtStatus', 'lifecycleId',
      'nodeSubtreeId', 'dateFrom', 'dateTo', 'keyword', 'page', 'pageSize', 'sortBy', 'sortDir',
    ]) {
      expect(body[forbidden]).toBeUndefined();
    }
  });

  it('🔒 檔名 fallback 為 `documents.csv`（實際檔名優先取 `Content-Disposition`）', async () => {
    const fn = exportDocumentList();
    expect(typeof fn).toBe('function');
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(['\uFEFFx\r\n']), { status: 200, headers: { 'content-type': 'text/csv' } }),
    );
    await (fn as ExportDocumentListFn)(['a']);
    expect(clickedNames).toEqual(['documents.csv']);
  });
});
