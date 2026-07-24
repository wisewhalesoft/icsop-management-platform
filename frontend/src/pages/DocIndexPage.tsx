import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  getDocIndexOverview,
  getDocIndexChunks,
  getDocIndexStatus,
  reindexDocument,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import type {
  DocIndexChunk,
  DocIndexOverview,
  DocIndexOverviewRow,
  DocIndexStatus,
  IndexStatusState,
} from '../api/types';

/**
 * F031 文件索引管理（AI 提取／索引）。版面/欄位/文案權威來源：prototypes/21-document-index-management.html。
 * 接真實端點 GET /admin/doc-index/overview、/:id、/:id/chunks、POST /:id/reindex。
 * RBAC：ICSOPAdmin CRUD、SysAdmin 唯讀（重新索引按鈕不顯示）、主管/部門窗口/一般使用者無（自我守門封鎖）。
 * 後端 RBAC 為權威，前端另做自我守門封鎖（比照 OrgSyncPage/AccessHistoryPage 雙層模式）。
 */

type StateFilter = '' | 'success' | 'running' | 'failed' | 'not_built';

const STATE_META: Record<
  IndexStatusState,
  { label: string; tone: string; icon: string }
> = {
  success: { label: '成功', tone: 'text-emerald-700 bg-emerald-50 border-emerald-100', icon: 'check-circle-2' },
  running: { label: '建置中', tone: 'text-primary-700 bg-primary-50 border-primary-100', icon: 'loader' },
  failed: { label: '失敗', tone: 'text-red-700 bg-red-50 border-red-100', icon: 'x-circle' },
  not_built: { label: '尚未建立', tone: 'text-slate-600 bg-slate-50 border-slate-200', icon: 'minus-circle' },
};

const STAGE_LABEL: Record<string, string> = {
  extract: '抽取失敗',
  chunk: '切 chunk 失敗',
  embed: '向量化失敗',
};

function rowLabel(r: DocIndexOverviewRow): string {
  return r.documentNumber || r.documentId;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('sv-SE');
}

