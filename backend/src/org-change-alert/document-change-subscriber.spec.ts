import {
  OrgChangeAlertAutoResolveSubscriber,
  affectedFieldsFromEvent,
} from './document-change-subscriber';
import { OrgChangeAlertService, AutoResolveInput } from './org-change-alert.service';
import { DocumentChangedEvent } from '../documents/document-change-event';
import { FieldKey } from '../rbac/field-matrix';

/**
 * F006 §3.8 Route A（自動解除）：訂閱 F011/F014 之 `DocumentChangedEvent`，
 * 將實際變更之欄位對映為 FieldKey，自動解除同文件之對應 pending 提示。
 *
 * ⚠ 授權來源＝該次合法之文件寫入（F026 欄位權限），**不**額外檢查 ORG_SYNC_MANAGEMENT（D8）。
 */

const OCCURRED = new Date('2026-07-24T05:00:00.000Z');

function event(over: Partial<DocumentChangedEvent> = {}): DocumentChangedEvent {
  return {
    documentId: 'D1',
    changeType: 'CONTENT',
    changes: [],
    actorId: 'acc-2',
    actorName: '王管理',
    actorEmployeeNo: 'E900',
    documentNumber: 'ICSOP-SRC-101-1-01',
    occurredAt: OCCURRED,
    ...over,
  };
}

function subscriberWith(): {
  sub: OrgChangeAlertAutoResolveSubscriber;
  calls: AutoResolveInput[];
  fail: () => void;
} {
  const calls: AutoResolveInput[] = [];
  let failing = false;
  const svc = {
    autoResolveFromDocumentChange: async (input: AutoResolveInput): Promise<void> => {
      if (failing) throw new Error('STORE_IO');
      calls.push(input);
    },
  } as unknown as OrgChangeAlertService;
  return {
    sub: new OrgChangeAlertAutoResolveSubscriber(svc),
    calls,
    fail: () => {
      failing = true;
    },
  };
}

describe('affectedFieldsFromEvent（欄位對映）', () => {
  it('制定公司（companyCode）＋制定部門/室別＋當責室長-主要 → 對映 FieldKey', () => {
    const fields = affectedFieldsFromEvent(
      event({
        changes: [
          // 🔴 2026-08-27 裁定：制定公司之屬性名改為 `companyCode`（`draftingCompanyId` 已移除）。
          { field: 'companyCode', oldValue: 'AS', newValue: 'AD' },
          { field: 'draftingDeptId', oldValue: 'JA000', newValue: 'JB000' },
          { field: 'draftingSectionId', oldValue: 'JAB00', newValue: 'JAC00' },
          { field: 'primaryChiefId', oldValue: 'E001', newValue: 'E002' },
        ],
      }),
    );

    expect(fields).toEqual([
      FieldKey.ESTABLISH_COMPANY,
      FieldKey.ESTABLISH_DEPT,
      FieldKey.ESTABLISH_SECTION,
      FieldKey.CHIEF_PRIMARY,
    ]);
  });

  it('多值欄位 secondaryChiefIds／usingDeptIds 亦在對映表內（跨軌相依：doc-seams 修正後即生效）', () => {
    const fields = affectedFieldsFromEvent(
      event({
        changes: [
          { field: 'secondaryChiefIds', oldValue: 'E002', newValue: 'E003' },
          { field: 'usingDeptIds', oldValue: 'JAA00', newValue: 'JBB00' },
        ],
      }),
    );

    expect(fields).toEqual([FieldKey.CHIEF_SECONDARY, FieldKey.USING_DEPTS]);
  });

  it('TS-F006-045 不可對映之欄位（documentName 等）→ 空陣列', () => {
    const fields = affectedFieldsFromEvent(
      event({ changes: [{ field: 'documentName', oldValue: 'A', newValue: 'B' }] }),
    );

    expect(fields).toEqual([]);
  });

  it('changes 未提供／為空 → 空陣列（無實際欄位變更）', () => {
    expect(affectedFieldsFromEvent(event({ changes: undefined }))).toEqual([]);
    expect(affectedFieldsFromEvent(event({ changes: [] }))).toEqual([]);
  });

  it('同一欄位重複出現 → 去重', () => {
    const fields = affectedFieldsFromEvent(
      event({
        changes: [
          { field: 'primaryChiefId', oldValue: 'E001', newValue: 'E002' },
          { field: 'primaryChiefId', oldValue: 'E002', newValue: 'E003' },
        ],
      }),
    );

    expect(fields).toEqual([FieldKey.CHIEF_PRIMARY]);
  });
});

