import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AccessHistoryController } from './access-history.controller';
import { AuditWriterService } from './audit-writer.service';
import { AuditRow, Page } from './audit.types';
import { EXPORT_ROW_LIMIT } from '../storage/csv-export';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

/**
 * F024 文件調閱歷程查詢端點。涵蓋 TS-003/004（RBAC 放行/拒絕，table-driven）、005（路由/metadata 契約）、
 * 015（匯出遵循查詢條件）、016（匯出角色守門同查詢）。比照 org-sync.controller.spec.ts 之雙層測法。
 *
 * 🔴 2026-08-18 匯出鈕失效之修復 delta（`AC-F1`～`AC-F19`；架構決策 §10.18 `A16-1`～`A16-4`）：
 * 本檔大幅擴充，涵蓋匯出端點真正輸出 CSV（而非現行 JSON `{rows,total}`）之全部行為。
 *
 * 📌 **本環對 `exportHistory()` 呼叫簽章之契約性假設（本環所訂，非讀取實作決定）**：
 *    末位新增第 6 個參數 `@Res({ passthrough: false }) res: Response`，比照本 repo 既有三處
 *    CSV 匯出 handler 之慣例（`ChangeHistoryController.exportDocumentChanges`／
 *    `AppendicesController` 之匯出/下載 handler，皆為 `@Res() res: Response` 置於參數尾端、
 *    `res.setHeader(...)` ＋ `res.send(buffer)`）。前 5 個參數（kind/person/target/from/to）
 *    逐字不變（AC-F12 閘門與既有簽章不動）。若實作採不同簽章（如改用 `@Res({passthrough:true})`
 *    搭配回傳值），請走 mailbox 向 test-generator 申訴。
 *
 * ⚠ 對實作全盲：CSV 產生／稽核寫入等行為於本環撰寫時**尚不存在** —— 型別錯誤或斷言不符即為預期紅燈。
 */

function pageOf(items: AuditRow[], total?: number): Page<AuditRow> {
  return {
    items,
    total: total ?? items.length,
    page: 1,
    pageSize: 50,
    hasNext: false,
    appliedDefaultRange: false,
  };
}

/** 假 Express Response：捕捉 setHeader／send 呼叫，不需真實 HTTP 堆疊。 */
interface FakeRes {
  setHeader: jest.Mock;
  send: jest.Mock;
  headers: Record<string, string>;
}
function fakeRes(): FakeRes {
  const headers: Record<string, string> = {};
  const setHeader = jest.fn((k: string, v: string) => {
    headers[k] = v;
  });
  const send = jest.fn();
  return { setHeader, send, headers };
}

/** 匯出用之基準列（比照 prototype 17／既有 AccessHistoryPage.test.tsx 之 DOC_ROW 慣例）。 */
let rowSeq = 0;
function auditRow(over: Partial<AuditRow> = {}): AuditRow {
  rowSeq += 1;
  return {
    id: `r-${rowSeq}`,
    targetAccountId: null,
    accountId: 'a1',
    employeeNo: '22345',
    name: '王小明',
    company: '和潤企業股份有限公司',
    department: '營運管理部',
    section: '審查室',
    roleCode: 'User',
    targetType: 'DOCUMENT',
    actionType: 'VIEW',
    documentId: 'd1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    lifecycleId: null,
    lifecycleName: null,
    formId: null,
    appendixId: null,
    targetName: '車輛分期進件作業',
    watermarkSnapshot:
      '22345-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-16 14:32:08',
    occurredAt: new Date('2026-07-16T06:32:08.000Z'), // → UTC+8 2026-07-16 14:32:08
    source: 'DIRECT',
    ...over,
  };
}

/** 以位元組解出 CSV 之邏輯列（跳過 BOM）；比照 csv-export.spec.ts 之慣例。 */
function csvLines(buf: Buffer): string[] {
  return buf.subarray(3).toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/);
}

const HEADER =
  '操作人員,員工編號,公司,部門,處/室,角色,類型,對象（文件／循環）,操作類型,操作時間';

