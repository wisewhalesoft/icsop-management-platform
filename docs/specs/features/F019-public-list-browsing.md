# F019: 前台清單瀏覽（排序/搜尋/篩選）
Priority: P0-MVP | Status: 部分（unit 綠；**`DOC_USING_DEPT` 讀取端已接線**（public-seams：分離查詢＋JS 分組，置頂/部門篩選端到端可用）；**置頂語意定案改為子樹祖先鏈**（取代 OQ-F019-03 精確比對暫定假設）；前台頁首/置頂標題已補使用者部門路徑；int 已備未跑（test/int/public-documents.itest.ts）。見 implementation-logs/public-seams-impl.md）｜**業務/功能類別瀏覽模式 delta：🟢 APPROVED（2026-09-02 人類閘門通過）（`AC-B12`～`AC-B27`；前台拆為兩種瀏覽模式、預設樹狀圖；權威＝[F043](F043-business-function-category.md)）** | Last Updated: 2026-09-02
Epic/Story: E06 / US-050, US-051, US-052

> 合併理由：排序（US-050）、關鍵字搜尋（US-051）、篩選（US-052）為同一前台清單畫面之組合行為，合為單一 feature。排序管線見 [F019-public-list-sorting.mmd](../diagrams/F019-public-list-sorting.mmd)。
> **2026-08-07 additive delta（🟢 APPROVED（2026-08-07 人類閘門通過））**：「循環」篩選與循環別顯示須反映循環子分類。規則權威＝[F040](F040-lifecycle-subcategory.md)；排序、置頂、可見性與既有條款皆不變。
> **🟢 2026-08-11 restrictive delta（APPROVED，人類閘門通過）**：「業務」子分類之一般使用者，其可見範圍限縮於「使用部門相符」之已公告文件；並於清單頂部改以專屬說明句告知其瀏覽範圍（AC-U7）；**詳情頁 404 畫面之前端呈現另於 2026-08-11 補訂為 AC-U8**（原 delta 只規範後端回應、未規範畫面，見 [F041 §F2](F041-user-subtype-business-scope.md#f2-fidelity-gap)）。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**（U＝user subtype），與 F040 之 `AC-S#` 批次區隔。⚠ 此為本 feature **首次出現「限縮既有可見範圍」之 delta**（既往 delta 皆為 additive），對「其他」子分類與其餘 4 種角色**行為完全不變**（AC-U5 回歸鎖定）。
> **🔴 2026-08-16 CHANGE delta（使用者裁決，缺失／變更 delta 第 2／3／4 項）——前台篩選器與顯示欄位改版**：① 移除「使用部門」**篩選器**；新增 制定公司／制定部門／制定室別／當責室長 四項並將既有「循環別」一併改為**可搜尋下拉**；② 清單卡顯示欄位改為 程序書編號／程序書書名／內容摘要／文件狀態／制定公司／制定部門／制定室別／版次／公告日期（**移除 使用部門、循環別**）；③ 文件詳情頁移除「文件使用部門」欄。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta），與既有 `AC-S#`／`AC-U#` 批次區隔、不重號。
> **🔴 2026-08-27 CHANGE delta（使用者裁決）——前台瀏覽三項 UX 修正**：① 清單頂部之**範圍說明列整條移除**（含業務子分類專屬句；推翻 `AC-U7` 與 [F041](F041-user-subtype-business-scope.md) `AC-40`）；② 六項篩選之**字級拉齊**（`狀態` 與其餘五項可搜尋下拉原為兩種字級）；③ **內容摘要改為程序書書名之副標題**（移出 `<dl>`、移除「內容摘要：」標籤，欄位標籤集合九項→八項）。**本 delta 之 AC 編號採 `AC-Y#`**（Y＝2026-08-27 前台瀏覽 UX delta），與既有 `AC-S#`／`AC-U#`／`AC-D#`／`AC-N#` 批次區隔、不重號。逐條見 [§2026-08-27 前台瀏覽 UX delta](#ux-20260827-public-delta)。
> ⚠ **本 delta 只動呈現，不動判定**（`AC-Y2`）：業務子分類之可見範圍限縮、置頂判定、空狀態文案「查無符合結果」**逐字不變**——移除的是「告訴使用者範圍受限」的那句話，不是「範圍受限」這件事。
> ⚠ **本 delta 僅移除 UI 顯示與篩選（OQ-D18-05 裁決）**：`isWithinSubtree`／`isDocVisibleToViewer`／`isUsingDeptMatched` 三純函式之**簽章與語意一律不變**、`DOC_USING_DEPT` 表不動、[F041](F041-user-subtype-business-scope.md) 業務子分類可見性過濾與本檔置頂排序（Main Flow 2–3）之後端邏輯**完全不變**（`AC-D11`／`AC-D13` 回歸鎖定）。**「不顯示 ≠ 不判定」**。

## Description
前台 RWD 清單以固定邏輯排序：文件使用部門與登入使用者所屬部門相符者「置頂」，其餘依 ICSOP 文件編號「降冪」。**一般使用者僅可見「已公告」文件（＝儲存狀態＝有效 且 公告日期 ≤ 今日；「進度中」＝有效但公告日期未到，與 失效/作廢，一律由後端過濾隱藏，定案）。** 「已公告」為顯示/可見衍生，**儲存狀態欄位仍為 有效/失效/作廢**（不新增儲存狀態值）。提供關鍵字搜尋（文件編號＋文件名稱）與篩選；搜尋與篩選以 AND 組合。排序/搜尋/篩選皆於後端實作（分頁一致）。

**篩選器組成（2026-08-16 使用者裁決改版）**：制定公司／制定部門／制定室別／當責室長／狀態／循環別，共 6 項；其中 **制定公司／制定部門／制定室別／當責室長／循環別 五項為可搜尋下拉（combobox）**、「狀態」維持既有原生下拉。<br>
📝 **2026-08-16 使用者裁決推翻，理由：使用者明確要求「移除使用部門的篩選條件」**——原條文為「與部門/狀態/循環三種篩選；部門篩選以『使用部門』比對，**可選任意層級（本部／部／處室／課），判定時自動展開子樹**」。**「使用部門」篩選器自本日起不存在於前台**；其子樹展開判定式**未被移除、亦未被修改**，僅改由置頂排序（Main Flow 2–3）與 [F041](F041-user-subtype-business-scope.md) 可見性過濾兩處消費（見下節）。

## 使用部門之子樹展開（契約 §9，定案 2026-07-20；2026-08-16 適用範圍收斂）

> 📝 **2026-08-16 使用者裁決推翻，理由：前台「使用部門」篩選器已移除（缺失 delta 第 2 項）**。
> 本節原為「**部門篩選**之層級與子樹展開」之權威。篩選器移除後，本節之規則**逐字仍然有效**，
> 但其**消費點收斂為兩處**：① 置頂排序（Main Flow 2–3，`isPinned`）；② [F041](F041-user-subtype-business-scope.md) 業務子分類可見性過濾（`isDocVisibleToViewer`）。
> 表中「選定單位」一欄之語意由「使用者於前台下拉選定之篩選單位」改為「文件之使用部門設定值」。
> **判定式 `isWithinSubtree` 之簽章、語意與既有測試（`TS-PS-ORG-001`～`006`）一律不變**（AC-D13）。

- 部門篩選下拉呈現完整 **5 層**組織樹（本部＞部＞處/室＞課），使用者可選擇**任一層級**之單位。
- **判定時自動展開子樹**：選定「營運管理部」(`JA000`) 時，其底下所有處/室/課之使用部門皆視為相符。
- **實作方式＝代碼前綴比對**（部門代碼為前綴編碼，見契約 §3.5）：有效前綴 ＝ 去除代碼尾端連續 `0` 後之字串，查詢條件為 `orgCode LIKE '<有效前綴>%'`。**不需 closure table、不需遞迴 CTE**。

| 選定單位 | 代碼 | 有效前綴 | 查詢條件 |
|---|---|---|---|
| 營業二本部 | `J0000` | `J` | `orgCode LIKE 'J%'` |
| 營運管理部 | `JA000` | `JA` | `orgCode LIKE 'JA%'` |
| 營管部/審查室 | `JAC00` | `JAC` | `orgCode LIKE 'JAC%'` |
| 消費/商品北一/一課 | `JCHA0` | `JCHA` | `orgCode LIKE 'JCHA%'` |

- Root（`00000`）之有效前綴為空字串，代表全域，不施加部門限制。
- `ORG_UNIT.orgCode` 須建立索引；前綴比對為 index-seek 友善。

## Preconditions
- 使用者已登入（F001/F002）；組織資料已同步（F004）提供使用者部門。
- 文件資料來源為 F017 / F010。

## Main Flow
1. 開啟前台清單 → 後端強制基底條件 `status = 有效 AND 公告日期 ≤ 今日`（即「已公告」；一般使用者）→ 套用篩選（制定公司／制定部門／制定室別／當責室長／狀態／循環別，AND）→ 套用關鍵字（編號＋名稱，AND，萬用字元跳脫）。<br>📝 **2026-08-16 使用者裁決推翻，理由：移除使用部門篩選、新增四項制定組織/當責室長篩選**——原條文為「套用篩選（部門/狀態/循環，AND；部門篩選以選定單位之有效前綴展開子樹比對）」。
2. 依「文件使用部門含使用者部門」拆置頂區與其餘區（**判定邏輯不變**，僅其依據欄位不再顯示於卡片）。
3. 兩區各依文件編號降冪，置頂區在前、其餘在後，合併分頁。
4. 每筆顯示：程序書編號、程序書書名、內容摘要、文件狀態、制定公司、制定部門、制定室別、版次、公告日期。<br>🔴 **2026-08-27 `AC-Y5` 就地改寫**：內容摘要仍顯示，但**改以書名之副標題**呈現、**不再是一個帶標籤的欄位** ⇒ **欄位標籤**集合為上列**八項**（扣除內容摘要）。<br>📝 **2026-08-16 使用者裁決推翻，理由：使用者指定之顯示欄位清單**——原條文為「文件編號、文件名稱、制定部門、**使用部門**、文件狀態、公告日期、內容摘要」；**移除 使用部門**，**新增 制定公司／制定室別／版次**（循環別原僅存在於 prototype 卡片、不在本條文，一併移除見 AC-D8）。
5. 點擊文件進入詳情/檢視器（F020），詳情含關聯使用表單（F018）與連結點（F015）。

## Alternative Flows
- 清除篩選：回復未篩選狀態並維持預設排序。

## Edge Cases
- 使用者部門查無相符文件：直接依編號降冪，無置頂區塊錯誤顯示。
- 使用部門為多部門，其一相符：仍列入置頂。
- ~~選擇上層單位（如本部）作為部門篩選：子樹內所有層級之文件皆納入，不因層級不同而漏列。~~ 📝 **因前台「使用部門」篩選器移除而不再適用（2026-08-16）**；同一子樹展開語意仍於置頂排序與 [F041](F041-user-subtype-business-scope.md) 可見性過濾生效。
- ~~選擇最細單位（課層）作為部門篩選：其有效前綴為 4 碼（如 `JCHA`），僅比對該課，不誤含同一處室下其他課。~~ 📝 **因前台「使用部門」篩選器移除而不再適用（2026-08-16）**；同上。
- 篩選關鍵字含 `%` `_`：`LIKE` 須跳脫萬用字元（「程序書書名／編號」關鍵字路徑仍適用；原「前綴比對」路徑因部門篩選移除而不再適用）。
- 分頁載入第二頁：排序規則維持一致（後端權威）。
- 五項可搜尋下拉之選項清單為空（該欄位全庫皆無值，或業務子分類 viewer 之可見集合為空）：呈現空選項清單，**非錯誤**；不得因此阻擋其他篩選。
- 文件之 `draftingCompanyId`／`draftingSectionId`／`edition` 為空：清單卡該列顯示 `—`，不顯示 `null`／空白列。
- 關鍵字含 `% _ '`：正確跳脫，無錯誤/注入。
- 一般使用者僅可見「已公告」文件（有效且公告日期已過）；「進度中」（有效但公告日期未到）與 失效/作廢 一律由後端過濾（不可依前端傳入條件繞過）（定案 OQ-E06-02）。

## Postconditions
- 使用者取得符合條件、依固定規則排序之清單。

## Acceptance Criteria
- Given 使用者部門為 X, When 開啟清單, Then 使用部門含 X 的文件置頂，其餘於下方。
- Given 置頂區以外文件, When 呈現, Then 依 ICSOP 文件編號降冪排序。
- Given 清單載入完成, When 呈現, Then 每筆顯示 程序書編號／程序書書名／內容摘要／文件狀態／制定公司／制定部門／制定室別／版次／公告日期。<br>🔴 **2026-08-27 `AC-Y5` 就地改寫**：九項**內容**全數仍在，但內容摘要改為書名副標題 ⇒ 有**標籤**者為八項（逐項斷言見 `AC-D8` 與 `AC-Y5`）。<br>📝 **2026-08-16 使用者裁決推翻，理由：使用者指定之顯示欄位清單（缺失 delta 第 3 項）**——原條文為「每筆至少顯示編號/名稱/制定部門/**使用部門**/狀態/公告日期（可含內容摘要）」。「至少」之措辭一併收斂為**恰為**上列九項（逐項斷言見 AC-D8）。
- Given 關鍵字為某文件編號或名稱之部分字串, When 搜尋, Then 僅顯示符合者並維持排序規則。
- Given 已套用篩選, When 同時輸入關鍵字, Then 回傳同時符合（AND）之結果。
- Given 同時選 制定部門＋狀態＋循環別, When 套用, Then 回傳三條件交集。<br>📝 **2026-08-16 使用者裁決推翻，理由：「使用部門」篩選器已移除**——原條文為「同時選**部門**+狀態+循環」，其「部門」指使用部門篩選。新六項篩選之任意組合 AND 語意見 AC-D6。
- Given 查無符合, When 搜尋/篩選, Then 顯示「查無符合結果」，非錯誤畫面。
- Given 已套用篩選, When 點擊清除篩選, Then 回復完整清單與預設排序。
- Given 一般使用者開啟前台清單, When 載入, Then 僅回傳「已公告」（`status=有效 AND 公告日期≤今日`）文件；「進度中」/失效/作廢即使 API 夾帶其他條件亦由後端強制過濾。
- ~~Given 部門篩選下拉, When 展開, Then 可選擇本部／部／處室／課任一層級之單位。~~<br>📝 **因前台「使用部門」篩選器移除而不再適用（2026-08-16 使用者裁決，缺失 delta 第 2 項）**。本條所規範之 DOM 元件已不存在，故無可驗證之載體；**不得留為懸空 AC，亦不得靜默刪除**。其所依據之「使用部門可指定任意層級」規則仍由 [F026](F026-role-field-matrix.md) §9.1（欄位設定側）持有、不受影響。
- ~~Given 部門篩選選定「營運管理部」(`JA000`), When 套用, Then 使用部門為 `JA000` 及其所有下層（如 `JAC00`、`JAD00` 等 `JA` 開頭單位）之文件皆被列入。~~<br>📝 **因前台「使用部門」篩選器移除而不再適用（2026-08-16）**。同一子樹展開語意之驗證載體改為：置頂排序（本檔第 1 條 AC「使用部門含 X 的文件置頂」）與 [F041](F041-user-subtype-business-scope.md) AC-05～AC-11／AC-14。<br>📝 **文字勘誤（2026-08-10，保留追溯）**：本條原舉例為「`JAC00`、`JCHA0`」，但 `JCHA0` 之有效前綴為 `JCHA`（第 2 碼為 `C`），**並非 `JA` 開頭**（`'JCHA0'.startsWith('JA')` 為 `false`），與 [public-seams-test-design.md](../test-design/public-seams-test-design.md) `TS-PS-F019-004`「`'JCHA0'` 不涵蓋 `JAC00`（非其祖先）」互相矛盾，已改用同分支之真實代碼 `JAD00`。**該勘誤未改變任何判定邏輯**。
- ~~Given 部門篩選選定處室層 `JAC00`, When 套用, Then 僅列入 `orgCode LIKE 'JAC%'` 之使用部門文件，不含其他處室。~~<br>📝 **因前台「使用部門」篩選器移除而不再適用（2026-08-16）**；等價語意由 `TS-PS-ORG-004`（`isWithinSubtree` 單元測試）與 [F041](F041-user-subtype-business-scope.md) AC-16 持續覆蓋。
- ~~Given 部門篩選之子樹展開, When 後端執行查詢, Then 以 `orgCode LIKE '<有效前綴>%'` 之前綴比對實作，不使用遞迴 CTE 或 closure table。~~<br>📝 **因前台「使用部門」篩選器移除而不再適用（2026-08-16）**。**惟「不得改用遞迴 CTE／closure table」之實作約束對置頂與 [F041](F041-user-subtype-business-scope.md) 可見性過濾仍然有效**，已改由 AC-D13 承接、不得因本條失效而放寬。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**（**2026-08-16 就地改寫：載體轉移，核心語意存活**）：Given 前台**「循環別」篩選下拉之選項 label** 或**文件詳情頁**呈現某文件之「循環別」, When 渲染, Then 顯示字串由 `lifecycleDisplayName` 產生——有子分類 → `名稱（子分類）`（全形括號無空白）、無子分類 → `名稱`；**前台與後台（[F017](F017-backend-document-list.md)）之顯示字串完全一致**（此為本條之核心語意，**未失效**）。
  - ~~原條文之「前台**清單**（卡片）呈現某文件之循環別」半段~~ 📝 **因 [F019](#filter-column-delta) `AC-D8` 移除清單卡片之「循環別」欄而不再適用（2026-08-16 使用者裁決，缺失 delta 第 3 項）**——`AC-D8` 已反向鎖定「卡片 DOM 不得出現 `循環別：`」，兩者直接對立。**原條文逐字保留供追溯**：「Given 前台**清單**／詳情呈現某文件之「循環別」, When 渲染, Then 顯示字串由 `lifecycleDisplayName` 產生……」。
  - ✅ **載體轉移（非失效）**：「前後台顯示字串一致」之驗證載體由**卡片欄位**移轉至**篩選下拉之 label**（`AC-D2` 之可搜尋下拉，如 `銷售及收款循環（消金）`）＋**詳情頁之循環別欄**（`AC-D9` 只移除「文件使用部門」欄，**循環別欄未受影響**）。**本條整體仍然有效，不得判死。**
  - 📌 **組字落點（2026-08-16 補註）**：`lifecycleDisplayName` 之組字自本 delta 起**由後端提供**（`AC-D5` 全域 distinct 之 filter-options 管線一併回傳已組合之 label），**前端不再自組**。本條與 `AC-S2` 皆**未假設**組字發生於前端，故措辭無須改動；此註僅為避免下游誤讀。
- **AC-S2**：Given 池中有「銷售及收款循環（消金）」與「銷售及收款循環（企金）」, When 展開前台「循環」篩選, Then 呈現**兩個相異選項**（各以 `lifecycleDisplayName` 顯示），篩選值為各自 `lifecycleId`（**非** `name` 字串）；When 選定「消金」, Then 結果僅含該具體循環之文件，不含同名「企金」之文件，且與其餘篩選之 AND 組合語意不變。<br>📝 **2026-08-16 措辭更正（同類懸空修補）**：原句尾為「且與**部門**／狀態篩選之 AND 組合語意不變」，其中「部門」指**已被移除**之使用部門篩選（`AC-D1`）。改為「其餘篩選」以涵蓋改版後之五項（制定公司／制定部門／制定室別／當責室長／狀態）；**AND 組合語意本身未變**（見 `AC-D6`）。

### 業務子分類可見範圍限縮 delta（🟢 APPROVED 2026-08-11 人類閘門通過；規則權威＝[F041](F041-user-subtype-business-scope.md)）

> 本節之全部 AC 已定案，前提選項均經 2026-08-11 人類裁決確認：**OQ-E08-04→B（子分類旗標）、OQ-E08-05→A（子樹展開）、OQ-E08-06→C（本輪收斂至前台各路徑）、OQ-E08-07 4a/4b/4c→皆 A、OQ-E06-03→A（404）**。
> 逐題裁決結果與未採選項之追溯見 [F041 §OQ 裁決紀錄](F041-user-subtype-business-scope.md#oq-dependency)。
> **語意轉變（本 delta 之核心）**：現行 F019 對**全體**一般使用者僅以「使用部門相符」決定**置頂排序**、**不限制可見性**；
> 本 delta 對**業務**子分類使用者，將同一判定式（`isWithinSubtree`）由**排序用途**升級為**可見性過濾用途**（deny-by-default）。
> **判定式本身不變、不新增第二套比對邏輯**（[F041](F041-user-subtype-business-scope.md) INV-4）。

- **AC-U1**：Given viewer 為業務子分類之一般使用者（`roleCode='User'`、`userSubtype='business'`、`orgCode='JAC00'`）, When 呼叫 `buildPublicList`, Then 於**既有「已公告」基底條件之後**追加「使用部門相符」過濾（AND）；使用部門不相符之已公告文件**不出現於 `items` 且不計入 `total`**（不得以總筆數洩漏其存在）。〔[F041](F041-user-subtype-business-scope.md) AC-14〕
- **AC-U2**：Given 業務 viewer 之清單結果, When 檢視各項 `pinned` 旗標, Then **全部為 `true`**——置頂區＝全部結果、其餘區恆為空陣列。此為**預期退化行為**，既有置頂/排序/分頁邏輯**不需任何特殊分支**（OQ-E08-07 4a 選項 A）。〔[F041](F041-user-subtype-business-scope.md) AC-15〕
- **AC-U3**（**2026-08-16 部分改寫**）：Given 業務 viewer 套用任意「制定公司／制定部門／制定室別／當責室長／狀態／循環別／關鍵字」篩選組合, When 送出查詢, Then 業務限制與各條件以 **AND** 組合，不相符文件於**任何**排列組合下皆不出現；交集為空時 `items === []`、`total === 0`，顯示既有**空狀態**文案「查無符合結果」（逐字、不因子分類分支）、**非錯誤**（✅ OQ-E08-07 4c 定案為選項 A：空狀態文案不分支）。⚠ **空狀態文案不分支 ≠ 頂部說明句不分支**——後者已裁決為分支，見 AC-U7。〔[F041](F041-user-subtype-business-scope.md) AC-17／AC-33〕
  - 📝 **本條原文之「部門篩選選到其子樹範圍外之單位時…（OQ-E08-07 4b：下拉不限縮）」子句，因前台「使用部門」篩選器移除而不再適用（2026-08-16 使用者裁決，缺失 delta 第 2 項）**。原文逐字保留於此供追溯：「Given 業務 viewer 套用任意「部門／循環／關鍵字」篩選組合…**部門篩選選到其子樹範圍外之單位時**，`items === []`、`total === 0`…（✅ OQ-E08-07 **4b**／4c 皆定案為選項 A：**下拉不限縮**、空狀態文案不分支）」。**4b 之裁決本身（業務子分類不限縮下拉選項）未被推翻，僅其載體（使用部門下拉）已不存在**；其精神改由 AC-D5 承接——**新五項可搜尋下拉之選項來源必須先經 `isDocVisibleToViewer` 過濾**（此為與 4b 相反方向之要求：4b 講的是「不因子分類限縮**組織樹**選項」，AC-D5 講的是「必須因子分類限縮**文件衍生**選項」，兩者不衝突，理由見 AC-D5）。對應之 [F041 AC-16](F041-user-subtype-business-scope.md) 亦同步標記。
- **AC-U4**：Given 池中同時存在「非已公告文件」與「已公告但使用部門不相符之文件」、viewer 為業務子分類, When 呼叫 `buildPublicList`, Then `hiddenCount` **僅計前者**（被強制基底條件隱藏者），**不含**因業務限制被過濾者——避免以計數洩漏他部門文件之存在數。〔[F041](F041-user-subtype-business-scope.md) AC-18〕
- **AC-U5**（**回歸鎖定**）：Given viewer 為「其他」子分類之一般使用者、或任一非 `'User'` 角色, When 呼叫 `buildPublicList`, Then 其輸出（`items` 順序與內容、`total`、`page`、`pageSize`、`hasNext`、`hiddenCount`、每項 `pinned`）與本 delta 導入前**逐欄相同**；既有 `public-list.spec.ts` 之全部案例維持綠燈，**不得修改任何既有期望值**。〔[F041](F041-user-subtype-business-scope.md) AC-19〕
- **AC-U6**（**詳情與直連 URL**）：Given 業務 viewer 開啟一筆已公告但使用部門不相符之文件詳情（含經他人分享之直連網址）, When 請求送出, Then 回 **404 `DOCUMENT_NOT_FOUND`**（✅ OQ-E06-03 定案為選項 A＝隱藏存在性，**非** 403 `PERMISSION_DENIED`；既有錯誤碼、不新增），且**不回傳任何中繼資料**（`documentNumber`／`documentName`／`draftingDeptName`／`usingDeptNames`／`contentSummary` 皆不得出現），亦不執行任何名稱解析；其錯誤訊息文案須與「文件確實不存在」逐字相同。〔[F041](F041-user-subtype-business-scope.md) AC-20／AC-21〕
- **AC-U7**（📝 **已作廢——2026-08-27 使用者裁決整條移除說明列，權威改為 `AC-Y1`**；原為 2026-08-11 人類閘門新增之清單頂部範圍說明句）：<br>🔴 **本條之全部要求（含兩條逐字文案、孤兒帳號沿用業務句之處置）自 2026-08-27 起不再適用**——載體 `#scopeNotice` 已不存在。**下列原條文逐字保留供追溯**，其中「孤兒帳號不得以文案差異宣告帳號異常」之**要求未鬆動**，改由「任何帳號都沒有說明句」達成（`AC-Y1`）。<br>📝 OLD>Given 前台清單頁渲染頂部說明句（DOM 掛鉤 `#scopeNotice`）, When viewer 為**受限者**（`roleCode='User'` 且 `userSubtype='business'`，**含 `orgCode` 為空之孤兒帳號**）, Then 其文字逐字為 `SCOPE_NOTICE_BUSINESS`：<br>`業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。`<br>Given viewer 為**非受限者**（「其他」子分類或任一非 `'User'` 角色）, Then 其文字逐字為 `SCOPE_NOTICE_OTHER`（**既有文案一字未改**）：<br>`一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。`<br>📌 **孤兒帳號刻意沿用業務句、不另立第三句**（另立將以文案差異宣告帳號異常，牴觸 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)）。逐字權威＝`prototypes/03-public-list.html` 之具名常數；前端須以常數持有供 vitest 直接 import 斷言。〔[F041](F041-user-subtype-business-scope.md) AC-40〕
- **AC-U8**（**2026-08-11 補訂——詳情頁 404 畫面之前端呈現**；權威＝`prototypes/04-public-document-detail.html:161`～`:164`）：Given 前台文件詳情頁自後端取得 **404 `DOCUMENT_NOT_FOUND`**，**無論成因**為①文件確實不存在 ②文件存在但非已公告 ③業務子分類之使用部門不相符, When 渲染, Then 三者渲染**完全相同之單一 not-found 畫面**（同一元件、同一文案；該元件**不得接受任何可區分成因之參數**——可區分即以呈現差異還原存在性，架空 OQ-E06-03）；其逐字內容為圖示鍵 `file-x`（紅色、圓形淺紅底）、標題 `查無此文件`、說明 `查無此文件，或該文件尚未公告。`、錯誤碼列 `DOCUMENT_NOT_FOUND · 404`（等寬字體）；且該畫面之 DOM **不得出現任何文件欄位值**（以 `documentNumber`／`documentName`／`draftingDeptName`／`usingDeptNames`／`contentSummary` 逐項 `queryByText === null` 斷言，涵蓋「先渲染內容再覆蓋」之實作）。<br>⚠ **本條變更既有畫面之文案**：現行實作為 `文件可能尚未公告或已下架。` ＋ `inbox` 圖示 ＋ 無錯誤碼列，三者皆與 prototype 不符，且該文案未見於任何 prototype——依 prototype 為權威之原則以 prototype 為準。既有「返回文件瀏覽」按鈕**不在** prototype 拒絕面板之定義範圍內，**維持現狀不得移除**。<br>📌 AC-U6 規範的是**後端回應**（回什麼碼、不回哪些欄位），本條規範的是**前端呈現**（畫面長什麼樣、不顯示哪些欄位）——原 delta 缺後者，故實作漂移無人可擋。〔[F041](F041-user-subtype-business-scope.md) AC-46〕

### 前台篩選器與顯示欄位改版 delta（🔴 2026-08-16 使用者裁決；缺失／變更 delta 第 2／3／4 項） {#filter-column-delta}

> **前提裁決（皆已定案，不得再標為未決）**：OQ-D18-05→僅移除 UI 顯示與篩選（後端判定完全不變）；OQ-D18-06→兩條 `SCOPE_NOTICE_*` 與置頂區塊文案逐字不動；OQ-D18-07→選項來源＝全域 distinct 且**必須先經 `isDocVisibleToViewer` 過濾**；OQ-D18-08→「當責室長」比對＝主要∪次要（並要求[F017](F017-backend-document-list.md) 後台同步為同一語意）；OQ-D18-09→對外 DTO 移除 `usingDeptNames`／`usingDeptIds`。
> **本節 AC 之驗證層次**：AC-D1～AC-D3、AC-D8～AC-D11 為**前端 DOM 層**；AC-D4～AC-D7、AC-D12、AC-D13 為**後端純函式／API 層**。

- **AC-D1**（篩選器組成與順序）：Given 前台清單頁桌面版渲染完成, When 檢視篩選列, Then 其可見篩選控制項**恰為 6 項且順序由左至右為** `制定公司`／`制定部門`／`制定室別`／`當責室長`／`狀態`／`循環別`（各以該逐字字串為其 `aria-label`）；且 DOM 中**不存在** `aria-label="使用部門篩選"` 或任何文字為 `所有使用部門` 之控制項或選項（以 `queryByLabelText('使用部門篩選') === null` 與 `queryByText('所有使用部門') === null` 雙重斷言）。行動裝置之底部 sheet 呈現同一 6 項、同一順序。
- **AC-D2**（五項為可搜尋下拉）：Given `制定公司`／`制定部門`／`制定室別`／`當責室長`／`循環別` 任一控制項, When 展開並輸入關鍵字, Then 選項清單即時縮小為「label 含該關鍵字（不分大小寫）」者並可選取（＝combobox 語意，比照 [F017](F017-backend-document-list.md) 後台既有可搜尋下拉）；`狀態` 維持既有原生下拉、**不改為 combobox**。
- **AC-D3**（清除篩選）：Given 已套用任意數量之篩選, When 點擊「清除篩選」, Then 6 項篩選與關鍵字同時清空、清單回復未篩選狀態與預設排序（既有「清除篩選」行為之範圍擴及新增之四項）。
- **AC-D4**（篩選比對語意）：Given 已選定某一篩選值, When 後端執行查詢, Then `制定公司`／`制定部門`／`制定室別`／`循環別` 皆為**等值比對**（比對鍵分別為 `draftingCompanyId`／`draftingDeptId`／`draftingSectionId`／`lifecycleId`，**非顯示名稱字串**）；`狀態` 維持既有裝飾性 no-op（基底條件已鎖「已公告」，OQ-F019-04）。
- **AC-D5**（🔴 選項來源與資安檢核）：Given 前台需取得五項可搜尋下拉之選項, When 後端組裝選項清單, Then 其來源為**全域 distinct**（自全體文件衍生，**非**當前結果集衍生——避免「篩了就選不回來」之死鏈）；**且必須先經與清單相同之 `isDocVisibleToViewer` 過濾**。<br>驗證：Given viewer＝`業務@JAC00`、池中僅有一筆使用部門為 `JAD00`（不相符）之已公告文件且其 `draftingCompanyId='C9'`, When 取得選項清單, Then 回傳之 `制定公司` 選項**不含** `C9`（`options.some(o => o.value === 'C9') === false`）——**下拉選項本身不得洩漏他部門文件之存在**（與 AC-U4 `hiddenCount` 不洩漏原則同源）。<br>📌 **與 OQ-E08-07 4b「不限縮下拉」不矛盾**：4b 所指為「使用部門下拉」，其選項來自**組織主檔**（與文件存在與否無關，故不洩漏）；本條所指五項選項來自**文件衍生值**（選項存在即等同宣告某文件存在，故必須過濾）。<br>📌 **端點形狀（建議 `GET /public/documents/filter-options`，單一端點一次回傳五組選項）由 [system-architect](#related) 定案**；本條之驗證層次為**服務層純函式**，不綁定 HTTP 路徑。<br>🔴 **`label` 之解析義務（2026-08-17 補訂；缺失修正第 1／2 項）**：五組選項之 `label` 一律為**人類可讀名稱**——`制定公司`／`制定部門`／`制定室別`＝組織名稱、`當責室長`＝**人員姓名**（接縫＝`NameResolutionService.resolvePersonNames` 之批次解析）、`循環別`＝**`lifecycleDisplayName`**（含子分類，取自候選項既有之 `lifecycleName`，不另查）。任一項未命中 → `label` fallback 為其 code／員編／id（絕不為空字串或 `null`）；五組皆**依 `label`** 排序（依 `value` 排會讓畫面上的順序看不出規律）。`value` 恆為 id／code、**不隨本條改變**（`AC-D4` 之比對鍵鎖定不受影響）。<br>⚠ **本條為補記既有缺失之修正，非新能力**：`prototypes/03-public-list.html:319`（當責室長選項即姓名）與 `AC-S2` 補註（「`lifecycleDisplayName` 之組字由後端提供」）本就要求如此，實作卻只對三組組織欄位解析名稱，使前台下拉長期顯示**員編**與 **lifecycle UUID**；`AC-D2` 之「輸入關鍵字過濾 label」在該兩格因而形同虛設。缺口成因為 spec 未指定人員解析接縫（原記於 `risks-and-gaps.md` `G-L3-03`），本條即為其關閉。
- **AC-D6**（AND 組合）：Given 同時套用 `制定公司`＋`制定部門`＋`制定室別`＋`當責室長`＋`循環別`＋關鍵字 六項條件, When 送出, Then 回傳六條件之交集；任一條件未提供即不施加該限制；交集為空時顯示既有空狀態「查無符合結果」、**非錯誤**。
- **AC-D7**（🔴 「當責室長」比對範圍＝主要∪次要）：Given 某文件之 `primaryChiefId='E001'`、`secondaryChiefIds=['E002']`, When 以 `當責室長 = E002` 篩選, Then 該文件**被列入**；When 以 `當責室長 = E001` 篩選, Then 亦被列入；When 以 `當責室長 = E003` 篩選, Then 不被列入。選項清單為「全體可見文件之 `primaryChiefId` ∪ `secondaryChiefIds`」之 distinct（經 AC-D5 之可見性過濾）。<br>⚠ **與後台之一致性義務（spec-writer 2026-08-16 實地核對後定案）**：核對 `backend/src/documents/document-list-query.ts:57` 與 `frontend/src/pages/DocumentListPage.tsx:170` 之現況，[F017](F017-backend-document-list.md) 後台「當責室長」篩選目前**僅比對主要室長**（`filters.primaryChiefId` vs `r.primaryChiefId`），與本條不同。依 OQ-D18-08 之「兩處語意必須一致」，**[F017](F017-backend-document-list.md) 後台側同步擴為主要∪次要**（見 [F017](F017-backend-document-list.md) `AC-D7`）；本條與該條為同一語意之兩處斷言，**不得只改一處**。
- **AC-D8**（清單卡顯示欄位；🔴 **2026-08-27 `AC-Y5` 就地改寫——九項→八項、`<dl>` 六列→五列**）：Given 清單卡渲染完成, When 逐項檢視, Then 其欄位標籤集合**恰為** `程序書編號`／`程序書書名`／`文件狀態`／`制定公司`／`制定部門`／`制定室別`／`版次`／`公告日期` 八項；`<dl>` 區塊之標籤順序為 `制定公司：`／`制定部門：`／`制定室別：`／`版次：`／`公告日期：`（編號、書名、狀態徽章維持於卡片標頭，位置不變；內容摘要改為書名副標題，見 `AC-Y5`）；<br>📝 **OLD>**（2026-08-16～2026-08-27）「其欄位標籤集合**恰為** …／`內容摘要`／… 九項；`<dl>` 區塊之標籤順序為 …／`公告日期：`／`內容摘要：`」。<br>且卡片 DOM **不得出現** `使用部門：` 與 `循環別：` 兩個標籤（`queryByText('使用部門：') === null`、`queryByText('循環別：') === null`）。`版次` 以等寬字（`mono`）呈現，格式 `{YY}'{NN}`。
- **AC-D9**（詳情頁移除使用部門欄）：Given 前台文件詳情頁渲染完成, When 檢視欄位清單, Then **不存在**標籤為 `文件使用部門` 之欄位列（`queryByText('文件使用部門') === null`），亦不出現其原附註文字 `（處/室層＋部層＋課層；選上層自動涵蓋其下所有單位）`；其餘欄位列之集合、順序與逐字標籤**一律不變**。
- **AC-D10**（🔒 文案回歸鎖定；OQ-D18-06；🔴 **2026-08-27 `AC-Y1` 就地縮減——五條→三條**）：Given 清單頁渲染, When 檢視置頂／其餘兩區塊標題與空狀態, Then 置頂區標題 `您部門相關文件`、其餘區標題 `其他文件`、空狀態文案 `查無符合結果` **三者逐字與本 delta 導入前完全相同**。<br>📝 **OLD>**（2026-08-16～2026-08-27，前兩條已隨說明列移除）「Then `SCOPE_NOTICE_BUSINESS`／`SCOPE_NOTICE_OTHER`（AC-U7 之兩條常數）、置頂區標題 `您部門相關文件`、其餘區標題 `其他文件`、空狀態文案 `查無符合結果` 五者**逐字與本 delta 導入前完全相同**——**縱使說明句內文提及「使用部門」而該欄位已不再顯示於卡片，仍不得修改**（說明句解釋的是「可見範圍」，非「畫面上有哪個欄位」）。」<br>⚠ **縮減 ≠ 放寬**：被移除的兩條不是「可以改字」，而是**整句不再出現**（`AC-Y1` 以反向斷言鎖住其不得復活）。
- **AC-D11**（🔒 置頂機制回歸鎖定）：Given 使用者部門為 `JAC00`、池中有一筆使用部門為 `JA000` 之已公告文件, When 開啟清單, Then 該文件**仍出現於置頂區**（`pinned === true`）——移除顯示欄位**不改變置頂結果**；置頂／其餘兩區塊之存在、標題與分區行為皆不變。
- **AC-D12**（對外 DTO 收斂；OQ-D18-09）：Given 前台清單 API 與前台文件詳情 API 之回應, When 逐欄檢視任一 item, Then **不含** `usingDeptNames` 與 `usingDeptIds` 兩個屬性（`Object.prototype.hasOwnProperty.call(item,'usingDeptIds') === false`，`usingDeptNames` 同）；**新增** `draftingCompanyName`／`draftingSectionName`／`edition` 三個屬性。<br>⚠ **內部型別不變**：後端內部之 `PublicDocItem.usingDeptIds` **保留**（置頂與 [F041](F041-user-subtype-business-scope.md) 可見性判定所需）；本條約束的是**序列化至 HTTP 回應之對外形狀**，兩者不可混為一談。<br>📌 **已知代價（已接受）**：`PublicListPage` 之「使用部門逐段高亮」邏輯（G-PUB-016）一併移除。
- **AC-D13**（🔒 後端判定回歸鎖定；OQ-D18-05 之硬邊界）：Given 本 delta 實作完成, When 檢視 `isWithinSubtree`／`isDocVisibleToViewer`／`isUsingDeptMatched` 三純函式, Then 其**函式簽章與回傳語意逐字未變**，`TS-PS-ORG-001`～`TS-PS-ORG-006` 與 [F041](F041-user-subtype-business-scope.md) AC-05～AC-19 之全部既有測試**維持綠燈且期望值未經修改**；`DOC_USING_DEPT` 表之結構、寫入路徑與查詢用途皆不變；子樹展開仍以 `orgCode LIKE '<有效前綴>%'` 前綴比對實作，**不得改用遞迴 CTE 或 closure table**。

- **AC-D14**（🔴 逐字文案與空值呈現；**2026-08-16 補訂**，權威＝`prototypes/03-public-list.html`）：
  - ① **`狀態` 下拉之選項文字為 `有效`**（**非** `狀態：有效`）。<br>📝 **本項變更一條既有可見文案，已由 spec-writer 確認接受**：新版篩選列每個控制項皆有獨立 label（`狀態`，見 `AC-D1`），選項再自帶「狀態：」前綴即語意重複；且行動 sheet 原本就是「label `狀態` ＋ option `有效`」，本改動使桌面與行動一致。**該字串不屬 `AC-U7`／`AC-D10` 所鎖定之逐字文案集合**（那組僅含兩條 `SCOPE_NOTICE_*`、兩個區塊標題與空狀態句），故不觸發「修改前須經人類再裁決」之條款。
  - ② **空值呈現**：Given 某文件之 `draftingSectionId`（制定室別）為空, When 渲染清單卡, Then 該列之值為逐字 `—`（U+2014 em dash），並帶 `title` 屬性 `此部之下無處/室，制定組織掛於部層`；**不得**顯示 `null`、空字串或整列消失。`draftingCompanyId`／`edition` 為空時同以 `—` 呈現。<br>📌 `AC-D8` 僅列出九項標籤與其順序，未規範空值；本項補齊，使九項標籤之**存在性斷言**在有空值時仍成立。

### 詳情頁移除「當責室長-次要」欄 delta（🔴 2026-08-17 使用者裁決；缺失修正第 3 項） {#secondary-chief-delta}

- **AC-D15**（詳情頁移除當責室長-次要欄；權威＝`prototypes/04-public-document-detail.html`）：Given 前台文件詳情頁渲染完成, When 檢視欄位清單, Then **不存在**標籤為 `當責室長-次要` 之欄位列（`queryByText('當責室長-次要') === null`），欄位列由 19 列成為 **18 列**；其餘 18 列之集合、順序與逐字標籤**一律不變**（`當責室長-主要` 保留）。<br>🔴 **對外 DTO 一併收斂**（處置比照 `AC-D12`）：前台文件詳情 API 之回應**不含** `secondaryChiefIds` 與 `secondaryChiefNames` 兩個屬性（`Object.prototype.hasOwnProperty.call(dto,'secondaryChiefIds') === false`，`secondaryChiefNames` 同）；且**不得**再為次要室長員編呼叫 `resolvePersonNames`——只刪欄位而仍解析，是為不會被回傳的資料付查詢成本。<br>⚠ **內部型別與後台皆不變**：`PublicDocDetail.secondaryChiefIds`（內部）保留；後台清單 DTO 之 `secondaryChiefNames`／`secondaryChiefCount` 與其「當責室長」篩選之**主要∪次要**語意（`AC-D7`／[F017](F017-backend-document-list.md) `AC-D7`）**逐字不受影響**——「前台不顯示 ≠ 後台不判定」。<br>⚠ **前端須容忍舊形狀**：滾動部署期間後端可能仍回該兩欄，前端**縱使收到亦不得渲染**（其回歸鎖以 cast 塞回該兩欄之 fixture 斷言；否則「不出現次要室長姓名」會因資料裡根本沒有該字串而恆真）。<br>📌 **[F026](F026-role-field-matrix.md) 矩陣不變**：該矩陣描述的是欄位之讀寫權限，非「前台詳情頁上有哪幾列」——`文件使用部門` 於 `AC-D9` 移出前台後亦留在矩陣中，本條沿用同一先例。
### D9 delta：判定邏輯零漣漪回歸鎖定（🔴 2026-08-20；缺失／變更 delta 第 6／7 項之連動核實） {#d9-no-ripple-lock}

> 前提裁決：**`OQ-D9-18`→選項 A**（使用表單「制定部門」為**純 metadata**，不影響任何既有可見性／RBAC 判定；[F041](F041-user-subtype-business-scope.md)／[F033](F033-permission-aware-retrieval.md)／[F026](F026-role-field-matrix.md) 之判定邏輯**逐字不動**）〔使用者〕｜**`OQ-D9-12`→選項 A**（字級調整僅前台呈現層）〔使用者〕。
> **本節僅立回歸鎖定 AC，不新增任何行為。** AC 編號採 `AC-N#`。

- **AC-N63**（🔒 前台清單之判定與呈現零漣漪）：Given 2026-08-20 D9 delta 全數實作完成, When 執行本 feature 之全部既有 AC 與 `AC-S1`／`AC-S2`／`AC-U1`～`AC-U8`／`AC-D1`～`AC-D14`, Then **全數維持綠燈、期望值一字未改**。逐項鎖定——
  - ① **三個純函式之簽章與語意逐字不變**：`isWithinSubtree`（`backend/src/org-sync/org-hierarchy.ts`）／`isDocVisibleToViewer`／`isUsingDeptMatched`；其既有測試（含 `TS-PS-ORG-001`～`006`）逐案綠燈且**期望值未經修改**。
  - ② **使用表單之「制定部門」（[`USAGE_FORM_DRAFTING_DEPT`](../data-model.md#usage-form-drafting-dept)）不進入任何前台判定**——上列三函式**皆不接受**該資料作為輸入；置頂排序（Main Flow 2–3）之輸入仍僅為 `DOC_USING_DEPT` 與 viewer 之 `orgCode`。
  - ③ **前台清單之篩選組成仍為 6 項**（`AC-D1`），**不因使用表單新增制定部門而增加任何篩選器**。
  - ④ **字級調整（[F021](F021-rwd-responsive.md) `AC-N59`～`AC-N62`）不改變任何行為斷言**——清單排序、置頂、搜尋、篩選、分頁、可見性過濾之全部既有測試**不得**因 class 變更而需要修改期望值。
  - 🔴 **本條之存在理由**：`USAGE_FORM_DRAFTING_DEPT` 與 `DOC_USING_DEPT` **結構完全同構**（`OQ-D9-17` 選 B 之刻意設計），最容易被「順手」接進同一套子樹判定；而 `OQ-D9-18` 已明確否決該作法。同源之斷言另見 [F018](F018-usage-form-management.md#usage-form-page-delta) `AC-N46`。

### 2026-08-27 前台瀏覽 UX delta（🔴 使用者裁決；三項） {#ux-20260827-public-delta}

> **裁決逐字**：①「移除實作提示『一般使用者僅顯示「已公告」文件…』」→ 追問「業務子分類專屬句是否一併移除」→ **使用者選：整條說明列全部移除**；②「篩選區域的『狀態』標題與下拉選單字體大小與其他欄位不同」；③「內容摘要位置移到文件標題下方，當作副標題」→ 追問「『內容摘要：』標籤如何處理」→ **使用者選：移除標籤，只留摘要文字**。
> **本節 AC 編號採 `AC-Y#`**。驗證層次：全部為**前端 DOM 層**（本 delta 不動任何 API 契約、不動任何後端判定）。

- **AC-Y1**（🔴 頂部範圍說明列**整條移除**）：Given 前台清單頁渲染完成, When 檢視頁面, Then **不存在** `data-testid="scope-notice"` 節點（`queryByTestId(...) === null`），且畫面上**不出現**下列兩條逐字字串之任一——<br>① `一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。`<br>② `業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。`<br>🔴 **四種 viewer 形狀皆須驗**（「其他」子分類／業務子分類／業務孤兒帳號／非 `'User'` 角色）——原說明列**依 viewer 分支**，只驗一種等於允許「只拿掉 other 那句、business 那句還在」之實作。<br>⚠ **移除＝節點不存在**，**不得**以 `hidden`／`sr-only`／`display:none` 保留（那是「看不到但還在」）。<br>⚠ **兩條逐字字串亦須自 `frontend/src/domain/user-subtype.ts` 移除**（`SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS`）：留著沒有呼叫端的文案常數，下一個讀者會判定「應該顯示在某處」而把它接回去。原文以 `OLD>` 保留於該檔與 `prototypes/03-public-list.html`。<br>📌 **推翻**：`AC-U7`（整條作廢）、`AC-D10` 之前兩條（五條縮為三條）、[F041](F041-user-subtype-business-scope.md) `AC-40`（整條作廢）、[F021](F021-rwd-responsive.md) `AC-N60` 表之第二列（載體消失）。

- **AC-Y2**（🔒 **只移除呈現，不動判定**——本 delta 之零漣漪鎖）：Given `AC-Y1` 實作完成, When 執行既有 `AC-U1`～`AC-U6`／`AC-D11`／`AC-D13`／[F041](F041-user-subtype-business-scope.md) `AC-12`～`AC-19`／`AC-33`, Then **全數維持綠燈、期望值一字未改**——逐項即：業務子分類仍僅見「使用部門相符（子樹展開）」之已公告文件；置頂仍以使用部門判定（後端 `pinned`）；孤兒帳號仍 deny-by-default、清單為空且**非錯誤**；空狀態文案仍逐字 `查無符合結果`、**不因子分類分支**。<br>🔴 **本條之存在理由**：說明句與限縮行為在同一段程式碼旁邊（`isSubtypeApplicable` ＋ `normalizeUserSubtype` 之分支），刪說明句時最容易「順手」把那段判定一起刪掉——那不是 UI 變更，是把 F041 的可見性控制拆掉。<br>🔴 **`error-handling.md#dept-restriction`「不得以訊息區分『無文件』與『帳號異常』」未鬆動**：原以「兩種業務帳號沿用同一句」達成，現以「任何帳號都沒有說明句」達成；孤兒帳號之畫面上**不得**新增任何替代提示（`queryByRole('alert') === null`）。

- **AC-Y3**（🔴 六項篩選之字級**必須同值**且為前台一階）：Given 桌機篩選列（`data-testid="filter-bar"`）渲染完成, When 檢視其六項控制項與其 `<label>`, Then ① 六個 `<label>` 之字級 class **集合大小為 1** 且逐字為 `text-sm`；② 六個控制項本體（五個 `input[role="combobox"]` ＋ 一個 `select`）之字級 class **集合大小為 1** 且逐字為 `text-base`。<br>🔴 **斷言形狀必須是「集合大小為 1」**，不得退化為「`狀態` 之 label 是 text-sm」——後者對「把五項下拉一起縮小成 `text-[11px]`」的實作同樣為綠，而那正是使用者回報之問題的**相反解法**。<br>⚠ **修法方向鎖定**：把五項可搜尋下拉**拉齊到 `狀態`**（前台一階：label `text-sm`／控制項 `text-base`／`rounded-lg`，逐字＝`prototypes/03-public-list.html` 之 `controlHtml`），**不得**反向把 `狀態` 縮小為後台字級——那牴觸 [F021](F021-rwd-responsive.md) `OQ-D9-13`（前台各級距上移一階）。<br>📌 **根因**（供未來讀者）：`SearchCombobox` 之 `density='filter'` 是為**後台** prototype 13 之篩選格而生（label `text-[11px]`／input `text-sm`），前台沿用它即把後台字級帶進前台；`狀態` 因是頁面自繪的原生 `select`，反而是唯一保有前台字級者。

- **AC-Y4**（🔒 後台篩選格之字級**不得**被本 delta 波及）：Given `AC-Y3` 實作完成, When 檢視 `SearchCombobox` 之 `density='filter'` 變體與 `DocumentListPage` 之篩選 label, Then 其 label 字級**仍逐字為 `text-[11px]`**（既有 `DocumentListPage.test.tsx` 之 `text-[11px]` 斷言與 `SearchCombobox.test.tsx` 之 `density=filter` 斷言**維持綠燈、期望值未改**）。<br>🔴 **本條偵測之失誤形狀＝就地改 `filter` 變體**（而非新增前台變體）：那會一次改掉全部後台清單頁，且使 [F021](F021-rwd-responsive.md) `AC-N61` ①「後台仍含最小級距」之回歸鎖失效。<br>📌 **落地形狀**：新增 `density='filter-public'`（前台）；`form`／`filter` 兩變體之 class 逐字不動。

- **AC-Y5**（🔴 內容摘要改為**書名之副標題**）：Given 清單卡渲染完成且該文件之 `contentSummary` 非空, When 檢視卡片 DOM, Then ① 摘要節點（`[data-summary]`）**位於 `<h3>` 書名之後、且與 `<h3>` 同一父節點**（DOM 順序＝視覺順序，副標題緊貼標題）；② 摘要節點**不在 `<dl>` 內**（`dl.contains(summary) === false`）；③ 卡片 DOM **不得出現** `內容摘要：` 標籤（`queryByText('內容摘要：') === null`）；④ `<dl>` 之 `<dt>` 序列逐字為 `制定公司：`／`制定部門：`／`制定室別：`／`版次：`／`公告日期：` 五列。<br>⚠ **③ 必須有反向對照**：同一條測試須另斷言**摘要文字本身仍在**（`[data-summary]` 之 textContent 含 fixture 之摘要片段）——否則「把整段摘要刪掉」也會讓 ③ 為綠。<br>📌 **`AC-D8` 之九項→八項即本條之連動**（欄位標籤集合）；內容**沒有消失**，只是不再以「標籤＋值」的欄位形式呈現。

- **AC-Y6**（摘要之字級與空值處置）：Given 清單卡渲染完成, When 檢視摘要節點, Then ① 其 `className` **含 `text-base`、不含 `text-sm`／`text-xs`**（[F021](F021-rwd-responsive.md) `AC-N60` 之代表性節點逐字沿用——**位置改變、字級要求不變**）；② 掛鉤仍為 `data-summary`（既有斷言之落點不改名）；③ Given `contentSummary` 為 `null`／空字串, Then **整個副標題節點不渲染**（`querySelector('[data-summary]') === null`）——**不得**留空節點、**不得**以 `—` 佔位（`—` 是 `<dl>` 欄位之空值呈現慣例，見 `AC-D14` ②；副標題不是欄位，沒有「這一列空著」的語意）。

### 業務/功能類別瀏覽模式 delta（🟢 **APPROVED（2026-09-02 人類閘門通過）**，2026-09-02；權威＝[F043](F043-business-function-category.md)） {#business-category-browse-delta}

> 🔵 **本節為 DRAFT，未經人類閘門核准前不得實作。** 規則權威＝[F043](F043-business-function-category.md)。
> **使用者原文**：「使用者瀏覽前台的部分，須區分為業務/功能類別樹狀圖(可切換業務/功能類別)與目前的文件清單瀏覽模式(**預設為業務/功能類別樹狀圖模式**)，供前台使用者瀏覽文件。」
> **人類裁決（2026-09-02，決 3）**：前台樹狀圖呈現**比照現行循環樹狀圖**——沿用 [F036](F036-lifecycle-tree-preview.md) `LifecycleTreePreviewPage` 之節點圖＋平移縮放，雙擊節點開抽屜列出該節點掛載文件，頂部下拉切換類別。
> **本 delta 之 AC 編號採 `AC-B#`**（`AC-B12`～`AC-B27`；與既有 `AC-S#`／`AC-U#`／`AC-D#`／`AC-N#`／`AC-Y#` 批次區隔、不重號）。
> 🔴 **本 delta 只增一種模式，不動任何判定**：`文件清單` 模式 ＝ **現行行為逐字不變**（`AC-B24`）；業務子分類可見範圍限縮、置頂判定、已公告基底條件、空狀態文案 `查無符合結果` **四者一字不改**（`AC-B24` ②）。

- **AC-B12**（🔴 模式切換器之組成與逐字標籤）：Given 前台瀏覽頁載入, When 檢視頁面頂部, Then 存在**恰兩個**瀏覽模式之切換控制項，其可見文字與無障礙名稱**逐字**為 **`業務/功能類別樹狀圖`** 與 **`文件清單`**（半形斜線 `/`，前後無空白；順序＝樹狀圖在前）；Then 任一時刻**恰有一個**處於選中態（`aria-pressed="true"` 或等效可存取狀態）。<br>🔒 **恰兩個**：**不得**出現第三種模式或「全部」之類的選項（可測形狀＝斷言控制項數量恰 2，而非只驗那兩個存在——只驗存在對「多了一個」完全無感）。
- **AC-B13**（🔴 **預設為樹狀圖模式**——人類原文明訂）：Given 使用者以任何方式進入前台瀏覽頁（側欄／登入後導向／直接輸入不帶 `mode` 之網址）, When 首次渲染, Then **`業務/功能類別樹狀圖` 為選中態**且畫面呈現樹狀圖；Then `文件清單` **不是**選中態。
- **AC-B14**（URL query 與不可辨識值）：Given 網址帶 `?mode=list`, When 載入, Then 選中 `文件清單`；Given 帶 `?mode=tree`, Then 選中樹狀圖；Given **未帶 `mode`、帶空值、或帶任何不可辨識之值**（如 `?mode=grid`）, Then 一律**視同 `tree`**（`AC-B13` 之預設），**不得**回錯誤、**不得**呈現空白畫面。<br>📌 **可測形狀**：三分支（`list`／`tree`／不可辨識）逐案斷言；🔴 **不可辨識分支必須用一個真的不在值域內的字串**（如 `grid`），用空字串測不到「值域檢查缺失」。
- **AC-B15**（🔒 **模式不跨 session 記憶**）：Given 使用者於本次瀏覽切換至 `文件清單`, When 關閉並重新進入前台瀏覽頁（新的 session／新分頁且不帶 `mode`）, Then **仍為樹狀圖模式**（`AC-B13`）。<br>🔴 **理由**：記憶會使「預設為樹狀圖」這條人類明訂之規則在第二次造訪後**不成立**，且該規則將無法以任何斷言觀察（[F043](F043-business-function-category.md) `OQ-B-10` 現採甲案）。
- **AC-B16**（樹狀圖之呈現，比照 [F036](F036-lifecycle-tree-preview.md)）：Given 樹狀圖模式且已選定某類別, When 渲染, Then ① **上到下（top-down）佈局**；② **直角（orthogonal / elbow / step）箭頭連線**（**非曲線**，與 [F008](F008-dag-node-edge.md)／[F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md) 全系統一致）；③ 每節點顯示節點名稱與**可見**掛載徽章，其逐字為 **`掛載 {N} 份程序書`**（`N ≥ 1`）／**`尚未掛載程序書`**（`N = 0`），🔴 **`N` 為套用可見性過濾後之數字**（語意見 `AC-B21`）；🔒 **DOM 契約**：該徽章載體須帶 **`data-visible-doc-count`** 屬性，其值為 `N` 之字串（`N = 0` 時為 `"0"`，**不得省略**）；<br>　📝 **原例示逐字保留供追溯**：`OLD>` 「③ 每節點顯示**節點名稱與可見掛載程序書數**（如 `節點名稱 (3)`，數字語意見 `AC-B21`）」——`節點名稱 (3)` 為 spec-writer 自擬，與既有 `prototypes/22-lifecycle-tree-preview.html` 之逐字不符；🔴 **2026-09-02 人類裁決採 22 之逐字**（全站同一語彙；反向改 `22` 會撞 [F043](F043-business-function-category.md) `AC-49` 之循環側零漣漪鎖定）。<br>　🔴 **屬性名與後台刻意不同**：後台為 `data-mounted-doc-count`（[F043](F043-business-function-category.md) `AC-32`）、前台為 **`data-visible-doc-count`**——**兩者語意不同**（後台是**全部**掛載數、前台是**該 viewer 可見**的數）。🔒 **明文禁止統一命名或共用同一個屬性**：名稱上的差異正是「這兩個數字可以不相等」這件事在 DOM 層的唯一提示，統一後 `AC-B21` 之過濾斷言將失去它的定位點。④ 多 parent／多 child 正確呈現；⑤ 支援**平移與縮放**，縮放時節點相對位置正確；⑥ **本頁為純唯讀**——不提供任何新增／刪除／拖曳節點或建立連線之互動元件。
- **AC-B17**（類別切換下拉）：Given 樹狀圖模式, When 檢視頂部, Then 存在一個類別切換下拉；其**選項顯示字串** ＝ `businessCategoryDisplayName` 之輸出、**選項值** ＝ `businessCategoryId`（🔴 **非**名稱字串——同名不同子分類之兩個類別必須可分別被選取）；When 選擇另一類別, Then 重繪其樹狀圖，頁面框架（模式切換器、切換下拉、浮水印、縮放）維持不變。
- **AC-B18**（🔴 前台類別清單之納入條件）：Given 前台類別切換下拉之選項來源, When 後端組裝, Then 僅納入**同時滿足**下列兩者之類別——① `status = 'active'`；② **對當前 viewer 至少存在一份可見文件**（可見＝已公告 **AND** 通過 [F041](F041-user-subtype-business-scope.md) `isDocVisibleToViewer`）。<br>🔴 **② 之理由**：列出一個點進去全空的類別，對前台使用者只是噪音；且「存在幾個你看不到內容的類別」本身即是一種存在性洩漏，與 [F041](F041-user-subtype-business-scope.md) 之「刻意隱藏存在性、回 404 而非 403」之既有裁決一致（[F043](F043-business-function-category.md) `OQ-B-03` 現採甲案）。<br>📌 **語料鑑別力要求**：測試語料須含**至少一個「有節點、有掛載，但其掛載文件對該 viewer 全部不可見」之類別**——否則 ② 之過濾與不過濾輸出相同，該斷言恆真。
- **AC-B19**（無可用類別之空狀態，且**不自動切換模式**）：Given 對當前 viewer 而言 `AC-B18` 之結果為空集合（全部停用，或在所有類別下皆無可見文件）, When 進入樹狀圖模式, Then 顯示空狀態提示、**模式切換器仍可用**；Then **不得自動切換到 `文件清單`**。<br>🔴 **理由**：自動切換會使「預設為樹狀圖」變得**不可觀察**——測試無法區分「預設是清單」與「預設是樹但自動切走了」（[F043](F043-business-function-category.md) `[ASSUMPTION]` A10）。
- **AC-B20**（節點雙擊抽屜之內容與導向）：Given 樹狀圖已渲染, When **雙擊**任一節點, Then 自右側滑出**唯讀側抽屜**，列出該節點所掛載且**對當前 viewer 可見**之程序書（欄位＝`程序書編號`／`程序書書名`／`版次`／`公告日期`）；When 點擊某列, Then 導向**前台**文件詳情／檢視器 **`/public/documents/:id`**（🔴 **非** `/admin/documents/:id`——後者為後台路由，一般使用者無權且會產生死鏈）。<br>🔒 抽屜**不含任何寫入元件**；單擊之「標示下游」行為（若實作）於雙擊時仍先發生並保留（比照 [F036](F036-lifecycle-tree-preview.md) `AC-D6`）。
- **AC-B21**（🔴 **節點掛載數＝套用可見性過濾後之數字**）：Given 某節點掛載 5 份文件，其中對當前 viewer 僅 2 份可見, When 渲染該節點, Then 其徽章逐字為 **`掛載 2 份程序書`** 且 **`data-visible-doc-count="2"`**（**非** 5，`AC-B16` ③）；Given 某節點之掛載文件對該 viewer **全部不可見**, Then 其徽章逐字為 **`尚未掛載程序書`** 且 **`data-visible-doc-count="0"`**（🔴 **該句話裡沒有數字，屬性是「0」唯一的機器可讀載體 ⇒ 兩者必須成對斷言**），雙擊抽屜為**空狀態**（**非錯誤**），且抽屜內**不得**出現不可見文件之任何欄位（含編號、書名、版次）。<br>🔴 **理由**：顯示未過濾之總數等於揭露「存在幾份你看不到的文件」，與 [F041](F041-user-subtype-business-scope.md) 之隱藏存在性裁決直接牴觸（[F043](F043-business-function-category.md) `[ASSUMPTION]` A5）。<br>📌 **語料鑑別力要求**：語料中該節點之可見數與總數**必須不同**（如 2 vs 5）——兩者相等時「有過濾」與「沒過濾」輸出相同。
- **AC-B22**（🔴 **deny-by-default 在查詢層，非前端過濾**）：Given 前台之三個端點（類別清單／樹狀圖資料／節點文件）, When 後端組裝回應, Then 可見性過濾**於查詢層施加**（比照 [F041](F041-user-subtype-business-scope.md)／[F033](F033-permission-aware-retrieval.md) 之既有紀律），**不得**先取全量再於前端過濾；Given 業務子分類使用者以直連網址帶入一個「其節點掛載文件對其全部不可見」之 `businessCategoryId`／`nodeId`, When 請求, Then 回應**不含任何不可見文件之欄位**；Given 直連一個**不存在**之 `businessCategoryId`, Then 依 [F043](F043-business-function-category.md) 回 404 `BUSINESS_CATEGORY_NOT_FOUND`。<br>🔒 **文件層之拒絕仍為 404 `DOCUMENT_NOT_FOUND`**（[F041](F041-user-subtype-business-scope.md) 既有裁決，**本 delta 不新增任何錯誤碼、不改變任何拒絕碼**）。
- **AC-B23**（🔴 **兩模式之可觸及文件集合完全相同**——本 delta 最重要之安全不變式）：Given 同一 viewer、同一份資料, When 分別列舉 ① `文件清單` 模式在**不套用任何篩選**下之全部文件、② `業務/功能類別樹狀圖` 模式在**全部類別、全部節點**之抽屜中所能看到之文件之聯集, Then ② **⊆** ①（樹狀圖模式**不得**成為繞過可見性限縮之側門）。<br>📌 **可測形狀**：以一位**業務子分類**使用者為 viewer，語料含至少一份「使用部門不相符」之文件且該文件**已掛載於某類別節點**——斷言該文件既不在 ①、也不在 ②。🔴 **語料若不含這樣一份文件，本條恆真、等於沒寫。**<br>⚠ **② ⊊ ① 是允許的**（未掛載於任何類別之文件只出現在清單模式）；本條約束的是**不得多出**，不是必須相等。
- **AC-B24**（🔒 **回歸鎖定：`文件清單` 模式與全部判定邏輯逐字不變**）：Given 本 delta 實作完成, When 逐項檢視, Then ——
  - ① **`文件清單` 模式之行為與本 delta 導入前逐字相同**：六項篩選（`制定公司`／`制定部門`／`制定室別`／`當責室長`／`狀態`／`循環別`）之組成與比對語意、置頂排序、編號降冪、卡片之八項標籤欄位與書名副標題（`AC-Y5`／`AC-Y6`）、分頁、對外 DTO 之欄位集合，**一律不變**；
  - ② **四項判定邏輯逐字不變**：`isDocVisibleToViewer`（[F041](F041-user-subtype-business-scope.md)）、`isPinned`／`isWithinSubtree`、已公告基底條件（`status = 有效 AND 公告日期 ≤ 今日`）、空狀態文案 **`查無符合結果`**；
  - ③ **既有測試全數維持綠燈且期望值未經修改**。
  - 🔴 **本條為本 delta 之「鬆一片牆」偵測器**：新增一種瀏覽模式時最可能的失誤，是為了讓樹狀圖拿得到資料而放寬既有查詢之可見性條件。
- **AC-B25**（浮水印疊加層）：Given 樹狀圖模式已渲染, When 檢視, Then 整頁對角平鋪疊加浮水印，格式與欄位順序比照 [NFR-007](../nfr.md#watermark)、固定機密聲明另起一行、由伺服器端當下動態產生；Then 縮放／平移時疊加層仍覆蓋整個可視區域（幾何要求比照 [F036](F036-lifecycle-tree-preview.md) `AC-T50`：**旋轉後之矩形須涵蓋畫板四角**，非僅 `inset` 等比放大）。<br>🔴 **本頁渲染 HTML、無 PDF 內容層可燒錄** ⇒ 疊加層為其唯一浮水印載體，**明文禁止**比照 [F020](F020-watermark.md) `AC-N7` 對前台 PDF 檢視器所做之「移除疊加層」（該裁決之前提是**該頁有內容層可燒錄**，本頁沒有——同一理由已見於 `AC-N66`）。<br>🔒 **`文件清單` 模式之浮水印處置一字不改**。
- **AC-B26**（🔒 **樹狀圖瀏覽不寫稽核；既有 VIEW 觸發點不變**）：Given 使用者進入樹狀圖模式、切換類別、雙擊節點開抽屜, When 檢視 `AUDIT_LOG`, Then **不產生任何列**（比照現行前台清單瀏覽——瀏覽清單本即不記稽核）；Given 使用者自抽屜點入某文件並開啟檢視器, Then 調閱稽核仍由既有之 `GET /public/documents/:id/view` 觸發，其 `actionType`／`targetType`／欄位與觸發時機**一字不改**（[F020](F020-watermark.md) `AC-N67` 之既有鎖定不受影響）。<br>🔴 **本條之範圍界線**：[F043](F043-business-function-category.md) `AC-34`／`AC-36` 之檢視／下載／列印稽核**僅適用於後台**類別樹狀圖預覽；前台不比照（前台無下載／列印——🟢 **2026-09-02 人類裁決**，明文條款＝[F043](F043-business-function-category.md) `AC-53`；原 `[ASSUMPTION]` A4 已結案）。
- **AC-B27**（空狀態之逐字文案）：Given 樹狀圖模式下 ——
  - ① 🔴 **（2026-09-02 就地限縮適用範圍——採甲案）** Given 使用者**經 deep link `?businessCategoryId=<某個 0 節點之類別 id>` 直接進入**該類別 → 顯示逐字 **`此類別尚未建立節點`**；<br>　🔴 **本分支不可經模式切換器之類別下拉到達（理由不得省略）**：`AC-B18` ② 規定下拉「僅納入對該 viewer **至少一份可見文件**之類別」，而**無任何節點之類別必然 0 掛載 ⇒ 0 可見** ⇒ 它**永遠不會出現在下拉裡**。<br>　🔴 **對 test-generator 之明文要求**：本條**只能**以 deep link 建案例；**不得**寫成「於下拉選到一個空類別」——那個操作**做不出來**，硬寫只會得到一個用自製 fixture 繞過 `AC-B18` 過濾的假綠案例。<br>　📝 **原 Given 逐字保留供追溯**：`OLD>` 「① 該類別**無任何節點** → 顯示逐字 `此類別尚未建立節點`；」——原文未限定入口，與 `AC-B18` ② 併讀後該分支**無可達路徑**（ui-ux 2026-09-02 查證，lead 裁定採甲案＝限縮 Given、保留文案）。
  - ② 節點抽屜中**無任何對該 viewer 可見之文件** → 顯示逐字 **`此節點沒有您可檢視的程序書`**；
  - ③ `AC-B18` 之類別集合為空 → 顯示逐字 **`目前沒有可瀏覽的業務/功能類別`**。
  - 🔒 **三者皆為新字串，與 `文件清單` 模式之 `查無符合結果` 為四件不同的事**——🔴 **明文禁止**把樹狀圖之任一空狀態改用 `查無符合結果`（那句話的語意是「你的篩選沒有命中」，而 ①②③ 都不是篩選造成的）；亦**禁止**反向把 `查無符合結果` 改成本節任一句（`AC-B24` ②）。

## Error Scenarios
- 空結果/萬用字元跳脫：見 [error-handling.md#public](../error-handling.md#public)。效能見 [NFR-001](../nfr.md#performance)。
- **業務/功能類別樹狀圖模式（🔵 DRAFT 2026-09-02）**：🔒 **零新增錯誤碼**——類別／節點不存在沿用 [F043](F043-business-function-category.md) 之 `BUSINESS_CATEGORY_NOT_FOUND`／`BUSINESS_CATEGORY_NODE_NOT_FOUND`（404），文件層拒絕仍為既有之 `DOCUMENT_NOT_FOUND`（404，[F041](F041-user-subtype-business-scope.md)），`mode` 參數不可辨識**不是錯誤**（`AC-B14`，靜默回退為預設）。
- **業務子分類之可見範圍限縮**（🟢 APPROVED）：拒絕一律回 **404 `DOCUMENT_NOT_FOUND`**（不新增錯誤碼），見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)；規則權威＝[F041](F041-user-subtype-business-scope.md)。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§3.5 5 層代碼前綴編碼、§9.1 任意層級指定、§9.2 子樹前綴展開）
- Diagram: [../diagrams/F019-public-list-sorting.mmd](../diagrams/F019-public-list-sorting.mmd)
- Data: [ICSOP_DOCUMENT](../data-model.md#document-entity), [DOC_USING_DEPT](../data-model.md#doc-using-dept)
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（`lifecycleDisplayName` 顯示規則、篩選值＝`lifecycleId`）
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（`isDocVisibleToViewer` 可見性判定、deny-by-default 涵蓋面、`SCOPE_NOTICE_*` 說明句；🟢 APPROVED 2026-08-11 人類閘門通過）
- Depends on: [F001](F001-auth-login-session.md), [F004](F004-org-sync.md), [F017](F017-backend-document-list.md); 詳情含 [F015](F015-document-cross-link.md), [F018](F018-usage-form-management.md)
- 定案: OQ-DATA-01（文件名稱為正式可讀標題欄位）、OQ-E06-01（搜尋＝編號＋名稱）、OQ-E06-02（前台僅顯示「已公告」＝有效且公告日期已過；**其「部門篩選以使用部門」之後半段已於 2026-08-16 因篩選器移除而不再適用**，前半段之可見狀態範圍不變）。
- **2026-08-16 使用者裁決**: OQ-D18-05／06／07／08／09（見 [§前台篩選器與顯示欄位改版 delta](#filter-column-delta)）。
- **2026-09-02 人類裁決（業務/功能類別瀏覽模式，🔵 DRAFT）**: 規則權威＝[F043](F043-business-function-category.md)；本頁之落點＝[§業務/功能類別瀏覽模式 delta](#business-category-browse-delta)（`AC-B12`～`AC-B27`）。前台拆為 `業務/功能類別樹狀圖`（**預設**）／`文件清單`（＝現行行為一字不改）兩種模式；樹狀圖呈現比照 [F036](F036-lifecycle-tree-preview.md)。🔒 **零新增錯誤碼、零判定邏輯變更**（`AC-B24`）。<br>**⚠ 🟢 **ui-ux-designer 已交付（2026-09-02）**：前台樹狀圖之 prototype 為 **`prototypes/30-public-category-tree.html`**（📝 `OLD>` spec-writer 原保留之編號為 `28-public-category-tree.html`，實際交付落在 `30`——**保留編號是預估、不是契約**），並於 `prototypes/03-public-list.html` 頂部新增模式切換器（逐字標籤見 `AC-B12`）。<br>**⚠ 待 system-architect**：① 三個前台端點之可見性過濾下推形狀（🔴 **效能紅線：節點掛載數不得 N+1**）；② 前台樹狀圖渲染元件是否與 `LifecycleTreePreviewPage` 共用及其差異點——見 [F043 §待 system-architect](F043-business-function-category.md#for-architect) 第 4／7 項。
- **待 system-architect（本 delta 新增）**：① 五項篩選選項之端點形狀（建議單一 `GET /public/documents/filter-options` 一次回傳五組，含可見性過濾）；② 「當責室長」主要∪次要之查詢下推方式（`DOC_SECONDARY_CHIEF` join vs 兩段查詢），須與 [F017](F017-backend-document-list.md) `AC-D7` 共用同一實作；③ 對外 DTO 之欄位裁剪落點（store 層 vs controller 層序列化）。
