import type { OjtDocScope, OjtDocumentStatus, OjtProgressRow } from '../api/types';
import { ojtStatusView, type OjtStatusView } from '../domain/ojt-status-view';

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

/**
 * 以使用單位分組（`AC-11`）：群組依 `公司 → orgCode` 昇冪、組內依程序書編號昇冪
 * ⇒ 順序具決定性。
 *
 * 🔴 **分組鍵為 `(companyCode, orgCode)` 之複合鍵**（2026-09-01 缺陷修正）：5 碼部門代碼
 * 各公司獨立編碼（dev 實測四家間 42 個重複碼），以 `orgCode` 單獨分組會把不同公司的兩個部
 * 併成同一組，且群組名取 `list[0].orgName` ⇒ **整組掛上其中一家的名字**，另一家的列就這樣
 * 靜靜地被歸錯了。
 */
export interface OjtRowGroup {
  /** 複合鍵 `${companyCode}__${orgCode}`（React key 與 DOM 群組識別用）。 */
  key: string;
  /** 該群組之公司代碼。 */
  companyCode: string;
  /**
   * 該群組之部門代碼。
   * ⚠ **不是唯一鍵**——跨公司可重複；需要唯一識別時一律用 `key`。
   */
  code: string;
  /** 顯示名稱：`公司簡稱 / 部 / 處室`（後端組裝，前端不再拼字）。 */
  label: string;
  inactive: boolean;
  rows: OjtProgressRow[];
}

/** 群組之複合鍵（與後端 `(companyCode, orgCode)` 之識別口徑一致）。 */
export function orgGroupKeyOf(companyCode: string, orgCode: string): string {
  return `${companyCode}__${orgCode}`;
}

