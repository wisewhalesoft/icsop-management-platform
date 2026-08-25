import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrgChangeAlertService } from './org-change-alert.service';
import {
  ActiveAccountRef,
  AlertCreateCommand,
  AlertResolvePatch,
  AlertRow,
  AlertStatus,
  DocumentAlertRef,
  MonthlyAccountStats,
  OrgChangeAlertStore,
} from './org-change-alert.types';
import { SyncAlertInput } from '../org-sync/org-sync.types';
import { AuditAccessEvent, AuditWriter, AuditQueryScope, AuditQueryFilters, AuditRow, Page } from '../audit/audit.types';
import { FieldKey } from '../rbac/field-matrix';
import { NormalizedOrgUnit } from '../org-sync/normalization';
import { ExistingAccount } from '../org-sync/change-classification';

const NOW = new Date('2026-07-24T02:00:00.000Z');

class FakeAlertStore implements OrgChangeAlertStore {
  rows: AlertRow[] = [];
  documents: DocumentAlertRef[] = [];
  accounts: ActiveAccountRef[] = [];
  inserted: AlertCreateCommand[][] = [];
  stats: MonthlyAccountStats = { created: 0, updated: 0, disabled: 0 };
  chiefCount = 0;
  statsArgs: Array<[Date, Date]> = [];

  async listByStatus(status: AlertStatus): Promise<AlertRow[]> {
    return this.rows.filter((r) => r.status === status);
  }
  async findById(id: string): Promise<AlertRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findPendingByDocument(documentId: string): Promise<AlertRow[]> {
    return this.rows.filter((r) => r.status === 'pending' && r.documentId === documentId);
  }
  async insertMany(commands: AlertCreateCommand[]): Promise<void> {
    this.inserted.push(commands);
    for (const c of commands) {
      this.rows.push({
        ...c,
        id: `alert-${this.rows.length + 1}`,
        status: 'pending',
        resolutionKind: null,
        resolvedBy: null,
        resolvedAt: null,
      });
    }
  }
  async resolve(id: string, patch: AlertResolvePatch): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) this.rows[i] = { ...this.rows[i], status: 'resolved', ...patch };
  }
  async monthlyAccountStats(from: Date, to: Date): Promise<MonthlyAccountStats> {
    this.statsArgs.push([from, to]);
    return this.stats;
  }
  async pendingChiefAlertCount(): Promise<number> {
    return this.chiefCount;
  }
  async listActiveAccounts(): Promise<ActiveAccountRef[]> {
    return this.accounts;
  }
  async listDocumentRefs(): Promise<DocumentAlertRef[]> {
    return this.documents;
  }
}

class FakeAudit implements AuditWriter {
  events: AuditAccessEvent[] = [];
  failing = false;
  async recordAccess(event: AuditAccessEvent): Promise<void> {
    if (this.failing) throw new Error('AUDIT_IO');
    this.events.push(event);
  }
  async queryHistory(
    _scope: AuditQueryScope,
    _filters: AuditQueryFilters,
  ): Promise<Page<AuditRow>> {
    throw new Error('not used');
  }
  async processOutboxRetry(): Promise<void> {
    // 未於本測試使用
  }
}

function pending(over: Partial<AlertRow> = {}): AlertRow {
  return {
    id: 'a1',
    alertKind: 'DOCUMENT_FIELD',
    documentId: 'D1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    affectedField: FieldKey.CHIEF_PRIMARY,
    beforeValue: '陳彥廷（車輛行銷室）',
    afterValue: '（已轉調 客服室）',
    personEmployeeNo: null,
    personName: null,
    accountLoginId: null,
    deptOrgCode: null,
    deptName: null,
    deptCloseDate: null,
    status: 'pending',
    resolutionKind: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    sourceSyncRunId: 'run-0',
    ...over,
  };
}

function orgUnit(over: Partial<NormalizedOrgUnit> = {}): NormalizedOrgUnit {
  return {
    companyCode: 'AS',
    orgCode: 'JAD00',
    codePrefix: 'JAD',
    tier: 'SECTION',
    parentCode: 'JA000',
    name: '已裁撤室',
    descFull: null,
    managerEmpNo: null,
    isActive: false,
    closeDate: new Date('2026-03-31T00:00:00.000Z'),
    ...over,
  };
}