describe('AccessHistoryController（委派 AuditWriter.queryHistory）', () => {
  it('query → 以解析後 filters 委派 queryHistory 並回傳分頁', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([]));
    const svc = { queryHistory } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);

    await controller.query('文件', '王小明', 'ICSOP-A', '2026-07-01', '2026-07-31', '2', '50');

    expect(queryHistory).toHaveBeenCalledTimes(1);
    const [, filters] = queryHistory.mock.calls[0];
    expect(filters).toMatchObject({
      kind: '文件',
      person: '王小明',
      target: 'ICSOP-A',
      from: '2026-07-01',
      to: '2026-07-31',
      page: 2,
      pageSize: 50,
    });
  });

  /**
   * 🔴 TS-015（AC-F18 承接表第 1 列）就地改寫：原斷言「以與查詢相同之 filters 委派，回傳結果集
   * （JSON 形狀）」——回傳形狀之期望已由 AC-F2 推翻，改斷言「回應為 CSV 位元組與檔案標頭，
   * 非 {rows,total}」；filters 委派之半保留（AC-F7 ④）。
   *   OLD> `expect(filters).toMatchObject({ kind: '循環', person: '李慧玲', from: ..., to: ... });`
   *        （委派之斷言半保留，僅刪除「回傳結果集」之 JSON 形狀期待）
   *
   * 同時涵蓋 A16-4：單一次 queryHistory 呼叫，pageSize 固定為 EXPORT_ROW_LIMIT+1、page 固定為 1
   * （AC-F7 ③ 匯出忽略 page/pageSize——本簽章本就不接收這兩個參數）。
   */
  it('TS-015 export → 以與查詢相同之 filters 委派（AC-F7④），單一次呼叫、pageSize=EXPORT_ROW_LIMIT+1（A16-4）', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([auditRow()]));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();

    await controller.exportHistory(
      '循環',
      '李慧玲',
      '',
      '2026-07-01',
      '2026-07-31',
      res as unknown as never,
    );

    expect(queryHistory).toHaveBeenCalledTimes(1);
    const [, filters] = queryHistory.mock.calls[0];
    expect(filters).toMatchObject({
      kind: '循環',
      person: '李慧玲',
      from: '2026-07-01',
      to: '2026-07-31',
      page: 1,
      pageSize: EXPORT_ROW_LIMIT + 1,
    });
    // AC-F2 ④：回應不得為 JSON、不得含 {"rows" 或 "total" 之 JSON 形狀。
    expect(res.send).toHaveBeenCalledTimes(1);
    const sent = res.send.mock.calls[0][0];
    expect(Buffer.isBuffer(sent)).toBe(true);
    const text = (sent as Buffer).toString('utf8');
    expect(text).not.toContain('"rows"');
    expect(text).not.toContain('"total"');
  });
});

describe('AccessHistoryController（路由與 RBAC 契約）', () => {
  it('TS-005 query 宣告為 GET /（掛 @RequirePermission 文件調閱歷程查詢/read）', () => {
    const method = Reflect.getMetadata(METHOD_METADATA, AccessHistoryController.prototype.query);
    const perm = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      AccessHistoryController.prototype.query,
    ) as RequiredPermission;
    expect(method).toBe(RequestMethod.GET);
    expect(perm).toEqual({
      functionKey: FunctionKey.DOCUMENT_ACCESS_HISTORY,
      action: 'read',
    });
  });

  it('TS-005 export 宣告為 GET /export（同掛 read 權限 metadata）', () => {
    const path = Reflect.getMetadata(PATH_METADATA, AccessHistoryController.prototype.exportHistory);
    const method = Reflect.getMetadata(METHOD_METADATA, AccessHistoryController.prototype.exportHistory);
    const perm = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      AccessHistoryController.prototype.exportHistory,
    ) as RequiredPermission;
    expect(path).toBe('export');
    expect(method).toBe(RequestMethod.GET);
    expect(perm).toEqual({
      functionKey: FunctionKey.DOCUMENT_ACCESS_HISTORY,
      action: 'read',
    });
  });

  function ctxFor(
    handler: (...args: never[]) => unknown,
    roleCode: string | undefined,
  ): ExecutionContext {
    const sessionUser =
      roleCode === undefined
        ? undefined
        : ({ loginId: 'x', email: 'x@y', companyCode: 'AS', roleCode } as SessionUser);
    const request = { sessionUser } as RequestWithSession;
    return {
      getHandler: () => handler,
      getClass: () => AccessHistoryController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  const guard = new RolePermissionGuard(new Reflector());

  it.each(['SysAdmin', 'ICSOPAdmin'])(
    'TS-003 %s（矩陣 READ）→ query 放行',
    (role) => {
      expect(guard.canActivate(ctxFor(AccessHistoryController.prototype.query, role))).toBe(true);
    },
  );

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'TS-004 %s（矩陣 無）→ query 403 PERMISSION_DENIED',
    (role) => {
      const ctx = ctxFor(AccessHistoryController.prototype.query, role);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('PERMISSION_DENIED');
    },
  );

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'TS-016 %s → export 亦 403（匯出不得旁路查詢角色限制）',
    (role) => {
      const ctx = ctxFor(AccessHistoryController.prototype.exportHistory, role);
      expect(() => guard.canActivate(ctx)).toThrow('PERMISSION_DENIED');
    },
  );

  it.each(['SysAdmin', 'ICSOPAdmin'])('TS-016 %s → export 放行', (role) => {
    expect(
      guard.canActivate(ctxFor(AccessHistoryController.prototype.exportHistory, role)),
    ).toBe(true);
  });
});

