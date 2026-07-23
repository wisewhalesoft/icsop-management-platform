import { kindToTargetTypes, resolveAuditQuery } from './access-history-filter';
import { AuditRow } from './audit.types';

/**
 * F024 查詢邏輯（純函式）。涵蓋 TS-001/002/006/009/010/011/012/013/014。
 * 對假 AUDIT_LOG 列進行篩選/排序/分頁/近 30 天預設，不連 DB。
 */

let seq = 0;
function row(over: Partial<AuditRow>): AuditRow {
  seq++;
  return {
    id: `r-${seq}`,
    accountId: 'a',
    employeeNo: null,
    name: null,
    company: '和潤企業股份有限公司',
    department: null,
    section: null,
    roleCode: null,
    targetType: 'DOCUMENT',
    actionType: 'VIEW',
    documentId: null,
    documentNumber: null,
    lifecycleId: null,
    lifecycleName: null,
    formId: null,
    targetName: null,
    watermarkSnapshot: null,
    occurredAt: new Date('2026-07-16T12:00:00'),
    source: 'DIRECT',
    ...over,
  };
}

const SCOPE = { company: 'ALL' as const };

describe('kindToTargetTypes', () => {
  it('文件→DOCUMENT/USAGE_FORM、循環→LIFECYCLE、變更→兩種 CHANGE_LOG', () => {
    expect(kindToTargetTypes('文件')).toEqual(['DOCUMENT', 'USAGE_FORM']);
    expect(kindToTargetTypes('循環')).toEqual(['LIFECYCLE']);
    expect(kindToTargetTypes('變更')).toEqual([
      'DOCUMENT_CHANGE_LOG',
      'LIFECYCLE_CHANGE_LOG',
    ]);
  });
});

describe('TS-F024-001 以文件編號查詢 → 該文件所有紀錄，新到舊', () => {
  it('僅回傳該文件之 3 筆並依 occurredAt 新到舊排序', () => {
    const rows = [
      row({ documentNumber: 'ICSOP-A', actionType: 'VIEW', occurredAt: new Date('2026-07-16T09:00:00') }),
      row({ documentNumber: 'ICSOP-A', actionType: 'DOWNLOAD', occurredAt: new Date('2026-07-16T14:00:00') }),
      row({ documentNumber: 'ICSOP-A', actionType: 'PRINT', occurredAt: new Date('2026-07-16T11:00:00') }),
      row({ documentNumber: 'ICSOP-OTHER', occurredAt: new Date('2026-07-16T13:00:00') }),
    ];
    const page = resolveAuditQuery(rows, { target: 'ICSOP-A' }, SCOPE);
    expect(page.total).toBe(3);
    expect(page.items.map((r) => r.actionType)).toEqual([
      'DOWNLOAD',
      'PRINT',
      'VIEW',
    ]);
  });
});

describe('TS-F024-002 時間區間 + 人員 → AND', () => {
  const rows = [
    row({ name: '王小明', employeeNo: '22345', occurredAt: new Date('2026-07-16T10:00:00') }),
    row({ name: '王小明', employeeNo: '22345', occurredAt: new Date('2026-07-10T10:00:00') }),
    row({ name: '林建宏', employeeNo: '20521', occurredAt: new Date('2026-07-16T10:00:00') }),
  ];
  it('人員符合「且」時間落在區間 → 僅 1 筆', () => {
    const page = resolveAuditQuery(
      rows,
      { person: '王小明', from: '2026-07-15', to: '2026-07-17' },
      SCOPE,
    );
    expect(page.total).toBe(1);
    expect(page.items[0].employeeNo).toBe('22345');
  });
  it('人員可用員工編號比對（子字串、不分大小寫）', () => {
    const page = resolveAuditQuery(rows, { person: '20521' }, SCOPE);
    expect(page.total).toBe(1);
    expect(page.items[0].name).toBe('林建宏');
  });
});

describe('TS-F024-006 空條件 → 近 30 天預設，非阻斷', () => {
  it('appliedDefaultRange=true，僅回近 30 天內紀錄，不拋錯', () => {
    const now = new Date('2026-07-23T10:00:00');
    const rows = [
      row({ occurredAt: new Date('2026-07-20T10:00:00') }), // 範圍內
      row({ occurredAt: new Date('2026-05-01T10:00:00') }), // 30 天外
    ];
    const page = resolveAuditQuery(rows, {}, SCOPE, now);
    expect(page.appliedDefaultRange).toBe(true);
    expect(page.total).toBe(1);
    expect(page.items[0].occurredAt.getTime()).toBe(
      new Date('2026-07-20T10:00:00').getTime(),
    );
  });
});

