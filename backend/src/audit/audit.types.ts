/**
 * F023 稽核軌跡 · 共用契約（下游 worktree F005/F007/F012/F020/F034/F037/F038 皆呼叫本介面，
 * 型別視為與 migration 同等優先之交付物，見 F023-test.md 開放問題#1）。
 *
 * 設計定案（audit worktree，2026-07-23，覆蓋 spec 草案文字）：
 *  - D. AuditWriter 契約鎖定：recordAccess / queryHistory / processOutboxRetry。
 *  - AuditAccessEvent＝以 targetType 判別之聯集，攜帶 actorId／actorName?／actionType／
 *    targetId（依 targetType 必填）／watermarkSnapshot?（條件必填，僅浮水印動作攜帶）／occurredAt。
 *  - E. 不可竄改：store 介面「結構上不暴露」任何 update/delete 方法；DB 層 REVOKE 為 [integration]。
 *  - F. 空條件非阻斷：套用近 30 天預設（見 access-history-filter），不硬擋 QUERY_CONDITION_REQUIRED。
 *  - targetId 缺漏（依 targetType 必填卻未帶）→ 錯誤碼 AUDIT_TARGET_REF_REQUIRED。
 *
 * data-model 對照：AUDIT_LOG（#auditlog-entity）之 5 種 targetType／對應 actionType／條件必填欄位。
 */
import { BadRequestException } from '@nestjs/common';

/** 被存取對象類型（data-model AUDIT_LOG.targetType，OQ-E07-02 定案 5 值）。 */
export type AuditTargetType =
  | 'DOCUMENT'
  | 'USAGE_FORM'
  | 'LIFECYCLE'
  | 'DOCUMENT_CHANGE_LOG'
  | 'LIFECYCLE_CHANGE_LOG'
  // F006 組織異動待確認提示之狀態變更（additive：僅新增字面值，不改既有變體語意；
  // 比照 F007 LIFECYCLE_DELETE 先例）。targetId＝ORG_CHANGE_ALERT.id。
  | 'ORG_CHANGE_ALERT'
  // F039 附錄下載（architecture-spec §3.6 決策三，additive）。targetId＝APPENDIX_POOL.id。
  | 'APPENDIX'
  // F024 調閱歷程匯出（architecture-spec §10.18 A16-1，additive）。無自然之對象實體 id ⇒
  // targetId 採固定哨兵常數 ACCESS_HISTORY_EXPORT_TARGET_ID，且**不對映任何參照欄**
  // （沿用 ORG_CHANGE_ALERT 之「無對映 case」既有模式，buildAuditRow 不需新增 case）。
  | 'ACCESS_HISTORY'
  // 🔴 F016/F023 D9 delta（2026-08-20，OQ-D9-29；additive）：OJT 簽到表**上傳**事件。
  // targetId＝documentId（上傳之標的文件）。刻意**不**沿用 'DOCUMENT'——上傳非調閱，
  // 混入 DOCUMENT 會使 F024「類型＝文件」之調閱查詢被上傳事件污染（AC-N69 之分類學防線）。
  // data-model「ATTACHMENT_UPLOAD 擴充」段已定案：varchar(30)/varchar(40) 無 CHECK ⇒ 不需 migration。
  | 'DOCUMENT_ATTACHMENT'
  // 🔴 2026-08-25 角色自動化 delta（裁定 Q4.5）：帳號之角色／子分類異動。
  // targetId＝被異動之帳號 id，經 buildAuditRow 落至 AUDIT_LOG.targetAccountId。
  // 刻意獨立於既有四個參照欄——角色異動不是調閱，混入任一既有 targetType 會污染 F024 查詢。
  | 'ACCOUNT'
  // 🔴 F042 E11 delta（2026-08-28，`OQ-E11-13=B` ＋ `OQ-E11-17` 覆核核可）：教育訓練場次之
  // 新增／刪除。**第 9 個值**；targetId＝OJT_SESSION.id（場次為第一等資源）。
  // 刻意**不**沿用 'DOCUMENT_ATTACHMENT'——場次不是附件，沿用會使 `OJT_SESSION_DELETE`
  // 在 F024「類型」欄顯示為「上傳」，且 targetId→targetAccountId 之對映等同指鹿為馬。
  | 'OJT_SESSION';

