import { DataSource, In, IsNull, Not } from 'typeorm';
import { Account } from '../database/entities/account.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { LifecycleChangeLog } from '../database/entities/lifecycle-change-log.entity';
import { SyncRun } from '../database/entities/sync-run.entity';
import { lifecycleDisplayName } from '../lifecycle/lifecycle-subcategory';
import {
  DashboardActivityItem,
  accountDisabledText,
  documentCreatedText,
  documentDownloadedText,
  lifecycleChangedText,
  orgSyncCompletedText,
} from './dashboard-activity';
import { DashboardActivityProviders } from './dashboard-activity.service';

/**
 * 「最近活動」五種來源之真實唯讀查詢（各自 ORDER BY 時間 DESC TOP n；下推 SQL）。
 * 反循環：比照 dashboard-counts.ts，直接以 DataSource 讀 entity，不匯入各功能模組。
 * 查詢異常由上層 DashboardActivityService.safe 收斂為空陣列（此處保持查詢單純）。
 *
 * 時間一律以 `toISOString()`（UTC）輸出；相對時間之在地化由前端以瀏覽器時區完成。
 */
export function makeTypeOrmDashboardActivity(
  ds: DataSource,
): DashboardActivityProviders {
  const init = async (): Promise<DataSource> => {
    if (!ds.isInitialized) await ds.initialize();
    return ds;
  };
  const iso = (d: Date | null): string => (d ? d.toISOString() : '');

  return {
    // 建立文件：ICSOP_DOCUMENT.createdAt（取自文件本身而非變更日誌 —— 編號/書名為當前值）。
    async DOCUMENT_CREATED(limit: number): Promise<DashboardActivityItem[]> {
      const d = await init();
      const rows = await d.getRepository(IcsopDocument).find({
        order: { createdAt: 'DESC' },
        take: limit,
        select: { id: true, documentNumber: true, documentName: true, createdAt: true },
      });
      return rows.map((r) => ({
        id: `doc:${r.id}`,
        kind: 'DOCUMENT_CREATED' as const,
        text: documentCreatedText(r.documentNumber, r.documentName),
        occurredAt: iso(r.createdAt),
      }));
    },

    // 組織同步：僅成功之執行（running 尚未有結果、failed 屬異常提示而非「活動」）。
    async ORG_SYNC_COMPLETED(limit: number): Promise<DashboardActivityItem[]> {
      const d = await init();
      const rows = await d.getRepository(SyncRun).find({
        where: { status: 'success', endedAt: Not(IsNull()) },
        order: { endedAt: 'DESC' },
        take: limit,
        select: { id: true, triggerType: true, changeCount: true, endedAt: true },
      });
      return rows.map((r) => ({
        id: `sync:${r.id}`,
        kind: 'ORG_SYNC_COMPLETED' as const,
        text: orgSyncCompletedText(r.triggerType, r.changeCount),
        occurredAt: iso(r.endedAt),
      }));
    },

    // 停用帳號：以 disabledAt 排序（未落時間戳之歷史列無從定位於時間軸 → 排除）。
    async ACCOUNT_DISABLED(limit: number): Promise<DashboardActivityItem[]> {
      const d = await init();
      const rows = await d.getRepository(Account).find({
        where: { status: 'disabled', disabledAt: Not(IsNull()) },
        order: { disabledAt: 'DESC' },
        take: limit,
        select: { id: true, loginId: true, name: true, disableReason: true, disabledAt: true },
      });
      return rows.map((r) => ({
        id: `acct:${r.id}`,
        kind: 'ACCOUNT_DISABLED' as const,
        text: accountDisabledText(r.loginId, r.name, r.disableReason),
        occurredAt: iso(r.disabledAt),
      }));
    },

    // 循環結構變更：F038 日誌之 summary 已為人類可讀，僅補上循環名（取當前值，比照 F038 AC-D2 ④）。
    async LIFECYCLE_CHANGED(limit: number): Promise<DashboardActivityItem[]> {
      const d = await init();
      const rows = await d.getRepository(LifecycleChangeLog).find({
        order: { occurredAt: 'DESC' },
        take: limit,
        select: { id: true, lifecycleId: true, summary: true, occurredAt: true },
      });
      const ids = [...new Set(rows.map((r) => r.lifecycleId).filter(Boolean))];
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const lcs = await d.getRepository(Lifecycle).find({
          where: { id: In(ids) },
          select: { id: true, name: true, subcategory: true },
        });
        for (const lc of lcs) names.set(lc.id, lifecycleDisplayName(lc));
      }
      return rows.map((r) => ({
        id: `lcchg:${r.id}`,
        kind: 'LIFECYCLE_CHANGED' as const,
        text: lifecycleChangedText(names.get(r.lifecycleId) ?? null, r.summary),
        occurredAt: iso(r.occurredAt),
      }));
    },

    /**
     * 文件被下載：AUDIT_LOG 之文件下載事件（documentNumber／targetName＝下載當下之快照）。
     *
     * 🔴 真庫實跑（2026-08-27）發現：85 筆下載稽核中 **22 筆兩個快照欄皆為 null**（documentId 則
     * 恆非 null）——部分寫入路徑未帶 targetNumber/targetName。若直用快照，該列會顯示成
     * 「— — 被下載（某人）」，於儀表板等同雜訊。⇒ 快照缺漏者以 documentId 批次回查
     * ICSOP_DOCUMENT 當前值補位（比照 typeorm-lifecycle-display-names 之批次 In 查法）。
     * 文件已被硬刪而查無者仍落「—」佔位（不隱藏該次下載事實）。
     * 稽核列本身不變（append-only）；此處僅為**顯示層**補位，不回寫。
     */
    async DOCUMENT_DOWNLOADED(limit: number): Promise<DashboardActivityItem[]> {
      const d = await init();
      const rows = await d.getRepository(AuditLog).find({
        where: { targetType: 'DOCUMENT', actionType: 'DOWNLOAD' },
        order: { occurredAt: 'DESC' },
        take: limit,
        select: {
          id: true,
          documentId: true,
          documentNumber: true,
          targetName: true,
          name: true,
          occurredAt: true,
        },
      });
      const needLookup = [
        ...new Set(
          rows
            .filter((r) => !r.documentNumber && !r.targetName && r.documentId)
            .map((r) => r.documentId as string),
        ),
      ];
      const docs = new Map<string, { documentNumber: string; documentName: string }>();
      if (needLookup.length > 0) {
        const found = await d.getRepository(IcsopDocument).find({
          where: { id: In(needLookup) },
          select: { id: true, documentNumber: true, documentName: true },
        });
        for (const doc of found) {
          docs.set(doc.id, {
            documentNumber: doc.documentNumber,
            documentName: doc.documentName,
          });
        }
      }
      return rows.map((r) => {
        const fallback = r.documentId ? docs.get(r.documentId) : undefined;
        return {
          id: `dl:${r.id}`,
          kind: 'DOCUMENT_DOWNLOADED' as const,
          text: documentDownloadedText(
            r.documentNumber ?? fallback?.documentNumber ?? null,
            r.targetName ?? fallback?.documentName ?? null,
            r.name,
          ),
          occurredAt: iso(r.occurredAt),
        };
      });
    },
  };
}
