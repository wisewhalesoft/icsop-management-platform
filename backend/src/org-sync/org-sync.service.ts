import { ConflictException, Injectable } from '@nestjs/common';
import {
  OrgSyncStore,
  UpstreamOrgReader,
  SyncPlan,
  SyncResult,
  SyncStats,
  TriggerType,
  AccountDisableWrite,
} from './org-sync.types';
import {
  normalizeDept,
  normalizeAccount,
  NormalizedOrgUnit,
  NormalizedAccount,
  DirtyRowError,
} from './normalization';
import { classifyOrgUnit, classifyAccount } from './change-classification';
import {
  computeDisappeared,
  DEFAULT_DISAPPEARED_THRESHOLD,
} from './disappeared-threshold';

export interface OrgSyncOptions {
  compid?: string;
  disappearedThreshold?: number;
  now?: () => Date;
}

/** 同步進行中（互斥）。對外回 409 SYNC_IN_PROGRESS。 */
export class SyncInProgressError extends ConflictException {
  constructor() {
    super('SYNC_IN_PROGRESS');
  }
}

/** 本地寫入階段失敗（交易已回滾）。與「來源不可用」區分。 */
export class SyncWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncWriteError';
  }
}

/**
 * 組織同步引擎核心。手動觸發 API 與（下一增量之）排程 cron 皆呼叫本服務。
 *
 * 流程（F004 Main Flow / US-010 / US-011）：
 *  1. 互斥鎖：已有進行中 → SYNC_IN_PROGRESS。
 *  2. 建立 running SYNC_RUN。
 *  3. 組織階層全量取回 → 推導 tier/parent/prefix → 分類 create/update。
 *  4. 消失閾值保護：本地在職 vs 來源在職，超過閾值 → 中止（不套用任何異動、不停用）。
 *  5. 帳號增量（MTDT 水位）→ 分類 create/update/disable（disable 一律以 EMPSTS≠'A' 觸發）。
 *  6. 單一交易套用 plan；更新 SYNC_RUN（success/failed + 水位）。
 * 失敗（來源不可用/交易回滾）：保留同步前既有資料，記 failed。
 */
@Injectable()
export class OrgSyncService {
  private readonly compid: string;
  private readonly threshold: number;
  private readonly now: () => Date;

  constructor(
    private readonly reader: UpstreamOrgReader,
    private readonly store: OrgSyncStore,
    options: OrgSyncOptions = {},
  ) {
    this.compid = options.compid ?? 'AS';
    this.threshold = options.disappearedThreshold ?? DEFAULT_DISAPPEARED_THRESHOLD;
    this.now = options.now ?? ((): Date => new Date());
  }

