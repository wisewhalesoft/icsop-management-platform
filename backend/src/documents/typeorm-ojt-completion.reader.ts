import { DataSource } from 'typeorm';
import { chunkByParamBudget } from '../org-sync/param-batching';
import {
  OjtCompletionReader,
  OjtCompletionSummary,
} from './ojt-completion.reader';

/**
 * 文件層 OJT 完成事實之 TypeORM 實作（F042 `AC-04`／`AC-21`；data-model §建議查詢形狀）。
 *
 * 反循環：**不匯入 `OjtProgressModule`**，自建窄 adapter 直接讀 `OJT_SESSION`／`DOC_USING_DEPT`
 * 兩張表（唯讀跨表直讀，§3.1）。
 *
 * 🔴 **效能紅線（`AC-J15` ⑤）：恰 2 次批次查詢，往返數與文件筆數無關**（每次再依 MSSQL 之
 * 2100 參數上限切批——切批之次數只與**參數量**有關，仍非 N+1）。
 *
 * 🔴 **兩個口徑上的刻意選擇，皆為 `AC-17` 明訂之封閉界線**：
 *  ① `Q1` 之分母**不套用 `ORG_UNIT.isActive` 過濾**——裁撤單位之排除只作用於 TAB1 之覆蓋率／
 *     完成率（`AC-14`／`AC-15`），不影響文件層狀態。若對本欄也套過濾，同一份文件會因為某個
 *     單位被裁撤而**憑空變成「已全部完成」**，那是畫面說謊。
 *  ② `Q2` 之 `INNER JOIN DOC_USING_DEPT` 天然排除兩種不該計入分子者：**孤兒場次**
 *     （`orgCode` 已不在當下使用部門集合內）與**待歸位列**（`orgCode IS NULL` 恆不匹配）。
 *     ⚠ 判定因此建立在**集合成員關係**上、而非 `orphanedAt` 旗標上——即使某條 `usingDeptIds`
 *     patch 路徑漏跑了孤兒化 `UPDATE`，本查詢仍然正確。
 */
export class TypeOrmOjtCompletionReader implements OjtCompletionReader {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async getCompletionByDocument(
    documentIds: string[],
  ): Promise<Map<string, OjtCompletionSummary>> {
    const out = new Map<string, OjtCompletionSummary>();
    const ids = [...new Set(documentIds.filter((x) => !!x))];
    if (ids.length === 0) return out;
    const ds = await this.init();

    // Q1：各文件之「總使用單位數」（分母）。
    for (const batch of chunkByParamBudget(ids, 1, 1000)) {
      const rows: { documentId: string; totalUnits: number }[] = await ds.query(
        `SELECT ud.documentId AS documentId, COUNT(*) AS totalUnits
           FROM DOC_USING_DEPT ud
          WHERE ud.documentId IN (${batch.map((_, i) => `@${i}`).join(',')})
          GROUP BY ud.documentId`,
        batch,
      );
      for (const r of rows) {
        out.set(r.documentId, { totalUnits: Number(r.totalUnits), completedOrgCodes: [] });
      }
    }

    // Q2：各文件之「已完成單位代碼」（分子；DISTINCT——同一單位辦兩場仍只算完成一次）。
    for (const batch of chunkByParamBudget(ids, 1, 1000)) {
      const rows: { documentId: string; orgCode: string }[] = await ds.query(
        `SELECT DISTINCT s.documentId AS documentId, s.orgCode AS orgCode
           FROM OJT_SESSION s
           INNER JOIN DOC_USING_DEPT ud
              ON ud.documentId = s.documentId AND ud.orgCode = s.orgCode
          WHERE s.documentId IN (${batch.map((_, i) => `@${i}`).join(',')})`,
        batch,
      );
      for (const r of rows) {
        const entry = out.get(r.documentId);
        // 分母列不存在卻有分子列，在 INNER JOIN 下不可能發生（有 join 到就必有 DOC_USING_DEPT
        // 列）；此處仍顯式建立，避免日後查詢形狀變動時靜默丟資料。
        if (entry) entry.completedOrgCodes.push(r.orgCode);
        else out.set(r.documentId, { totalUnits: 1, completedOrgCodes: [r.orgCode] });
      }
    }

    return out;
  }
}
