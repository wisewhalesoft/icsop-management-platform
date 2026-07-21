import { Fragment, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { getOrgSyncRuns, triggerOrgSync } from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import type { SyncRunSummary } from '../api/types';
import {
  trigLabel,
  resultLabel,
  resultTone,
  latestRun,
  hasRunningRun,
  formatDateTime,
} from './org-sync-view';

/**
 * 組織人員異動管理（US-011）。版面/樣式權威來源：prototypes/09-org-sync-management.html
 * 之「同步狀態卡＋同步歷史表」。接真實端點 GET /admin/org-sync/runs、POST /admin/org-sync/run。
 * RBAC：SysAdmin 可觸發（write）、ICSOPAdmin 唯讀。觸發後自動輪詢/重載，無需重新整理。
 * 註：原型之「總覽 KPI」與「待確認異動」頁籤需 per-run 統計端點與 F006，尚未實作故未納入本增量。
 */
const TONE_BADGE: Record<string, string> = {
  success: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  danger: 'text-red-700 bg-red-50 border-red-100',
  info: 'text-blue-700 bg-blue-50 border-blue-100',
};

interface Notice {
  tone: 'success' | 'danger' | 'info';
  text: string;
}

export function OrgSyncPage(): JSX.Element {
  const { user } = useAuth();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ORG_SYNC_MANAGEMENT, 'read');
  const canTrigger = canPerform(role, FunctionKey.ORG_SYNC_MANAGEMENT, 'write');

  const [runs, setRuns] = useState<SyncRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const data = await getOrgSyncRuns();
      setRuns(data);
    } catch (e) {
      setNotice({
        tone: 'danger',
        text: e instanceof ApiError ? e.code : '載入同步紀錄失敗',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  // 有進行中同步 → 持續輪詢直到完成（US-011「執行中→輪詢結果」）。
  useEffect(() => {
    if (!hasRunningRun(runs)) return;
    const t = setTimeout(() => void load(), 2500);
    return () => clearTimeout(t);
  }, [runs, load]);

  const onTrigger = useCallback(async () => {
    setTriggering(true);
    setNotice({ tone: 'info', text: '已啟動手動同步…（互斥鎖已取得）' });
    try {
      const res = await triggerOrgSync();
      setNotice({
        tone: 'success',
        text: `同步完成，異動 ${res.changeCount} 筆（頁面已自動更新）`,
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SYNC_IN_PROGRESS') {
        setNotice({ tone: 'info', text: '同步進行中，請稍候（SYNC_IN_PROGRESS）' });
      } else {
        setNotice({
          tone: 'danger',
          text: e instanceof ApiError ? `同步失敗：${e.code}` : '同步失敗',
        });
      }
    } finally {
      setTriggering(false);
      await load();
    }
  }, [load]);

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="alert-circle" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無組織同步管理權限</h1>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const latest = latestRun(runs);
  const running = hasRunningRun(runs);

  return (
    <div className="space-y-5">
      {/* 唯讀橫幅（ICSOPAdmin） */}
      {canRead && !canTrigger && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="user-circle" className="w-4 h-4 shrink-0" />
          唯讀模式 · 可查看同步狀態與歷史，但無法觸發「立即同步」。
        </div>
      )}

      {/* 同步狀態卡 */}
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
                  <div className="text-xs text-slate-500 mt-0.5">
                    觸發方式：{trigLabel(latest.triggerType)} · 異動 {latest.changeCount} 筆
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
            {canTrigger && (
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
          來源＝外部 MSSQL View（唯讀）；每日排程並可手動觸發。觸發後本頁自動輪詢更新，無需重新整理。
        </p>
        {notice && (
          <div
            role="status"
            className={`mt-3 text-sm border rounded-md px-3 py-2 ${TONE_BADGE[notice.tone]}`}
          >
            {notice.text}
          </div>
        )}
      </section>

      {/* 同步歷史 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-700">
          同步歷史
        </div>
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
                      {failed && isOpen && r.errorMessage && (
                        <tr>
                          <td colSpan={6} className="px-4 pb-3 pt-0">
                            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start gap-1.5">
                              <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
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
      </section>
    </div>
  );
}
