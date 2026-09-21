import { DocumentStatus } from '../documents/document-status';
import { deriveDisplayStatus } from '../documents/display-status';
import { OrgUnitRecord } from '../org-directory/org-unit-read';
import { OrgDimension } from './default-org-dimension';
import { indexOrgUnitsByCompany, orgSegmentOf } from './division-resolver';

/**
 * F044 §甲／§丙／§丁 之**純函式層**（🟢 零 IO；本輪之全部鑑別力集中於此）。
 *
 * 🔴 `ARCH-G0`（architecture-spec §15.1）：**SQL 只做投影／join／DISTINCT；分類、分組、上溯、
 * 排序、截斷、算術一律純函式。** 理由＝本輪沒有整合測試 ⇒ 凡落在 SQL 內之邏輯，一條測試都
 * 碰不到它。
 *
 * 🔒 INV-G7／`AC-G70`：儀表板上「已公告／進度中」之判定在**五處**（卡片、兩張環圖、長條圖、
 * 最新公告清單）皆來自 `deriveDisplayStatus` 這一支純函式，不得各算一份。
 * ⇒ 本檔**不得**出現任何 `announcedDate <= today` 之裸比較。
 *
 * 🔴 排序一律以**序數比較**（`a < b ? -1 : a > b ? 1 : 0`），明文禁止 `localeCompare`
 * ——中文定序隨執行環境之 ICU 版本漂移，本 repo 已記錄「同一份資料在不同機器排出不同順序、
 * 測試一邊綠一邊紅」之缺陷。
 * ⚠ F042 `listRows` 之**既有** `orgName.localeCompare` 一行不准改（`AC-G79`）；新舊規則刻意不同。
 */

/** 文件投影（`status='active'` 之 `ICSOP_DOCUMENT`，8 欄；`architecture-spec` §15.5 ①）。 */
export interface AnalyticsDocRow {
  documentId: string;
  documentNumber: string;
  documentName: string;
  edition: string | null;
  status: DocumentStatus;
  /** `YYYY-MM-DD`（UTC 拆解）；未設公告日 ⇒ `null`。 */
  announcedDate: string | null;
  companyCode: string;
  draftingDeptId: string | null;
}

/** 上方三張卡之計數（卡④ 之口徑刻意不同，住在 `ojt-progress/ojt-ontime.ts`）。 */
export interface CardCounts {
  /** 卡① 累積已公告（不限時間）。 */
  announced: number;
  /** 卡② 進度中（公告日未到或未設公告日）。 */
  inProgress: number;
  /** 卡③ 本月新版公告（公告日落在當月**且已公告**）。 */
  monthlyAnnounced: number;
}

/** 環圖之一段（＝圖例之一列，`AC-G38`：兩者集合恰等）。 */
export interface DonutSlice {
  key: string;
  label: string;
  /** 🔴 恆 ≥ 1（`AC-G30`：分段來自已公告集合）。 */
  announced: number;
  inProgress: number;
}

export interface LatestAnnouncementRow {
  documentId: string;
  /** `YYYY-MM-DD`（UTC 拆解，`AC-G56`）。 */
  announcedDate: string;
  /** `null` ⇒ 前端以既有 `EDITION_NONE_TEXT` 呈現（後端不代換為文字）。 */
  edition: string | null;
  documentName: string;
  displayStatus: 'announced' | 'in_progress';
}

/** 序數比較（🔴 非 `localeCompare`）。 */
function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `Date` → `YYYY-MM-DD`（UTC 拆解，與後端 `serverToday()` 同一基準）。 */
function isoDay(d: string): string {
  return d.slice(0, 10);
}

/** `YYYY-MM-DD` → 該日 UTC 零時之時間戳（供半開區間比較）。 */
function utcMillis(isoDate: string): number {
  return Date.parse(`${isoDay(isoDate)}T00:00:00.000Z`);
}

/**
 * `AC-G5`：「當月」＝半開區間 `[當月 1 日 00:00:00.000Z, 次月 1 日 00:00:00.000Z)`。
 * 🔒 INV-G8：「今日」「當月」之推導在整個功能中各只有一個定義點。
 */
export function monthWindow(today: Date): { start: Date; endExclusive: Date } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1)),
    endExclusive: new Date(Date.UTC(y, m + 1, 1)),
  };
}

/**
 * `AC-G2`／`AC-G3`／`AC-G4` — 三張卡之計數，🔒 **同一份投影、同一個 `now`、同一次分類**。
 *
 * 🔴 卡③ 之 `announced` 條件**已同時涵蓋**「`status='active'`」與「公告日 ≤ 今日」
 * ⇒ 此處**不得**再寫一次 `announcedDate <= today` 之比較（`AC-G4` 第 2 句）。
 * 🔴 **明文禁止**讀取 `DOCUMENT_CHANGE_LOG`（`OQ-D44-01` ＝ 甲；該日誌自 F037 起才有、無 backfill）。
 */
