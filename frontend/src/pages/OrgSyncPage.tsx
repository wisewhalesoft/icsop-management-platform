import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getOrgSyncRuns,
  triggerOrgSync,
  getOrgChangeAlerts,
  resolveOrgChangeAlert,
  getOrgSyncMonthlySummary,
  getCompanies,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { roleMeta } from '../domain/roles';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import type {
  SyncRunSummary,
  OrgChangeAlertView,
  OrgSyncMonthlySummary,
  CompanyRecord,
} from '../api/types';
import {
  trigLabel,
  resultLabel,
  resultTone,
  latestRun,
  hasRunningRun,
  formatDateTime,
  formatDateOnly,
  KPI_CARDS,
} from './org-sync-view';

/**
 * 組織人員異動管理（US-011 同步 ＋ F006 待確認異動）。
 * 版面/樣式/文案之權威來源：prototypes/09-org-sync-management.html（逐項還原：
 * 同步狀態卡在頁籤列之外、三頁籤（總覽/同步歷史/待確認異動）＋amber 徽章、
 * 總覽 4 張 KPI 卡、歷史表 min-w-[720px]、提示卡與空狀態）。
 *
 * 端點：GET /admin/org-sync/runs、POST /admin/org-sync/run、
 *       GET /admin/org-sync/monthly-summary、GET /admin/org-change-alerts、
 *       PATCH /admin/org-change-alerts/:id/resolve。
 * RBAC：SysAdmin 可寫（立即同步／處理提示），ICSOPAdmin 唯讀（寫入按鈕不渲染於 DOM）。
 */
const TONE_BADGE: Record<string, string> = {
  success: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  danger: 'text-red-700 bg-red-50 border-red-100',
  info: 'text-blue-700 bg-blue-50 border-blue-100',
};

type TabKey = 'overview' | 'history' | 'alerts';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '總覽' },
  { key: 'history', label: '同步歷史' },
  { key: 'alerts', label: '待確認異動' },
];

/** 無權限畫面之角色別說明（逐字沿用 prototype 09 之 blockMsg）。 */
function blockedMessage(roleCode: string | undefined): string {
  if (roleCode === 'User') return '一般使用者無後台存取權。';
  return `${roleMeta(roleCode)?.label ?? '此角色'}對「組織人員異動管理」為「無」。`;
}

