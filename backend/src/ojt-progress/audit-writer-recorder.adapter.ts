import { Injectable } from '@nestjs/common';
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
 * 🔴 **身分快照六欄逐一顯式轉送**（`?? null`）：本 repo 已於 2026-08-21 記取
 * appendices 轉接器「服務層算對了、adapter 在轉送前把欄位丟掉」之缺口——該類缺口
 * 因為單元測試以替身 recorder 驗證服務層、且 `AuditAccessEvent` 各欄皆選填而
 * **編譯期與測試期雙雙無感**。此處逐欄寫出即為該教訓之落實。
 *
 * 🔴 `watermarkSnapshot` 恆為 `null`：登記／刪除**非浮水印動作**（`AC-18` 明訂），
 * 型別已鎖死，此處為**顯式斷言**而非預設值。
 *
 * ⚠ 本模組**不**注入 `WatermarkBurnerService` 解析身分快照（不同於附錄／使用表單之下載路徑）：
 * 場次登記不燒錄浮水印，沒有「浮水印身分」這個概念可解析；快照欄一律取自呼叫者 session。
 */
@Injectable()
export class OjtAuditWriterRecorder implements OjtAuditRecorder {
  constructor(private readonly writer: AuditWriterService) {}

  async record(event: OjtAuditEvent): Promise<void> {
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
      actorName: event.name ?? null,
      employeeNo: event.employeeNo ?? null,
      watermarkSnapshot: null,
      occurredAt: new Date(),
    });
  }
}