/** 操作類型（data-model AUDIT_LOG.actionType，逐字沿用 F036/F037/F038 spec 命名）。 */
export type AuditActionType =
  | 'VIEW'
  | 'DOWNLOAD'
  | 'PRINT'
  | 'LIFECYCLE_VIEW'
  | 'LIFECYCLE_DOWNLOAD'
  | 'LIFECYCLE_PRINT'
  // 循環刪除稽核（F007 Main Flow 4「刪除並記錄稽核」）。additive：僅新增字面值，不改既有變體，
  // buildAuditRow 依 targetType 對映（LIFECYCLE→lifecycleId）故無需改邏輯。見 F007 impl log flag：
  // OQ-E03-05 將「結構變更歷程」歸 F038，此處為 AUDIT_LOG 存取層之刪除紀錄（互補、非取代 F038）。
  | 'LIFECYCLE_DELETE'
  | 'CHANGE_LOG_VIEW'
  | 'LIFECYCLE_CHANGELOG_VIEW'
  | 'LIFECYCLE_CHANGELOG_DOWNLOAD'
  // F006：組織異動待確認提示被處理（Route A 自動／Route B 手動皆記錄）。
  | 'ALERT_RESOLVED'
  // F024：調閱歷程匯出（AC-F13）。additive：僅新增字面值，既有 11 種變體之語意逐字不變。
  | 'ACCESS_HISTORY_EXPORT'
  // 🔴 F016 D9 delta（AC-N31／F023 AC-N50）：主管／部門窗口上傳 OJT 簽到表。
  // ⚠ 角色不對稱（AC-N32）：ICSOPAdmin 執行同一操作**不**寫入本事件——那是既有職掌內之
  // 日常維護，本事件之存在理由是「破例開放之角色其寫入行為需可追溯」。
  | 'ATTACHMENT_UPLOAD'
  // 🔴 2026-08-25 角色自動化 delta：角色／子分類異動。
  // 涵蓋**兩種來源**：管理員手動指派（F003 assignRole）與同步之自動推導（F004 角色推導階段）。
  // 兩者以 actorId 區分——自動推導無操作者，故落系統帳號哨兵；語意差異記於 targetName 快照。
  | 'ROLE_ASSIGNED'
  // 🔴 F042 E11 delta（`AC-18`／`AC-19`，`OQ-E11-13=B`）：教育訓練場次之登記與刪除。
  // **兩個獨立值**，明文不得與 'ATTACHMENT_UPLOAD' 或任何既有調閱動作共用。
  // ⚠ D9 批 `AC-N32` 之「ICSOPAdmin 不寫稽核」角色不對稱於新路徑**整條作廢**——
  // 三種可寫角色（ICSOPAdmin／Supervisor／DeptContact）一律寫入。
  | 'OJT_SESSION_UPLOAD'
  | 'OJT_SESSION_DELETE';

/** 調閱來源（E09 US-097），預設 DIRECT。 */
export type AuditSource = 'DIRECT' | 'AI_QA';

/**
 * 事件共用欄位。actorId/actorName 為 D 契約之核心；其餘身分快照欄（employeeNo/company/
 * department/section/roleCode）為 data-model AUDIT_LOG「操作者身分快照（與浮水印同一來源）」之落地，
 * 呼叫端（F020）於浮水印組字當下已握有，故一併攜入。targetId 為依 targetType 必填之對象參照。
 */
