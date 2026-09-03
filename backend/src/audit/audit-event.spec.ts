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

/**
 * F039 附錄管理 — architecture-spec.md §3.6 決策三：additive 擴充，
 * 新增 targetType='APPENDIX' 聯集成員與 switch 分支。**不修改**上方既有 5 種既有案例
 * 之任何斷言或 it.each 測試主體（該迴圈之型別分支邏輯僅覆蓋既有型別，刻意不納入 APPENDIX，
 * 避免動到既有斷言字元）——本區塊獨立驗證 APPENDIX 分支，purely additive。
 *
 * ⚠ 高風險點（decision 三，與 USAGE_FORM 既有落差不同）：AC-27 要求 APPENDIX 稽核列
 * **同時**落地 appendixId 與 documentId，不可沿用 USAGE_FORM 分支之單一 targetId 對映模式
 * （USAGE_FORM 分支現行 documentId 恆為 null，屬既有落差、非本次修正範圍）。
 */
describe('buildAuditRow — TS-F039-001 附錄（APPENDIX）下載事件', () => {
  const APPENDIX_DOWNLOAD: AuditAccessEvent = {
    targetType: 'APPENDIX',
    actionType: 'DOWNLOAD',
    actorId: 'acc-1',
    actorName: '王小明',
    employeeNo: '22345',
    company: '和潤企業股份有限公司',
    department: '債權管理部',
    section: '法催一室',
    roleCode: 'User',
    targetId: 'ax-42',
    documentId: 'doc-7',
    occurredAt: OCCURRED,
  } as AuditAccessEvent;

  it('appendixId 記錄為 targetId，且 documentId 亦一併落地（AC-27，不同於 USAGE_FORM 分支）', () => {
    const row = buildAuditRow(APPENDIX_DOWNLOAD);
    expect(row.targetType).toBe('APPENDIX');
    expect(row.actionType).toBe('DOWNLOAD');
    expect(row.appendixId).toBe('ax-42');
    expect(row.documentId).toBe('doc-7');
    expect(row.lifecycleId).toBeNull();
    expect(row.formId).toBeNull();
  });

  it('watermarkSnapshot 未提供 → 收斂為 null（附錄下載不燒錄浮水印，AC-29）', () => {
    const row = buildAuditRow(APPENDIX_DOWNLOAD);
    expect(row.watermarkSnapshot).toBeNull();
  });
});

/**
 * F043 業務/功能類別管理 — architecture-spec.md §14.6.2 決策 E3：additive 新增
 * targetType='BUSINESS_CATEGORY'／'BUSINESS_CATEGORY_CHANGE_LOG'，新增 8 個 actionType，
 * 且 AUDIT_LOG 新增 `businessCategoryId`（比照 `lifecycleId`）／`nodeId`（本功能獨有）兩欄。
 * `documentId` 沿用既有欄（掛載/移除事件之 documentId 落於既有欄，非新欄）。
 *
 * ⚠ 對實作全盲：buildAuditRow 尚未認得 'BUSINESS_CATEGORY' 之 targetType——本區塊於本環撰寫時
 * 之預期紅燈為「switch 落至 default 或拋出未知 targetType」，非既有 5＋1 種既有分支之改動。
 */
