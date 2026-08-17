import { Inject, Injectable } from '@nestjs/common';
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
  resolveOrgUnitName(orgCode: string): Promise<string | null>;
  /** 批次 employeeNo → 姓名。未命中／無姓名之鍵**缺席**於 Map（呼叫端 fallback 為員編）。 */
  resolvePersonNames(employeeNos: string[]): Promise<Map<string, string>>;
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
    const codes = new Set<string>();
    for (const it of result.items) {
      for (const c of [it.draftingCompanyId, it.draftingDeptId, it.draftingSectionId]) {
        if (c) codes.add(c);
      }
    }
    const nameMap = await this.resolveNames(codes);
    const resolve = (code: string | null): string | null =>
      code ? (nameMap.get(code) ?? null) : null; // 未命中＝null（與詳情 DTO 逐字一致）

    const dtos: PublicListItemDto[] = result.items.map((it) =>
      this.toDto(it, viewer.orgCode, resolve, today),
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

    const codes = new Set<string>();
    for (const group of [opts.draftingCompanies, opts.draftingDepts, opts.draftingSections]) {
      for (const o of group) codes.add(o.value);
    }
    const nameMap = await this.resolveNames(codes);

    /**
     * 🔴 `AC-D5` 之 label 解析**全部落在本層**，純函式 `buildFilterOptions` 一行不動。
     * 該純函式之既有斷言（`public-list-filter-options.spec.ts`）逐字鎖定「label fallback 為 code」
     * 與「依 value 排序」，是 `AC-D5` 可見性過濾之回歸鎖；把顯示層的事推進純函式會讓那批鎖
     * 為了顯示需求而被改寫——鎖一旦可改就不是鎖了。
     */
    const chiefNames = await this.names.resolvePersonNames(opts.chiefs.map((o) => o.value));
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

    return {
      ...opts,
      draftingCompanies: label(opts.draftingCompanies, nameMap),
      draftingDepts: label(opts.draftingDepts, nameMap),
      draftingSections: label(opts.draftingSections, nameMap),
      chiefs: label(opts.chiefs, chiefNames),
      lifecycles: label(opts.lifecycles, lifecycleNames),
    };
  }

  /** 組織代碼批次解析（去重後逐一查；規模為當頁/選項量級，無 N+1 疑慮）。 */
  private async resolveNames(codes: Set<string>): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    for (const c of codes) map.set(c, await this.names.resolveOrgUnitName(c));
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
    userOrgCode: string | null | undefined,
    resolve: (code: string | null) => string | null,
    today: Date,
  ): PublicListItemDto {
    return {
      id: it.id,
      documentNumber: it.documentNumber,
      documentName: it.documentName,
      lifecycleId: it.lifecycleId,
      lifecycleName: it.lifecycleName,
      draftingDeptId: it.draftingDeptId,
      draftingDeptName: resolve(it.draftingDeptId),
      draftingCompanyName: resolve(it.draftingCompanyId),
      draftingSectionName: resolve(it.draftingSectionId),
      edition: it.edition,
      status: it.status,
      displayStatus: deriveDisplayStatus(it.status, it.announcedDate, today),
      announcedDate: it.announcedDate,
      contentSummary: it.contentSummary,
      pinned: isPinned(it, userOrgCode),
    };
  }
}
