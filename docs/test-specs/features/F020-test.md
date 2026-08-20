---
type: test-design-feature
feature_id: F020
feature_name: 文件浮水印（網頁疊加＋下載/列印燒錄）
priority: P0-MVP
related_spec: docs/specs/features/F020-watermark.md
last_updated: 2026-07-23
status: draft
---

# F020 — 文件浮水印（網頁疊加＋下載/列印燒錄）· Test Design
> source: docs/specs/features/F020-watermark.md · worktree: public（feature/public-F019-F022）· 2026-07-23

## 範圍聲明

本設計涵蓋 F020 全部 AC：浮水印快照組裝（部層 derive、`DESC_CHI` 末段擷取、空欄分隔符收合、`COMPFULLNM` 全稱、fallback 鏈）、VIEW 疊加、DOWNLOAD/PRINT 之 PDF 內容層燒錄（`pdf-lib`）、三動作稽核觸發（重用既有 `AuditWriter`）、未登入拒絕、下載 gate。**不含**：F019 清單如何導向本頁（另檔）、F021 手機檢視器之真實縮放/捲動視覺驗證（另檔）、F036/F037/F038 循環樹狀圖之浮水印重用（NFR-007 AC3 涵蓋範圍已擴充至 4 種情境，但本 worktree 僅負責情境 1/2，其餘由對應 worktree 各自設計）。

### 依賴缺口（直接阻擋部分 AC 之可落地程度，非本 worktree 可解）

1. **`COMPFULLNM`（公司全稱）完全未持久化**：全庫無 `COMPANY` 實體/資料表，`companyCode`（如 `AS`）僅為字串欄位散布於 `Account`/`OrgUnit`，無對應之全稱查找來源。AC「公司名稱顯示 `COMPFULLNM` 全稱『和潤企業股份有限公司』」在目前資料模型下**無法真實實作**，僅能 stub。
2. **部層 `DESC_FULL`（浮水印「部門」欄）未持久化**：`backend/src/org-sync/normalization.ts` 第 33-34/105-106 行顯示上游 `RawDept.DESC_FULL` 於 `normalizeDept()` 中被讀入後**直接捨棄**（`NormalizedOrgUnit` 無 `nameFull` 欄位），`OrgUnit` 實體（`backend/src/database/entities/org-unit.entity.ts`）亦僅有 `name`（DESC_CHI 簡稱），無 `nameFull`/`descFull` 欄位。即使補上此欄位，「部門」欄仍需**依 `LEFT(orgCode,2)+'000'` 查找另一筆 ORG_UNIT 列**（非使用者自身部門列），此為跨列查找，目前無此讀取能力（org-sync store 為內部同步用途，非通用讀取介面）。
3. **「處/室」欄可行**：使用者**自身** `OrgUnit.name`（即 DESC_CHI，含 `/` 分段，如「營管部/審查室」）已持久化，`tier` 亦已持久化，**不需跨列查找**，可於本 worktree 內以純函式（`tier` 判斷＋字串 `split('/')` 取末段）落地，見測試策略。
4. **員工編號／姓名可行但需 session 擴充**：`Account.employeeNo`/`Account.name` 已持久化，但 `SessionUser` 未攜帶（同 F019 OQ-F019-01），屬共同前置依賴。

## 測試策略（unit＝快照組字純函式＋假 PdfBurner／AuditWriter；真 pdf-lib 位元組燒錄＝[integration]）

