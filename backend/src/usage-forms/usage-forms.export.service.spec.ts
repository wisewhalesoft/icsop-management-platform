import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { UsageFormsController } from './usage-forms.controller';
import { UsageFormsService } from './usage-forms.service';
import {
  AuditRecorder,
  FormPoolStore,
  OrgUnitLister,
  OrgUnitLite,
  UsageFormAuditEvent,
  UsageFormPoolItem,
} from './usage-forms.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { SessionContext } from '../attachments/attachments.service';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey, canPerform } from '../rbac/function-matrix';

/**
 * 🔵 F018 表單池匯出（CSV）——2026-08-27 使用者裁決 `AC-X4`～`AC-X9`。
 *
 * 權威：
 *  - `AC-X4`（九欄之逐字表頭與相對順序）／`AC-X2`（末欄「關聯文件編號」，半形分號相接）
 *  - `AC-X5`（制定部門欄之值＝畫面所見之祖鏈路徑；解析不到 → 退回代碼本身）
 *  - `AC-X6`（端點 `GET /admin/usage-forms/export`，功能 `使用表單管理` read，**不寫稽核**）
 *  - `AC-X7`（範圍＝當前篩選之**全部結果**，非當前頁）
 *  - `AC-X8`（>10,000 → 400 `EXPORT_ROW_LIMIT_EXCEEDED`，不產生任何檔案；恰 10,000 通過）
 *  - `AC-X9`（0 筆 → 僅含表頭列；檔名 `usage-forms_{YYYYMMDD}_{HHmmss}.csv`；BOM／RFC 4180／注入前綴）
 *  - architecture-spec §10.4（共用產生器＝`storage/csv-export.ts`；與 F039 附錄匯出逐條同型）
 *
 * 📌 本檔**不對 `大小`／`上傳時間` 兩欄之值層字面格式做逐字斷言**——比照 F039 匯出環之同段
 *    決定（AC 只逐字規定表頭；該兩欄之字面樣式未入 AC），不臆造期望值。
 */

const ICSOP_ADMIN: SessionContext & { companyCode?: string } = {
  roleCode: 'ICSOPAdmin',
  accountId: 'admin-1',
  companyCode: 'AS',
};
const SYS_ADMIN: SessionContext & { companyCode?: string } = {
  roleCode: 'SysAdmin',
  accountId: 'sys-1',
  companyCode: 'AS',
};

const HEADER = '表單編號,表單名稱,制定部門,格式,大小,上傳者,上傳時間,關聯文件數,關聯文件編號';

class FakeAuditRecorder implements AuditRecorder {
  events: UsageFormAuditEvent[] = [];
  record(e: UsageFormAuditEvent): void {
    this.events.push(e);
  }
}

/** 一小片真實形狀之組織主檔（AS）：Root → 本部 → 部 → 處室。 */
const AS_UNITS: OrgUnitLite[] = [
  { orgCode: '00000', parentCode: null, name: '和潤企業' },
  { orgCode: 'J0000', parentCode: '00000', name: '營運本部' },
  { orgCode: 'JA000', parentCode: 'J0000', name: '營運管理部' },
  { orgCode: 'JA100', parentCode: 'JA000', name: '審查室' },
];

class FakeOrgUnitLister implements OrgUnitLister {
  calls: string[] = [];
  constructor(private readonly units: OrgUnitLite[] = AS_UNITS) {}
  listOrgUnits(companyCode: string): Promise<OrgUnitLite[]> {
    this.calls.push(companyCode);
    return Promise.resolve(this.units);
  }
}