export function groupRowsByOrg(rows: OjtProgressRow[]): OjtRowGroup[] {
  const byOrg = new Map<string, OjtProgressRow[]>();
  for (const r of rows) {
    const key = orgGroupKeyOf(r.companyCode, r.orgCode);
    const list = byOrg.get(key);
    if (list) list.push(r);
    else byOrg.set(key, [r]);
  }
  return [...byOrg.keys()].sort().map((key) => {
    const list = byOrg.get(key) ?? [];
    const head = list[0];
    return {
      key,
      companyCode: head?.companyCode ?? '',
      code: head?.orgCode ?? key,
      label: head?.orgName ?? head?.orgCode ?? key,
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
/**
 * 🔴 `AC-28`⑲（`OQ-E11-22`）：由三個 `option` 增為**恰四個**，`unassigned` 落在 `completed`
 * 之後、`all` 之前；🔒 第一個仍為預設，`aria-label` 一字未改。
 */
export const DOC_COVERAGE_SCOPE_OPTIONS: readonly { value: OjtDocScope; text: string }[] = [
  { value: 'incomplete', text: '僅未全部完成' },
  { value: 'completed', text: '僅已全部完成' },
  { value: 'unassigned', text: '僅未指定使用部門' },
  { value: 'all', text: '全部文件' },
];

export const DOC_COVERAGE_INCOMPLETE_LABEL = '尚未全部完成合計';

// ══════════ `OQ-E11-22` 第四種呈現態「未指定使用部門」（`AC-14` ⑧～⑮／`AC-28`⑲） ══════════

/**
 * 🔴 **區一專屬**之第四種呈現態（`AC-14` 本輪負向鎖定 ②／③）。
 *
 * 🔒 **刻意不加進 `domain/ojt-status-view.ts`**：那組是與 `prototypes/13`（文件清單頁）共用之
 * `AC-04` 文件層三態載體，加第四鍵會直接漣漪到清單頁之圖示欄與四值篩選（`AC-J13`／`AC-J14`）。
 * **兩張表度量的東西不同**——清單頁問「這份文件的訓練做完沒」（`totalUnits === 0` 確實就是
 * 「尚未開始」），區一問「哪些文件需要關注」（`totalUnits === 0` 是**沒有義務**、不需要關注）。
 * 故本態之視覺**另立一份常數、不外流**。
 *
 * 🔴 icon 刻意跳出 `file-*-2` 家族（三態是同一把量尺上的三個刻度，本態**在尺之外**）；
 * 色票 `text-slate-500`（白底約 5:1，過 WCAG AA），**刻意不比照** `none` 之 `text-slate-300`
 * （約 1.7:1，屬與清單頁共用之待裁既有議題）——新載體不必繼承既有載體的可讀性問題。
 */
export const DOC_UNASSIGNED_TEXT = '未指定使用部門';
export const DOC_UNASSIGNED_VISUAL: OjtStatusView = {
  icon: 'circle-slash',
  text: DOC_UNASSIGNED_TEXT,
  className: 'text-slate-500',
};

/**
 * 逐筆表一列之呈現態視覺：`totalUnits === 0` ⇒ 第四態，否則沿用 `AC-04` 三態。
 * 🔒 **只影響晶片之視覺與逐字**——該列之 `data-doc-ojt-state` 仍為 `state` 本身（三值），
 * 第四態另以 `[data-doc-no-using-dept]` 表達，兩者不互斥（`AC-14` 本輪負向鎖定 ①）。
 */
export function docCoverageRowView(row: { state: OjtDocumentStatus; totalUnits: number }): OjtStatusView {
  return row.totalUnits === 0 ? DOC_UNASSIGNED_VISUAL : ojtStatusView(row.state);
}

/**
 * `AC-14` ⑫：`totalUnits === 0` 之比值與百分比欄。
 * 🔴 `0 / 0` 與 `0%` 都在宣稱一個**不存在的量測結果**——與總覽比率之「分母為零不得退化為
 * `0%`／`NaN`／`100%`」是同一條規則在逐列層級的落點。
 */
export const DOC_COVERAGE_NA_TEXT = '—';

/**
 * 逐筆表覆蓋率欄之進度條填色（prototype 25 `renderDocCoverageTable()` 逐字）。
 * 🔴 三檔而非連續色階：`100%` 綠（做完了）／`0%` 灰（還沒開始，不該用「進行中」的顏色宣稱有進度）／
 * 其餘 primary。🔒 `totalUnits === 0` 之列**根本不畫條**（`AC-14` ⑫），故本函式不處理該情形——
 * 呼叫端必須先分岔，不能靠傳 `0` 進來蒙混（那會畫出一條寬度 0 的灰條＝仍在宣稱「量測過、結果是 0」）。
 */
export function docCoverageBarClass(pct: number): string {
  if (pct === 100) return 'bg-emerald-500';
  if (pct === 0) return 'bg-slate-300';
  return 'bg-primary-500';
}

/** `AC-14` ⑬ 摘要行**上行**之新片段標籤（下行之標籤見 `DOC_COVERAGE_BREAKDOWN_LABEL`）。 */
export const DOC_COVERAGE_TRACKED_LABEL = '已指定使用部門';

/**
 * `AC-14` ⑬ 摘要行**下行**之標籤。
 * 🔴 **本句不是裝飾**：下行之「尚未開始 {n} 份」顯示的是「**有義務**卻一列都沒完成」，
 * 刻意不等於 `AC-04` 口徑之 `byState.none`（含無義務者）；少了這句，讀者會把兩者當成同一個數
 * 而判為 bug。
 */
export const DOC_COVERAGE_BREAKDOWN_LABEL = '已指定使用部門者之細分：';

/** 摘要行兩行之四個數字（🔒 恆為**完整母體**之分佈，不隨顯示範圍或上限改變）。 */
export interface DocCoverageBreakdown {
  /** 已指定使用部門之份數（＝`totalDocuments − unassigned`）。 */
  tracked: number;
  /** 未指定使用部門之份數（＝`byState.unassigned`）。 */
  unassigned: number;
  /** 下行三態之份數；🔴 `none` 已扣除無義務者。 */
  stat: Record<'all' | 'partial' | 'none', number>;
}

/**
 * `AC-14` ⑬ 之唯一推導點——四個數字必須構成一個**可加總之分割**：
 * `tracked + unassigned === totalDocuments` 且 `stat.all + stat.partial + stat.none === tracked`。
 *
 * 🔴 **`stat.none` 必須現場減去 `unassigned`，不得直接渲染 `byState.none`**：後者為 `AC-04`
 * 口徑（**含**無義務者），直接畫上去會讓畫面宣告一批數量級錯誤的待辦（真庫 587 份）。
 * 🔒 缺鍵之 `unassigned` 一律以 `0` 解讀（舊快取／部署落差之回應仍只有三鍵，此時退化為
 * 本輪之前的行為，而非顯示 `NaN`）。
 */
export function docCoverageBreakdown(
  totalDocuments: number,
  byState: { all: number; partial: number; none: number; unassigned?: number },
): DocCoverageBreakdown {
  const unassigned = byState.unassigned ?? 0;
  return {
    tracked: totalDocuments - unassigned,
    unassigned,
    stat: { all: byState.all, partial: byState.partial, none: byState.none - unassigned },
  };
}

/**
 * 顯示範圍造成之空狀態，**逐一個範圍一句**（不共用一句「查無資料」）。
 * 🔒 `all` 恆為空字串——顯示範圍為「全部文件」時只要有文件就一定有列，該分支不可能被取用；
 * 留一個空字串而非省略，是為了讓「三個範圍都有對應」這件事在程式碼上看得出來。
 */
export const DOC_COVERAGE_EMPTY_BY_SCOPE: Record<OjtDocScope, string> = {
  incomplete: '所有文件之教育訓練皆已全部完成',
  completed: '尚無任何文件之教育訓練已全部完成',
  unassigned: '所有文件皆已指定使用部門',
  all: '',
};

/**
 * 🔴 範圍空狀態之補充提示。**刻意不帶** `EMPTY_ALL_HINT`（「進度列從哪裡來」那句）——
 * 那句只給全域空狀態；此處的列並非不存在，只是被顯示範圍濾掉了。
 */
export const DOC_COVERAGE_EMPTY_HINT = '切換顯示範圍為「全部文件」可檢視全部文件之覆蓋率。';

/** 截斷句之名詞隨顯示範圍而異（其餘句子完全相同 ⇒ 只分岔一個名詞，不寫四句）。 */
const DOC_COVERAGE_TRUNC_NOUN: Record<OjtDocScope, string> = {
  incomplete: '尚未全部完成之文件',
  completed: '已全部完成之文件',
  unassigned: '未指定使用部門之文件',
  all: '文件',
};

/**
 * 🔴 `AC-14` ⑭(a)：排序描述之兩個變體。`unassigned` 範圍下所有列之覆蓋率皆為 `—`，
 * 宣稱「依覆蓋率排序」是**假話** ⇒ 另寫一句；其餘三個範圍沿用原句，僅補入一個括號段
 * （`OQ-E11-22` 之排序沉底），使那句話與實際排序鍵仍然一致。
 */
const DOC_COVERAGE_TRUNC_ORDER: Record<OjtDocScope, string> = {
  incomplete: '本表依覆蓋率由低至高排序（未指定使用部門之文件一律排在最後），未列出者之覆蓋率均不低於已列出者',
  completed: '本表依覆蓋率由低至高排序（未指定使用部門之文件一律排在最後），未列出者之覆蓋率均不低於已列出者',
  unassigned: '本表依程序書編號昇冪排序',
  all: '本表依覆蓋率由低至高排序（未指定使用部門之文件一律排在最後），未列出者之覆蓋率均不低於已列出者',
};

/**
 * 🔴 `AC-14` ⑭(b)：「完整的去哪看」之兩個變體，**實質內容改變、非文案潤飾**。
 * `unassigned` 範圍之文件沒有使用部門 ⇒ 沒有進度列，把人導去「OJT 資料清單」只會看到空的；
 * 正確去處是去把使用部門補上（與 `EMPTY_ALL_HINT` 指向同一個頁面，不另造詞）。
 */
const DOC_COVERAGE_TRUNC_WHERE: Record<OjtDocScope, string> = {
  incomplete: '完整清單請至「OJT 資料清單」分頁逐列檢視。',
  completed: '完整清單請至「OJT 資料清單」分頁逐列檢視。',
  unassigned: '完整清單與使用部門之設定請至「ICSOP 文件管理」。',
  all: '完整清單請至「OJT 資料清單」分頁逐列檢視。',
};

/**
 * 🔴 **不得靜默 top-N** 之載體：**三件事缺一不可**——還有幾份沒列出、憑什麼是這 N 份
 * （排序規則）、完整的東西去哪裡看。只顯示前 N 筆而不說，等於讓畫面謊稱本表已涵蓋全部文件。
 * 🔴 `maxRows` **由呼叫端自回應傳入**，不得硬寫 15。
 * 🔴 四個範圍共用同一骨架，**恰三處**隨範圍分岔（名詞／排序描述／去處）——三張對照表逐一列出
 * 四個鍵，而非寫成 `scope === 'unassigned' ? … : …` 之三元式：三元式一旦有人補第五個範圍，
 * 它會靜默落進 else 分支並宣稱一句假話，對照表則會由 `Record<OjtDocScope, …>` 直接編譯失敗。
 */
export function docCoverageTruncationText(
  maxRows: number,
  hidden: number,
  scope: OjtDocScope,
): string {
  return (
    `本表僅列出前 ${maxRows} 份，另有 ${hidden} 份${DOC_COVERAGE_TRUNC_NOUN[scope]}未列出；` +
    `${DOC_COVERAGE_TRUNC_ORDER[scope]}。${DOC_COVERAGE_TRUNC_WHERE[scope]}`
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

// ══════════ TAB2 第二種分組模式「以文件分組」（`AC-30`～`AC-36`／`AC-28`⑳） ══════════

/**
 * 分組模式之值域（**恰二值**）。
 * 🔒 `org` 為預設＝現況一格不改；`document` 為本輪新增。
 * 🔴 **它不是第三個篩選**——不移除任何列，只改變列裝進哪一種盒子；故其控制項**不掛**
 * `data-ojt-filter`（`AC-13` 之「篩選恰兩項」為既有鎖，兩種模式下該掛鉤恆為 2 個）。
 */
export type OjtGroupMode = 'org' | 'document';

/** `AC-28`⑳：分組模式 `select` 之兩個 option 與其 `aria-label`（逐字，`option` 順序即此順序）。 */
export const GROUP_MODE_ORG_TEXT = '以使用單位分組';
export const GROUP_MODE_DOC_TEXT = '以文件分組';
export const GROUP_MODE_ARIA_TEXT = '資料清單之分組方式';

/**
 * `AC-33`②：文件搜尋之無障礙名稱與 placeholder。
 * 🔒 placeholder 句尾為**單一刪節號 `…`**，比照既有之「搜尋使用單位（名稱或代碼）…」——
 * 兩個搜尋框並置於同一列，句型不一致會被讀成兩種不同性質的控制項。
 */
export const DOC_SEARCH_ARIA_TEXT = '搜尋文件';
export const DOC_SEARCH_PLACEHOLDER_TEXT = '搜尋文件（編號或書名）…';

/**
 * `AC-32` 之**必要載體**（非裝飾）：本區之 X／Y 與儀表板「文件-訓練覆蓋率」**刻意不同口徑**。
 * 🔴 處置比照同頁既有之 `DOC_COVERAGE_BASIS_NOTE`（同一種問題之既有解法）：同一頁並置兩個口徑
 * 不同的數字，沒有這一行，使用者一對帳就會把正常現象讀成 bug。
 * 📌 差異之來源**不是**裁撤單位（`docCoverage` 同樣不套 `isActive` 過濾，兩邊會剛好相等），
 * 而是**孤兒列**：`docCoverage` 之列由 `DOC_USING_DEPT` 驅動 ⇒ 孤兒天然不成列，TAB2 則另行呈現。
 */
export const DOC_GROUP_BASIS_NOTE_TEXT =
  '本區各文件之「已完成 X / 共 Y 單位」取自本清單當下呈現之進度列（含已裁撤單位與已移出使用部門之單位），與儀表板「文件-訓練覆蓋率」之口徑刻意不同；兩處數字不相等屬正常，請勿互相對帳。';

/** 以文件分組之一個群組（`AC-31`）。 */
export interface OjtDocGroup {
  /** 🔴 分組鍵＝`documentId`。**不是書名**——書名非唯一，以書名分組會把兩份不同文件併成
   *  一組而**憑空少掉一份文件**（本 repo 之「畫面說謊」既有形狀）。 */
  documentId: string;
  documentNumber: string;
  documentName: string;
  /** 該文件在**當下呈現之列**中 `completed === true` 者之列數（`AC-32` 之 X）。 */
  done: number;
  /** 該文件**當下呈現之列**之總列數，🔴 **含 `inactive` 與 `orphaned`**（`AC-32` 之 Y）。 */
  total: number;
  rows: OjtProgressRow[];
}

/**
 * 以文件分組（`AC-31`／`AC-32`／`AC-34`）。
 *
 * 🔴 **`done`／`total` 一律取自傳入之列本身**——呼叫端傳進來的就是「當下呈現之列」（既有兩項
 * 篩選與文件搜尋套用後之結果）。**不得**改讀 TAB1 之 `docCoverage[].completedUnits`／
 * `totalUnits`：兩者刻意不同口徑，混用會讓同一份文件在兩個分頁上各說一個數字。
 *
 * 🔴 **不複製、不改寫任何一列**：`rows` 內為**原物件參照**。分組只決定「列裝進哪個盒子」，
 * 一旦在此順手補欄位／改欄位，列本身就成了兩份真相。
 *
 * 🔴 **排序須具決定性**（`AC-34`）：群組依 `documentNumber` 昇冪、組內依 `orgName` 昇冪。
 * 📌 `orgName` 之值為「公司簡稱 / 部 / 處室」全名 ⇒ 依其昇冪即天然先依公司再依部、處室分群，
 * **不需要也不得另建一套跨公司之排序鍵**。
 */
export function docGroupsOf(rows: OjtProgressRow[]): OjtDocGroup[] {
  const byDoc = new Map<string, OjtProgressRow[]>();
  for (const r of rows) {
    const list = byDoc.get(r.documentId);
    if (list) list.push(r);
    else byDoc.set(r.documentId, [r]);
  }
  return [...byDoc.entries()]
    .map(([documentId, list]) => ({
      documentId,
      documentNumber: list[0]?.documentNumber ?? '',
      documentName: list[0]?.documentName ?? '',
      done: list.filter((r) => r.completed).length,
      total: list.length,
      // 🔒 `[...list]` 複製的是**陣列**、不是列——排序不就地改動呼叫端之陣列，列仍為原參照。
      rows: [...list].sort((a, b) => a.orgName.localeCompare(b.orgName)),
    }))
    .sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));
}

/**
 * `AC-33`②：文件搜尋之比對規則——`documentNumber` 或 `documentName` 之**不分大小寫子字串**。
 * 🔴 `trim()` 後為空字串 ⇒ **視為不過濾**（一律 `true`）：使用者按了空白鍵就整份清單消失，
 * 是比「沒有搜尋功能」更難理解的畫面。
 */
export function matchesDocKeyword(
  r: Pick<OjtProgressRow, 'documentNumber' | 'documentName'>,
  keyword: string,
): boolean {
  const kw = keyword.trim().toLowerCase();
  if (kw === '') return true;
  return (
    r.documentNumber.toLowerCase().includes(kw) || r.documentName.toLowerCase().includes(kw)
  );
}

/**
 * 文件群組標題之完成度（`AC-31`③）。
 * 🔴 **半形斜線**，與 `[data-doc-coverage-ratio]` 之 `{n} / {n}` 同家族；
 * ⚠ 與文件表單側 `[data-ojt-derived-summary]` 之**全形 `／`** 刻意不同——那是另一頁之既有文案，
 * 不得為了「看起來一致」而互相對齊。
 */
export function docGroupRatioText(done: number, total: number): string {
  return `已完成 ${done} / 共 ${total} 單位`;
}

/**
 * 文件群組百分比之**顯示字串**（`AC-32`）。
 *
 * 🔴 **內部一律委派既有 `coveragePercent`**——全頁只有一個百分比推導點。本頁已發生過的真實
 * 缺陷形狀有二：(a) 另打一份 `Math.round(...)`（兩份會各自漂移）；(b) 讀一個 API 未送的 `rate`
 * 欄而印出 `undefined%`。
 * 🔴 分母為 0 ⇒ `coveragePercent` 回 `null` ⇒ 換成 `NO_STATISTICS_TEXT`：`NaN%`／`null%` 是壞掉、
 * `0%` 與「全部未完成」無從分辨、`100%` 更是謊報。
 * 📌 該分支於元件層**不可達**（群組是「因為有列」才存在的，`Y ≥ 1` 恆成立）⇒ 其唯一載體在此。
 */
export function docGroupPercentText(done: number, total: number): string {
  const pct = coveragePercent(done, total);
  return pct === null ? NO_STATISTICS_TEXT : `${pct}%`;
}

/**
 * 折疊鈕之 `aria-label`（🔵 完整句型為設計裁量，🔒 但**須含程序書編號**）。
 * 📌 理由同 `AC-28`⑩ 之下載鈕：正式站 591 份文件 ⇒ 近 600 顆折疊鈕，若無從分辨，螢幕閱讀器
 * 與 `getByRole` 皆點不到正確的那一顆。
 */
export function docGroupToggleAria(documentNumber: string, documentName: string): string {
  return `展開／收合此文件之進度列（${documentNumber} · ${documentName}）`;
}
