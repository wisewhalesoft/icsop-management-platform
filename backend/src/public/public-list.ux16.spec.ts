/**
 * F019 UX16 delta — `AC-UX15`（前台子樹篩選之 `buildPublicList` 第七步驟）／`AC-UX22`
 * （制定本部篩選，`draftingDivisionId`）／`AC-UX24`（不加 sentinel）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#ux16-delta；
 * docs/specs/architecture-spec.md §16.4（`ARCH-UX4`：`buildPublicList` 新增選填第 6 參數
 * `subtreeDocumentIds?: ReadonlySet<string>`，插入於 `filtered` 與 `sorted` 之間，不併入
 * `matchesPublicFilters()`）。
 *
 * ⚠ 對實作全盲：`buildPublicList`／`PublicListFilters` 為既有已實作之函式與型別，尚未含本批
 * 新增之選填第 6 參數與 `draftingDivisionId` 篩選鍵——以 cast 承載新增欄位/參數，使紅燈落在
 * 個別斷言而非整檔編譯崩潰（TS2353／TS2554 之既有處置紀律）。
 */
import { PublicDocItem, buildPublicList as buildPublicListImpl } from './public-list';
import { ViewerScope, UsingDeptRef } from '../rbac/viewer-scope';

function viewerOf(orgCode: string | null): ViewerScope {
  return { roleCode: 'User', userSubtype: 'other', orgCode, companyCode: 'AS' };
}
/**
 * 🔴 唯獨用於「縱深防禦」案例：`userSubtype: 'business'` 之 viewer 才會被
 * `isDeptScopedViewer`（F041 AC-04）判定為受限縮，`isDocVisibleToViewer` 之使用部門
 * 檢查才會真正生效。`viewerOf()`（`userSubtype: 'other'`）刻意不受限縮，用於驗證
 * 「無限縮之 viewer 不受影響」的其餘三案，不得混用。
 */
function businessViewerOf(orgCode: string | null): ViewerScope {
  return { roleCode: 'User', userSubtype: 'business', orgCode, companyCode: 'AS' };
}
function depts(codes: string[], companyCode = 'AS'): UsingDeptRef[] {
  return codes.map((orgCode) => ({ companyCode, orgCode }));
}

const DOC_DEFAULTS: PublicDocItem = {
  id: 'd', status: 'active', documentNumber: 'N-1', documentName: '文件',
  lifecycleId: 'lc1', lifecycleName: null, usingDepts: [], companyCode: 'AS',
  draftingDeptId: null, draftingSectionId: null, primaryChiefId: null,
  secondaryChiefIds: [], edition: null, announcedDate: '2026-01-01', contentSummary: null,
};
function doc(over: Partial<PublicDocItem>): PublicDocItem {
  return { ...DOC_DEFAULTS, ...over };
}

const TODAY = new Date('2026-09-22T00:00:00Z');

/** cast 輔助：本批 UX16 新增之選填第六參數（`subtreeDocumentIds`）與 `draftingDivisionId` 篩選鍵。 */
type Ux16Filters = Record<string, unknown>;
function buildPublicListUx16(
  items: PublicDocItem[],
  viewer: ViewerScope,
  filters: Ux16Filters,
  today: Date,
  page?: number,
  pageSize?: number,
  subtreeDocumentIds?: ReadonlySet<string>,
): ReturnType<typeof buildPublicListImpl> {
  return (buildPublicListImpl as unknown as (
    items: PublicDocItem[], viewer: ViewerScope, filters: Ux16Filters, today: Date,
    page?: number, pageSize?: number, subtreeDocumentIds?: ReadonlySet<string>,
  ) => ReturnType<typeof buildPublicListImpl>)(items, viewer, filters, today, page, pageSize, subtreeDocumentIds);
}

