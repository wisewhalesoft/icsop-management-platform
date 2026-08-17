import { DocumentChangeHistoryService, ChangeHistoryActor } from './document-change-history.service';
import { LifecycleChangeHistoryService } from './lifecycle-change-history.service';
import { DocumentChangeLogRow, DocumentChangeLogStore } from './document-change-log.store';
import { LifecycleChangeLogRow, LifecycleChangeLogStore } from './lifecycle-change-log.store';
import { DocumentNameLookup } from './document-name-lookup';
import { AuditWriterService } from '../audit/audit-writer.service';

/**
 * F037／F038 變更歷程兩 tab 各自匯出（CSV）—— Lane L5（缺失 delta #16）。
 *
 * 權威：
 *  - F037 `AC-D1`～`AC-D9`（範圍／格式／上限／檔名／權限／稽核／空結果／不外溢／注入防護）
 *  - F038 `AC-D1`／`AC-D2`／`AC-D4`／`AC-D5`（兩 tab 各自匯出、不合併；循環別取當前值非快照）
 *  - `error-handling.md#export`（三處共用之唯一規則來源）
 *  - architecture-spec §10.4 ④ ＋ §10.16 風險 D2：
 *    🔴「兩張變更日誌表是 append-only 且單調成長，全表載入是本 delta 中**唯一有真實 OOM 風險**之處」
 *    ⇒ 匯出必須 **① SQL `COUNT(*)` 下推**（> 10,000 立即 400，**不執行 SELECT**）
 *      **② `SELECT TOP 10001`**（競態第二道）。本 repo 已於 F024 踩過同型全表載入 OOM。
 *
 * ⚠ 對實作全盲：`exportChanges()` 與 store 之 `countByFilters()`／`listByFilters()` 於本環撰寫時
 *    **尚不存在** —— 型別錯誤即為預期紅燈。
 *
 * 📌 **store 之兩個新方法名為本環所訂之契約**（§10.4 ④ 只規定「COUNT 下推 ＋ TOP 10001」，未定名）。
 *    若實作採不同命名／形狀，請走 mailbox 向 test-generator 申訴，由 test-generator 修改本檔。
 *    ⚠ 惟「匯出路徑**不得**呼叫 `listAll()`」此一斷言**不可協商** —— 它才是 D2 風險的真正守門者。
 *
 * 📌 **未逐字約束之欄**：F037 之 `變更欄位`／`來源` 兩欄，其值究竟為屬性名（`documentName`）或畫面
 *    所見之中文標籤（`程序書書名`／`編輯`），現行 AC 未定；本檔僅斷言「非空」並已登錄於
 *    `docs/test-specs/risks-and-gaps.md` 與交付報告之爭議清單，不臆造期望值。
 */

const DOC_HEADER = '程序書編號,程序書書名,變更欄位,舊值,新值,來源,操作人,時間';
const TREE_HEADER = '循環別,變更類型,變更摘要,操作人,時間';

const ACTOR: ChangeHistoryActor = {
  accountId: 'acc-1',
  name: '李慧玲',
  employeeNo: '20233',
  company: '和潤企業股份有限公司',
  department: '債權管理部',
  section: '法催一室',
  roleCode: 'ICSOPAdmin',
};

const T0 = new Date('2026-08-16T06:32:08.000Z'); // → 2026-08-16 14:32:08 (UTC+8)

function linesOf(buf: Buffer): string[] {
  return buf.subarray(3).toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/);
}

class FakeAudit {
  events: { targetType: string; actionType: string }[] = [];
  recordAccess(e: { targetType: string; actionType: string }): Promise<void> {
    this.events.push(e);
    return Promise.resolve();
  }
}

// ══════════════ F037 ICSOP 程序書 tab ══════════════

function docRow(over: Partial<DocumentChangeLogRow> = {}): DocumentChangeLogRow {
  return {
    id: 'c1',
    documentId: 'd1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    changeType: 'CONTENT',
    field: 'documentName',
    oldValue: '舊書名',
    newValue: '新書名',
    actorId: 'a1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    reason: null,
    occurredAt: new Date('2026-07-16T14:30:05.000Z'),
    ...over,
  };
}