interface AuditEventBase {
  /** 操作者帳號（= AUDIT_LOG.accountId）。 */
  actorId: string;
  /** 姓名快照。 */
  actorName?: string | null;
  employeeNo?: string | null;
  company?: string | null;
  department?: string | null;
  section?: string | null;
  roleCode?: string | null;
  /** 依 targetType 必填之對象參照（DOCUMENT→documentId／LIFECYCLE→lifecycleId／USAGE_FORM→formId…）。 */
  targetId: string;
  /** 對象顯示編號快照（文件編號／循環名稱），供 F024「對象」欄呈現與篩選。 */
  targetNumber?: string | null;
  /** 對象名稱／說明快照（文件名稱／循環說明），供 F024 明細呈現。 */
  targetName?: string | null;
  /** 當次浮水印完整字串快照（條件必填：僅浮水印動作攜帶，逐字保存不再推導，AC3）。 */
  watermarkSnapshot?: string | null;
  /** 伺服器時間戳記。 */
  occurredAt: Date;
  /** 調閱來源；未提供時 recordAccess 預設 DIRECT。 */
  source?: AuditSource;
}

/** 文件調閱（F020，浮水印動作）。 */
export interface DocumentAuditEvent extends AuditEventBase {
  targetType: 'DOCUMENT';
  actionType: 'VIEW' | 'DOWNLOAD' | 'PRINT';
}
/**
 * 使用表單下載（F018，浮水印動作）。targetId＝使用表單附件 id。
 *
 * 🔴 D9 delta（`AC-N17`）：additive 新增選填 `documentId`——後台唯讀詳情頁之
 * `downloadFormRaw()` 自本輪起需寫稽核，且該路徑之呼叫脈絡確實隸屬某份文件，
 * `AUDIT_LOG.documentId` 必須落值。**選填**而非必填：表單池管理頁之 `downloadFromPool()`
 * 無文件脈絡（`AC-N51` 明訂該路徑 `documentId` 為 `null`），且既有呼叫端不需同步改動。
 */
export interface UsageFormAuditEvent extends AuditEventBase {
  targetType: 'USAGE_FORM';
  actionType: 'VIEW' | 'DOWNLOAD' | 'PRINT';
  documentId?: string | null;
}
/**
 * 循環動作（F036 樹狀圖預覽之浮水印動作 VIEW/DOWNLOAD/PRINT，watermarkSnapshot 攜帶；
 * 另 F007 之 LIFECYCLE_DELETE 為非浮水印之刪除紀錄，watermarkSnapshot 省略）。targetId＝lifecycleId。
 */
export interface LifecycleAuditEvent extends AuditEventBase {
  targetType: 'LIFECYCLE';
  actionType:
    | 'LIFECYCLE_VIEW'
    | 'LIFECYCLE_DOWNLOAD'
    | 'LIFECYCLE_PRINT'
    | 'LIFECYCLE_DELETE';
}
/** 文件變更歷程檢視（F037，無浮水印）。targetId＝documentId。 */
export interface DocumentChangeLogAuditEvent extends AuditEventBase {
  targetType: 'DOCUMENT_CHANGE_LOG';
  actionType: 'CHANGE_LOG_VIEW';
}
/** 循環變更歷程檢視／下載（F038，無浮水印）。targetId＝lifecycleId。 */
export interface LifecycleChangeLogAuditEvent extends AuditEventBase {
  targetType: 'LIFECYCLE_CHANGE_LOG';
  actionType: 'LIFECYCLE_CHANGELOG_VIEW' | 'LIFECYCLE_CHANGELOG_DOWNLOAD';
}

/**
 * 組織異動待確認提示之處理（F006，無浮水印）。targetId＝ORG_CHANGE_ALERT.id；
 * targetNumber＝文件編號（DOCUMENT_FIELD）或員編（CLOSED_DEPT_PERSON）；targetName＝受影響欄位說明。
 * ⚠ AUDIT_LOG 現無 alertId 欄，故 targetId 於落地列不對映任何參照欄（見 F006 impl log flag）。
 */
export interface OrgChangeAlertAuditEvent extends AuditEventBase {
  targetType: 'ORG_CHANGE_ALERT';
  actionType: 'ALERT_RESOLVED';
}

