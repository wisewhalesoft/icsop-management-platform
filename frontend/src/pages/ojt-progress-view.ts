import type { OjtProgressRow } from '../api/types';

/**
 * F042 OJT 進度管理之**逐字文案常數與純規則**（自 `OjtProgressPage.tsx` 抽出，使頁面元件
 * 只剩渲染）。逐字值之權威＝`prototypes/25-ojt-progress.html` 之「逐字文案常數」區
 * （`AC-28` ①～⑥ 之落點），照抄不得改寫。
 */

// ── AC-28 ①：分頁 ──
export const TAB_DASHBOARD_TEXT = '儀表板';
export const TAB_SESSIONS_TEXT = 'OJT 資料清單';

// ── AC-28 ②：TAB1 三區標題（區一為半形連字號；區二 2026-08-28 定稿為「部門完成率」，
//    原「處室／部門完成率」與 rollup 只到部層之裁決不符）──
export const SEC_COVERAGE_TITLE = '文件-訓練覆蓋率';
export const SEC_ROLLUP_TITLE = '部門完成率';
export const SEC_RECENT_TITLE = '最近完成 OJT 的單位';

// ── AC-28 ③：進度列完成／未完成兩態（字面取自 `AC-03` 之判定用語，不另造詞）──
export const BADGE_COMPLETED_TEXT = '已完成';
export const BADGE_PENDING_TEXT = '尚未完成';
export const BADGE_COMPLETED_ICON = 'circle-check-big';
export const BADGE_PENDING_ICON = 'circle-dashed';

/**
 * `AC-25` 孤兒列註記。
 * 🔒 刻意**不動完成徽章本身**：該單位確實辦過訓練，那是既成事實；改變的只是「這一列還算不算
 * 在追蹤範圍內」⇒ 用一則獨立註記表達，而非把徽章改成第三種狀態（那會讓人以為訓練紀錄失效了）。
 */
export const ORPHAN_NOTE_TEXT = '單位已移出使用部門，不計統計';
export const ORG_INACTIVE_TEXT = '已裁撤';

// ── AC-28 ④：新增場次 ──
export const ADD_SESSION_TEXT = '新增場次';
export function addSessionAria(documentNumber: string, orgName: string): string {
  return `新增教育訓練場次（${documentNumber} · ${orgName}）`;
}

// ── AC-28 ⑤：場次登記表單之欄位 label 與錯誤提示 ──
export const FIELD_TRAINING_DATE_LABEL = '訓練日期';
export const FIELD_SIGNIN_FILE_LABEL = '簽到表檔案';
export const ERR_DATE_REQUIRED = '請選擇訓練日期。';
export const ERR_DATE_FUTURE = '訓練日期不得晚於今日；場次記錄的是已發生之教育訓練事實。';
export const ERR_FILE_REQUIRED = '請選擇簽到表檔案（pdf / jpg / jpeg / png，單檔 ≤ 50 MB）。';

// ── AC-28 ⑥：四種空狀態（皆為「明確之空狀態提示」，非空白、非錯誤）──
export const EMPTY_SESSIONS_TEXT = '此單位尚未登記任何教育訓練場次';
export const EMPTY_RECENT_TEXT = '此時間窗口內尚無新登記之教育訓練場次';
export const EMPTY_ROWS_TEXT = '查無符合條件的進度列';
export const EMPTY_ALL_TEXT = '目前沒有任何 OJT 進度列';
/**
 * 🔴 全域空狀態之補充提示：進度列**由文件之使用部門衍生**，不是在本頁建立的。沒有列時本頁
 * 沒有、也不應該有任何「新增進度列」入口——少了這一句，畫面會變成「一個列都沒有、也看不出
 * 該去哪裡」之死路。
 */
export const EMPTY_ALL_HINT =
  '進度列由各 ICSOP 文件之「文件使用部門」衍生而得，無法於本頁建立；請先至「ICSOP 文件管理」為文件指定使用部門。';