export function OrgSyncPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ORG_SYNC_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.ORG_SYNC_MANAGEMENT, 'write');

  const [tab, setTab] = useState<TabKey>('overview');
  const [runs, setRuns] = useState<SyncRunSummary[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [alerts, setAlerts] = useState<OrgChangeAlertView[]>([]);
  const [summary, setSummary] = useState<OrgSyncMonthlySummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /**
   * 🔵 2026-08-31：角色推導一次性放行之二次確認對象（null＝未開啟）。
   * ⚠ 刻意不提供閾值輸入欄位——畫面若能填百分比，一次性放寬會退化為隨手填 100% 的常駐開關，
   *   而該閾值是「上游職稱改名致大量帳號靜默失去限縮」之唯一偵測管道（裁定 Q4.6）。
   *   此處只呈現該次實測筆數，由管理員就事論事地確認。
   */
  const [roleApplyTarget, setRoleApplyTarget] = useState<SyncRunSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getOrgSyncRuns();
      setRuns(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.code : '載入同步紀錄失敗');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /** 待確認提示（頁籤徽章需其總數，故與頁面同時載入，不延遲至切換頁籤）。 */
  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await getOrgChangeAlerts('pending'));
    } catch {
      setAlerts([]);
    }
  }, []);

  /** KPI（失敗僅降級總覽頁籤，不影響其他頁籤）。 */
  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getOrgSyncMonthlySummary());
      setSummaryFailed(false);
    } catch {
      setSummary(null);
      setSummaryFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void load();
    void loadAlerts();
    void loadSummary();
    // B 階段（多公司）：同步紀錄清單需顯示公司名稱，公司主檔一次載入即可（變動頻率低）。
    void Promise.resolve(getCompanies())
      .then((rows) => setCompanies(rows ?? []))
      .catch(() => undefined);
  }, [canRead, load, loadAlerts, loadSummary]);

  /** compid → 公司簡稱；查無 → 原代碼（AC-P23c 同款寬容處置）。 */
  const companyLabel = useCallback(
    (compid: string) => companies.find((c) => c.companyCode === compid)?.companyName ?? compid,
    [companies],
  );

  // 有進行中同步 → 持續輪詢直到完成（US-011「執行中→輪詢結果」）。
  useEffect(() => {
    if (!hasRunningRun(runs)) return;
    const t = setTimeout(() => void load(), 2500);
    return () => clearTimeout(t);
  }, [runs, load]);

  /**
   * B 階段（多公司）：`triggerOrgSync` 回傳陣列，一筆對應一家設定公司。
   * 個別公司之互斥（SYNC_IN_PROGRESS）已由後端協調層吞掉、不再以 409 拋出（見
   * `org-sync-coordinator.ts`），故此處**不會**再因單一公司忙碌而整批進 catch；
   * catch 僅保留給真正未預期之請求層失敗（網路、認證等）。
   */
  /**
   * 🔵 角色推導一次性放行（AC-D_ROLE）：只重跑**該筆所屬公司**，並帶 applyRoleDerivation。
   *
   * ⚠ 帶 compid 是必要的：不限縮的話，無上限的放行會一併套到其餘公司——它們早已套用過、
   *   日常變更量是個位數百分比，沒有理由陪著暴露在無上限的窗口下（後端亦以 400 強制）。
   * 放行僅對這一次執行有效，閾值設定不變；下次同步（含每日排程）自動回到 5%。
   */
  const onApplyRoleDerivation = useCallback(
    async (run: SyncRunSummary) => {
      setRoleApplyTarget(null);
      setTriggering(true);
      try {
        const results = await triggerOrgSync({
          applyRoleDerivation: true,
          compid: run.compid,
        });
        const applied = results.find((r) => r.compid === run.compid);
        if (applied && applied.status === 'success' && !applied.stats.roleDerivationSkipped) {
          toast.success(
            `已套用 ${companyLabel(run.compid)} 之角色推導（降級另列待確認）`,
          );
        } else {
          toast.error(`${companyLabel(run.compid)} 角色推導未套用，請查看同步歷程`);
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? `套用失敗：${e.code}` : '套用失敗');
      } finally {
        setTriggering(false);
        await load();
        await loadAlerts();
        await loadSummary();
      }
    },
    [load, loadAlerts, loadSummary, toast],
  );

  const onTrigger = useCallback(async () => {
    setTriggering(true);
    toast.info('已啟動手動同步…（互斥鎖已取得）');
    try {
      const results = await triggerOrgSync();
      const totalChange = results.reduce((sum, r) => sum + r.changeCount, 0);
      const busy = results.filter((r) => r.errorCode === 'SYNC_IN_PROGRESS');
      const otherFailed = results.filter(
        (r) => r.status === 'failed' && r.errorCode !== 'SYNC_IN_PROGRESS',
      );
      if (busy.length > 0) {
        toast.info(
          `${busy.map((r) => companyLabel(r.compid)).join('、')} 同步進行中，本次略過（SYNC_IN_PROGRESS）`,
        );
      }
      if (otherFailed.length > 0) {
        toast.error(
          `${otherFailed.map((r) => companyLabel(r.compid)).join('、')} 同步失敗`,
        );
      }
      if (busy.length === 0 && otherFailed.length === 0) {
        toast.success(`同步完成，異動 ${totalChange} 筆（頁面已自動更新，無需重新整理）`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? `同步失敗：${e.code}` : '同步失敗');
    } finally {
      setTriggering(false);
      await load();
      await loadAlerts();
      await loadSummary();
    }
  }, [companyLabel, load, loadAlerts, loadSummary, toast]);

  const onResolve = useCallback(
    async (id: string) => {
      try {
        await resolveOrgChangeAlert(id);
        setAlerts((list) => list.filter((a) => a.id !== id));
        toast.success('已標記處理完成（記錄處理者/時間）');
      } catch (e) {
        toast.error(e instanceof ApiError ? `處理失敗：${e.code}` : '處理失敗');
      }
    },
    [toast],
  );

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無組織同步管理權限</h1>
        <p className="text-sm text-slate-500 mt-1">{blockedMessage(role)}</p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const latest = latestRun(runs);
  const running = hasRunningRun(runs);
  const pendingCount = alerts.length;

  return (
    <div className="space-y-5">
      <PageHeader breadcrumb={[{ label: '組織人員異動管理' }, { label: '同步與異動' }]} title="組織人員異動管理" />

      {/* 唯讀橫幅（ICSOPAdmin）——文案逐字沿用 prototype 09 之 #roBanner */}
      {!canWrite && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · ICSOP 管理員可查看同步狀態與待確認異動，但無法觸發「立即同步」。
        </div>
      )}

      {/* 同步狀態卡（位於頁籤列之外，不受頁籤切換影響） */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-11 h-11 rounded-lg bg-primary-50 flex items-center justify-center">
              <Icon name="refresh-cw" className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              {running ? (
                <>
                  <div className="font-semibold text-slate-900">同步進行中…</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    正在讀取組織來源並比對異動
                  </div>
                </>
              ) : latest ? (
                <>
                  <div className="font-semibold text-slate-900">
                    最近同步：
                    <span className="mono">{formatDateTime(latest.startedAt)}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>觸發方式：{trigLabel(latest.triggerType)}</span>
                    <span className="text-slate-300">·</span>
                    <span>
                      結果：
                      <span
                        className={`font-medium ${
                          latest.status === 'failed' ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {resultLabel(latest.status)}
                      </span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                      異動筆數：
                      <span className="font-medium text-slate-700">{latest.changeCount}</span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="font-semibold text-slate-900">尚無同步紀錄</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {running && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-blue-700 bg-blue-50 border border-blue-100">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                執行中
              </span>
            )}
            {canWrite && (
              <button
                onClick={onTrigger}
                disabled={triggering || running}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon
                  name={triggering ? 'loader-2' : 'refresh-cw'}
                  className={`w-4 h-4 ${triggering ? 'animate-spin' : ''}`}
                />
                {triggering ? '同步中' : '立即同步'}
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5" />
          來源＝外部 MSSQL View（唯讀）；每日排程並可手動觸發。手動觸發後本頁自動更新結果，無需重新整理。
        </p>
      </section>

      {/* 頁籤（總覽／同步歷史／待確認異動） */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-200 text-sm">
          {TABS.map((t) => {
            const on = t.key === tab;
            const base = `px-4 py-3 font-medium border-b-2 ${
              on
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  t.key === 'alerts' ? `${base} flex items-center gap-1.5` : base
                }
              >
                {t.label}
                {t.key === 'alerts' && pendingCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 總覽 */}
        {tab === 'overview' && (
          <div className="p-5">
            {summary ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {KPI_CARDS.map((c) => (
                    <div key={c.label} className="border border-slate-200 rounded-lg p-3.5">
                      <div className="flex items-center gap-2">
                        {/* 圖示色以外框 span 之 color 承載（lucide stroke＝currentColor 繼承）。 */}
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: c.bg, color: c.color }}
                        >
                          <Icon name={c.icon} className="w-4 h-4" />
                        </span>
                        <span className="text-2xl font-bold text-slate-900">
                          {c.value(summary)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1.5">{c.label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-4">
                  {`本月（${summary.month}）累計異動分類統計。離職類異動已連動自動停用對應帳號（F005）。`}
                </p>
              </>
            ) : summaryFailed ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                統計資料暫時無法載入，請稍後再試。
              </div>
            ) : (
              <div className="p-1 animate-pulse space-y-3">
                <div className="h-3 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-200 rounded w-1/2" />
              </div>
            )}
          </div>
        )}

        {/* 同步歷史 */}
        {tab === 'history' && (
          <>
            {loading ? (
              <div className="p-6 animate-pulse space-y-3">
                <div className="h-3 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-200 rounded w-1/2" />
              </div>
            ) : runs.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                尚無同步紀錄
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-medium px-4 py-2.5">公司</th>
                      <th className="text-left font-medium px-4 py-2.5">開始時間</th>
                      <th className="text-left font-medium px-4 py-2.5">結束時間</th>
                      <th className="text-left font-medium px-4 py-2.5">觸發方式</th>
                      <th className="text-left font-medium px-4 py-2.5">結果</th>
                      <th className="text-left font-medium px-4 py-2.5">異動筆數</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.map((r) => {
                      const tone = resultTone(r.status);
                      const failed = r.status === 'failed';
                      const isOpen = expanded[r.id];
                      return (
                        <Fragment key={r.id}>
                          <tr className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 text-xs text-slate-600">
                              {companyLabel(r.compid)}
                            </td>
                            <td className="px-4 py-2.5 mono text-xs text-slate-600">
                              {formatDateTime(r.startedAt)}
                            </td>
                            <td className="px-4 py-2.5 mono text-xs text-slate-600">
                              {formatDateTime(r.endedAt)}
                            </td>
                            <td className="px-4 py-2.5">{trigLabel(r.triggerType)}</td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs border ${TONE_BADGE[tone]}`}
                              >
                                {resultLabel(r.status)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-medium">{r.changeCount}</td>
                            <td className="px-4 py-2.5">
                              {failed && r.errorMessage && (
                                <button
                                  onClick={() =>
                                    setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))
                                  }
                                  className="text-xs text-primary-600 hover:underline"
                                >
                                  {isOpen ? '收合錯誤' : '展開錯誤'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {/*
                            🔵 角色推導被閾值跳過：常駐呈現（非展開才看得到）。
                            此列存在的理由＝同步本身是 success，管理員在綠燈旁邊看不出
                            數百筆角色變更被丟棄；半夜排程更無人在場，故必須自己說出來。
                          */}
                          {r.roleDerivationSkipped && (
                            <tr>
                              <td colSpan={7} className="px-4 pb-3 pt-0">
                                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
                                  <Icon
                                    name="alert-triangle"
                                    className="w-3.5 h-3.5 mt-0.5 shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div>
                                      <span className="font-medium">角色推導已跳過</span>
                                      {r.roleChangeCount !== null &&
                                      r.roleDerivationBase !== null ? (
                                        <>
                                          ：本次將變更 {r.roleChangeCount}/
                                          {r.roleDerivationBase} 筆（
                                          {ratioPct(r.roleChangeCount, r.roleDerivationBase)}
                                          ），超過閾值而整批未套用。
                                        </>
                                      ) : (
                                        '：本次變更量超過閾值，整批未套用。'
                                      )}
                                      帳號與組織資料已同步成功，僅角色與子分類停在舊值。
                                    </div>
                                    <div className="mt-0.5 text-amber-700">
                                      閾值用於偵測「上游職稱改名致大量帳號靜默失去限縮」，故不自動放行；確認本次變更量合理後可手動套用。
                                    </div>
                                  </div>
                                  {canWrite && (
                                    <button
                                      onClick={() => setRoleApplyTarget(r)}
                                      disabled={triggering}
                                      className="shrink-0 px-2.5 py-1 rounded border border-amber-300 bg-white text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                    >
                                      本次仍要套用
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          {failed && isOpen && r.errorMessage && (
                            <tr>
                              <td colSpan={7} className="px-4 pb-3 pt-0">
                                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-1.5">
                                  <Icon
                                    name="alert-octagon"
                                    className="w-3.5 h-3.5 mt-0.5 shrink-0"
                                  />
                                  <span>
                                    {r.errorCode ? `${r.errorCode}：` : ''}
                                    {r.errorMessage}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* 待確認異動 */}
        {tab === 'alerts' && (
          <div className="p-5">
            {alerts.length === 0 ? (
              <div className="text-center py-10">
                <Icon name="check-circle-2" className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">目前無待確認組織異動</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((a) => (
                  <AlertCard
                    key={a.id}
                    alert={a}
                    canWrite={canWrite}
                    onGoto={(id) => navigate(`/admin/documents/${id}/edit`)}
                    onResolve={onResolve}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/*
        🔵 角色推導一次性放行之二次確認。版式沿用 prototype 09 之 confirmModal
        （與 08 同一形狀，不另立第二種樣式）。
      */}
      {roleApplyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-labelledby="roleApplyTitle"
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 id="roleApplyTitle" className="font-semibold text-slate-900">
                  套用本次角色推導？
                </h3>
                <div className="text-sm text-slate-500 mt-1 space-y-1">
                  <p>
                    將對{' '}
                    <b>
                      {roleApplyTarget.roleChangeCount ?? '?'}
                    </b>{' '}
                    筆帳號（共 {roleApplyTarget.roleDerivationBase ?? '?'} 筆，
                    {roleApplyTarget.roleChangeCount !== null &&
                    roleApplyTarget.roleDerivationBase !== null
                      ? ratioPct(
                          roleApplyTarget.roleChangeCount,
                          roleApplyTarget.roleDerivationBase,
                        )
                      : '—'}
                    ）寫入角色與子分類變更，範圍限
                    {companyLabel(roleApplyTarget.compid)}。
                  </p>
                  <p>
                    升級與子分類直接套用；<b>降級不自動執行</b>，僅產生待確認提示。
                  </p>
                  <p className="text-amber-700">
                    本次放行僅對這一次執行有效，閾值設定不變。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setRoleApplyTarget(null)}
                className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={() => void onApplyRoleDerivation(roleApplyTarget)}
                disabled={triggering}
                className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50"
              >
                確認套用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 比例呈現（一位小數）。分母為 0 → 「—」，不讓 NaN 出現在畫面上。 */
function ratioPct(count: number, base: number): string {
  if (base <= 0) return '—';
  return `${((count / base) * 100).toFixed(1)}%`;
}

/** before → after 事實快照（line-through 舊值 → amber 新值）；DOCUMENT_FIELD 與 F005 兩類共用。 */
function BeforeAfterDiff({
  before,
  after,
}: {
  before: string | null;
  after: string | null;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
      <span className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-500 line-through">
        {before}
      </span>
      <Icon name="arrow-right" className="w-3.5 h-3.5 text-slate-400" />
      <span className="px-2 py-1 rounded bg-white border border-amber-200 text-amber-800">
        {after}
      </span>
    </div>
  );
}

/**
 * 提示卡（prototype 09 `renderAlerts()` 之 amber 卡片骨架）。依 alertKind **四路完整分流**渲染
 * （非二元 isDoc）——防止 F005 兩類被誤判為 CLOSED_DEPT_PERSON 版式（顯示錯誤情境文案／讀取不存在欄位）：
 *  - DOCUMENT_FIELD：文件編號＋受影響欄位＋before/after＋「前往當責設定」。
 *  - CLOSED_DEPT_PERSON：員編/姓名/已關閉部門/關閉日期；無 before-after、無導頁。
 *  - DATA_INCONSISTENCY（F005）：accountLoginId/姓名＋情境「資料不一致」＋before/after；無導頁。
 *  - ACCOUNT_DISAPPEARED（F005）：accountLoginId/姓名＋情境「帳號消失」＋before/after＋消失前部門；無導頁。
 * prototype 09 對 F005 兩類無現成草稿（設計確認之缺口）：沿用既有 amber 卡骨架＋待確認 pill＋resolve 動作，
 * 依 AC 之必要資訊最小且一致呈現（見 impl log 之 prototype-09 落差註記）。
 */
function AlertCard({
  alert,
  canWrite,
  onGoto,
  onResolve,
}: {
  alert: OrgChangeAlertView;
  canWrite: boolean;
  onGoto: (documentId: string) => void;
  onResolve: (id: string) => void;
}): JSX.Element {
  const kind = alert.alertKind;
  const isDoc = kind === 'DOCUMENT_FIELD';
  // 主要識別（mono 小字）：文件類＝文件編號；人員類＝員編；F005 兩類＝帳號 loginId。
  const idText =
    kind === 'DOCUMENT_FIELD'
      ? alert.documentNumber
      : kind === 'CLOSED_DEPT_PERSON'
        ? alert.personEmployeeNo
        : alert.accountLoginId;
  // 標題（名稱行）。
  const titleText =
    kind === 'DOCUMENT_FIELD'
      ? alert.documentName
      : kind === 'CLOSED_DEPT_PERSON'
        ? `${alert.personName ?? ''}（在職）`
        : (alert.personName ?? alert.accountLoginId ?? '');

  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mono text-xs text-slate-500">{idText}</span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
              style={{ color: '#B45309', background: '#FEF3C7' }}
            >
              <Icon name="clock" className="w-3 h-3" />
              待確認
            </span>
          </div>
          <div className="text-sm font-medium text-slate-900 mt-0.5">{titleText}</div>

          {kind === 'DOCUMENT_FIELD' && (
            <>
              <div className="text-xs text-slate-600 mt-2">
                受影響欄位：<span className="font-medium">{alert.affectedField}</span>
              </div>
              <BeforeAfterDiff before={alert.beforeValue} after={alert.afterValue} />
            </>
          )}

          {kind === 'CLOSED_DEPT_PERSON' && (
            <>
              <div className="text-xs text-slate-600 mt-2">
                受影響情境：<span className="font-medium">掛於已關閉部門</span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
                <span className="px-2 py-1 rounded bg-white border border-amber-200 text-amber-800">
                  {alert.deptName}
                  <span className="mono text-slate-500">（{alert.deptOrgCode}）</span>
                </span>
                <span className="text-slate-500">
                  關閉日期：{formatDateOnly(alert.deptCloseDate)}
                </span>
              </div>
            </>
          )}

          {kind === 'DATA_INCONSISTENCY' && (
            <>
              <div className="text-xs text-slate-600 mt-2">
                受影響情境：<span className="font-medium">資料不一致</span>
              </div>
              <BeforeAfterDiff before={alert.beforeValue} after={alert.afterValue} />
            </>
          )}

          {kind === 'ACCOUNT_DISAPPEARED' && (
            <>
              <div className="text-xs text-slate-600 mt-2">
                受影響情境：<span className="font-medium">帳號消失</span>
              </div>
              <BeforeAfterDiff before={alert.beforeValue} after={alert.afterValue} />
              {alert.deptName && (
                <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
                  <span className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-600">
                    {alert.deptName}
                    <span className="mono text-slate-500">（{alert.deptOrgCode}）</span>
                  </span>
                  <span className="text-slate-500">消失前最後已知部門</span>
                </div>
              )}
            </>
          )}
        </div>
        {canWrite && (
          <div className="flex flex-col gap-2 shrink-0">
            {isDoc && alert.documentId && (
              <button
                onClick={() => onGoto(alert.documentId as string)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-xs font-medium hover:bg-primary-700"
              >
                <Icon name="external-link" className="w-3.5 h-3.5" />
                前往當責設定
              </button>
            )}
            <button
              onClick={() => onResolve(alert.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-xs hover:bg-slate-50"
            >
              <Icon name="check" className="w-3.5 h-3.5" />
              標記無需變更
            </button>
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mt-2">
        提示為非強制，文件狀態與當責設定在人工處理前維持不變。
      </p>
    </div>
  );
}
