import {
  ACTIVITY_LIMIT_DEFAULT,
  DashboardActivityItem,
  DashboardActivityKind,
  mergeActivity,
  visibleActivityKinds,
} from './dashboard-activity';

/** 每種活動一個唯讀查詢；limit＝該來源最多取幾列（合併後再截斷）。 */
export type DashboardActivityProviders = Record<
  DashboardActivityKind,
  (limit: number) => Promise<DashboardActivityItem[]>
>;

/**
 * 後台儀表板「最近活動」彙總（prototype 07 之 ACTIVITY 區塊）。
 * 純服務層：依角色挑出可見來源 → 併行查詢 → 合併排序截斷。本服務不做 IO（查詢見 sources）。
 *
 * 🔴 未授權之來源**不查詢**（非查完再過濾）：既省查詢，也使「過濾漏網」無法以資料形式存在。
 * 任一來源失敗 → 該來源降為空陣列（比照 DashboardSummaryService.safe），不使整個儀表板崩潰。
 */
export class DashboardActivityService {
  constructor(private readonly providers: DashboardActivityProviders) {}

  private static async safe(
    fn: () => Promise<DashboardActivityItem[]>,
  ): Promise<DashboardActivityItem[]> {
    try {
      const rows = await fn();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  async getRecent(
    roleCode: string | undefined,
    limit: number = ACTIVITY_LIMIT_DEFAULT,
  ): Promise<DashboardActivityItem[]> {
    const kinds = visibleActivityKinds(roleCode);
    if (kinds.length === 0) return [];
    const lists = await Promise.all(
      kinds.map((k) =>
        DashboardActivityService.safe(() => this.providers[k](limit)),
      ),
    );
    return mergeActivity(lists, limit);
  }
}