describe('buildAuditRow — F043 決策 E3：業務/功能類別（BUSINESS_CATEGORY）事件', () => {
  const BC_VIEW = {
    targetType: 'BUSINESS_CATEGORY',
    actionType: 'BUSINESS_CATEGORY_VIEW',
    actorId: 'acc-1',
    actorName: '李慧玲',
    employeeNo: '20233',
    company: '和潤企業股份有限公司',
    department: '債權管理部',
    section: '法催一室',
    roleCode: 'ICSOPAdmin',
    targetId: 'bc-1',
    targetNumber: '授信（消金）',
    occurredAt: OCCURRED,
    watermarkSnapshot: 'wm',
  } as unknown as AuditAccessEvent;

  it('BUSINESS_CATEGORY/BUSINESS_CATEGORY_VIEW → businessCategoryId=targetId、nodeId/documentId 皆為 null（無節點脈絡之既有動作）', () => {
    const row = buildAuditRow(BC_VIEW) as unknown as Record<string, unknown>;
    expect(row.targetType).toBe('BUSINESS_CATEGORY');
    expect(row.actionType).toBe('BUSINESS_CATEGORY_VIEW');
    expect(row.businessCategoryId).toBe('bc-1');
    expect(row.nodeId ?? null).toBeNull();
    expect(row.documentId ?? null).toBeNull();
    expect(row.lifecycleId).toBeNull(); // 不得誤入既有 LIFECYCLE 對映分支
  });

  it('🔴 AC-31：BUSINESS_CATEGORY_DOC_MOUNTED → businessCategoryId／nodeId／documentId 三者皆落地（新增/移除掛載之必要脈絡）', () => {
    const row = buildAuditRow({
      ...BC_VIEW,
      actionType: 'BUSINESS_CATEGORY_DOC_MOUNTED',
      nodeId: 'n1',
      documentId: 'd1',
    } as unknown as AuditAccessEvent) as unknown as Record<string, unknown>;
    expect(row.actionType).toBe('BUSINESS_CATEGORY_DOC_MOUNTED');
    expect(row.businessCategoryId).toBe('bc-1');
    expect(row.nodeId).toBe('n1');
    expect(row.documentId).toBe('d1');
  });

  it('BUSINESS_CATEGORY_DOC_UNMOUNTED → 同一組欄位對映（掛載與移除共用同一映射規則）', () => {
    const row = buildAuditRow({
      ...BC_VIEW,
      actionType: 'BUSINESS_CATEGORY_DOC_UNMOUNTED',
      nodeId: 'n2',
      documentId: 'd2',
    } as unknown as AuditAccessEvent) as unknown as Record<string, unknown>;
    expect(row.nodeId).toBe('n2');
    expect(row.documentId).toBe('d2');
  });

  it('BUSINESS_CATEGORY_CHANGE_LOG/BUSINESS_CATEGORY_CHANGELOG_VIEW → businessCategoryId=targetId、無浮水印時收斂為 null（比照 LIFECYCLE_CHANGE_LOG 既有先例）', () => {
    const row = buildAuditRow({
      targetType: 'BUSINESS_CATEGORY_CHANGE_LOG',
      actionType: 'BUSINESS_CATEGORY_CHANGELOG_VIEW',
      actorId: 'a',
      targetId: 'bc-1',
      targetNumber: '授信（消金）',
      occurredAt: OCCURRED,
    } as unknown as AuditAccessEvent) as unknown as Record<string, unknown>;
    expect(row.targetType).toBe('BUSINESS_CATEGORY_CHANGE_LOG');
    expect(row.businessCategoryId).toBe('bc-1');
    expect(row.watermarkSnapshot).toBeNull();
  });

  it('未帶 targetId → AUDIT_TARGET_REF_REQUIRED（比照既有 5 種 targetType 之條件必填規則）', () => {
    expect(() =>
      buildAuditRow({
        targetType: 'BUSINESS_CATEGORY',
        actionType: 'BUSINESS_CATEGORY_VIEW',
        actorId: 'acc-1',
        targetId: '',
        occurredAt: OCCURRED,
      } as unknown as AuditAccessEvent),
    ).toThrow('AUDIT_TARGET_REF_REQUIRED');
  });

  it('DOCUMENT 事件（既有分支）不外洩 businessCategoryId／nodeId（回歸鎖定：既有分支未因本 delta 混入新欄之誤值）', () => {
    const row = buildAuditRow(DOC_VIEW) as unknown as Record<string, unknown>;
    expect(row.businessCategoryId ?? null).toBeNull();
    expect(row.nodeId ?? null).toBeNull();
  });
});
