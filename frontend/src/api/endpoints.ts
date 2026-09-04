import { apiFetch } from './client';
import { downloadViaBlob, openPdfViaBlob } from './download-blob';
import type {
  SessionUser,
  SelectAccountResponse,
  SyncRunSummary,
  SyncResult,
  AccountView,
  AccountFilters,
  LifecycleView,
  DagGraph,
  DagNode,
  DagEdge,
  DocumentListPage,
  DocumentFilters,
  DocumentStatus,
  DocumentView,
  DocumentUpdateResult,
  DocumentLinkView,
  DocumentAttachmentRecord,
  UsageFormRecord,
  NodeDrawerData,
  AccessHistoryFilters,
  AccessHistoryPage,
  PublicListFilters,
  PublicListPage,
  OrgUnitRecord,
  CompanyRecord,
  JobTitleRecord,
  JobPositionRecord,
  PersonRecord,
  AlertStatus,
  ResolutionKind,
  OrgChangeAlertView,
  OrgSyncMonthlySummary,
  OjtRowFilters,
  OjtProgressRow,
  OjtSessionView,
  OjtPendingItem,
  OjtProgressSummary,
  OjtDocScope,
  // F043 業務/功能類別管理（E12）。
  BusinessCategoryView,
  BusinessCategoryPayload,
  BusinessCategoryNode,
  BusinessCategoryEdge,
  BusinessCategoryGraph,
  BusinessCategoryNodeDrawerData,
  BusinessCategoryTreePreview,
  BusinessCategorySubtreeDocuments,
  BusinessCategoryChangeView,
  BusinessCategoryChangeFilters,
  BusinessCategoryTreeDiff,
  PublicBusinessCategoryListItem,
  PublicBusinessCategoryGraph,
  PublicBusinessCategoryNodeDoc,
} from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** GET /auth/me（受保護；401 AUTH_SESSION_EXPIRED 代表未登入/逾時）。 */
export function getMe(): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/me');
}

/**
 * POST /auth/login（途徑 B 帳密登入，F001 定案 A/B/C）。
 * 成功 → 後端核發 icsop_session cookie 並回 SessionUser；失敗 → 401 AUTH_INVALID_CREDENTIALS、
 * 400 AUTH_MISSING_FIELD（由 ApiError.code 承載）。識別鍵＝loginId。
 */
export function passwordLogin(body: {
  loginId: string;
  password: string;
}): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

// ===== F001 帳號選擇 delta（同一 email 命中多帳號） =====

/** GET /auth/select-account（AC-M12）：以選擇票證 cookie 取回候選清單投影。 */
export function getSelectAccountCandidates(): Promise<SelectAccountResponse> {
  return apiFetch<SelectAccountResponse>('/auth/select-account');
}

/** POST /auth/select-account（AC-M18）：以所選 accountId 兌換 session；成功後呼叫端須 refresh() 重新解析。 */
export function selectAccount(accountId: string): Promise<SessionUser> {
  return apiFetch<SessionUser>('/auth/select-account', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ accountId }),
  });
}

/**
 * GET /admin/org-sync/runs?limit=N（US-011 輪詢/歷程）。
 * limit 省略時不帶 query，交後端預設（20，上限 100）。
 */
export function getOrgSyncRuns(limit?: number): Promise<SyncRunSummary[]> {
  const q = limit === undefined ? '' : `?limit=${limit}`;
  return apiFetch<SyncRunSummary[]>(`/admin/org-sync/runs${q}`);
}

/**
 * POST /admin/org-sync/run（手動同步，僅 SysAdmin）。
 * B 階段（多公司）：回傳**陣列**，每筆為一家設定公司之結果；單一公司互斥中不再使整批 409，
 * 而是該公司於陣列中回傳 `errorCode:'SYNC_IN_PROGRESS'` 之 failed 項，其餘公司照常執行。
 *
 * 🔵 2026-08-31：`body.applyRoleDerivation` ＝系統管理員於同步歷程就實測筆數二次確認後，
 * 放行**該次**角色推導；此時 `compid` 為必填（後端 400 VALIDATION_ERROR），避免把無上限的
 * 窗口一併套到其餘公司。⚠ 刻意**無閾值參數**——畫面若能填百分比，一次性放寬會退化為
 * 隨手填 100% 的常駐開關，而該閾值是「上游職稱改名致大量帳號靜默失去限縮」之唯一偵測管道。
 */
export function triggerOrgSync(body?: {
  applyRoleDerivation: true;
  compid: string;
}): Promise<SyncResult[]> {
  return apiFetch<SyncResult[]>('/admin/org-sync/run', {
    method: 'POST',
    ...(body
      ? { headers: JSON_HEADERS, body: JSON.stringify(body) }
      : {}),
  });
}

// ===== F006 組織異動待確認提示 =====

/**
 * GET /admin/org-change-alerts?status=（組織人員異動管理 read：SysAdmin+ICSOPAdmin）。
 * 回傳兩種 alertKind 之混合清單（依 createdAt）。
 */
export function getOrgChangeAlerts(
  status: AlertStatus = 'pending',
): Promise<OrgChangeAlertView[]> {
  return apiFetch<OrgChangeAlertView[]>(`/admin/org-change-alerts?status=${status}`);
}

/**
 * PATCH /admin/org-change-alerts/:id/resolve（處理提示；write，僅 SysAdmin）。
 * 未指定 resolutionKind → 後端預設 NO_CHANGE_NEEDED（「已確認無需變更」）。
 * 404 ALERT_NOT_FOUND／409 ALERT_ALREADY_RESOLVED 由 ApiError.code 承載。
 */
export function resolveOrgChangeAlert(
  id: string,
  resolutionKind?: ResolutionKind,
): Promise<OrgChangeAlertView> {
  return apiFetch<OrgChangeAlertView>(`/admin/org-change-alerts/${id}/resolve`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(resolutionKind ? { resolutionKind } : {}),
  });
}

/** GET /admin/org-sync/monthly-summary（總覽 4 張 KPI 卡；read）。 */
export function getOrgSyncMonthlySummary(): Promise<OrgSyncMonthlySummary> {
  return apiFetch<OrgSyncMonthlySummary>('/admin/org-sync/monthly-summary');
}

// ===== F003 帳號與角色管理 =====

/**
 * GET /companies（公司主檔，F003 delta AC-P15）。回全部有效公司（`SELECTABLE_COMPANIES`），
 * **不以操作者所屬公司收斂**——建立/編輯帳號之公司欄為可跨公司改選之完整下拉，清單之公司
 * 篩選器（AC-P23b）亦共用本來源。權限＝「帳號管理」read（SysAdmin／ICSOPAdmin）。
 */
export function getCompanies(): Promise<CompanyRecord[]> {
  return apiFetch<CompanyRecord[]>('/companies');
}

/**
 * GET /job-titles?companyCode=（職稱＝畫面「資位」主檔，F003 delta AC-P14）。
 * `companyCode` 選填，未帶時後端以操作者 session 之 companyCode 為預設；回應**依 companyCode 精確
 * 過濾**（不做跨公司 fallback，與 AC-P7 之寫入驗證同一集合）且依 code 昇冪。
 * 權限＝「帳號管理」read（SysAdmin／ICSOPAdmin）；其餘 3 角色 403 PERMISSION_DENIED。
 */
export function getJobTitles(companyCode?: string): Promise<JobTitleRecord[]> {
  const cc = (companyCode ?? '').trim();
  const q = cc ? `?companyCode=${encodeURIComponent(cc)}` : '';
  return apiFetch<JobTitleRecord[]>(`/job-titles${q}`);
}

/**
 * GET /job-positions?companyCode=（職位主檔，F003 delta AC-P29）。
 * `companyCode` 選填，未帶時後端以操作者 session 之 companyCode 為預設；回應**依 companyCode
 * 精確過濾**且依 code 昇冪。🔴 此處之精確過濾不只是「與寫入驗證同一集合」——跨公司同代碼
 * 語意可相反，候選若混入他公司會讓人選到語意完全不同的職位。
 * 權限＝「帳號管理」read（SysAdmin／ICSOPAdmin）；其餘 3 角色 403 PERMISSION_DENIED。
 */
export function getJobPositions(
  companyCode?: string,
): Promise<JobPositionRecord[]> {
  const cc = (companyCode ?? '').trim();
  const q = cc ? `?companyCode=${encodeURIComponent(cc)}` : '';
  return apiFetch<JobPositionRecord[]>(`/job-positions${q}`);
}

/**
 * GET /admin/accounts（帳號管理 read：SysAdmin+ICSOPAdmin）。
 * F003 delta AC-P23a：後端已移除租戶過濾（跨公司帳號皆可見）；AC-P23b 之公司收斂改以選填
 * `companyCode` 參數表達（未帶＝全部公司）。
 */
export function getAccounts(f: AccountFilters = {}): Promise<AccountView[]> {
  const qs = new URLSearchParams();
  if (f.source) qs.set('source', f.source);
  if (f.roleCode) qs.set('roleCode', f.roleCode);
  if (f.status) qs.set('status', f.status);
  if (f.keyword) qs.set('keyword', f.keyword);
  if (f.companyCode) qs.set('companyCode', f.companyCode);
  const q = qs.toString();
  return apiFetch<AccountView[]>(`/admin/accounts${q ? `?${q}` : ''}`);
}

/**
 * POST /admin/accounts（建立手動帳號，SysAdmin；409 ACCOUNT_USERNAME_EXISTS、400 ROLE_INVALID）。
 * F003 delta AC-P1／AC-P30：payload 加入 `name`（必填）與選填之 `companyCode`／`orgCode`／
 * `jobTitleCode`（資位）／`jobPositionCode`（職位）；後者未提供時後端以操作者公司為預設
 * （AC-P5）／寫入 `null`（AC-P2）。
 */
