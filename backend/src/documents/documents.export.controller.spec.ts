import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import {
  DocumentStore,
  CreateDocumentInput,
  DocumentPatch,
  DocumentView,
  DocumentListFilters,
  DocumentListItem,
  DocumentListPage,
  DocumentSummary,
  DocSecondaryChiefRef,
} from './documents.store';
import { NumberHolder } from './document-rules';
import { DocumentStatus } from './document-status';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey, canPerform } from '../rbac/function-matrix';
import { EXPORT_ROW_LIMIT } from '../storage/csv-export';

/**
 * F017 §清單匯出（CSV）delta —— `POST /admin/documents/export` **端點層**之約束環。
 *
 * 權威：
 *  - `docs/specs/features/F017-backend-document-list.md`
 *    §Interface Contract（方法／路徑／body 恰兩鍵／閘門 `read`）｜`AC-X10`（誰可匯出、誰 403）｜
 *    `AC-X11` ⑤（回應 body 必須為 Buffer）｜`AC-X13`（空結果、檔名、Content-Type）｜
 *    `AC-X17`（🔴 驗證與**檢查順序**，順序即實作順序、不可顛倒）
 *  - `docs/specs/architecture-spec.md` §13.2 ①②④⑤⑥
 *  - `docs/specs/error-handling.md#export`（匯出請求 body 之驗證＝既有 `VALIDATION_ERROR`）
 *
 * 🔴 **本檔為 `AC-X12`／`AC-X17` 之單點檢查落點**：`AC-X12` 明訂「🔒 不得有第二處檢查」——
 *    若 service 檔與本檔各驗一次，其中一處必然為紅（無論實作把檢查點放在 controller 或 service）。
 *    本檔以「真實 `DocumentsService` ＋ fake store」驅動整條端點路徑，故**無論檢查點落在哪一層**，
 *    下列斷言之語意皆成立；並以 `store.listCalls` 是否為空來兌現「不執行任何 DB 查詢」。
 *
 * ⚠ **對實作全盲**：`@Post('export')` handler 於本環撰寫時**尚不存在**。以 `PATH_METADATA` 之
 *    **路徑字面**定位 handler（名稱不敏感，比照既有 `appendices.export.service.spec.ts` 之慣例），
 *    使紅燈落在逐條斷言上。
 *
 * 📌 **本環所訂之契約（規格未定 handler 名稱與參數順序）**：handler 之位置參數為 `(body, res)`
 *    ——比照本 repo 既有匯出 handler（`AccessHistoryController.exportHistory(..., res)`：`@Res()` 置末）。
 *    ⚠ 若實作採不同參數順序，請走 mailbox 申訴，**不得自行改本檔**。
 */

const EXPORT_PATH = 'export';
const HEADER =
  'OJT,制定公司,制定部門,制定室別,當責室長,狀態,檔案,程序書編號,程序書書名,版次,內容摘要,連結點程序書,公告日期,循環別';

/** 以 `@Post(path)` 之路徑字面定位 handler（不把 handler 名稱寫死）。 */
function handlerByPath(path: string): ((...args: unknown[]) => unknown) | undefined {
  const proto = DocumentsController.prototype as unknown as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const h = proto[key];
    if (typeof h !== 'function') continue;
    if (Reflect.getMetadata(PATH_METADATA, h) === path) return h as (...a: unknown[]) => unknown;
  }
  return undefined;
}

interface FakeRes {
  headers: Record<string, string>;
  setHeader: jest.Mock;
  send: jest.Mock;
}
function fakeRes(): FakeRes {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    send: jest.fn(),
  };
}

const listItem = (id: string): DocumentListItem => ({
  id,
  companyCode: 'AS',
  status: 'active',
  documentNumber: `N-${id}`,
  documentName: `書名-${id}`,
  lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環',
  nodeId: null,
  draftingDeptId: null,
  draftingSectionId: null,
  draftingCompanyName: null,
  draftingDeptName: null,
  draftingSectionName: null,
  primaryChiefId: null,
  primaryChiefName: null,
  secondaryChiefCount: 0,
  secondaryChiefNames: [],
  edition: null,
  announcedDate: null,
  contentSummary: null,
  icsopPdfBlobPath: null,
  icsopPdfFileName: null,
  links: [],
});