- **[unit] 快照組裝純函式**：`buildWatermarkSnapshot(identity)`（架構 §3 `WatermarkModule` 關鍵函式）以**已解析完成**之欄位值（`employeeNo`/`name`/`companyFullName`/`departmentFullName`/`sectionName`/`timestamp`）為輸入，測試欄位順序、固定機密聲明另起一行、空欄分隔符收合、時間格式；此函式邏輯與「這些欄位值從何而來」（依賴缺口 1/2）解耦，**不受上游資料缺口阻擋**。
- **[unit] 部層/處室推導純函式**：`tier`＋自身 `DESC_CHI`（`name`）split 取末段之邏輯（依賴缺口 3 可行部分）以純函式驗證；部層 `DESC_FULL` fallback 鏈（依賴缺口 2 受阻部分）以**假資料/stub 解析器**驗證「介面存在、TODO 佔位不崩潰」，不驗證真實全稱正確性。
- **[unit] 燒錄呼叫契約**：以注入之假 `PdfBurner`（介面 `burnPdf(originalBuffer, snapshot): Promise<Buffer>`，比照 `AttachmentsService` 之 `BlobStore` 注入模式）驗證「傳入正確的原始 buffer 與快照字串」，不驗證 pdf-lib 真實位元組結果（後者為 [integration]，見下）。
- **[unit] 稽核觸發**：重用既有 `AuditWriter` 契約（`backend/src/audit/audit.types.ts`，已 unit-green 併入 main），以假 `AuditWriter`（spy）驗證 `recordAccess()` 於 VIEW/DOWNLOAD/PRINT 各自呼叫一次，`targetType='DOCUMENT'`、`actionType` 對應、`watermarkSnapshot` 與當次疊加/燒錄內容一致、`occurredAt` 使用注入時鐘。
- **[unit] RBAC／未登入閘門**：`FunctionKey.DOCUMENT_DOWNLOAD_PRINT` 對 5 種角色皆為 `READ`（`function-matrix.ts` 第 102 行），故下載/列印**無角色別 403 情境**，僅未登入（`SessionGuard`）為唯一拒絕路徑（見 OQ-F020-03）。
- **[unit] 前台檢視器元件**：以假 PDF 參照（不觸真 Blob）＋假疊加浮水印字串驅動渲染，斷言疊加圖層存在、樣式屬性（`opacity`/旋轉/`pointer-events:none`，依 NFR-007 視覺樣式定案值）、不提供「另存無浮水印原檔」之下載連結。
- **[integration]**：真 `pdf-lib` 位元組層燒錄與抽取驗證（給定 fixture PDF buffer＋快照字串，燒錄後以 `pdf-lib`/文字抽取工具驗證內容層確實含浮水印文字，非僅疊加樣式）——**此項雖不需要真實 Azure Blob（`pdf-lib` 為本地離線函式庫，可用 in-memory fixture PDF 全程離線執行），但依任務指示仍歸類 [integration]**（因其驗證「真實燒錄引擎輸出」而非「呼叫契約」，與純 mock 燒錄函式的 unit 測試在風險層級上不同）；真實 `ICSOP_PDF` 後端代理串流（架構 §5.2，非核發 SAS URL）之完整 HTTP 往返；未經後端直接以 Blob URL 存取之實際拒絕；`< 3s` 燒錄效能（[NFR-001](../../specs/nfr.md#performance)）；真 DB 稽核持久化。

## Test Scenarios

### A. 浮水印快照組裝（純函式，已解析欄位輸入）

#### TS-F020-001 完整欄位組字，格式與欄位順序 [unit]
- Given：`{employeeNo:'E001', name:'王小明', companyFullName:'和潤企業股份有限公司', departmentFullName:'營運管理部', sectionName:'審查室', timestamp:'2026-07-23 10:00:00 (UTC+8)'}`
- When：`buildWatermarkSnapshot(identity)`
- Then：輸出 `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-{固定機密聲明另起一行}-2026-07-23 10:00:00 (UTC+8)`，欄位順序與 [NFR-007](../../specs/nfr.md#watermark) 權威格式一致
- 對應 AC / 錯誤碼：AC1

#### TS-F020-002 固定機密聲明字串為固定值，非依輸入變化 [unit]
- Given：任意合法 identity
- When：組字
- Then：機密聲明段落逐字等於「僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現」，不因輸入不同而變化
- 対應 AC / 錯誤碼：Description（固定機密聲明字串，非變數）

#### TS-F020-003 「處/室」欄留空 → 自動收合分隔符，不產生連續分隔符 [unit]
- Given：`{..., departmentFullName:'營運管理部', sectionName:''}`（無下層使用者）
- When：組字
- Then：輸出 `E001-王小明-和潤企業股份有限公司-營運管理部-{機密聲明}-{時間}`，「部門」與「機密聲明」之間**恰一個分隔符**，不出現 `--`
- 對應 AC / 錯誤碼：🔴 契約 §8.4 / AC「掛於部層或本部層，處/室留空且分隔符自動收合」

#### TS-F020-004 「部門」與「處/室」皆留空（孤兒帳號）→ 僅一個分隔符收合，不顯示原始代碼或 null [unit]
- Given：`{..., departmentFullName:'', sectionName:''}`
- When：組字
- Then：輸出 `E001-王小明-和潤企業股份有限公司-{機密聲明}-{時間}`；不得出現 `null`/`undefined`/原始 orgCode 字面值
- 對應 AC / 錯誤碼：Edge Case（孤兒帳號，部門與處/室皆留空並收合，不得顯示原始代碼或 null）

#### TS-F020-005 兩個空欄相鄰不產生雙重收合遺漏中段有效欄位 [unit]
- Given：模擬未來可能之多欄位同時為空的組合（防禦性測試，非目前規格明列情境）
- When：組字
- Then：收合邏輯逐一移除空欄與其前置分隔符，中段有效欄位（如姓名/員編）之分隔符不受影響
- 對應 AC / 錯誤碼：契約 §8.4「不得出現連續分隔符」之一般化防禦

#### TS-F020-006 相隔時間兩次組字 → 僅時間戳記不同，其餘欄位相同 [unit]
- Given：同一使用者，兩次呼叫（注入時鐘分別回傳 T1/T2）
- When：各自組字
- Then：除時間戳外逐字相同
- 對應 AC / 錯誤碼：AC「相隔時間兩次開啟同文件，時間戳記不同」

### B. 「處/室」欄推導（可行部分：自身 tier + DESC_CHI split）

#### TS-F020-007 使用者掛於處室層（tier=SECTION）→ 取自身 DESC_CHI 末段 [unit]
- Given：使用者 `OrgUnit.tier='SECTION'`、`OrgUnit.name='營管部/審查室'`
- When：推導處/室欄
- Then：輸出「審查室」（split `/` 取最後一段）
- 對應 AC / 錯誤碼：AC「部門代碼為 JAC00（處室層），處/室為 DESC_CHI 最末段（審查室）」

#### TS-F020-008 使用者掛於課層（tier=SUBSECTION）→ 取自身 DESC_CHI 末段（課名），略過中間處層 [unit]
- Given：`tier='SUBSECTION'`、`name='北區綜合處/醫療一課'`
- When：推導
- Then：輸出「醫療一課」，不含「北區綜合處」
- 對應 AC / 錯誤碼：AC「部門代碼為 BJAA0（課層），處/室顯示課名，不顯示中間處層名稱」

#### TS-F020-009 使用者掛於部層（tier=DEPARTMENT）→ 處/室留空 [unit]
- Given：`tier='DEPARTMENT'`
- When：推導
- Then：輸出空字串（不因該部門之 `name` 本身含或不含 `/` 而不同，單一規則以 tier 判定）
- 對應 AC / 錯誤碼：Edge Case（掛於部層，處/室留空）

#### TS-F020-010 使用者掛於本部層或 Root（tier=DIVISION/ROOT）→ 處/室留空 [unit]
- Given：`tier='DIVISION'` 及 `tier='ROOT'` 兩案例
- When：推導
- Then：兩案例皆輸出空字串
- 對應 AC / 錯誤碼：Edge Case（掛於本部層／Root，處/室留空）

#### TS-F020-011 DESC_CHI 無 `/` 分隔符但 tier=SECTION（防禦性邊界） [unit]
- Given：`tier='SECTION'`、`name='審查室'`（無斜線，單段）
- When：推導
- Then：輸出「審查室」（split 後僅一段時取該段本身，不因缺少分隔符而輸出空字串或報錯）
- 對應 AC / 錯誤碼：契約 §8.3 之推導穩健性（spec 未明列此邊界，本設計視為合理防禦，需 tdd-developer 確認資料實測是否曾出現此形態）

### C. 「部門」與「公司名稱」欄之 stub 行為（受阻部分）

#### TS-F020-012 「部門」欄無 `DESC_FULL` 資料來源時之 stub 呈現 [unit]
- Given：identity 解析層無法取得部層 `DESC_FULL`（依賴缺口 2 現況）
- When：組裝浮水印快照
- Then：以明確可辨識之 TODO 佔位字串呈現（如 `[部門待建]` 或等效標記，具體文案由 tdd-developer 依 UI 文案規範定），**不得**顯示 `undefined`/空白/拋出例外導致整頁失敗；快照組字函式本身（TS-001～006）之收合規則對此仍一致適用
- 對應 AC / 錯誤碼：worktree guide「org 名稱解析未建...先以 ID 或既有欄位顯示、留 TODO」；風險見 OQ-F020-01

#### TS-F020-013 「公司名稱」欄無 `COMPFULLNM` 資料來源時之 stub 呈現 [unit]
- Given：identity 解析層無法取得公司全稱（依賴缺口 1）
- When：組裝浮水印快照
- Then：以 `companyCode`（如 `AS`）或明確 TODO 佔位字串呈現，不得為空/`undefined`
- 對應 AC / 錯誤碼：同上；AC「公司名稱顯示 COMPFULLNM 全稱」於本輪**無法真實驗證**，本 TS 僅驗證優雅降級行為，見 OQ-F020-01

#### TS-F020-014 部門無對應部層時之 fallback 鏈（邏輯層，資料來源仍為 stub） [unit]
- Given：identity 解析層之部層查找回傳「查無」信號
- When：組裝快照
- Then：**fallback 邏輯**依序嘗試本部層→Root（純邏輯驗證：給定「部層缺、本部層有」與「兩者皆缺」兩組輸入，驗證 fallback 選擇正確層級之輸出），**惟本測試之輸入本身仍為 stub 值，非真實 DESC_FULL 解析結果**
- 對應 AC / 錯誤碼：AC「使用者部門無對應部層，依 fallback 取本部層 DESC_FULL」

### D. VIEW／DOWNLOAD／PRINT 一致性

#### TS-F020-015 同一無下層使用者，VIEW/DOWNLOAD/PRINT 三者收合後字串完全一致（僅時間戳不同） [unit]
- Given：無下層使用者（處/室留空），依序觸發 VIEW、DOWNLOAD、PRINT（各自獨立呼叫、各自之時間戳可不同）
- When：比對三者之浮水印快照字串（時間戳欄位遮罩後比對）
- Then：三者除時間戳外逐字相同；三者皆由同一 `buildWatermarkSnapshot()` 呼叫產生，非各自獨立組字邏輯
- 對應 AC / 錯誤碼：AC「同一無下層使用者同時執行查看/下載/列印，三者收合後字串完全一致」

#### TS-F020-016 VIEW 回傳疊加預覽，不提供無浮水印原檔另存 [unit]
- Given：一般使用者請求 VIEW
- When：處理
- Then：回應為疊加浮水印之預覽（前端渲染用資料/串流），前端元件不渲染任何指向未燒錄原始 Blob 的下載連結
- 對應 AC / 錯誤碼：Main Flow 2；架構 §5.2「ICSOP_PDF 一律後端代理，不核發 SAS URL」

#### TS-F020-017 DOWNLOAD 回傳之 PDF 已燒錄（呼叫契約層） [unit]
- Given：一般使用者請求 DOWNLOAD
- When：處理
- Then：`PdfBurner.burnPdf(原始buffer, snapshot)` 被呼叫一次，回應為其回傳之 buffer（非原始未燒錄 buffer）
- 對應 AC / 錯誤碼：AC「下載完成，PDF 內容層已燒錄浮水印」（真實位元組驗證見 TS-023 [integration]）

#### TS-F020-018 PRINT 與 DOWNLOAD 可共用同一已燒錄 PDF，但稽核分別記錄 [unit]
- Given：同一次請求情境模擬 PRINT
- When：處理
- Then：**燒錄邏輯**可與 DOWNLOAD 共用（`PdfBurner` 呼叫一次或快取重用皆可，本測試不強制實作手段），但 `AuditWriter.recordAccess()` 之 `actionType` 明確為 `'PRINT'`，與 `'DOWNLOAD'` 分開各自一筆
- 對應 AC / 錯誤碼：Alternative Flows「列印與下載技術上可共用同一份已燒錄 PDF，但稽核仍須區分」

### E. 稽核觸發（重用既有 AuditWriter）

#### TS-F020-019 VIEW 觸發稽核，`watermarkSnapshot` 與疊加內容一致 [unit]
- Given：一般使用者 VIEW
- When：處理完成
- Then：`AuditWriter.recordAccess()` 被呼叫一次，`targetType='DOCUMENT'`、`actionType='VIEW'`、`watermarkSnapshot`＝與疊加給前端之字串逐字相同、`targetId`＝文件 id
- 對應 AC / 錯誤碼：AC「查看/下載/列印各操作，完成後記錄對應類型稽核，且與浮水印內容一致」

#### TS-F020-020 DOWNLOAD／PRINT 各自觸發對應 actionType 之稽核 [unit]
- Given：分別觸發 DOWNLOAD 與 PRINT
- When：處理完成
- Then：各自呼叫 `recordAccess()`，`actionType` 分別為 `'DOWNLOAD'`/`'PRINT'`
- 對應 AC / 錯誤碼：同上

#### TS-F020-021 稽核寫入暫時失敗不阻斷使用者取得檔案（Outbox） [unit]
- Given：假 `AuditWriter.recordAccess()` 模擬拋出/進入補償佇列（重用既有 F023 Outbox 契約，非本 worktree 重新設計）
- When：DOWNLOAD 處理中稽核寫入失敗
- Then：使用者仍取得已燒錄檔案；失敗不拋出至呼叫端阻斷回應（與 [error-handling.md#audit](../../specs/error-handling.md#audit) 一致，行為由既有 `AuditWriter.recordAccess()` 之 Outbox 非阻斷語意保證，本 TS 僅驗證 F020 呼叫端未因此中斷回應）
- 對應 AC / 錯誤碼：[error-handling.md#audit](../../specs/error-handling.md#audit)「記錄失敗不阻斷瀏覽」

### F. 未登入／RBAC

#### TS-F020-022 未登入直接存取檢視器網址 → 拒絕並導回登入頁 [unit]
- Given：無有效 session
- When：請求 VIEW 端點
- Then：401；前端導回登入頁
- 對應 AC / 錯誤碼：AC「未登入使用者存取檢視器網址，拒絕並導回登入頁」

#### TS-F020-023 未登入直接呼叫下載/列印 API → 拒絕 [unit]
- Given：無有效 session
- When：請求 DOWNLOAD/PRINT 端點
- Then：401，不核發任何檔案內容、不呼叫 `PdfBurner`
- 對應 AC / 錯誤碼：[error-handling.md#public](../../specs/error-handling.md#public)「未登入存取檢視器/下載，拒絕並導回登入頁」

#### TS-F020-024「未授權角色」呼叫下載 API 情境之現況（見 OQ-F020-03） [unit]
- Given：`FunctionKey.DOCUMENT_DOWNLOAD_PRINT` 對全 5 角色皆為 `READ`
- When：以任一已定義角色請求下載
- Then：**現行矩陣下無任何已登入角色會被拒絕**；本 TS 驗證此事實本身（5 角色皆成功），AC 文字「未授權角色呼叫下載 API 依 F025 拒絕」在目前矩陣下無可實現之正向反例，僅未登入（TS-023）構成唯一拒絕路徑
- 對應 AC / 錯誤碼：AC「未授權角色呼叫下載 API，依 F025 拒絕」（語意落差見 OQ-F020-03）

### G. 前台檢視器元件（假 PDF 參照）

#### TS-F020-025 檢視器疊加浮水印圖層之視覺屬性 [unit]
- Given：假疊加字串＋NFR-007 定案視覺樣式（對角 45°、`opacity:0.12`、`slate-500`、14px、`pointer-events:none`、平鋪重複）
- When：渲染檢視器
- Then：疊加圖層元素存在且套用上述 CSS 屬性值（以 RTL/jsdom 可驗證之 inline style 或 class 對映斷言，實際跨瀏覽器視覺渲染屬 [integration]/人工 QA）
- 對應 AC / 錯誤碼：[NFR-007](../../specs/nfr.md#watermark) 視覺樣式（OQ-NFR007a 已定案）

#### TS-F020-026 檢視器不提供任何「另存無浮水印原檔」之互動元素 [unit]
- Given：檢視器已渲染
- When：掃描可互動元素（連結/按鈕）
- Then：不存在指向未經後端代理之原始 Blob URL 之下載/另存選項
- 對應 AC / 錯誤碼：Main Flow 2「不提供另存無浮水印原檔途徑」

### H. 真實引擎/位元組層（[integration]，可離線執行但按任務指示歸類 integration）

#### TS-F020-027 真 pdf-lib 燒錄後，PDF 內容層可抽取出浮水印文字 [integration]
- Given：fixture PDF buffer（可為 pdf-lib 產生之空白單頁 PDF，無需真實 Azure Blob）＋一組浮水印快照字串
- When：呼叫真實 `burnPdf()`
- Then：以 PDF 文字抽取工具驗證輸出 buffer 之內容層確實含浮水印字串（非僅檔案 metadata 或註解層）
- 對應 AC / 錯誤碼：AC「下載完成，PDF 內容層已燒錄浮水印（非僅前端疊加）」

#### TS-F020-028 燒錄耗時 <3 秒（代表性檔案大小） [integration]
- Given：代表性大小之 fixture PDF（頁數/大小依 OQ-E04-06 待定上限）
- When：端到端計時燒錄流程
- Then：< 3 秒（[NFR-001](../../specs/nfr.md#performance)「PDF 下載額外處理（含浮水印燒錄）< 3 秒」）
- 對應 AC / 錯誤碼：NFR-001

#### TS-F020-029 未經後端直接以 Blob URL 存取 ICSOP PDF → 拒絕（代理模式，無 SAS 可繞過） [integration]
- Given：真實 Azure Blob 私有容器，ICSOP_PDF 走代理模式（架構 §5.2，不核發任何 SAS URL）
- When：嘗試不經 API 直接以裸 Blob 路徑存取
- Then：Azure 拒絕（私有容器無公開存取），且**理論上更安全**——因代理模式下前端從未取得任何指向此 Blob 的 URL（相較 F016 之 OJT/USAGE_FORM SAS 模式，本情境連「已核發但過期」之攻擊面都不存在）
- 對應 AC / 錯誤碼：AC5／架構 §5.2

#### TS-F020-030 真實 HTTP 端到端：VIEW/DOWNLOAD/PRINT 三端點完整往返含真 DB 稽核持久化 [integration]
- Given：真實 DB、真實 Blob、已登入 session
- When：依序呼叫三端點
- Then：各自回應正確內容類型、真 `AUDIT_LOG` 各出現對應一筆
- 對應 AC / 錯誤碼：整體 AC 之端到端驗證

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC1 | 檢視器疊加浮水印完整格式 | TS-001, TS-025 |
| AC2 | 相隔時間時間戳不同 | TS-006 |
| AC3 | 下載 PDF 內容層已燒錄 | TS-017, TS-027 |
| AC4 | 列印內容層亦已燒錄 | TS-018, TS-027 |
| AC5 | 查看/下載/列印各記錄對應稽核且內容一致 | TS-019, TS-020 |
| AC6 | 未登入拒絕並導回登入頁 | TS-022, TS-023 |
| AC7 | 未授權角色呼叫下載 API 拒絕 | TS-024（語意落差，見 OQ-F020-03） |
| AC8 | 公司名稱顯示 COMPFULLNM 全稱 | TS-013（stub，無法真實驗證，見 OQ-F020-01） |
| AC9 | 部門代碼 JAC00 → 部門/處室推導 | TS-007, TS-012 |
| AC10 | 部門代碼 BJAA0（課層）→ 處室顯示課名 | TS-008 |
| AC11 | 無下層 → 處/室留空且分隔符收合 | TS-003, TS-009, TS-010 |
| AC12 | 同一無下層使用者三者收合後字串完全一致 | TS-015 |
| AC13 | 無對應部層 → fallback 取本部層 | TS-014 |
| Edge：孤兒帳號 | 部門/處室皆空，不顯示 null/原始代碼 | TS-004 |
| Edge：DevTools 移除浮水印 DOM | 已知限制，非本 feature 防禦範圍 | 不設計測試（見開放設計問題） |
| Postconditions | 脫離系統後浮水印仍存在；稽核內容一致 | TS-027, TS-019/020 |
| NFR-007 AC1 | 伺服器端產生，前端不可自組 | TS-001（快照組裝僅存在於後端純函式） |
| NFR-007 AC2 | PDF 實際燒錄 | TS-027 |
| NFR-007 AC5 | 防繞過（技術手段） | TS-029 |
| NFR-001 | 燒錄 <3s | TS-028 |
| error-handling#audit | 稽核失敗不阻斷瀏覽 | TS-021 |

## 開放設計問題

- **OQ-F020-01（核心阻塞，影響 AC1/AC8/AC9 之真實驗證程度）**：浮水印「部門」（部層 `DESC_FULL`）與「公司名稱」（`COMPFULLNM`）之資料來源在目前 schema 下**完全未持久化**（見範圍聲明「依賴缺口」1/2，附具體程式碼行號證據）。這使得 F020 的**核心價值主張**（一份可信、完整、符合契約 §8 之浮水印）在本 worktree 範圍內**無法端到端真實達成**，只能以 stub/TODO 呈現這兩個欄位。需 architect/product owner 決策：(a) 本 worktree 順帶擴充 `OrgUnit` 實體新增 `nameFull` 欄位並補建一個唯讀跨列查找（部層 by `LEFT(orgCode,2)+'000'`）能力，且新建一個 `Company`/`COMPFULLNM` 對照來源（超出「勿自建 org 讀取端點」之字面限制，但若不做，AC8 永遠無法通過）；或 (b) 明確將 AC1/AC8/AC9 之「部門」「公司名稱」欄位驗證延後至 Wave 3，本輪 F020 之 Definition of Done 排除這兩個欄位的真實性驗證，`feature-status.md` 對應列即使其餘子項全數通過亦僅能標記 🟡（非 ✅），需與稽核機制（`feature-status.md` DoD 「AC 覆蓋」規則）之維護者對齊此例外。**此為本次四功能中風險最高的單一發現**，建議優先呈報。

- **OQ-F020-02**：承上，若採 (a)，「部門」欄之查找方式有兩種候選：① 於 `WatermarkModule` 內對 `ORG_UNIT` 表直接查詢（需新增最小讀取方法，可能與 OQ-F019-02 之組織樹端點需求整合為同一批次交付）；② 於 F004 同步階段預先計算並冗餘存於 `Account`（如 `Account.departmentFullNameSnapshot`），避免每次浮水印組裝皆需即時 JOIN。兩者之資料新鮮度（同步延遲 vs 即時查詢效能）與實作複雜度取捨未定案，影響 TS-012/014 之 Fake 介面設計方向。

- **OQ-F020-03**：AC「未授權角色呼叫下載 API，依 F025 拒絕」與 `function-matrix.ts` 現行矩陣（`DOCUMENT_DOWNLOAD_PRINT` 對全 5 角色皆 `READ`，第 102 行）矛盾——現行矩陣下**不存在**任何已登入角色會被此 AC 拒絕的情境。可能原因：(a) 此 AC 為 spec 撰寫時之通用範本文字，實際上僅指「未登入」情境（用詞鬆散，「未授權角色」實為「無 session」之口語表達）；(b) F025 矩陣未來會新增區分（如限制未來新增之外部角色/訪客）；需 spec-writer 或 architect 確認 AC 文字意圖，避免 tdd-developer 誤為此需求虛設一個目前矩陣不支援的角色拒絕分支。

- **OQ-F020-04**：`PdfBurner` 介面之確切形狀（方法名、是否為獨立可注入服務或 `WatermarkModule` 內部私有函式、`burnPdf()` 之錯誤處理——來源 PDF 損毀/非 PDF 格式時之行為）未定案，本文件之介面僅為測試設計假設之最小合約，比照 F016-test.md OQ-F016-02 之處理方式，供 tdd-developer 參考起點，非架構定案。

- **OQ-F020-05**：「使用表單下載是否需浮水印」（`docs/ui-ux-design-overview.md` OQ-E05-03，設計預設為「不燒錄，比照 SAS 直下模式」）與本 F020 spec 之範圍邊界需再次確認——F020 之 Description 僅提及「文件」（即 `ICSOP_PDF`）之疊加/燒錄，本設計依此假設 F020 範圍**不含**使用表單（`USAGE_FORM`）之浮水印，該類下載沿用 F018/F016 既有之 SAS 短效期直下模式（架構 §5.2 第二列）。若日後定案使用表單亦需浮水印，將是對本設計範圍的擴增，需另補 TS。

- **OQ-F020-06**：DevTools 移除浮水印 DOM 之防禦，spec Edge Case 明文「非本 feature 完全防禦範圍」，[NFR-007](../../specs/nfr.md#watermark) AC5 亦稱「完全防截圖/拍照非本系統可保證，屬已知限制」。依測試設計原則（不可驗證/主觀之需求應提出可量測替代方案而非略過），本設計**刻意不為此情境設計測試**，於此明確記錄該決定與理由，避免遺漏被誤讀為疏漏。若日後有「合理技術手段降低風險」（AC5 用語）之具體措施定案（如 CSP、右鍵停用等），屆時再補測試。

---

# 🔴 2026-08-16 缺失／變更 delta 測試設計（Lane L2：前台燒錄與三層式浮水印）

> 本段由 **test-generator（Lane L2／L5）** 於 2026-08-16 追加，涵蓋 **F020 全部 `AC-D#`**、
> **F018 `AC-D11`／`AC-D12`／`AC-D14`**（前台使用表單燒錄）與 **F026 之後台 RAW 語意**。
> 權威＝`docs/specs/features/F020-watermark.md#front-burn-scope-delta`、`F018-usage-form-management.md#front-burn-delta`、
> `F039-appendix-management.md#front-burn-delta`、`architecture-spec.md §10.1／§10.2／§10.3／§10.14`、
> `prototypes/04-public-document-detail.html`、`prototypes/05-public-viewer-watermark.html`。
>
> 🔒 **本段不推翻任何後台條款**：`OQ-FM-01`（2026-07-24）維持有效，
> `docs/specs/test-design/field-matrix-test-design.md` 之「此服務完全不具備燒錄能力」基準線**一字未動**
> （它描述的是後台路徑；本段所有燒錄約束皆限前台）。
>
> ⚠ **上段 `OQ-F020-05`（「使用表單不燒錄」之測試設計假設）已於 2026-08-16 由 `OQ-D18-25` 推翻**——
> 逐字保留於上供追溯，其結論**不再適用於前台路徑**（後台仍不燒錄，故該段對後台之描述仍成立）。

## AC ↔ 約束對照

| AC | 約束檔案 | 層級 |
|---|---|---|
| `AC-D1` 前台附屬檔案 PDF 燒錄 | `backend/src/public/watermark.burn-if-pdf.spec.ts`、`backend/src/appendices/appendices.front-burn.service.spec.ts` | unit（jest） |
| `AC-D2` 策略 A（非 PDF 原檔＋UI 明示） | 同上 ＋ `frontend/src/pages/PublicDocumentDetailPage.watermark.test.tsx` | unit／component |
| `AC-D3` 前後台位元組分流 | `appendices.front-burn.service.spec.ts`（前台已燒錄 ≠ 原始位元組；後台不觸發燒錄） | unit（**真位元組比對屬 (乙)**） |
| `AC-D3a` 前台一律代理串流 | `appendices.front-burn.service.spec.ts`（`blob.urlCalls` 為 0、回應無 `url` 欄）＋ `PublicDocumentDetailPage.watermark.test.tsx`（不得 `window.open`／`<a href>`） | unit／component |
| `AC-D4` 🔒 後台 RAW 回歸鎖定 | `appendices.front-burn.service.spec.ts`（`downloadFromPool` burn 0／audit 0）＋ `AppendixManagementPage.export.test.tsx`（前端仍呼叫 RAW helper、不渲染 `data-wm-note`） | unit／component |
| `AC-D5` 稽核義務不變＋快照落值 | `appendices.front-burn.service.spec.ts`（PDF→落值、非 PDF→`null`） | unit |
| `AC-D6` 共用端點閘門收斂 | `backend/src/attachments/attachments-controller-routes.gate.spec.ts` | unit（route metadata） |
| `AC-D7` 三類清單之逐字文案與選擇器 | `frontend/src/pages/PublicDocumentDetailPage.watermark.test.tsx` | component |
| #7 三層式（`BUG-IMPL`，不新增 AC） | `backend/src/public/watermark.three-layer.spec.ts`、`frontend/src/domain/watermark-lines.test.ts`、`PublicViewerPage.watermark.test.tsx`、`ChangeHistoryPage.watermark.test.tsx`、`LifecycleTreePreviewPage.watermark.test.tsx` | unit／component |
| F018 `AC-D11`／`AC-D12` | `watermark.burn-if-pdf.spec.ts`（規則層）＋ `PublicDocumentDetailPage.watermark.test.tsx`（UI 層） | unit／component |
| F018 `AC-D14` | 規則層（`burnIfPdf` 之 snapshot 落值）於本檔；**service 層之 `targetType='USAGE_FORM'` 稽核已於 2026-08-16 由 Lane B 補齊**＝`usage-forms.front-burn.service.spec.ts` `TS-F018-D14-001`～`008`（`G-L2-01` 結案，見 [F018-test.md 末段](F018-test.md)） | ✅ 完整 |

## §10.14 跨前後端一致性之測試向量（**兩邊必須逐字相同**）

| # | 快照 | 期望三行 |
|---|---|---|
| ① | `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-{機密聲明}-{時間}` | `E001-…-審查室` ／ `{機密聲明}` ／ `{時間}` |
| ② | `E001-王小明-和潤企業股份有限公司-營運管理部-{機密聲明}-{時間}` | `E001-…-營運管理部` ／ `{機密聲明}` ／ `{時間}` |
| ③ | `E001-王小明-和潤企業股份有限公司-{機密聲明}-{時間}` | `E001-…-和潤企業股份有限公司` ／ `{機密聲明}` ／ `{時間}` |

載體：`backend/src/public/watermark.three-layer.spec.ts` 之 `WATERMARK_LINE_VECTORS`
↔ `frontend/src/domain/watermark-lines.test.ts` 之 `VECTORS`。**改任一邊必須同時改另一邊。**

## 三層式之 DOM 判準（刻意不綁實作形式）

`<br>` 分行（prototype 05 之形式）**或** `display:block` 子元素分行（§10.14 建議之形式）**皆可**；
測試只斷言「恰三個行盒、逐字內容與順序」。
⚠ **不斷言 `white-space` 必須非 `nowrap`**——`LifecycleTreePreviewPage`（正確參考實作）本來就帶 `nowrap`

---

# 🔴🔴 2026-08-20 D9 缺失／變更 delta 測試設計（backend 線）

> 本段由 **test-generator（backend／jest 線）** 於 2026-08-20 追加，涵蓋 `AC-N1`～`AC-N21`／`AC-N68`
> 之**後端**部分。權威＝`docs/specs/features/F020-watermark.md#d9-watermark-delta`／`#backend-burn-delta`、
> `architecture-spec.md §11.1～§11.9`。**本輪約束環為簡化版（僅 backend jest ＋ frontend vitest）**，
> 前端線（`AC-N4`／`AC-N5`／`AC-N7`／`AC-N8`／`AC-N9`／`AC-N66`／`AC-N67`／`AC-N71`～`AC-N73`，皆為
> 檢視器 canvas 化與 DOM 契約）不在本段範圍，由 frontend 線另立。
>
> 🔴🔴 **本段推翻既有明文定案**：`OQ-FM-01`（2026-07-24）與 `OQ-D18-01`（2026-08-16 再次確認）
> **已全面失效**——`docs/specs/test-design/field-matrix-test-design.md` 之「此服務完全不具備燒錄
> 能力」基準線已就地反向重寫（見該檔頭之 2026-08-20 D9 delta 橫幅）。

## AC ↔ 約束對照（backend）

| AC | 約束檔案 | 層級 |
|---|---|---|
| `AC-N1` 對比度門檻 ≥ 1.70 | `backend/src/public/pdf-burner.spec.ts`（「D9 delta — 浮水印色值／不透明度」describe） | unit |
| `AC-N2` 定稿值 `#334155` @ `0.30` | 同上 | unit |
| `AC-N3` 具名匯出常數（`WATERMARK_RGB`／`WATERMARK_OPACITY`，命名由 test-generator 依 AC-N2 字面值訂立，可申訴） | 同上 | unit（可測性前提） |
| `AC-N6` `/pdf` 端點改回傳已燒錄位元組（安全缺陷修復） | `backend/src/public/watermark.controller.spec.ts`（`pdf` 案就地改寫）＋`watermark.service.spec.ts`（「D9 delta — AC-N6」describe，`getOriginalPdf` 新增正向燒錄案） | unit |
| `AC-N10` `COMPANY_SHORT_NAMES` 字面值 | `backend/src/org-directory/company-name.spec.ts`（「D9 delta — COMPANY_SHORT_NAMES」describe） | unit |
| `AC-N11`（INV-C2）短稱鍵集合≡全稱鍵集合 | 同上 | unit |
| `AC-N12` `resolveCompanyShortName` | 同上 | unit |
| `AC-N13`（🔒 全稱三處消費點回歸鎖定，本檔僅驗共用常數本身未被連帶修改） | 同上 | unit |
| `AC-N14`／`AC-N16` 後台四端點一律燒錄、無例外角色 | `attachments.service.spec.ts`（附件）／`appendices.front-burn.service.spec.ts`（附錄）／`usage-forms.front-burn.service.spec.ts`（使用表單，各自之「D9 delta — 後台受控下載改為一律燒錄＋寫稽核」describe） | unit |
| `AC-N15` 策略 A 於後台亦適用 | 同上三檔 | unit |
| `AC-N17` 後台下載寫調閱稽核 | 同上三檔 | unit |
| `AC-N18` 浮水印身分＝操作者本人 | 同上三檔（不同操作者位元組不相等案） | unit |
| `AC-N19` 🔒 前台側零漣漪 | `attachments.service.spec.ts`（既有 `downloadAttachmentRaw` 未登入拒絕案，燒錄/稽核皆 0） | unit |
| `AC-N20` 後台亦渲染 `data-wm-note` | 🔵 前端 DOM 契約，本檔（backend）不涉及；歸屬 frontend 線 | component |
| `AC-N21` 🔒 傳輸模式不變 | 同上三檔（`blob.urlCalls` 恆為 0） | unit |
| `AC-N68` `toDisplayLines` 恰 3 行 | `pdf-burner.spec.ts`（新增兩案）；⚠ 跨前後端逐行相等之另一半由 frontend 線之 `watermark-lines.test.ts` 補上 | unit |

## §11.11 單元測試盲區（本段新增，backend 相關者）

- **#18／#19**（pdf.js 資源部署）：純前端資源部署問題，backend 無法測，見 architecture §11.11。
- **#20**（`AuditWriterRecorder` 身分快照遺漏，🔴 本輪最擔心之三條之一）：已修——
  `backend/src/appendices/audit-writer-recorder.adapter.spec.ts`／
  `backend/src/usage-forms/audit-writer-recorder.adapter.spec.ts` 新增「§11.6／§11.11#20」案，
  以完整六欄輸入斷言完整轉送物件（非僅呼叫次數）。
- **#21**（`WATERMARK_BURNER` 抽出重構之接線回歸）：🔴 **原理上測不到**（純建構子單元測試不經
  Nest 容器解析）——本檔之單元測試無法涵蓋，必要把關手段為容器內實際啟動（`docker compose up`
  或等效 smoke test），列入 `risks-and-gaps.md`。
- **#25**（`/pdf` 等端點之 `Cache-Control` 標頭）：非 AC 明文要求（architecture §11.11 列為建議、
  非阻擋），本輪未建約束，列入 `risks-and-gaps.md` 供追蹤。
且行為正確（它已用 block 子元素分行）。真正的缺陷是**沒有分行**，不是 `nowrap` 本身。

---

# 🔴🔴 2026-08-20 D9 缺失／變更 delta 測試設計（檢視器 canvas 化＋疊加層收斂，frontend 線）

> 本段由 **test-generator（frontend／vitest 線）** 於 2026-08-20 追加，涵蓋 `AC-N2`（前端 2 處有效
> 載體之色值／不透明度）、`AC-N4`／`AC-N5`／`AC-N7`／`AC-N8`／`AC-N9`／`AC-N20`（前端半：後台各頁
> 渲染 `data-wm-note`）／`AC-N66`／`AC-N67`／`AC-N71`～`AC-N73`。backend 線已持有 `AC-N1`／`AC-N3`
> （後端半）／`AC-N6`（燒錄本體）／`AC-N10`～`AC-N19`／`AC-N21`／`AC-N68`（後端半），不重複建約束。

## AC ↔ 約束對照

| AC | 約束檔案 | 層級 |
|---|---|---|
| `AC-N2` `ChangeHistoryPage`／`LifecycleTreePreviewPage` 疊加之定稿值 `#334155` @ `0.30` | `frontend/src/pages/ChangeHistoryPage.watermark.test.tsx`／`LifecycleTreePreviewPage.watermark.test.tsx`（各自新增「浮水印疊加：色值／不透明度」案） | component |
| `AC-N4` 無 `<iframe>`／`<embed>`／`<object>`，`<canvas data-pdf-canvas>` 承載 | `frontend/src/pages/PublicViewerPage.test.tsx`（「AC-N4」案） | component |
| `AC-N5` 🔒 系統下載／列印鈕仍存在（回歸鎖定） | 同檔（「AC-N5」案，沿用既有斷言） | component |
| `AC-N6` 前端消費半：檢視器經 `/pdf` 端點取得位元組（`fetch` 呼叫） | 同檔（「AC-N6」案）＋`PublicViewerPage.watermark.test.tsx`（「AC-N6 單層浮水印之前提」） | component |
| `AC-N7` 🔴 無任何浮水印疊加層（負向斷言） | 同二檔（「AC-N7」＋「初次載入完成後...」「縮放互動...」共 3 案） | component |
| `AC-N8` 縮放不得以 `transform: scale()` 達成 | `PublicViewerPage.test.tsx`（「AC-N8」案，含祖先容器遍歷） | component |
| `AC-N9`／`AC-N73` 縮放觸發以新倍率重新渲染（`vi.mock('pdfjs-dist')` seam） | 同檔（「AC-N9／AC-N73」案，`pdfjsState` 可觀測序列） | component |
| `AC-N20` 前端半：後台 5 頁各檔案列渲染 `data-wm-note` | `DocumentListPage.test.tsx`／`DocumentReadonlyPage.test.tsx`／`DocumentEditPage.test.tsx`／`UsageFormManagementPage.test.tsx`／`AppendixManagementPage.test.tsx`（各自新增「AC-N20」案，共 9 案） | component |
| `AC-N66` 🔒 兩頁疊加層必須保留（正向鎖定） | 既有 `ChangeHistoryPage.watermark.test.tsx`／`LifecycleTreePreviewPage.watermark.test.tsx` 之三層式渲染案（未修改，本輪僅新增色值案；🔴 三層拆行語意本身不受本 delta 影響，逐字綠燈即為 `AC-N66` 佐證） | component |
| `AC-N67` ①② 格式字幕保留＋`/view` 端點稽核觸發 | `PublicViewerPage.test.tsx`（「AC-N67 ①」「AC-N67 ②」案） | component |
| `AC-N68` 前端半：`watermarkLines()` 固定測試向量 | 既有 `frontend/src/domain/watermark-lines.test.ts`（未修改，已對同一組固定向量斷言，本輪不重複建） | unit |
| `AC-N71` DOM 契約（canvas aria-label／`data-viewer-page`／`prevBtn`／`nextBtn`／`pageInput`／`pageTotal`） | `PublicViewerPage.test.tsx`（「AC-N71」3 案） | component |
| `AC-N72` `#securityBand` 逐字文案（空白正規化） | 同檔（「AC-N72」案） | component |

## ⚠ 契約性假設（test-generator 訂立，非讀取實作決定；供 tdd-implementation 對齊或申訴）

1. **檢視器取得已燒錄位元組之機制**：推定為 `PublicViewerPage` 呼叫 `fetch(documentPdfUrl(id))`
   取得 `ArrayBuffer` 後交給 `pdfjs-dist` 之 `getDocument({ data })`（`AC-N6`／`AC-N9` 之測試皆
   `vi.stubGlobal('fetch', ...)`）。若實作改採其他取得方式（如 `pdfjs-dist` 之 `getDocument({url})`
   直接內建抓取），`AC-N6` 之 `fetch` 斷言需調整，屬合理申訴。
2. **`vi.mock('pdfjs-dist', ...)` 之可執行性已實測驗證**——本檔（`PublicViewerPage.test.tsx`／
   `.watermark.test.tsx`）**不** `import` `pdfjs-dist`（僅透過 `vi.hoisted` 之 `pdfjsState` 存取
   mock 內部狀態），故在 `pdfjs-dist` 尚未安裝之現階段**仍可正常收集與執行**（非「收集階段失敗」）
   ——此為建環時之重要澄清，避免誤判本檔為不可執行。待 tdd-implementation 依架構決策 B1 新增
   `pdfjs-dist` 相依並改為 canvas 化實作後，其內部 `import` 才會被本檔之 `vi.mock` 正確攔截。

## risks-and-gaps 提醒

- **§11.11 #22／#23（大頁數記憶體峰值、HiDPI 實際清晰度）**：架構文件已明文列為「原理上測不到」
  （jsdom 無真實 canvas 點陣渲染），本輪不建約束，需瀏覽器煙霧測試把關，列入 `risks-and-gaps.md`。
- **§11.11 #18／#19（pdf.js 靜態資產部署）**：純建置/部署問題，vitest 以 mock 執行、從未真的下載
  `/pdfjs/cmaps/*.bcmap`，本輪不建約束，列入 `risks-and-gaps.md`。
- **`AC-N71` 之「單頁 vs 連續捲動」為 ui-ux-designer 之授權裁量，本段只鎖可觀測掛鉤**（`data-viewer-page`
  等），不鎖畫面呈現形式本身。