export function createAccount(body: {
  loginId: string;
  password: string;
  roleCode: string;
  name?: string | null;
  companyCode?: string;
  orgCode?: string | null;
  jobTitleCode?: string | null;
  jobPositionCode?: string | null;
}): Promise<AccountView> {
  return apiFetch<AccountView>('/admin/accounts', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/**
 * PATCH /admin/accounts/:id（編輯：手動帳號姓名/公司/部門/資位/職位/重設密碼；
 * 上游 ACCOUNT_UPSTREAM_READONLY）。
 * F003 delta AC-P9：欄位缺席＝不變更；`orgCode`／`jobTitleCode`／`jobPositionCode` 明確傳
 * `null`＝清空。
 * AC-P10b：變更 `companyCode` 時該三者**必須**同請求一併給值（呼叫端一律四者同送，故恆滿足），
 * 嚴禁靜默沿用舊公司之代碼。
 */
export function updateAccount(
  id: string,
  body: {
    name?: string | null;
    password?: string;
    companyCode?: string;
    orgCode?: string | null;
    jobTitleCode?: string | null;
    jobPositionCode?: string | null;
  },
): Promise<AccountView> {
  return apiFetch<AccountView>(`/admin/accounts/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** PATCH /admin/accounts/:id/role（指派角色，僅 SysAdmin；ROLE_INVALID/ROLE_SELF_DOWNGRADE_BLOCKED）。 */
/**
 * F041（架構 §3.7 決策四）：新增第三個選填參數 `userSubtype`——僅角色為「一般使用者」時由呼叫端
 * 傳入（`isSubtypeApplicable(selected) ? subtype : undefined`），故 PATCH body **條件式**納入該鍵。
 * 非 User 角色時 body 不含此鍵，後端亦不寫入（AC-36：既有值保留、不清空）。
 */
export function assignAccountRole(
  id: string,
  roleCode: string,
  userSubtype?: string,
): Promise<AccountView> {
  return apiFetch<AccountView>(`/admin/accounts/${id}/role`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(userSubtype === undefined ? { roleCode } : { roleCode, userSubtype }),
  });
}

/** PATCH /admin/accounts/:id/status（停用/恢復，SysAdmin）。 */
export function setAccountStatus(
  id: string,
  status: 'active' | 'disabled',
): Promise<AccountView> {
  return apiFetch<AccountView>(`/admin/accounts/${id}/status`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

// ===== E03 循環 DAG（F007/F008） =====

/** GET /admin/lifecycles（循環管理 read：SysAdmin/ICSOPAdmin/Supervisor）。 */
export function getLifecycles(): Promise<LifecycleView[]> {
  return apiFetch<LifecycleView[]>('/admin/lifecycles');
}

/**
 * POST /admin/lifecycles（建立，ICSOPAdmin；LIFECYCLE_NAME_REQUIRED）。
 * F040：`subcategory` 為非必填，呼叫端 trim 後空值一律送 `null`（不得送空字串，INV-3）；
 * 唯一性違反回 409 LIFECYCLE_DUPLICATE／LIFECYCLE_SUBCATEGORY_CONFLICT。
 */
export function createLifecycle(body: {
  name: string;
  subcategory?: string | null;
  description?: string | null;
}): Promise<LifecycleView> {
  return apiFetch<LifecycleView>('/admin/lifecycles', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/**
 * PATCH /admin/lifecycles/:id（改名稱/子分類/說明）。
 * F040 三態：未帶 `subcategory` 鍵＝不修改；`null`＝清空；字串＝設定（呼叫端 trim 後空值送 `null`）。
 */
export function updateLifecycle(
  id: string,
  body: { name?: string; subcategory?: string | null; description?: string | null },
): Promise<LifecycleView> {
  return apiFetch<LifecycleView>(`/admin/lifecycles/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** PATCH /admin/lifecycles/:id/status（啟用/停用）。 */
export function setLifecycleStatus(
  id: string,
  status: 'active' | 'inactive',
): Promise<LifecycleView> {
  return apiFetch<LifecycleView>(`/admin/lifecycles/${id}/status`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

/** DELETE /admin/lifecycles/:id（刪除；仍有掛載 → 409 LIFECYCLE_HAS_DOCUMENTS）。 */
export function deleteLifecycle(id: string): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${id}`, { method: 'DELETE' });
}

// ===== DAG 節點/邊（F008） =====

export function getDagGraph(lifecycleId: string): Promise<DagGraph> {
  return apiFetch<DagGraph>(`/admin/lifecycles/${lifecycleId}/graph`);
}
export function addDagNode(
  lifecycleId: string,
  body: { name?: string | null; positionX?: number; positionY?: number },
): Promise<DagNode> {
  return apiFetch<DagNode>(`/admin/lifecycles/${lifecycleId}/nodes`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
export function updateDagNode(
  lifecycleId: string,
  nodeId: string,
  body: { name?: string | null; positionX?: number; positionY?: number },
): Promise<DagNode> {
  return apiFetch<DagNode>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}
export function deleteDagNode(lifecycleId: string, nodeId: string): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}`, {
    method: 'DELETE',
  });
}
/** 新增邊；409 DAG_SELF_LOOP / DAG_CYCLE_DETECTED。 */
export function addDagEdge(
  lifecycleId: string,
  source: string,
  target: string,
): Promise<DagEdge> {
  return apiFetch<DagEdge>(`/admin/lifecycles/${lifecycleId}/edges`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ source, target }),
  });
}
export function deleteDagEdge(lifecycleId: string, edgeId: string): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${lifecycleId}/edges/${edgeId}`, {
    method: 'DELETE',
  });
}

// ===== F036 循環樹狀圖預覽（唯讀＋浮水印） =====

/**
 * GET /admin/lifecycles/:id/tree-preview（唯讀圖資＋伺服器端浮水印快照；記錄 LIFECYCLE_VIEW 稽核）。
 * 循環管理 read：SysAdmin/ICSOPAdmin/Supervisor；DeptContact/User → 403 PERMISSION_DENIED。
 */
export function getLifecycleTreePreview(
  lifecycleId: string,
): Promise<import('./types').LifecycleTreePreview> {
  return apiFetch(`/admin/lifecycles/${lifecycleId}/tree-preview`);
}

/** 下載 URL（樹狀圖 PDF，內容層已燒錄浮水印；記錄 LIFECYCLE_DOWNLOAD）。 */
export function lifecycleTreeDownloadUrl(lifecycleId: string): string {
  return `/admin/lifecycles/${lifecycleId}/tree-preview/download`;
}

/** 列印用 URL（樹狀圖 PDF，內容層已燒錄浮水印；記錄 LIFECYCLE_PRINT）。 */
export function lifecycleTreePrintUrl(lifecycleId: string): string {
  return `/admin/lifecycles/${lifecycleId}/tree-preview/print`;
}

/**
 * F036 樹狀圖下載／列印（2026-08-26：由 `<a href>` 改為代理串流，理由同 `downloadDocumentFront`）。
 * `<a href>` 之 top-level navigation 在 session 逾時時會把後端 401 JSON 當網頁畫出來。
 */
export function downloadLifecycleTree(lifecycleId: string, fallbackName: string): Promise<void> {
  return downloadViaBlob(lifecycleTreeDownloadUrl(lifecycleId), fallbackName);
}

/** F036 樹狀圖列印：新分頁開啟已燒錄之 PDF（`win` 須由呼叫端同步開好，見 `openPdfViaBlob`）。 */
export function printLifecycleTree(lifecycleId: string, win: Window | null): Promise<void> {
  return openPdfViaBlob(lifecycleTreePrintUrl(lifecycleId), win);
}

/**
 * F036 節點雙擊之唯讀文件清單（GET .../nodes/:nodeId/documents）。
 * 閘門為「循環管理 read」（含 Supervisor）；lazy per-node，不隨預覽頁一併預載。
 * 刻意不重用 F009 之 `.../drawer`——後者會連寫入路徑之 `candidates` 一起吐出。
 */
export function getLifecycleNodeDocuments(
  lifecycleId: string,
  nodeId: string,
): Promise<import('./types').NodeMountedDocument[]> {
  return apiFetch(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}/documents`);
}

/**
 * F036 `AC-T25` ④（2026-08-21 delta）：節點雙擊之**子樹**唯讀文件清單
 * （GET .../nodes/:nodeId/subtree-documents）——該節點及其全部下游節點所掛載之程序書。
 * 閘門同單節點端點（「循環管理 read」，含 Supervisor）；分組／排序／去重皆由後端完成。
 * 🔒 既有單節點 `.../documents` 端點本輪保留不刪（見 OQ-T3-07），但抽屜自 2026-08-21 起改走本端點。
 */
