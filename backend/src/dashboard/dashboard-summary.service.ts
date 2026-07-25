/**
 * GAP-07-1 後台儀表板 KPI 彙總（prototypes/07-admin-shell.html 之 TODOS 列）。
 * 純服務層：聚合 5 個計數 provider；任一 provider 失敗 → 該計數降為 0（不阻斷其餘、不使儀表板崩潰）。
 * 真實計數之 TypeORM 查詢見 dashboard-counts.ts；本服務不做 IO，便於單元測試。
 */

export interface DashboardCounts {
  /** 待確認組織異動：ORG_CHANGE_ALERT status='pending'。 */
  pendingOrgChanges: number;
  /** 未指派節點文件：ICSOP_DOCUMENT status='active' 且 nodeId 為 null。 */
  unassignedDocs: number;
  /** 停用帳號待覆核：ACCOUNT status='disabled'。 */
  disabledAccounts: number;
  /** 調閱紀錄（近7日）：AUDIT_LOG occurredAt ≥ now-7d。 */
  accessLast7Days: number;
  /** 待公布的文件：ICSOP_DOCUMENT status='active' 且（announcedDate 為 null 或 > now）＝進度中。 */
  pendingPublish: number;
}

export interface DashboardCountProviders {
  pendingOrgChanges(): Promise<number>;
  unassignedDocs(): Promise<number>;
  disabledAccounts(): Promise<number>;
  accessLast7Days(): Promise<number>;
  pendingPublish(): Promise<number>;
}

export class DashboardSummaryService {
  constructor(private readonly providers: DashboardCountProviders) {}

  private static async safe(fn: () => Promise<number>): Promise<number> {
    try {
      const n = await fn();
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }

  async getSummary(): Promise<DashboardCounts> {
    const s = DashboardSummaryService.safe;
    const [
      pendingOrgChanges,
      unassignedDocs,
      disabledAccounts,
      accessLast7Days,
      pendingPublish,
    ] = await Promise.all([
      s(() => this.providers.pendingOrgChanges()),
      s(() => this.providers.unassignedDocs()),
      s(() => this.providers.disabledAccounts()),
      s(() => this.providers.accessLast7Days()),
      s(() => this.providers.pendingPublish()),
    ]);
    return {
      pendingOrgChanges,
      unassignedDocs,
      disabledAccounts,
      accessLast7Days,
      pendingPublish,
    };
  }
}