  async run(triggerType: TriggerType, triggeredBy?: string | null): Promise<SyncResult> {
    if (await this.store.hasRunningSyncRun()) {
      throw new SyncInProgressError();
    }

    const startedAt = this.now();
    const runId = await this.store.createSyncRun({ triggerType, triggeredBy, startedAt });
    const warnings: string[] = [];
    const stats: SyncStats = {
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
    };

    try {
      // --- 3. 組織階層 ---
      const rawDepts = await this.reader.readDepartments(this.compid);
      stats.departmentsRead = rawDepts.length;
      const normDepts: NormalizedOrgUnit[] = [];
      const deptCodeSet = new Set<string>();
      for (const raw of rawDepts) {
        try {
          const d = normalizeDept(raw, startedAt);
          normDepts.push(d);
          deptCodeSet.add(d.orgCode);
        } catch (e) {
          if (e instanceof DirtyRowError) {
            stats.dirtyRows++;
            warnings.push(`髒部門資料略過：${e.message}`);
          } else {
            throw e;
          }
        }
      }
      const existingOrg = await this.store.findOrgUnits(this.compid);
      const orgCreates: NormalizedOrgUnit[] = [];
      const orgUpdates: NormalizedOrgUnit[] = [];
      for (const d of normDepts) {
        const kind = classifyOrgUnit(d, existingOrg.get(d.orgCode) ?? null);
        if (kind === 'create') orgCreates.push(d);
        else if (kind === 'update') orgUpdates.push(d);
      }
      stats.orgCreated = orgCreates.length;
      stats.orgUpdated = orgUpdates.length;

      // --- 4. 消失閾值保護（中止則不套用任何異動、不停用） ---
      const prevActiveIds = await this.store.listActiveAccountLoginIds(this.compid);
      const sourceActiveIds = await this.reader.readActiveAccountLoginIds(this.compid);
      const disappeared = computeDisappeared(prevActiveIds, sourceActiveIds);
      stats.disappearedCount = disappeared.missingCount;
      stats.disappearedRatio = disappeared.ratio;
      if (disappeared.ratio > this.threshold) {
        const pct = (disappeared.ratio * 100).toFixed(1);
        const msg =
          `在職帳號消失 ${disappeared.missingCount}/${disappeared.prevCount}` +
          `（${pct}%）超過閾值 ${(this.threshold * 100).toFixed(1)}%，已中止同步、未執行任何停用。`;
        await this.store.finishSyncRun(runId, {
          status: 'failed',
          changeCount: 0,
          endedAt: this.now(),
          errorCode: 'DISAPPEARED_RATIO_EXCEEDED',
          errorMessage: msg,
        });
        return {
          runId,
          triggerType,
          status: 'failed',
          changeCount: 0,
          errorCode: 'DISAPPEARED_RATIO_EXCEEDED',
          errorMessage: msg,
          stats,
          warnings,
        };
      }

      // --- 5. 帳號增量 ---
      const watermark = await this.store.getAccountWatermark(this.compid);
      const rawAccts = await this.reader.readAccountChanges(this.compid, watermark);
      stats.accountsRead = rawAccts.length;
      const normAccts: NormalizedAccount[] = [];
      for (const raw of rawAccts) {
        try {
          normAccts.push(normalizeAccount(raw));
        } catch (e) {
          if (e instanceof DirtyRowError) {
            stats.dirtyRows++;
            warnings.push(`髒帳號資料略過：${e.message}`);
          } else {
            throw e;
          }
        }
      }
      // 一次載入全公司帳號（load-all），記憶體比對；不以 loginId IN(…) 查詢（MSSQL 2100 參數上限）。
      const existingAcc = await this.store.findExistingAccounts(this.compid);
      const accountCreates: NormalizedAccount[] = [];
      const accountUpdates: NormalizedAccount[] = [];
      const accountDisables: AccountDisableWrite[] = [];
      let maxMtdt: Date | null = null;
      for (const a of normAccts) {
        // upstreamModifiedAt 可能為 null（哨兵/Invalid/超範圍之 MTDT 被收斂）；null 不參與水位推進。
        if (
          a.upstreamModifiedAt !== null &&
          (maxMtdt === null || a.upstreamModifiedAt.getTime() > maxMtdt.getTime())
        ) {
          maxMtdt = a.upstreamModifiedAt;
        }
        // 孤兒：DEPTID 於本次部門集合查無 → 保留、記警告（不停用不中止）。
        if (a.orgCode !== null && !deptCodeSet.has(a.orgCode)) {
          stats.orphanWarnings++;
          warnings.push(`孤兒帳號（部門 ${a.orgCode} 查無）：${a.loginId}，已保留。`);
        }
        const kind = classifyAccount(a, existingAcc.get(a.loginId) ?? null);
        if (kind === 'create') accountCreates.push(a);
        else if (kind === 'update') accountUpdates.push(a);
        else if (kind === 'disable') {
          accountDisables.push({
            companyCode: a.companyCode,
            loginId: a.loginId,
            reason: 'departed',
            disabledAt: this.now(),
          });
        }
      }
      stats.accountsCreated = accountCreates.length;
      stats.accountsUpdated = accountUpdates.length;
      stats.accountsDisabled = accountDisables.length;

      // --- 6. 單一交易套用（組織＋帳號同一交易，失敗整批回滾 → 保留同步前資料，AC3/Postconditions） ---
      const plan: SyncPlan = {
        orgCreates,
        orgUpdates,
        accountCreates,
        accountUpdates,
        accountDisables,
      };
      try {
        await this.store.applySync(this.compid, plan);
      } catch (e) {
        // 本地寫入失敗（如 DB 參數上限、約束衝突）：標記為寫入階段錯誤，
        // 與「來源不可用」區分（見 classifyFailure）。交易已由 store 回滾。
        throw new SyncWriteError(e instanceof Error ? e.message : String(e));
      }

      const changeCount =
        stats.orgCreated +
        stats.orgUpdated +
        stats.accountsCreated +
        stats.accountsUpdated +
        stats.accountsDisabled;

      const newWatermark = maxMtdt ?? watermark;
      await this.store.finishSyncRun(runId, {
        status: 'success',
        changeCount,
        endedAt: this.now(),
        watermark: newWatermark,
      });

      return {
        runId,
        triggerType,
        status: 'success',
        changeCount,
        stats,
        warnings,
      };
    } catch (err) {
      const errorCode = classifyFailure(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      // 未 applySync（或 store 交易已回滾）→ 同步前資料保持不變（AC3）。
      await this.safeFinishFailed(runId, errorCode, errorMessage);
      return {
        runId,
        triggerType,
        status: 'failed',
        changeCount: 0,
        errorCode,
        errorMessage,
        stats,
        warnings,
      };
    }
  }

  private async safeFinishFailed(
    runId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.store.finishSyncRun(runId, {
        status: 'failed',
        changeCount: 0,
        endedAt: this.now(),
        errorCode,
        errorMessage,
      });
    } catch {
      // 收尾寫入失敗不再拋出（避免掩蓋原始錯誤）；鎖之釋放由 store 實作保證。
    }
  }
}

/** 將例外映射為錯誤碼（error-handling.md#sync）。 */
function classifyFailure(err: unknown): string {
  if (err instanceof SyncWriteError) return 'SYNC_WRITE_FAILED'; // 本地寫入/交易失敗（非來源）
  if (err instanceof DirtyRowError) return 'SYNC_DATA_FORMAT_ERROR';
  // 其餘（上游連線逾時/拒絕/未知）一律歸為來源不可用。
  return 'SYNC_SOURCE_UNAVAILABLE';
}
