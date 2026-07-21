# US-025: 循環樹狀圖預覽（唯讀＋浮水印）

> **Story ID**: US-025
> **Epic**: [E03 循環池與 DAG 畫布維護](epic-brief.md)
> **Priority**: P1
> **Phase**: 1
> **Estimated Points**: 8

---

## User Story

**As a** ICSOP 管理員 / 系統管理員 / 主管（依角色可視範圍）
**I want** 從循環管理清單、或從 ICSOP 文件（程序書）清單直接開啟指定循環的 DAG 樹狀圖唯讀預覽頁，於預覽頁自由切換檢視其他循環，並可在需要時下載／列印該樹狀圖（帶浮水印燒錄）
**So that** 我可以在不進入編輯畫布的情況下，快速掌握某個工作流程循環（或某份程序書所屬循環）的整體節點結構與從屬關係，並在需要留存或分享畫面時取得已燒錄浮水印、可稽核追溯的匯出檔案

---

## Acceptance Criteria

### AC-1: 由循環管理清單開啟預覽頁
- **Given** 我是具可視權限之角色，位於後台「循環管理」清單頁（10-lifecycle-list）
- **When** 我點擊某一循環列「狀態」欄右側的樹狀圖圖示
- **Then** 系統開啟新頁（22-lifecycle-tree-preview.html），並帶入該循環 ID 顯示其 DAG 樹狀圖預覽

### AC-1b: 由 ICSOP 文件清單開啟預覽頁（第二入口）
- **Given** 我是具可視權限之角色，位於後台「ICSOP 文件（程序書）清單」頁（13-document-list）
- **When** 我點擊某一文件列的樹狀圖圖示
- **Then** 系統開啟樹狀圖預覽頁（`22-lifecycle-tree-preview.html?cycle=<該文件之所屬循環代碼>`），並以該文件之所屬循環為預選，顯示其 DAG 樹狀圖；頁面其餘行為（浮水印、切換器、縮放、點節點標示下游）與由 AC-1 開啟時完全一致
- **Given** 我是「主管」角色，透過文件清單點擊任一文件（不限其所屬循環）的樹狀圖圖示
- **When** 系統開啟該循環之樹狀圖預覽
- **Then** 系統正常開啟（主管對循環管理已為全公司唯讀，見 AC-6；2026-07-17 OQ-E08-03 定案後，文件清單與循環管理兩入口之主管可視範圍已一致，不再有「文件可見、循環不可見」之落差）

### AC-2: 頁面疊加浮水印
- **Given** 樹狀圖預覽頁已開啟
- **When** 頁面渲染完成
- **Then** 系統以對角平鋪方式於整頁疊加浮水印，內容格式比照 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md) 權威格式 `{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{固定機密聲明}-{當下時間}`，固定機密聲明「僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現」於版面上另起一行呈現；浮水印內容由伺服器端當下動態產生，不同次開啟之時間戳記須不同

### AC-3: 頂部循環切換器重繪
- **Given** 我在樹狀圖預覽頁，頂部顯示循環切換器
- **When** 我從切換器選擇另一個我有權限可視的循環
- **Then** 系統重新載入並重繪該循環的 DAG 樹狀圖，頁面框架（浮水印、切換器、縮放控制）維持不變；切換器選單僅列出我目前角色可視範圍內的循環（見 AC-6）

### AC-4: 上下佈局與直角箭頭呈現
- **Given** 樹狀圖預覽頁載入完成
- **When** 我檢視畫布
- **Then** 系統以上到下（top-down）佈局呈現節點，節點間以直角（orthogonal / right-angle）箭頭連線呈現父子關係（非曲線／貝茲曲線），每個節點顯示其名稱，並顯示其掛載之 ICSOP 文件數量（如「節點名稱 (3)」）；支援多 parent／多 child 節點正確呈現

### AC-5: 點擊節點標示下游、可取消
- **Given** 樹狀圖已渲染
- **When** 我點擊任一節點
- **Then** 系統醒目標示（highlight）該節點本身與其所有下游（後代，即沿有向邊可達之所有子孫節點及其間連線），其餘節點與連線降低透明度（淡化）
- **When** 我再次點擊同一節點，或點擊畫布空白區域
- **Then** 系統取消標示，恢復所有節點與連線至預設顯示狀態