/**
 * AC-F2（端點契約：回 CSV 位元組，不再回 JSON）。
 * 🔴 res.send(buffer)（送 Buffer，非字串）——送字串會讓 Express 自行決定編碼，BOM 可能悄悄壞掉。
 */
describe('AccessHistoryController.exportHistory（AC-F2 端點契約）', () => {
  function exportOnce(rows: AuditRow[], total?: number) {
    const queryHistory = jest.fn().mockResolvedValue(pageOf(rows, total));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    return { controller, res, recordAccess };
  }

  it('① Content-Type 為 text/csv; charset=utf-8', async () => {
    const { controller, res } = exportOnce([auditRow()]);
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
  });

  it('② Content-Disposition 為 attachment; filename="access_history_{YYYYMMDD}_{HHmmss}.csv"', async () => {
    const { controller, res } = exportOnce([auditRow()]);
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    expect(res.headers['Content-Disposition']).toMatch(
      /^attachment; filename="access_history_\d{8}_\d{6}\.csv"$/,
    );
  });

  it('③ body 之前三個位元組為 EF BB BF（UTF-8 BOM，位元組層級檢查）', async () => {
    const { controller, res } = exportOnce([auditRow()]);
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const buf = res.send.mock.calls[0][0] as Buffer;
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('🔴 送出之引數本身必須是 Buffer（非字串）', async () => {
    const { controller, res } = exportOnce([auditRow()]);
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    expect(Buffer.isBuffer(res.send.mock.calls[0][0])).toBe(true);
  });

  it('🔴 AC-F8 ③：原始碼不得再含識別字 EXPORT_MAX，亦不得以 100000 作為 pageSize（靜態原始碼掃描）', () => {
    const src = readFileSync(join(__dirname, 'access-history.controller.ts'), 'utf8');
    expect(src).not.toContain('EXPORT_MAX');
    expect(src).not.toMatch(/\b100000\b/);
  });
});

/** AC-F4（欄位集合、順序與表頭逐字，恰 10 欄）。 */
describe('AccessHistoryController.exportHistory（AC-F4 表頭）', () => {
  it('第 1 列逐字為 10 欄表頭，順序與畫面主表格一致', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([auditRow()]));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const buf = res.send.mock.calls[0][0] as Buffer;
    expect(csvLines(buf)[0]).toBe(HEADER);
    expect(HEADER.split(',')).toHaveLength(10);
  });
});

/**
 * AC-F5（值層：列舉欄一律輸出中文標籤）—— 逐行 CSV 值之整合層驗證，證明
 * `access-history-labels.ts`（AC-F5 ④／A16-2）確實被匯出路徑**採用**（而非僅定義未接線）。
 * 純函式之逐鍵斷言見 access-history-labels.spec.ts；本檔僅每軸各挑代表列驗證接線。
 */
