import type { OjtDocScope, OjtDocumentStatus, OjtProgressRow } from '../api/types';
import { ojtStatusView, type OjtStatusView } from '../domain/ojt-status-view';
import { isWatermarkSupportedFormat } from '../domain/watermark-note';

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
  '唯讀模式 · 系統管理員可檢視儀表板與 OJT 資料清單之全部內容，並下載簽到表；無法新增教育訓練場次。';

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
      '刪除後此列將自清單中消失、無法再重新登記（該單位已非使用部門）。此操作會留下紀錄。'
    );
  }
  return (
    (isLast
      ? `刪除後此場次紀錄與其簽到表檔案將無法復原。此為該列最後一筆場次，刪除後該使用單位對本文件之狀態將退回「${BADGE_PENDING_TEXT}」。`
      : `刪除後此場次紀錄與其簽到表檔案將無法復原。該列尚有其他場次，刪除後仍為「${BADGE_COMPLETED_TEXT}」。`) +
    '此操作會留下紀錄。場次不提供編輯，如需更正請刪除後重新登記。'
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

/**
 * 🔵 F042 簽到表線上檢視 delta（`AC-OV1`／`AC-OV2`／`AC-OV7`）之逐字文案。
 * 🔒 句型比照既有 `downloadSessionAria`；逐字鎖於 `ojt-progress-view.session-view.test.ts`。
 */
export const VIEW_BTN_TEXT = '檢視';
export const VIEW_TITLE_TEXT = '檢視簽到表';
export const VIEW_FAILED_TEXT = '檢視失敗，請稍後再試。';

export function viewSessionAria(trainingDate: string, fileName: string): string {
  return `檢視簽到表（${trainingDate} · ${fileName}）`;
}

/** 待歸位列（舊資料）之檢視／下載（`AC-OV7`；下載句型逐字取自 prototype 25）。 */
export function viewPendingAria(fileName: string): string {
  return `檢視舊資料簽到表（${fileName}）`;
}
export function downloadPendingAria(fileName: string): string {
  return `下載舊資料簽到表（${fileName}）`;
}

/** 副檔名（小寫；無副檔名或以點結尾 → 空字串）。 */
function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 || dot === fileName.length - 1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * `AC-OV1` ④：可檢視＝副檔名屬 `OJT_SIGNIN` 白名單（與後端 `file-rules.ts` 同一組值）。
 * 白名單外者（僅可能來自遷移前舊資料）不產生檢視鈕——後端對其 `/view` 回 400。
 */
export function isViewableSignin(fileName: string): boolean {
  return ['pdf', 'jpg', 'jpeg', 'png'].includes(extOf(fileName));
}

/** `AC-OV6`：浮水印註記之判定（僅 PDF 燒錄，策略 A）；委派共用之 `isWatermarkSupportedFormat`。 */
export function isPdfFileName(fileName: string): boolean {
  return isWatermarkSupportedFormat(extOf(fileName));
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
    /**
     * 🔵 2026-09-23 全站文案稽核：句尾「故兩處列數不相等屬正常」是為實作辯護的語氣
     * （與 F044 儀表板同輪被打回的 `屬正常` 同型；本函式之儀表板版本已於該輪改掉，
     *  本頁版本漏網）。
     * 📝 已作廢（⚠ 不得復原）：
     *   OLD> '被排除之進度列於「OJT 資料清單」分頁仍然呈現（裁撤單位仍可新增場次；已移出者不可），
     *   OLD>  故兩處列數不相等屬正常。'
     * 🔴 **數字全部留在可見句**；移入 ⓘ 的只有「為什麼兩處對不起來」這個理由。
     */
    return `${head}；本次共排除 ${excluded} 列——已裁撤單位 ${inactiveCount} 列、單位已移出使用部門 ${orphanedCount} 列。`;
  }
  return `${head}；已裁撤單位與單位已移出使用部門之列皆不計入，目前無任何進度列因此被排除。`;
}

/** 上句之 ⓘ 內容：回答「被排除的列去哪了／為什麼兩處列數對不起來」。 */
export const EXCLUSION_NOTE_DETAIL = [
  '被排除的進度列在「OJT 資料清單」分頁仍然看得到，所以兩處的列數不會相同。',
  '已裁撤單位仍可補登場次；已移出使用部門的單位則不行。',
] as const;

/**
 * F044 卡④ 之統計（＝ `GET /admin/ojt-progress/ontime-summary` 之回應形狀）。
 *
 * 🔴 **三個 `excluded*` 同前綴卻不是同一種東西**——這是下一個人必然會把它們相加的形狀，
 * 故逐欄註明計數單位（`AC-G94` §癸四之明文要求）。
 */
export interface OjtOnTimeNoteStats {
  /** 已全部完成之**單位**數。 */
  numerator: number;
  /** 窗口內之相異**單位**數。 */
  denominator: number;
  /** 🔒 `denominator === 0` 時**後端省略本鍵**（禁 `NaN%`／`0%`／`100%`）。 */
  rate?: number;
  /** 計數單位＝**單位**。該單位已裁撤——**曾在母體內、被排除** ⇒ ✅ 計入可見之「已排除 N 個單位」。 */
  excludedInactive: number;
  /** 計數單位＝**單位**。該單位已移出使用部門——**曾在母體內、被排除** ⇒ ✅ 計入。 */
  excludedOrphaned: number;
  /**
   * 🔴 計數單位＝**文件**（不是單位！）。無公告日 ⇒ 無從推算應完成日 ⇒ 依 `OQ-D44-12b`
   * **根本不進母體** ⇒ 🔴 **不計入**可見之「已排除 N 個單位」。
   * ⚠ 把它加進去會得到一個**沒有意義的數**（把文件加總成單位），且「排除」這個說法本身就是錯的
   * ——它從來沒進過母體。單一推導點見 `excludedUnitCount()`。
   */
  excludedNoAnnouncedDate: number;
}

