import { BadRequestException } from '@nestjs/common';
import { LifecycleIdentity, normalizeSubcategory } from '../lifecycle/lifecycle-subcategory';

/**
 * F040 §E 文件之循環選取有效性（INV-4）。規格權威：F040 AC-25／AC-26／AC-27。
 *
 * 判定式（AC-25 逐字）：所指列之 `subcategory` 為 `null`，**且**池中存在同 `name`、
 * `subcategory ≠ null` 之其他列 → 該 `lifecycleId` 在其名稱下非合法唯一解。
 * 這是後端 `LIFECYCLE_SUBCATEGORY_REQUIRED` 之**唯一**觸發情境。
 *
 * ⚠ 邊界（AC-24）：`lifecycleId` **缺漏**不屬本判定範圍——該情境歸既有必填檢查
 * （`DOCUMENT_REQUIRED_FIELD_MISSING`），須在呼叫本判定之前完成。
 *
 * ⚠ 池中查無所指列（G-F040-01，規格未定義之中間情境）：本判定**不裁決**、視為通過，
 * 沿用既有「找不到資源」之處置（DB FK 完整性／既有 404 路徑），不發明新錯誤碼。
 */
export function isLifecycleSelectable(
  lifecycleId: string,
  pool: LifecycleIdentity[],
): boolean {
  const target = pool.find((l) => l.id === lifecycleId);
  if (!target) return true; // G-F040-01：非本規則所管
  if (normalizeSubcategory(target.subcategory) !== null) return true; // 有子分類 → 恆為合法唯一解
  // 無子分類之列：同名下若另有「有子分類」之列（違反 INV-2 之過渡期髒資料）→ 非唯一解。
  return !pool.some(
    (l) =>
      l.id !== target.id &&
      l.name === target.name &&
      normalizeSubcategory(l.subcategory) !== null,
  );
}

/** 違反 INV-4 → 400 `LIFECYCLE_SUBCATEGORY_REQUIRED`（不產生／不變更任何文件記錄）。 */
export function assertLifecycleSelectable(
  lifecycleId: string,
  pool: LifecycleIdentity[],
): void {
  if (!isLifecycleSelectable(lifecycleId, pool)) {
    throw new BadRequestException('LIFECYCLE_SUBCATEGORY_REQUIRED');
  }
}
