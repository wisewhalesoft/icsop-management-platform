import { Injectable } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AccountAuditRecorder, AccountRoleChangeEvent } from './accounts.store';

/**
 * 角色變更稽核 → F023 共用 AuditWriter 之轉接器
 * （🔴 2026-08-25 角色自動化 delta，裁定 `Q4.5`）。
 *
 * 對映：
 *   - targetType ：'ACCOUNT'
 *   - actionType ：'ROLE_ASSIGNED'
 *   - targetId   ：**被異動之帳號 id**（buildAuditRow 之 ACCOUNT 分支落至 AUDIT_LOG.targetAccountId）
 *   - actorId    ：**操作者**帳號 id（→ AUDIT_LOG.accountId）
 *   - targetName ：變更快照（`舊角色 → 新角色`）
 *
 * 🔴 **本轉接器必須逐欄轉送身分快照**（employeeNo／company／department／section／roleCode）。
 * 既有 `appendices` 之同名轉接器曾因漏轉這六欄而在 2026-08-21 被揪出（見該檔檔頭），
 * 根因是「單元測試以替身驗服務層，從未經過轉接器；且這些欄位皆選填 ⇒ 編譯期不示警」。
 * 此處刻意重複該教訓之處置：**全部欄位顯式 `?? null`**，使「沒有值」與「被丟掉」在程式碼上可分辨。
 *
 * ⚠ 不吞例外：呼叫端於角色寫入成功後才呼叫。`recordAccess` 內部經 Outbox 非阻斷入列，
 * 故此處之例外僅可能來自契約違反（如 targetId 缺漏），應讓它上拋而非靜默失敗——
 * 稽核靜默失敗正是本 delta 要消除的問題本身。
 */
@Injectable()
export class AccountAuditWriterRecorder implements AccountAuditRecorder {
  constructor(private readonly writer: AuditWriterService) {}

  async record(event: AccountRoleChangeEvent): Promise<void> {
    await this.writer.recordAccess({
      targetType: 'ACCOUNT',
      actionType: 'ROLE_ASSIGNED',
      targetId: event.accountId,
      targetName: event.summary,
      actorId: event.actorAccountId,
      actorName: event.actorName ?? null,
      employeeNo: event.actorEmployeeNo ?? null,
      company: event.actorCompany ?? null,
      department: event.actorDepartment ?? null,
      section: event.actorSection ?? null,
      roleCode: event.actorRoleCode ?? null,
      occurredAt: new Date(),
    });
  }
}