function syncInput(over: Partial<SyncAlertInput> = {}): SyncAlertInput {
  return {
    runId: 'run-1',
    companyCode: 'AS',
    orgUpdates: [],
    orgBefore: new Map(),
    orgUnits: [],
    accountUpdates: [],
    existingAcc: new Map(),
    disappearedLoginIds: [],
    ...over,
  };
}

function svc(store: FakeAlertStore, audit?: FakeAudit): OrgChangeAlertService {
  return new OrgChangeAlertService(store, audit, () => NOW);
}

describe('OrgChangeAlertService.generateFromSyncPlan', () => {
  it('TS-F006-025／AC9 掛已關閉部門者：僅寫入提示，不停用帳號、不改派部門', async () => {
    const store = new FakeAlertStore();
    store.accounts = [
      { loginId: 'AS777', employeeNo: 'E777', name: '林小美', orgCode: 'JAD00', status: 'active', resignDate: null },
    ];
    const audit = new FakeAudit();

    await svc(store, audit).generateFromSyncPlan(syncInput({ orgUnits: [orgUnit()] }));

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].alertKind).toBe('CLOSED_DEPT_PERSON');
    // store 介面結構上不含任何帳號停用/文件覆寫方法（AC3/AC9 之第一層保證）；
    // 另斷言帳號快照未被本流程改動。
    expect(store.accounts[0].status).toBe('active');
    expect(Object.keys(store)).not.toContain('disableAccount');
  });

  it('TS-F006-026 掛已關閉部門者同時為某文件當責室長 → 兩類提示各自獨立產生', async () => {
    const store = new FakeAlertStore();
    store.accounts = [
      { loginId: 'AS777', employeeNo: 'E777', name: '林小美', orgCode: 'JAD00', status: 'active', resignDate: null },
    ];
    store.documents = [
      {
        documentId: 'D1',
        documentNumber: 'ICSOP-SRC-101-1-01',
        documentName: '車輛分期進件作業',
        draftingCompanyId: null,
        draftingDeptId: null,
        draftingSectionId: 'JAD00',
        primaryChiefId: 'E777',
        secondaryChiefIds: [],
        usingDeptIds: [],
      },
    ];

    await svc(store).generateFromSyncPlan(
      syncInput({
        orgUnits: [orgUnit()],
        orgUpdates: [orgUnit()],
        orgBefore: new Map([
          [
            'JAD00',
            {
              orgCode: 'JAD00',
              codePrefix: 'JAD',
              tier: 'SECTION',
              parentCode: 'JA000',
              name: '已裁撤室',
              descFull: null,
              managerEmpNo: null,
              isActive: true,
            },
          ],
        ]),
      }),
    );

    const kinds = store.rows.map((r) => r.alertKind).sort();
    expect(kinds).toEqual(['CLOSED_DEPT_PERSON', 'DOCUMENT_FIELD']);
    // 兩筆各自獨立（不同 id、可分別處理）。
    expect(new Set(store.rows.map((r) => r.id)).size).toBe(2);
  });

  it('TS-F006-057 提示產生全程不寫入 AUDIT_LOG（產生非調閱事件）', async () => {
    const store = new FakeAlertStore();
    store.accounts = [
      { loginId: 'AS777', employeeNo: 'E777', name: '林小美', orgCode: 'JAD00', status: 'active', resignDate: null },
    ];
    const audit = new FakeAudit();

    await svc(store, audit).generateFromSyncPlan(syncInput({ orgUnits: [orgUnit()] }));

    expect(store.rows).toHaveLength(1);
    expect(audit.events).toEqual([]);
  });

  it('既有 pending 之自然鍵納入去重（跨兩次同步不重複建立）', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({ id: 'p1' }),
      pending({
        id: 'p2',
        alertKind: 'CLOSED_DEPT_PERSON',
        documentId: null,
        affectedField: null,
        personEmployeeNo: 'E777',
      }),
    ];
    store.accounts = [
      { loginId: 'AS777', employeeNo: 'E777', name: '林小美', orgCode: 'JAD00', status: 'active', resignDate: null },
    ];
    store.documents = [
      {
        documentId: 'D1',
        documentNumber: 'ICSOP-SRC-101-1-01',
        documentName: '車輛分期進件作業',
        draftingCompanyId: null,
        draftingDeptId: null,
        draftingSectionId: null,
        primaryChiefId: 'E001',
        secondaryChiefIds: [],
        usingDeptIds: [],
      },
    ];

    await svc(store).generateFromSyncPlan(
      syncInput({
        orgUnits: [orgUnit()],
        accountUpdates: [
          {
            companyCode: 'AS',
            loginId: 'AS0001',
            employeeNo: 'E001',
            name: '陳彥廷',
            email: null,
            orgCode: 'JAC00',
            empActive: true,
            resignDate: null,
            hireDate: null,
            managerEmpNo: null,
            jobTitleCode: null,
            upstreamModifiedAt: NOW,
          },
        ],
        existingAcc: new Map([
          [
            'AS0001',
            {
              companyCode: 'AS',
              loginId: 'AS0001',
              employeeNo: 'E001',
              name: '陳彥廷',
              email: null,
              orgCode: 'JAB00',
              status: 'active' as const,
              resignDate: null,
              hireDate: null,
              managerEmpNo: null,
            },
          ],
        ]),
      }),
    );

    // 兩類皆已有 pending → 不新增任何列。
    expect(store.rows).toHaveLength(2);
    expect(store.inserted).toEqual([]);
  });
});