function makeDocSvc(
  rows: DocumentChangeLogRow[],
  names: Record<string, string> = {},
  failAudit = false,
) {
  const calls = { listAll: 0, count: 0, list: 0, lastTake: -1 };
  const store = {
    listAll: () => {
      calls.listAll += 1;
      return Promise.resolve(rows);
    },
    listByDocument: () => Promise.resolve(rows),
    append: () => Promise.resolve(),
    countByFilters: () => {
      calls.count += 1;
      return Promise.resolve(rows.length);
    },
    listByFilters: (_f: unknown, take: number) => {
      calls.list += 1;
      calls.lastTake = take;
      return Promise.resolve(rows.slice(0, take));
    },
  } as unknown as DocumentChangeLogStore;

  const docNames: DocumentNameLookup = {
    findNamesByIds: (ids) => Promise.resolve(new Map(ids.map((id) => [id, names[id] ?? '車輛分期進件作業']))),
  };
  const audit = new FakeAudit();
  const writer = failAudit
    ? ({ recordAccess: () => Promise.reject(new Error('AUDIT_IO_FAILED')) } as unknown as AuditWriterService)
    : (audit as unknown as AuditWriterService);
  const svc = new DocumentChangeHistoryService(store, writer, () => T0, docNames);
  return { svc, calls, audit };
}

