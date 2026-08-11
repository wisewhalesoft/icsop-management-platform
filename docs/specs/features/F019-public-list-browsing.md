# F019: 前台清單瀏覽（排序/搜尋/篩選）
Priority: P0-MVP | Status: 部分（unit 綠；**`DOC_USING_DEPT` 讀取端已接線**（public-seams：分離查詢＋JS 分組，置頂/部門篩選端到端可用）；**置頂語意定案改為子樹祖先鏈**（取代 OQ-F019-03 精確比對暫定假設）；前台頁首/置頂標題已補使用者部門路徑；int 已備未跑（test/int/public-documents.itest.ts）。見 implementation-logs/public-seams-impl.md） | Last Updated: 2026-07-24
Epic/Story: E06 / US-050, US-051, US-052

> 合併理由：排序（US-050）、關鍵字搜尋（US-051）、篩選（US-052）為同一前台清單畫面之組合行為，合為單一 feature。排序管線見 [F019-public-list-sorting.mmd](../diagrams/F019-public-list-sorting.mmd)。
> **2026-08-07 additive delta（🟢 APPROVED（2026-08-07 人類閘門通過））**：「循環」篩選與循環別顯示須反映循環子分類。規則權威＝[F040](F040-lifecycle-subcategory.md)；排序、置頂、可見性與既有條款皆不變。
> **🟢 2026-08-11 restrictive delta（APPROVED，人類閘門通過）**：「業務」子分類之一般使用者，其可見範圍限縮於「使用部門相符」之已公告文件；並於清單頂部改以專屬說明句告知其瀏覽範圍（AC-U7）；**詳情頁 404 畫面之前端呈現另於 2026-08-11 補訂為 AC-U8**（原 delta 只規範後端回應、未規範畫面，見 [F041 §F2](F041-user-subtype-business-scope.md#f2-fidelity-gap)）。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**（U＝user subtype），與 F040 之 `AC-S#` 批次區隔。⚠ 此為本 feature **首次出現「限縮既有可見範圍」之 delta**（既往 delta 皆為 additive），對「其他」子分類與其餘 4 種角色**行為完全不變**（AC-U5 回歸鎖定）。

## Description
前台 RWD 清單以固定邏輯排序：文件使用部門與登入使用者所屬部門相符者「置頂」，其餘依 ICSOP 文件編號「降冪」。**一般使用者僅可見「已公告」文件（＝儲存狀態＝有效 且 公告日期 ≤ 今日；「進度中」＝有效但公告日期未到，與 失效/作廢，一律由後端過濾隱藏，定案）。** 「已公告」為顯示/可見衍生，**儲存狀態欄位仍為 有效/失效/作廢**（不新增儲存狀態值）。提供關鍵字搜尋（文件編號＋文件名稱）與部門/狀態/循環三種篩選；部門篩選以「使用部門」比對，**可選任意層級（本部／部／處室／課），判定時自動展開子樹**；搜尋與篩選以 AND 組合。排序/搜尋/篩選皆於後端實作（分頁一致）。

## 部門篩選之層級與子樹展開（契約 §9，定案 2026-07-20）

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
1. 開啟前台清單 → 後端強制基底條件 `status = 有效 AND 公告日期 ≤ 今日`（即「已公告」；一般使用者）→ 套用篩選（部門/狀態/循環，AND；部門篩選以選定單位之有效前綴展開子樹比對）→ 套用關鍵字（編號＋名稱，AND，萬用字元跳脫）。
2. 依「文件使用部門含使用者部門」拆置頂區與其餘區。
3. 兩區各依文件編號降冪，置頂區在前、其餘在後，合併分頁。
4. 每筆顯示：文件編號、文件名稱、制定部門、使用部門、文件狀態、公告日期、內容摘要。
5. 點擊文件進入詳情/檢視器（F020），詳情含關聯使用表單（F018）與連結點（F015）。

## Alternative Flows
- 清除篩選：回復未篩選狀態並維持預設排序。

## Edge Cases
- 使用者部門查無相符文件：直接依編號降冪，無置頂區塊錯誤顯示。
- 使用部門為多部門，其一相符：仍列入置頂。
- 選擇上層單位（如本部）作為部門篩選：子樹內所有層級之文件皆納入，不因層級不同而漏列。
- 選擇最細單位（課層）作為部門篩選：其有效前綴為 4 碼（如 `JCHA`），僅比對該課，不誤含同一處室下其他課。
- 篩選關鍵字或前綴含 `%` `_`：前綴比對之 `LIKE` 亦須跳脫萬用字元。
- 分頁載入第二頁：排序規則維持一致（後端權威）。
- 關鍵字含 `% _ '`：正確跳脫，無錯誤/注入。
- 一般使用者僅可見「已公告」文件（有效且公告日期已過）；「進度中」（有效但公告日期未到）與 失效/作廢 一律由後端過濾（不可依前端傳入條件繞過）（定案 OQ-E06-02）。

## Postconditions
- 使用者取得符合條件、依固定規則排序之清單。

## Acceptance Criteria
- Given 使用者部門為 X, When 開啟清單, Then 使用部門含 X 的文件置頂，其餘於下方。
- Given 置頂區以外文件, When 呈現, Then 依 ICSOP 文件編號降冪排序。
- Given 清單載入完成, When 呈現, Then 每筆至少顯示編號/名稱/制定部門/使用部門/狀態/公告日期（可含內容摘要）。
- Given 關鍵字為某文件編號或名稱之部分字串, When 搜尋, Then 僅顯示符合者並維持排序規則。
- Given 已套用篩選, When 同時輸入關鍵字, Then 回傳同時符合（AND）之結果。
- Given 同時選部門+狀態+循環, When 套用, Then 回傳三條件交集。
- Given 查無符合, When 搜尋/篩選, Then 顯示「查無符合結果」，非錯誤畫面。
- Given 已套用篩選, When 點擊清除篩選, Then 回復完整清單與預設排序。
- Given 一般使用者開啟前台清單, When 載入, Then 僅回傳「已公告」（`status=有效 AND 公告日期≤今日`）文件；「進度中」/失效/作廢即使 API 夾帶其他條件亦由後端強制過濾。
- Given 部門篩選下拉, When 展開, Then 可選擇本部／部／處室／課任一層級之單位。
- Given 部門篩選選定「營運管理部」(`JA000`), When 套用, Then 使用部門為 `JA000` 及其所有下層（如 `JAC00`、`JAD00` 等 `JA` 開頭單位）之文件皆被列入。<br>📝 **文字勘誤（2026-08-10）**：本條原舉例為「`JAC00`、`JCHA0`」，但 `JCHA0` 之有效前綴為 `JCHA`（第 2 碼為 `C`），**並非 `JA` 開頭**（`'JCHA0'.startsWith('JA')` 為 `false`），與 [public-seams-test-design.md](../test-design/public-seams-test-design.md) `TS-PS-F019-004`「`'JCHA0'` 不涵蓋 `JAC00`（非其祖先）」互相矛盾。已改用同分支之真實代碼 `JAD00`（同部另一處室，見 `TS-PS-ORG-004`）。**本勘誤僅修正 AC 例句之代碼舉例，不改變任何已實作且已測試通過之判定邏輯**（`isWithinSubtree` 前綴比對行為完全不變，既有測試期望值無須修改）。
- Given 部門篩選選定處室層 `JAC00`, When 套用, Then 僅列入 `orgCode LIKE 'JAC%'` 之使用部門文件，不含其他處室。
- Given 部門篩選之子樹展開, When 後端執行查詢, Then 以 `orgCode LIKE '<有效前綴>%'` 之前綴比對實作，不使用遞迴 CTE 或 closure table。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**：Given 前台清單／詳情呈現某文件之「循環別」, When 渲染, Then 顯示字串由 `lifecycleDisplayName` 產生——有子分類 → `名稱（子分類）`（全形括號無空白）、無子分類 → `名稱`；前台與後台（[F017](F017-backend-document-list.md)）之顯示字串完全一致。
- **AC-S2**：Given 池中有「銷售及收款循環（消金）」與「銷售及收款循環（企金）」, When 展開前台「循環」篩選, Then 呈現**兩個相異選項**（各以 `lifecycleDisplayName` 顯示），篩選值為各自 `lifecycleId`（**非** `name` 字串）；When 選定「消金」, Then 結果僅含該具體循環之文件，不含同名「企金」之文件，且與部門／狀態篩選之 AND 組合語意不變。

### 業務子分類可見範圍限縮 delta（🟢 APPROVED 2026-08-11 人類閘門通過；規則權威＝[F041](F041-user-subtype-business-scope.md)）

> 本節之全部 AC 已定案，前提選項均經 2026-08-11 人類裁決確認：**OQ-E08-04→B（子分類旗標）、OQ-E08-05→A（子樹展開）、OQ-E08-06→C（本輪收斂至前台各路徑）、OQ-E08-07 4a/4b/4c→皆 A、OQ-E06-03→A（404）**。
> 逐題裁決結果與未採選項之追溯見 [F041 §OQ 裁決紀錄](F041-user-subtype-business-scope.md#oq-dependency)。
> **語意轉變（本 delta 之核心）**：現行 F019 對**全體**一般使用者僅以「使用部門相符」決定**置頂排序**、**不限制可見性**；
> 本 delta 對**業務**子分類使用者，將同一判定式（`isWithinSubtree`）由**排序用途**升級為**可見性過濾用途**（deny-by-default）。
> **判定式本身不變、不新增第二套比對邏輯**（[F041](F041-user-subtype-business-scope.md) INV-4）。

- **AC-U1**：Given viewer 為業務子分類之一般使用者（`roleCode='User'`、`userSubtype='business'`、`orgCode='JAC00'`）, When 呼叫 `buildPublicList`, Then 於**既有「已公告」基底條件之後**追加「使用部門相符」過濾（AND）；使用部門不相符之已公告文件**不出現於 `items` 且不計入 `total`**（不得以總筆數洩漏其存在）。〔[F041](F041-user-subtype-business-scope.md) AC-14〕
- **AC-U2**：Given 業務 viewer 之清單結果, When 檢視各項 `pinned` 旗標, Then **全部為 `true`**——置頂區＝全部結果、其餘區恆為空陣列。此為**預期退化行為**，既有置頂/排序/分頁邏輯**不需任何特殊分支**（OQ-E08-07 4a 選項 A）。〔[F041](F041-user-subtype-business-scope.md) AC-15〕
- **AC-U3**：Given 業務 viewer 套用任意「部門／循環／關鍵字」篩選組合, When 送出查詢, Then 業務限制與各條件以 **AND** 組合，不相符文件於**任何**排列組合下皆不出現；部門篩選選到其子樹範圍外之單位時，`items === []`、`total === 0`，顯示既有**空狀態**文案「查無符合結果」（逐字、不因子分類分支）、**非錯誤**（✅ OQ-E08-07 4b／4c 皆定案為選項 A：下拉不限縮、空狀態文案不分支）。⚠ **空狀態文案不分支 ≠ 頂部說明句不分支**——後者已裁決為分支，見 AC-U7。〔[F041](F041-user-subtype-business-scope.md) AC-16／AC-17／AC-33〕
- **AC-U4**：Given 池中同時存在「非已公告文件」與「已公告但使用部門不相符之文件」、viewer 為業務子分類, When 呼叫 `buildPublicList`, Then `hiddenCount` **僅計前者**（被強制基底條件隱藏者），**不含**因業務限制被過濾者——避免以計數洩漏他部門文件之存在數。〔[F041](F041-user-subtype-business-scope.md) AC-18〕
- **AC-U5**（**回歸鎖定**）：Given viewer 為「其他」子分類之一般使用者、或任一非 `'User'` 角色, When 呼叫 `buildPublicList`, Then 其輸出（`items` 順序與內容、`total`、`page`、`pageSize`、`hasNext`、`hiddenCount`、每項 `pinned`）與本 delta 導入前**逐欄相同**；既有 `public-list.spec.ts` 之全部案例維持綠燈，**不得修改任何既有期望值**。〔[F041](F041-user-subtype-business-scope.md) AC-19〕
- **AC-U6**（**詳情與直連 URL**）：Given 業務 viewer 開啟一筆已公告但使用部門不相符之文件詳情（含經他人分享之直連網址）, When 請求送出, Then 回 **404 `DOCUMENT_NOT_FOUND`**（✅ OQ-E06-03 定案為選項 A＝隱藏存在性，**非** 403 `PERMISSION_DENIED`；既有錯誤碼、不新增），且**不回傳任何中繼資料**（`documentNumber`／`documentName`／`draftingDeptName`／`usingDeptNames`／`contentSummary` 皆不得出現），亦不執行任何名稱解析；其錯誤訊息文案須與「文件確實不存在」逐字相同。〔[F041](F041-user-subtype-business-scope.md) AC-20／AC-21〕
- **AC-U7**（**2026-08-11 人類閘門新增——清單頂部範圍說明句**）：Given 前台清單頁渲染頂部說明句（DOM 掛鉤 `#scopeNotice`）, When viewer 為**受限者**（`roleCode='User'` 且 `userSubtype='business'`，**含 `orgCode` 為空之孤兒帳號**）, Then 其文字逐字為 `SCOPE_NOTICE_BUSINESS`：<br>`業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。`<br>Given viewer 為**非受限者**（「其他」子分類或任一非 `'User'` 角色）, Then 其文字逐字為 `SCOPE_NOTICE_OTHER`（**既有文案一字未改**）：<br>`一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。`<br>📌 **孤兒帳號刻意沿用業務句、不另立第三句**（另立將以文案差異宣告帳號異常，牴觸 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)）。逐字權威＝`prototypes/03-public-list.html` 之具名常數；前端須以常數持有供 vitest 直接 import 斷言。〔[F041](F041-user-subtype-business-scope.md) AC-40〕
- **AC-U8**（**2026-08-11 補訂——詳情頁 404 畫面之前端呈現**；權威＝`prototypes/04-public-document-detail.html:161`～`:164`）：Given 前台文件詳情頁自後端取得 **404 `DOCUMENT_NOT_FOUND`**，**無論成因**為①文件確實不存在 ②文件存在但非已公告 ③業務子分類之使用部門不相符, When 渲染, Then 三者渲染**完全相同之單一 not-found 畫面**（同一元件、同一文案；該元件**不得接受任何可區分成因之參數**——可區分即以呈現差異還原存在性，架空 OQ-E06-03）；其逐字內容為圖示鍵 `file-x`（紅色、圓形淺紅底）、標題 `查無此文件`、說明 `查無此文件，或該文件尚未公告。`、錯誤碼列 `DOCUMENT_NOT_FOUND · 404`（等寬字體）；且該畫面之 DOM **不得出現任何文件欄位值**（以 `documentNumber`／`documentName`／`draftingDeptName`／`usingDeptNames`／`contentSummary` 逐項 `queryByText === null` 斷言，涵蓋「先渲染內容再覆蓋」之實作）。<br>⚠ **本條變更既有畫面之文案**：現行實作為 `文件可能尚未公告或已下架。` ＋ `inbox` 圖示 ＋ 無錯誤碼列，三者皆與 prototype 不符，且該文案未見於任何 prototype——依 prototype 為權威之原則以 prototype 為準。既有「返回文件瀏覽」按鈕**不在** prototype 拒絕面板之定義範圍內，**維持現狀不得移除**。<br>📌 AC-U6 規範的是**後端回應**（回什麼碼、不回哪些欄位），本條規範的是**前端呈現**（畫面長什麼樣、不顯示哪些欄位）——原 delta 缺後者，故實作漂移無人可擋。〔[F041](F041-user-subtype-business-scope.md) AC-46〕

## Error Scenarios
- 空結果/萬用字元跳脫：見 [error-handling.md#public](../error-handling.md#public)。效能見 [NFR-001](../nfr.md#performance)。
- **業務子分類之可見範圍限縮**（🟢 APPROVED）：拒絕一律回 **404 `DOCUMENT_NOT_FOUND`**（不新增錯誤碼），見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)；規則權威＝[F041](F041-user-subtype-business-scope.md)。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§3.5 5 層代碼前綴編碼、§9.1 任意層級指定、§9.2 子樹前綴展開）
- Diagram: [../diagrams/F019-public-list-sorting.mmd](../diagrams/F019-public-list-sorting.mmd)
- Data: [ICSOP_DOCUMENT](../data-model.md#document-entity), [DOC_USING_DEPT](../data-model.md#doc-using-dept)
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（`lifecycleDisplayName` 顯示規則、篩選值＝`lifecycleId`）
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（`isDocVisibleToViewer` 可見性判定、deny-by-default 涵蓋面、`SCOPE_NOTICE_*` 說明句；🟢 APPROVED 2026-08-11 人類閘門通過）
- Depends on: [F001](F001-auth-login-session.md), [F004](F004-org-sync.md), [F017](F017-backend-document-list.md); 詳情含 [F015](F015-document-cross-link.md), [F018](F018-usage-form-management.md)
- 定案: OQ-DATA-01（文件名稱為正式可讀標題欄位）、OQ-E06-01（搜尋＝編號＋名稱）、OQ-E06-02（前台僅顯示「已公告」＝有效且公告日期已過、部門篩選以使用部門）。
