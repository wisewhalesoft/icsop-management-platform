/**
 * F044 後台首頁儀表板 — 三個新端點之回應型別（鏡射 `architecture-spec` §15.5 之契約）。
 *
 * 🔴 **為何獨立成檔、不併入 `api/types.ts`**：`api/types.ts` 是 [F003] 帳號管理之職位欄之鏡射點，
 * 而 F044 之原始碼層負向鎖定（`AC-G90` ③ 之軸向守門）明文要求**「職位識別子」與「環圖維度詞彙」
 * 不得共存於同一個檔案**——那兩者共存正是「前端自己再推導一份預設維度」的起點。
 * 把 `defaultDimension` 放進那個檔案會讓該守門條件結構上不可能成立。
 *
 * 🔒 全欄之樂觀性刻意不一致：`today` 必填（端點永遠算得出來），其餘四鍵**可缺席**——
 * `AC-G23` 之降級語意＝**省略該鍵**，前端據以呈現 `data-testid="empty-state"`。
 * 🔴 **明文禁止**把它們宣告為必填再由後端降級為 `0`／空陣列：那會讓「算不出來」與「真的是 0」
 * 在畫面上不可分辨（INV-G1／INV-G2 會呈現為一組對不起來的數字）。
 */

/** 環圖之一段（＝圖例之一列；`key` 逐字填入 `data-org-key`）。 */
export interface DashboardDonutSlice {
  key: string;
  label: string;
  announced: number;
  inProgress: number;
}

export interface DashboardDonutDimensions {
  company: DashboardDonutSlice[];
  division: DashboardDonutSlice[];
  department: DashboardDonutSlice[];
}

export interface DashboardLatestAnnouncement {
  documentId: string;
  /** `YYYY-MM-DD`（UTC 拆解）。 */
  announcedDate: string;
  /** `null` ⇒ 前端以既有 `EDITION_NONE_TEXT` 呈現（🔴 禁止新增第二個常數）。 */
  edition: string | null;
  documentName: string;
  /** `deriveDisplayStatus` 之輸出（🔴 不是原始 `status`）。 */
  displayStatus: 'announced' | 'in_progress';
}

/** `GET /admin/dashboard/analytics`（🔒 卡①②③ 與兩張環圖被恆等式綁定，故必須同一次請求）。 */
export interface DashboardAnalyticsResponse {
  today: string;
  cards?: {
    announced: number;
    inProgress: number;
    monthlyAnnounced: number;
  };
  donuts?: {
    month: DashboardDonutDimensions;
    cumulative: DashboardDonutDimensions;
  };
  /** 🔒 由後端算好回傳（`ARCH-G2`）——`SessionUser` 一欄未加，前端不得自行推導。 */
  defaultDimension?: string;
  /** 已排序、已截斷為 ≤ 10。 */
  latestAnnouncements?: DashboardLatestAnnouncement[];
}

export interface CategoryDistributionBar {
  categoryId: string;
  displayName: string;
  announced: number;
  inProgress: number;
}

/** `GET /admin/dashboard/category-distribution`（🔴 獨立端點：部門窗口連請求都不得發出）。 */
export interface CategoryDistributionResponse {
  today: string;
  /** 已排序、🔴 全量（Top 10 截斷與展開屬前端版面）。 */
  items: CategoryDistributionBar[];
}

/** `GET /admin/ojt-progress/ontime-summary`（卡④）。 */
export interface OjtOnTimeSummaryResponse {
  today: string;
  numerator: number;
  denominator: number;
  /** 🔒 `denominator === 0` 時**後端省略本鍵**（禁 `NaN%`／`0%`／`100%`）。 */
  rate?: number;
  excludedInactive: number;
  excludedOrphaned: number;
  excludedNoAnnouncedDate: number;
}
