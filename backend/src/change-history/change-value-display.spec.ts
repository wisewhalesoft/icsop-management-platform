import { AuditWriterService } from '../audit/audit-writer.service';
import {
  ChangeValueNameMaps,
  EMPTY_NAME_MAPS,
  collectNameRequests,
  companyKey,
  displayChange,
  parseCodeList,
} from './change-value-display';
import { ChangeValueNames } from './change-value-names';
import { DocumentChangeHistoryService } from './document-change-history.service';
import { DocumentChangeLogRow, DocumentChangeLogStore } from './document-change-log.store';

/**
 * 🔴 2026-10-05 delta：文件變更歷程「舊值／新值」代碼 → 名稱＋清單型增減。
 *
 * 使用者實機回報：使用部門掛上大量部門後，原始 JSON（`["AI000","AN000",…]`，整串無空白）
 * 撐爆「變更摘要」欄。語料之值形式逐字取自 dev `DOCUMENT_CHANGE_LOG`（2026-10-05 實查）。
 *
 * ⚠ 刻意放入**跨公司同碼**：`CC000` 於 AS＝債權管理部、於 AD＝會計部（dev 實測 44 個 orgCode、
 * 16 個員編跨公司重複）——乾淨語料（每碼只屬一家）下，「以文件公司查」與「不分公司查」輸出相同、
 * 斷言恆真（本 repo 已記錄之假綠形狀）。
 */

const MAPS: ChangeValueNameMaps = {
  org: new Map([
    [companyKey('AS', 'AI000'), '資訊部'],
    [companyKey('AS', 'AN000'), '法務部'],
    [companyKey('AS', 'CC000'), '債權管理部'],
    [companyKey('AD', 'CC000'), '會計部'],
    [companyKey('AS', 'JAC00'), '審查室'],
  ]),
  person: new Map([
    [companyKey('AS', '20053'), '周家宏'],
    [companyKey('AD', '20053'), '林另一人'],
  ]),
  lifecycle: new Map([['36504B40-3CA8-F111-80A2-00155DC92813', '銷售及收款循環（消金）']]),
};

describe('parseCodeList', () => {
  it('JSON 陣列 → 代碼清單；空值 → []', () => {
    expect(parseCodeList('["AI000","AN000"]')).toEqual(['AI000', 'AN000']);
    expect(parseCodeList('[]')).toEqual([]);
    expect(parseCodeList(null)).toEqual([]);
    expect(parseCodeList('')).toEqual([]);
  });
  it('非 JSON（防禦）→ 以逗號切', () => {
    expect(parseCodeList('AI000, AN000')).toEqual(['AI000', 'AN000']);
  });
});

describe('displayChange — 清單型（使用部門）', () => {
  const row = {
    field: 'usingDeptIds',
    oldValue: '["AI000","CC000","ZZ999"]',
    newValue: '["AI000","AN000"]',
  };

  it('增減：新增／移除／未變動各自正確，標籤為名稱、代碼保留', () => {
    const d = displayChange(row, 'AS', MAPS);
    expect(d.listDiff).toEqual({
      added: [{ code: 'AN000', label: '法務部' }],
      removed: [
        { code: 'CC000', label: '債權管理部' },
        { code: 'ZZ999', label: 'ZZ999' },
      ],
      unchanged: [{ code: 'AI000', label: '資訊部' }],
    });
  });

  it('舊值／新值顯示字串＝名稱以「、」相接（CSV 用、完整列出）；查無者維持代碼', () => {
    const d = displayChange(row, 'AS', MAPS);
    expect(d.oldDisplay).toBe('資訊部、債權管理部、ZZ999');
    expect(d.newDisplay).toBe('資訊部、法務部');
  });

  it('🔴 跨公司同碼：AD 文件之 CC000 → 會計部（不得取 AS 之債權管理部）', () => {
    const d = displayChange({ field: 'usingDeptIds', oldValue: null, newValue: '["CC000"]' }, 'AD', MAPS);
    expect(d.newDisplay).toBe('會計部');
  });

  it('🔴 該公司查無 → 原代碼，不跨公司找同碼者充數（AD 無 AI000，AS 有）', () => {
    const d = displayChange({ field: 'usingDeptIds', oldValue: null, newValue: '["AI000"]' }, 'AD', MAPS);
    expect(d.newDisplay).toBe('AI000');
  });

  it('文件公司未知 → 一律代碼', () => {
    const d = displayChange(row, null, MAPS);
    expect(d.newDisplay).toBe('AI000、AN000');
  });

  it('空陣列 → （空）', () => {
    const d = displayChange({ field: 'usingDeptIds', oldValue: '[]', newValue: '["AI000"]' }, 'AS', MAPS);
    expect(d.oldDisplay).toBe('（空）');
    expect(d.listDiff?.added).toEqual([{ code: 'AI000', label: '資訊部' }]);
  });
});