describe('AccessHistoryController.exportHistory（AC-F5 值層：中文標籤）', () => {
  async function exportRows(rows: AuditRow[]): Promise<string[]> {
    const queryHistory = jest.fn().mockResolvedValue(pageOf(rows));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    return csvLines(res.send.mock.calls[0][0] as Buffer);
  }

  it('① 角色欄輸出中文標籤，不得輸出 roleCode（以 ICSOPAdmin 為代表列）', async () => {
    const lines = await exportRows([auditRow({ roleCode: 'ICSOPAdmin' })]);
    expect(lines[1]).toContain('ICSOP 管理員');
    expect(lines[1]).not.toMatch(/(?<![A-Za-z])ICSOPAdmin(?![A-Za-z])/);
  });

  it('① roleCode 為 null → 該儲存格為空（非字面 null）', async () => {
    const lines = await exportRows([auditRow({ roleCode: null })]);
    const cells = lines[1].split(',');
    expect(cells[5]).toBe(''); // 角色欄（0-based 第 5 欄）
  });

  it('② 操作類型欄只出中文標籤，不含代碼（以 LIFECYCLE_CHANGELOG_DOWNLOAD 為代表列）', async () => {
    const lines = await exportRows([
      auditRow({
        targetType: 'LIFECYCLE_CHANGE_LOG',
        actionType: 'LIFECYCLE_CHANGELOG_DOWNLOAD',
        documentId: null,
        documentNumber: null,
        lifecycleId: 'l1',
        lifecycleName: '銷售及收款循環',
      }),
    ]);
    expect(lines[1]).toContain('新舊樹狀圖下載');
    expect(lines[1]).not.toContain('LIFECYCLE_CHANGELOG_DOWNLOAD');
  });

  it('③ 類型欄：APPENDIX（既有不一致之承接）→ 變更', async () => {
    const lines = await exportRows([
      auditRow({
        targetType: 'APPENDIX',
        actionType: 'DOWNLOAD',
        documentId: 'd9',
        documentNumber: 'ICSOP-APX-1',
      }),
    ]);
    const cells = lines[1].split(',');
    expect(cells[6]).toBe('變更'); // 類型欄（0-based 第 6 欄）
  });

  it('③ 類型欄：LIFECYCLE → 循環', async () => {
    const lines = await exportRows([
      auditRow({
        targetType: 'LIFECYCLE',
        actionType: 'LIFECYCLE_VIEW',
        documentId: null,
        documentNumber: null,
        lifecycleId: 'l1',
        lifecycleName: '銷售及收款循環',
      }),
    ]);
    const cells = lines[1].split(',');
    expect(cells[6]).toBe('循環');
  });

  /**
   * 🔴 D9 delta（2026-08-20，`OQ-D9-29`／`OQ-D9-34`）：`AC-N70`（上傳事件於匯出之呈現）。
   * 權威：docs/specs/features/F024-access-history-query.md#d9-audit-view-delta `AC-N70`；
   * 值層通則沿用 `AC-F5`（列舉欄一律輸出中文標籤）。CSV 表頭與 10 欄集合逐字不變（`AC-N55`）。
   */
  it('④ 類型欄：DOCUMENT_ATTACHMENT → 上傳；操作類型欄：ATTACHMENT_UPLOAD → 附件上傳（AC-N70）', async () => {
    const lines = await exportRows([
      auditRow({
        targetType: 'DOCUMENT_ATTACHMENT',
        actionType: 'ATTACHMENT_UPLOAD',
        documentId: 'd1',
        documentNumber: 'ICSOP-SRC-101-1-01',
        watermarkSnapshot: null,
      }),
    ]);
    const cells = lines[1].split(',');
    expect(cells[6]).toBe('上傳'); // 類型欄（0-based 第 6 欄）
    expect(cells[8]).toBe('附件上傳'); // 操作類型欄（0-based 第 8 欄）
    expect(lines[1]).not.toContain('DOCUMENT_ATTACHMENT');
    expect(lines[1]).not.toContain('ATTACHMENT_UPLOAD');
  });

  it('AC-N70 上傳事件之對象（文件／循環）欄為該文件之編號；CSV 表頭仍逐字不變（10 欄，AC-N55）', async () => {
    const lines = await exportRows([
      auditRow({
        targetType: 'DOCUMENT_ATTACHMENT',
        actionType: 'ATTACHMENT_UPLOAD',
        documentId: 'd1',
        documentNumber: 'ICSOP-SRC-101-1-01',
        watermarkSnapshot: null,
      }),
    ]);
    expect(HEADER.split(',')).toHaveLength(10);
    const cells = lines[1].split(',');
    expect(cells[7]).toContain('ICSOP-SRC-101-1-01'); // 對象（文件／循環）欄（0-based 第 7 欄）
  });
});

