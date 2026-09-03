import { Injectable, Logger } from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import { resolveCompanyName } from '../org-directory/company-name';
import { WatermarkSession } from '../public/watermark.service';
import { PdfBurner } from '../public/pdf-burner';
import { LifecycleWatermarkBuilder } from '../lifecycle/lifecycle-watermark';
import { LifecycleChangeHistoryPdfRenderer } from '../lifecycle/lifecycle-change-history-pdf';
import { buildTreeLayout, TreeLayout } from '../lifecycle/lifecycle-tree-layout';
import { SnapshotGraph } from '../lifecycle/lifecycle-snapshot-builder';
import {
  BusinessCategoryDiff,
  computeBusinessCategoryDiff,
  reconstructBusinessCategoryBeforeAfter,
} from '../lifecycle/business-category-change-diff';
import { BusinessCategoryChangeLogStore } from '../change-history/business-category-change-log.store';
import { BusinessCategorySnapshotStore } from '../change-history/business-category-snapshot.store';
import { BusinessCategoryStore } from './business-category.store';
import { BusinessCategoryGraph } from './business-category-dag.store';
import {
  BusinessCategoryIdentityView,
  BusinessCategoryPreviewNode,
} from './business-category-preview.service';
import { businessCategoryDisplayName } from './business-category-subcategory';

/** 雙頁新舊對照 PDF 渲染之 DI token（介面本體重用 lifecycle 側之既有結構型契約）。 */
export const BUSINESS_CATEGORY_CHANGE_HISTORY_PDF_RENDERER = Symbol(
  'BUSINESS_CATEGORY_CHANGE_HISTORY_PDF_RENDERER',
);

export interface BusinessCategoryTreeDiffResult {
  /** 🔴 `name` 為**原始名稱**、`subcategory` 獨立成欄（前端會再組一次顯示名，見 §丁 同一註解）。 */
  businessCategory: BusinessCategoryIdentityView;
  before: { nodes: BusinessCategoryPreviewNode[]; edges: BusinessCategoryGraph['edges'] };
  after: { nodes: BusinessCategoryPreviewNode[]; edges: BusinessCategoryGraph['edges'] };
  diff: BusinessCategoryDiff;
  /** 伺服器端組裝之浮水印快照（與 §丁 同一 `buildSnapshot` 來源）。 */
  watermark: string;
}

/**
 * 類別本體已刪除但變更日誌仍存在（`AC-12` 允許刪除已無掛載之類別）之名稱佔位。
 *
 * 🟢 **2026-09-03 lead 裁決之逐字值**：與變更歷程清單／CSV 第 1 欄之退化文字**共用同一基底措辭**。
 * 📝 原值逐字保留供追溯：`OLD>` `'（類別已刪除）'`
 *
 * 🔴 **本處刻意無 id 後綴，清單／CSV 刻意有**——差異是功能性的，不是漏收斂：
 *   - 本畫面（tree-diff）scope 已鎖定**單一**類別之單一事件，掛 id 只是噪音；
 *   - 清單／CSV 同一畫面可能並列**多個**不同的已刪類別，沒有 id 片段就分不出彼此。
 *   兩者之**基底措辭**必須一致（使用者會從清單點進對照預覽，同一個東西不得有兩種說法）——
 *   此不變式由 `business-category-change-diff.service.spec.ts` 之「跨模組基底措辭一致性」以
 *   **比對兩處實際輸出**（而非各自比對字面常數）釘住，任一處單邊改字即紅。
 *
 * 🔒 **不得順手同步到循環側（F038）**：使用者僅裁決修本功能，改動 `lifecycle-*` 會牴觸
 *   `AC-49`（循環管理零漣漪）。
 */
const DELETED_CATEGORY_NAME = '已刪除之類別';

/**
 * F043 `AC-41` 業務/功能類別結構變更歷程 · 新舊對照服務（重建 ＋ 雙頁下載燒錄）。
 *  - `preview`：重建 before/after 快照＋diff＋浮水印快照（純資料）。**不記稽核**——
 *    第三個 tab 之檢視稽核由 `BusinessCategoryChangeHistoryService.viewBusinessCategory()` 記錄，
 *    此處再記一筆會重複計數。
 *  - `download`：before/after 各自佈局 → 雙頁基底 PDF → 既有 `PdfBurner` 燒錄浮水印 →
 *    記一筆 `BUSINESS_CATEGORY_CHANGELOG_DOWNLOAD`（非阻斷）。
 *  - 類別本體已刪除但變更日誌仍存在 → 名稱佔位、**不整體 404**（稽核可追溯性優先）。
 */
@Injectable()
export class BusinessCategoryChangeDiffService {
  private readonly logger = new Logger(BusinessCategoryChangeDiffService.name);