### AC-6: 角色可視範圍限縮
- **Given** 登入角色為「部門窗口」或「一般使用者」
- **When** 該角色嘗試開啟樹狀圖預覽（無論透過清單圖示或直接呼叫 API）
- **Then** 後台清單不顯示樹狀圖圖示，且 API 一律回傳 403（`PERMISSION_DENIED`）——比照循環管理現行唯讀可視範圍（[US-070](../E08-permission-matrix/US-070-role-function-matrix.md)：循環管理對部門窗口／一般使用者為「無」）
- **Given** 登入角色為「系統管理員」「ICSOP 管理員」或「主管」
- **When** 該角色開啟任一循環之樹狀圖預覽
- **Then** 系統允許開啟，範圍為**全公司循環**（不限本部門）——三者對循環管理皆為唯讀（可查不可改），主管之可視範圍已由「唯讀（本部門相關）」定案改為「唯讀」（全公司），見 [US-070 OQ-E08-03](../E08-permission-matrix/US-070-role-function-matrix.md)

### AC-7: 計入調閱稽核
- **Given** 任一具可視權限之角色成功開啟樹狀圖預覽頁
- **When** 頁面載入完成
- **Then** 系統同步記錄一筆稽核紀錄（動作類型草案：`LIFECYCLE_VIEW`），內容包含操作人員、員工編號、部門、處/室、循環 ID、循環名稱、操作時間戳記，且與當次浮水印內容完全一致（比照 [US-060 AC2](../E07-audit-trail/US-060-audit-trail-logging.md)）
- **Given** 稽核紀錄寫入服務發生暫時性異常
- **When** 使用者開啟樹狀圖預覽
- **Then** 使用者仍可正常檢視，不因稽核寫入失敗而被阻擋，失敗需進補償佇列待服務恢復後重試（比照 [US-060 AC3](../E07-audit-trail/US-060-audit-trail-logging.md)）

### AC-8: 唯讀限定，不提供編輯操作
- **Given** 我是 ICSOP 管理員，位於樹狀圖預覽頁
- **When** 我嘗試對節點進行拖曳、新增節點、刪除節點、建立/刪除連線等任何編輯操作
- **Then** 系統不提供任何編輯用互動元件（純唯讀模式），畫布僅支援檢視、縮放、點擊標示下游；如需編輯，須另行前往 [11-dag-canvas 畫布頁（US-021）](US-021-dag-node-edge-maintenance.md)或[節點抽屜（US-023）](US-023-node-drawer-maintenance.md)

### AC-9: 縮放
- **Given** 我在樹狀圖預覽頁
- **When** 我使用縮放控制項（放大／縮小／重置）
- **Then** 畫布依比例縮放，節點與連線相對位置保持正確，對角平鋪浮水印仍覆蓋整個可視區域，不因縮放而露出無浮水印之空白區域

### AC-10: 下載／列印樹狀圖 PDF 燒錄浮水印
- **Given** 我是具可視權限之角色（依 AC-6／AC-1b 之循環可視範圍），位於樹狀圖預覽頁 toolbar
- **When** 我點擊「下載」或「列印」
- **Then** 系統於伺服器端即時產生該循環樹狀圖之 PDF 檔案，並將浮水印**實際燒錄進 PDF 內容層**（格式與欄位順序比照 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md) 權威格式、固定機密聲明另起一行呈現），非僅前端顯示疊加，作法比照 [E06 US-054 下載/列印 PDF 浮水印燒錄](../E06-public-browsing/US-054-download-print-watermark-burn.md)／F020
- **When** 下載或列印動作完成
- **Then** 系統同步各自記錄一筆稽核紀錄（下載動作類型草案 `LIFECYCLE_DOWNLOAD`、列印動作類型草案 `LIFECYCLE_PRINT`，兩者獨立記錄不合併），內容包含操作人員、員工編號、部門、處/室、循環 ID、循環名稱、操作時間戳記，且與當次燒錄之浮水印內容完全一致（比照 [US-060 AC2](../E07-audit-trail/US-060-audit-trail-logging.md)）
- **Given** 角色對循環管理無可視權限（依 AC-6，即「部門窗口」或「一般使用者」）
- **When** 該角色略過 UI、直接呼叫下載或列印 API
- **Then** 系統回傳 403（`PERMISSION_DENIED`），不產生檔案、不燒錄浮水印、亦不記錄稽核（操作本身即被拒絕，非稽核失敗情境）

---

## Technical Notes

