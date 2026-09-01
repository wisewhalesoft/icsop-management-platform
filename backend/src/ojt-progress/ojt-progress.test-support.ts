/**
 * F042 OJT 進度管理 — 測試共用 Fake（僅供 `ojt-progress.*.spec.ts` 五檔共用）。
 *
 * ⚠ 本檔非production 商業邏輯：純資料存放與最小必要之衍生計算（比照
 * `backend/src/storage/fake-blob-store.ts` 之既有慣例——記憶體假體本身不是被測對象，
 * `OjtProgressService`（尚不存在，`./ojt-progress.service`）才是）。
 *
 * ⚠ 對實作全盲：`OjtProgressService`／`./ojt-progress.store` 尚不存在，五份 spec 之 import
 * 皆會編譯失敗——此為本環之預期紅燈（比照 `appendices.service.spec.ts` 之既有慣例）。
 *
 * 埠（port）形狀為 test-generator 依 F042 §架構設計（system-architect 已定案之端點表／模組圖）
 * 與 data-model.md §OJT_SESSION 欄位表推導而得，非臆造；下游實作若採不同介面切分，
 * 屬合理 test-dispute，仲裁時改介面形狀、不弱化行為斷言本身。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md AC-01～AC-29、
 * §架構設計（端點表／模組落點）；docs/specs/data-model.md #ojt-session-entity；
 * docs/specs/error-handling.md #ojt-progress。
 */

// ══════════════════════════ 型別（比照 appendices.store.ts 之既有切分慣例） ══════════════════════════

export type OjtRoleCode = 'SysAdmin' | 'ICSOPAdmin' | 'Supervisor' | 'DeptContact' | 'User';

export interface OjtSessionContext {
  roleCode: OjtRoleCode;
  accountId: string;
  name?: string;
  employeeNo?: string;
}

/** 場次紀錄（OJT_SESSION 欄位表，data-model.md §ojt-session-entity）。 */
export interface OjtSessionRecord {
  id: string;
  documentId: string;
  /** null＝待歸位（`OQ-E11-01=C` 之遷移列，AC-26）。 */
  orgCode: string | null;
  companyCode: string;
  /** 有值＝該單位已自使用部門移除（AC-25，`OQ-E11-02=C`）。 */
  orphanedAt: Date | null;
  trainingDate: string; // 'YYYY-MM-DD'
  fileName: string;
  blobPath: string;
  contentType: string;
  size: number;
  uploadedBy: string; // accountId
  uploadedByName: string | null;
  uploadedAt: Date;
}

export interface AddOjtSessionInput {
  trainingDate?: string;
  file?: { fileName: string; contentType: string; size: number; buffer?: Buffer };
}

export interface OjtRowFilters {
  orgQuery?: string;
  /** 恰三值（AC-13，`OQ-E11-18` 覆核定案＝比對列自身），空字串＝不施加限制。 */
  completionStatus?: '' | 'completed' | 'pending';
}

export interface OjtProgressRow {
  key: string; // `${documentId}__${orgCode}`
  documentId: string;
  documentNumber: string;
  documentName: string;
  /** 該列所屬公司（＝文件之 companyCode）；與 orgCode 成對才足以識別一個單位。 */
  companyCode: string;
  orgCode: string;
  /** `公司簡稱 / 部 / 處室`。 */
  orgName: string;
  inactive: boolean;
  orphaned: boolean;
  sessionCount: number;
  completed: boolean; // AC-03：場次數 ≥ 1
}

export type OjtDocState = 'all' | 'partial' | 'none';

export interface OjtDocCoverageRow {
  documentId: string;
  documentNumber: string;
  documentName: string;
  /** 🔴 AC-04：本欄不套用 isActive 過濾（與下方 coverage 之分母口徑刻意不同）。 */
  state: OjtDocState;
  totalUnits: number;
  completedUnits: number;
}

/**
 * 🔴 `OQ-E11-21`（2026-08-28 節流修正）＋ `OQ-E11-22`（2026-08-28 第二輪，第四種呈現態）：
 * `docScope` 自第二輪起為**恰四值**，逐字對應顯示範圍（F042 `AC-14` ①⑨／§架構設計 一-2）。
 * `incomplete` 為伺服器正規化後之預設值；`incomplete` 之集合定義同步收窄為
 * `totalUnits > 0 && state !== 'all'`（不含無義務者）。`unassigned` 為**正向**過濾
 * （`totalUnits === 0`），與 `all`（不過濾）不同型。
 */