/** AC-F6（時間戳格式：YYYY-MM-DD HH:mm:ss，UTC+8，不附 (UTC+8) 字樣，顯式 +8 位移）。 */
describe('AccessHistoryController.exportHistory（AC-F6 時間戳）', () => {
  it('occurredAt 之 UTC 時間 06:32:08 → CSV 欄逐字為 2026-07-16 14:32:08（UTC+8，跨日可鑑別）', async () => {
    const queryHistory = jest
      .fn()
      .mockResolvedValue(pageOf([auditRow({ occurredAt: new Date('2026-07-16T06:32:08.000Z') })]));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    const cells = lines[1].split(',');
    expect(cells[9]).toBe('2026-07-16 14:32:08'); // 操作時間欄（0-based 第 9 欄，末欄）
    expect(cells[9]).not.toContain('UTC');
    expect(cells[9]).not.toContain('+8');
  });

  it('🔴 不受行程 TZ 影響：process.env.TZ 切換不改變輸出（顯式 +8 位移，非依賴行程本地時區）', async () => {
    const original = process.env.TZ;
    try {
      async function run(): Promise<string> {
        const queryHistory = jest
          .fn()
          .mockResolvedValue(pageOf([auditRow({ occurredAt: new Date('2026-07-16T06:32:08.000Z') })]));
        const recordAccess = jest.fn().mockResolvedValue(undefined);
        const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
        const controller = new AccessHistoryController(svc);
        const res = fakeRes();
        await controller.exportHistory('', '', '', '', '', res as unknown as never);
        return csvLines(res.send.mock.calls[0][0] as Buffer)[1].split(',')[9];
      }
      process.env.TZ = 'UTC';
      const asUtc = await run();
      process.env.TZ = 'America/New_York';
      const asNy = await run();
      expect(asUtc).toBe('2026-07-16 14:32:08');
      expect(asNy).toBe(asUtc);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

/** AC-F7（匯出範圍與列序：全部結果、與查詢共用 filters）。 */
describe('AccessHistoryController.exportHistory（AC-F7 範圍與列序）', () => {
  it('① 資料列數 = 查詢之 total（非當前分頁）', async () => {
    const rows = [auditRow({ id: 'x1' }), auditRow({ id: 'x2' }), auditRow({ id: 'x3' })];
    const queryHistory = jest.fn().mockResolvedValue(pageOf(rows, 3));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    expect(lines).toHaveLength(1 + 3); // 表頭 + 3 資料列
  });
});

/** AC-F8（🔴 筆數上限：沿用共用機制，恰 10000 通過、超過 400 不產生檔案）。 */
describe('AccessHistoryController.exportHistory（AC-F8 筆數上限）', () => {
  it('恰 10000 筆（邊界值含）→ 正常產生 CSV（不拒絕）', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([auditRow()], EXPORT_ROW_LIMIT));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await expect(
      controller.exportHistory('', '', '', '', '', res as unknown as never),
    ).resolves.not.toThrow();
    expect(res.send).toHaveBeenCalledTimes(1);
  });

  it('10001 筆（超過上限 1）→ 拒絕（400 EXPORT_ROW_LIMIT_EXCEEDED），不產生任何檔案、不寫稽核', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([], EXPORT_ROW_LIMIT + 1));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await expect(
      controller.exportHistory('', '', '', '', '', res as unknown as never),
    ).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    expect(res.send).not.toHaveBeenCalled();
    expect(recordAccess).not.toHaveBeenCalled();
  });

  it('AC-F9 ②：超限之訊息含實際筆數（非恆為上限值）——以 12345 筆驗證', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([], 12_345));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await expect(
      controller.exportHistory('', '', '', '', '', res as unknown as never),
    ).rejects.toThrow(/12345/);
  });
});

