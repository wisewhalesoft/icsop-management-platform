# F017: 後台文件清單與搜尋
Priority: P0-MVP | Status: 🟡 實作（unit 綠；14 欄清單＋9 篩選＋排序分頁；**「檔案」與「連結點程序書」兩欄之後端富化與前端渲染已補**（doc-seams，批次注入不 N+1）；int 已寫未跑，見 implementation-logs/doc-seams-impl.md）｜**循環子分類顯示 delta：🟢 APPROVED（2026-08-07）**｜**連結點程序書欄摺疊 delta：🟢 APPROVED（2026-08-18 使用者裁決，AC-E1～AC-E9）** | Last Updated: 2026-08-18
Epic/Story: E04 / US-037

> **2026-08-07 additive delta**：第 14 欄「循環別」之顯示與其可搜尋下拉之選項，須反映循環子分類。規則權威＝[F040](F040-lifecycle-subcategory.md)；欄位數、篩選數與既有條款皆不變。
> **🔴 2026-08-16 CHANGE delta（使用者裁決；缺失／變更 delta 第 9 項）——篩選由 9 項改為 13 項且順序全面重排**：新增 `公告日期`（區間）／`附錄`／`使用表單`／`OJT` 四項，並將 13 項之順序改為使用者原文之逐字順序。**清單 14 欄之欄位集合、順序與顯示規則一律不變**。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與既有 `AC-S#` 批次區隔、不重號。
> **🔴 2026-08-18 CHANGE delta（使用者體驗缺失回報）——第 12 欄「連結點程序書」改為恆一行高之摺疊呈現**：多連結之列原被上下拉伸至 5～6 行高、清單無法掃視。新行為＝只顯示第一顆 pill ＋ 可點的 `+{N−1}` 徽章、點擊就地展開；**編號仍為可見文字、書名仍只在 tooltip**；`連結點程序書` 篩選命中者排第一顆。**14 欄之欄位集合與順序、13 項篩選之比對語意、統計卡／排序／分頁一律不變。** 逐條見 [§連結點程序書欄摺疊 delta](#link-cell-collapse-delta)（`AC-E1`～`AC-E9`）。
> **🔵 2026-08-20 additive delta（使用者裁決；缺失／變更 delta 第 9 項）——清單最左新增「OJT」圖示欄**：清單由 14 欄改為 **15 欄**，新增之圖示欄置於**最左**（第 1 欄，`制定公司` 之前），依既有 `hasOjt` 布林值呈現兩種視覺狀態。**資料層已就緒**（`backend/src/documents/documents.store.ts:135-142` 之 `hasOjt?: boolean` 已於同一次批次查詢取得、`frontend/src/api/types.ts:196-197` 已有型別），**不需新增後端欄位或查詢**。**本 delta 之 AC 編號採 `AC-N#`**（N＝2026-08-20 defect delta），與既有 `AC-S#`／`AC-D#`／`AC-E#` 區隔、不重號。逐條見 [§OJT 圖示欄 delta](#ojt-icon-column-delta)（`AC-N37`～`AC-N40`）。
> ⚠ **另含兩處既有語意之擴充**：① `程序書書名內`（使用者原文之「內」字）＝等值下拉 ＋ contains 輸入之**雙行為**（OQ-D18-12）；② `當責室長` 比對範圍由**僅主要**擴為**主要∪次要**（OQ-D18-08，與 [F019](F019-public-list-browsing.md) `AC-D7` 為同一語意之兩處斷言，**不得只改一處**）。
> **🔵 2026-08-21 additive delta（使用者裁決；三項裁決第 3 項）——節點子樹 deep link 篩選**：`GET /admin/documents` 新增 `nodeSubtreeId` 篩選參數（**恆與 `lifecycleId` 成對**），語意＝同一循環且掛載節點 ∈ 該節點子樹；本頁以**可清除的 chip** 呈現。**本 delta 之 AC 編號採 `AC-T#`**（`AC-T40`～`AC-T48`），權威見 [§節點子樹篩選（deep link）delta](#subtree-filter-delta)。
> 🔒 **子樹為第 14 個篩選來源但不進那 13 項**——`AC-D1`／`AC-D2`／`AC-D9`／`AC-D10`／`AC-N40` ② 逐字續為有效；本 delta 僅**就地擴充 `AC-D8`**（清除全部篩選須連 chip 一起清）。上游入口＝[F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta) 之子樹抽屜導向鈕。

## Description
後台以分頁清單檢視所有 ICSOP 文件，頂部呈現 3 張統計卡，提供 **13 個**篩選（其中 10 項為可搜尋下拉，另有公告日期區間、程序書書名內之雙行為欄、OJT 三值下拉）與依編號/公告日期排序。<br>📝 **2026-08-16 使用者裁決推翻，理由：使用者明列 13 項篩選條件（缺失 delta 第 9 項）**——原條文為「提供 **9 個**可搜尋下拉篩選」。清單顯示 14 欄（UI 顯示標籤，實體名維持「ICSOP 文件」）。狀態欄依「公告日期」衍生顯示（已公告/進度中/失效/作廢，見 F012）。與前台清單邏輯不同：**後台不套用「使用部門置頂」規則**，預設依最後更新時間或編號排序。未指派節點文件明顯標示。19 欄位權威定義見 [data-model.md](../data-model.md#document-entity)。

## Preconditions
- 操作者具後台文件管理存取權（F025；系統管理員/主管/部門窗口唯讀，ICSOPAdmin 可寫）。

## Main Flow
1. 進入後台清單頁 → 頂部顯示 3 張統計卡：程序書數量（總數）、已公告（衍生數）、進度中（衍生數）。
2. 分頁呈現清單，由左至右 **15 欄**（🔴 **2026-08-20 就地改寫，原為 14 欄**；新增之第 1 欄「OJT」圖示欄為本次唯一變動，其餘 14 欄之集合、相對順序與顯示規則逐項不變）：
   0. **OJT**（圖示欄，依 `hasOjt` 兩態呈現；`AC-N37`～`AC-N39`，2026-08-20 delta）
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
   12. 連結點程序書（文件連結點，下載鈕/圖示；0..*）——**恆一行高之摺疊呈現**：0 個＝`—`／1 個＝單顆 pill／N ≥ 2＝第一顆 pill ＋ 可點的 `+{N−1}` 徽章，點擊就地展開列出全部（`AC-E1`～`AC-E5`，2026-08-18 delta）
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
- **文件恰有 1 個連結點程序書**（2026-08-18）：顯示單顆 pill，**不得**出現 `+0` 或任何摺疊徽章（`AC-E1`）。
- **文件有 N ≥ 2 個連結點程序書**：收合態只見第一顆；其餘經 `+{N−1}` 展開後可見且**每一個都可點擊下載**——不得有任何目標僅存在於 tooltip 而無法觸發（`AC-E3`／`AC-E4`）。
- **展開某列後改變篩選／換頁**：展開狀態以列身分（`documentId`）為鍵，不得落到其他列上；該列若已不在結果集中則自然不呈現，**非錯誤**（`AC-E5`）。
- **`連結點程序書` 篩選命中之連結非該列之第一筆**：改以命中者為收合態唯一可見之第一顆，其餘順序不變（`AC-E6`）。

## Postconditions
- 管理員可定位需維護文件並掌握文件池狀態（含程序書數量/已公告/進度中總覽）。

## Acceptance Criteria
- Given 進入清單頁, When 載入, Then 頂部顯示 3 張統計卡（程序書數量/已公告/進度中），清單分頁顯示 **15 欄**。<br>📝 **2026-08-20 就地改寫（`OQ-D9-25` 選項 A）**：原條文為「清單分頁顯示 **14 欄**」；新增最左之「OJT」圖示欄後為 15 欄。原數值逐字保留於此供追溯。
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
- **AC-D8**（清除全部篩選；🔴 **2026-08-21 就地擴充**）：Given 已套用任意數量之篩選, When 點擊「清除全部篩選」, Then **13 項篩選、關鍵字與節點子樹 chip 三者同時清空**（含自網址移除 `lifecycleId`／`nodeSubtreeId` 兩參數）、清單回復未篩選狀態與預設排序、分頁回第 1 頁。
  <br>📝 **OLD>「13 項篩選與關鍵字同時清空」**（未涵蓋 chip）。<br>🔴 **擴充理由**：按鈕字面是「清除全部篩選」，清完卻仍有一條 chip 在縮小結果集，**畫面與文字自相矛盾**。<br>⚠ **反向不成立**——chip 自己的 ✕ **只**清 chip、不動那 13 項與關鍵字（清除之**方向性不對稱**，見 `AC-T46`）。
- **AC-D9**（🔒 清單欄位回歸鎖定）<br>📝 **2026-08-18 範圍縮減**：本條之「各欄顯示規則逐項不變」自該日起**排除第 12 欄「連結點程序書」**（改為摺疊呈現，權威＝`AC-E1`～`AC-E9`）；其餘 13 欄仍逐項鎖定。<br>📝 **2026-08-20 範圍再次縮減**：本條之「**欄位集合**」自該日起改讀為「**既有 14 欄之集合與其相對順序**」——最左新增之「OJT」圖示欄為 `OQ-D9-25`（選項 A）核可之 additive 變更，**不視為違反本條**（權威＝`AC-N37`～`AC-N40`）。**除該新增欄外，欄位集合仍不得增減、既有 14 欄之相對順序仍不得變動。**<br>Given 本 delta 實作完成, When 檢視清單, Then **既有 14 欄之欄位集合、其由左至右之相對順序與各欄顯示規則逐項與本 delta 導入前相同**——本 delta **僅動篩選、不動欄位**；3 張統計卡、排序與分頁行為亦不變；既有 AC 與 `AC-S1`／`AC-S2` 維持綠燈。

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

### 連結點程序書欄摺疊 delta（🔴 2026-08-18 使用者體驗缺失；權威＝`prototypes/13-document-list.html` 檔頭 2026-08-18 區塊 ①～⑨） {#link-cell-collapse-delta}

> **缺失原文**（使用者回報）：「文件清單，當連結點程序書有多份時，會造成畫面排版被嚴重上下拉伸。是否應考慮用 hover 顯示連結點程序書名稱取代程序書編號直接顯示在清單上，另外多本時是否應該用 … 來表示，而非完整呈現每一本在清單上？」
> **成因**：第 12 欄原為 `flex-wrap` ＋每連結一顆 pill，欄寬僅容一顆（等寬字編號約 110px）⇒ 一個連結換一行，5～6 個連結之列被拉伸成 5～6 行高。實測資料庫 591 筆分佈：0 個 586 筆／1 個 2 筆／2 個 1 筆／5 個 1 筆／6 個 1 筆。
> **裁決**（2026-08-18 人類核可）：① **不**採「以書名取代編號」——中文書名長度不定會再度拉伸，且編號才是對照／篩選之鍵值；維持「編號可見、書名 hover」。② 採「多筆摺疊」，但**不得**是純 `…`＋hover——這些 pill **是動作**（點擊＝下載該連結點程序書之 PDF），純 tooltip 會使被摺疊者無法點擊、鍵盤到不了、觸控看不到＝功能消失；故摺疊入口必須是**可點的 `+N` 按鈕**。
> **本 delta 之 AC 編號採 `AC-E#`**（E＝2026-08-18 ergonomics delta），與既有 `AC-S#`／`AC-D#` 區隔、不重號。

- **AC-E1**（三態與恆一行高）：Given 後台文件清單已載入, When 檢視第 12 欄「連結點程序書」之收合態, Then 該格**恆為一行高**（容器為單行 flex ＋ `whitespace-nowrap`，**不得**使用 `flex-wrap`），且依連結數呈現三態——**0 個**＝逐字 `—`（`<span class="text-slate-300">—</span>`，既有行為不變）／**1 個**＝單顆 pill 且**不出現** `+N` 徽章／**N ≥ 2**＝**只顯示第一顆 pill** ＋ 一顆 `+{N−1}` 徽章。Given 同頁存在 0／1／2／6 個連結之列, When 量測各列高度, Then 收合態各列高度**彼此相等**（連結數不影響列高）。
- **AC-E2**（pill 之可見文字與 tooltip）：Given 某連結之目標為 `{編號} {書名}`, When 呈現收合態之 pill, Then 其**可見文字恰為編號**（不含書名），其 `title` 逐字為 `下載連結點程序書：{編號} {書名}`（既有逐字字串不變）。
- **AC-E3**（`+N` 為真按鈕）：Given 某列有 N ≥ 2 個連結, When 呈現 `+{N−1}` 徽章, Then 其為 `<button>`（可 focus、可鍵盤 Enter／Space 觸發、可觸控），**非**僅具 hover tooltip 之 `<span>`；其 `title` 逐字為 `其餘 {N−1} 個：{編號}、{編號}…`（僅編號、以全形頓號分隔、順序同展開後第 2 列起），其 `aria-label` 逐字為 `展開其餘 {N−1} 個連結點程序書`，並帶 `aria-expanded="false"`。
- **AC-E4**（就地展開、非浮層）：Given 收合態之 `+N`, When 點擊（或以鍵盤觸發）, Then **該列就地展開**（in-place），該格改為逐列列出**全部 N 個**連結（含第一顆），每列逐字結構為 `編號 · 書名 · 下載鈕`；第一列尾端之「收合」鈕與 `+N` 為**同一顆 toggle**（`aria-expanded="true"`、`aria-label` 逐字 `收合連結點程序書`），再次觸發即回到收合態。<br>🔴 **不得**改以 popover／dropdown 浮層實作：表格外層為 `overflow-x-auto` ＋ `rounded-xl overflow-hidden`，絕對定位浮層會被裁切。
- **AC-E5**（展開狀態逐列獨立且不錯位）：Given 展開列 A, When 檢視同頁其他列, Then 其餘各列維持收合態之一行高（展開只影響被觸發的那一列），且**可同時展開多列**。Given 已展開列 A, When 改變任一篩選、清除全部篩選或換頁而重繪清單, Then 展開狀態**不得**落到其他列上——狀態鍵須為**列身分**（prototype 為文件編號 `d.num`、實作為 `documentId`），**不得**為列索引。
- **AC-E6**（篩選命中者排第一顆）：Given `連結點程序書` 篩選已選定某目標文件、某列因擁有指向該目標之連結而入選, When 呈現該列收合態, Then **命中的那一筆排為第一顆**（＝收合態唯一可見的那顆），其餘依原順序接續於 `+N` 之內。<br>🔒 本條**只改顯示順序**：`連結點程序書` 篩選之**比對語意本身完全不變**（既有 `linkTargetId` 語意，見 `AC-D2` 第 9 列）。
- **AC-E7**（下載路徑不變）：Given 收合態之 pill 或展開態任一列之下載鈕, When 點擊, Then 一律走**既有受控（稽核）下載路徑**——取目標文件之附件清單 → 取其 `ICSOP_PDF` → 同一支代理串流下載端點（[F020](F020-watermark.md#front-burn-scope-delta) `AC-D3a` 後台側；⚠ **2026-08-20 起該端點亦燒錄浮水印**，見 [F020 §backend-burn-delta](F020-watermark.md#backend-burn-delta) `AC-N14`）〔📝 本連結原誤指不存在之 `F020-watermark-viewer.md`，2026-08-20 順手更正，語意未變〕；**不得**新增第二條下載路徑，浮水印與否仍由伺服器端決定、前端不帶旗標。目標文件無 ICSOP PDF／取用失敗時，以既有錯誤提示（toast）呈現且不崩潰。
- **AC-E8**（DOM 契約；供約束環定位，權威＝prototype）：Given 第 12 欄渲染完成, When 檢視 DOM, Then 下列屬性逐字成立——收合態／展開態之容器帶 `data-link-cell`、`data-link-count="{N}"`、`data-link-expanded="false|true"`；toggle 鈕帶 `data-link-toggle="{列身分鍵}"`；展開態每一連結列帶 `data-link-item`。<br>📌 **本條之存在理由**：同 `AC-D10`——本輪約束環為簡化版（僅 vitest／jest，Playwright 僅驗表頭），未入 AC 之選擇器只能由 test-generator 臆造，測出來之物會與畫面對不上。
- **AC-E9**（🔒 回歸鎖定）：Given 本 delta 實作完成, When 檢視清單, Then **14 欄之欄位集合與由左至右順序不變**、**第 12 欄以外之 13 欄顯示規則逐項不變**、3 張統計卡／13 項篩選（含各項比對語意）／排序／分頁行為一律不變；既有 AC 與 `AC-S1`／`AC-S2`／`AC-D1`～`AC-D10` 除 `AC-D9` 就「第 12 欄顯示規則」一項之範圍外，全數維持綠燈。<br>📝 **2026-08-20 範圍縮減**：本條之「14 欄之欄位集合與由左至右順序不變」自該日起同 `AC-D9` 改讀為「**既有 14 欄**之集合與其**相對**順序不變」——最左新增之「OJT」圖示欄不視為違反（`OQ-D9-25` 選項 A，權威＝`AC-N37`～`AC-N40`）。

### OJT 圖示欄 delta（🔵 2026-08-20 使用者裁決；缺失／變更 delta 第 9 項） {#ojt-icon-column-delta}

> 前提裁決（逐題紀錄見 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）：
> **`OQ-D9-25`→選項 A**（清單**新增獨立欄**置於最左；表格已有 `overflow-x-auto` 可吸收欄寬）〔lead 預設〕｜
> **`OQ-D9-26`→選項 A**（沿用既有 OJT 篩選下拉之字面 `有 OJT`／`無 OJT` 作為 `title`／`aria-label`，圖示以兩種視覺狀態呈現）〔lead 預設〕。
>
> 📌 **純前端顯示變更**：資料已就緒（`hasOjt`），**不新增後端欄位、不新增查詢、不改變任何 API 契約**。
> 📌 **逐字文案與 DOM 掛鉤由 spec-writer 定稿，ui-ux-designer 逐字照抄**（比照 [F018](F018-usage-form-management.md#edit-number-action) 之既有慣例；本輪為簡化版約束環＝僅 jest／vitest，未入 AC 之選擇器 test-generator 只能臆造）。

- **AC-N37**（欄位存在與位置）：Given 後台 ICSOP 文件清單頁載入完成, When 檢視表頭, Then **第 1 個 `<th>`（最左）之可見文字逐字為 `OJT`**，其後接續之 14 個表頭依序為 `制定公司`／`制定部門`／`制定室別`／`當責室長`／`狀態`／`檔案`／`樹狀圖`／`程序書編號`／`程序書書名`／`版次`／`內容摘要`／`連結點程序書`／`公告日期`／`循環別`（＝既有 14 欄，順序不變）；表頭總數為 **15**。
- **AC-N38**（🔴 三態渲染與逐字無障礙文案）：Given 同頁存在三列文件，其 `hasOjt` 分別為 `true`、`false` 與**缺鍵**（`undefined`）, When 渲染各列之 OJT 儲存格, Then——
  - ① `hasOjt === true` → 圖示 icon 鍵為 **`file-check-2`**，其 `title` 與 `aria-label` **皆逐字為 `有 OJT`**；
  - ② `hasOjt === false` → 圖示 icon 鍵為 **`file-x-2`**，其 `title` 與 `aria-label` **皆逐字為 `無 OJT`**；
  - ③ `hasOjt === undefined`（後端未回該鍵）→ **視同 `false`**，渲染與 ② **完全相同**（`file-x-2` ＋ `無 OJT`）——見 `documents.store.ts:135-138` 之既有註解（缺鍵＝無 OJT）；**不得**渲染為空白、`—`、`null` 或第三種視覺狀態。
  - 📌 **兩態之字面值刻意逐字沿用既有 OJT 篩選下拉之選項文字**（`AC-D2` 第 12 列與 `AC-D5` 之 `有 OJT`／`無 OJT`），使畫面上「篩選出來的東西」與「欄位顯示的東西」用同一組詞；**不得**另造 `已上傳`／`未上傳` 之類新詞。
  - 📌 **兩態之視覺區別（顏色／填色）屬設計裁量、不入 AC**；本條只約束「icon 鍵不同 ＋ 無障礙名稱不同」此二可觀測事實。
  - 📌 **2026-08-20 第三輪明文歸類（來源＝`docs/ui-ux-design-overview.md` §A.6.7）**：ui-ux-designer 為容納本欄而調整之**欄寬數值**——OJT 欄 `min-w-[56px]`、檔案欄 `min-w-[160px]`、表格 `min-w-[1560px]` → **`min-w-[1724px]`**——**經 spec-writer 判定為設計裁量，刻意不入 AC**。<br>**理由**：① 它們是**版面調校數值**而非行為契約，與本節既有之「顏色／填色不入 AC」同類；② 若入 AC，任何一次欄寬微調都會使測試轉紅，而該轉紅**不指向任何缺陷**（高噪訊比之脆弱斷言）；③ 真正需要保護的性質是「新增欄不得造成橫向截斷」，而該性質已由 `OQ-D9-25` 之前提裁決（表格已有 `overflow-x-auto` 可吸收欄寬）與 `AC-N40` 之欄位集合鎖定共同涵蓋。<br>⚠ **本註記之目的是讓「不入 AC」成為一個有紀錄的決定**，而非讓該項目在 §A.6.7 與規格之間靜默消失。
- **AC-N39**（DOM 契約；供約束環定位，權威＝`prototypes/13-document-list.html`）：Given 第 1 欄渲染完成, When 檢視 DOM, Then 下列屬性**逐字成立**——該儲存格帶 `data-ojt-cell`，並帶 `data-has-ojt="true"`（`hasOjt === true`）或 `data-has-ojt="false"`（`false` 與 `undefined` 兩種輸入**皆為 `"false"`**）。<br>📌 **本條之存在理由**：同 `AC-D10`／`AC-E8`——本輪約束環為簡化版（僅 vitest／jest），未入 AC 之選擇器只能由 test-generator 臆造，測出來之物會與畫面對不上。
- **AC-N40**（🔒 回歸鎖定）：Given 本 delta 實作完成, When 檢視清單, Then ① **既有 14 欄之欄位集合、相對順序與各欄顯示規則逐項不變**（新增欄位僅插入於最左，`AC-D9`／`AC-E9` 之範圍已就地縮減）；② **13 項篩選之組成、順序與各項比對語意逐字不變**——特別是既有「OJT」篩選下拉（`AC-D2` 第 12 列、`AC-D5`、`AC-D10` 之三選項 `全部`／`有 OJT`／`無 OJT`）**一字不動**，本 delta **只加顯示欄、不動篩選**；③ 3 張統計卡／排序／分頁行為不變；④ 既有 AC 與 `AC-S1`／`AC-S2`／`AC-D1`～`AC-D10`／`AC-E1`～`AC-E9` 全數維持綠燈（除 `AC-D9`／`AC-E9` 就「欄位集合」一項之已宣告範圍縮減外）。<br>⚠ **不得新增任何後端查詢**：`hasOjt` 於既有批次查詢中已取得（`documents.store.ts:135-142`），本 delta 若引入第 4 次查詢或 N+1，即違反 [NFR-001](../nfr.md#performance) 與 `AC-D9` 之既有效能前提。
### 節點子樹篩選（deep link）delta（🔴 2026-08-21 使用者裁決；三項裁決第 3 項） {#subtree-filter-delta}

> **裁決逐字（人類，2026-08-21）**：[F036](F036-lifecycle-tree-preview.md) 之子樹抽屜新增導向鈕，導向 `/admin/documents?lifecycleId=..&nodeSubtreeId=..`，**後端新增子樹篩選參數**；本頁以**可清除的 chip** 呈現。
> **本 delta 之 AC 編號採 `AC-T#`**（T ＝ 2026-08-21 三項裁決；**跨三檔不重號**——`AC-T1`～`AC-T5` 屬 [F020](F020-watermark.md#line-height-delta)，`AC-T10`～`AC-T27` 屬 [F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta)，`AC-T40`～`AC-T48` 屬本檔）。
> **權威＝ `docs/ui-ux-design-overview.md` §A.7.2／§A.7.3 ＋ `prototypes/13-document-list.html`**（已由 ui-ux-designer 傳播並經 lead 逐項驗收）。
> 🔒 **子樹為第 14 個篩選來源，但不進那 13 項**：`AC-D1`（13 項之組成與順序）／`AC-D2`（比對語意表）／`AC-D10`（篩選區文案與選擇器）／`AC-D9` ／`AC-N40` ② **逐字續為有效，本 delta 一字未動**——子樹以**獨立 chip** 承載，不新增第 14 個篩選控制項。
> 🔴 **本 delta 就地擴充 `AC-D8`**（清除全部篩選須連 chip 一起清），見該條。
> ⚠ **本輪之約束環為簡化版（僅 vitest／jest 單元＋元件測試，無 Playwright fidelity、無 e2e）**：以下每條 AC 皆須能於 jsdom／jest 斷死。

#### 後端：`nodeSubtreeId` 篩選參數

- **AC-T40**（參數語意）：Given `GET /admin/documents` 之查詢字串同時帶 `lifecycleId` 與 `nodeSubtreeId`（兩者皆能解析，見 `AC-T41`）, When 後端執行查詢, Then 僅回傳**同時滿足**下列兩條件之文件——① 其所屬循環 ＝ 該 `lifecycleId`；② 其**掛載節點 ∈ 以 `nodeSubtreeId` 為根之子樹**（該節點本身 ＋ 沿 parent→child 方向可達之全部後代，與 [F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta) `AC-T14` 之 `descendants` **同語意**）。
  1. **未指派節點者（掛載節點為 `null`）一律排除**——它不屬於任何節點，自然不屬於任何子樹。📌 **實作上由 SQL `IN` 對 `NULL` 恆不匹配之語意自動滿足**，**不需**額外 `AND nodeId IS NOT NULL`（`architecture-spec.md` §12.3）；但**測試仍須存在**（以「有一筆未指派節點之文件」之 fixture 斷言其不出現）——這條的綠燈來自 SQL 語意而非防呆碼，正因如此更需要一條斷言把它釘住。
  2. 與既有 13 項篩選、關鍵字之關係為 **AND**（本條件僅縮小結果集，不放寬）。
  3. 套用後**分頁回第 1 頁**；3 張統計卡之數字依**篩選後**結果集衍生（既有規則不變）。
  4. 🔴 **子樹走訪之歸屬與落點（2026-08-21 就地補完；`architecture-spec.md` §12.1 決策 C1 ＋ §12.3 決策 C3）**：走訪使用**後端那一份** `descendants(edges, startId)`（`backend/src/lifecycle/lifecycle-tree-layout.ts`），其語意由 [F036 `AC-T28`](F036-lifecycle-tree-preview.md#subtree-drawer-delta) 之 F1–F5 固定向量釘死；解析結果以**已展開之節點 id 陣列**（`DocumentListFilters.nodeIdIn`，選填）下推為單一 SQL `IN` 條件。⚠ **store 不知道、也不需要知道這是「子樹」**——對它而言只是又一個 id 清單篩選（比照既有 `linkTargetId` 樣板）；圖走訪屬 service 層職責，**不得**混入 store。
  5. 🔴 **篩選條件與 `AC-T45` 之描述子必須來自同一次解析呼叫**：同一個解析函式回傳「`nodeIds` ＋ 描述子」或 `null`；成功 ⇒ 兩者同時設定，失敗 ⇒ 兩者同時不設定。**不得**存在兩條各自判斷「這個 `nodeSubtreeId` 解析得出來嗎」的路徑。<br>**斷言形狀**：對解析成功之案例，斷言「結果集已縮小」**且** `subtreeFilter !== null`；對 `AC-T41` 四種失敗案例，斷言「結果集等同未帶參數」**且** `subtreeFilter === null`——**兩件事必須寫在同一個案例裡**，分開寫就驗不到「篩選生效但描述子算錯」這一類分岔。
  <br>🔴 **禁止斷言「兩頁筆數相等」**：`prototypes/22` 與 `prototypes/13` 是**兩份獨立 mock 語料**，本輪刻意不對齊（`docs/ui-ux-design-overview.md` §A.7.6 ②：`lc1`／`a1` 之子樹在 `22` 為 8 份、跳到 `13` 只有 4 筆）。**AC 只鎖篩選語意**（同 `lifecycleId` 且掛載節點 ∈ 子樹）；斷言具體筆數相等鎖的是 mock 資料而非行為。**測試請以自備 fixture 驗語意**（例：子樹外之文件不出現、子樹內之文件全部出現、未指派節點者不出現）。
- **AC-T41**（🔴 兩參數恆成對；殘缺或無法解析 ⇒ **靜默 no-op**）：Given 下列任一情形——① 只帶 `lifecycleId`；② 只帶 `nodeSubtreeId`；③ `lifecycleId` 不存在／查無此循環；④ `nodeSubtreeId` 不屬於該 `lifecycleId` 之節點集合——, When 請求送出, Then **完全不施加子樹篩選**（回應等同於未帶該兩參數之請求）、**不回錯誤**（HTTP 仍為 `200`，**非** `400`／`404`）、且前端**不顯示 chip**。
  <br>📌 **理由（設計裁量，本條明文鎖定）**：deep link 是機器產生的；殘缺參數只可能來自手改網址或過期連結，對使用者跳錯誤訊息沒有意義。
  <br>⚠ **no-op ≠ 回 0 筆**：情形 ③④ 之期望是**回傳未篩選之完整清單**，不是空結果。此為最容易寫反的一條，請對四種情形**各建一個案例**，且每個案例**同時**斷言 `subtreeFilter === null`（`AC-T40` ⑤）。
  <br>🔒 `nodeSubtreeId` **不影響權限**：本頁既有之角色可視範圍（[F025](F025-role-function-matrix.md)「ICSOP 文件管理」）逐字不變；子樹篩選只縮小結果集，**不得**成為看見原本看不見之文件的途徑。
- **AC-T42**（🔒 `lifecycleId` 不寫入既有「循環別」篩選）：Given 帶兩參數進入本頁, When 檢視第 13 項篩選「循環別」之控制項, Then 其值**仍為未選取（`全部`）**，`AC-D10` 之 combobox 契約逐字不變。
  <br>📌 **理由**：若把 `lifecycleId` 灌進「循環別」，清 chip 時就得決定要不要連帶清掉使用者自己選的循環別——兩個來源會糾纏。**兩者互不寫入**，`AC-T46` 之方向性不對稱才成立。
- **AC-T43**（🔴 子樹解析為**後端**職責；前端不得自行走訪）：Given 前端取得兩個 URL 參數, When 發出清單請求, Then 前端**原樣**把兩參數帶上（`GET /admin/documents?lifecycleId=…&nodeSubtreeId=…&page=1`），**不得**於前端展開子樹。
  <br>🔴 **前端不得存在任何 DAG 鏡像表或子樹走訪**（`prototypes/13` 之 `NODE_DAG` 為**原型專用**，已於該檔明文標註「實作不得移植」）：前端若自己走訪一次，就會出現與 [F036](F036-lifecycle-tree-preview.md#subtree-drawer-delta) `AC-T14` **同型的分家**——樹狀圖說 7 個節點、清單按 6 個節點篩。**斷言形狀**：前端送出之請求參數逐字相符（`fetch`／API client 之 spy），且前端模組**不匯出**任何子樹走訪函式。<br>⚠ **本條與 [F036 `AC-T14`](F036-lifecycle-tree-preview.md#subtree-drawer-delta) ① 之修訂不衝突**：`AC-T14` ① 之「不得存在第二份」限**單一執行環境內**，後端依決策 C1 另有一份 `descendants()`（供本檔 `AC-T40` ④ 之篩選與 F036 之子樹端點**兩個呼叫端共用**）。**本條禁止的是「前端」再走訪一次**——前端唯一持有的子樹語意是醒目標示用的 `descendants()`，它**不得**被用來決定要送什麼參數或過濾清單結果。

#### 前端：chip 之呈現與清除

- **AC-T44**（chip 之逐字文案與選擇器契約；權威＝§A.7.2／§A.7.3）：Given 兩參數已由後端成功解析, When 本頁渲染完成, Then 下列**逐字成立**——
  | 掛鉤 | 逐字值／語意 |
  |---|---|
  | `#subtreeChipBar` | chip 列容器，位於篩選區與清單之間 |
  | `[data-subtree-chip]` | chip 本體（pill），**恰 1 個** |
  | `[data-subtree-chip-text]` | 逐字 `循環：{循環顯示名稱} · 節點子樹：{節點名稱}`（`循環：` 後**無空白**；`·` 兩側**各一個半形空格**）。🔴 **兩個代入值分別取自回應之 `subtreeFilter.lifecycleName` 與 `subtreeFilter.nodeName`**（`AC-T45`）——`lifecycleName` 之值即 `lifecycleDisplayName()` 之輸出，含子分類時為 `名稱（子分類）`（[F040](F040-lifecycle-subcategory.md) `AC-S1` 不變）；前端**不得**自行組字或另行查名 |
  | `nodeName` 為 `null` 時之 `{節點名稱}` | **`[ASSUMPTION]`** 逐字代入 `未命名節點`（沿用本專案既有慣例——`LifecycleTreePreviewPage` 之節點 `aria-label` 已為 `節點 ${n.name ?? '未命名節點'}`）。⚠ **此文案未經人類裁決**，見 [OQ-T3-08](../open-questions.md#t3-2026-08-21) |
  | `[data-subtree-chip-clear]` | chip 之 ✕ 清除鈕，`<button type="button">`，`aria-label` ＝ `title` ＝ 逐字 `清除節點子樹篩選` |

  🔴 **未套用時 chip 之整段內容不得存在於 DOM**：`queryBy` `[data-subtree-chip]` 為 `null`（**不得**以 `hidden` class／`display:none` 保留 chip 本體）。理由與 [F036 `AC-T18`](F036-lifecycle-tree-preview.md#subtree-drawer-delta) 相同——jsdom 不做版面計算，以 CSS 隱藏保留會讓「查無」與「隱藏」無法區分。
  <br>📝 **原型以 `#subtreeChipBar` 之 `hidden`／`flex` class 切換為靜態 HTML 之等價手段**（`prototypes/13:234, 460-461`）；**實作端採條件渲染**，此為兩種載體之必然差異，非文案或行為差異。
  <br>⚠ **chip 右側之說明文字 `由循環樹狀圖預覽帶入` 為設計裁量、刻意不入 AC**（純輔助說明，非行為載體；ui-ux-designer 已於 §A.7.2 第 12 列自行標明）。
- **AC-T45**（🔴 chip 之顯示與其內容以**後端解析結果**為準）：Given 前端無法自行解析子樹（`AC-T43`）, When 決定是否顯示 chip 及其文案中之 `{循環顯示名稱}`／`{節點名稱}`, Then 兩者皆取自**後端於清單回應中回傳之子樹描述子**；描述子為 `null`／缺席時 **chip 不渲染**（即 `AC-T41` 之 no-op 於畫面上的呈現）。
  <br>🔴 **描述子之具體契約（2026-08-21 就地補完；權威＝`architecture-spec.md` §12.3 決策 C3，`OQ-T3-04` 已結案）**——📝 本條前一版為「欄位名、巢狀位置＝system-architect 定，本 AC 只鎖來源與不渲染兩件事」，該留白已由 C3 填實：

  | 項目 | 契約 |
  |---|---|
  | 落點 | `GET /admin/documents` 回應之**頂層**（既有 `{items, total, page, pageSize, hasNext}` 之第 6 個欄位，**additive**） |
  | 欄位 | `subtreeFilter: { lifecycleId: string; lifecycleName: string; nodeId: string; nodeName: string \| null } \| null` |
  | 🔴 顯式 key | **恆為顯式 key，不省略**——不適用時值為 `null`。⚠ 前端仍須對「`null`」與「缺席」**兩種情形一視同仁**防禦性判斷（`AC-T41` 之 no-op 於畫面上即「chip 不渲染」） |
  | 🔴 `lifecycleName` 之值 | **`lifecycleDisplayName()` 之輸出**（含子分類格式 `名稱（子分類）`，[F040](F040-lifecycle-subcategory.md) `AC-S1`），**非** `LIFECYCLE.name` 原始值。斷言請以「有子分類之循環」建案例，期望值為 `名稱（子分類）` |
  | 🔴 欄位名為何不叫 `lifecycleDisplayName` | 既有 `DocumentListItem.lifecycleName` **已是同一概念之命名先例**（其值即 `lifecycleDisplayName()` 之輸出）；同一份回應內若一個叫 `lifecycleName`、另一個語意相同的叫 `lifecycleDisplayName`，會製造「這兩個名字所指是否不同」之無謂疑惑。**一致性優先於字面精確性**（§12.3） |
  | `nodeName` 之 `null` | 如實延續既有 `NodeInfo.name` 之 `string \| null` 型別；`null` 時 chip 文案之 `{節點名稱}` 呈現規則見 [OQ-T3-08](../open-questions.md#t3-2026-08-21)（**未命名節點**之逐字文案未經裁決，本輪標為 `[ASSUMPTION]`） |

  <br>🔴 **`subtreeFilter` 與篩選條件必須來自同一次解析**（見 `AC-T40` ④）：這是防止「篩選生效但描述子算錯」或「描述子有值但篩選沒施加」兩種分岔的關鍵——**不得**有兩條各自判斷「這個 `nodeSubtreeId` 到底解析得出來嗎」的路徑。
  <br>📌 **為何不讓前端自行查名稱**：另外呼叫循環／節點端點取名稱，等於製造第二個「這個 nodeId 到底屬不屬於這個循環」的判斷點——與 `AC-T43` 同一個分家風險。
- **AC-T46**（🔴 **清除之方向性不對稱**——兩個方向必須各建一案）：Given 已套用子樹 chip **且**使用者另外自行選了任一項既有篩選（如 `狀態 = 已公告`）, When——
  1. 點擊 `[data-subtree-chip-clear]`（chip 之 ✕）, Then **只清 chip**：chip 自 DOM 消失、網址上之 `lifecycleId`／`nodeSubtreeId` 兩參數被移除、**使用者自選之 `狀態 = 已公告` 仍然生效且其控制項仍顯示該值**；分頁回第 1 頁。
  2. 點擊「清除全部篩選」, Then **13 項篩選、關鍵字與 chip 三者同時清空**（`AC-D8` 已就地擴充），網址參數亦一併移除。
  <br>🔴 **不對稱是刻意的，不是遺漏**：chip 是「使用者從樹狀圖帶進來的一個外部條件」，清掉它不該連帶丟棄使用者在本頁自己下的功夫；而「清除全部篩選」四個字若留下一條仍在縮小結果集的 chip，畫面與按鈕字面自相矛盾。**兩個方向若只測一個，反向錯誤不會被發現。**
- **AC-T47**（chip 納入「已套用篩選」之判定）：Given 僅套用子樹 chip、13 項篩選與關鍵字皆為空, When 檢視頁面, Then 「清除全部篩選」按鈕**可見**（`AC-D10` 之逐字 `清除全部篩選` 不變），行動版之篩選紅點亦顯示。
  <br>📌 **`OJT` 之預設值 `全部` 仍不計入該判定**（既有規則不變）。
- **AC-T48**（🔒 回歸鎖定）：Given 本 delta 實作完成, When 檢視清單, Then ① **15 欄之欄位集合與由左至右順序逐字不變**（`AC-D9`／`AC-E9`／`AC-N40` ①）；② **13 項篩選之組成、順序與比對語意逐字不變**（`AC-D1`／`AC-D2`／`AC-N40` ②）；③ 篩選區之文案與選擇器契約（`AC-D10`）逐字不變；④ 3 張統計卡、排序、分頁、空狀態 `查無符合結果` 之行為不變；⑤ 未帶兩參數時，本頁之呈現與行為與本 delta 導入前**完全相同**（含首屏**不得**先閃一次未篩選之完整清單——子樹狀態須於首次渲染前決定）；⑥ 🔴 **回應形狀之既有五個頂層欄位 `items`／`total`／`page`／`pageSize`／`hasNext` 逐字不變**——`subtreeFilter` 為 **additive 第 6 欄**，既有消費者忽略未知欄位即可（本專案前端以具名欄位存取，非嚴格 schema 驗證）。**不得**把 `subtreeFilter` 塞進 `items` 之元素或改動任何既有欄位之型別。

## Error Scenarios
- 空結果/搜尋跳脫：見 [error-handling.md#public](../error-handling.md#public)。分頁效能見 [NFR-001](../nfr.md#performance)。
- **子樹參數殘缺／無法解析**：**不視為錯誤**——靜默 no-op、HTTP `200`、不顯示 chip（`AC-T41`）；不寫任何稽核、不產生錯誤碼。

## Related
- Data: [ICSOP_DOCUMENT（19 欄位）](../data-model.md#document-entity)
- Depends on: [F010](F010-create-document.md), [F012](F012-document-status-toggle.md)（狀態衍生）, [F014](F014-accountable-dept-chief.md)（制定組織/當責室長）, [F016](F016-pdf-ojt-attachment.md)（檔案下載）
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（`lifecycleDisplayName` 顯示規則、篩選值＝`lifecycleId`）
- Related: 樹狀圖預覽（第二入口）見 [F036](F036-lifecycle-tree-preview.md)；DAG 資料見 [F008](F008-dag-node-edge.md)/[F009](F009-node-drawer-maintenance.md)；連結點見 [F015](F015-document-cross-link.md)
- **2026-08-21 使用者裁決（三項裁決第 3 項）**: 節點子樹 deep link 篩選（`AC-T40`～`AC-T48`）。上游＝[F036 子樹抽屜之導向鈕](F036-lifecycle-tree-preview.md#subtree-drawer-delta)；傳播紀錄＝`docs/ui-ux-design-overview.md` §A.7。<br>✅ **system-architect 已定案（2026-08-21，`architecture-spec.md` 第 12 章 C1／C3）**：① 子樹走訪＝後端 `descendants()`（`backend/src/lifecycle/lifecycle-tree-layout.ts`，**非**遞迴 CTE——純記憶體圖走訪，語意由 [F036 `AC-T28`](F036-lifecycle-tree-preview.md#subtree-drawer-delta) 之 F1–F5 向量釘死），解析置於 **service 層**、以 `DocumentListFilters.nodeIdIn`（選填）下推為單一 SQL `IN`，**store 不承擔圖走訪**；② 描述子契約＝頂層 `subtreeFilter`（`AC-T45` 已補完）；③ 下推順序與 `linkTargetId` 之既有樣板同構，未新增效能顧慮。
- 對比前台: [F019](F019-public-list-browsing.md)（後台不套用部門置頂；**「當責室長」比對語意兩處必須一致，見 `AC-D7`**）
- **2026-08-20 使用者裁決（D9 delta）**: `OQ-D9-25`（新增獨立欄置於最左）／`OQ-D9-26`（沿用 `有 OJT`／`無 OJT` 字面）。見 [§OJT 圖示欄 delta](#ojt-icon-column-delta)。**⚠ 待 ui-ux-designer**：`prototypes/13-document-list.html` 表頭最左新增 `OJT` 欄並依 `AC-N38`／`AC-N39` 逐字實作兩態圖示與 DOM 掛鉤。
- **2026-08-16 使用者裁決**: OQ-D18-08／10／11／12／13（見 [§篩選 9 → 13 項 delta](#filter-13-delta)）。新增篩選之資料來源：[F039](F039-appendix-management.md)（附錄）、[F018](F018-usage-form-management.md)（使用表單，含 `formNumber` 顯示字串）、[F016](F016-pdf-ojt-attachment.md)（OJT）。
- **待 system-architect（本 delta 新增）**：① 13 項篩選之後端下推策略（現況為前端於完整工作集上客端篩選＋`linkTargetId` 例外查詢；新增之附錄／使用表單／OJT／日期區間是否一併下推至 SQL，關乎 [NFR-001](../nfr.md#performance)）；② 「當責室長」主要∪次要之 `DOC_SECONDARY_CHIEF` join 策略（須與 [F019](F019-public-list-browsing.md) `AC-D7` 共用同一實作）；③ 篩選選項來源端點（後台無可見性過濾義務，與前台 [F019](F019-public-list-browsing.md) `AC-D5` 之端點是否共用）。