/** `AC-06`：SysAdmin 唯讀橫幅。 */
export const RO_NOTICE_SYSADMIN =
  '唯讀模式 · 系統管理員可檢視儀表板與 OJT 資料清單之全部內容，並下載簽到表；無法新增教育訓練場次（PERMISSION_DENIED）。';

/** `AC-07`：一般使用者之全頁封鎖說明（側選單亦不呈現本項）。 */
export const BLOCKED_TITLE = '無 OJT 進度管理權限';
export const BLOCKED_MSG = '一般使用者無「OJT 進度管理」存取權（側選單亦不呈現本項）。';

/**
 * `AC-16` PII 說明句。分段為具名常數陣列後 `.map()` 渲染——逐字 `textContent` 斷言最怕
 * JSX 跨行字面量被補上空白，分段渲染使串接結果與此處字面逐字相同。
 */
export const PII_NOTE_SEGMENTS = [
  { text: '本區僅呈現單位／文件／日期層級之聚合資訊，', strong: false },
  { text: '不揭露個別受訓人員之姓名或員工編號', strong: true },
  { text: '。', strong: false },
] as const;

/** `AC-21`／`AC-24` 之共用區塊文案於文件頁；本頁僅用到刪除確認之三分支。 */
export const DEL_CONFIRM_TITLE = '刪除此教育訓練場次？';
export const DEL_CONFIRM_OK_TEXT = '確認刪除';

/**
 * `AC-19` 刪除確認之**三種**措辭（prototype 25 `delConfirmBody`，逐字）。
 *
 * 🔴 三者不可合流：①② 末句明講更正路徑（`OQ-E11-16`＝B 不開放編輯，使用者若不知道「刪掉再
 * 登記一次」是唯一更正方式，會以為登記錯了就補救不了）；③ 之孤兒列**最後一筆**則必須明說
 * **沒有**這條路——該列刪完即整列消失，且該單位已非使用部門，無法重新登記。
 */
export function delConfirmBody(isLast: boolean, isOrphan: boolean): string {
  if (isOrphan && isLast) {
    return (
      '刪除後此場次紀錄與其簽到表檔案將無法復原。此為該列最後一筆場次，且該使用單位已移出本文件之使用部門，' +
      '刪除後此列將自清單中消失、無法再重新登記（該單位已非使用部門）。此操作會寫入稽核。'
    );
  }
  return (
    (isLast
      ? `刪除後此場次紀錄與其簽到表檔案將無法復原。此為該列最後一筆場次，刪除後該使用單位對本文件之狀態將退回「${BADGE_PENDING_TEXT}」。`
      : `刪除後此場次紀錄與其簽到表檔案將無法復原。該列尚有其他場次，刪除後仍為「${BADGE_COMPLETED_TEXT}」。`) +
    '此操作會寫入稽核。場次不提供編輯，如需更正請刪除後重新登記。'
  );
}

/** 下載鈕之 aria-label：同日多梯（上下午）時以檔名區辨，避免同一畫面上多顆同名鈕。 */
export function downloadSessionAria(trainingDate: string, fileName: string): string {
  return `下載簽到表（${trainingDate} · ${fileName}）`;
}

/** 刪除鈕之 aria-label（同上）。 */
export function deleteSessionAria(trainingDate: string, fileName: string): string {
  return `刪除教育訓練場次（${trainingDate} · ${fileName}）`;
}

// ── AC-26 待歸位區 ──
export const PENDING_TITLE_TEXT = '待歸位（尚未指派使用單位）';
export const PENDING_NOTE_TEXT =
  '下列為自舊制遷移而來之 OJT 簽到表，舊制只把檔案掛在文件上、未記錄使用單位與訓練日期，因此尚無法計入任何一列進度。請由 ICSOP 管理員逐筆指派使用單位並補填訓練日期後，才會成為該列之正式場次。';
export const PENDING_SCOPE_TEXT = '本區不列入上方之進度列數統計，也不受篩選條件影響。';
export const ASSIGN_ACTION_TEXT = '指派單位';

