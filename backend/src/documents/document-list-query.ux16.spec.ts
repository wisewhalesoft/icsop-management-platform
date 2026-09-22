/**
 * F017 UX16 delta — `AC-UX41`（制定本部篩選之比對語意，項 11）。
 *
 * 權威：docs/specs/features/F017-backend-document-list.md#ux16-delta `AC-UX41`；
 * docs/specs/architecture-spec.md §16.2（`ARCH-UX2`：`DocumentListFilters` ＋
 * `draftingDivisionId?: string`；`DocumentListItem` ＋ `draftingDivisionCode`／
 * `draftingDivisionName`，additive、服務層組裝）。
 *
 * 本檔為獨立新檔（比照既有 `document-list-query.businessCategory.spec.ts` 之慣例，
 * 不編輯既有 `document-list-query.spec.ts` 以避免與其他 lane 衝突）。
 *
 * ⚠ 對實作全盲：`DocumentListFilters.draftingDivisionId` 於本環撰寫時尚不存在——
 * `{ filters } as never` 之既有 cast 手法（比照 businessCategory.spec.ts）使紅燈落在
 * 個別斷言（過濾未生效），而非整檔編譯崩潰。
 */
import { applyDocumentQuery } from './document-list-query';
import { DocumentListItem } from './documents.store';
import { DocumentStatus } from './document-status';

function item(over: Partial<DocumentListItem> & { draftingDivisionId?: string | null }): DocumentListItem {
  return {
    id: 'id', companyCode: 'AS', status: 'active' as DocumentStatus,
    documentNumber: 'N', documentName: '書名', lifecycleId: 'lc', lifecycleName: null, nodeId: null,
    draftingDeptId: null, draftingSectionId: null,
    draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
    primaryChiefId: null, primaryChiefName: null,
    secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [],
    hasOjt: false, edition: null, announcedDate: null, contentSummary: null,
    icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
    ...over,
  } as unknown as DocumentListItem;
}

describe('applyDocumentQuery — AC-UX41（制定本部篩選，等值比對本部之組織識別）', () => {
  it('🔴 語料須含同一本部下之兩個不同部各一份文件 ⇒ 選定該本部時兩份皆回傳（防「只比對了部層」）', () => {
    const d1 = item({ id: 'd1', documentNumber: 'N1', draftingDeptId: 'DEPT-A', draftingDivisionId: 'DIV1' });
    const d2 = item({ id: 'd2', documentNumber: 'N2', draftingDeptId: 'DEPT-B', draftingDivisionId: 'DIV1' });
    const d3 = item({ id: 'd3', documentNumber: 'N3', draftingDeptId: 'DEPT-C', draftingDivisionId: 'DIV2' });
    const filtered = applyDocumentQuery([d1, d2, d3], { draftingDivisionId: 'DIV1' } as never, new Date());
    expect(filtered.items.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  it('未提供 draftingDivisionId → 不施加限制', () => {
    const d1 = item({ id: 'd1' });
    const d2 = item({ id: 'd2' });
    const filtered = applyDocumentQuery([d1, d2], {} as never, new Date());
    expect(filtered.items).toHaveLength(2);
  });

  it('與既有 draftingDeptId／draftingSectionId 並用為 AND（`AC-D2` 之既有規則擴及本項）', () => {
    const d1 = item({ id: 'd1', draftingDeptId: 'DEPT-A', draftingDivisionId: 'DIV1' });
    const d2 = item({ id: 'd2', draftingDeptId: 'DEPT-B', draftingDivisionId: 'DIV1' });
    const filtered = applyDocumentQuery(
      [d1, d2],
      { draftingDivisionId: 'DIV1', draftingDeptId: 'DEPT-A' } as never,
      new Date(),
    );
    expect(filtered.items.map((d) => d.id)).toEqual(['d1']);
  });

  it('🔒 既有 draftingDeptId／draftingSectionId 之既有比對語意一字不改（本項為新增第四個組織維度）', () => {
    const d1 = item({ id: 'd1', draftingDeptId: 'DEPT-A' });
    const d2 = item({ id: 'd2', draftingDeptId: 'DEPT-B' });
    const filtered = applyDocumentQuery([d1, d2], { draftingDeptId: 'DEPT-A' } as never, new Date());
    expect(filtered.items.map((d) => d.id)).toEqual(['d1']);
  });
});
