# Browser Smoke — Live vs Prototype 落差報告

驗證日期：2026-07-25 · 驗證者：Claude Code（Chrome MCP）· 帳號：AS22455（ICSOPAdmin）
方法：live（docker `docker compose up -d --build`，前端 :5173→nginx:80，後端 :3000）逐頁對比
prototypes/NN-*.html（本機靜態伺服 :5188）。

---

## 🔴 基礎設施 / 反向代理 bug（先於逐頁比對揪出）

### BUG-1 — `/public/*` 與 `/org-units` 未在代理白名單 → 前台流程整段壞掉
- **現象**：`GET /public/documents?page=1` 回 **200 + index.html**（SPA fallback），前端 fetch 得 HTML
  → 頁面顯示「載入失敗 · Unexpected token '<', "<!doctype "... is not valid JSON」。
- **根因**：`frontend/nginx.conf` 與 `frontend/vite.config.ts` 代理白名單僅含 `/auth`、`/admin`；
  後端公開路由為 `@Controller('public/documents')`、`@Controller('org-units')`（無 global prefix），
  皆未被代理。
- **影響頁**：03 前台清單、04 前台詳情、05 前台檢視器，以及任何用 `/org-units` 下拉的頁。
- **為何 unit/int 測不到**：unit mock fetch；int 用 supertest 直打後端，皆繞過代理。**只有真瀏覽器會踩到**。
- **修法**：nginx 加 `location /public/`（比照 `/admin/` 之 Accept-header bypass，因 `/public/documents/:id`
  同時是 API 與 SPA 路由）＋ `location /org-units`（純 API 直代理）；vite.config 同步加 `/public`（帶 spaBypass）
  與 `/org-units`。**已修復並重建、curl 驗證通過。**

### BUG-1b — 前台檔案端點被 SPA Accept-bypass 誤攔（BUG-1 修法之副作用/補完）
- **現象**：檢視器(05) 以 `<iframe src="/public/documents/:id/pdf">` 內嵌 PDF；iframe 導覽送 `Accept: text/html`，
  被 BUG-1 新增之 `location /public/` Accept-bypass 改寫為 index.html → iframe 顯示 app shell（角色分流頁）。
  curl 實證：`/pdf` Accept:text/html → 200 text/html（SPA）；Accept:json → 401（後端）。
- **影響**：所有文件之檢視器 PDF 內嵌（`:id/pdf`）、下載（`:id/download`）、列印（`:id/print`）。
- **修法**：nginx 加**優先** regex location `~ ^/public/documents/[^/]+/(pdf|download|print)$` 永遠代理至後端
  （regex 優先於 prefix；`:id/view` 仍為 SPA 路由不納入）；vite spaBypass 同步排除該三端點。
  **已修復並重建**；curl 驗證：`/pdf`、`/download` Accept:text/html → 401 後端；`/:id`、`/:id/view` → 200 SPA。✅

### BUG-2 — 裸 `/admin` 301 轉址掉 port（絕對轉址）
- **現象**：`GET /admin`（無尾斜線, Accept html）→ **301 → `Location: http://localhost/admin/`**（port 由
  5173 掉成 80）；`GET /admin/`（有尾斜線）→ 200 index.html 正常。
- **根因**：nginx 對 `/admin` 自動補尾斜線並發**絕對**轉址，用自身 listen port(80)，非對外 host port。
- **影響**：非 80 埠部署（dev 的 5173→80 映射、或 LB 後非 80）下，硬導覽/重新整理/深連結至儀表板 `/admin`
  會斷。App 內 client-side 導覽（React Router）不經 nginx 故正常，隱藏了此 bug；但儀表板按 F5 會壞。
- **僅**裸 `/admin`（儀表板）受影響；`/admin/accounts` 等已在 `/admin/` 下不受影響。
- **修法**：nginx 加 `absolute_redirect off;`（發相對轉址）或 `location = /admin { try_files /index.html =404; }`。

---

## 逐頁比對（admin 頁優先，前台頁待 BUG-1 修復後）

圖例：✅ 相符 · 🟡 中度落差 · 🔺 高度落差 · ℹ️ 已知取捨/正確 gating

