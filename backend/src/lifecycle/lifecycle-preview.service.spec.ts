import { LifecycleTreePreviewService } from './lifecycle-preview.service';
import { LifecycleWatermarkBuilder } from './lifecycle-watermark';
import { LifecycleTreePdfRenderer, LifecycleTreePdfInput } from './lifecycle-tree-pdf';
import { DagStore, NodeView, EdgeRow } from './dag.store';
import { LifecycleStore, LifecycleView } from './lifecycle.store';
import { PdfBurner } from '../public/pdf-burner';
import { WatermarkSession } from '../public/watermark.service';
import { WatermarkIdentity } from '../public/watermark';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';

const T0 = new Date('2026-07-23T02:00:00Z');
const SNAP = 'E001-王小明-和潤企業股份有限公司-債權管理部-法催一室-機密-2026-07-23 10:00:00 (UTC+8)';

function fakeDag(nodes: NodeView[], edges: EdgeRow[]): DagStore {
  return {
    listNodes: () => Promise.resolve(nodes),
    listEdges: () => Promise.resolve(edges),
  } as unknown as DagStore;
}

function fakeLifecycles(rows: LifecycleView[]): LifecycleStore {
  return {
    findById: (id: string) => Promise.resolve(rows.find((r) => r.id === id) ?? null),
  } as unknown as LifecycleStore;
}

class FakeWatermark implements LifecycleWatermarkBuilder {
  calls = 0;
  buildSnapshot(): Promise<{ snapshot: string; fields: WatermarkIdentity }> {
    this.calls++;
    const fields: WatermarkIdentity = {
      employeeNo: 'E001',
      name: '王小明',
      companyFullName: '和潤企業股份有限公司',
      departmentFullName: '債權管理部',
      sectionName: '法催一室',
      timestamp: '2026-07-23 10:00:00 (UTC+8)',
    };
    return Promise.resolve({ snapshot: SNAP, fields });
  }
}

class FakeRenderer implements LifecycleTreePdfRenderer {
  calls: LifecycleTreePdfInput[] = [];
  render(input: LifecycleTreePdfInput): Promise<Buffer> {
    this.calls.push(input);
    return Promise.resolve(Buffer.from(`TREE:${input.lifecycleName}`));
  }
}

class FakeBurner implements PdfBurner {
  calls: { original: Buffer; snapshot: string }[] = [];
  burnPdf(original: Buffer, snapshot: string): Promise<Buffer> {
    this.calls.push({ original, snapshot });
    return Promise.resolve(Buffer.from(`BURNED:${snapshot}`));
  }
}

class FakeAudit implements AuditWriter {
  events: AuditAccessEvent[] = [];
  shouldThrow = false;
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.events.push(event);
    return this.shouldThrow ? Promise.reject(new Error('AUDIT_IO')) : Promise.resolve();
  }
  queryHistory(): never {
    throw new Error('n/a');
  }
  processOutboxRetry(): Promise<void> {
    return Promise.resolve();
  }
}

