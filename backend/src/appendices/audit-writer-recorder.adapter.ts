import { Injectable } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AppendixAuditEvent, AuditRecorder } from './appendices.store';

/**
 * 附錄調閱稽核 → 真實 AuditWriter 之轉接器（architecture-spec §3.6 決策三）。
 *
 * 將 F039 之 AppendixAuditEvent 對映為 F023 共用契約 AuditAccessEvent（APPENDIX 變體）：
 *   - targetType ：'APPENDIX'
 *   - actionType ：'DOWNLOAD'（前台下載附錄；附錄無其他動作類型）
 *   - targetId   ：appendixId（buildAuditRow 之 APPENDIX 分支落至 AUDIT_LOG.appendixId）
 *   - documentId ：該附錄所屬下載來源文件 id
 *   - actorId    ：accountId（操作者）
 *   - occurredAt ：伺服器時間戳
 *
 * ⚠ **與 usage-forms 之同名轉接器的關鍵差異**：本轉接器**必須轉送 documentId**。
 * 既有 usage-forms/audit-writer-recorder.adapter.ts 未轉送，導致 USAGE_FORM 列之
 * AUDIT_LOG.documentId 恆為 null（既有落差，非本次修正範圍）；AC-27 明確要求附錄之稽核列
 * **同時**落地 appendixId 與 documentId，故不得沿用該「單一 targetId」轉送模式。
 *
 * recordAccess 內部經 Outbox 非阻斷入列（§5.5）；本 record 不吞例外，由呼叫端決定
 * （AppendicesService 於下載成功後才呼叫，權限/歸屬把關在前）。
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

  async record(event: AppendixAuditEvent): Promise<void> {
    await this.writer.recordAccess({
      targetType: 'APPENDIX',
      actionType: event.actionType,
      targetId: event.appendixId,
      // AC-N57：後台池管理頁脈絡無所屬文件 ⇒ null（前台仍為該次下載之來源文件 id）。
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