/**
 * 附錄下載（F039，無浮水印／不燒錄，AC-29）。targetId＝APPENDIX_POOL.id。
 *
 * ⚠ 本變體**刻意攜帶必填 `documentId`**（不同於既有 USAGE_FORM 變體之「單一 targetId」模式）：
 * AC-27 要求附錄下載之稽核列**同時**落地 `appendixId` 與 `documentId`（該附錄係經哪一份文件被下載）。
 * TypeScript 判別聯集允許個別變體攜帶額外欄位；既有 6 種變體之形狀逐字不動。
 */
export interface AppendixAuditEvent extends AuditEventBase {
  targetType: 'APPENDIX';
  actionType: 'DOWNLOAD';
  /**
   * 下載來源之文件 id（buildAuditRow 之 APPENDIX 分支直接落至 AUDIT_LOG.documentId）。
   * 🔴 D9 delta（`AC-N57`）：後台附錄池管理頁之個別下載自本輪起亦寫稽核，該脈絡**無所屬文件**
   * ⇒ 型別放寬為可 `null`（前台路徑仍恆帶該次下載之來源文件 id，`AC-27` 不變）。
   */
  documentId: string | null;
}

/**
 * 調閱歷程匯出（F024 `AC-F13`，無浮水印）。第 8 個變體；既有 7 個變體之形狀逐字不動
 * （比照 F039 `APPENDIX` 變體加入時之處置，architecture-spec §10.18 `A16-1`）。
 *
 * 🔴 `targetId` 恆為 {@link ACCESS_HISTORY_EXPORT_TARGET_ID}——匯出之對象是一個**查詢結果集**，
 * 不是任何一筆可定址之記錄。**不得**比照 F037／F038 以 `items[0]?.documentId ?? null` 一類
 * 「取結果集第一筆」之運算式導出（0 筆匯出時會退化為 null → `AUDIT_TARGET_REF_REQUIRED`
 * → 稽核靜默漏記；該既有缺陷登錄於 `OQ-E07-15`，本輪不修但不得照抄）。
 */
export interface AccessHistoryExportAuditEvent extends AuditEventBase {
  targetType: 'ACCESS_HISTORY';
  actionType: 'ACCESS_HISTORY_EXPORT';
}

/**
 * `ACCESS_HISTORY_EXPORT` 之固定哨兵 `targetId`（architecture-spec §10.18 `A16-1`）。
 * 僅用於通過 `buildAuditRow()` 最前面之非空檢查；`ACCESS_HISTORY` 無對映 case ⇒
 * 本值**不落地於任何參照欄**（documentId／lifecycleId／formId／appendixId 皆為 null）。
 */
export const ACCESS_HISTORY_EXPORT_TARGET_ID = 'access-history-export';

/**
 * 🔴 附件上傳（F016 `AC-N31`／F023 `AC-N50`，D9 delta）。第 9 個變體；既有 8 個變體形狀逐字不動。
 *
 * `targetId`＝`documentId`（上傳之標的文件；`buildAuditRow` 之本分支落至 `AUDIT_LOG.documentId`）。
 * `watermarkSnapshot` 恆為 `null`——上傳**非浮水印動作**（`AC-N31` 明訂）；此處以型別鎖死，
 * 而非依賴呼叫端記得傳 null。
 */
export interface DocumentAttachmentAuditEvent extends AuditEventBase {
  targetType: 'DOCUMENT_ATTACHMENT';
  actionType: 'ATTACHMENT_UPLOAD';
  watermarkSnapshot?: null;
}

