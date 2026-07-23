# F038: 循環樹狀圖變更歷程（新舊版預覽／下載燒錄浮水印）
Priority: P1 | Status: 🟡 部分（結構事件日誌＋查詢＋預覽單元綠；新舊快照並列/燒錄下載待架構 OQ-E07-05；見 implementation-log/F038-impl.md） | Last Updated: 2026-07-23
Epic/Story: E07 / US-063

> **獨立後台功能「文件變更歷程」**（獨立側選單項，非「文件調閱歷程」子頁；prototype `23-change-history.html`）之 **循環樹狀圖 tab**（與 ICSOP 程序書 tab [F037](F037-document-change-history.md) 併存，共兩 tab）。以 **append-only 結構變更事件日誌**追溯循環 DAG 結構異動，並可預覽/下載變更前後兩版本樹狀圖（燒錄浮水印）。權限依 [F025](F025-role-function-matrix.md) 獨立功能列「文件變更歷程」。稽核動作屬 [F036](F036-lifecycle-tree-preview.md)「循環」`LIFECYCLE_*` 家族之延伸。

## Description
提供依循環（名稱／ID）與時間區間查詢之 DAG 結構變更歷程；每筆事件記錄異動類型（節點／連線／文件掛載之新增/刪除/改派/改名）、操作人員、時間、所屬循環。選擇某筆事件可**並列或可切換預覽「變更前／變更後」兩版本樹狀圖**（比照 [F036](F036-lifecycle-tree-preview.md) viewer：整頁沉浸式、上到下佈局、直角箭頭、對角平鋪浮水印；差異節點/連線以視覺標示新增/刪除），並可**下載**其 PDF（浮水印**燒錄進內容層**，比照 [F020](F020-watermark.md)／[NFR-007](../nfr.md#watermark)）。檢視/下載即記 `LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 稽核。變更事件由 DAG 維護功能產生：節點/連線（[F008](F008-dag-node-edge.md)）、節點名稱/文件掛載（[F009](F009-node-drawer-maintenance.md)）。

**與「僅保存當前版本」調和**：本功能為**輕量結構變更事件日誌**，非保留完整歷史版本檔；DAG 結構為輕量關聯式資料（節點＋連線），非大型檔案。呈現新舊樹狀圖需重建兩時點之完整結構——**採「結構化 diff 重放」或「完整結構快照」及其事件粒度（逐動作 vs 編輯階段聚合）屬架構決策，待 system-architect，見 OQ-E07-05**（本 spec 不敲定）。

## Preconditions
- 操作者具「文件變更歷程」功能存取權（**定案（OQ-E07-04）**：依 [F025](F025-role-function-matrix.md) **獨立功能列「文件變更歷程」**——僅 SysAdmin／ICSOPAdmin 全公司唯讀；**主管／部門窗口／一般使用者一律無權**（功能/tab 不顯示、直接呼叫 API 回 403）。與 F037 一致；**覆蓋原「比照循環管理／主管全公司唯讀」草案**——主管對本 tab 亦無權）。
- 結構變更事件已由來源功能（F008／F009）於其持久化時同步寫入變更日誌。

## Main Flow
1. 進入獨立後台功能「文件變更歷程」（`23-change-history.html`）→ 切換至「循環樹狀圖」tab。
2. 依循環（名稱/ID）與時間區間查詢 → 送出（後端強制驗證角色可視範圍）。
3. 回傳符合之結構變更事件清單（分頁，時間新到舊）：每筆顯示循環名稱、異動類型、操作人員、時間。
4. 選擇某筆事件 → 點「預覽」→ 以 F036 viewer 手法並列/可切換顯示「變更前／變更後」兩版本樹狀圖，差異視覺標示；整頁疊加浮水印。
5. 點「下載」→ 伺服器端產生涵蓋前後兩版本之 PDF，浮水印燒錄進內容層（比照 F020/US-054）。
6. 預覽/下載動作同步記 `LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD` 稽核（下載情境內容與燒錄浮水印一致）。

## Alternative Flows
- **變更事件產生（來源功能側，持久化時同步寫入）**：
  - 節點/連線（F008）：`NODE_ADDED`／`NODE_REMOVED`／`EDGE_ADDED`／`EDGE_REMOVED`（草案列舉），含操作人員/時間/所屬循環。
  - 節點名稱/文件掛載（F009）：`NODE_RENAMED`／`DOCUMENT_MOUNTED`／`DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED`，含節點/文件識別與舊值/新值（如節點名稱新舊字串、改派來源/目標節點）。
- 下載 PDF 排版（單一 PDF 兩頁 vs 兩份獨立 PDF）：由架構師/UI-UX 決定，見 OQ-E07-06。

## Edge Cases
- 循環無任何歷史結構變更事件：開啟本 tab 顯示空狀態提示（非錯誤）。
- 短時間內連續多個原子操作（單一編輯階段）：產生之事件筆數依 OQ-E07-05 聚合策略定案（草案逐動作獨立記錄，可能列表項多/雜訊）。
- 部門窗口／一般使用者呼叫本功能 API：一律回 403。
- 差異涉及被刪除節點/連線：預覽以刪除線/半透明標示；下游遍歷與呈現比照 F036（DAG 禁環保證終止）。

## Postconditions
- 循環 DAG 結構異動可被逐事件、依時間追溯，並可取得帶浮水印之新舊樹狀圖佐證；未保留歷史版本檔。
- 每次預覽/下載留一筆不可竄改之 `LIFECYCLE_CHANGELOG_*` 稽核。

## Acceptance Criteria
- Given 具權限角色進入獨立功能「文件變更歷程」, When 切換至「循環樹狀圖」tab, Then 顯示依循環與時間區間查詢之介面，送出後回傳符合之結構變更事件清單（分頁，時間新到舊，每筆含循環名稱/異動類型/操作人員/時間）。
- Given 管理員於 DAG 畫布新增/刪除節點或連線（F008）, When 操作成功持久化, Then 記一筆對應結構變更事件（`NODE_ADDED`／`NODE_REMOVED`／`EDGE_ADDED`／`EDGE_REMOVED`），含操作人員/時間/所屬循環。
- Given 管理員經節點抽屜改節點名稱或掛載/改派文件（F009）, When 儲存完成, Then 記對應事件（`NODE_RENAMED`／`DOCUMENT_MOUNTED`／`DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED`），含識別與舊值/新值。
- Given 於清單選擇某筆結構變更事件並點「預覽」, When 開啟, Then 以 F036 viewer 手法並列/可切換呈現變更前後兩版本樹狀圖（上到下、直角箭頭），差異節點/連線視覺標示新增/刪除，整頁疊加浮水印。
- Given 於新舊樹狀圖預覽點「下載」, When 完成, Then 取得伺服器端產生、浮水印已**燒錄於 PDF 內容層**（格式權威同 NFR-007、機密聲明另起一行、比照 F020）之檔案，非僅前端疊加。
- Given 預覽或下載完成, When 動作完成, Then 各記一筆稽核（`LIFECYCLE_CHANGELOG_VIEW`／`LIFECYCLE_CHANGELOG_DOWNLOAD`），含操作人員/員工編號/部門/處室/循環 ID·名稱/時間，下載情境與燒錄浮水印一致；寫入失敗不阻斷瀏覽，進補償佇列重試（比照 F023）。
- Given 登入角色為主管／部門窗口／一般使用者, When 查詢或開啟循環變更歷程（或直接呼叫 API）, Then 回 403（`PERMISSION_DENIED`）；本功能兩 tab 統一僅 SysAdmin／ICSOPAdmin 全公司唯讀（OQ-E07-04 定案，F025 獨立功能列「文件變更歷程」；**主管對本『循環樹狀圖變更』tab 亦無權**）。
- Given 循環無任何歷史結構變更事件, When 開啟本 tab, Then 顯示空狀態提示而非錯誤。

## Error Scenarios
- **權限限縮**：主管／部門窗口／一般使用者→403（僅 SysAdmin／ICSOPAdmin，OQ-E07-04 定案）。見 [error-handling.md#permission](../error-handling.md#permission)。
- **下載未授權**：無可視權限角色略過 UI 直接呼叫下載 API→403，不產檔、不燒錄、不留稽核（操作即被拒）。見 [error-handling.md#permission](../error-handling.md#permission)。
- **稽核寫入失敗不阻斷**：`LIFECYCLE_CHANGELOG_*` 寫入異常時不阻擋瀏覽，進補償佇列重試；稽核不可竄改（`AUDIT_IMMUTABLE`）見 [error-handling.md#audit](../error-handling.md#audit)。

## Related
- Data: [LIFECYCLE](../data-model.md#lifecycle-entity)、[LIFECYCLE_NODE](../data-model.md#node-entity)、[LIFECYCLE_EDGE](../data-model.md#edge-entity)、[ICSOP_DOCUMENT](../data-model.md#document-entity)（掛載）、[AUDIT_LOG](../data-model.md#auditlog-entity)（`LIFECYCLE_CHANGELOG_*` 歸屬待架構師，見 OQ-E07-02）；**變更/快照實體（草案 `LIFECYCLE_CHANGE_LOG`、選採快照時另 `LIFECYCLE_SNAPSHOT`）為新實體、schema 待 system-architect（data-model 僅加指涉性註記，見 OQ-E07-05）**
- Depends on: [F008](F008-dag-node-edge.md)、[F009](F009-node-drawer-maintenance.md)（結構變更事件來源）、[F036](F036-lifecycle-tree-preview.md)（viewer/浮水印/`LIFECYCLE_*` 稽核家族基礎）、[F020](F020-watermark.md)（燒錄手法）、[F023](F023-audit-logging.md)（稽核機制）、[F024](F024-access-history-query.md)（查詢頁模式重用）、[F025](F025-role-function-matrix.md)（權限＝獨立功能列「文件變更歷程」，SysAdmin／ICSOPAdmin 唯讀、其餘無；OQ-E07-04 定案）、[F001](F001-auth-login-session.md)
- Related: 同區塊另一 tab [F037](F037-document-change-history.md)；下載燒錄手法參考 US-054（E06）
- Story: [US-063](../../stories/epics/E07-audit-trail/US-063-lifecycle-tree-change-history.md)
- NFR: [浮水印一致性](../nfr.md#watermark)（新舊樹狀圖下載為浮水印燒錄情境，涵蓋見 OQ-NFR007c）、[稽核與資料保留](../nfr.md#audit-retention)（保留政策見 OQ-NFR003）
- OQ: OQ-E07-05（DAG 儲存粒度＝diff/快照＋事件粒度＝逐動作/編輯階段聚合，待架構師）、OQ-E07-02（`LIFECYCLE_CHANGELOG_*` 併入 F036 `LIFECYCLE_*` 資料模型歸屬）、OQ-E07-06（下載 PDF 排版）、OQ-NFR003（保留期限）
- 已定案: OQ-E07-04（「文件變更歷程」為**獨立後台功能**，F025 新增獨立功能列；兩 tab 統一僅 SysAdmin／ICSOPAdmin 全公司唯讀、**主管對本 tab 亦無權**；覆蓋原「比照循環管理」草案）
- **待 system-architect**：DAG 變更之儲存粒度與事件邊界（OQ-E07-05）、變更/快照實體 schema、新舊樹狀圖重建與 diff 渲染、下載 PDF 排版。

## 待 system-architect（不在本 spec 敲定）
- 結構變更儲存法（結構化 diff 重放 vs 完整結構快照）與**事件/快照邊界**（逐原子操作 vs 編輯階段聚合）——OQ-E07-05。
- `LIFECYCLE_CHANGE_LOG`／`LIFECYCLE_SNAPSHOT` 是否新建、欄位結構、與 AUDIT_LOG／F036 `LIFECYCLE_*` 之歸屬關係。
- 新舊樹狀圖之重建演算法、並列/切換渲染、差異視覺標示、下載 PDF 排版（單一兩頁 vs 兩份）。