describe('DocumentChangeHistoryService.exportChanges（F037 AC-D1～AC-D9）', () => {
  it('AC-D2 ① 位元組以 UTF-8 BOM 開頭；② 第 1 列表頭逐字為八欄', async () => {
    const { svc } = makeDocSvc([docRow()]);
    const { csv } = await svc.exportChanges({}, ACTOR);
    expect([csv[0], csv[1], csv[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(linesOf(csv)[0]).toBe(DOC_HEADER);
  });

  it('AC-D2 ② 資料列恰八個儲存格，程序書編號／書名／舊值／新值／操作人為畫面所見值', async () => {
    const { svc } = makeDocSvc([docRow()], { d1: '車輛分期進件作業' });
    const cells = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1].split(',');
    expect(cells).toHaveLength(8);
    expect(cells[0]).toBe('ICSOP-SRC-101-1-01');
    expect(cells[1]).toBe('車輛分期進件作業');
    expect(cells[3]).toBe('舊書名');
    expect(cells[4]).toBe('新書名');
    expect(cells[6]).toContain('李慧玲');
    expect(cells[2].trim()).not.toBe(''); // 變更欄位（值層格式未入 AC，見檔頭 📌）
    expect(cells[5].trim()).not.toBe(''); // 來源（同上）
    expect(cells[7].trim()).not.toBe(''); // 時間
  });

  it('AC-D2 ④ 一次儲存變更多欄位者**逐欄位各輸出一列**（與畫面展開後之逐欄呈現一致）', async () => {
    const { svc } = makeDocSvc([
      docRow({ id: 'c1', field: 'documentName', oldValue: 'A', newValue: 'B' }),
      docRow({ id: 'c2', field: 'edition', oldValue: "26'01", newValue: "26'02" }),
      docRow({ id: 'c3', field: 'contentSummary', oldValue: '甲', newValue: '乙' }),
    ]);
    expect(linesOf((await svc.exportChanges({}, ACTOR)).csv)).toHaveLength(4);
  });

  it('AC-D1 範圍＝符合當前查詢條件之**全部**事件（非當前頁之 50 筆）', async () => {
    const rows = Array.from({ length: 137 }, (_, i) => docRow({ id: `c${i}` }));
    const { svc } = makeDocSvc(rows);
    expect(linesOf((await svc.exportChanges({}, ACTOR)).csv)).toHaveLength(138);
  });

  it('AC-D1 列序與畫面一致（時間新到舊）', async () => {
    const rows = [
      docRow({ id: 'old', documentNumber: 'OLD', occurredAt: new Date('2026-07-01T00:00:00Z') }),
      docRow({ id: 'new', documentNumber: 'NEW', occurredAt: new Date('2026-07-20T00:00:00Z') }),
    ];
    const { svc } = makeDocSvc(rows);
    const lines = linesOf((await svc.exportChanges({}, ACTOR)).csv);
    expect(lines[1].startsWith('NEW,')).toBe(true);
    expect(lines[2].startsWith('OLD,')).toBe(true);
  });

  it('AC-D3 10,001 筆 → 400 `EXPORT_ROW_LIMIT_EXCEEDED`，**不產生檔案**', async () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => docRow({ id: `c${i}` }));
    const { svc } = makeDocSvc(rows);
    await expect(svc.exportChanges({}, ACTOR)).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
  });

  it('AC-D3 恰 10,000 筆 → 匯出成功（邊界值含）', async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => docRow({ id: `c${i}` }));
    const { svc } = makeDocSvc(rows);
    expect(linesOf((await svc.exportChanges({}, ACTOR)).csv)).toHaveLength(10_001);
  });

  it('🔴 §10.4 ④／§10.16 D2：**先 COUNT 下推**，超限時完全不取列（不呼叫任何 list）', async () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => docRow({ id: `c${i}` }));
    const { svc, calls } = makeDocSvc(rows);
    await expect(svc.exportChanges({}, ACTOR)).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    expect(calls.count).toBe(1);
    expect(calls.list).toBe(0);
    expect(calls.listAll).toBe(0);
  });

  it('🔴 §10.4 ④：正常路徑亦**不得**呼叫 `listAll()`（append-only 全表載入＝OOM 風險）', async () => {
    const { svc, calls } = makeDocSvc([docRow()]);
    await svc.exportChanges({}, ACTOR);
    expect(calls.listAll).toBe(0);
  });

  it('🔴 §10.4 ④ ②：取列時帶 `TOP 10001` 上界（競態第二道）', async () => {
    const { svc, calls } = makeDocSvc([docRow()]);
    await svc.exportChanges({}, ACTOR);
    expect(calls.lastTake).toBe(10_001);
  });

  it('AC-D4 檔名形狀為 `document_change_history_{YYYYMMDD}_{HHmmss}.csv`（伺服器時間 UTC+8）', async () => {
    const { svc } = makeDocSvc([docRow()]);
    const { fileName } = await svc.exportChanges({}, ACTOR);
    expect(fileName).toBe('document_change_history_20260816_143208.csv');
  });

  it('AC-D6 匯出記一筆 `CHANGE_LOG_VIEW` 稽核（不新增 actionType）', async () => {
    const { svc, audit } = makeDocSvc([docRow()]);
    await svc.exportChanges({}, ACTOR);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].actionType).toBe('CHANGE_LOG_VIEW');
  });

  it('AC-D6 稽核寫入失敗**不阻斷匯出**（比照 F023 補償佇列）', async () => {
    const { svc } = makeDocSvc([docRow()], {}, true);
    const res = await svc.exportChanges({}, ACTOR);
    expect(linesOf(res.csv)).toHaveLength(2); // 檔案照樣產生
  });

  it('AC-D7 0 筆 → 僅含表頭列之 CSV（非錯誤）', async () => {
    const { svc } = makeDocSvc([]);
    expect(linesOf((await svc.exportChanges({}, ACTOR)).csv)).toEqual([DOC_HEADER]);
  });

  it('AC-D9 注入防護：書名／舊值／新值以六種字元開頭者加前綴；否則恆等', async () => {
    const { svc } = makeDocSvc(
      [docRow({ oldValue: '-1', newValue: '=SUM(A1)' })],
      { d1: '@書名' },
    );
    const line = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1];
    expect(line).toContain("'@書名");
    expect(line).toContain("'-1");
    expect(line).toContain("'=SUM(A1)");
  });

  it('AC-D9 🔒 表頭列不套用前綴（逐字表頭不受影響）', async () => {
    const { svc } = makeDocSvc([docRow({ oldValue: '=x' })]);
    expect(linesOf((await svc.exportChanges({}, ACTOR)).csv)[0]).toBe(DOC_HEADER);
  });
});

// ══════════════ F038 循環樹狀圖 tab ══════════════

function treeRow(over: Partial<LifecycleChangeLogRow> = {}): LifecycleChangeLogRow {
  return {
    id: 'lc1',
    lifecycleId: 'LC-SRC',
    changeType: 'NODE_ADDED',
    summary: '新增節點『撥款核准作業』',
    oldValue: null,
    newValue: '撥款核准作業',
    nodeId: 'n4',
    actorId: 'a1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    occurredAt: new Date('2026-07-16T15:12:04.000Z'),
    ...over,
  };
}