describe('OrgChangeAlertService.generateFromSyncPlan × F005 兩類新告警', () => {
  const PAST = new Date('2024-12-31T00:00:00.000Z');

  function activeAcc(over: Partial<ActiveAccountRef> & Pick<ActiveAccountRef, 'loginId'>): ActiveAccountRef {
    return {
      employeeNo: `E-${over.loginId}`,
      name: `name-${over.loginId}`,
      orgCode: 'JAC00',
      status: 'active',
      resignDate: null,
      ...over,
    };
  }

  function existingAcc(loginId: string, orgCode: string | null): ExistingAccount {
    return {
      companyCode: 'AS',
      loginId,
      employeeNo: `E-${loginId}`,
      name: `name-${loginId}`,
      email: null,
      orgCode,
      status: 'active',
      resignDate: null,
      hireDate: null,
      managerEmpNo: null,
    };
  }

  it('TS-ORGALERT-010 一次呼叫同時產生四類提示，互不排擠', async () => {
    const store = new FakeAlertStore();
    // CLOSED_DEPT_PERSON（掛已關閉 JAD00）＋ DATA_INCONSISTENCY（在職但過去 RESIGNDT）。
    store.accounts = [
      activeAcc({ loginId: 'closed1', orgCode: 'JAD00', resignDate: null }),
      activeAcc({ loginId: 'incon1', orgCode: 'JAC00', resignDate: PAST }),
    ];
    // DOCUMENT_FIELD（當責室長本人部門異動）。
    store.documents = [
      {
        documentId: 'D1',
        documentNumber: 'ICSOP-SRC-101-1-01',
        documentName: '車輛分期進件作業',
        draftingCompanyId: null,
        draftingDeptId: null,
        draftingSectionId: null,
        primaryChiefId: 'E-doc1',
        secondaryChiefIds: [],
        usingDeptIds: [],
      },
    ];

    await svc(store).generateFromSyncPlan(
      syncInput({
        orgUnits: [orgUnit()], // JAD00 已關閉
        accountUpdates: [
          {
            companyCode: 'AS',
            loginId: 'doc1',
            employeeNo: 'E-doc1',
            name: '陳彥廷',
            email: null,
            orgCode: 'JAC00',
            empActive: true,
            resignDate: null,
            hireDate: null,
            managerEmpNo: null,
            jobTitleCode: null,
            upstreamModifiedAt: NOW,
          },
        ],
        existingAcc: new Map([
          ['doc1', existingAcc('doc1', 'JAB00')], // 部門異動 → DOCUMENT_FIELD
          ['gone1', existingAcc('gone1', 'JAC00')],
        ]),
        disappearedLoginIds: ['gone1'], // ACCOUNT_DISAPPEARED
      }),
    );

    const kinds = new Set(store.rows.map((r) => r.alertKind));
    expect(kinds).toEqual(
      new Set([
        'DOCUMENT_FIELD',
        'CLOSED_DEPT_PERSON',
        'DATA_INCONSISTENCY',
        'ACCOUNT_DISAPPEARED',
      ]),
    );
  });

  it('TS-ORGALERT-011 existingPendingLoginIds 兩獨立集合依 alertKind 分流、互不污染', async () => {
    const store = new FakeAlertStore();
    // 既有 pending：u1 為 DATA_INCONSISTENCY、u2 為 ACCOUNT_DISAPPEARED。
    store.rows = [
      pending({
        id: 'p1',
        alertKind: 'DATA_INCONSISTENCY',
        documentId: null,
        affectedField: null,
        accountLoginId: 'u1',
      }),
      pending({
        id: 'p2',
        alertKind: 'ACCOUNT_DISAPPEARED',
        documentId: null,
        affectedField: null,
        accountLoginId: 'u2',
      }),
    ];
    // 本次 u1、u2 皆同時符合兩偵測條件（在職＋過去 RESIGNDT，且皆在 disappearedLoginIds）。
    store.accounts = [
      activeAcc({ loginId: 'u1', resignDate: PAST }),
      activeAcc({ loginId: 'u2', resignDate: PAST }),
    ];

    await svc(store).generateFromSyncPlan(
      syncInput({
        existingAcc: new Map([
          ['u1', existingAcc('u1', 'JAC00')],
          ['u2', existingAcc('u2', 'JAC00')],
        ]),
        disappearedLoginIds: ['u1', 'u2'],
      }),
    );

    const inserted = store.inserted.flat();
    const incon = inserted.filter((c) => c.alertKind === 'DATA_INCONSISTENCY');
    const vanish = inserted.filter((c) => c.alertKind === 'ACCOUNT_DISAPPEARED');
    // DATA_INCONSISTENCY：u1 已 pending 被去重、u2 未 pending（其 pending 屬另一 alertKind）→ 產生 u2。
    expect(incon.map((c) => c.accountLoginId)).toEqual(['u2']);
    // ACCOUNT_DISAPPEARED：u2 已 pending 被去重、u1 未 pending → 產生 u1。
    expect(vanish.map((c) => c.accountLoginId)).toEqual(['u1']);
  });

  it('TS-ORGALERT-012 disappearedLoginIds 為空陣列 → 無 ACCOUNT_DISAPPEARED，其餘三類不受影響', async () => {
    const store = new FakeAlertStore();
    store.accounts = [activeAcc({ loginId: 'incon1', orgCode: 'JAC00', resignDate: PAST })];

    await svc(store).generateFromSyncPlan(
      syncInput({ disappearedLoginIds: [] }),
    );

    expect(store.rows.map((r) => r.alertKind)).toEqual(['DATA_INCONSISTENCY']);
  });

  it('TS-INCON-012 同帳號同時掛已關閉部門且過去 RESIGNDT → 兩類各自獨立產生', async () => {
    const store = new FakeAlertStore();
    // 單一帳號 u1：orgCode=JAD00（已關閉）且 resignDate 過去 → CLOSED_DEPT_PERSON ＋ DATA_INCONSISTENCY。
    store.accounts = [activeAcc({ loginId: 'u1', orgCode: 'JAD00', resignDate: PAST })];

    await svc(store).generateFromSyncPlan(syncInput({ orgUnits: [orgUnit()] }));

    const kinds = store.rows.map((r) => r.alertKind).sort();
    expect(kinds).toEqual(['CLOSED_DEPT_PERSON', 'DATA_INCONSISTENCY']);
  });

  it('TS-ORGALERT-043 兩類提示「產生」全程不寫入 AUDIT_LOG', async () => {
    const store = new FakeAlertStore();
    store.accounts = [activeAcc({ loginId: 'incon1', resignDate: PAST })];
    const audit = new FakeAudit();

    await svc(store, audit).generateFromSyncPlan(
      syncInput({
        existingAcc: new Map([['gone1', existingAcc('gone1', 'JAC00')]]),
        disappearedLoginIds: ['gone1'],
      }),
    );

    expect(store.rows.map((r) => r.alertKind).sort()).toEqual([
      'ACCOUNT_DISAPPEARED',
      'DATA_INCONSISTENCY',
    ]);
    expect(audit.events).toEqual([]);
  });
});