### 07 admin-shell + dashboard
- ✅ Shell：側選單 8 項（唯讀/可編輯 badge）＋瀏覽文件網頁＋topbar 麵包屑＋角色 badge＋登出 — 全相符。
- ✅ 快速進入功能區 8 張卡（標題＋唯讀/可編輯 badge）相符。
- 🔺 GAP-07-1：**儀表板缺整排 4 張 KPI 卡**（待確認組織異動／未指派節點文件／調閱紀錄近7日／待公布文件）。
  live 由標題直接跳到「快速進入功能區」。
- 🟡 GAP-07-2：歡迎標題用 loginId「AS22455」而非顯示名（proto 用姓名；此帳號 /auth/me name=游博丞）。
- ℹ️ GAP-07-3（LOW）：副標缺當日日期「· 2026-07-16（週四）」。

### 08 account-management
- ✅ 對齊工作還原的欄位到位：姓名/帳號/公司/部門/來源/角色/狀態/最後登入（1114 筆真實資料）。
- ✅ 唯讀 banner 正確（ICSOPAdmin 對帳號唯讀）；proto 的 建立帳號/操作欄 為編輯 persona，live 正確以 banner 取代（正確 gating）。
- ℹ️ 職位欄：proto 有、live 無 — 已知取捨（上游無此欄，OQ-E02-07）。
- 🟡 GAP-08-1：欄名「最後活動」(proto) vs「最後登入」(live)；且 live 多為「—」（僅少數登入過）。語意/文案差異（LOW-MED）。
- 🟡 GAP-08-2：live 疑似一次渲染 1114 列、無分頁；proto 有分頁 UI（共 N 筆＋頁碼）。待確認前端是否分頁（效能）。

### 09 org-sync-management
- ✅ 結構全相符：最近同步卡＋3 分頁（總覽/同步歷史/待確認異動）＋4 KPI 卡＋footer 註記。
- ℹ️ live 省略「立即同步」按鈕＝ICSOPAdmin 唯讀正確 gating；待確認異動 badge 依真實 pending 數（0）不顯示 — 皆正確。

### 13 document-list（★使用者原始抱怨頁）
- ✅ **欄位已完全對齊 prototype**：制定公司/制定部門/制定室別/當責室長/狀態/檔案/樹狀圖/程序書編號/程序書書名/版次/內容摘要。
  **使用者原始抱怨（欄位差很多）已由對齊工作解決。**
- ✅ 3 KPI 卡＋9 欄篩選面板＋建立程序書 按鈕＋「共 N 筆·每頁 50 筆」＋頁碼 皆相符。
- ℹ️ 差異純資料：live 僅 1 筆真實文件（org 欄位 null 顯示 —、無檔案）；proto 14 筆 mock。
  無法用現有資料驗證 當責室長「+N」次要室長 pill（需多室長文件）。

### 14 document-create
- ✅ 結構完全相符：Section1 循環與節點歸屬（所屬循環*/所屬節點＋note）→ 鎖定提示 → Section2 基本資訊
  （系統UUID/文件狀態*/ICSOP編號*/文件名稱*/版次/公告日期/內容摘要）＋重設/建立。
- ✅ 全域 Toast（SYS-1）正確渲染。
- 🔺 受 **BUG-1** 影響：org 歸屬下拉呼叫 `/org-units` 失敗 → 紅色 toast「無法載入組織資料」，org 下拉無法載入。

### 15 document-edit
- ✅ 結構完全相符：目前值/新值 並列；文件狀態[有效/失效/作廢] toggle；編號前綴拆分；版次兩段輸入；
  公告日期；內容摘要；helper 文案一致。
- ℹ️ 差異純資料。

### 16 document-readonly
- ✅ 欄位區完全相符（系統UUID·系統產生/文件狀態/制定公司·部門·室別/程序書編號·書名/版次/內容摘要/
  當責室長-主要·次要/文件使用部門/循環別/所屬節點[跳轉檢視畫布]/連結點程序書/公告日期）＋附件（僅下載）燒錄浮水印註記。
