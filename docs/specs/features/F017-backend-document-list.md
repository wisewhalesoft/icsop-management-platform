# F017: 後台文件清單與搜尋
Priority: P0-MVP | Status: 🟡 實作（unit 綠；14 欄清單＋9 篩選＋排序分頁；**「檔案」與「連結點程序書」兩欄之後端富化與前端渲染已補**（doc-seams，批次注入不 N+1）；int 已寫未跑，見 implementation-logs/doc-seams-impl.md）｜**循環子分類顯示 delta：🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）** | Last Updated: 2026-08-07
Epic/Story: E04 / US-037

> **2026-08-07 additive delta**：第 14 欄「循環別」之顯示與其可搜尋下拉之選項，須反映循環子分類。規則權威＝[F040](F040-lifecycle-subcategory.md)；欄位數、篩選數與既有條款皆不變。
> **🔴 2026-08-16 CHANGE delta（使用者裁決；缺失／變更 delta 第 9 項）——篩選由 9 項改為 13 項且順序全面重排**：新增 `公告日期`（區間）／`附錄`／`使用表單`／`OJT` 四項，並將 13 項之順序改為使用者原文之逐字順序。**清單 14 欄之欄位集合、順序與顯示規則一律不變**。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與既有 `AC-S#` 批次區隔、不重號。
> ⚠ **另含兩處既有語意之擴充**：① `程序書書名內`（使用者原文之「內」字）＝等值下拉 ＋ contains 輸入之**雙行為**（OQ-D18-12）；② `當責室長` 比對範圍由**僅主要**擴為**主要∪次要**（OQ-D18-08，與 [F019](F019-public-list-browsing.md) `AC-D7` 為同一語意之兩處斷言，**不得只改一處**）。

