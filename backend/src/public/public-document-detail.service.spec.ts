import {
  PublicDocumentDetailService,
  DetailNameResolver,
} from './public-document-detail.service';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';
import { PublicDocItem } from './public-list';

const TODAY = new Date('2026-07-23T00:00:00Z');

function detail(over: Partial<PublicDocDetail> = {}): PublicDocDetail {
  return {
    id: 'doc-1',
    status: 'active',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    lifecycleId: 'lc1',
    lifecycleName: '車貸循環',
    nodeId: 'node-1',
    nodeName: '審查節點',
    draftingCompanyId: '00000',
    draftingDeptId: 'JA000',
    draftingSectionId: 'JAC00',
    primaryChiefId: '20053',
    secondaryChiefIds: ['20541', '20999'],
    usingDeptIds: ['JA000', 'JB000'],
    edition: "26'01",
    announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '摘要',
    attachments: [
      { type: 'ICSOP_PDF', fileName: 'sop.pdf', blobPath: 'documents/doc-1/icsop_pdf/a.pdf' },
    ],
    usageForms: [{ id: 'form-1', name: '進件表', format: 'xlsx' }],
    links: [
      { targetDocumentId: 'doc-2', targetNumber: 'ICSOP-2', targetName: '對保作業', targetStatus: 'active' },
    ],
    ...over,
  };
}

class FakeStore implements PublicDocumentStore {
  constructor(private readonly rec: PublicDocDetail | null) {}
  listCandidates(): Promise<PublicDocItem[]> {
    return Promise.resolve([]);
  }
  findDetailById(): Promise<PublicDocDetail | null> {
    return Promise.resolve(this.rec);
  }
}

function fakeNames(
  org: Record<string, string> = {},
  person: Record<string, string> = {},
): DetailNameResolver {
  return {
    resolveOrgUnitName: (code) => Promise.resolve(org[code] ?? null),
    resolvePersonNames: (empNos) => {
      const m = new Map<string, string>();
      for (const e of empNos) if (person[e]) m.set(e, person[e]);
      return Promise.resolve(m);
    },
  };
}

describe('PublicDocumentDetailService（G-PUB-020）', () => {
  it('已公告文件 → 回 19 欄詳情 + 解析名稱 + 附件/表單/連結', async () => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail()),
      fakeNames(
        { '00000': '和潤企業', JA000: '營運管理部', JAC00: '審查室', JB000: '業務部' },
        { '20053': '王主管', '20541': '李室長' }, // 20999 未命中 → fallback 員編
      ),
      () => TODAY,
    );
    const dto = await svc.detail('doc-1');
    expect(dto.displayStatus).toBe('announced');
    expect(dto.lifecycleName).toBe('車貸循環');
    expect(dto.nodeName).toBe('審查節點');
    expect(dto.draftingCompanyName).toBe('和潤企業');
    expect(dto.draftingDeptName).toBe('營運管理部');
    expect(dto.draftingSectionName).toBe('審查室');
    expect(dto.primaryChiefName).toBe('王主管');
    expect(dto.secondaryChiefNames).toEqual(['李室長', '20999']); // 未命中 fallback 員編
    expect(dto.usingDeptNames).toEqual(['營運管理部', '業務部']);
    expect(dto.attachments).toHaveLength(1);
    expect(dto.usageForms[0].name).toBe('進件表');
    expect(dto.links[0].targetNumber).toBe('ICSOP-2');
  });

  it('組織/人員未命中 → 名稱 fallback（使用部門/次要室長→代碼；制定三級/主要→null）', async () => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ usingDeptIds: ['ZZ000'], secondaryChiefIds: ['E-x'], primaryChiefId: 'E-y' })),
      fakeNames({}, {}),
      () => TODAY,
    );
    const dto = await svc.detail('doc-1');
    expect(dto.draftingCompanyName).toBeNull();
    expect(dto.primaryChiefName).toBeNull();
    expect(dto.usingDeptNames).toEqual(['ZZ000']);
    expect(dto.secondaryChiefNames).toEqual(['E-x']);
  });

  it('查無文件 → DOCUMENT_NOT_FOUND', async () => {
    const svc = new PublicDocumentDetailService(new FakeStore(null), fakeNames(), () => TODAY);
    await expect(svc.detail('nope')).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });

  it('非「已公告」（進度中：公告日期在未來）→ 視同不存在 DOCUMENT_NOT_FOUND', async () => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ announcedDate: '2026-12-31T00:00:00.000Z' })),
      fakeNames(),
      () => TODAY,
    );
    await expect(svc.detail('doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });

  it('作廢文件 → 視同不存在 DOCUMENT_NOT_FOUND（不洩漏隱藏文件內容）', async () => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ status: 'void' })),
      fakeNames(),
      () => TODAY,
    );
    await expect(svc.detail('doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });
});