function makeTreeSvc(rows: LifecycleChangeLogRow[], displayNames: Record<string, string> = {}) {
  const calls = { listAll: 0, count: 0, list: 0, lastTake: -1 };
  const store = {
    listAll: () => {
      calls.listAll += 1;
      return Promise.resolve(rows);
    },
    listByLifecycle: () => Promise.resolve(rows),
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
  } as unknown as LifecycleChangeLogStore;

  const audit = new FakeAudit();
  const names = {
    findDisplayNamesByIds: (ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, displayNames[id] ?? '銷售及收款循環（消金）']))),
  };
  const svc = new LifecycleChangeHistoryService(
    store,
    audit as unknown as AuditWriterService,
    () => T0,
    names,
  );
  return { svc, calls, audit };
}

describe('LifecycleChangeHistoryService.exportChanges（F038 AC-D1／AC-D2／AC-D4／AC-D5）', () => {
  it('AC-D2 ① BOM；② 第 1 列表頭逐字為五欄（「預覽 / 下載」操作欄不匯出）', async () => {
    const { svc } = makeTreeSvc([treeRow()]);
    const { csv } = await svc.exportChanges({}, ACTOR);
    expect([csv[0], csv[1], csv[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(linesOf(csv)[0]).toBe(TREE_HEADER);
    expect(linesOf(csv)[0]).not.toContain('預覽');
    expect(linesOf(csv)[0]).not.toContain('下載');
  });

  it('🔴 AC-D2 ④ `循環別` 之值＝以 `lifecycleId` join `LIFECYCLE` 取**當前值**經 `lifecycleDisplayName` 組合（含子分類，非快照）', async () => {
    const { svc } = makeTreeSvc([treeRow()], { 'LC-SRC': '銷售及收款循環（企金）' });
    const cells = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1].split(',');
    expect(cells).toHaveLength(5);
    expect(cells[0]).toBe('銷售及收款循環（企金）');
    expect(cells[0]).not.toBe('LC-SRC'); // 不得直接輸出 id
    expect(cells[2]).toBe('新增節點『撥款核准作業』');
    expect(cells[3]).toContain('李慧玲');
  });

  it('AC-D1 兩 tab 各自匯出：本 tab 之欄位結構與 F037 完全不同（不合併）', async () => {
    const { svc } = makeTreeSvc([treeRow()]);
    const header = linesOf((await svc.exportChanges({}, ACTOR)).csv)[0];
    expect(header).not.toBe(DOC_HEADER);
    expect(header).not.toContain('程序書');
    expect(header).not.toContain('舊值');
  });

  it('AC-D1 範圍＝全部事件；列序時間新到舊', async () => {
    const { svc } = makeTreeSvc([
      treeRow({ id: 'old', summary: 'OLD', occurredAt: new Date('2026-07-01T00:00:00Z') }),
      treeRow({ id: 'new', summary: 'NEW', occurredAt: new Date('2026-07-20T00:00:00Z') }),
    ]);
    const lines = linesOf((await svc.exportChanges({}, ACTOR)).csv);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('NEW');
    expect(lines[2]).toContain('OLD');
  });

  it('AC-D4 ① 檔名形狀為 `lifecycle_change_history_{YYYYMMDD}_{HHmmss}.csv`', async () => {
    const { svc } = makeTreeSvc([treeRow()]);
    expect((await svc.exportChanges({}, ACTOR)).fileName).toBe(
      'lifecycle_change_history_20260816_143208.csv',
    );
  });

  it('🔴 AC-D4 ② 匯出記一筆 `LIFECYCLE_CHANGELOG_VIEW`（**非** `CHANGE_LOG_VIEW`）', async () => {
    const { svc, audit } = makeTreeSvc([treeRow()]);
    await svc.exportChanges({}, ACTOR);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].actionType).toBe('LIFECYCLE_CHANGELOG_VIEW');
    expect(audit.events[0].actionType).not.toBe('CHANGE_LOG_VIEW');
  });

  it('AC-D4 ③ 10,001 筆 → 400 `EXPORT_ROW_LIMIT_EXCEEDED`；恰 10,000 通過', async () => {
    const over = makeTreeSvc(Array.from({ length: 10_001 }, (_, i) => treeRow({ id: `x${i}` })));
    await expect(over.svc.exportChanges({}, ACTOR)).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    const exact = makeTreeSvc(Array.from({ length: 10_000 }, (_, i) => treeRow({ id: `x${i}` })));
    expect(linesOf((await exact.svc.exportChanges({}, ACTOR)).csv)).toHaveLength(10_001);
  });

  it('🔴 §10.4 ④／§10.16 D2：COUNT 下推、超限不取列、正常路徑不呼叫 `listAll()`、take 上界為 10001', async () => {
    const over = makeTreeSvc(Array.from({ length: 10_001 }, (_, i) => treeRow({ id: `x${i}` })));
    await expect(over.svc.exportChanges({}, ACTOR)).rejects.toThrow('EXPORT_ROW_LIMIT_EXCEEDED');
    expect(over.calls.count).toBe(1);
    expect(over.calls.list).toBe(0);
    expect(over.calls.listAll).toBe(0);

    const ok = makeTreeSvc([treeRow()]);
    await ok.svc.exportChanges({}, ACTOR);
    expect(ok.calls.listAll).toBe(0);
    expect(ok.calls.lastTake).toBe(10_001);
  });

  it('AC-D4 空結果 → 僅含表頭列之 CSV', async () => {
    const { svc } = makeTreeSvc([]);
    expect(linesOf((await svc.exportChanges({}, ACTOR)).csv)).toEqual([TREE_HEADER]);
  });

  it('AC-D5 注入防護：`變更摘要`／`循環別` 以六種字元開頭者加前綴；否則恆等', async () => {
    const { svc } = makeTreeSvc([treeRow({ summary: '=cmd|A1' })], { 'LC-SRC': '+循環' });
    const line = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1];
    expect(line).toContain("'+循環");
    expect(line).toContain("'=cmd|A1");

    const plain = makeTreeSvc([treeRow({ summary: '新增節點' })], { 'LC-SRC': '銷售及收款循環' });
    const l2 = linesOf((await plain.svc.exportChanges({}, ACTOR)).csv)[1];
    expect(l2.startsWith('銷售及收款循環,')).toBe(true);
    expect(l2).not.toContain("'");
  });
});

