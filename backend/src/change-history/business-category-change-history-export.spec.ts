/**
 * F043 業務/功能類別管理 — BusinessCategoryChangeHistoryService.exportChanges（§戊 AC-42 匯出）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-42
 *      ＋ docs/specs/error-handling.md#export（六處共用規則之權威）
 *      ＋ docs/specs/architecture-spec.md §14.1（`business-category-display-names.ts`：CSV「業務/功能
 *        類別」欄取當前顯示名稱之獨立唯讀 adapter，理由同 `lifecycle-display-names.ts`）。
 * 僅讀取既有 `change-history-export.service.spec.ts` 之 F038 循環樹狀圖 tab 區塊以沿用其
 * COUNT-下推／take 上界／注入防護之既有測試慣例（非決定本功能行為——七個列舉字面取自 AC-39）。
 *
 * ⚠ 對實作全盲：`./business-category-change-history.service` 尚不存在。
 */
import { AuditAccessEvent } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import { BusinessCategoryChangeHistoryService } from './business-category-change-history.service';
import { BusinessCategoryChangeLogRow, BusinessCategoryChangeLogStore } from './business-category-change-log.store';

const T0 = new Date('2026-09-02T06:32:08.000Z'); // → 2026-09-02 14:32:08（UTC+8）

const ACTOR = {
  accountId: 'acc-1',
  name: '李慧玲',
  employeeNo: '20233',
  company: '和潤企業股份有限公司',
  department: '債權管理部',
  section: '法催一室',
  roleCode: 'ICSOPAdmin',
};

class FakeAudit {
  events: AuditAccessEvent[] = [];
  recordAccess(e: AuditAccessEvent): Promise<void> {
    this.events.push(e);
    return Promise.resolve();
  }
}

function linesOf(buf: Buffer): string[] {
  return buf.subarray(3).toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/);
}

const BC_HEADER = '業務/功能類別,變更類型,變更摘要,操作人,時間';
const TREE_HEADER = '循環別,變更類型,變更摘要,操作人,時間';
const DOC_HEADER = '程序書編號,程序書書名,變更欄位,舊值,新值,來源,操作人,時間';

function bcRow(over: Partial<BusinessCategoryChangeLogRow> = {}): BusinessCategoryChangeLogRow {
  return {
    id: 'bcl1',
    businessCategoryId: 'BC-CREDIT',
    changeType: 'DOCUMENT_MOUNTED',
    summary: '新增掛載『ICSOP-SRC-101』',
    oldValue: null,
    newValue: 'ICSOP-SRC-101',
    nodeId: 'n1',
    actorId: 'a1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    occurredAt: new Date('2026-09-02T14:32:04.000Z'),
    ...over,
  };
}

function makeSvc(rows: BusinessCategoryChangeLogRow[], displayNames: Record<string, string> = {}) {
  const calls = { listAll: 0, count: 0, list: 0, lastTake: -1 };
  const store = {
    listAll: () => {
      calls.listAll += 1;
      return Promise.resolve(rows);
    },
    listByBusinessCategory: () => Promise.resolve(rows),
    append: () => Promise.resolve(),
    findById: () => Promise.resolve(null),
    findPredecessor: () => Promise.resolve(null),
    countByFilters: () => {
      calls.count += 1;
      return Promise.resolve(rows.length);
    },
    listByFilters: (_f: unknown, take: number) => {
      calls.list += 1;
      calls.lastTake = take;
      return Promise.resolve(rows.slice(0, take));
    },
  } as unknown as BusinessCategoryChangeLogStore;

  const audit = new FakeAudit();
  const names = {
    findDisplayNamesByIds: (ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, displayNames[id] ?? '授信（消金）']))),
  };
  const svc = new BusinessCategoryChangeHistoryService(store, audit as unknown as AuditWriterService, () => T0, names);
  return { svc, calls, audit };
}

