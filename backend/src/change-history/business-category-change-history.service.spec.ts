/**
 * F043 業務/功能類別管理 — BusinessCategoryChangeHistoryService（§戊 結構變更歷程，第三個 tab 之查詢）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-38～AC-40
 *      ＋ docs/specs/architecture-spec.md §14.1（落地檔案清單：
 *        business-category-change-log-publisher.ts／business-category-change-history.service.ts，
 *        比照既有 lifecycle-change-log-publisher.ts／lifecycle-change-history.service.ts）。
 * 僅讀取既有 lifecycle-change-history.service.spec.ts 以沿用其 FakeStore／event() 慣例，
 * 非決定本功能行為（各欄期望值取自 F043 AC，非取自循環側實作）。
 *
 * ⚠ 對實作全盲：本檔涉及之全部業務類別新模組於本環撰寫時尚不存在。
 *
 * ## 2026-09-03 使用者實機第三個發現：類別已刪除時「業務/功能類別」欄不得顯示裸 UUID
 *
 * 現象：管理員清空掛載後刪除一個類別（`AC-12` 明文允許）後，其（append-only、刪不掉之）變更
 * 歷程列從此顯示一串裸 UUID（如 `F7E525D6-5DA7-F111-80A2-00155DC92813`），而非可讀文字——
 * 這在正式環境是**可達**的既有路徑，非測試資料特例。根因：`withDisplayNames` 之
 * `nameMap.get(r.businessCategoryId) ?? r.businessCategoryId`，查無時退回裸 id。
 *
 * 🟢 使用者裁決（逐字格式）：查無時顯示 **`已刪除之類別（{id 前 8 碼}）`**（例：
 * `已刪除之類別（F7E525D6）`），保留可追溯性但不讓使用者看到無意義的 UUID。
 *
 * 🔴🔴 **與循環側（F038）刻意不對齊，明文記錄、不得「順手統一」**：循環側之同型退化路徑
 * （`LifecycleChangeHistoryService` 對已刪除循環之處理）目前**仍為**退回裸 id——使用者本輪**僅**
 * 裁決修本功能，未裁決修循環側。日後若有人以「兩者行為應一致」為由把循環側也改成
 * `已刪除之循環（...）`，那是**未經裁決之變更**，且會牴觸 `AC-49`（循環管理之全部既有 AC 逐條
 * 不變、零漣漪）——`lifecycle-change-history.service.spec.ts` 之既有斷言（若有）**不得**因本次修正
 * 被牽動；本檔亦**不得**修改任何 `lifecycle-*` 檔案。
 */
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import {
  buildBusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogPublisher,
} from './business-category-change-log-publisher';
import { BusinessCategoryChangeHistoryService } from './business-category-change-history.service';
import {
  BusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogStore,
} from './business-category-change-log.store';
import { BusinessCategoryChangedEvent } from '../business-categories/business-category-change-event';

