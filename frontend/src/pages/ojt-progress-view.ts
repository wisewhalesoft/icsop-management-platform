import type { OjtDocScope, OjtProgressRow } from '../api/types';

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

// ══════════ `OQ-E11-21` 節流：區一「依文件逐筆」表（`AC-28`⑯） ══════════

/**
 * 顯示範圍之三值（逐字取自 prototype 25 之 `#covScope`）。
 * 📌 用「未**全部**完成」而非「未完成」，是為了不與 TAB2 之列層級 `尚未完成`（`AC-03` 二值）
 * 及本表狀態欄之 `尚未開始` 混淆——本控制項濾的是**文件層**的「還沒全部做完」。
 */
export const DOC_COVERAGE_SCOPE_LABEL = '依文件逐筆之顯示範圍';
export const DOC_COVERAGE_SCOPE_OPTIONS: readonly { value: OjtDocScope; text: string }[] = [
  { value: 'incomplete', text: '僅未全部完成' },
  { value: 'completed', text: '僅已全部完成' },
  { value: 'all', text: '全部文件' },
];

export const DOC_COVERAGE_INCOMPLETE_LABEL = '尚未全部完成合計';

/**
 * 顯示範圍造成之空狀態，**逐一個範圍一句**（不共用一句「查無資料」）。
 * 🔒 `all` 恆為空字串——顯示範圍為「全部文件」時只要有文件就一定有列，該分支不可能被取用；
 * 留一個空字串而非省略，是為了讓「三個範圍都有對應」這件事在程式碼上看得出來。
 */
export const DOC_COVERAGE_EMPTY_BY_SCOPE: Record<OjtDocScope, string> = {
  incomplete: '所有文件之教育訓練皆已全部完成',
  completed: '尚無任何文件之教育訓練已全部完成',
  all: '',
};

/**
 * 🔴 範圍空狀態之補充提示。**刻意不帶** `EMPTY_ALL_HINT`（「進度列從哪裡來」那句）——
 * 那句只給全域空狀態；此處的列並非不存在，只是被顯示範圍濾掉了。
 */
export const DOC_COVERAGE_EMPTY_HINT = '切換顯示範圍為「全部文件」可檢視全部文件之覆蓋率。';

/** 截斷句之名詞隨顯示範圍而異（其餘句子完全相同 ⇒ 只分岔一個名詞，不寫三句）。 */
const DOC_COVERAGE_TRUNC_NOUN: Record<OjtDocScope, string> = {
  incomplete: '尚未全部完成之文件',
  completed: '已全部完成之文件',
  all: '文件',
};

/**
 * 🔴 **不得靜默 top-N** 之載體：**三件事缺一不可**——還有幾份沒列出、憑什麼是這 N 份
 * （排序規則）、完整的東西去哪裡看。只顯示前 N 筆而不說，等於讓畫面謊稱本表已涵蓋全部文件。
 * 🔴 `maxRows` **由呼叫端自回應傳入**，不得硬寫 15。
 */
export function docCoverageTruncationText(
  maxRows: number,
  hidden: number,
  scope: OjtDocScope,
): string {
  return (
    `本表僅列出前 ${maxRows} 份，另有 ${hidden} 份${DOC_COVERAGE_TRUNC_NOUN[scope]}未列出；` +
    '本表依覆蓋率由低至高排序，未列出者之覆蓋率均不低於已列出者。完整清單請至「OJT 資料清單」分頁逐列檢視。'
  );
}

/**
 * 🔴 口徑說明行：本表分母與上方覆蓋率**刻意不同**（`AC-14` 末段之明文警語）。
 * 少了這一行，使用者把各文件分母加起來會對不上 KPI 的進度列數，而那個差額正是被裁撤的單位
 * ——沒有說明就會被讀成 bug。
 */
export const DOC_COVERAGE_BASIS_NOTE =
  '本表之「已完成 / 使用單位」以該文件之全部使用單位為分母（含已裁撤單位），與上方覆蓋率之分母刻意不同：上方是「還追得動的部分」，本表是「這份文件的實際訓練狀況」。';

/** 導向 TAB2 之入口（**恆存在**，不只在截斷時才出現）。 */
export const DOC_COVERAGE_MORE_TEXT = '至「OJT 資料清單」檢視尚未完成之進度列';
export const DOC_COVERAGE_MORE_ARIA = '至「OJT 資料清單」分頁，並將完成狀態篩選設為「尚未完成」';

/** 捲軸容器之無障礙名稱（`tabindex=0` 使其可被鍵盤聚焦後捲動，WCAG 2.1.1）。 */
export const DOC_COVERAGE_REGION_LABEL = '依文件逐筆之覆蓋率表格';

// ══════════ `OQ-E11-21` 節流：區三「最近完成 OJT 的單位」（`AC-28`⑱） ══════════

/**
 * 🔴 區三之筆數上限＝**8**，**純前端呈現層切片**（後端 `recentSessions` 形狀不變，仍回 30 天
 * 窗口內之全部）。
 *
 * 🔴 與區一刻意不同、**不得互相對齊**：上限 8 vs 15／**無捲軸** vs 有捲軸／無顯示範圍控制項
 * vs 有／截斷句無名詞變體 vs 有。本區是「脈動」不是「待辦」——讀者要的是「訓練有在進行嗎」，
 * 沒有逐筆處理的動作，故上限可比區一小；上限已把整區高度封住，再加一層捲軸只是多一層 chrome。
 * 🔒 上限**只作用於呈現**：30 天窗口、PII 硬防線、孤兒排除、**不排除裁撤單位**——四條一律不變。
 */
export const RECENT_MAX_ROWS = 8;

/** 區三之時間窗口天數（與後端 `RECENT_WINDOW_DAYS` 同值，僅供文案代入）。 */
export const RECENT_WINDOW_DAYS = 30;

/**
 * 🔴 與區一同一條規矩：**不得靜默 top-N**，三要素缺一不可。
 * ⚠ 第三要素**刻意不承諾一個等價的畫面**：全站沒有「依日期排序之完成清單」這種頁面，TAB2 是
 * 場次紀錄的所在地但**不依日期排序** ⇒ 文案明講「展開該進度列檢視」而非「看完整清單」，
 * 免得使用者過去以後找不到對應的東西。
 */
export function recentTruncationText(total: number, hidden: number): string {
  return (
    `近 ${RECENT_WINDOW_DAYS} 天內共 ${total} 筆，本區僅列出最近 ${RECENT_MAX_ROWS} 筆、另有 ${hidden} 筆未列出；` +
    '本區依最近一次訓練日期由新至舊排序，未列出者之日期均不晚於已列出者。' +
    '各單位之完整場次紀錄請至「OJT 資料清單」分頁展開該進度列檢視。'
  );
}

/**
 * 區三之呈現切片：**先依訓練日期由新至舊排序、再切前 8 筆**。
 *
 * 🔴 **排序必須在切片之前**：後端不保證陣列順序即日期序，直接 `slice(0, 8)` 會取到「陣列前
 * 8 筆」而非「最新 8 筆」——筆數斷言仍會全綠，只有日期方向會露餡（假綠陷阱 15）。
 * 🔒 以 `[...list]` 複製後排序，不就地改動呼叫端之陣列。
 */
export function sliceRecentSessions<T extends { trainingDate: string }>(list: T[]): T[] {
  return [...list]
    .sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))
    .slice(0, RECENT_MAX_ROWS);
}