export function DocIndexPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.DOCUMENT_INDEX_MANAGEMENT, 'write');

  const [overview, setOverview] = useState<DocIndexOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<StateFilter>('');
  const [keyword, setKeyword] = useState('');

  // 提取結果／失敗詳情 modal
  const [previewRow, setPreviewRow] = useState<DocIndexOverviewRow | null>(null);
  const [previewChunks, setPreviewChunks] = useState<DocIndexChunk[] | null>(null);
  const [previewStatus, setPreviewStatus] = useState<DocIndexStatus | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 重新索引確認
  const [confirmRow, setConfirmRow] = useState<DocIndexOverviewRow | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const load = useCallback(
    async (state: StateFilter) => {
      setLoading(true);
      try {
        const res = await getDocIndexOverview(state ? { state } : {});
        setOverview(res);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.code : '載入索引總覽失敗');
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (canRead) void load('');
  }, [canRead, load]);

  const onFilter = (v: string) => {
    const next = v as StateFilter;
    setStateFilter(next);
    void load(next);
  };

  const rows = useMemo(() => {
    const items = overview?.items ?? [];
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(
      (r) =>
        rowLabel(r).toLowerCase().includes(kw) ||
        (r.documentName ?? '').toLowerCase().includes(kw),
    );
  }, [overview, keyword]);

  const openPreview = useCallback(
    async (r: DocIndexOverviewRow) => {
      setPreviewRow(r);
      setPreviewChunks(null);
      setPreviewStatus(null);
      setPreviewLoading(true);
      try {
        const status = await getDocIndexStatus(r.documentId);
        setPreviewStatus(status);
        if (status.state === 'success') {
          setPreviewChunks(await getDocIndexChunks(r.documentId));
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? e.code : '載入提取結果失敗');
      } finally {
        setPreviewLoading(false);
      }
    },
    [toast],
  );

  const closePreview = () => {
    setPreviewRow(null);
    setPreviewChunks(null);
    setPreviewStatus(null);
  };

  const doReindex = useCallback(async () => {
    if (!confirmRow) return;
    setReindexing(true);
    try {
      await reindexDocument(confirmRow.documentId);
      toast.success(`已建立重新索引（INDEX_RUN，triggerType=manual）：${rowLabel(confirmRow)}`);
      setConfirmRow(null);
      await load(stateFilter);
    } catch (e) {
      toast.error(e instanceof ApiError ? `重新索引失敗：${e.code}` : '重新索引失敗');
    } finally {
      setReindexing(false);
    }
  }, [confirmRow, load, stateFilter, toast]);

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無文件索引管理權限</h1>
        <p className="text-sm text-slate-500 mt-1">
          僅 ICSOP 管理員（可維護）與系統管理員（唯讀）可存取本功能。
        </p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const summaryCards: { key: 'success' | 'running' | 'failed' | 'not_built'; label: string; count: number }[] = [
    { key: 'success', label: '成功', count: overview?.successCount ?? 0 },
    { key: 'running', label: '建置中', count: overview?.runningCount ?? 0 },
    { key: 'failed', label: '失敗', count: overview?.failedCount ?? 0 },
    { key: 'not_built', label: '尚未建立', count: overview?.notBuiltCount ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={['AI 智慧問答', '文件索引管理']} title="文件索引管理 · 提取結果與重新索引" />

      {/* 唯讀提示（SysAdmin） */}
      {canRead && !canWrite && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm border bg-cyan-50 border-cyan-200 text-cyan-800">
          <Icon name="eye" className="w-4 h-4" />
          唯讀模式 · 系統管理員僅可檢視索引狀態與提取結果，無法觸發重新索引（FIELD_WRITE_FORBIDDEN）。
        </div>
      )}

      <div className="flex items-start gap-2 text-sm text-slate-500">
        <Icon name="info" className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
        <p>
          管理端獨立驗證 ingestion 管線品質：由 <strong>.xls 原件</strong>（AI 檢索內容來源；與呈現／下載用
          ICSOP PDF <strong>各自獨立手動上傳、系統不自動轉檔</strong>，OQ-E09-10 定案）經模板感知抽取／清洗，
          依「章／節」切為 chunk 並掛 metadata 建立向量索引。每個 chunk 的{' '}
          <strong>使用部門／狀態／公告日期</strong> metadata 驅動前台{' '}
          <strong>權限感知檢索</strong>（F033，過濾於檢索層而非生成後）。
        </p>
      </div>

      {/* 彙總卡 */}
      <div role="group" aria-label="索引狀態彙總" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <button
            key={c.key}
            onClick={() => onFilter(stateFilter === c.key ? '' : c.key)}
            className={`text-left bg-white border rounded-xl p-3.5 hover:border-primary-300 transition ${stateFilter === c.key ? 'border-primary-400' : 'border-slate-200'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center border ${STATE_META[c.key].tone}`}>
                <Icon name={STATE_META[c.key].icon} className="w-4 h-4" />
              </span>
              <span className="text-2xl font-bold text-slate-900">{c.count}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1.5">{c.label}</div>
          </button>
        ))}
      </div>

      {/* 工具列 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            aria-label="搜尋文件"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            type="search"
            placeholder="搜尋文件編號或名稱…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm"
          />
        </div>
        <select
          aria-label="索引狀態"
          value={stateFilter}
          onChange={(e) => onFilter(e.target.value)}
          className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
        >
          <option value="">所有索引狀態</option>
          <option value="success">成功</option>
          <option value="running">建置中</option>
          <option value="failed">失敗</option>
          <option value="not_built">尚未建立</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">{overview ? `共 ${overview.total} 份文件` : ''}</span>
      </div>

      {/* 清單 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">文件編號 / 名稱</th>
                <th className="text-left font-medium px-4 py-2.5">.xls 原件</th>
                <th className="text-left font-medium px-4 py-2.5">索引狀態</th>
                <th className="text-left font-medium px-4 py-2.5">chunk 數</th>
                <th className="text-left font-medium px-4 py-2.5">最後索引時間</th>
                <th className="text-left font-medium px-4 py-2.5">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const meta = STATE_META[r.state];
                return (
                  <tr key={r.documentId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="mono text-xs text-slate-500">{rowLabel(r)}</div>
                      {r.documentName && <div className="font-medium text-slate-800">{r.documentName}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {r.hasXls === true ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <Icon name="file-spreadsheet" className="w-3.5 h-3.5" />有
                        </span>
                      ) : r.hasXls === false ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Icon name="file-x" className="w-3.5 h-3.5" />無
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${meta.tone}`}>
                        <Icon name={meta.icon} className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {r.state === 'failed' && (r.errorCode || r.errorStage) && (
                        <div className="text-[10px] mono text-red-400 mt-1">
                          {r.errorCode ?? STAGE_LABEL[r.errorStage as string] ?? r.errorStage}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 mono text-slate-700">
                      {r.state === 'success' ? (r.chunkCount ?? 0) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 mono text-xs text-slate-500">{formatDateTime(r.lastIndexedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {r.state === 'not_built' && (
                          <span className="text-xs text-slate-400 mr-1">
                            {r.hasXls === false ? '請先上傳 .xls' : '待建立索引'}
                          </span>
                        )}
                        {(r.state === 'success' || r.state === 'failed') && (
                          <button
                            onClick={() => void openPreview(r)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs ${r.state === 'failed' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                          >
                            <Icon name={r.state === 'failed' ? 'file-warning' : 'scan-text'} className="w-3.5 h-3.5" />
                            {r.state === 'failed' ? '查看失敗詳情' : '檢視提取結果'}
                          </button>
                        )}
                        {canWrite &&
                          r.hasXls !== false &&
                          (r.state === 'running' ? (
                            <button
                              disabled
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs text-slate-400"
                            >
                              <Icon name="loader" className="w-3.5 h-3.5 animate-spin" />
                              建置中
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmRow(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary-600 text-white text-xs hover:bg-primary-700"
                            >
                              <Icon name="refresh-cw" className="w-3.5 h-3.5" />
                              重新索引
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-14">
            <Icon name="inbox" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">查無符合的文件</p>
          </div>
        ) : null}
      </section>

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <Icon name="shield-check" className="w-3.5 h-3.5" />
        chunk 提取結果僅供管理員檢視，不對一般使用者開放；提取時已清洗頁首頁尾／簽核區／合併空白／流程圖繪製格。
      </p>

      {/* 提取結果 / 失敗詳情 modal */}
      {previewRow && (
        <div role="dialog" aria-label="提取結果預覽" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Icon name="scan-text" className="w-4 h-4 text-primary-600" />
                  提取結果預覽
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 mono truncate">{rowLabel(previewRow)}</p>
              </div>
              <button onClick={closePreview} aria-label="關閉" className="text-slate-400 hover:text-slate-600 shrink-0">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {previewLoading ? (
                <div className="p-4 animate-pulse space-y-2">
                  <div className="h-3 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                </div>
              ) : previewStatus?.state === 'failed' ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                    <Icon name="x-circle" className="w-4 h-4" />
                    索引失敗
                  </div>
                  <dl className="mt-3 text-sm grid grid-cols-1 sm:grid-cols-3 gap-y-2">
                    <dt className="text-slate-400">失敗階段</dt>
                    <dd className="sm:col-span-2 text-slate-700">{previewStatus.stageLabel ?? previewStatus.errorStage ?? '—'}</dd>
                    <dt className="text-slate-400">錯誤碼</dt>
                    <dd className="sm:col-span-2 mono text-red-600">{previewStatus.errorCode ?? '—'}</dd>
                    <dt className="text-slate-400">錯誤訊息</dt>
                    <dd className="sm:col-span-2 text-slate-700 leading-6">{previewStatus.errorMessage ?? '—'}</dd>
                  </dl>
                  <p className="text-xs text-slate-500 mt-3 flex items-start gap-1.5">
                    <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    失敗不留部分／不完整索引殘留；若先前已有索引，將保留舊版繼續服務檢索直到重抽成功（REINDEX_FAILED）。
                  </p>
                  {canWrite && (
                    <div className="mt-4">
                      <button
                        onClick={() => {
                          const r = previewRow;
                          closePreview();
                          setConfirmRow(r);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700"
                      >
                        <Icon name="refresh-cw" className="w-4 h-4" />
                        手動重新索引
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
                    <Icon name="sparkles" className="w-3.5 h-3.5 mt-0.5 text-primary-500 shrink-0" />
                    <span>
                      共 <strong className="text-slate-700">{previewChunks?.length ?? 0}</strong> 個 chunk（依「節」切分，每 chunk 對應一個完整作業步驟）。已清洗頁首頁尾／簽核區／合併儲存格空白／流程圖繪製格；「作業內容」跨列合併已接合為完整段落。
                    </span>
                  </div>
                  {(previewChunks ?? []).map((ck) => (
                    <div key={ck.chunkSeq} className="rounded-lg border border-slate-200 p-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 mono">chunk {ck.chunkSeq}</span>
                        <span className="text-sm font-semibold text-slate-800">{ck.chapterSection}</span>
                      </div>
                      <p className="text-sm text-slate-600 leading-6 mt-1.5">{ck.content}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100 text-[10px]">
                        <span className="text-slate-400">metadata：</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">狀態 {ck.status}</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 text-primary-700">{ck.lifecycleName ?? ck.documentNumber}</span>
                        <span className="text-slate-400">使用部門</span>
                        {ck.usingDeptIds.map((u) => (
                          <span key={u} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{u}</span>
                        ))}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mono">版次 {ck.edition}</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mono">公告 {ck.announcedDate ?? '—'}</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mono">頁次 p.{ck.pageNumber}</span>
                        {ck.chunkId && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 mono">{ck.chunkId}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 重新索引確認 */}
      {confirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
                <Icon name="refresh-cw" className="w-5 h-5 text-primary-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">重新索引「{rowLabel(confirmRow)}」？</h3>
                <p className="text-sm text-slate-500 mt-1">
                  將重新讀取 .xls 原件，重跑模板感知抽取、依章/節切 chunk 並重建向量索引；成功後以新版取代舊版。此操作記錄於 INDEX_RUN（triggerType=manual）。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setConfirmRow(null)} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
                取消
              </button>
              <button
                onClick={() => void doReindex()}
                disabled={reindexing}
                className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50"
              >
                確認重新索引
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