/** 稽核調閱事件（以 targetType 判別之聯集）——D 契約鎖定形狀。 */
/**
 * 角色／子分類異動（🔴 2026-08-25 角色自動化 delta，裁定 Q4.5）。
 *
 * `targetId`＝**被異動之帳號 id**（非操作者；操作者為 `actorId`）。
 * `targetName`＝人可讀之變更快照，建議格式 `舊角色 → 新角色`（子分類一併異動時附記），
 * 供 F024 明細直接呈現而不必回查帳號現值——帳號改名或再次異動後，本列仍能自證當時發生了什麼。
 *
 * ⚠ **本事件涵蓋手動與自動兩種來源**，不另立第二種 actionType：
 * 兩者之差異在 `actorId`（手動＝操作者帳號；自動推導＝系統哨兵），而非動作本身。
 * 若日後需在 F024 分別篩選，應以 actorId 過濾，不得增生 actionType 變體。
 */
export interface AccountRoleAuditEvent extends AuditEventBase {
  targetType: 'ACCOUNT';
  actionType: 'ROLE_ASSIGNED';
}

/**
 * 🔴 教育訓練場次之登記／刪除（F042 `AC-18`／`AC-19`，E11 delta）。第 11 個變體；
 * 既有 10 個變體之形狀逐字不動。
 *
 * `targetId`＝`OJT_SESSION.id`；`documentId`／`orgCode` 為本變體**額外攜帶**之兩個維度
 * （比照 `AppendixAuditEvent` 之既有作法——判別聯集允許個別變體帶額外欄位）。
 * 🔴 `orgCode` 為本 delta 之 additive 欄位：沒有它，稽核只能回答「哪份文件的場次動了」，
 * 回答不了「哪個使用單位的」——而使用單位正是本 feature 的最小追蹤單位。
 * 🔒 `watermarkSnapshot` 以型別鎖為 `null`——登記／刪除**非浮水印動作**（`AC-18` 明訂），
 * 不依賴呼叫端記得傳 null。
 */
export interface OjtSessionAuditEvent extends AuditEventBase {
  targetType: 'OJT_SESSION';
  actionType: 'OJT_SESSION_UPLOAD' | 'OJT_SESSION_DELETE';
  /** 場次所屬文件（buildAuditRow 之本分支直接落至 AUDIT_LOG.documentId）。 */
  documentId: string;
  /** 場次所屬使用單位（落至 AUDIT_LOG.orgCode，本 delta 之 additive 欄）。 */
  orgCode: string;
  watermarkSnapshot?: null;
}

export type AuditAccessEvent =
  | DocumentAuditEvent
  | UsageFormAuditEvent
  | LifecycleAuditEvent
  | DocumentChangeLogAuditEvent
  | LifecycleChangeLogAuditEvent
  | OrgChangeAlertAuditEvent
  | AppendixAuditEvent
  | AccessHistoryExportAuditEvent
  | DocumentAttachmentAuditEvent
  | AccountRoleAuditEvent
  | OjtSessionAuditEvent;

/**
 * 已物化之稽核列（append-only）。同時作為 AUDIT_LOG 落地列與 F024 查詢結果列。
 * 條件必填欄（documentId/lifecycleId/formId…）依 targetType 由 recordAccess 對映填入，其餘為 null。
 */
