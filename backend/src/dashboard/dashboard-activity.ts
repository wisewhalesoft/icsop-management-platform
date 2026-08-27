import {
  FunctionKey,
  type FunctionKeyValue,
  canPerform,
} from '../rbac/function-matrix';

/**
 * 後台儀表板「最近活動」之契約與純規則（prototypes/07-admin-shell.html 之 ACTIVITY 區塊）。
 *
 * prototype 之五列示範資料各自對應一個**真實事件來源**（本檔僅定義分類與文案，查詢見
 * dashboard-activity.sources.ts）：
 *   建立文件／每日組織同步／帳號自動停用／循環結構變更／文件被下載。
 *
 * 🔴 角色過濾（與 KPI 列同一原則，且**於伺服端**執行）：prototype 對五種角色顯示同一份示範清單，
 *    但活動列承載 PII（下載者姓名、被停用者姓名）與各功能區之事實，故每種活動綁定其資料所屬之
 *    F025 功能鍵，僅在該角色對該功能有 read 權時才查詢／回傳。fail-closed：未知角色→無任何活動。
 *    ⇒ 主管／部門窗口僅見其功能範圍內之活動（文件建立、循環變更），不得見帳號／調閱／同步活動。
 *
 * 純函式、零 IO、零 Nest DI。
 */

/** 活動分類（＝prototype ACTIVITY 五列之型別化；順序即為 kind 巡覽順序，與呈現排序無關）。 */
export type DashboardActivityKind =
  | 'DOCUMENT_CREATED'
  | 'ORG_SYNC_COMPLETED'
  | 'ACCOUNT_DISABLED'
  | 'LIFECYCLE_CHANGED'
  | 'DOCUMENT_DOWNLOADED';

export const ACTIVITY_KINDS: readonly DashboardActivityKind[] = [
  'DOCUMENT_CREATED',
  'ORG_SYNC_COMPLETED',
  'ACCOUNT_DISABLED',
  'LIFECYCLE_CHANGED',
  'DOCUMENT_DOWNLOADED',
];

/**
 * 單列活動。text 於伺服端組妥（前端僅負責圖示／顏色／相對時間），
 * 使「誰看得到什麼字」與角色過濾同一處決定，避免前端再拼接而洩漏未授權欄位。
 */
export interface DashboardActivityItem {
  /** 穩定鍵（來源表前綴＋來源列 id），供前端 list key；跨來源不碰撞。 */
  id: string;
  kind: DashboardActivityKind;
  /** 已組妥之單行中文敘述（比照 prototype 一列一句）。 */
  text: string;
  /** 事件時間（ISO 8601，UTC）。相對時間之呈現由前端以瀏覽器時區推導。 */
  occurredAt: string;
}

/** 活動分類 → 其資料所屬之 F025 功能鍵（該角色需具 read 權）。 */
export const ACTIVITY_FUNCTION: Readonly<
  Record<DashboardActivityKind, FunctionKeyValue>
> = {
  DOCUMENT_CREATED: FunctionKey.ICSOP_DOCUMENT_MANAGEMENT,
  ORG_SYNC_COMPLETED: FunctionKey.ORG_SYNC_MANAGEMENT,
  ACCOUNT_DISABLED: FunctionKey.ACCOUNT_MANAGEMENT,
  LIFECYCLE_CHANGED: FunctionKey.LIFECYCLE_MANAGEMENT,
  DOCUMENT_DOWNLOADED: FunctionKey.DOCUMENT_ACCESS_HISTORY,
};

/** 該角色可見之活動分類（fail-closed，見檔頭）。 */
export function visibleActivityKinds(
  roleCode: string | undefined,
): DashboardActivityKind[] {
  return ACTIVITY_KINDS.filter((k) =>
    canPerform(roleCode, ACTIVITY_FUNCTION[k], 'read'),
  );
}

/** 預設列數＝prototype ACTIVITY 之列數；上限防止前端以 limit 取代調閱歷程查詢。 */
export const ACTIVITY_LIMIT_DEFAULT = 5;
export const ACTIVITY_LIMIT_MAX = 20;

/** limit 正規化：非數字/非正數 → 預設；超過上限 → 上限。 */
export function normalizeActivityLimit(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return ACTIVITY_LIMIT_DEFAULT;
  return Math.min(Math.floor(n), ACTIVITY_LIMIT_MAX);
}

/**
 * 合併多來源清單：時間新→舊，同時間以 id 遞增穩定排序（避免每次請求順序跳動），取前 limit 列。
 * 無效時間戳（NaN）視為最舊，排在最後而非污染排序。
 */
export function mergeActivity(
  lists: readonly (readonly DashboardActivityItem[])[],
  limit: number,
): DashboardActivityItem[] {
  const at = (i: DashboardActivityItem): number => {
    const t = Date.parse(i.occurredAt);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };
  return lists
    .flat()
    .sort((a, b) => at(b) - at(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit);
}

// ===== 文案（各來源之單行敘述；逐句比照 prototype ACTIVITY 之句型） =====

const dash = (v: string | null | undefined): string => (v && v.trim()) || '—';

/** 「ICSOP-SRC-101-1-01 車輛分期進件作業 已建立」 */
export function documentCreatedText(
  documentNumber: string | null,
  documentName: string | null,
): string {
  return `${dash(documentNumber)} ${dash(documentName)} 已建立`;
}

/** 「每日組織同步完成，異動 12 筆」（手動觸發 → 「手動組織同步完成…」）。 */
export function orgSyncCompletedText(
  triggerType: string | null,
  changeCount: number | null,
): string {
  const how = triggerType === 'manual' ? '手動' : '每日';
  return `${how}組織同步完成，異動 ${changeCount ?? 0} 筆`;
}

/** 「帳號 20321（周立群·離職）自動停用」；手動停用 → 「帳號 …（…·手動）已停用」。 */
export function accountDisabledText(
  loginId: string | null,
  name: string | null,
  disableReason: string | null,
): string {
  const departed = disableReason === 'departed';
  return `帳號 ${dash(loginId)}（${dash(name)}·${departed ? '離職' : '手動'}）${
    departed ? '自動停用' : '已停用'
  }`;
}

/** 「循環『銷售及收款循環』新增節點『案件結束作業』」；循環名解析不到 → 僅摘要。 */
export function lifecycleChangedText(
  lifecycleName: string | null,
  summary: string,
): string {
  return lifecycleName ? `循環『${lifecycleName}』${summary}` : summary;
}

/** 「ICSOP-SRC-101-1-01 車輛分期進件作業 被下載（王小明）」 */
export function documentDownloadedText(
  documentNumber: string | null,
  documentName: string | null,
  actorName: string | null,
): string {
  return `${dash(documentNumber)} ${dash(documentName)} 被下載（${dash(actorName)}）`;
}
