/**
 * 同步引擎之 IO 邊界介面（可注入 mock）。
 *  - UpstreamOrgReader：OPENQUERY 讀 VW_DEPT_SQL / VW_HPMUSER（唯讀上游）。
 *  - OrgSyncStore：本地 ACCOUNT / ORG_UNIT / SYNC_RUN 之交易性寫入 + 互斥鎖。
 * 純邏輯（推導/分類/閾值/正規化）不在此層，見同目錄各純模組。
 */

import { RawDept, RawAccount, NormalizedOrgUnit, NormalizedAccount } from './normalization';
import { ExistingOrgUnit, ExistingAccount } from './change-classification';

export type TriggerType = 'scheduled' | 'manual';
export type SyncRunStatus = 'running' | 'success' | 'failed';

/**
 * 同步紀錄摘要（US-011 查詢端點 / 前端輪詢用）。
 * 僅暴露前端所需欄位；水位（watermark）與觸發者（triggeredBy）不對外。
 */
export interface SyncRunSummary {
  id: string;
  triggerType: TriggerType;
  status: SyncRunStatus;
  startedAt: Date;
  endedAt: Date | null;
  changeCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}

/** 上游唯讀來源（一律 OPENQUERY 下推）。 */
export interface UpstreamOrgReader {
  /** VW_DEPT_SQL 全量（非增量）。 */
  readDepartments(compid: string): Promise<RawDept[]>;
  /** 消失閾值用：本次來源之在職 USERID 集合（EMPSTS='A'）。 */
  readActiveAccountLoginIds(compid: string): Promise<string[]>;
  /** VW_HPMUSER 白名單 11 欄；sinceMtdt=null 為首次全量。 */
  readAccountChanges(compid: string, sinceMtdt: Date | null): Promise<RawAccount[]>;
}

export interface AccountDisableWrite {
  companyCode: string;
  loginId: string;
  reason: 'departed';
  disabledAt: Date;
}

/** 一次同步之全部異動（由服務分類後，交由 store 於單一交易套用）。 */
export interface SyncPlan {
  orgCreates: NormalizedOrgUnit[];
  orgUpdates: NormalizedOrgUnit[];
  accountCreates: NormalizedAccount[];
  accountUpdates: NormalizedAccount[];
  accountDisables: AccountDisableWrite[];
}

export interface FinishSyncRunPatch {
  status: Exclude<SyncRunStatus, 'running'>;
  changeCount: number;
  endedAt: Date;
  watermark?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  // --- F006 KPI 細分（D7）：changeCount 為組織＋帳號之混合總數，無法組出「新增人員／更新／離職停用」
  //     三張卡。此三欄僅將 run() 已算出之 stats 多落地，不新增任何計算邏輯。選填以相容既有呼叫端。
  accountsCreated?: number;
  accountsUpdated?: number;
  accountsDisabled?: number;
}

/** 本地寫入端（含互斥鎖：以「進行中之 SYNC_RUN」實現）。 */
export interface OrgSyncStore {
  /** 互斥：是否已有進行中（running）之 SYNC_RUN。 */
  hasRunningSyncRun(): Promise<boolean>;
  createSyncRun(input: {
    triggerType: TriggerType;
    triggeredBy?: string | null;
    startedAt: Date;
  }): Promise<string>;
  finishSyncRun(id: string, patch: FinishSyncRunPatch): Promise<void>;
  /** 上次成功同步之 MTDT 水位（首次為 null）。 */
  getAccountWatermark(compid: string): Promise<Date | null>;
  /** 本地在職（status='active'）上游帳號之 loginId 集合（消失閾值 prev 端）。 */
  listActiveAccountLoginIds(compid: string): Promise<string[]>;
  findOrgUnits(compid: string): Promise<Map<string, ExistingOrgUnit>>;
  /**
   * 一次載入該公司全部既有（upstream）帳號，回 Map<loginId, ...>。
   * ⚠ 刻意「不接受 loginId 清單」：避免 `loginId IN (…全部來源鍵…)` 觸發 MSSQL 2100 參數上限
   * （AS 2771 帳號實跑爆掉）。存在性比對於服務層以記憶體 Map 完成，IO 為 O(1)（與筆數無關）。
   */
  findExistingAccounts(compid: string): Promise<Map<string, ExistingAccount>>;
  /** 於單一交易套用 plan（失敗須整批回滾，AC3）。 */
  applySync(compid: string, plan: SyncPlan): Promise<void>;
  /**
   * 最近 N 筆同步紀錄（依 startedAt 由新到舊，取 limit 筆）。供 US-011 查詢端點/前端輪詢。
   * limit 之預設與上限由呼叫端（OrgSyncService.recentRuns）正規化，本層僅忠實下推。
   */
  listRecentRuns(limit: number): Promise<SyncRunSummary[]>;
}

/**
 * F006 提示產生之輸入（同步引擎 → org-change-alert 之單向 seam）。
 * 刻意定義於 org-sync 層：使 org-change-alert 單向相依 org-sync，避免模組互相 import。
 * 全部欄位皆為 run() 已算出之物件，提示產生端不重新查上游。
 */
export interface SyncAlertInput {
  /** 本次 SYNC_RUN.id（提示之 sourceSyncRunId）。 */
  runId: string;
  companyCode: string;
  /** 本次判定為 update 之組織單位（同步後值）。 */
  orgUpdates: NormalizedOrgUnit[];
  /** 同步前組織單位快照（key=orgCode）。 */
  orgBefore: Map<string, ExistingOrgUnit>;
  /** 同步後之全量組織單位（上游全量取回，含 closeDate）。 */
  orgUnits: NormalizedOrgUnit[];
  /** 本次判定為 update 之帳號（同步後值）。 */
  accountUpdates: NormalizedAccount[];
  /** 同步前帳號快照（key=loginId）。 */
  existingAcc: Map<string, ExistingAccount>;
}

/**
 * F006 提示產生器（由 OrgChangeAlertService 實作）。同步成功收尾後呼叫；
 * 手動觸發與每日排程共用 run() 同一路徑，故兩種觸發方式自動一致生效。
 */
export interface OrgChangeAlertGenerator {
  generateFromSyncPlan(input: SyncAlertInput): Promise<void>;
}

export interface SyncStats {
  departmentsRead: number;
  orgCreated: number;
  orgUpdated: number;
  accountsRead: number;
  accountsCreated: number;
  accountsUpdated: number;
  accountsDisabled: number;
  orphanWarnings: number;
  dirtyRows: number;
  disappearedCount: number;
  disappearedRatio: number;
}

export interface SyncResult {
  runId: string;
  triggerType: TriggerType;
  status: Exclude<SyncRunStatus, 'running'>;
  changeCount: number;
  /** 失敗/中止之錯誤碼；DISAPPEARED_RATIO_EXCEEDED 供前端區分「已中止」與一般「失敗」。 */
  errorCode?: string;
  errorMessage?: string;
  stats: SyncStats;
  warnings: string[];
}
