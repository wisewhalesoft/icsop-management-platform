import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 索引執行錯誤碼（prototype-alignment · G-ADM-030/031）。
 *
 * INDEX_RUN 失敗時，呼叫端已算出具體錯誤碼（EXTRACTION_FAILED/CHUNKING_FAILED/EMBEDDING_FAILED/
 * INDEX_BUILD_FAILED/REINDEX_FAILED…）但先前僅落 errorMessage、錯誤碼被丟棄。文件索引管理清單失敗列
 * 需顯示錯誤碼、失敗詳情 modal 需「錯誤碼」列 → 新增 [errorCode] 欄承載之。
 *
 * 唯一 schema 變更＝INDEX_RUN 新增 [errorCode] varchar(100) NULL。
 */
export class IndexRunErrorCode1723420800000 implements MigrationInterface {
  name = 'IndexRunErrorCode1723420800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [INDEX_RUN] ADD [errorCode] varchar(100) NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE [INDEX_RUN] DROP COLUMN [errorCode]`);
  }
}