export function getLifecycleNodeSubtreeDocuments(
  lifecycleId: string,
  nodeId: string,
): Promise<import('./types').SubtreeDocumentsResponse> {
  return apiFetch(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}/subtree-documents`);
}

// ===== E04 ICSOP 文件（F010/F012/F017） =====

/**
 * GET /admin/documents（ICSOP文件管理 read）。F017 起後端回傳分頁物件
 * `{items,total,page,pageSize,hasNext}`；清單頁讀 items＋分頁，建立頁之唯一性即時檢查讀 items。
 */
export function getDocuments(f: DocumentFilters = {}): Promise<DocumentListPage> {
  const qs = new URLSearchParams();
  if (f.lifecycleId) qs.set('lifecycleId', f.lifecycleId);
  if (f.status) qs.set('status', f.status);
  if (f.keyword) qs.set('keyword', f.keyword);
  if (f.documentNumber) qs.set('documentNumber', f.documentNumber);
  if (f.documentName) qs.set('documentName', f.documentName);
  if (f.companyCode) qs.set('companyCode', f.companyCode);
  if (f.draftingDeptId) qs.set('draftingDeptId', f.draftingDeptId);
  if (f.draftingSectionId) qs.set('draftingSectionId', f.draftingSectionId);
  if (f.primaryChiefId) qs.set('primaryChiefId', f.primaryChiefId);
  if (f.linkTargetId) qs.set('linkTargetId', f.linkTargetId);
  // 🔴 F017 `AC-D2` 第 10／11 列／`AC-D6`：附錄／使用表單篩選。
  // 📝 這兩行自 2026-08-16 立條起就漏了——`DocumentFilters` 宣告了 17 個 key，此處只組進 15 個，
  //    使用者選了附錄卻沒有任何參數送出 ⇒ 後端回完整清單 ⇒ 前端拿「全部 id」當交集集合 ⇒
  //    **篩選看起來有套用但一筆都沒縮小、靜默無錯誤**。既有元件測試 mock 掉整個 endpoints 模組，
  //    只驗到「有呼叫 getDocuments({appendixId})」，驗不到本函式是否真的把它組進 URL。
  if (f.appendixId) qs.set('appendixId', f.appendixId);
  if (f.formId) qs.set('formId', f.formId);
  // F017 AC-T43：兩參數原樣帶上（子樹展開由後端負責；殘缺者後端靜默 no-op）。
  if (f.nodeSubtreeId) qs.set('nodeSubtreeId', f.nodeSubtreeId);
  if (f.sortBy) qs.set('sortBy', f.sortBy);
  if (f.sortDir) qs.set('sortDir', f.sortDir);
  if (f.page) qs.set('page', String(f.page));
  if (f.pageSize) qs.set('pageSize', String(f.pageSize));
  const q = qs.toString();
  return apiFetch<DocumentListPage>(`/admin/documents${q ? `?${q}` : ''}`);
}

/** POST /admin/documents（建立，ICSOPAdmin；DOCUMENT_REQUIRED_FIELD_MISSING/NUMBER_DUPLICATE）。回傳含 id 之單筆檢視。 */
export function createDocument(body: Record<string, unknown>): Promise<DocumentView> {
  return apiFetch<DocumentView>('/admin/documents', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** GET /admin/documents/:id（單筆文件，F011 編輯對照/F016 檢視；查無→404 DOCUMENT_NOT_FOUND）。 */
export function getDocument(id: string): Promise<DocumentView> {
  return apiFetch<DocumentView>(`/admin/documents/${id}`);
}

/**
 * PATCH /admin/documents/:id（F011 編輯：以新值覆蓋，UUID 不變、不留歷史）。
 * links[]（F015）隨此 PATCH 整批送出；回傳覆寫後之文件＋新舊值對照。
 */
export function updateDocument(
  id: string,
  body: Record<string, unknown>,
): Promise<DocumentUpdateResult> {
  return apiFetch<DocumentUpdateResult>(`/admin/documents/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** GET /admin/documents/:id/links（F015 連結點清單，附目標編號/書名/狀態）。 */
export function getDocumentLinks(id: string): Promise<DocumentLinkView[]> {
  return apiFetch<DocumentLinkView[]>(`/admin/documents/${id}/links`);
}

/** PATCH /admin/documents/:id/status（切換狀態，ICSOPAdmin；切回有效重驗編號唯一性）。 */
export function setDocumentStatus(id: string, status: DocumentStatus): Promise<void> {
  return apiFetch<void>(`/admin/documents/${id}/status`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

// ===== E04/E05 附件與使用表單（F016/F018） =====

/** multipart 上傳單一檔案（欄位名 file），回傳型別 T。 */
function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  // 不設 Content-Type，交瀏覽器帶 multipart boundary。
  return apiFetch<T>(path, { method: 'POST', body: form });
}

/** POST /admin/documents/:documentId/attachments/icsop-pdf（F016 ICSOP PDF 覆蓋式上傳）。 */
export function uploadIcsopPdf(
  documentId: string,
  file: File,
): Promise<DocumentAttachmentRecord> {
  return uploadFile<DocumentAttachmentRecord>(
    `/admin/documents/${documentId}/attachments/icsop-pdf`,
    file,
  );
}

/**
 * 📝 **`uploadOjtAttachment`（`POST /admin/documents/:id/attachments/ojt`）已於 2026-08-28 移除**
 * ——F042 `AC-J2`：後端該路由已整條移除、現回 404；留著即為**死鏈**（呼叫端在 UI 上看得到
 * 一個按鈕，按下去必定失敗）。OJT 之登記入口為 `addOjtSession()`（見 §E11 區）。
 */

/**
 * GET /admin/documents/:documentId/attachments（F016 附件清單，ICSOP文件管理 read）。
 * 🔴 F042 `AC-J1`：型別已收斂為僅 `ICSOP_PDF`（OJT 不再是附件）。缺者不列；
 * 查無文件→404 DOCUMENT_NOT_FOUND。
 */
export function getDocumentAttachments(
  documentId: string,
): Promise<DocumentAttachmentRecord[]> {
  return apiFetch<DocumentAttachmentRecord[]>(
    `/admin/documents/${documentId}/attachments`,
  );
}

/**
 * GET /documents/attachments/download?blobPath=（F016 後台受控下載；RAW、不燒錄、不寫稽核）。
 * 失效/非現存參照 → FILE_ACCESS_DENIED。
 *
 * 🔴 **2026-08-17：由 `{ url }` SAS ＋ `window.open` 改為代理串流 ＋ `downloadViaBlob`**
 * （F020 `AC-D3a` 後台側修訂）。原作法導覽至 `*.blob.core.windows.net`，Chrome Safe Browsing
 * 對該網域出示「偵測到危險網站」紅底攔截頁——使用者根本下載不到檔案。
 * 順帶修好檔名：SAS 直連時瀏覽器只看得到 blobPath 末段，而該段是 `randomUUID()`。
 * 🔴 不得改回 `window.open`／`<a href>`：top-level navigation 送 `Accept: text/html` 會撞
 * SPA fallback，使用者拿到副檔名 `.pdf` 而內容是 app shell 的檔案（§10.1）。
 *
 * `fallbackName` 僅在回應無 `Content-Disposition` 時採用（後端一律帶，故實務上不會用到）。
 */
export function downloadAttachment(blobPath: string, fallbackName: string): Promise<void> {
  return downloadViaBlob(
    `/documents/attachments/download?blobPath=${encodeURIComponent(blobPath)}`,
    fallbackName,
  );
}

/** GET /admin/usage-forms（F018 表單池清單，USAGE_FORM_MANAGEMENT read）。 */
export function getUsageFormPool(): Promise<UsageFormRecord[]> {
  return apiFetch<UsageFormRecord[]>('/admin/usage-forms');
}

/** GET /documents/:documentId/usage-forms（某文件之關聯表單，前後台共用 READ）。 */
export function getDocumentForms(documentId: string): Promise<UsageFormRecord[]> {
  return apiFetch<UsageFormRecord[]>(`/documents/${documentId}/usage-forms`);
}

/** POST /admin/documents/:documentId/usage-forms（F018 建立/編輯時多選關聯表單）。 */
export function linkUsageForms(documentId: string, formIds: string[]): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/usage-forms`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ formIds }),
  });
}

/** DELETE /admin/documents/:documentId/usage-forms/:formId（解除單一表單關聯）。 */
export function unlinkUsageForm(documentId: string, formId: string): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/usage-forms/${formId}`, {
    method: 'DELETE',
  });
}

/**
 * GET /documents/:documentId/usage-forms/:formId/download（F018 `AC-D22` **後台側**）：
 * RAW（不燒錄）、**不寫稽核**。呼叫端＝後台唯讀詳情頁。
 * 前台請改用 `downloadUsageFormFront`（`/public/...`，同為代理串流但**會燒錄＋寫稽核**）。
 *
 * 🔴 2026-08-17：由 `{ url }` SAS 改為代理串流（理由見 `downloadAttachment`）。
 * ⚠ 兩者傳輸模式已相同，但**仍是兩支不同的函式打兩條不同的 route**——差別在燒錄與稽核，
 * 那兩項不可共用；合併會讓後台取得燒錄後位元組而違反 F020 `AC-D4`。
 */
export function downloadUsageForm(
  documentId: string,
  formId: string,
  fallbackName: string,
): Promise<void> {
  return downloadViaBlob(
    `/documents/${documentId}/usage-forms/${formId}/download`,
    fallbackName,
  );
}

/**
 * F018 `AC-D11`～`AC-D14`：**前台**使用表單下載——代理串流（PDF 已燒錄浮水印、非 PDF 為原檔）。
 * 🔴 以 `downloadViaBlob` 觸發，不得 `window.open`／`<a href>`（會送 `Accept: text/html` 撞 SPA fallback）。
 * 🔴 `AC-D22`：路徑為 `/public/...` 之**前台專屬端點**——與後台之 `/documents/...`（回 `{ url }` SAS、
 * RAW、不寫稽核）分流。兩端期待相反，共用一條 route 時前台會存到 JSON 壞檔、後台 `grant.url` 為
 * `undefined`（實測皆壞）；且後台若取得燒錄後位元組即違反 F020 `AC-D4`。
 */
export function downloadUsageFormFront(
  documentId: string,
  formId: string,
  fallbackName: string,
): Promise<void> {
  return downloadViaBlob(
    `/public/documents/${documentId}/usage-forms/${formId}/download`,
    fallbackName,
  );
}

// ===== F009 節點抽屜（文件掛載） =====

/** GET 節點抽屜資料（節點名＋已掛載＋候選文件，候選過濾為當前循環）。 */
export function getNodeDrawer(lifecycleId: string, nodeId: string): Promise<NodeDrawerData> {
  return apiFetch<NodeDrawerData>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}/drawer`);
}

/** 掛載文件至節點；confirm=true 允許自他節點改派（否則 409 NODE_DOC_ALREADY_ASSIGNED）。 */
export function mountNodeDoc(
  lifecycleId: string,
  nodeId: string,
  documentId: string,
  confirm = false,
): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}/documents`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ documentId, confirm }),
  });
}

/** 移除節點之文件掛載。 */
export function unmountNodeDoc(lifecycleId: string, nodeId: string, docId: string): Promise<void> {
  return apiFetch<void>(`/admin/lifecycles/${lifecycleId}/nodes/${nodeId}/documents/${docId}`, {
    method: 'DELETE',
  });
}

// ===== E07 文件調閱歷程查詢（F024） =====

function accessHistoryQuery(f: AccessHistoryFilters): string {
  const qs = new URLSearchParams();
  if (f.kind) qs.set('kind', f.kind);
  if (f.person) qs.set('person', f.person);
  if (f.target) qs.set('target', f.target);
  if (f.from) qs.set('from', f.from);
  if (f.to) qs.set('to', f.to);
  if (f.page) qs.set('page', String(f.page));
  const q = qs.toString();
  return q ? `?${q}` : '';
}

/** GET /admin/access-history（文件調閱歷程查詢 read：SysAdmin/ICSOPAdmin）。 */
export function getAccessHistory(f: AccessHistoryFilters = {}): Promise<AccessHistoryPage> {
  return apiFetch<AccessHistoryPage>(`/admin/access-history${accessHistoryQuery(f)}`);
}

/**
 * GET /admin/access-history/export（匯出 CSV，遵循當前查詢條件與角色範圍；F024 `AC-F3`）。
 *
 * 🔴 以 `downloadViaBlob` 觸發，**不得**用 `window.open`／`<a href>`／`apiFetch`：
 * top-level navigation 會送 `Accept: text/html` 而撞 SPA fallback，使用者會拿到一份副檔名
 * `.csv`、內容卻是 app shell 的檔案——沒有錯誤、沒有任何測試會抓到（2026-07-25 瀏覽器煙霧測試
 * 已踩過同型 bug；architecture-spec §10.1 明文禁令）。
 *
 * 回傳 `Promise<void>`：檔名以回應之 `Content-Disposition` 為準，第二引數僅為解析失敗時之 fallback。
 * 查詢字串與 `getAccessHistory()` 共用 `accessHistoryQuery()`（`AC-F7` ④：不得各寫一份）。
 */
