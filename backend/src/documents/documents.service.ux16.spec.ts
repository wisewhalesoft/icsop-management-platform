/**
 * F017 UX16 delta — `AC-UX43`②（`enrichNames()` 之本部組裝，服務層接線）。
 *
 * 權威：docs/specs/features/F017-backend-document-list.md#ux16-delta `AC-UX43`；
 * docs/specs/architecture-spec.md §16.2（`ARCH-UX2`：`NameResolutionService` 新增
 * `listOrgUnitsByCompany(companyCode)`，`documents.service.ts#enrichNames()` 依 `companyCode`
 * 分組、逐公司呼叫、以 `indexOrgUnitsByCompany`＋`divisionOf`＋`orgUnitDisplayName` 組裝
 * `draftingDivisionCode`／`draftingDivisionName` 兩個 additive 欄位）。
 *
 * 🔴 本檔為獨立新檔（比照既有 `document-list-query.businessCategory.spec.ts` 之慣例，不編輯
 * 既有巨大共用檔 `documents.service.spec.ts`，避免與其他 lane 衝突）。
 *
 * 🔴 本檔之核心紀律（lead 提報，本 repo 已踩過三次之形狀：純函式全綠、接線沒接上、值人間蒸發）：
 * **鎖結果，不鎖機制**——不斷言「`listOrgUnitsByCompany` 被呼叫過」（替身立即 resolve，該斷言
 * 只鎖呼叫紀錄），而是斷言富化後的列**確實帶有**正確的 `draftingDivisionCode`／
 * `draftingDivisionName`，且其值**來自組織索引之真實上溯**（語料須讓「有無接線」產生不同輸出，
 * 而非寫死一個巧合相符的值）。
 *
 * ⚠ 對實作全盲：`DocumentListItem.draftingDivisionCode`／`draftingDivisionName` 尚不存在，
 * `NameResolutionService.listOrgUnitsByCompany` 尚不存在——以 cast 承載，紅燈落在斷言本身
 * （欄位為 undefined），而非整檔編譯崩潰。
 */
import { DocumentsService } from './documents.service';
import { DocumentStore, DocumentListFilters, DocumentListPage, DocumentView } from './documents.store';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { applyDocumentQuery } from './document-list-query';

interface OrgUnitRecordLike {
  companyCode: string;
  orgCode: string;
  codePrefix: string;
  parentCode: string | null;
  tier: 'ROOT' | 'DIVISION' | 'DEPARTMENT' | 'SECTION' | 'SUBSECTION';
  name: string;
  descFull: string | null;
  managerEmpNo: string | null;
  isActive: boolean;
}

function unit(over: Partial<OrgUnitRecordLike>): OrgUnitRecordLike {
  return {
    companyCode: 'AS', orgCode: '00000', codePrefix: '', parentCode: null,
    tier: 'DEPARTMENT', name: '', descFull: null, managerEmpNo: null, isActive: true,
    ...over,
  };
}

/**
 * 最小 `DocumentStore` 替身：僅實作 `DocumentsService.listDocuments()` 端到端所需之方法
 * （比照既有 `documents.service.spec.ts` 之 `FakeStore#list()` 投影邏輯，改以
 * `applyDocumentQuery` 統一投影），以 cast 滿足介面、避免逐一複製巨大介面之其餘方法。
 */
class MinimalDocumentStore {
  docs: DocumentView[] = [];

  seedDoc(over: Partial<DocumentView>): DocumentView {
    const d = {
      id: `doc-${this.docs.length + 1}`,
      companyCode: 'AS',
      nodeId: null,
      lifecycleId: 'lc1',
      status: 'active',
      documentNumber: 'N-1',
      documentName: '文件',
      secondaryChiefIds: [],
      usingDeptIds: [],
      ...over,
    } as unknown as DocumentView;
    this.docs.push(d);
    return d;
  }

  list(f: DocumentListFilters): Promise<DocumentListPage> {
    const rows = this.docs.map((d) => ({
      id: d.id, companyCode: d.companyCode, status: d.status,
      documentNumber: d.documentNumber, documentName: d.documentName,
      lifecycleId: d.lifecycleId, lifecycleName: null, nodeId: d.nodeId,
      draftingDeptId: (d as unknown as { draftingDeptId?: string | null }).draftingDeptId ?? null,
      draftingSectionId: (d as unknown as { draftingSectionId?: string | null }).draftingSectionId ?? null,
      draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
      primaryChiefId: null, primaryChiefName: null,
      secondaryChiefCount: 0, secondaryChiefNames: [],
      edition: null, announcedDate: null, contentSummary: null,
      icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
    }));
    return Promise.resolve(applyDocumentQuery(rows as never, f, new Date()));
  }