describe('OrgChangeAlertService.resolve × F005 兩類（Route B）', () => {
  it('TS-ORGALERT-030 DATA_INCONSISTENCY 提示可經 resolve 轉為 resolved', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({
        alertKind: 'DATA_INCONSISTENCY',
        documentId: null,
        affectedField: null,
        accountLoginId: 'u1',
      }),
    ];

    const res = await svc(store).resolve('a1', { accountId: 'acc-1' });

    expect(res.status).toBe('resolved');
    expect(res.resolutionKind).toBe('NO_CHANGE_NEEDED');
    expect(res.resolvedBy).toBe('acc-1');
    expect(res.resolvedAt).toEqual(NOW);
  });

  it('TS-ORGALERT-031 ACCOUNT_DISAPPEARED 提示可經 resolve 轉為 resolved', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({
        alertKind: 'ACCOUNT_DISAPPEARED',
        documentId: null,
        affectedField: null,
        accountLoginId: 'u2',
      }),
    ];

    const res = await svc(store).resolve('a1', { accountId: 'acc-1' });

    expect(res.status).toBe('resolved');
    expect(res.resolutionKind).toBe('NO_CHANGE_NEEDED');
  });

  it('TS-ORGALERT-033 已 resolved 之 DATA_INCONSISTENCY 再次 resolve → 409', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({
        alertKind: 'DATA_INCONSISTENCY',
        documentId: null,
        affectedField: null,
        accountLoginId: 'u1',
        status: 'resolved',
        resolutionKind: 'NO_CHANGE_NEEDED',
        resolvedBy: 'acc-first',
      }),
    ];

    await expect(svc(store).resolve('a1', { accountId: 'acc-2' })).rejects.toThrow(
      'ALERT_ALREADY_RESOLVED',
    );
  });

  it('TS-ORGALERT-040 稽核 targetName 為「資料不一致（在職狀態／離職日）」，非「掛於已關閉部門」', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({
        alertKind: 'DATA_INCONSISTENCY',
        documentId: null,
        documentNumber: null,
        affectedField: null,
        personEmployeeNo: 'E001',
        accountLoginId: 'u1',
      }),
    ];
    const audit = new FakeAudit();

    await svc(store, audit).resolve('a1', { accountId: 'acc-1' });

    expect(audit.events[0]).toMatchObject({
      targetType: 'ORG_CHANGE_ALERT',
      targetName: '資料不一致（在職狀態／離職日）',
    });
    expect(audit.events[0].targetName).not.toBe('掛於已關閉部門');
  });

  it('TS-ORGALERT-041 稽核 targetName 為「帳號消失（來源查無）」', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({
        alertKind: 'ACCOUNT_DISAPPEARED',
        documentId: null,
        documentNumber: null,
        affectedField: null,
        personEmployeeNo: 'E002',
        accountLoginId: 'u2',
      }),
    ];
    const audit = new FakeAudit();

    await svc(store, audit).resolve('a1', { accountId: 'acc-1' });

    expect(audit.events[0].targetName).toBe('帳號消失（來源查無）');
  });

  it('TS-ORGALERT-042 兩類稽核 targetNumber 皆為 accountLoginId，非 personEmployeeNo', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({
        alertKind: 'DATA_INCONSISTENCY',
        documentId: null,
        documentNumber: null,
        affectedField: null,
        personEmployeeNo: 'E001',
        accountLoginId: 'u1',
      }),
    ];
    const audit = new FakeAudit();

    await svc(store, audit).resolve('a1', { accountId: 'acc-1' });

    expect(audit.events[0].targetNumber).toBe('u1');
  });
});

