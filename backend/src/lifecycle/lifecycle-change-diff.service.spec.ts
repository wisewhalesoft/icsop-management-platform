import { LifecycleChangeDiffService } from './lifecycle-change-diff.service';
import { PdfLibChangeHistoryTreeRenderer } from './lifecycle-change-history-pdf';
import { PdfLibBurner } from '../public/pdf-burner';
import {
  LifecycleChangeHistoryPdfInput,
  LifecycleChangeHistoryPdfRenderer,
} from './lifecycle-change-history-pdf';
import { SnapshotGraph, SnapshotNode } from './lifecycle-snapshot-builder';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import { WatermarkSession } from '../public/watermark.service';
import { WatermarkIdentity } from '../public/watermark';
import { PdfBurner } from '../public/pdf-burner';
import { LifecycleWatermarkBuilder } from './lifecycle-watermark';
import { LifecycleStore, LifecycleView } from './lifecycle.store';
import {
  LifecycleChangeLogRow,
  LifecycleChangeLogStore,
} from '../change-history/lifecycle-change-log.store';
import {
  LifecycleSnapshotRecord,
  LifecycleSnapshotStore,
} from '../change-history/lifecycle-snapshot.store';
import { selectPredecessor } from './lifecycle-change-diff';

// ── fixtures ──
function sn(id: string, name: string, docCount = 0): SnapshotNode {
  return {
    id,
    name,
    positionX: 0,
    positionY: 0,
    docs: Array.from({ length: docCount }, (_, i) => ({ id: `${id}-d${i}`, documentNumber: `${id}-${i}` })),
  };
}
function graph(nodes: SnapshotNode[], edges: [string, string, string][]): SnapshotGraph {
  return { nodes, edges: edges.map(([id, s, t]) => ({ id, sourceNodeId: s, targetNodeId: t })) };
}

const BEFORE = graph([sn('a1', '進件作業', 2), sn('a4', '撥款核准')], [['e1', 'a1', 'a4']]);
const AFTER = graph([sn('a1', '進件作業', 2), sn('a4', '撥款核准作業')], [['e1', 'a1', 'a4']]);

class FakeLogStore implements LifecycleChangeLogStore {
  rows: LifecycleChangeLogRow[] = [];
  async append(r: LifecycleChangeLogRow): Promise<void> {
    this.rows.push(r);
  }
  async listAll(): Promise<LifecycleChangeLogRow[]> {
    return this.rows;
  }
  async listByLifecycle(id: string): Promise<LifecycleChangeLogRow[]> {
    return this.rows.filter((r) => r.lifecycleId === id);
  }
  async findById(id: string): Promise<LifecycleChangeLogRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findPredecessor(lc: string, before: Date): Promise<LifecycleChangeLogRow | null> {
    return selectPredecessor(this.rows, lc, before);
  }
}
class FakeSnapStore implements LifecycleSnapshotStore {
  records: LifecycleSnapshotRecord[] = [];
  async findByChangeLogId(id: string): Promise<LifecycleSnapshotRecord | null> {
    return this.records.find((r) => r.changeLogId === id) ?? null;
  }
  async findById(id: string): Promise<LifecycleSnapshotRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }
}
class FakeLifecycleStore implements Partial<LifecycleStore> {
  view: LifecycleView | null = {
    id: 'lc1',
    name: '銷售及收款循環',
    description: null,
    status: 'active',
    nodeCount: 2,
    updatedAt: new Date(),
  };
  async findById(): Promise<LifecycleView | null> {
    return this.view;
  }
}
class FakeWatermark implements LifecycleWatermarkBuilder {
  fields: WatermarkIdentity = {
    employeeNo: '20233',
    name: '李慧玲',
    companyFullName: '和潤企業股份有限公司',
    departmentFullName: '債權管理部',
    sectionName: '法催一室',
  } as WatermarkIdentity;
  async buildSnapshot(): Promise<{ snapshot: string; fields: WatermarkIdentity }> {
    return { snapshot: '20233-李慧玲-僅供內部使用-2026-07-16', fields: this.fields };
  }
}
class RecordingRenderer implements LifecycleChangeHistoryPdfRenderer {
  calls: LifecycleChangeHistoryPdfInput[] = [];
  async render(input: LifecycleChangeHistoryPdfInput): Promise<Buffer> {
    this.calls.push(input);
    return Buffer.from('%PDF-1.7 fake');
  }
}
class RecordingBurner implements PdfBurner {
  calls: { buffer: Buffer; snapshot: string }[] = [];
  async burnPdf(buffer: Buffer, snapshot: string): Promise<Buffer> {
    this.calls.push({ buffer, snapshot });
    return Buffer.from('%PDF-1.7 burned');
  }
}
class FakeAudit implements AuditWriter {
  events: AuditAccessEvent[] = [];
  fail = false;
  async recordAccess(e: AuditAccessEvent): Promise<void> {
    if (this.fail) throw new Error('audit down');
    this.events.push(e);
  }
  queryHistory(): never {
    throw new Error('not used');
  }
  async processOutboxRetry(): Promise<void> {}
}

