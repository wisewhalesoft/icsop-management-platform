import {
  PublicDocumentDetailService,
  DetailNameResolver,
} from './public-document-detail.service';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';
import { PublicDocItem } from './public-list';
import { ViewerScope } from '../rbac/viewer-scope';

const TODAY = new Date('2026-07-23T00:00:00Z');

/**
 * F041 簽章遷移 shim（架構 §3.7 決策一，刻意的破壞性變更）：`detail()` 第二參數
 * 由「無」改為必要參數 `viewer: ViewerScope`。既有案例之測試標的與業務子分類無關，
 * 以「其他」子分類包裝之不受限 viewer 呼叫，行為與遷移前相同（AC-23 回歸鎖定）。
 */
const UNRESTRICTED_VIEWER: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00' };

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
    const dto = await svc.detail('doc-1', UNRESTRICTED_VIEWER);
    expect(dto.displayStatus).toBe('announced');
    expect(dto.lifecycleName).toBe('車貸循環');
    expect(dto.nodeName).toBe('審查節點');
    expect(dto.draftingCompanyName).toBe('和潤企業');
    expect(dto.draftingDeptName).toBe('營運管理部');
    expect(dto.draftingSectionName).toBe('審查室');
    expect(dto.primaryChiefName).toBe('王主管');
    expect(dto.secondaryChiefNames).toEqual(['李室長', '20999']); // 未命中 fallback 員編
    /**
     * 🔴 2026-08-16 delta（F019 `AC-D9`／`AC-D12`；OQ-D18-09）：前台詳情 DTO **移除**
     * `usingDeptNames`／`usingDeptIds` 兩欄。
     * 原斷言（供追溯）：OLD> `expect(dto.usingDeptNames).toEqual(['營運管理部', '業務部']);`
     * ⚠ 內部型別 `PublicDocDetail.usingDeptIds` **保留**（F041 可見性判定所需，見本檔後段案例）。
     */
    expect(Object.prototype.hasOwnProperty.call(dto, 'usingDeptNames')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(dto, 'usingDeptIds')).toBe(false);
    expect(dto.attachments).toHaveLength(1);
    expect(dto.usageForms[0].name).toBe('進件表');
    expect(dto.links[0].targetNumber).toBe('ICSOP-2');
  });

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D12`）：`usingDeptNames` 已自對外 DTO 移除。
   * 原斷言（供追溯）：OLD> `expect(dto.usingDeptNames).toEqual(['ZZ000']);`
   * 「未命中 fallback 為代碼」之語意仍由 `secondaryChiefNames` 一列持有，未放寬。
   */
  it('組織/人員未命中 → 名稱 fallback（次要室長→代碼；制定三級/主要→null）', async () => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ usingDeptIds: ['ZZ000'], secondaryChiefIds: ['E-x'], primaryChiefId: 'E-y' })),
      fakeNames({}, {}),
      () => TODAY,
    );
    const dto = await svc.detail('doc-1', UNRESTRICTED_VIEWER);
    expect(dto.draftingCompanyName).toBeNull();
    expect(dto.primaryChiefName).toBeNull();
    expect(dto.secondaryChiefNames).toEqual(['E-x']);
    expect(Object.prototype.hasOwnProperty.call(dto, 'usingDeptNames')).toBe(false);
  });

  it('查無文件 → DOCUMENT_NOT_FOUND', async () => {
    const svc = new PublicDocumentDetailService(new FakeStore(null), fakeNames(), () => TODAY);
    await expect(svc.detail('nope', UNRESTRICTED_VIEWER)).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });

  it('非「已公告」（進度中：公告日期在未來）→ 視同不存在 DOCUMENT_NOT_FOUND', async () => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ announcedDate: '2026-12-31T00:00:00.000Z' })),
      fakeNames(),
      () => TODAY,
    );
    await expect(svc.detail('doc-1', UNRESTRICTED_VIEWER)).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });

  it('作廢文件 → 視同不存在 DOCUMENT_NOT_FOUND（不洩漏隱藏文件內容）', async () => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ status: 'void' })),
      fakeNames(),
      () => TODAY,
    );
    await expect(svc.detail('doc-1', UNRESTRICTED_VIEWER)).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });
});

/**
 * F041 AC-20～AC-24（F019 delta AC-U6）：業務子分類 viewer 存取使用部門不相符之已公告文件詳情，
 * 於既有「非已公告→404」檢查之後、名稱解析之前追加 isDocVisibleToViewer 檢查。
 * 權威：F041 spec §D；架構 §3.7 決策三(b)（插入點早於名稱解析，AC-20「未執行任何名稱解析」由此保證）。
 */
describe('F041 AC-20～AC-24：業務子分類詳情直連可見性檢查', () => {
  const bizViewer: ViewerScope = { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' };

  function spyNames(): { resolver: DetailNameResolver; calls: { org: number; person: number } } {
    const calls = { org: 0, person: 0 };
    const resolver: DetailNameResolver = {
      resolveOrgUnitName: (code) => {
        calls.org += 1;
        return Promise.resolve(code);
      },
      resolvePersonNames: (empNos) => {
        calls.person += 1;
        return Promise.resolve(new Map(empNos.map((e) => [e, e])));
      },
    };
    return { resolver, calls };
  }

  it('AC-20 使用部門不相符（JAD00）→ 拒絕（不回傳任何文件欄位——拒絕即不產出可解析之 DTO）、未呼叫任何名稱解析', async () => {
    const spy = spyNames();
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ usingDeptIds: ['JAD00'] })),
      spy.resolver,
      () => TODAY,
    );
    await expect(svc.detail('doc-1', bizViewer)).rejects.toThrow('DOCUMENT_NOT_FOUND');
    expect(spy.calls.org).toBe(0); // resolveOrgUnitName 未被呼叫
    expect(spy.calls.person).toBe(0); // resolvePersonNames 未被呼叫
  });

  it('AC-21 拒絕之錯誤訊息與「文件確實不存在」逐字相同（404 DOCUMENT_NOT_FOUND，不得回 403）', async () => {
    const svcMismatch = new PublicDocumentDetailService(
      new FakeStore(detail({ usingDeptIds: ['JAD00'] })),
      fakeNames(),
      () => TODAY,
    );
    const svcNotFound = new PublicDocumentDetailService(new FakeStore(null), fakeNames(), () => TODAY);

    let msgMismatch = '';
    let msgNotFound = '';
    try {
      await svcMismatch.detail('doc-1', bizViewer);
    } catch (e) {
      msgMismatch = (e as Error).message;
    }
    try {
      await svcNotFound.detail('nope', UNRESTRICTED_VIEWER);
    } catch (e) {
      msgNotFound = (e as Error).message;
    }
    expect(msgMismatch).toBe(msgNotFound); // 逐字相同，不得因情境不同而異——否則以文案差異還原存在性
    expect(msgMismatch).toContain('DOCUMENT_NOT_FOUND');
  });

  it('AC-22 業務子分類 viewer 存取相符文件（JA000 祖先）→ 回傳完整 DTO，與「其他」子分類逐欄相同', async () => {
    const store = new FakeStore(detail({ usingDeptIds: ['JA000'] }));
    const names = fakeNames({ JA000: '營運管理部' });
    const svcBiz = new PublicDocumentDetailService(store, names, () => TODAY);
    const svcOther = new PublicDocumentDetailService(store, names, () => TODAY);

    const dtoBiz = await svcBiz.detail('doc-1', bizViewer);
    const dtoOther = await svcOther.detail('doc-1', UNRESTRICTED_VIEWER);
    expect(dtoBiz).toEqual(dtoOther);
  });

  it.each<[string, ViewerScope]>([
    ['其他子分類', { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00' }],
    ['主管（非 User 角色，即使 userSubtype=business）', { roleCode: 'Supervisor', userSubtype: 'business', orgCode: 'JAC00' }],
  ])('AC-23（回歸對照組）%s → 對不相符文件（JAD00）仍正常回傳完整 DTO', async (_label, viewer) => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ usingDeptIds: ['JAD00'] })),
      fakeNames(),
      () => TODAY,
    );
    const dto = await svc.detail('doc-1', viewer);
    expect(dto.documentNumber).toBe('ICSOP-SRC-101-1-01');
  });

  it('AC-24（INV-5：AND）使用部門相符但顯示狀態為「進度中」→ 仍 404 DOCUMENT_NOT_FOUND（基底條件不因相符而放寬）', async () => {
    const svc = new PublicDocumentDetailService(
      new FakeStore(detail({ usingDeptIds: ['JA000'], announcedDate: '2026-12-31T00:00:00.000Z' })),
      fakeNames(),
      () => TODAY,
    );
    await expect(svc.detail('doc-1', bizViewer)).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });
});