/** AC-F10（CSV 注入防護：F024 可達欄位之注入面）。 */
describe('AccessHistoryController.exportHistory（AC-F10 CSV 注入防護）', () => {
  /**
   * 🔴 2026-08-18 fixture 更正（test-generator 自查，implementer 經 mailbox 申訴，見對話紀錄）：
   * 原始值 `=cmd|"/c calc"!A1` 含雙引號 `"` ⇒ 依 error-handling.md 之 RFC 4180 逸出規則，整格必須
   * 額外被外層引號包覆、內部 `"` 逸出為 `""`——**先加前綴、再包覆**（AC-F10／csv-export.ts 之
   * `cell()`），故正確結果之首字元為外層引號 `"`，前綴 `'` 緊接其後，而非直接以 `'` 開頭。
   * 原斷言 `dataLine.startsWith("'=cmd")` 對**任何**正確實作皆不可能為真（已以 production 之
   * `cell()` 邏輯獨立複算 `cell('=cmd|"/c calc"!A1')` 驗證，結果為 `"'=cmd|""/c calc""!A1"`，
   * 與既有 `csv-export.spec.ts`「🔴 順序：先加前綴、再 RFC 4180 包覆逸出」一測之既有斷言同構）。
   *   OLD> `expect(dataLine.startsWith("'=cmd")).toBe(true);`
   * 改為斷言完整轉換後之儲存格（同時驗證前綴與包覆之交互作用，比原斷言更強，非弱化）。
   *
   * 🔴🔴 此 fixture 刻意含 `"`（雙引號）以覆蓋「前綴＋RFC 4180 包覆」交互路徑——**不得**為了
   * 「跟下一條 it 看起來一致」或「期望值以 `"` 開頭很奇怪」而移除該雙引號或把期望值改回以 `'`
   * 開頭。這正是 AC-F10「先加前綴、再包覆」唯一有鑑別力的驗證標的：若實作把順序顛倒（先包覆、
   * 再加前綴），或忘記讓包覆邏輯套用到已加前綴後的字串，本斷言會抓到；若移除雙引號，這條測試
   * 就會退化成與下一條 it（`+1234=SUM(A1)`，不觸發包覆）測到同一條「不包覆」路徑，白白丟失
   * 「含包覆」路徑的覆蓋（team-lead 2026-08-18 裁決，見對話紀錄）。與下一條 it 為互補關係，
   * 非重複：本條覆蓋「值含 `"` → 觸發包覆」，下一條覆蓋「值不含 `"` → 不觸發包覆」。
   */
  it('「操作人員」以 = 開頭且含雙引號 → 先加前綴、再依 RFC 4180 包覆逸出（AC-F10 與逸出規則之交互；fixture 刻意含 " 以覆蓋包覆路徑，勿移除）', async () => {
    const queryHistory = jest
      .fn()
      .mockResolvedValue(pageOf([auditRow({ name: '=cmd|"/c calc"!A1' })]));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const body = (res.send.mock.calls[0][0] as Buffer).subarray(3).toString('utf8');
    const dataLine = body.split(/\r?\n/)[1];
    expect(dataLine.startsWith('"\'=cmd|""/c calc""!A1"')).toBe(true);
  });

  /** 與上一條 it 互補：本條 fixture 不含 `"`，不觸發 RFC 4180 包覆，覆蓋「單純前綴」路徑。 */
  it('「對象（文件／循環）」以 + 開頭 → 該儲存格加前綴（對象欄可達，因文件編號為 ICSOPAdmin 可自訂字串）', async () => {
    const queryHistory = jest
      .fn()
      .mockResolvedValue(pageOf([auditRow({ documentNumber: '+1234=SUM(A1)' })]));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    const cells = lines[1].split(',');
    expect(cells[7].startsWith("'+")).toBe(true); // 對象欄（0-based 第 7 欄）
  });

  it('表頭列不套用注入前綴（值以 = 開頭時表頭仍逐字，AC-F4 不受影響）', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([auditRow({ name: '=x' })]));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    expect(lines[0]).toBe(HEADER);
  });
});