const SESSION: WatermarkSession = {
  accountId: 'acc-9',
  employeeNo: '20233',
  name: '李慧玲',
  companyCode: 'AS',
  orgCode: 'JAC00',
  roleCode: 'ICSOPAdmin',
};

function build(overrides: {
  renderer?: LifecycleChangeHistoryPdfRenderer;
  burner?: PdfBurner;
  audit?: FakeAudit;
  lifecycles?: FakeLifecycleStore;
} = {}) {
  const logs = new FakeLogStore();
  const snaps = new FakeSnapStore();
  logs.rows = [
    {
      id: 'cl1',
      lifecycleId: 'lc1',
      changeType: 'NODE_ADDED',
      summary: '新增節點',
      oldValue: null,
      newValue: null,
      nodeId: null,
      actorId: null,
      actorName: null,
      actorEmployeeNo: null,
      occurredAt: new Date('2026-07-14T00:00:00Z'),
      snapshotId: 'sp1',
    },
    {
      id: 'cl2',
      lifecycleId: 'lc1',
      changeType: 'NODE_RENAMED',
      summary: '節點改名',
      oldValue: '撥款核准',
      newValue: '撥款核准作業',
      nodeId: 'a4',
      actorId: null,
      actorName: null,
      actorEmployeeNo: null,
      occurredAt: new Date('2026-07-15T00:00:00Z'),
      snapshotId: 'sp2',
    },
  ];
  snaps.records = [
    { id: 'sp1', lifecycleId: 'lc1', changeLogId: 'cl1', graph: BEFORE, capturedAt: new Date() },
    { id: 'sp2', lifecycleId: 'lc1', changeLogId: 'cl2', graph: AFTER, capturedAt: new Date() },
  ];
  const audit = overrides.audit ?? new FakeAudit();
  const svc = new LifecycleChangeDiffService(
    logs,
    snaps,
    (overrides.lifecycles ?? new FakeLifecycleStore()) as unknown as LifecycleStore,
    new FakeWatermark(),
    overrides.renderer ?? new RecordingRenderer(),
    overrides.burner ?? new RecordingBurner(),
    audit as unknown as AuditWriterService,
    () => new Date('2026-07-16T10:00:00Z'),
  );
  return { svc, logs, snaps, audit };
}

