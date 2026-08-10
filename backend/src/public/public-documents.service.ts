import { Inject, Injectable } from '@nestjs/common';
import { DocumentStatus } from '../documents/document-status';
import { DisplayStatus, deriveDisplayStatus } from '../documents/display-status';
import {
  PublicDocItem,
  PublicListFilters,
  PublicListPage,
  buildPublicList,
  isPinned,
  DEFAULT_PAGE_SIZE,
} from './public-list';
import { PUBLIC_DOCUMENT_STORE, PublicDocumentStore } from './public-documents.store';
import { ViewerScope } from '../rbac/viewer-scope';

/** 組織單位名稱解析器（結構相容 NameResolutionService.resolveOrgUnitName）。 */
export interface OrgNameResolver {
  resolveOrgUnitName(orgCode: string): Promise<string | null>;
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
  /** 制定部門名稱（解析失敗 → fallback 為代碼；供前端不顯示 undefined/null）。 */
  draftingDeptName: string | null;
  usingDeptIds: string[];
  /** 使用部門名稱（逐一解析，fallback 為代碼）。 */
  usingDeptNames: string[];
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

    // 僅解析當頁項目之組織代碼（去重、單次查詢）。
    const codes = new Set<string>();
    for (const it of result.items) {
      if (it.draftingDeptId) codes.add(it.draftingDeptId);
      for (const c of it.usingDeptIds) codes.add(c);
    }
    const nameMap = new Map<string, string | null>();
    for (const c of codes) nameMap.set(c, await this.names.resolveOrgUnitName(c));

    const resolve = (code: string): string => nameMap.get(code) ?? code; // fallback＝代碼

    const dtos: PublicListItemDto[] = result.items.map((it) =>
      this.toDto(it, viewer.orgCode, resolve, today),
    );
    return { ...result, items: dtos };
  }

  private toDto(
    it: PublicDocItem,
    userOrgCode: string | null | undefined,
    resolve: (code: string) => string,
    today: Date,
  ): PublicListItemDto {
    return {
      id: it.id,
      documentNumber: it.documentNumber,
      documentName: it.documentName,
      lifecycleId: it.lifecycleId,
      lifecycleName: it.lifecycleName,
      draftingDeptId: it.draftingDeptId,
      draftingDeptName: it.draftingDeptId ? resolve(it.draftingDeptId) : null,
      usingDeptIds: it.usingDeptIds,
      usingDeptNames: it.usingDeptIds.map(resolve),
      status: it.status,
      displayStatus: deriveDisplayStatus(it.status, it.announcedDate, today),
      announcedDate: it.announcedDate,
      contentSummary: it.contentSummary,
      pinned: isPinned(it, userOrgCode),
    };
  }
}