- ℹ️ banner 依角色不同：live ICSOPAdmin＝可編輯 banner＋「前往編輯」；proto 主管＝全欄唯讀 banner。皆為設計狀態，正確。

### 10 lifecycle-list
- ✅ 結構完全相符：新增循環＋搜尋＋所有狀態＋「共 N 個循環」；欄位 循環名稱/狀態/節點數/掛載文件/最後更新/操作
  （DAG 畫布|編輯|停用|刪除）。真實 1 循環（22 節點、1 份掛載）。

### 11 dag-canvas
- ✅ 樹狀圖渲染、22 節點、節點卡（radio icon＋標題＋「N份文件/尚未掛載文件」sub-line、掛載文件者綠左框、藍字份數）、
  縮放控制＋mini-map＋防環 tooltip 皆到位。
- 🟡 GAP-11-1：工具列第三顆按鈕 live＝「整理連結線」(auto-layout)、proto＝「儲存」。live 無「儲存」鈕
  （疑為即時持久化、免顯式存檔）；需確認是否為刻意設計。
- ℹ️（LOW）proto 縮放區有「100%」數值標籤、mini-map 有「Mini-map」標籤；live 皆省略。

### 12 node-drawer
- ✅ 完全相符：節點維護（節點名稱 input＋「變更即時反映」hint／目前掛載文件清單＋移除鈕／候選文件＋
  「僅顯示所屬循環…後端過濾」註記＋搜尋／關閉即送出變更＋取消＋儲存並關閉）。live 候選為空時顯示
  正確空狀態「尚無可掛載文件／此循環的文件皆已掛載於本節點」。

### 22 lifecycle-tree-preview
- ✅ viewer 風格完全相符：返回＋標題／循環別 selector／縮放＋下載＋列印／「點節點＝醒目下游」hint／
  調閱稽核 banner／**伺服器端動態浮水印**（真實身分＋時間戳燒錄）／樹狀節點卡。
- ℹ️ 循環代碼後綴（proto「· SRC」「（SRC）」）live 省略 — 已知取捨（cycle codes 本輪 drop，無真值）。

### 17 access-history
- ✅ 完全相符：查詢範圍 banner／5 篩選（類型/人員/文件/起始/結束）＋查詢＋清除條件／欄位（操作人員/員工編號/
  公司/部門/處室/角色/類型/對象/操作類型/操作時間 新→舊）＋逐列展開 chevron／類型化操作 badge
  （LIFECYCLE_VIEW/DOWNLOAD/ALERT_RESOLVED/…）。真實 1604 筆。
- ℹ️ live 多一行 helper「未輸入條件，已套用近 30 天預設範圍」（優於 proto，非落差）。

### 18 permission-matrix（系統參數設定）
- ⚠️ **無法以 ICSOPAdmin 驗證**：/admin/settings 對 ICSOPAdmin 回 **403 PERMISSION_DENIED**
  「系統參數設定僅系統管理員可存取」，且側選單正確不顯示「系統參數設定」項 — **gating 正確**。
- ℹ️ proto persona＝系統管理員；矩陣（角色×功能 F025／角色×欄位 F026、CRUD/唯讀/— cell、5 角色欄）為
  對齊工作重點頁（G-ADM-013~021、anti-drift classifyCell）。**瀏覽器驗證需 SysAdmin session（待補）**。
- ℹ️ 403 頁本身渲染良好（鎖 icon＋「無系統參數設定權限」＋「PERMISSION_DENIED · 403」）。

### 19 usage-form-management
- ✅ 結構相符：上傳表單＋info note＋搜尋＋所有格式＋「共 N 個表單」；欄位 表單名稱/格式/大小/上傳者·上傳時間/
  關聯文件數/操作；空狀態「查無符合的表單」。
- ℹ️ live 0 筆表單，無法驗證列渲染（G-ADM-024 uploadedByName/Dept、G-ADM-025 關聯文件 +N 連結、操作 icon 組）。

### 21 document-index-management
- ✅ 結構相符：完整 intro note／4 KPI 卡（成功/建置中/失敗/尚未建立）／搜尋＋所有索引狀態＋「共 N 份文件」／
  欄位（文件編號·名稱/.xls 原件/索引狀態/chunk 數/最後索引時間/操作）／footer 註記。