/**
 * F044 §癸四 第 1 列 — 可見之「已排除 N 個**單位**」之**單一推導點**。
 *
 * 🔴 **恰加總前兩項**（`excludedInactive + excludedOrphaned`），🔴 **第三項完全不計入**：
 *   · **計數單位不同**——前兩項數的是**單位**、第三項數的是**文件**，相加得到的是一個沒有意義的數；
 *   · **語意不同**——前兩項是「進了母體又被拿掉」，第三項是「從來沒進過母體」（`OQ-D44-12b`）。
 * 🔒 **可見文字一律委派本函式**，🔴 明文禁止在元件層再寫一次加法——否則日後有人把第三項加回去，
 *   而**兩處都會綠**。
 */
export function excludedUnitCount(stats: OjtOnTimeNoteStats): number {
  return stats.excludedInactive + stats.excludedOrphaned;
}

/**
 * F044 `AC-G15`／`AC-G89` — 後台首頁卡④ 之排除註記（恆顯示，含排除 0 筆時之明確說明）。
 *
 * 🔴 **與上方 `exclusionNote()` 刻意不合流**（`ARCH-G6`，architecture-spec §15.8）——
 * 兩者緊鄰而立、互相指名，是為了讓下一個人看見這個決定，而不是把它們合併：
 *   · 頭句：`exclusionNote` ＝「覆蓋率為 n / d」（分母＝**進度列**，不限時間）；
 *     本函式 ＝ 母體敘述（分母＝窗口內之**相異使用單位**，`AC-G9`）。
 *   · 排除列舉：`exclusionNote` 恰**兩**個原因；本函式**三**個（多一個「無公告日期」，`AC-G12` ③）。
 *   · 尾句：兩者指向之後果不同（TAB1 之裁撤單位仍可新增場次 vs 本卡之被排除者於清單仍呈現）。
 * ⇒ 「共用並擴充」在實作上等於把頭、列舉、尾句三者都變成參數，共用的只剩一個 `join`，
 *   而代價是 F042 TAB1 與 F044 卡④ 的文案從此綁在同一支函式上，任一邊調整措辭都會靜默改寫另一邊。
 * 🔴 這正是 NFR-F044-3 #4 要防的事：**兩個口徑不同的數字必須在畫面上可分辨**，
 *   而「標籤不同」是唯一的分辨手段。
 *
 * 🔵 **2026-09-21 第六輪（人類裁決第二輪：實作理由退出畫面）就地改寫**，依 §癸四 第 1 列之鎖定逐字。
 * 🔴 本函式之輸出自本輪起**只供 ⓘ popover**（`AC-G95`），可見層只留 `已排除 {a+b} 個單位`。
 * 📝 已作廢（僅供追溯，⚠ 不得復原）——三段皆違反 `AC-G94`：
 *    OLD> `母體＝應完成訓練日期落在近 1 個月內之使用單位，共 {d} 個，其中 {n} 個已全部完成（{p}%）`
 *    OLD> `；本次共排除 {a+b+c} 列——已裁撤單位 {a} 列、單位已移出使用部門 {b} 列、無公告日期 {c} 列`
 *    OLD> `。被排除之進度列於「OJT 資料清單」分頁仍然呈現，故兩處數字不相等屬正常。`
 *    ⇒ 含 `母體＝`／`進度列`（內部詞彙，④）與 `屬正常`（為實作辯護之語氣，②）；
 *      且把 `{c} 份文件` 併進 `{a+b} 個單位` 的加總（口徑錯誤，見 `excludedUnitCount()`）。
 * 🔒 百分比**不再**出現於本文（它已由可見之 `已完成 X / 應完成 Y（Z%）` 承載，`AC-G13`）。
 */
export function ojtOnTimeNoteSegments(stats: OjtOnTimeNoteStats): string[] {
  return [
    '這張卡只看最近一個月內應完成訓練的單位；應完成日為文件公告日再加一個月。',
    `其中 ${stats.excludedInactive} 個單位已裁撤、${stats.excludedOrphaned} 個單位已不再使用該文件，不列入計算。`,
    // 🔴 **獨立成句，不得串入上一句的加總**：單位不同（份／個）＋語意不同（從未進入母體 vs 被排除）。
    `另有 ${stats.excludedNoAnnouncedDate} 份文件尚未設定公告日期，無法推算應完成日，因此從一開始就不在這張卡的範圍內。`,
    '「OJT 進度管理」頁不限期限，也會列出這裡不計入的單位，因此兩邊的數字不同。',
  ];
}

/** 🔒 單一字串形式（＝上列各段之串接）；兩者共用同一份來源，不可能漂移。 */
export function ojtOnTimeNote(stats: OjtOnTimeNoteStats): string {
  return ojtOnTimeNoteSegments(stats).join('');
}

