import { Injectable } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AuditRecorder, UsageFormAuditEvent } from './usage-forms.store';

/**
 * 使用表單調閱稽核 → 真實 AuditWriter 之轉接器（取代佔位 LoggingAuditRecorder）。
 *
 * 將 F018 之 UsageFormAuditEvent 對映為 F023 共用契約 AuditAccessEvent（USAGE_FORM 變體）：
 *   - targetType：'USAGE_FORM'
 *   - actionType：'DOWNLOAD'（前台下載表單）
 *   - targetId ：formId（AuditWriter 內部依 targetType 落至 AUDIT_LOG.formId）
 *   - actorId  ：accountId（操作者）
 *   - occurredAt：伺服器時間戳
 *   - 🔴 身分快照五欄＋watermarkSnapshot＋documentId：2026-08-21 起完整轉送（見下方修正說明）
 *
 * recordAccess 內部經 Outbox 非阻斷入列，故下載主流程不因稽核 IO 失敗而中斷（NFR-003）。
 * 呼叫端（UsageFormsService）已於下載成功後才呼叫本 record，權限/歸屬把關在前。
 */
/**
 * 🔴🔴 **2026-08-21 修正既有缺口**（architecture-spec §11.6／§11.11 #20）：本轉接器過去
 * **完全未轉送** `employeeNo`／`company`／`department`／`section`／`roleCode`／`watermarkSnapshot`
 * 六個欄位——即便呼叫端已正確組出 `watermarkSnapshot`，adapter 在轉送前把它丟棄了。
 *
 * **為何過去測不到**（同型結構性盲區，比照 §10.10 CJK 字型 bug）：既有單元測試以**替身**
 * `AuditRecorder` 驗證「服務層有沒有算對」，從未經過本轉接器；`AuditAccessEvent` 之這些欄位
 * 皆為選填 ⇒ 編譯期亦不示警。此缺口已違反既有已核准之 `AC-D5`／`AC-D14`，
 * 並且是 `AC-N17`／`AC-N51`（後台燒錄下載寫入正確身分快照）之必要前提。
 *
 * 🔴 `watermarkSnapshot` 以 `?? null` 顯式落值（非 `undefined`）：`undefined` 會讓
 * `buildAuditRow` 之 `?? null` 看似補上，但「本來就沒有快照」與「快照被丟掉了」在資料層
 * 無法區分——顯式 null 是「非 PDF ⇒ 無快照」之**斷言**，不是預設值。
 */
@Injectable()
export class AuditWriterRecorder implements AuditRecorder {
  constructor(private readonly writer: AuditWriterService) {}

  async record(event: UsageFormAuditEvent): Promise<void> {
    await this.writer.recordAccess({
      targetType: 'USAGE_FORM',
      actionType: event.actionType,
      targetId: event.formId,
      // AC-N17：文件脈絡下之下載（前台／後台唯讀詳情頁）落該文件 id；
      // 池管理頁脈絡（AC-N51）無所屬文件 ⇒ null。
      documentId: event.documentId ?? null,
      actorId: event.accountId,
      // 🔴 2026-09-01 delta：姓名為 2026-08-21 那批「六欄逐一轉送」之漏網（見事件型別註解）。
      actorName: event.actorName ?? null,
      employeeNo: event.employeeNo ?? null,
      company: event.company ?? null,
      department: event.department ?? null,
      section: event.section ?? null,
      roleCode: event.roleCode ?? null,
      watermarkSnapshot: event.watermarkSnapshot ?? null,
      occurredAt: new Date(),
    });
  }
}