export function exportAccessHistory(f: AccessHistoryFilters = {}): Promise<void> {
  return downloadViaBlob(
    `/admin/access-history/export${accessHistoryQuery(f)}`,
    'access_history.csv',
  );
}

// ===== E07 文件變更歷程（F037 程序書 / F038 循環樹狀圖） =====

import type {
  DocumentChangeView,
  DocumentChangeFilters,
  LifecycleChangeView,
  LifecycleChangeFilters,
} from './types';

/**
 * F037 查詢與匯出**共用同一份 query 組裝**（architecture-spec §10.4「三處端點」）——
 * 兩份參數解析漂移時，使用者會匯出到一份與畫面不同的結果而毫無徵兆。
 */
function documentChangeQuery(f: DocumentChangeFilters): string {
  const qs = new URLSearchParams();
  if (f.doc) qs.set('doc', f.doc);
  if (f.field) qs.set('field', f.field);
  if (f.person) qs.set('person', f.person);
  if (f.from) qs.set('from', f.from);
  if (f.to) qs.set('to', f.to);
  const q = qs.toString();
  return q ? `?${q}` : '';
}

/** GET /admin/change-history/documents（F037 程序書變更清單；文件變更歷程 read）。 */
export function getDocumentChanges(
  f: DocumentChangeFilters = {},
): Promise<{ items: DocumentChangeView[]; total: number }> {
  return apiFetch(`/admin/change-history/documents${documentChangeQuery(f)}`);
}

/**
 * GET /admin/change-history/documents/export（F037 匯出 CSV）。
 * 🔴 以 `downloadViaBlob` 觸發——`window.open`／`<a href>` 會送 `Accept: text/html` 而撞 SPA
 * fallback，使用者拿到一份副檔名為 `.csv` 但內容是 app shell 的檔案（§10.1）。
 */
export function exportDocumentChanges(f: DocumentChangeFilters = {}): Promise<void> {
  return downloadViaBlob(
    `/admin/change-history/documents/export${documentChangeQuery(f)}`,
    'document_change_history.csv',
  );
}

/** GET /admin/change-history/documents/:documentId（F037 展開某文件 before/after ＋記 CHANGE_LOG_VIEW 稽核）。 */
export function viewDocumentChanges(
  documentId: string,
): Promise<{ items: DocumentChangeView[] }> {
  return apiFetch(`/admin/change-history/documents/${encodeURIComponent(documentId)}`);
}

/** F038 查詢與匯出共用之 query 組裝（理由同 `documentChangeQuery`）。 */
function lifecycleChangeQuery(f: LifecycleChangeFilters): string {
  const qs = new URLSearchParams();
  if (f.lifecycleId) qs.set('lifecycleId', f.lifecycleId);
  if (f.changeType) qs.set('changeType', f.changeType);
  if (f.person) qs.set('person', f.person);
  if (f.from) qs.set('from', f.from);
  const q = qs.toString();
  return q ? `?${q}` : '';
}

/** GET /admin/change-history/lifecycles（F038 循環結構變更清單；read）。 */
export function getLifecycleChanges(
  f: LifecycleChangeFilters = {},
): Promise<{ items: LifecycleChangeView[]; total: number }> {
  return apiFetch(`/admin/change-history/lifecycles${lifecycleChangeQuery(f)}`);
}

/** GET /admin/change-history/lifecycles/export（F038 匯出 CSV；觸發方式同上）。 */
export function exportLifecycleChanges(f: LifecycleChangeFilters = {}): Promise<void> {
  return downloadViaBlob(
    `/admin/change-history/lifecycles/export${lifecycleChangeQuery(f)}`,
    'lifecycle_change_history.csv',
  );
}

/** GET /admin/change-history/lifecycles/:lifecycleId（F038 某循環結構變更 ＋記 LIFECYCLE_CHANGELOG_VIEW 稽核）。 */
export function viewLifecycleChanges(
  lifecycleId: string,
  name?: string,
): Promise<{ items: LifecycleChangeView[] }> {
  const q = name ? `?name=${encodeURIComponent(name)}` : '';
  return apiFetch(`/admin/change-history/lifecycles/${encodeURIComponent(lifecycleId)}${q}`);
}

/**
 * GET .../lifecycles/:lifecycleId/changes/:changeLogId/tree-diff（F038 單筆事件之新舊結構 + diff + 浮水印）。
 * 本端點純資料、不記稽核（VIEW 稽核仍由 viewLifecycleChanges 記錄）；404 LIFECYCLE_CHANGE_LOG_NOT_FOUND。
 */
export function getLifecycleTreeDiff(
  lifecycleId: string,
  changeLogId: string,
): Promise<import('./types').LifecycleTreeDiff> {
  return apiFetch(
    `/admin/change-history/lifecycles/${encodeURIComponent(lifecycleId)}/changes/${encodeURIComponent(changeLogId)}/tree-diff`,
  );
}

/** 下載 URL（雙頁新舊對照 PDF，內容層已燒錄浮水印；記錄 LIFECYCLE_CHANGELOG_DOWNLOAD）。 */
export function lifecycleTreeDiffDownloadUrl(lifecycleId: string, changeLogId: string): string {
  return `/admin/change-history/lifecycles/${encodeURIComponent(lifecycleId)}/changes/${encodeURIComponent(changeLogId)}/tree-diff/download`;
}

/**
 * F038 新舊對照 PDF 下載（2026-08-26：由 `<a href>` 改為代理串流，理由同 `downloadDocumentFront`）。
 * 清單列與預覽模態兩處入口共用本函式——不得只改其一。
 */
export function downloadLifecycleTreeDiff(
  lifecycleId: string,
  changeLogId: string,
  fallbackName: string,
): Promise<void> {
  return downloadViaBlob(lifecycleTreeDiffDownloadUrl(lifecycleId, changeLogId), fallbackName);
}

// ===== E06 前台瀏覽（F019） =====

/**
 * GET /public/documents（前台清單，全 5 角色 READ；排序/篩選/分頁皆後端權威）。
 * 401 → 未登入（SPA 全域 gating 導回登入）。
 */
export function getPublicDocuments(f: PublicListFilters = {}): Promise<PublicListPage> {
  const qs = new URLSearchParams();
  if (f.keyword) qs.set('keyword', f.keyword);
  // 🔴 2026-08-16 delta（架構 A9 §10.9 之三處第 3 處）：`deptCode` 已不再送出。
  if (f.companyCode) qs.set('companyCode', f.companyCode);
  if (f.draftingDeptId) qs.set('draftingDeptId', f.draftingDeptId);
  if (f.draftingSectionId) qs.set('draftingSectionId', f.draftingSectionId);
  if (f.chiefId) qs.set('chiefId', f.chiefId);
  if (f.lifecycleId) qs.set('lifecycleId', f.lifecycleId);
  if (f.status) qs.set('status', f.status);
  if (f.page) qs.set('page', String(f.page));
  if (f.pageSize) qs.set('pageSize', String(f.pageSize));
  const q = qs.toString();
  return apiFetch<PublicListPage>(`/public/documents${q ? `?${q}` : ''}`);
}

/**
 * GET /public/documents/filter-options（F019 `AC-D5`）：**單一端點**一次回傳五組選項。
 * 🔴 不接受任何 filters——選項為全域 distinct（不隨已套用篩選收斂），其唯一收斂維度是
 * 後端之可見性過濾（與清單物理共用同一 `visibleCandidates()`）。
 */
export function getPublicFilterOptions(): Promise<import('./types').PublicFilterOptions> {
  return apiFetch('/public/documents/filter-options');
}

/**
 * GET /public/documents/:id（G-PUB-020 前台文件詳情，全 5 角色 READ）。
 * 非「已公告」文件 → 404 DOCUMENT_NOT_FOUND（視同不存在）；未登入 → 401。
 */
export function getPublicDocumentDetail(
  id: string,
): Promise<import('./types').PublicDocumentDetail> {
  return apiFetch(`/public/documents/${encodeURIComponent(id)}`);
}

/**
 * GET /org-units（組織單位清單，全 5 角色 READ；供前台部門篩選下拉之 5 層樹來源）。
 *
 * 🔴 B 階段（多公司）：新增選填 `companyCode`。
 *  - **省略** → 後端取**登入者自己的公司**（`req.sessionUser.companyCode`）。舊版後端此處為
 *    常數 `'AS'`，多公司後會使非 AS 使用者靜默取到別家組織樹。
 *  - **指定** → 取該公司之組織。建立文件時若允許替其他公司建，須明確帶入所選公司，
 *    否則部門下拉會列出登入者自己公司的部門（與所選制定公司不符）。
 */
export function getOrgUnits(companyCode?: string): Promise<OrgUnitRecord[]> {
  const q = companyCode ? `?companyCode=${encodeURIComponent(companyCode)}` : '';
  return apiFetch<OrgUnitRecord[]>(`/org-units${q}`);
}

/**
 * GET /persons/search（當責室長候選，全 5 角色 READ；僅回在職者）。
 * F014：當責室長-主要/次要之可搜尋來源。空關鍵字＝回預設候選（後端限制筆數）。
 */
export function searchPersons(q: string, limit = 20): Promise<PersonRecord[]> {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set('q', q.trim());
  qs.set('limit', String(limit));
  return apiFetch<PersonRecord[]>(`/persons/search?${qs.toString()}`);
}

// ===== E06 文件浮水印檢視器（F020） =====

/**
 * GET /public/documents/:id/view（檢視器疊加用浮水印字串；記錄 VIEW 稽核）。
 * G-PUB-032：另回開啟中文件之 documentNumber/documentName（供檢視器標題列）。
 */
export function getDocumentWatermark(
  documentId: string,
): Promise<{ watermark: string; documentNumber?: string | null; documentName?: string | null }> {
  return apiFetch(`/public/documents/${documentId}/view`);
}

/** 原始 PDF 代理串流 URL（檢視器 <iframe> 預覽；後端代理，不核發 SAS）。 */
export function documentPdfUrl(documentId: string): string {
  return `/public/documents/${documentId}/pdf`;
}

/** 下載 URL（內容層已燒錄浮水印）。 */
export function documentDownloadUrl(documentId: string): string {
  return `/public/documents/${documentId}/download`;
}

