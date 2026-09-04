/**
 * 前台（03 文件清單／30 業務-功能類別樹狀圖／04 文件詳情）橫幅之內容寬度 token。
 *
 * 🔵 2026-09-04 寬螢幕版面寬度 delta（使用者裁決；權威＝`prototypes/03-public-list.html`
 * 與 `prototypes/30-public-category-tree.html` 之同名 delta 註解）：
 *   前台原本一律 `max-w-5xl`（1024px）。在 `06-rwd-showcase` 定義之桌機基準線 1440px 下尚稱合理
 *   （71%），但實機 1920px 螢幕只用到 53%，左右各空 448px。
 *   故僅於 **2xl（≥1536px）** 以上放寬到 `max-w-7xl`（1280px）——
 *   🔒 **≤1440px 之所有斷點（桌機基準線、平板、手機）逐像素不變**，既有三斷點驗收不受影響。
 *
 * 🔴 這是**同一個版面 token 的兩處呈現**（app bar 必須與其下方內容等寬，否則 logo 與內容左緣錯位），
 * 故刻意收成一份常數；與架構 §14.8 所禁止的「字面恰好相同但語意無關之標籤共用常數」不同。
 *
 * 🔴 **不適用於樹狀圖畫布**：`prototypes/30` 之 `<main id="stage">` 本來就沒有 max-w（橫幅置中、
 * 畫布全寬），寬樹一旦被夾住就只能靠拖曳平移找回被切掉的部分。畫布請維持全寬。
 */
export const PUBLIC_SHELL_WIDTH = 'max-w-5xl 2xl:max-w-7xl';
