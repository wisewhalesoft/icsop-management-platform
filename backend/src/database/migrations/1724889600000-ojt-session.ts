import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F042「OJT 進度管理」（E11，2026-08-28 人類閘門定案）：新建 `OJT_SESSION`，並將既有
 * 單份覆蓋式 `DOCUMENT_ATTACHMENT(type='OJT_SIGNIN')` 以 **1:1 所有權轉移**遷入。
 *
 * 權威：docs/specs/data-model.md#ojt-session-entity ／ #ojt-session-migration（`OQ-E11-01=C`）；
 * docs/specs/features/F042-ojt-progress-management.md `AC-26`。
 *
 * 🔴 **建表與資料遷移刻意同在一支 migration**（data-model #ojt-session-migration 明文：
 * 「資料遷移與列舉退場為同一次資料層事件，非分兩批」）。TypeORM 之 migration 預設包在單一
 * 交易內 ⇒ `INSERT` 與 `DELETE` 同交易成立，不存在「已刪附件但場次未建」之中間態。
 *
 * 🔴 **1:1，非依使用單位數展開**（`AC-26` 硬性底線）：一份簽到檔只能證明**一個**單位辦過訓練，
 * 依使用單位展開會把未經證實之完訓事實憑空複製到未實際完訓之單位。故 `orgCode = NULL`
 * （待歸位），由 ICSOPAdmin 於待歸位工作台手動歸位。
 *
 * 🔴 **`blobPath` 沿用原值、不物理複製、不搬移**：所有權自 `DOCUMENT_ATTACHMENT` 完整移交
 * `OJT_SESSION`，使每個 `blobPath` 恆為單一擁有者 ⇒ 刪除路徑沿用既有「刪列即回收 blob」之
 * 假設即可，不需比照 `APPENDIX_POOL` 之引用計數。
 *
 * 🔴 **`trainingDate` 為最佳近似值**：真實訓練日期已不可考，取 `DATE(uploadedAt)`。因場次
 * 不可編輯（`OQ-E11-16=B`），近似值有誤時之更正路徑為 ICSOPAdmin 刪除後重新登記。
 *
 * 🔴 **`orgCode` 對 `DOC_USING_DEPT` 刻意不建 FK**（見 data-model #ojt-session-consistency）：
 * 使用部門編輯採 delete-then-insert 全量取代，以 FK 指向其代理鍵會使任何一次編輯 CASCADE
 * 抹掉該文件全部場次。改以值比對之衍生 join。
 *
 * 🔴 `orgCode varchar(10)` 沿用資料庫預設 collation（`_BIN`），不覆寫——本欄為系統代碼
 * （`VW_DEPT_SQL.CODE` 之精確參照），比對語意為精確相等，無使用者輸入之大小寫變異
 * （比照 `USAGE_FORM_DRAFTING_DEPT.orgCode` 之既有處置）。
 *
 * 🔴 **本 migration 必須對真庫實跑**（單元測試證明不了資料表存在、亦證明不了舊列已遷移）。
 */