/** 列印用 URL（內容層已燒錄浮水印）。 */
export function documentPrintUrl(documentId: string): string {
  return `/public/documents/${documentId}/print`;
}

/**
 * F020 前台**主文件下載**（內容層已燒錄浮水印，後端記 DOWNLOAD 稽核）。
 *
 * 🔴 2026-08-26：由 `<a href={documentDownloadUrl(id)}>` 改為 `downloadViaBlob`。原作法是
 * top-level navigation——session 逾時（401）時瀏覽器把後端 JSON 錯誤**當網頁畫出來**，使用者
 * 眼前是一整頁 `{"message":"AUTH_SESSION_EXPIRED",...}`（真人回報）。同一禁令早已寫在本檔其他
 * 下載函式與 architecture-spec §10.1，唯獨前台詳情／檢視器這兩處主動作漏改。
 */
export function downloadDocumentFront(documentId: string, fallbackName: string): Promise<void> {
  return downloadViaBlob(documentDownloadUrl(documentId), fallbackName);
}

/**
 * F020 前台**列印**（內容層已燒錄浮水印，後端記 PRINT 稽核）：於新分頁開啟已燒錄之 PDF。
 *
 * `win` 須由呼叫端在 click handler 內**同步**以 `window.open('', '_blank')` 取得後傳入——理由與
 * 失敗處置見 `openPdfViaBlob`。傳 `null`（分頁被封鎖）時擲 `POPUP_BLOCKED`，由呼叫端提示。
 */
export function printDocumentFront(documentId: string, win: Window | null): Promise<void> {
  return openPdfViaBlob(documentPrintUrl(documentId), win);
}

// ===== E05 F018 使用表單管理（表單池） =====

/**
 * GET /admin/usage-forms/overview（表單池總覽，read：SysAdmin 唯讀+ICSOPAdmin CRUD）。
 * 每筆附關聯文件數（docCount）與關聯文件精簡清單（documents），供清單欄與展開檢視。
 */
export function getUsageFormOverview(): Promise<import('./types').UsageFormPoolItem[]> {
  return apiFetch('/admin/usage-forms/overview');
}

/**
 * POST /admin/usage-forms（multipart 上傳，欄位名 `files`；單/多檔皆可）。
 * 格式 FILE_FORMAT_NOT_ALLOWED（僅 xlsx/xls/pdf）、大小 FILE_SIZE_EXCEEDED（50MB）、
 * 名稱長度 USAGE_FORM_NAME_TOO_LONG（400 字元）由後端裁決。
 * `name`＝自訂表單名稱（選填，trim 後送出）：**僅單檔路徑**附加——批次上傳無逐檔命名之 UI
 * （prototype 19 之 fileInput 無 multiple），各檔由後端沿用各自檔名。
 * ⚠ FormData 不可設 Content-Type（瀏覽器需自帶 multipart boundary）。
 */
export function uploadUsageForms(
  files: File[],
  name?: string,
  formNumber?: string | null,
  draftingDeptCodes?: string[],
): Promise<unknown> {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const trimmed = (name ?? '').trim();
  if (files.length === 1 && trimmed !== '') fd.append('name', trimmed);
  const number = (formNumber ?? '').trim();
  if (files.length === 1 && number !== '') fd.append('formNumber', number);
  // F018 `AC-N43`／architecture-spec §11.10(b)：additive 純文字欄位，值為 JSON 陣列字串。
  // 0 筆時**不送出該欄**——後端以「未帶鍵 ≠ 帶空陣列」區分「不動」與「顯式清空」，
  // 建立路徑本就無既有值可清，送空陣列只會多要求 store 支援 replace-set。
  const depts = (draftingDeptCodes ?? []).map((c) => c.trim()).filter((c) => c !== '');
  if (files.length === 1 && depts.length > 0) {
    fd.append('draftingDeptCodes', JSON.stringify(Array.from(new Set(depts))));
  }
  return apiFetch('/admin/usage-forms', { method: 'POST', body: fd });
}

/**
 * PATCH /admin/usage-forms/:formId（F018 編輯頁 metadata，architecture-spec §11.10(b)）。
 *
 * 📝 **被取代之路徑逐字保留供追溯**：OLD> `PATCH /admin/usage-forms/:formId/number`
 * （函式名 OLD> `updateUsageFormNumber(formId, formNumber)`）。`AC-N41`／`AC-N48` 將「編輯編號」
 * modal 整頁化為 `/admin/usage-forms/:formId/edit`，其範圍已擴為「表單編號 ＋ 制定部門」兩項
 * metadata，後端隨之移除 `/number` 尾段（`usage-forms.controller.ts` 之 `@Patch`）。
 *
 * body 只有 `formNumber`／`draftingDeptCodes` 兩鍵——不碰檔案、不碰關聯、不觸發覆蓋共用警示
 * （`AC-N49` 副作用邊界）。**未帶鍵＝不動該項；帶鍵但為 `null`／`[]`＝顯式清空**，故呼叫端
 * 須自行決定要送哪幾鍵。清空編號傳 `null`（空字串不得落地）。
 * 409 USAGE_FORM_NUMBER_DUPLICATE／400 USAGE_FORM_NUMBER_TOO_LONG。
 *
 * 📌 後端雖回 200 ＋更新後之該列，本函式**刻意宣告為 `Promise<void>`**：唯一呼叫端
 * （編輯頁）儲存成功後即導回清單頁並重查，不需要該值；宣告它會讓呼叫端誤以為可以就地
 * 拿它更新畫面，而該值之形狀（`UsageFormRecord`，不含 `docCount`／`documents`）與清單列
 * （`UsageFormPoolItem`）並不相同。
 */
export function updateUsageForm(
  formId: string,
  patch: { formNumber?: string | null; draftingDeptCodes?: string[] },
): Promise<void> {
  return apiFetch(`/admin/usage-forms/${formId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

/**
 * PUT /admin/usage-forms/:formId（覆蓋上傳單檔，欄位名 `file`）。
 * 被 ≥2 份文件引用且未確認 → 409 USAGE_FORM_OVERWRITE_SHARED；confirmed=true 放行。
 */
export function overwriteUsageForm(
  formId: string,
  file: File,
  confirmed = false,
): Promise<unknown> {
  const fd = new FormData();
  fd.append('file', file);
  const q = confirmed ? '?confirmed=true' : '';
  return apiFetch(`/admin/usage-forms/${formId}${q}`, {
    method: 'PUT',
    body: fd,
  });
}

/**
 * DELETE /admin/usage-forms/:formId（自表單池移除）。
 * 被 ≥1 份文件引用且未確認 → 409 USAGE_FORM_IN_USE；confirmed=true → 解除全部關聯後刪除。
 */
export function deleteUsageForm(formId: string, confirmed = false): Promise<void> {
  const q = confirmed ? '?confirmed=true' : '';
  return apiFetch<void>(`/admin/usage-forms/${formId}${q}`, { method: 'DELETE' });
}

/**
 * GET /admin/usage-forms/:formId/download（表單池管理頁個別下載；RAW、不寫稽核）。
 * 🔴 2026-08-17：由 `{ url }` SAS 改為代理串流（理由見 `downloadAttachment`）。
 */
export function downloadPoolForm(formId: string, fallbackName: string): Promise<void> {
  return downloadViaBlob(`/admin/usage-forms/${formId}/download`, fallbackName);
}

// ===== E10 F039 附錄管理（附錄池 ＋ 文件關聯與 sortOrder） =====

/** GET /admin/appendices（附錄池清單，APPENDIX_MANAGEMENT read；供建立/編輯畫面之候選）。 */
export function getAppendixPool(): Promise<import('./types').AppendixRecord[]> {
  return apiFetch('/admin/appendices');
}

/**
 * GET /admin/appendices/overview（附錄池總覽，read：SysAdmin 唯讀＋ICSOPAdmin CRUD）。
 * 每筆附關聯文件數（docCount）與關聯文件精簡清單（documents），供清單欄與展開檢視（AC-16/17）。
 */
export function getAppendixPoolOverview(): Promise<import('./types').AppendixPoolItem[]> {
  return apiFetch('/admin/appendices/overview');
}

/**
 * GET /admin/appendices/export（F039 附錄池匯出 CSV）。
 * 帶入與清單畫面**相同**之篩選（`AC-D5`：範圍＝當前篩選之全部結果，非當前頁）。
 */
export function exportAppendixPool(
  f: { q?: string; format?: string } = {},
): Promise<void> {
  const qs = new URLSearchParams();
  if (f.q) qs.set('q', f.q);
  if (f.format) qs.set('format', f.format);
  const q = qs.toString();
  return downloadViaBlob(`/admin/appendices/export${q ? `?${q}` : ''}`, 'appendices.csv');
}

/**
 * 🔵 POST /admin/documents/export（F017 後台程序書清單匯出 CSV，`AC-X9`～`AC-X17`）。
 *
 * 🔴 **body 恰兩鍵** `{ documentIds; linkTargetId? }`，**不得夾帶任何篩選鍵**（架構決策 D1 乙案）：
 * 本頁 13 項篩選全部在瀏覽器端施加，且前後端之篩選語言不同構（前端比對顯示名稱、後端比對 id／代碼），
 * 兩項篩選後端根本沒有參數 ⇒ 帶篩選參數等於要求後端重寫一套必然漂移的篩選。故送的是**結果本身**
 * （`filtered.map(d => d.id)`，非 `pageRows`、非 `all`），後端不重跑篩選、不重跑排序。
 *
 * 🔴 採 **POST** 是因為「查詢對象集合放不進 URL」，不代表狀態變更——本端點無任何副作用
 * （不寫稽核、不寫任何資料表），其閘門仍為 `ICSOP文件管理` 之 **read**。
 * 🔴 走 `downloadViaBlob` 而非 `window.open`／`<a href>`：後者之導覽式請求會送 `Accept: text/html`
 * 而撞上 SPA fallback，使用者靜默拿到副檔名 `.csv`、內容是 app shell 的檔案。
 *
 * @param linkTargetId `連結點程序書` 篩選之命中目標（選填）。**僅供第 12 欄之欄內排序**
 *   （命中者排第一顆），不參與任何篩選判定。
 */
export function exportDocumentList(
  documentIds: string[],
  linkTargetId?: string,
): Promise<void> {
  return downloadViaBlob('/admin/documents/export', 'documents.csv', {
    method: 'POST',
    body: linkTargetId ? { documentIds, linkTargetId } : { documentIds },
  });
}

/**
 * 🔵 GET /admin/usage-forms/export（F018 表單池匯出 CSV，`AC-X6`）。
 * 帶入與清單畫面**相同**之篩選（`AC-X7`：範圍＝當前篩選之全部結果，非當前頁）。
 * 🔴 走 `downloadViaBlob` 而非 `window.open`／`<a href>`：後者之導覽式請求會送
 * `Accept: text/html` 而撞上 SPA fallback，使用者靜默拿到副檔名 `.csv`、內容是 app shell 的檔案
 * （見 `download-blob.ts` 檔頭之明文禁令）。
 */
export function exportUsageFormPool(
  f: { q?: string; format?: string } = {},
): Promise<void> {
  const qs = new URLSearchParams();
  if (f.q) qs.set('q', f.q);
  if (f.format) qs.set('format', f.format);
  const q = qs.toString();
  return downloadViaBlob(`/admin/usage-forms/export${q ? `?${q}` : ''}`, 'usage-forms.csv');
}

/**
 * POST /admin/appendices（multipart 上傳，欄位名 `files`；單/多檔皆可）。
 * 格式 FILE_FORMAT_NOT_ALLOWED（僅 xlsx/xls/pdf）、大小 FILE_SIZE_EXCEEDED（50MB）、
 * 名稱長度 APPENDIX_NAME_TOO_LONG（400 字元）由後端裁決。
 * `name`＝自訂附錄名稱（選填，trim 後送出）：**僅單檔路徑**附加——多檔不接受自訂名稱
 * （F039 Alt Flow／prototype 24 multiNameNote），各檔由後端沿用各自檔名。
 * ⚠ FormData 不可設 Content-Type（瀏覽器需自帶 multipart boundary）。
 */
export function uploadAppendix(files: File[], name?: string): Promise<unknown> {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const trimmed = (name ?? '').trim();
  if (files.length === 1 && trimmed !== '') fd.append('name', trimmed);
  return apiFetch('/admin/appendices', { method: 'POST', body: fd });
}

/**
 * PUT /admin/appendices/:appendixId（覆蓋上傳單檔，欄位名 `file`）。
 * 被 ≥2 份文件引用且未確認 → 409 APPENDIX_OVERWRITE_SHARED；confirmed=true 放行。**不改名稱**。
 */
export function overwriteAppendix(
  appendixId: string,
  file: File,
  confirmed = false,
): Promise<unknown> {
  const fd = new FormData();
  fd.append('file', file);
  const q = confirmed ? '?confirmed=true' : '';
  return apiFetch(`/admin/appendices/${appendixId}${q}`, { method: 'PUT', body: fd });
}

/**
 * DELETE /admin/appendices/:appendixId（自附錄池移除）。
 * 被 ≥1 份文件引用且未確認 → 409 APPENDIX_IN_USE；confirmed=true → 解除全部關聯後刪除。
 */
export function deleteAppendix(appendixId: string, confirmed = false): Promise<void> {
  const q = confirmed ? '?confirmed=true' : '';
  return apiFetch<void>(`/admin/appendices/${appendixId}${q}`, { method: 'DELETE' });
}

/**
 * GET /admin/appendices/:appendixId/download（後台個別下載；管理端存取，不寫稽核、不燒錄浮水印）。
 * 🔴 2026-08-17：由 `{ url }` SAS 改為代理串流（理由見 `downloadAttachment`）。
 */
export function downloadAppendixFromPool(
  appendixId: string,
  fallbackName: string,
): Promise<void> {
  return downloadViaBlob(`/admin/appendices/${appendixId}/download`, fallbackName);
}

/** GET /documents/:documentId/appendices（前後台共用；**已依 sortOrder 遞增**，前端不得再排序）。 */
export function getDocumentAppendices(
  documentId: string,
): Promise<import('./types').DocumentAppendixRecord[]> {
  return apiFetch(`/documents/${documentId}/appendices`);
}

/**
 * PUT /admin/documents/:documentId/appendices（**排序權威寫入**：整組覆寫並依陣列索引重寫
 * sortOrder 1..N）。architecture-spec §3.6 決策二：文件建立/編輯頁**唯一**接入之附錄寫入呼叫，
 * 刻意不採 F018 使用表單之 diff-based link/unlink（無法表達純重排）。
 */
export function replaceDocumentAppendices(
  documentId: string,
  appendixIds: string[],
): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/appendices`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ appendixIds }),
  });
}

