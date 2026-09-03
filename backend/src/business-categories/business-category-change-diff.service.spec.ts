/**
 * F043 業務/功能類別管理 — BusinessCategoryChangeDiffService（§戊 AC-41：新舊對照重建 ＋ 下載）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-41
 *      ＋ 僅讀取既有 `lifecycle-change-diff.service.spec.ts` 之 Fake 替身／`build()` 慣例（非決定
 *      本功能行為，各欄期望值取自 F043 AC 與下方之人類裁決）。
 *
 * ## 2026-09-03 使用者實機第三個發現（延伸）：已刪除類別之佔位文字，基底措辭須與清單/CSV 一致
 *
 * 背景：`business-category-change-history.service.ts` 之 `queryChanges`／`exportChanges` 對已刪除
 * 類別退化為 `已刪除之類別（{id 前 8 碼}）`（見 `business-category-change-history.service.spec.ts`／
 * `-export.spec.ts`）。impl-be 查得同一概念在本檔（`BusinessCategoryChangeDiffService.preview()`
 * 之 `resolveCategory()`）已有第二種既有寫法（`DELETED_CATEGORY_NAME = '（類別已刪除）'`），
 * 供 `AC-41` 新舊對照標題之佔位。
 *
 * 🟢 **team-lead 裁決（2026-09-03）**：
 * | 載體 | 逐字 |
 * |---|---|
 * | 變更歷程清單／CSV 第 1 欄 | `已刪除之類別（F7E525D6）`（**有** id 後綴） |
 * | 新舊對照（tree-diff）標題 | `已刪除之類別`（**無** id，`DELETED_CATEGORY_NAME` 由
 * | | `（類別已刪除）` 改為此值） |
 *
 * 即：**基底措辭收斂為 `已刪除之類別`**；id 後綴只出現在「同畫面可能同時列出多個已刪類別、
 * 需要區辨」的清單／CSV——tree-diff 之 scope 已鎖定單一事件，不需要 id 區分。
 *
 * 🔴🔴 **防漂移（本檔核心）**：基底字串會出現在兩個各自獨立的模組（本檔＋
 * `business-category-change-history.service.ts`），impl-be 可能以「共用 import」或「兩處各自宣告」
 * 任一種方式落地——本檔**鎖住結果，不鎖實作方式**：直接比對**兩處之實際輸出**（而非各自與字面
 * 常數比較），任一處被單邊改字即刻紅。
 *
 * 🔒 **不得**因此把 id 後綴加到 tree-diff 標題，或把清單的 id 後綴拿掉——兩個差異是刻意的，本檔
 * 明文鎖定兩者之形狀差異（有無 id 後綴）本身，而非只鎖基底文字。
 *
 * 🔴 **與循環側（F038）零漣漪**：`lifecycle-change-diff.service.spec.ts` 之既有
 * `TS-LCC-C-003`（循環本體已刪除 → `res.lifecycle.name` 為 `（循環已刪除）`）**維持原樣、
 * 本次不touch**——循環側之同型佔位字串不在本次裁決範圍內，比照本模組其餘檔案已寫下之既有
 * 不對稱聲明（`AC-49`）。
 *
 * ⚠ 對實作全盲：`DELETED_CATEGORY_NAME` 之新值（`已刪除之類別`）與 `BusinessCategoryChangeDiffService`
 * 於本環撰寫時**尚未同步更新**（impl-be 現況仍為舊值 `（類別已刪除）`）——本檔全面預期紅燈。
 */
import { BusinessCategoryChangeDiffService } from './business-category-change-diff.service';
import { BusinessCategoryChangeHistoryService } from '../change-history/business-category-change-history.service';
import {
  BusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogStore,
} from '../change-history/business-category-change-log.store';
import {
  BusinessCategorySnapshotRecord,
  BusinessCategorySnapshotStore,
} from '../change-history/business-category-snapshot.store';
import { BusinessCategoryStore, BusinessCategoryView } from './business-category.store';
import { SnapshotGraph, SnapshotNode } from '../lifecycle/lifecycle-snapshot-builder';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import { WatermarkSession } from '../public/watermark.service';
import { WatermarkIdentity } from '../public/watermark';
import { PdfBurner } from '../public/pdf-burner';
import { LifecycleWatermarkBuilder } from '../lifecycle/lifecycle-watermark';
import {
  LifecycleChangeHistoryPdfInput,
  LifecycleChangeHistoryPdfRenderer,
} from '../lifecycle/lifecycle-change-history-pdf';