// ══════════════ CSV 值層：列舉欄輸出中文標籤（2026-08-16 補訂之 AC） ══════════════

/**
 * 🔴 F038 `AC-D7` ① ／ F037 `AC-D11` ①② —— **列舉欄之值必須是畫面所見之中文標籤**。
 *
 * 🔴 **本區塊之存在理由（同一流程失誤第二次）**：本檔開頭之註解原記載
 * 「F037 之 `變更欄位`／`來源` 兩欄，其值究竟為屬性名或中文標籤，**現行 AC 未定**；本檔僅斷言非空」
 * ——ringC 當時**正確地**沒有臆造期望值，而是登錄於 `risks-and-gaps.md`。lead 隨後裁示、
 * spec-writer 補了 F038 `AC-D7`／F037 `AC-D11`，**但那時環已建完、沒有人回頭建約束** ⇒
 * 缺陷（CSV 輸出 `NODE_ADDED` 而非「新增節點」）一路到瀏覽器實際下載 CSV 才被發現。
 *
 * ⚠ 與 `AC-D5`／`AC-D9`（CSV 注入防護）之交互：本組期望值皆為中文標籤，
 *    不以 `=`／`+`／`-`／`@`／Tab／CR 起首 ⇒ 前綴規則為**恆等**，值層期望值即為畫面字串本身。
 */

/** F038 `AC-D7` ① 之對映表（權威＝AC 逐字；**三對一**：三個 DOCUMENT_* 皆 → `文件掛載變更`）。 */
const TREE_TYPE_LABEL: Record<string, string> = {
  NODE_ADDED: '新增節點',
  NODE_REMOVED: '移除節點',
  EDGE_ADDED: '新增連線',
  EDGE_REMOVED: '移除連線',
  NODE_RENAMED: '節點改名',
  DOCUMENT_MOUNTED: '文件掛載變更',
  DOCUMENT_REASSIGNED: '文件掛載變更',
  DOCUMENT_UNMOUNTED: '文件掛載變更',
};

/** 值域恰為六者（＝`prototypes/23-change-history.html:181` 之「變更類型」篩選下拉選項，逐字）。 */
const TREE_TYPE_DOMAIN = [
  '新增節點', '移除節點', '新增連線', '移除連線', '節點改名', '文件掛載變更',
];

