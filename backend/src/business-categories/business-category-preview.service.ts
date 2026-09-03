import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import { resolveCompanyName } from '../org-directory/company-name';
import { WatermarkSession } from '../public/watermark.service';
import { PdfBurner } from '../public/pdf-burner';
import { LifecycleWatermarkBuilder } from '../lifecycle/lifecycle-watermark';
import { LifecycleTreePdfRenderer } from '../lifecycle/lifecycle-tree-pdf';
import { buildTreeLayout } from '../lifecycle/lifecycle-tree-layout';
import { buildPrintGeometry } from '../lifecycle/lifecycle-tree-print-layout';
import {
  BusinessCategoryDagStore,
  BusinessCategoryGraph,
} from './business-category-dag.store';
import { BusinessCategoryStore } from './business-category.store';
import { businessCategoryDisplayName } from './business-category-subcategory';

/**
 * 浮水印建構與樹狀圖 PDF 渲染之 DI token。
 *
 * 🔴 **介面本體逐字重用 lifecycle 側之既有型別**（`LifecycleWatermarkBuilder`／
 * `LifecycleTreePdfRenderer`）：兩者皆為零 LIFECYCLE 耦合之結構型契約（前者結構相容
 * `WatermarkService.buildSnapshot`，後者只吃 `{ 標題字串, TreeLayout }`），另建一份同形狀的
 * 介面只會製造第二個維護點。**token 則各自獨立**——綁定是模組層之決定，不共用可避免
 * `BusinessCategoriesModule` 反向依賴 `LifecycleModule`。
 */
export const BUSINESS_CATEGORY_WATERMARK_BUILDER = Symbol(
  'BUSINESS_CATEGORY_WATERMARK_BUILDER',
);
export const BUSINESS_CATEGORY_TREE_PDF_RENDERER = Symbol(
  'BUSINESS_CATEGORY_TREE_PDF_RENDERER',
);

/**
 * 類別身分（🔴 `name` 為**原始名稱**、`subcategory` 獨立成欄）。
 *
 * 🔴 **不得把 `businessCategoryDisplayName()` 之輸出塞進 `name`**：前端會再對本物件呼叫一次
 * `businessCategoryDisplayName()` 組標題，塞了顯示名會渲染成 `授信（消金）（消金）`。
 * 稽核快照另行以顯示名記錄（見 `audit()`），兩者是不同用途。
 */
export interface BusinessCategoryIdentityView {
  id: string;
  name: string;
  subcategory: string | null;
}

/** 預覽頁之節點（`mountedDocCount`＝**全部**掛載數；前台之 `visibleDocCount` 語意不同，不得共用屬性名）。 */
export interface BusinessCategoryPreviewNode {
  id: string;
  businessCategoryId: string;
  name: string | null;
  positionX: number;
  positionY: number;
  mountedDocCount: number;
}

export interface BusinessCategoryTreePreviewResult {
  businessCategory: BusinessCategoryIdentityView;
  graph: { nodes: BusinessCategoryPreviewNode[]; edges: BusinessCategoryGraph['edges'] };
  /** 伺服器端組裝之浮水印快照（與稽核、下載/列印燒錄一致）。 */
  watermark: string;
}

/** `BusinessCategoryNodeView` → 預覽節點（`docCount` → `mountedDocCount`，缺值收斂為 0）。 */
export function toPreviewNodes(
  nodes: BusinessCategoryGraph['nodes'],
): BusinessCategoryPreviewNode[] {
  return nodes.map((n) => ({
    id: n.id,
    businessCategoryId: n.businessCategoryId,
    name: n.name,
    positionX: n.positionX,
    positionY: n.positionY,
    mountedDocCount: n.docCount ?? 0,
  }));
}

type PreviewAction =
  | 'BUSINESS_CATEGORY_VIEW'
  | 'BUSINESS_CATEGORY_DOWNLOAD'
  | 'BUSINESS_CATEGORY_PRINT';

/**
 * F043 §丁 業務/功能類別樹狀圖預覽服務（唯讀＋浮水印）。
 *  - `preview`：唯讀複用 §乙 圖資 → 組浮水印快照（伺服器端唯一來源）→ 記 `BUSINESS_CATEGORY_VIEW`。
 *  - `download`／`print`：伺服器端產生樹狀圖基底 PDF → 以既有 `PdfBurner` 將浮水印**燒錄進內容層**
 *    （`AC-36`，比照 F020／F036）→ 各記一筆獨立稽核（不合併計數）。
 *  - 稽核一律**非阻斷**（寫入失敗不阻擋檢視／取檔）。
 *  - 功能面 RBAC（`業務/功能類別管理` read）由 controller guard 落實；`AC-37`：DeptContact／User
 *    → 403，**不進本服務**（不產檔、不燒錄、不記稽核）。
 *  - 🔴 **不提供任何寫入路徑**（純唯讀）。
 *
 * 🔴 `AC-53`（決 6）：**下載／列印僅存在於後台**。前台樹狀圖模式沒有對應端點——
 * 前台 PDF 需另行套用 F041 可見性過濾（燒錄是伺服器端一次性產出，沒有第二道逐列過濾的機會），
 * 本輪不做。
 */
@Injectable()
export class BusinessCategoryTreePreviewService {
  private readonly logger = new Logger(BusinessCategoryTreePreviewService.name);