- 🔺 GAP-21-1：**live 文件編號/名稱欄顯示原始 UUID「FCFBBC4C-…」**，而非 proto 之「ICSOP-CIPS-102-1-01＋書名＋
  （循環·版次·使用部門）sub-line」。＝G-ADM-029 已知延後（後端無 join），但顯示裸 UUID 對使用者不可讀，**建議提升優先序**。
- 🟡 GAP-21-2：.xls 原件欄 live 顯「—」而非 G-ADM-027 之「無」file-x 紅 icon（疑 hasXls null vs false 的空值處理）。
- ℹ️ 成功/失敗/建置中/檢視提取結果/查看失敗詳情/chunk 數 因真實資料僅 1 筆未索引，無法瀏覽器驗證。

### 23 change-history
- ✅ 結構相符：查詢範圍 banner／[ICSOP 程序書][循環樹狀圖] tab／5 篩選＋聚合註記／欄位（程序書/變更摘要/來源/
  操作人/時間 新→舊）／footer append-only 註記。
- ✅ **G-LC-022 已確認生效**：來源欄渲染多枚「依欄位衍生」之分類 badge（建立/編輯/使用部門…及組合），顏色分類 map 正確。
- ℹ️ live 可見列全為 ZZINT 整合測試資料（noise）；ZZINT 測試文件之程序書名列缺（疑測試文件無 name），非 UI 落差。

---

## 前台頁（03/04/05）— BUG-1 已修復並重建，前台流程已通
重建後驗證：`/public/documents`、`/org-units` 皆回 401 application/json（已代理）；`/admin` 301 轉相對；
公開清單載入正常、org 名稱解析（DDC00→創新研發室）、session 撐過重建。

> 補驗方式：暫將 CIPS 文件設公告日期 2026-07-01（已公告）→ 驗證 03 卡片/04 詳情/05 檢視器 → 還原（清空公告日期）。已完成並還原。

### 03 public-list
- ✅ 結構相符：topbar（ICSOP 文件瀏覽＋使用者＋org 名＋登出）／搜尋／3 篩選／banner／空狀態「查無符合結果」。
- ✅ 卡片結構相符（暫上架 CIPS 驗證）：編號＋狀態 badge（上排）／粗體標題／制定部門·使用部門·循環別（左）／
  公告日期（右）／chevron；非本部門文件正確歸於「其他文件 · 依編號降冪」。
- 🟡 GAP-03-1（LOW）：狀態 badge/篩選 live「已公告」vs proto「有效」（見下方共通落差）。
- ℹ️ 內容摘要列 CIPS 為空故未顯（有摘要文件應顯示）；「您部門相關文件」置頂區 CIPS 非本部門故未觸發。

### 04 public-document-detail
- ✅ not-found 狀態正確：進度中文件之公開詳情回 404 → 「查無此文件／文件可能尚未公告或已下架」＋返回鈕。
- ✅ 完整詳情版面相符（暫上架 CIPS 驗證）：麵包屑／標題＋badge／檢視·下載·列印／唯讀 dl（系統UUID/文件狀態/
  制定公司·部門·室別/程序書編號·書名/當責室長主次/文件使用部門/版次/循環別…）欄序與 prototype 一致。
- 🟡 文件狀態列 live「已公告」vs proto「有效」（見下方共通落差）。

### 05 public-viewer-watermark
- ✅ chrome 相符：header（文件檢視器＋書名·編號）／工具列（檢視·下載·列印＋縮放）／浮水印政策 banner／
  **伺服器端動態浮水印**（真實身分＋時間戳，對角重複燒印）。
- 🔴 **BUG-1b（已修）**：檢視器以 `<iframe src=".../pdf">` 內嵌 PDF，該端點被 SPA Accept-bypass 誤攔 →
  iframe 顯示 app shell（角色分流頁）而非 PDF。已加優先 regex location 修復並重建、curl 驗證通過。
