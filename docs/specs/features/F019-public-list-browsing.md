# F019: 前台清單瀏覽（排序/搜尋/篩選）
Priority: P0-MVP | Status: 部分（unit 綠；端到端待 DOC_USING_DEPT 持久化，見 implementation-logs/public-F019-F022-impl.md） | Last Updated: 2026-07-23
Epic/Story: E06 / US-050, US-051, US-052

> 合併理由：排序（US-050）、關鍵字搜尋（US-051）、篩選（US-052）為同一前台清單畫面之組合行為，合為單一 feature。排序管線見 [F019-public-list-sorting.mmd](../diagrams/F019-public-list-sorting.mmd)。

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
- Given 部門篩選選定「營運管理部」(`JA000`), When 套用, Then 使用部門為 `JA000` 及其所有下層（如 `JAC00`、`JCHA0` 等 `JA` 開頭單位）之文件皆被列入。
- Given 部門篩選選定處室層 `JAC00`, When 套用, Then 僅列入 `orgCode LIKE 'JAC%'` 之使用部門文件，不含其他處室。
- Given 部門篩選之子樹展開, When 後端執行查詢, Then 以 `orgCode LIKE '<有效前綴>%'` 之前綴比對實作，不使用遞迴 CTE 或 closure table。

## Error Scenarios
- 空結果/萬用字元跳脫：見 [error-handling.md#public](../error-handling.md#public)。效能見 [NFR-001](../nfr.md#performance)。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§3.5 5 層代碼前綴編碼、§9.1 任意層級指定、§9.2 子樹前綴展開）
- Diagram: [../diagrams/F019-public-list-sorting.mmd](../diagrams/F019-public-list-sorting.mmd)
- Data: [ICSOP_DOCUMENT](../data-model.md#document-entity), [DOC_USING_DEPT](../data-model.md#doc-using-dept)
- Depends on: [F001](F001-auth-login-session.md), [F004](F004-org-sync.md), [F017](F017-backend-document-list.md); 詳情含 [F015](F015-document-cross-link.md), [F018](F018-usage-form-management.md)
- 定案: OQ-DATA-01（文件名稱為正式可讀標題欄位）、OQ-E06-01（搜尋＝編號＋名稱）、OQ-E06-02（前台僅顯示「已公告」＝有效且公告日期已過、部門篩選以使用部門）。