export interface AuditRow {
  id: string;
  accountId: string;
  employeeNo: string | null;
  name: string | null;
  company: string | null;
  department: string | null;
  section: string | null;
  roleCode: string | null;
  targetType: AuditTargetType;
  actionType: AuditActionType;
  documentId: string | null;
  documentNumber: string | null;
  lifecycleId: string | null;
  lifecycleName: string | null;
  formId: string | null;
  /**
   * F039 附錄 id（僅 targetType='APPENDIX' 之列非 null）。
   * **必填**（architecture-spec §3.6 決策三／§4.9「比照現行 formId／lifecycleId／documentId」）：
   * 該三個既有條件必填欄於各建構點皆顯式帶 null，非可省略；appendixId 走同一慣例，
   * 不另開選填先例。所有建構點（buildAuditRow／TypeOrmAuditStore.toRow）皆顯式填值。
   */
  appendixId: string | null;
  /**
   * 🔴 2026-08-25 角色自動化 delta：被異動之帳號 id（僅 targetType='ACCOUNT' 之列非 null）。
   * **必填**（顯式帶 null），沿用 documentId／lifecycleId／formId／appendixId 之既有慣例，
   * 不另開選填先例。所有建構點（buildAuditRow／TypeOrmAuditStore.toRow）皆顯式填值。
   */
  targetAccountId: string | null;
  /**
   * 🔴 F042 E11 delta（`AC-18`，`OQ-E11-13=B`）：場次所屬之使用單位代碼
   * （僅 targetType='OJT_SESSION' 之列非 null）。**獨立 migration**（新增*欄位*，
   * 與 D9 批「新增*列舉值* ⇒ 不需 migration」不同型）。
   *
   * ⚠ **宣告為選填（`?`）而非比照 `documentId`／`appendixId`／`targetAccountId` 之
   * 「必填、顯式帶 null」既有慣例**——本欄係對一個已上線且被多處以物件字面值建構之型別
   * 加欄；改必填會使既有建構點（含不屬本 feature 之測試檔）全數編譯失敗。
   * 生產端之兩個建構點（`buildAuditRow`／`TypeOrmAuditStore.toRow`）仍**顯式填值**，
   * 故實際落地列恆有本鍵。
   */
  orgCode?: string | null;
  /** 對象名稱／說明快照（供 F024 明細；非 data-model 現有欄，見 impl log flag）。 */
  targetName: string | null;
  watermarkSnapshot: string | null;
  occurredAt: Date;
  source: AuditSource;
}

/**
 * F024 類型篩選（前端顯示值）↔ targetType 集合（見 access-history-filter.kindToTargetTypes）。
 *
 * 🔴 D9 delta（`AC-N69`，`OQ-D9-34`）：additive 新增第四值「上傳」→ `DOCUMENT_ATTACHMENT`。
 * 既有三值之對映**逐字不變**（「文件」天然不含上傳事件——分類學污染防線之「排除」面）。
 */
/**
 * 🔴 F042 E11 delta（`AC-J23`，`OQ-E11-17` 覆核核可）：additive 新增第五值「OJT 場次」→
 * `OJT_SESSION`。既有四值之對映**逐字不變**——「上傳」仍獨佔 `DOCUMENT_ATTACHMENT`
 * （`AUDIT_LOG` 為 append-only，E11 上線前之歷史上傳列永久存在且本頁仍須渲染）。
 */
export type AuditKind = '文件' | '循環' | '變更' | '上傳' | 'OJT 場次';

/**
 * 已正規化之查詢規格（OQ-AQ-01）。將 AuditQueryFilters 收斂為「可下推至 SQL WHERE/ORDER/OFFSET」之形狀：
 *  - kind → targetTypes（IN 清單，null＝全類型）；
 *  - 空條件 → from 為近 30 天前本地日字串、appliedDefaultRange=true；
 *  - person/target 已 trim＋轉小寫（供 LOWER(...) LIKE 比對）；
 *  - page/pageSize 已套預設（1 / 50）。
 * SQL 下推（TypeOrmAuditStore.queryPage）與記憶體版（resolveAuditQuery）共用同一 resolveAuditQuerySpec，
 * 確保兩路徑對相同 filters 產生一致結果。
 */
export interface ResolvedAuditQuery {
  targetTypes: AuditTargetType[] | null;
  person?: string;
  target?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  appliedDefaultRange: boolean;
}

/** F024 查詢篩選（任意組合；空條件套用近 30 天預設，非阻斷）。 */
export interface AuditQueryFilters {
  kind?: AuditKind | '';
  /** 人員：姓名或員工編號子字串（不分大小寫）。 */
  person?: string;
  /** 對象：文件編號／名稱、循環名稱／說明子字串（不分大小寫）。 */
  target?: string;
  /** 起始日期（YYYY-MM-DD，含當日）。 */
  from?: string;
  /** 結束日期（YYYY-MM-DD，含當日）。 */
  to?: string;
  /** 1-based 頁碼，預設 1。 */
  page?: number;
  /** 每頁筆數，預設 50（prototype 17）。 */
  pageSize?: number;
}

