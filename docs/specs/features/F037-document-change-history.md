# F037: ICSOP 程序書變更歷程（欄位層 Before/After Diff）
Priority: P1 | Status: 🟡 實作（欄位層 diff＋CREATE 建立事件＋STATUS reason 顯示；交易邊界維持 best-effort（人類定案）；單元綠；整合已寫未跑；見 implementation-logs/doc-changelog-impl.md） | Last Updated: 2026-07-24
Epic/Story: E07 / US-062

> **獨立後台功能「文件變更歷程」**（獨立側選單項，非「文件調閱歷程」子頁；prototype `23-change-history.html`）之 **ICSOP 程序書 tab**（與循環樹狀圖 tab [F038](F038-lifecycle-tree-change-history.md) 併存，共兩 tab）。以 **append-only 欄位層變更日誌**追溯文件內容異動，**不保留整份歷史版本檔**（與「僅保存當前版本」定案調和）。權限依 [F025](F025-role-function-matrix.md) 獨立功能列「文件變更歷程」。
>
> **🔵 2026-08-16 additive delta（使用者裁決；缺失／變更 delta 第 16 項）——匯出查詢結果**：本 tab 提供「匯出」動作（CSV），**兩 tab 各自匯出、不合併**（OQ-D18-17）。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta）。
> ✅ **`OQ-E07-06` 之「是否提供匯出」子題自本日起由「未決」改為「已定案＝是」**（原架構建議之「本輪不列」被使用者需求推翻）；該 OQ 之另一子題「[F038](F038-lifecycle-tree-change-history.md) 下載 PDF 排版（單一 PDF 兩頁 vs 兩份）」**仍維持原架構定案（單一 PDF 兩頁）、不受本 delta 影響**。

## Description
提供依人員／文件（編號或名稱）／時間區間查詢之 ICSOP 文件欄位層變更歷程；每筆變更事件逐欄位呈現「舊值 → 新值」（誰、何時、哪欄、由何值改為何值）。變更事件由文件寫入型功能同步產生：一般欄位編輯（[F011](F011-edit-with-comparison.md)）、狀態切換（[F012](F012-document-status-toggle.md)）、制定組織／當責室長／使用部門（[F014](F014-accountable-dept-chief.md)）、附件替換（[F016](F016-pdf-ojt-attachment.md)，僅記「已替換」事件、不留舊檔）。查詢頁框架與模式沿用 [F024](F024-access-history-query.md)。檢視/查詢即記一筆 `CHANGE_LOG_VIEW` 稽核。

**與「僅保存當前版本」調和**：變更歷程＝獨立、輕量的**異動事件日誌**（僅記變動欄位之 old/new），非整份文件快照或可還原之「第 N 版」；檔案型附件仍覆蓋式儲存、覆蓋即消失，變更歷程對附件僅記事件不保留舊檔（AC-6）。二者管理對象不同（前者管文件記錄本體與檔案，後者管異動事件日誌），不衝突。

## Preconditions
- 操作者具「文件變更歷程」功能存取權（**定案（OQ-E07-04）**：依 [F025](F025-role-function-matrix.md) **獨立功能列「文件變更歷程」**——僅 SysAdmin／ICSOPAdmin 全公司唯讀；主管／部門窗口／一般使用者**一律無權**（功能/tab 不顯示、直接呼叫 API 回 403）。與 F038 一致）。
- 變更事件已由來源功能（F011/F012/F014/F016）於其儲存交易同步寫入變更日誌。

## Main Flow
1. 進入獨立後台功能「文件變更歷程」（`23-change-history.html`）→ 切換至「ICSOP 程序書」tab。
2. 輸入查詢條件（人員／文件編號或名稱／時間區間任意組合，比照 F024）→ 送出。
3. 後端強制驗證角色可視範圍（不信任前端條件）→ 回傳符合之變更事件清單（分頁，時間新到舊）。
4. 展開某文件某筆事件 → 逐欄位呈現「舊值 → 新值」對照（非還原/下載整份舊文件）。
5. 查詢/展開檢視動作同步寫入一筆 `CHANGE_LOG_VIEW` 稽核（比照 [F023](F023-audit-logging.md)）。