function itemOf(i: number, over: Partial<UsageFormPoolItem> = {}): UsageFormPoolItem {
  const format = i % 3 === 0 ? 'pdf' : i % 3 === 1 ? 'xlsx' : 'xls';
  return {
    id: `uf-${i}`,
    name: `表單-${i}`,
    formNumber: `FM-${String(i).padStart(3, '0')}`,
    format,
    size: 1024 * (i + 1),
    blobPath: `usage-forms/uf-${i}.${format}`,
    uploadedBy: 'acct-1',
    uploadedByName: '李慧玲',
    uploadedAt: new Date('2026-06-10T00:00:00Z'),
    docCount: 0,
    documents: [],
    draftingDeptCodes: [],
    ...over,
  } as UsageFormPoolItem;
}

/** 依序回傳指定總覽列（列序即「畫面當前排序」）。 */
function makeSvc(items: UsageFormPoolItem[], lister?: OrgUnitLister) {
  const blob = new FakeBlobStore();
  const audit = new FakeAuditRecorder();
  /**
   * 🔴 `listDraftingDeptsByForms` **必須提供**：`exportPool()` 與清單頁走同一條富化路徑
   * （`enrichDraftingDepts`），該路徑會以 store 之回傳**覆寫**每列的 `draftingDeptCodes`。
   * 替身若省略此方法，fixture 上直接設定的制定部門會被一律覆寫為空陣列 —— 測試會綠得
   * 莫名其妙（第 3 欄恆為空），且與正式環境（store 有此方法）行為不同。
   */
  const store = {
    listPoolOverview: () => Promise.resolve(items),
    listDraftingDeptsByForms: (formIds: string[]) =>
      Promise.resolve(
        new Map(
          formIds.map((id) => [id, items.find((it) => it.id === id)?.draftingDeptCodes ?? []]),
        ),
      ),
  } as unknown as FormPoolStore;
  const svc = new UsageFormsService(blob, store, audit, undefined, undefined, undefined, lister);
  return { svc, audit, blob };
}

/** 以位元組解出邏輯列（跳過 BOM；CRLF／LF 皆接受）。 */
function linesOf(buf: Buffer): string[] {
  return buf
    .subarray(3)
    .toString('utf8')
    .replace(/\r?\n$/, '')
    .split(/\r?\n/);
}

/** 資料列之儲存格（本檔之期望值皆刻意避開逗號，故可直接以逗號切格）。 */
function cellsOf(csv: Buffer, row = 1): string[] {
  return linesOf(csv)[row].split(',');
}

