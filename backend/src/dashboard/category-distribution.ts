import { DocumentStatus } from '../documents/document-status';
import { deriveDisplayStatus } from '../documents/display-status';

/**
 * F044 §戊（`AC-G61`～`AC-G64`／`AC-G68`）— 依業務/功能類別分布之**純函式層**（🟢 零 IO）。
 *
 * 🔒 INV-G7：分色之判定沿用同一支 `deriveDisplayStatus`，不另寫一份。
 *
 * ⚠ **本層之盲區（architecture-spec §15.10 #1）**：SQL 之 join ＋
 * `DISTINCT (businessCategoryId, documentId)` 是否正確，本輪**無整合測試可驗**——本函式只驗
 * 「給定 pairs → 正確分布」，不驗 pairs 本身是否來自正確的 join。
 * ⇒ 本函式仍自行以 `documentId` 去重：SQL 端已 `DISTINCT` 時這是冗餘的防禦，
 *   SQL 端被改壞時它是唯一還站著的那一道。
 *
 * 🔴 INV-G4／INV-G5 之**刻意不等**（`AC-G68`）：
 *   · 一份文件可掛多個類別 ⇒ 跨類別被重複計入；未掛任何類別之文件完全不出現
 *     ⇒ Σ(各類別) 與卡①②**沒有**恆等關係，**不得**為了對齊而改動任一方。
 *   · 某類別之（已公告＋進度中） **≤** 類別池清單同一列之「掛載文件數」（後者不分狀態）
 *     ⇒ [F043] 之數字**一字不改**。
 */

/** 一筆「類別 × 文件」掛載（SQL 已 `DISTINCT` 到 `(businessCategoryId, documentId)` 這一層）。 */
export interface CategoryDocPair {
  categoryId: string;
  /** ＝ `businessCategoryDisplayName`（F043 既有組裝：`名稱（子分類）`，全形括號無空白）。 */
  displayName: string;
  categoryStatus: 'active' | 'inactive';
  documentId: string;
  documentStatus: DocumentStatus;
  announcedDate: string | null;
}

/** 長條圖之一列。`announced + inProgress > 0`（零掛載與全數不計入者已濾除，`AC-G63`）。 */
export interface CategoryBar {
  categoryId: string;
  displayName: string;
  announced: number;
  inProgress: number;
}

/** 序數比較（🔴 非 `localeCompare`；理由見 `dashboard-analytics.ts` 檔頭）。 */
function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 類別分布（已排序、🔴 **全量**；Top 10 截斷與展開屬前端版面，`AC-G65`）。
 *
 * 🔒 `AC-G61`：統計單位＝**類別**（非節點），同一份文件在同一類別內**只計一次**（相異 `documentId`）。
 * 🔒 `AC-G62`：僅 `status='active'` 之文件計入，並依 `deriveDisplayStatus` 分已公告／進度中兩色；
 *   `inactive`／`void` **完全不計入**（雙色既然逐字就是那兩種，第三、四種狀態沒有可落之色）。
 * 🔒 `AC-G63`：停用之類別不顯示；兩段皆為 0 之類別不顯示。
 * 🔒 `AC-G64`：總數降冪 → `displayName` **序數**昇冪 → `categoryId` 昇冪（絕對決定性）。
 */
export function categoryDistribution(
  pairs: readonly CategoryDocPair[],
  today: Date,
): CategoryBar[] {
  const byCategory = new Map<
    string,
    { displayName: string; docs: Map<string, CategoryDocPair> }
  >();
  for (const p of pairs) {
    // `AC-G63` 第 1 句：停用之類別整列不顯示（其掛載正常，只是不進統計）。
    if (p.categoryStatus !== 'active') continue;
    const bucket = byCategory.get(p.categoryId) ?? {
      displayName: p.displayName,
      docs: new Map<string, CategoryDocPair>(),
    };
    // 🔴 去重之唯一鍵＝`documentId`（同一份文件可掛在同一類別之多個節點）。
    if (!bucket.docs.has(p.documentId)) bucket.docs.set(p.documentId, p);
    byCategory.set(p.categoryId, bucket);
  }

  const bars: CategoryBar[] = [];
  for (const [categoryId, bucket] of byCategory) {
    let announced = 0;
    let inProgress = 0;
    for (const doc of bucket.docs.values()) {
      const status = deriveDisplayStatus(doc.documentStatus, doc.announcedDate, today);
      if (status === 'announced') announced += 1;
      else if (status === 'in_progress') inProgress += 1;
    }
    if (announced + inProgress === 0) continue;
    bars.push({ categoryId, displayName: bucket.displayName, announced, inProgress });
  }

  return bars.sort((a, b) => {
    const ta = a.announced + a.inProgress;
    const tb = b.announced + b.inProgress;
    if (tb !== ta) return tb - ta;
    if (a.displayName !== b.displayName) return ordinal(a.displayName, b.displayName);
    return ordinal(a.categoryId, b.categoryId);
  });
}
