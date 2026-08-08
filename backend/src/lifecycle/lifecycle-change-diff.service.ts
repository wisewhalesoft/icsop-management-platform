import { Injectable, Logger } from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import { WatermarkSession } from '../public/watermark.service';
import { PdfBurner } from '../public/pdf-burner';
import { DagGraph } from './dag.store';
import { LifecycleStore } from './lifecycle.store';
import { lifecycleDisplayName } from './lifecycle-subcategory';
import { LifecycleWatermarkBuilder } from './lifecycle-watermark';
import { LifecycleChangeHistoryPdfRenderer } from './lifecycle-change-history-pdf';
import { buildTreeLayout, TreeLayout } from './lifecycle-tree-layout';
import { SnapshotGraph } from './lifecycle-snapshot-builder';
import {
  computeLifecycleDiff,
  LifecycleDiff,
  reconstructBeforeAfter,
} from './lifecycle-change-diff';
import {
  LIFECYCLE_CHANGE_LOG_STORE,
  LifecycleChangeLogStore,
} from '../change-history/lifecycle-change-log.store';
import {
  LIFECYCLE_SNAPSHOT_STORE,
  LifecycleSnapshotStore,
} from '../change-history/lifecycle-snapshot.store';

export interface LifecycleTreeDiffResult {
  lifecycle: { id: string; name: string };
  before: DagGraph;
  after: DagGraph;
  diff: LifecycleDiff;
  /** 伺服器端組裝之浮水印快照（與 F036 同一 buildSnapshot 來源）。 */
  watermark: string;
}

/** 循環本體已刪除但變更日誌仍存在（OQ-E03-03 允許刪除循環）之名稱佔位。 */
const DELETED_LIFECYCLE_NAME = '（循環已刪除）';

export const LIFECYCLE_CHANGE_LOG_STORE_TOKEN = LIFECYCLE_CHANGE_LOG_STORE;
export const LIFECYCLE_SNAPSHOT_STORE_TOKEN = LIFECYCLE_SNAPSHOT_STORE;

/**
 * F038 循環樹狀圖變更歷程 · 新舊對照服務（新舊快照重建 ＋ 雙頁下載燒錄）。
 *  - preview：重建 before/after 快照＋diff＋浮水印快照（JSON 資料）。**不**記稽核（沿用既有前端
 *    viewLifecycleChanges() 記 LIFECYCLE_CHANGELOG_VIEW；本服務純資料，避免重複稽核）。
 *  - download：before/after 各自佈局 → 雙頁基底 PDF（LifecycleChangeHistoryPdfRenderer）→ 既有 PdfBurner
 *    燒錄浮水印 → 記一筆 LIFECYCLE_CHANGELOG_DOWNLOAD 稽核（非阻斷；既有查詢服務未覆蓋此稽核類型）。
 *  - 循環本體已刪除但變更日誌仍存在（OQ-E03-03）→ 名稱佔位、不整體 404（稽核可追溯性優先）。
 */
@Injectable()
export class LifecycleChangeDiffService {
  private readonly logger = new Logger(LifecycleChangeDiffService.name);

  constructor(
    private readonly logStore: LifecycleChangeLogStore,
    private readonly snapStore: LifecycleSnapshotStore,
    private readonly lifecycles: LifecycleStore,
    private readonly watermark: LifecycleWatermarkBuilder,
    private readonly renderer: LifecycleChangeHistoryPdfRenderer,
    private readonly burner: PdfBurner,
    private readonly auditWriter: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** 新舊對照 JSON 資料（不記稽核）。 */
  async preview(
    _session: WatermarkSession,
    lifecycleId: string,
    changeLogId: string,
  ): Promise<LifecycleTreeDiffResult> {
    const { before, after } = await reconstructBeforeAfter(
      this.logStore,
      this.snapStore,
      lifecycleId,
      changeLogId,
    );
    const diff = computeLifecycleDiff(before, after);
    const { snapshot } = await this.watermark.buildSnapshot(_session);
    const lc = await this.resolveLifecycle(lifecycleId);
    return {
      lifecycle: lc,
      before: toDagGraph(before, lifecycleId),
      after: toDagGraph(after, lifecycleId),
      diff,
      watermark: snapshot,
    };
  }

  /** 雙頁已燒錄浮水印之 PDF；記 LIFECYCLE_CHANGELOG_DOWNLOAD 稽核（非阻斷）。 */
  async download(
    session: WatermarkSession,
    lifecycleId: string,
    changeLogId: string,
  ): Promise<{ pdf: Buffer; snapshot: string; lifecycleName: string }> {
    const { before, after } = await reconstructBeforeAfter(
      this.logStore,
      this.snapStore,
      lifecycleId,
      changeLogId,
    );
    const diff = computeLifecycleDiff(before, after);
    const { snapshot, fields } = await this.watermark.buildSnapshot(session);
    const lc = await this.resolveLifecycle(lifecycleId);
    // before/after 各自獨立分層（節點集合可能不同；比照 prototype layoutGraph 各自呼叫）。
    const beforeLayout = toLayout(before);
    const afterLayout = toLayout(after);
    const base = await this.renderer.render({
      lifecycleName: lc.name,
      beforeLayout,
      afterLayout,
      diff,
    });
    const pdf = await this.burner.burnPdf(base, snapshot);
    await this.audit(session, lc, fields);
    return { pdf, snapshot, lifecycleName: lc.name };
  }

  private async resolveLifecycle(lifecycleId: string): Promise<{ id: string; name: string }> {
    const lc = await this.lifecycles.findById(lifecycleId);
    // F040 AC-S2（F038）：標題與稽核快照皆為顯示名稱（含子分類）；循環已刪除者維持既有佔位字串。
    return { id: lifecycleId, name: lc ? lifecycleDisplayName(lc) : DELETED_LIFECYCLE_NAME };
  }

  private async audit(
    session: WatermarkSession,
    lc: { id: string; name: string },
    fields: { companyFullName: string; departmentFullName: string; sectionName: string },
  ): Promise<void> {
    try {
      await this.auditWriter.recordAccess({
        targetType: 'LIFECYCLE_CHANGE_LOG',
        actionType: 'LIFECYCLE_CHANGELOG_DOWNLOAD',
        actorId: session.accountId,
        actorName: session.name ?? null,
        employeeNo: session.employeeNo ?? null,
        company: fields.companyFullName || null,
        department: fields.departmentFullName || null,
        section: fields.sectionName || null,
        roleCode: session.roleCode ?? null,
        targetId: lc.id,
        targetNumber: lc.name,
        targetName: lc.name,
        occurredAt: this.clock(),
      });
    } catch (err) {
      this.logger.error(
        `循環變更歷程下載稽核記錄失敗（已吞，不阻斷）lifecycle=${lc.id}: ${(err as Error)?.message}`,
      );
    }
  }
}

function toDagGraph(g: SnapshotGraph, lifecycleId: string): DagGraph {
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id,
      lifecycleId,
      name: n.name,
      positionX: n.positionX,
      positionY: n.positionY,
      docCount: n.docs.length,
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