/** 查詢範圍（SysAdmin/ICSOPAdmin 皆全公司；保留參數以利日後多公司分權，開放問題#6）。 */
export interface AuditQueryScope {
  company?: string | 'ALL';
}

/** 分頁結果。appliedDefaultRange＝伺服器因空條件套用近 30 天預設（供前端提示）。 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  appliedDefaultRange: boolean;
}

/**
 * 稽核最終儲存（AUDIT_LOG）。⚠ 結構上不暴露任何 update/delete/remove 方法（decision E，AC5 第一層）；
 * DB 層 REVOKE UPDATE/DELETE 為第二層（[integration]）。
 */
export interface AuditStore {
  /** append-only 寫入；以 row.id 冪等（已存在則 no-op，供 outbox 重試重疊，AC4/§5.6）。 */
  append(row: AuditRow): Promise<void>;
  findById(id: string): Promise<AuditRow | null>;
  /**
   * ⚠ 全表載回（無 WHERE）——僅供不可竄改結構性防禦之對照與相容保留；**非 F024 查詢路徑**。
   * F024 查詢一律走 queryPage（下推），避免隨 NFR-003（保留 ≥3 年）累積而 OOM／全表掃描（OQ-AQ-01）。
   */
  listAll(scope: AuditQueryScope): Promise<AuditRow[]>;
  /**
   * F024 查詢（OQ-AQ-01 下推）：kind→targetType IN、occurredAt 範圍、person/target 之 LIKE、
   * ORDER BY occurredAt DESC、OFFSET/FETCH 分頁與 total 皆於 SQL 完成，僅回傳當頁列。
   * 正規化（近 30 天預設、kind 對映、分頁預設）由 resolveAuditQuerySpec 共用（見 access-history-filter）。
   */
  queryPage(scope: AuditQueryScope, filters: AuditQueryFilters): Promise<Page<AuditRow>>;
}

/** Outbox 暫存列（內部表；非對外實體，data-model 未列 schema）。 */
export interface AuditOutboxRecord {
  /** 冪等鍵＝對應 AuditRow.id。 */
  id: string;
  row: AuditRow;
  status: 'pending' | 'done';
  attempts: number;
}

/** 補償佇列（Outbox）。recordAccess 先入此表（非阻斷），processOutboxRetry 搬遷至 AuditStore。 */
export interface AuditOutboxStore {
  enqueue(row: AuditRow): Promise<void>;
  listPending(): Promise<AuditOutboxRecord[]>;
  /** 搬遷成功後標記完成／移除（以 outbox id）。 */
  markDone(id: string): Promise<void>;
}

/** AuditWriter 共用契約（D，lock this）。 */
export interface AuditWriter {
  /** 記錄一次調閱（append-only，經 outbox 非阻斷入列）。 */
  recordAccess(event: AuditAccessEvent): Promise<void>;
  /** F024 查詢（篩選/排序/分頁/近 30 天預設）。 */
  queryHistory(
    scope: AuditQueryScope,
    filters: AuditQueryFilters,
  ): Promise<Page<AuditRow>>;
  /** Outbox 補償重試（搬遷 pending → AuditStore，冪等、部分失敗不中斷整批）。 */
  processOutboxRetry(): Promise<void>;
}

/**
 * targetId 依 targetType 必填卻未帶 → 400 AUDIT_TARGET_REF_REQUIRED（audit worktree 定案，
 * 覆蓋 F023-test.md 暫定名 AUDIT_TARGET_FIELD_REQUIRED；需 architect 補入 error-handling.md）。
 */
export class AuditTargetRefRequiredError extends BadRequestException {
  constructor() {
    super('AUDIT_TARGET_REF_REQUIRED');
  }
}

/** DI symbols。 */
export const AUDIT_STORE = Symbol('AUDIT_STORE');
export const AUDIT_OUTBOX_STORE = Symbol('AUDIT_OUTBOX_STORE');
