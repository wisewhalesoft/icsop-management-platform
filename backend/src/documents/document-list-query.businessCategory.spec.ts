/**
 * F017 delta `AC-B7`（第 14 項篩選：業務/功能類別，存在量詞語意）
 *
 * 權威：docs/specs/features/F017-backend-document-list.md#business-category-column-delta AC-B7
 *      ＋ docs/specs/architecture-spec.md §14.6.4（決策 E5：additive `businessCategories:
 *        {id,displayName}[]` 欄）。
 * 本檔為獨立新檔（非編輯既有 `document-list-query.spec.ts`，避免與該檔既有 lane 之編輯衝突），
 * 沿用其既有 `item()` 最小工廠慣例（僅補充本 delta 關注之欄位）。
 *
 * ⚠ 對實作全盲：`DocumentListItem.businessCategories` 於本環撰寫時尚不存在——TS2353/TS2339
 * 即為預期紅燈。
 */
import { applyDocumentQuery } from './document-list-query';
import { DocumentListItem } from './documents.store';
import { DocumentStatus } from './document-status';

function item(over: Partial<DocumentListItem> & { businessCategories?: { id: string; displayName: string }[] }): DocumentListItem {
  return {
    id: 'id',
    companyCode: 'AS',
    status: 'active' as DocumentStatus,
    documentNumber: 'N',
    documentName: '書名',
    lifecycleId: 'lc',
    lifecycleName: null,
    nodeId: null,
    draftingDeptId: null,
    draftingSectionId: null,
    draftingCompanyName: null,
    draftingDeptName: null,
    draftingSectionName: null,
    primaryChiefId: null,
    primaryChiefName: null,
    secondaryChiefCount: 0,
    secondaryChiefNames: [],
    secondaryChiefIds: [],
    hasOjt: false,
    edition: null,
    announcedDate: null,
    contentSummary: null,
    icsopPdfBlobPath: null,
    icsopPdfFileName: null,
    links: [],
    businessCategories: [],
    ...over,
  } as unknown as DocumentListItem;
}

describe('applyDocumentQuery — AC-B7 第 14 項篩選「業務/功能類別」（存在量詞，非等值）', () => {
  it('文件掛在多個節點/類別，其一符合所選 businessCategoryId → 命中', () => {
    const doc = item({
      businessCategories: [
        { id: 'bc-credit', displayName: '授信' },
        { id: 'bc-risk', displayName: '風險管理' },
      ],
    });
    const filtered = applyDocumentQuery([doc], { businessCategoryId: 'bc-risk' } as never, new Date());
    expect(filtered.items).toHaveLength(1);
  });

  it('文件之類別集合不含所選 businessCategoryId → 不命中', () => {
    const doc = item({ businessCategories: [{ id: 'bc-credit', displayName: '授信' }] });
    const filtered = applyDocumentQuery([doc], { businessCategoryId: 'bc-risk' } as never, new Date());
    expect(filtered.items).toHaveLength(0);
  });

  it('文件未掛任何類別 → 不命中任何 businessCategoryId 篩選', () => {
    const doc = item({ businessCategories: [] });
    const filtered = applyDocumentQuery([doc], { businessCategoryId: 'bc-risk' } as never, new Date());
    expect(filtered.items).toHaveLength(0);
  });

  it('未提供 businessCategoryId → 不施加此項限制（原樣通過）', () => {
    const doc = item({ businessCategories: [] });
    const filtered = applyDocumentQuery([doc], {} as never, new Date());
    expect(filtered.items).toHaveLength(1);
  });

  it('與其餘既有篩選並用為 AND（比照 AC-D2 之既有語意）：類別命中但狀態不符 → 不命中', () => {
    const doc = item({ status: 'inactive', businessCategories: [{ id: 'bc-risk', displayName: '風險管理' }] });
    const filtered = applyDocumentQuery(
      [doc],
      { businessCategoryId: 'bc-risk', status: 'active' } as never,
      new Date(),
    );
    expect(filtered.items).toHaveLength(0);
  });
});
