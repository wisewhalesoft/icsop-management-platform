# US-063: 循環樹狀圖變更歷程（新舊版預覽／下載燒錄浮水印）

> **Story ID**: US-063
> **Epic**: [E07 稽核與文件調閱歷程](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 13

---

## User Story

**As a** 系統管理員 / ICSOP 管理員（**僅此二角色**，2026-07-17 OQ-E07-04 定案；主管／部門窗口／一般使用者一律無權，見 AC-7）
**I want** 在**獨立後台功能「文件變更歷程」**（獨立側選單項，與「文件調閱歷程」為平行的兩個功能，非從屬關係）的「循環樹狀圖」tab 查詢並檢視指定循環之 DAG 結構變更歷史，並可預覽/下載變更前後兩個版本的樹狀圖
**So that** 我可以追溯循環結構（節點／連線／文件掛載）何時被誰異動、異動了什麼，並在需要留存或稽核佐證時取得帶浮水印、可追溯來源的匯出檔案

---

## 與既有決策之調和（重要，須先讀）

同 [US-062](US-062-document-change-history.md) 之調和原則：本功能為**輕量結構變更事件日誌**，非保留完整歷史版本檔案。但循環 DAG 結構之特殊性在於——要呈現「新舊樹狀圖預覽」需要重建**變更前後兩個完整時點的圖結構**（節點+連線的完整集合），而非單一欄位的 oldValue/newValue 字串即可表達。因此本 story 在儲存粒度上有兩種可能取捨，皆不違反「不留歷史版本檔」原則（該決策鎖定的是「不重複保存大型檔案」，DAG 結構本身是輕量關聯式資料）：

- **(a) 結構化 diff 記法**：每次變更僅記錄異動本身（新增/刪除了哪個節點、哪條邊、掛載了哪份文件），「新舊樹狀圖」由後端在請求當下重放（replay）diff 序列重建兩個時點的完整結構。優點：儲存量小；缺點：重建邏輯較複雜，效能隨變更次數增加而下降。
- **(b) 完整快照記法**：每次「造成結構改變的動作」提交後，儲存當下整份循環之節點＋連線 JSON 快照（非檔案，為結構化資料）。優點：渲染新舊樹狀圖只需直接讀兩筆快照，實作簡單、效能穩定；缺點：快照筆數隨變更次數線性增長（但單一循環節點/邊數量通常不大，儲存量可控）。

本 story 草案傾向 **(b) 完整快照**（實作簡單、渲染可靠），但最終方案、以及快照的**變更事件邊界**（見下方 Open Questions）留待系統架構師決定。

---

## Acceptance Criteria

### AC-1: 「文件變更歷程」獨立功能進入點（循環樹狀圖 tab）
- **Given** 我是具可視權限之角色，於後台側邊選單點擊**獨立功能項「文件變更歷程」**（與「文件調閱歷程」為平行選單項，非其子頁或下方區塊）
- **When** 我切換至「循環樹狀圖」tab
- **Then** 系統顯示可依循環（名稱/ID）與時間區間查詢之介面，送出後回傳符合條件之結構變更事件清單（可分頁，時間新到舊），每筆顯示循環名稱、異動類型、操作人員、時間

### AC-2: 變更事件產生——節點與連線（來源 US-021）
- **Given** ICSOP 管理員於 DAG 畫布新增/刪除節點，或新增/刪除連線（[US-021](../E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md)）
- **When** 該操作成功持久化
- **Then** 系統記錄一筆結構變更事件，含異動類型（草案列舉：`NODE_ADDED`／`NODE_REMOVED`／`EDGE_ADDED`／`EDGE_REMOVED`）、操作人員、時間、所屬循環

### AC-3: 變更事件產生——節點名稱與文件掛載（來源 US-023）
- **Given** ICSOP 管理員經節點抽屜修改節點名稱、或掛載/改派 ICSOP 文件（[US-023](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md)）
- **When** 儲存完成
- **Then** 系統記錄對應結構變更事件（草案列舉：`NODE_RENAMED`／`DOCUMENT_MOUNTED`／`DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED`），內容含節點/文件識別、舊值/新值（如節點名稱之新舊字串、文件掛載之改派來源與目標節點）

### AC-4: 新舊樹狀圖並列預覽
- **Given** 我在變更歷程清單中選擇某筆循環結構變更事件
- **When** 我點擊「預覽」
- **Then** 系統以比照 [US-025 循環樹狀圖預覽](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) 之 viewer 手法（整頁沉浸式、對角平鋪浮水印），並列或可切換顯示「變更前」與「變更後」兩個版本的樹狀圖（上到下佈局、直角箭頭連線），差異節點/連線以視覺標示區分新增／刪除（如新增以特定顏色標示、刪除以刪除線或半透明標示）

### AC-5: 下載燒錄浮水印
- **Given** 我在新舊樹狀圖預覽畫面
- **When** 我點擊「下載」
- **Then** 系統於伺服器端產生 PDF（涵蓋變更前後兩版本，實際排版方式——單一 PDF 內兩頁或兩份獨立 PDF——由架構師/UI-UX 決定），並將浮水印**實際燒錄進 PDF 內容層**（格式與欄位順序比照 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md) 權威格式、固定機密聲明另起一行呈現），非僅前端顯示疊加，作法比照 [US-025 AC-10](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) 與 [E06 US-054](../E06-public-browsing/US-054-download-print-watermark-burn.md)