describe('TS-F024-009 類型＝循環', () => {
  it('僅回 LIFECYCLE（LIFECYCLE_VIEW/DOWNLOAD/PRINT）', () => {
    const rows = [
      row({ targetType: 'LIFECYCLE', actionType: 'LIFECYCLE_VIEW', lifecycleName: '銷售及收款循環' }),
      row({ targetType: 'LIFECYCLE', actionType: 'LIFECYCLE_DOWNLOAD', lifecycleName: '採購及付款循環' }),
      row({ targetType: 'DOCUMENT', actionType: 'VIEW', documentNumber: 'ICSOP-A' }),
      row({ targetType: 'DOCUMENT_CHANGE_LOG', actionType: 'CHANGE_LOG_VIEW' }),
    ];
    const page = resolveAuditQuery(rows, { kind: '循環' }, SCOPE);
    expect(page.total).toBe(2);
    expect(page.items.every((r) => r.targetType === 'LIFECYCLE')).toBe(true);
    expect(page.items.every((r) => r.lifecycleName !== null)).toBe(true);
  });
});

describe('TS-F024-010 類型＝變更', () => {
  it('僅回變更歷程檢視/下載（CHANGE_LOG_VIEW / LIFECYCLE_CHANGELOG_*）', () => {
    const rows = [
      row({ targetType: 'DOCUMENT_CHANGE_LOG', actionType: 'CHANGE_LOG_VIEW' }),
      row({ targetType: 'LIFECYCLE_CHANGE_LOG', actionType: 'LIFECYCLE_CHANGELOG_VIEW' }),
      row({ targetType: 'LIFECYCLE_CHANGE_LOG', actionType: 'LIFECYCLE_CHANGELOG_DOWNLOAD' }),
      row({ targetType: 'LIFECYCLE', actionType: 'LIFECYCLE_VIEW' }),
      row({ targetType: 'DOCUMENT', actionType: 'VIEW' }),
    ];
    const page = resolveAuditQuery(rows, { kind: '變更' }, SCOPE);
    expect(page.total).toBe(3);
    expect(
      page.items.every((r) =>
        ['CHANGE_LOG_VIEW', 'LIFECYCLE_CHANGELOG_VIEW', 'LIFECYCLE_CHANGELOG_DOWNLOAD'].includes(
          r.actionType,
        ),
      ),
    ).toBe(true);
  });
});

describe('TS-F024-011 類型＝全部（預設）→ 三類混合、不因缺值拋錯', () => {
  it('文件/循環/變更混合皆回傳', () => {
    const rows = [
      row({ targetType: 'DOCUMENT', documentNumber: 'ICSOP-A' }),
      row({ targetType: 'LIFECYCLE', lifecycleName: '銷售及收款循環', documentId: null }),
      row({ targetType: 'DOCUMENT_CHANGE_LOG', actionType: 'CHANGE_LOG_VIEW' }),
    ];
    const page = resolveAuditQuery(rows, { from: '2000-01-01' }, SCOPE);
    expect(page.total).toBe(3);
  });
});

describe('TS-F024-012 條件互斥：文件編號 + 類型＝循環 → 空結果非錯誤', () => {
  it('循環類無 documentNumber → total=0，不拋錯', () => {
    const rows = [
      row({ targetType: 'DOCUMENT', documentNumber: 'ICSOP-A' }),
      row({ targetType: 'LIFECYCLE', lifecycleName: '銷售及收款循環' }),
    ];
    const page = resolveAuditQuery(rows, { target: 'ICSOP-A', kind: '循環' }, SCOPE);
    expect(page.total).toBe(0);
    expect(page.items).toEqual([]);
  });
});

describe('TS-F024-013 分頁邊界（每頁 50）', () => {
  const rows = Array.from({ length: 51 }, (_, i) =>
    row({
      documentNumber: 'ICSOP-A',
      occurredAt: new Date(2026, 6, 1, 0, 0, i), // 遞增，確保排序穩定
    }),
  );
  it('第 1 頁滿 50、hasNext=true、total=51', () => {
    const page = resolveAuditQuery(rows, { from: '2000-01-01', page: 1, pageSize: 50 }, SCOPE);
    expect(page.items).toHaveLength(50);
    expect(page.hasNext).toBe(true);
    expect(page.total).toBe(51);
  });
  it('最後一頁餘 1、hasNext=false', () => {
    const page = resolveAuditQuery(rows, { from: '2000-01-01', page: 2, pageSize: 50 }, SCOPE);
    expect(page.items).toHaveLength(1);
    expect(page.hasNext).toBe(false);
  });
});

describe('TS-F024-014 非文件類型 documentId=null → 列表容許空值', () => {
  it('LIFECYCLE（documentId null）與 DOCUMENT 混合皆正常回傳，不拋例外', () => {
    const rows = [
      row({ targetType: 'LIFECYCLE', documentId: null, lifecycleName: '銷售及收款循環' }),
      row({ targetType: 'DOCUMENT', documentId: 'doc-1', documentNumber: 'ICSOP-A' }),
    ];
    expect(() => resolveAuditQuery(rows, { from: '2000-01-01' }, SCOPE)).not.toThrow();
    const page = resolveAuditQuery(rows, { from: '2000-01-01' }, SCOPE);
    expect(page.total).toBe(2);
  });
});
