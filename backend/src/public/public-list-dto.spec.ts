/**
 * F019 `AC-D12` — 前台清單對外 DTO 之欄位收斂（2026-08-16 delta 第 3 項；OQ-D18-09）
 *
 * 權威：
 *   · docs/specs/features/F019-public-list-browsing.md `AC-D12`（移除 `usingDeptIds`／`usingDeptNames`；
 *     新增 `draftingCompanyName`／`draftingSectionName`／`edition`）、`AC-D8`（卡片九欄之資料來源）
 *   · docs/specs/architecture-spec.md §10.6「對外 DTO 之欄位裁剪落點」
 *     （🔴 落在 service 層之 `toDto()`，**不在** controller 序列化層——型別系統本身即保證）
 *
 * ⚠ **內部型別不變**：`PublicDocItem.usingDeptIds` 保留（置頂與 F041 可見性判定所需，`AC-D11`／`AC-D13`）。
 *    本檔約束的是**序列化至 HTTP 回應之對外形狀**，兩者不可混為一談。
 */
import { PublicDocumentsService, OrgNameResolver } from './public-documents.service';
import { PublicDocumentDetailService } from './public-document-detail.service';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';
import { PublicDocItem } from './public-list';
import { ViewerScope } from '../rbac/viewer-scope';