/** 進度列之穩定鍵（`documentId × orgCode`），與後端 `rowKey()` 同式。 */
export function rowKeyOf(documentId: string, orgCode: string): string {
  return `${documentId}__${orgCode}`;
}

/** 可新增場次之角色（`AC-05`）。🔒 `AC-08`：**只看角色**，不看操作者 orgCode 與目標列之關係。 */
export function canAddSession(roleCode: string | undefined): boolean {
  return roleCode === 'ICSOPAdmin' || roleCode === 'Supervisor' || roleCode === 'DeptContact';
}

/** 可刪除場次／可歸位之角色（`AC-19`／`AC-26`）：僅 ICSOPAdmin。 */
export function canManageSessions(roleCode: string | undefined): boolean {
  return roleCode === 'ICSOPAdmin';
}

/** 以使用單位分組（`AC-11`）：群組依 orgCode 昇冪、組內依程序書編號昇冪 ⇒ 順序具決定性。 */
export interface OjtRowGroup {
  code: string;
  label: string;
  inactive: boolean;
  rows: OjtProgressRow[];
}

export function groupRowsByOrg(rows: OjtProgressRow[]): OjtRowGroup[] {
  const byOrg = new Map<string, OjtProgressRow[]>();
  for (const r of rows) {
    const list = byOrg.get(r.orgCode);
    if (list) list.push(r);
    else byOrg.set(r.orgCode, [r]);
  }
  return [...byOrg.keys()].sort().map((code) => {
    const list = byOrg.get(code) ?? [];
    return {
      code,
      label: list[0]?.orgName ?? code,
      inactive: list.some((r) => r.inactive),
      rows: [...list].sort((a, b) => a.documentNumber.localeCompare(b.documentNumber)),
    };
  });
}

/** 覆蓋率百分比字面；分母為 0 時回 `null`（呼叫端改呈現「尚無可統計」，見 `AC-14`）。 */
export function coveragePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/** `AC-14` 分母為零之逐字提示（不得呈現 `NaN`／逕自退化為 `0%`／`100%`）。 */
export const NO_STATISTICS_TEXT = '尚無可統計之進度列';

/**
 * `AC-17` 排除註記（恆顯示，含 0 筆時之明確說明）。
 * 🔴 排除是一種「數字說了謊的機會」——被排除的列在 TAB2 仍然看得見，若此處不明說有幾列被排除，
 * 使用者會自己去數 TAB2 的列然後發現對不起來。
 */
export function exclusionNote(
  numerator: number,
  denominator: number,
  inactiveCount: number,
  orphanedCount: number,
): string {
  const pct = coveragePercent(numerator, denominator);
  const head =
    pct === null
      ? `目前${NO_STATISTICS_TEXT}`
      : `覆蓋率為 ${numerator} / ${denominator}（${pct}%）`;
  const excluded = inactiveCount + orphanedCount;
  if (excluded > 0) {
    return (
      `${head}；本次共排除 ${excluded} 列——已裁撤單位 ${inactiveCount} 列、單位已移出使用部門 ${orphanedCount} 列。` +
      '被排除之進度列於「OJT 資料清單」分頁仍然呈現（裁撤單位仍可新增場次；已移出者不可），故兩處列數不相等屬正常。'
    );
  }
  return `${head}；已裁撤單位與單位已移出使用部門之列皆不計入，目前無任何進度列因此被排除。`;
}

/**
 * `AC-15` 之不變式敘述（畫面載體）：**列數不因彙總而改變**——彙總是統計階段的行為，
 * 不得回頭把 `AC-01` 之列展開。
 */
export function rollupInvariantText(deptCount: number, summedUnits: number): string {
  return (
    `彙總自 ${summedUnits} 列進度列（已排除裁撤單位），分入 ${deptCount} 個部；` +
    `各部列數合計 ${summedUnits} — 列數不因彙總而改變（彙總只發生於統計階段，不回頭展開清單之列）。`
  );
}

/** 伺服器當日（`YYYY-MM-DD`，UTC）——與後端 `serverToday()` 同一基準，見其註解之時區血訓。 */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
