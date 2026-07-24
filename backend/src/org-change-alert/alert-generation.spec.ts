import { generateDocumentFieldAlerts, docFieldKey } from './alert-generation';
import {
  AlertGenerationInput,
  DocumentAlertRef,
  OrgUnitSnapshot,
} from './org-change-alert.types';
import { NormalizedOrgUnit, NormalizedAccount } from '../org-sync/normalization';
import { ExistingOrgUnit, ExistingAccount } from '../org-sync/change-classification';
import { FieldKey } from '../rbac/field-matrix';

/**
 * F006 §3.2／§3.3 提示產生（DOCUMENT_FIELD）純邏輯。
 *
 * 觸發訊號（人類決策 2026-07-24）：
 *  (a) 當責室長本人部門異動（orgCode 改變、非離職）；
 *  (b) 「原以該人員為 managerEmpNo 之組織單位，改為其他 managerEmpNo」——即該人員已非該室室長。
 *      此為 prototype「升任協理、待確認是否續任當責」情境之忠實可偵測替身
 *      （上游白名單無任何職級/職稱欄位，見 impl log）。
 *  (c) 文件之制定公司/部門/室別/使用部門 對應組織單位異動。
 */

const NOW = new Date('2026-07-24T02:00:00.000Z');
const RUN = 'run-1';

function doc(over: Partial<DocumentAlertRef> = {}): DocumentAlertRef {
  return {
    documentId: 'D1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    draftingCompanyId: null,
    draftingDeptId: null,
    draftingSectionId: null,
    primaryChiefId: null,
    secondaryChiefIds: [],
    usingDeptIds: [],
    ...over,
  };
}

function orgUnit(over: Partial<NormalizedOrgUnit> = {}): NormalizedOrgUnit {
  return {
    companyCode: 'AS',
    orgCode: 'JAC00',
    codePrefix: 'JAC',
    tier: 'SECTION',
    parentCode: 'JA000',
    name: '企業金融室',
    descFull: null,
    managerEmpNo: null,
    isActive: true,
    ...over,
  };
}

function existingOrg(over: Partial<ExistingOrgUnit> = {}): ExistingOrgUnit {
  return {
    orgCode: 'JAC00',
    codePrefix: 'JAC',
    tier: 'SECTION',
    parentCode: 'JA000',
    name: '企金室',
    descFull: null,
    managerEmpNo: null,
    isActive: true,
    ...over,
  };
}

function snapshot(over: Partial<OrgUnitSnapshot> = {}): OrgUnitSnapshot {
  return {
    orgCode: 'JAC00',
    name: '企業金融室',
    descFull: null,
    isActive: true,
    managerEmpNo: null,
    closeDate: null,
    ...over,
  };
}

function acct(over: Partial<NormalizedAccount> = {}): NormalizedAccount {
  return {
    companyCode: 'AS',
    loginId: 'AS0001',
    employeeNo: 'E001',
    name: '陳彥廷',
    email: 'e001@hfcfinance.com.tw',
    orgCode: 'JAC00',
    empActive: true,
    resignDate: null,
    hireDate: null,
    managerEmpNo: null,
    upstreamModifiedAt: NOW,
    ...over,
  };
}

function existingAcct(over: Partial<ExistingAccount> = {}): ExistingAccount {
  return {
    companyCode: 'AS',
    loginId: 'AS0001',
    employeeNo: 'E001',
    name: '陳彥廷',
    email: 'e001@hfcfinance.com.tw',
    orgCode: 'JAB00',
    status: 'active',
    resignDate: null,
    hireDate: null,
    managerEmpNo: null,
    ...over,
  };
}

function input(over: Partial<AlertGenerationInput> = {}): AlertGenerationInput {
  return {
    orgUpdates: [],
    orgBefore: new Map(),
    orgAfter: new Map(),
    accountUpdates: [],
    existingAcc: new Map(),
    documents: [],
    existingPendingKeys: new Set(),
    createdAt: NOW,
    sourceSyncRunId: RUN,
    ...over,
  };
}