export function countCards(docs: readonly AnalyticsDocRow[], today: Date): CardCounts {
  const { start, endExclusive } = monthWindow(today);
  let announced = 0;
  let inProgress = 0;
  let monthlyAnnounced = 0;
  for (const d of docs) {
    const status = deriveDisplayStatus(d.status, d.announcedDate, today);
    if (status === 'announced') {
      announced += 1;
      if (d.announcedDate) {
        const ms = utcMillis(d.announcedDate);
        if (ms >= start.getTime() && ms < endExclusive.getTime()) monthlyAnnounced += 1;
      }
    } else if (status === 'in_progress') {
      inProgress += 1;
    }
  }
  return { announced, inProgress, monthlyAnnounced };
}

/**
 * `AC-G29`～`AC-G41`／`AC-G85` — 環圖之各段（恆回**全量**，Top N 合併屬前端版面參數）。
 *
 * 🔴 **分段來自已公告集合**（`AC-G30`）：`inProgress` **只加在已有環段的組織上**。
 * 只有進度中、沒有任何已公告之組織因而不產生環段、也不產生圖例列 ⇒ 卡②「進度中」
 * ＞ Σ圖例進度中（INV-G3／`AC-G39`）。**這個不等式是刻意的**，補上會產生 0 度的環段
 * 並破壞 `AC-G30`。
 *
 * 🔴 **「進度中」與時間窗口無關**（INV-G6）：它是「當下尚未到公告日」之狀態 ⇒ 同一組織於
 * 「當月已公告」與「累積已公告」兩區之 `inProgress` **恆等**。
 *
 * 🔒 排序（`AC-G85`）：`announced` 降冪 → `label` **序數**昇冪 → `key` 昇冪。
 * 🔴 兩個 sentinel 段**參與同一排序、不強制置底**——置底等於把資料品質問題推到看不見的地方，
 *   與 `AC-G34`「禁止排除」之意旨相反。
 */
export function donutSlices(input: {
  docs: readonly AnalyticsDocRow[];
  orgUnits: readonly OrgUnitRecord[];
  dimension: OrgDimension;
  scope: 'month' | 'cumulative';
  today: Date;
}): DonutSlice[] {
  const { docs, orgUnits, dimension, scope, today } = input;
  const byCompany = indexOrgUnitsByCompany(orgUnits);
  const { start, endExclusive } = monthWindow(today);

  const map = new Map<string, DonutSlice>();
  const inWindow = (d: AnalyticsDocRow): boolean => {
    if (scope === 'cumulative') return true;
    if (!d.announcedDate) return false;
    const ms = utcMillis(d.announcedDate);
    return ms >= start.getTime() && ms < endExclusive.getTime();
  };

  const pending: AnalyticsDocRow[] = [];
  for (const d of docs) {
    const status = deriveDisplayStatus(d.status, d.announcedDate, today);
    if (status === 'announced') {
      if (!inWindow(d)) continue;
      const seg = orgSegmentOf(byCompany, d.companyCode, d.draftingDeptId, dimension);
      const hit = map.get(seg.key);
      if (hit) hit.announced += 1;
      else map.set(seg.key, { key: seg.key, label: seg.label, announced: 1, inProgress: 0 });
    } else if (status === 'in_progress') {
      pending.push(d);
    }
  }
  for (const d of pending) {
    const seg = orgSegmentOf(byCompany, d.companyCode, d.draftingDeptId, dimension);
    const hit = map.get(seg.key);
    if (hit) hit.inProgress += 1;
  }

  return [...map.values()].sort((a, b) => {
    if (b.announced !== a.announced) return b.announced - a.announced;
    if (a.label !== b.label) return ordinal(a.label, b.label);
    return ordinal(a.key, b.key);
  });
}

/**
 * `AC-G52`～`AC-G56` — 最新公告（ICSOP 版本更新）。
 *
 * 🔴 母體恰為 `status='active'` ∧ `announcedDate` 非 `null`；⚠ **含「公告日在未來」之進度中
 * 文件**（若只含已公告，`狀態` 欄將恆為同一值、零資訊量）。
 * 🔴 **先排序、再截斷**（`AC-G54`）：先截斷會得到錯的十筆，且在小語料下看不出來。
 * 🔒 排序完全決定性：`announcedDate` 降冪 → `documentNumber` 昇冪 → `documentId` 昇冪
 *   （皆為序數比較，禁 `localeCompare`）。
 */
export function latestAnnouncements(
  docs: readonly AnalyticsDocRow[],
  limit: number,
  today: Date,
): LatestAnnouncementRow[] {
  const pool = docs.filter((d) => d.status === 'active' && d.announcedDate !== null);
  const sorted = [...pool].sort((a, b) => {
    const da = isoDay(a.announcedDate as string);
    const db = isoDay(b.announcedDate as string);
    if (da !== db) return ordinal(db, da);
    if (a.documentNumber !== b.documentNumber) return ordinal(a.documentNumber, b.documentNumber);
    return ordinal(a.documentId, b.documentId);
  });
  return sorted.slice(0, limit).map((d) => {
    const status = deriveDisplayStatus(d.status, d.announcedDate, today);
    return {
      documentId: d.documentId,
      announcedDate: isoDay(d.announcedDate as string),
      edition: d.edition,
      documentName: d.documentName,
      // 母體已限定 `status='active'` ⇒ 值域恰二值；`inactive`／`void` 結構上不可達。
      displayStatus: status === 'announced' ? 'announced' : 'in_progress',
    };
  });
}