/**
 * POST /admin/documents/:documentId/appendices（附加關聯，接續現有最大 sortOrder 之後）。
 * API 完整性保留；**建立/編輯 UI 刻意不呼叫**（見 replaceDocumentAppendices 之決策二說明）。
 */
export function appendDocumentAppendices(
  documentId: string,
  appendixIds: string[],
): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/appendices`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ appendixIds }),
  });
}

/** DELETE /admin/documents/:documentId/appendices/:appendixId（解除單一關聯，剩餘重編為 1..N）。 */
export function unlinkDocumentAppendix(
  documentId: string,
  appendixId: string,
): Promise<void> {
  return apiFetch<void>(`/admin/documents/${documentId}/appendices/${appendixId}`, {
    method: 'DELETE',
  });
}

/** F039 `AC-D1`／`AC-D2`：**前台**附錄下載——代理串流（觸發方式同 `downloadUsageFormFront`）。 */
export function downloadDocumentAppendixFront(
  documentId: string,
  appendixId: string,
  fallbackName: string,
): Promise<void> {
  return downloadViaBlob(`/documents/${documentId}/appendices/${appendixId}/download`, fallbackName);
}

/**
 * F020 `AC-D3`：**前台專屬**附件下載端點。
 * 🔴 路徑**不接受客戶端傳入 `blobPath`**——伺服器自 `(documentId, type)` 反查儲存位置；
 * 「前台／後台」是授權語意，不得建立在可由客戶端控制的輸入上（§10.1 之方案 B／C 已明確否決）。
 *
 * 🔴 F042 `AC-J26`（2026-08-28）：`type` 由 `'icsop-pdf' | 'ojt'` **收斂為僅 `'icsop-pdf'`**——
 * 後端之 `downloadOjt` 路由已整條移除（前台不提供 OJT 場次檔下載，簽到表為出席紀錄，
 * 與 `AC-16` 之 PII 防線同源）。留著 `'ojt'` 即為指向 404 之死鏈。
 */
export function downloadPublicAttachment(
  documentId: string,
  type: 'icsop-pdf',
  fallbackName: string,
): Promise<void> {
  return downloadViaBlob(
    `/public/documents/${documentId}/attachments/${type}/download`,
    fallbackName,
  );
}

// ===== E09 F031 文件索引管理 =====

/** GET /admin/doc-index/overview（總覽：彙總計數 + 分頁 + 狀態篩選；read）。 */
/** GAP-07-1 後台儀表板 KPI 彙總（待確認組織異動/未指派節點文件/停用帳號/調閱近7日/待公布）。 */
export function getDashboardSummary(): Promise<import('./types').DashboardSummary> {
  return apiFetch('/admin/dashboard/summary');
}

/** 後台儀表板「最近活動」（prototype 07 ACTIVITY；伺服端已依角色過濾，預設 5 列）。 */
export function getDashboardActivity(
  limit?: number,
): Promise<import('./types').DashboardActivityItem[]> {
  const qs = limit ? `?limit=${limit}` : '';
  return apiFetch(`/admin/dashboard/activity${qs}`);
}

export function getDocIndexOverview(
  f: { state?: string; page?: number } = {},
): Promise<import('./types').DocIndexOverview> {
  const qs = new URLSearchParams();
  if (f.state) qs.set('state', f.state);
  if (f.page) qs.set('page', String(f.page));
  const q = qs.toString();
  return apiFetch(`/admin/doc-index/overview${q ? `?${q}` : ''}`);
}

/** GET /admin/doc-index/:documentId（單文件索引狀態三態 + 失敗詳情；read）。 */
export function getDocIndexStatus(
  documentId: string,
): Promise<import('./types').DocIndexStatus> {
  return apiFetch(`/admin/doc-index/${encodeURIComponent(documentId)}`);
}

/** GET /admin/doc-index/:documentId/chunks（chunk 預覽 + 8 項 metadata；read）。 */
export function getDocIndexChunks(
  documentId: string,
): Promise<import('./types').DocIndexChunk[]> {
  return apiFetch(`/admin/doc-index/${encodeURIComponent(documentId)}/chunks`);
}

/** POST /admin/doc-index/:documentId/reindex（手動重新索引；write，SysAdmin→403）。 */
export function reindexDocument(
  documentId: string,
): Promise<{ accepted: true }> {
  return apiFetch(`/admin/doc-index/${encodeURIComponent(documentId)}/reindex`, {
    method: 'POST',
  });
}

// ===== E11 F042 OJT 進度管理 =====

/**
 * 🔴 **本區已無任何形狀正規化**（2026-08-28 兩側全部對齊）。
 *
 * 曾經存在過兩層 shim，都已整批移除：① 三個清單端點原本回**裸陣列**，後端已改回其
 * §架構設計端點表本即定義之 `{ items, total }`／`{ sessions }` 信封；② `summary` 之欄位命名
 * 兩環互斥，lead 已裁定**以後端現行形狀為 canonical**（`coverage.excludedInactive`／
 * `excludedOrphaned` 扁平掛在 `coverage` 下、`docCoverage.totalUnits`／`completedUnits`
 * 逐字取自 data-model §建議查詢形狀），前端環之 fixture 已由 test-generator 同步遷移。
 *
 * 🔒 **不要為了保險而把 shim 加回來**：留著「兩種都吃」會讓日後真正的形狀漂移被 shim 靜默
 * 吸收掉，而不是由測試大聲失敗——那正是本 repo 反覆踩到的「兩側全綠、線上壞掉」形狀。
 */

/**
 * GET /admin/ojt-progress/summary（TAB1 儀表板三區；`AC-14`／`AC-15`／`AC-16`）。
 *
 * 🔴 `docScope`（`OQ-E11-21`）：區一逐筆表之顯示範圍，**帶進 query 交由伺服器切片**。
 * 切換範圍 ⇒ **重新請求**，明文**不得**改為客端切換——客端切換就必須先取回全部 600 列，
 * 那正是本次節流要消滅的東西。省略時不帶 query（伺服器套用預設 `incomplete`）。
 */
export function getOjtProgressSummary(docScope?: OjtDocScope): Promise<OjtProgressSummary> {
  const q = docScope ? `?docScope=${encodeURIComponent(docScope)}` : '';
  return apiFetch(`/admin/ojt-progress/summary${q}`);
}

/**
 * GET /admin/ojt-progress/rows（TAB2 進度列＋**恰兩項**篩選；`AC-11`／`AC-13`）。
 * `completionStatus` 比對「列自身」之二態（`AC-03`）；省略即「所有完成狀態」，不施加限制。
 */
export function getOjtProgressRows(
  f: OjtRowFilters = {},
): Promise<{ items: OjtProgressRow[]; total: number }> {
  const qs = new URLSearchParams();
  if (f.orgQuery) qs.set('orgQuery', f.orgQuery);
  if (f.completionStatus) qs.set('completionStatus', f.completionStatus);
  const q = qs.toString();
  return apiFetch(`/admin/ojt-progress/rows${q ? `?${q}` : ''}`);
}

/** GET /admin/ojt-progress/rows/:documentId/:orgCode/sessions（展開列之場次明細；`AC-12`）。 */
export function getOjtProgressRowSessions(
  documentId: string,
  orgCode: string,
): Promise<{ sessions: OjtSessionView[] }> {
  return apiFetch(
    `/admin/ojt-progress/rows/${encodeURIComponent(documentId)}/${encodeURIComponent(orgCode)}/sessions`,
  );
}

/**
 * POST /admin/ojt-progress/rows/:documentId/:orgCode/sessions（新增場次；`AC-02`／`AC-09`／`AC-10`）。
 * multipart 單檔，欄位名恰為 `file`——**不得**用 `files`，那會誤導為多檔上傳而與「一次登記恰對應
 * 一個簽到表檔案」直接矛盾。不設 Content-Type，交瀏覽器帶 multipart boundary。
 */
export function addOjtSession(
  documentId: string,
  orgCode: string,
  input: { trainingDate: string; file: File },
): Promise<OjtSessionView> {
  const form = new FormData();
  form.append('trainingDate', input.trainingDate);
  form.append('file', input.file);
  return apiFetch<OjtSessionView>(
    `/admin/ojt-progress/rows/${encodeURIComponent(documentId)}/${encodeURIComponent(orgCode)}/sessions`,
    { method: 'POST', body: form },
  );
}

/**
 * GET /admin/ojt-progress/sessions/:sessionId/download（簽到表下載，代理串流）。
 * 🔴 以 `downloadViaBlob` 觸發，不得用 `window.open`／`<a href>`（§10.1 明文禁令：
 * top-level navigation 之 `Accept: text/html` 會撞 SPA fallback，使用者拿到 app shell）。
 */
export function downloadOjtSession(sessionId: string, fallbackName: string): Promise<void> {
  return downloadViaBlob(
    `/admin/ojt-progress/sessions/${encodeURIComponent(sessionId)}/download`,
    fallbackName,
  );
}

/**
 * DELETE /admin/ojt-progress/sessions/:sessionId（`AC-19`，204）。
 * 本函式不做角色判斷——把關在端點層（服務層另一道 `ICSOPAdmin` 檢查）。
 */
export function deleteOjtSession(sessionId: string): Promise<void> {
  return apiFetch<void>(`/admin/ojt-progress/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