describe('displayChange — 其餘代碼欄位', () => {
  it('次要室長（人員清單）→ 姓名（員編），依文件公司', () => {
    const d = displayChange({ field: 'secondaryChiefIds', oldValue: null, newValue: '["20053","20541"]' }, 'AS', MAPS);
    expect(d.newDisplay).toBe('周家宏（20053）、20541');
    const ad = displayChange({ field: 'secondaryChiefIds', oldValue: null, newValue: '["20053"]' }, 'AD', MAPS);
    expect(ad.newDisplay).toBe('林另一人（20053）');
  });

  it('主要室長（單值）→ 姓名（員編）；非清單型 listDiff 為 null', () => {
    const d = displayChange({ field: 'primaryChiefId', oldValue: null, newValue: '20053' }, 'AS', MAPS);
    expect(d.newDisplay).toBe('周家宏（20053）');
    expect(d.oldDisplay).toBe('（空）');
    expect(d.listDiff).toBeNull();
  });

  it('制定室別 → 組織顯示名稱', () => {
    expect(displayChange({ field: 'draftingSectionId', oldValue: null, newValue: 'JAC00' }, 'AS', MAPS).newDisplay).toBe('審查室');
  });

  it('所屬循環 UUID → 循環名稱', () => {
    const d = displayChange(
      { field: 'lifecycleId', oldValue: null, newValue: '36504B40-3CA8-F111-80A2-00155DC92813' },
      'AS',
      MAPS,
    );
    expect(d.newDisplay).toBe('銷售及收款循環（消金）');
  });

  it('制定公司代碼 → 公司全稱', () => {
    expect(displayChange({ field: 'companyCode', oldValue: null, newValue: 'AS' }, 'AS', MAPS).newDisplay).toBe(
      '和潤企業股份有限公司',
    );
  });

  it('🔒 非代碼欄位維持既有行為（狀態轉中文、其餘原樣）', () => {
    expect(displayChange({ field: 'status', oldValue: 'active', newValue: 'void' }, 'AS', EMPTY_NAME_MAPS)).toEqual({
      oldDisplay: '有效',
      newDisplay: '作廢',
      listDiff: null,
    });
    expect(displayChange({ field: 'documentName', oldValue: 'A', newValue: 'B' }, 'AS', MAPS).newDisplay).toBe('B');
  });
});

describe('collectNameRequests', () => {
  it('依文件公司分組；循環不需公司；非代碼欄位不收', () => {
    const rows = [
      { documentId: 'd-as', field: 'usingDeptIds', oldValue: null, newValue: '["AI000"]' },
      { documentId: 'd-ad', field: 'primaryChiefId', oldValue: '20053', newValue: '70003' },
      { documentId: 'd-as', field: 'lifecycleId', oldValue: null, newValue: 'lc-1' },
      { documentId: 'd-as', field: 'documentName', oldValue: 'a', newValue: 'b' },
    ];
    const req = collectNameRequests(rows, (id) => (id === 'd-as' ? 'AS' : 'AD'));
    expect([...req.orgCompanies]).toEqual(['AS']);
    expect([...(req.persons.get('AD') ?? [])].sort()).toEqual(['20053', '70003']);
    expect([...req.lifecycleIds]).toEqual(['lc-1']);
  });
});

describe('DocumentChangeHistoryService — 清單／明細／CSV 共用顯示值', () => {
  const ROW: DocumentChangeLogRow = {
    id: 'c1',
    documentId: 'd-ad',
    documentNumber: 'ICSOP-SRC-304-1-10',
    changeType: 'UPDATE',
    field: 'usingDeptIds',
    oldValue: '["AI000"]',
    newValue: '["AI000","CC000"]',
    actorId: 'a1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    occurredAt: new Date('2026-10-01T02:00:00Z'),
  } as DocumentChangeLogRow;

  function makeSvc(rows: DocumentChangeLogRow[], valueNames?: ChangeValueNames) {
    const store = {
      listAll: () => Promise.resolve(rows),
      listByDocument: () => Promise.resolve(rows),
      countByFilters: () => Promise.resolve(rows.length),
      listByFilters: () => Promise.resolve(rows),
    } as unknown as DocumentChangeLogStore;
    return new DocumentChangeHistoryService(
      store,
      { recordAccess: () => Promise.resolve() } as unknown as AuditWriterService,
      () => new Date('2026-10-05T00:00:00Z'),
      undefined,
      valueNames,
    );
  }

  const names: ChangeValueNames = {
    documentCompanies: () => Promise.resolve(new Map([['d-ad', 'AD']])),
    resolve: () => Promise.resolve(MAPS),
  };

  it('清單：每列帶 listDiff，以文件公司（AD）解析 CC000 為會計部', async () => {
    const { items } = await makeSvc([ROW], names).queryChanges({});
    expect(items[0].listDiff?.added).toEqual([{ code: 'CC000', label: '會計部' }]);
    expect(items[0].listDiff?.unchanged).toEqual([{ code: 'AI000', label: 'AI000' }]); // AD 無 AI000 → 代碼
  });

  it('明細：同一份顯示值', async () => {
    const { items } = await makeSvc([ROW], names).viewDocument('d-ad');
    expect(items[0].newDisplay).toBe('AI000、會計部');
  });

  it('CSV：舊值／新值為顯示值（不再輸出原始 JSON）', async () => {
    const { csv } = await makeSvc([ROW], names).exportChanges({});
    const text = csv.subarray(3).toString('utf8');
    expect(text).toContain('AI000、會計部');
    expect(text).not.toContain('["AI000"');
  });

  it('🔒 未注入回查 → 仍可運作：顯示代碼（以「、」相接）、增減照算', async () => {
    const { items } = await makeSvc([ROW]).queryChanges({});
    expect(items[0].newDisplay).toBe('AI000、CC000');
    expect(items[0].listDiff?.added).toEqual([{ code: 'CC000', label: 'CC000' }]);
  });
});
