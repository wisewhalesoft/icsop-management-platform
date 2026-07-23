import { Inject, Injectable, Logger } from '@nestjs/common';
import { buildAuditRow } from './audit-event';
import { resolveAuditQuery } from './access-history-filter';
import {
  AUDIT_OUTBOX_STORE,
  AUDIT_STORE,
  AuditAccessEvent,
  AuditOutboxStore,
  AuditQueryFilters,
  AuditQueryScope,
  AuditRow,
  AuditStore,
  AuditWriter,
  Page,
} from './audit.types';

/**
 * F023 稽核寫入器（共用基礎，D 契約）。
 *  - recordAccess：純轉換（含 targetId 驗證，失敗上拋）→ 經 Outbox 非阻斷入列；
 *    Outbox IO 失敗一律吞掉（不阻斷瀏覽，AC4／NFR-003；比照 scheduled-org-sync 之靜音吞例外）。
 *  - processOutboxRetry：搬遷 pending → AuditStore（append 以 row.id 冪等，§5.6），逐筆 try/catch，
 *    失敗筆維持 pending 供下次重試，整批不外拋（AC4 後半）。
 *  - queryHistory：取回 scope 全部列後以純函式 resolveAuditQuery 篩選/排序/分頁（F024）。
 *
 * ⚠ AuditStore 結構上不暴露 update/delete（decision E，AC5 App 層）；此處亦無任何竄改路徑。
 */
@Injectable()
export class AuditWriterService implements AuditWriter {
  private readonly logger = new Logger(AuditWriterService.name);

  constructor(
    @Inject(AUDIT_OUTBOX_STORE) private readonly outbox: AuditOutboxStore,
    @Inject(AUDIT_STORE) private readonly store: AuditStore,
  ) {}

  async recordAccess(event: AuditAccessEvent): Promise<void> {
    // 驗證/轉換失敗（AUDIT_TARGET_REF_REQUIRED）須上拋——屬呼叫端 payload 錯誤，非 IO 暫時性失敗。
    const row = buildAuditRow(event);
    try {
      await this.outbox.enqueue(row);
    } catch (err) {
      // 最終防線：Outbox 亦不可用時不中斷主流程（僅記錄，不驗內容）。
      this.logger.error(
        `稽核入列失敗（已吞，不阻斷瀏覽）id=${row.id}: ${(err as Error)?.message}`,
      );
    }
  }

  async processOutboxRetry(): Promise<void> {
    let pending;
    try {
      pending = await this.outbox.listPending();
    } catch (err) {
      this.logger.error(`讀取 Outbox pending 失敗（已吞）: ${(err as Error)?.message}`);
      return;
    }
    for (const rec of pending) {
      try {
        await this.store.append(rec.row); // 以 row.id 冪等
        await this.outbox.markDone(rec.id);
      } catch (err) {
        // 單筆失敗維持 pending，供下次重試；不中斷整批。
        this.logger.warn(
          `補償搬遷失敗（維持 pending）id=${rec.id}: ${(err as Error)?.message}`,
        );
      }
    }
  }

  async queryHistory(
    scope: AuditQueryScope,
    filters: AuditQueryFilters,
  ): Promise<Page<AuditRow>> {
    const rows = await this.store.listAll(scope);
    return resolveAuditQuery(rows, filters, scope);
  }
}
