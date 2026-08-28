import { applyDocumentQuery, matchesStatusFilter } from './document-list-query';
import { DocumentListItem } from './documents.store';
import { DocumentStatus } from './document-status';

/**
 * 建立最小清單項（僅測試關注之欄位，其餘補 null）。
 *
 * 🔴 2026-08-16 delta（F017 `AC-D2` 第 4／12 列；architecture-spec §10.12「後端列富化」）：
 * `DocumentListItem` additive 新增兩欄——
 *   · `secondaryChiefIds: string[]`（`AC-D7` 主要∪次要之比對鍵；現況只有 `secondaryChiefNames`／`Count`，
 *     顯示用、**沒有 id**，故無法據以篩選）
 *   · `hasOjt: boolean`（`AC-D5` OJT 三值篩選；`DOCUMENT_ATTACHMENT` 之批次查詢已存在於
 *     `icsopPdfBlobPath` 富化路徑，同一次查詢即可取得、零額外往返）
 */
function item(over: Partial<DocumentListItem>): DocumentListItem {
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
    ...over,
  };
}

const TODAY = new Date('2026-07-23T00:00:00Z');

describe('matchesStatusFilter（F017 狀態篩選：原始值 vs 衍生顯示值）', () => {
  it('原始值 active → 依儲存值比對（含公告未到者）', () => {
    const announced = item({ status: 'active', announcedDate: '2026-01-01T00:00:00Z' });
    const inProgress = item({ status: 'active', announcedDate: '2026-12-31T00:00:00Z' });
    expect(matchesStatusFilter(announced, 'active', TODAY)).toBe(true);
    expect(matchesStatusFilter(inProgress, 'active', TODAY)).toBe(true);
  });

  it('衍生值 已公告 → 有效且公告日期 ≤ 今日', () => {
    const announced = item({ status: 'active', announcedDate: '2026-01-01T00:00:00Z' });
    const inProgress = item({ status: 'active', announcedDate: '2026-12-31T00:00:00Z' });
    expect(matchesStatusFilter(announced, '已公告', TODAY)).toBe(true);
    expect(matchesStatusFilter(inProgress, '已公告', TODAY)).toBe(false);
  });

  it('衍生值 進度中 → 有效且公告日期 > 今日 或未填', () => {
    const inProgress = item({ status: 'active', announcedDate: '2026-12-31T00:00:00Z' });
    const noDate = item({ status: 'active', announcedDate: null });
    const announced = item({ status: 'active', announcedDate: '2026-01-01T00:00:00Z' });
    expect(matchesStatusFilter(inProgress, '進度中', TODAY)).toBe(true);
    expect(matchesStatusFilter(noDate, '進度中', TODAY)).toBe(true);
    expect(matchesStatusFilter(announced, '進度中', TODAY)).toBe(false);
  });

  it('衍生值 失效/作廢 → 對應原始 inactive/void', () => {
    expect(matchesStatusFilter(item({ status: 'inactive' }), '失效', TODAY)).toBe(true);
    expect(matchesStatusFilter(item({ status: 'void' }), '作廢', TODAY)).toBe(true);
    expect(matchesStatusFilter(item({ status: 'active' }), '失效', TODAY)).toBe(false);
  });
});