function sn(id: string, name: string): SnapshotNode {
  return { id, name, positionX: 0, positionY: 0, docs: [] };
}
function graph(nodes: SnapshotNode[], edges: [string, string, string][]): SnapshotGraph {
  return { nodes, edges: edges.map(([id, s, t]) => ({ id, sourceNodeId: s, targetNodeId: t })) };
}
const BEFORE = graph([sn('a1', '授信申請作業')], []);
const AFTER = graph([sn('a1', '授信申請作業')], []);

class FakeLogStore implements BusinessCategoryChangeLogStore {
  rows: BusinessCategoryChangeLogRow[] = [];
  async append(r: BusinessCategoryChangeLogRow): Promise<void> {
    this.rows.push(r);
  }
  async listAll(): Promise<BusinessCategoryChangeLogRow[]> {
    return this.rows;
  }
  async listByBusinessCategory(id: string): Promise<BusinessCategoryChangeLogRow[]> {
    return this.rows.filter((r) => r.businessCategoryId === id);
  }
  async findById(id: string): Promise<BusinessCategoryChangeLogRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findPredecessor(bc: string, before: Date): Promise<BusinessCategoryChangeLogRow | null> {
    return (
      this.rows
        .filter((r) => r.businessCategoryId === bc && r.occurredAt.getTime() < before.getTime())
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0] ?? null
    );
  }
}
class FakeSnapStore implements BusinessCategorySnapshotStore {
  records: BusinessCategorySnapshotRecord[] = [];
  async findByChangeLogId(id: string): Promise<BusinessCategorySnapshotRecord | null> {
    return this.records.find((r) => r.changeLogId === id) ?? null;
  }
  async findById(id: string): Promise<BusinessCategorySnapshotRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }
}
class FakeCategoryStore implements Partial<BusinessCategoryStore> {
  view: BusinessCategoryView | null = {
    id: 'bc1',
    name: '授信',
    subcategory: '消金',
    description: null,
    status: 'active',
    nodeCount: 1,
    mountedDocCount: 0,
    updatedAt: new Date(),
  };
  async findById(): Promise<BusinessCategoryView | null> {
    return this.view;
  }
}
class FakeWatermark implements LifecycleWatermarkBuilder {
  fields: WatermarkIdentity = {
    employeeNo: '20233',
    name: '李慧玲',
    companyFullName: '和潤企業股份有限公司',
    departmentFullName: '債權管理部',
    sectionName: '法催一室',
  } as WatermarkIdentity;
  async buildSnapshot(): Promise<{ snapshot: string; fields: WatermarkIdentity }> {
    return { snapshot: '20233-李慧玲-僅供內部使用-2026-09-03', fields: this.fields };
  }
}
class RecordingRenderer implements LifecycleChangeHistoryPdfRenderer {
  calls: LifecycleChangeHistoryPdfInput[] = [];
  async render(input: LifecycleChangeHistoryPdfInput): Promise<Buffer> {
    this.calls.push(input);
    return Buffer.from('%PDF-1.7 fake');
  }
}
class RecordingBurner implements PdfBurner {
  calls: { buffer: Buffer; snapshot: string }[] = [];
  async burnPdf(buffer: Buffer, snapshot: string): Promise<Buffer> {
    this.calls.push({ buffer, snapshot });
    return Buffer.from('%PDF-1.7 burned');
  }
}
class FakeAudit implements AuditWriter {
  events: AuditAccessEvent[] = [];
  async recordAccess(e: AuditAccessEvent): Promise<void> {
    this.events.push(e);
  }
  queryHistory(): never {
    throw new Error('not used');
  }
  async processOutboxRetry(): Promise<void> {}
}

const SESSION: WatermarkSession = {
  accountId: 'acc-9',
  employeeNo: '20233',
  name: '李慧玲',
  companyCode: 'AS',
  orgCode: 'JAC00',
  roleCode: 'ICSOPAdmin',
};

function build(overrides: { categories?: FakeCategoryStore; businessCategoryId?: string } = {}) {
  const bcId = overrides.businessCategoryId ?? 'bc1';
  const logs = new FakeLogStore();
  const snaps = new FakeSnapStore();
  logs.rows = [
    {
      id: 'cl1',
      businessCategoryId: bcId,
      changeType: 'NODE_ADDED',
      summary: '新增節點',
      oldValue: null,
      newValue: null,
      nodeId: null,
      actorId: null,
      actorName: null,
      actorEmployeeNo: null,
      occurredAt: new Date('2026-09-01T00:00:00Z'),
      snapshotId: 'sp1',
    },
  ];
  snaps.records = [
    { id: 'sp1', businessCategoryId: bcId, changeLogId: 'cl1', graph: AFTER, capturedAt: new Date() },
  ];
  const audit = new FakeAudit();
  const svc = new BusinessCategoryChangeDiffService(
    logs,
    snaps,
    (overrides.categories ?? new FakeCategoryStore()) as unknown as BusinessCategoryStore,
    new FakeWatermark(),
    new RecordingRenderer(),
    new RecordingBurner(),
    audit as unknown as AuditWriterService,
    () => new Date('2026-09-03T10:00:00Z'),
  );
  return { svc, logs, snaps, audit };
}