/**
 * `AC-15` 之不變式**可驗證載體**（🔵 2026-09-23 全站文案稽核改寫）。
 *
 * 🔴 `LESSON-G2` 重演：原文案把不變式本身逐字唸給使用者聽
 * （「列數不因彙總而改變（彙總只發生於統計階段，不回頭展開清單之列）」＝ `AC-15` 條文）。
 * 📝 已作廢（⚠ 不得復原）：
 *   OLD> `彙總自 ${summedUnits} 列進度列（已排除裁撤單位），分入 ${deptCount} 個部；` +
 *   OLD> `各部列數合計 ${summedUnits} — 列數不因彙總而改變（彙總只發生於統計階段，不回頭展開清單之列）。`
 *
 * 🔴 **數字一律留在可見文字、不得移入 popover**——使用者不該展開說明才看得到數字；
 *    移入 ⓘ 的只有「為什麼這兩個數字會相同」這個理由。
 */
export function rollupInvariantText(deptCount: number, summedUnits: number): string {
  return `彙總自 ${summedUnits} 列進度列（已排除裁撤單位），分入 ${deptCount} 個部。`;
}

/** 上句之 ⓘ 內容：回答「這兩個數字為什麼會一樣」。 */
export function rollupInvariantNote(summedUnits: number): readonly string[] {
  return [`各部的列數合計為 ${summedUnits} 列，與上表相同；彙總只改變統計方式，不會增減清單的列數。`];
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
/**
 * 🔵 2026-09-23 全站文案稽核：「刻意不同」是**寫給驗收者看的語氣**（為實作辯護），不是使用者語言。
 * 📝 已作廢（⚠ 不得復原）：
 *   OLD> '本表之「已完成 / 使用單位」以該文件之全部使用單位為分母（含已裁撤單位），與上方覆蓋率之
 *   OLD>  分母刻意不同：上方是「還追得動的部分」，本表是「這份文件的實際訓練狀況」。'
 * 🔒 口徑差異本身**必須留下**（少了它，使用者一對帳就把正常現象讀成 bug），但移入 ⓘ。
 */
export const DOC_COVERAGE_BASIS_NOTE = '本表之「已完成 / 使用單位」以該文件的全部使用單位為分母。';

/** 上句之 ⓘ 內容：回答「為什麼這裡和上面的覆蓋率對不起來」。 */
export const DOC_COVERAGE_BASIS_NOTE_DETAIL = [
  '本表的分母含已裁撤單位，上方覆蓋率則只算還追得動的單位，兩者算法不同。',
  '上方回答「目前還能追到多少」，本表回答「這份文件實際的訓練狀況」。',
] as const;

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
/**
 * 🔵 2026-09-23 全站文案稽核：「刻意不同」「屬正常」「請勿互相對帳」與 F044 儀表板被使用者
 * 打回的原句同型——那是把驗收標準與實作辯護唸給使用者聽。
 * 📝 已作廢（⚠ 不得復原）：
 *   OLD> '本區各文件之「已完成 X / 共 Y 單位」取自本清單當下呈現之進度列（含已裁撤單位與已移出
 *   OLD>  使用部門之單位），與儀表板「文件-訓練覆蓋率」之口徑刻意不同；兩處數字不相等屬正常，
 *   OLD>  請勿互相對帳。'
 * 🔒 差異之**事實**仍完整保留於 ⓘ；刪掉的是語氣與 AC 條文。
 */
export const DOC_GROUP_BASIS_NOTE_TEXT =
  '本區各文件之「已完成 X / 共 Y 單位」取自本清單當下呈現的進度列。';

/** 上句之 ⓘ 內容：回答「為什麼這裡和儀表板的覆蓋率對不起來」。 */
export const DOC_GROUP_BASIS_NOTE_DETAIL = [
  '這裡的分母含已裁撤單位與已移出使用部門的單位，儀表板「文件-訓練覆蓋率」則不含，因此兩處數字通常不會相同。',
] as const;

/** 以文件分組之一個群組（`AC-31`）。 */
export interface OjtDocGroup {
  /** 🔴 分組鍵＝`documentId`。**不是書名**——書名非唯一，以書名分組會把兩份不同文件併成
   *  一組而**憑空少掉一份文件**（本 repo 之「畫面說謊」既有形狀）。 */
  documentId: string;
  documentNumber: string;
  documentName: string;
  /**
   * 🔴 F042 第五輪：該文件之公告日期（應完成訓練日期之原料）與版次。
   * 🔒 **取自組內第一列**（比照既有之 `documentNumber`／`documentName`）——三者皆為
   * **文件層**屬性，同一份文件之全部列上必然相同；此處不是「挑一列的值」，是「讀文件的值」。
   */
  announcedDate: string | null;
  trainingEdition: string | null;
  documentEdition: string | null;
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
      announcedDate: list[0]?.announcedDate ?? null,
      trainingEdition: list[0]?.trainingEdition ?? null,
      documentEdition: list[0]?.documentEdition ?? null,
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

// ══════════ F042 第五輪（2026-09-02）：儀表板可見性／應完成訓練日期／版次分組 ══════════

/**
 * 可檢視 TAB1「儀表板」之角色（2026-09-02 人類裁決：**對主管／部門窗口隱藏**）。
 *
 * 🔴 **與 `canAddSession()` 刻意不合流**：那一支答的是「誰能登記場次」（含主管／部門窗口），
 * 本支答的是「誰看得到全公司的統計看板」——兩個問題的答案這一輪起**不同**，合流會讓
 * 下次任一邊調整時另一邊被靜默地一起改掉。
 * 🔒 **前端可見性、不是授權邊界**：`GET /admin/ojt-progress/summary` 之閘門仍是既有之
 * `OJT_PROGRESS_MANAGEMENT read`（主管／部門窗口本就看得到 TAB2 的全部列，儀表板不多揭露
 * 任何一列資料）。此處隱藏的是一個**對他們沒有用處的分頁**，不是一道防線。
 */
export function canViewDashboard(roleCode: string | undefined): boolean {
  return roleCode === 'ICSOPAdmin' || roleCode === 'SysAdmin';
}

/** `AC-28`㉑：應完成訓練日期之標籤與未知值（`公告日期 + 1 個月`）。 */
export const DUE_DATE_LABEL = '應完成訓練';
export const DUE_DATE_UNKNOWN_TEXT = '—';
export const DUE_DATE_TITLE = '應完成訓練日期＝公告日期 + 1 個月';
export const DUE_DATE_UNKNOWN_TITLE = '此文件尚未設定公告日期，無從推算應完成訓練日期';

/**
 * 應完成訓練日期＝**公告日期 + 1 個月**（人類需求 2026-09-02）。
 * 回 `YYYY-MM-DD`；無公告日期（或值不可解析）→ `null`。
 *
 * 🔴 **全站唯一之推導點**（後端刻意只送 `announcedDate` 原料，不另算一份到期日）：
 * 同一個日期在兩層各算一次，遲早會在月底那幾天給出兩個不同的答案。
 *
 * 🔴 **月底之溢位刻意夾回當月最後一日**（`1/31 + 1 月` → `2/28`，非 JS `Date` 預設的 `3/3`）：
 * 天真作法是 `d.setMonth(d.getMonth() + 1)`，它在來源日超過目標月天數時**自動跨到下個月**
 * ——那會讓 1 月 31 日公告的文件之期限顯示成 3 月 3 日，比使用者預期晚了整整三天，
 * 且只有在一年中少數幾天才看得出來（正是最不容易被發現的那種錯）。
 *
 * 🔴 **一律以 UTC 拆解**（比照 `todayIsoDate()`）：`announcedDate` 為後端送來之 ISO 字串，
 * 用本地時區方法拆會使 UTC+8 開發機與 UTC 容器在 00:00–08:00 得出差一天的日期。
 */
export function trainingDueDate(announcedDate: string | null | undefined): string | null {
  /**
   * 🔵 F044 `AC-G8`：本函式改為 `addMonthsClamped(announcedDate, +1)` 之**委派**。
   * 對外行為、簽章與上方逐字註解**一字不改**——月底夾回、UTC 拆解、不可解析回 `null` 皆由
   * 被委派者承接，只是那個演算法自此有一個具名、可被前後端同一張向量表雙鎖的住處。
   * 📝 被取代之原實作逐字保留供追溯（⚠ 不得復原）：
   *    OLD> const d = new Date(announcedDate);
   *    OLD> if (Number.isNaN(d.getTime())) return null;
   *    OLD> const y = d.getUTCFullYear(); const m = d.getUTCMonth(); const day = d.getUTCDate();
   *    OLD> const lastDayOfTargetMonth = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
   *    OLD> const due = new Date(Date.UTC(y, m + 1, Math.min(day, lastDayOfTargetMonth)));
   *    OLD> return due.toISOString().slice(0, 10);
   */
  return addMonthsClamped(announcedDate, 1);
}

/**
 * F044 `AC-G8` — 月份位移（月底溢位夾回當月最後一日、一律以 `Date.UTC` 拆組）。
 *
 * 🔴 **與 `backend/src/ojt-progress/add-months-clamped.ts` 為同一演算法之兩份實作**
 * （跨 package 無法共用原始碼，比照 `org-path.ts` 檔頭之既有紀律）。兩側之測試逐列引用
 * **同一張 8 列固定向量表**：
 *   · 前端 `frontend/src/pages/ojt-progress-view.f044.test.ts`
 *   · 後端 `backend/src/ojt-progress/add-months-clamped.spec.ts`
 * ⚠ 任一側調整演算法或向量表，另一側必須同步。
 * 🔴 前端側即使**本功能不呼叫** `delta = −1`（窗口計算全在後端），仍以 ⑤～⑧ 鎖住反向夾回——
 *   否則兩份實作只有一半被比對，反向可以在後端漂移而前端全綠。
 *
 * 🔴 **明文禁止** `setMonth(...)`／`getMonth() ± 1` 之就地運算：天真作法在來源日超過目標月天數時
 * 會自動跨到下個月（`2026-01-31 + 1 月` 得 `2026-03-03`），而那個錯誤一年只有月底那幾天看得出來。
 */
export function addMonthsClamped(
  isoDate: string | null | undefined,
  delta: number,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate ?? ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // 不存在之日期（`2026-02-30`）一律 null——比照被委派前之 `Invalid Date` 分支。
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const totalMonths = year * 12 + (month - 1) + delta;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  // 目標月之最後一日（下個月的第 0 天 ＝ 本月最後一天）。
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = day < lastDay ? day : lastDay;
  return (
    `${String(targetYear).padStart(4, '0')}-` +
    `${String(targetMonth + 1).padStart(2, '0')}-` +
    `${String(targetDay).padStart(2, '0')}`
  );
}

/** 應完成訓練日期之顯示字串（無公告日期 → `—`）。 */
export function dueDateText(announcedDate: string | null | undefined): string {
  return trainingDueDate(announcedDate) ?? DUE_DATE_UNKNOWN_TEXT;
}

// ── 版次（`AC-28`㉒） ──

/** 無版次之文件／場次於畫面上之逐字呈現（`null` 不留白，也不假造一個版次字串）。 */
export const EDITION_NONE_TEXT = '未設版次';
/** 場次明細中「當下訓練基準版次」那一組之標記。 */
export const EDITION_CURRENT_BADGE_TEXT = '目前版次';
/** 場次明細中舊版次那一組之標記。 */
export const EDITION_OUTDATED_BADGE_TEXT = '舊版次';

/**
 * 「辦過訓練，但那是改版前的事」之列註記（`sessionCount > 0 && currentEditionSessionCount === 0`）。
 * 🔒 **刻意不動完成徽章本身**（處置比照既有之 `ORPHAN_NOTE_TEXT`）：徽章照實說「尚未完成」，
 * 由一則獨立註記說明**為什麼**——把它做成第三種徽章狀態，會讓人以為舊場次的紀錄失效了。
 */
export const RETRAIN_NOTE_TEXT = '文件已改版，需重新訓練';

/** 版次之顯示字串（`null` → `未設版次`）。 */
export function editionText(edition: string | null | undefined): string {
  return edition ?? EDITION_NONE_TEXT;
}

/** 列上之版次標籤（例：`版次 26'01`）。 */
export function rowEditionText(edition: string | null | undefined): string {
  return `版次 ${editionText(edition)}`;
}

/** 一個版次群組（場次明細之第二層）。 */
export interface OjtSessionEditionGroup {
  /** 群組鍵：版次值；`null` 統一以 `EDITION_NONE_KEY` 表示（DOM 屬性值不得為 `null`）。 */
  key: string;
  edition: string | null;
  /** 是否為文件當下之訓練基準版次（⇒ 預設展開，且其場次即完成判定之依據）。 */
  current: boolean;
  sessions: OjtSessionEdition[];
}

/** `groupSessionsByEdition` 之最小輸入形狀（不綁死於 `OjtSessionView`，供純函式單測直接餵）。 */
export interface OjtSessionEdition {
  trainingDate: string;
  edition?: string | null;
}

/** `null` 版次之 DOM 群組鍵（刻意是一個不可能與真實版次撞名的哨兵值）。 */
export const EDITION_NONE_KEY = '__none__';

/**
 * 場次明細依**版次**分組（人類需求 2026-09-02：「版本太多時只顯示新版、其他先收合」）。
 *
 * 🔴 **當下訓練基準版次之群組恆為第一組且恆存在**——即使該版次一場都還沒辦（`sessions` 為
 * 空陣列）。📌 **空群組是必要的**：改版並要求重訓後，該列的畫面上必須看得到「目前版次：
 * 0 場」這件事；若「沒有場次就不長群組」，使用者只會看到一串舊版次的場次，完全讀不出
 * 「現在這一版還沒人受訓」。
 * 🔴 其餘版次群組依**該組最新訓練日期遞減**排序（近期改版之殘留在前），🔒 而**不是**依版次
 * 字串排序——`{YY}'{NN}` 沒有可靠的全序（跨年度、手動編號、`null`），字串排序會給出看似有理
 * 卻實際錯亂的順序。
 * 🔒 組內場次依訓練日期遞增（沿用既有 `listByDocumentOrg` 之順序語意，不在此重新定義）。
 */
export function groupSessionsByEdition<T extends OjtSessionEdition>(
  sessions: readonly T[],
  trainingEdition: string | null,
): { key: string; edition: string | null; current: boolean; sessions: T[] }[] {
  const byEdition = new Map<string, T[]>();
  for (const s of sessions) {
    const key = s.edition ?? EDITION_NONE_KEY;
    const bucket = byEdition.get(key);
    if (bucket) bucket.push(s);
    else byEdition.set(key, [s]);
  }
  const currentKey = trainingEdition ?? EDITION_NONE_KEY;
  const currentSessions = [...(byEdition.get(currentKey) ?? [])].sort((a, b) =>
    a.trainingDate.localeCompare(b.trainingDate),
  );
  byEdition.delete(currentKey);

  const others = [...byEdition.entries()]
    .map(([key, list]) => ({
      key,
      edition: key === EDITION_NONE_KEY ? null : key,
      current: false,
      sessions: [...list].sort((a, b) => a.trainingDate.localeCompare(b.trainingDate)),
    }))
    .sort((a, b) => {
      const latest = (g: { sessions: T[] }): string =>
        g.sessions.length === 0 ? '' : g.sessions[g.sessions.length - 1]!.trainingDate;
      return latest(b).localeCompare(latest(a)) || a.key.localeCompare(b.key);
    });

  return [
    { key: currentKey, edition: trainingEdition, current: true, sessions: currentSessions },
    ...others,
  ];
}

/** 版次群組標題之 `aria-label`（須含版次，否則同一列的多顆折疊鈕無從分辨）。 */
export function editionGroupToggleAria(edition: string | null, count: number): string {
  return `展開／收合此版次之場次（${editionText(edition)}，共 ${count} 場）`;
}

/** 版次群組標題右側之場次計數（逐字）。 */
export function editionGroupCountText(count: number): string {
  return `${count} 場次`;
}

/** 當下版次群組之空狀態（🔒 與既有 `EMPTY_SESSIONS_TEXT` 刻意不同句：那句說的是「整列一場都沒有」）。 */
export const EMPTY_CURRENT_EDITION_TEXT = '此版次尚未登記任何教育訓練場次';

// ══════════════════════════ F044 · deep link 與群組排序（`AC-G19`～`AC-G21`／`AC-G88`～`AC-G93`） ══════════════════════════

/**
 * 🔒 §命名鎖定第 20 列（`ARCH-G4` 定案）：`?tab=sessions&sort=incomplete-first`。
 *
 * 🔴 **命名為 `sort` 而非 `sortBy`／`sortDir`**：後者是 [F017] 文件清單之「欄位＋方向」詞彙；
 * OJT 這一個不是欄位也沒有方向，它是一個**具名排序模式**。沿用 `sortBy` 會邀請下一個人補上
 * `sortDir=asc`，然後這裡就有了第三套排序詞彙。
 */
export const SORT_INCOMPLETE_FIRST = 'incomplete-first';

/**
 * 🔴 **兩個參數各自獨立解析，刻意不採本頁既有之「恰成對」紀律**（`AC-G88`）。
 *
 * 理由：`readSubtreeParams`／`readBcSubtreeParams` 成對，是因為 `nodeSubtreeId` 離開
 * `lifecycleId` **無法解析**（兩張不同的圖、id 不可互相定位）；此處 `tab` 與 `sort`
 * **各自獨立可解釋**（只換分頁不排序、只排序不換分頁都是合法意圖），硬綁成對會製造一條
 * 「只想排序卻被整組忽略」的無聲失敗路徑。
 *
 * 🔴 值域**封閉**且逐字取自既有 `TabKey`——URL 與程式碼內部型別用同一組字面，是「不可辨識之值」
 * 這件事唯一能被靜態確認的形狀；🔴 不另造 `tab=list`／`tab=2` 之第二套詞彙。
 * 🔴 參數缺席或值不可辨識 ⇒ **靜默 no-op、退回既有預設**（不回錯誤、不 toast）。
 */
export function readTabParam(q: URLSearchParams): 'dashboard' | 'sessions' | null {
  const v = q.get('tab');
  return v === 'dashboard' || v === 'sessions' ? v : null;
}

/** 值域恰一值（見 `readTabParam` 之同段理由）。 */
export function readSortParam(q: URLSearchParams): typeof SORT_INCOMPLETE_FIRST | null {
  return q.get('sort') === SORT_INCOMPLETE_FIRST ? SORT_INCOMPLETE_FIRST : null;
}

/**
 * `AC-G20`／`AC-G93` — `incomplete-first`：未全部完成之群組排在上方。
 *
 * 🔴 **是排序，不是篩選**：已全部完成之群組**仍然呈現**（只是排在下面）——`OQ-D44-14` 之
 * 丙案「把已完成的藏起來」已被否決（藏起來使用者就無法確認「其他都完成了」）。
 * ⇒ 輸出之群組集合與輸入**完全相同**（元素恆等、僅順序改變）。
 *
 * 🔴 **段內維持「該頁原本之次序」**，不得打亂，且**不寫死排序鍵**（`AC-G93`）：
 * prototype 25 之群組次序為 `orgCode` 昇冪，正式站 `listRows` 之伺服端次序為
 * `orgName.localeCompare` → `documentNumber.localeCompare`——兩者之分歧是**既有**落差，
 * 🔒 本輪刻意不對齊（對齊會改變未帶參數時的既有次序，違反 `AC-G21`／`AC-G79` 之零漣漪鎖定）。
 * 📌 以「兩次過濾後串接」達成分段，**不倚賴 `Array.prototype.sort` 之穩定性**——段內次序是一條
 *    AC，不該建立在引擎實作細節上。
 *
 * 🔴 空群組（`rows` 為空）**不得**被視為「全部完成」——`every()` 對空陣列恆真，直接用它會把
 * 一個什麼都還沒做的單位推到最下方。
 */
export function sortGroupsIncompleteFirst(groups: OjtRowGroup[]): OjtRowGroup[] {
  const allDone = (g: OjtRowGroup): boolean =>
    g.rows.length > 0 && g.rows.every((r) => r.completed);
  return [...groups.filter((g) => !allDone(g)), ...groups.filter((g) => allDone(g))];
}

/**
 * `AC-G91` — deep link 帶入之排序指示 chip 之逐字文案。
 *
 * 🔴 **刻意不放進上方篩選列**，也**不影響**「清除」鈕之顯示條件與「共 N 列」之計數
 * ——它是排序，不過濾任何一列（`AC-G81`：篩選恰兩項、分組模式恰二態，一格不動）。
 * 🔒 未帶 `sort=incomplete-first` 時 `[data-ojt-sort-notice]` **完全不進 DOM**（非 CSS 隱藏），
 *   使「未帶參數時本頁一格不動」在 DOM 層可被驗證。
 * 🔒 文案以具名常數分段承載（非 JSX 內嵌長句）：跨行之 JSX 文字會被編譯器補入空白，
 *   而本文案有逐字斷言——本 repo 已踩過該形狀。
 */
export const SORT_NOTICE_HEAD = '已依「';
export const SORT_NOTICE_TITLE = '未全部完成之單位優先';
export const SORT_NOTICE_MIDDLE = '」排序（自後台首頁之「查看明細」帶入）。此為';
export const SORT_NOTICE_EMPHASIS = '排序，不是篩選';
export const SORT_NOTICE_TAIL = '——已全部完成之單位仍然呈現於下方。';
/** 取消入口（與篩選列之「清除」對稱）——沒有它，經 deep link 進來的人只能改網址才能回到既有次序。 */
export const SORT_NOTICE_CLEAR_TEXT = '取消排序';

// ══════════ 🔵 UX16 delta（項 15／16）：制定本部篩選與匯出（`AC-UX49`／`AC-UX51`～`AC-UX55`） ══════════

/**
 * 🔒 `AC-UX54` ⑦：TAB2 **既有**兩項篩選之逐字可見文案，**值一個位元組未改**——此處只是把原先
 * 散在 `OjtProgressPage.tsx` 的字面**抽成具名常數**，使 `AC-UX55` ③ 之「toast 引用的名字須與
 * 控制項 `aria-label` 逐字相同」成為**結構性**保證而非紀律。
 *
 * 🔴 **明文警語**：條文通篇以「單位搜尋」稱呼第一項，但畫面上那個控制項的 `aria-label` 實際是
 * `搜尋使用單位`。🔴 **不得**為了對齊條文措辭而把它改名——那會讓 `AC-UX49` 與 `AC-UX55` ③
 * 同時「看起來變得更一致」，而實際改掉了既有可見文案。
 */
export const ORG_FILTER_ARIA_TEXT = '搜尋使用單位';
export const ORG_FILTER_PLACEHOLDER_TEXT = '搜尋使用單位（名稱或代碼）…';
export const STATUS_FILTER_ARIA_TEXT = '完成狀態';

/**
 * `AC-UX49`：新增之第三項篩選「制定本部」之逐字文案（權威＝`prototypes/25-ojt-progress.html`）。
 *
 * 🔴 `DIVISION_FILTER_ARIA_TEXT` 同時是 `AC-UX55` ③ 之引號內名字——兩處**必須是同一個常數**：
 * 該條要求 toast 引用「使用者在畫面上看到的那個名字」，各打一份字面就會在其中一處改名時靜默分歧。
 * 🔒 `DIVISION_FILTER_ALL_TEXT` 之句型比照同列既有之 `所有完成狀態`；🔴 **不得**寫成
 * `全部`／`全部本部`／`— 制定本部 —`。其 `value` 為**空字串**＝不施加限制。
 */
export const DIVISION_FILTER_ARIA_TEXT = '制定本部';
export const DIVISION_FILTER_ALL_TEXT = '所有制定本部';

/** 制定本部下拉之單一選項（`value` ＝ 送往後端之 `divisionCode`，`label` ＝ 可見文字）。 */
export interface OjtDivisionOption {
  code: string;
  label: string;
}

/**
 * `AC-UX49`：選項來源＝**當前語料之 distinct 本部**（依本部代碼昇冪，順序具決定性）。
 *
 * 🔴 **推導不出本部之單位不產生選項**（`divisionCode` 為 `null`／空字串者直接略過），且該單位之
 * 列在**未選定任何本部**時照常呈現——🔴 明文**不加** sentinel 選項（如「無本部」）：沒有選項就是
 * 篩不到，與 F019 `AC-UX24` 同構。加一個 sentinel 等於把一個內部分類概念變成使用者的篩選條件。
 * 🔒 `label` 缺值時退回代碼本身（後端之 `divisionName` 為選填欄）——**不留白**，比照
 * `OjtOrgDirectory.nameOf` 查無時退回代碼之既有 fail-open 紀律。
 */
export function divisionOptionsOf(rows: readonly OjtProgressRow[]): OjtDivisionOption[] {
  const byCode = new Map<string, string>();
  for (const r of rows) {
    const code = (r.divisionCode ?? '').trim();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, (r.divisionName ?? '').trim() || code);
  }
  return [...byCode.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** `AC-UX51`：匯出鈕之無障礙名稱（逐字）。 */
export const OJT_EXPORT_ARIA_TEXT = '匯出';

/**
 * `AC-UX55` 第 1 句（恆出現）。
 *
 * 🔴 `{N}` **必須是匯出的筆數，不是畫面上看得到的列數**——這是本句存在的全部理由。使用者回報之
 * 情境正是「畫面剩 12 列、檔案 340 列」；若跟著畫面說 12，就從「沒說清楚」惡化為「說了假話」。
 * 🔒 **明文禁止與 F017 清單頁共用常數**：該頁之範圍語意是 13／14 項篩選之結果，本頁是三項條件
 * 且另有一個**不納入**的搜尋框——抽成同一個常數，其中一頁的範圍說明會在下一次改動時靜默變成
 * 另一頁的。句型可參照，字串各自一份。
 */
export function ojtExportToastText(exportedCount: number): string {
  return `已匯出 OJT 進度清單（CSV）：共 ${exportedCount} 筆`;
}

/**
 * `AC-UX55` 第 1 句之**降級形式**（🔵 2026-09-22，lead 核准）：伺服器未回報匯出筆數時使用。
 *
 * 🔴 **不捏造數字、更不回退為畫面列數**——後者正是上方 `ojtExportToastText` 註解所禁止的
 * 「說了假話」。取不到筆數時唯一誠實的說法是「我現在說不出這個數字」，而不是換一個來源硬湊。
 * 🔴 **不含任何內部詞彙**（`標頭`／`header`／`X-Export-Row-Count`）：使用者不需要知道是哪一層
 * 把標頭吃掉了，他只需要知道「檔案下載好了，筆數以檔案為準」（`AC-UX55` ④ 之使用者語言判準）。
 * 🔒 兩種根因（標頭缺席／值不可解析）**共用本句**，刻意不對使用者區分。
 * 🔒 逐字與 `ojtExportToastText` 共享同一個前綴 `已匯出 OJT 進度清單（CSV）`——
 *    兩種情形下「我拿到的是什麼」這件事本身沒有改變，改變的只有「能不能告訴你幾筆」。
 */
export const OJT_EXPORT_COUNT_UNKNOWN_TEXT =
  '已匯出 OJT 進度清單（CSV）；系統暫時無法確認筆數，請以下載檔案為準。';

/**
 * `AC-UX55` 第 2 句（恆出現）：說明匯出**依哪三項條件**。
 * 🔒 三個引號內的名字取自各控制項之 `aria-label` 常數 ⇒ 任一控制項改名，本句自動跟著改，
 * 不可能出現「畫面叫 A、toast 說 B」。
 */
export const OJT_EXPORT_SCOPE_TEXT = `匯出內容依「${DIVISION_FILTER_ARIA_TEXT}」「${ORG_FILTER_ARIA_TEXT}」「${STATUS_FILTER_ARIA_TEXT}」三項條件。`;

/**
 * `AC-UX55` 第 3 句（🔴 **僅當「搜尋文件」目前有值時**出現）。
 *
 * 🔴 出現條件綁「搜尋文件有值」而**不是**綁分組模式：`org` 模式下該控制項完全不進 DOM
 * （`AC-33` ②）、切回時關鍵字會被清空 ⇒ 兩種情形都沒有落差可言，講它只會讓使用者去找一個
 * 畫面上沒有的東西。
 * ⚠ 本句依狀態出現或不出現，**不牴觸** `AC-UX53`——該條鎖的是 **CSV 之位元組**、不是畫面回饋；
 * 🔴 明文禁止為了「讓兩種模式完全一樣」而把本句改成恆顯示或恆不顯示。
 */
export const OJT_EXPORT_DOC_SEARCH_NOTE_TEXT = `「${DOC_SEARCH_ARIA_TEXT}」只縮小畫面上顯示的內容，不影響匯出。`;

/**
 * `AC-UX55`：匯出成功之 toast 文字（**恰兩句或三句**，順序即回傳陣列之順序）。
 *
 * @param exportedCount 🔴 **匯出筆數**（伺服器所回報者），非畫面列數。
 *   🔵 2026-09-22：型別擴為 `number | null`——伺服器未回報筆數時為 `null`（見
 *   `endpoints.exportOjtProgress`）。
 * @param docQueryActive 「搜尋文件」目前是否有值。
 *
 * 🔒 `AC-UX55` ④：全為使用者語言——🔴 **明文禁止**出現任何 `data-*` 屬性名、AC 或不變式編號、
 * 以及「篩選項」「不計入篩選」這類只對實作者有意義的措辭。本函式之四個字串常數即為該禁令之落點。
 *
 * 🔴 **只有第 1 句降級**（`AC-UX55` ⑦）：第 2 句（三項條件）與第 3 句（搜尋文件不影響匯出）
 * 之出現條件**完全不受影響**——降級的是「有沒有告訴使用者筆數」，不是「匯出了什麼」。
 */
export function ojtExportToastSentences(
  exportedCount: number | null,
  docQueryActive: boolean,
): string[] {
  /**
   * 🔴 判準必須是 `Number.isFinite()`，**明文禁止** `if (!exportedCount)` 之類的 falsy 判斷：
   * `0` 是 falsy 但**是一個合法的匯出結果**（真的匯出了 0 筆），天真寫法會把它誤送進降級分支，
   * 讓使用者在「確實沒有資料」與「系統說不出筆數」之間永遠分不清楚。
   * 🔒 本式同時涵蓋 `null`（標頭缺席）與 `NaN`（標頭存在但不可解析），兩者共用同一句降級文案。
   */
  const first =
    exportedCount !== null && Number.isFinite(exportedCount)
      ? ojtExportToastText(exportedCount)
      : OJT_EXPORT_COUNT_UNKNOWN_TEXT;
  const sentences = [first, OJT_EXPORT_SCOPE_TEXT];
  if (docQueryActive) sentences.push(OJT_EXPORT_DOC_SEARCH_NOTE_TEXT);
  return sentences;
}