- ⚠️ 實際 PDF 內容渲染未能端到端驗證：CIPS 無上傳 ICSOP_PDF（`/pdf`→404）；需一份**含 PDF** 之已公告文件補驗。

### 共通落差 — 前台「文件狀態」顯示公告狀態而非文件狀態
- 🟡 GAP-PUB-STATUS：前台清單篩選/卡片 badge/詳情「文件狀態」欄，live 顯示 **「已公告」**（公告狀態），
  prototype 顯示 **「有效」**（文件狀態 enum：有效/失效/作廢）。同一文件在 admin(16) 顯「有效」、前台顯「已公告」。
  欄位標籤為「文件狀態」，填入公告狀態屬語意混用；prototype 顯示實際文件狀態「有效」。**建議確認何者為準。**

## 01 login — ✅ 已驗證（audit 途中 session 逾時自然帶出）
- ✅ 完全相符：左品牌面板（logo／「統一、可追溯的 ICSOP 文件治理」／3 bullet／© 2026 和潤 內部系統）；
  右登入區（登入標題／「請使用公司帳號（Azure AD SSO）」／[使用公司帳號登入] 藍鈕／靜默 SSO 註記／
  「或」divider／[使用管理員帳號登入] 下拉）。
- ✅ 正確省略 prototype-only「原型示範」模擬鈕（模擬單一登入成功/查無有效帳號/帶入正確帳密/帳密錯誤/Session逾時）。
- ✅ **G-PUB-006 工作階段逾時 modal 已確認生效**（時鐘 icon＋「工作階段已逾時／因閒置逾 30 分鐘…／
  AUTH_SESSION_EXPIRED／重新登入」）— prototype 僅以「模擬 Session 逾時」鈕示範，live 為真實觸發。

---

## 小結（全 20 頁，2026-07-25，帳號 AS22455/ICSOPAdmin）
- **使用者原始抱怨（文件清單欄位）已由對齊工作解決**（13 完全相符）。
- **19/20 頁瀏覽器驗證完成**（18 權限矩陣為 SysAdmin-only，依決策略過）。多數頁高度忠實。

### 已修並重建驗證的基礎設施 bug（3）
- ✅ BUG-1：`/public/*`、`/org-units` 未代理（阻擋前台三頁＋建立頁 org 下拉）→ nginx/vite 加代理。
- ✅ BUG-1b：前台檔案端點（pdf/download/print）被 SPA Accept-bypass 誤攔（檢視器 iframe 顯 app shell）→ 優先 regex location。
- ✅ BUG-2：裸 `/admin` 絕對轉址掉 port → `absolute_redirect off`。
- 檔案：`frontend/nginx.conf`、`frontend/vite.config.ts`（皆 dev/部署設定；未動應用邏輯）。**尚未 commit。**

### 前端功能落差（建議後續處理）
- 🔺 GAP-07-1 儀表板缺整排 4 KPI 卡（待確認組織異動/未指派節點/調閱紀錄/待公布）。
- 🔺 GAP-21-1 doc-index 列顯裸 UUID 而非文件編號+書名+metadata（G-ADM-029 延後之延伸，建議提優先序）。
- 🟡 GAP-PUB-STATUS 前台「文件狀態」顯示「已公告」而非「有效」（語意混用）。
- 🟡 GAP-07-2 歡迎用 loginId 非顯示名；GAP-08-1 最後活動/登入欄名；GAP-08-2 帳號頁疑無分頁（1114 列）；
  GAP-11-1 DAG 工具列「整理連結線」vs prototype「儲存」；GAP-21-2 .xls 原件欄空值顯「—」非 file-x icon；
  GAP-03-1 前台狀態文案。
- ℹ️ 已知取捨（非 bug）：職位欄（上游無）、cycle codes（本輪 drop）、G-ADM-029 sub-line、18 gating。

### 待補驗（資料/權限受限）
- ⚠️ 05 實際 PDF 渲染：需一份含上傳 ICSOP_PDF 之已公告文件。
- ⚠️ 18 權限矩陣：需 SysAdmin session（本輪依決策略過）。
- ⚠️ 08 帳號 uploadedByName/次要室長+N、19 表單列渲染：需對應真實資料。