describe('LifecycleChangeDiffService.preview（F038 §C.5）', () => {
  it('TS-LCC-C-001 成功 → 回 lifecycle/before/after/diff/watermark，且不觸發稽核（不重複記 VIEW）', async () => {
    const { svc, audit } = build();
    const res = await svc.preview(SESSION, 'lc1', 'cl2');
    expect(res.lifecycle).toEqual({ id: 'lc1', name: '銷售及收款循環' });
    expect(res.before.nodes.find((n) => n.id === 'a4')?.name).toBe('撥款核准');
    expect(res.after.nodes.find((n) => n.id === 'a4')?.name).toBe('撥款核准作業');
    expect(res.diff.amberNodes).toEqual(['a4']);
    expect(res.watermark).toContain('李慧玲');
    expect(audit.events).toHaveLength(0); // 不重複稽核（設計決策 §0.1）
  });

  it('TS-LCC-C-002 changeLogId 不存在 → LIFECYCLE_CHANGE_LOG_NOT_FOUND', async () => {
    const { svc } = build();
    await expect(svc.preview(SESSION, 'lc1', 'nope')).rejects.toThrow('LIFECYCLE_CHANGE_LOG_NOT_FOUND');
  });

  it('TS-LCC-C-003 循環本體已刪除（findById null）但變更日誌仍存在 → 仍成功，名稱佔位', async () => {
    const lifecycles = new FakeLifecycleStore();
    lifecycles.view = null;
    const { svc } = build({ lifecycles });
    const res = await svc.preview(SESSION, 'lc1', 'cl2');
    expect(res.lifecycle.name).toBe('（循環已刪除）');
    expect(res.diff.amberNodes).toEqual(['a4']);
  });
});

describe('LifecycleChangeDiffService.download（F038 §C.5）', () => {
  it('TS-LCC-C-004 成功 → PDF buffer（%PDF）、renderer/burner 各被呼叫、記 LIFECYCLE_CHANGELOG_DOWNLOAD 稽核', async () => {
    const renderer = new RecordingRenderer();
    const burner = new RecordingBurner();
    const { svc, audit } = build({ renderer, burner });
    const { pdf } = await svc.download(SESSION, 'lc1', 'cl2');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(renderer.calls).toHaveLength(1);
    expect(burner.calls).toHaveLength(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      targetType: 'LIFECYCLE_CHANGE_LOG',
      actionType: 'LIFECYCLE_CHANGELOG_DOWNLOAD',
      actorId: 'acc-9',
      targetId: 'lc1',
      targetNumber: '銷售及收款循環',
      targetName: '銷售及收款循環',
    });
  });

  it('TS-LCC-C-005 稽核寫入失敗 → 不阻斷下載（PDF 仍正常回傳）', async () => {
    const audit = new FakeAudit();
    audit.fail = true;
    const { svc } = build({ audit });
    const { pdf } = await svc.download(SESSION, 'lc1', 'cl2');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('TS-LCC-C-006 renderer 收到 before/after 各自獨立佈局（節點集合各自對應）', async () => {
    const renderer = new RecordingRenderer();
    const { svc } = build({ renderer });
    await svc.download(SESSION, 'lc1', 'cl2');
    const input = renderer.calls[0];
    const beforeIds = input.beforeLayout.nodes.map((n) => n.id).sort();
    const afterIds = input.afterLayout.nodes.map((n) => n.id).sort();
    expect(beforeIds).toEqual(['a1', 'a4']);
    expect(afterIds).toEqual(['a1', 'a4']);
    // diff 帶入（改名 → amber a4）
    expect(input.diff.amberNodes).toEqual(['a4']);
  });

  it('TS-LCC-C-007 空前態（第一筆事件，before 為空圖）→ 仍能產生 PDF（第 1 頁空版面，非崩潰）', async () => {
    const { svc } = build();
    const { pdf } = await svc.download(SESSION, 'lc1', 'cl1'); // cl1 無 predecessor → before 空圖
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('[NFR] TS-LCC-C-012 真實 renderer+burner 之雙頁燒錄 < 3000ms（寬鬆門檻，環境相依）', async () => {
    const { svc } = build({
      renderer: new PdfLibChangeHistoryTreeRenderer(),
      burner: new PdfLibBurner(),
    });
    const t0 = Date.now();
    const { pdf } = await svc.download(SESSION, 'lc1', 'cl2');
    const elapsed = Date.now() - t0;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(elapsed).toBeLessThan(3000);
  });
});