## Description
後台以分頁清單檢視所有 ICSOP 文件，頂部呈現 3 張統計卡，提供 **13 個**篩選（其中 10 項為可搜尋下拉，另有公告日期區間、程序書書名內之雙行為欄、OJT 三值下拉）與依編號/公告日期排序。<br>📝 **2026-08-16 使用者裁決推翻，理由：使用者明列 13 項篩選條件（缺失 delta 第 9 項）**——原條文為「提供 **9 個**可搜尋下拉篩選」。清單顯示 14 欄（UI 顯示標籤，實體名維持「ICSOP 文件」）。狀態欄依「公告日期」衍生顯示（已公告/進度中/失效/作廢，見 F012）。與前台清單邏輯不同：**後台不套用「使用部門置頂」規則**，預設依最後更新時間或編號排序。未指派節點文件明顯標示。19 欄位權威定義見 [data-model.md](../data-model.md#document-entity)。

## Preconditions
- 操作者具後台文件管理存取權（F025；系統管理員/主管/部門窗口唯讀，ICSOPAdmin 可寫）。

## Main Flow
1. 進入後台清單頁 → 頂部顯示 3 張統計卡：程序書數量（總數）、已公告（衍生數）、進度中（衍生數）。
2. 分頁呈現清單，由左至右 14 欄：
   1. 制定公司
   2. 制定部門
   3. 制定室別
   4. 當責室長（顯示「當責室長-主要」，次要以 tooltip/次列呈現）
   5. 狀態（徽章：已公告／進度中／失效／作廢，依公告日期衍生）
   6. 檔案（ICSOP PDF，下載鈕/圖示）
   7. 樹狀圖圖示（點擊開啟 [F036 循環樹狀圖預覽](F036-lifecycle-tree-preview.md)，帶入該文件所屬循環 `?cycle=<code>`）
   8. 程序書編號（documentNumber，等寬字）
   9. 程序書書名（documentName）
   10. 版次（edition，如 `26'01`，等寬字）
   11. 內容摘要（contentSummary，可截斷 + title 顯示全文）
   12. 連結點程序書（文件連結點，下載鈕/圖示；0..*）
   13. 公告日期（announcedDate）
   14. 循環別（lifecycleId 名稱）
3. 關鍵字查詢（程序書編號/程序書書名）→ 僅顯示符合結果。
4. 套用 **13 個**篩選（順序由左至右／由上而下逐字為）：**制定公司、制定部門、制定室別、當責室長、狀態、程序書編號、程序書書名內、公告日期、連結點程序書、附錄、使用表單、OJT、循環別** → 清單即時更新。<br>📝 **2026-08-16 使用者裁決推翻，理由：使用者逐字指定 13 項篩選與其順序**——原條文為「套用 **9 個**可搜尋下拉（combobox 可輸入過濾）篩選：**循環別、狀態、程序書編號、程序書書名、制定部門、制定室別、當責室長、制定公司、連結點程序書**」。9 項全數保留（其中「程序書書名」改名為「程序書書名內」並擴充語意），新增 4 項，順序全面重排。<br>各項之比對語意逐項定義見 [AC-D2](#filter-13-delta)。
5. 依程序書編號/公告日期排序 → 清單即時更新。
6. 點擊某列「樹狀圖圖示」→ 開啟 [F036 循環樹狀圖預覽](F036-lifecycle-tree-preview.md)（新頁 `22-lifecycle-tree-preview.html?cycle=<該文件所屬循環代碼>`），以該文件所屬循環為預選之唯讀 DAG；可視範圍依 F036／F025「循環管理」唯讀規則（主管對循環管理為**全公司唯讀**，雙入口一致、無 403 落差，OQ-E08-03 已定案；DeptContact／User 無此權限）。

## Alternative Flows
- 依 F026 決定各角色可見欄位；唯讀角色顯示唯讀 banner。
- 統計卡與狀態徽章之「已公告/進度中」計數與顯示採 F012 衍生規則（有效＋公告日期≤今日＝已公告、有效＋公告日期>今日＝進度中）。

## Edge Cases
- 查無符合結果：顯示空狀態，非錯誤。
- **公告日期區間僅填單邊**（2026-08-16）：僅填起日＝該日（含）之後全部；僅填迄日＝該日（含）之前全部；兩端皆空＝不施加限制。**非錯誤**。
- **公告日期起日晚於迄日**：交集為空、顯示空狀態，**非錯誤**、不回錯誤碼。
- **公告日期為 null 之文件**（未填公告日期／進度中）：套用任一端之日期區間時**一律排除**（不得誤入結果）。
- **「程序書書名內」同時具備選取值與輸入值**：以**選取值（等值）優先**；使用者手動清除選取後所留之輸入文字始生效為 contains。
- **「附錄」／「使用表單」篩選之選項為空**（池中無任何附錄／表單）：下拉呈現空選項清單，非錯誤。
- **「使用表單」選項之顯示字串**：`{編號} {名稱}`（編號與名稱間一個半形空格）；`formNumber` 為 `null` 者**僅顯示名稱**（不得出現前導空格或 `null`）。選項值恆為 `formId`（[F018](F018-usage-form-management.md) `AC-D8`）。
- 存在「未指派節點」文件：以明顯標示（警示圖示）呈現；其「樹狀圖圖示」仍可開啟該文件**所屬循環**之 F036 預覽（文件所屬循環為建立時必填，僅尚未定位於特定節點）。
- 內容摘要過長：清單截斷顯示，滑鼠停留（title）顯示全文。
- 文件無連結點程序書（0 筆）：該欄留空或顯示「—」。

## Postconditions
- 管理員可定位需維護文件並掌握文件池狀態（含程序書數量/已公告/進度中總覽）。

## Acceptance Criteria
- Given 進入清單頁, When 載入, Then 頂部顯示 3 張統計卡（程序書數量/已公告/進度中），清單分頁顯示 14 欄。
- Given 輸入既存程序書編號或書名關鍵字, When 查詢, Then 僅回傳符合結果。
- Given 套用「制定部門+狀態」複合篩選, When 條件套用, Then 清單反映交集結果。
- Given 於 制定公司／制定部門／制定室別／當責室長／程序書編號／程序書書名內／連結點程序書／附錄／使用表單／循環別 任一可搜尋下拉輸入關鍵字, When 過濾, Then 下拉選項即時縮小並可選取。<br>📝 **2026-08-16 使用者裁決推翻，理由：篩選由 9 項改為 13 項且順序重排**——原條文列舉為「循環別/狀態/程序書編號/程序書書名/制定部門/制定室別/當責室長/制定公司/連結點程序書」共 9 項。本條改列**具 combobox 語意之 10 項**；`狀態` 與 `OJT` 為固定值下拉（非 combobox）、`公告日期` 為區間輸入（非下拉），三者不適用本條。
- Given 有效文件, When 呈現狀態欄, Then 依公告日期衍生顯示「已公告」（≤今日）或「進度中」（>今日），失效/作廢照原樣顯示。
- Given 點擊某列樹狀圖圖示, When 觸發, Then 開啟 [F036](F036-lifecycle-tree-preview.md) 循環樹狀圖預覽（帶入該文件所屬循環 `?cycle=<code>`）。
- Given 查詢無符合關鍵字, When 查詢, Then 顯示空狀態而非錯誤。
- Given 清單含未指派節點文件, When 呈現, Then 正確顯示警示標示。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**：Given 某文件所屬循環為「銷售及收款循環（消金）」, When 清單第 14 欄「循環別」呈現, Then 顯示字串恰為 `銷售及收款循環（消金）`（由 `lifecycleDisplayName` 產生，全形括號無空白）；Given 所屬循環無子分類, Then 顯示恰為 `銷售及收款循環`（不含括號）。
- **AC-S2**：Given 池中有「銷售及收款循環（消金）」與「銷售及收款循環（企金）」, When 展開「循環別」可搜尋下拉, Then 呈現**兩個相異選項**（各以 `lifecycleDisplayName` 顯示），選項值為各自 `lifecycleId`（**非** `name` 字串）；When 選定其中一項, Then 清單僅回傳該具體循環之文件，不含同名另一子分類之文件。

### 篩選 9 → 13 項 delta（🔴 2026-08-16 使用者裁決；缺失／變更 delta 第 9 項） {#filter-13-delta}

> 前提裁決：**OQ-D18-10**＝「附錄」「使用表單」為可搜尋下拉選具體某一份、「OJT」為三值（全部／有／無）；**OQ-D18-11**＝公告日期為區間；**OQ-D18-12**＝「程序書書名內」＝等值下拉＋contains 輸入雙行為（含 `%`／`_`／`'` 跳脫）；**OQ-D18-08**＝當責室長比對＝主要∪次要；**OQ-D18-13**＝桌面多列 grid 自動換行、行動沿用底部 sheet、提供「清除全部篩選」（版面細節由 ui-ux-designer 定稿）。

- **AC-D1**（篩選器組成與順序）：Given 進入後台文件清單頁, When 檢視篩選區, Then 其篩選控制項**恰為 13 個**，且順序（桌面：由左至右、逐列換行；行動 sheet：由上而下）逐字為 `制定公司`／`制定部門`／`制定室別`／`當責室長`／`狀態`／`程序書編號`／`程序書書名內`／`公告日期`／`連結點程序書`／`附錄`／`使用表單`／`OJT`／`循環別`；各控制項之無障礙名稱即為上列逐字字串。
- **AC-D2**（各項比對語意）：Given 已選定某篩選值, When 後端執行查詢, Then 依下表比對；未提供者不施加限制；多項並用為 **AND**。

  | # | 篩選 | 控制項型態 | 比對鍵與語意 |
  |---|---|---|---|
  | 1 | `制定公司` | 可搜尋下拉 | `draftingCompanyId` 等值（既有） |
  | 2 | `制定部門` | 可搜尋下拉 | `draftingDeptId` 等值（既有） |
  | 3 | `制定室別` | 可搜尋下拉 | `draftingSectionId` 等值（既有） |
  | 4 | `當責室長` | 可搜尋下拉 | **`primaryChiefId` ∪ `secondaryChiefIds` 命中任一即納入**（🔴 語意擴充，見 AC-D7） |
  | 5 | `狀態` | 固定值下拉 | 衍生顯示值（`已公告`／`進度中`／`失效`／`作廢`）；既有語意不變 |
  | 6 | `程序書編號` | 可搜尋下拉 | `documentNumber` 等值（既有） |
  | 7 | `程序書書名內` | 可搜尋下拉 ＋ 可自由輸入 | **雙行為**：選取某選項→`documentName` **等值**；未選取而直接輸入文字→`documentName` **contains、不分大小寫**（見 AC-D3） |
  | 8 | `公告日期` | 起／迄兩個日期輸入 | `announcedDate` **閉區間**（含起日、含迄日）；兩端皆可留空；`announcedDate` 為 `null` 者於任一端有值時一律排除 |
  | 9 | `連結點程序書` | 可搜尋下拉 | 擁有指向該目標文件之 `DOCUMENT_LINK` 者（既有 `linkTargetId` 語意不變） |
  | 10 | `附錄` | 可搜尋下拉 | 選具體一份附錄（值＝`appendixId`）；納入條件＝該文件之 `DOC_APPENDIX` 含該 `appendixId` |
  | 11 | `使用表單` | 可搜尋下拉 | 選具體一份使用表單（值＝`formId`）；納入條件＝該文件之 `DOC_USAGE_FORM` 含該 `formId`；**選項 label ＝ `{編號} {名稱}`，無編號者僅名稱** |
  | 12 | `OJT` | 固定值下拉（三值） | `全部`（不施加限制，預設）／`有 OJT`（存在 `DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'`）／`無 OJT`（不存在） |
  | 13 | `循環別` | 可搜尋下拉 | `lifecycleId` 等值；顯示以 `lifecycleDisplayName`（既有 AC-S2 不變） |

- **AC-D3**（「程序書書名內」雙行為與跳脫）：Given 池中有書名 `車輛分期進件作業` 與 `機車分期進件作業` 兩份文件, When 於 `程序書書名內` **選取**「車輛分期進件作業」, Then 僅回傳該一筆（等值）；When 改為**僅輸入** `進件` 而未選取任何選項, Then 兩筆皆回傳（contains）；When 輸入 `進件作業` 之大小寫混合形式（如含英數時之 `AbC`）, Then 比對不分大小寫。<br>Given 輸入字串含 `%`、`_` 或 `'`, When 送出, Then 於 SQL `LIKE` 路徑正確跳脫——`%` 與 `_` **以字面比對**（不作萬用字元）、`'` 不造成錯誤或注入；查詢正常回傳（比照 [F019](F019-public-list-browsing.md) 既有跳脫要求）。
- **AC-D4**（公告日期區間邊界）：Given 三筆文件之 `announcedDate` 分別為 `2026-01-01`／`2026-01-15`／`2026-02-01`、另一筆為 `null`, When 以區間 `2026-01-01` ～ `2026-01-15` 查詢, Then 恰回傳前兩筆（**兩端皆含**）；When 僅填起日 `2026-01-15`, Then 回傳後兩筆；When 僅填迄日 `2026-01-15`, Then 回傳前兩筆；四種情形下 `announcedDate = null` 之該筆**皆不回傳**。
- **AC-D5**（OJT 三值）：Given 文件 A 有 `OJT_SIGNIN` 附件、文件 B 無, When `OJT = 全部`, Then A、B 皆回傳；When `OJT = 有 OJT`, Then 僅 A；When `OJT = 無 OJT`, Then 僅 B。
- **AC-D6**（附錄／使用表單選具體一份）：Given 附錄 X 被文件 A、B 引用、附錄 Y 僅被 C 引用, When `附錄 = X`, Then 回傳 A、B 且不含 C；使用表單同構（以 `formId` 比對）。
- **AC-D7**（🔴 當責室長主要∪次要；與前台一致）：Given 文件 A（`primaryChiefId='E001'`、`secondaryChiefIds=[]`）與文件 B（`primaryChiefId='E009'`、`secondaryChiefIds=['E001']`）, When 以 `當責室長 = E001` 篩選, Then **A 與 B 皆回傳**。<br>📝 **2026-08-16 使用者裁決推翻既有實作語意，理由：OQ-D18-08 要求前後台兩處語意一致**——spec-writer 於 2026-08-16 實地核對 `backend/src/documents/document-list-query.ts:57`（`filters.primaryChiefId !== r.primaryChiefId`）與 `frontend/src/pages/DocumentListPage.tsx:170`（`d.primaryChiefName ?? d.primaryChiefId`），確認**後台現況僅比對主要室長**。本條將其擴為主要∪次要（**嚴格超集**：既有「以主要室長篩選能找到該文件」之期望值不反轉，僅新增次要命中之情形）。與 [F019](F019-public-list-browsing.md) `AC-D7` 為同一語意之兩處斷言，**必須同批實作、不得只改一處**。<br>下拉選項清單相應改為「全體文件之 `primaryChiefId` ∪ `secondaryChiefIds`」之 distinct。
- **AC-D8**（清除全部篩選）：Given 已套用任意數量之篩選, When 點擊「清除全部篩選」, Then 13 項篩選與關鍵字同時清空、清單回復未篩選狀態與預設排序、分頁回第 1 頁。
- **AC-D9**（🔒 清單欄位回歸鎖定）：Given 本 delta 實作完成, When 檢視清單, Then **14 欄之欄位集合、由左至右順序與各欄顯示規則逐項與本 delta 導入前相同**——本 delta **僅動篩選、不動欄位**；3 張統計卡、排序與分頁行為亦不變；既有 AC 與 `AC-S1`／`AC-S2` 維持綠燈。

- **AC-D10**（🔴 篩選區之逐字文案與選擇器契約；**2026-08-16 補訂**，權威＝`prototypes/13-document-list.html`）：Given 後台文件清單頁渲染完成, When 檢視篩選區, Then 下列文案與選擇器**逐字成立**——
  | 項目 | 逐字值 | 說明 |
  |---|---|---|
  | 篩選區容器 | DOM id `filterBar` | 桌面多列 grid 之容器 |
  | 各 combobox 輸入框 | DOM id `cbD_{key}_input`；`role="combobox"`、`aria-label` ＝該篩選之逐字 label | `{key}` 為該篩選之鍵 |
  | 各 combobox 清除鈕 | DOM id `cbD_{key}_clear`；`aria-label` ＝ `清除{label}`（如 `清除制定公司`） | 僅於該篩選有值時可見 |
  | 一般 combobox 之 placeholder | `全部` | 除 `程序書書名內` 外之九項 |
  | `程序書書名內` 之 placeholder | `全部（或直接輸入部分書名）` | 使 `AC-D3` 之雙行為在 UI 上可見 |
  | `狀態` 下拉之預設選項 | `全部` | ＝不施加限制 |
  | `OJT` 下拉之三選項 | `全部`／`有 OJT`／`無 OJT` | 同 `AC-D2` 第 12 列與 `AC-D5` |
  | `公告日期` 兩輸入 | `aria-label` 分別為 `公告日期 起日`／`公告日期 迄日`；DOM id `cbD_date_from`／`cbD_date_to`；外層 `role="group"` 且 `aria-label` ＝ `公告日期` | `type="date"` |
  | 清除全部篩選鈕 | 可見文字 `清除全部篩選` | 桌面與行動 sheet 各一 |
  | 行動底部 sheet | 標題 `篩選條件`；主要動作鈕 `套用`；關閉鈕 `aria-label` ＝ `關閉篩選` | < md 斷點 |

  📌 **本條之存在理由**：`AC-D1`～`AC-D9` 只規範**行為與順序**，未定義任何**文案與選擇器**。本輪之約束環為簡化版（僅 jest/vitest、無 Playwright fidelity）⇒ **AC 是唯一防線**；未入 AC 之選擇器，test-generator 只能自行臆造，測出來之物與畫面對不上。本 repo 已於 F041 帳號清單角色徽章吃過同一形狀之虧（prototype 有寫、AC 漏寫、缺陷因此逃出約束環）。
## Error Scenarios
- 空結果/搜尋跳脫：見 [error-handling.md#public](../error-handling.md#public)。分頁效能見 [NFR-001](../nfr.md#performance)。

## Related
- Data: [ICSOP_DOCUMENT（19 欄位）](../data-model.md#document-entity)
- Depends on: [F010](F010-create-document.md), [F012](F012-document-status-toggle.md)（狀態衍生）, [F014](F014-accountable-dept-chief.md)（制定組織/當責室長）, [F016](F016-pdf-ojt-attachment.md)（檔案下載）
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（`lifecycleDisplayName` 顯示規則、篩選值＝`lifecycleId`）
- Related: 樹狀圖預覽（第二入口）見 [F036](F036-lifecycle-tree-preview.md)；DAG 資料見 [F008](F008-dag-node-edge.md)/[F009](F009-node-drawer-maintenance.md)；連結點見 [F015](F015-document-cross-link.md)
- 對比前台: [F019](F019-public-list-browsing.md)（後台不套用部門置頂；**「當責室長」比對語意兩處必須一致，見 `AC-D7`**）
- **2026-08-16 使用者裁決**: OQ-D18-08／10／11／12／13（見 [§篩選 9 → 13 項 delta](#filter-13-delta)）。新增篩選之資料來源：[F039](F039-appendix-management.md)（附錄）、[F018](F018-usage-form-management.md)（使用表單，含 `formNumber` 顯示字串）、[F016](F016-pdf-ojt-attachment.md)（OJT）。
- **待 system-architect（本 delta 新增）**：① 13 項篩選之後端下推策略（現況為前端於完整工作集上客端篩選＋`linkTargetId` 例外查詢；新增之附錄／使用表單／OJT／日期區間是否一併下推至 SQL，關乎 [NFR-001](../nfr.md#performance)）；② 「當責室長」主要∪次要之 `DOC_SECONDARY_CHIEF` join 策略（須與 [F019](F019-public-list-browsing.md) `AC-D7` 共用同一實作）；③ 篩選選項來源端點（後台無可見性過濾義務，與前台 [F019](F019-public-list-browsing.md) `AC-D5` 之端點是否共用）。
