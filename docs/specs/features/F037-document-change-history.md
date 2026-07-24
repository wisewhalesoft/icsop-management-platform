# F037: ICSOP 程序書變更歷程（欄位層 Before/After Diff）
Priority: P1 | Status: 🟡 實作（欄位層 diff＋CREATE 建立事件＋STATUS reason 顯示；交易邊界維持 best-effort（人類定案）；單元綠；整合已寫未跑；見 implementation-logs/doc-changelog-impl.md） | Last Updated: 2026-07-24
Epic/Story: E07 / US-062

> **獨立後台功能「文件變更歷程」**（獨立側選單項，非「文件調閱歷程」子頁；prototype `23-change-history.html`）之 **ICSOP 程序書 tab**（與循環樹狀圖 tab [F038](F038-lifecycle-tree-change-history.md) 併存，共兩 tab）。以 **append-only 欄位層變更日誌**追溯文件內容異動，**不保留整份歷史版本檔**（與「僅保存當前版本」定案調和）。權限依 [F025](F025-role-function-matrix.md) 獨立功能列「文件變更歷程」。

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
- 匯出查詢結果（比照 F024 之 CSV/Excel）：是否納入本 feature 待確認，見 OQ-E07-06。

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

## Error Scenarios
- **權限限縮/空條件**：非授權角色（主管／部門窗口／一般使用者）→403（OQ-E07-04 定案：僅 SysAdmin／ICSOPAdmin）；空條件比照 F024 `QUERY_CONDITION_REQUIRED`。見 [error-handling.md#permission](../error-handling.md#permission)、[#audit](../error-handling.md#audit)。
- **稽核寫入失敗不阻斷**：`CHANGE_LOG_VIEW` 寫入暫時異常時不阻擋查詢/檢視，進補償佇列重試補寫；稽核不可竄改（`AUDIT_IMMUTABLE`）見 [error-handling.md#audit](../error-handling.md#audit)。
- **變更日誌寫入與來源交易一致性**：變更日誌宜與來源功能（F011/F012/F014/F016）之儲存交易同步（同一交易或緊接觸發），避免非同步造成不同步——**確切交易邊界屬架構決策（待 system-architect）**。

## Related
- Data: [AUDIT_LOG](../data-model.md#auditlog-entity)（`CHANGE_LOG_VIEW` 之歸屬待架構師，見 OQ-E07-02）；**變更日誌實體（草案 `DOCUMENT_CHANGE_LOG`）為新實體、schema 待 system-architect 定案**（data-model 僅加指涉性註記，見 OQ-E07-02）
- Depends on: [F011](F011-edit-with-comparison.md)、[F012](F012-document-status-toggle.md)、[F014](F014-accountable-dept-chief.md)、[F016](F016-pdf-ojt-attachment.md)（變更事件來源）、[F024](F024-access-history-query.md)（查詢頁模式重用）、[F023](F023-audit-logging.md)（稽核機制）、[F025](F025-role-function-matrix.md)（權限＝獨立功能列「文件變更歷程」，SysAdmin／ICSOPAdmin 唯讀、其餘無；OQ-E07-04 定案）、[F001](F001-auth-login-session.md)
- Related: 同區塊另一 tab [F038](F038-lifecycle-tree-change-history.md)（循環樹狀圖變更歷程）；欄位權威定義 [ICSOP_DOCUMENT 19 欄](../data-model.md#document-entity)
- Story: [US-062](../../stories/epics/E07-audit-trail/US-062-document-change-history.md)
- NFR: [稽核與資料保留](../nfr.md#audit-retention)（變更日誌保留政策待定，見 OQ-NFR003）
- OQ: OQ-E07-02（`CHANGE_LOG_VIEW`＋變更日誌實體之資料模型歸屬，待架構師）、OQ-E07-06（附件 diff 涵蓋範圍＋是否匯出）、OQ-E07-07（是否提供還原舊值）、OQ-E07-08（「所屬節點」掛載異動歸本 tab 或 F038）、OQ-NFR003（保留期限是否適用同一政策）
- 已定案: OQ-E07-04（「文件變更歷程」為**獨立後台功能**，F025 新增獨立功能列；兩 tab 統一僅 SysAdmin／ICSOPAdmin 全公司唯讀、主管／部門窗口／一般使用者無權）
- **待 system-architect**：`DOCUMENT_CHANGE_LOG` 是否併入 AUDIT_LOG（新 targetType）或獨立建表、欄位結構、變更日誌與來源功能之交易邊界、diff 儲存與呈現實作。

## 待 system-architect（不在本 spec 敲定）
- 變更日誌資料模型（併表 vs 獨立表、欄位結構、身分快照儲存）。
- 變更日誌寫入與 F011/F012/F014/F016 儲存之交易一致性邊界。
- 欄位層 diff 之儲存與比對演算法、人員/組織名稱快照之取得時機。
