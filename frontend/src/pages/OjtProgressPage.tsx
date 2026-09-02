import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiError } from '../api/client';
import {
  addOjtSession,
  assignOjtPendingSession,
  deleteOjtSession,
  downloadOjtSession,
  getOjtProgressPending,
  getOjtProgressRowSessions,
  getOjtProgressRows,
  getOjtProgressSummary,
} from '../api/endpoints';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { ojtStatusView } from '../domain/ojt-status-view';
import { Icon } from '../components/Icon';
import { BelowTopbar, PageHeader, TopbarBanner } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import type {
  OjtDocScope,
  OjtPendingItem,
  OjtProgressRow,
  OjtProgressSummary,
  OjtSessionView,
} from '../api/types';
import {
  ADD_SESSION_TEXT,
  ASSIGN_ACTION_TEXT,
  BADGE_COMPLETED_ICON,
  BADGE_COMPLETED_TEXT,
  BADGE_PENDING_ICON,
  BADGE_PENDING_TEXT,
  BLOCKED_MSG,
  BLOCKED_TITLE,
  DEL_CONFIRM_OK_TEXT,
  DEL_CONFIRM_TITLE,
  DOC_COVERAGE_BASIS_NOTE,
  DOC_COVERAGE_BREAKDOWN_LABEL,
  DOC_COVERAGE_EMPTY_BY_SCOPE,
  DOC_COVERAGE_EMPTY_HINT,
  DOC_COVERAGE_INCOMPLETE_LABEL,
  DOC_COVERAGE_MORE_ARIA,
  DOC_COVERAGE_MORE_TEXT,
  DOC_COVERAGE_NA_TEXT,
  DOC_COVERAGE_REGION_LABEL,
  DOC_COVERAGE_SCOPE_LABEL,
  DOC_COVERAGE_SCOPE_OPTIONS,
  DOC_COVERAGE_TRACKED_LABEL,
  DOC_GROUP_BASIS_NOTE_TEXT,
  DOC_SEARCH_ARIA_TEXT,
  DOC_SEARCH_PLACEHOLDER_TEXT,
  DOC_UNASSIGNED_TEXT,
  DOC_UNASSIGNED_VISUAL,
  EMPTY_ALL_HINT,
  EMPTY_ALL_TEXT,
  EMPTY_RECENT_TEXT,
  EMPTY_ROWS_TEXT,
  EMPTY_SESSIONS_TEXT,
  ERR_DATE_FUTURE,
  ERR_DATE_REQUIRED,
  ERR_FILE_REQUIRED,
  FIELD_SIGNIN_FILE_LABEL,
  FIELD_TRAINING_DATE_LABEL,
  GROUP_MODE_ARIA_TEXT,
  GROUP_MODE_DOC_TEXT,
  GROUP_MODE_ORG_TEXT,
  NO_STATISTICS_TEXT,
  ORG_INACTIVE_TEXT,
  ORPHAN_NOTE_TEXT,
  PENDING_NOTE_TEXT,
  PENDING_SCOPE_TEXT,
  PENDING_TITLE_TEXT,
  PII_NOTE_SEGMENTS,
  RO_NOTICE_SYSADMIN,
  SEC_COVERAGE_TITLE,
  SEC_RECENT_TITLE,
  SEC_ROLLUP_TITLE,
  TAB_DASHBOARD_TEXT,
  TAB_SESSIONS_TEXT,
  addSessionAria,
  DUE_DATE_LABEL,
  DUE_DATE_TITLE,
  DUE_DATE_UNKNOWN_TEXT,
  DUE_DATE_UNKNOWN_TITLE,
  EDITION_CURRENT_BADGE_TEXT,
  EDITION_OUTDATED_BADGE_TEXT,
  EMPTY_CURRENT_EDITION_TEXT,
  RETRAIN_NOTE_TEXT,
  canAddSession,
  canManageSessions,
  canViewDashboard,
  coveragePercent,
  dueDateText,
  editionGroupCountText,
  editionGroupToggleAria,
  editionText,
  groupSessionsByEdition,
  rowEditionText,
  delConfirmBody,
  deleteSessionAria,
  docCoverageBarClass,
  docCoverageBreakdown,
  docCoverageRowView,
  docCoverageTruncationText,
  docGroupPercentText,
  docGroupRatioText,
  docGroupToggleAria,
  docGroupsOf,
  downloadSessionAria,
  exclusionNote,
  groupRowsByOrg,
  matchesDocKeyword,
  recentTruncationText,
  rollupInvariantText,
  rowKeyOf,
  sliceRecentSessions,
  todayIsoDate,
  type OjtDocGroup,
  type OjtGroupMode,
} from './ojt-progress-view';

/**
 * F042 OJT 進度管理（E11 / US-103＋US-104）——後台獨立管理頁。
 *
 * 版面／文案／DOM 掛鉤之權威來源：`prototypes/25-ojt-progress.html`
 * （TAB1 儀表板三區、TAB2 以使用單位分組之進度列、待歸位區、三個 modal）。
 * 逐字文案與純規則集中於 `ojt-progress-view.ts`，本檔只負責渲染與資料流。
 *
 * 端點（皆 `/admin/ojt-progress/`）：GET summary｜GET rows｜GET rows/:d/:o/sessions｜
 * POST 同路徑（multipart 單檔）｜GET sessions/:id/download｜DELETE sessions/:id｜
 * GET pending｜POST pending/:id/assign。
 *
 * RBAC（`AC-05`／`AC-06`／`AC-07`／`AC-19`）：
 *  · ICSOPAdmin／Supervisor／DeptContact 可新增場次（`受限CRUD` 於功能層等同可寫）
 *  · SysAdmin 唯讀——寫入型控制項**不進 DOM**（非 CSS 隱藏）
 *  · User 全頁 403（不採 F041 之 404 隱藏存在性例外，該例外明文不推廣）
 *  · 🔴 刪除與歸位僅 ICSOPAdmin——矩陣之 `受限CRUD` 格值**擋不住它**，端點層另有一道檢查；
 *    前端據同一條件決定控制項是否進 DOM。
 *  · 🔒 `AC-08`：可否新增**只看角色**，不看操作者 orgCode 與目標列之關係，
 *    本檔**不得**出現任何子樹範圍判定。
 */
type TabKey = 'dashboard' | 'sessions';

interface AddTarget {
  documentId: string;
  orgCode: string;
  documentNumber: string;
  documentName: string;
  orgName: string;
}

interface ConfirmState {
  sessionId: string;
  body: string;
}

interface AssignState {
  item: OjtPendingItem;
  orgCode: string;
  trainingDate: string;
  error: string | null;
}

