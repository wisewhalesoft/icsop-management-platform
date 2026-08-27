import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { AppendicesController } from './appendices.controller';
import { AppendicesService } from './appendices.service';
import {
  AppendixAuditEvent,
  AppendixPoolItem,
  AppendixPoolStore,
  AuditRecorder,
  DocumentExistenceChecker,
} from './appendices.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { SessionContext } from '../attachments/attachments.service';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey, canPerform } from '../rbac/function-matrix';

/**
 * F039 附錄池匯出（CSV）—— Lane L5（缺失 delta #14）。
 *
 * 權威：
 *  - F039 `AC-D4`（動作存在與權限；SysAdmin 唯讀角色**允許**匯出）
 *  - F039 `AC-D5`（範圍＝當前篩選之**全部結果**，非當前頁）
 *  - F039 `AC-D6`（BOM／逐字表頭／RFC 4180／列序與畫面一致）
 *  - F039 `AC-D7`（檔名 `appendices_{YYYYMMDD}_{HHmmss}.csv`）
 *  - F039 `AC-D8`（>10,000 → 400 `EXPORT_ROW_LIMIT_EXCEEDED`，**不產生任何檔案**；恰 10,000 通過）
 *  - F039 `AC-D9`（0 筆 → 僅含表頭列之 CSV）／`AC-D11`（CSV 注入前綴）
 *  - F039 端點表（`GET /admin/appendices/export`，功能 `附錄管理` read，**不寫稽核**）
 *  - architecture-spec §10.4（共用產生器＝`storage/csv-export.ts`；三者一律與其查詢端點接受相同參數）
 *
 * ⚠ 對實作全盲：`AppendicesService.exportPool()` 與 `GET /admin/appendices/export` 於本環撰寫時
 *    **尚不存在** —— 型別錯誤／找不到路由即為預期紅燈。
 *
 * 📌 **本檔不對 `大小`／`上傳時間` 兩欄之值層格式做逐字斷言** —— `AC-D6` ② 只逐字規定了**表頭**，
 *    「畫面所見」對這兩欄之字面格式（`56 KB` vs `57344`、時間之時區與樣式）未入 AC。已登錄於
 *    `docs/test-specs/risks-and-gaps.md`（Lane L5 段落），不臆造期望值。
 */

const ICSOP_ADMIN: SessionContext = { roleCode: 'ICSOPAdmin', accountId: 'admin-1' };
const SYS_ADMIN: SessionContext = { roleCode: 'SysAdmin', accountId: 'sys-1' };

/**
 * 🔵 `AC-X2`（2026-08-27）：表頭由六欄擴為**七欄**（末尾新增「關聯文件編號」）。
 * 📝 被取代之逐字表頭保留供追溯（⚠ 不得復原）：
 *   OLD> const HEADER = '附錄名稱,格式,大小,上傳者,上傳時間,關聯文件數';
 */
const HEADER = '附錄名稱,格式,大小,上傳者,上傳時間,關聯文件數,關聯文件編號';

class FakeAuditRecorder implements AuditRecorder {
  events: AppendixAuditEvent[] = [];
  record(e: AppendixAuditEvent): void {
    this.events.push(e);
  }
}

class AlwaysExists implements DocumentExistenceChecker {
  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

function itemOf(i: number, over: Partial<AppendixPoolItem> = {}): AppendixPoolItem {
  const format = i % 3 === 0 ? 'pdf' : i % 3 === 1 ? 'xlsx' : 'xls';
  return {
    id: `ax-${i}`,
    name: `附錄-${i}.${format}`,
    format,
    size: 1024 * (i + 1),
    blobPath: `appendices/ax-${i}.${format}`,
    uploadedBy: 'acct-1',
    uploadedByName: '李慧玲',
    uploadedAt: new Date('2026-06-10T00:00:00Z'),
    docCount: i % 4,
    documents: [],
    ...over,
  } as AppendixPoolItem;
}

/** 依序回傳指定總覽列（列序即「畫面當前排序」）。 */
function makeSvc(items: AppendixPoolItem[]) {
  const blob = new FakeBlobStore();
  const audit = new FakeAuditRecorder();
  const store = {
    listPoolOverview: () => Promise.resolve(items),
  } as unknown as AppendixPoolStore;
  const svc = new AppendicesService(blob, store, audit, new AlwaysExists());
  return { svc, audit, blob };
}

/** 以位元組解出邏輯列（跳過 BOM；CRLF／LF 皆接受）。 */
function linesOf(buf: Buffer): string[] {
  return buf.subarray(3).toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/);
}

