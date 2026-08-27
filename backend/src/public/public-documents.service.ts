import { Inject, Injectable } from '@nestjs/common';
import { resolveCompanyName } from '../org-directory/company-name';
import { DocumentStatus } from '../documents/document-status';
import { DisplayStatus, deriveDisplayStatus } from '../documents/display-status';
import {
  PublicDocItem,
  PublicFilterOptions,
  PublicListFilters,
  PublicListPage,
  buildFilterOptions,
  buildPublicList,
  isPinned,
  visibleCandidates,
  DEFAULT_PAGE_SIZE,
} from './public-list';
import { PUBLIC_DOCUMENT_STORE, PublicDocumentStore } from './public-documents.store';
import { ViewerScope } from '../rbac/viewer-scope';

/**
 * 名稱解析器（結構相容 `NameResolutionService`）。
 *
 * `resolvePersonNames` 為 F019 `AC-D5` 之「當責室長選項以姓名顯示」所需——`public-list-filter-options.spec.ts`
 * 曾註記「chiefs 之人員姓名解析所需之接縫，spec 與 §10.6 皆未指定」，該缺口即是選項長期顯示員編之成因。
 * 綁定端 `public.module.ts` 為 `useExisting: NameResolutionService`，該類別本就有此批次方法（無 N+1）。
 */
export interface OrgNameResolver {
  /**
   * 🔴 B 階段（多公司）：`companyCode` 為**必要**第一參數——`orgCode` 各公司獨立編碼，
   * 字串可能相同卻是不同單位。
   *
   * 📝 已作廢（⚠ 不得復原）：OLD> `resolveOrgUnitName(orgCode: string)`／
   * `resolvePersonNames(employeeNos: string[])`。本 port 與實作
   * （`NameResolutionService`，`fcce0a2` 已改為兩參數）**長期不同步**，而
   * `public.module.ts` 之 `useExisting` 綁定**不受 TS 型別檢查** ⇒ 編譯期全綠、執行期
   * 第二參數恆為 `undefined`，前台清單與篩選選項一律 500（2026-08-26 真人回報）。
   * 回歸鎖＝`name-resolver-port.contract.spec.ts` 之編譯期可指派性斷言。
   */
  resolveOrgUnitName(companyCode: string, orgCode: string): Promise<string | null>;
  /** 批次 employeeNo → 姓名。未命中／無姓名之鍵**缺席**於 Map（呼叫端 fallback 為員編）。 */
  resolvePersonNames(
    companyCode: string,
    employeeNos: string[],
  ): Promise<Map<string, string>>;
}

/**
 * (公司, 代碼) 之複合鍵。🔴 不得退回以裸 `orgCode` 為鍵——跨公司的同名代碼會互相覆蓋，
 * 使用者會在清單上看到別家公司的單位名稱。`\u0000` 不可能出現於代碼字面，故無碰撞。
 */
function pairKey(companyCode: string, code: string): string {
  return `${companyCode}\u0000${code}`;
}

/**
 * (公司,代碼) → 名稱之解析結果，收斂為「代碼 → 名稱」供 label 使用。
 *
 * 🔴 同一代碼於不同公司解析出**相異**名稱時視為不可判定 ⇒ 該鍵**缺席**，label 依既有規則
 * fallback 回代碼本身。刻意不任選一個——選項只有一個 value，硬套其中一家的名稱會讓另一家的
 * 使用者看到錯的單位名，而錯的名稱比看到代碼更難察覺。
 */
function collapseByCode(
  pairNames: ReadonlyMap<string, string | null>,
  pairs: Iterable<{ companyCode: string; code: string }>,
): Map<string, string> {
  const byCode = new Map<string, Set<string>>();
  for (const { companyCode, code } of pairs) {
    const name = pairNames.get(pairKey(companyCode, code));
    if (!name) continue;
    const set = byCode.get(code) ?? new Set<string>();
    set.add(name);
    byCode.set(code, set);
  }
  const out = new Map<string, string>();
  for (const [code, names] of byCode) {
    if (names.size === 1) out.set(code, [...names][0]);
  }
  return out;
}
export const ORG_NAME_RESOLVER = Symbol('ORG_NAME_RESOLVER');

