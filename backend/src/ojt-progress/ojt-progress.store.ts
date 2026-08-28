/**
 * F042 OJT 進度管理 · 資料存取與協作邊界（介面＋DI token）。
 *
 * 反循環（比照 `AppendicesModule` 之既有教訓）：文件存在性、使用部門集合、組織名稱／裁撤狀態
 * 皆由本模組**自建窄 adapter** 直接讀 `ICSOP_DOCUMENT`／`DOC_USING_DEPT`／`ORG_UNIT`，
 * **不 import `DocumentsModule`／`OrgSyncModule`**（架構 §二）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md §架構設計；
 *       docs/specs/data-model.md #ojt-session-entity。
 */

/** 場次紀錄（`OJT_SESSION` 欄位表之應用層形狀；`size` 已由 store 轉為 number）。 */
export interface OjtSessionRecord {
  id: string;
  documentId: string;
  /** `null` ＝待歸位（`OQ-E11-01=C` 之遷移列，`AC-26`）。 */
  orgCode: string | null;
  companyCode: string;
  /** 有值＝該單位已自使用部門移除之時點（`AC-25`）。⚠ 不是孤兒判定之權威來源，見 store 註解。 */
  orphanedAt: Date | null;
  /** `YYYY-MM-DD`（日曆日，不帶時刻）。 */
  trainingDate: string;
  fileName: string;
  blobPath: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string | null;
  uploadedAt: Date;
}

export const OJT_SESSION_STORE = Symbol('OJT_SESSION_STORE');

/**
 * 場次之持久化邊界。
 *
 * 🔴 **結構上不暴露任何 `update` 方法**（`AC-20` 之負向鎖定於資料層之落實）：場次一旦建立
 * 即不可編輯，更正之唯一路徑為刪除後重新登記。唯一之例外 `assignPending()` 有 `WHERE
 * orgCode IS NULL` 之守衛，語意是**待歸位列之一次性歸屬指派**、單向不可逆——不是通用更新
 * 端點。⚠ 兩者共用 `UPDATE` 動詞但語意不同；把歸位寫成通用場次更新，等於從側門把 `AC-20` 打開。
 */
export interface OjtSessionStore {
  create(input: Omit<OjtSessionRecord, 'id'>): Promise<OjtSessionRecord>;
  findById(sessionId: string): Promise<OjtSessionRecord | null>;
  delete(sessionId: string): Promise<void>;
  /** 單一進度列之全部場次（依訓練日期遞增）。 */
  listByDocumentOrg(documentId: string, orgCode: string): Promise<OjtSessionRecord[]>;
  /** 全部場次（供 TAB1／TAB2 之聚合；含孤兒與待歸位列，由呼叫端依語意各自過濾）。 */
  listAll(): Promise<OjtSessionRecord[]>;
  /** 待歸位列（`orgCode IS NULL`）。 */
  listPending(): Promise<OjtSessionRecord[]>;
  /** 🔴 `AC-26`：僅命中 `orgCode IS NULL` 之列；已歸位者不再命中（單向、不可逆）。 */
  assignPending(
    sessionId: string,
    orgCode: string,
    trainingDate: string,
  ): Promise<OjtSessionRecord | null>;
  /** 🔴 `AC-25` 冪等孤兒化：僅影響「不在新集合內、尚未孤兒化」之列；待歸位列不受影響。 */
  orphanize(documentId: string, newUsingDeptIds: string[], at: Date): void | Promise<void>;
  /** 🔴 `AC-25` 冪等復活：重新回到集合內、先前曾孤兒化者，`orphanedAt` 清空。 */
  revive(documentId: string, newUsingDeptIds: string[]): void | Promise<void>;
}

export const OJT_USING_DEPT_CHECKER = Symbol('OJT_USING_DEPT_CHECKER');

/** 文件之最小身分（供進度列與稽核之快照欄）。 */
export interface OjtDocumentMeta {
  id: string;
  documentNumber: string;
  documentName: string;
  companyCode: string;
}

/**
 * 文件存在性 ＋ 使用部門集合之唯讀來源（自建窄 adapter，比照 `TypeOrmDocumentExistenceChecker`）。
 *
 * 🔴 **進度列由本 port 之 `usingDeptIds` 原樣驅動，不展開子樹**（`AC-01`）——本介面刻意
 * **不提供**任何子樹展開能力，使「列產生階段展開子樹」在結構上無從發生。
 * ⚠ 這與 F026 §9.1 之「權限判定時自動展開子樹」刻意相反：權限問的是「你管不管得到」，
 * 本 feature 問的是「這個單位辦沒辦過訓練」——後者是可觀測事實，不因上層單位辦過而成立。
 */
export interface OjtUsingDeptChecker {
  exists(documentId: string): Promise<boolean>;
  getUsingDeptIds(documentId: string): Promise<string[]>;
  isOrgUsingDept(documentId: string, orgCode: string): Promise<boolean>;
  getDocumentMeta(documentId: string): Promise<OjtDocumentMeta | null>;
  /** 全部文件（供 TAB1 之 docCoverage／rollup 與 TAB2 之列產生）。 */
  listAllDocs(): Promise<(OjtDocumentMeta & { usingDeptIds: string[] })[]>;
}

export const OJT_ORG_DIRECTORY = Symbol('OJT_ORG_DIRECTORY');

/**
 * 組織名稱與裁撤狀態之唯讀來源（`AC-17` 之 `isActive` 過濾來源）。
 * 🔒 查無之 orgCode：`isActive` 預設 `true`（fail-open——把查不到的單位當成裁撤，會讓它
 * 從覆蓋率分母裡憑空消失，那是隱藏而非清理）；`nameOf` 退回代碼本身（不留白）。
 */
export interface OjtOrgDirectory {
  isActive(orgCode: string): Promise<boolean>;
  nameOf(orgCode: string): Promise<string>;
}

export const OJT_AUDIT_RECORDER = Symbol('OJT_AUDIT_RECORDER');

/**
 * 場次稽核事件（`AC-18`／`AC-19`）。
 * 🔒 `watermarkSnapshot` 以型別鎖為 `null`——登記／刪除非浮水印動作。
 */
export interface OjtAuditEvent {
  actionType: 'OJT_SESSION_UPLOAD' | 'OJT_SESSION_DELETE';
  documentId: string;
  documentNumber: string;
  orgCode: string;
  accountId: string;
  name?: string | null;
  employeeNo?: string | null;
  watermarkSnapshot: null;
  /** 場次 id（`AUDIT_LOG.targetId`）。供 adapter 落值；記憶體假體忽略之。 */
  sessionId?: string;
}

export interface OjtAuditRecorder {
  record(event: OjtAuditEvent): void | Promise<void>;
}

export const OJT_BLOB_STORE = Symbol('OJT_BLOB_STORE');

/**
 * 簽到表檔案之儲存邊界（本模組所需之最小子集，`BLOB_STORE` 之窄化視圖）。
 * 🔴 刻意只宣告用得到的四個方法：本模組不核發 SAS（下載一律代理串流，比照
 * `attachments.service.ts` 之 `downloadAttachmentRaw` 既有模式），不需要 `getDownloadUrl`。
 */
export interface OjtBlobStore {
  put(key: string, buffer: Buffer, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
  getBytes(key: string): Promise<Buffer | null>;
}

/** 伺服器當下時間之注入點（`AC-09` ② 之「未來日」比較基準，供測試釘死跨日邊界）。 */
export type OjtClock = () => Date;

export const OJT_CLOCK = Symbol('OJT_CLOCK');
