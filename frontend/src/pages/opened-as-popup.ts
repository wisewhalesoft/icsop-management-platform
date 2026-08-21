/**
 * F036 `AC-T19`（2026-08-21 第二輪裁決）：**全站唯一**之「本頁是否為自來源分頁 `window.open`
 * 開出之彈出頁」述詞。
 *
 * 🔴 **不得再寫第二套**：兩份判斷各自演化，就會出現「返回鈕以為自己是彈出頁、導向鈕以為不是」
 * 這種互相矛盾的行為。消費者恰三處——返回鈕之離開動作（`AC-D3b`）、返回鈕之標籤／圖示決定
 * （`AC-D3c`）、子樹抽屜導向鈕之派送（`AC-T20`／`AC-T21`）。
 *
 * 回 `false` 之三種情形（皆代表「沒有可用的來源分頁」）：
 *   ① `window.opener` 為 `null`／`undefined`（直接貼網址進入；jsdom 未設定時為 `undefined`）
 *   ② `opener.closed === true`（來源分頁已被使用者關掉）
 *   ③ 存取 `window.opener` 或其屬性時擲例外（跨源／被瀏覽器切斷）⇒ catch 後視同無 opener
 *
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> 三處各自寫 `Boolean(window.opener)`——只看屬性存在與否，
 * opener 已關閉時仍判為 `true` ⇒ `window.close()` 被瀏覽器拒絕、使用者「按了沒反應」。
 *
 * ⚠ 情形 ② 在 Chromium **量不到**（來源分頁關閉後瀏覽器直接把 `window.opener` 設為 `null`，
 * 落在情形 ①）——它是給其他引擎的防禦，只能以 jsdom 替身建案例（`AC-T23`）。
 */
export function openedAsPopup(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const opener = window.opener as { closed?: boolean } | null | undefined;
    return !!(opener && !opener.closed);
  } catch {
    return false;
  }
}