/** 前台清單輸出項（名稱已解析、含衍生顯示狀態與置頂旗標）。 */
export interface PublicListItemDto {
  id: string;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  draftingDeptId: string | null;
  /**
   * 制定三級之名稱（未解析 → `null`，由前端渲染為「—」，AC-D14 ②）。
   * ⚠ 與 filter-options 之 `label` fallback 為 code **不衝突**：下拉選項必須有可顯示文字，
   * DTO 欄位則以 `null` 表達「未解析」；此處與詳情 DTO 之既有慣例逐字一致。
   */
  draftingDeptName: string | null;
  /** 2026-08-16 delta（AC-D12）：additive 新增三欄。 */
  draftingCompanyName: string | null;
  draftingSectionName: string | null;
  edition: string | null;
  status: DocumentStatus;
  /** 衍生顯示狀態（前台恆為 announced）。 */
  displayStatus: DisplayStatus;
  announcedDate: string | null;
  contentSummary: string | null;
  /** 是否屬使用者部門相關（置頂區）。 */
  pinned: boolean;
}

/**
 * F019 前台清單服務。強制基底條件/篩選/排序/分頁委由 public-list 純函式；名稱解析重用
 * org-foundation 之 NameResolutionService（僅解析當頁項目之組織代碼，避免全表 N+1）。
 * today 由注入時鐘取得（unit 以固定時鐘驗證邊界；module 以 () => new Date()）。
 */
