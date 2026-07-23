import { DocumentListItem, DocumentListFilters } from './documents.store';
import { DocumentStatus, isValidStatus } from './document-status';
import { deriveDisplayStatus, DISPLAY_LABEL } from './display-status';

/** F017 分頁預設（比照 F024）。 */
export const DEFAULT_PAGE_SIZE = 50;

export interface DocumentQueryResult {
  items: DocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

/**
 * F017 狀態篩選：接受原始儲存值（active/inactive/void）或衍生顯示值（已公告/進度中/失效/作廢）。
 *  - 原始值 → 直接比對儲存 status（active 含公告未到者，維持既有語意）。
 *  - 衍生值 → 以 deriveDisplayStatus(status, announcedDate, today) 之顯示標籤比對（需 today）。
 * 決策 F（OQ-F017-01）：清單狀態篩選採衍生值語意；同時相容既有原始值篩選（複合篩選與既有測試）。
 */
export function matchesStatusFilter(
  row: DocumentListItem,
  filterValue: string,
  today: Date,
): boolean {
  if (isValidStatus(filterValue)) {
    return row.status === (filterValue as DocumentStatus);
  }
  const derived = deriveDisplayStatus(row.status, row.announcedDate, today);
  return DISPLAY_LABEL[derived] === filterValue;
}

function includesCi(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * F017 清單查詢純函式：先套用篩選 → 排序 → 分頁切片（順序不可顛倒）。
 * 記憶體等價於 SQL WHERE / ORDER BY / OFFSET-FETCH；供 FakeStore（unit）與 TypeOrmStore（SQL）對齊語意。
 * 未指定排序時保留輸入順序（既有 updatedAt DESC 由 store 於查詢層提供）。
 */
export function applyDocumentQuery(
  rows: DocumentListItem[],
  filters: DocumentListFilters,
  today: Date,
): DocumentQueryResult {
  // 1) 篩選
  let filtered = rows.filter((r) => {
    if (filters.lifecycleId && r.lifecycleId !== filters.lifecycleId) return false;
    if (filters.status && !matchesStatusFilter(r, filters.status, today)) return false;
    if (filters.documentNumber && r.documentNumber !== filters.documentNumber) return false;
    if (filters.documentName && r.documentName !== filters.documentName) return false;
    if (filters.draftingCompanyId && r.draftingCompanyId !== filters.draftingCompanyId) return false;
    if (filters.draftingDeptId && r.draftingDeptId !== filters.draftingDeptId) return false;
    if (filters.draftingSectionId && r.draftingSectionId !== filters.draftingSectionId) return false;
    if (filters.primaryChiefId && r.primaryChiefId !== filters.primaryChiefId) return false;
    if (filters.keyword) {
      const kw = filters.keyword;
      if (!includesCi(r.documentNumber, kw) && !includesCi(r.documentName, kw)) return false;
    }
    return true;
  });

  // 2) 排序（未指定 → 保留輸入順序）
  if (filters.sortBy) {
    const dir = filters.sortDir === 'desc' ? -1 : 1;
    const sortBy = filters.sortBy;
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'documentNumber') {
        return dir * a.documentNumber.localeCompare(b.documentNumber);
      }
      // announcedDate：null 一律排最後（不受 dir 影響）
      const ta = a.announcedDate ? new Date(a.announcedDate).getTime() : null;
      const tb = b.announcedDate ? new Date(b.announcedDate).getTime() : null;
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return dir * (ta - tb);
    });
  }

  // 3) 分頁（1-based；先篩選/排序後切片）
  const total = filtered.length;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  const hasNext = start + items.length < total;

  return { items, total, page, pageSize, hasNext };
}