class FakeStore implements BusinessCategoryChangeLogStore {
  rows: BusinessCategoryChangeLogRow[] = [];
  async append(row: BusinessCategoryChangeLogRow): Promise<void> {
    this.rows.push(row);
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
  async findPredecessor(businessCategoryId: string, before: Date): Promise<BusinessCategoryChangeLogRow | null> {
    return (
      this.rows
        .filter((r) => r.businessCategoryId === businessCategoryId && r.occurredAt.getTime() < before.getTime())
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0] ?? null
    );
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

const AT = new Date('2026-09-02T06:00:00Z');

function event(p: Partial<BusinessCategoryChangedEvent> = {}): BusinessCategoryChangedEvent {
  return {
    businessCategoryId: 'bc-1',
    changeType: 'NODE_ADDED',
    summary: '新增節點『授信申請作業』',
    newValue: '授信申請作業',
    actorId: 'acc-1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    occurredAt: AT,
    ...p,
  };
}

describe('buildBusinessCategoryChangeLogRow / BusinessCategoryChangeLogPublisher（F043 AC-38）', () => {
  it('事件 → 落地列（帶操作者/摘要/新舊值快照）', () => {
    const row = buildBusinessCategoryChangeLogRow(event());
    expect(row).toMatchObject({
      businessCategoryId: 'bc-1',
      changeType: 'NODE_ADDED',
      summary: '新增節點『授信申請作業』',
      newValue: '授信申請作業',
      oldValue: null,
      actorId: 'acc-1',
      actorName: '李慧玲',
      actorEmployeeNo: '20233',
      occurredAt: AT,
    });
    expect(typeof row.id).toBe('string');
  });

  it('AC-38 publish → append 至 store（append-only）', async () => {
    const store = new FakeStore();
    await new BusinessCategoryChangeLogPublisher(store).publish(event());
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].changeType).toBe('NODE_ADDED');
  });

  it('AC-30／AC-39：掛載／移除各自獨立發布，不合併為單一事件', async () => {
    const store = new FakeStore();
    const pub = new BusinessCategoryChangeLogPublisher(store);
    await pub.publish(event({ changeType: 'DOCUMENT_MOUNTED', summary: '新增掛載' }));
    await pub.publish(event({ changeType: 'DOCUMENT_UNMOUNTED', summary: '移除掛載' }));
    expect(store.rows).toHaveLength(2);
    expect(store.rows.map((r) => r.changeType)).toEqual(['DOCUMENT_MOUNTED', 'DOCUMENT_UNMOUNTED']);
  });
});

describe('BusinessCategoryChangeHistoryService.queryChanges（F043 AC-40：依類別／期間／變更類型查詢）', () => {
  const store = new FakeStore();
  beforeEach(() => {
    store.rows = [
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-1', changeType: 'NODE_ADDED', occurredAt: new Date('2026-09-02T00:00:00Z') })),
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-2', changeType: 'NODE_REMOVED', occurredAt: new Date('2026-08-30T00:00:00Z') })),
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-1', changeType: 'DOCUMENT_MOUNTED', occurredAt: new Date('2026-09-01T00:00:00Z') })),
    ];
  });

  it('依類別／類型篩選並排序（新→舊）', async () => {
    const svc = new BusinessCategoryChangeHistoryService(store);
    const all = await svc.queryChanges({});
    expect(all.total).toBe(3);
    expect(all.items[0].occurredAt.toISOString()).toBe('2026-09-02T00:00:00.000Z');

    const byBc1 = await svc.queryChanges({ businessCategoryId: 'bc-1' });
    expect(byBc1.total).toBe(2);

    const byType = await svc.queryChanges({ changeType: 'NODE_REMOVED' });
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0].businessCategoryId).toBe('bc-2');
  });

  it('依期間篩選', async () => {
    const svc = new BusinessCategoryChangeHistoryService(store);
    const page = await svc.queryChanges({ from: '2026-09-01', to: '2026-09-02' });
    expect(page.total).toBe(2);
  });
});

/**
 * 🔴🔴 2026-09-03 真缺陷修正：`queryChanges` 之 `businessCategoryDisplayName` 查無對應類別
 * （已刪除）時，不得顯示裸 UUID。
 *
 * 🔴 `findDisplayNamesByIds` 之假體刻意讓「查無」為**真實可達**之結果（未映射之 id 從回傳
 * Map 中直接省略，非以預設值填充）——這才是真實資料庫 JOIN 查無時之自然行為；若假體對每個
 * id 都保底回填一個字面值，「查無」這個分支就永遠測不到（本 repo 已多次記錄之「語料無鑑別力」
 * 形狀之變體：不是語料不夠豐富，是替身本身把要驗證的分支堵死了）。
 */
