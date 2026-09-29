import { addMonthsClamped } from './add-months-clamped';

/**
 * F044 卡④「OJT 準時完成率(訓練日已截止)」之**純函式層**（🟢 零 IO；`ARCH-G1` 裁定聚合落後端）。
 *
 * ## 2026-09-29 口徑改版（使用者裁決，取代原「(1個月內)／相異單位」口徑）
 * 🔴 **計數單位＝「文件 × 使用單位 × 要求訓練之版次」**（不分版次統計）——不再依單位聚合：
 *   · 一份文件改版並要求重訓過一次 ⇒ 每個使用單位對它有**兩筆**應完成（舊版、新版各一）；
 *   · 分子＝其中該單位**確實在那一版辦過場次**者（版次比對 `null` 對 `null` 亦相符，沿用 F042 `AC-37`）。
 * 🔴 **母體＝訓練日已截止者**：應完成日（`announcedDate + 1 個月`，月底夾擠）**早於**今日。
 *   · 不再有「近 1 個月」之下界——已截止者全部納入；
 *   · 應完成日＝今日者**不算已截止**（當天仍可完成）；公告日在未來者自然不在母體內。
 *   · 🔴 公告日取**文件層**之 `announcedDate`（只有一個值、屬當下版次），舊版次沿用同一個日期判定。
 * 🔒 「準時」仍由母體條件承載，**不**比較場次之訓練日期（原 `AC-G11` 之紀律不變）。
 *
 * ## 排除計數（⚠ 計數單位各不相同，前端文案逐一對應）
 *   · `excludedInactive`：已裁撤之**相異單位**數（`(companyCode, orgCode)`）；
 *   · `excludedOrphaned`：由服務層傳入（`countOrphanedRows()`，孤兒在列裡結構性地不存在）；
 *   · `excludedNoAnnouncedDate`：未設公告日之**相異文件**數。
 *   ⚠ 應完成日未到者**既不計入母體、也不進任何排除計數**——它們只是還沒到期。
 */

/** 一列進度列（＝一份文件 × 一個使用單位；沿用 F042 之最小追蹤單位）。 */
export interface OjtOnTimeRow {
  companyCode: string;
  orgCode: string;
  documentId: string;
  /** `YYYY-MM-DD`（容許完整 ISO 字串）；未設公告日 ⇒ `null`。 */
  announcedDate: string | null;
  /** ＝ 該單位是否未裁撤（F042 `AC-17`）。 */
  isActive: boolean;
  /** 該文件曾要求訓練之全部版次（`OJT_TRAINING_EDITION` ∪ 當下基準；`null`＝無版次概念）。 */
  requiredEditions: readonly (string | null)[];
  /** 該單位對該文件辦過場次之版次（場次快照之 `edition`）。 */
  trainedEditions: readonly (string | null)[];
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

/** 版次之比對鍵：`null` 與任何字串版次皆可區分（不使用 NUL 等控制字元）。 */
function editionKey(edition: string | null): string {
  return edition === null ? 'none' : `v:${edition}`;
}

/**
 * @param rows  進度列（服務層自 `aggregate()` ＋ 版次紀錄 ＋ 場次組出）。
 * @param today `YYYY-MM-DD`（UTC；＝ `serverToday(now)`）。
 * @param orphanedCount 第三個參數、不自 `rows` 推導（孤兒不在 `DOC_USING_DEPT` 集合內，列裡恆無孤兒）。
 */
export function ojtOnTimeRate(
  rows: readonly OjtOnTimeRow[],
  today: string,
  orphanedCount = 0,
): OjtOnTimeStats {
  const inactiveUnits = new Set<string>();
  const noAnnouncedDocs = new Set<string>();
  let numerator = 0;
  let denominator = 0;

  for (const r of rows) {
    if (r.isActive === false) {
      inactiveUnits.add(`${r.companyCode}__${r.orgCode}`);
      continue;
    }
    if (!r.announcedDate) {
      noAnnouncedDocs.add(r.documentId);
      continue;
    }
    const due = addMonthsClamped(r.announcedDate, 1);
    if (due === null || !(due < today)) continue; // 訓練日未截止：不計入、也不算排除

    const trained = new Set(r.trainedEditions.map(editionKey));
    for (const key of new Set(r.requiredEditions.map(editionKey))) {
      denominator += 1;
      if (trained.has(key)) numerator += 1;
    }
  }

  const stats: OjtOnTimeStats = {
    numerator,
    denominator,
    excludedInactive: inactiveUnits.size,
    excludedOrphaned: orphanedCount,
    excludedNoAnnouncedDate: noAnnouncedDocs.size,
  };
  if (denominator > 0) stats.rate = Math.round((numerator / denominator) * 100);
  return stats;
}
