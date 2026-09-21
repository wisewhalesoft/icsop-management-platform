import { addMonthsClamped } from './add-months-clamped';

/**
 * F044 卡④「OJT 準時完成率(1個月內)」之**純函式層**（🟢 零 IO；`ARCH-G1` 裁定聚合落後端）。
 *
 * 🔴 **窗口＝應完成日落在 `[今日 − 1 個月, 今日]`（閉區間）**，應完成日 ＝ `announcedDate + 1 個月`。
 * 🔴 **明文否決**「把窗口反推成 `announcedDate ∈ [今日 − 2 月, 今日 − 1 月]`」之捷徑
 * （architecture-spec §15.2）：`addMonthsClamped` 因月底夾擠而**不可逆**——`2026-01-29`／
 * `2026-01-30`／`2026-01-31` 在 `+1` 之後**同為** `2026-02-28`，該等價不成立。
 * ⇒ **必須正向計算每一列之應完成日再做區間比對。**
 *
 * 🔴 分母＝窗口內之**相異 `(companyCode, orgCode)`**（`AC-G9`；單以 `orgCode` 分組會把不同公司
 * 的兩個部併成一組）；分子＝該單位在窗口內之**全部**應完成文件皆已完成者（部分完成不算，`AC-G10`）。
 * 🔴 完成判定**完全沿用** [F042] `AC-03`（版次相符之場次存在即完成）——`completed` 由呼叫端
 * 自既有 `aggregate()` 帶入；**明文禁止**在此引入 `trainingDate ≤ 應完成日` 之第二種「準時」條件
 * （`AC-G11`：「準時」由時間窗口承載）。
 *
 * ⚠ **窗口外之列既不計入母體、也不進任何一個排除計數**——它們不是「被排除」，只是還沒到期
 * 或早已過期。混進排除計數會讓排除註記的數字對不上使用者在 TAB2 看到的東西。
 */

/** 一列進度列（＝一份文件 × 一個使用單位；沿用 F042 之最小追蹤單位）。 */
export interface OjtOnTimeRow {
  companyCode: string;
  orgCode: string;
  documentId: string;
  /** `YYYY-MM-DD`；未設公告日 ⇒ `null`（`AC-G12` ③ 之排除類別）。 */
  announcedDate: string | null;
  /** ＝ F042 `AC-03` 之判定結果（版次相符之場次存在）。 */
  completed: boolean;
  /** ＝ 該單位是否未裁撤（F042 `AC-17`）。 */
  isActive: boolean;
}

export interface OjtOnTimeStats {
  numerator: number;
  denominator: number;
  /** 🔒 `denominator === 0` 時**省略本鍵**（`AC-G14`）——`0%`／`100%`／`NaN%` 三種謊報都是
   *  「有一個數字可以渲染」才發生的。 */
  rate?: number;
  excludedInactive: number;
  excludedOrphaned: number;
  excludedNoAnnouncedDate: number;
}

/** 複合鍵之分隔符，逐字沿用既有 `orgGroupKeyOf()`／`getSummary()` 之 rollup 鍵形式。 */
const UNIT_KEY_SEPARATOR = '__';

/**
 * @param rows  自既有 `OjtProgressService.aggregate()` 導出之進度列。
 * @param today `YYYY-MM-DD`（UTC；＝ `serverToday(now)`）。
 * @param orphanedCount 🔴 **第三個參數、不自 `rows` 推導**（`ARCH-G1` ①）：孤兒依定義**已不在
 *   `DOC_USING_DEPT` 集合內** ⇒ `aggregate()` 之列裡**結構性地不含孤兒**。該數字之唯一來源是
 *   既有之 `countOrphanedRows()`，由服務層傳入。自 rows 推導者恆為 0。
 */
export function ojtOnTimeRate(
  rows: readonly OjtOnTimeRow[],
  today: string,
  orphanedCount = 0,
): OjtOnTimeStats {
  const from = addMonthsClamped(today, -1);
  let excludedInactive = 0;
  let excludedNoAnnouncedDate = 0;
  const units = new Map<string, { total: number; done: number }>();

  for (const r of rows) {
    // 🔴 `AC-G12` ①：裁撤單位自分子與分母**同時**排除並計數。
    if (r.isActive === false) {
      excludedInactive += 1;
      continue;
    }
    // 🔴 `AC-G12` ③：公告日為 null 者完全不進母體，但**不得靜默忽略**——它要被數出來。
    if (!r.announcedDate) {
      excludedNoAnnouncedDate += 1;
      continue;
    }
    const due = addMonthsClamped(r.announcedDate, 1);
    if (from === null || due === null) continue;
    if (due < from || due > today) continue; // 窗口外：不計入母體、也不進任何排除計數
    const key = `${r.companyCode}${UNIT_KEY_SEPARATOR}${r.orgCode}`;
    const unit = units.get(key) ?? { total: 0, done: 0 };
    unit.total += 1;
    if (r.completed) unit.done += 1;
    units.set(key, unit);
  }

  let numerator = 0;
  for (const unit of units.values()) {
    if (unit.total > 0 && unit.done === unit.total) numerator += 1;
  }

  const stats: OjtOnTimeStats = {
    numerator,
    denominator: units.size,
    excludedInactive,
    excludedOrphaned: orphanedCount,
    excludedNoAnnouncedDate,
  };
  // 🔴 鍵不存在時 TypeScript 會逼呼叫端處理 `undefined` 分支（沿用既有 `coverage.rate` 之紀律）。
  if (stats.denominator > 0) {
    stats.rate = Math.round((numerator / stats.denominator) * 100);
  }
  return stats;
}
