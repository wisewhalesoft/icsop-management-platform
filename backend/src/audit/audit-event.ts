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
  let appendixId: string | null = null;
  let targetAccountId: string | null = null;
  let orgCode: string | null = null;

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
    // 🔴 D9 delta（`AC-N17`）：`documentId` 自本輪起於「文件脈絡之下載」路徑落值
    // （`downloadFormRaw()`），池管理頁脈絡（`downloadFromPool()`）維持 null。
    // 📝 被推翻之既有落差逐字保留供追溯：OLD> 「USAGE_FORM 列之 AUDIT_LOG.documentId 恆為 null」
    // ——該落差在「後台不寫稽核」之舊語意下無人受害，`AC-N17` 要求寫稽核後即不再成立。
    case 'USAGE_FORM':
      formId = event.targetId;
      documentId = event.documentId ?? null;
      documentNumber = event.targetNumber ?? null;
      break;
    // 🔴 D9 delta（F016 `AC-N31`）：OJT 上傳事件之 targetId 本身即為 documentId。
    case 'DOCUMENT_ATTACHMENT':
      documentId = event.targetId;
      documentNumber = event.targetNumber ?? null;
      break;
    // F039：附錄下載**同時**落地 appendixId 與 documentId（AC-27）——刻意不沿用
    // USAGE_FORM 分支之「單一 targetId」模式（該分支 documentId 恆 null 為既有落差）。
    case 'APPENDIX':
      appendixId = event.targetId;
      documentId = event.documentId ?? null;
      documentNumber = event.targetNumber ?? null;
      break;
    // 🔴 2026-08-25 角色自動化 delta：targetId＝**被異動之帳號** id（非操作者，操作者為 actorId）。
    // 刻意不落入既有四個參照欄之任一——角色異動不是調閱，混入會污染 F024 之類型篩選。
    case 'ACCOUNT':
      targetAccountId = event.targetId;
      break;
    // 🔴 F042 E11 delta（`AC-18`／`AC-19`）：場次事件之 targetId＝OJT_SESSION.id（不落任一
    // 既有參照欄——場次不是文件、不是附件），另落 documentId 與本 delta 新增之 orgCode 兩維。
    case 'OJT_SESSION':
      documentId = event.documentId;
      documentNumber = event.targetNumber ?? null;
      orgCode = event.orgCode;
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
    appendixId,
    targetAccountId,
    orgCode,
    targetName: event.targetName ?? null,
    watermarkSnapshot: event.watermarkSnapshot ?? null,
    occurredAt: event.occurredAt,
    source: event.source ?? 'DIRECT',
  };
}
