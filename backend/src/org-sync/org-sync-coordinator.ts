import { OrgSyncStore, SyncResult, SyncRunSummary, TriggerType } from './org-sync.types';
import {
  OrgSyncService,
  OrgSyncRunOptions,
  SyncInProgressError,
  clampRunsLimit,
} from './org-sync.service';

/**
 * 多公司同步協調層（B 階段，開放 AD／AE／AJ）。
 *
 * `OrgSyncService` 刻意維持**單一公司**架構不變（建構時綁定一個 `compid`，`run()` 全程只認
 * 該公司）——這是既有、已測試充分的核心引擎，不因多公司擴充而重寫其內部 340 行流程。
 * 本類別是薄薄一層外部迴圈：對設定之公司清單，逐一呼叫各自的 `OrgSyncService.run()`。
 *
 * ⚠ **依序（不平行）**：`applySync` 為單一交易，平行觸發多公司雖然理論上因 `SYNC_RUN.compid`
 * 已 per-company 互斥而不會互相鎖死，但仍共用同一個上游 linked server 連線與同一個
 * `AppDataSource`；依序執行可避免非必要的連線競爭，且失敗診斷（任一公司同步失敗）之因果關係
 * 更容易追蹤。同步排程本身在非尖峰時段（02:00），依序執行之總耗時不構成問題。
 *
 * ⚠ **單一公司失敗不阻斷其他公司**：`OrgSyncService.run()` 之 catch 區塊已保證失敗時回傳
 * `status:'failed'` 而非拋出例外（唯一例外為 `hasRunningSyncRun` 之互斥鎖，見下）；本協調層
 * 額外包一層 try/catch 防禦性處理**未預期**之例外（如 `SyncInProgressError`——若某公司恰有
 * 手動觸發正在進行中），確保它不會中斷清單中其餘公司的同步。
 */
export class OrgSyncCoordinator {
  constructor(
    private readonly services: readonly OrgSyncService[],
    private readonly store: OrgSyncStore,
  ) {}

  /**
   * 依序對每家公司呼叫 `run()`。回傳陣列順序與建構時之公司清單順序一致。
   *
   * 任一公司拋出例外 → 該筆以 `status:'failed'` 之合成結果表示，**不中斷其餘公司**——這是
   * 多公司獨立性的核心保證：A 公司忙碌或故障，不得使 B／C／D 公司連跑都跑不到。
   *  - `SyncInProgressError`（該公司恰有其他觸發正在進行中）→ `errorCode:'SYNC_IN_PROGRESS'`，
   *    與單一公司時 HTTP 409 之語意一致，只是改以陣列中一筆失敗結果表示，而非讓整批請求失敗。
   *  - 其餘未預期例外 → `errorCode:'COORDINATOR_UNEXPECTED_ERROR'`。
   */
  async runAll(
    triggerType: TriggerType,
    triggeredBy?: string | null,
    opts: OrgSyncRunOptions & { onlyCompid?: string } = {},
  ): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    // 🔵 2026-08-31：`onlyCompid` 使畫面之「本次仍要套用」只重跑**被跳過的那一家**。
    //    不限縮的話，放行值會一併套到其餘公司——它們早已套用過、日常變更量是個位數百分比，
    //    沒有理由把它們也暴露在無上限的窗口下。查無該公司 → 回空陣列（呼叫端據以回 400）。
    const { onlyCompid, ...runOpts } = opts;
    const targets = onlyCompid
      ? this.services.filter((s) => s.getCompid() === onlyCompid)
      : this.services;
    for (const svc of targets) {
      try {
        results.push(await svc.run(triggerType, triggeredBy, runOpts));
      } catch (e) {
        results.push({
          runId: '',
          compid: svc.getCompid(),
          triggerType,
          status: 'failed',
          changeCount: 0,
          errorCode:
            e instanceof SyncInProgressError
              ? 'SYNC_IN_PROGRESS'
              : 'COORDINATOR_UNEXPECTED_ERROR',
          errorMessage: e instanceof Error ? e.message : String(e),
          stats: {
            departmentsRead: 0,
            orgCreated: 0,
            orgUpdated: 0,
            accountsRead: 0,
            accountsCreated: 0,
            accountsUpdated: 0,
            accountsDisabled: 0,
            orphanWarnings: 0,
            dirtyRows: 0,
            disappearedCount: 0,
            disappearedRatio: 0,
          },
          warnings: [],
        });
      }
    }
    return results;
  }

  /**
   * 最近 N 筆同步紀錄（US-011）——跨全部公司，依 startedAt 由新到舊。與
   * `OrgSyncService.recentRuns` 邏輯相同（純委派 store，limit 正規化亦沿用 `clampRunsLimit`），
   * 於此複製一份供 controller 只依賴 `OrgSyncCoordinator` 一個入口。
   */
  async recentRuns(limit?: number): Promise<SyncRunSummary[]> {
    return this.store.listRecentRuns(clampRunsLimit(limit));
  }
}
