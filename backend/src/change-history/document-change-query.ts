import { DocumentChangeLogRow } from './document-change-log.store';

/** F037 程序書變更歷程查詢條件（任意組合；比照 F024 查詢模式）。 */
export interface DocumentChangeFilters {
  /** 程序書：文件編號子字串（不分大小寫）。 */
  doc?: string;
  /** 變更欄位：欄位屬性名子字串（不分大小寫；前端另做中文欄名對照）。 */
  field?: string;
  /** 操作人：姓名或員工編號子字串（不分大小寫）。 */
  person?: string;
  /** 起始日期（YYYY-MM-DD，含當日）。 */
  from?: string;
  /** 結束日期（YYYY-MM-DD，含當日）。 */
  to?: string;
}

const inc = (hay: string | null, needle: string): boolean =>
  (hay ?? '').toLowerCase().includes(needle.toLowerCase());

/** occurredAt 之本地日期（伺服器時間），取 YYYY-MM-DD 供 from/to 比對。 */
function dayOf(d: Date): string {
  // 以 UTC 切片會位移；此處以本地時間欄位組出 YYYY-MM-DD（與 F024 一致，伺服器時間權威）。
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 篩選＋排序（時間新到舊）之純函式（比照 F024 resolveAuditQuery，避免「測到 fake」）。
 * 空條件不阻擋（回全部；分頁/近 30 天預設由呼叫端視需要再套）。
 */
export function filterDocumentChanges(
  rows: DocumentChangeLogRow[],
  filters: DocumentChangeFilters,
): DocumentChangeLogRow[] {
  const out = rows.filter((r) => {
    if (filters.doc && !inc(r.documentNumber, filters.doc)) return false;
    if (filters.field && !inc(r.field, filters.field)) return false;
    if (
      filters.person &&
      !(inc(r.actorName, filters.person) || inc(r.actorEmployeeNo, filters.person))
    )
      return false;
    const day = dayOf(r.occurredAt);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    return true;
  });
  return out.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