/** AC-F11（空結果：僅含表頭列之 CSV，非錯誤、非空檔，成功回饋照常）。 */
describe('AccessHistoryController.exportHistory（AC-F11 空結果）', () => {
  it('0 筆 → 200，CSV 僅含表頭列（BOM 起始、CRLF 結尾），非拋錯', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([], 0));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await expect(
      controller.exportHistory('', '', '', '', '', res as unknown as never),
    ).resolves.not.toThrow();
    const buf = res.send.mock.calls[0][0] as Buffer;
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csvLines(buf)).toHaveLength(1);
    expect(csvLines(buf)[0]).toBe(HEADER);
  });
});

/**
 * AC-F13（🔴 匯出動作記稽核：新增 ACCESS_HISTORY_EXPORT）。
 * 🔴 targetId 不得由結果集第一筆衍生（AC-F13 明文禁止）——可觀測判準＝0 筆匯出後仍恰增一列稽核；
 * 本檔以「0 筆匯出仍呼叫 recordAccess 恰一次」直接驗證該判準（無需檢查原始碼）。
 */
describe('AccessHistoryController.exportHistory（AC-F13 匯出動作記稽核）', () => {
  async function exportWith(total: number, itemsLen: number) {
    const items = Array.from({ length: itemsLen }, (_, i) => auditRow({ id: `t-${i}` }));
    const queryHistory = jest.fn().mockResolvedValue(pageOf(items, total));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    return { recordAccess };
  }

  it.each([
    ['0 筆', 0, 0],
    ['1 筆', 1, 1],
    ['N（>1）筆', 3, 3],
  ])('%s → 恰寫入一筆稽核（0 筆不得靜默漏記，AC-F13 之核心驅動值）', async (_label, total, len) => {
    const { recordAccess } = await exportWith(total, len);
    expect(recordAccess).toHaveBeenCalledTimes(1);
  });

  it('① actionType 逐字為 ACCESS_HISTORY_EXPORT', async () => {
    const { recordAccess } = await exportWith(1, 1);
    expect(recordAccess.mock.calls[0][0]).toMatchObject({ actionType: 'ACCESS_HISTORY_EXPORT' });
  });

  it('④ watermarkSnapshot 為 null（非浮水印動作）', async () => {
    const { recordAccess } = await exportWith(1, 1);
    expect(recordAccess.mock.calls[0][0]).toMatchObject({ watermarkSnapshot: null });
  });

  it('② accountId 與身分快照欄 = 當前 session 之操作者（非取自結果集）——targetId 恆為固定字面值，與筆數/結果集無關', async () => {
    // 0 筆與 1 筆兩次呼叫之 targetId 必須相同（證明非衍生自 items[0]，而 0 筆時 items[0] 為 undefined）。
    const zero = await exportWith(0, 0);
    const one = await exportWith(1, 1);
    const targetIdZero = zero.recordAccess.mock.calls[0][0].targetId;
    const targetIdOne = one.recordAccess.mock.calls[0][0].targetId;
    expect(targetIdZero).toBeTruthy();
    expect(targetIdZero).toBe(targetIdOne);
  });

  it('Given 匯出因超限被拒（400）→ 不寫入任何稽核', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([], EXPORT_ROW_LIMIT + 1));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await expect(
      controller.exportHistory('', '', '', '', '', res as unknown as never),
    ).rejects.toThrow();
    expect(recordAccess).not.toHaveBeenCalled();
  });

  // 📝 「匯出因無權被拒（403）→ 不寫入任何稽核」不在此重複建構：403 發生於 RolePermissionGuard
  // 層（見上方「路由與 RBAC 契約」describe 之 TS-016），Guard 攔截後 handler 結構上不會被呼叫，
  // 故 recordAccess 不可能被觸發——這是 Guard 攔截機制本身的既有性質，非本檔需另立斷言之標的。

  it('🔴 Outbox／IO 層之稽核寫入失敗（暫時性）→ 不阻斷匯出，使用者仍取得 CSV', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([auditRow()], 1));
    const recordAccess = jest.fn().mockRejectedValue(new Error('AUDIT_IO_TEMPORARILY_UNAVAILABLE'));
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await expect(
      controller.exportHistory('', '', '', '', '', res as unknown as never),
    ).resolves.not.toThrow();
    expect(res.send).toHaveBeenCalledTimes(1);
    const buf = res.send.mock.calls[0][0] as Buffer;
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});

