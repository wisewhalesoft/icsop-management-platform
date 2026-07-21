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