/**
 * GET /admin/ojt-progress/pending（`AC-26` 待歸位工作台；歸位完畢後自然清空）。
 * 每筆帶 `documentNumber`／`documentName`（後端 2026-08-28 補上富化），故待歸位區不再顯示裸 UUID。
 */
export function getOjtProgressPending(): Promise<{ items: OjtPendingItem[] }> {
  return apiFetch('/admin/ojt-progress/pending');
}

/**
 * POST /admin/ojt-progress/pending/:sessionId/assign（`AC-26` 歸位；僅 ICSOPAdmin，單向不可逆）。
 * 🔒 路徑刻意含 `pending/` 前綴而非通用之 `PATCH sessions/:id`——後者等於從側門把
 * `AC-20`（場次不可編輯）打開。
 */
export function assignOjtPendingSession(
  sessionId: string,
  body: { orgCode: string; trainingDate: string },
): Promise<OjtSessionView> {
  return apiFetch<OjtSessionView>(
    `/admin/ojt-progress/pending/${encodeURIComponent(sessionId)}/assign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

/**
 * GET /admin/documents/:documentId/ojt-completion（`AC-21`：文件表單／唯讀頁之 OJT 唯讀衍生區塊）。
 *
 * 🔴 與 `AC-04` 之文件層三值狀態**共用同一套規則**（後端 `OjtCompletionReader` 單一 port），
 * 不得各自實作——同一份底層事實的兩種呈現各算一次，遲早出現「清單說已全部完成、詳情頁卻列不滿」。
 */
export function getDocumentOjtCompletion(
  documentId: string,
): Promise<{ completedOrgCodes: string[]; totalUnits?: number }> {
  return apiFetch(`/admin/documents/${encodeURIComponent(documentId)}/ojt-completion`);
}

// ===== E12 業務/功能類別管理（F043；2026-09-02） =====
//
// 🔒 路徑權威＝docs/specs/architecture-spec.md §14.5 之端點表（後台 `/admin/business-categories`、
//    前台 `/public/business-categories`、變更歷程三端點與 diff／download 一律收在
//    `/admin/change-history/business-categories*` 之下——後者為 2026-09-02 lead 裁定改正之路徑家族，
//    **明文禁止**改回 `/admin/business-category-changes`／`/admin/business-categories/:id/changes`）。
// 🔒 本組函式名為前端環（`BusinessCategory*.test.tsx`）之契約；⚠ `getBusinessCategoryNodeDrawer`
//    對映之後端方法名為 `candidates`（路徑 `/nodes/:nodeId/candidates`），回應為完整抽屜載荷
//    （`{ node, mounted, candidates }`，後端 `BusinessCategoryDocsService.getDrawer()`）——
//    **函式名與 URL 段刻意不同名**，此處就地記錄，避免下一個人誤以為漏了端點。

/** GET /admin/business-categories（類別池清單；BUSINESS_CATEGORY_MANAGEMENT read）。 */
export function getBusinessCategories(): Promise<BusinessCategoryView[]> {
  return apiFetch<BusinessCategoryView[]>('/admin/business-categories');
}

/**
 * POST /admin/business-categories（建立；`AC-01`～`AC-10`）。
 * 🔴 `subcategory` **原樣送出、前端不 trim**（`AC-05`：正規化之責任在服務層）——前端若先 trim
 * 一次，服務層那條規則就再也沒有輸入可以觸發它，其測試將永遠測不到真實輸入。
 * 錯誤碼：400 `BUSINESS_CATEGORY_NAME_REQUIRED`／409 `BUSINESS_CATEGORY_DUPLICATE`／
 * 409 `BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT`（驗證順序固定，`AC-09`）。
 */
export function createBusinessCategory(
  body: BusinessCategoryPayload,
): Promise<BusinessCategoryView> {
  return apiFetch<BusinessCategoryView>('/admin/business-categories', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/** PATCH /admin/business-categories/:id（改名稱／子分類／說明；`AC-11`）。 */
export function updateBusinessCategory(
  id: string,
  body: Partial<BusinessCategoryPayload>,
): Promise<BusinessCategoryView> {
  return apiFetch<BusinessCategoryView>(`/admin/business-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

/**
 * PATCH /admin/business-categories/:id（狀態切換）。
 * 🔴 `AC-12` 之不對稱：**停用不受刪除保護限制**——仍有掛載之類別可以停用（既有節點／邊／掛載
 * 關係完全不受影響），只有「刪除」才會回 `BUSINESS_CATEGORY_HAS_DOCUMENTS`。
 * ⚠ 與 F007 不同，本功能**沒有**獨立的 `/status` 子路由（架構 §14.5 端點表：狀態由同一支 PATCH
 * 承接），故不得比照 `setLifecycleStatus` 另打 `/status`。
 */
export function setBusinessCategoryStatus(
  id: string,
  status: 'active' | 'inactive',
): Promise<BusinessCategoryView> {
  return apiFetch<BusinessCategoryView>(`/admin/business-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

/** DELETE /admin/business-categories/:id（仍有掛載 → 409 `BUSINESS_CATEGORY_HAS_DOCUMENTS`，`AC-12`）。 */
export function deleteBusinessCategory(id: string): Promise<void> {
  return apiFetch<void>(`/admin/business-categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ── §乙 DAG 節點／邊（`AC-15`～`AC-19`）──

export function getBusinessCategoryGraph(
  businessCategoryId: string,
): Promise<BusinessCategoryGraph> {
  return apiFetch<BusinessCategoryGraph>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/graph`,
  );
}

export function addBusinessCategoryNode(
  businessCategoryId: string,
  body: { name?: string | null; positionX?: number; positionY?: number },
): Promise<BusinessCategoryNode> {
  return apiFetch<BusinessCategoryNode>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/nodes`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) },
  );
}

export function updateBusinessCategoryNode(
  businessCategoryId: string,
  nodeId: string,
  body: { name?: string | null; positionX?: number; positionY?: number },
): Promise<BusinessCategoryNode> {
  return apiFetch<BusinessCategoryNode>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) },
  );
}

/** DELETE 節點：同一交易內連動刪除其邊與其全部掛載列（`AC-18`；二次確認由呼叫端負責）。 */
export function deleteBusinessCategoryNode(
  businessCategoryId: string,
  nodeId: string,
): Promise<void> {
  return apiFetch<void>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: 'DELETE' },
  );
}

/**
 * 新增邊；🔴 `AC-16` 之**專屬**錯誤碼 409 `BUSINESS_CATEGORY_SELF_LOOP`／
 * `BUSINESS_CATEGORY_CYCLE_DETECTED`——**不沿用** `DAG_*`（那兩碼之訊息稱「循環結構」，
 * 而「循環」是本系統已被 LIFECYCLE 佔用之專有名詞）。
 */
export function addBusinessCategoryEdge(
  businessCategoryId: string,
  source: string,
  target: string,
): Promise<BusinessCategoryEdge> {
  return apiFetch<BusinessCategoryEdge>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/edges`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ source, target }) },
  );
}

export function deleteBusinessCategoryEdge(
  businessCategoryId: string,
  edgeId: string,
): Promise<void> {
  return apiFetch<void>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/edges/${encodeURIComponent(edgeId)}`,
    { method: 'DELETE' },
  );
}

