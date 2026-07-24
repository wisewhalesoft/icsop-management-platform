/**
 * F006 組織異動影響提示 · 型別與 IO 邊界契約（純宣告，無邏輯）。
 *
 * 設計依據：docs/specs/test-design/F006-test-design.md D1（單表＋alertKind 判別欄）、
 * D3（去重鍵）、D4（Route A 自動／Route B 手動處理）、D7（KPI）。
 *
 * ⚠ affectedField 之值**逐字沿用** F026 之 `FieldKey`（`rbac/field-matrix.ts`），
 *   不另造平行命名（制定公司／制定部門／制定室別／當責室長-主要／當責室長-次要／文件使用部門）。
 */

import { NormalizedOrgUnit, NormalizedAccount } from '../org-sync/normalization';
import { ExistingOrgUnit, ExistingAccount } from '../org-sync/change-classification';

/** 提示種類（判別欄）。 */
export type AlertKind = 'DOCUMENT_FIELD' | 'CLOSED_DEPT_PERSON';

/** 提示生命週期狀態。 */
export type AlertStatus = 'pending' | 'resolved';

/** 處理方式：Route A（欄位已更新，自動）／Route B（已確認無需變更，手動）。 */
export type ResolutionKind = 'FIELD_UPDATED' | 'NO_CHANGE_NEEDED';

/**
 * 已落地之提示列（＝查詢端點回傳形狀）。
 * DOCUMENT_FIELD 使用 documentId/documentNumber/documentName/affectedField/before/after；
 * CLOSED_DEPT_PERSON 使用 person 與 dept 系列欄位，documentId/affectedField 恆為 null。
 */
export interface AlertRow {
  id: string;
  alertKind: AlertKind;
  documentId: string | null;
  documentNumber: string | null;
  documentName: string | null;
  affectedField: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  personEmployeeNo: string | null;
  personName: string | null;
  deptOrgCode: string | null;
  deptName: string | null;
  deptCloseDate: Date | null;
  status: AlertStatus;
  resolutionKind: ResolutionKind | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  sourceSyncRunId: string | null;
}

/** 待建立之提示（純函式產出；id/status 由 store 於落地時補齊）。 */
export type AlertCreateCommand = Omit<
  AlertRow,
  'id' | 'status' | 'resolutionKind' | 'resolvedBy' | 'resolvedAt'
>;

/** 文件之組織/當責關聯快照（比對用輕量索引；文件量 ~600，全量載入後於記憶體比對）。 */
export interface DocumentAlertRef {
  documentId: string;
  documentNumber: string;
  documentName: string;
  draftingCompanyId: string | null;
  draftingDeptId: string | null;
  draftingSectionId: string | null;
  primaryChiefId: string | null;
  secondaryChiefIds: string[];
  usingDeptIds: string[];
}

/** 組織單位當下狀態（同步後）；closeDate 供 §7.3 提示之「部門關閉日期」。 */
export interface OrgUnitSnapshot {
  orgCode: string;
  name: string;
  descFull: string | null;
  isActive: boolean;
  managerEmpNo: string | null;
  closeDate: Date | null;
}

/** 在職帳號快照（§7.3 全量掃描對象）。 */
export interface ActiveAccountRef {
  employeeNo: string | null;
  name: string | null;
  orgCode: string | null;
  status: 'active' | 'disabled';
}

/** DOCUMENT_FIELD 提示產生之輸入（全部來自同步引擎已算出之物件，不重新查庫）。 */
export interface AlertGenerationInput {
  /** 本次同步判定為 update 之組織單位（同步後值）。 */
  orgUpdates: NormalizedOrgUnit[];
  /** 同步前組織單位快照（key=orgCode）。 */
  orgBefore: Map<string, ExistingOrgUnit>;
  /** 同步後全量組織單位（key=orgCode），供顯示名稱解析。 */
  orgAfter: Map<string, OrgUnitSnapshot>;
  /** 本次同步判定為 update 之帳號（同步後值）。 */
  accountUpdates: NormalizedAccount[];
  /** 同步前帳號快照（key=loginId）。 */
  existingAcc: Map<string, ExistingAccount>;
  /** 文件關聯索引（全量）。 */
  documents: DocumentAlertRef[];
  /** 既有 pending 提示之自然鍵集合（`documentId|affectedField`）。 */
  existingPendingKeys: Set<string>;
  createdAt: Date;
  sourceSyncRunId: string | null;
}

/** CLOSED_DEPT_PERSON 提示偵測之輸入（同步後全量掃描）。 */
export interface ClosedDeptDetectionInput {
  activeAccounts: ActiveAccountRef[];
  orgUnits: Map<string, OrgUnitSnapshot>;
  /** 既有 pending 之員編集合（去重第一道防線，AC10）。 */
  existingPendingEmployeeNos: Set<string>;
  createdAt: Date;
  sourceSyncRunId: string | null;
}

/** 本月異動統計（KPI 前三張卡；來源＝SYNC_RUN 之細分欄位）。 */
export interface MonthlyAccountStats {
  created: number;
  updated: number;
  disabled: number;
}

/** GET /admin/org-sync/monthly-summary 回應。 */
export interface MonthlySummary {
  month: string;
  newPersonCount: number;
  updatedCount: number;
  departedDisabledCount: number;
  pendingChiefAlertCount: number;
}

/** 解除提示之 patch。 */
export interface AlertResolvePatch {
  resolvedBy: string | null;
  resolvedAt: Date;
  resolutionKind: ResolutionKind;
}

/** ORG_CHANGE_ALERT 之持久化邊界（可注入 fake）。 */
export interface OrgChangeAlertStore {
  /** 依狀態列出（依 createdAt 由舊到新）。 */
  listByStatus(status: AlertStatus): Promise<AlertRow[]>;
  findById(id: string): Promise<AlertRow | null>;
  /** 某文件之全部 pending 提示（Route A 自動解除用）。 */
  findPendingByDocument(documentId: string): Promise<AlertRow[]>;
  insertMany(commands: AlertCreateCommand[]): Promise<void>;
  resolve(id: string, patch: AlertResolvePatch): Promise<void>;
  /** 本月 SYNC_RUN 之帳號異動細分加總（NULL 視為 0）。 */
  monthlyAccountStats(from: Date, to: Date): Promise<MonthlyAccountStats>;
  /** pending 之「當責室長-主要/次要」提示筆數（KPI 第 4 張卡）。 */
  pendingChiefAlertCount(): Promise<number>;
  /** §7.3 全量掃描來源：同步後在職（上游）帳號。 */
  listActiveAccounts(companyCode: string): Promise<ActiveAccountRef[]>;
  /** 文件關聯索引（全量）。 */
  listDocumentRefs(): Promise<DocumentAlertRef[]>;
}

/** DI token。 */
export const ORG_CHANGE_ALERT_STORE = Symbol('ORG_CHANGE_ALERT_STORE');