describe('generateDocumentFieldAlerts — 當責室長異動（§3.2）', () => {
  it('TS-F006-005 主要室長之部門異動 → 產生「當責室長-主要」提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ orgCode: 'JAC00' })],
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        documents: [doc({ primaryChiefId: 'E001' })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      alertKind: 'DOCUMENT_FIELD',
      documentId: 'D1',
      documentNumber: 'ICSOP-SRC-101-1-01',
      documentName: '車輛分期進件作業',
      affectedField: FieldKey.CHIEF_PRIMARY,
      createdAt: NOW,
      sourceSyncRunId: RUN,
    });
    expect(out[0].personEmployeeNo).toBeNull();
  });

  it('TS-F006-006 次要室長之部門異動 → 產生「當責室長-次要」提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ loginId: 'AS0002', employeeNo: 'E002', orgCode: 'JAC00' })],
        existingAcc: new Map([
          ['AS0002', existingAcct({ loginId: 'AS0002', employeeNo: 'E002', orgCode: 'JAB00' })],
        ]),
        documents: [doc({ secondaryChiefIds: ['E002'] })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].affectedField).toBe(FieldKey.CHIEF_SECONDARY);
    expect(out[0].documentId).toBe('D1');
  });

  it('TS-F006-007 一人身兼多份文件當責室長 → 各自獨立產生提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ orgCode: 'JAC00' })],
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        documents: [
          doc({ documentId: 'D1', primaryChiefId: 'E001' }),
          doc({ documentId: 'D2', documentNumber: 'ICSOP-SRC-101-2-00', secondaryChiefIds: ['E001'] }),
        ],
      }),
    );

    expect(out).toHaveLength(2);
    expect(out.map((a) => [a.documentId, a.affectedField])).toEqual([
      ['D1', FieldKey.CHIEF_PRIMARY],
      ['D2', FieldKey.CHIEF_SECONDARY],
    ]);
  });

  it('TS-F006-008 人員異動但與任何文件當責欄位無關聯 → 不產生提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ loginId: 'AS9', employeeNo: 'E999', orgCode: 'JAC00' })],
        existingAcc: new Map([
          ['AS9', existingAcct({ loginId: 'AS9', employeeNo: 'E999', orgCode: 'JAB00' })],
        ]),
        documents: [doc({ primaryChiefId: 'E001', secondaryChiefIds: ['E002'] })],
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-009 室長姓名/Email 變動但部門未變 → 不產生提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ name: '陳彥廷（改名）', email: 'new@x', orgCode: 'JAB00' })],
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        documents: [doc({ primaryChiefId: 'E001' })],
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-010 室長本人已離職（empActive=false）→ 不產生 F006 提示（走 F005）', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ empActive: false, orgCode: 'JAC00' })],
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        documents: [doc({ primaryChiefId: 'E001' })],
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-011 正規化後部門代碼相同 → 視同未變、不產生提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ orgCode: 'JAB00' })],
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        documents: [doc({ primaryChiefId: 'E001' })],
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-012 before/after 為人員可讀部門名稱（非 orgCode）', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ orgCode: 'JAC00' })],
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        orgBefore: new Map([
          ['JAB00', existingOrg({ orgCode: 'JAB00', name: '車輛行銷室' })],
          ['JAC00', existingOrg({ orgCode: 'JAC00', name: '客服室' })],
        ]),
        orgAfter: new Map([
          ['JAB00', snapshot({ orgCode: 'JAB00', name: '車輛行銷室' })],
          ['JAC00', snapshot({ orgCode: 'JAC00', name: '客服室' })],
        ]),
        documents: [doc({ primaryChiefId: 'E001' })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].beforeValue).toContain('車輛行銷室');
    expect(out[0].beforeValue).toContain('陳彥廷');
    expect(out[0].beforeValue).not.toContain('JAB00');
    expect(out[0].afterValue).toContain('客服室');
  });

  it('TS-F006-013 次要室長已被移除（當下無關聯）→ 不再比對該文件', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ loginId: 'AS0002', employeeNo: 'E002', orgCode: 'JAC00' })],
        existingAcc: new Map([
          ['AS0002', existingAcct({ loginId: 'AS0002', employeeNo: 'E002', orgCode: 'JAB00' })],
        ]),
        documents: [doc({ secondaryChiefIds: [] })],
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-080 當責室長已非該室 managerEmpNo（室長改派）→ 產生「當責室長-主要」提示', () => {
    // 人類決策 (b)：職級/職稱欄位上游不存在，以「原任室長之單位改派他人」為可偵測替身。
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JAB00', name: '車輛行銷室', managerEmpNo: 'E555' })],
        orgBefore: new Map([
          ['JAB00', existingOrg({ orgCode: 'JAB00', name: '車輛行銷室', managerEmpNo: 'E001' })],
        ]),
        orgAfter: new Map([
          ['JAB00', snapshot({ orgCode: 'JAB00', name: '車輛行銷室', managerEmpNo: 'E555' })],
        ]),
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        documents: [doc({ primaryChiefId: 'E001' })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      documentId: 'D1',
      affectedField: FieldKey.CHIEF_PRIMARY,
    });
    expect(out[0].beforeValue).toContain('車輛行銷室');
    expect(out[0].afterValue).toContain('室長');
  });

  it('TS-F006-081 室長改派、該人員為次要室長 → 產生「當責室長-次要」提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JAB00', managerEmpNo: null })],
        orgBefore: new Map([
          ['JAB00', existingOrg({ orgCode: 'JAB00', managerEmpNo: 'E002' })],
        ]),
        documents: [doc({ secondaryChiefIds: ['E002'] })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].affectedField).toBe(FieldKey.CHIEF_SECONDARY);
  });

  it('TS-F006-082 室長改派但原室長非任何文件當責 → 不產生提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JAB00', managerEmpNo: 'E555' })],
        orgBefore: new Map([
          ['JAB00', existingOrg({ orgCode: 'JAB00', managerEmpNo: 'E010' })],
        ]),
        documents: [doc({ primaryChiefId: 'E099' })],
      }),
    );

    expect(out).toEqual([]);
  });
});