describe('BusinessCategoryChangeDiffService.preview — 2026-09-03 已刪除類別標題佔位（team-lead 裁決）', () => {
  const DELETED_ID = 'F7E525D6-5DA7-F111-80A2-00155DC92813'; // 逐字取自使用者實機回報之案例

  it('類別存在時 → businessCategory.name 為原始名稱（非佔位）', async () => {
    const { svc } = build();
    const res = await svc.preview(SESSION, 'bc1', 'cl1');
    expect(res.businessCategory.name).toBe('授信');
  });

  it('🔴🔴 類別已刪除（findById 回 null）但變更日誌仍存在 → businessCategory.name 逐字為「已刪除之類別」（🔒 不得含 id、不得為原本之「（類別已刪除）」）', async () => {
    const categories = new FakeCategoryStore();
    categories.view = null;
    const { svc } = build({ categories, businessCategoryId: DELETED_ID });
    const res = await svc.preview(SESSION, DELETED_ID, 'cl1');
    expect(res.businessCategory.name).toBe('已刪除之類別');
    expect(res.businessCategory.name).not.toBe('（類別已刪除）'); // 🔴 舊值，OLD> 逐字保留供追溯
    expect(res.businessCategory.name).not.toContain(DELETED_ID.slice(0, 8)); // 🔒 標題不得含 id 後綴
  });
});

/**
 * 🔴🔴 跨模組防漂移：直接比對 `BusinessCategoryChangeDiffService`（tree-diff 標題）與
 * `BusinessCategoryChangeHistoryService`（清單／CSV）對**同一個**已刪除類別 id 之實際輸出，
 * 而非各自與字面常數比較——任一處被單邊改字（如 diff 標題被改回「（類別已刪除）」，或清單被
 * 改成別的措辭）即刻紅，無論實作是共用 import 還是兩處各自宣告。
 */
describe('🔴🔴 跨模組基底措辭一致性（tree-diff 標題 vs 清單/CSV 第 1 欄）', () => {
  const DELETED_ID = 'F7E525D6-5DA7-F111-80A2-00155DC92813';

  it('清單/CSV 之退化輸出，其開頭逐字等於 tree-diff 標題之完整輸出（基底措辭相同），且清單額外帶 id 後綴、tree-diff 沒有', async () => {
    // ── tree-diff 側 ──
    const categories = new FakeCategoryStore();
    categories.view = null;
    const { svc: diffSvc } = build({ categories, businessCategoryId: DELETED_ID });
    const diffResult = await diffSvc.preview(SESSION, DELETED_ID, 'cl1');
    const diffTitle = diffResult.businessCategory.name;

    // ── 清單/CSV 側（重用既有已驗證之 BusinessCategoryChangeHistoryService，見同批之
    //    business-category-change-history.service.spec.ts）──
    const historyStore = new FakeLogStore();
    historyStore.rows = [
      {
        id: 'clh1',
        businessCategoryId: DELETED_ID,
        changeType: 'NODE_REMOVED',
        summary: '移除節點',
        oldValue: null,
        newValue: null,
        nodeId: null,
        actorId: null,
        actorName: null,
        actorEmployeeNo: null,
        occurredAt: new Date('2026-09-01T00:00:00Z'),
        snapshotId: 'sp1',
      },
    ];
    const names = {
      // 🔴 DELETED_ID 刻意不放入映射，模擬真實查無（類別已刪除）。
      findDisplayNamesByIds: () => Promise.resolve(new Map<string, string>()),
    };
    const historySvc = new BusinessCategoryChangeHistoryService(historyStore, undefined, undefined, names);
    const page = await historySvc.queryChanges({ businessCategoryId: DELETED_ID });
    const listOutput = page.items[0].businessCategoryDisplayName;

    // ── 核心比對：基底措辭相同（清單以 diffTitle 開頭），但兩者形狀刻意不同 ──
    expect(listOutput.startsWith(diffTitle)).toBe(true);
    expect(listOutput).not.toBe(diffTitle); // 🔒 清單「多」了 id 後綴，兩者不得逐字相等
    expect(diffTitle).toBe('已刪除之類別');
    expect(listOutput).toBe('已刪除之類別（F7E525D6）');

    // 自證：diffTitle 本身不含 id 片段、listOutput 確實含 id 片段——證明兩者形狀差異非巧合。
    expect(diffTitle).not.toContain(DELETED_ID.slice(0, 8));
    expect(listOutput).toContain(DELETED_ID.slice(0, 8));
  });
});
