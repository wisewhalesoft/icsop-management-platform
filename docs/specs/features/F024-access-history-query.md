# F024: 文件調閱歷程查詢後台
Priority: P0-MVP | Status: Implemented — audit-query worktree 2026-07-24：畢業（OQ-AQ-01 WHERE/ORDER/OFFSET 下推 + IX_AUDIT_LOG_targetType_occurredAt 索引 + 12 int（TS-AQ-INT-001~012）+ TS-017/018 + 前端保真三修）；索引已對真 SOP migration:run 驗證｜**匯出鈕失效之修復 delta：🟢 APPROVED（2026-08-18 人類閘門裁決，`AC-F1`～`AC-F19`）——待實作** | Last Updated: 2026-08-18
Epic/Story: E07 / US-061

> **🔴 2026-08-18 BUG-FIX delta——「匯出」鈕實際上不產生任何檔案，卻無條件回報成功**：`onExport()` 丟棄 `exportAccessHistory()` 之回傳值並無條件顯示「已匯出查詢結果（CSV，草案格式）」，而端點回的是 JSON `{rows,total}`、前端從未產生檔案。修復＝**F024 正式成為 [error-handling.md#export](../error-handling.md#export) 之第四處匯出**（真正輸出 CSV、沿用共用產生器與共用上限／錯誤碼）。逐條見 [§匯出鈕失效之修復 delta](#export-fix-delta)（`AC-F1`～`AC-F19`）。<br>**本 delta 取代** [F037](F037-document-change-history.md#export-delta) `AC-D8` 與 [F039](F039-appendix-management.md#export-delta) `AC-D10` 之 F024 鎖定條款（範圍紀律 J 於本輪正式解除，`AC-F17`）。**查詢（`GET /admin/access-history`）之行為、欄位、篩選、分頁一律不變。**

## Description
後台依**類型**（文件／循環／變更）、人員（姓名/員工編號）、對象（文件編號/名稱、循環名稱/ID）、時間區間任意組合查詢調閱歷程。查詢結果依角色限縮可視範圍：系統管理員／ICSOP 管理員全公司唯讀；主管／部門窗口／一般使用者無此功能。可展開單筆明細（含當次浮水印快照）。

**涵蓋範圍（OQ-E07-03 定案）**：本頁**納入循環與變更歷程之調閱稽核**（不另建查詢頁籤）——除既有文件調閱（`VIEW`/`DOWNLOAD`/`PRINT`）外，涵蓋循環樹狀圖預覽（[F036](F036-lifecycle-tree-preview.md)：`LIFECYCLE_VIEW`/`LIFECYCLE_DOWNLOAD`/`LIFECYCLE_PRINT`）與變更歷程檢視（[F037](F037-document-change-history.md)：`CHANGE_LOG_VIEW`；[F038](F038-lifecycle-tree-change-history.md)：`LIFECYCLE_CHANGELOG_VIEW`/`LIFECYCLE_CHANGELOG_DOWNLOAD`）。以 `AUDIT_LOG.targetType` 區分（已支援 `DOCUMENT`/`USAGE_FORM`/`LIFECYCLE`/`DOCUMENT_CHANGE_LOG`/`LIFECYCLE_CHANGE_LOG`，見 OQ-E07-02），**無需 schema 變更**。

## Preconditions
- 操作者具查詢權（F025：僅 SysAdmin／ICSOPAdmin 全公司唯讀；主管／部門窗口／一般使用者無此功能）。
- 稽核資料由 F023 產生。

## Main Flow
1. 進入「文件調閱歷程」頁，選擇**類型篩選**（文件／循環／變更；預設全部）並輸入人員/對象/時間區間任意組合。
2. 送出查詢 → 回傳符合之稽核清單（分頁），每筆顯示操作人員、員工編號、公司、部門、室別、角色、**對象**、操作類型、操作時間（新到舊）。
3. **顯示欄位依類型切換**：類型＝文件 → 顯示文件編號/名稱；類型＝循環 → 顯示循環 ID/名稱；類型＝變更 → 顯示被查詢之變更歷程對象（文件或循環）。混合查詢（全部）時「對象」欄以類型標籤＋對象識別統一呈現。
4. 後端強制驗證角色（僅 SysAdmin／ICSOPAdmin 可存取本頁，不信任前端傳入條件）。
5. 點擊單筆 → 展開完整明細（含浮水印快照；無浮水印之動作類型則該欄留空）。

## Alternative Flows
- **匯出查詢結果（2026-08-18 定案，推翻原「格式草案 CSV/Excel」之免責措辭）**：輸出 **CSV（UTF-8 with BOM）**，範圍＝符合當前查詢條件之**全部結果**（非當前分頁），沿用 [error-handling.md#export](../error-handling.md#export) 之共用規則與 `EXPORT_ROW_LIMIT_EXCEEDED`。逐條見 [§匯出鈕失效之修復 delta](#export-fix-delta)。**Excel（`.xlsx`）不在範圍內**（本輪明確不做，見該節之範圍界線）。保留年限見 [NFR-003](../nfr.md#audit-retention)。
- 顯示欄位「公司」「角色」由 ORG_UNIT／ACCOUNT（roleCode）join 衍生供顯示/篩選；稽核**儲存**之身分快照仍以浮水印來源為準（[F023](F023-audit-logging.md)），未必新增儲存欄位。

## Edge Cases
- 查詢條件為空：要求至少一項條件或套用預設近 30 天，避免全表掃描。
- 主管／部門窗口／一般使用者呼叫本功能 API：一律回 403（無文件調閱歷程查詢權）。
- **非文件類型之紀錄無 `documentId`**：本頁原假設每筆皆有 `documentId`，因納入循環/變更類型後該欄改為**條件必填**（僅 `targetType=DOCUMENT`/`USAGE_FORM` 時有值）；查詢結果表格與匯出範本需容許該欄為空並改以「對象」欄呈現（見 architecture-spec §8.1 風險#14）。
- 以「文件編號」查詢但類型選「循環」：無結果（條件互斥），顯示空狀態而非錯誤。

## Postconditions
- 稽核需求發生時可快速定位特定文件/人員之調閱紀錄。

## Acceptance Criteria
- Given 以文件編號查詢, When 送出, Then 回傳該文件所有調閱紀錄，時間新到舊。
- Given 以時間區間+人員組合查詢, When 送出, Then 回傳同時滿足兩條件之結果。
- Given 主管呼叫本功能 API, When 請求, Then 回 403（主管無文件調閱歷程查詢權）。
- Given 部門窗口或一般使用者呼叫本功能 API, When 請求, Then 回 403。
- Given 查詢未輸入任何條件, When 送出, Then 要求至少一項條件或套用近 30 天預設。
- Given 點擊單筆紀錄, When 展開, Then 顯示完整明細含浮水印快照（無浮水印之動作類型該欄留空）。
- Given 類型篩選選擇「循環」, When 查詢, Then 僅回傳循環相關調閱紀錄（`LIFECYCLE_VIEW`/`LIFECYCLE_DOWNLOAD`/`LIFECYCLE_PRINT`），並以循環 ID/名稱呈現「對象」欄。
- Given 類型篩選選擇「變更」, When 查詢, Then 僅回傳變更歷程檢視紀錄（`CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD`）。
- Given 類型篩選為「全部」（預設）, When 查詢, Then 回傳文件/循環/變更三類混合結果，「對象」欄以類型標籤＋對象識別統一呈現。

### 匯出鈕失效之修復 delta（🔴 2026-08-18 人類閘門裁決；`AC-F1`～`AC-F19`） {#export-fix-delta}

> **上游素材**：[stories/2026-08-18-f024-export-defect.md](../../stories/2026-08-18-f024-export-defect.md)（product-analyst）。
> **決策追溯**：[open-questions.md](../open-questions.md) `OQ-D18-26`（**採選項 (a)**：讓匯出真的輸出 CSV 並沿用共用產生器）、`OQ-E07-10`（meta-audit，**部分推翻**：匯出納入、查詢仍不納入）、`OQ-E07-12`／`OQ-E07-13`／`OQ-E07-14`／`OQ-E07-15`（本輪新登錄之既有缺口，皆**不修**；其中 `OQ-E07-15` 之照抄風險已由 `AC-F13` 擋下）。
> **共用規則權威**：[error-handling.md#export](../error-handling.md#export)——本 delta 使 F024 成為該節之**第四處**匯出，**不另立規則、不新增錯誤碼**。
>
> **缺陷本體（本批次之核心形狀）**：`onExport()` 呼叫 `exportAccessHistory()` 後**丟棄回傳值**，並**無條件**顯示成功訊息「已匯出查詢結果（CSV，草案格式）」；端點回的是 JSON `{rows,total}`，前端從未產生任何檔案 ⇒ **系統陳述了一件沒有發生的事**。此為本 repo 反覆出現之同型缺陷（「載體存在 ≠ 效果成立」）。故本批次**不以「按下匯出會下載 CSV」為足**，另以 `AC-F1` 將「成功回饋之出現」與「檔案確實產生」鎖為**嚴格同真值**。
>
> **AC 編號選字理由**：本檔既有 AC **無字母前綴**（純 Given/When/Then 列），故無同檔衝突。本 repo 之批次字母**依 delta 批次全域配發**（`D`＝2026-08-16 缺失 delta；`E`＝2026-08-18 第一批，[F001](F001-auth-login-session.md) `AC-E1`～`AC-E15`／[F017](F017-backend-document-list.md) `AC-E1`～`AC-E9`），使「F037 `AC-D8`」一類**跨檔引用**不致歧義 ⇒ 本批（2026-08-18 之第二個獨立 delta）取 **`F`**。

#### 範圍界線（不得擴張）

| 項目 | 本輪處置 |
|---|---|
| 主表格 10 欄之 CSV 匯出（含端點契約、上限、回饋文案、稽核、取代條款） | ✅ **做**（`AC-F1`～`AC-F19`） |
| 展開明細專屬之「浮水印快照」「對象名稱／說明」 | ❌ **不匯出**（人類裁決；比照 F037／F038／F039「匯出對應主查詢列表」之既有先例。負向斷言見 `AC-F14`） |
| Excel（`.xlsx`） | ❌ **不做**（原規格「格式草案 CSV/Excel」之 Excel 部分不在本輪） |
| F024 之**查詢**動作記稽核 | ❌ **不做**——查證屬實：`GET /admin/access-history` 目前完全不寫稽核。**本輪只登錄、不寫 AC**，見 `OQ-E07-12` |
| 畫面呈現層之三項既有列舉／格式缺口 | ❌ **不修**（`APPENDIX` 列之「類型」顯示、兩個無中文標籤之 `actionType`、畫面時間戳依瀏覽器時區）。登錄於 `OQ-E07-13`；`AC-F5`／`AC-F6` 明列其對 CSV 之影響 |
| F037／F038／F039 三處之超限訊息 `{N}` 恆為 10000 | ❌ **不修**（跨 feature，登錄於 `OQ-E07-14`）。⚠ 但 `AC-F9` 要求 F024 之 `{N}` 為**實際筆數** ⇒ 實作上有相依，見該條之提報事項 |

#### 匯出行為（端到端）

- **AC-F1**（🔴 **缺陷本體之鎖定條款**：成功回饋與檔案產生**嚴格同真值**）：Given 使用者位於文件調閱歷程查詢頁, When 點擊「匯出」, Then 下列三分支**全稱成立**——
  - ① **端點回 2xx 且回傳 CSV 位元組**：發生**恰一次**瀏覽器下載副作用（`URL.createObjectURL` 被呼叫、且一個帶 `download` 屬性之 `<a>` 被 `click()`），**且**顯示成功回饋（逐字見 `AC-F9`）。
  - ② **端點回任一非 2xx**（400 超限／403／500 等）：**不得**發生任何下載副作用（`URL.createObjectURL` 呼叫次數為 **0**），**且**畫面**不得**出現 `tone='success'` 之回饋，**且**畫面**不得**出現逐字片段 `已匯出`。
  - ③ **`fetch` 本身 reject**（網路層失敗）：同 ②。
  - **不變式（本條之真正標的）**：「成功回饋出現」**蘊含**「下載副作用出現」。⇒ 任何「不依賴回應結果即顯示成功」之實作一律違反本條。
  - **機器驗證**：新增 `frontend/src/pages/AccessHistoryPage.export.test.tsx`（體例比照既有 `ChangeHistoryPage.export.test.tsx`／`AppendixManagementPage.export.test.tsx`）；以 stub 之 `fetch` 分別回 2xx CSV／400／reject，斷言 `URL.createObjectURL` 之呼叫次數與畫面文字。**分支 ② 之「呼叫次數為 0」為本缺陷之唯一充分判準**，不得以「有顯示錯誤訊息」代替。

- **AC-F2**（端點契約：回 CSV 位元組，不再回 JSON）：Given 具權限之操作者, When `GET /admin/access-history/export` 成功回應, Then ① `Content-Type` 為 `text/csv; charset=utf-8`；② `Content-Disposition` 為 `attachment; filename="access_history_{YYYYMMDD}_{HHmmss}.csv"`（時間為伺服器時間 UTC+8，由既有 `exportFileName('access_history', now)` 產生）；③ body 之前三個位元組為 `EF BB BF`；④ 回應**不得**為 JSON、**不得**含 `{"rows"` 或 `"total"` 之 JSON 形狀。<br>🔴 **`res.send(buffer)`（送 Buffer，非字串）**——送字串會讓 Express 自行決定編碼、BOM 可能悄悄壞掉而測試仍綠（[error-handling.md#export](../error-handling.md#export)）。

- **AC-F3**（前端傳輸方式：`downloadViaBlob`，非 `apiFetch`／非 `window.open`）：Given 前端匯出流程, When 檢視 `frontend/src/api/endpoints.ts` 之 `exportAccessHistory()`, Then ① 其回傳型別為 **`Promise<void>`**（不再為 `Promise<{rows,total}>`）；② 其實作經 **`downloadViaBlob('/admin/access-history/export' + query, 'access_history.csv')`**；③ 全站原始碼於本匯出路徑上**不得**出現 `window.open`／`<a href={…export…}>`／`apiFetch(...export...)`。<br>🔴 **理由（既有教訓，不得重犯）**：top-level navigation 送 `Accept: text/html` 會撞 SPA fallback，使用者拿到一份副檔名 `.csv` 但內容是 app shell 的檔案——**沒有錯誤、沒有任何測試會抓到**（2026-07-25 瀏覽器煙霧測試已踩過同型 bug；`architecture-spec.md` §10.1 明文禁令）。

- **AC-F4**（欄位集合、順序與表頭逐字）：Given 匯出成功, When 檢視 CSV 第 1 列, Then 其逐字為——
  ```
  操作人員,員工編號,公司,部門,處/室,角色,類型,對象（文件／循環）,操作類型,操作時間
  ```
  **恰 10 欄**，順序與畫面主表格由左至右一致；畫面之第 11 欄（展開箭頭）**不匯出**。<br>📝 **唯一與畫面表頭不逐字相同之處＝「操作時間」**：畫面表頭為 `操作時間（新→舊）`，其中 `（新→舊）` 是**排序說明**而非欄名，於檔案內無資訊量（列序另由 `AC-F7` 鎖定）。此處置沿用 [error-handling.md#export](../error-handling.md#export)「不在每格附 `(UTC+8)`」之同一理由。**其餘 9 欄之表頭與畫面逐字相同**（含 `處/室` 之半形斜線與 `對象（文件／循環）` 之全形括號與全形斜線，不得改寫）。

- **AC-F5**（🔴 值層：列舉欄一律輸出中文標籤）：Given 匯出成功, When 檢視資料列之儲存格值, Then 下列成立——
  - ① **「角色」欄**依下表輸出中文標籤，**不得**輸出 `roleCode`：`SysAdmin`→`系統管理員`／`ICSOPAdmin`→`ICSOP 管理員`／`Supervisor`→`主管`／`DeptContact`→`部門窗口`／`User`→`一般使用者`。`roleCode` 為 `null` 或不在上表者 → **空儲存格**。
  - ② **「操作類型」欄**依下表輸出中文標籤，**不得**輸出列舉代碼：`VIEW`→`檢視`／`DOWNLOAD`→`下載`／`PRINT`→`列印`／`LIFECYCLE_VIEW`→`循環樹狀圖檢視`／`LIFECYCLE_DOWNLOAD`→`循環樹狀圖下載`／`LIFECYCLE_PRINT`→`循環樹狀圖列印`／`CHANGE_LOG_VIEW`→`文件變更歷程檢視`／`LIFECYCLE_CHANGELOG_VIEW`→`循環變更歷程檢視`／`LIFECYCLE_CHANGELOG_DOWNLOAD`→`新舊樹狀圖下載`／**`ACCESS_HISTORY_EXPORT`→`調閱歷程匯出`（本 delta 新增，見 `AC-F13`）**。
    - 🔴 **刻意與畫面不同、非疏漏（2026-08-18 人類明確認可此代價）**：畫面該欄顯示**複合格式** `VIEW · 檢視`（代碼＋標籤），CSV **只出中文標籤**。依 [error-handling.md#export](../error-handling.md#export) 之通則「列舉／代碼欄一律輸出中文標籤，不得輸出屬性名或列舉代碼」，通則**優先於**「逐字比照畫面」。⚠ **日後不得以「CSV 與畫面不一致」為由改回輸出代碼**；若要收斂，方向為改畫面而非改 CSV。
    - ⚠ **fallback（既有缺口之承接，非本輪新增）**：`LIFECYCLE_DELETE`（F007）與 `ALERT_RESOLVED`（F006）於畫面之對照表中**不存在**，現況顯示裸代碼。CSV 沿用**同一 fallback＝輸出原代碼**（不留空、不臆造標籤）。此二值之中文標籤屬既有缺口，登錄於 `OQ-E07-13`，**本輪不補**。
  - ③ **「類型」欄**輸出 `文件`／`循環`／`變更` 三值之一，推導與畫面**同一份規則**：`DOCUMENT`／`USAGE_FORM` → `文件`；`LIFECYCLE` → `循環`；其餘（含 `DOCUMENT_CHANGE_LOG`／`LIFECYCLE_CHANGE_LOG`／`ORG_CHANGE_ALERT`／`APPENDIX`）→ `變更`。<br>⚠ **`APPENDIX` → `變更` 為既有不一致之承接**：後端 `kindToTargetTypes('文件')` 將 `APPENDIX` 歸「文件」類，而畫面推導將其顯示為「變更」⇒ 以「文件」篩選會查到一列顯示為「變更」的紀錄。**本輪刻意不修**（超出範圍，且修它會同時改動畫面既有行為），登錄於 `OQ-E07-13`。**CSV 與畫面保持一致優先**——兩處同時錯，總比兩處各自錯不同的方向好。
  - ④ **對照表之落點**：三張對照表現況**只存在於前端**（`frontend/src/domain/roles.ts` 之 `ROLE_META`、`AccessHistoryPage.tsx` 之 `ACT_LABEL` 與 `rowKind()`）。依 [error-handling.md#export](../error-handling.md#export)「對照表必須只有一份」之要求與其 2026-08-16 落地註記（本 repo 前後端為兩個獨立 TS 專案、無共用 package ⇒ 本輪之機器可驗約束為「**兩份逐字相同**」），**落點由 system-architect 定**（見下方提報事項）。<br>**可觀測不變式（斷言標的，逐欄界定，不得含混）**：
    - 「角色」「類型」兩欄 → CSV 儲存格之值與**畫面同一列同一欄之可見文字逐字相同**（未套用 `AC-F10` 注入前綴時）。
    - 「操作類型」欄 → CSV 儲存格之值 ＝ 畫面該格可見文字 `{代碼} · {標籤}` 之**標籤部分**（即 ` · ` 之後的字串）逐字相同。**此為刻意之部分相同，非漂移**（見 ② 之裁決註記）。
    - 其餘欄（含空值之呈現）→ 見 `AC-F15` ③（畫面之 `—` 佔位符於 CSV 為空儲存格，第二個刻意例外）。
  - **機器驗證**：後端 spec 以本條之三張對照表逐鍵斷言 CSV 儲存格值（體例比照 `change-history-export.service.spec.ts` 之 `DOC_FIELD_LABEL`）；前端 spec 以**同一組值**斷言畫面文字。**兩份斷言之期望值皆取自本 AC**，任一端漂移即紅。

- **AC-F6**（時間戳格式）：Given 匯出成功, When 檢視「操作時間」欄, Then 其格式為 `YYYY-MM-DD HH:mm:ss`（**UTC+8**，不附 `(UTC+8)` 字樣），且以既有 `formatExportTimestamp()` 之**顯式 +8 位移**計算。<br>🔴 **不得**使用 `toLocaleString`／`toLocaleDateString` 或任何依賴行程 TZ 之格式化——行程 TZ 已釘死 UTC，該類寫法在容器與開發機各產生不同結果而**兩邊測試都會綠**（本 repo 2026-08-15 MSSQL 時區 bug 之同型錯誤）。<br>⚠ **既有缺口之承接**：畫面現以 `new Date(iso).toLocaleString('sv-SE')` 呈現，**依瀏覽器本地時區**——非 UTC+8 時區之瀏覽器會看到與 CSV 不同之時間。**本輪不修畫面**（登錄於 `OQ-E07-13`）；`AC-F5` ④ 之「CSV＝畫面逐字」不變式於本欄**以 UTC+8 瀏覽器為前提**成立。

- **AC-F7**（匯出範圍與列序）：Given 任一組查詢條件, When 匯出, Then ① 資料列數 ＝ 同條件下查詢之 `total`（**符合條件之全部結果，非當前分頁**）；② 列序與畫面一致——排序鍵**逐字為 `occurredAt DESC, id ASC`**（`id` 為決定性次鍵，非裝飾）；③ 匯出**忽略** `page`／`pageSize` 參數（即使呼叫端傳入亦然）；④ 匯出與查詢**共用同一份 filters 解析**（不得各寫一份）。<br>🔴 **② 之次鍵為何必須寫死在 AC**：`occurredAt` 於稽核資料中**大量重複**（同一次操作、同一秒內多筆），只寫「新→舊」時**同秒之列序未定義** ⇒ 任何「第 k 列等於某筆」之斷言都是**不穩定測試**。SQL 路徑現已為 `ORDER BY occurredAt DESC, id ASC`（`typeorm-audit.store.ts:144-145`，其註解逐字載明「決定性次鍵」）；⚠ **但記憶體版 fake（`access-history-filter.ts:154`）目前只依 `occurredAt` 排序、無次鍵**——若以 fake 驅動列序斷言，須先為其補上同一次鍵，否則兩條路徑對同秒資料可能給出不同順序。<br>📌 ④ 之理由：兩份解析漂移時，使用者會匯出到一份與畫面不同的結果而**毫無徵兆**（[F037](F037-document-change-history.md#export-delta) 已為此立同一約束）。<br>**機器驗證**：整合測試以同一組 query string 同時打查詢與匯出，斷言 CSV 資料列數 ＝ 查詢 `total`、且第一列之「操作時間」＝ 查詢首筆之 `occurredAt`（經 `AC-F6` 格式化後）。

- **AC-F8**（🔴 筆數上限：沿用共用機制；**廢棄 `EXPORT_MAX = 100000`**）：Given 符合查詢條件之筆數為 `N`, When 匯出, Then ① `N ≤ 10000`（**恰 10000 通過**，邊界值含）→ 正常產生 CSV；② `N > 10000` → 回 **400** 且回應含字串 `EXPORT_ROW_LIMIT_EXCEEDED`，**不產生任何檔案、不回傳部分結果**（上限值與錯誤碼皆取自 `backend/src/storage/csv-export.ts` 之 `EXPORT_ROW_LIMIT`／`assertExportRowLimit`，不另定義一份）；③ **`access-history.controller.ts` 之原始碼不得再含識別字 `EXPORT_MAX`**，亦不得有任何路徑以 `100000` 作為 `pageSize`。<br>📝 **為何廢棄 `EXPORT_MAX`**：該常數只是被塞進查詢當 `pageSize`，**從未有任何「超過即拒絕」之檢查邏輯** ⇒ 沿用它等於引入「超過 10 萬筆時靜默只給前 10 萬筆」之**新**缺陷，正是「不接受靜默截斷」原則所禁止者。<br>⚠ **本條使既有回歸鎖定之第 4 條（`EXPORT_MAX` 仍存在）轉紅——這是預期結果**，見 `AC-F17`。<br>📌 **上限數值維持 10000**（與三處一致），未依 F024 之全公司量體另訂；F024 實際資料量級**待查**，若日後實測顯示常態超過萬筆，屬另案。

- **AC-F9**（🔴 使用者可見回饋之逐字文案）：
  - ① **成功**：Given 匯出成功, When 檢視回饋, Then 其文字**以逐字片段 `已匯出文件調閱歷程（CSV，UTF-8 BOM）` 起始**（其後可附筆數等資訊，該部分不逐字約束），且容器為 `role="status"`。
  - ② **超限**：Given 符合筆數超過上限, When 檢視回饋, Then 其文字**含逐字片段** `符合查詢條件之筆數為 {N} 筆，超過匯出上限 10000 筆，請縮小查詢條件`（`{N}` 為**實際筆數**），**且**字串 `EXPORT_ROW_LIMIT_EXCEEDED` 出現於**同一回饋容器內**（兩段式斷言，達成方式不拘；既有 `frontend/src/domain/export-feedback.ts` 之 `EXPORT_LIMIT_BADGE` 可直接沿用），**且**該容器之角色為 **`role="alert"`**（現況本頁之回饋容器恆為 `role="status"`；錯誤回饋須改為 `alert`，[error-handling.md#export](../error-handling.md#export) 要求「`role="alert"` 或等效可存取角色」）。
  - ③ **舊文案必須消失**：Given 任一匯出路徑（成功、超限、403、網路失敗）, When 檢視畫面, Then 字串 `已匯出查詢結果（CSV，草案格式）` **不出現於任何情境**（負向斷言；該文案本身即缺陷之一部分）。
  - ⚠ **② 之 `role="alert"` 會連帶影響本頁其他錯誤回饋（已知、可接受，明列以免被當成意外）**：本頁之回饋容器為**單一共用元件**（`AccessHistoryPage.tsx:231-238`，現恆為 `role="status"`），最自然之實作是**依 tone 決定角色**（`danger` → `alert`、其餘 → `status`）。如此一來**既有的「載入調閱歷程失敗」訊息也會由 `status` 變為 `alert`**——此為**正確方向之副作用**（錯誤本就該用 `alert`），**不視為越界**；但 test-generator 若對既有載入失敗訊息寫了 `getByRole('status')`，該斷言需一併更新。**若實作選擇只讓匯出錯誤走 `alert`、其餘不動，亦符合本 AC**（本條只約束匯出超限這一路徑）。
  - 📝 **量詞／限定詞之選擇理由（本專案對此有講究，三處刻意不對齊）**：F024 之限定詞取 **「查詢條件」**（本頁為送出式查詢介面，比照 F037／F038），量詞取 **「筆數」**（本頁畫面既有文案為「共 {total} 筆」，比照 F039）⇒ 組合為「查詢條件」＋「筆數」，與 F037／F038（查詢條件＋事件）、F039（篩選條件＋筆數）**皆不相同，且為刻意**。
  - ⚠ **`{N}` 之實作相依（提報事項，不得默默規避）**：共用之 `assertExportRowLimit(count)` **未把 `count` 內插進訊息**（訊息為「符合條件之筆數超過上限 10000 筆…」），而前端 `countFromLimitError()` 取訊息中第一個數字 ⇒ **沿用現況會使 `{N}` 恆等於 10000**，本條即紅。二選一由 lead／system-architect 裁定：**(甲)** 使共用之 `assertExportRowLimit` 內插實際 `count`（**additive**，同時使 F037／F038／F039 三處之 `{N}` 由 10000 變為實際值——三處之 AC 本即要求「`{N}` 為實際筆數」，故此為**修正而非破壞**，見 `OQ-E07-14`）；**(乙)** F024 自行於 controller 層產生含實際筆數之訊息（不動共用碼，代價＝第四處訊息各自為政）。**spec-writer 不代為裁定。**

- **AC-F10**（CSV 注入防護）：Given 某列之「操作人員」「公司」「部門」「處/室」或「對象（文件／循環）」之值以 `=`／`+`／`-`／`@`／Tab（`\t`）／CR（`\r`）任一字元開頭, When 匯出, Then 該儲存格於 CSV 中之值**最前面多一個半形單引號 `'`**，再依 RFC 4180 包覆逸出；不以此六種字元開頭者**不加任何前綴**（恆等）。**表頭列不套用本規則**（`AC-F4` 之逐字表頭斷言不受影響）。<br>📌 **F024 之注入面**：`操作人員`／`部門`／`處/室`／`公司` 來自上游人資同步之字串，`對象` 之文件編號與循環名稱為 ICSOPAdmin 可自訂之字串 ⇒ 真實可達。規則權威＝[error-handling.md#export](../error-handling.md#export)，**不重新定義**。

- **AC-F11**（空結果）：Given 符合查詢條件之筆數為 0, When 匯出, Then 產生**僅含表頭列**之 CSV（以 BOM 起始、表頭後以 CRLF 結尾），**非錯誤、非空檔**，且成功回饋照常顯示（`AC-F9` ①）。

- **AC-F12**（🔒 權限回歸鎖定：不變）：Given 主管／部門窗口／一般使用者呼叫 `GET /admin/access-history/export`, When 請求, Then 回 **403 `PERMISSION_DENIED`**；Given 系統管理員（唯讀角色）呼叫, Then **允許匯出**（匯出屬讀取類動作）。閘門沿用既有 `@RequirePermission(FunctionKey.DOCUMENT_ACCESS_HISTORY, 'read')`，**不新增功能矩陣列、不改 [F025](F025-role-function-matrix.md)／[F026](F026-role-field-matrix.md) 任何一格**。<br>**機器驗證**：既有 `TS-005`（路由／權限 metadata）與 `TS-AQ-INT-009`（真 session 403）**逐字不變、須維持綠燈**。

#### 稽核

- **AC-F13**（🔴 匯出動作記稽核：新增 `ACCESS_HISTORY_EXPORT`）：Given 具權限之操作者, When 匯出**成功**（HTTP 2xx、CSV 已產生）, Then 寫入 `AUDIT_LOG` **恰一列**，其 ① `actionType` 逐字為 **`ACCESS_HISTORY_EXPORT`**；② `accountId` 與身分快照欄（`employeeNo`／`name`／`company`／`department`／`section`／`roleCode`）＝當前 session 之操作者；③ `occurredAt` ＝該次匯出之伺服器時間；④ `watermarkSnapshot` 為 `null`（非浮水印動作）。
  - **🔴 驅動值明列（0 筆為必測邊界，不得省略）**：`total` 為 **0**／**1**／**N（>1）** 三種情境**皆須恰一列**。**0 筆之情境由 `AC-F11` 定義為成功匯出**（僅表頭之 CSV、非錯誤）⇒ 其稽核義務**與非空匯出完全相同**，不因結果集為空而豁免。
  - Given 匯出因超限被拒（400）或因無權被拒（403）, When 請求結束, Then **不寫入任何稽核列**（`AUDIT_LOG` 筆數不變）。
  - **🔴 稽核列之必填欄不得取自結果集內容**：`targetId`（及任何依 `targetType` 必填之參照欄）**不得**由 `items[0]`／`rows[0]` 一類「取結果集第一筆」之運算式導出。**理由**：稽核記錄的是「**某人匯出了一份調閱歷程**」這個動作，其對象不是結果集裡的任何一列；且 0 筆時 `items[0]` 為 `undefined` ⇒ 必填欄落空 ⇒ `buildAuditRow()` 拋 `AUDIT_TARGET_REF_REQUIRED` ⇒ 稽核靜默漏記。F024 之 `targetId` 為**固定哨兵常數**（architecture-spec §10.18 `A16-1`），與結果集無關。<br>🔴 **此禁令是對既有缺陷之防抄**：F037／F038 現行實作正是此形狀（`latest?.documentId ?? null`／`latest?.lifecycleId ?? null`），已登錄於 `OQ-E07-15`，**本輪不修但不得照抄**。<br>⚠ **型別系統擋不住這個，只有 0 筆之執行期測試擋得住**：`backend/tsconfig.json` **未開啟 `noUncheckedIndexedAccess`** ⇒ `items[0]` 之靜態型別**不含 `undefined`**，`latest?.documentId ?? null` 於 tsc 眼中恆為 `string`（`?? null` 分支為死碼），`tsc --noEmit` **exit 0**（2026-08-18 實跑確認）。
  - Given **Outbox／IO 層**之稽核寫入失敗（暫時性）, When 匯出流程結束, Then **不阻斷匯出**——使用者仍取得 CSV，失敗事件進既有補償佇列重試（[error-handling.md#audit](../error-handling.md#audit)、`OQ-E07-09` 之 Outbox）。
  - **🔴 「不阻斷」之適用界線（此界線本身即可觀測）**：上一項**僅適用 Outbox／IO 之暫時性失敗**。**payload 不合法**（`AUDIT_TARGET_REF_REQUIRED` 一類「這筆稽核列根本組不出來」之錯誤）**不屬**該類，**不得**被同一個 catch 吞掉——`AuditWriterService.recordAccess()` 已刻意讓此類錯誤**上拋**（其原始碼註解逐字載明「屬呼叫端 payload 錯誤，非 IO 暫時性失敗」），呼叫端若以裸 `catch {}` 一併吞下，等同架空該設計。<br>**可觀測判準（不需檢查原始碼即可證偽）**：0 筆匯出後 `AUDIT_LOG` 仍**恰增一列**。payload 若不合法，此判準必不成立。
  - **🔒 additive 回歸鎖定**：既有 11 個 `AuditActionType` 變體（`VIEW`／`DOWNLOAD`／`PRINT`／`LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT`／`LIFECYCLE_DELETE`／`CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD`／`ALERT_RESOLVED`）之語意、落列規則與既有 `targetType` 對映**逐字不變**；本條為**純新增字面值**（比照 `LIFECYCLE_DELETE`／`APPENDIX` 之既有 additive 先例）。
  - **無需 migration（查證）**：`AUDIT_LOG.actionType` 為 `varchar(40)` 且**無 CHECK 約束**（`backend/src/database/migrations/1721952000000-audit-log.ts`），`ACCESS_HISTORY_EXPORT` 為 21 字元 ⇒ 落得下。此與 `OQ-E07-10` 原記載之「若日後納入，屬 `AUDIT_LOG` 新增 `actionType`，不需 schema 變更」一致。⚠ 仍須由 system-architect 覆核（見提報事項）。
  - ⚠ **本條之自我遞迴效應（明文載明，避免日後被當 bug）**：新寫入之 `ACCESS_HISTORY_EXPORT` 列**本身**會出現在 F024 之後續查詢與匯出結果中。**本輪不新增第四種類型篩選值**（`OQ-E07-03` 之三值篩選不變）⇒ 該列於「全部」查詢可見、於「類型」欄依 `AC-F5` ③ 之 fallback 顯示為 `變更`、於「對象」欄為空。**此為刻意接受之結果**（語意上不完美，但新增第四種篩選值之代價高於其價值）；若日後要改，屬另案。
  - **✅ 提報事項 A1 已裁決（2026-08-18，architecture-spec v1.8 [§10.18 `A16-1`](../architecture-spec.md#a16-f024-export-decisions)）**：新增 `AuditTargetType='ACCESS_HISTORY'`，`targetId` 採**固定哨兵常數**（沿用 `ORG_CHANGE_ALERT` 之「無對映欄」既有模式，`buildAuditRow()` 不需改動任何既有程式碼）；`targetType`（`varchar(30)`）與 `actionType`（`varchar(40)`）皆無 CHECK 約束，**不需 migration**。<br>📝 原提報內容（保留供追溯）：`buildAuditRow()` 於 `!event.targetId` 時**必拋** `AUDIT_TARGET_REF_REQUIRED`，而「匯出調閱歷程」**無自然之對象實體 id**，`AuditTargetType` 之 7 個現有值皆不適用；曾列之替代路線為 (b) 放寬 `buildAuditRow` 對特定變體之必填——**未採**（會鬆動所有變體共用之守門）。

#### 非文件類型與明細欄

- **AC-F14**（🔒 明細專屬欄不匯出：負向斷言）：Given 匯出成功, When 檢視 CSV, Then ① 表頭列**不含** `浮水印快照`、`對象名稱／說明` 任一字串；② 任一資料列之儲存格值**不含** `watermarkSnapshot` 之內容（以一筆已知浮水印字串之種入資料驗證：該字串**不出現於** CSV 位元組中）。<br>⚠ **② 之種入資料須含「不會出現在任何匯出欄位」之哨兵子字串**（例如浮水印固定機密聲明那一行）——浮水印快照本身是**姓名／員工編號／部門／處室／時間之聚合**，而這些**全都是匯出欄位**；若種入之快照僅由這些值組成，「完整字串不出現」這個斷言雖仍會通過，卻是**恆真的空斷言**（完整串本來就不可能連續出現於 CSV），擋不住「真的把快照多加了一欄」以外的任何情形。**斷言標的應為哨兵子字串不出現**，強度才與意圖相符。<br>📌 **理由（人類裁決）**：① 比照 F037／F038／F039「匯出對應主查詢列表」之既有先例；② 浮水印快照為單一長字串，與其餘短值欄位格式不一致、不利 Excel 閱覽；③ 將上限筆數之完整浮水印字串（姓名／員工編號／部門／處室／時間之聚合）批次落地成可攜出檔案，其個資聚合風險高於「畫面上單筆展開查看」。

- **AC-F15**（🔴 非文件類型之紀錄無 `documentId` — Edge Case 之兌現）：Given 查詢結果含循環列（`targetType='LIFECYCLE'`，無 `documentId`）、變更列（`DOCUMENT_CHANGE_LOG`／`LIFECYCLE_CHANGE_LOG`）與 `ORG_CHANGE_ALERT` 列, When 匯出, Then ① CSV **不得**有獨立之 `文件編號` 欄（10 欄之集合固定，見 `AC-F4`）；② 該三類列之「對象（文件／循環）」欄以與畫面**同一推導**取值——`documentNumber` → `lifecycleName` → `formId` 依序取第一個非空值；③ 三者皆無值時該儲存格為 **空**（**不輸出畫面上之佔位符 `—`**）。
  - 📝 **③ 為 spec-writer 裁量（已登錄待覆核，`OQ-E07-13`）**：`—` 是畫面之**視覺佔位符**而非資料，共用產生器之 `cell()` 對 `null`／`undefined` 亦輸出空儲存格；把 `—` 寫進 CSV 會讓下游 Excel 篩選／樞紐把它當成一個真實值。**同一規則適用「處/室」與「角色」兩個畫面上會顯示 `—` 的欄**。此為「CSV＝畫面逐字」不變式之**第二個刻意例外**（第一個為 `AC-F5` ② 之操作類型），一併在此聲明，避免日後被當成漂移修回去。
  - **機器驗證**：以一筆 `targetType='LIFECYCLE'`（`documentId=null`、`lifecycleName='銷售及收款循環'`）與一筆三者皆空之列種入，斷言對應儲存格分別為 `銷售及收款循環` 與空字串。

#### 控制項

- **AC-F16**（匯出鈕之選擇器與 in-flight 狀態）：Given 位於文件調閱歷程查詢頁, When 檢視頁首動作區, Then 存在一顆 accessible name 逐字為 `匯出` 之 `button`（既有控制項，選擇器不變）；When 匯出請求進行中, Then 該鈕為 `disabled`；When 請求結束（成功或失敗）, Then 該鈕恢復可用。<br>📌 **本條之存在理由**：本輪約束環為簡化版（僅 jest／vitest）⇒ 未入 AC 之選擇器，test-generator 只能自行臆造（本 repo 已於 `OQ-D18-27` 吃過同型的虧）。

#### 事前提示（2026-08-18 使用者追加需求）

- **AC-F19**（🔴 超限之**事前**提示：不必先撞牆才讀到說明）：Given 查詢已完成且 `result.total > 10000`（上限取自前端既有常數 `frontend/src/domain/export-feedback.ts` 之 `EXPORT_ROW_LIMIT`，不得寫死字面值）, When 檢視畫面, Then 呈現一則提示，其 ① 文字**逐字**為 `目前符合查詢條件之筆數為 {N} 筆，已超過匯出上限 10000 筆，直接匯出將被拒絕，請先縮小查詢條件後再匯出。`（`{N}` ＝ `result.total`）；② 其容器之 `id` 逐字為 **`export-limit-hint`**；③ 匯出鈕（accessible name `匯出`）之 **`aria-describedby` 指向 `export-limit-hint`**。
  - **邊界（🔴 off-by-one，寫錯會測試綠而行為錯）**：`result.total > 10000` 才提示。**`result.total === 10000` 不提示**（後端 `assertExportRowLimit` 之判準為 `count > EXPORT_ROW_LIMIT`，**恰等於上限是合法且會成功匯出的**）；`10001` 提示；`< 10000` 不提示。
  - **無查詢結果時不提示**：`result` 為 `null`（初次載入中、載入失敗）→ 不呈現提示、匯出鈕**不得**帶 `aria-describedby`。
  - **不得殘留**：提示之出現與否**恆隨最近一次查詢結果重算**——換頁、改條件重查、「清除條件」後 `total` 降至上限以下時，提示與 `aria-describedby` **皆須消失**。
  - 🔴 **匯出鈕維持可按，不得 `disabled`**。兩個理由（**寫進註記，日後不得「順手」改成 disabled**）：**(a)** 一顆沒有說明的 disabled 按鈕與本批次要修的缺陷**同型**——使用者無從得知原因，只是把「假成功」換成「假故障」；**(b)** `total` 可能**過時**（查詢後資料增長、或使用者已改動查詢條件尚未重查），偏高時會**誤擋一次本來合法的匯出**。⇒ 提示負責告知，**放行與拒絕一律由後端決定**。
  - 🔴 **本條不取代 `AC-F8`／`AC-F9` ②**：前端提示是體貼，**後端才是權威**。Given 使用者無視提示仍按下匯出, When 後端判定超限, Then `AC-F8`（400、不產生檔案）與 `AC-F9` ②（逐字錯誤回饋＋錯誤碼同容器）**逐項照常成立**，**不得**因已有事前提示而弱化、略過或改為前端攔截。
  - **兩者可同時可見，且為刻意**：事前提示描述的是「**目前結果集之狀態**」，錯誤回饋描述的是「**剛才那次操作之結果**」，語意不同、生命週期不同（前者隨查詢結果、後者隨操作），故**不互斥**。
  - **機器驗證**：以 `result.total` 分別為 `9999`／`10000`／`10001` 驅動渲染，斷言 `#export-limit-hint` 之存在與否及其逐字內容、並斷言匯出鈕之 `aria-describedby` 同步出現／消失。<br>⚠ **斷言一律以容器定位**（提示＝`#export-limit-hint`；錯誤回饋＝`role="alert"`，`AC-F9` ②）——**不得**以全頁 `getByText(/符合查詢條件之筆數為 …/)` 之正則斷言：`AC-F9` ② 之錯誤訊息與本條之提示句共用前綴，超限後兩者同時在場時該查詢會命中多個節點而拋錯（且會讓「測到的是哪一個」變得不確定）。
  - ✅ **本條與 architect 提報事項 A3（`{N}` 之修法）無相依——已查證**：本條之 `{N}` 取自**查詢回應**之 `result.total`（`AccessHistoryPage.tsx:341` 現已用它渲染 `共 {total} 筆`），**不經**後端錯誤訊息、**不經** `countFromLimitError()`。⇒ 無論 A3 裁定 (甲) 或 (乙)，本條之措辭與斷言**皆成立、不需改寫**。<br>🔴 **實作禁令（此禁令即本獨立性之保證）**：本條之 `{N}` **不得**由 `ApiError` 之訊息推導。有此相依的只有 `AC-F9` ②。
  - 📌 **版面落點（2026-08-18 ui-ux-designer 定案）**：提示置於**查詢列 section（`bg-white border border-slate-200 rounded-xl p-4`）之內**，作為既有動作列（查詢／清除條件／`未輸入條件，已套用近 30 天預設範圍`／`共 {total} 筆`；`AccessHistoryPage.tsx:320-343`）**之後方兄弟節點，自成獨立一列**。即：與它所量化的 `共 {total} 筆` 同卡片、緊接其下一行；與匯出鈕之關聯仍**只**由 `aria-describedby` 承擔（鈕在 topbar，不在此處）。
    - **視覺樣式＝逐字沿用同頁既有先例**：取 `AccessHistoryPage.tsx:335` 之 30 天行內提示（prototype 對應 `17-access-history.html:119` 之 `#defaultNote`）之 token —— `text-xs text-amber-700` ＋ `<Icon name="info">`。**不新增任何顏色、元件或樣式語彙**（amber 三色於本頁 `KIND_TONE`／`ACT_TONE` 早已在用）。因自成一列，僅作兩處必要調整：容器改 `items-start`、圖示加 `mt-0.5 shrink-0`。完整 className：容器 `mt-2 flex items-start gap-1.5 text-xs text-amber-700`，圖示 `w-3.5 h-3.5 mt-0.5 shrink-0`。
    - **`id` 之掛點**：`id="export-limit-hint"` 掛在該列**容器**上，逐字句子置於容器內唯一之 `<span>`；圖示為 `<svg>`／不貢獻 textContent ⇒ 不影響 ① 之逐字斷言。
    - 🔴 **不得**把提示塞進動作列之內（`flex items-center gap-2 mt-3 flex-wrap`）：該句約 50 個全形字，塞進去會在 `lg` 以下把 `共 {total} 筆` 擠到第二行，並使該列在提示出現／消失時**整列重排**——與本 repo 剛修過的「多連結列撐破版面」（[F017](F017-backend-document-list.md) `AC-E1`～`AC-E8`）為同型缺陷。自成一列後：動作列諸控制項**零位移**，僅卡片增高一行（約 26px）把結果表格往下推，且該位移只發生在「新查詢結果落地」之同一次 re-render，無閒置期間之版面跳動。
    - **長句於窄版面之處理（已於無頭 Chromium 實測，非估算）**：自成一列後可用寬度＝卡片內寬。實測 viewport `1440`／`900`／`700`：提示分別為 **1 行／1 行／2 行**，三者之 `document.scrollWidth - clientWidth` 皆為 **0**（無水平溢出）；`N` 由 `10001` 換成 `128430`（多 2 位數）行數不變。圖示因 `shrink-0` ＋ `items-start` 固定於首行左上，換行文字不繞圖示。**不得**對本列加 `truncate`／`whitespace-nowrap`（會使逐字句子不可讀，且與 ① 之逐字要求相牴觸）。
    - **版面穩定性（同一實測）**：`result.total` 於 `9999`／`10000`／`10001`／`128430` 之間切換時，動作列之 `getBoundingClientRect()` **恆為 `top=262, height=38`**（零位移、不換行）。唯一變動為 `共 {total} 筆` 之左緣隨位數多寡在數 px 內移動——那是 `ml-auto` 對既有文字長度之既有行為，**與本提示無關**（提示隱藏時同樣會動）。
    - **落點示範檔**：[`prototypes/17a-access-history-export-limit-hint.html`](../../../prototypes/17a-access-history-export-limit-hint.html)（可直接以瀏覽器開啟，含 `9999`／`10000`／`10001`／`128430` 四態切換與「同時顯示 `AC-F9` ② 錯誤回饋」開關）。<br>🔴 **該檔非文案／版面權威**——F024 之權威仍為 `prototypes/17-access-history.html`；示範檔只承載本條之落點與區辨，其匯出成功／失敗文案以 `AC-F9` 為準。
    - **與 `AC-F9` ② 錯誤回饋之視覺區辨（六軸皆不同 ⇒ 兩者同時在場亦不混淆，兌現「兩者可同時可見」該項）**：

      | 軸 | 事前提示（本條，`#export-limit-hint`） | 錯誤回饋（`AC-F9` ②，`role="alert"`） |
      |---|---|---|
      | 位置 | 查詢卡片**內**，`共 {total} 筆` 之下一列 | 頁面層級回饋插槽，查詢卡片**上方**（`AccessHistoryPage.tsx:231-238`） |
      | 形狀 | 無框、無底色之行內文字 | 有框有底之 box（`border rounded-md px-3 py-2`） |
      | 色調 | amber（`text-amber-700`） | danger 紅（`text-red-700 bg-red-50 border-red-100`，既有 `TONE_BADGE.danger`） |
      | 字級 | `text-xs` | `text-sm` |
      | 可及性角色 | 無 live region（見下一項） | `role="alert"` |
      | 語意／生命週期 | 「**目前結果集之狀態**」，隨查詢結果重算 | 「**剛才那次操作之結果**」，隨匯出操作 |

    - **提示容器刻意不加 `role="status"`／`aria-live`**（designer 裁量，非 AC 條款）：它已由匯出鈕之 `aria-describedby` 建立關聯，再加 live region 會造成「查詢完成朗讀一次、聚焦匯出鈕再朗讀一次」之重複播報。
    - **prototype 對照結論：prototype 無此元素**（已查證，非臆造）——`prototypes/17-access-history.html` 之 `doExport()`（行 337）僅 toast 成功、**完全未處理超限**；全 25 份 prototype 中「匯出上限」**僅以事後 error toast** 出現於 `23-change-history.html:567,575` 與 `24-appendix-management.html:364`，**無任何事前提示先例**。⇒ 依本專案硬規則（prototype 無對應則沿用同頁既有先例），類推對象為 `17-access-history.html:119` 之 `#defaultNote`（同頁唯一之 amber 行內提示），並沿用同頁 `#scopeNote`／`#resultCount`／toast 所建立之分工：**狀態敘述留在查詢卡片內，操作結果走頁面層級回饋插槽**。
    - `OLD>` 📌 **版面落點交 ui-ux-designer**：本條刻意**不**以 DOM 相鄰關係約束「於匯出控制項附近」，改以 `aria-describedby` 建立**程式化關聯**。理由：匯出鈕經 `PageHeader`／`TopbarActions` **portal 到 admin shell 之 topbar 動作區**（狹窄，塞不下一整句），而本頁既有之行內提示先例（`未輸入條件，已套用近 30 天預設範圍`）位於查詢列「共 {total} 筆」同一列。⇒ 視覺落點由 designer 定，**關聯性與可及性則由 `aria-describedby` 保證且可機驗**。
  - 📌 **僅適用 F024**：F037／F038／F039 三處是否比照補事前提示，**本輪不處理、屬另案**（三處之頁面是否已在畫面上持有可信的總筆數，未查證）。

#### 取代條款與既有測試之承接

- **AC-F17**（🔴 **本批次取代 F037 `AC-D8`／F039 `AC-D10` 之 F024 鎖定條款**）：Given 本 delta 之 AC 已由人類閘門核可（2026-08-18）, When 實作本批次, Then ① [F037](F037-document-change-history.md#export-delta) `AC-D8` 與 [F039](F039-appendix-management.md#export-delta) `AC-D10` 之「F024 既有程式路徑未被觸及」條款**自 2026-08-18 起失效**——**範圍紀律 J（F024 不在 F037／F038／F039 delta 範圍）已由人類正式解除**；② 該二條之**其餘語意不受影響**（共用 CSV 產生器仍須以參數承接欄位定義與 scope，不得為 F024 而分岔出第二份產生器）；③ 兩份規格檔之對應條款**須加註取代關係**（已於本次一併完成）。
  - ⚠ **`backend/src/change-history/change-history-export.routes.spec.ts:97-122` 之四條測試將全部轉紅——這是預期結果，不是意外破壞。**
  - 🔴 **不得直接刪除該 describe 區塊**；須**就地改寫為新行為之背書**（本 repo 既有慣例，見 commit `test(document-list): …並改寫為舊行為背書的 TS-D-020`）。改寫後之四條應分別斷言：

    | 原斷言（將轉紅） | 改寫後應斷言 | 依據 |
    |---|---|---|
    | 原始碼含 `return { rows: result.items, total: result.total };` | 原始碼**不再**回 JSON 形狀；匯出 handler 送出 CSV Buffer | `AC-F2` |
    | 原始碼**未** import `csv-export`／`toCsvBuffer` | 原始碼**已** import 共用產生器（`csv-export`），且**未**自行實作第二份 CSV 組字 | `AC-F2`、`AC-F17` ② |
    | 原始碼**未**含 `Content-Disposition`／`text/csv`／`0xEF` | 原始碼**已**設定 `Content-Type: text/csv; charset=utf-8` 與 `Content-Disposition: attachment; filename=…`，且 BOM 由共用產生器以 bytes 前置 | `AC-F2` |
    | 閘門 decorator ＋ **`EXPORT_MAX` 仍存在** | 閘門 decorator **逐字不變**（`AC-F12`）；**`EXPORT_MAX` 已不存在**，上限改由 `EXPORT_ROW_LIMIT` 承擔 | `AC-F8` ③、`AC-F12` |

  - 📝 **改寫而非刪除之理由**：該 describe 區塊之存在本身記錄了「範圍紀律 J 曾經有效、且於何時被誰解除」這件事。刪掉它，日後只會看到一段沒有來由的行為變更。

- **AC-F18**（🔒 其餘既有測試之承接清單：**不得刪除，須改寫為新行為之背書**）：Given 本批次實作完成, When 檢視下列既有測試, Then 其**名稱仍存在**且改為斷言新行為——

  | 檔案 : 位置 | 現況斷言（舊行為） | 改寫後應斷言 | 依據 |
  |---|---|---|---|
  | `frontend/src/pages/AccessHistoryPage.test.tsx:141` | 呼叫 `exportAccessHistory` 並顯示舊成功訊息 | 呼叫 `exportAccessHistory`（遵循當前查詢條件）**且**產生下載副作用**且**顯示新逐字成功訊息 | `AC-F1` ①、`AC-F9` ① |
  | `backend/src/audit/access-history.controller.spec.ts` `TS-015` | `exportHistory()` 以同 filters 委派並**回傳結果集**（JSON 形狀） | 以同 filters 委派（此半保留，`AC-F7` ④）**且**回應為 CSV 位元組與檔案標頭，**非** `{rows,total}` | `AC-F2`、`AC-F7` |
  | `backend/src/audit/access-history.controller.spec.ts` `TS-005`／`TS-016` | 路由與 RBAC metadata | **逐字不變**（`AC-F12`）——本批次不得改動閘門 | `AC-F12` |
  | `backend/test/int/access-history.itest.ts` `TS-AQ-INT-008` | `e.body.total` 與 `e.body.rows` 之 JSON 斷言 | 解析 CSV：資料列數 ＝ 查詢 `total`；「對象」欄之值集合 ＝ 查詢結果之 `documentNumber` 集合 | `AC-F2`、`AC-F7` |
  | `backend/test/int/access-history.itest.ts` `TS-AQ-INT-009` | 匯出 403 | **逐字不變** | `AC-F12` |

  📝 **本條為機器可驗**：驗證標的＝上列測試名稱於改寫後**仍存在於各自檔案中**且全綠。若某條被判定為「無法承接、必須刪除」，須先於 `open-questions.md` 登錄理由，不得逕自刪除。

#### 📤 需 system-architect 裁量之提報事項（spec-writer 不代為決定） 🟢 **2026-08-18 已裁決（system-architect，[architecture-spec.md §10.18 決策 A16](../architecture-spec.md#a16-f024-export-decisions)）**

> 四項裁決逐一覆核後**皆不要求變更本檔任何 `AC-F#` 之斷言文字**（見 §10.18 末「對 AC 之影響」表）；本節僅補上落點與實作路徑，AC 本身不動。

| # | 事項 | 相關 AC | 已查證之硬約束 | 裁決 |
|---|---|---|---|---|
| A1 | `ACCESS_HISTORY_EXPORT` 之 `targetType`／`targetId` 落點；是否新增 `AuditTargetType` 值 | `AC-F13` | `buildAuditRow()` 於 `!targetId` 時必拋 `AUDIT_TARGET_REF_REQUIRED`；現有 7 個 `targetType` 皆不適用；`targetType` 為 `varchar(30)`、`actionType` 為 `varchar(40)`，**皆無 CHECK 約束 ⇒ 兩者皆不需 migration** | 🟢 **已裁決＝architecture-spec §10.18 A16-1**：新增 `AuditTargetType='ACCESS_HISTORY'`；`targetId` 採固定哨兵常數 `ACCESS_HISTORY_EXPORT_TARGET_ID`（不落地於任何欄，沿用既有 `ORG_CHANGE_ALERT` 之「無對映 case」模式）；`buildAuditRow()` 不改動。獨立複核確認無需 migration。**不得**比照 F037 `recordExportAudit()` 以查詢結果首列衍生 `targetId`（0 筆匯出會因此靜默漏記稽核，違反 `AC-F13`） |
| A2 | 三張中文標籤對照表（角色／操作類型／類型）之落點：搬至後端、抽為共用模組、或由查詢端點回傳已解析之 label | `AC-F5` ④ | [error-handling.md#export](../error-handling.md#export) 明訂「落點由 system-architect 定」；本 repo 前後端無共用 package，2026-08-16 之落地處置為「兩份逐字相同」（`OQ-D18-34`） | 🟢 **已裁決＝architecture-spec §10.18 A16-2**：新增 `backend/src/audit/access-history-labels.ts`（`roleLabel`／`actionTypeLabel`／`auditKindLabel`），與前端 `ROLE_META`／`ACT_LABEL`／`rowKind()` 各留一份，以「兩份逐字相同」為機器可驗不變式——沿用 §10.14（`watermarkLines()`）與 `change-history/change-labels.ts`（`OQ-D18-34`）之既有處置 |
| A3 | 超限訊息之 `{N}`：修共用 `assertExportRowLimit`（甲，連帶修好 F037／F038／F039）或 F024 自行產生（乙） | `AC-F9` ② | `assertExportRowLimit` 未內插 `count`；`countFromLimitError()` 取訊息第一個數字 ⇒ 現況 `{N}` 恆為 10000。見 `OQ-E07-14` | 🟢 **已裁決＝architecture-spec §10.18 A16-3，採甲案**：修 `storage/csv-export.ts` 之 `assertExportRowLimit()` 內插實際 `count`（須排在 `EXPORT_ROW_LIMIT` 常數之前，供 `countFromLimitError()` 之「取第一個數字」正確解析）。逐一排查後確認**無任何現存測試鎖定舊行為**，零回歸；連帶使 F037／F038／F039 既有 AC（本就要求 `{N}` 為實際筆數）由文字與程式碼不符變為一致，**不需為三者另開 AC delta** |
| A4 | 計數與取列之實作路徑（先 count 再取列 vs 取 `EXPORT_ROW_LIMIT + 1` 列後判斷）與競態第二道防護 | `AC-F8` | F037／F038 既有做法為「count → 取 limit+1 → 二次 assert」；F024 之 `queryHistory` 回傳 `total`，可能可省一趟 | 🟢 **已裁決＝architecture-spec §10.18 A16-4**：單一次 `queryHistory(scope, {...filters, page:1, pageSize:EXPORT_ROW_LIMIT+1})` 呼叫（`AuditStore.queryPage()` 之 `getManyAndCount()` 已原生下推 `COUNT`+`OFFSET/FETCH`，不需比照 F037／F038 另建兩段式）。競態第二道防護保留：`assertExportRowLimit(result.items.length)`，記憶體內比對、不觸發額外 SQL |

## Error Scenarios
- 權限限縮/空條件：見 [error-handling.md#permission](../error-handling.md#permission)、[#audit](../error-handling.md#audit)（`QUERY_CONDITION_REQUIRED`）。效能見 [NFR-001](../nfr.md#performance)。
- **匯出（2026-08-18 delta）**：筆數超過上限 → `EXPORT_ROW_LIMIT_EXCEEDED`（400），見 [error-handling.md#export](../error-handling.md#export) 與 `AC-F8`／`AC-F9` ②。無權匯出 → `PERMISSION_DENIED`（403，沿用既有閘門，`AC-F12`）。**不新增任何錯誤碼。**

## Related
- Data: [AUDIT_LOG](../data-model.md#auditlog-entity)（`targetType` 區分 `DOCUMENT`/`USAGE_FORM`/`LIFECYCLE`/`DOCUMENT_CHANGE_LOG`/`LIFECYCLE_CHANGE_LOG`）
- Depends on: [F023](F023-audit-logging.md), [F025](F025-role-function-matrix.md)
- Related: 稽核來源 [F020](F020-watermark.md)、[F036](F036-lifecycle-tree-preview.md)、[F037](F037-document-change-history.md)、[F038](F038-lifecycle-tree-change-history.md)
- NFR: [效能（索引/分頁）](../nfr.md#performance), [稽核保留（≥3 年，含變更歷程）](../nfr.md#audit-retention)
- 定案: **OQ-E07-03（循環/變更調閱稽核納入本頁查詢，新增「文件/循環/變更」類型篩選與顯示欄位切換；`AUDIT_LOG.targetType` 已支援，無 schema 變更）**、OQ-NFR003（保留 ≥3 年）
- **2026-08-18 人類閘門裁決**：`OQ-D18-26`（採選項 (a)，匯出真的輸出 CSV）、`OQ-E07-10` **部分推翻**（meta-audit：匯出納入、查詢仍不納入）。見 [§匯出鈕失效之修復 delta](#export-fix-delta)（`AC-F1`～`AC-F19`）。本輪新登錄且**不修**：`OQ-E07-12`（查詢動作不記稽核）、`OQ-E07-13`（呈現層列舉／格式三項缺口）、`OQ-E07-14`（共用超限訊息之 `{N}`）、**`OQ-E07-15`（F037／F038 匯出稽核於 0 筆時靈默漏記；`AC-F13` 已防止 F024 照抄）**。
- 匯出共用規則: [error-handling.md#export](../error-handling.md#export)（F024 為第四處）；共用產生器 `backend/src/storage/csv-export.ts`