describe('generateDocumentFieldAlerts — 制定組織／使用部門（§3.3）', () => {
  it('TS-F006-014 制定室別對應組織單位更名 → 產生「制定室別」提示（含 before/after 名稱）', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JAC00', name: '企業金融室' })],
        orgBefore: new Map([['JAC00', existingOrg({ orgCode: 'JAC00', name: '企金室' })]]),
        documents: [doc({ draftingSectionId: 'JAC00' })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].affectedField).toBe(FieldKey.ESTABLISH_SECTION);
    expect(out[0].beforeValue).toContain('企金室');
    expect(out[0].afterValue).toContain('企業金融室');
  });

  it.each([
    ['draftingCompanyId', FieldKey.ESTABLISH_COMPANY],
    ['draftingDeptId', FieldKey.ESTABLISH_DEPT],
    ['draftingSectionId', FieldKey.ESTABLISH_SECTION],
  ] as const)(
    'TS-F006-015 %s 對應組織單位異動 → affectedField=%s',
    (prop, expected) => {
      const out = generateDocumentFieldAlerts(
        input({
          orgUpdates: [orgUnit({ orgCode: 'JAC00' })],
          orgBefore: new Map([['JAC00', existingOrg({ orgCode: 'JAC00' })]]),
          documents: [doc({ [prop]: 'JAC00' } as Partial<DocumentAlertRef>)],
        }),
      );

      expect(out).toHaveLength(1);
      expect(out[0].affectedField).toBe(expected);
    },
  );

  it('TS-F006-016 使用部門（多值）其中一個部門異動 → 產生「文件使用部門」提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JBB00', name: '徵審室' })],
        orgBefore: new Map([['JBB00', existingOrg({ orgCode: 'JBB00', name: '徵審處' })]]),
        documents: [doc({ usingDeptIds: ['JAA00', 'JBB00'] })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].affectedField).toBe(FieldKey.USING_DEPTS);
    expect(out[0].documentId).toBe('D1');
  });

  it('TS-F006-017 多份文件共用同一使用部門 → 各文件各自獨立產生提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JBB00' })],
        orgBefore: new Map([['JBB00', existingOrg({ orgCode: 'JBB00' })]]),
        documents: [
          doc({ documentId: 'D1', usingDeptIds: ['JBB00'] }),
          doc({ documentId: 'D2', usingDeptIds: ['JBB00'] }),
        ],
      }),
    );

    expect(out).toHaveLength(2);
    expect(out.map((a) => a.documentId)).toEqual(['D1', 'D2']);
  });

  it('TS-F006-018 組織單位 isActive 由 true 轉 false → 亦觸發文件提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JAD00', name: '已裁撤室', isActive: false })],
        orgBefore: new Map([
          ['JAD00', existingOrg({ orgCode: 'JAD00', name: '已裁撤室', isActive: true })],
        ]),
        documents: [doc({ draftingDeptId: 'JAD00' })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].affectedField).toBe(FieldKey.ESTABLISH_DEPT);
    expect(out[0].afterValue).toContain('關閉');
  });

  it('TS-F006-019 組織單位為本次新建（無 before 可比較）→ 不產生提示', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JZZ00' })],
        orgBefore: new Map(), // create：同步前無此列
        documents: [doc({ usingDeptIds: ['JZZ00'] })],
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-020 部門主管改派但文件當責室長非該主管 → 僅「制定室別」不含「當責室長」', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JAC00', managerEmpNo: 'E020' })],
        orgBefore: new Map([
          ['JAC00', existingOrg({ orgCode: 'JAC00', managerEmpNo: 'E010' })],
        ]),
        documents: [doc({ draftingSectionId: 'JAC00', primaryChiefId: 'E099' })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].affectedField).toBe(FieldKey.ESTABLISH_SECTION);
  });
});

