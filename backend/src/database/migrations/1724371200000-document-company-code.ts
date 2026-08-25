import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ICSOP_DOCUMENT.companyCode` ＋ `DOC_USING_DEPT.companyCode` —— 多公司之文件歸屬根因修正
 * （B 階段，開放 AD／AE／AJ）。
 *
 * 🔴 **在此之前，文件無法自證屬於哪家公司**：`draftingCompanyId`／`draftingDeptId`／
 * `draftingSectionId` 三欄存的都是裸 `ORG_UNIT.orgCode`，而 `orgCode` 是 5 碼部門代碼、
 * **每家公司各自從 `00000`（Root）獨立編碼**——AS 的 `A0000` 與 AD 的 `A0000` 字串相同、
 * 意義完全不同。`ORG_UNIT` 之唯一鍵為 `(companyCode, orgCode)`，故單憑這三欄無從得知
 * 該用哪家公司去解析部門名稱。同理 `DOC_USING_DEPT.orgCode`（文件使用部門，多值）亦然。
 *
 * **造成的靜默錯誤**（皆不拋例外、不留痕跡）：
 *  - 部門／處室名稱顯示為別家公司之單位，或查無而留白（F017 清單、F019 前台、F020 浮水印）。
 *  - 🔴 **F041「業務」子分類之資料列可見性誤判**：`isUsingDeptMatched` 以裸 `orgCode` 做前綴
 *    比對，AD 使用者之部門代碼若與某 AS 文件之使用部門字串相同，該文件會被誤判為可見
 *    （越權瀏覽）。此為本次修正中唯一的**安全性**缺陷。
 *
 * **回填策略**：既有列全部 backfill 為 `'AS'`——本系統自上線以來僅同步過 AS 一家公司
 * （契約 §10 v1.0 之範圍決策），故現存文件與使用部門必然全屬 AS，此回填為事實還原而非臆測。
 *
 * ⚠ **本 migration 不改變任何既有行為**：欄位加上、值填好，但讀寫路徑之接線（以 companyCode
 * 過濾／解析）屬程式碼變更，於同批次一併提交。
 */
export class DocumentCompanyCode1724371200000 implements MigrationInterface {
  name = 'DocumentCompanyCode1724371200000';

  public async up(q: QueryRunner): Promise<void> {
    // --- ICSOP_DOCUMENT ---
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] ADD [companyCode] varchar(10) NULL`);
    await q.query(
      `UPDATE [ICSOP_DOCUMENT] SET [companyCode] = 'AS' WHERE [companyCode] IS NULL`,
    );
    await q.query(
      `ALTER TABLE [ICSOP_DOCUMENT] ALTER COLUMN [companyCode] varchar(10) NOT NULL`,
    );
    await q.query(
      `CREATE INDEX [IX_ICSOP_DOCUMENT_companyCode] ON [ICSOP_DOCUMENT] ([companyCode])`,
    );

    // --- DOC_USING_DEPT ---
    // 使用部門之公司別必然等同其所屬文件之公司別；以 JOIN 回填，不另行臆測。
    await q.query(`ALTER TABLE [DOC_USING_DEPT] ADD [companyCode] varchar(10) NULL`);
    await q.query(`
      UPDATE ud
      SET ud.[companyCode] = d.[companyCode]
      FROM [DOC_USING_DEPT] ud
      INNER JOIN [ICSOP_DOCUMENT] d ON d.[id] = ud.[documentId]
    `);
    // 防禦：孤兒列（FK 為 ON DELETE CASCADE，理論上不存在）亦收斂為 AS，使 NOT NULL 可成立。
    await q.query(
      `UPDATE [DOC_USING_DEPT] SET [companyCode] = 'AS' WHERE [companyCode] IS NULL`,
    );
    await q.query(
      `ALTER TABLE [DOC_USING_DEPT] ALTER COLUMN [companyCode] varchar(10) NOT NULL`,
    );
    await q.query(
      `CREATE INDEX [IX_DOC_USING_DEPT_company_org] ON [DOC_USING_DEPT] ([companyCode], [orgCode])`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX [IX_DOC_USING_DEPT_company_org] ON [DOC_USING_DEPT]`);
    await q.query(`ALTER TABLE [DOC_USING_DEPT] DROP COLUMN [companyCode]`);
    await q.query(`DROP INDEX [IX_ICSOP_DOCUMENT_companyCode] ON [ICSOP_DOCUMENT]`);
    await q.query(`ALTER TABLE [ICSOP_DOCUMENT] DROP COLUMN [companyCode]`);
  }
}