describe('BusinessCategoryChangeHistoryService.queryChanges — 2026-09-03 已刪除類別之顯示名稱退化', () => {
  const EXISTING_ID = 'bc-1';
  const DELETED_ID = 'F7E525D6-5DA7-F111-80A2-00155DC92813'; // 逐字取自使用者實機回報之案例

  function makeSvcWithNames(displayNameMap: Record<string, string>) {
    const store = new FakeStore();
    store.rows = [
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: EXISTING_ID, changeType: 'NODE_ADDED' })),
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: DELETED_ID, changeType: 'NODE_REMOVED' })),
    ];
    const names = {
      // 🔴 未映射之 id 不進入回傳 Map（模擬真實查無）；不得如舊測試那樣以 ?? 預設值填充。
      findDisplayNamesByIds: (ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.filter((id) => id in displayNameMap).map((id) => [id, displayNameMap[id]]),
          ),
        ),
    };
    return new BusinessCategoryChangeHistoryService(store, undefined, undefined, names);
  }

  it('🔴 正向半句：類別存在時，該欄為 businessCategoryDisplayName（含子分類）', async () => {
    const svc = makeSvcWithNames({ [EXISTING_ID]: '授信（消金）' });
    const page = await svc.queryChanges({ businessCategoryId: EXISTING_ID });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].businessCategoryDisplayName).toBe('授信（消金）');
  });

  it('🔴🔴 退化半句：類別已刪除（不存在於 nameMap）時，該欄逐字為「已刪除之類別（{id 前 8 碼}）」；不得等於原始 id、不得為空字串、不得為 null', async () => {
    const svc = makeSvcWithNames({ [EXISTING_ID]: '授信（消金）' }); // DELETED_ID 刻意不放入
    const page = await svc.queryChanges({ businessCategoryId: DELETED_ID });
    expect(page.items).toHaveLength(1);
    const name = page.items[0].businessCategoryDisplayName;
    expect(name).toBe('已刪除之類別（F7E525D6）');
    expect(name).not.toBe(DELETED_ID);
    expect(name).not.toBe('');
    expect(name).not.toBeNull();
  });

  it('🔴 鑑別力：語料同時含存在與已刪除兩類別（id 相異），一次查詢即區分兩種輸出——不得一律退化、亦不得一律不退化', async () => {
    const svc = makeSvcWithNames({ [EXISTING_ID]: '授信（消金）' });
    const all = await svc.queryChanges({});
    expect(all.items).toHaveLength(2);
    const byId = new Map(all.items.map((r) => [r.businessCategoryId, r.businessCategoryDisplayName]));
    expect(byId.get(EXISTING_ID)).toBe('授信（消金）');
    expect(byId.get(DELETED_ID)).toBe('已刪除之類別（F7E525D6）');
    // 自證：兩個輸出確實不同，否則本測試對「有沒有真的區分」無鑑別力。
    expect(byId.get(EXISTING_ID)).not.toBe(byId.get(DELETED_ID));
  });
});

describe('BusinessCategoryChangeHistoryService.viewBusinessCategory（F043 AC-40 預覽 + 稽核；決策 E3）', () => {
  it('回某類別之列並記 BUSINESS_CATEGORY_CHANGELOG_VIEW（targetType=BUSINESS_CATEGORY_CHANGE_LOG、targetId=businessCategoryId）', async () => {
    const store = new FakeStore();
    store.rows = [
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-1' })),
      buildBusinessCategoryChangeLogRow(event({ businessCategoryId: 'bc-2' })),
    ];
    const audit = new FakeAudit();
    const svc = new BusinessCategoryChangeHistoryService(store, audit as unknown as AuditWriterService);

    const res = await svc.viewBusinessCategory('bc-1', '授信（消金）', {
      accountId: 'acc-9',
      name: '黃俊傑',
      roleCode: 'SysAdmin',
    });
    expect(res.items).toHaveLength(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      targetType: 'BUSINESS_CATEGORY_CHANGE_LOG',
      actionType: 'BUSINESS_CATEGORY_CHANGELOG_VIEW',
      actorId: 'acc-9',
      targetId: 'bc-1',
      targetNumber: '授信（消金）',
      targetName: '授信（消金）',
    });
  });
});