describe('OrgChangeAlertService.resolve（Route B）', () => {
  it('TS-F006-040 標記「已確認無需變更」→ resolved + 記錄處理者/時間', async () => {
    const store = new FakeAlertStore();
    store.rows = [pending()];

    const res = await svc(store).resolve('a1', { accountId: 'acc-1' });

    expect(res.status).toBe('resolved');
    expect(res.resolutionKind).toBe('NO_CHANGE_NEEDED');
    expect(res.resolvedBy).toBe('acc-1');
    expect(res.resolvedAt).toEqual(NOW);
    expect(store.rows[0].status).toBe('resolved');
  });

  it('TS-F006-048 顯式 FIELD_UPDATED（多值欄位之人工補登逃生口）', async () => {
    const store = new FakeAlertStore();
    store.rows = [pending({ affectedField: FieldKey.CHIEF_SECONDARY })];

    const res = await svc(store).resolve('a1', { accountId: 'acc-1' }, 'FIELD_UPDATED');

    expect(res.resolutionKind).toBe('FIELD_UPDATED');
    expect(res.resolvedBy).toBe('acc-1');
  });

  it('TS-F006-042 對已 resolved 之提示再次 resolve → 409 ALERT_ALREADY_RESOLVED（原紀錄不變）', async () => {
    const store = new FakeAlertStore();
    const first = new Date('2026-07-21T00:00:00.000Z');
    store.rows = [
      pending({
        status: 'resolved',
        resolutionKind: 'NO_CHANGE_NEEDED',
        resolvedBy: 'acc-first',
        resolvedAt: first,
      }),
    ];

    await expect(svc(store).resolve('a1', { accountId: 'acc-2' })).rejects.toThrow(
      ConflictException,
    );
    await expect(svc(store).resolve('a1', { accountId: 'acc-2' })).rejects.toThrow(
      'ALERT_ALREADY_RESOLVED',
    );
    expect(store.rows[0].resolvedBy).toBe('acc-first');
    expect(store.rows[0].resolvedAt).toEqual(first);
  });

  it('TS-F006-043 id 不存在 → 404 ALERT_NOT_FOUND', async () => {
    const store = new FakeAlertStore();

    await expect(svc(store).resolve('nope', { accountId: 'acc-1' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc(store).resolve('nope', { accountId: 'acc-1' })).rejects.toThrow(
      'ALERT_NOT_FOUND',
    );
  });

  it('TS-F006-041 resolved 後不再出現於 pending 清單', async () => {
    const store = new FakeAlertStore();
    store.rows = [pending(), pending({ id: 'a2', documentId: 'D2' })];
    const s = svc(store);

    await s.resolve('a1', { accountId: 'acc-1' });

    const list = await s.listByStatus('pending');
    expect(list.map((r) => r.id)).toEqual(['a2']);
    const resolved = await s.listByStatus('resolved');
    expect(resolved.map((r) => r.id)).toEqual(['a1']);
    expect(resolved[0].resolvedBy).toBe('acc-1');
  });

  it('TS-F006-055 手動解除寫入稽核事件（ORG_CHANGE_ALERT / ALERT_RESOLVED，無浮水印）', async () => {
    const store = new FakeAlertStore();
    store.rows = [pending()];
    const audit = new FakeAudit();

    await svc(store, audit).resolve('a1', {
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: 'E123',
      roleCode: 'SysAdmin',
    });

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      targetType: 'ORG_CHANGE_ALERT',
      actionType: 'ALERT_RESOLVED',
      targetId: 'a1',
      actorId: 'acc-1',
      targetNumber: 'ICSOP-SRC-101-1-01',
      occurredAt: NOW,
    });
    expect(audit.events[0].watermarkSnapshot).toBeUndefined();
  });

  it('CLOSED_DEPT_PERSON 之稽核以員編為對象顯示', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({
        alertKind: 'CLOSED_DEPT_PERSON',
        documentId: null,
        documentNumber: null,
        affectedField: null,
        personEmployeeNo: 'E777',
        personName: '林小美',
      }),
    ];
    const audit = new FakeAudit();

    await svc(store, audit).resolve('a1', { accountId: 'acc-1' });

    expect(audit.events[0]).toMatchObject({
      targetType: 'ORG_CHANGE_ALERT',
      targetNumber: 'E777',
      targetName: '掛於已關閉部門',
    });
  });

  it('TS-F006-058 稽核寫入失敗不阻斷 resolve 主流程', async () => {
    const store = new FakeAlertStore();
    store.rows = [pending()];
    const audit = new FakeAudit();
    audit.failing = true;

    const res = await svc(store, audit).resolve('a1', { accountId: 'acc-1' });

    expect(res.status).toBe('resolved');
    expect(store.rows[0].status).toBe('resolved');
  });
});