describe('applyDocumentQuery（F017 篩選/排序/分頁純函式）', () => {
  it('TS-F017-004 依制定部門精確篩選', () => {
    const rows = [item({ id: 'A', draftingDeptId: 'deptX' }), item({ id: 'B', draftingDeptId: 'deptY' })];
    const r = applyDocumentQuery(rows, { draftingDeptId: 'deptX' }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-005 依制定室別精確篩選', () => {
    const rows = [item({ id: 'A', draftingSectionId: 'secX' }), item({ id: 'B', draftingSectionId: 'secY' })];
    expect(applyDocumentQuery(rows, { draftingSectionId: 'secX' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-006 依制定公司精確篩選', () => {
    // 🔴 2026-08-27 裁定：制定公司之比對鍵改為 `companyCode`（公司代碼）。
    const rows = [item({ id: 'A', companyCode: 'AS' }), item({ id: 'B', companyCode: 'AD' })];
    expect(applyDocumentQuery(rows, { companyCode: 'AS' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-007 依當責室長 primaryChiefId 精確篩選（既有期望值不反轉，AC-D7 為嚴格超集）', () => {
    const rows = [item({ id: 'A', primaryChiefId: 'E12345' }), item({ id: 'B', primaryChiefId: 'E67890' })];
    expect(applyDocumentQuery(rows, { primaryChiefId: 'E12345' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-009 依程序書編號精確選取（區別於 keyword 模糊）', () => {
    const rows = [
      item({ id: 'A', documentNumber: 'ICSOP-SRC-101-1-01' }),
      item({ id: 'B', documentNumber: 'ICSOP-SRC-101-1-02' }),
    ];
    const exact = applyDocumentQuery(rows, { documentNumber: 'ICSOP-SRC-101-1-01' }, TODAY);
    expect(exact.items.map((x) => x.id)).toEqual(['A']);
    const fuzzy = applyDocumentQuery(rows, { keyword: 'ICSOP-SRC-101-1' }, TODAY);
    expect(fuzzy.items.map((x) => x.id).sort()).toEqual(['A', 'B']);
  });

  /**
   * 🔒 兼為 F017 `AC-D3` 之**後端側回歸鎖定**（architecture-spec §10.12 末列）：
   * 「`程序書書名內` 之 contains 只加在**前端**；後端 `applyDocumentQuery` 之 `documentName`
   *  **等值**比對必須保留（既有 AC）」。
   * 本案之 fixture 刻意讓 B 為 A 之嚴格超字串——若實作把後端改為 contains，B 會一併回傳而變紅。
   * contains 之正向載體在 `frontend/src/pages/DocumentListPage.filterDelta.test.tsx` `TS-F017-D3-002`。
   */
  it('TS-F017-010 依程序書書名精確選取（AC-D3：後端維持等值、不得改為 contains）', () => {
    const rows = [item({ id: 'A', documentName: '車輛分期進件作業' }), item({ id: 'B', documentName: '車輛分期進件作業補充' })];
    expect(applyDocumentQuery(rows, { documentName: '車輛分期進件作業' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-011/012 依衍生狀態 已公告 / 進度中 篩選', () => {
    const rows = [
      item({ id: 'A', status: 'active', announcedDate: '2026-01-01T00:00:00Z' }),
      item({ id: 'B', status: 'active', announcedDate: '2026-12-31T00:00:00Z' }),
      item({ id: 'C', status: 'inactive' }),
    ];
    expect(applyDocumentQuery(rows, { status: '已公告' }, TODAY).items.map((x) => x.id)).toEqual(['A']);
    expect(applyDocumentQuery(rows, { status: '進度中' }, TODAY).items.map((x) => x.id)).toEqual(['B']);
  });

  it('TS-F017-013 依衍生狀態 失效 / 作廢 篩選', () => {
    const rows = [item({ id: 'C', status: 'inactive' }), item({ id: 'D', status: 'void' })];
    expect(applyDocumentQuery(rows, { status: '失效' }, TODAY).items.map((x) => x.id)).toEqual(['C']);
    expect(applyDocumentQuery(rows, { status: '作廢' }, TODAY).items.map((x) => x.id)).toEqual(['D']);
  });

  it('TS-F017-014 複合篩選（制定部門 + 狀態）取交集', () => {
    const rows = [
      item({ id: 'A', draftingDeptId: 'deptX', status: 'active' }),
      item({ id: 'B', draftingDeptId: 'deptX', status: 'inactive' }),
      item({ id: 'C', draftingDeptId: 'deptY', status: 'active' }),
    ];
    const r = applyDocumentQuery(rows, { draftingDeptId: 'deptX', status: 'active' }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-015 依程序書編號排序（遞增）', () => {
    const rows = [item({ id: '3', documentNumber: 'N-3' }), item({ id: '1', documentNumber: 'N-1' }), item({ id: '2', documentNumber: 'N-2' })];
    const r = applyDocumentQuery(rows, { sortBy: 'documentNumber', sortDir: 'asc' }, TODAY);
    expect(r.items.map((x) => x.documentNumber)).toEqual(['N-1', 'N-2', 'N-3']);
  });

  it('TS-F017-016 依公告日期排序（遞增）', () => {
    const rows = [
      item({ id: '3', announcedDate: '2026-03-01T00:00:00Z' }),
      item({ id: '1', announcedDate: '2026-01-01T00:00:00Z' }),
      item({ id: '2', announcedDate: '2026-02-01T00:00:00Z' }),
    ];
    const r = applyDocumentQuery(rows, { sortBy: 'announcedDate', sortDir: 'asc' }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['1', '2', '3']);
  });

  it('TS-F017-017 announcedDate=null 排序不拋錯、筆數不短少（null 排最後）', () => {
    const rows = [
      item({ id: '2', announcedDate: '2026-02-01T00:00:00Z' }),
      item({ id: 'null', announcedDate: null }),
      item({ id: '1', announcedDate: '2026-01-01T00:00:00Z' }),
    ];
    const r = applyDocumentQuery(rows, { sortBy: 'announcedDate', sortDir: 'asc' }, TODAY);
    expect(r.items).toHaveLength(3);
    expect(r.items[r.items.length - 1].id).toBe('null');
  });

  it('TS-F017-018 未指定排序 → 保留輸入順序（既有 updatedAt DESC 由 store 提供）', () => {
    const rows = [item({ id: 'x' }), item({ id: 'y' }), item({ id: 'z' })];
    const r = applyDocumentQuery(rows, {}, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['x', 'y', 'z']);
  });

  it('TS-F017-019 分頁：page/pageSize 取對應區段', () => {
    const rows = ['1', '2', '3', '4', '5'].map((id) => item({ id }));
    const r = applyDocumentQuery(rows, { page: 2, pageSize: 2 }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['3', '4']);
    expect(r.total).toBe(5);
    expect(r.hasNext).toBe(true);
  });

  it('TS-F017-020 分頁邊界：整數倍時末頁不多出空頁', () => {
    const rows = ['1', '2', '3', '4'].map((id) => item({ id }));
    const r = applyDocumentQuery(rows, { page: 2, pageSize: 2 }, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['3', '4']);
    expect(r.hasNext).toBe(false);
  });

  it('TS-F017-021 分頁超出總頁數 → 空陣列非錯誤', () => {
    const rows = ['1', '2'].map((id) => item({ id }));
    const r = applyDocumentQuery(rows, { page: 5, pageSize: 10 }, TODAY);
    expect(r.items).toEqual([]);
    expect(r.total).toBe(2);
    expect(r.hasNext).toBe(false);
  });

  it('TS-F017-022 分頁與篩選共同作用 → 先篩選/排序再切片', () => {
    const rows = [
      item({ id: 'a', status: 'active' }),
      item({ id: 'b', status: 'inactive' }),
      item({ id: 'c', status: 'active' }),
      item({ id: 'd', status: 'active' }),
      item({ id: 'e', status: 'inactive' }),
    ];
    const r = applyDocumentQuery(rows, { status: 'active', page: 1, pageSize: 2 }, TODAY);
    expect(r.total).toBe(3);
    expect(r.items.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r.hasNext).toBe(true);
  });

  it('TS-F017-025 篩選後無結果 → 空陣列（非錯誤）', () => {
    const rows = [item({ id: 'a', status: 'active' })];
    const r = applyDocumentQuery(rows, { status: '作廢' }, TODAY);
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('既有 keyword 模糊比對（不分大小寫）仍運作', () => {
    const rows = [item({ id: 'a', documentName: '車輛分期' }), item({ id: 'b', documentName: '房屋貸款' })];
    expect(applyDocumentQuery(rows, { keyword: '車輛' }, TODAY).items.map((x) => x.id)).toEqual(['a']);
  });
});

/**
 * 🔴 F017 `AC-D7`（2026-08-16 delta 第 9 項；OQ-D18-08）——「當責室長」比對範圍由**僅主要**
 * 擴為**主要 ∪ 次要**，與 [F019](../../../docs/specs/features/F019-public-list-browsing.md) `AC-D7`
 * 為同一語意之兩處斷言，**不得只改一處**。
 *
 * 權威：F017 `AC-D7`／F019 `AC-D7`／architecture-spec §10.6（共用純函式 `chief-match.ts`）／
 *       §10.11（🔴 L4 直接 import L3 建立之 `chief-match.ts`，禁止先寫本地實作）
 *
 * ⚠ 現況（spec-writer 2026-08-16 實地核對）：`document-list-query.ts:57` 為
 *   `filters.primaryChiefId !== r.primaryChiefId`——僅比對主要。本批案例即該行之替換載體。
 * 📌 篩選鍵名 `primaryChiefId` **不改**（既有 API query 契約），只擴語意；命名之誤導性已知並接受
 *   （spec 之 `AC-D2` 第 4 列亦以此鍵表述）。
 */
describe('F017 AC-D7：當責室長篩選＝主要 ∪ 次要（與前台同一純函式）', () => {
  const A = item({ id: 'A', primaryChiefId: 'E001', secondaryChiefIds: [] });
  const B = item({ id: 'B', primaryChiefId: 'E009', secondaryChiefIds: ['E001'] });
  const C = item({ id: 'C', primaryChiefId: 'E077', secondaryChiefIds: ['E088'] });

  it('TS-F017-D7-001 以 E001 篩選 → A（主要命中）與 B（次要命中）皆回傳', () => {
    const r = applyDocumentQuery([A, B, C], { primaryChiefId: 'E001' }, TODAY);
    expect(r.items.map((x) => x.id).sort()).toEqual(['A', 'B']);
    expect(r.total).toBe(2);
  });

  it('TS-F017-D7-002 以未關聯之 E999 篩選 → 空結果（非錯誤）', () => {
    expect(applyDocumentQuery([A, B, C], { primaryChiefId: 'E999' }, TODAY).items).toEqual([]);
  });

  it('TS-F017-D7-003 次要為多筆時命中任一即納入', () => {
    const many = item({ id: 'M', primaryChiefId: 'E100', secondaryChiefIds: ['E101', 'E102'] });
    for (const id of ['E100', 'E101', 'E102']) {
      expect(applyDocumentQuery([many], { primaryChiefId: id }, TODAY).items.map((x) => x.id)).toEqual(['M']);
    }
  });

  it('TS-F017-D7-004 與其他篩選為 AND（當責室長 ∪ 語意不擴散為 OR 到別的條件）', () => {
    const r = applyDocumentQuery(
      [item({ id: 'A', primaryChiefId: 'E009', secondaryChiefIds: ['E001'], draftingDeptId: 'JA000' }),
       item({ id: 'B', primaryChiefId: 'E001', secondaryChiefIds: [], draftingDeptId: 'JB000' })],
      { primaryChiefId: 'E001', draftingDeptId: 'JA000' },
      TODAY,
    );
    expect(r.items.map((x) => x.id)).toEqual(['A']);
  });

  it('TS-F017-D7-005 未提供當責室長篩選 → 不施加限制', () => {
    expect(applyDocumentQuery([A, B, C], {}, TODAY).items).toHaveLength(3);
  });
});

/**
 * F017 `AC-D9`（🔒 回歸鎖定）之後端側佐證：本 delta **僅動篩選、不動欄位**。
 * `DocumentListItem` 為 additive（只加 `secondaryChiefIds`／`hasOjt`），既有欄位一欄未刪、未改名。
 */
/**
 * 🔴 lead 授權之鑑別力補強（原案為**恆真之結構斷言**）。
 *
 * 原斷言（逐字保留）：
 *   OLD> `const row = item({}) as unknown as Record<string, unknown>;`
 *   OLD> `for (const key of [...18 鍵...]) { expect(Object.prototype.hasOwnProperty.call(row, key)).toBe(true); }`
 *
 * 為何恆真：`item({})` 是**本檔自己的工廠**，那 18 個鍵是它自己寫死的字面 ⇒ 迴圈在執行期
 * **永遠**通過，與 `DocumentListItem` 真正長什麼樣無關。唯一有效的保護其實來自 TypeScript
 * 對工廠回傳型別之檢查，而那與這個迴圈無關——迴圈本身什麼都不擋。
 *
 * 取代：把保護**明講**為編譯期斷言。若 `DocumentListItem` 少了任一既有鍵，
 * `RequiredListItemKeys extends keyof DocumentListItem` 即為 false，型別解析為 `never`，
 * `= true` 的指派立刻編譯錯（TS2322）——這才是 `AC-D9`「欄位一欄未刪」真正的機器閘門。
 */
type RequiredListItemKeys =
  | 'draftingCompanyName' | 'draftingDeptName' | 'draftingSectionName'
  | 'primaryChiefName' | 'secondaryChiefNames' | 'secondaryChiefCount'
  | 'status' | 'announcedDate' | 'icsopPdfBlobPath' | 'icsopPdfFileName'
  | 'nodeId' | 'documentNumber' | 'documentName' | 'edition' | 'contentSummary'
  | 'links' | 'lifecycleId' | 'lifecycleName';

describe('F017 AC-D9：清單列型別為 additive（既有欄位一欄未刪）', () => {
  it('TS-F017-D9-001 既有 14 欄之資料來源欄位皆仍存在於 DocumentListItem（編譯期鎖）', () => {
    // 🔴 本案之真正閘門在**編譯期**：少一個鍵即 TS2322，jest 連跑都跑不起來。
    const lock: RequiredListItemKeys extends keyof DocumentListItem ? true : never = true;
    expect(lock).toBe(true);
  });
});

/**
 * 🔴 F042 E11 delta（2026-08-27／28）：`OJT` 篩選由三值（`全部`／`有 OJT`／`無 OJT`）改**四值**
 * （`全部`／`已全部完成`／`部分完成`／`尚未開始`）。權威＝
 * docs/specs/features/F017-backend-document-list.md#ojt-derived-semantics-delta `AC-J14`
 * （四值逐字取自 `prototypes/13-document-list.html`，本檔僅測比對語意、不重打字面）。
 *
 * ⚠ 本檔目前**無法確認** `applyDocumentQuery` 之既有 `filters` 型別是否已含 `ojtStatus`（或
 * `ojt`）鍵——本節未讀取生產碼決定鍵名，依 `AC-J12`（`hasOjt` → `ojtStatus` 之欄位改名原則）
 * 類比選用 `ojtStatus` 作為篩選鍵名，比對值採三值聯集之原始值（`'all'|'partial'|'none'`），
 * 與 `matchesStatusFilter` 系列測試「同時接受原始值與衍生顯示值」之既有慣例類比但不強求相同
 * 手法。**若實作方對鍵名有異議，屬合理仲裁項——仲裁時改鍵名，不弱化本節斷言之比對語意**
 * （AC-J14 之核心：四值中三個非「全部」之值各需一個可命中之案例）。
 *
 * 🔴 舊 fixture（「文件 A 有 `OJT_SIGNIN` 附件、文件 B 無」）在新模型下不再可建構，本節改以
 * 三筆文件（全部完成／部分完成／尚未開始）驅動——此為 `AC-J14` 明文之預期轉紅／重寫範圍，
 * 非本節之缺陷。
 */
describe('applyDocumentQuery OJT 篩選（F017 AC-J14：三值改四值）', () => {
  // 🔴 不修改共用 item() 之型別新增鍵（避免波及其餘既有測試），改用局部 builder 附加 ojtStatus。
  function itemWithOjtStatus(
    id: string,
    ojtStatus: 'all' | 'partial' | 'none',
  ): DocumentListItem {
    return { ...item({ id }), ojtStatus } as unknown as DocumentListItem;
  }

  const allDone = itemWithOjtStatus('OJT-ALL', 'all');
  const partialDone = itemWithOjtStatus('OJT-PARTIAL', 'partial');
  const noneDone = itemWithOjtStatus('OJT-NONE', 'none');
  const rows = [allDone, partialDone, noneDone];

  it('AC-J14 篩選值「已全部完成」（ojtStatus="all"）→ 僅回傳全部完成之文件', () => {
    const r = applyDocumentQuery(rows, { ojtStatus: 'all' } as any, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['OJT-ALL']);
  });

  it('AC-J14（🔴 三值聯集之新增狀態，D9 批之二值年代無法建構此案）篩選值「部分完成」（ojtStatus="partial"）→ 僅回傳部分完成之文件', () => {
    const r = applyDocumentQuery(rows, { ojtStatus: 'partial' } as any, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['OJT-PARTIAL']);
  });

  it('AC-J14 篩選值「尚未開始」（ojtStatus="none"）→ 僅回傳尚未開始之文件', () => {
    const r = applyDocumentQuery(rows, { ojtStatus: 'none' } as any, TODAY);
    expect(r.items.map((x) => x.id)).toEqual(['OJT-NONE']);
  });

  it('AC-J14 未提供 ojtStatus 篩選（等同「全部」預設值）→ 不施加限制，三筆皆回傳', () => {
    const r = applyDocumentQuery(rows, {} as any, TODAY);
    expect(r.items.map((x) => x.id).sort()).toEqual(['OJT-ALL', 'OJT-NONE', 'OJT-PARTIAL'].sort());
  });

  /**
   * 🔒 AC-J14：TAB2（F042 `AC-13`）之「完成狀態」篩選為**三值**（比對列自身之二態 + 全部），
   * 刻意與本條之**四值**（比對文件層三態 + 全部）不同——兩軸不得互相對齊。本檔（F017 清單頁）
   * 僅測本條之四值語意，不涉及 F042 TAB2 之篩選（那是獨立管理頁之測試範圍，非本檔）。
   */
  it('AC-J14（🔒 回歸鎖定）其餘篩選之比對語意不受本條影響——依制定部門篩選仍逐字精確比對', () => {
    const rowsWithDept = [
      item({ id: 'D1', draftingDeptId: 'deptX' }),
      item({ id: 'D2', draftingDeptId: 'deptY' }),
    ];
    expect(
      applyDocumentQuery(rowsWithDept, { draftingDeptId: 'deptX' }, TODAY).items.map((x) => x.id),
    ).toEqual(['D1']);
  });
});
