import { AuditWriterService } from '../audit/audit-writer.service';
import {
  BusinessCategoryChangeHistoryService,
  relabelMountSummary,
} from './business-category-change-history.service';
import { BusinessCategoryChangeLogRow, BusinessCategoryChangeLogStore } from './business-category-change-log.store';
import { DocumentNameLookup } from './document-name-lookup';

/**
 * 🔴 2026-10-05 delta：業務/功能類別結構變更歷程之掛載／移除摘要原本顯示**裸 documentId**
 * （`新增掛載『F7E525D6-…』於節點『授信申請作業』`）。語料逐字取自寫入端
 * `business-category-docs.service.ts` 之 `buildEvent` 格式。
 */

const DOC_ID = 'F7E525D6-5DA7-F111-80A2-00155DC92813';
const GONE_ID = '0A1B2C3D-0000-0000-0000-000000000000';
const LABELS = new Map([[DOC_ID, { documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }]]);

function row(over: Partial<BusinessCategoryChangeLogRow> = {}): BusinessCategoryChangeLogRow {
  return {
    id: 'r1',
    businessCategoryId: 'bc1',
    changeType: 'DOCUMENT_MOUNTED',
    summary: `新增掛載『${DOC_ID}』於節點『授信申請作業』`,
    oldValue: null,
    newValue: DOC_ID,
    nodeId: 'n1',
    actorId: 'a1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    occurredAt: new Date('2026-09-20T02:00:00Z'),
    ...over,
  };
}

describe('relabelMountSummary', () => {
  it('掛載：摘要中之 documentId 換成「文件編號 書名」，其餘文字逐字不變', () => {
    expect(relabelMountSummary(row(), LABELS, true)).toBe(
      '新增掛載『ICSOP-SRC-101-1-01 車輛分期進件作業』於節點『授信申請作業』',
    );
  });

  it('移除：documentId 取自 oldValue', () => {
    const r = row({
      changeType: 'DOCUMENT_UNMOUNTED',
      summary: `移除掛載『${DOC_ID}』於節點『授信申請作業』`,
      oldValue: DOC_ID,
      newValue: null,
    });
    expect(relabelMountSummary(r, LABELS, true)).toBe(
      '移除掛載『ICSOP-SRC-101-1-01 車輛分期進件作業』於節點『授信申請作業』',
    );
  });

  it('文件已不存在 → 已刪除之文件（前 8 碼），不顯示完整 UUID', () => {
    const r = row({ summary: `新增掛載『${GONE_ID}』於節點『X』`, newValue: GONE_ID });
    expect(relabelMountSummary(r, LABELS, true)).toBe('新增掛載『已刪除之文件（0A1B2C3D）』於節點『X』');
  });

  it('🔒 未回查（無 adapter）→ 原文不變，不把「沒查」說成「已刪除」', () => {
    expect(relabelMountSummary(row(), new Map(), false)).toBe(row().summary);
  });

  it('🔒 非掛載事件 → 原文不變（即使摘要碰巧含有相同字串）', () => {
    const r = row({ changeType: 'NODE_ADDED' as never, summary: `新增節點『${DOC_ID}』` });
    expect(relabelMountSummary(r, LABELS, true)).toBe(`新增節點『${DOC_ID}』`);
  });
});

describe('BusinessCategoryChangeHistoryService — 掛載摘要之三處出口', () => {
  function makeSvc(rows: BusinessCategoryChangeLogRow[]) {
    const store = {
      listAll: () => Promise.resolve(rows),
      listByBusinessCategory: () => Promise.resolve(rows),
      countByFilters: () => Promise.resolve(rows.length),
      listByFilters: () => Promise.resolve(rows),
    } as unknown as BusinessCategoryChangeLogStore;
    const requested: string[][] = [];
    const docs: DocumentNameLookup = {
      findNamesByIds: () => Promise.resolve(new Map()),
      findLabelsByIds: (ids: string[]) => {
        requested.push(ids);
        return Promise.resolve(new Map([...LABELS].filter(([id]) => ids.includes(id))));
      },
    };
    const names = { findDisplayNamesByIds: () => Promise.resolve(new Map([['bc1', '授信（消金）']])) };
    const svc = new BusinessCategoryChangeHistoryService(
      store,
      { recordAccess: () => Promise.resolve() } as unknown as AuditWriterService,
      () => new Date('2026-10-05T00:00:00Z'),
      names,
      docs,
    );
    return { svc, requested };
  }

  it('清單（queryChanges）', async () => {
    const { svc, requested } = makeSvc([row()]);
    const { items } = await svc.queryChanges({});
    expect(items[0].summary).toContain('ICSOP-SRC-101-1-01 車輛分期進件作業');
    expect(items[0].summary).not.toContain(DOC_ID);
    expect(requested).toEqual([[DOC_ID]]);
  });

  it('明細（viewBusinessCategory）', async () => {
    const { svc } = makeSvc([row()]);
    const { items } = await svc.viewBusinessCategory('bc1');
    expect(items[0].summary).not.toContain(DOC_ID);
  });

  it('CSV 匯出（exportChanges）', async () => {
    const { svc } = makeSvc([row()]);
    const { csv } = await svc.exportChanges({});
    const text = csv.subarray(3).toString('utf8');
    expect(text).toContain('ICSOP-SRC-101-1-01 車輛分期進件作業');
    expect(text).not.toContain(DOC_ID);
  });
});
