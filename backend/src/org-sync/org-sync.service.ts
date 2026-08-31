import { ConflictException, Injectable } from '@nestjs/common';
import {
  OrgSyncStore,
  UpstreamOrgReader,
  SyncPlan,
  SyncResult,
  SyncStats,
  TriggerType,
  AccountDisableWrite,
  SyncRunSummary,
  OrgChangeAlertGenerator,
} from './org-sync.types';
import {
  normalizeDept,
  normalizeAccount,
  normalizeJobTitle,
  normalizeJobPosition,
  dedupeAccountsByStableKey,
  NormalizedOrgUnit,
  NormalizedAccount,
  NormalizedJobTitle,
  NormalizedJobPosition,
  DirtyRowError,
} from './normalization';
import {
  classifyOrgUnit,
  classifyAccount,
  classifyJobTitle,
  classifyJobPosition,
} from './change-classification';
import { jobTitleKey } from '../org-directory/job-title-directory';
import { jobPositionKey } from '../org-directory/job-position-directory';
import {
  computeDisappeared,
  DEFAULT_DISAPPEARED_THRESHOLD,
} from './disappeared-threshold';
import {
  DEFAULT_ROLE_CHANGE_THRESHOLD,
  deriveRoles,
  roleChangeRatioExceeded,
  type DerivationJobTitle,
  type DerivationOrgUnit,
  type RoleChange,
} from './role-derivation';

export interface OrgSyncOptions {
  compid?: string;
  disappearedThreshold?: number;
  /**
   * 🔴 角色變更閾值（裁定 Q4.3）。未給 → `DEFAULT_ROLE_CHANGE_THRESHOLD` 5%。
   * 覆寫僅供首次全量套用之一次性作業（`OQ-RA-01`），見 `loadRoleChangeThresholdOverride`。
   */
  roleChangeThreshold?: number;
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
 *  5. 帳號增量（MTDT 水位）→ 去重 → 分類 create/update/disable
 *     （disable 一律以 `empActive=false` 觸發，v2.0 由 `RESIGN_DATE` 導出，見契約 §6）。
 *  6. 單一交易套用 plan；更新 SYNC_RUN（success/failed + 水位）。
 * 失敗（來源不可用/交易回滾）：保留同步前既有資料，記 failed。
 */
@Injectable()
export class OrgSyncService {
  private readonly compid: string;
  private readonly threshold: number;
  private readonly roleThreshold: number;
  private readonly now: () => Date;

  constructor(
    private readonly reader: UpstreamOrgReader,
    private readonly store: OrgSyncStore,
    options: OrgSyncOptions = {},
    /**
     * F006 提示產生器（選填）。同步成功收尾後呼叫；未注入時同步照常運作（向後相容既有手建呼叫）。
     * 失敗不阻斷同步（提示為附加價值，不得使已成功之同步被標記為失敗）。
     */
    private readonly alerts?: OrgChangeAlertGenerator,
  ) {
    this.compid = options.compid ?? 'AS';
    this.threshold = options.disappearedThreshold ?? DEFAULT_DISAPPEARED_THRESHOLD;
    this.roleThreshold =
      options.roleChangeThreshold ?? DEFAULT_ROLE_CHANGE_THRESHOLD;
    this.now = options.now ?? ((): Date => new Date());
  }

  /** 本實例綁定之公司代碼（B 階段：`OrgSyncCoordinator` 於多公司迴圈中識別各實例所需）。 */
  getCompid(): string {
    return this.compid;
  }