describe('buildPublicList — UX16 delta AC-UX15（子樹篩選，第七步驟）', () => {
  it('🔴 提供 subtreeDocumentIds 時，結果集僅含該 Set 內之文件（AND 於既有可見性與篩選之後）', () => {
    const items = [
      doc({ id: 'd1', documentNumber: 'N1', usingDepts: depts(['JAC00']) }),
      doc({ id: 'd2', documentNumber: 'N2', usingDepts: depts(['JAC00']) }),
      doc({ id: 'd3', documentNumber: 'N3', usingDepts: depts(['JAC00']) }),
    ];
    const page = buildPublicListUx16(items, viewerOf('JAC00'), {}, TODAY, 1, 50, new Set(['d1', 'd3']));
    expect(page.items.map((d) => d.id).sort()).toEqual(['d1', 'd3']);
  });

  it('🔒 靜默 no-op：未提供 subtreeDocumentIds（undefined）→ 不施加限制，既有行為零改動', () => {
    const items = [doc({ id: 'd1' }), doc({ id: 'd2' })];
    const page = buildPublicListUx16(items, viewerOf(null), {}, TODAY, 1, 50, undefined);
    expect(page.items).toHaveLength(2);
  });

  it('🔴 空 Set 與 undefined 語意不同——空 Set 會把結果篩成 0 筆（呼叫端須傳 undefined 而非空 Set 以達成 no-op）', () => {
    const items = [doc({ id: 'd1' }), doc({ id: 'd2' })];
    const page = buildPublicListUx16(items, viewerOf(null), {}, TODAY, 1, 50, new Set());
    expect(page.items).toHaveLength(0);
  });

  it('🔴 縱深防禦：子樹集合含一份可見性判定會排除之文件（業務子分類使用部門不符）→ 仍不得出現（可見性優先於子樹集合本身）', () => {
    // 🔴 viewer 須為 isDeptScopedViewer===true 者（roleCode='User' 且 userSubtype='business'，
    // F041 AC-04）使用部門限縮才會真正生效——非限縮 viewer（如 viewerOf() 之 userSubtype:'other'）
    // 對此文件本來就可見，斷言在該語料下永不可能被滿足（與本案驗收意圖無關）。
    const items = [doc({ id: 'd1', usingDepts: depts(['JZZ00']) })]; // 對業務限縮 viewer(JAC00) 不可見
    const page = buildPublicListUx16(items, businessViewerOf('JAC00'), {}, TODAY, 1, 50, new Set(['d1']));
    expect(page.items).toHaveLength(0);
  });
});

describe('buildPublicList — UX16 delta AC-UX22（制定本部篩選 draftingDivisionId）', () => {
  /**
   * 🔴 比對鍵之來源假設（`ARCH-UX2` §16.2）：本部推導由**服務層**（`public-documents.service.ts`）
   * 以 `divisionOf()` 於取回列後組裝完成，`PublicDocItem` 因此新增 additive 欄位
   * `draftingDivisionId: string | null`（已解析完成之值，非在 `buildPublicList` 內部即時查表）
   * ——與既有 `draftingDeptId` 之既有比對模式同構（items 已帶好欲比對之欄，filters 只做等值）。
   * 若實際落點不同（如比對鍵改名），屬合理 test-dispute，仲裁時改介面形狀、不弱化行為斷言本身。
   */
  it('🔴 語料須含同一本部下之兩個不同部各一份文件 ⇒ 選定該本部時兩份皆回傳（防「只比對了部層」）', () => {
    const items = [
      doc({ id: 'd1', documentNumber: 'N1', draftingDeptId: 'DEPT-A', draftingDivisionId: 'DIV1' } as unknown as Partial<PublicDocItem>),
      doc({ id: 'd2', documentNumber: 'N2', draftingDeptId: 'DEPT-B', draftingDivisionId: 'DIV1' } as unknown as Partial<PublicDocItem>),
      doc({ id: 'd3', documentNumber: 'N3', draftingDeptId: 'DEPT-C', draftingDivisionId: 'DIV2' } as unknown as Partial<PublicDocItem>),
    ];
    const page = buildPublicListUx16(items, viewerOf(null), { draftingDivisionId: 'DIV1' } as Ux16Filters, TODAY);
    expect(page.items.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  it('未提供 draftingDivisionId → 不施加限制', () => {
    const items = [doc({ id: 'd1' }), doc({ id: 'd2' })];
    const page = buildPublicListUx16(items, viewerOf(null), {}, TODAY);
    expect(page.items).toHaveLength(2);
  });
});
