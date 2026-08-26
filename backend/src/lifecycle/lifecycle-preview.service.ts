import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import { WatermarkSession } from '../public/watermark.service';
import { PdfBurner } from '../public/pdf-burner';
import { DagStore, DagGraph, NodeView, EdgeRow } from './dag.store';
import { LifecycleStore } from './lifecycle.store';
import { lifecycleDisplayName } from './lifecycle-subcategory';
import { LifecycleWatermarkBuilder } from './lifecycle-watermark';
import { LifecycleTreePdfRenderer } from './lifecycle-tree-pdf';
import { buildTreeLayout } from './lifecycle-tree-layout';
import { buildPrintGeometry } from './lifecycle-tree-print-layout';

export interface LifecycleTreePreviewResult {
  lifecycle: { id: string; name: string };
  graph: DagGraph;
  /** 伺服器端組裝之浮水印快照（與稽核、下載/列印燒錄一致）。 */
  watermark: string;
}

type PreviewAction =
  | 'LIFECYCLE_VIEW'
  | 'LIFECYCLE_DOWNLOAD'
  | 'LIFECYCLE_PRINT';

/**
 * F036 循環樹狀圖預覽服務（唯讀＋浮水印）。
 *  - preview：唯讀複用 F008 圖資 → 組浮水印快照（伺服器端唯一來源）→ 記 LIFECYCLE_VIEW 稽核。
 *  - download/print：伺服器端匯出樹狀圖基底 PDF（LifecycleTreePdfRenderer）→ 以既有 PdfBurner
 *    將浮水印燒錄進內容層（比照 F020/US-054）→ 各記一筆 LIFECYCLE_DOWNLOAD／LIFECYCLE_PRINT 稽核。
 *  - 稽核一律**非阻斷**（寫入失敗不阻擋檢視/取檔，比照 F020／error-handling#audit）。
 *  - 功能面 RBAC（循環管理 read＝SysAdmin/ICSOPAdmin/Supervisor）由 controller guard 落實；
 *    DeptContact／User → 403（不進本服務）。
 *  - 不提供任何 DAG 寫入路徑（純唯讀，AC「純唯讀」）。
 */
@Injectable()
export class LifecycleTreePreviewService {
  private readonly logger = new Logger(LifecycleTreePreviewService.name);

  constructor(
    private readonly dag: DagStore,
    private readonly lifecycles: LifecycleStore,
    private readonly watermark: LifecycleWatermarkBuilder,
    private readonly renderer: LifecycleTreePdfRenderer,
    private readonly burner: PdfBurner,
    private readonly auditWriter: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** 唯讀檢視：回圖資＋浮水印快照；記錄 LIFECYCLE_VIEW（Edge case：無節點 → 空圖，非錯誤）。 */
  async preview(
    session: WatermarkSession,
    lifecycleId: string,
  ): Promise<LifecycleTreePreviewResult> {
    const lc = await this.requireLifecycle(lifecycleId);
    const graph = await this.loadGraph(lifecycleId);
    const { snapshot, fields } = await this.watermark.buildSnapshot(session);
    await this.audit(session, lc, 'LIFECYCLE_VIEW', snapshot, fields);
    return {
      lifecycle: { id: lc.id, name: lc.name },
      graph,
      watermark: snapshot,
    };
  }

  /** 下載：伺服器端產生已燒錄浮水印之樹狀圖 PDF；記錄 LIFECYCLE_DOWNLOAD。 */
  download(
    session: WatermarkSession,
    lifecycleId: string,
  ): Promise<{ pdf: Buffer; snapshot: string; lifecycleName: string }> {
    return this.burnAndAudit(session, lifecycleId, 'LIFECYCLE_DOWNLOAD');
  }

  /** 列印：與下載共用燒錄，稽核類型記為 LIFECYCLE_PRINT。 */
  print(
    session: WatermarkSession,
    lifecycleId: string,
  ): Promise<{ pdf: Buffer; snapshot: string; lifecycleName: string }> {
    return this.burnAndAudit(session, lifecycleId, 'LIFECYCLE_PRINT');
  }

  private async burnAndAudit(
    session: WatermarkSession,
    lifecycleId: string,
    actionType: 'LIFECYCLE_DOWNLOAD' | 'LIFECYCLE_PRINT',
  ): Promise<{ pdf: Buffer; snapshot: string; lifecycleName: string }> {
    const lc = await this.requireLifecycle(lifecycleId);
    const graph = await this.loadGraph(lifecycleId);
    const { snapshot, fields } = await this.watermark.buildSnapshot(session);
    /**
     * 🔴 2026-08-26 UX ④：下載／列印走**列印幾何**（節點中文直排、節距收窄），不是畫面幾何。
     * 畫面（`GET /tree-preview`）之座標完全不受影響——那條路徑不經過本方法。
     * 兩者刻意分家：畫面要好讀（橫排＋可拖曳平移），紙上要放得下（窄卡＋A4 縮放分頁）。
     */
    const layout = buildTreeLayout(graph.nodes, graph.edges, buildPrintGeometry(graph.nodes));
    const base = await this.renderer.render({ lifecycleName: lc.name, layout });
    const pdf = await this.burner.burnPdf(base, snapshot);
    await this.audit(session, lc, actionType, snapshot, fields);
    return { pdf, snapshot, lifecycleName: lc.name };
  }

  private async requireLifecycle(
    lifecycleId: string,
  ): Promise<{ id: string; name: string }> {
    const lc = await this.lifecycles.findById(lifecycleId);
    if (!lc) throw new NotFoundException('LIFECYCLE_NOT_FOUND');
    // F040 AC-S1／AC-S2（F036）：頁首標題與 AUDIT_LOG.lifecycleName 快照皆為顯示名稱（含子分類）。
    return { id: lc.id, name: lifecycleDisplayName(lc) };
  }

  private async loadGraph(lifecycleId: string): Promise<DagGraph> {
    const [nodes, edges]: [NodeView[], EdgeRow[]] = await Promise.all([
      this.dag.listNodes(lifecycleId),
      this.dag.listEdges(lifecycleId),
    ]);
    return { nodes, edges };
  }

  /** 稽核記錄（非阻斷）。targetType=LIFECYCLE、targetNumber=循環名稱、watermarkSnapshot 逐字一致。 */
  private async audit(
    session: WatermarkSession,
    lc: { id: string; name: string },
    actionType: PreviewAction,
    snapshot: string,
    fields: { companyFullName: string; departmentFullName: string; sectionName: string },
  ): Promise<void> {
    try {
      await this.auditWriter.recordAccess({
        targetType: 'LIFECYCLE',
        actionType,
        targetId: lc.id,
        actorId: session.accountId,
        actorName: session.name ?? null,
        employeeNo: session.employeeNo ?? null,
        company: fields.companyFullName || null,
        department: fields.departmentFullName || null,
        section: fields.sectionName || null,
        roleCode: session.roleCode ?? null,
        targetNumber: lc.name,
        targetName: lc.name,
        watermarkSnapshot: snapshot,
        occurredAt: this.clock(),
      });
    } catch (err) {
      this.logger.error(
        `循環樹狀圖稽核記錄失敗（已吞，不阻斷）lifecycle=${lc.id} action=${actionType}: ${
          (err as Error)?.message
        }`,
      );
    }
  }
}