/**
 * AC-F14（🔒 明細專屬欄不匯出：負向斷言）。
 * 種入含哨兵子字串之浮水印快照（浮水印固定機密聲明，本身不是任何匯出欄位的值），
 * 斷言該哨兵子字串不出現於 CSV 位元組中——而非斷言「完整快照字串不出現」（那是恆真的空斷言，
 * 因完整快照本身即由姓名/員編/部門/處室/時間等既有匯出欄位聚合而成，見 AC-F14 註記）。
 */
describe('AccessHistoryController.exportHistory（AC-F14 明細專屬欄不匯出）', () => {
  const SENTINEL = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';

  it('① 表頭列不含「浮水印快照」「對象名稱／說明」任一字串', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([auditRow()], 1));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    expect(lines[0]).not.toContain('浮水印快照');
    expect(lines[0]).not.toContain('對象名稱／說明');
  });

  it('② 哨兵子字串（浮水印固定機密聲明）不出現於 CSV 位元組中（非完整快照字串之恆真空斷言）', async () => {
    const queryHistory = jest
      .fn()
      .mockResolvedValue(
        pageOf(
          [
            auditRow({
              watermarkSnapshot: `22345-王小明-和潤企業股份有限公司-營運管理部-審查室-${SENTINEL}-2026-07-16 14:32:08`,
            }),
          ],
          1,
        ),
      );
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const text = (res.send.mock.calls[0][0] as Buffer).toString('utf8');
    expect(text).not.toContain(SENTINEL);
  });
});

/** AC-F15（🔴 非文件類型之紀錄無 documentId — Edge Case 之兌現）。 */
describe('AccessHistoryController.exportHistory（AC-F15 非文件類型與明細欄）', () => {
  it('① CSV 不得有獨立之「文件編號」欄（10 欄之集合固定，AC-F4）', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([auditRow()], 1));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    expect(lines[0]).not.toContain('文件編號');
  });

  it('② 循環列（documentId=null，lifecycleName 有值）→ 對象欄 = lifecycleName', async () => {
    const queryHistory = jest.fn().mockResolvedValue(
      pageOf(
        [
          auditRow({
            targetType: 'LIFECYCLE',
            actionType: 'LIFECYCLE_VIEW',
            documentId: null,
            documentNumber: null,
            lifecycleId: 'l1',
            lifecycleName: '銷售及收款循環',
            formId: null,
          }),
        ],
        1,
      ),
    );
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    const cells = lines[1].split(',');
    expect(cells[7]).toBe('銷售及收款循環'); // 對象欄
  });

  it('③ 三者（documentNumber/lifecycleName/formId）皆空 → 對象欄為空（不輸出畫面佔位符 —）', async () => {
    const queryHistory = jest.fn().mockResolvedValue(
      pageOf(
        [
          auditRow({
            targetType: 'ORG_CHANGE_ALERT',
            actionType: 'ALERT_RESOLVED',
            documentId: null,
            documentNumber: null,
            lifecycleId: null,
            lifecycleName: null,
            formId: null,
          }),
        ],
        1,
      ),
    );
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    const cells = lines[1].split(',');
    expect(cells[7]).toBe('');
    expect(cells[7]).not.toContain('—');
  });

  it('🔒 「處/室」與「角色」為 null（畫面顯示 — 之欄）→ CSV 亦為空儲存格，非 —（AC-F15 註記之同一規則）', async () => {
    const queryHistory = jest
      .fn()
      .mockResolvedValue(pageOf([auditRow({ section: null, roleCode: null })], 1));
    const recordAccess = jest.fn().mockResolvedValue(undefined);
    const svc = { queryHistory, recordAccess } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);
    const res = fakeRes();
    await controller.exportHistory('', '', '', '', '', res as unknown as never);
    const lines = csvLines(res.send.mock.calls[0][0] as Buffer);
    const cells = lines[1].split(',');
    expect(cells[4]).toBe(''); // 處/室欄
    expect(cells[5]).toBe(''); // 角色欄
    expect(lines[1]).not.toContain('—');
  });
});