  /**
   * @param opts.fullResync 忽略 MTDT 水位，改為全量取回帳號（預設 false ＝增量）。
   *
   * **何時需要**：新增一個「來自上游、但既有列為 NULL」的帳號欄位時（如 2026-08-12 之
   * `jobTitleCode`）。增量同步僅取 `MTDT > watermark` 之帳號，既有帳號**不會出現在結果中**，
   * 因此 `classifyAccount` 的新欄位比對永遠沒有機會觸發——加欄後的回填**不會自然發生**。
   * ⚠ 此為帳號路徑特有：組織（`VW_DEPT_SQL`）本就全量取回，故 `descFull` 之回填可自然完成，
   *   不可據此類推帳號亦然。
   *
   * 本旗標不改變任何寫入語意（仍走同一 classify → applySync 路徑，仍冪等、仍單一交易），
   * 僅放大本次取回範圍；跑完水位照常推進，後續排程自動回到增量。
   */
  async run(
    triggerType: TriggerType,
    triggeredBy?: string | null,
    opts: { fullResync?: boolean } = {},
  ): Promise<SyncResult> {
    if (await this.store.hasRunningSyncRun(this.compid)) {
      throw new SyncInProgressError();
    }

    const startedAt = this.now();
    const runId = await this.store.createSyncRun({
      compid: this.compid,
      triggerType,
      triggeredBy,
      startedAt,
    });
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
      // --- 3.5 職稱對照主檔（G-ADM-001「資位」欄） ---
      const { creates: jobTitleCreates, updates: jobTitleUpdates } =
        await this.planJobTitles(stats, warnings);
      // --- 3.6 職位對照主檔（G-ADM-001「職位」欄） ---
      const { creates: jobPositionCreates, updates: jobPositionUpdates } =
        await this.planJobPositions(stats, warnings);

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
          compid: this.compid,
          triggerType,
          status: 'failed',
          changeCount: 0,
          errorCode: 'DISAPPEARED_RATIO_EXCEEDED',
          errorMessage: msg,
          stats,
          warnings,
        };
      }

      // --- 5. 帳號增量（fullResync 時忽略水位取全量，見 run() 之說明） ---
      const watermark = await this.store.getAccountWatermark(this.compid);
      const since = opts.fullResync ? null : watermark;
      if (opts.fullResync) {
        warnings.push('已要求全量重同步：本次忽略 MTDT 水位，取回全部帳號。');
      }
      const rawAccts = await this.reader.readAccountChanges(this.compid, since);
      stats.accountsRead = rawAccts.length;
      // 在職判定基準（契約 §6）：整批共用同一時刻，避免長時間同步中途跨日而使前後批判定不一致。
      const employmentBasis = this.now();
      const parsedAccts: NormalizedAccount[] = [];
      for (const raw of rawAccts) {
        try {
          parsedAccts.push(normalizeAccount(raw, employmentBasis));
        } catch (e) {
          if (e instanceof DirtyRowError) {
            stats.dirtyRows++;
            warnings.push(`髒帳號資料略過：${e.message}`);
          } else {
            throw e;
          }
        }
      }
      // 穩定鍵去重（人類裁決 #1，契約 §7.2）：撞鍵不得使整批 upsert 失敗。
      const [normAccts, dedupedCount] = dedupeAccountsByStableKey(parsedAccts);
      if (dedupedCount > 0) {
        warnings.push(
          `上游穩定鍵 (COMPID, NO) 重複 ${dedupedCount} 筆，已依 MTDT 較新者去重後續行。` +
            `此為上游資料異常，請通報人資系統負責人（契約 §11 #11）。`,
        );
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
        // 孤兒：DEPT_CODE 於本次部門集合查無 → 保留、記警告（不停用不中止）。
        // ⚠ v2.0：新來源之 INNER JOIN 使孤兒在來源端即被濾除（契約 §3.2），此路徑實務上不會命中；
        //    刻意保留為縱深防禦——上游若換掉該 join，孤兒會無聲回歸。
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
        jobTitleCreates,
        jobTitleUpdates,
        jobPositionCreates,
        jobPositionUpdates,
      };
      try {
        await this.store.applySync(this.compid, plan);
      } catch (e) {
        // 本地寫入失敗（如 DB 參數上限、約束衝突）：標記為寫入階段錯誤，
        // 與「來源不可用」區分（見 classifyFailure）。交易已由 store 回滾。
        throw new SyncWriteError(e instanceof Error ? e.message : String(e));
      }