  constructor(
    private readonly dag: BusinessCategoryDagStore,
    private readonly categories: BusinessCategoryStore,
    private readonly watermark: LifecycleWatermarkBuilder,
    private readonly renderer: LifecycleTreePdfRenderer,
    private readonly burner: PdfBurner,
    private readonly auditWriter: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** 唯讀檢視：回圖資＋浮水印快照；記錄 VIEW（無節點 → 空圖，**非錯誤**）。 */
  async preview(
    session: WatermarkSession,
    businessCategoryId: string,
  ): Promise<BusinessCategoryTreePreviewResult> {
    const bc = await this.requireCategory(businessCategoryId);
    const graph = await this.loadGraph(businessCategoryId);
    const { snapshot, fields } = await this.watermark.buildSnapshot(session);
    await this.audit(session, bc, 'BUSINESS_CATEGORY_VIEW', snapshot, fields);
    return {
      businessCategory: { id: bc.id, name: bc.name, subcategory: bc.subcategory },
      graph: { nodes: toPreviewNodes(graph.nodes), edges: graph.edges },
      watermark: snapshot,
    };
  }

  /** `AC-36` 下載：伺服器端產生已燒錄浮水印之樹狀圖 PDF；記 DOWNLOAD。 */
  download(
    session: WatermarkSession,
    businessCategoryId: string,
  ): Promise<{ pdf: Buffer; snapshot: string; categoryName: string }> {
    return this.burnAndAudit(session, businessCategoryId, 'BUSINESS_CATEGORY_DOWNLOAD');
  }

  /** `AC-36` 列印：與下載共用燒錄，稽核類型記為 PRINT（**各記一筆、不合併計數**）。 */
  print(
    session: WatermarkSession,
    businessCategoryId: string,
  ): Promise<{ pdf: Buffer; snapshot: string; categoryName: string }> {
    return this.burnAndAudit(session, businessCategoryId, 'BUSINESS_CATEGORY_PRINT');
  }

  private async burnAndAudit(
    session: WatermarkSession,
    businessCategoryId: string,
    actionType: 'BUSINESS_CATEGORY_DOWNLOAD' | 'BUSINESS_CATEGORY_PRINT',
  ): Promise<{ pdf: Buffer; snapshot: string; categoryName: string }> {
    const bc = await this.requireCategory(businessCategoryId);
    const graph = await this.loadGraph(businessCategoryId);
    const { snapshot, fields } = await this.watermark.buildSnapshot(session);
    // 🔴 下載／列印走**列印幾何**（節點中文直排、節距收窄），不是畫面幾何——畫面之座標
    // 完全不受影響（那條路徑不經過本方法）。逐字沿用 F036 之既有處置。
    const layout = buildTreeLayout(graph.nodes, graph.edges, buildPrintGeometry(graph.nodes));
    const displayName = businessCategoryDisplayName(bc);
    // PDF 頁首標題與稽核快照一律用**顯示名稱**（含子分類），使歷史檔可唯一辨識所屬類別。
    const base = await this.renderer.render({ lifecycleName: displayName, layout });
    const pdf = await this.burner.burnPdf(base, snapshot);
    await this.audit(session, bc, actionType, snapshot, fields);
    return { pdf, snapshot, categoryName: displayName };
  }

  private async requireCategory(
    businessCategoryId: string,
  ): Promise<BusinessCategoryIdentityView> {
    const bc = await this.categories.findById(businessCategoryId);
    if (!bc) throw new NotFoundException('BUSINESS_CATEGORY_NOT_FOUND');
    return { id: bc.id, name: bc.name, subcategory: bc.subcategory ?? null };
  }

  private async loadGraph(businessCategoryId: string): Promise<BusinessCategoryGraph> {
    const [nodes, edges] = await Promise.all([
      this.dag.listNodes(businessCategoryId),
      this.dag.listEdges(businessCategoryId),
    ]);
    return { nodes, edges };
  }

  /** 稽核記錄（非阻斷）。`watermarkSnapshot` 與當次燒錄之字串**逐字一致**。 */
  private async audit(
    session: WatermarkSession,
    bc: BusinessCategoryIdentityView,
    actionType: PreviewAction,
    snapshot: string,
    fields: { companyFullName: string; departmentFullName: string; sectionName: string },
  ): Promise<void> {
    // 🔒 名稱快照一律經 `businessCategoryDisplayName`（含子分類），使 F024 之歷史事件
    // 可唯一辨識所屬類別（同名不同子分類之兩個類別在稽核上必須可區分）。
    const displayName = businessCategoryDisplayName(bc);
    try {
      await this.auditWriter.recordAccess({
        targetType: 'BUSINESS_CATEGORY',
        actionType,
        targetId: bc.id,
        actorId: session.accountId,
        actorName: session.name ?? null,
        employeeNo: session.employeeNo ?? null,
        // 🔒 F024 調閱歷程之公司欄恆為**全稱**——不得沿用 `fields.companyFullName`
        // （該欄之值已依 `AC-N12` 改為浮水印用之**簡稱**，欄名未一併改）。
        company: resolveCompanyName(session.companyCode) ?? null,
        department: fields.departmentFullName || null,
        section: fields.sectionName || null,
        roleCode: session.roleCode ?? null,
        targetNumber: displayName,
        targetName: displayName,
        watermarkSnapshot: snapshot,
        occurredAt: this.clock(),
      });
    } catch (err) {
      this.logger.error(
        `業務/功能類別樹狀圖稽核記錄失敗（已吞，不阻斷）businessCategory=${bc.id} action=${actionType}: ${
          (err as Error)?.message
        }`,
      );
    }
  }
}
