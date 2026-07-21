# US-062: ICSOP 程序書變更歷程（欄位層 Before/After Diff）

> **Story ID**: US-062
> **Epic**: [E07 稽核與文件調閱歷程](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 8

---

## User Story

**As a** 系統管理員 / ICSOP 管理員（**僅此二角色**，2026-07-17 OQ-E07-04 定案；主管／部門窗口／一般使用者一律無權，見 AC-7）
**I want** 在**獨立後台功能「文件變更歷程」**（獨立側選單項，與「文件調閱歷程」為平行的兩個功能，非從屬關係）的「ICSOP 程序書」tab，查詢並檢視指定文件的欄位層級變更歷史（誰在何時把哪個欄位從什麼值改成什麼值）
**So that** 我可以追溯文件內容何時、由誰、如何被變更，滿足內控稽核與異動追溯需求，而不需要系統違反「僅保存當前版本」之決策去保留完整歷史版本檔案

---

## 與既有決策之調和（重要，須先讀）

專案已定案「版本管理：僅保存當前版本，編輯時帶出當前值對照，不留歷史版本檔」（見 [E04 epic-brief](../E04-icsop-document/epic-brief.md)、[US-031](../E04-icsop-document/US-031-edit-with-comparison.md)、data-model.md `ICSOP_DOCUMENT`）。本 story 的調和方式：

- **「變更歷程」＝ append-only 的欄位層級變更日誌（change-log），不是保留整份文件的歷史快照或版本檔**。每次編輯儲存只記錄「哪些欄位變了、舊值是什麼、新值是什麼」，不複製整份文件記錄或產生可還原的「第 N 版文件」實體。
- **檔案型附件（ICSOP PDF／OJT 簽到表／使用表單）仍維持覆蓋式儲存、不留舊檔**（[US-036](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md) 既有行為不變）。變更歷程對附件僅記錄「附件已被替換」這個**事件**（含類型、操作人員、時間），**不保留、不提供下載被覆蓋前的舊檔案內容**——因為原決策鎖定的是「不重複保存大型檔案/整份記錄快照」，本 story 的欄位層 diff 屬輕量事件記錄，不違反該決策精神；但附件內容本身仍遵循「覆蓋即消失」的既有原則，未擴大保存範圍。
- 因此「僅保存當前版本」與「保留變更歷程」兩者並不衝突：前者管的是**文件記錄本體與檔案**，後者管的是**一份獨立的、輕量的異動事件日誌**。

---

## Acceptance Criteria

### AC-1: 「文件變更歷程」獨立功能進入點（ICSOP 程序書 tab）
- **Given** 我是具可視權限之角色，於後台側邊選單點擊**獨立功能項「文件變更歷程」**（與「文件調閱歷程」為平行選單項，非其子頁或下方區塊）
- **When** 我進入該頁並停留於預設之「ICSOP 程序書」tab
- **Then** 系統顯示查詢介面（查詢模式比照 [US-061](US-061-access-history-query-backend.md)：依人員/文件（編號或名稱）/時間區間任意組合查詢），送出後回傳符合條件之變更事件清單（可分頁，時間新到舊）

### AC-2: 變更事件產生——一般欄位編輯（來源 US-031）
- **Given** ICSOP 管理員編輯一筆 ICSOP 文件並送出儲存（[US-031](../E04-icsop-document/US-031-edit-with-comparison.md)），且至少一個可寫欄位值有變化
- **When** 儲存完成
- **Then** 系統寫入 append-only 變更日誌，記錄本次異動之逐欄位資訊：欄位名稱、舊值、新值、操作人員、文件 ID/編號、變更時間；**未實際變更之欄位不記錄**（純顯示對照不等於變更事件）

### AC-3: 變更事件產生——狀態切換（來源 US-032）
- **Given** ICSOP 管理員切換文件狀態（[US-032](../E04-icsop-document/US-032-status-toggle.md)：有效／失效／作廢）
- **When** 切換完成
- **Then** 系統寫入一筆變更日誌，欄位為「文件狀態」、舊值/新值為切換前後之狀態值；此記錄與（是否納入既有「調閱稽核」範圍待定之）[OQ-NFR003](../../non-functional/NFR-003-audit-retention.md) 無關——變更歷程之狀態異動記錄為本 story 獨立範疇，不論調閱稽核之 OQ-NFR003 如何定案皆會記錄

### AC-4: 變更事件產生——制定組織／當責室長／使用部門（來源 US-034）
- **Given** ICSOP 管理員修改制定公司／制定部門／制定室別、當責室長（主要／次要）或文件使用部門（[US-034](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md)）
- **When** 儲存完成
- **Then** 系統依實際變更之欄位各自寫入對應變更日誌；人員/組織類欄位之新舊值以**當下顯示名稱快照**呈現（而非僅存 ID），避免日後組織異動導致歷史紀錄顯示跑掉

### AC-5: Before/After 呈現
- **Given** 我在「變更歷程」查詢結果中選擇某筆文件
- **When** 我展開檢視其變更歷程
- **Then** 系統依時間新到舊列出每次變更事件，每筆事件展開後逐欄位呈現「舊值 → 新值」對照（非還原或下載整份舊文件內容）

### AC-6: 附件替換僅記事件、不還原內容
- **Given** ICSOP PDF／OJT 簽到表／使用表單經 [US-036](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md) 重新上傳而覆蓋原檔
- **When** 該次上傳完成
- **Then** 系統於變更歷程記錄一筆「附件已替換」事件（含附件類型、操作人員、時間），但**不保留、不提供下載**被覆蓋前的舊檔案內容

### AC-7: 角色可視範圍限縮（2026-07-17 OQ-E07-04 定案）
- **Given** 登入角色為「系統管理員」或「ICSOP 管理員」
- **When** 該角色查詢變更歷程
- **Then** 系統允許查詢，範圍為全公司（依 [US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 矩陣**新增之獨立功能列「文件變更歷程」**：SysAdmin／ICSOPAdmin 皆唯讀）
- **Given** 登入角色為「主管」「部門窗口」或「一般使用者」
- **When** 該角色嘗試進入「文件變更歷程」功能（側選單不顯示此項）或直接呼叫查詢 API
- **Then** 系統回傳 403（`PERMISSION_DENIED`），tab 亦不顯示——使用者已於 2026-07-17 正式定案（OQ-E07-04）：「文件變更歷程」為**獨立功能**，於 [US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 矩陣自成一列（非比照或從屬於「文件調閱歷程查詢」列），僅剛好權限值相同（皆 SysAdmin／ICSOPAdmin 唯讀、其餘無）；本 story 原草案假設維持不變，僅權限依據由「比照調閱歷程列」改為「引用文件變更歷程獨立列」

### AC-8: 檢視/查詢計入稽核
- **Given** 任一具權限角色查詢或展開檢視某文件之變更歷程
- **When** 該動作完成
- **Then** 系統記錄一筆稽核紀錄（動作類型草案 `CHANGE_LOG_VIEW`，比照 [US-025](../E03-lifecycle-dag/US-025-lifecycle-tree-preview.md) 稽核精神），內容包含操作人員、員工編號、部門、處/室、被查詢文件 ID/編號、操作時間戳記；稽核寫入失敗不阻斷查詢瀏覽，失敗進補償佇列重試（比照 [US-060 AC3](US-060-audit-trail-logging.md)）

---

## Technical Notes

- 新增資料實體草案 `DOCUMENT_CHANGE_LOG`（append-only）：`id`、`documentId`、`documentNumber`、`fieldName`、`oldValue`、`newValue`、`changedByAccountId`＋操作者身分快照（員工編號/姓名/部門/處室）、`changedAt`、`sourceFeature`（如 F011/F012/F014，供追溯來源）。是否併入既有 `AUDIT_LOG`（以新 `targetType=DOCUMENT_CHANGE` 表示）或獨立建表，留待系統架構師決定（性質與既有 `AUDIT_LOG` 不同：後者是「調閱事件」，本實體是「資料異動事件」，欄位結構亦不同，獨立建表可能較單純）。
- 欄位範圍：涵蓋 19 欄中所有「ICSOPAdmin 可寫」欄位（見 [E04 文件欄位權威定義](../E04-icsop-document/epic-brief.md)）；唯讀系統欄位（系統 UUID）不適用；「所屬節點」欄位之異動來源為節點抽屜（[US-023](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md)），是否也應在本 tab 呈現待確認（草案：不含，因節點掛載變更之呈現脈絡更貼近 [US-063 循環樹狀圖變更歷程](US-063-lifecycle-tree-change-history.md)，見 Open Questions）。
- 變更日誌寫入時機建議與對應來源功能（F011/F012/F014）之儲存交易同步（同一交易或緊接觸發），避免非同步造成資料不同步；失敗處理策略比照既有稽核補償佇列機制（[US-060](US-060-audit-trail-logging.md)）。
- 保留年限草案沿用 [NFR-003 稽核與資料保留](../../non-functional/NFR-003-audit-retention.md) 之 ≥3 年草案值，但變更日誌是否適用同一保留政策，或需獨立政策，待確認（見 Open Questions）。

---

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-062-01 | 編輯文件同時變更文件名稱與版次兩欄並儲存，預期產生對應之變更日誌，欄位/舊值/新值皆正確 | Happy Path |
| TC-062-02 | 切換文件狀態（有效→失效），預期產生一筆「文件狀態」欄位之變更日誌 | Happy Path |
| TC-062-03 | 修改當責室長-主要，預期產生對應變更日誌，新舊值以人員姓名快照呈現（非僅 ID） | Happy Path |
| TC-062-04 | 重新上傳 ICSOP PDF 覆蓋原檔，預期產生一筆「附件已替換」事件，且系統不提供舊檔下載或還原 | Happy Path |
| TC-062-05 | 開啟編輯頁但未實際變更任何欄位值即送出儲存，預期不產生任何變更日誌 | Edge Case |
| TC-062-06 | 主管／部門窗口／一般使用者呼叫變更歷程查詢 API，預期回傳 403 | Error Case |
| TC-062-07 | 查詢並展開檢視某文件變更歷程，預期同步產生一筆 `CHANGE_LOG_VIEW` 稽核紀錄 | Happy Path |
| TC-062-08 | 查詢條件為空即送出，預期依 US-061 慣例要求至少一項條件或套用近 30 天預設，避免全表掃描 | Edge Case |
| TC-062-09 | 同一次儲存中有 5 個欄位同時變更，預期產生 5 筆（或 1 筆含 5 個欄位差異）變更日誌，實作方式不影響呈現時仍可逐欄位列出 | Edge Case |

---

## Dependencies

- **Blocked By**: [E04 US-031 編輯與版本對照](../E04-icsop-document/US-031-edit-with-comparison.md)（一般欄位變更事件來源）、[US-032 文件狀態切換](../E04-icsop-document/US-032-status-toggle.md)（狀態變更事件來源）、[US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md)（組織/人員欄位變更事件來源）、[US-036 PDF 與 OJT 附件上傳](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md)（附件替換事件來源）、[US-061 文件調閱歷程查詢後台](US-061-access-history-query-backend.md)（查詢介面設計模式參考，兩者為**獨立頁面**、非共用同一物理頁面框架）、[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)（「文件變更歷程」獨立矩陣列依據，2026-07-17 OQ-E07-04 新增）、[US-060 查看/下載/列印稽核軌跡記錄](US-060-audit-trail-logging.md)（稽核基礎機制）、[NFR-003 稽核與資料保留](../../non-functional/NFR-003-audit-retention.md)
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
- **NFRs**: [NFR-003 稽核與資料保留](../../non-functional/NFR-003-audit-retention.md)
- **Related Stories**: [US-060](US-060-audit-trail-logging.md)、[US-061](US-061-access-history-query-backend.md)、[US-063 循環樹狀圖變更歷程](US-063-lifecycle-tree-change-history.md)（同一「變更歷程」區塊之另一 tab）、[E04 US-031](../E04-icsop-document/US-031-edit-with-comparison.md)／[US-032](../E04-icsop-document/US-032-status-toggle.md)／[US-034](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md)／[US-036](../E04-icsop-document/US-036-pdf-ojt-attachment-upload.md)、[E08 US-070](../E08-permission-matrix/US-070-role-function-matrix.md)／[US-071](../E08-permission-matrix/US-071-role-field-matrix.md)

---

## Open Questions

- [x] **[OQ-E07-04] 可視範圍——已定案（2026-07-17）**：使用者澄清「變更歷程」為**獨立後台功能**（獨立側選單項），不歸屬、不比照「文件調閱歷程查詢」（change 歸 change、access 歸 access）。於 [US-070](../E08-permission-matrix/US-070-role-function-matrix.md) 矩陣新增獨立一列「文件變更歷程」＝ SysAdmin／ICSOPAdmin 唯讀（全公司）、主管／部門窗口／一般使用者無。此列同時涵蓋本 story 與 [US-063](US-063-lifecycle-tree-change-history.md) 兩個 tab（權限值相同，同一功能列）。本 story 原草案（AC-7）之**權限值**本就一致、**無需調整**，僅權限依據來源由「比照調閱歷程矩陣列」改為「引用文件變更歷程獨立矩陣列」；US-063 原「比照循環管理、主管全公司唯讀」草案已被覆蓋，兩 tab 現統一於此獨立列。
- [ ] **保留期限（[OQ-NFR003](../../non-functional/NFR-003-audit-retention.md)）**：變更日誌是否適用既有稽核保留年限草案（≥3 年），或需獨立政策（例如變更歷程屬「內容異動紀錄」，法規要求可能與「調閱紀錄」不同）？
- [ ] **[OQ-E07-07] 是否可還原舊值**：本 story 草案僅唯讀呈現 before/after，**不提供**一鍵將某欄位復原為舊值之功能（避免與「無簽核流程、覆蓋式編輯」之既有機制產生新的操作路徑歧義）。是否需要此還原能力，待使用者確認。
- [ ] **[OQ-E07-02] 資料模型歸屬**：`DOCUMENT_CHANGE_LOG` 是否併入既有 `AUDIT_LOG`（新增 targetType）或獨立建表？呼應 US-025 系列之資料模型歸屬討論模式，一併留待架構師定案。
- [ ] **[OQ-E07-06] 附件 diff 涵蓋範圍與是否需要匯出**：目前草案僅記錄「附件已替換」事件（AC-6），不記錄檔案內容差異（如檔名變化、檔案大小變化是否顯示）；是否需要匯出能力（比照 [F024](../../../specs/features/F024-access-history-query.md) CSV/Excel）本 story 亦未列為 AC。兩者皆待確認。
- [ ] **[OQ-E07-08] 「所屬節點」欄位異動是否併入本 tab**：見 Technical Notes，草案傾向不含（改歸 [US-063](US-063-lifecycle-tree-change-history.md)），待確認是否會造成使用者體驗上「同一份文件的異動要看兩個 tab」之割裂感。
