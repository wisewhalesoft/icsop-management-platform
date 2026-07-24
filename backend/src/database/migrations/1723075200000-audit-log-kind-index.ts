import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F024 P95（NFR-001）／OQ-AQ-01：AUDIT_LOG 之 kind 篩選＋時間範圍/排序組合索引。
 *
 * 背景：F023 既有索引（IX_AUDIT_LOG_accountId / documentId / occurredAt / (documentId,occurredAt) /
 * (accountId,occurredAt)）皆無涵蓋 targetType——但 F024 之 kind 篩選（文件/循環/變更）對映為
 * targetType 之等值/IN 清單，且恆搭配 occurredAt 範圍過濾＋新到舊排序。
 *
 * 新增 (targetType, occurredAt) 組合索引：
 *  - 鍵序「等值鍵在前（targetType，低基數 3-6 值，供 IN seek）、範圍鍵在後（occurredAt，供範圍掃描＋
 *    ORDER BY occurredAt DESC 免額外 Sort）」——與 queryPage 之下推 WHERE/ORDER 對齊（OQ-AQ-01）。
 *  - 不含 person/target 之文字欄：其為前置萬用字元之 LIKE（無法 index seek），入索引無助益、徒增維護成本。
 *
 * ⚠ 時間戳 1723075200000 為 audit-query track 保留（跳過 1722988800000／doc-changelog track 佔用，
 *   避免檔名碰撞；合併時中央確認）。IF EXISTS 判斷使重複執行冪等（append-only 表之索引可安全重建）。
 */
export class AuditLogKindIndex1723075200000 implements MigrationInterface {
  name = 'AuditLogKindIndex1723075200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AUDIT_LOG_targetType_occurredAt' AND object_id = OBJECT_ID('[AUDIT_LOG]'))
         CREATE INDEX [IX_AUDIT_LOG_targetType_occurredAt] ON [AUDIT_LOG] ([targetType],[occurredAt])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AUDIT_LOG_targetType_occurredAt' AND object_id = OBJECT_ID('[AUDIT_LOG]'))
         DROP INDEX [IX_AUDIT_LOG_targetType_occurredAt] ON [AUDIT_LOG]`,
    );
  }
}