describe('OrgChangeAlertService.autoResolveFromDocumentChange（Route A 服務層）', () => {
  it('對映欄位之 pending 提示 → 自動 resolved（FIELD_UPDATED，actor 取自事件）', async () => {
    const store = new FakeAlertStore();
    store.rows = [pending(), pending({ id: 'a2', affectedField: FieldKey.ESTABLISH_DEPT })];
    const occurredAt = new Date('2026-07-24T05:00:00.000Z');

    await svc(store).autoResolveFromDocumentChange({
      documentId: 'D1',
      affectedFields: [FieldKey.CHIEF_PRIMARY],
      actor: { accountId: 'acc-2' },
      occurredAt,
    });

    expect(store.rows[0]).toMatchObject({
      status: 'resolved',
      resolutionKind: 'FIELD_UPDATED',
      resolvedBy: 'acc-2',
      resolvedAt: occurredAt,
    });
    // 未對映之欄位提示維持 pending。
    expect(store.rows[1].status).toBe('pending');
  });

  it('已 resolved 之列不重複處理（冪等）', async () => {
    const store = new FakeAlertStore();
    store.rows = [pending({ status: 'resolved', resolvedBy: 'acc-old' })];
    const audit = new FakeAudit();

    await svc(store, audit).autoResolveFromDocumentChange({
      documentId: 'D1',
      affectedFields: [FieldKey.CHIEF_PRIMARY],
      actor: { accountId: 'acc-2' },
      occurredAt: NOW,
    });

    expect(store.rows[0].resolvedBy).toBe('acc-old');
    expect(audit.events).toEqual([]);
  });

  it('TS-ORGALERT-032 DATA_INCONSISTENCY／ACCOUNT_DISAPPEARED 無 Route A：文件事件不影響其狀態', async () => {
    const store = new FakeAlertStore();
    store.rows = [
      pending({
        id: 'incon1',
        alertKind: 'DATA_INCONSISTENCY',
        documentId: null,
        affectedField: null,
        accountLoginId: 'u1',
      }),
      pending({
        id: 'vanish1',
        alertKind: 'ACCOUNT_DISAPPEARED',
        documentId: null,
        affectedField: null,
        accountLoginId: 'u2',
      }),
    ];

    // 任意文件欄位變更事件 → 兩類（documentId=null）結構上不可能被 (documentId,affectedField) 命中。
    await svc(store).autoResolveFromDocumentChange({
      documentId: 'D1',
      affectedFields: [FieldKey.CHIEF_PRIMARY],
      actor: { accountId: 'acc-2' },
      occurredAt: NOW,
    });

    expect(store.rows.every((r) => r.status === 'pending')).toBe(true);
  });
});