## Alternative Flows
- **變更事件產生（來源功能側，同一儲存交易同步寫入）**：
  - 一般欄位編輯（F011）：逐「實際變更」欄位各記欄位名/舊值/新值；未變更欄位不記（純對照顯示 ≠ 變更事件）。
  - 狀態切換（F012）：記「文件狀態」欄位之切換前後值；此記錄為本 feature 獨立範疇，不受 OQ-NFR003（狀態切換是否納「調閱稽核」）定案影響。
  - 制定組織／當責室長／使用部門（F014）：人員/組織類欄位之新舊值以**當下顯示名稱快照**呈現（非僅存 ID），避免日後組織異動使歷史顯示跑掉。
- **匯出查詢結果（CSV，2026-08-16 使用者裁決＝納入）**：將**當前查詢條件之全部結果**（非僅當前頁）輸出為 CSV，格式**向 [error-handling.md#export](../error-handling.md#export) 之共用規則對齊**（UTF-8 with BOM、RFC 4180 逸出、CSV 注入前綴、上限 10,000 筆、檔名含時間戳）。<br>📝 **2026-08-16 措辭更正（事實性）**：本條原寫「格式與 [F024](F024-access-history-query.md) 既有匯出**同構**」，但 system-architect 查證 **F024 之「既有匯出」並不產生任何 CSV 檔案**（`GET /admin/access-history/export` 回傳 JSON `{rows,total}`，前端收到後直接丟棄、僅跳 toast）——**該樣板不存在，無可對齊之對象**。故「同構」之基準改為本次新寫之共用規則段落。<br>📝 **2026-08-16 使用者裁決推翻，理由：使用者要求「後台：文件變更歷程：清單頁提供匯出清單的功能」（缺失 delta 第 16 項）**——原條文為「匯出查詢結果（比照 F024 之 CSV/Excel）：**是否納入本 feature 待確認，見 OQ-E07-06**」。`OQ-E07-06` 之匯出子題已定案為「是」。

## Edge Cases
- 開啟編輯頁但未實際變更任何欄位即儲存：不產生任何變更日誌。
- 同一次儲存多欄位變更：呈現時逐欄位可列出（實作為多筆或單筆含多欄差異不影響呈現）。
- 查詢條件為空：比照 F024 要求至少一項條件或套用近 30 天預設，避免全表掃描。
- 附件替換：僅記「附件已替換」事件（類型/操作人員/時間），不提供舊檔下載或還原。
- 「所屬節點」文件掛載異動之呈現歸屬（本 tab 或循環樹狀圖 tab F038）待確認，見 OQ-E07-08。

## Postconditions
- 文件內容異動可被逐欄位、依時間追溯；未擴大保存範圍（無歷史版本檔、無舊附件）。
- 每次查詢/檢視留一筆不可竄改之 `CHANGE_LOG_VIEW` 稽核。

## Acceptance Criteria
- Given 具權限角色進入獨立功能「文件變更歷程」, When 切換至「ICSOP 程序書」tab, Then 顯示與 F024 相同模式之查詢介面（人員/文件/時間區間），送出後回傳符合之變更事件清單（分頁，時間新到舊）。
- Given ICSOP 管理員編輯文件並儲存且至少一欄位實際變更（F011）, When 儲存完成, Then 逐實際變更欄位寫入 append-only 變更日誌（欄位名/舊值/新值/操作人員/文件 ID·編號/時間），未變更欄位不記。
- Given 管理員切換文件狀態（F012）, When 切換完成, Then 記一筆「文件狀態」欄位之舊值/新值變更日誌。
- Given 管理員修改制定組織／當責室長／使用部門（F014）, When 儲存完成, Then 依實際變更欄位各記日誌，人員/組織欄位以當下顯示名稱快照呈現新舊值。
- Given ICSOP PDF／OJT／使用表單經 F016 重新上傳覆蓋原檔, When 上傳完成, Then 記一筆「附件已替換」事件（類型/操作人員/時間），且不保留、不提供下載舊檔內容。
- Given 於查詢結果選擇某文件並展開, When 檢視, Then 依時間新到舊逐筆呈現各次變更事件之「舊值 → 新值」對照（非還原或下載整份舊文件）。
- Given 主管／部門窗口／一般使用者呼叫「文件變更歷程」API, When 請求, Then 回 403（`PERMISSION_DENIED`）；本功能兩 tab 統一僅 SysAdmin／ICSOPAdmin（OQ-E07-04 定案，F025 獨立功能列「文件變更歷程」）。
- Given 任一具權限角色查詢或展開檢視變更歷程, When 動作完成, Then 記一筆 `CHANGE_LOG_VIEW` 稽核（操作人員/員工編號/部門/處室/文件 ID·編號/時間）；寫入失敗不阻斷瀏覽，進補償佇列重試（比照 F023）。
- Given 開啟編輯頁未實際變更任何欄位即儲存, When 送出, Then 不產生任何變更日誌。

### ICSOP 程序書 tab 匯出 delta（🔵 2026-08-16 使用者裁決；缺失／變更 delta 第 16 項） {#export-delta}

> 前提裁決：**OQ-D18-16**＝CSV UTF-8 **with BOM**、範圍＝當前查詢條件之全部結果（非僅當前頁）、上限 10,000 筆（超出回錯誤）、欄位＝畫面所見、檔名含時間戳、**向 [error-handling.md#export](../error-handling.md#export) 之共用規則對齊**；**OQ-D18-17**＝兩 tab **各自匯出**（欄位結構完全不同：本 tab 為欄位層 old/new，[F038](F038-lifecycle-tree-change-history.md) 為 DAG 結構事件；合併必產生大量空欄）。
> 🔴 **2026-08-16 事實更正（system-architect 查證，spec-writer 據以改寫）**：`OQ-D18-16` 原表述為「與 [F024](F024-access-history-query.md) 既有匯出同構」，惟 **F024 之匯出並不產生 CSV 檔案**（回傳 JSON、前端丟棄、僅跳 toast）。⇒ 三處匯出之 CSV 產生器為**淨新增**，「同構」之基準改為本次新寫之 [#export](../error-handling.md#export) 共用規則。**此為措辭與基準之更正，不改變任何格式要求之實質內容。**
> ⚠ **範圍紀律（不變）**：本 delta **不得改動 [F024](F024-access-history-query.md) 之任何 AC 或既有行為，亦不得為其「匯出不產生檔案」之缺口撰寫任何 AC**——該缺口已如實登錄於 [open-questions.md](../open-questions.md) `OQ-D18-26`，F024 不在本 delta 範圍。

- **AC-D1**（匯出動作存在與範圍）：Given 具權限角色（SysAdmin／ICSOPAdmin）位於「ICSOP 程序書」tab 且已送出查詢, When 檢視工具列, Then 存在無障礙名稱為 `匯出` 之按鈕；When 點擊, Then 產生之 CSV 恰含**符合當前查詢條件之全部變更事件**（非僅當前頁之 50 筆），列序與畫面一致（時間新到舊）。
- **AC-D2**（CSV 格式與欄位）：Given 匯出成功, When 檢視檔案, Then ① 位元組以 **UTF-8 BOM（`EF BB BF`）** 開頭；② 第 1 列表頭逐字為 `程序書編號,程序書書名,變更欄位,舊值,新值,來源,操作人,時間`；③ 值含 `,`／`"`／換行時以雙引號包覆、內部 `"` 逸出為 `""`（RFC 4180）；④ 一次儲存變更多欄位者**逐欄位各輸出一列**（與畫面展開後之逐欄呈現一致）。<br>⚠ **③ 之逸出須在 `AC-D9` 之注入前綴之後套用**（先加前綴、再引號包覆）。
- **AC-D3**（匯出上限）：Given 符合條件之事件為 10,001 筆, When 匯出, Then 回 **400 `EXPORT_ROW_LIMIT_EXCEEDED`**（訊息含上限 10,000 並提示縮小條件），**不產生檔案**；Given 恰 10,000 筆, Then 匯出成功。
- **AC-D4**（檔名）：Given 匯出成功, When 檢視 `Content-Disposition` 之 `filename`, Then 其形狀為 `document_change_history_{YYYYMMDD}_{HHmmss}.csv`（伺服器時間 UTC+8）。
- **AC-D5**（權限）：Given 主管／部門窗口／一般使用者直接呼叫匯出端點, When 請求, Then 回 **403 `PERMISSION_DENIED`**（沿用本 feature 既有閘門，**不新增功能矩陣列**）。
- **AC-D6**（匯出寫稽核）：Given 匯出成功, When 檢視稽核, Then 記一筆 `CHANGE_LOG_VIEW` 稽核（比照既有「查詢/展開檢視即記一筆」之慣例；匯出屬查詢行為之一種，**不新增 `actionType`**）；寫入失敗不阻斷匯出，進補償佇列重試。
- **AC-D7**（空結果匯出）：Given 符合條件之事件為 0 筆, When 匯出, Then 產生**僅含表頭列**之 CSV（非錯誤）。
- **AC-D8**（🔒 **不外溢**回歸鎖定；**2026-08-16 就地改寫**）：Given 本 delta 之匯出實作完成, When 檢視 [F024](F024-access-history-query.md) 之 `GET /admin/access-history/export`, Then 其**回應形狀、參數集合與前端行為皆與本 delta 導入前逐字相同**——本 delta **不得**順手改造它（既不得使其開始輸出 CSV，亦不得改其 JSON 形狀）；且 When 新匯出與 F024 共用任何 CSV 產生器或 helper 時, Then 該共用模組**須以參數承接欄位定義與 scope**，F024 既有程式路徑**不得因此被修改**（`git diff` 於 `access-history.controller.ts`／`AccessHistoryPage.tsx` 之匯出區段為空）。<br>📝 **2026-08-16 就地改寫，理由：原條文鎖住的是 no-op**。原條文為「Given 本 delta 實作完成, When 執行 [F024] 匯出, Then 其端點、參數、欄位與檔名**逐字與本 delta 導入前相同**」——其中「欄位與檔名」預設 F024 會輸出一份有欄位、有檔名的 CSV，而 **F024 從未產生任何檔案**，該斷言因此無可驗證之對象。改寫後之斷言改以「F024 既有程式路徑未被本 delta 觸及」為驗證標的，語意（範圍紀律 J）不變。

- **AC-D9**（🔴 CSV 注入防護；2026-08-16 lead 裁定）：Given 某變更事件之 `程序書書名`／`舊值`／`新值` 任一為 `=cmd|'/c calc'!A1`, When 匯出, Then 該儲存格於 CSV 中之值為 `'=cmd|'/c calc'!A1`（**最前面多一個半形單引號**），再依 RFC 4180 包覆逸出；以 `+`／`-`／`@`／Tab（`\t`）／CR（`\r`）開頭者同樣加前綴；不以此六種字元開頭者**不加任何前綴**（恆等）。**表頭列不套用本規則**（`AC-D2` ② 之逐字表頭斷言不受影響）。<br>⚠ **對值層斷言之影響（test-generator 必讀）**：「CSV 儲存格值 ＝ 畫面所見字串」**不再恆成立**；`AC-D2` 之「欄位＝畫面所見」僅約束**表頭與欄位集合**，**值層期望值一律為「畫面所見字串經本規則轉換後之結果」**。<br>📌 **本 tab 為三處匯出中注入面最大者**——`舊值`／`新值` 直接來自使用者輸入之任意欄位內容（含程序書書名、內容摘要），且以 `-` 開頭之數值型舊值（如 `-1`）為常見值，會被加前綴，屬**預期行為非缺陷**。規則權威＝[error-handling.md#export](../error-handling.md#export)。
- **AC-D10**（🔴 匯出鈕之選擇器與使用者可見回饋；**2026-08-16 補訂，同日二次調整斷言方式**，權威＝`prototypes/23-change-history.html`）：Given 位於「ICSOP 程序書」tab, When 檢視 topbar, Then 匯出鈕之 DOM id 為 **`exportDoc`**（與循環樹狀圖 tab 之 `exportTree` 為**兩個獨立控制項**，[F038](F038-lifecycle-tree-change-history.md) `AC-D1`）。<br>When 匯出成功, Then 顯示成功回饋，其文字**以逐字片段 `已匯出 ICSOP 程序書變更歷程（CSV，UTF-8 BOM）` 起始**（其後可附表頭與筆數等資訊，該部分不逐字約束）。<br>When 符合筆數超過上限, Then 顯示錯誤回饋，其文字**含逐字片段** `符合條件之事件為 {N} 筆，超過匯出上限 10000 筆，請縮小查詢條件`（`{N}` 為實際筆數），**且字串 `EXPORT_ROW_LIMIT_EXCEEDED` 出現於同一回饋容器內**。<br>📝 **2026-08-16 斷言方式調整（test-generator ringC 回報）**：原條文寫「並附錯誤碼標記 `EXPORT_ROW_LIMIT_EXCEEDED · 400`」，隱含錯誤碼為**獨立元素**——但現行 `ToastApi` **無 code 參數**，該形狀不可達。改為**兩段式斷言**（訊息逐字 ＋ 錯誤碼字串同容器內可見），**達成方式不拘**（可擴充 `ToastApi`，亦可將碼串接於訊息尾端）；規則權威＝[error-handling.md#export](../error-handling.md#export)。<br>📌 **本條之存在理由**：[#export](../error-handling.md#export) 只規定「訊息含上限值並提示縮小條件」之**語意**，未定逐字；`AC-D1`～`AC-D9` 亦未定義匯出鈕之選擇器。本輪約束環為簡化版 ⇒ 未入 AC 者，test-generator 只能自行臆造。
- **AC-D11**（🔴 CSV 值層：列舉欄輸出中文標籤；**2026-08-16 補訂**，lead 裁示）：Given 匯出成功, When 檢視資料列之各儲存格值, Then 下列成立——
  - ① **`變更欄位` 欄之值為該欄位之中文顯示標籤**（＝ [data-model 20 欄權威表](../data-model.md#document-entity) 之 UI 顯示標籤），**不得**輸出屬性名。逐案：`documentName` → `程序書書名`；`contentSummary` → `內容摘要`；`edition` → `版次`；`status` → `文件狀態`；`announcedDate` → `公告日期`；`draftingDeptId` → `制定部門`；`draftingSectionId` → `制定室別`；`primaryChiefId` → `當責室長-主要`；`usingDeptIds` → `文件使用部門`；`attachment(ICSOP_PDF)` → `檔案（ICSOP PDF）`。
  - ② **`來源` 欄之值為產生該變更事件之來源功能之中文名**，值域**恰為六者**：`編輯`（[F011](F011-edit-with-comparison.md) 一般欄位編輯）／`狀態切換`（[F012](F012-document-status-toggle.md)）／`制定組織`、`當責室長`、`使用部門`（[F014](F014-accountable-dept-chief.md) 之三類）／`附件`（[F016](F016-pdf-ojt-attachment.md) 替換）。**不得**輸出列舉代碼。
  - ③ **`時間` 欄之值為 `YYYY-MM-DD HH:mm:ss`**（UTC+8，**不附 `(UTC+8)` 字樣**；以顯式 +8 位移計算，不得依賴行程 TZ）。
  - ④ **🔴 對照表單一權威**：①② 之中文標籤**只能有一份**，畫面與 CSV 不得各存一份。**可觀測不變式（本條之實際斷言標的）＝「CSV 某列某欄之值，與畫面同一事件同一欄之可見文字逐字相同」**；落點由 system-architect 定（現況對照表只存在於前端，須搬至後端或抽為共用）。
  - 📝 **`prototypes/23` 之 demo 資料含 `公告日期`／`狀態` 兩個不在 ② 值域內之 `source` 值**——屬 demo 撰寫時之隨手值、**非規範來源**（② 之權威為本 feature Alternative Flows 所列之四個來源功能）。本輪無 fidelity 測試，designer **不需為此改檔**；日後若補 fidelity 測試須先對齊。
## Error Scenarios
- **權限限縮/空條件**：非授權角色（主管／部門窗口／一般使用者）→403（OQ-E07-04 定案：僅 SysAdmin／ICSOPAdmin）；空條件比照 F024 `QUERY_CONDITION_REQUIRED`。見 [error-handling.md#permission](../error-handling.md#permission)、[#audit](../error-handling.md#audit)。
- **匯出筆數超限**（2026-08-16）：`EXPORT_ROW_LIMIT_EXCEEDED`（400），不產生檔案；見 [error-handling.md#export](../error-handling.md#export)。
- **稽核寫入失敗不阻斷**：`CHANGE_LOG_VIEW` 寫入暫時異常時不阻擋查詢/檢視，進補償佇列重試補寫；稽核不可竄改（`AUDIT_IMMUTABLE`）見 [error-handling.md#audit](../error-handling.md#audit)。
- **變更日誌寫入與來源交易一致性**：變更日誌宜與來源功能（F011/F012/F014/F016）之儲存交易同步（同一交易或緊接觸發），避免非同步造成不同步——**確切交易邊界屬架構決策（待 system-architect）**。

## Related
- Data: [AUDIT_LOG](../data-model.md#auditlog-entity)（`CHANGE_LOG_VIEW` 之歸屬待架構師，見 OQ-E07-02）；**變更日誌實體（草案 `DOCUMENT_CHANGE_LOG`）為新實體、schema 待 system-architect 定案**（data-model 僅加指涉性註記，見 OQ-E07-02）
- Depends on: [F011](F011-edit-with-comparison.md)、[F012](F012-document-status-toggle.md)、[F014](F014-accountable-dept-chief.md)、[F016](F016-pdf-ojt-attachment.md)（變更事件來源）、[F024](F024-access-history-query.md)（查詢頁模式重用）、[F023](F023-audit-logging.md)（稽核機制）、[F025](F025-role-function-matrix.md)（權限＝獨立功能列「文件變更歷程」，SysAdmin／ICSOPAdmin 唯讀、其餘無；OQ-E07-04 定案）、[F001](F001-auth-login-session.md)
- Related: 同區塊另一 tab [F038](F038-lifecycle-tree-change-history.md)（循環樹狀圖變更歷程）；欄位權威定義 [ICSOP_DOCUMENT 19 欄](../data-model.md#document-entity)
- Story: [US-062](../../stories/epics/E07-audit-trail/US-062-document-change-history.md)
- NFR: [稽核與資料保留](../nfr.md#audit-retention)（變更日誌保留政策待定，見 OQ-NFR003）
- OQ: OQ-E07-02（`CHANGE_LOG_VIEW`＋變更日誌實體之資料模型歸屬，待架構師）、**OQ-E07-06（附件 diff 涵蓋範圍＋是否匯出）→ ✅ 匯出子題已於 2026-08-16 定案為「是」**（PDF 排版子題維持原架構定案）、OQ-E07-07（是否提供還原舊值）、OQ-E07-08（「所屬節點」掛載異動歸本 tab 或 F038）、OQ-NFR003（保留期限是否適用同一政策）
- **2026-08-16 使用者裁決**: OQ-D18-16（匯出格式與範圍）、OQ-D18-17（兩 tab 各自匯出）。見 [§ICSOP 程序書 tab 匯出 delta](#export-delta)。
- **待 ui-ux-designer（本 delta 新增）**：`prototypes/23-change-history.html` 兩個 tab 之工具列各新增一個「匯出」鈕（比照 `17-access-history.html` 之既有匯出鈕呈現）。
- **待 system-architect（本 delta 新增）**：匯出端點形狀（建議 `GET /admin/change-history/documents/export`，參數與既有查詢端點相同）、10,000 筆上限之檢查時點、是否與 [F024](F024-access-history-query.md)／[F039](F039-appendix-management.md) 共用同一 CSV 產生器。
- 已定案: OQ-E07-04（「文件變更歷程」為**獨立後台功能**，F025 新增獨立功能列；兩 tab 統一僅 SysAdmin／ICSOPAdmin 全公司唯讀、主管／部門窗口／一般使用者無權）
- **待 system-architect**：`DOCUMENT_CHANGE_LOG` 是否併入 AUDIT_LOG（新 targetType）或獨立建表、欄位結構、變更日誌與來源功能之交易邊界、diff 儲存與呈現實作。

## 待 system-architect（不在本 spec 敲定）
- 變更日誌資料模型（併表 vs 獨立表、欄位結構、身分快照儲存）。
- 變更日誌寫入與 F011/F012/F014/F016 儲存之交易一致性邊界。
- 欄位層 diff 之儲存與比對演算法、人員/組織名稱快照之取得時機。
