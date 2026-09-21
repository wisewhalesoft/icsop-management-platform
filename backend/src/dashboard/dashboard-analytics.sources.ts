import { DataSource } from 'typeorm';
import { Account } from '../database/entities/account.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { JobPosition } from '../database/entities/job-position.entity';
import { OrgUnit } from '../database/entities/org-unit.entity';
import { DocumentStatus } from '../documents/document-status';
import { JobPositionRecord } from '../org-directory/job-position-directory';
import { OrgUnitRecord } from '../org-directory/org-unit-read';
import { AnalyticsDocRow } from './dashboard-analytics';
import { CategoryDocPair } from './category-distribution';
import { DashboardAnalyticsSources } from './dashboard-analytics.service';
import { makeCategoryDocPairsSource } from './category-distribution.source';

/**
 * F044 — 儀表板聚合之唯讀 provider（🔒 反循環：直讀實體，不 import 任何功能模組；
 * 比照既有 `dashboard-counts.ts`／`dashboard-activity.sources.ts`）。
 *
 * 🔴 `ARCH-G0`：**本檔只做投影**。分類、窗口、上溯、排序、截斷、算術一律純函式
 * （`dashboard-analytics.ts`／`division-resolver.ts`）——本輪沒有整合測試，凡落在 SQL 內之邏輯
 * 一條測試都碰不到它。
 * ⇒ 🔴 本檔**不得**出現狀態分類（`GETUTCDATE()`／SQL `CASE`）、遞迴上溯（CTE）、
 *   排序與截斷（`ORDER BY`／`TOP n`／`.orderBy()`／`.take()`）。
 *
 * **資料量前提（已查證）**：ICSOP 文件約 591 份、`ORG_UNIT` 四家合計數百列、
 * `JOB_POSITION` 約 75 列 ⇒ 全量投影進記憶體再算之成本遠低於逐筆回查，
 * 與既有 `TypeOrmOjtOrgDirectory`（整表載入 ＋ 每公司分群）之紀律一致。
 */

/** `Date` → `YYYY-MM-DD`（UTC 拆解；⚠ 用本地時區方法拆會讓 UTC+8 開發機與 UTC 容器差一天）。 */
function toIsoDay(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function makeTypeOrmDashboardAnalyticsSources(
  ds: DataSource,
): DashboardAnalyticsSources {
  const init = async (): Promise<DataSource> => {
    if (!ds.isInitialized) await ds.initialize();
    return ds;
  };
  const categoryPairs = makeCategoryDocPairsSource(ds);

  return {
    /** 🔒 投影恰 8 欄、恰 `status='active'`（卡①②③、兩張環圖、最新公告四處共用同一份）。 */
    async listDocuments(): Promise<AnalyticsDocRow[]> {
      const d = await init();
      const rows = await d.getRepository(IcsopDocument).find({
        where: { status: 'active' },
        select: {
          id: true,
          documentNumber: true,
          documentName: true,
          edition: true,
          status: true,
          announcedDate: true,
          companyCode: true,
          draftingDeptId: true,
        },
      });
      return rows.map((r) => ({
        documentId: r.id,
        documentNumber: r.documentNumber,
        documentName: r.documentName,
        edition: r.edition,
        status: r.status as DocumentStatus,
        announcedDate: toIsoDay(r.announcedDate),
        companyCode: r.companyCode,
        draftingDeptId: r.draftingDeptId,
      }));
    },

    /** `ORG_UNIT` 全表（🔴 含 `isActive=false` 之歷史單位——制定組織之解析不因裁撤而消失）。 */
    async listOrgUnits(): Promise<OrgUnitRecord[]> {
      const d = await init();
      const rows = await d.getRepository(OrgUnit).find();
      return rows.map((r) => ({
        companyCode: r.companyCode,
        orgCode: r.orgCode,
        codePrefix: r.codePrefix,
        parentCode: r.parentCode,
        tier: r.tier,
        name: r.name,
        descFull: r.descFull,
        managerEmpNo: r.managerEmpNo,
        isActive: r.isActive,
      }));
    },

    /**
     * `ACCOUNT.jobPositionCode`（`ARCH-G2`）。
     * 🔒 **本端點自己的一次查詢**——不動 `SessionGuard`、不加寬 `AccountRepository.findCurrentByLogin`
     * （那條路每一個請求都會跑）。
     */
    async findJobPositionCode(companyCode: string, loginId: string): Promise<string | null> {
      const d = await init();
      const row = await d
        .getRepository(Account)
        .findOne({ where: { companyCode, loginId }, select: { jobPositionCode: true } });
      return row?.jobPositionCode ?? null;
    },

    async listJobPositions(): Promise<JobPositionRecord[]> {
      const d = await init();
      const rows = await d.getRepository(JobPosition).find();
      return rows.map((r) => ({
        companyCode: r.companyCode,
        code: r.code,
        name: r.name,
      }));
    },

    listCategoryDocPairs(): Promise<CategoryDocPair[]> {
      return categoryPairs();
    },
  };
}
