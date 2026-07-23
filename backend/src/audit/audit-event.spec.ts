import { buildAuditRow } from './audit-event';
import { AuditAccessEvent } from './audit.types';

/**
 * F023 稽核事件 → 落地列之純轉換（buildAuditRow）。涵蓋 TS-F023-001/002/003/004/005/016。
 * 驗證欄位對映、source 預設、watermark 逐字保存、targetType 條件必填、5 種 targetType 全集。
 */

const OCCURRED = new Date('2026-07-16T14:32:08.000Z');

const DOC_VIEW: AuditAccessEvent = {
  targetType: 'DOCUMENT',
  actionType: 'VIEW',
  actorId: 'acc-1',
  actorName: '王小明',
  employeeNo: '22345',
  company: '和潤企業股份有限公司',
  department: '營運管理部',
  section: '審查室',
  roleCode: 'User',
  targetId: 'doc-1',
  targetNumber: 'ICSOP-SRC-101-1-01',
  targetName: '車輛分期進件作業',
  watermarkSnapshot:
    '22345-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-16 14:32:08',
  occurredAt: OCCURRED,
  source: 'DIRECT',
};

describe('buildAuditRow — TS-F023-001 VIEW 事件欄位對映', () => {
  it('DOCUMENT/VIEW → 逐欄與輸入相等、產生 UUID、對象對映 documentId/documentNumber', () => {
    const row = buildAuditRow(DOC_VIEW);
    expect(row.id).toMatch(/[0-9a-f-]{36}/i);
    expect(row.accountId).toBe('acc-1');
    expect(row.name).toBe('王小明');
    expect(row.employeeNo).toBe('22345');
    expect(row.company).toBe('和潤企業股份有限公司');
    expect(row.department).toBe('營運管理部');
    expect(row.section).toBe('審查室');
    expect(row.roleCode).toBe('User');
    expect(row.targetType).toBe('DOCUMENT');
    expect(row.actionType).toBe('VIEW');
    expect(row.documentId).toBe('doc-1');
    expect(row.documentNumber).toBe('ICSOP-SRC-101-1-01');
    expect(row.targetName).toBe('車輛分期進件作業');
    expect(row.lifecycleId).toBeNull();
    expect(row.lifecycleName).toBeNull();
    expect(row.formId).toBeNull();
    expect(row.occurredAt).toBe(OCCURRED);
    expect(row.watermarkSnapshot).toBe(DOC_VIEW.watermarkSnapshot);
    expect(row.source).toBe('DIRECT');
  });

  it('source 未提供 → 預設 DIRECT', () => {
    const { source: _omit, ...noSource } = DOC_VIEW;
    const row = buildAuditRow(noSource as AuditAccessEvent);
    expect(row.source).toBe('DIRECT');
  });
});

describe('buildAuditRow — TS-F023-002 DOWNLOAD/PRINT 各自獨立', () => {
  it('同文件同人 DOWNLOAD 與 PRINT → 各有唯一 id、actionType 不互相覆寫', () => {
    const dl = buildAuditRow({ ...DOC_VIEW, actionType: 'DOWNLOAD' });
    const pr = buildAuditRow({ ...DOC_VIEW, actionType: 'PRINT' });
    expect(dl.id).not.toBe(pr.id);
    expect(dl.actionType).toBe('DOWNLOAD');
    expect(pr.actionType).toBe('PRINT');
    expect(dl.documentId).toBe('doc-1');
    expect(pr.documentId).toBe('doc-1');
  });
});

describe('buildAuditRow — TS-F023-003 watermarkSnapshot 逐字保存', () => {
  it('不重新推導/正規化，寫入值與輸入完全相等', () => {
    const wm = 'emp-姓名-公司-部-室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-16 14:32:08';
    const row = buildAuditRow({ ...DOC_VIEW, watermarkSnapshot: wm });
    expect(row.watermarkSnapshot).toBe(wm);
  });
});

