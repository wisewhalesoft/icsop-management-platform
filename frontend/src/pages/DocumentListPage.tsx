import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getDocuments, getDocumentAttachments, downloadAttachment } from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SearchCombobox, type ComboOption } from '../components/SearchCombobox';
import { useToast } from '../components/useToast';
import { formatDateTime } from './org-sync-view';
import { deriveDisplayStatus, DISPLAY_LABEL, type DisplayStatus } from './document-display';
import type { DocumentListItem, DocumentLinkView } from '../api/types';

/**
 * 後台 ICSOP 程序書清單（F017）。版面權威來源：prototypes/13-document-list.html。
 * 全寬（AppShell main 已 px-4 py-6）；統計卡（總數/已公告/進度中，依公告日期衍生 F012）、
 * 14 欄、9 可搜尋下拉篩選（循環別/狀態/編號/書名/制定公司/部門/室別/當責室長/連結點）、
 * 依編號/公告日期排序、真分頁（每頁 50）。RBAC：ICSOP文件管理 read=SysAdmin/ICSOPAdmin/
 * Supervisor/DeptContact、write=ICSOPAdmin（建立/編輯）。
 *
 * 資料策略：一次載入完整工作集（getDocuments pageSize 大），前端衍生 9 篩選之選項、
 * 客端篩選/排序/分頁與統計（比照 prototype 之 client-side 模型）。連結點篩選（linkTargetId）
 * 改以後端查詢取得指向目標之文件 id 集合後於客端交集。
 *
 * 「檔案」欄＝該列自身之 ICSOP PDF 下載鈕（清單項已帶 icsopPdfBlobPath/FileName）；
 * 「連結點程序書」欄＝每個連結一個 pill，點擊＝下載「目標文件」之 ICSOP PDF
 * （先取目標之附件清單，再走同一支受控（稽核）下載端點；不新增第二條下載路徑）。
 * 浮水印與否由伺服器端依 F020 決定，前端不帶任何浮水印旗標。
 */
const PAGE_SIZE = 50;
const LOAD_SIZE = 2000;

const ERROR_MSG: Record<string, string> = {
  DOCUMENT_NOT_FOUND: '找不到文件',
};
const msgOf = (e: unknown) =>
  e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '載入失敗';

/** 衍生顯示狀態之 pill 樣式（比照 prototype 之色票與圖示）。 */
const DISPLAY_META: Record<DisplayStatus, { cls: string; icon: string }> = {
  announced: { cls: 'text-emerald-700 bg-emerald-50', icon: 'megaphone' },
  in_progress: { cls: 'text-primary-700 bg-primary-50', icon: 'clock' },
  inactive: { cls: 'text-amber-700 bg-amber-50', icon: 'pause-circle' },
  void: { cls: 'text-red-700 bg-red-50', icon: 'x-circle' },
};

type FilterKey = 'cycle' | 'status' | 'num' | 'name' | 'dept' | 'section' | 'chief' | 'company' | 'link';
type SortBy = '' | 'documentNumber' | 'announcedDate';

/** 篩選定義（順序＝prototype FILTERS）。get 回傳該欄之比對值（連結點另以 linkTargetSet 處理）。 */
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'cycle', label: '循環別' },
  { key: 'status', label: '狀態' },
  { key: 'num', label: '程序書編號' },
  { key: 'name', label: '程序書書名' },
  { key: 'dept', label: '制定部門' },
  { key: 'section', label: '制定室別' },
  { key: 'chief', label: '當責室長' },
  { key: 'company', label: '制定公司' },
  { key: 'link', label: '連結點程序書' },
];

const uniq = (a: (string | null)[]): string[] =>
  [...new Set(a.filter((x): x is string => !!x))];

/**
 * F017 AC-S2／F040 AC-31「循環別」篩選選項：value＝`lifecycleId`（**非**名稱字串，亦非循環代碼——
 * 同名不同子分類之代碼相同、無法區分）、label＝後端已以 `lifecycleDisplayName` 組合之顯示名稱。
 * 依列序去重，故同名不同子分類會產生兩個相異選項。
 */
const cycleFilterOptions = (rows: DocumentListItem[]): ComboOption[] => {
  const byId = new Map<string, string>();
  for (const d of rows) {
    if (d.lifecycleId && !byId.has(d.lifecycleId)) {
      byId.set(d.lifecycleId, d.lifecycleName ?? d.lifecycleId);
    }
  }
  return [...byId].map(([value, label]) => ({ value, label }));
};

