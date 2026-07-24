import {
  buildCreateChangeDeltas,
  DocumentChangedEvent,
} from './document-change-event';

/**
 * F010 建立稽核事件（doc-changelog A）：`buildCreateChangeDeltas` 純函式。
 *  - 逐已填欄位產生一列 `{ field, oldValue:null, newValue }`（建立即「由無到有」，oldValue 恆 null）。
 *  - null/undefined/空陣列 → 略過（未填欄位非「新值」，杜絕噪音列）。
 *  - newValue 之字串化重用既有 toFieldValueString（Date→ISO、陣列→JSON）。
 */
describe('buildCreateChangeDeltas（F010 建立事件逐欄位 delta）', () => {
  it('TS-DCL-A-001 4 必填皆有值 → 各自一列，oldValue 皆為 null', () => {
    const deltas = buildCreateChangeDeltas({
      lifecycleId: 'lc1',
      status: 'active',
      documentNumber: 'N-1',
      documentName: '車輛分期進件作業',
    });
    expect(deltas).toHaveLength(4);
    for (const d of deltas) expect(d.oldValue).toBeNull();
    const byField = new Map(deltas.map((d) => [d.field, d.newValue]));
    expect(byField.get('lifecycleId')).toBe('lc1');
    expect(byField.get('status')).toBe('active');
    expect(byField.get('documentNumber')).toBe('N-1');
    expect(byField.get('documentName')).toBe('車輛分期進件作業');
  });

  it('TS-DCL-A-002 選填欄位為 null/undefined → 略過、不產生列', () => {
    const deltas = buildCreateChangeDeltas({
      lifecycleId: 'lc1',
      status: 'active',
      documentNumber: 'N-1',
      documentName: '書名',
      draftingCompanyId: null,
      primaryChiefId: undefined,
    });
    expect(deltas).toHaveLength(4);
    expect(deltas.some((d) => d.field === 'draftingCompanyId')).toBe(false);
    expect(deltas.some((d) => d.field === 'primaryChiefId')).toBe(false);
  });

  it('TS-DCL-A-003 secondaryChiefIds/usingDeptIds 為空陣列 → 略過、不產生噪音列', () => {
    const deltas = buildCreateChangeDeltas({
      lifecycleId: 'lc1',
      status: 'active',
      documentNumber: 'N-1',
      documentName: '書名',
      secondaryChiefIds: [],
      usingDeptIds: [],
    });
    expect(deltas).toHaveLength(4);
  });

  it('TS-DCL-A-004 secondaryChiefIds 非空陣列 → JSON 字串化落為 newValue', () => {
    const deltas = buildCreateChangeDeltas({
      lifecycleId: 'lc1',
      status: 'active',
      documentNumber: 'N-1',
      documentName: '書名',
      secondaryChiefIds: ['20053', '20541'],
    });
    expect(deltas).toContainEqual({
      field: 'secondaryChiefIds',
      oldValue: null,
      newValue: '["20053","20541"]',
    });
  });

  it('TS-DCL-A-005 announcedDate（Date）→ ISO 字串化', () => {
    const deltas = buildCreateChangeDeltas({
      lifecycleId: 'lc1',
      status: 'active',
      documentNumber: 'N-1',
      documentName: '書名',
      announcedDate: new Date('2026-01-01T00:00:00Z'),
    });
    expect(deltas).toContainEqual({
      field: 'announcedDate',
      oldValue: null,
      newValue: '2026-01-01T00:00:00.000Z',
    });
  });
});

/** changeType 型別已擴充含 'CREATE'：型別層守門（此 assign 若不合法則 tsc 失敗）。 */
describe('DocumentChangedEvent.changeType 擴充 CREATE', () => {
  it('CREATE 為合法 changeType（含 reason 選填欄）', () => {
    const ev: DocumentChangedEvent = {
      documentId: 'doc-1',
      changeType: 'CREATE',
      changes: [{ field: 'documentName', oldValue: null, newValue: 'x' }],
      reason: null,
      occurredAt: new Date(),
    };
    expect(ev.changeType).toBe('CREATE');
    expect(ev.reason).toBeNull();
  });
});