class FakeStore implements DocumentStore {
  rows: DocumentListItem[] = [];
  listCalls: DocumentListFilters[] = [];
  writeCalls: string[] = [];
  list(filters: DocumentListFilters): Promise<DocumentListPage> {
    this.listCalls.push(filters);
    const items = this.rows.map((r) => ({ ...r }));
    return Promise.resolve({ items, total: items.length, page: 1, pageSize: filters.pageSize ?? 0, hasNext: false });
  }
  findSummaries(): Promise<DocumentSummary[]> {
    return Promise.resolve([]);
  }
  findSecondaryChiefsByDocumentIds(): Promise<DocSecondaryChiefRef[]> {
    return Promise.resolve([]);
  }
  findNumberHolders(): Promise<NumberHolder[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<DocumentView | null> {
    return Promise.resolve(null);
  }
  create(_i: CreateDocumentInput): Promise<DocumentView> {
    this.writeCalls.push('create');
    return Promise.reject(new Error('匯出不得寫入'));
  }
  update(_id: string, _p: DocumentPatch): Promise<DocumentView> {
    this.writeCalls.push('update');
    return Promise.reject(new Error('匯出不得寫入'));
  }
  updateStatus(_id: string, _s: DocumentStatus): Promise<void> {
    this.writeCalls.push('updateStatus');
    return Promise.reject(new Error('匯出不得寫入'));
  }
}

interface Harness {
  ctrl: DocumentsController;
  store: FakeStore;
  res: FakeRes;
  call: (body: unknown) => Promise<unknown>;
}
function makeHarness(ids: string[] = ['d1']): Harness {
  const store = new FakeStore();
  for (const id of ids) store.rows.push(listItem(id));
  const svc = new DocumentsService(store);
  const ctrl = new DocumentsController(svc);
  const res = fakeRes();
  const call = async (body: unknown): Promise<unknown> => {
    const handler = handlerByPath(EXPORT_PATH);
    if (typeof handler !== 'function') {
      throw new Error(`AC-X17：找不到 @Post('${EXPORT_PATH}') handler（尚未實作）`);
    }
    return handler.call(ctrl, body, res);
  };
  return { ctrl, store, res, call };
}

const sentBuffer = (res: FakeRes): Buffer => res.send.mock.calls[0][0] as Buffer;
const rawText = (buf: Buffer): string => buf.subarray(3).toString('utf8');

// ══════════════════════════════════════════════════════════════════════════

describe('F017 端點契約：POST /admin/documents/export（路由 metadata）', () => {
  it('§Interface Contract：存在路徑字面為 `export` 之 handler，且方法為 **POST**', () => {
    const h = handlerByPath(EXPORT_PATH);
    expect(h).toBeDefined();
    expect(Reflect.getMetadata(METHOD_METADATA, h as object)).toBe(RequestMethod.POST);
  });

  it('🔴 AC-X10 閘門為功能 `ICSOP文件管理` 之 **read**（POST 不改變此事；Guard 只看第二引數）', () => {
    const h = handlerByPath(EXPORT_PATH);
    expect(h).toBeDefined();
    const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, h as object) as RequiredPermission;
    expect(meta).toBeDefined();
    expect(meta.functionKey).toBe(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT);
    expect(meta.action).toBe('read');
    // 🔴 明文禁止改為 'write'：會使 SysAdmin／Supervisor／DeptContact 三種唯讀角色連匯出都不能用。
    expect(meta.action).not.toBe('write');
  });

  it('🔴 AC-X10 逐角色解析：ICSOPAdmin／SysAdmin／Supervisor／DeptContact **四者皆允許**，僅 User 拒絕', () => {
    const h = handlerByPath(EXPORT_PATH);
    expect(h).toBeDefined();
    const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, h as object) as RequiredPermission;
    for (const role of ['ICSOPAdmin', 'SysAdmin', 'Supervisor', 'DeptContact']) {
      expect(canPerform(role, meta.functionKey, meta.action)).toBe(true);
    }
    // 🔴 與 F018／F039 刻意不同：那兩頁 Supervisor／DeptContact 本就 403，本頁**不得**照抄收緊。
    expect(canPerform('User', meta.functionKey, meta.action)).toBe(false);
  });

