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
  | 'APPENDIX';

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
  | 'ALERT_RESOLVED';

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
/** 使用表單下載（F018，浮水印動作）。targetId＝使用表單附件 id。 */
export interface UsageFormAuditEvent extends AuditEventBase {
  targetType: 'USAGE_FORM';
  actionType: 'VIEW' | 'DOWNLOAD' | 'PRINT';
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
  /** 下載來源之文件 id（必填；buildAuditRow 之 APPENDIX 分支直接落至 AUDIT_LOG.documentId）。 */
  documentId: string;
}

/** 稽核調閱事件（以 targetType 判別之聯集）——D 契約鎖定形狀。 */
export type AuditAccessEvent =
  | DocumentAuditEvent
  | UsageFormAuditEvent
  | LifecycleAuditEvent
  | DocumentChangeLogAuditEvent
  | LifecycleChangeLogAuditEvent
  | OrgChangeAlertAuditEvent
  | AppendixAuditEvent;

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
   * F039 附錄 id（僅 targetType='APPENDIX' 之列非 null，比照 formId 之條件必填語意）。
   * ⚠ 宣告為**選填**（非 architecture-spec §3.6 決策三字面之必填）：既有列建構點（如
   * access-history-filter 之測試夾具、外部 Outbox 反序列化之舊列）不帶此鍵，宣告為必填會使
   * 既有 6 種 targetType 之呼叫端全面破裂——違反該決策自身「additive、既有語意不變」之要求。
   * 生產路徑（buildAuditRow／TypeOrmAuditStore.toRow）一律顯式填入（非 APPENDIX 列為 null）。
   */
  appendixId?: string | null;
  /** 對象名稱／說明快照（供 F024 明細；非 data-model 現有欄，見 impl log flag）。 */
  targetName: string | null;
  watermarkSnapshot: string | null;
  occurredAt: Date;
  source: AuditSource;
}

/** F024 類型篩選（前端顯示值）↔ targetType 集合（見 access-history-filter.kindToTargetTypes）。 */
export type AuditKind = '文件' | '循環' | '變更';

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