describe('BusinessCategoryChangeHistoryService.exportChanges（F043 AC-42）', () => {
  it('BOM；第 1 列表頭逐字為五欄（沿用循環樹狀圖 tab 之欄位結構，第三個 tab 同構）', async () => {
    const { svc } = makeSvc([bcRow()]);
    const { csv } = await svc.exportChanges({}, ACTOR);
    expect([csv[0], csv[1], csv[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(linesOf(csv)[0]).toBe(BC_HEADER);
  });

  it('與另兩個 tab 之表頭互不相同（三個 tab 各自匯出，不合併）', async () => {
    const { svc } = makeSvc([bcRow()]);
    const header = linesOf((await svc.exportChanges({}, ACTOR)).csv)[0];
    expect(header).not.toBe(TREE_HEADER);
    expect(header).not.toBe(DOC_HEADER);
  });

  it('「業務/功能類別」欄之值＝以 businessCategoryId join 取當前顯示值（非快照、非裸 id）', async () => {
    const { svc } = makeSvc([bcRow({ businessCategoryId: 'BC-CREDIT' })], { 'BC-CREDIT': '授信（企金）' });
    const cells = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1].split(',');
    expect(cells).toHaveLength(5);
    expect(cells[0]).toBe('授信（企金）');
    expect(cells[0]).not.toBe('BC-CREDIT');
  });

  it('🔴 AC-39／AC-42：「變更類型」欄輸出中文標籤，不得輸出列舉代碼；新增掛載／移除掛載 為兩個相異儲存格值', async () => {
    const { svc } = makeSvc([
      bcRow({ id: 'r1', changeType: 'DOCUMENT_MOUNTED', occurredAt: new Date('2026-09-02T14:00:00Z') }),
      bcRow({ id: 'r2', changeType: 'DOCUMENT_UNMOUNTED', occurredAt: new Date('2026-09-02T13:00:00Z') }),
    ]);
    const lines = linesOf((await svc.exportChanges({}, ACTOR)).csv).slice(1);
    const typeCol = (line: string) => line.split(',')[1];
    expect(typeCol(lines[0])).toBe('新增掛載');
    expect(typeCol(lines[1])).toBe('移除掛載');
    expect(typeCol(lines[0])).not.toBe(typeCol(lines[1]));
    expect(typeCol(lines[0])).not.toBe('DOCUMENT_MOUNTED');
    expect(typeCol(lines[0])).not.toBe('文件掛載變更');
  });

  it('七種 changeType 逐一輸出對應之逐字標籤（AC-39 表）', async () => {
    const TYPES: Array<[BusinessCategoryChangeLogRow['changeType'], string]> = [
      ['NODE_ADDED', '新增節點'],
      ['NODE_REMOVED', '移除節點'],
      ['NODE_RENAMED', '節點改名'],
      ['EDGE_ADDED', '新增連線'],
      ['EDGE_REMOVED', '移除連線'],
      ['DOCUMENT_MOUNTED', '新增掛載'],
      ['DOCUMENT_UNMOUNTED', '移除掛載'],
    ];
    const rows = TYPES.map(([t], i) => bcRow({ id: `r${i}`, changeType: t, occurredAt: new Date(2026, 8, 2, 10, i) }));
    const { svc } = makeSvc(rows);
    const lines = linesOf((await svc.exportChanges({}, ACTOR)).csv).slice(1);
    const byType = new Map(lines.map((l) => [l.split(',')[1], l]));
    for (const [, label] of TYPES) {
      expect(byType.has(label)).toBe(true);
    }
    expect(byType.size).toBe(7); // 七個字面兩兩相異，映射後仍為 7 個相異鍵
  });

  it('範圍＝全部事件；列序時間新到舊', async () => {
    const { svc } = makeSvc([
      bcRow({ id: 'old', summary: 'OLD', occurredAt: new Date('2026-09-01T00:00:00Z') }),
      bcRow({ id: 'new', summary: 'NEW', occurredAt: new Date('2026-09-02T00:00:00Z') }),
    ]);
    const lines = linesOf((await svc.exportChanges({}, ACTOR)).csv);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('NEW');
    expect(lines[2]).toContain('OLD');
  });

  it('檔名形狀為 business_category_change_history_{YYYYMMDD}_{HHmmss}.csv', async () => {
    const { svc } = makeSvc([bcRow()]);
    expect((await svc.exportChanges({}, ACTOR)).fileName).toBe(
      'business_category_change_history_20260902_143208.csv',
    );
  });

  it('匯出記一筆 BUSINESS_CATEGORY_CHANGELOG_VIEW（比照循環側 tab 之既有先例，非 DOWNLOAD）', async () => {
    const { svc, audit } = makeSvc([bcRow()]);
    await svc.exportChanges({}, ACTOR);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].actionType).toBe('BUSINESS_CATEGORY_CHANGELOG_VIEW');
  });

  it('🔒 10,001 筆 → EXPORT_ROW_LIMIT_EXCEEDED；恰 10,000 通過（既有共用碼，不新增）', async () => {
    const over = makeSvc(Array.from({ length: 10_001 }, (_, i) => bcRow({ id: `x${i}` })));
    await expect(over.svc.exportChanges({}, ACTOR)).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    const exact = makeSvc(Array.from({ length: 10_000 }, (_, i) => bcRow({ id: `x${i}` })));
    expect(linesOf((await exact.svc.exportChanges({}, ACTOR)).csv)).toHaveLength(10_001);
  });

  it('🔴 COUNT 下推：超限時不呼叫 listAll()／listByFilters()，正常路徑 take 上界為 10001', async () => {
    const over = makeSvc(Array.from({ length: 10_001 }, (_, i) => bcRow({ id: `x${i}` })));
    await expect(over.svc.exportChanges({}, ACTOR)).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    expect(over.calls.count).toBe(1);
    expect(over.calls.list).toBe(0);
    expect(over.calls.listAll).toBe(0);

    const ok = makeSvc([bcRow()]);
    await ok.svc.exportChanges({}, ACTOR);
    expect(ok.calls.listAll).toBe(0);
    expect(ok.calls.lastTake).toBe(10_001);
  });

  it('空結果 → 僅含表頭列之 CSV（0 筆非錯誤）', async () => {
    const { svc } = makeSvc([]);
    expect(linesOf((await svc.exportChanges({}, ACTOR)).csv)).toEqual([BC_HEADER]);
  });

  it('注入防護：「變更摘要」／「業務/功能類別」以危險字元開頭者加前綴；否則恆等', async () => {
    const { svc } = makeSvc([bcRow({ summary: '=cmd|A1' })], { 'BC-CREDIT': '+授信' });
    const line = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1];
    expect(line).toContain("'+授信");
    expect(line).toContain("'=cmd|A1");

    const plain = makeSvc([bcRow({ summary: '新增掛載' })], { 'BC-CREDIT': '授信' });
    const l2 = linesOf((await plain.svc.exportChanges({}, ACTOR)).csv)[1];
    expect(l2.startsWith('授信,')).toBe(true);
    expect(l2).not.toContain("'");
  });

  it('🔒 不新增任何錯誤碼（沿用 EXPORT_ROW_LIMIT_EXCEEDED／VALIDATION_ERROR／PERMISSION_DENIED）', async () => {
    // 消極斷言之正向對照組：確實存在會拋錯之路徑（見上方 10,001 筆案），此處僅鎖定訊息字面。
    const over = makeSvc(Array.from({ length: 10_001 }, (_, i) => bcRow({ id: `x${i}` })));
    await expect(over.svc.exportChanges({}, ACTOR)).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    await expect(over.svc.exportChanges({}, ACTOR)).rejects.not.toThrow('BUSINESS_CATEGORY_EXPORT_ROW_LIMIT_EXCEEDED');
  });
});
