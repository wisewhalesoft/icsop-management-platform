/**
 * F020 浮水印 DOM 疊加層之呈現常數 —— **前端側之單一定稿落點**（`AC-N2`／`AC-N3`／`AC-T1`）。
 *
 * 🔴 **色值／不透明度／行高三者必須同居一模組**（`AC-T1` 明文：「兩者不得分居兩檔——一致性條款
 * 若散在兩個模組，改一個忘一個沒有測試會抓到」）。本模組即該落點；兩個 DOM 疊加載體
 * （`LifecycleTreePreviewPage`／`ChangeHistoryPage`）一律 import 之，**不得**以字面值散落於
 * JSX inline style。
 *
 * ⚠ 這份 `WATERMARK_LINE_HEIGHT` 與後端 `backend/src/public/pdf-burner.ts` 那份為「**兩份、值相同**」，
 * 不是「同一份」——前後端為兩個獨立 TS 專案、無共用 package，「全系統只有一份」在現行 build 管線下
 * 不可達。一致性由**兩側各自對字面值 `2` 斷言**保證（`AC-T3` ③），不是靠「兩邊程式碼看起來一樣」。
 *
 * 🔒 **本輪只動行距**：色值 `#334155`（Tailwind slate-700）與不透明度 `0.30` 逐字不變
 * （`AC-N1`／`AC-N2`／`AC-N3`）。
 */

/** 浮水印文字色（`AC-N2` 定稿值；＝Tailwind slate-700）。 */
export const WATERMARK_COLOR = '#334155';

/** 浮水印疊加層不透明度（`AC-N2` 定稿值；`OQ-D9-31` 將原 0.57 下修為 0.30）。 */
export const WATERMARK_OPACITY = 0.3;

/**
 * 三行式浮水印之行高倍數（`AC-T1`／`AC-T2`／`AC-T3`；`OQ-T3-01` 選項 (c)）。
 *
 * 🔴 **無單位倍數**（`2`，非 `'2px'`／`'200%'`）：斷言請用數值比較
 * （`Number(el.style.lineHeight) === WATERMARK_LINE_HEIGHT`），字串相等會因 `'2'` vs `'2.0'`
 * 之差異而脆裂，且該差異與行為無關。
 *
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `1.5`（`prototypes/00`）｜OLD> `1.6`（`22`／`23`）｜
 * OLD> `22/14 ≈ 1.5714`（`05` 之 canvas 每行位移）。三種值曾同時存在而沒有任何一條 AC 會紅，
 * 這正是 `AC-T3` 之「相異值集合 size 恰為 1」要讓其顯形的缺陷形狀。
 */
export const WATERMARK_LINE_HEIGHT = 2;
