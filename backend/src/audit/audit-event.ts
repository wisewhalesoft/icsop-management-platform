import { randomUUID } from 'crypto';
import {
  AuditAccessEvent,
  AuditRow,
  AuditTargetRefRequiredError,
} from './audit.types';

/**
 * 稽核事件 → 落地列之純轉換（F023 寫入核心）。
 *  - 產生 UUID、source 預設 DIRECT、身分/浮水印快照逐字保存（不重新推導，AC3）。
 *  - 依 targetType 將 targetId 對映至條件必填欄（documentId／lifecycleId／formId），其餘為 null。
 *  - targetId 缺漏 → AuditTargetRefRequiredError（AUDIT_TARGET_REF_REQUIRED），不產生列（TS-005）。
 *
 * ⚠ 純函式、不做任何 IO；不吞例外（驗證錯誤須讓 recordAccess 上拋，與 outbox IO 失敗之非阻斷區分）。
 */
export function buildAuditRow(event: AuditAccessEvent): AuditRow {
  if (!event.targetId) {
    throw new AuditTargetRefRequiredError();
  }

  // 依 targetType 對映對象參照欄（二擇一；其餘恆 null，避免 polymorphic 交叉外洩）。
  let documentId: string | null = null;
  let documentNumber: string | null = null;
  let lifecycleId: string | null = null;
  let lifecycleName: string | null = null;
  let formId: string | null = null;

  switch (event.targetType) {
    case 'DOCUMENT':
    case 'DOCUMENT_CHANGE_LOG':
      documentId = event.targetId;
      documentNumber = event.targetNumber ?? null;
      break;
    case 'LIFECYCLE':
    case 'LIFECYCLE_CHANGE_LOG':
      lifecycleId = event.targetId;
      lifecycleName = event.targetNumber ?? null;
      break;
    case 'USAGE_FORM':
      formId = event.targetId;
      documentNumber = event.targetNumber ?? null;
      break;
  }

  return {
    id: randomUUID(),
    accountId: event.actorId,
    employeeNo: event.employeeNo ?? null,
    name: event.actorName ?? null,
    company: event.company ?? null,
    department: event.department ?? null,
    section: event.section ?? null,
    roleCode: event.roleCode ?? null,
    targetType: event.targetType,
    actionType: event.actionType,
    documentId,
    documentNumber,
    lifecycleId,
    lifecycleName,
    formId,
    targetName: event.targetName ?? null,
    watermarkSnapshot: event.watermarkSnapshot ?? null,
    occurredAt: event.occurredAt,
    source: event.source ?? 'DIRECT',
  };
}