describe('UsageFormsService.exportPool（AC-X4～AC-X9 表單池匯出）', () => {
  describe('AC-X6 權限（匯出屬讀取類動作）', () => {
    it('ICSOPAdmin 與 SysAdmin 皆允許匯出', async () => {
      const { svc } = makeSvc([itemOf(0)]);
      await expect(svc.exportPool(ICSOP_ADMIN, {})).resolves.toBeDefined();
      await expect(svc.exportPool(SYS_ADMIN, {})).resolves.toBeDefined();
    });

    it.each(['Supervisor', 'DeptContact', 'User'])(
      '%s → PERMISSION_DENIED，不產生任何檔案',
      async (roleCode) => {
        const { svc } = makeSvc([itemOf(0)]);
        await expect(svc.exportPool({ roleCode, accountId: 'x' }, {})).rejects.toThrow(
          'PERMISSION_DENIED',
        );
      },
    );
  });

  describe('AC-X7 匯出範圍＝當前篩選之全部結果（非當前頁）', () => {
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

    it('關鍵字篩選比對**表單名稱**（與清單頁 rows 之 filter 同一語意）', async () => {
      const { svc } = makeSvc([itemOf(0, { name: '放款覆核表' }), itemOf(1, { name: '進件申請書' })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, { q: '進件' });
      const lines = linesOf(csv);
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('進件申請書');
    });

    it('列序與 `listPoolOverview()` 之列序（畫面當前排序）一致', async () => {
      const items = [itemOf(0, { name: 'C' }), itemOf(1, { name: 'A' }), itemOf(2, { name: 'B' })];
      const { svc } = makeSvc(items);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect([cellsOf(csv, 1)[1], cellsOf(csv, 2)[1], cellsOf(csv, 3)[1]]).toEqual(['C', 'A', 'B']);
    });
  });

  describe('AC-X4 CSV 格式與欄位', () => {
    it('① 位元組以 UTF-8 BOM（EF BB BF）開頭', async () => {
      const { svc } = makeSvc([itemOf(0)]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect([csv[0], csv[1], csv[2]]).toEqual([0xef, 0xbb, 0xbf]);
    });

    it('② 第 1 列表頭逐字為九欄（「操作」欄不匯出；「上傳者 / 上傳時間」拆為兩欄）', async () => {
      const { svc } = makeSvc([itemOf(0)]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(linesOf(csv)[0]).toBe(HEADER);
      expect(linesOf(csv)[0]).not.toContain('操作');
    });

    it('② 每筆資料列恰九個儲存格，且各欄為畫面所見值', async () => {
      const { svc } = makeSvc([
        itemOf(0, {
          formNumber: 'FM-007',
          name: '放款覆核表',
          uploadedByName: '陳彥廷',
          docCount: 3,
        }),
      ]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      const cells = cellsOf(csv);
      expect(cells).toHaveLength(9);
      expect(cells[0]).toBe('FM-007');
      expect(cells[1]).toBe('放款覆核表');
      expect(cells[3]).toBe('pdf');
      expect(cells[5]).toBe('陳彥廷');
      expect(cells[7]).toBe('3');
      // 大小／上傳時間之字面格式未入 AC，只約束「非空」（見檔頭 📌）。
      expect(cells[4].trim()).not.toBe('');
      expect(cells[6].trim()).not.toBe('');
    });

    it('② 表單編號未設定（null）→ 第 1 欄為空儲存格（不得輸出字面 `null`）', async () => {
      const { svc } = makeSvc([itemOf(0, { formNumber: null })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[0]).toBe('');
    });

    it('③ 含逗號／雙引號之表單名稱依 RFC 4180 包覆逸出', async () => {
      const { svc } = makeSvc([itemOf(0, { name: '覆核表,「A"B」' })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(linesOf(csv)[1]).toContain('"覆核表,「A""B」"');
    });
  });

  describe('🔵 AC-X2 關聯文件編號（第 9 欄）', () => {
    it('多份關聯 → 以半形分號相接，順序與 documents 一致', async () => {
      const { svc } = makeSvc([
        itemOf(0, {
          docCount: 2,
          documents: [
            { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' },
            { id: 'd2', documentNumber: 'ICSOP-SRC-102-2-03', documentName: '對保作業' },
          ],
        }),
      ]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[8]).toBe('ICSOP-SRC-101-1-01;ICSOP-SRC-102-2-03');
    });

    it('0 份關聯 → 空儲存格（非 `—`、非 `0`），且末欄仍佔位', async () => {
      const { svc } = makeSvc([itemOf(0, { docCount: 0, documents: [] })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[8]).toBe('');
      expect(cellsOf(csv)).toHaveLength(9);
    });
  });

  describe('🔵 AC-X5 制定部門（第 3 欄）＝畫面所見之祖鏈路徑', () => {
    it('單筆 → 自 Root 起之祖鏈，各層以 ` / ` 相接（與前端 orgPathLabel 逐字同形）', async () => {
      const { svc } = makeSvc([itemOf(0, { draftingDeptCodes: ['JA100'] })], new FakeOrgUnitLister());
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[2]).toBe('和潤企業 / 營運本部 / 營運管理部 / 審查室');
    });

    it('多筆 → 以**全形頓號**相接（與清單頁儲存格逐字相同）', async () => {
      const { svc } = makeSvc(
        [itemOf(0, { draftingDeptCodes: ['JA000', 'JA100'] })],
        new FakeOrgUnitLister(),
      );
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[2]).toBe(
        '和潤企業 / 營運本部 / 營運管理部、和潤企業 / 營運本部 / 營運管理部 / 審查室',
      );
    });

    it('0 筆 → **空儲存格**（非畫面之 `—`；`—` 落到 CSV 會被試算表當成一個資料值）', async () => {
      const { svc } = makeSvc([itemOf(0, { draftingDeptCodes: [] })], new FakeOrgUnitLister());
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[2]).toBe('');
    });

    it('主檔查無該代碼 → 退回**代碼本身**（與前端 fallback 逐字一致，不顯示 undefined）', async () => {
      const { svc } = makeSvc([itemOf(0, { draftingDeptCodes: ['ZZ999'] })], new FakeOrgUnitLister());
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[2]).toBe('ZZ999');
    });

    it('🔴 未注入 lister → 退回代碼本身，匯出**不中斷**（讀取路徑不因主檔查詢缺席而失敗）', async () => {
      const { svc } = makeSvc([itemOf(0, { draftingDeptCodes: ['JA100'] })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[2]).toBe('JA100');
    });

    it('🔴 lister 拋錯 → 退回代碼本身，匯出**不中斷**', async () => {
      const boom: OrgUnitLister = { listOrgUnits: () => Promise.reject(new Error('DB down')) };
      const { svc } = makeSvc([itemOf(0, { draftingDeptCodes: ['JA100'] })], boom);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[2]).toBe('JA100');
    });

    it('🔴 以**操作者 session 之公司**查組織主檔（跨公司同代碼是不同單位）', async () => {
      const lister = new FakeOrgUnitLister();
      const { svc } = makeSvc([itemOf(0, { draftingDeptCodes: ['JA100'] })], lister);
      await svc.exportPool({ ...ICSOP_ADMIN, companyCode: 'AD' }, {});
      expect(lister.calls).toEqual(['AD']);
    });

    it('🔴 效能：整份匯出只查一次組織主檔（逐列查表為 O(1)，不得 N+1）', async () => {
      const lister = new FakeOrgUnitLister();
      const rows = Array.from({ length: 30 }, (_, i) => itemOf(i, { draftingDeptCodes: ['JA100'] }));
      const { svc } = makeSvc(rows, lister);
      await svc.exportPool(ICSOP_ADMIN, {});
      expect(lister.calls).toHaveLength(1);
    });

    it('全部列皆無制定部門 → **完全不查**組織主檔（省一次無謂查詢）', async () => {
      const lister = new FakeOrgUnitLister();
      const { svc } = makeSvc([itemOf(0), itemOf(1)], lister);
      await svc.exportPool(ICSOP_ADMIN, {});
      expect(lister.calls).toHaveLength(0);
    });
  });

  describe('AC-X9 CSV 注入防護（值層期望值＝畫面字串經規則轉換後之結果）', () => {
    it('名稱以 `=` 開頭 → 儲存格值加單引號前綴（前綴在 RFC 4180 包覆之前）', async () => {
      const { svc } = makeSvc([itemOf(0, { name: '=1+1' })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[1]).toBe("'=1+1");
    });

    it.each(['+1', '-1', '@x'])('名稱以 %s 開頭 → 同樣加前綴', async (name) => {
      const { svc } = makeSvc([itemOf(0, { name })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[1]).toBe(`'${name}`);
    });

    it('名稱為 `放款覆核表`（不以六種字元開頭）→ **不加任何前綴**（恆等）', async () => {
      const { svc } = makeSvc([itemOf(0, { name: '放款覆核表' })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(cellsOf(csv)[1]).toBe('放款覆核表');
    });

    it('🔒 表頭列不套用本規則（逐字表頭不受影響）', async () => {
      const { svc } = makeSvc([itemOf(0, { name: '=x' })]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(linesOf(csv)[0]).toBe(HEADER);
    });
  });

  describe('AC-X8 匯出筆數上限（不產生任何檔案）', () => {
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

  describe('AC-X9 空結果 ＋ 檔名 ＋ 不寫稽核', () => {
    it('0 筆 → 僅含表頭列之 CSV（非錯誤、非空檔）', async () => {
      const { svc } = makeSvc([]);
      const { csv } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(linesOf(csv)).toEqual([HEADER]);
      expect(csv.length).toBeGreaterThan(3);
    });

    it('檔名形狀為 `usage-forms_{YYYYMMDD}_{HHmmss}.csv`', async () => {
      const { svc } = makeSvc([itemOf(0)]);
      const { fileName } = await svc.exportPool(ICSOP_ADMIN, {});
      expect(fileName).toMatch(/^usage-forms_\d{8}_\d{6}\.csv$/);
    });

    it('🔒 匯出**不寫稽核**（管理存取，比照後台下載；與 F039 逐條同型）', async () => {
      const { svc, audit } = makeSvc([itemOf(0)]);
      await svc.exportPool(ICSOP_ADMIN, {});
      expect(audit.events).toHaveLength(0);
    });

    it('🔒 匯出**不寫任何 blob**', async () => {
      const { svc, blob } = makeSvc([itemOf(0)]);
      await svc.exportPool(ICSOP_ADMIN, {});
      expect(blob.putCalls).toHaveLength(0);
    });
  });
});

// ── 路由 metadata（名稱不敏感：以路徑字面定位 handler）──────────────────

describe('UsageFormsController 匯出路由 metadata（AC-X6 端點表）', () => {
  /** 以 `@Get(path)` 之路徑字面定位 handler，避免把 handler 名稱寫死。 */
  function handlerByPath(path: string): ((...args: unknown[]) => unknown) | undefined {
    const proto = UsageFormsController.prototype as unknown as Record<string, unknown>;
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

  /** controller 上各 handler 之 `@Get/@Post/...` 路徑，依**宣告順序**。 */
  function declaredPaths(): string[] {
    const proto = UsageFormsController.prototype as unknown as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
      .filter((k) => k !== 'constructor' && typeof proto[k] === 'function')
      .map((k) => Reflect.getMetadata(PATH_METADATA, proto[k] as object) as string | undefined)
      .filter((p): p is string => typeof p === 'string');
  }

  it('存在 `GET admin/usage-forms/export`', () => {
    const h = handlerByPath('admin/usage-forms/export');
    expect(h).toBeDefined();
    expect(Reflect.getMetadata(METHOD_METADATA, h as object)).toBe(RequestMethod.GET);
  });

  it('AC-X6 閘門為 `使用表單管理` read；逐角色解析＝ICSOPAdmin／SysAdmin 允許、其餘三角色拒絕', () => {
    const h = handlerByPath('admin/usage-forms/export');
    const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, h as object) as RequiredPermission;
    expect(meta.functionKey).toBe(FunctionKey.USAGE_FORM_MANAGEMENT);
    expect(meta.action).toBe('read');
    expect(canPerform('ICSOPAdmin', meta.functionKey, meta.action)).toBe(true);
    expect(canPerform('SysAdmin', meta.functionKey, meta.action)).toBe(true);
    for (const role of ['Supervisor', 'DeptContact', 'User']) {
      expect(canPerform(role, meta.functionKey, meta.action)).toBe(false);
    }
  });

  /**
   * 🔴 匯出路徑必須宣告於 `:formId` 系列**之前**——Nest 依宣告順序比對，參數路由若先宣告
   * 會把固定段 `export` 吃成 `:formId`（F039 之同段註記記錄了同型陷阱）。
   */
  it('🔒 `admin/usage-forms/export` 宣告於任何 `admin/usage-forms/:formId…` 路由之前', () => {
    const paths = declaredPaths();
    const exportIdx = paths.indexOf('admin/usage-forms/export');
    const firstParamIdx = paths.findIndex((p) => p.startsWith('admin/usage-forms/:formId'));
    expect(exportIdx).toBeGreaterThanOrEqual(0);
    expect(firstParamIdx).toBeGreaterThanOrEqual(0);
    expect(exportIdx).toBeLessThan(firstParamIdx);
  });
});