@Injectable()
export class PublicDocumentsService {
  constructor(
    @Inject(PUBLIC_DOCUMENT_STORE) private readonly store: PublicDocumentStore,
    @Inject(ORG_NAME_RESOLVER) private readonly names: OrgNameResolver,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * F041（架構 §3.7 決策一）：第一參數由裸 `userOrgCode` 改為必要參數 `viewer: ViewerScope`，
   * 原樣交給 `buildPublicList`（業務子分類之可見性過濾集中於純函式層，服務層不重複判定）。
   */
  async list(
    viewer: ViewerScope,
    filters: PublicListFilters,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<PublicListPage<PublicListItemDto>> {
    const items = await this.store.listCandidates();
    const today = this.clock();
    const result = buildPublicList(items, viewer, filters, today, page, pageSize);

    // 僅解析當頁項目之制定三級組織代碼（去重、單次查詢）。
    // AC-D12：`usingDeptIds` 已自對外 DTO 移除 ⇒ 不再為其解析名稱。
    // 🔴 以 (文件所屬公司, 代碼) 配對解析——前台清單**不限縮於登入者公司**（公司別只影響
    //    F041 業務子分類可見性與置頂），故裸 orgCode 不足以識別單位。
    const pairs = new Map<string, { companyCode: string; code: string }>();
    for (const it of result.items) {
      // 🔴 制定公司不在此列：其名稱來自**公司主檔全稱**（`resolveCompanyName`），非 ORG_UNIT。
      for (const c of [it.draftingDeptId, it.draftingSectionId]) {
        if (c) pairs.set(pairKey(it.companyCode, c), { companyCode: it.companyCode, code: c });
      }
    }
    const nameMap = await this.resolveNames(pairs.values());
    const resolve = (companyCode: string, code: string | null): string | null =>
      code ? (nameMap.get(pairKey(companyCode, code)) ?? null) : null; // 未命中＝null（與詳情 DTO 逐字一致）

    const dtos: PublicListItemDto[] = result.items.map((it) =>
      this.toDto(it, viewer, resolve, today),
    );
    return { ...result, items: dtos };
  }

  /**
   * F019 `AC-D5`：五組可搜尋下拉之選項。與清單**物理共用** `visibleCandidates()`
   * （於 `buildFilterOptions` 內），故不可見文件之衍生值結構上不可能洩漏至選項。
   *
   * 🔴 本輪**不做快取**（架構 §10.6）：快取鍵必須含 viewer 三維（`roleCode`＋`userSubtype`
   * ＋`orgCode`），漏一維即跨帳號洩漏，而 unit 每次新建實例、測不出跨請求行為。
   */
  async filterOptions(viewer: ViewerScope): Promise<PublicFilterOptions> {
    const items = await this.store.listCandidates();
    const opts = buildFilterOptions(items, viewer, this.clock());

    /**
     * 選項之 value 是裸代碼（跨公司彙總後公司別已遺失），故 (公司,代碼) 配對必須回到**候選項**
     * 身上取。`visibleCandidates` 與 `buildFilterOptions` 內部呼叫的是**同一個**函式，
     * 因此這裡重算不會與選項來源分歧（`AC-D5` 之結構性保證不受影響）。
     */
    const cands = visibleCandidates(items, viewer, this.clock());
    const orgPairs = new Map<string, { companyCode: string; code: string }>();
    for (const d of cands) {
      for (const c of [d.draftingDeptId, d.draftingSectionId]) {
        if (c) orgPairs.set(pairKey(d.companyCode, c), { companyCode: d.companyCode, code: c });
      }
    }
    const orgPairNames = await this.resolveNames(orgPairs.values());
    const nameMap = collapseByCode(orgPairNames, orgPairs.values());

    /**
     * 🔴 `AC-D5` 之 label 解析**全部落在本層**，純函式 `buildFilterOptions` 一行不動。
     * 該純函式之既有斷言（`public-list-filter-options.spec.ts`）逐字鎖定「label fallback 為 code」
     * 與「依 value 排序」，是 `AC-D5` 可見性過濾之回歸鎖；把顯示層的事推進純函式會讓那批鎖
     * 為了顯示需求而被改寫——鎖一旦可改就不是鎖了。
     */
    /**
     * 🔴 逐公司批次解析：`employeeNo` **僅在單一公司內唯一**（見 `PersonStore` JSDoc），
     * 故依候選項所屬公司分組後各打一次，不可把整份員編清單塞給單一公司。
     * 📝 已作廢（⚠ 不得復原）：OLD> `resolvePersonNames(opts.chiefs.map((o) => o.value))`
     * ——單參數呼叫使員編陣列落在 `companyCode` 位置、`employeeNos` 為 `undefined`，
     * 於 `findByEmployeeNos` 對 `undefined` 呼叫 `.map` 而 500。
     */
    const chiefPairs = new Map<string, { companyCode: string; code: string }>();
    for (const d of cands) {
      for (const e of [d.primaryChiefId, ...d.secondaryChiefIds]) {
        if (e) chiefPairs.set(pairKey(d.companyCode, e), { companyCode: d.companyCode, code: e });
      }
    }
    const chiefNames = collapseByCode(
      await this.resolvePersonNamesByCompany(chiefPairs.values()),
      chiefPairs.values(),
    );
    /**
     * 循環別 label＝`lifecycleDisplayName`（含子分類），由候選項本身攜帶（store 已解析），
     * 不另查一次。F019 spec §AC-S2 補註：「組字自 2026-08-16 delta 起由後端提供，前端不再自組」。
     */
    const lifecycleNames = new Map<string, string>();
    for (const it of items) {
      if (it.lifecycleName && !lifecycleNames.has(it.lifecycleId)) {
        lifecycleNames.set(it.lifecycleId, it.lifecycleName);
      }
    }

    // 選項之 label 必須有可顯示文字 ⇒ 未命中一律 fallback 為 code（絕不為空字串／null）。
    const label = (
      group: PublicFilterOptions['draftingCompanies'],
      names: ReadonlyMap<string, string | null>,
    ): typeof group =>
      group
        .map((o) => ({ value: o.value, label: names.get(o.value) || o.value }))
        // 🔴 依 **label** 排序：純函式依 value（代碼／員編／UUID）排序，套上名稱後那個順序在
        // 畫面上看不出任何規律。排序落在解析之後才排得到使用者實際看見的字。
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));

    // 制定公司之 label＝公司主檔全稱（選項 value 為公司代碼）；與 ORG_UNIT 名稱解析無關。
    const companyNames = new Map<string, string | null>(
      opts.draftingCompanies.map((o) => [o.value, resolveCompanyName(o.value)]),
    );

    return {
      ...opts,
      draftingCompanies: label(opts.draftingCompanies, companyNames),
      draftingDepts: label(opts.draftingDepts, nameMap),
      draftingSections: label(opts.draftingSections, nameMap),
      chiefs: label(opts.chiefs, chiefNames),
      lifecycles: label(opts.lifecycles, lifecycleNames),
    };
  }

