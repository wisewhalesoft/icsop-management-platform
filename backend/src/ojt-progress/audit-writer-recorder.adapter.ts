import { Injectable } from '@nestjs/common';
import { AuditIdentityService } from '../audit/audit-identity.service';
import { AuditWriterService } from '../audit/audit-writer.service';
import { OjtAuditEvent, OjtAuditRecorder } from './ojt-progress.store';

/**
 * 場次稽核 → F023 共用契約 `AuditAccessEvent`（`OJT_SESSION` 變體）之轉接器
 * （比照 `appendices/audit-writer-recorder.adapter.ts` 之既有形狀）。
 *
 * 對映（`AC-18`／`AC-19`；`buildAuditRow` 之 `OJT_SESSION` 分支）：
 *   - targetType  ：`'OJT_SESSION'`（第 9 個值；`targetId`＝場次 id，場次為第一等資源）
 *   - actionType  ：`'OJT_SESSION_UPLOAD'` ／ `'OJT_SESSION_DELETE'`（兩個獨立值）
 *   - documentId  ：場次所屬文件；documentNumber 落 `targetNumber` 快照
 *   - orgCode     ：🔴 本 delta 之 additive 欄——沒有它，稽核只能回答「哪份文件的場次動了」，
 *                   回答不了「哪個使用單位的」，而使用單位正是本 feature 的最小追蹤單位
 *
 * 🔴 **身分快照六欄一律經 `AuditIdentityService` 解析**（2026-09-01 delta）。
 *
 * ⚠ 本檔上一版的檔頭寫著「身分快照六欄逐一顯式轉送」，實際只轉送了 `actorName` 與
 * `employeeNo` 兩欄——公司／部門／處室／角色四欄從未落值（dev 實測：`OJT_SESSION_UPLOAD`
 * 之 2 列四欄全空）。註解寫了不等於程式做了；本輪把該承諾改成一次方法呼叫，
 * 使「六欄齊不齊」不再取決於這份清單有沒有人維護。
 *
 * 🔴 `watermarkSnapshot` 恆為 `null`：登記／刪除**非浮水印動作**（`AC-18` 明訂），
 * 型別已鎖死，此處為**顯式斷言**而非預設值。
 *
 * ⚠ 本模組**不**注入 `WatermarkBurnerService`（不同於附錄／使用表單之下載路徑）：
 * 場次登記不燒錄浮水印，沒有「浮水印身分」這個概念可解析；六欄一律取自呼叫者 session
 * ＋ ORG_UNIT 解析，與其餘十個稽核寫入點同一來源。
 */
@Injectable()
export class OjtAuditWriterRecorder implements OjtAuditRecorder {
  constructor(
    private readonly writer: AuditWriterService,
    private readonly identity: AuditIdentityService,
  ) {}

  async record(event: OjtAuditEvent): Promise<void> {
    const identity = await this.identity.resolve({
      name: event.name,
      employeeNo: event.employeeNo,
      // ⚠ `event.orgCode` 是場次所屬**使用單位**，不是操作者所屬單位——此處必須用
      //   `actorOrgCode`，用錯會把辦訓練的單位寫成操作者的部門。
      companyCode: event.actorCompanyCode,
      orgCode: event.actorOrgCode,
      roleCode: event.actorRoleCode,
    });
    await this.writer.recordAccess({
      targetType: 'OJT_SESSION',
      actionType: event.actionType,
      // 場次 id；缺值時退回 documentId 以免 `AUDIT_TARGET_REF_REQUIRED` 使整筆稽核被丟棄
      // （稽核寫入失敗不得阻斷場次建立，但也不該因缺一個 id 就整列消失）。
      targetId: event.sessionId || event.documentId,
      documentId: event.documentId,
      orgCode: event.orgCode,
      targetNumber: event.documentNumber || null,
      actorId: event.accountId,
      actorName: identity.actorName,
      employeeNo: identity.employeeNo,
      company: identity.company,
      department: identity.department,
      section: identity.section,
      roleCode: identity.roleCode,
      watermarkSnapshot: null,
      occurredAt: new Date(),
    });
  }
}