export function OjtProgressPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'write');
  const mayAdd = canAddSession(role);
  const mayManage = canManageSessions(role);

  /**
   * 🔴 2026-09-02 人類裁決：**儀表板分頁對主管／部門窗口隱藏**。
   * 🔒 判定集中於 `canViewDashboard()`（純函式），本檔不散落角色字面。
   */
  const mayViewDashboard = canViewDashboard(role);
  /** 🔴 看不到儀表板者之初始分頁即 `sessions`——否則他們會落在一個不存在的分頁上而看到空白。 */
  const [tab, setTab] = useState<TabKey>(mayViewDashboard ? 'dashboard' : 'sessions');
  const [summary, setSummary] = useState<OjtProgressSummary | null>(null);
  /**
   * `AC-28`⑯ 區一逐筆表之顯示範圍（預設「僅未全部完成」）。
   * 🔴 **切換即重新請求**（見 `loadSummary` 之相依）——明文不得改為客端切換：客端切換必須先
   * 取回全部 600 列，那正是本次節流要消滅的東西。
   */
  const [docScope, setDocScope] = useState<OjtDocScope>('incomplete');
  const [rows, setRows] = useState<OjtProgressRow[]>([]);
  const [pending, setPending] = useState<OjtPendingItem[]>([]);
  const [orgQuery, setOrgQuery] = useState('');
  const [status, setStatus] = useState<'' | 'completed' | 'pending'>('');
  /**
   * `AC-30` 分組模式（🔒 預設 `org` ＝現況一格不改）與 `AC-33`② 之文件搜尋關鍵字。
   * 🔴 兩者**刻意不進 `loadRows` 之相依**——`GET /admin/ojt-progress/rows` 已回傳完整、未分頁
   * 之進度列（見 §架構設計 一），分組與文件搜尋純為前端呈現決策；為它們再打一次 API，等於把
   * 一個呈現決策做成一次網路往返（`AC-30` 明文禁止，斷言形狀＝切換前後呼叫次數相同）。
   */
  const [groupMode, setGroupMode] = useState<OjtGroupMode>('org');
  const [docQuery, setDocQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  /** `AC-33`①：**已展開**之文件群組（🔒 預設全部折疊 ⇒ 初值為空陣列，非「全部展開再收合」）。 */
  const [expandedDocs, setExpandedDocs] = useState<string[]>([]);
  const [sessionsByRow, setSessionsByRow] = useState<Record<string, OjtSessionView[]>>({});

  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [addDate, setAddDate] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [assign, setAssign] = useState<AssignState | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getOjtProgressSummary(docScope));
    } catch {
      setSummary(null);
    }
  }, [docScope]);

  const loadRows = useCallback(async () => {
    try {
      const res = await getOjtProgressRows({ orgQuery: orgQuery || undefined, completionStatus: status });
      setRows(res.items);
    } catch {
      setRows([]);
    }
  }, [orgQuery, status]);

  const loadPending = useCallback(async () => {
    try {
      const res = await getOjtProgressPending();
      setPending(res.items);
    } catch {
      setPending([]);
    }
  }, []);

  // 🔴 summary 與 pending 分開兩個 effect：切換顯示範圍只該重抓 summary，不該連帶重抓待歸位清單。
  // 🔴 看不到儀表板者**完全不發** `GET summary`：那是一次純浪費的往返（591 份文件之全池
  // 聚合），且畫面上沒有任何載體會用到它。
  useEffect(() => {
    if (!canRead || !mayViewDashboard) return;
    void loadSummary();
  }, [canRead, mayViewDashboard, loadSummary]);

  useEffect(() => {
    if (!canRead) return;
    void loadPending();
  }, [canRead, loadPending]);

  useEffect(() => {
    if (!canRead) return;
    void loadRows();
  }, [canRead, loadRows]);

  const reloadRowSessions = useCallback(async (documentId: string, orgCode: string) => {
    const key = rowKeyOf(documentId, orgCode);
    const res = await getOjtProgressRowSessions(documentId, orgCode);
    setSessionsByRow((prev) => ({ ...prev, [key]: res.sessions }));
  }, []);

  const onToggleRow = useCallback(
    async (row: OjtProgressRow) => {
      const key = rowKeyOf(row.documentId, row.orgCode);
      if (expanded.includes(key)) {
        setExpanded((prev) => prev.filter((k) => k !== key));
        return;
      }
      setExpanded((prev) => [...prev, key]);
      await reloadRowSessions(row.documentId, row.orgCode).catch(() => {
        setSessionsByRow((prev) => ({ ...prev, [key]: [] }));
      });
    },
    [expanded, reloadRowSessions],
  );

  /**
   * `AC-33`① 文件群組之折疊／展開。
   * 🔴 **展開才渲染組內列**（渲染端以 `expandedDocs.includes()` 短路），未展開時該群組之
   * `[data-progress-row]` **完全不進 DOM**——非 CSS 隱藏、非 `hidden` 屬性。正式站 591 份文件
   * 若都指定了使用部門，群組數逼近文件數；CSS 隱藏省不掉任何一個節點的建立成本。
   */
  const onToggleDocGroup = useCallback((documentId: string) => {
    setExpandedDocs((prev) =>
      prev.includes(documentId) ? prev.filter((id) => id !== documentId) : [...prev, documentId],
    );
  }, []);

  /**
   * `AC-30` 分組模式切換。
   * 🔴 切回 `org` 時**清空文件關鍵字**（`AC-33`②）——理由與 `AC-14`⑦ 之既有處置同源：一個
   * 看不見的條件仍在過濾列，就是畫面說謊；不清空會讓使用者切回單位模式後看到一個比實際小的
   * 集合，而畫面上找不到任何解釋。
   */
  const onChangeGroupMode = useCallback((mode: OjtGroupMode) => {
    setGroupMode(mode);
    if (mode === 'org') setDocQuery('');
  }, []);

  const onDownload = useCallback(
    async (s: OjtSessionView) => {
      try {
        await downloadOjtSession(s.id, s.fileName);
      } catch (e) {
        toast.error(e instanceof ApiError ? `下載失敗：${e.code}` : '下載失敗');
      }
    },
    [toast],
  );

  /**
   * `AC-19` 刪除之二次確認。三種措辭由 `delConfirmBody()` 決定（一般列尚有其他場次／一般列
   * 最後一筆／孤兒列最後一筆），**不得合流**——孤兒列刪完即整列消失且無法重新登記。
   */
  const askDelete = useCallback(
    (row: OjtProgressRow, s: OjtSessionView) => {
      const key = rowKeyOf(row.documentId, row.orgCode);
      const siblings = sessionsByRow[key]?.length ?? 0;
      setConfirm({ sessionId: s.id, body: delConfirmBody(siblings <= 1, row.orphaned) });
    },
    [sessionsByRow],
  );

  const onConfirmDelete = useCallback(async () => {
    if (!confirm) return;
    try {
      await deleteOjtSession(confirm.sessionId);
      setConfirm(null);
      await Promise.all([loadRows(), loadSummary()]);
      toast.success('已刪除該筆教育訓練場次；此操作已寫入稽核。');
    } catch (e) {
      setConfirm(null);
      toast.error(e instanceof ApiError ? `刪除失敗：${e.code}` : '刪除失敗');
    }
  }, [confirm, loadRows, loadSummary, toast]);

  const openAdd = useCallback((row: OjtProgressRow) => {
    setAddTarget({
      documentId: row.documentId,
      orgCode: row.orgCode,
      documentNumber: row.documentNumber,
      documentName: row.documentName,
      orgName: row.orgName,
    });
    setAddDate('');
    setAddFile(null);
    setAddError(null);
  }, []);

  /**
   * `AC-09` 之驗證順序：日期必填 → 不可未來日 → 檔案必選。
   * 🔴 驗證由送出時執行、**不倚賴 `<input max>` 屬性**——後者在鍵盤輸入下不可達，API 直呼
   * 更是完全繞得過去（前端非唯一防線，後端亦有同一組檢查）。
   */
  const onSubmitAdd = useCallback(async () => {
    if (!addTarget) return;
    if (!addDate) {
      setAddError(ERR_DATE_REQUIRED);
      return;
    }
    if (addDate > todayIsoDate()) {
      setAddError(ERR_DATE_FUTURE);
      return;
    }
    if (!addFile) {
      setAddError(ERR_FILE_REQUIRED);
      return;
    }
    try {
      await addOjtSession(addTarget.documentId, addTarget.orgCode, {
        trainingDate: addDate,
        file: addFile,
      });
      const target = addTarget;
      setAddTarget(null);
      setAddError(null);
      await Promise.all([loadRows(), loadSummary()]);
      if (expanded.includes(rowKeyOf(target.documentId, target.orgCode))) {
        await reloadRowSessions(target.documentId, target.orgCode).catch(() => undefined);
      }
      toast.success(
        `已為「${target.orgName}」新增 1 筆教育訓練場次（${addDate}）；既有場次未被取代。已寫入稽核。`,
      );
    } catch (e) {
      setAddError(e instanceof ApiError ? `登記失敗：${e.code}` : '登記失敗');
    }
  }, [addDate, addFile, addTarget, expanded, loadRows, loadSummary, reloadRowSessions, toast]);

  const onSubmitAssign = useCallback(async () => {
    if (!assign) return;
    if (!assign.orgCode) {
      setAssign({ ...assign, error: '請選擇使用單位。' });
      return;
    }
    if (!assign.trainingDate) {
      setAssign({ ...assign, error: ERR_DATE_REQUIRED });
      return;
    }
    try {
      await assignOjtPendingSession(assign.item.id, {
        orgCode: assign.orgCode,
        trainingDate: assign.trainingDate,
      });
      setAssign(null);
      await Promise.all([loadRows(), loadSummary(), loadPending()]);
      toast.success('已歸位：此筆舊資料已成為該「文件 × 使用單位」之正式場次。');
    } catch (e) {
      setAssign({ ...assign, error: e instanceof ApiError ? `歸位失敗：${e.code}` : '歸位失敗' });
    }
  }, [assign, loadPending, loadRows, loadSummary, toast]);

  /**
   * 🔴 `AC-32` 之「**當下呈現之列**」——兩種模式之群組與空狀態的**單一推導點**。
   *
   * · **完成狀態**：伺服器已依 `completionStatus` 過濾，此處**再套一次同一個述詞**。`completed`
   *   是列上的一個布林欄，客端重套是精確且冪等的（伺服器正常時為 no-op），但它保證群組標題之
   *   `已完成 X / 共 Y 單位` 與畫面上真正列出的那些列**永遠是同一個集合**——兩個數字各自從
   *   不同集合算出來，正是本頁最容易長出的那種「畫面說謊」。
   * · 🔒 **單位關鍵字刻意不在此重套**：其比對語意（名稱／代碼之正規化）住在後端，客端另打一份
   *   只會在兩份語意漂移時，把伺服器刻意命中的列悄悄濾掉。
   * · **文件搜尋**：`AC-33`② 之純前端條件，🔒 只在 `document` 模式生效——`org` 模式下關鍵字
   *   已於切換時清空，此處再加一道結構性保險。
   */
  const displayedRows = useMemo(() => {
    const byStatus = status ? rows.filter((r) => r.completed === (status === 'completed')) : rows;
    return groupMode === 'document'
      ? byStatus.filter((r) => matchesDocKeyword(r, docQuery))
      : byStatus;
  }, [rows, status, groupMode, docQuery]);

  /**
   * 🔒 `AC-31` 兩種群組容器**互斥渲染**：非當前模式者連推導都不做（回空陣列）⇒ 另一種
   * `[data-*-group]` 恰 0 個在結構上成立，而不是靠渲染端多寫一個條件。
   */
  const groups = useMemo(
    () => (groupMode === 'org' ? groupRowsByOrg(displayedRows) : []),
    [groupMode, displayedRows],
  );
  const docGroups = useMemo<OjtDocGroup[]>(
    () => (groupMode === 'document' ? docGroupsOf(displayedRows) : []),
    [groupMode, displayedRows],
  );
  const filtered = Boolean(orgQuery || status || (groupMode === 'document' && docQuery.trim()));

  /**
   * 一列進度列之渲染（兩種分組模式**共用同一份**）。
   * 🔒 `AC-31`④／`AC-36`：組內列之**行為與互動掛鉤**（展開場次／新增／下載／刪除、角色守門、
   * 孤兒列規則）在文件分組模式下**一格不改**——共用同一個渲染點，是「不會有第二份行為悄悄漂走」
   * 在程式碼上唯一看得出來的保證。
   * 🔴 `AC-31`④-a：但列之**主標籤**必須隨分組維度切換，故把 `groupMode` 一路帶進 `ProgressRow`
   * 以**參數**區分身分呈現——⚠ **不得**為此複製出第二份列元件：那正是「兩邊行為悄悄漂走」之起點。
   */
  const renderRow = (r: OjtProgressRow): JSX.Element => {
    const key = rowKeyOf(r.documentId, r.orgCode);
    return (
      <ProgressRow
        key={key}
        row={r}
        groupMode={groupMode}
        expanded={expanded.includes(key)}
        sessions={sessionsByRow[key]}
        mayAdd={mayAdd}
        mayDelete={mayManage}
        onToggle={() => void onToggleRow(r)}
        onAdd={() => openAdd(r)}
        onDownload={(s) => void onDownload(s)}
        onDelete={(s) => askDelete(r, s)}
      />
    );
  };

  /**
   * `AC-28`⑯ 導向 TAB2 之入口：切至 TAB2、把**既有**之完成狀態篩選設為「尚未完成」、
   * 清空單位關鍵字。
   * 🔒 **未新增任何 TAB2 篩選項**（`AC-13` 恰兩項、完成狀態恰三選項不變）——本入口只是替使用者
   * 預先設好既有控制項，不是第三個篩選器。清空關鍵字是必要的：若沿用使用者上次輸入的單位，
   * 從儀表板點過來會看到一份被暗中窄化的清單，而畫面上沒有任何線索說明為什麼。
   */
  const gotoSessionsPending = useCallback(() => {
    setTab('sessions');
    setStatus('pending');
    setOrgQuery('');
  }, []);

  // AC-07：一般使用者全頁 403（側選單亦不呈現本項）。
  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">{BLOCKED_TITLE}</h1>
        <p className="text-sm text-slate-500 mt-1">{BLOCKED_MSG}</p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumb={[
          { label: 'OJT 進度管理' },
          { label: tab === 'dashboard' ? TAB_DASHBOARD_TEXT : TAB_SESSIONS_TEXT },
        ]}
        title="OJT 進度管理"
      />

      {/*
        AC-06：SysAdmin 唯讀橫幅（可查全部內容、任一寫入端點 403）。
        🔒 版面權威＝prototype 25 `#roBanner`（:177-179）：位於 `<header>` **內**、`border-t`、
        左右滿版、無圓角，緊貼 topbar 底緣 ⇒ 經 `TopbarBanner` 投遞，**不畫在 `<main>` 裡**
        （畫在 main 會變成左右內縮之四邊框圓角卡片）。
      */}
      {!canWrite && (
        <TopbarBanner>
          <div className="bg-cyan-50 border-t border-cyan-200 text-cyan-800 text-sm px-4 py-2 flex items-center gap-2">
            <Icon name="eye" className="w-4 h-4 shrink-0" />
            <span>{RO_NOTICE_SYSADMIN}</span>
          </div>
        </TopbarBanner>
      )}

      {/*
        🔒 版面權威＝prototype 25 之 TAB bar（:194-199）：緊接 `</header>` 之後、左右滿版、
        與 topbar 零間隙，內距由自身之 `px-4` 承擔 ⇒ 經 `BelowTopbar` 投遞至 `<main>` **之外**。
        ⚠ 本頁是目前唯一把分頁列提到 main 之外的頁面；`OrgSyncPage`（09）與
        `PermissionMatrixPage`（18）之分頁列在其 prototype 裡本就在 main 內部，不得比照改動。
      */}
      <BelowTopbar>
        <div className="bg-white border-b border-slate-200 px-4">
          <div role="tablist" aria-label="OJT 進度管理分頁" className="flex text-sm">
            {/* 🔴 主管／部門窗口：儀表板分頁鈕**完全不進 DOM**（非 disabled、非 CSS 隱藏）
                ——一顆按得到卻沒有內容的分頁鈕，比沒有那顆鈕更難理解。 */}
            {mayViewDashboard && (
              <TabButton tabKey="dashboard" label={TAB_DASHBOARD_TEXT} icon="layout-dashboard" active={tab} onSelect={setTab} />
            )}
            <TabButton tabKey="sessions" label={TAB_SESSIONS_TEXT} icon="list-tree" active={tab} onSelect={setTab} />
          </div>
        </div>
      </BelowTopbar>

      {/* TAB1 儀表板（三區）。可見角色下兩個 panel 恆在 DOM，非當前者以 hidden 隱藏
          （role=tabpanel 契約）；🔴 對主管／部門窗口則**整個 panel 不進 DOM**。 */}
      {mayViewDashboard && (
        <div
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="ojt-tabbtn-dashboard"
          data-ojt-panel="dashboard"
          className={tab === 'dashboard' ? 'space-y-5' : 'hidden'}
        >
          <CoverageSection
            summary={summary}
            docScope={docScope}
            onScopeChange={setDocScope}
            onGotoPending={gotoSessionsPending}
          />
          <RollupSection summary={summary} />
          <RecentSection summary={summary} />
        </div>
      )}

      {/* TAB2 以使用單位分組之資料清單。 */}
      <div
        role="tabpanel"
        tabIndex={0}
        aria-labelledby="ojt-tabbtn-sessions"
        data-ojt-panel="sessions"
        className={tab === 'sessions' ? 'space-y-4' : 'hidden'}
      >
        <div className="flex items-start gap-2 text-sm text-slate-500">
          <Icon name="info" className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
          <p>
            以使用單位為群組，列出該單位涉及之各份 ICSOP 文件之進度列。每列可累積多筆教育訓練場次（累加、非覆蓋）；同一文件之上下層單位各自為獨立一列、完成狀態互不影響。
          </p>
        </div>

        {/* AC-13：篩選恰兩項（單位搜尋＋完成狀態）。完成狀態恰三選項——列層級恆為二態，
            清單頁之「部分完成」在此會是永遠回 0 筆的死選項，刻意不放。 */}
        <div data-ojt-filter-bar className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              data-ojt-filter="org"
              type="search"
              value={orgQuery}
              onChange={(e) => setOrgQuery(e.target.value)}
              placeholder="搜尋使用單位（名稱或代碼）…"
              aria-label="搜尋使用單位"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
          <select
            data-ojt-filter="status"
            aria-label="完成狀態"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | 'completed' | 'pending')}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
          >
            <option value="">所有完成狀態</option>
            <option value="completed">{BADGE_COMPLETED_TEXT}</option>
            <option value="pending">{BADGE_PENDING_TEXT}</option>
          </select>
          {/* `AC-30` 分組模式（恰二態）。
              🔴 **不掛 `data-ojt-filter`**——它不移除任何列，只改變列的組織方式；算成第三個
              篩選會直接推翻 `OQ-E11-15`→A 之既有裁決，且弄破 `AC-13`「篩選恰兩項」之既有鎖。 */}
          <select
            data-ojt-group-mode
            aria-label={GROUP_MODE_ARIA_TEXT}
            value={groupMode}
            onChange={(e) => onChangeGroupMode(e.target.value as OjtGroupMode)}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
          >
            <option value="org">{GROUP_MODE_ORG_TEXT}</option>
            <option value="document">{GROUP_MODE_DOC_TEXT}</option>
          </select>
          {/* `AC-33`② 文件搜尋：🔒 僅 document 模式**進 DOM**（org 模式完全不進，非 CSS 隱藏），
              🔴 同樣不掛 `data-ojt-filter`。 */}
          {groupMode === 'document' && (
            <div className="relative flex-1 min-w-[220px]">
              <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                data-ojt-doc-search
                type="search"
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                placeholder={DOC_SEARCH_PLACEHOLDER_TEXT}
                aria-label={DOC_SEARCH_ARIA_TEXT}
                className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
            </div>
          )}
          {filtered && (
            <button
              onClick={() => {
                setOrgQuery('');
                setStatus('');
                setDocQuery('');
              }}
              className="px-3 py-2 rounded-md text-sm text-primary-600 hover:bg-primary-50"
            >
              清除
            </button>
          )}
          <span data-ojt-row-count className="ml-auto text-sm text-slate-500">
            {`共 ${rows.length} 列進度列 · ${rows.filter((r) => r.completed).length} 列${BADGE_COMPLETED_TEXT}`}
          </span>
        </div>

        {/* AC-26 待歸位區：歸位完畢後**整區消失**（非空狀態）——遷移是一次性工作，
            留一個永久的空框會讓人以為系統壞了或還有待辦。 */}
        {pending.length > 0 && (
          <PendingBlock items={pending} mayAssign={mayManage} onAssign={(item) => setAssign({ item, orgCode: '', trainingDate: '', error: null })} />
        )}

        {groups.map((g) => (
          /* 🔴 React key 用複合鍵 `g.key`（跨公司同碼時 `g.code` 會重複 ⇒ 兩組會被 React
             視為同一個節點而錯位）；`data-progress-group` 之值維持 `orgCode`（prototype 25 之
             既有 DOM 契約，不變更），公司別以**新增**之 `data-progress-group-company` 表達。 */
          <section key={g.key} data-progress-group={g.code} data-progress-group-company={g.companyCode} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
              <Icon name="building-2" className="w-4 h-4 text-slate-400 shrink-0" />
              <span data-progress-group-name className="font-medium text-slate-800 truncate">{g.label}</span>
              <span data-progress-group-code className="mono text-xs text-slate-400 shrink-0">{g.code}</span>
              {g.inactive && (
                <span data-org-inactive className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0 whitespace-nowrap">
                  {ORG_INACTIVE_TEXT}
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100">{g.rows.map(renderRow)}</div>
          </section>
        ))}

        {/* `AC-32` 口徑說明行：🔒 全頁恰 1 個、僅 document 模式進 DOM。
            🔴 **必要載體、非裝飾**——處置比照同頁既有之 `[data-doc-coverage-basis-note]`：同一頁
            並置兩個口徑不同的數字，沒有這一行，使用者一對帳就會把正常現象讀成 bug。 */}
        {groupMode === 'document' && (
          <p data-doc-group-basis-note className="text-xs text-slate-400 flex items-start gap-1.5">
            <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{DOC_GROUP_BASIS_NOTE_TEXT}</span>
          </p>
        )}

        {docGroups.map((g) => {
          const open = expandedDocs.includes(g.documentId);
          return (
            /* 🔒 群組鍵＝`documentId`（非文件編號、非書名）：書名非唯一，以書名分組會把兩份
               不同文件併成一組而憑空少掉一份文件。 */
            <section key={g.documentId} data-doc-group={g.documentId} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                data-doc-group-toggle={g.documentId}
                onClick={() => onToggleDocGroup(g.documentId)}
                aria-expanded={open}
                aria-label={docGroupToggleAria(g.documentNumber, g.documentName)}
                className={`w-full flex items-center gap-2 px-4 py-3 bg-slate-50 text-left hover:bg-slate-100 ${
                  open ? 'border-b border-slate-100' : ''
                }`}
              >
                <Icon name={open ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-slate-400 shrink-0" />
                <span data-doc-group-number className="mono text-xs text-slate-500 shrink-0">{g.documentNumber}</span>
                <span data-doc-group-name className="font-medium text-slate-800 truncate">{g.documentName}</span>
                {/* 🔴 應完成訓練日期緊接**程序書名之後**（人類需求 2026-09-02）。
                    org 模式之對應載體在列上（`ProgressRow`），兩處共用同一個 `dueDateText()`。 */}
                <DueDateChip announcedDate={g.announcedDate} />
                {/* 🔴 X／Y 取自**當下呈現之列**（含裁撤與孤兒），不得改讀 TAB1 之 docCoverage；
                    百分比一律走 `docGroupPercentText`（其內部委派既有 `coveragePercent`）。 */}
                <span data-doc-group-ratio className="ml-auto text-xs text-slate-500 shrink-0 whitespace-nowrap">
                  {docGroupRatioText(g.done, g.total)}
                </span>
                <span data-doc-group-pct className="text-xs font-medium text-slate-700 shrink-0 whitespace-nowrap">
                  {docGroupPercentText(g.done, g.total)}
                </span>
              </button>
              {/* 🔴 `AC-33`①：**展開才渲染**——收合時組內列完全不進 DOM（非 CSS 隱藏）。 */}
              {open && <div className="divide-y divide-slate-100">{g.rows.map(renderRow)}</div>}
            </section>
          );
        })}

        {displayedRows.length === 0 && (
          <div data-ojt-state="empty" className="text-center py-14 bg-white border border-slate-200 rounded-xl">
            <Icon name="inbox" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">{filtered ? EMPTY_ROWS_TEXT : EMPTY_ALL_TEXT}</p>
            {!filtered && <p className="text-slate-400 text-xs mt-1">{EMPTY_ALL_HINT}</p>}
          </div>
        )}
      </div>

      {addTarget && (
        <AddSessionModal
          target={addTarget}
          date={addDate}
          file={addFile}
          error={addError}
          onDate={setAddDate}
          onFile={setAddFile}
          onClose={() => setAddTarget(null)}
          onSubmit={() => void onSubmitAdd()}
        />
      )}

      {assign && (
        <AssignModal
          state={assign}
          onChange={setAssign}
          onClose={() => setAssign(null)}
          onSubmit={() => void onSubmitAssign()}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div data-confirm-modal className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" className="w-5 h-5 text-red-500" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{DEL_CONFIRM_TITLE}</h3>
                <p className="text-sm text-slate-500 mt-1">{confirm.body}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
                取消
              </button>
              <button
                data-confirm-ok
                onClick={() => void onConfirmDelete()}
                className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
              >
                {DEL_CONFIRM_OK_TEXT}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  tabKey,
  label,
  icon,
  active,
  onSelect,
}: {
  tabKey: TabKey;
  label: string;
  icon: string;
  active: TabKey;
  onSelect: (t: TabKey) => void;
}): JSX.Element {
  const on = active === tabKey;
  return (
    <button
      id={`ojt-tabbtn-${tabKey}`}
      role="tab"
      aria-selected={on ? 'true' : 'false'}
      aria-controls={`ojt-panel-${tabKey}`}
      data-ojt-tab={tabKey}
      onClick={() => onSelect(tabKey)}
      className={`px-4 py-3 font-medium border-b-2 flex items-center gap-1.5 ${
        on ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon name={icon} className="w-4 h-4" />
      {label}
    </button>
  );
}

/**
 * TAB1 區一 · 文件-訓練覆蓋率（`AC-14`／`AC-17`）。
 * 🔴 分母為零時呈現「尚無可統計之進度列」——`0/0` 在 JS 為 `NaN`，直接渲染會出現 `NaN%`；
 * 退化為 `0%` 與「全部未完成」無從分辨，退化為 `100%` 更會謊報。三者皆須被排除。
 */
function CoverageSection({
  summary,
  docScope,
  onScopeChange,
  onGotoPending,
}: {
  summary: OjtProgressSummary | null;
  docScope: OjtDocScope;
  onScopeChange: (s: OjtDocScope) => void;
  onGotoPending: () => void;
}): JSX.Element {
  const numerator = summary?.coverage.numerator ?? 0;
  const denominator = summary?.coverage.denominator ?? 0;
  const pct = coveragePercent(numerator, denominator);
  const slice = summary?.docCoverage;
  const items = slice?.items ?? [];
  /**
   * 🔴 三態份數與總份數恆取自**完整母體**（`byState`／`totalDocuments`），**不是** `items.length`
   * ——摘要要回答的是「總共長什麼樣」，不是「這張表現在畫了什麼」。把切片套進統計，
   * 覆蓋率就會退化成「前 15 份的覆蓋率」。
   */
  const byState = slice?.byState ?? { all: 0, partial: 0, none: 0, unassigned: 0 };
  const totalDocuments = slice?.totalDocuments ?? 0;
  /**
   * 🔴 `AC-14` ⑬ 摘要行兩行之四個數字（`OQ-E11-22`）。**唯一的推導點**在
   * `docCoverageBreakdown()`——下行之「尚未開始」是 `byState.none − byState.unassigned`
   * （**有義務**卻一列都沒完成），直接渲染 `byState.none` 會把 587 份沒有訓練義務的文件
   * 宣告成待辦。
   */
  const breakdown = docCoverageBreakdown(totalDocuments, byState);
  /**
   * 🔴 摘要行與空狀態之範圍一律取自**回應**（`slice.scope`），不是本地的 `docScope` state：
   * 切換範圍是一次往返請求，在回應抵達前兩者會不一致，讀 state 會讓畫面宣稱一個伺服器還沒
   * 確認的範圍（例如摘要說「全部文件」但列還是上一批）。回應未到時才退回 state 作為初值。
   */
  const shownScope = slice?.scope ?? docScope;
  const kpis: { key: string; label: string; value: string; unit: string; icon: string }[] = [
    { key: 'documents', label: '追蹤中文件', value: String(totalDocuments), unit: '份', icon: 'file-text' },
    { key: 'rows', label: '進度列（文件 × 使用單位）', value: String(denominator), unit: '列', icon: 'list-tree' },
    { key: 'completed', label: BADGE_COMPLETED_TEXT, value: String(numerator), unit: '列', icon: BADGE_COMPLETED_ICON },
    { key: 'pending', label: BADGE_PENDING_TEXT, value: String(denominator - numerator), unit: '列', icon: BADGE_PENDING_ICON },
    { key: 'rate', label: '整體覆蓋率', value: pct === null ? NO_STATISTICS_TEXT : `${pct}%`, unit: '', icon: 'target' },
  ];

  return (
    <section data-ojt-section="coverage" className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="target" className="w-4 h-4 text-primary-600" />
        <h2 className="font-semibold text-slate-900">{SEC_COVERAGE_TITLE}</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        最小追蹤單位＝一份 ICSOP 文件 × 一個使用單位；該列有至少一筆教育訓練場次即為「已完成」。
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((c) => (
          <div key={c.key} data-coverage-kpi={c.key} className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Icon name={c.icon} className="w-3.5 h-3.5 text-slate-400" />
              {c.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span data-coverage-kpi-value className="text-2xl font-semibold text-slate-900 mono">{c.value}</span>
              {c.unit && <span className="text-xs text-slate-400">{c.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500 flex items-start gap-1.5">
        <Icon name="alert-triangle" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
        <span data-coverage-exclusion-note>
          {exclusionNote(
            numerator,
            denominator,
            summary?.coverage.excludedInactive ?? 0,
            summary?.coverage.excludedOrphaned ?? 0,
          )}
        </span>
      </p>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="text-xs font-medium text-slate-500">依文件逐筆</div>
          {/* 🔒 顯示範圍預設「僅未全部完成」；切換即重新請求（非客端過濾）。 */}
          <select
            data-doc-coverage-scope
            aria-label={DOC_COVERAGE_SCOPE_LABEL}
            value={docScope}
            onChange={(e) => onScopeChange(e.target.value as OjtDocScope)}
            className="ml-auto px-2.5 py-1.5 rounded-md border border-slate-300 text-xs bg-white"
          >
            {DOC_COVERAGE_SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.text}</option>
            ))}
          </select>
          {/* 導向 TAB2 之入口：**恆存在**，不只在截斷時才出現。 */}
          <button
            data-doc-coverage-more
            onClick={onGotoPending}
            aria-label={DOC_COVERAGE_MORE_ARIA}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 text-xs text-primary-700 hover:bg-primary-50"
          >
            <Icon name="list-tree" className="w-3.5 h-3.5" />
            {DOC_COVERAGE_MORE_TEXT}
          </button>
        </div>

        {/*
          摘要行：三態份數並陳。🔴 **刻意不掛** `data-doc-ojt-state-chip`——否則整區 textContent
          之斷言會被摘要行滿足，變成一條對「列是否真的畫出來」零鑑別力的假綠斷言。
          🔴 狀態色只上在 `aria-hidden` 之 icon、文字用 `text-slate-600`：`none` 之色票為
          `text-slate-300`（白底對比約 1.7:1，低於 WCAG AA），該色票與清單頁共用、不得於此改動，
          但新載體不必沿用它的可讀性問題。
        */}
        <div
          data-doc-coverage-summary
          data-doc-coverage-scope-value={shownScope}
          data-doc-coverage-shown={items.length}
          className="text-xs text-slate-500 mb-2 space-y-1"
        >
          {/* 上行：切「有沒有訓練義務」。🔒 `tracked + unassigned === totalDocuments`。 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span data-doc-coverage-total={totalDocuments}>
              {'共 '}
              <span className="mono text-slate-700">{totalDocuments}</span>
              {' 份文件'}
            </span>
            <span data-doc-coverage-tracked={breakdown.tracked}>
              {`${DOC_COVERAGE_TRACKED_LABEL} `}
              <span className="mono text-slate-700">{breakdown.tracked}</span>
              {' 份'}
            </span>
            <span
              data-doc-coverage-unassigned={breakdown.unassigned}
              className={`inline-flex items-center gap-1 ${DOC_UNASSIGNED_VISUAL.className}`}
            >
              <Icon name={DOC_UNASSIGNED_VISUAL.icon} className="w-3.5 h-3.5" aria-hidden />
              {`${DOC_UNASSIGNED_TEXT} `}
              <span className="mono">{breakdown.unassigned}</span>
              {' 份'}
            </span>
          </div>
          {/* 下行：有義務者之三態分佈。🔒 `stat.all + stat.partial + stat.none === tracked`。 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{DOC_COVERAGE_BREAKDOWN_LABEL}</span>
            {(['all', 'partial', 'none'] as const).map((k) => {
              const view = ojtStatusView(k);
              return (
                <span key={k} data-doc-coverage-stat={k} className="inline-flex items-center gap-1 text-slate-600">
                  <Icon name={view.icon} className={`w-3.5 h-3.5 ${view.className}`} aria-hidden />
                  {`${view.text} `}
                  <span className="mono">{breakdown.stat[k]}</span>
                  {' 份'}
                </span>
              );
            })}
            <span data-doc-coverage-incomplete={slice?.incompleteTotal ?? 0} className="text-slate-500">
              {`${DOC_COVERAGE_INCOMPLETE_LABEL} `}
              <span className="mono text-slate-700">{slice?.incompleteTotal ?? 0}</span>
              {' 份'}
            </span>
          </div>
        </div>

        <p data-doc-coverage-basis-note className="text-xs text-slate-400 mb-2 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{DOC_COVERAGE_BASIS_NOTE}</span>
        </p>

        {/*
          🔒 固定高度捲軸容器：`tabindex="0"` 使其可被鍵盤聚焦後捲動（WCAG 2.1.1——可捲動區域
          若不可聚焦，只用鍵盤的人看不到被捲軸藏起來的列）。高度 380px 對應約 8.4 列，
          使第 9 列露出約四成：Chromium 之 overlay 捲軸平時隱形，若切在列邊界上就完全沒有
          「下面還有」的線索。
        */}
        <div
          role="region"
          aria-label={DOC_COVERAGE_REGION_LABEL}
          tabIndex={0}
          className="overflow-auto max-h-[380px] rounded-lg border border-slate-100"
        >
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 sticky top-0 z-10 bg-slate-50">程序書編號</th>
                <th className="text-left font-medium px-4 py-2.5 sticky top-0 z-10 bg-slate-50">程序書書名</th>
                <th className="text-left font-medium px-4 py-2.5 sticky top-0 z-10 bg-slate-50">狀態</th>
                <th className="text-left font-medium px-4 py-2.5 sticky top-0 z-10 bg-slate-50">已完成 / 使用單位</th>
                <th className="text-left font-medium px-4 py-2.5 sticky top-0 z-10 bg-slate-50">覆蓋率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => {
                /**
                 * 🔴 `AC-14` ⑧ 之單一判準＝`totalUnits === 0`（該文件未指定任何使用部門 ⇒
                 * **沒有訓練義務**）。本態是**區一之呈現態**，不是 `AC-04` 的第四個狀態值。
                 */
                const noUsingDept = c.totalUnits === 0;
                const view = docCoverageRowView(c);
                const rowPct = coveragePercent(c.completedUnits, c.totalUnits) ?? 0;
                return (
                  <tr
                    key={c.documentNumber}
                    data-doc-coverage-row={c.documentNumber}
                    /*
                      🔴 本輪負向鎖定 ①：值域**維持** `all｜partial｜none` 三值——無義務列於此
                      仍為 `none`（`AC-04` 口徑），第四態只由 `[data-doc-no-using-dept]` 表達。
                      ⚠ 同一列同時具備兩者**正是事實**（`AC-04` 說它是 `none`，區一說它沒有
                      訓練義務），兩者不衝突、不得互相對齊。
                    */
                    data-doc-ojt-state={c.state}
                    // 🔒 無值屬性，且**僅在 `totalUnits === 0` 時進 DOM**（非 CSS 隱藏）。
                    {...(noUsingDept ? { 'data-doc-no-using-dept': '' } : {})}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5 mono text-xs text-slate-600 whitespace-nowrap">{c.documentNumber}</td>
                    <td className="px-4 py-2.5 text-slate-800">{c.documentName}</td>
                    <td className="px-4 py-2.5">
                      <span data-doc-ojt-state-chip className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${view.className}`} title={view.text}>
                        <Icon name={view.icon} className="w-3.5 h-3.5" />
                        {view.text}
                      </span>
                    </td>
                    {/*
                      🔴 `AC-14` ⑫：退化值不得照畫——`0 / 0` 與 `0%` 都在宣稱一個不存在的量測
                      結果，兩欄一律呈現 `—`。
                    */}
                    <td className="px-4 py-2.5">
                      <span data-doc-coverage-ratio className="mono text-slate-700">
                        {noUsingDept ? DOC_COVERAGE_NA_TEXT : `${c.completedUnits} / ${c.totalUnits}`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {noUsingDept ? (
                        <span data-doc-coverage-pct className="mono text-xs text-slate-400">{DOC_COVERAGE_NA_TEXT}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full ${docCoverageBarClass(rowPct)}`} style={{ width: `${rowPct}%` }} />
                          </div>
                          <span data-doc-coverage-pct className={`mono text-xs ${rowPct === 100 ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {`${rowPct}%`}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <DocCoverageEmptyRow scope={shownScope} noRows={denominator === 0} />}
            </tbody>
          </table>
        </div>

        {/*
          🔴 **不得靜默 top-N**：截斷時必須明說「還有幾份沒列出／憑什麼是這 N 份／完整的去哪看」。
          未截斷（`hidden === 0`）時本元素**完全不進 DOM**（非 CSS 隱藏）——CSS 隱藏會讓
          「未截斷」與「截斷了但沒說」在 DOM 上長得一樣。
        */}
        {(slice?.hidden ?? 0) > 0 && (
          <p
            data-doc-coverage-truncation
            data-doc-coverage-hidden={slice!.hidden}
            className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
          >
            <Icon name="alert-triangle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{docCoverageTruncationText(slice!.maxRows, slice!.hidden, slice!.scope)}</span>
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * 區一逐筆表之空狀態——**分兩類、互不混用**：
 * ① **全域無任何進度列**（`noRows`）⇒ 沿用既有 `EMPTY_ALL_TEXT`，且**不帶**範圍補充提示。
 * ② **有進度列、但目前顯示範圍下無列** ⇒ 逐範圍一句 ＋ 共用之「切換顯示範圍」提示。
 *
 * 🔴 判別依據為 `coverage.denominator === 0`（＝一列進度列都沒有），**不是**文件數：
 * ① 之逐字文案本身講的就是「目前沒有任何 OJT **進度列**」，以進度列數判別才與該句一致；
 * 而「有進度列卻在某個顯示範圍下無列」正是 ② 要描述的狀態。
 * 🔴 ② **刻意不帶** `EMPTY_ALL_HINT`（「進度列從哪裡來」那句）——那句只給全域空狀態；
 * 此處的列並非不存在，只是被顯示範圍濾掉了。
 */
function DocCoverageEmptyRow({ scope, noRows }: { scope: OjtDocScope; noRows: boolean }): JSX.Element {
  return (
    <tr>
      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
        {noRows ? (
          <span data-doc-coverage-empty="no-docs">{EMPTY_ALL_TEXT}</span>
        ) : (
          <span data-doc-coverage-empty={scope}>
            {DOC_COVERAGE_EMPTY_BY_SCOPE[scope]}
            <span className="block mt-1 text-xs text-slate-400">{DOC_COVERAGE_EMPTY_HINT}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * TAB1 區二 · 部門完成率（`AC-15`）。
 * 🔒 **列數不因彙總而改變**——彙總是統計階段的行為，不得回頭把 `AC-01` 之列展開；
 * 頁尾之不變式敘述即為該性質之畫面載體。
 * 🔴 本部層／公司層之單位（無部層祖先）**自成一組、不排除**（`OQ-E11-20` ②）。
 */
function RollupSection({ summary }: { summary: OjtProgressSummary | null }): JSX.Element {
  const list = summary?.deptRollup ?? [];
  const summed = list.reduce((a, g) => a + g.totalUnits, 0);
  return (
    <section data-ojt-section="rollup" className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="building-2" className="w-4 h-4 text-primary-600" />
        <h2 className="font-semibold text-slate-900">{SEC_ROLLUP_TITLE}</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        將各使用單位之進度列彙總至其所屬部層呈現；彙總僅發生於統計階段——清單分頁之進度列仍依使用部門原樣、不展開子樹。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">部</th>
              <th className="text-left font-medium px-4 py-2.5">代碼</th>
              <th className="text-left font-medium px-4 py-2.5">已完成 / 進度列</th>
              <th className="text-left font-medium px-4 py-2.5">完成率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((g) => (
              /* React key 補上公司別（同上理由）；`data-rollup-row` 之值維持部代碼。 */
              <tr key={`${g.companyCode}__${g.deptOrgCode}`} data-rollup-row={g.deptOrgCode} data-rollup-company={g.companyCode} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-800">{g.deptName}</td>
                <td className="px-4 py-2.5 mono text-xs text-slate-500">{g.deptOrgCode}</td>
                <td className="px-4 py-2.5">
                  <span data-rollup-ratio className="mono text-slate-700">{`${g.completedUnits} / ${g.totalUnits}`}</span>
                </td>
                <td className="px-4 py-2.5">
                  {/*
                    🔴 完成率**自 `completedUnits`／`totalUnits` 推導**，不讀 `g.rate`——後端本支
                    不回該欄，直接渲染會印出 `undefined%`。與區一之覆蓋率共用同一個
                    `coveragePercent()`，全頁只有一個百分比推導點，兩處不可能分歧。
                  */}
                  <span data-rollup-rate className="mono text-xs text-slate-600">
                    {`${coveragePercent(g.completedUnits, g.totalUnits) ?? 0}%`}
                  </span>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">{EMPTY_ALL_TEXT}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500 flex items-start gap-1.5">
        <Icon name="shield-check" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-500" />
        <span data-rollup-invariant>{rollupInvariantText(list.length, summed)}</span>
      </p>
    </section>
  );
}

/**
 * TAB1 區三 · 最近完成 OJT 的單位（`AC-16`，近 30 天）。
 *
 * 🔴 **PII 硬性防線**：本區只渲染「文件編號／程序書書名」「使用單位」「最近場次日期」三者，
 * **不得**出現受訓人員或上傳者之姓名、員工編號或其他個人識別資訊。
 * ⚠ 上傳者姓名於 TAB2 場次明細中得以呈現——那是逐筆操作紀錄而非聚合看板，兩者刻意不同，
 * 不得互相對齊。
 *
 * 🔴 `OQ-E11-21` 節流：呈現上限 8 筆，為**純前端呈現層切片**（後端回應形狀未動，仍是 30 天
 * 窗口內之全部）。🔒 **不加捲軸**（上限已把整區高度封住）、**無顯示範圍控制項**——與區一
 * 刻意不同，不得因為「區一有就順手補一個」而對齊。
 */
function RecentSection({ summary }: { summary: OjtProgressSummary | null }): JSX.Element {
  const all = summary?.recentSessions ?? [];
  // 🔴 先排序、後切片：後端不保證陣列順序即日期序，直接切前 8 會取到「陣列前 8 筆」而非
  //    「最新 8 筆」——筆數斷言仍會全綠，只有日期方向會露餡。
  const list = sliceRecentSessions(all);
  const hidden = all.length - list.length;
  return (
    <section data-ojt-section="recent" className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="clock" className="w-4 h-4 text-primary-600" />
        <h2 className="font-semibold text-slate-900">{SEC_RECENT_TITLE}</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4 flex items-start gap-1.5">
        <Icon name="shield" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span data-pii-note>
          {PII_NOTE_SEGMENTS.map((seg) =>
            seg.strong ? (
              <strong key={seg.text} className="text-slate-500">{seg.text}</strong>
            ) : (
              <span key={seg.text}>{seg.text}</span>
            ),
          )}
        </span>
      </p>
      <div className="space-y-2">
        {list.length === 0 ? (
          <div data-recent-empty className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-6 justify-center text-sm text-slate-400">
            {EMPTY_RECENT_TEXT}
          </div>
        ) : (
          list.map((x) => (
            <div
              key={`${x.documentId}__${x.orgCode}__${x.trainingDate}`}
              data-recent-row={`${x.documentId}__${x.orgCode}`}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span data-recent-doc className="mono text-xs text-slate-500 shrink-0">{x.documentNumber}</span>
                  <span className="text-sm text-slate-800 truncate">{x.documentName}</span>
                </div>
                <div data-recent-org className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Icon name="building-2" className="w-3 h-3 text-slate-400" />
                  {x.orgName}
                </div>
              </div>
              <div data-recent-date className="mono text-sm text-slate-700 shrink-0">{x.trainingDate}</div>
            </div>
          ))
        )}
      </div>
      {/*
        🔴 與區一同一條規矩：**不得靜默 top-N**。未截斷時本元素**完全不進 DOM**（非 CSS 隱藏）。
        ⚠ 末句刻意**不承諾一個等價的畫面**——全站沒有「依日期排序之完成清單」，TAB2 是場次紀錄
        的所在地但不依日期排序 ⇒ 明講「展開該進度列檢視」而非「查看完整清單」。
      */}
      {hidden > 0 && (
        <p
          data-recent-truncation
          data-recent-total={all.length}
          data-recent-hidden={hidden}
          className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
        >
          <Icon name="alert-triangle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{recentTruncationText(all.length, hidden)}</span>
        </p>
      )}
    </section>
  );
}

/**
 * TAB2 之單一進度列（`AC-11`／`AC-12`／`AC-19`／`AC-25`）。
 *
 * 🔴 寫入型控制項（新增場次／刪除場次）以**不進 DOM** 表達無權，非 CSS 隱藏。
 * 🔴 孤兒列（單位已移出使用部門）**無新增入口**——即使角色可寫；該列已不在追蹤範圍內，
 * 讓它還能長出新場次等於承認一個不存在的進度列。
 * 🚫 `AC-20`：本元件永久不得出現任何 `[data-session-edit]`——場次不可編輯，更正之唯一路徑
 * 是由 ICSOPAdmin 刪除後重新登記。
 *
 * 🔴 `AC-31`④-a／④-b（2026-09-02 實機缺陷之修正）：列之**主標籤是哪一個維度，取決於群組是哪一個
 * 維度**——群組＝單位時列說明「哪一份文件」，群組＝文件時列說明「哪一個使用單位」。原先兩種模式
 * 都印文件編號／書名，於文件分組下同一組每一列都變成群組標題的複本，使用者根本看不出那是哪個單位。
 * ⚠ 上一輪的環只驗了列「有沒有進 DOM」與列的「行為」，沒有任何一條在問「這一列說明的是哪一個
 * 實體」，所以那個實作 100% 全綠——分組畫面的環，至少要有一條逐列比對列自身身分的斷言。
 */
function ProgressRow({
  row,
  groupMode,
  expanded,
  sessions,
  mayAdd,
  mayDelete,
  onToggle,
  onAdd,
  onDownload,
  onDelete,
}: {
  row: OjtProgressRow;
  groupMode: OjtGroupMode;
  expanded: boolean;
  sessions: OjtSessionView[] | undefined;
  mayAdd: boolean;
  mayDelete: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onDownload: (s: OjtSessionView) => void;
  onDelete: (s: OjtSessionView) => void;
}): JSX.Element {
  const key = rowKeyOf(row.documentId, row.orgCode);
  const badgeText = row.completed ? BADGE_COMPLETED_TEXT : BADGE_PENDING_TEXT;
  /**
   * 🔴 「辦過訓練，但不是這一版」＝有場次、卻沒有任何一場符合當下訓練基準版次。
   * 🔒 判定讀**後端送來的兩個計數**，不在前端重算——完成判定之口徑只能有一個來源。
   */
  const needsRetrain = row.sessionCount > 0 && row.currentEditionSessionCount === 0;
  return (
    <div data-progress-row={key} data-progress-doc={row.documentId} data-progress-org={row.orgCode}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          data-progress-expand={key}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? '收合' : '展開'}場次明細（${row.documentNumber} · ${row.orgName}）`}
          className="w-7 h-7 rounded hover:bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"
        >
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          {/* 🔴 `AC-31`④-a／④-b：主標籤隨分組維度切換，且**非當前維度那一組完全不進 DOM**
              （非 CSS 隱藏、非 `hidden`）——群組標題已經說過的事情，列再印一次就是純噪音。
              🔒 單位名／代碼之呈現語彙刻意與 org 模式群組標題之 `[data-progress-group-name]`／
              `[data-progress-group-code]` 逐字相同：同一個維度在兩處呈現，各造一種寫法即為分歧起點。 */}
          <div className="flex items-center gap-2 min-w-0">
            {groupMode === 'document' ? (
              <>
                <span data-progress-org-name className="font-medium text-slate-800 truncate">{row.orgName}</span>
                <span data-progress-org-code className="mono text-xs text-slate-400 shrink-0">{row.orgCode}</span>
              </>
            ) : (
              <>
                <span data-progress-doc-number className="mono text-xs text-slate-500 shrink-0">{row.documentNumber}</span>
                <span data-progress-doc-name className="text-sm text-slate-800 truncate">{row.documentName}</span>
                {/* 🔴 應完成訓練日期緊接**程序書名之後**（人類需求 2026-09-02）。
                    🔒 僅 `org` 模式進 DOM——`document` 模式之列不印書名（`AC-31` ④-b），
                    書名旁的那個日期自然也該待在群組標題那一份（見 `[data-doc-group-name]` 之後）。 */}
                <DueDateChip announcedDate={row.announcedDate} />
              </>
            )}
            {/* 🔴 F042 第五輪：列上之版次標籤。**兩種分組模式皆進 DOM**——版次是這一列
                「在追蹤哪一版」的說明，與列的身分維度（單位／文件）是兩回事。 */}
            <span
              data-progress-edition={row.trainingEdition ?? ''}
              title={`此列以「${editionText(row.trainingEdition)}」為訓練基準版次`}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0 whitespace-nowrap"
            >
              {rowEditionText(row.trainingEdition)}
            </span>
          </div>
        </div>
        <span
          data-completion-badge={row.completed ? 'completed' : 'pending'}
          aria-label={badgeText}
          title={badgeText}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
            row.completed ? 'text-emerald-700 bg-emerald-50' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Icon name={row.completed ? BADGE_COMPLETED_ICON : BADGE_PENDING_ICON} className="w-3 h-3" />
          {badgeText}
        </span>
        {row.orphaned && (
          <span data-row-orphaned className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0 whitespace-nowrap">
            {ORPHAN_NOTE_TEXT}
          </span>
        )}
        {/* 🔴 F042 第五輪：「辦過訓練，但那是改版前的事」。
            🔒 **完成徽章一格不動**（處置同 `ORPHAN_NOTE_TEXT`）：徽章照實說「尚未完成」，
            由本註記說明**為什麼**——做成第三種徽章態會讓人以為舊場次的紀錄失效了。 */}
        {needsRetrain && (
          <span data-row-retrain className="inline-flex items-center gap-1 text-xs text-amber-700 shrink-0 whitespace-nowrap">
            <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
            {RETRAIN_NOTE_TEXT}
          </span>
        )}
        <span data-session-count={row.sessionCount} className="inline-flex items-center gap-1 text-xs text-slate-500 shrink-0">
          <Icon name="calendar-check" className="w-3.5 h-3.5 text-slate-400" />
          {`${row.sessionCount} 場次`}
        </span>
        {mayAdd && !row.orphaned && (
          <button
            data-add-session={key}
            onClick={onAdd}
            aria-label={addSessionAria(row.documentNumber, row.orgName)}
            title={addSessionAria(row.documentNumber, row.orgName)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-primary-300 bg-white text-primary-700 text-xs hover:bg-primary-50 shrink-0"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            {ADD_SESSION_TEXT}
          </button>
        )}
      </div>

      {expanded && (
        <div data-session-detail={key} className="bg-slate-50/70 px-4 py-3 border-t border-slate-100">
          {(sessions ?? []).length === 0 ? (
            <div data-session-empty className="flex items-center gap-2 justify-center text-sm text-slate-400 py-3">
              {EMPTY_SESSIONS_TEXT}
            </div>
          ) : (
            <SessionsByEdition
              sessions={sessions ?? []}
              trainingEdition={row.trainingEdition}
              mayDelete={mayDelete}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 🔴 F042 第五輪（2026-09-02）：場次明細之**版次分組**——「版本太多時只顯示新版、
 * 其他先收合」（人類需求逐字）。
 *
 * 🔒 **當下訓練基準版次那一組恆展開且恆存在**（即使一場都沒有，見 `groupSessionsByEdition`
 * 之註）；其餘版次群組**預設收合，且收合時其 `[data-session-row]` 完全不進 DOM**——
 * 處置與 `AC-33`① 之文件群組折疊同一形狀（CSS 隱藏省不掉任何一個節點的建立成本）。
 * 🔒 **場次列本身之渲染一格不改**：同一份 `SessionRow`，四種行為（下載／刪除／角色守門／
 * aria 文案）在兩種群組下**共用同一個渲染點**——這是「不會有第二份行為悄悄漂走」在程式碼上
 * 唯一看得出來的保證（本 feature 於 2026-09-02 已因複製第二份列而踩過一次）。
 */
function SessionsByEdition({
  sessions,
  trainingEdition,
  mayDelete,
  onDownload,
  onDelete,
}: {
  sessions: OjtSessionView[];
  trainingEdition: string | null;
  mayDelete: boolean;
  onDownload: (s: OjtSessionView) => void;
  onDelete: (s: OjtSessionView) => void;
}): JSX.Element {
  const groups = useMemo(
    () => groupSessionsByEdition(sessions, trainingEdition),
    [sessions, trainingEdition],
  );
  /** 已展開之**舊版次**群組（當下版次不由本 state 管——它恆展開）。 */
  const [openOld, setOpenOld] = useState<string[]>([]);

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const open = g.current || openOld.includes(g.key);
        return (
          <section key={g.key} data-session-edition-group={g.key} data-session-edition-current={g.current ? '' : undefined}>
            <div className="flex items-center gap-2 mb-1.5">
              {/* 🔴 當下版次之標題**不是按鈕**（它不可收合）：一顆點了沒反應的折疊鈕，
                  比沒有折疊鈕更糟。舊版次才給折疊鈕。 */}
              {g.current ? (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <Icon name="chevron-down" className="w-3.5 h-3.5 text-slate-300" aria-hidden />
                  <span data-session-edition-label className="mono text-slate-700">{editionText(g.edition)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] whitespace-nowrap">
                    {EDITION_CURRENT_BADGE_TEXT}
                  </span>
                </span>
              ) : (
                <button
                  data-session-edition-toggle={g.key}
                  onClick={() =>
                    setOpenOld((prev) =>
                      prev.includes(g.key) ? prev.filter((k) => k !== g.key) : [...prev, g.key],
                    )
                  }
                  aria-expanded={open}
                  aria-label={editionGroupToggleAria(g.edition, g.sessions.length)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                >
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} className="w-3.5 h-3.5" />
                  <span data-session-edition-label className="mono">{editionText(g.edition)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] whitespace-nowrap">
                    {EDITION_OUTDATED_BADGE_TEXT}
                  </span>
                </button>
              )}
              <span data-session-edition-count={g.sessions.length} className="ml-auto text-[11px] text-slate-400 shrink-0">
                {editionGroupCountText(g.sessions.length)}
              </span>
            </div>
            {/* 🔴 收合時組內場次列**完全不進 DOM**（非 CSS 隱藏、非 `hidden` 屬性）。 */}
            {open &&
              (g.sessions.length === 0 ? (
                <div data-session-edition-empty className="flex items-center justify-center text-xs text-slate-400 py-2">
                  {EMPTY_CURRENT_EDITION_TEXT}
                </div>
              ) : (
                <div className="space-y-2">
                  {g.sessions.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      mayDelete={mayDelete}
                      onDownload={onDownload}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}

/** 單一場次列（🔒 兩種版次群組共用同一份，見 `SessionsByEdition` 之註）。 */
function SessionRow({
  session: s,
  mayDelete,
  onDownload,
  onDelete,
}: {
  session: OjtSessionView;
  mayDelete: boolean;
  onDownload: (s: OjtSessionView) => void;
  onDelete: (s: OjtSessionView) => void;
}): JSX.Element {
  return (
    <div data-session-row={s.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span data-session-date className="mono text-xs text-slate-700 shrink-0">{s.trainingDate}</span>
      <span data-session-uploader className="text-xs text-slate-500 shrink-0">{s.uploadedByName ?? '—'}</span>
      <span data-session-file className="text-sm text-slate-700 truncate flex-1">{s.fileName}</span>
      <button
        data-session-download={s.id}
        onClick={() => onDownload(s)}
        aria-label={downloadSessionAria(s.trainingDate, s.fileName)}
        title="下載簽到表"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 text-xs hover:bg-slate-50 shrink-0"
      >
        <Icon name="download" className="w-3.5 h-3.5" />
        下載
      </button>
      {mayDelete && (
        <button
          data-session-delete={s.id}
          onClick={() => onDelete(s)}
          aria-label={deleteSessionAria(s.trainingDate, s.fileName)}
          title={deleteSessionAria(s.trainingDate, s.fileName)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-red-200 text-red-600 text-xs hover:bg-red-50 shrink-0"
        >
          <Icon name="trash-2" className="w-3.5 h-3.5" />
          刪除
        </button>
      )}
    </div>
  );
}

/**
 * 🔴 F042 第五輪：**應完成訓練日期**（＝公告日期 + 1 個月）之單一渲染點。
 * 🔒 兩處呈現（org 模式之列、document 模式之群組標題）共用本元件——同一個日期在兩處
 * 各寫一份格式，就是分歧的起點。無公告日期時仍**進 DOM**（呈現 `—` ＋解釋用 `title`）：
 * 整個消失會讓使用者以為這份文件沒有訓練期限，而事實是「還沒有人設公告日期」。
 */
function DueDateChip({ announcedDate }: { announcedDate: string | null }): JSX.Element {
  const text = dueDateText(announcedDate);
  const known = text !== DUE_DATE_UNKNOWN_TEXT;
  return (
    <span
      data-training-due={known ? text : ''}
      title={known ? DUE_DATE_TITLE : DUE_DATE_UNKNOWN_TITLE}
      className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${
        known ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400'
      }`}
    >
      <Icon name="calendar-clock" className="w-3 h-3" aria-hidden />
      {`${DUE_DATE_LABEL} ${text}`}
    </span>
  );
}

/**
 * `AC-26` 待歸位工作台。
 * 🔴 本區**不參與篩選、也不計入列數**：它不是進度列（沒有單位、沒有完成狀態），混進去會讓
 * 「共 N 列」與畫面上看得到的東西對不起來。
 * 🔴 **全部後台角色皆可看見本區**（含 SysAdmin），但**指派鈕僅 ICSOPAdmin 進 DOM**。
 */
function PendingBlock({
  items,
  mayAssign,
  onAssign,
}: {
  items: OjtPendingItem[];
  mayAssign: boolean;
  onAssign: (item: OjtPendingItem) => void;
}): JSX.Element {
  return (
    <div data-ojt-pending-block className="bg-amber-50/60 border border-amber-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200">
        <Icon name="inbox" className="w-4 h-4 text-amber-700 shrink-0" />
        <span data-pending-title className="font-medium text-amber-900">{PENDING_TITLE_TEXT}</span>
        <span data-pending-count={items.length} className="ml-auto text-xs text-amber-800 shrink-0">
          <span className="mono">{items.length}</span> 筆
        </span>
      </div>
      <div className="px-4 py-3 bg-white/70 border-b border-amber-100">
        <p data-pending-note className="text-xs text-slate-500">{PENDING_NOTE_TEXT}</p>
        <p data-pending-scope-note className="mt-1 text-[11px] text-slate-400">{PENDING_SCOPE_TEXT}</p>
      </div>
      <div className="divide-y divide-amber-100 bg-white">
        {items.map((l) => (
          <div key={l.id} data-pending-row={l.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span data-pending-doc className="mono text-xs text-slate-500 shrink-0">
                  {l.documentNumber ?? l.documentId}
                </span>
                <span className="text-sm text-slate-800 truncate">{l.documentName ?? ''}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 min-w-0">
                <Icon name="paperclip" className="w-3 h-3 text-slate-400 shrink-0" />
                <span data-pending-file className="truncate">{l.fileName}</span>
              </div>
            </div>
            {mayAssign && (
              <button
                data-assign-org={l.id}
                onClick={() => onAssign(l)}
                aria-label={`指派使用單位（${l.documentNumber ?? l.documentId} · ${l.fileName}）`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-amber-300 bg-white text-amber-700 text-xs hover:bg-amber-50 shrink-0"
              >
                <Icon name="file-input" className="w-3.5 h-3.5" />
                {ASSIGN_ACTION_TEXT}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 新增教育訓練場次 modal（`AC-02`／`AC-09`／`AC-10`）。 */
function AddSessionModal({
  target,
  date,
  file,
  error,
  onDate,
  onFile,
  onClose,
  onSubmit,
}: {
  target: AddTarget;
  date: string;
  file: File | null;
  error: string | null;
  onDate: (v: string) => void;
  onFile: (f: File | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div data-add-session-modal className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900">新增教育訓練場次</h3>
          <button onClick={onClose} aria-label="關閉" className="text-slate-400 hover:text-slate-600">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <p data-add-session-target className="text-xs text-slate-500 mb-4">
          {`${target.documentNumber} · ${target.documentName} · ${target.orgName}（${target.orgCode}）`}
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="ojt-add-date" className="block text-sm font-medium text-slate-700 mb-1">
              <span>{FIELD_TRAINING_DATE_LABEL}</span> <span className="text-red-500">*</span>
            </label>
            <input
              id="ojt-add-date"
              data-session-date-input
              type="date"
              value={date}
              onChange={(e) => onDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              場次記錄的是已發生之教育訓練事實，故不接受未來日期。同一單位同一日可登記多場次（如上下午兩梯），系統不做同日去重。
            </p>
          </div>
          <div>
            <div className="block text-sm font-medium text-slate-700 mb-1">
              <span>{FIELD_SIGNIN_FILE_LABEL}</span> <span className="text-red-500">*</span>
            </div>
            <input
              data-session-file-input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              aria-label={FIELD_SIGNIN_FILE_LABEL}
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.click()}
              className="w-full border border-dashed border-slate-300 rounded-lg px-4 py-5 flex flex-col items-center gap-1 text-slate-500 hover:border-primary-400"
            >
              <Icon name="upload-cloud" className="w-6 h-6 text-slate-400" />
              <span className="text-sm">{file ? `已選擇：${file.name}` : '點此選擇簽到表檔案'}</span>
              <span className="text-xs text-slate-400">支援格式：pdf / jpg / jpeg / png；單檔上限 50 MB</span>
            </button>
          </div>
          {error && (
            <p data-session-error className="text-xs text-red-600 flex items-start gap-1">
              <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <Icon name="layers" className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
            <span>
              本場次累加於該列既有場次之下，不覆蓋、不取代既有任何一筆；既有簽到檔仍可下載。驗證失敗時不建立任何場次紀錄、不寫入任何檔案。
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
            取消
          </button>
          <button data-session-submit onClick={onSubmit} className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700">
            送出
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * `AC-26` 指派使用單位 modal（僅 ICSOPAdmin；單向不可逆）。
 * 🔴 **刻意不以「原上傳時間」自動帶入訓練日期**：舊模型只記錄「檔案何時被上傳」，從未記錄
 * 「訓練何時舉辦」。把上傳日當訓練日填進去，等於把一個系統從來不知道的事實寫成紀錄。
 */
function AssignModal({
  state,
  onChange,
  onClose,
  onSubmit,
}: {
  state: AssignState;
  onChange: (s: AssignState) => void;
  onClose: () => void;
  onSubmit: () => void;
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div data-assign-modal className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900">指派使用單位</h3>
          <button onClick={onClose} aria-label="關閉" className="text-slate-400 hover:text-slate-600">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <p data-assign-target className="text-xs text-slate-500 mb-4">
          {`${state.item.documentNumber ?? state.item.documentId} · ${state.item.fileName}`}
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="ojt-assign-org" className="block text-sm font-medium text-slate-700 mb-1">
              使用單位 <span className="text-red-500">*</span>
            </label>
            <input
              id="ojt-assign-org"
              data-assign-org-input
              value={state.orgCode}
              onChange={(e) => onChange({ ...state, orgCode: e.target.value })}
              placeholder="使用部門代碼（如 JAC00）"
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              只接受本文件之「文件使用部門」；指派到非使用部門之單位會被後端擋下（OJT_ORG_NOT_USING_DEPT）。
            </p>
          </div>
          <div>
            <label htmlFor="ojt-assign-date" className="block text-sm font-medium text-slate-700 mb-1">
              訓練日期 <span className="text-red-500">*</span>
            </label>
            <input
              id="ojt-assign-date"
              data-assign-date-input
              type="date"
              value={state.trainingDate}
              onChange={(e) => onChange({ ...state, trainingDate: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              舊資料未記錄訓練日期（舊模型只存檔案上傳時間），故須由您補填；原上傳時間僅供參考，不會自動帶入。
            </p>
          </div>
          {state.error && (
            <p data-assign-error className="text-xs text-red-600 flex items-start gap-1">
              <Icon name="alert-circle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{state.error}</span>
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
            取消
          </button>
          <button data-assign-submit onClick={onSubmit} className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700">
            確認歸位
          </button>
        </div>
      </div>
    </div>
  );
}
