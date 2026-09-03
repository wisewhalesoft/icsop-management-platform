import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import {
  BUSINESS_CATEGORY_CHANGE_LOG_STORE,
  BusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogStore,
} from './business-category-change-log.store';
import {
  BusinessCategoryChangeFilters,
  filterBusinessCategoryChanges,
} from './business-category-change-query';
import { businessCategoryChangeKindLabel } from './business-category-change-labels';
import { actorLabel } from './change-labels';
import { ChangeExportResult, ChangeHistoryActor } from './document-change-history.service';
import {
  CsvColumn,
  EXPORT_ROW_LIMIT,
  assertExportRowLimit,
  exportFileName,
  formatExportTimestamp,
  toCsvBuffer,
} from '../storage/csv-export';
import {
  BUSINESS_CATEGORY_DISPLAY_NAMES,
  BusinessCategoryDisplayNames,
} from './business-category-display-names';

/**
 * F043 `AC-42` 匯出之**五欄**（沿用循環樹狀圖 tab 之欄位結構，第三個 tab 同構）。
 * 「業務/功能類別」之值為已解析之顯示名稱（含子分類），**非 `businessCategoryId`**。
 */
type BusinessCategoryExportRow = BusinessCategoryChangeLogRow & {
  businessCategoryDisplayName: string | null;
};

/**
 * 清單／明細之回應列：日誌列 ＋ **已解析之類別顯示名稱**。
 *
 * 🔴 `businessCategoryDisplayName` 由後端 join `BUSINESS_CATEGORY` 取**當前值**組出——
 * 前端不得自行以 `name`／`subcategory` 串接，否則全站會出現第二套組字規則（`AC-42` 同一理由）。
 * 查無（類別已刪除）→ 退回 id，使該列仍可被辨識而非顯示空白。
 */
/**
 * 🔴 `businessCategoryDisplayName` 為**必然有值之字串**——解析不到名稱時退回 `businessCategoryId`
 * （見 `withDisplayNames`），故此處**不可為 `null`**。
 * 與上方匯出列之 `string | null` 刻意不同：匯出容許空儲存格，清單不得出現空白欄。
 */
export type BusinessCategoryChangeView = BusinessCategoryChangeLogRow & {
  businessCategoryDisplayName: string;
};

const BC_EXPORT_COLUMNS: CsvColumn<BusinessCategoryExportRow>[] = [
  { header: '業務/功能類別', value: (r) => r.businessCategoryDisplayName },
  /**
   * 🔴 `AC-39`／`AC-42`：輸出**畫面所見之中文標籤**，不得輸出列舉代碼（`DOCUMENT_MOUNTED`）；
   * 且 `新增掛載`／`移除掛載` 於 CSV 必為**兩個相異儲存格值**——本表刻意不共用循環側之
   * `lifecycleChangeKindLabel`（該表把掛載／改派／移除三鍵收斂為同一字串）。
   */
  { header: '變更類型', value: (r) => businessCategoryChangeKindLabel(r.changeType) },
  { header: '變更摘要', value: (r) => r.summary },
  { header: '操作人', value: (r) => actorLabel(r.actorName, r.actorEmployeeNo) },
  { header: '時間', value: (r) => formatExportTimestamp(r.occurredAt) },
];

/**
 * F043 §戊 業務/功能類別結構變更歷程查詢服務（第三個 tab）。
 *  - `queryChanges`：載入全部 → 純函式篩選／排序（新→舊）。清單為篩選操作，**不寫稽核**。
 *  - `viewBusinessCategory`：某類別之結構變更列 ＋ 記一筆 `BUSINESS_CATEGORY_CHANGELOG_VIEW`。
 *  - `exportChanges`：`AC-42` CSV 匯出，規則**全數向 error-handling.md#export 之共用規則對齊**
 *    （本處為第六處，不得反過來改共用規則）；🔒 不新增任何錯誤碼。
 *
 * 🔴 本服務之端點閘門為 **`DOCUMENT_CHANGE_HISTORY` read**（`AC-54`），不是
 * `BUSINESS_CATEGORY_MANAGEMENT`——後者對主管為唯讀，用錯會架空「主管看不到任何一個 tab」。
 * 該閘門宣告於 `change-history.controller.ts`，不在本服務。
 */
@Injectable()
export class BusinessCategoryChangeHistoryService {
  constructor(
    @Inject(BUSINESS_CATEGORY_CHANGE_LOG_STORE)
    private readonly store: BusinessCategoryChangeLogStore,
    @Optional() private readonly audit?: AuditWriterService,
    @Optional() private readonly clock: () => Date = () => new Date(),
    /**
     * `AC-42`：「業務/功能類別」欄之值須以 `businessCategoryId` join `BUSINESS_CATEGORY` 取
     * **當前值**經 `businessCategoryDisplayName` 組合，**非** id 本身。
     * 選填以免破壞既有純建構單測（無 → 退回 id）。
     */
    @Optional()
    @Inject(BUSINESS_CATEGORY_DISPLAY_NAMES)
    private readonly names?: BusinessCategoryDisplayNames,
  ) {}