const TODAY = new Date('2026-07-17T00:00:00Z');
const clock = (): Date => TODAY;
const VIEWER: ViewerScope = { roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00' };

class FakeStore implements PublicDocumentStore {
  constructor(private readonly items: PublicDocItem[]) {}
  listCandidates(): Promise<PublicDocItem[]> {
    return Promise.resolve(this.items);
  }
  findDetailById(): Promise<PublicDocDetail | null> {
    return Promise.resolve(null);
  }
}

function fakeResolver(map: Record<string, string> = {}): OrgNameResolver {
  return {
    resolveOrgUnitName: (code) => Promise.resolve(map[code] ?? null),
    resolvePersonNames: () => Promise.resolve(new Map<string, string>()),
  };
}

/**
 * 🔴 **2026-08-16 fixture 缺陷修正**（`tdd-implementation` 申訴 #3，lead 已驗證成立）。
 *
 * 原實作以 `??` 逐欄套預設值：
 *   OLD> `draftingSectionId: over.draftingSectionId ?? 'JAC00',`
 *   OLD> `edition: over.edition ?? "26'01",`（其餘 12 欄同形）
 *
 * 缺陷：`??` 會把**顯式傳入的 `null`** 當成「沒給」而還原為預設值。於是
 * `TS-F019-D12-004` 明明傳 `item({ draftingSectionId: null, edition: null })` 想表達「未設定」，
 * 到了工廠卻變回 `'JAC00'`／`"26'01"`，再被 `NAMES` 解析成 `'審查室'`——
 * **該案宣稱要測的那條路徑（欄位為 null）從來沒有被執行過。**
 *
 * 📌 此非實作缺陷：同檔 `TS-F019-D12-005` 以 `draftingSectionId: 'YYY'`（查無對應名稱）
 * 驗「解析未命中 → null」且已綠，證明 `resolve(code) => map.get(code) ?? null` 本身正確；
 * 本案要驗的是**另一條**路徑（id 本身為 null），而 fixture 送不出 `null`。
 *
 * 修法：改為 `{ ...defaults, ...over }` 展開——顯式傳入之 `null`／`''`／`0` 一律生效，
 * 未傳之鍵才落預設。已確認全檔無任何 `item({ key: undefined })` 之呼叫，故語意等價於原意圖。
 * ⚠ 這與上一輪之鑑別力清掃同源：**送不出目標值的 fixture，會讓該路徑永遠測不到它宣稱要測的東西。**
 */
const ITEM_DEFAULTS: PublicDocItem = {
  id: 'd',
  status: 'active',
  documentNumber: 'N-1',
  documentName: '文件',
  lifecycleId: 'lc1',
  lifecycleName: null,
  usingDeptIds: ['JAC00'],
  draftingDeptId: 'JA000',
  draftingCompanyId: '00000',
  draftingSectionId: 'JAC00',
  primaryChiefId: 'E001',
  secondaryChiefIds: [],
  edition: "26'01",
  announcedDate: '2026-01-01',
  contentSummary: '摘要',
};

function item(over: Partial<PublicDocItem>): PublicDocItem {
  return { ...ITEM_DEFAULTS, ...over };
}

const NAMES = { '00000': '和潤企業股份有限公司', JA000: '營運管理部', JAC00: '審查室' };

/** 詳情側之最小 fixture（僅供 `TS-F019-D12-005` 之跨 DTO 一致性比對）。 */
const DETAIL_BASE: PublicDocDetail = {
  id: 'doc-1',
  status: 'active',
  documentNumber: 'N-1',
  documentName: '文件',
  lifecycleId: 'lc1',
  lifecycleName: null,
  nodeId: null,
  nodeName: null,
  draftingCompanyId: '00000',
  draftingDeptId: 'JA000',
  draftingSectionId: 'JAC00',
  primaryChiefId: null,
  secondaryChiefIds: [],
  usingDeptIds: ['JAC00'],
  edition: "26'01",
  announcedDate: '2026-01-01T00:00:00.000Z',
  contentSummary: '摘要',
  attachments: [],
  usageForms: [],
  links: [],
};

class DetailStore implements PublicDocumentStore {
  constructor(private readonly rec: PublicDocDetail) {}
  listCandidates(): Promise<PublicDocItem[]> {
    return Promise.resolve([]);
  }
  findDetailById(): Promise<PublicDocDetail | null> {
    return Promise.resolve(this.rec);
  }
}

describe('F019 AC-D12：前台清單 DTO 移除使用部門兩欄', () => {
  it('TS-F019-D12-001 items 之任一項皆不含 usingDeptIds／usingDeptNames 屬性（hasOwnProperty === false）', async () => {
    const svc = new PublicDocumentsService(new FakeStore([item({})]), fakeResolver(NAMES), clock);
    const page = await svc.list(VIEWER, {}, 1, 50);
    const dto = page.items[0] as unknown as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(dto, 'usingDeptIds')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(dto, 'usingDeptNames')).toBe(false);
  });

  it('TS-F019-D12-002 內部型別 PublicDocItem.usingDeptIds 保留（置頂判定仍以其為依據）', async () => {
    const svc = new PublicDocumentsService(
      new FakeStore([item({ id: 'anc', usingDeptIds: ['JA000'] })]),
      fakeResolver(NAMES),
      clock,
    );
    const page = await svc.list(VIEWER, {}, 1, 50);
    // 對外沒有該欄，但置頂旗標仍由它算出來——「不顯示 ≠ 不判定」（AC-D11）。
    expect(page.items[0].pinned).toBe(true);
  });

  it('TS-F019-D12-003 DTO 新增 draftingCompanyName／draftingSectionName／edition 三欄', async () => {
    const svc = new PublicDocumentsService(new FakeStore([item({})]), fakeResolver(NAMES), clock);
    const dto = (await svc.list(VIEWER, {}, 1, 50)).items[0];
    expect(dto.draftingCompanyName).toBe('和潤企業股份有限公司');
    expect(dto.draftingSectionName).toBe('審查室');
    expect(dto.edition).toBe("26'01");
  });

  it('TS-F019-D12-004 制定室別未設定 → draftingSectionName 為 null（前端以「—」呈現，AC-D14 ②）', async () => {
    const svc = new PublicDocumentsService(
      new FakeStore([item({ draftingSectionId: null, edition: null })]),
      fakeResolver(NAMES),
      clock,
    );
    const dto = (await svc.list(VIEWER, {}, 1, 50)).items[0];
    expect(dto.draftingSectionName).toBeNull();
    expect(dto.edition).toBeNull();
  });

  /**
   * 🔴 名稱解析未命中之呈現值：**清單 DTO 必須與詳情 DTO 逐字相同**。
   *
   * 理由（刻意不自行選邊）：AC-D12 只說「新增 `draftingCompanyName`／`draftingSectionName`」，
   * 未規定未命中時之值。但**同一份文件之同一個欄位**在清單頁與詳情頁呈現不同值，是使用者
   * 直接可見的矛盾。詳情側之慣例已由既有綠燈測試釘死
   * （`public-document-detail.service.spec.ts`：「制定三級/主要→null」），故本案以
   * 「兩者相等」表述；**2026-08-16 lead 已裁定為 `null`**（與詳情側一致），故本案於一致性斷言之外
   * 另補一條明確釘 `null` 之斷言。
   *
   * 📌 **與 filter-options 之 label fallback 為 code 不衝突**（lead 裁決）：下拉選項必須有可顯示文字，
   *    不能是空白；DTO 之欄位值則以 `null` 表達「未解析」，由前端渲染為 `—`（`AC-D14` ②）。
   */
  it('TS-F019-D12-005 名稱解析未命中 → 清單 DTO 之值與詳情 DTO 逐字相同（不得為 undefined／字面 "null"）', async () => {
    const UNRESOLVED = { draftingCompanyId: 'ZZZ', draftingDeptId: 'XXX', draftingSectionId: 'YYY' };
    const listDto = (
      await new PublicDocumentsService(
        new FakeStore([item(UNRESOLVED)]),
        fakeResolver({}),
        clock,
      ).list(VIEWER, {}, 1, 50)
    ).items[0];

    const detailDto = await new PublicDocumentDetailService(
      new DetailStore({ ...DETAIL_BASE, ...UNRESOLVED }),
      { resolveOrgUnitName: () => Promise.resolve(null), resolvePersonNames: () => Promise.resolve(new Map()) },
      clock,
    ).detail('doc-1', VIEWER);

    for (const key of ['draftingCompanyName', 'draftingDeptName', 'draftingSectionName'] as const) {
      expect(listDto[key]).not.toBeUndefined();
      expect(listDto[key]).not.toBe('null');
      expect(listDto[key]).toBe(detailDto[key]);
      expect(listDto[key]).toBeNull(); // 🔴 lead 裁決 2026-08-16：未命中一律 null（不 fallback 為 code）
    }
  });

  it('TS-F019-D12-006 既有欄位一律保留（回歸鎖定：id／編號／書名／循環／制定部門／狀態／公告日期／摘要／pinned）', async () => {
    const svc = new PublicDocumentsService(new FakeStore([item({})]), fakeResolver(NAMES), clock);
    const dto = (await svc.list(VIEWER, {}, 1, 50)).items[0] as unknown as Record<string, unknown>;
    for (const key of [
      'id',
      'documentNumber',
      'documentName',
      'lifecycleId',
      'lifecycleName',
      'draftingDeptId',
      'draftingDeptName',
      'status',
      'displayStatus',
      'announcedDate',
      'contentSummary',
      'pinned',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(dto, key)).toBe(true);
    }
  });
});