  constructor(
    private readonly logStore: BusinessCategoryChangeLogStore,
    private readonly snapStore: BusinessCategorySnapshotStore,
    private readonly categories: BusinessCategoryStore,
    private readonly watermark: LifecycleWatermarkBuilder,
    private readonly renderer: LifecycleChangeHistoryPdfRenderer,
    private readonly burner: PdfBurner,
    private readonly auditWriter: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** 新舊對照 JSON 資料（不記稽核）。 */
  async preview(
    session: WatermarkSession,
    businessCategoryId: string,
    changeLogId: string,
  ): Promise<BusinessCategoryTreeDiffResult> {
    const { before, after } = await reconstructBusinessCategoryBeforeAfter(
      this.logStore,
      this.snapStore,
      businessCategoryId,
      changeLogId,
    );
    const diff = computeBusinessCategoryDiff(before, after);
    const { snapshot } = await this.watermark.buildSnapshot(session);
    const bc = await this.resolveCategory(businessCategoryId);
    return {
      businessCategory: bc,
      before: toCategoryGraph(before, businessCategoryId),
      after: toCategoryGraph(after, businessCategoryId),
      diff,
      watermark: snapshot,
    };
  }

  /** 雙頁已燒錄浮水印之 PDF；記 `BUSINESS_CATEGORY_CHANGELOG_DOWNLOAD` 稽核（非阻斷）。 */
  async download(
    session: WatermarkSession,
    businessCategoryId: string,
    changeLogId: string,
  ): Promise<{ pdf: Buffer; snapshot: string; categoryName: string }> {
    const { before, after } = await reconstructBusinessCategoryBeforeAfter(
      this.logStore,
      this.snapStore,
      businessCategoryId,
      changeLogId,
    );
    const diff = computeBusinessCategoryDiff(before, after);
    const { snapshot, fields } = await this.watermark.buildSnapshot(session);
    const bc = await this.resolveCategory(businessCategoryId);
    // PDF 頁首標題與稽核快照一律用**顯示名稱**（含子分類）。
    const displayName = businessCategoryDisplayName(bc);
    // before/after 各自獨立分層（節點集合可能不同）。
    const base = await this.renderer.render({
      lifecycleName: displayName,
      beforeLayout: toLayout(before),
      afterLayout: toLayout(after),
      diff,
    });
    const pdf = await this.burner.burnPdf(base, snapshot);
    await this.audit(session, bc, fields);
    return { pdf, snapshot, categoryName: displayName };
  }

  /**
   * 🔴 回**原始** `name` ＋獨立 `subcategory`（前端會再組一次顯示名）。
   * 類別本體已刪除但變更日誌仍存在 → 名稱佔位、**不整體 404**（稽核可追溯性優先）。
   */
  private async resolveCategory(
    businessCategoryId: string,
  ): Promise<BusinessCategoryIdentityView> {
    const bc = await this.categories.findById(businessCategoryId);
    return bc
      ? { id: businessCategoryId, name: bc.name, subcategory: bc.subcategory ?? null }
      : { id: businessCategoryId, name: DELETED_CATEGORY_NAME, subcategory: null };
  }

  private async audit(
    session: WatermarkSession,
    bc: BusinessCategoryIdentityView,
    fields: { companyFullName: string; departmentFullName: string; sectionName: string },
  ): Promise<void> {
    // 🔒 名稱快照經 `businessCategoryDisplayName`（含子分類），使 F024 之事件可唯一辨識所屬類別。
    const displayName = businessCategoryDisplayName(bc);
    try {
      await this.auditWriter.recordAccess({
        targetType: 'BUSINESS_CATEGORY_CHANGE_LOG',
        actionType: 'BUSINESS_CATEGORY_CHANGELOG_DOWNLOAD',
        actorId: session.accountId,
        actorName: session.name ?? null,
        employeeNo: session.employeeNo ?? null,
        // 🔒 F024 調閱歷程之公司欄恆為**全稱**（不得沿用已改為簡稱之 `fields.companyFullName`）。
        company: resolveCompanyName(session.companyCode) ?? null,
        department: fields.departmentFullName || null,
        section: fields.sectionName || null,
        roleCode: session.roleCode ?? null,
        targetId: bc.id,
        targetNumber: displayName,
        targetName: displayName,
        occurredAt: this.clock(),
      });
    } catch (err) {
      this.logger.error(
        `業務/功能類別變更歷程下載稽核記錄失敗（已吞，不阻斷）businessCategory=${bc.id}: ${
          (err as Error)?.message
        }`,
      );
    }
  }
}

/**
 * 快照圖 → 前端可直接渲染之形狀。
 * 🔴 節點之掛載數屬性名為 **`mountedDocCount`**（與 §丁 預覽頁一致）——前台之 `visibleDocCount`
 * 是**已套可見性過濾**之數字，語意不同，明文不得共用同一屬性名。
 */
function toCategoryGraph(
  g: SnapshotGraph,
  businessCategoryId: string,
): { nodes: BusinessCategoryPreviewNode[]; edges: BusinessCategoryGraph['edges'] } {
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id,
      businessCategoryId,
      name: n.name,
      positionX: n.positionX,
      positionY: n.positionY,
      mountedDocCount: n.docs.length,
    })),
    edges: g.edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
    })),
  };
}

function toLayout(g: SnapshotGraph): TreeLayout {
  return buildTreeLayout(
    g.nodes.map((n) => ({ id: n.id, name: n.name, docCount: n.docs.length })),
    g.edges.map((e) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
  );
}