  it('🔒 AC-X16 ⑧ 功能矩陣逐格不變——`ICSOP文件管理` 列仍為 READ／CRUD／READ／READ／NONE', () => {
    const key = FunctionKey.ICSOP_DOCUMENT_MANAGEMENT;
    expect(canPerform('SysAdmin', key, 'read')).toBe(true);
    expect(canPerform('SysAdmin', key, 'write')).toBe(false);
    expect(canPerform('ICSOPAdmin', key, 'write')).toBe(true);
    expect(canPerform('Supervisor', key, 'read')).toBe(true);
    expect(canPerform('Supervisor', key, 'write')).toBe(false);
    expect(canPerform('DeptContact', key, 'read')).toBe(true);
    expect(canPerform('DeptContact', key, 'write')).toBe(false);
    expect(canPerform('User', key, 'read')).toBe(false);
  });

  it('🔒 §13.2 ② 路由不被遮蔽：今日無任何 `@Post(":id")` 單段參數路由', () => {
    const proto = DocumentsController.prototype as unknown as Record<string, unknown>;
    const postPaths: string[] = [];
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      const h = proto[key];
      if (typeof h !== 'function') continue;
      if (Reflect.getMetadata(METHOD_METADATA, h) === RequestMethod.POST) {
        postPaths.push(String(Reflect.getMetadata(PATH_METADATA, h)));
      }
    }
    expect(postPaths).toContain(EXPORT_PATH);
    expect(postPaths).not.toContain(':id');
  });
});