describe('OrgChangeAlertAutoResolveSubscriber.publish', () => {
  it('TS-F006-044 primaryChiefId 實際變更 → 委派自動解除（FIELD_UPDATED，actor 取自事件）', async () => {
    const { sub, calls } = subscriberWith();

    await sub.publish(
      event({ changes: [{ field: 'primaryChiefId', oldValue: 'E001', newValue: 'E002' }] }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      documentId: 'D1',
      affectedFields: [FieldKey.CHIEF_PRIMARY],
      actor: { accountId: 'acc-2', name: '王管理', employeeNo: 'E900' },
      occurredAt: OCCURRED,
    });
  });

  it('TS-F006-045 事件不含可對映欄位 → 完全不呼叫服務（無副作用）', async () => {
    const { sub, calls } = subscriberWith();

    await sub.publish(
      event({ changes: [{ field: 'documentName', oldValue: 'A', newValue: 'B' }] }),
    );

    expect(calls).toEqual([]);
  });

  it('TS-F006-046 多欄同時變更 → 一次帶入全部對映欄位（各自比對解除）', async () => {
    const { sub, calls } = subscriberWith();

    await sub.publish(
      event({
        changes: [
          { field: 'draftingDeptId', oldValue: 'JA000', newValue: 'JB000' },
          { field: 'primaryChiefId', oldValue: 'E001', newValue: 'E002' },
        ],
      }),
    );

    expect(calls[0].affectedFields).toEqual([
      FieldKey.ESTABLISH_DEPT,
      FieldKey.CHIEF_PRIMARY,
    ]);
  });

  it('TS-F006-047 多值欄位（次要室長/使用部門）之變更事件抵達時亦自動解除', async () => {
    const { sub, calls } = subscriberWith();

    await sub.publish(
      event({ changes: [{ field: 'secondaryChiefIds', oldValue: 'E002', newValue: '' }] }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].affectedFields).toEqual([FieldKey.CHIEF_SECONDARY]);
  });

  it('TS-F006-049 CLOSED_DEPT_PERSON 無 Route A：文件事件僅帶文件層欄位，不影響人員層提示', async () => {
    const { sub, calls } = subscriberWith();

    await sub.publish(
      event({ changes: [{ field: 'primaryChiefId', oldValue: 'E001', newValue: 'E002' }] }),
    );

    // 自動解除之比對鍵一律為 (documentId, affectedField)；人員層提示 documentId=null，
    // 結構上不可能被文件變更事件命中。
    expect(calls[0].documentId).toBe('D1');
    expect(calls[0].affectedFields).not.toContain(null);
  });

  it('TS-F006-054 ICSOPAdmin 觸發之合法文件寫入 → 自動解除不因其對同步管理僅唯讀而被攔阻', async () => {
    const { sub, calls } = subscriberWith();

    // 事件不攜帶 roleCode——訂閱者不做任何 ORG_SYNC_MANAGEMENT 權限判定（D8）。
    await sub.publish(
      event({ changes: [{ field: 'primaryChiefId', oldValue: 'E001', newValue: 'E002' }] }),
    );

    expect(calls).toHaveLength(1);
  });

  it('STATUS 事件（無欄位 diff）→ 不解除任何提示', async () => {
    const { sub, calls } = subscriberWith();

    await sub.publish(event({ changeType: 'STATUS', changes: [] }));

    expect(calls).toEqual([]);
  });

  it('自動解除失敗不上拋（不阻斷文件儲存主流程）', async () => {
    const { sub, fail } = subscriberWith();
    fail();

    await expect(
      sub.publish(
        event({ changes: [{ field: 'primaryChiefId', oldValue: 'E001', newValue: 'E002' }] }),
      ),
    ).resolves.toBeUndefined();
  });
});
