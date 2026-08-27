import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 移除 `ICSOP_DOCUMENT.draftingCompanyId` —— 「制定公司」收斂為單一欄位（2026-08-27 裁定）。
 *
 * 🔴 **為何這一欄零資訊量**：它存的是「該公司 ROOT 節點之 `ORG_UNIT.orgCode`」，而
 *  - AS／AD／AJ 三家的 ROOT 代碼**都是 `'00000'`**（各公司獨立編碼），拿它根本分不出公司；
 *  - **AE 沒有 ROOT 列**，該公司之文件此欄必為 NULL。
 * 也就是說整欄的值域只有 `'00000'` 與 `NULL` 兩種，公司別完全由 `companyCode` 承載。
 * 本庫實測：591 筆文件中 455 筆為 `'00000'`、136 筆為 `NULL`，**無任何一筆帶有公司代碼**。
 *
 * 裁定內容：「制定公司」即 `companyCode`，顯示為公司主檔**全稱**（和潤企業股份有限公司），
 * 取代原先由 `draftingCompanyId` 解析出的 ROOT 單位名（和潤本部）。
 *
 * ⚠ **為何是 DROP 而非留著不讀不寫**：留著死欄位就是下一次「兩份真相」的溫床。此前的 500 事故
 * （`companyCode` 未接寫入路徑）與稽核公司欄退化（`companyFullName` 存的其實是簡稱）都源自
 * 「同一件事有兩個承載體、其一悄悄失準」。此欄無下游 FK、無索引、無任何讀取端殘留。
 *
 * ⚠ **變更歷程之歷史列不受影響**：`DOCUMENT_CHANGE_LOG` 為 append-only，其中 `field` 值為
 * `'draftingCompanyId'` 的歷史列照舊存在且照舊顯示為「制定公司」（`change-labels.ts` 保留舊鍵
 * 對映）。本 migration 只動 `ICSOP_DOCUMENT` 之欄位。
 *
 * ⚠ **down() 只還原結構，不還原值**：原值可由 `companyCode` 完全推導（該公司有 ROOT 列 →
 * `'00000'`，否則 NULL），但那需要查 `ORG_UNIT` 且屬臆測性回填；此處誠實地留 NULL。
 */
export class DropDraftingCompanyId1724803200000 implements MigrationInterface {
  name = 'DropDraftingCompanyId1724803200000';

  public async up(q: QueryRunner): Promise<void> {
    // 防禦：欄位不存在時不拋錯（允許於已手動清理之環境重跑）。
    await q.query(`
      IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('ICSOP_DOCUMENT') AND [name] = 'draftingCompanyId'
      )
      ALTER TABLE [ICSOP_DOCUMENT] DROP COLUMN [draftingCompanyId]
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('ICSOP_DOCUMENT') AND [name] = 'draftingCompanyId'
      )
      ALTER TABLE [ICSOP_DOCUMENT] ADD [draftingCompanyId] varchar(10) NULL
    `);
  }
}