describe('generateDocumentFieldAlerts — 去重（§3.5）與不覆寫（§3.6）', () => {
  it('TS-F006-030 同文件同欄位已有 pending → 略過（不建立第二筆）', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ orgCode: 'JAC00' })],
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        documents: [doc({ primaryChiefId: 'E001' })],
        existingPendingKeys: new Set([docFieldKey('D1', FieldKey.CHIEF_PRIMARY)]),
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-031 不同文件同欄位種類 → 個別鍵不互相抑制', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [orgUnit({ orgCode: 'JBB00' })],
        orgBefore: new Map([['JBB00', existingOrg({ orgCode: 'JBB00' })]]),
        documents: [
          doc({ documentId: 'D1', draftingDeptId: 'JBB00' }),
          doc({ documentId: 'D2', draftingDeptId: 'JBB00' }),
        ],
        existingPendingKeys: new Set([docFieldKey('D1', FieldKey.ESTABLISH_DEPT)]),
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].documentId).toBe('D2');
  });

  it('同一批次內同鍵重複命中 → 僅產生一筆（批次內去重）', () => {
    const out = generateDocumentFieldAlerts(
      input({
        orgUpdates: [
          orgUnit({ orgCode: 'JAA00' }),
          orgUnit({ orgCode: 'JBB00' }),
        ],
        orgBefore: new Map([
          ['JAA00', existingOrg({ orgCode: 'JAA00' })],
          ['JBB00', existingOrg({ orgCode: 'JBB00' })],
        ]),
        documents: [doc({ usingDeptIds: ['JAA00', 'JBB00'] })],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].affectedField).toBe(FieldKey.USING_DEPTS);
  });

  it('TS-F006-032 產出僅為 ORG_CHANGE_ALERT 建立指令，不含任何文件欄位覆寫（AC3）', () => {
    const out = generateDocumentFieldAlerts(
      input({
        accountUpdates: [acct({ orgCode: 'JAC00' })],
        existingAcc: new Map([['AS0001', existingAcct({ orgCode: 'JAB00' })]]),
        documents: [doc({ primaryChiefId: 'E001' })],
      }),
    );

    // 純函式無 IO：其回傳僅為提示建立指令，結構上不可能改寫文件欄位。
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(
      [
        'accountLoginId',
        'affectedField',
        'afterValue',
        'alertKind',
        'beforeValue',
        'createdAt',
        'deptCloseDate',
        'deptName',
        'deptOrgCode',
        'documentId',
        'documentName',
        'documentNumber',
        'personEmployeeNo',
        'personName',
        'sourceSyncRunId',
      ].sort(),
    );
  });
});
