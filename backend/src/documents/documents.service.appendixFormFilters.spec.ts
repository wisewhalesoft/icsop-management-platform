import { DocumentsService } from './documents.service';
import { DocumentStore, DocumentListItem, DocumentListFilters } from './documents.store';

/**
 * F017 §篩選 9 → 13 項 delta（2026-08-16）—— `AC-D2` 第 10／11 列（附錄／使用表單）、`AC-D6`。
 *
 * 🔴 本檔驗證「篩選真的縮小結果集，不是回全部」——team-lead 建環要求之第 2 點。`FakeStore.list()`
 * 之 `appendixId`／`formId` 交集邏輯由本檔自行實作（比照 `AC-D6` 逐字之例：附錄 X 被 A、B 引用、
 * 附錄 Y 僅被 C 引用 → 篩 X 得 A、B 不含 C），驗證的是**服務層是否把 filters.appendixId 原樣往下傳**，
 * 而非驗證真實 SQL——真實 TypeORM `EXISTS` 子查詢之正確性屬 int 測試範圍（本輪環無容器內實跑，
 * 比照既有 `AC-T40` ④ 之殘留風險處置，見 risks-and-gaps.md）。
 *
 * 權威＝`docs/specs/features/F017-backend-document-list.md#filter-13-delta` `AC-D6`（逐字例子）。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`DocumentsService.listDocuments()` 目前不認得
 * `appendixId`／`formId`（`DocumentListFilters` 型別亦無此二鍵，`documents.controller.ts` 亦未傳遞）。
 */

/** 模擬 DOC_APPENDIX／DOC_USAGE_FORM 之掛載關係：documentId → 掛載之 appendixId／formId 集合。 */
class FakeStore implements Partial<DocumentStore> {
  docs: DocumentListItem[] = [];
  appendixLinks = new Map<string, Set<string>>(); // documentId -> Set<appendixId>
  formLinks = new Map<string, Set<string>>(); // documentId -> Set<formId>
  seq = 1;

  seedDoc(over: Partial<DocumentListItem> & { appendixIds?: string[]; formIds?: string[] }): DocumentListItem {
    const { appendixIds, formIds, ...rest } = over;
    const d: DocumentListItem = {
      id: `doc-${this.seq++}`, companyCode: 'AS', status: 'active', documentNumber: 'N', documentName: '書名',
      lifecycleId: 'lc1', lifecycleName: null, nodeId: null,
      draftingCompanyId: null, draftingDeptId: null, draftingSectionId: null,
      draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
      primaryChiefId: null, primaryChiefName: null,
      secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], hasOjt: false,
      edition: null, announcedDate: null, contentSummary: null,
      icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
      ...rest,
    };
    this.docs.push(d);
    if (appendixIds) this.appendixLinks.set(d.id, new Set(appendixIds));
    if (formIds) this.formLinks.set(d.id, new Set(formIds));
    return d;
  }

  list(f: DocumentListFilters): Promise<{
    items: DocumentListItem[]; total: number; page: number; pageSize: number; hasNext: boolean;
  }> {
    let rows = this.docs;
    // AND 語意測試需要之既有篩選（僅實作本檔測試會用到的最小子集，非完整 applyDocumentQuery 複製）。
    if (f.draftingDeptId) {
      rows = rows.filter((d) => d.draftingDeptId === f.draftingDeptId);
    }
    if (f.appendixId) {
      rows = rows.filter((d) => this.appendixLinks.get(d.id)?.has(f.appendixId as string));
    }
    if (f.formId) {
      rows = rows.filter((d) => this.formLinks.get(d.id)?.has(f.formId as string));
    }
    return Promise.resolve({ items: rows, total: rows.length, page: 1, pageSize: 2000, hasNext: false });
  }

  findSecondaryChiefsByDocumentIds() {
    return Promise.resolve([]);
  }
}

function buildSvc() {
  const store = new FakeStore();
  const svc = new DocumentsService(store as unknown as DocumentStore);
  return { store, svc };
}

describe('DocumentsService.listDocuments — AC-D6 附錄／使用表單「選具體一份」之交集語意', () => {
  it('AC-D6 逐字例：附錄 X 被 A、B 引用，附錄 Y 僅被 C 引用 → 篩 附錄=X 回傳 A、B，不含 C', async () => {
    const { store, svc } = buildSvc();
    store.seedDoc({ documentNumber: 'A', appendixIds: ['X'] });
    store.seedDoc({ documentNumber: 'B', appendixIds: ['X'] });
    store.seedDoc({ documentNumber: 'C', appendixIds: ['Y'] });

    const page = await svc.listDocuments({ appendixId: 'X' } as DocumentListFilters);

    expect(page.items.map((i) => i.documentNumber).sort()).toEqual(['A', 'B']);
    expect(page.items.map((i) => i.documentNumber)).not.toContain('C');
  });

  it('AC-D6 使用表單同構：以 formId 比對', async () => {
    const { store, svc } = buildSvc();
    store.seedDoc({ documentNumber: 'A', formIds: ['uf1'] });
    store.seedDoc({ documentNumber: 'B', formIds: ['uf2'] });

    const page = await svc.listDocuments({ formId: 'uf1' } as DocumentListFilters);

    expect(page.items.map((i) => i.documentNumber)).toEqual(['A']);
  });

  it('📌 正向對照：未帶 appendixId／formId → 回傳完整清單（篩選確實是「未提供者不施加限制」，非恆為空）', async () => {
    const { store, svc } = buildSvc();
    store.seedDoc({ documentNumber: 'A', appendixIds: ['X'] });
    store.seedDoc({ documentNumber: 'B', appendixIds: ['Y'] });

    const page = await svc.listDocuments({});

    expect(page.items.map((i) => i.documentNumber).sort()).toEqual(['A', 'B']);
  });

  it('AND 語意：與其他篩選並用為交集（附錄=X 且 制定部門=d1）', async () => {
    const { store, svc } = buildSvc();
    store.seedDoc({ documentNumber: 'A', appendixIds: ['X'], draftingDeptId: 'd1' });
    store.seedDoc({ documentNumber: 'B', appendixIds: ['X'], draftingDeptId: 'd2' }); // 附錄命中但部門不符

    const page = await svc.listDocuments({ appendixId: 'X', draftingDeptId: 'd1' } as DocumentListFilters);

    expect(page.items.map((i) => i.documentNumber)).toEqual(['A']);
  });
});