describe('AppendicesService.exportPool（F039 AC-D4～AC-D11 附錄池匯出）', () => {
  describe('AC-D4 權限（匯出屬讀取類動作）', () => {
    it('ICSOPAdmin 與 SysAdmin 皆允許匯出', async () => {
      const { svc } = makeSvc([itemOf(0)]);
      await expect(svc.exportPool(ICSOP_ADMIN, {})).resolves.toBeDefined();
      await expect(svc.exportPool(SYS_ADMIN, {})).resolves.toBeDefined();
    });

    it.each(['Supervisor', 'DeptContact', 'User'])('%s → PERMISSION_DENIED，不產生任何檔案', async (roleCode) => {
      const { svc } = makeSvc([itemOf(0)]);
      await expect(svc.exportPool({ roleCode, accountId: 'x' }, {})).rejects.toThrow(
        'PERMISSION_DENIED',
      );
    });
  });

  describe('AC-D5 匯出範圍＝當前篩選之全部結果（非當前頁）', () => {
    const POOL = Array.from({ length: 120 }, (_, i) => itemOf(i));
    const excelCount = POOL.filter((p) => p.format === 'xlsx' || p.format === 'xls').length;

    it('未套用篩選 → 資料列＝全部 120 筆（＋1 列表頭），非當前頁之 50 筆', async () => {
      const { svc } = makeSvc(POOL);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(linesOf(csv)).toHaveLength(121);
    });

    it('格式篩選 excel → 僅含 format ∈ {xlsx, xls} 之列', async () => {
      const { svc } = makeSvc(POOL);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, { format: 'excel' });
      expect(linesOf(csv)).toHaveLength(excelCount + 1);
      expect(excelCount).toBeGreaterThan(50); // 確保本案確實大於一頁，否則測不到「非當前頁」
    });

    it('格式篩選 pdf → 僅含 format = pdf 之列', async () => {
      const { svc } = makeSvc(POOL);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, { format: 'pdf' });
      expect(linesOf(csv)).toHaveLength(POOL.filter((p) => p.format === 'pdf').length + 1);
    });

    it('關鍵字篩選比對附錄名稱（與 AC-16 同一語意）', async () => {
      const { svc } = makeSvc([
        itemOf(0, { name: '作業流程對照表.pdf' }),
        itemOf(1, { name: '名詞定義說明.xlsx' }),
      ]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, { q: '名詞' });
      const lines = linesOf(csv);
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('名詞定義說明.xlsx');
    });

    it('AC-D6 ④ 列序與 `listPoolOverview()` 之列序（畫面當前排序）一致', async () => {
      const items = [itemOf(0, { name: 'C.pdf' }), itemOf(1, { name: 'A.xlsx' }), itemOf(2, { name: 'B.xls' })];
      const { svc } = makeSvc(items);
      const lines = linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv);
      expect(lines[1].startsWith('C.pdf')).toBe(true);
      expect(lines[2].startsWith('A.xlsx')).toBe(true);
      expect(lines[3].startsWith('B.xls')).toBe(true);
    });
  });

  describe('AC-D6 CSV 格式與欄位', () => {
    it('① 位元組以 UTF-8 BOM（EF BB BF）開頭', async () => {
      const { svc } = makeSvc([itemOf(0)]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect([csv[0], csv[1], csv[2]]).toEqual([0xef, 0xbb, 0xbf]);
    });

    it('② 第 1 列表頭逐字為七欄（「操作」欄不匯出；「上傳者 / 上傳時間」拆為兩欄）', async () => {
      const { svc } = makeSvc([itemOf(0)]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(linesOf(csv)[0]).toBe(HEADER);
      expect(linesOf(csv)[0]).not.toContain('操作');
    });

    it('② 每筆資料列恰七個儲存格，且「附錄名稱」「上傳者」「關聯文件數」為畫面所見值', async () => {
      const { svc } = makeSvc([
        itemOf(0, { name: '名詞定義說明.pdf', uploadedByName: '陳彥廷', docCount: 3 }),
      ]);
      const cells = linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[1].split(',');
      expect(cells).toHaveLength(7);
      expect(cells[0]).toBe('名詞定義說明.pdf');
      expect(cells[3]).toBe('陳彥廷');
      expect(cells[5]).toBe('3');
      // 大小／上傳時間之字面格式未入 AC，只約束「非空」（見檔頭 📌）。
      expect(cells[2].trim()).not.toBe('');
      expect(cells[4].trim()).not.toBe('');
    });

    /**
     * 🔵 `AC-X2`：第 7 欄「關聯文件編號」＝關聯文件之 `documentNumber`，多份以**半形分號**相接、
     * 順序即 `documents` 之順序（＝管理頁展開列所見）。0 份 → **空儲存格**（非 `—`、非 `0`）。
     * 🔴 本組案子是「數 vs 哪幾份」之區分點：只驗 `關聯文件數` 的斷言在本欄錯漏時仍會全綠。
     */
    it('🔵 AC-X2 多份關聯 → 第 7 欄以 `;` 相接，順序與 documents 一致', async () => {
      const { svc } = makeSvc([
        itemOf(0, {
          docCount: 2,
          documents: [
            { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' },
            { id: 'd2', documentNumber: 'ICSOP-SRC-102-2-03', documentName: '對保作業' },
          ],
        }),
      ]);
      const cells = linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[1].split(',');
      expect(cells[6]).toBe('ICSOP-SRC-101-1-01;ICSOP-SRC-102-2-03');
    });

    it('🔵 AC-X2 單份關聯 → 第 7 欄為該編號本身（不附分隔符）', async () => {
      const { svc } = makeSvc([
        itemOf(0, {
          docCount: 1,
          documents: [{ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: 'x' }],
        }),
      ]);
      expect(linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[1].split(',')[6]).toBe(
        'ICSOP-SRC-101-1-01',
      );
    });

    it('🔵 AC-X2 0 份關聯 → 第 7 欄為**空儲存格**（非 `—`、非 `0`）', async () => {
      const { svc } = makeSvc([itemOf(0, { docCount: 0, documents: [] })]);
      const cells = linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[1].split(',');
      expect(cells[6]).toBe('');
      expect(cells).toHaveLength(7); // 末欄為空仍須佔位，不得整欄消失
    });

    it('③ 含 `,`／`"` 之附錄名稱依 RFC 4180 包覆逸出', async () => {
      const { svc } = makeSvc([itemOf(0, { name: '對照表,「A"B」.pdf' })]);
      const line = linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[1];
      expect(line.startsWith('"對照表,「A""B」.pdf"')).toBe(true);
    });
  });

  describe('AC-D11 CSV 注入防護（值層期望值＝畫面字串經規則轉換後之結果）', () => {
    it("名稱以 `=` 開頭 → 儲存格值為 `'=…`（前綴在 RFC 4180 包覆之前）", async () => {
      const { svc } = makeSvc([itemOf(0, { name: "=cmd|'/c calc'!A1" })]);
      expect(linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[1].startsWith("'=cmd")).toBe(true);
    });

    it.each(['+1', '-1', '@x'])('名稱以 %s 開頭 → 同樣加前綴', async (name) => {
      const { svc } = makeSvc([itemOf(0, { name })]);
      expect(linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[1].startsWith(`'${name}`)).toBe(true);
    });

    it('名稱為 `作業對照表`（不以六種字元開頭）→ **不加任何前綴**（恆等）', async () => {
      const { svc } = makeSvc([itemOf(0, { name: '作業對照表' })]);
      expect(linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[1].startsWith('作業對照表,')).toBe(
        true,
      );
    });

    it('🔒 表頭列不套用本規則（AC-D6 ② 之逐字表頭不受影響）', async () => {
      const { svc } = makeSvc([itemOf(0, { name: '=x' })]);
      expect(linesOf((await svc.exportPool(ICSOP_ADMIN, {})).csv)[0]).toBe(HEADER);
    });
  });

  describe('AC-D8 匯出筆數上限（不產生任何檔案）', () => {
    it('10,001 筆 → 400 `EXPORT_ROW_LIMIT_EXCEEDED`', async () => {
      const { svc } = makeSvc(Array.from({ length: 10_001 }, (_, i) => itemOf(i)));
      await expect(svc.exportPool(ICSOP_ADMIN, {})).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    });

    it('恰 10,000 筆 → 匯出成功（邊界值含）', async () => {
      const { svc } = makeSvc(Array.from({ length: 10_000 }, (_, i) => itemOf(i)));
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(linesOf(csv)).toHaveLength(10_001);
    });
  });

  describe('AC-D9 空結果 ＋ AC-D7 檔名 ＋ 不寫稽核', () => {
    it('AC-D9 0 筆 → 僅含表頭列之 CSV（非錯誤、非空檔）', async () => {
      const { svc } = makeSvc([]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(linesOf(csv)).toEqual([HEADER]);
      expect(csv.length).toBeGreaterThan(3);
    });

    it('AC-D7 檔名形狀為 `appendices_{YYYYMMDD}_{HHmmss}.csv`', async () => {
      const { svc } = makeSvc([itemOf(0)]);
      const { fileName } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(fileName).toMatch(/^appendices_\d{8}_\d{6}\.csv$/);
    });

    it('🔒 匯出**不寫稽核**（管理存取，比照後台下載；端點表明訂）', async () => {
      const { svc, audit } = makeSvc([itemOf(0)]);
      await svc.exportPool(ICSOP_ADMIN, {});
      expect(audit.events).toHaveLength(0);
    });
  });
});

// ── 路由 metadata（名稱不敏感：以路徑字面定位 handler）──────────────────

describe('AppendicesController 匯出路由 metadata（F039 端點表；§10.15 盲區 #8）', () => {
  /** 以 `@Get(path)` 之路徑字面定位 handler，避免把 handler 名稱寫死。 */
  function handlerByPath(path: string): ((...args: unknown[]) => unknown) | undefined {
    const proto = AppendicesController.prototype as unknown as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      const h = proto[key];
      if (typeof h !== 'function') continue;
      if (Reflect.getMetadata(PATH_METADATA, h) === path) {
        return h as (...args: unknown[]) => unknown;
      }
    }
    return undefined;
  }

  it('存在 `GET admin/appendices/export`', () => {
    const h = handlerByPath('admin/appendices/export');
    expect(h).toBeDefined();
    expect(Reflect.getMetadata(METHOD_METADATA, h as object)).toBe(RequestMethod.GET);
  });

  it('AC-D4 閘門為 `附錄管理` read；逐角色解析＝ICSOPAdmin／SysAdmin 允許、其餘三角色拒絕', () => {
    const h = handlerByPath('admin/appendices/export');
    const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, h as object) as RequiredPermission;
    expect(meta.functionKey).toBe(FunctionKey.APPENDIX_MANAGEMENT);
    expect(meta.action).toBe('read');
    expect(canPerform('ICSOPAdmin', meta.functionKey, meta.action)).toBe(true);
    expect(canPerform('SysAdmin', meta.functionKey, meta.action)).toBe(true);
    for (const role of ['Supervisor', 'DeptContact', 'User']) {
      expect(canPerform(role, meta.functionKey, meta.action)).toBe(false);
    }
  });

  it('🔒 匯出路徑不與 `admin/appendices/:appendixId/download` 互相遮蔽（字面不同）', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AppendicesController.prototype.downloadFromPool),
    ).toBe('admin/appendices/:appendixId/download');
  });
});