describe('F038 AC-D7 ① 循環樹狀圖 CSV：`變更類型` 欄輸出中文標籤', () => {
  const codes = Object.keys(TREE_TYPE_LABEL);

  it.each(codes)('%s → 對映之中文標籤', async (code) => {
    const { svc } = makeTreeSvc([treeRow({ changeType: code as LifecycleChangeLogRow['changeType'] })]);
    const cells = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1].split(',');
    expect(cells[1]).toBe(TREE_TYPE_LABEL[code]);
  });

  it('🔴 不得輸出列舉代碼（`NODE_ADDED` 等）——本次逃逸缺陷之直接守衛', async () => {
    const { svc } = makeTreeSvc(codes.map((c, i) => treeRow({ id: `lc${i}`, changeType: c as LifecycleChangeLogRow['changeType'] })));
    const rows = linesOf((await svc.exportChanges({}, ACTOR)).csv).slice(1);
    const typeCells = rows.map((l) => l.split(',')[1]);
    expect(typeCells).toHaveLength(codes.length);
    // 任何一格若為 A-Z_ 之列舉代碼即為缺陷（中文標籤不可能符合此形狀）
    expect(typeCells.filter((v) => /^[A-Z][A-Z_]*$/.test(v))).toEqual([]);
  });

  it('值域恰為六者（八個代碼三對一收斂後）', async () => {
    const { svc } = makeTreeSvc(codes.map((c, i) => treeRow({ id: `lc${i}`, changeType: c as LifecycleChangeLogRow['changeType'] })));
    const rows = linesOf((await svc.exportChanges({}, ACTOR)).csv).slice(1);
    const distinct = [...new Set(rows.map((l) => l.split(',')[1]))].sort();
    expect(distinct).toEqual([...TREE_TYPE_DOMAIN].sort());
  });
});

/** F037 `AC-D11` ① 之對映表（權威＝AC 逐字，十例）。 */
const DOC_FIELD_LABEL: Record<string, string> = {
  documentName: '程序書書名',
  contentSummary: '內容摘要',
  edition: '版次',
  status: '文件狀態',
  announcedDate: '公告日期',
  draftingDeptId: '制定部門',
  draftingSectionId: '制定室別',
  primaryChiefId: '當責室長-主要',
  usingDeptIds: '文件使用部門',
  'attachment(ICSOP_PDF)': '檔案（ICSOP PDF）',
};

/** F037 `AC-D11` ② 之值域，恰為六者。 */
const DOC_SOURCE_DOMAIN = ['編輯', '狀態切換', '制定組織', '當責室長', '使用部門', '附件'];

describe('F037 AC-D11 ①② ICSOP 程序書 CSV：`變更欄位`／`來源` 欄輸出中文標籤', () => {
  it.each(Object.keys(DOC_FIELD_LABEL))('`變更欄位` %s → 中文顯示標籤', async (field) => {
    const { svc } = makeDocSvc([docRow({ field })]);
    const cells = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1].split(',');
    expect(cells[2]).toBe(DOC_FIELD_LABEL[field]);
  });

  it('🔴 `變更欄位` 不得輸出屬性名（camelCase 之 ASCII 識別字）', async () => {
    const fields = Object.keys(DOC_FIELD_LABEL);
    const { svc } = makeDocSvc(fields.map((f, i) => docRow({ id: `c${i}`, field: f })));
    const rows = linesOf((await svc.exportChanges({}, ACTOR)).csv).slice(1);
    const cells = rows.map((l) => l.split(',')[2]);
    expect(cells).toHaveLength(fields.length);
    expect(cells.filter((v) => /^[A-Za-z(][A-Za-z_()]*$/.test(v))).toEqual([]);
  });

  /**
   * ⚠ **AC 缺口（已登錄 risks-and-gaps）**：`AC-D11` ② 只規定 `來源` 之**輸出值域**（六者），
   *    **未給出 `changeType` → 來源標籤之逐案對映**（不同於 `AC-D7` ①，那條給了完整對映）。
   *    故本案僅能斷言「值落在六者之內、且非列舉代碼」，**不臆造**特定代碼對特定標籤。
   */
  it('`來源` 之值落於六者值域內，且非列舉代碼', async () => {
    const { svc } = makeDocSvc([docRow()]);
    const cells = linesOf((await svc.exportChanges({}, ACTOR)).csv)[1].split(',');
    expect(/^[A-Z][A-Z_]*$/.test(cells[5])).toBe(false);
    expect(DOC_SOURCE_DOMAIN).toContain(cells[5]);
  });
});