  /**
   * (公司,組織代碼) 批次解析（去重後逐一查；規模為當頁/選項量級，無 N+1 疑慮）。
   * 回傳以 `pairKey()` 為鍵。
   */
  private async resolveNames(
    pairs: Iterable<{ companyCode: string; code: string }>,
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    for (const { companyCode, code } of pairs) {
      map.set(pairKey(companyCode, code), await this.names.resolveOrgUnitName(companyCode, code));
    }
    return map;
  }

  /** (公司,員編) 批次解析——依公司分組後各打一次批次查詢（維持無 N+1）。 */
  private async resolvePersonNamesByCompany(
    pairs: Iterable<{ companyCode: string; code: string }>,
  ): Promise<Map<string, string | null>> {
    const byCompany = new Map<string, Set<string>>();
    for (const { companyCode, code } of pairs) {
      const set = byCompany.get(companyCode) ?? new Set<string>();
      set.add(code);
      byCompany.set(companyCode, set);
    }
    const map = new Map<string, string | null>();
    for (const [companyCode, empNos] of byCompany) {
      const found = await this.names.resolvePersonNames(companyCode, [...empNos]);
      for (const empNo of empNos) {
        map.set(pairKey(companyCode, empNo), found.get(empNo) ?? null);
      }
    }
    return map;
  }

  /**
   * 內部型別 → 對外 DTO 之**唯一**轉換點（架構 §10.6「對外 DTO 之欄位裁剪落點」）。
   * 裁剪放在這裡，型別系統本身就保證 `PublicListItemDto` 上不存在 `usingDeptIds`／
   * `usingDeptNames`（`hasOwnProperty === false` 自動成立）；放到 controller 以 interceptor
   * 剝除則型別上仍有該欄，且任何新 controller 忘了掛就洩漏。
   */
  private toDto(
    it: PublicDocItem,
    // 🔴 B 階段（多公司）：由裸 `userOrgCode` 改為整個 `viewer`——置頂判定需同時知道部門與公司
    // 別（見 `isPinned`）。傳整個投影而非再拆一個參數，避免日後又漏傳新欄位。
    viewer: ViewerScope,
    resolve: (companyCode: string, code: string | null) => string | null,
    today: Date,
  ): PublicListItemDto {
    return {
      id: it.id,
      documentNumber: it.documentNumber,
      documentName: it.documentName,
      lifecycleId: it.lifecycleId,
      lifecycleName: it.lifecycleName,
      draftingDeptId: it.draftingDeptId,
      draftingDeptName: resolve(it.companyCode, it.draftingDeptId),
      // 🔴 2026-08-27 裁定：制定公司＝文件所屬公司，顯示為公司主檔**全稱**
      //    （和潤企業股份有限公司），不再是該公司 ROOT 之 ORG_UNIT 名（和潤本部）。
      draftingCompanyName: resolveCompanyName(it.companyCode),
      draftingSectionName: resolve(it.companyCode, it.draftingSectionId),
      edition: it.edition,
      status: it.status,
      displayStatus: deriveDisplayStatus(it.status, it.announcedDate, today),
      announcedDate: it.announcedDate,
      contentSummary: it.contentSummary,
      pinned: isPinned(it, viewer.orgCode, viewer.companyCode),
    };
  }
}