// ── §丙 節點掛載抽屜（`AC-20`～`AC-30`）──

/**
 * GET .../nodes/:nodeId/candidates —— 抽屜完整載荷（節點／目前掛載／候選）。
 * 🔴 `AC-20`：候選＝**全部 ICSOP 文件**，不得夾帶任何 `lifecycleId`／`lifecycleIds`／`cycle`
 * 之**系統自行推導**的過濾鍵（本功能之候選不以循環過濾）。
 *
 * 🔒 `userSelectedLifecycleId`（2026-09-03 第三個 delta）＝**使用者主動選擇**之循環別。
 * `AC-20` 禁的是「系統靜默地只給同循環文件」，使用者自己縮小範圍是另一回事——兩者必須長得
 * 不一樣，故本引數刻意**不叫** `lifecycleId`。
 * 🔴 **未選任何循環時不得帶入**（連 `undefined` 亦不傳）：初載呼叫維持「恰兩個引數」，
 * `AC-20` 之結構性斷言因此一格未鬆動。
 *
 * 🔒 `opts`（2026-09-04 第四個 delta，`ui-ux-design-overview.md` §A.11）＝候選之**伺服器端**
 * 查詢條件：`keyword`（決 C：搜尋不再只掃已載入的那一頁）與 `page`（累積式「載入更多」）。
 * 🔴 **additive 且僅於實際互動時帶入**：未搜尋、未翻頁時完全不傳第 4 引數，初載仍是兩引數、
 * 選了循環仍是三引數——`AC-20` 與丙 delta 之既有結構性斷言一格未鬆動。
 * 🔴 `page` 僅於 `>= 2` 時送出：第一頁與「未帶頁碼」在後端語意相同（`toPositiveInt(page, 1)`），
 * 不送出可讓「切換條件即回第一頁」在 query string 上表現為「回到未翻頁之原樣」。
 */
export function getBusinessCategoryNodeDrawer(
  businessCategoryId: string,
  nodeId: string,
  userSelectedLifecycleId?: string,
  opts?: { keyword?: string; page?: number },
): Promise<BusinessCategoryNodeDrawerData> {
  const qs = new URLSearchParams();
  if (userSelectedLifecycleId) qs.set('userSelectedLifecycleId', userSelectedLifecycleId);
  if (opts?.keyword) qs.set('keyword', opts.keyword);
  if (opts?.page !== undefined && opts.page > 1) qs.set('page', String(opts.page));
  const q = qs.toString();
  return apiFetch<BusinessCategoryNodeDrawerData>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/nodes/${encodeURIComponent(nodeId)}/candidates${q ? `?${q}` : ''}`,
  );
}

/**
 * POST .../nodes/:nodeId/documents（掛載一份文件）。
 * 🔴 `AC-21`～`AC-23`／`AC-30`：**恰三個引數、無 confirm 旗標**——本功能是 M:N，
 * 「已掛在別處」不是需要確認的例外而是正常狀態；F009 之 `mountNodeDoc(..., confirm)` 第四引數
 * 所服務的「改派」語意在本功能**明文不存在**，多帶一個旗標即把它偷渡回來。
 */
export function mountBusinessCategoryDoc(
  businessCategoryId: string,
  nodeId: string,
  documentId: string,
): Promise<void> {
  return apiFetch<void>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/nodes/${encodeURIComponent(nodeId)}/documents`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ documentId }) },
  );
}

/** DELETE .../documents/:documentId（`AC-25`：只影響那一筆，其餘掛載與文件本身一格不動）。 */
export function unmountBusinessCategoryDoc(
  businessCategoryId: string,
  nodeId: string,
  documentId: string,
): Promise<void> {
  return apiFetch<void>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/nodes/${encodeURIComponent(nodeId)}/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' },
  );
}

// ── §丁 後台樹狀圖預覽／下載／列印（`AC-32`～`AC-37`）──

/** GET /admin/business-categories/:id/tree（唯讀圖資＋伺服器端浮水印快照，`AC-33`）。 */
export function getBusinessCategoryTreePreview(
  businessCategoryId: string,
): Promise<BusinessCategoryTreePreview> {
  return apiFetch<BusinessCategoryTreePreview>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/tree`,
  );
}

export function businessCategoryTreeDownloadUrl(businessCategoryId: string): string {
  return `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/tree/download`;
}
export function businessCategoryTreePrintUrl(businessCategoryId: string): string {
  return `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/tree/print`;
}

/**
 * `AC-36`：下載／列印一律走**代理串流**（`downloadViaBlob`／`openPdfViaBlob`），
 * 🔴 **不得**用 `<a href>` top-level navigation——session 逾時時瀏覽器會把後端 401 JSON 當網頁畫出來。
 */
export function downloadBusinessCategoryTree(
  businessCategoryId: string,
  fallbackName: string,
): Promise<void> {
  return downloadViaBlob(businessCategoryTreeDownloadUrl(businessCategoryId), fallbackName);
}
/** 列印：`win` 須由呼叫端於 click handler 內、任何 `await` 之前同步開好（`AC-36`）。 */
export function printBusinessCategoryTree(
  businessCategoryId: string,
  win: Window | null,
): Promise<void> {
  return openPdfViaBlob(businessCategoryTreePrintUrl(businessCategoryId), win);
}

/** `AC-35` 子樹唯讀抽屜（分組／排序／去重全部由後端做）。 */
export function getBusinessCategorySubtreeDocuments(
  businessCategoryId: string,
  nodeId: string,
): Promise<BusinessCategorySubtreeDocuments> {
  return apiFetch<BusinessCategorySubtreeDocuments>(
    `/admin/business-categories/${encodeURIComponent(businessCategoryId)}/nodes/${encodeURIComponent(nodeId)}/subtree-documents`,
  );
}

// ── §己 前台樹狀圖瀏覽（F019 `AC-B16`～`AC-B27`；閘門＝前台瀏覽，5 角色皆可）──

/** 🔴 `AC-B18`：清單已由**後端**過濾（active ∧ 對本 viewer 至少一份可見文件）；前端不再過濾。 */
export function getPublicBusinessCategories(): Promise<PublicBusinessCategoryListItem[]> {
  return apiFetch<PublicBusinessCategoryListItem[]>('/public/business-categories');
}
/** 🔴 `AC-B21`：節點掛載數已套可見性過濾（`visibleDocCount`），前端不得自行加總。 */
export function getPublicBusinessCategoryGraph(
  businessCategoryId: string,
): Promise<PublicBusinessCategoryGraph> {
  return apiFetch<PublicBusinessCategoryGraph>(
    `/public/business-categories/${encodeURIComponent(businessCategoryId)}/graph`,
  );
}
export function getPublicBusinessCategoryNodeDocuments(
  businessCategoryId: string,
  nodeId: string,
): Promise<PublicBusinessCategoryNodeDoc[]> {
  return apiFetch<PublicBusinessCategoryNodeDoc[]>(
    `/public/business-categories/${encodeURIComponent(businessCategoryId)}/nodes/${encodeURIComponent(nodeId)}/documents`,
  );
}

// ── §戊 結構變更歷程（「文件變更歷程」頁第三個 tab；`AC-38`～`AC-42`）──
//
// 🔒 三個查詢/匯出端點與 diff／download 一律掛在 `/admin/change-history/business-categories*`
//    之下、共用「文件變更歷程」列之守門鏈（`AC-54`：主管對本頁整頁 403，看不到任何一個 tab）。

function businessCategoryChangeQuery(f: BusinessCategoryChangeFilters): string {
  const qs = new URLSearchParams();
  if (f.businessCategoryId) qs.set('businessCategoryId', f.businessCategoryId);
  if (f.person) qs.set('person', f.person);
  if (f.from) qs.set('from', f.from);
  const q = qs.toString();
  return q ? `?${q}` : '';
}

export function getBusinessCategoryChanges(
  f: BusinessCategoryChangeFilters = {},
): Promise<{ items: BusinessCategoryChangeView[]; total: number }> {
  return apiFetch(`/admin/change-history/business-categories${businessCategoryChangeQuery(f)}`);
}

/** `AC-42` 匯出 CSV（規則全數向 `error-handling.md#export` 之共用規則對齊；零新增錯誤碼）。 */
export function exportBusinessCategoryChanges(
  f: BusinessCategoryChangeFilters = {},
): Promise<void> {
  return downloadViaBlob(
    `/admin/change-history/business-categories/export${businessCategoryChangeQuery(f)}`,
    'business_category_change_history.csv',
  );
}

/** 某類別之結構變更（＋記 `BUSINESS_CATEGORY_CHANGELOG_VIEW` 稽核；`name` 供稽核快照）。 */
export function viewBusinessCategoryChanges(
  businessCategoryId: string,
  name?: string,
): Promise<{ items: BusinessCategoryChangeView[] }> {
  const q = name ? `?name=${encodeURIComponent(name)}` : '';
  return apiFetch(
    `/admin/change-history/business-categories/${encodeURIComponent(businessCategoryId)}${q}`,
  );
}

/** `AC-41` 單筆事件之新舊結構＋diff＋浮水印（純資料、不記稽核）。 */
export function getBusinessCategoryChangeDiff(
  businessCategoryId: string,
  changeLogId: string,
): Promise<BusinessCategoryTreeDiff> {
  return apiFetch(
    `/admin/change-history/business-categories/${encodeURIComponent(businessCategoryId)}/changes/${encodeURIComponent(changeLogId)}/tree-diff`,
  );
}

export function businessCategoryTreeDiffDownloadUrl(
  businessCategoryId: string,
  changeLogId: string,
): string {
  return `/admin/change-history/business-categories/${encodeURIComponent(businessCategoryId)}/changes/${encodeURIComponent(changeLogId)}/tree-diff/download`;
}

/**
 * `AC-41` 新舊對照 PDF 下載（記 `BUSINESS_CATEGORY_CHANGELOG_DOWNLOAD` 稽核）。
 * 🔴 §A.10.3 之分派契約：Tab 2 之下載走 `downloadLifecycleTreeDiff`、Tab 3 走本函式——
 * 少了分派，Tab 3 的下載鈕會去查循環側事件、查不到就**靜默無反應**（兩側單元測試各自都綠）。
 */
export function downloadBusinessCategoryTreeDiff(
  businessCategoryId: string,
  changeLogId: string,
  fallbackName: string,
): Promise<void> {
  return downloadViaBlob(
    businessCategoryTreeDiffDownloadUrl(businessCategoryId, changeLogId),
    fallbackName,
  );
}