describe('F017 AC-X13／AC-X11 ⑤：回應標頭與位元組', () => {
  it('AC-X13 `Content-Type` 為 `text/csv; charset=utf-8`', async () => {
    const h = makeHarness();
    await h.call({ documentIds: ['d1'] });
    expect(h.res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
  });

  it('AC-X13 `Content-Disposition` 為 `attachment; filename="documents_{YYYYMMDD}_{HHmmss}.csv"`', async () => {
    const h = makeHarness();
    await h.call({ documentIds: ['d1'] });
    expect(h.res.headers['Content-Disposition']).toMatch(
      /^attachment; filename="documents_\d{8}_\d{6}\.csv"$/,
    );
  });

  it('🔴 AC-X11 ⑤ `res.send()` 之引數必須是 **Buffer**（送字串會讓 Express 自行決定編碼、BOM 悄悄壞掉）', async () => {
    const h = makeHarness();
    await h.call({ documentIds: ['d1'] });
    expect(h.res.send).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(sentBuffer(h.res))).toBe(true);
    expect(typeof h.res.send.mock.calls[0][0]).not.toBe('string');
  });

  it('AC-X1 ① 送出之位元組前三 byte 為 EF BB BF（位元組層檢查）', async () => {
    const h = makeHarness();
    await h.call({ documentIds: ['d1'] });
    const buf = sentBuffer(h.res);
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('AC-X1 ② 第 1 列逐字為十四欄表頭', async () => {
    const h = makeHarness();
    await h.call({ documentIds: ['d1'] });
    expect(rawText(sentBuffer(h.res)).split('\r\n')[0]).toBe(HEADER);
  });
});

describe('F017 AC-X17：請求驗證與**檢查順序**（① 型別 → ② 長度 → ③ 空陣列 → ④ 查無）', () => {
  it('AC-X17 ① `documentIds` 缺席 → 400 `VALIDATION_ERROR`，且**不執行任何 DB 查詢**', async () => {
    const h = makeHarness();
    await expect(h.call({})).rejects.toThrow('VALIDATION_ERROR');
    expect(h.store.listCalls).toEqual([]);
    expect(h.res.send).not.toHaveBeenCalled();
  });

  it('🔴 AC-X17 ①＋② 檢查順序：`documentIds` 為**數字**（無 `.length`）→ 仍須 `VALIDATION_ERROR`；順序顛倒時 `undefined > 10000` 恆偽 ⇒ 驗證會靜默通過', async () => {
    const h = makeHarness();
    await expect(h.call({ documentIds: 42 })).rejects.toThrow('VALIDATION_ERROR');
    expect(h.store.listCalls).toEqual([]);
    expect(h.res.send).not.toHaveBeenCalled();
  });

  it('🔴 AC-X17 ① `documentIds` 為**字串**（有 `.length` 但非陣列）→ `VALIDATION_ERROR`，**不得**回 `EXPORT_ROW_LIMIT_EXCEEDED`', async () => {
    const h = makeHarness();
    await expect(h.call({ documentIds: 'd1,d2' })).rejects.toThrow('VALIDATION_ERROR');
    await expect(h.call({ documentIds: 'd1,d2' })).rejects.not.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    expect(h.store.listCalls).toEqual([]);
  });

  it('AC-X17 ① `documentIds` 為 null → `VALIDATION_ERROR`', async () => {
    const h = makeHarness();
    await expect(h.call({ documentIds: null })).rejects.toThrow('VALIDATION_ERROR');
    expect(h.store.listCalls).toEqual([]);
  });

  it('🔴 AC-X17 ① 任一成員非字串 → **整批拒絕** `VALIDATION_ERROR`；明文禁止靜默 `typeof` 過濾', async () => {
    const h = makeHarness(['d1', 'd2']);
    await expect(h.call({ documentIds: ['d1', 7, 'd2'] })).rejects.toThrow('VALIDATION_ERROR');
    expect(h.store.listCalls).toEqual([]);
    expect(h.res.send).not.toHaveBeenCalled();
  });

  it('🔒 AC-X16 ⑨ 不新增任何錯誤碼——畸形 body 之訊息為既有 `VALIDATION_ERROR`，且不得含 `EXPORT_IDS_INVALID`', async () => {
    // 🔴 正向半句不可省略：只寫負向半句時，「handler 根本不存在」之例外也不含該字面 ⇒ 恆真假綠。
    const h = makeHarness();
    await expect(h.call({ documentIds: 42 })).rejects.toThrow('VALIDATION_ERROR');
    await expect(h.call({ documentIds: 42 })).rejects.not.toThrow(/EXPORT_IDS_INVALID/);
  });

  it('AC-X17 ② 長度 > 10,000 → 400 `EXPORT_ROW_LIMIT_EXCEEDED`，訊息含**實際筆數**且排在上限值之前', async () => {
    const h = makeHarness();
    const ids = Array.from({ length: EXPORT_ROW_LIMIT + 1 }, (_, i) => `x${i}`);
    await expect(h.call({ documentIds: ids })).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    let message = '';
    try {
      await h.call({ documentIds: ids });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('10001');
    expect(message.indexOf('10001')).toBeLessThan(message.lastIndexOf('10000'));
    expect(h.res.send).not.toHaveBeenCalled();
  });

  it('AC-X12 ② 上限檢查在**任何 DB 查詢之前**——超限時 `store.list()` 一次都不得被呼叫', async () => {
    const h = makeHarness();
    const ids = Array.from({ length: EXPORT_ROW_LIMIT + 1 }, (_, i) => `x${i}`);
    await expect(h.call({ documentIds: ids })).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    expect(h.store.listCalls).toEqual([]);
  });

  it('🔴 AC-X17 ③ `documentIds: []`（空陣列）是**合法**請求 → 200 ＋ 僅表頭列（**不得**與缺鍵合流）', async () => {
    const h = makeHarness();
    await h.call({ documentIds: [] }); // 不得拋出
    expect(h.res.send).toHaveBeenCalledTimes(1);
    expect(rawText(sentBuffer(h.res))).toBe(`${HEADER}\r\n`);
  });

  it('🔴 AC-X17 ③ vs ① 之判別性：同一支端點，`{}` 拋錯而 `{documentIds: []}` 成功（兩者不得產生逐位元組相同之輸出）', async () => {
    const a = makeHarness();
    await expect(a.call({})).rejects.toThrow('VALIDATION_ERROR');
    const b = makeHarness();
    await b.call({ documentIds: [] });
    expect(a.res.send).not.toHaveBeenCalled();
    expect(b.res.send).toHaveBeenCalledTimes(1);
  });

  it('AC-X17 ④ 某 id 於 DB 已不存在 → 靜默略過該列，其餘照常輸出（不回 404、不中止）', async () => {
    const h = makeHarness(['d1', 'd2']);
    await h.call({ documentIds: ['d1', 'ghost', 'd2'] });
    const lines = rawText(sentBuffer(h.res)).split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(3); // 表頭 ＋ 2 列
  });

  it('🔒 AC-X17 ① 不適用於 `linkTargetId`：缺席／空字串／指向不存在之文件皆**不視為錯誤**', async () => {
    for (const body of [
      { documentIds: ['d1'] },
      { documentIds: ['d1'], linkTargetId: '' },
      { documentIds: ['d1'], linkTargetId: 'not-a-real-document' },
    ]) {
      const h = makeHarness();
      await h.call(body);
      expect(h.res.send).toHaveBeenCalledTimes(1);
    }
  });

  it('🔒 AC-X10 匯出**不寫稽核、不寫任何資料表**（無任何寫入型 store 呼叫）', async () => {
    const h = makeHarness();
    await h.call({ documentIds: ['d1'] });
    expect(h.store.writeCalls).toEqual([]);
  });
});