describe('buildAuditRow — TS-F023-004 使用表單下載', () => {
  it('USAGE_FORM → formId 記錄、documentId/lifecycleId 皆為 null', () => {
    const row = buildAuditRow({
      ...DOC_VIEW,
      targetType: 'USAGE_FORM',
      actionType: 'DOWNLOAD',
      targetId: 'form-9',
      targetNumber: 'ICSOP-PUC-101-1-01',
    });
    expect(row.targetType).toBe('USAGE_FORM');
    expect(row.formId).toBe('form-9');
    expect(row.documentId).toBeNull();
    expect(row.lifecycleId).toBeNull();
  });
});

describe('buildAuditRow — TS-F023-005 targetType 條件必填矩陣', () => {
  it('LIFECYCLE 未帶 targetId → AUDIT_TARGET_REF_REQUIRED，不產生列', () => {
    expect(() =>
      buildAuditRow({
        targetType: 'LIFECYCLE',
        actionType: 'LIFECYCLE_VIEW',
        actorId: 'acc-1',
        targetId: '',
        occurredAt: OCCURRED,
      }),
    ).toThrow('AUDIT_TARGET_REF_REQUIRED');
  });

  it('DOCUMENT 未帶 targetId → AUDIT_TARGET_REF_REQUIRED', () => {
    expect(() =>
      buildAuditRow({
        targetType: 'DOCUMENT',
        actionType: 'VIEW',
        actorId: 'acc-1',
        targetId: '',
        occurredAt: OCCURRED,
      }),
    ).toThrow('AUDIT_TARGET_REF_REQUIRED');
  });

  it('DOCUMENT 事件不外洩 lifecycleId（誤帶交叉欄由聯集結構杜絕，對映後 lifecycleId 恆 null）', () => {
    const row = buildAuditRow({ ...DOC_VIEW });
    expect(row.lifecycleId).toBeNull();
    expect(row.lifecycleName).toBeNull();
  });
});

describe('buildAuditRow — TS-F023-016 targetType 全集（5 種皆可寫入）', () => {
  const cases: AuditAccessEvent[] = [
    { targetType: 'DOCUMENT', actionType: 'VIEW', actorId: 'a', targetId: 'd1', targetNumber: 'N1', occurredAt: OCCURRED, watermarkSnapshot: 'wm' },
    { targetType: 'USAGE_FORM', actionType: 'DOWNLOAD', actorId: 'a', targetId: 'f1', occurredAt: OCCURRED, watermarkSnapshot: 'wm' },
    { targetType: 'LIFECYCLE', actionType: 'LIFECYCLE_VIEW', actorId: 'a', targetId: 'lc1', targetNumber: '銷售及收款循環', occurredAt: OCCURRED, watermarkSnapshot: 'wm' },
    { targetType: 'DOCUMENT_CHANGE_LOG', actionType: 'CHANGE_LOG_VIEW', actorId: 'a', targetId: 'd1', targetNumber: 'N1', occurredAt: OCCURRED },
    { targetType: 'LIFECYCLE_CHANGE_LOG', actionType: 'LIFECYCLE_CHANGELOG_VIEW', actorId: 'a', targetId: 'lc1', targetNumber: '採購及付款循環', occurredAt: OCCURRED },
  ];

  it.each(cases)('$targetType/$actionType → 成功寫入且對象欄位對映正確', (ev) => {
    const row = buildAuditRow(ev);
    expect(row.targetType).toBe(ev.targetType);
    expect(row.actionType).toBe(ev.actionType);
    if (ev.targetType === 'DOCUMENT' || ev.targetType === 'DOCUMENT_CHANGE_LOG') {
      expect(row.documentId).toBe(ev.targetId);
      expect(row.lifecycleId).toBeNull();
    } else if (ev.targetType === 'LIFECYCLE' || ev.targetType === 'LIFECYCLE_CHANGE_LOG') {
      expect(row.lifecycleId).toBe(ev.targetId);
      expect(row.documentId).toBeNull();
    } else {
      expect(row.formId).toBe(ev.targetId);
    }
  });

  it('變更類（無浮水印）watermarkSnapshot 收斂為 null，不視為錯誤', () => {
    const row = buildAuditRow(cases[3]);
    expect(row.watermarkSnapshot).toBeNull();
  });
});