export class OjtSession1724889600000 implements MigrationInterface {
  name = 'OjtSession1724889600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE [OJT_SESSION] (
        [id] uniqueidentifier NOT NULL CONSTRAINT [DF_OJT_SESSION_id] DEFAULT NEWSEQUENTIALID(),
        [documentId] uniqueidentifier NOT NULL,
        [orgCode] varchar(10) NULL,
        [companyCode] varchar(10) NOT NULL,
        [orphanedAt] datetime2 NULL,
        [trainingDate] date NOT NULL,
        [fileName] nvarchar(400) NOT NULL,
        [blobPath] varchar(1000) NOT NULL,
        [contentType] varchar(200) NOT NULL,
        [size] bigint NOT NULL,
        [uploadedBy] varchar(100) NOT NULL,
        [uploadedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_OJT_SESSION] PRIMARY KEY ([id]),
        CONSTRAINT [FK_OJT_SESSION_document] FOREIGN KEY ([documentId])
          REFERENCES [ICSOP_DOCUMENT]([id]) ON DELETE CASCADE
      )`);

    // 🔴 **非唯一**（同一 (documentId, orgCode) 可累積多筆場次，與 DOC_USING_DEPT 之複合
    // **唯一**索引刻意不同）。供 TAB2 分組查詢與文件層 ojtStatus 富化之批次聚合。
    await q.query(
      `CREATE INDEX [IX_OJT_SESSION_doc_org] ON [OJT_SESSION] ([documentId], [orgCode])`,
    );
    await q.query(`CREATE INDEX [IX_OJT_SESSION_doc] ON [OJT_SESSION] ([documentId])`);
    // TAB1「最近完成」之 30 天窗口掃描。
    await q.query(`CREATE INDEX [IX_OJT_SESSION_uploadedAt] ON [OJT_SESSION] ([uploadedAt])`);

    // ── 1:1 所有權轉移（步驟 1／2：INSERT）────────────────────────────────
    // `companyCode` 取自其文件（恆等同文件之 companyCode，比照 DOC_USING_DEPT 之多公司不變式）。
    // ⚠ INNER JOIN：`DOCUMENT_ATTACHMENT.documentId` 無 FK，理論上可能殘留指向已刪文件之列；
    // 該類列已無任何程式路徑可觸及（其文件不存在），且新表之 FK 亦不允許其存在。
    await q.query(`
      INSERT INTO [OJT_SESSION]
        ([documentId], [orgCode], [companyCode], [orphanedAt], [trainingDate],
         [fileName], [blobPath], [contentType], [size], [uploadedBy], [uploadedAt])
      SELECT
        a.[documentId],
        NULL,                              -- 待歸位（AC-26；1:1，不依使用單位展開）
        d.[companyCode],
        NULL,                              -- 遷移列自始非孤兒
        CAST(a.[uploadedAt] AS date),      -- 最佳近似值（真實訓練日期不可考）
        a.[fileName],
        a.[blobPath],                      -- 沿用原值：同一 Blob 物件，非物理複製
        a.[contentType],
        a.[size],
        a.[uploadedBy],
        a.[uploadedAt]
      FROM [DOCUMENT_ATTACHMENT] a
      INNER JOIN [ICSOP_DOCUMENT] d ON d.[id] = a.[documentId]
      WHERE a.[type] = 'OJT_SIGNIN'`);

    // ── 1:1 所有權轉移（步驟 2／2：DELETE）────────────────────────────────
    // 🔴 遷移後 `DOCUMENT_ATTACHMENT` 不得再有任何 `OJT_SIGNIN` 列（`OQ-E11-11=A` 之收斂：
    // 該列舉值完全移除）——故不加 EXISTS 條件，指向已刪文件之殘列一併清除。
    await q.query(`DELETE FROM [DOCUMENT_ATTACHMENT] WHERE [type] = 'OJT_SIGNIN'`);
  }

  /**
   * 反向遷移：把待歸位（`orgCode IS NULL`）之場次還原為 `OJT_SIGNIN` 附件，再刪表。
   *
   * ⚠ **並非完全對稱、且刻意如此**：已由使用者歸位（`orgCode` 有值）或經正常登記流程新增之
   * 場次**不還原**——舊模型為「每文件單份覆蓋」，承載不下「多單位 × 多場次」；硬還原只會在
   * `(documentId, type)` 之 filtered unique index 上撞唯一鍵，或悄悄丟棄除第一筆外的全部場次。
   * 這是模型反轉之本質後果，非本 down() 之缺陷。
   */
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO [DOCUMENT_ATTACHMENT]
        ([documentId], [type], [fileName], [blobPath], [contentType], [size], [uploadedBy], [uploadedAt])
      SELECT
        s.[documentId], 'OJT_SIGNIN', s.[fileName], s.[blobPath],
        s.[contentType], s.[size], s.[uploadedBy], s.[uploadedAt]
      FROM [OJT_SESSION] s
      WHERE s.[orgCode] IS NULL`);

    await q.query(`DROP INDEX [IX_OJT_SESSION_uploadedAt] ON [OJT_SESSION]`);
    await q.query(`DROP INDEX [IX_OJT_SESSION_doc] ON [OJT_SESSION]`);
    await q.query(`DROP INDEX [IX_OJT_SESSION_doc_org] ON [OJT_SESSION]`);
    await q.query(`DROP TABLE [OJT_SESSION]`);
  }
}
