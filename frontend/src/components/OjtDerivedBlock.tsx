import type { ReactNode } from 'react';
import { getDocumentOjtCompletion } from '../api/endpoints';
import { Icon } from './Icon';

/**
 * F042 `AC-21`／`AC-24`：ICSOP 文件之 **OJT 唯讀衍生區塊**——列出已完成 OJT 之使用單位清單。
 *
 * 🔴 本區塊**不提供任何上傳、取代或覆蓋入口**（`AC-22`，含 ICSOPAdmin）：OJT 自此不是一份
 * 「附件」，而是各使用單位於「OJT 進度管理」登記之教育訓練場次**彙總而得之衍生值**。
 * 🔒 其判定與清單頁之文件層三值狀態（`AC-04`）**共用同一套規則**（後端單一 port
 * `OjtCompletionReader`），不得各自實作——同一份底層事實的兩種呈現若各算一次，遲早會出現
 * 「清單說已全部完成、詳情頁卻列不滿」這種畫面自相矛盾。
 *
 * 三處消費端（後台唯讀頁／後台編輯頁／前台詳情頁）共用本元件，逐字文案因而只有一份。
 * ⚠ **前台不得傳入 `progressLink`**：前台使用者沒有後台頁面之存取權，且該連結會成為區塊內
 * 唯一之 `a[href]`（`AC-24` 明文要求前台本區塊內無任何下載／檢視控制項）。
 */
/**
 * 區塊標題——**逐字** `OJT 實體簽到表`，取自 `prototypes/16-document-readonly.html`
 * `ojtDerivedRow()`（:418，未加任何後綴）。
 *
 * 📝 我曾一度改成 `OJT 實體簽到表（唯讀衍生）`，以避開當時環中「該字串不得存在於頁面」之斷言；
 * test-generator 於 2026-08-28 查證 prototype 後裁定**該斷言才是環自身的缺陷**：衍生列逐字帶
 * `data-attachment-kind="ojt"`、與 ICSOP PDF／使用表單／附錄**同列於同一份附件清單**，OJT 並非
 * 「從此不是附件」——`AC-J1` 反轉的是覆蓋語意，與清單成員資格無關。故標題還原為逐字值。
 * ⚠ 唯一真正改變的是：`ATTACHMENTS` 不再有 `type:'OJT_SIGNIN'` 之**檔案**列，本列改為衍生內容，
 * **列本身不消失**。
 */
export const OJT_DERIVED_TITLE_TEXT = 'OJT 實體簽到表';
export const OJT_DERIVED_BADGE_TEXT = '唯讀 · 衍生值';
export const OJT_DERIVED_EMPTY_TEXT = '尚無任何使用單位完成 OJT';
export const OJT_PROGRESS_LINK_TEXT = '前往 OJT 進度管理';
export const OJT_DERIVED_NOTE_TEXT =
  '本欄為唯讀衍生值——由各使用單位於「OJT 進度管理」登記之教育訓練場次彙總而得（該單位有至少一筆場次即為已完成）；本頁不提供任何上傳、取代或覆蓋入口。';

/** 摘要逐字：`已完成 {done}／{total} 個使用單位`（全形斜線，與 prototype 04／16 同源）。 */
export function ojtDerivedSummaryText(done: number, total: number): string {
  return `已完成 ${done}／${total} 個使用單位`;
}

/**
 * 取單一文件之已完成單位代碼，供後台唯讀頁／編輯頁共用。
 *
 * 🔴 以 `await` 而非 `.then()` 串接是必要的：本區塊為**唯讀附加資訊**，其載入失敗
 * （網路、端點尚未上線、或測試中之 stub 回傳非 Promise）都不得使整頁文件檢視／編輯連帶失敗。
 * `.then()` 直接串在回傳值上，一旦回傳值不是 Promise 便會**同步拋出**而落入呼叫端 `load()` 之
 * try/catch，把整頁打成「載入失敗」——與本區塊之重要性完全不成比例。
 */
export async function loadOjtCompletion(
  documentId: string,
  onLoaded: (orgCodes: string[]) => void,
): Promise<void> {
  try {
    const res = await getDocumentOjtCompletion(documentId);
    onLoaded(res?.completedOrgCodes ?? []);
  } catch {
    onLoaded([]);
  }
}

export function OjtDerivedBlock({
  completedUnits,
  totalUnits,
  progressLink,
  showNote = true,
}: {
  /** 已完成 OJT 之使用單位顯示名稱（已由呼叫端解析為名稱；查無則為代碼本身）。 */
  completedUnits: string[];
  /** 該文件之使用單位總數（分母；🔴 不套用 `isActive` 過濾，與 TAB1 統計之口徑刻意不同）。 */
  totalUnits: number;
  /** 後台專用之導覽連結（前台不傳）。 */
  progressLink?: ReactNode;
  /** 前台版面較窄時可略去說明句（預設呈現）。 */
  showNote?: boolean;
}): JSX.Element {
  return (
    <div
      data-ojt-derived=""
      data-attachment-kind="ojt"
      className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Icon name="graduation-cap" className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-sm font-medium text-slate-700">{OJT_DERIVED_TITLE_TEXT}</span>
        <span
          data-ojt-derived-badge=""
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0 whitespace-nowrap"
        >
          {OJT_DERIVED_BADGE_TEXT}
        </span>
        {progressLink}
      </div>
      {completedUnits.length === 0 ? (
        <div data-ojt-derived-empty="" className="mt-1.5 text-sm text-slate-400">
          {OJT_DERIVED_EMPTY_TEXT}
        </div>
      ) : (
        <>
          <div data-ojt-derived-summary="" className="mt-1.5 text-sm text-slate-700">
            {ojtDerivedSummaryText(completedUnits.length, totalUnits)}
          </div>
          <ul data-ojt-completed-list="" className="mt-1 flex flex-wrap gap-1.5">
            {completedUnits.map((name) => (
              <li
                key={name}
                data-ojt-completed-org=""
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
              >
                {name}
              </li>
            ))}
          </ul>
        </>
      )}
      {showNote && (
        <p data-ojt-derived-note="" className="mt-1.5 text-[10px] text-slate-400 leading-relaxed">
          {OJT_DERIVED_NOTE_TEXT}
        </p>
      )}
    </div>
  );
}