export type OjtDocScope = 'incomplete' | 'completed' | 'unassigned' | 'all';

/**
 * 🔴 `docCoverage` 之新形狀（陣列→物件，刻意的 loud break，見 §架構設計 一-2）。
 * `items` 為受限切片（依 `docScope` 過濾 → **三段排序鍵**：① 有無訓練義務（`totalUnits===0`
 * 者一律在後，2026-08-28 第二輪沉底修正）→ ② 覆蓋率昇冪 → ③ `documentNumber` 昇冪 → 取前
 * `maxRows` 筆）；`totalDocuments`／`byState`／`incompleteTotal` 恆取自完整母體、與
 * `docScope`／`maxRows` 無關（四條不變式見 §架構設計 一-2；`incompleteTotal` 之公式已於
 * 第二輪就地更正為 ③′，見該欄位註解）。
 */
export interface OjtDocCoverageSlice {
  /** 伺服器正規化後實際套用之範圍（缺值／未知值一律正規化為 'incomplete'，本欄回聲）。 */
  scope: OjtDocScope;
  /** 伺服器所套用之筆數上限（現值 15）。 */
  maxRows: number;
  items: OjtDocCoverageRow[];
  /** ＝ items.length。 */
  shown: number;
  /** 該 scope 完整母體筆數 − shown，恆 ≥ 0。 */
  hidden: number;
  /** 全部 ICSOP 文件份數（完整母體，不受 docScope／maxRows 影響）。 */
  totalDocuments: number;
  /**
   * 文件層三態份數（完整母體，`AC-04` 口徑，`none` 天然含無義務者）＋ `unassigned`（🔴
   * 2026-08-28 第二輪新增之第四鍵：`totalUnits===0` 之份數，`none` 之**子集**、非第四個互斥
   * 類——四鍵相加 **不得** 等於 `totalDocuments`，見不變式④之負向案）。
   */
  byState: { all: number; partial: number; none: number; unassigned: number };
  /**
   * 尚未全部完成合計（完整母體）。🔴 不變式已就地更正為 ③′：
   * `incompleteTotal === byState.partial + byState.none − byState.unassigned`
   * （原式 `partial + none` 已於第二輪起不成立——`none` 含無義務者，而本欄依使用者裁決
   * 排除他們）。
   */
  incompleteTotal: number;
}

export interface OjtSummary {
  coverage: {
    numerator: number;
    denominator: number;
    /** `denominator===0` 時省略（AC-14：不得為 NaN／0%／100%）。 */
    rate?: number;
    excludedInactive: number;
    excludedOrphaned: number;
  };
  docCoverage: OjtDocCoverageSlice;
  deptRollup: { companyCode: string; deptOrgCode: string; deptName: string; totalUnits: number; completedUnits: number }[];
  /** AC-16：僅單位/文件/日期層級，明文不含上傳者姓名或員工編號。 */
  recentSessions: {
    documentId: string;
    documentNumber: string;
    documentName: string;
    companyCode: string;
    orgCode: string;
    orgName: string;
    trainingDate: string;
  }[];
}

export interface OjtAuditEvent {
  actionType: 'OJT_SESSION_UPLOAD' | 'OJT_SESSION_DELETE';
  documentId: string;
  documentNumber: string;
  orgCode: string;
  accountId: string;
  name?: string | null;
  employeeNo?: string | null;
  watermarkSnapshot: null;
}

// ══════════════════════════ 使用單位固定資料（測試 fixture） ══════════════════════════

export interface FixtureDoc {
  id: string;
  documentNumber: string;
  documentName: string;
  companyCode: string;
  usingDeptIds: string[];
}

export interface FixtureOrg {
  /**
   * 🔴 選填、預設 `FIXTURE_COMPANY`（'AS'）——既有 seed 呼叫點（單一公司語料）一格未動。
   * 需要建構「跨公司同碼」情境時**顯式給值**，見 `ojt-progress.rows.spec.ts` 之
   * 「同碼不同公司」案。
   */
  companyCode?: string;
  orgCode: string;
  name: string;
  isActive: boolean;
}

/** 既有 fixture 之預設公司（全部 seedDoc 皆為 'AS'，與之對齊）。 */
export const FIXTURE_COMPANY = 'AS';

