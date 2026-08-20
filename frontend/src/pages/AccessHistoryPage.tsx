import { Fragment, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { getAccessHistory, exportAccessHistory } from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { roleMeta } from '../domain/roles';
import {
  EXPORT_LIMIT_BADGE,
  EXPORT_ROW_LIMIT,
  countFromLimitError,
  isExportLimitError,
} from '../domain/export-feedback';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import type {
  AccessHistoryFilters,
  AccessHistoryPage as AccessHistoryPageResult,
  AccessHistoryRow,
  AuditKind,
} from '../api/types';

/**
 * 文件調閱歷程查詢（F024，US-061）。版面/欄位/文案權威來源：prototypes/17-access-history.html。
 * 接真實端點 GET /admin/access-history（＋/export）。RBAC：SysAdmin/ICSOPAdmin 全公司唯讀；
 * 主管/部門窗口/一般使用者無此功能（自我守門封鎖，比照 OrgSyncPage）。
 * 篩選/排序/分頁/近 30 天預設由後端 queryHistory 完成，前端僅呈現與傳遞條件。
 */

/**
 * 「不施加類型限制」之哨兵（F024 `AC-N69`）。刻意**不用空字串**：`AC-N69` 之類型值清單
 * 把預設項一併列為 `全部`，以它為 `<option value>` 才能讓「五個 option 之值」成為可枚舉之契約。
 */
const KIND_ALL = '全部';

/** targetType → 前端類型顯示值。 */
function rowKind(targetType: string): AuditKind {
  if (targetType === 'DOCUMENT' || targetType === 'USAGE_FORM') return '文件';
  if (targetType === 'LIFECYCLE') return '循環';
  // 🔴 F024 `AC-N53`：OJT 上傳事件之專屬 targetType（`OQ-D9-29` 之核心——
  //    它必須**不落入「文件」類**，否則「文件調閱歷程」會被非調閱事件污染且無從排除。
  if (targetType === 'DOCUMENT_ATTACHMENT') return '上傳';
  return '變更';
}

/** 操作類型顯示標籤（比照 prototype ACT_STYLE）。 */
const ACT_LABEL: Record<string, string> = {
  VIEW: '檢視',
  DOWNLOAD: '下載',
  PRINT: '列印',
  LIFECYCLE_VIEW: '循環樹狀圖檢視',
  LIFECYCLE_DOWNLOAD: '循環樹狀圖下載',
  LIFECYCLE_PRINT: '循環樹狀圖列印',
  CHANGE_LOG_VIEW: '文件變更歷程檢視',
  LIFECYCLE_CHANGELOG_VIEW: '循環變更歷程檢視',
  LIFECYCLE_CHANGELOG_DOWNLOAD: '新舊樹狀圖下載',
  // 🔴 F024 `AC-N53`：中文標籤逐字為「附件上傳」；與 backend/src/audit/access-history-labels.ts
  //    之 ACTION_TYPE_LABEL **兩份逐字相同**（前後端無共用 package 之既定處置）。
  ATTACHMENT_UPLOAD: '附件上傳',
};

const KIND_TONE: Record<AuditKind, string> = {
  文件: 'bg-slate-50 text-slate-700 border-slate-100',
  循環: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  變更: 'bg-amber-50 text-amber-700 border-amber-100',
  // prototypes/17-access-history.html:261 之 KIND_STYLE（色票屬設計裁量、不入 AC）。
  上傳: 'bg-violet-50 text-violet-700 border-violet-100',
};

/**
 * 操作類型 pill 色調（逐字對映 prototype 17 ACT_STYLE）：
 * VIEW=slate、DOWNLOAD=blue、PRINT=violet、LIFECYCLE 系列=emerald、變更歷程系列（CHANGELOG）=amber。
 * 未知 actionType 回退 slate（不拋錯）。完整 class 字面（Tailwind JIT 掃描需要）。
 */
const ACT_TONE_SLATE = 'bg-slate-50 text-slate-700 border-slate-100';
const ACT_TONE: Record<string, string> = {
  VIEW: ACT_TONE_SLATE,
  DOWNLOAD: 'bg-blue-50 text-blue-700 border-blue-100',
  PRINT: 'bg-violet-50 text-violet-700 border-violet-100',
  LIFECYCLE_VIEW: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  LIFECYCLE_DOWNLOAD: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  LIFECYCLE_PRINT: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CHANGE_LOG_VIEW: 'bg-amber-50 text-amber-700 border-amber-100',
  LIFECYCLE_CHANGELOG_VIEW: 'bg-amber-50 text-amber-700 border-amber-100',
  LIFECYCLE_CHANGELOG_DOWNLOAD: 'bg-amber-50 text-amber-700 border-amber-100',
  // prototypes/17-access-history.html:259 之 ACT_STYLE（violet；色票屬設計裁量、不入 AC）。
  ATTACHMENT_UPLOAD: 'bg-violet-50 text-violet-700 border-violet-100',
};
function actTone(actionType: string): string {
  return ACT_TONE[actionType] ?? ACT_TONE_SLATE;
}

/** 對象欄主識別：文件編號 → 循環名稱 → 使用表單 id。 */
function targetPrimary(r: AccessHistoryRow): string {
  return r.documentNumber || r.lifecycleName || r.formId || '—';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // 以 sv-SE 取得 YYYY-MM-DD HH:mm:ss（伺服器時間 UTC+8 於後端已定，前端原樣呈現）。
  return d.toLocaleString('sv-SE');
}

interface Notice {
  tone: 'success' | 'danger' | 'info';
  text: string;
  /** 錯誤碼標記（與訊息**同一容器**內可見，`error-handling.md#export`／`AC-F9` ②）。 */
  code?: string;
}
const TONE_BADGE: Record<string, string> = {
  success: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  danger: 'text-red-700 bg-red-50 border-red-100',
  info: 'text-blue-700 bg-blue-50 border-blue-100',
};

/** 匯出成功之逐字回饋（`AC-F9` ①）。 */
const EXPORT_SUCCESS_TEXT = '已匯出文件調閱歷程（CSV，UTF-8 BOM）';

/**
 * 匯出失敗之回饋（`AC-F9` ②）。
 *
 * ⚠ 量詞取「筆數」、限定詞取「查詢條件」——與 F037／F038（查詢條件＋事件）、F039（篩選條件＋筆數）
 * **皆刻意不同**，不得互相對齊（`AC-F9` 之選字理由）。
 * `{N}` 為**實際筆數**，由 `countFromLimitError()` 自後端訊息解析（後端已依 §10.18 `A16-3` 內插）。
 */
function exportFailureNotice(e: unknown): Notice {
  if (isExportLimitError(e)) {
    return {
      tone: 'danger',
      text: `符合查詢條件之筆數為 ${countFromLimitError(e)} 筆，超過匯出上限 ${EXPORT_ROW_LIMIT} 筆，請縮小查詢條件`,
      code: EXPORT_LIMIT_BADGE,
    };
  }
  return {
    tone: 'danger',
    text: e instanceof ApiError ? `匯出失敗：${e.code}` : '匯出失敗',
  };
}

/**
 * 超限之**事前**提示句（`AC-F19` ①，逐字）。
 *
 * 🔴 於 JS 內組字而非在 JSX 內跨行書寫：JSX 會把跨來源行之文字以單一空格接合，
 * 逐字 `textContent` 斷言會因此多出空白而紅。
 */
function exportLimitHintText(total: number): string {
  return `目前符合查詢條件之筆數為 ${total} 筆，已超過匯出上限 ${EXPORT_ROW_LIMIT} 筆，直接匯出將被拒絕，請先縮小查詢條件後再匯出。`;
}

/** 事前提示之容器 id（`AC-F19` ②；亦為匯出鈕 `aria-describedby` 之指向，`AC-F19` ③）。 */
const EXPORT_LIMIT_HINT_ID = 'export-limit-hint';

export function AccessHistoryPage(): JSX.Element {
  const { user } = useAuth();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.DOCUMENT_ACCESS_HISTORY, 'read');

  const [kind, setKind] = useState<AuditKind | typeof KIND_ALL>(KIND_ALL);
  const [person, setPerson] = useState('');
  const [target, setTarget] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [result, setResult] = useState<AccessHistoryPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (filters: AccessHistoryFilters) => {
    setLoading(true);
    setExpandedId(null);
    try {
      const res = await getAccessHistory(filters);
      setResult(res);
    } catch (e) {
      setNotice({
        tone: 'danger',
        text: e instanceof ApiError ? e.code : '載入調閱歷程失敗',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // 目前輸入狀態組成 filters（可帶 override，供類型切換即時查詢）。
  const buildFilters = useCallback(
    (o?: Partial<Record<'kind' | 'person' | 'target' | 'from' | 'to', string>>): AccessHistoryFilters => {
      const k = (o?.kind ?? kind) as AuditKind | typeof KIND_ALL;
      const p = o?.person ?? person;
      const t = o?.target ?? target;
      const f = o?.from ?? from;
      const tt = o?.to ?? to;
      const filters: AccessHistoryFilters = {};
      if (k && k !== KIND_ALL) filters.kind = k;
      if (p.trim()) filters.person = p.trim();
      if (t.trim()) filters.target = t.trim();
      if (f) filters.from = f;
      if (tt) filters.to = tt;
      return filters;
    },
    [kind, person, target, from, to],
  );

  useEffect(() => {
    if (canRead) void load({});
  }, [canRead, load]);

  const onKindChange = (v: string) => {
    const next = v as AuditKind | typeof KIND_ALL;
    setKind(next);
    void load(buildFilters({ kind: next }));
  };

  const runQuery = () => void load(buildFilters());

  const clearQuery = () => {
    // 🔴 F024 `AC-N69`：類型之「不施加限制」哨兵為 `KIND_ALL`（`全部`），**不再是空字串**。
    //    留著 `''` 會使 `<select>` 落到「無任何 option 相符」之狀態（畫面顯示空白選項），
    //    且 `tsc --noEmit` 紅燈（`''` 不在 `AuditKind | typeof KIND_ALL` 之值域內）。
    setKind(KIND_ALL);
    setPerson('');
    setTarget('');
    setFrom('');
    setTo('');
    void load({});
  };

  // 換頁：以目前輸入條件＋指定頁碼重查（page=1 省略參數，比照後端預設；頁碼權威來源為 result.page）。
  const goToPage = useCallback(
    (p: number) => {
      if (p < 1) return;
      const f = buildFilters();
      void load(p > 1 ? { ...f, page: p } : f);
    },
    [buildFilters, load],
  );

  /**
   * 匯出（`AC-F1`：成功回饋與檔案產生**嚴格同真值**）。
   * `exportAccessHistory()` 回 `Promise<void>` 且**內部即為下載鏈**（`downloadViaBlob`）——
   * 非 2xx 或 fetch reject 皆會 throw ⇒ 成功回饋只可能在下載副作用已發生後出現。
   */
  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportAccessHistory(buildFilters());
      setNotice({ tone: 'success', text: EXPORT_SUCCESS_TEXT });
    } catch (e) {
      setNotice(exportFailureNotice(e));
    } finally {
      setExporting(false);
    }
  }, [buildFilters]);

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無文件調閱歷程查詢權限</h1>
        <p className="text-sm text-slate-500 mt-1">
          僅系統管理員／ICSOP 管理員可存取本功能。
        </p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const rows = result?.items ?? [];
  // `AC-F19` off-by-one：`> 10000` 才提示；**恰 10000 不提示**（後端判準為 `count > EXPORT_ROW_LIMIT`，
  // 恰等於上限是合法且會成功匯出的）。`result` 為 null（載入中／載入失敗）→ 不提示。
  const overExportLimit = result !== null && result.total > EXPORT_ROW_LIMIT;
  const curPage = result?.page ?? 1;
  const pageSize = result?.pageSize ?? 50;
  const startIdx = (curPage - 1) * pageSize;

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={[{ label: '稽核與調閱歷程' }, { label: '查詢' }]} title="文件調閱歷程查詢">
        {/*
          🔴 `AC-F19`：超限時**維持可按**、不得 disabled——(a) 沒有說明的 disabled 鈕與本批次要修的
          缺陷同型（把「假成功」換成「假故障」）；(b) `total` 可能過時而誤擋一次合法匯出。
          提示只負責告知，放行與拒絕一律由後端決定。`disabled` 僅承載 in-flight（`AC-F16`）。
        */}
        <button
          onClick={() => void onExport()}
          disabled={exporting}
          aria-describedby={overExportLimit ? EXPORT_LIMIT_HINT_ID : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Icon name="download" className="w-4 h-4" />
          匯出
        </button>
      </PageHeader>

      {/* 查詢範圍提示（全公司） */}
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm border bg-primary-50 border-primary-100 text-primary-700">
        <Icon name="globe" className="w-4 h-4 mt-0.5" />
        <span>
          查詢範圍：<b>全公司</b>（系統管理員 / ICSOP 管理員）。
        </span>
      </div>

      {/*
        回饋容器之角色依 tone 決定（`AC-F9` ②：錯誤須為 `role="alert"`）。
        ⚠ 既有「載入調閱歷程失敗」訊息因此亦由 `status` 變為 `alert`——此為正確方向之副作用
        （錯誤本就該用 alert），已於 `AC-F9` ② 之註記明列、不視為越界。
      */}
      {notice && (
        <div
          role={notice.tone === 'danger' ? 'alert' : 'status'}
          className={`text-sm border rounded-md px-3 py-2 ${TONE_BADGE[notice.tone]}`}
        >
          <p>{notice.text}</p>
          {notice.code && <p className="mono text-[10px] text-slate-400 mt-0.5">{notice.code}</p>}
        </div>
      )}

      {/* 查詢列 */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="qKind" className="block text-xs font-medium text-slate-500 mb-1">
              類型
            </label>
            <select
              id="qKind"
              value={kind}
              onChange={(e) => onKindChange(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
            >
              {/*
                🔴 F024 `AC-N69`（`OQ-D9-35` 定案讀法）：**類型值恰為四種**（文件／循環／變更／上傳），
                控制項連同既有預設項共 **5 個 option**；`上傳` 置於既有三者**之後**，
                既有三者與預設項之字面與相對順序逐字不變。
                📌 預設項之 `value` 為 `全部`（非空字串）＝「不施加類型限制」之哨兵，
                   於 `buildFilters()` 中被略去、不送入 API；其**可見文字仍為「全部類型」**。
              */}
              <option value={KIND_ALL}>全部類型</option>
              <option value="文件">文件</option>
              <option value="循環">循環</option>
              <option value="變更">變更</option>
              <option value="上傳">上傳</option>
            </select>
          </div>
          <div>
            <label htmlFor="qPerson" className="block text-xs font-medium text-slate-500 mb-1">
              人員（姓名／員工編號）
            </label>
            <div className="relative">
              <Icon
                name="user-search"
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <input
                id="qPerson"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-md border border-slate-300 text-sm"
                placeholder="王小明 / 22345"
              />
            </div>
          </div>
          <div>
            <label htmlFor="qDoc" className="block text-xs font-medium text-slate-500 mb-1">
              文件（編號／名稱）
            </label>
            <div className="relative">
              <Icon
                name="file-search"
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <input
                id="qDoc"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-md border border-slate-300 text-sm"
                placeholder="ICSOP-SRC-101-1-01 / 進件"
              />
            </div>
          </div>
          <div>
            <label htmlFor="qFrom" className="block text-xs font-medium text-slate-500 mb-1">
              起始日期
            </label>
            <input
              id="qFrom"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label htmlFor="qTo" className="block text-xs font-medium text-slate-500 mb-1">
              結束日期
            </label>
            <input
              id="qTo"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={runQuery}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="search" className="w-4 h-4" />
            查詢
          </button>
          <button
            onClick={clearQuery}
            className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
          >
            清除條件
          </button>
          {result?.appliedDefaultRange && (
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-amber-700">
              <Icon name="info" className="w-3.5 h-3.5" />
              未輸入條件，已套用近 30 天預設範圍
            </span>
          )}
          <span className="ml-auto text-sm text-slate-500">
            {result ? `共 ${result.total} 筆` : ''}
          </span>
        </div>
        {/*
          `AC-F19` 事前提示：查詢卡片內、緊接動作列（`共 {total} 筆` 所在列）之下**自成一列**。
          🔴 不得塞進動作列本身（`flex items-center gap-2 mt-3 flex-wrap`）——該句約 50 個全形字，
          會在 lg 以下把 `共 {total} 筆` 擠到第二行並使整列於提示出現／消失時重排（與 F017
          `AC-E1`～`AC-E8` 剛修過的「多連結列撐破版面」同型）。自成一列後動作列諸控制項零位移。
          視覺 token 逐字沿用同頁既有先例（30 天行內提示：`text-xs text-amber-700` ＋ `<Icon name="info">`），
          因自成一列僅作兩處必要調整：容器 `items-start`、圖示 `mt-0.5 shrink-0`。
          刻意不加 `role="status"`／`aria-live`：已由匯出鈕之 `aria-describedby` 建立關聯，
          再加 live region 會造成重複播報。
        */}
        {overExportLimit && result && (
          <div
            id={EXPORT_LIMIT_HINT_ID}
            className="mt-2 flex items-start gap-1.5 text-xs text-amber-700"
          >
            <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{exportLimitHintText(result.total)}</span>
          </div>
        )}
      </section>

      {/* 結果 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1220px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">操作人員</th>
                <th className="text-left font-medium px-4 py-2.5">員工編號</th>
                <th className="text-left font-medium px-4 py-2.5">公司</th>
                <th className="text-left font-medium px-4 py-2.5">部門</th>
                <th className="text-left font-medium px-4 py-2.5">處/室</th>
                <th className="text-left font-medium px-4 py-2.5">角色</th>
                <th className="text-left font-medium px-4 py-2.5">類型</th>
                <th className="text-left font-medium px-4 py-2.5">對象（文件／循環）</th>
                <th className="text-left font-medium px-4 py-2.5">操作類型</th>
                <th className="text-left font-medium px-4 py-2.5">操作時間（新→舊）</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const k = rowKind(r.targetType);
                const open = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedId(open ? null : r.id)}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-2.5 mono text-slate-500">{r.employeeNo}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.company}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.department}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {r.section || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {roleMeta(r.roleCode ?? undefined)?.label ?? r.roleCode ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${KIND_TONE[k]}`}
                        >
                          {k}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 mono text-slate-600">{targetPrimary(r)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${actTone(r.actionType)}`}
                        >
                          {r.actionType} · {ACT_LABEL[r.actionType] ?? r.actionType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 mono text-slate-500">
                        {formatDateTime(r.occurredAt)}
                      </td>
                      <td className="px-2 py-2.5 text-slate-400">
                        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="w-4 h-4" />
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                              <Icon name="file-badge" className="w-4 h-4 text-primary-600" />
                              調閱明細
                            </div>
                            <dl className="grid sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                              <div>
                                <dt className="text-slate-400 text-xs">操作人員</dt>
                                <dd className="text-slate-700">
                                  {r.name}（{r.employeeNo}）
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">公司</dt>
                                <dd className="text-slate-700">{r.company}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">部門</dt>
                                <dd className="text-slate-700">{r.department}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">處/室</dt>
                                <dd className="text-slate-700">
                                  {r.section || (
                                    <span className="text-slate-400">（無，浮水印自動收合分隔符）</span>
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">角色</dt>
                                <dd className="text-slate-700">
                                  {roleMeta(r.roleCode ?? undefined)?.label ?? r.roleCode ?? '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">操作類型</dt>
                                <dd className="text-slate-700">
                                  {r.actionType} · {ACT_LABEL[r.actionType] ?? r.actionType}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">類型</dt>
                                <dd className="text-slate-700">{k}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-400 text-xs">對象（文件／循環）</dt>
                                <dd className="mono text-slate-700">{targetPrimary(r)}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-slate-400 text-xs">對象名稱／說明</dt>
                                <dd className="text-slate-700">{r.targetName || '—'}</dd>
                              </div>
                              <div className="sm:col-span-3">
                                <dt className="text-slate-400 text-xs">
                                  操作時間（伺服器時間 UTC+8）
                                </dt>
                                <dd className="mono text-slate-700">
                                  {formatDateTime(r.occurredAt)}
                                </dd>
                              </div>
                            </dl>
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1.5">
                                <Icon name="stamp" className="w-4 h-4 text-primary-600" />
                                當次浮水印快照（與稽核內容完全一致）
                              </div>
                              {/*
                                `AC-N80`：本欄恆帶 `data-wm-snapshot`。留空時**不得**渲染為空字串或 `—`——
                                空字串會被讀成「資料遺失」，明訂說明句才能讓「本來就沒有」與
                                「應該有卻沒寫進去」在畫面上可區分。
                              */}
                              {r.watermarkSnapshot ? (
                                <div
                                  data-wm-snapshot=""
                                  className="mono text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2 break-all"
                                >
                                  {r.watermarkSnapshot}
                                </div>
                              ) : (
                                <div
                                  data-wm-snapshot=""
                                  className="mono text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded px-3 py-2 break-all"
                                >
                                  （此動作類型無浮水印，該欄留空）
                                </div>
                              )}
                            </div>
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

        {loading ? (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-14">
            <Icon name="inbox" className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500">查無符合結果</p>
            <p className="text-sm text-slate-400 mt-1">請調整人員／文件／時間條件</p>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>
              顯示 {startIdx + 1}–{startIdx + rows.length} 筆 · 每頁 {pageSize} 筆
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="上一頁"
                onClick={() => goToPage(curPage - 1)}
                disabled={curPage <= 1}
                className="w-8 h-8 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              <span className="w-8 h-8 rounded bg-primary-600 text-white inline-flex items-center justify-center">
                {curPage}
              </span>
              <button
                type="button"
                aria-label="下一頁"
                onClick={() => goToPage(curPage + 1)}
                disabled={!result?.hasNext}
                className="w-8 h-8 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400 flex items-start gap-1.5">
        <Icon name="shield-check" className="w-3.5 h-3.5 mt-0.5" />
        稽核紀錄為 append-only、不可竄改（AUDIT_IMMUTABLE）；每筆之身分/時間快照與該次浮水印完全一致（F023）。
      </p>
    </div>
  );
}