const LC: LifecycleView = {
  id: 'lc-1',
  name: '銷售及收款循環',
  description: '說明',
  status: 'active',
  nodeCount: 3,
  updatedAt: T0,
};
const NODES: NodeView[] = [
  { id: 'a1', lifecycleId: 'lc-1', name: '進件作業', positionX: 0, positionY: 0, docCount: 2 },
  { id: 'a2', lifecycleId: 'lc-1', name: '簽約對保作業', positionX: 0, positionY: 0, docCount: 1 },
];
const EDGES: EdgeRow[] = [{ id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' }];

function sessionOf(over: Partial<WatermarkSession> = {}): WatermarkSession {
  return {
    accountId: 'AS22455',
    employeeNo: 'E001',
    name: '王小明',
    companyCode: 'AS',
    orgCode: 'JAC00',
    roleCode: 'ICSOPAdmin',
    ...over,
  };
}

function make(opts: {
  nodes?: NodeView[];
  edges?: EdgeRow[];
  rows?: LifecycleView[];
  audit?: FakeAudit;
} = {}) {
  const dag = fakeDag(opts.nodes ?? NODES, opts.edges ?? EDGES);
  const lifecycles = fakeLifecycles(opts.rows ?? [LC]);
  const watermark = new FakeWatermark();
  const renderer = new FakeRenderer();
  const burner = new FakeBurner();
  const audit = opts.audit ?? new FakeAudit();
  const svc = new LifecycleTreePreviewService(
    dag,
    lifecycles,
    watermark,
    renderer,
    burner,
    audit,
    () => T0,
  );
  return { svc, watermark, renderer, burner, audit };
}

describe('LifecycleTreePreviewService（F036）', () => {
  describe('preview（唯讀檢視）', () => {
    it('回循環+圖資+浮水印快照，且不觸發燒錄/渲染', async () => {
      const { svc, renderer, burner } = make();
      const out = await svc.preview(sessionOf(), 'lc-1');
      expect(out.lifecycle).toEqual({ id: 'lc-1', name: '銷售及收款循環' });
      expect(out.graph.nodes).toHaveLength(2);
      expect(out.graph.edges).toHaveLength(1);
      expect(out.watermark).toBe(SNAP);
      expect(renderer.calls).toHaveLength(0);
      expect(burner.calls).toHaveLength(0);
    });

    it('記錄一筆 LIFECYCLE_VIEW 稽核：targetType=LIFECYCLE、targetId=lifecycleId、快照一致、targetNumber=名稱', async () => {
      const { svc, audit } = make();
      await svc.preview(sessionOf(), 'lc-1');
      expect(audit.events).toHaveLength(1);
      const ev = audit.events[0];
      expect(ev.targetType).toBe('LIFECYCLE');
      expect(ev.actionType).toBe('LIFECYCLE_VIEW');
      expect(ev.targetId).toBe('lc-1');
      expect(ev.watermarkSnapshot).toBe(SNAP);
      expect(ev.targetNumber).toBe('銷售及收款循環');
      expect(ev.actorId).toBe('AS22455');
      expect(ev.occurredAt).toBe(T0);
    });

    it('循環不存在 → LIFECYCLE_NOT_FOUND，不記稽核', async () => {
      const { svc, audit } = make({ rows: [] });
      await expect(svc.preview(sessionOf(), 'ghost')).rejects.toThrow('LIFECYCLE_NOT_FOUND');
      expect(audit.events).toHaveLength(0);
    });

    it('無節點循環 → 回空圖（非錯誤），仍記 VIEW 稽核', async () => {
      const { svc, audit } = make({ nodes: [], edges: [] });
      const out = await svc.preview(sessionOf(), 'lc-1');
      expect(out.graph.nodes).toHaveLength(0);
      expect(audit.events).toHaveLength(1);
    });

    it('稽核寫入失敗 → 仍正常回傳（非阻斷）', async () => {
      const audit = new FakeAudit();
      audit.shouldThrow = true;
      const { svc } = make({ audit });
      const out = await svc.preview(sessionOf(), 'lc-1');
      expect(out.watermark).toBe(SNAP);
    });
  });

  describe('download / print（伺服器端燒錄）', () => {
    it('download：渲染基底樹圖 → 燒錄浮水印 → 回燒錄後 buffer，記 LIFECYCLE_DOWNLOAD', async () => {
      const { svc, renderer, burner, audit } = make();
      const res = await svc.download(sessionOf(), 'lc-1');
      expect(renderer.calls).toHaveLength(1);
      expect(renderer.calls[0].lifecycleName).toBe('銷售及收款循環');
      expect(renderer.calls[0].layout.nodes).toHaveLength(2);
      expect(burner.calls).toHaveLength(1);
      expect(burner.calls[0].snapshot).toBe(SNAP);
      expect(burner.calls[0].original.toString()).toBe('TREE:銷售及收款循環');
      expect(res.pdf.toString()).toBe(`BURNED:${SNAP}`);
      expect(audit.events.map((e) => e.actionType)).toEqual(['LIFECYCLE_DOWNLOAD']);
    });

    it('print：亦燒錄，稽核 actionType=LIFECYCLE_PRINT', async () => {
      const { svc, audit } = make();
      await svc.print(sessionOf(), 'lc-1');
      expect(audit.events.map((e) => e.actionType)).toEqual(['LIFECYCLE_PRINT']);
    });

    it('download / print 各記一筆獨立稽核（不合併）', async () => {
      const { svc, audit } = make();
      await svc.download(sessionOf(), 'lc-1');
      await svc.print(sessionOf(), 'lc-1');
      expect(audit.events.map((e) => e.actionType)).toEqual([
        'LIFECYCLE_DOWNLOAD',
        'LIFECYCLE_PRINT',
      ]);
      expect(audit.events.every((e) => e.watermarkSnapshot === SNAP)).toBe(true);
    });

    it('循環不存在 → LIFECYCLE_NOT_FOUND，不渲染/不燒錄/不記稽核', async () => {
      const { svc, renderer, burner, audit } = make({ rows: [] });
      await expect(svc.download(sessionOf(), 'ghost')).rejects.toThrow('LIFECYCLE_NOT_FOUND');
      expect(renderer.calls).toHaveLength(0);
      expect(burner.calls).toHaveLength(0);
      expect(audit.events).toHaveLength(0);
    });
  });
});