### AC-6: 計入稽核
- **Given** 任一具可視權限角色預覽或下載某筆循環變更歷程之樹狀圖
- **When** 該動作完成
- **Then** 系統記錄一筆稽核紀錄（動作類型草案延伸 [US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)／F036 之 `LIFECYCLE_*` 系列，新增 `LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD`），內容包含操作人員、員工編號、部門、處/室、循環 ID/名稱、操作時間戳記，且與當次浮水印內容一致（下載情境）；稽核寫入失敗不阻斷瀏覽，失敗進補償佇列重試（比照 [US-060 AC3](US-060-audit-trail-logging.md)）

### AC-7: 角色可視範圍限縮（2026-07-17 OQ-E07-04 定案）
- **Given** 登入角色為「系統管理員」或「ICSOP 管理員」
- **When** 該角色查詢或開啟循環變更歷程
- **Then** 系統允許，範圍為全公司（依 [US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 矩陣**新增之獨立功能列「文件變更歷程」**：SysAdmin／ICSOPAdmin 皆唯讀）
- **Given** 登入角色為「主管」「部門窗口」或「一般使用者」
- **When** 該角色嘗試進入「文件變更歷程」功能之「循環樹狀圖」tab（側選單不顯示此功能項）或直接呼叫本功能 API
- **Then** 系統回傳 403（`PERMISSION_DENIED`），tab 亦不顯示——「文件變更歷程」為**獨立功能**，於 [US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 矩陣自成一列（非比照或從屬於「文件調閱歷程查詢」列），僅剛好權限值相同（皆 SysAdmin／ICSOPAdmin 唯讀、其餘無）。此為 2026-07-17 使用者定案（OQ-E07-04），**覆蓋本 story 原「比照循環管理矩陣列、主管全公司唯讀」之草案**——主管雖對「循環管理」本身（[US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)，OQ-E08-03）與「ICSOP 文件管理」皆為全公司唯讀，但「文件變更歷程」為性質不同之獨立功能，其權限值由使用者定案為 SysAdmin／ICSOPAdmin 唯讀、主管無權，**OQ-E08-03 僅適用於循環樹狀圖預覽（F036/US-025），不適用於本 story（文件變更歷程）**，兩者為不同功能、不同矩陣列，不可混用

---

## Technical Notes

- 新增資料實體草案 `LIFECYCLE_CHANGE_LOG`：`id`、`lifecycleId`、`changeType`（列舉見 AC-2/AC-3）、`entityType`（NODE／EDGE／MOUNT）、`entityId`、`beforeValue`／`afterValue`（JSON 或結構化欄位）、`changedByAccountId`＋身分快照、`changedAt`。若採快照法（見上方調和說明選項 b），另需 `LIFECYCLE_SNAPSHOT`：`id`、`lifecycleId`、`changeLogId`（→ 對應之變更事件）、`nodesJson`、`edgesJson`、`capturedAt`。
- **快照/變更事件邊界**：[US-021 Technical Notes](../E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md) 既有「畫布操作（新增/刪除節點、連線）採樂觀更新＋後端逐動作持久化」之互動模式（非等待一個「總送出」按鈕），意味著每個原子操作（單一新增節點、單一連線）都是獨立 API 呼叫。若每個原子操作都各自產生一筆快照，短時間內連續編輯可能產生大量快照筆數（雜訊）。是否需要「編輯階段」聚合（例如同一使用者於畫布上短時間內的連續操作合併為一筆變更事件），或維持逐動作獨立記錄，待架構師/使用者決定（見 Open Questions，此為 coordinator 特別點名之關鍵決策）。
- 新舊樹狀圖之渲染／版面／並列或可切換呈現方式、下載 PDF 之排版（單一 PDF 兩頁 vs 兩份獨立 PDF），技術細節留待架構師與 UI/UX 設計階段具體化。
- 稽核動作類型 `LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 與 [US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) 既有之 `LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 同屬「循環」為稽核對象之動作類型家族，建議與 US-025 既有 Open Question（`LIFECYCLE_*` 資料模型歸屬）合併討論、一併定案，避免同一功能族群分批各自決策造成資料模型不一致。

---

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-063-01 | 於某循環新增一個節點並持久化，預期產生一筆 `NODE_ADDED` 變更事件 | Happy Path |
| TC-063-02 | 於某循環刪除一條連線，預期產生一筆 `EDGE_REMOVED` 變更事件 | Happy Path |
| TC-063-03 | 經節點抽屜將某文件由節點 A 改派至節點 B，預期產生一筆 `DOCUMENT_REASSIGNED` 事件，含來源/目標節點 | Happy Path |
| TC-063-04 | 選擇一筆變更事件並點擊「預覽」，預期正確並列呈現變更前後兩版本樹狀圖，差異節點/連線視覺標示正確 | Happy Path |
| TC-063-05 | 下載某筆變更事件之新舊樹狀圖 PDF，預期取得之 PDF 內容層含正確浮水印文字（以 PDF 文字擷取工具驗證） | Happy Path |
| TC-063-06 | 下載/預覽完成後檢查稽核紀錄，預期產生對應 `LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 紀錄 | Happy Path |
| TC-063-07 | 部門窗口／一般使用者／主管呼叫本功能 API，預期回傳 403（三者依 OQ-E07-04 定案皆無「文件變更歷程」可視權限）；後台側邊選單亦不顯示「文件變更歷程」功能項 | Error Case |
| TC-063-08 | 主管以其在「循環管理」（US-025）本可全公司唯讀檢視之循環，改嘗試開啟該循環之「變更歷程」（含直接帶入循環 ID 之網址），預期仍回傳 403——驗證「可查看循環本身」不等於「可查看其變更歷程」，OQ-E08-03（循環管理全公司唯讀）不適用於本 story | Edge Case |
| TC-063-09 | 短時間內連續新增 5 個節點與 4 條連線（單一編輯階段），預期產生對應筆數之變更事件（或依聚合策略定案後之筆數），此為驗證快照/聚合邊界之基準測試，具體預期值待 Open Question 定案後補完 | Edge Case |
| TC-063-10 | 循環無任何歷史結構變更事件時開啟本 tab，預期顯示空狀態提示而非錯誤 | Edge Case |

---

## Dependencies

- **Blocked By**: [E03 US-021 DAG 節點與連線維護](../E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md)（節點/連線變更事件來源）、[US-022 DAG 防環驗證](../E03-lifecycle-dag/US-022-dag-cycle-prevention.md)、[US-023 節點抽屜維護](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md)（節點名稱/文件掛載變更事件來源）、[US-025 循環樹狀圖預覽](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)（viewer 呈現手法與稽核動作類型家族基礎）、[E06 US-054 下載/列印 PDF 浮水印燒錄](../E06-public-browsing/US-054-download-print-watermark-burn.md)（PDF 燒錄手法參考）、[US-061 文件調閱歷程查詢後台](US-061-access-history-query-backend.md)（查詢介面設計模式參考，兩者為**獨立頁面**、非共用同一物理頁面框架）、[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)（「文件變更歷程」獨立矩陣列依據，2026-07-17 OQ-E07-04 新增）、[NFR-007 浮水印防竄改與一致性](../../non-functional/NFR-007-watermark-integrity.md)
- **Blocks**: 無下游 Story 直接依賴

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E07 稽核與文件調閱歷程](epic-brief.md)
- **NFRs**: [NFR-007 浮水印防竄改與一致性](../../non-functional/NFR-007-watermark-integrity.md)
- **Related Stories**: [US-062 ICSOP 程序書變更歷程](US-062-document-change-history.md)（同一「文件變更歷程」獨立功能之另一 tab）、[US-060](US-060-audit-trail-logging.md)、[US-061](US-061-access-history-query-backend.md)、[E03 US-021](../E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md)／[US-023](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md)／[US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md)、[E08 US-070](../E08-permission-matrix/US-070-role-function-matrix.md)

---

## Open Questions

- [x] **[OQ-E07-04] 可視範圍——已定案（2026-07-17）**：使用者澄清「變更歷程」為**獨立後台功能**（獨立側選單項），不歸屬、不比照「文件調閱歷程查詢」（change 歸 change、access 歸 access）。於 [US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 矩陣新增獨立一列「文件變更歷程」＝ SysAdmin／ICSOPAdmin 唯讀（全公司）、主管／部門窗口／一般使用者無。此列同時涵蓋本 story 與 [US-062](US-062-document-change-history.md) 兩個 tab（權限值相同，同一功能列）。**本 story 原「比照循環管理矩陣列、主管全公司唯讀」草案已被覆蓋**；OQ-E08-03（循環管理主管全公司唯讀）僅適用 [US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) 循環樹狀圖預覽本身，不適用本 story。原「US-062/US-063 基準不一致」之疑慮已因此定案而消弭，兩 tab 現統一於此獨立矩陣列。
- [ ] **[OQ-E07-05] DAG 變更歷程之儲存與事件粒度（重要，coordinator 特別點名）**：(1) 每次「原子編輯操作」（單一新增/刪除節點或連線）皆各自記一筆變更事件/快照，或需聚合為「編輯階段」（同一使用者短時間內連續操作合併為一筆，因 [US-021](../E03-lifecycle-dag/US-021-dag-node-edge-maintenance.md) 現行為逐動作持久化、非等待總送出）；(2) 儲存採「結構化 diff＋回放重建」或「每次提交後完整節點/邊快照」（見上方調和說明選項 a/b，草案傾向 b）。兩者皆待架構師/使用者決定，`LIFECYCLE_CHANGE_LOG`／`LIFECYCLE_SNAPSHOT` 是否新建亦一併定案。
- [ ] **[OQ-E07-02] 稽核資料模型歸屬**：`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 是否併入 US-025 既有 `LIFECYCLE_*` 系列之資料模型歸屬決策（建議是，避免同一循環相關稽核動作分批各自決策），一併留待架構師定案。
- [ ] **[OQ-E07-06] 下載 PDF 排版方式**：變更前後兩版本是否合併於單一 PDF（如兩頁）或各自產出獨立 PDF，待架構師/UI-UX 決定。
- [ ] **保留期限（[OQ-NFR003](../../non-functional/NFR-003-audit-retention.md)）**：同 US-062，是否適用既有稽核保留年限草案，或需獨立政策，待確認。
- [ ] **[OQ-E07-08] 「所屬節點」文件異動是否應同時呈現於 US-062**：見 [US-062 Open Questions](US-062-document-change-history.md)，若使用者認為應同時出現在兩個 tab，需額外設計交叉引用或重複呈現機制。