describe('OrgChangeAlertService.monthlySummary（KPI，D7）', () => {
  it('TS-F006-037 僅加總本月 SYNC_RUN（範圍下推 store，跨月不計入）', async () => {
    const store = new FakeAlertStore();
    store.stats = { created: 8, updated: 31, disabled: 4 };
    store.chiefCount = 2;

    const res = await svc(store).monthlySummary();

    expect(res).toEqual({
      month: '2026-07',
      newPersonCount: 8,
      updatedCount: 31,
      departedDisabledCount: 4,
      pendingChiefAlertCount: 2,
    });
    // 台北時區當月 1 日 00:00（含）～次月 1 日 00:00（不含）。
    expect(store.statsArgs[0][0].toISOString()).toBe('2026-06-30T16:00:00.000Z');
    expect(store.statsArgs[0][1].toISOString()).toBe('2026-07-31T16:00:00.000Z');
  });

  it('TS-F006-038 pendingChiefAlertCount 由 store 之窄口徑（僅當責室長類）提供', async () => {
    const store = new FakeAlertStore();
    store.chiefCount = 2;
    store.rows = [
      pending({ id: 'p1', affectedField: FieldKey.CHIEF_PRIMARY }),
      pending({ id: 'p2', affectedField: FieldKey.CHIEF_PRIMARY, documentId: 'D2' }),
      pending({ id: 'p3', affectedField: FieldKey.ESTABLISH_DEPT, documentId: 'D3' }),
      pending({ id: 'p4', alertKind: 'CLOSED_DEPT_PERSON', documentId: null, affectedField: null }),
    ];
    const s = svc(store);

    const res = await s.monthlySummary();
    const allPending = await s.listByStatus('pending');

    expect(res.pendingChiefAlertCount).toBe(2);
    // 頁籤 badge 為全部 pending（4）——與 KPI 卡口徑刻意不同（OQ-F006-04）。
    expect(allPending).toHaveLength(4);
  });
});