// ══════════════════════════ Fakes ══════════════════════════

/** 使用部門／文件存在性 port（自建窄 adapter，比照 appendices 之 DocumentExistenceChecker 慣例）。 */
export class FakeUsingDeptChecker {
  docs = new Map<string, FixtureDoc>();

  seedDoc(doc: FixtureDoc): FixtureDoc {
    this.docs.set(doc.id, doc);
    return doc;
  }

  /** 🔴 AC-25：patch usingDeptIds（供孤兒化／復活測試呼叫）。 */
  patchUsingDeptIds(documentId: string, newUsingDeptIds: string[]): void {
    const d = this.docs.get(documentId);
    if (!d) return;
    this.docs.set(documentId, { ...d, usingDeptIds: [...newUsingDeptIds] });
  }

  exists(documentId: string): Promise<boolean> {
    return Promise.resolve(this.docs.has(documentId));
  }

  getUsingDeptIds(documentId: string): Promise<string[]> {
    return Promise.resolve(this.docs.get(documentId)?.usingDeptIds ?? []);
  }

  isOrgUsingDept(documentId: string, orgCode: string): Promise<boolean> {
    return Promise.resolve((this.docs.get(documentId)?.usingDeptIds ?? []).includes(orgCode));
  }

  getDocumentMeta(
    documentId: string,
  ): Promise<{ id: string; documentNumber: string; documentName: string; companyCode: string } | null> {
    const d = this.docs.get(documentId);
    return Promise.resolve(d ? { id: d.id, documentNumber: d.documentNumber, documentName: d.documentName, companyCode: d.companyCode } : null);
  }

  /** 全部文件（供 summary 之 docCoverage／rollup 聚合使用）。 */
  listAllDocs(): Promise<FixtureDoc[]> {
    return Promise.resolve([...this.docs.values()]);
  }
}

/**
 * 組織資料 port（`(companyCode, orgCode)` → 名稱／isActive，AC-17 之裁撤過濾來源）。
 *
 * 🔴 **索引鍵為複合鍵，且刻意沒有「查不到就退回同碼任一公司」之寬容分支**（2026-09-01）：
 * 那道寬容正是 production adapter 曾經的缺陷本體（`orgCode` 單鍵 Map、他公司之列覆蓋本公司）。
 * 假體若比真體寬容，跨公司誤取就永遠測不出來——環會綠，畫面照樣顯示別家公司的部門。
 */
export class FakeOrgDirectory {
  orgs = new Map<string, FixtureOrg>();

  private static key(companyCode: string, orgCode: string): string {
    return `${companyCode}__${orgCode}`;
  }

  seedOrg(org: FixtureOrg): FixtureOrg {
    this.orgs.set(FakeOrgDirectory.key(org.companyCode ?? FIXTURE_COMPANY, org.orgCode), org);
    return org;
  }

  isActive(companyCode: string, orgCode: string): Promise<boolean> {
    return Promise.resolve(this.orgs.get(FakeOrgDirectory.key(companyCode, orgCode))?.isActive ?? true);
  }

  nameOf(companyCode: string, orgCode: string): Promise<string> {
    return Promise.resolve(this.orgs.get(FakeOrgDirectory.key(companyCode, orgCode))?.name ?? orgCode);
  }
}

/**
 * 場次記憶體假體（OJT_SESSION 表）。
 * 🔴 `create` 恆為新增，無任何以 (documentId,orgCode) 為鍵之 upsert 分支（AC-02 之負向鎖定）。
 */
export class FakeOjtSessionStore {
  seq = 1;
  rows: OjtSessionRecord[] = [];
  createCalls = 0;
  deleteCalls: string[] = [];

  create(input: Omit<OjtSessionRecord, 'id'>): Promise<OjtSessionRecord> {
    this.createCalls += 1;
    const rec: OjtSessionRecord = { id: `s${this.seq++}`, ...input };
    this.rows.push(rec);
    return Promise.resolve(rec);
  }