- 新頁 `22-lifecycle-tree-preview.html`，視覺風格比照既有文件檢視器（viewer 風格，整頁沉浸式），非套用 07-admin-shell 側邊選單框架。
- 浮水印視覺樣式沿用專案既定視覺定案：對角 45° 平鋪、`opacity 0.12`、`slate-500`、`14px`；時間格式 `YYYY-MM-DD HH:mm:ss (UTC+8)`；伺服器端動態產生，禁止前端組裝（見 [NFR-007](../../non-functional/NFR-007-watermark-integrity.md) AC1）。
- 節點/邊資料直接複用 [US-021](US-021-dag-node-edge-maintenance.md) 既有資料模型（`lifecycle_node`、`lifecycle_edge`），本頁為純讀取，不新增寫入 API。
- 節點顯示之「掛載程序書數」為該節點關聯之 ICSOP 文件數量（`所屬節點 = 該節點`的文件筆數，見 [US-023](US-023-node-drawer-maintenance.md)）。
- 下游（後代）標示演算法：以使用者點擊節點為起點，沿有向邊（parent → child 方向）做圖遍歷（BFS/DFS 皆可），標示所有可達節點與其間之邊；因 DAG 已禁止成環（[US-022](US-022-dag-cycle-prevention.md)），遍歷保證終止。
- 直角箭頭連線樣式：若前端沿用 US-021 之 React Flow 類套件，建議採用其 orthogonal / step edge type；US-021/F008 已定案連線樣式＝統一**直角 elbow**（OQ-E03-09 已定案），與本 story 唯讀預覽頁視覺一致，無需另行確認（見 Open Questions）。
- 循環切換器之候選清單需依 AC-6 角色可視範圍後端過濾（例如 `GET /lifecycles?visibleOnly=true`），不可僅前端隱藏，避免越權透過切換器存取無權限循環。
- 稽核動作類型 `LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 與既有 US-060 之 `VIEW/DOWNLOAD/PRINT`（皆以「文件」為稽核對象）在資料語意上不同（本功能稽核對象為「循環」而非「文件」），資料模型設計（沿用同一稽核表以 targetType 區分，或另建循環稽核表）留待系統架構師決定。
- **第二入口（13-document-list）**：文件清單每列樹狀圖圖示以 `?cycle=<該文件之所屬循環代碼>` 帶入預選循環（prototype 已採此網址格式）；確切 query 值為循環 UUID 或另一業務代碼、以及後端如何由此值反查循環並套用 AC-6 可視範圍檢查，屬架構師/spec-writer 具體化範圍。
- **下載／列印燒錄**：伺服器端以 PDF 處理套件（技術棧比照 [US-054](../E06-public-browsing/US-054-download-print-watermark-burn.md) 之做法，實際套件由架構師決定）將樹狀圖畫布匯出為 PDF 並疊加浮水印文字圖層於內容層；「列印」與「下載」在瀏覽器層可能共用同一份已燒錄浮水印之 PDF（比照 [US-054 Technical Notes](../E06-public-browsing/US-054-download-print-watermark-burn.md)），但兩者稽核動作類型仍須分別記錄。

---

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-025-01 | 具可視權限角色於循環管理清單點擊樹狀圖圖示，預期開啟預覽頁並正確帶入該循環 ID | Happy Path |
| TC-025-02 | 開啟預覽頁，預期浮水印正確顯示員工編號/姓名/公司名稱/部門/處室/固定機密聲明（另起一行）/當下時間 | Happy Path |
| TC-025-03 | 同一使用者相隔數分鐘兩次開啟同一循環預覽，預期兩次浮水印時間戳記不同 | Happy Path |
| TC-025-04 | 使用頂部循環切換器切換至另一有權限循環，預期畫布正確重繪為該循環結構，浮水印/切換器/縮放控制維持 | Happy Path |
| TC-025-05 | 檢視含多 parent／多 child 之循環，預期節點以上到下佈局、直角箭頭正確呈現父子關係 | Happy Path |
| TC-025-06 | 點擊中間層節點，預期其所有下游（子孫）節點與連線被醒目標示，其餘淡化 | Happy Path |
| TC-025-07 | 再次點擊已標示之節點，預期標示取消、畫布恢復預設顯示 | Happy Path |
| TC-025-08 | 部門窗口／一般使用者嘗試呼叫預覽頁 API，預期回傳 403，清單亦不顯示樹狀圖圖示 | Error Case |
| TC-025-09 | 主管於循環管理清單開啟任一循環（含非其原部門相關者）之樹狀圖預覽，含直接帶入該循環 ID 之網址，預期正常開啟（全公司唯讀，2026-07-17 OQ-E08-03 定案後不再限本部門） | Happy Path |
| TC-025-10 | ICSOP 管理員於預覽頁嘗試拖曳節點或建立連線，預期畫布不提供任何編輯互動，操作無效果 | Edge Case |
| TC-025-11 | 開啟預覽頁同時檢查稽核紀錄，預期產生一筆 `LIFECYCLE_VIEW` 紀錄且內容與浮水印一致 | Happy Path |
| TC-025-12 | 模擬稽核寫入服務暫時不可用，預期使用者仍可正常檢視預覽頁，服務恢復後補寫該筆紀錄 | Error Case |
| TC-025-13 | 使用縮放控制項放大/縮小/重置畫布，預期節點相對位置正確、浮水印平鋪仍覆蓋整個可視區域 | Edge Case |
| TC-025-14 | 循環無任何節點時開啟預覽，預期顯示空狀態提示而非錯誤 | Edge Case |
| TC-025-15 | 由 ICSOP 文件清單（13-document-list）點擊某文件列樹狀圖圖示，預期開啟預覽頁並以 `?cycle=<code>` 正確帶入該文件之所屬循環為預選顯示 | Happy Path |
| TC-025-16 | 主管由文件清單點擊任一文件（不限部門）之樹狀圖圖示，預期正常開啟並帶入其所屬循環（文件清單與循環管理兩入口之主管可視範圍已一致，皆為全公司唯讀） | Happy Path |
| TC-025-17 | 具可視權限角色下載樹狀圖，預期取得之 PDF 檔案內容層含正確浮水印文字（以 PDF 文字擷取工具驗證非僅畫面疊加），並產生一筆 `LIFECYCLE_DOWNLOAD` 稽核紀錄，內容與浮水印一致 | Happy Path |
| TC-025-18 | 具可視權限角色列印樹狀圖，預期列印用 PDF 內容層含浮水印，並產生一筆獨立之 `LIFECYCLE_PRINT` 稽核紀錄（與下載紀錄分開，不合併計數） | Happy Path |
| TC-025-19 | 部門窗口／一般使用者略過 UI 直接呼叫下載/列印 API，預期回傳 403，不產生檔案、不燒錄浮水印、不留下稽核紀錄 | Error Case |

---

## Dependencies

- **Blocked By**: [US-020 循環池 CRUD](US-020-lifecycle-pool-crud.md)（清單頁與循環資料來源）、[US-021 DAG 節點與連線維護](US-021-dag-node-edge-maintenance.md)（節點/邊資料模型與上下佈局基礎）、[US-022 DAG 防環驗證](US-022-dag-cycle-prevention.md)（保證下游遍歷可終止）、[US-023 節點抽屜維護](US-023-node-drawer-maintenance.md)（節點名稱與掛載文件數來源）、[E04 US-037 後台文件清單與搜尋](../E04-icsop-document/US-037-backend-document-list-search.md)（13-document-list 第二入口來源）、[E06 US-054 下載/列印 PDF 浮水印燒錄](../E06-public-browsing/US-054-download-print-watermark-burn.md)（下載/列印燒錄手法參考）、[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)（角色可視範圍依據）、[NFR-007 浮水印防竄改與一致性](../../non-functional/NFR-007-watermark-integrity.md)（浮水印格式權威）
- **Blocks**: 無下游 Story 直接依賴（若稽核決定併入 [US-061 文件調閱歷程查詢後台](../E07-audit-trail/US-061-access-history-query-backend.md)，則對該 Story 產生擴充需求，詳見 Open Questions）

---

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

---

## Related

- **Epic Brief**: [E03 循環池與 DAG 畫布維護](epic-brief.md)
- **NFRs**: [NFR-007 浮水印防竄改與一致性](../../non-functional/NFR-007-watermark-integrity.md)
- **Related Stories**: [US-020](US-020-lifecycle-pool-crud.md)、[US-021](US-021-dag-node-edge-maintenance.md)、[US-022](US-022-dag-cycle-prevention.md)、[US-023](US-023-node-drawer-maintenance.md)、[US-024](US-024-node-document-filter-warning.md)、[E04 US-037 後台文件清單與搜尋](../E04-icsop-document/US-037-backend-document-list-search.md)（第二入口）、[E06 US-053 網頁檢視器浮水印疊加](../E06-public-browsing/US-053-viewer-watermark-overlay.md)（浮水印呈現手法參考）、[E06 US-054 下載/列印PDF浮水印燒錄](../E06-public-browsing/US-054-download-print-watermark-burn.md)（下載/列印燒錄手法參考）、[E07 US-060 查看/下載/列印稽核軌跡記錄](../E07-audit-trail/US-060-audit-trail-logging.md)、[E07 US-061 文件調閱歷程查詢後台](../E07-audit-trail/US-061-access-history-query-backend.md)、[E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)

---

## Open Questions

- [ ] **[OQ-E07-02] 稽核資料模型歸屬（範圍已隨本次更新擴大）**：新增之 `LIFECYCLE_VIEW` 動作是否併入 [US-060](../E07-audit-trail/US-060-audit-trail-logging.md) 既有稽核表（以 targetType 區分 DOCUMENT/LIFECYCLE），或另建獨立稽核表？草案傾向沿用同一 Append-only 機制，最終由系統架構師決定。**本次新增 `LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT`（AC-10）沿用同一問題**：三個新動作類型是否共用同一組資料模型決策（建議是，避免同一功能拆兩套規則），一併留待架構師定案。
- [x] **[OQ-E07-03] 是否併入文件調閱歷程查詢頁——已定案（2026-07-17）**：[US-061](../E07-audit-trail/US-061-access-history-query-backend.md) 後台查詢頁已新增「類型」篩選（文件／循環／變更），`LIFECYCLE_VIEW`／`LIFECYCLE_DOWNLOAD`／`LIFECYCLE_PRINT` 紀錄納入查詢範圍（類型＝循環），非另建獨立查詢頁籤。詳見 US-061 AC1／AC4。
- [x] **[OQ-E03-06] 主管「本部門相關」範圍定義——已收斂／不再需要（2026-07-17）**：原問題為「循環本身無擁有部門欄位，主管『本部門相關』可視範圍如何定義」。**使用者已定案（[OQ-E08-03](../E08-permission-matrix/US-070-role-function-matrix.md)）：主管對循環管理由「唯讀（本部門相關）」改為「唯讀」（全公司）**，本 story 之 AC-6／AC-1b／AC-10 已不再有任何「本部門」範圍判斷，此問題因而收斂、無需再定義循環之「擁有部門」範圍演算法。連帶：循環是否仍需「擁有部門」欄位（[E03 epic-brief OQ](epic-brief.md)）已不再以此為前提用途，若有其他用途仍待另行確認。
- [ ] **[OQ-E03-07] 循環切換器 API 設計細節**：`visibleOnly` 式過濾之確切 API 契約（分頁、排序、是否含循環狀態篩選）未定義，留待 spec-writer／架構師補充。
- [ ] **[OQ-E03-08] 是否開放前台**：本次僅由後台循環管理清單、後台文件清單開啟（後台限定）；部門窗口／一般使用者（含前台情境）本次不開放，下載/列印亦同。此點與 [E06 epic-brief 既有 Open Question](../E06-public-browsing/epic-brief.md)（「前台頁面是否需要顯示文件的所屬循環 DAG 結構供使用者參考」）性質相關但觸發情境不同，建議未來合併評估，若開放前台則可視範圍/稽核動作類型皆需另行定義，不可直接沿用本 story 之後台版本規則。
- [ ] **[OQ-NFR007c] NFR-007 涵蓋範圍是否需正式擴充（範圍已隨本次更新擴大）**：NFR-007 權威格式目前僅明列網頁檢視器（US-053）與 PDF 燒錄（US-054）兩處須一致，本 story 為第三種情境。**原僅涉及「檢視疊加」（AC-2），本次更新後新增「下載/列印燒錄」（AC-10）為第四種需一致之情境**，兩者皆假設沿用同一權威格式與欄位順序（僅版面另起一行呈現機密聲明），建議 spec-writer 階段將「循環樹狀圖檢視疊加」與「循環樹狀圖下載/列印燒錄」一併正式納入 NFR-007 之一致性要求範圍。
- [x] **[OQ-E03-09] 直角箭頭與 US-021 編輯畫布之視覺一致性——已定案**：US-021/F008 已定案連線樣式＝統一**直角 elbow**，與本 story 明確採用之直角箭頭一致，唯讀預覽頁與可編輯畫布頁視覺一致，無需 UI/UX 設計階段另行統一。
- [x] **雙入口可視範圍不一致之邊界處理——已定案（2026-07-17，OQ-E08-03）**：原問題為「ICSOP 文件管理」對主管全公司唯讀、但「循環管理」對主管僅「本部門相關」唯讀，導致第二入口（AC-1b，由 13-document-list 開啟）可能出現「文件可見、所屬循環卻被拒看」之體驗落差。**使用者選擇「反向放寬」：主管「循環管理」可視範圍改為全公司唯讀，與文件管理一致**，兩入口範圍差異因而消失，AC-1b／AC-6／AC-10 均已更新為全公司範圍，不再需要邊界處理。
