import { DataSource } from 'typeorm';
import { businessCategoryDisplayName } from '../business-categories/business-category-subcategory';
import { DocumentStatus } from '../documents/document-status';
import { CategoryDocPair } from './category-distribution';

/**
 * F044 §戊 之唯讀查詢（類別掛載 × 文件）。
 *
 * 🔒 `ARCH-G0` **之唯一例外**（architecture-spec §15.1 末）：類別掛載之**去重語意**刻意保留於
 * SQL——`AC-G61` 明文要求沿用 [F043] `AC-01` 之既有口徑，而該口徑之單一真相來源就是
 * `typeorm-business-category.store.ts` 之 `COUNT(DISTINCT d.[documentId])` 下推。
 * ⇒ 本查詢只 `DISTINCT` 到 `(businessCategoryId, documentId)` 這一層（**不 COUNT**），
 *   把「相異文件」留在 SQL、把「這份文件是已公告還是進度中」留給純函式。
 *
 * 🔴 **本檔只做投影／join／DISTINCT**：無狀態分類（禁 `GETUTCDATE()`／SQL `CASE`）、
 * 無遞迴上溯、無排序與截斷。理由＝本輪沒有整合測試 ⇒ 凡落在 SQL 內之邏輯，一條測試都碰不到它。
 * ⚠ 該 `DISTINCT` 之正確性本輪測不到（architecture-spec §15.10 #1）——純函式層仍自行以
 *   `documentId` 去重，SQL 端被改壞時那是唯一還站著的那一道。
 *
 * 🔴 **禁 N+1**：一次 join 取回全部掛載對（實測相異對為千位數以下）。
 */

interface RawPairRow {
  categoryId: string;
  categoryName: string;
  categorySubcategory: string | null;
  categoryStatus: string;
  documentId: string;
  documentStatus: string;
  announcedDate: Date | string | null;
}

/** `Date`／ISO 字串 → `YYYY-MM-DD`（UTC 拆解，`AC-G56`／`AC-G69`）。 */
function toIsoDay(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * 建立「類別 × 文件」掛載對之唯讀 provider。
 * 來源表尚未建立／查詢異常 → 回空陣列（比照既有 store 之容錯；由服務層之 try/catch 決定降級）。
 */
export function makeCategoryDocPairsSource(
  ds: DataSource,
): () => Promise<CategoryDocPair[]> {
  const init = async (): Promise<DataSource> => {
    if (!ds.isInitialized) await ds.initialize();
    return ds;
  };
  return async (): Promise<CategoryDocPair[]> => {
    const d = await init();
    const rows: RawPairRow[] = await d.query(
      `SELECT DISTINCT
              n.[businessCategoryId] AS categoryId,
              c.[name]               AS categoryName,
              c.[subcategory]        AS categorySubcategory,
              c.[status]             AS categoryStatus,
              doc.[id]               AS documentId,
              doc.[status]           AS documentStatus,
              doc.[announcedDate]    AS announcedDate
         FROM [BUSINESS_CATEGORY_DOC] bcd
         JOIN [BUSINESS_CATEGORY_NODE] n ON n.[id] = bcd.[nodeId]
         JOIN [BUSINESS_CATEGORY] c      ON c.[id] = n.[businessCategoryId]
         JOIN [ICSOP_DOCUMENT] doc       ON doc.[id] = bcd.[documentId]`,
    );
    return (rows ?? []).map((r) => ({
      categoryId: r.categoryId,
      // 🔒 沿用 F043 既有組裝（`名稱（子分類）`，全形括號無空白），不另寫第二份。
      displayName: businessCategoryDisplayName({
        name: r.categoryName,
        subcategory: r.categorySubcategory,
      }),
      categoryStatus: r.categoryStatus === 'active' ? 'active' : 'inactive',
      documentId: r.documentId,
      documentStatus: r.documentStatus as DocumentStatus,
      announcedDate: toIsoDay(r.announcedDate),
    }));
  };
}