      // 🔴 降級清單（裁定 Q1.3）：於 6.5 產生、於步驟 7 轉為 ROLE_DOWNGRADE_PENDING 待審告警。
      // 刻意 hoist 至此：告警產生器與推導是兩個步驟，需跨越 try 邊界傳遞。
      let roleDowngrades: RoleChange[] = [];

      // --- 6.5 角色推導（🔴 2026-08-25 角色自動化 delta；裁定 Q1.1～Q1.4、Q3.1～Q3.5、Q4.2～Q4.6）---
      //
      // ⚠ **置於 applySync 之後**：推導需要本次新建/更新之帳號已落地（否則新進人員永遠慢一輪）。
      //   代價是它無法與帳號寫入同交易——故閾值超標時**不回滾已成功之帳號同步**，
      //   只跳過推導並記警告（與消失閾值之「寫入前中止」語意不同，見下方 skip 分支）。
      //
      // ⚠ 全程不使同步失敗：推導是附加價值，不得讓已成功之組織/帳號同步被標記為失敗
      //   （比照下方 F006 提示產生之既有處置）。
      if (this.store.findAccountsForDerivation && this.store.applyRoleDerivation) {
        try {
          const derivAccounts = await this.store.findAccountsForDerivation(this.compid);
          const derivOrgUnits: DerivationOrgUnit[] = normDepts.map((d) => ({
            companyCode: d.companyCode,
            orgCode: d.orgCode,
            tier: d.tier,
            managerEmpNo: d.managerEmpNo,
            isActive: d.isActive,
          }));
          // 職稱對照於 applySync 後重讀：本次新建之對照列必須納入，否則新職稱代碼
          // 在當次同步解析不到名稱、業務判定會少算一輪。~109 列，成本可忽略。
          const titleMap = (await this.store.findJobTitles?.()) ?? new Map();
          const derivJobTitles: DerivationJobTitle[] = [...titleMap.values()].map((t) => ({
            companyCode: t.companyCode,
            code: t.code,
            name: t.name,
          }));

          const rolePlan = deriveRoles({
            accounts: derivAccounts,
            orgUnits: derivOrgUnits,
            jobTitles: derivJobTitles,
          });
          stats.roleUpgrades = rolePlan.roleUpgrades.length;
          stats.subtypeChanges = rolePlan.subtypeChanges.length;
          stats.roleDowngradeAlerts = rolePlan.roleDowngradeAlerts.length;

          // 🔴 閾值（裁定 Q4.3）：分母為本次納入推導者（roleSource='derived'），
          //    分子為**會被寫入**之變更（升級＋子分類）——子分類必須計入，否則
          //    「上游職稱改名致數百人靜默失去限縮」完全沒有偵測管道（delta §七第 1 項）。
          if (
            roleChangeRatioExceeded(rolePlan, derivAccounts.length, this.roleThreshold)
          ) {
            stats.roleDerivationSkipped = true;
            warnings.push(
              `角色推導變更量 ${rolePlan.writeCount}/${derivAccounts.length} ` +
                `超過閾值 ${(this.roleThreshold * 100).toFixed(1)}%，**整批未套用**。` +
                `帳號資料同步本身已成功。若為首次全量套用，請依 OQ-RA-01 以 ` +
                `SYNC_ROLE_CHANGE_THRESHOLD 一次性放寬後重跑，跑完務必移除該變數。`,
            );
          } else {
            await this.store.applyRoleDerivation(this.compid, rolePlan);
            // 裁定 Q1.3：降級不自動執行，改由步驟 7 產生 ROLE_DOWNGRADE_PENDING 待審告警。
            // ⚠ **僅在推導確實套用時才採計**——閾值跳過時整個計畫都不可信，
            //   據其產生數百筆待審告警只會製造噪音，且會讓人誤以為降級已被評估過。
            roleDowngrades = rolePlan.roleDowngradeAlerts;
            if (roleDowngrades.length > 0) {
              warnings.push(
                `角色降級 ${roleDowngrades.length} 筆**未自動執行**，已轉為待確認提示（見組織人員異動管理）。`,
              );
            }
          }
        } catch (e) {
          warnings.push(
            `角色推導失敗（不影響本次同步結果）：${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
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
        // F006 KPI 細分（D7）：僅多落地已算出之數字，不新增計算。
        accountsCreated: stats.accountsCreated,
        accountsUpdated: stats.accountsUpdated,
        accountsDisabled: stats.accountsDisabled,
      });

      // --- 7. F006 組織異動待確認提示（非阻斷；失敗僅記警告，同步結果維持 success） ---
      if (this.alerts) {
        try {
          await this.alerts.generateFromSyncPlan({
            runId,
            companyCode: this.compid,
            orgUpdates,
            orgBefore: existingOrg,
            orgUnits: normDepts,
            accountUpdates,
            existingAcc,
            // F005：本次消失（本地在職、來源查無）之 loginId；閾值放行時逐帳號產生 ACCOUNT_DISAPPEARED
            //       告警但不停用（消失≠離職）。閾值中止路徑不會走到此處（提前 return）。
            disappearedLoginIds: disappeared.missingIds,
            // 🔴 裁定 Q1.3：降級待審（未套用之角色變更）。
            roleDowngrades,
          });
        } catch (e) {
          warnings.push(
            `組織異動提示產生失敗（不影響本次同步結果）：${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }

      return {
        runId,
        compid: this.compid,
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
        compid: this.compid,
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

  /**
   * 職稱對照主檔（← VW_PERSONAL_JOB）之異動規劃。供帳號清單「職位」欄之代碼→名稱解析。
   *
   * 三項刻意設計：
   *  - **非阻斷**：取回失敗僅記警告。職位純為顯示欄位，不涉授權/身分；且若為上游連線問題，
   *    後續 readAccountChanges 必然一併失敗並走正常失敗路徑，故不致掩蓋真正的來源故障。
   *  - **同鍵去重**：上游 DISTINCT 之三欄組合可能對同一 (COMPID, JTITLE_ID) 產生多列
   *    （目前實測同公司內為 1:1，但這是資料現況而非上游保證）。不去重則兩列皆判 create，
   *    觸發 UQ 違反而使整筆交易回滾——即帳號同步被一張顯示用對照表拖垮。取先到者（確定性）。
   *  - **不計入 changeCount**：主檔維護非「組織/帳號異動」，計入會扭曲 F006 KPI 語意。
   *    改以 stats.jobTitlesUpserted 提供可觀測性。
   *
   * reader/store 未實作對應方法（既有手建替身）→ 整段跳過，回空計畫。
   */
  private async planJobTitles(
    stats: SyncStats,
    warnings: string[],
  ): Promise<{ creates: NormalizedJobTitle[]; updates: NormalizedJobTitle[] }> {
    const creates: NormalizedJobTitle[] = [];
    const updates: NormalizedJobTitle[] = [];
    if (!this.reader.readJobTitles || !this.store.findJobTitles) {
      return { creates, updates };
    }
    try {
      const rawTitles = await this.reader.readJobTitles();
      const existing = await this.store.findJobTitles();
      const seen = new Set<string>();
      for (const raw of rawTitles) {
        try {
          const t = normalizeJobTitle(raw);
          const key = jobTitleKey(t.companyCode, t.code);
          if (seen.has(key)) continue; // 同鍵去重（見上）
          seen.add(key);
          const kind = classifyJobTitle(t, existing.get(key) ?? null);
          if (kind === 'create') creates.push(t);
          else if (kind === 'update') updates.push(t);
        } catch (e) {
          if (e instanceof DirtyRowError) {
            stats.dirtyRows++;
            warnings.push(`髒職稱對照資料略過：${e.message}`);
          } else {
            throw e;
          }
        }
      }
      stats.jobTitlesUpserted = creates.length + updates.length;
    } catch (e) {
      warnings.push(
        `職稱對照主檔同步略過（不影響本次同步結果）：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return { creates, updates };
  }

  /**
   * 職位對照主檔（← VW_JOB_FUN）之異動規劃。供帳號清單「職位」欄之代碼→名稱解析。
   *
   * 三項刻意設計與 `planJobTitles` 完全相同（非阻斷／同鍵去重／不計入 changeCount），
   * 理由亦相同——見該方法之註解。差異只有一處：
   *
   * ⚠ 上游 `VW_JOB_FUN` 逐「代碼」一列（非逐人），實測 `(COMPID, CODE)` 即為唯一鍵
   *   （2026-08-31：四家 73 列 / 73 組鍵）。仍保留同鍵去重，理由同 planJobTitles：
   *   那是資料現況而非上游保證，撞鍵會使 UQ 違反而拖垮整筆帳號同步交易。
   *
   * reader/store 未實作對應方法（既有手建替身）→ 整段跳過，回空計畫。
   */
  private async planJobPositions(
    stats: SyncStats,
    warnings: string[],
  ): Promise<{ creates: NormalizedJobPosition[]; updates: NormalizedJobPosition[] }> {
    const creates: NormalizedJobPosition[] = [];
    const updates: NormalizedJobPosition[] = [];
    if (!this.reader.readJobPositions || !this.store.findJobPositions) {
      return { creates, updates };
    }
    try {
      const rawPositions = await this.reader.readJobPositions();
      const existing = await this.store.findJobPositions();
      const seen = new Set<string>();
      for (const raw of rawPositions) {
        try {
          const p = normalizeJobPosition(raw);
          const key = jobPositionKey(p.companyCode, p.code);
          if (seen.has(key)) continue; // 同鍵去重（見上）
          seen.add(key);
          const kind = classifyJobPosition(p, existing.get(key) ?? null);
          if (kind === 'create') creates.push(p);
          else if (kind === 'update') updates.push(p);
        } catch (e) {
          if (e instanceof DirtyRowError) {
            stats.dirtyRows++;
            warnings.push(`髒職位對照資料略過：${e.message}`);
          } else {
            throw e;
          }
        }
      }
      stats.jobPositionsUpserted = creates.length + updates.length;
    } catch (e) {
      warnings.push(
        `職位對照主檔同步略過（不影響本次同步結果）：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return { creates, updates };
  }

  /**
   * 最近 N 筆同步紀錄（US-011 查詢端點 / 前端輪詢）。
   * limit 經 clampRunsLimit 正規化（預設 20、上限 100、非法值回預設）後下推 store。
   */
  async recentRuns(limit?: number): Promise<SyncRunSummary[]> {
    return this.store.listRecentRuns(clampRunsLimit(limit));
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

/** US-011 查詢筆數之預設與上限（前端輪詢；上限防過量取回）。 */
export const DEFAULT_RUNS_LIMIT = 20;
export const MAX_RUNS_LIMIT = 100;

/**
 * 正規化 recentRuns 之 limit：
 *  - undefined / NaN / 非有限 → 預設 20
 *  - 小數 → 向下取整
 *  - < 1 → 預設 20
 *  - > 100 → 夾為 100
 */
export function clampRunsLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_RUNS_LIMIT;
  const n = Math.floor(limit);
  if (n < 1) return DEFAULT_RUNS_LIMIT;
  return Math.min(n, MAX_RUNS_LIMIT);
}

/** 將例外映射為錯誤碼（error-handling.md#sync）。 */
function classifyFailure(err: unknown): string {
  if (err instanceof SyncWriteError) return 'SYNC_WRITE_FAILED'; // 本地寫入/交易失敗（非來源）
  if (err instanceof DirtyRowError) return 'SYNC_DATA_FORMAT_ERROR';
  // 其餘（上游連線逾時/拒絕/未知）一律歸為來源不可用。
  return 'SYNC_SOURCE_UNAVAILABLE';
}