export function DocumentListPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');
  const toast = useToast();
  const today = useMemo(() => new Date(), []);

  const [all, setAll] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    cycle: '', status: '', num: '', name: '', dept: '', section: '', chief: '', company: '', link: '',
  });
  const [linkTargetSet, setLinkTargetSet] = useState<Set<string> | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDocuments({ pageSize: LOAD_SIZE });
      setAll(res.items);
    } catch (e) {
      toast.error(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  // 連結點篩選：以後端 linkTargetId 查詢取得指向目標之文件 id 集合（清單項不含連結明細）。
  useEffect(() => {
    if (!filters.link) {
      setLinkTargetSet(null);
      return;
    }
    let alive = true;
    void getDocuments({ linkTargetId: filters.link, pageSize: LOAD_SIZE })
      .then((res) => {
        if (alive) setLinkTargetSet(new Set(res.items.map((d) => d.id)));
      })
      .catch(() => {
        if (alive) setLinkTargetSet(new Set());
      });
    return () => {
      alive = false;
    };
  }, [filters.link]);

  /** 受控下載：核發短效期 URL → 開新分頁（伺服器端寫入稽核 DOWNLOAD）。 */
  const openBlob = useCallback(async (blobPath: string, label: string) => {
    try {
      const grant = await downloadAttachment(blobPath);
      window.open(grant.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(`無法下載「${label}」`);
    }
  }, [toast]);

  /**
   * 連結點 pill：下載「目標文件」之 ICSOP PDF。
   * 先取目標文件之附件清單（同一 documentId 維度之既有端點），再走與「檔案」欄相同之受控下載。
   * 目標無 ICSOP PDF／取用失敗 → 以既有錯誤提示呈現，不崩潰。
   */
  const onDownloadLink = useCallback(
    async (l: DocumentLinkView) => {
      const label = `${l.targetNumber ?? l.targetDocumentId}${l.targetName ? ` ${l.targetName}` : ''}`;
      try {
        const atts = await getDocumentAttachments(l.targetDocumentId);
        const pdf = atts.find((a) => a.type === 'ICSOP_PDF');
        if (!pdf) {
          toast.error(`無法下載「${label}」`);
          return;
        }
        await openBlob(pdf.blobPath, label);
      } catch {
        toast.error(`無法下載「${label}」`);
      }
    },
    [openBlob, toast],
  );

  const chiefValue = useCallback(
    (d: DocumentListItem): string | null => d.primaryChiefName ?? d.primaryChiefId,
    [],
  );
  const statusValue = useCallback(
    (d: DocumentListItem): string =>
      DISPLAY_LABEL[deriveDisplayStatus(d.status, d.announcedDate, today)],
    [today],
  );

  // 9 篩選之下拉選項（自完整工作集衍生；首項＝「全部」＝清除）。
  const filterOptions = useMemo<Record<FilterKey, ComboOption[]>>(() => {
    const opt = (vals: string[]): ComboOption[] => [
      { value: '', label: '全部' },
      ...vals.map((v) => ({ value: v, label: v })),
    ];
    return {
      cycle: [{ value: '', label: '全部' }, ...cycleFilterOptions(all)],
      status: opt(['已公告', '進度中', '失效', '作廢']),
      num: opt(uniq(all.map((d) => d.documentNumber))),
      name: opt(uniq(all.map((d) => d.documentName))),
      dept: opt(uniq(all.map((d) => d.draftingDeptName))),
      section: opt(uniq(all.map((d) => d.draftingSectionName))),
      chief: opt(uniq(all.map(chiefValue))),
      company: opt(uniq(all.map((d) => d.draftingCompanyName))),
      link: [
        { value: '', label: '全部' },
        ...all.map((d) => ({ value: d.id, label: `${d.documentNumber} ${d.documentName}` })),
      ],
    };
  }, [all, chiefValue]);

  const setFilter = useCallback((key: FilterKey, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);
  const clearFilters = useCallback(() => {
    setFilters({ cycle: '', status: '', num: '', name: '', dept: '', section: '', chief: '', company: '', link: '' });
    setPage(1);
  }, []);
  const anyFilter = Object.values(filters).some((v) => v);

  const toggleSort = useCallback((key: Exclude<SortBy, ''>) => {
    setSortBy((prevBy) => {
      if (prevBy !== key) {
        setSortDir('asc');
        return key;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return key;
    });
    setPage(1);
  }, []);

  // 客端篩選 → 排序 → 分頁。
  const filtered = useMemo(() => {
    const rows = all.filter((d) => {
      // F017 AC-S2：篩選鍵為 lifecycleId（非名稱），故同名不同子分類可分別篩選。
      if (filters.cycle && d.lifecycleId !== filters.cycle) return false;
      if (filters.status && statusValue(d) !== filters.status) return false;
      if (filters.num && d.documentNumber !== filters.num) return false;
      if (filters.name && d.documentName !== filters.name) return false;
      if (filters.dept && d.draftingDeptName !== filters.dept) return false;
      if (filters.section && d.draftingSectionName !== filters.section) return false;
      if (filters.chief && chiefValue(d) !== filters.chief) return false;
      if (filters.company && d.draftingCompanyName !== filters.company) return false;
      if (filters.link && (!linkTargetSet || !linkTargetSet.has(d.id))) return false;
      return true;
    });
    if (sortBy) {
      const dir = sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const av = (a[sortBy] ?? '') as string;
        const bv = (b[sortBy] ?? '') as string;
        return av < bv ? -dir : av > bv ? dir : 0;
      });
    }
    return rows;
  }, [all, filters, statusValue, chiefValue, linkTargetSet, sortBy, sortDir]);

  const counts = useMemo(() => {
    let announced = 0;
    let inProgress = 0;
    for (const d of filtered) {
      const s = deriveDisplayStatus(d.status, d.announcedDate, today);
      if (s === 'announced') announced++;
      else if (s === 'in_progress') inProgress++;
    }
    return { total: filtered.length, announced, inProgress };
  }, [filtered, today]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [filtered, clampedPage],
  );

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無程序書管理權限</h1>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={['ICSOP 文件管理', '程序書清單']} title="後台程序書清單">
        {canWrite && (
          <button
            onClick={() => navigate('/admin/documents/new')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="plus" className="w-4 h-4" />
            建立程序書
          </button>
        )}
      </PageHeader>

      {/* 統計卡（衍生數，依目前篩選結果） */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon="library" tone="text-primary-600 bg-primary-50" value={counts.total} label="程序書數量（總數）" valueClass="text-slate-900" />
        <StatCard icon="megaphone" tone="text-emerald-600 bg-emerald-50" value={counts.announced} label="已公告（公告日期已到）" valueClass="text-emerald-700" />
        <StatCard icon="clock" tone="text-primary-600 bg-primary-50" value={counts.inProgress} label="進度中（公告日期未到）" valueClass="text-primary-700" />
      </div>

      {canRead && !canWrite && (
        <div role="note" className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色對 ICSOP 程序書僅可檢視/下載，無法建立或編輯（FIELD_WRITE_FORBIDDEN）。
        </div>
      )}

      {/* 9 個可搜尋下拉篩選 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="filter" className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">篩選條件</span>
          <span className="text-xs text-slate-400">（可輸入關鍵字過濾）</span>
          {anyFilter && (
            <button onClick={clearFilters} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-primary-600 hover:bg-primary-50">
              <Icon name="x" className="w-3.5 h-3.5" />
              清除全部
            </button>
          )}
          <span className={`text-sm text-slate-500 ${anyFilter ? '' : 'ml-auto'}`}>共 {filtered.length} 筆</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {FILTERS.map((f) => (
            <SearchCombobox
              key={f.key}
              id={`filter-${f.key}`}
              label={f.label}
              density="filter"
              options={filterOptions[f.key]}
              value={filters[f.key]}
              onChange={(v) => setFilter(f.key, v)}
              placeholder="全部"
            />
          ))}
        </div>
      </div>

      {/* 14 欄表格 */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1560px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-3 py-2.5 min-w-[152px]">制定公司</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[88px]">制定部門</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[104px]">制定室別</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[118px]">當責室長</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[90px]">狀態</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[60px]">檔案</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[62px]">樹狀圖</th>
                <SortHeader label="程序書編號" active={sortBy === 'documentNumber'} dir={sortDir} onClick={() => toggleSort('documentNumber')} className="min-w-[152px]" />
                <th className="text-left font-medium px-3 py-2.5 min-w-[176px]">程序書書名</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[74px]">版次</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[210px]">內容摘要</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[108px]">連結點程序書</th>
                <SortHeader label="公告日期" active={sortBy === 'announcedDate'} dir={sortDir} onClick={() => toggleSort('announcedDate')} className="min-w-[112px]" />
                <th className="text-left font-medium px-3 py-2.5 min-w-[140px]">循環別</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((d) => {
                const disp = deriveDisplayStatus(d.status, d.announcedDate, today);
                const meta = DISPLAY_META[disp];
                return (
                  <tr key={d.id} className="hover:bg-slate-50 align-top">
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{d.draftingCompanyName ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{d.draftingDeptName ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                      {d.draftingSectionName ?? <span className="text-slate-300" title="此部之下無處/室，制定組織掛於部層">—</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                      {d.primaryChiefName ?? d.primaryChiefId ?? '—'}
                      {(d.secondaryChiefCount ?? 0) > 0 && (
                        <span
                          title={`次要：${(d.secondaryChiefNames ?? []).join('、')}`}
                          className="ml-1 inline-flex items-center px-1 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]"
                        >
                          +{d.secondaryChiefCount}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${meta.cls}`}>
                        <Icon name={meta.icon} className="w-3 h-3" />
                        {DISPLAY_LABEL[disp]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {d.icsopPdfBlobPath ? (
                        <button
                          onClick={() => void openBlob(d.icsopPdfBlobPath!, d.icsopPdfFileName ?? d.documentNumber)}
                          title={`下載 ${d.icsopPdfFileName ?? d.documentNumber}`}
                          className="w-8 h-8 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center"
                        >
                          <Icon name="file-down" className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => window.open(`/lifecycles/${d.lifecycleId}/tree`, '_blank', 'noopener,noreferrer')}
                        title="開啟循環樹狀圖預覽"
                        aria-label={`${d.documentName} 循環樹狀圖預覽`}
                        className="w-8 h-8 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center"
                      >
                        <Icon name="workflow" className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="mono text-xs text-slate-600">{d.documentNumber}</span>
                        {!d.nodeId && (
                          <span title="尚未指派節點" className="inline-flex items-center">
                            <Icon name="alert-triangle" className="w-3.5 h-3.5 text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => navigate(`/admin/documents/${d.id}`)} className="text-left text-slate-800 hover:text-primary-700 hover:underline">
                          {d.documentName}
                        </button>
                        {canWrite && (
                          <button
                            onClick={() => navigate(`/admin/documents/${d.id}/edit`)}
                            title="編輯"
                            aria-label={`編輯 ${d.documentNumber}`}
                            className="w-6 h-6 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
                          >
                            <Icon name="pencil" className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className="mono text-xs text-slate-700">{d.edition ?? '—'}</span></td>
                    <td className="px-3 py-3">
                      <span className="block max-w-[280px] truncate text-slate-600" title={d.contentSummary ?? ''}>
                        {d.contentSummary ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {d.links.length ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {d.links.map((l) => (
                            <button
                              key={l.linkId}
                              onClick={() => void onDownloadLink(l)}
                              title={`下載連結點程序書：${l.targetNumber ?? l.targetDocumentId}${l.targetName ? ` ${l.targetName}` : ''}`}
                              className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-slate-200 hover:bg-primary-50 text-primary-600 text-[11px]"
                            >
                              <Icon name="download" className="w-3 h-3" />
                              {l.targetNumber ?? l.targetDocumentId}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-500 mono text-xs whitespace-nowrap">
                      {d.announcedDate ? formatDateTime(d.announcedDate).slice(0, 10) : '—'}
                    </td>
                    {/* F017 AC-S1：lifecycleName 為後端已組合之顯示字串（含子分類），前端不再自行串接。 */}
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap" data-cycle-cell="">
                      {d.lifecycleName ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-14">
            <Icon name="inbox" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">{all.length === 0 ? '尚無文件' : '查無符合結果'}</p>
          </div>
        )}
        {loading && (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>共 {filtered.length} 筆 · 每頁 {PAGE_SIZE} 筆</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
                aria-label="上一頁"
                className="w-8 h-8 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                ‹
              </button>
              <span className="px-2" aria-current="page">第 {clampedPage} / {totalPages} 頁</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
                aria-label="下一頁"
                className="w-8 h-8 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label, active, dir, onClick, className,
}: {
  label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; className?: string;
}): JSX.Element {
  return (
    <th className={`text-left font-medium px-3 py-2.5 ${className ?? ''}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-slate-700" aria-label={`依${label}排序`}>
        {label}
        <Icon
          name="arrow-right"
          className={`w-3 h-3 ${active ? 'text-primary-600' : 'text-slate-300'} ${active && dir === 'asc' ? '-rotate-90' : 'rotate-90'}`}
        />
      </button>
    </th>
  );
}

function StatCard({ icon, tone, value, label, valueClass }: {
  icon: string; tone: string; value: number; label: string; valueClass: string;
}): JSX.Element {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
        <Icon name={icon} className="w-5 h-5" />
      </div>
      <div>
        <div className={`text-2xl font-bold leading-none ${valueClass}`}>{value}</div>
        <div className="text-xs text-slate-500 mt-1">{label}</div>
      </div>
    </div>
  );
}