  /**
   * `AC-42` 匯出符合當前查詢條件之全部事件為 CSV。
   * 取列策略與稽核義務見 `LifecycleChangeHistoryService.exportChanges`（同一組共用規則），
   * 差別僅在欄位結構與 `BUSINESS_CATEGORY_CHANGELOG_VIEW` 之 actionType。
   */
  async exportChanges(
    filters: BusinessCategoryChangeFilters,
    actor?: ChangeHistoryActor,
  ): Promise<ChangeExportResult> {
    const { countByFilters, listByFilters } = this.store;
    if (!countByFilters || !listByFilters) {
      throw new Error('EXPORT_NOT_SUPPORTED: store 未提供 countByFilters／listByFilters');
    }
    // 🔴 COUNT 下推：超限時**不呼叫** listAll()／listByFilters()（不產生任何檔案、不載回全表）。
    assertExportRowLimit(await countByFilters.call(this.store, filters));
    const rows = await listByFilters.call(this.store, filters, EXPORT_ROW_LIMIT + 1);
    assertExportRowLimit(rows.length); // 競態第二道
    const sorted = filterBusinessCategoryChanges(rows, filters);

    const ids = [...new Set(sorted.map((r) => r.businessCategoryId).filter(Boolean))];
    const nameMap = this.names
      ? await this.names.findDisplayNamesByIds(ids)
      : new Map<string, string>();
    const items: BusinessCategoryExportRow[] = sorted.map((r) => ({
      ...r,
      businessCategoryDisplayName: nameMap.get(r.businessCategoryId) ?? r.businessCategoryId,
    }));

    const csv = toCsvBuffer(items, BC_EXPORT_COLUMNS);
    const now = this.clock();
    await this.recordExportAudit(items, actor, now);
    return { csv, fileName: exportFileName('business_category_change_history', now) };
  }

  /**
   * 記一筆 `BUSINESS_CATEGORY_CHANGELOG_VIEW`（**非** `_DOWNLOAD`——比照循環側 tab 之既有先例：
   * 匯出屬「看了這批資料」而非「取走一份燒錄檔」）；失敗不阻斷匯出。
   */
  private async recordExportAudit(
    items: BusinessCategoryExportRow[],
    actor: ChangeHistoryActor | undefined,
    now: Date,
  ): Promise<void> {
    if (!this.audit || !actor) return;
    const latest = items[0];
    try {
      await this.audit.recordAccess({
        targetType: 'BUSINESS_CATEGORY_CHANGE_LOG',
        actionType: 'BUSINESS_CATEGORY_CHANGELOG_VIEW',
        actorId: actor.accountId,
        actorName: actor.name ?? null,
        employeeNo: actor.employeeNo ?? null,
        company: actor.company ?? null,
        department: actor.department ?? null,
        section: actor.section ?? null,
        roleCode: actor.roleCode ?? null,
        targetId: latest?.businessCategoryId ?? '',
        targetNumber: latest?.businessCategoryDisplayName ?? null,
        targetName: latest?.businessCategoryDisplayName ?? null,
        occurredAt: now,
      });
    } catch {
      // 稽核寫入失敗不阻斷匯出（比照 F023 補償佇列）。
    }
  }

  /**
   * `AC-40`：依 `類別`／`期間`／`變更類型` 查詢事件清單（新→舊）。清單為篩選操作，**不寫稽核**。
   *
   * 每列富化 `businessCategoryDisplayName`（以 `businessCategoryId` join 取**當前值**）：
   * 🔴 清單頁之「業務/功能類別」欄不得顯示裸 id，也不得由前端自行串接名稱與子分類——
   * 那會產生第二套組字規則。**單次批次查詢**，往返數與列數無關。
   */
  async queryChanges(
    filters: BusinessCategoryChangeFilters,
  ): Promise<{ items: BusinessCategoryChangeView[]; total: number }> {
    const all = await this.store.listAll();
    const items = await this.withDisplayNames(filterBusinessCategoryChanges(all, filters));
    return { items, total: items.length };
  }

  /** 批次補上 `businessCategoryDisplayName`；無 names adapter（純建構單測）→ 退回 id。 */
  private async withDisplayNames(
    rows: BusinessCategoryChangeLogRow[],
  ): Promise<BusinessCategoryChangeView[]> {
    const ids = [...new Set(rows.map((r) => r.businessCategoryId).filter(Boolean))];
    const nameMap =
      this.names && ids.length > 0
        ? await this.names.findDisplayNamesByIds(ids)
        : new Map<string, string>();
    return rows.map((r) => ({
      ...r,
      businessCategoryDisplayName: nameMap.get(r.businessCategoryId) ?? r.businessCategoryId,
    }));
  }

  /** 預覽某類別之結構變更 ＋ 記 `BUSINESS_CATEGORY_CHANGELOG_VIEW` 稽核（決策 E3）。 */
  async viewBusinessCategory(
    businessCategoryId: string,
    displayName?: string | null,
    actor?: ChangeHistoryActor,
  ): Promise<{ items: BusinessCategoryChangeView[] }> {
    const rows = await this.store.listByBusinessCategory(businessCategoryId);
    const items = await this.withDisplayNames(
      rows.slice().sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()),
    );

    if (this.audit && actor) {
      await this.audit.recordAccess({
        targetType: 'BUSINESS_CATEGORY_CHANGE_LOG',
        actionType: 'BUSINESS_CATEGORY_CHANGELOG_VIEW',
        actorId: actor.accountId,
        actorName: actor.name ?? null,
        employeeNo: actor.employeeNo ?? null,
        company: actor.company ?? null,
        department: actor.department ?? null,
        section: actor.section ?? null,
        roleCode: actor.roleCode ?? null,
        targetId: businessCategoryId,
        targetNumber: displayName ?? null,
        // F024「對象名稱」欄＝類別顯示名稱（含子分類），使歷史事件可唯一辨識所屬類別。
        targetName: displayName ?? null,
        occurredAt: this.clock(),
      });
    }
    return { items };
  }
}