  findById(sessionId: string): Promise<OjtSessionRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === sessionId) ?? null);
  }

  delete(sessionId: string): Promise<void> {
    this.deleteCalls.push(sessionId);
    this.rows = this.rows.filter((r) => r.id !== sessionId);
    return Promise.resolve();
  }

  listByDocumentOrg(documentId: string, orgCode: string): Promise<OjtSessionRecord[]> {
    return Promise.resolve(
      this.rows
        .filter((r) => r.documentId === documentId && r.orgCode === orgCode)
        .sort((a, b) => (a.trainingDate < b.trainingDate ? -1 : a.trainingDate > b.trainingDate ? 1 : 0)),
    );
  }

  listAll(): Promise<OjtSessionRecord[]> {
    return Promise.resolve([...this.rows]);
  }

  listPending(): Promise<OjtSessionRecord[]> {
    return Promise.resolve(this.rows.filter((r) => r.orgCode === null));
  }

  /** 🔴 AC-26：僅命中 `orgCode IS NULL` 之列；已歸位者不再命中（單向、不可逆）。 */
  assignPending(sessionId: string, orgCode: string, trainingDate: string): Promise<OjtSessionRecord | null> {
    const idx = this.rows.findIndex((r) => r.id === sessionId && r.orgCode === null);
    if (idx === -1) return Promise.resolve(null);
    this.rows[idx] = { ...this.rows[idx], orgCode, trainingDate };
    return Promise.resolve(this.rows[idx]);
  }

  /** 🔴 AC-25：冪等孤兒化——僅影響「不在新集合內、尚未孤兒化」之列；`orgCode IS NULL` 者不受影響。 */
  orphanize(documentId: string, newUsingDeptIds: string[], at: Date): void {
    this.rows = this.rows.map((r) =>
      r.documentId === documentId && r.orgCode !== null && !newUsingDeptIds.includes(r.orgCode) && r.orphanedAt === null
        ? { ...r, orphanedAt: at }
        : r,
    );
  }

  /** 🔴 AC-25：冪等復活——重新回到集合內、先前曾孤兒化者，`orphanedAt` 清空。 */
  revive(documentId: string, newUsingDeptIds: string[]): void {
    this.rows = this.rows.map((r) =>
      r.documentId === documentId && r.orgCode !== null && newUsingDeptIds.includes(r.orgCode) && r.orphanedAt !== null
        ? { ...r, orphanedAt: null }
        : r,
    );
  }
}

/** 稽核記錄器（比照 appendices AuditRecorder 慣例）。 */
export class FakeOjtAuditRecorder {
  events: OjtAuditEvent[] = [];
  record(event: OjtAuditEvent): void {
    this.events.push(event);
  }
}

/** 極簡記憶體 BlobStore（僅記錄呼叫，不做真實 I/O；比照 storage/fake-blob-store.ts 之既有慣例但本模組自帶精簡版）。 */
export class FakeOjtBlobStore {
  putCalls: { key: string; size: number }[] = [];
  deleteCalls: string[] = [];
  put(key: string, buffer: Buffer): Promise<void> {
    this.putCalls.push({ key, size: buffer.length });
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.deleteCalls.push(key);
    return Promise.resolve();
  }
  getBytes(_key: string): Promise<Buffer | null> {
    return Promise.resolve(Buffer.alloc(0));
  }
}

// ══════════════════════════ 共用 session context 常數 ══════════════════════════

export const ICSOP_ADMIN: OjtSessionContext = { roleCode: 'ICSOPAdmin', accountId: 'acc-admin', name: '陳管理', employeeNo: '10001' };
export const SUPERVISOR: OjtSessionContext = { roleCode: 'Supervisor', accountId: 'acc-sup', name: '王主管', employeeNo: '10002' };
export const DEPT_CONTACT: OjtSessionContext = { roleCode: 'DeptContact', accountId: 'acc-dc', name: '李窗口', employeeNo: '10003' };
export const SYS_ADMIN: OjtSessionContext = { roleCode: 'SysAdmin', accountId: 'acc-sys', name: '吳系管', employeeNo: '10004' };
export const NORMAL_USER: OjtSessionContext = { roleCode: 'User', accountId: 'acc-user', name: '一般使用者', employeeNo: '10005' };

export const WRITABLE_ROLES: OjtSessionContext[] = [ICSOP_ADMIN, SUPERVISOR, DEPT_CONTACT];

/** AC-10：合法簽到表檔案 fixture（pdf，1KB，符合允許格式與大小上限）。 */
export function validFile(over: Partial<AddOjtSessionInput['file']> = {}): NonNullable<AddOjtSessionInput['file']> {
  return {
    fileName: 'signin.pdf',
    contentType: 'application/pdf',
    size: 1024,
    buffer: Buffer.alloc(1024),
    ...over,
  };
}