  findSecondaryChiefsByDocumentIds(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

function makeStore(): MinimalDocumentStore & DocumentStore {
  return new MinimalDocumentStore() as unknown as MinimalDocumentStore & DocumentStore;
}

/** `NameResolutionService` 替身，additive 新增 `listOrgUnitsByCompany`（`ARCH-UX2`）。 */
class FakeNameResolverUx16 {
  orgUnitsByCompany = new Map<string, OrgUnitRecordLike[]>();
  resolveOrgUnitDisplayName(): Promise<string | null> {
    return Promise.resolve(null);
  }
  resolvePersonNames(): Promise<Map<string, string>> {
    return Promise.resolve(new Map());
  }
  listOrgUnitsByCompany(companyCode: string): Promise<OrgUnitRecordLike[]> {
    return Promise.resolve(this.orgUnitsByCompany.get(companyCode) ?? []);
  }
}

function makeService(resolver: FakeNameResolverUx16, store: MinimalDocumentStore & DocumentStore): DocumentsService {
  return new DocumentsService(store, undefined, resolver as unknown as NameResolutionService);
}

describe('DocumentsService#enrichNames — UX16 delta AC-UX43②（本部組裝之服務層接線）', () => {
  it('🔴 富化後之列帶有 draftingDivisionCode／draftingDivisionName，且其值來自組織索引之真實上溯（非寫死）', async () => {
    const store = makeStore();
    store.seedDoc({
      id: 'd1', companyCode: 'AS',
      ...({ draftingDeptId: 'DAA00' } as Partial<DocumentView>),
    });
    const resolver = new FakeNameResolverUx16();
    // 組織索引：DIVISION（D0000）─ DEPARTMENT（DA000）─ SECTION（DAA00），與文件之 draftingDeptId 對齊。
    resolver.orgUnitsByCompany.set('AS', [
      unit({ companyCode: 'AS', orgCode: 'D0000', tier: 'DIVISION', name: '財會本部', descFull: '財會本部' }),
      unit({ companyCode: 'AS', orgCode: 'DA000', tier: 'DEPARTMENT', name: '財會部', descFull: '財務會計部', parentCode: 'D0000' }),
      unit({ companyCode: 'AS', orgCode: 'DAA00', tier: 'SECTION', name: '財會/財管室', descFull: '財務會計部財管室', parentCode: 'DA000' }),
    ]);
    const svc = makeService(resolver, store);
    const page = await svc.listDocuments({});
    const item = page.items.find((i) => i.id === 'd1') as unknown as {
      draftingDivisionCode?: string | null;
      draftingDivisionName?: string | null;
    };
    expect(item).toBeDefined();
    // 🔴 鎖結果：值必須是「從組織索引真正上溯出來」之本部，非寫死或 undefined。
    expect(item.draftingDivisionCode).toBe('D0000');
    expect(item.draftingDivisionName).toBe('財會本部');
  });

  it('🔴 語料鑑別力：同一份請求含兩家不同公司之文件，各自須解析出各自公司之本部（不得跨公司誤取，AC-UX43④「全系統僅一份實作」之連帶要求）', async () => {
    const store = makeStore();
    store.seedDoc({ id: 'd-as', companyCode: 'AS', ...({ draftingDeptId: 'DAA00' } as Partial<DocumentView>) });
    store.seedDoc({ id: 'd-aj', companyCode: 'AJ', ...({ draftingDeptId: 'DAA00' } as Partial<DocumentView>) }); // 同碼、不同公司
    const resolver = new FakeNameResolverUx16();
    resolver.orgUnitsByCompany.set('AS', [
      unit({ companyCode: 'AS', orgCode: 'D0000', tier: 'DIVISION', name: '財會本部', descFull: '財會本部' }),
      unit({ companyCode: 'AS', orgCode: 'DAA00', tier: 'SECTION', name: '財管室', descFull: '財管室', parentCode: 'D0000' }),
    ]);
    resolver.orgUnitsByCompany.set('AJ', [
      unit({ companyCode: 'AJ', orgCode: 'E0000', tier: 'DIVISION', name: '商用本部', descFull: '商用本部' }),
      unit({ companyCode: 'AJ', orgCode: 'DAA00', tier: 'SECTION', name: '業務室', descFull: '業務室', parentCode: 'E0000' }),
    ]);
    const svc = makeService(resolver, store);
    const page = await svc.listDocuments({});
    const asItem = page.items.find((i) => i.id === 'd-as') as unknown as { draftingDivisionCode?: string | null };
    const ajItem = page.items.find((i) => i.id === 'd-aj') as unknown as { draftingDivisionCode?: string | null };
    expect(asItem.draftingDivisionCode).toBe('D0000');
    expect(ajItem.draftingDivisionCode).toBe('E0000');
    expect(asItem.draftingDivisionCode).not.toBe(ajItem.draftingDivisionCode);
  });

  it('查無本部祖先 → draftingDivisionCode／draftingDivisionName 皆為 null（AC-UX43②：既有三級顯示欄不受影響，本部段本身無值時亦不得拋錯）', async () => {
    const store = makeStore();
    store.seedDoc({ id: 'd1', companyCode: 'AS', ...({ draftingDeptId: 'ZZ000' } as Partial<DocumentView>) });
    const resolver = new FakeNameResolverUx16();
    resolver.orgUnitsByCompany.set('AS', [
      unit({ companyCode: 'AS', orgCode: 'ZZ000', tier: 'DEPARTMENT', name: '孤立部', descFull: '孤立部', parentCode: null }),
    ]);
    const svc = makeService(resolver, store);
    const page = await svc.listDocuments({});
    const item = page.items.find((i) => i.id === 'd1') as unknown as {
      draftingDivisionCode?: string | null;
      draftingDivisionName?: string | null;
    };
    expect(item.draftingDivisionCode ?? null).toBeNull();
    expect(item.draftingDivisionName ?? null).toBeNull();
  });

  it('🔒 draftingDeptId 為 null（既有規則）→ 本部欄亦為 null，不因新增邏輯而拋錯', async () => {
    const store = makeStore();
    store.seedDoc({ id: 'd1', companyCode: 'AS' });
    const resolver = new FakeNameResolverUx16();
    const svc = makeService(resolver, store);
    const page = await svc.listDocuments({});
    const item = page.items.find((i) => i.id === 'd1') as unknown as { draftingDivisionCode?: string | null };
    expect(item.draftingDivisionCode ?? null).toBeNull();
  });
});
