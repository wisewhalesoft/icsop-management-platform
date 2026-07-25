import { DataSource, IsNull, MoreThan, MoreThanOrEqual } from 'typeorm';
import { OrgChangeAlert } from '../database/entities/org-change-alert.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { Account } from '../database/entities/account.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { DashboardCountProviders } from './dashboard-summary.service';

/**
 * GAP-07-1 儀表板 KPI 之真實計數（唯讀 COUNT 查詢；下推 SQL）。各查詢延遲初始化 DataSource。
 * 未建表/查詢異常由上層 DashboardSummaryService.safe 收斂為 0（此處保持查詢單純，不重複 try/catch）。
 * 對應 prototypes/07-admin-shell.html 之 TODOS 列。
 */
export function makeTypeOrmDashboardCounts(ds: DataSource): DashboardCountProviders {
  const init = async (): Promise<DataSource> => {
    if (!ds.isInitialized) await ds.initialize();
    return ds;
  };
  return {
    // 待確認組織異動：pending 提示（F006）。
    async pendingOrgChanges(): Promise<number> {
      const d = await init();
      return d.getRepository(OrgChangeAlert).count({ where: { status: 'pending' } });
    },
    // 未指派節點文件：有效文件但尚未掛載於任何 DAG 節點（nodeId null）。
    async unassignedDocs(): Promise<number> {
      const d = await init();
      return d
        .getRepository(IcsopDocument)
        .count({ where: { status: 'active', nodeId: IsNull() } });
    },
    // 停用帳號待覆核：已停用帳號（含離職自動停用）。
    async disabledAccounts(): Promise<number> {
      const d = await init();
      return d.getRepository(Account).count({ where: { status: 'disabled' } });
    },
    // 調閱紀錄（近7日）：AUDIT_LOG occurredAt ≥ now-7d。
    async accessLast7Days(): Promise<number> {
      const d = await init();
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return d
        .getRepository(AuditLog)
        .count({ where: { occurredAt: MoreThanOrEqual(since) } });
    },
    // 待公布的文件：進度中＝ active 且（未填公告日期 OR 公告日期未到）。where 陣列＝OR。
    async pendingPublish(): Promise<number> {
      const d = await init();
      const now = new Date();
      return d.getRepository(IcsopDocument).count({
        where: [
          { status: 'active', announcedDate: IsNull() },
          { status: 'active', announcedDate: MoreThan(now) },
        ],
      });
    },
  };
}
