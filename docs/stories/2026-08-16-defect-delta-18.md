# 2026-08-16 缺失／變更 Delta（18 項）— 產品分析

> **性質**：既有系統之**變更/缺失修正 delta**，非新產品。本檔為 SDD 管線第一棒（product-analyst）產出。
> **權威邊界**：本檔**不修改**任何 `docs/specs/features/F###-*.md`、不修改任何 `prototypes/*.html`、不含測試/程式碼。
> 檔內「建議 AC 方向」一律為**非權威建議**，供 spec-writer 參考，不得逕行採用為 AC。
> **判定依據**：磁碟現況（`main`，commit `dcf635b`）＋ spec ＋ prototype 三方對照。`docs/specs/feature-status.md` 已知陳舊（記 F039 ⬜ 未開始，實際 `frontend/src/pages/AppendixManagementPage.tsx` 與 `backend/src/appendices/` 皆已存在），本檔一律以磁碟為準。

---

## 0. 型別定義

| 型別 | 定義 | 下游影響 |
|---|---|---|
| `BUG-IMPL` | 規格／prototype **已寫明**，實作沒做到 | **不需改規格**；test-generator 依**既有 AC** 建環，tdd-implementation 修 |
| `GAP-SPEC` | 規格／prototype **本身沒寫**（含明列為 OQ 未決者） | spec-writer **補 AC**；多數需 ui-ux-designer 補 prototype |
| `CHANGE` | 規格／prototype 寫的是**舊行為**，需被推翻 | spec-writer **改 AC** ＋ ui-ux-designer **改 prototype**；部分需**人類重新裁決** |

---

## 1. 逐項定位表

| # | 使用者原文（逐字） | 類型 | F### | Prototype | 受影響頁面／檔案 | 證據 |
|---|---|---|---|---|---|---|
| 1 | 後台：使用者從「後台首頁 / 儀表板」連結至其他畫面後，缺少可以回到首頁的按鈕或手段 | **GAP-SPEC** | F002（＋F025 是否新增矩陣列待裁） | `07-admin-shell.html` | `frontend/src/components/AppShell.tsx`、`frontend/src/domain/menu.ts`、`frontend/src/components/PageHeader.tsx`、`frontend/src/App.tsx:99` | `menu.ts:22–31` 十個選單項**無「首頁/儀表板」**；`AppShell.tsx:38–45` 側欄 logo 為 `<div>` 非連結；`PageHeader.tsx:37–42` 麵包屑各段為 `<span>`；prototype `07:49` 麵包屑亦為純文字 `<span>ICSOP 管理後台</span>…<span>首頁</span>`。`App.tsx:99` 有 `/admin` index → `DashboardHome`，但**無任何 UI 指向它**。⇒ 規格與 prototype 皆未定義返回首頁之手段 |
| 2 | 前台：document list 移除使用部門的篩選條件，並增加制定公司、制定部門、制定室別、當責室長，與循環別皆使用搜尋下拉的方式篩選 | **CHANGE** | F019（主）；漣漪 F041／F026／F017 | `03-public-list.html` | `frontend/src/pages/PublicListPage.tsx`、`backend/src/public/public-list.ts` | prototype `03` 桌面篩選列僅 3 個原生 `<select>`：`#fDept`（所有使用部門）／`#fStatus`／`#fCycle`；行動 sheet 同構（`fDeptM/fStatusM/fCycleM`）。F019 Main Flow 1 與 AC「同時選部門+狀態+循環」明訂三條件。實作 `PublicListPage.tsx:297,505` 為 `aria-label="使用部門篩選"` 之原生 select。⇒ 現行規格＋prototype＝「使用部門/狀態/循環」，需被推翻為五項可搜尋下拉。**後端 DTO 缺 `draftingCompanyId`／`draftingSectionId`／當責室長**（`public-list.ts:23–30` 僅有 `lifecycleId`／`usingDeptIds`／`draftingDeptId`／`contentSummary`） |
| 3 | 前台：document list 單一文件顯示欄位：程序書編號、程序書書名、內容摘要、文件狀態、制定公司、制定部門、制定室別、版次、公告日期。(移除使用部門及循環別) | **CHANGE** | F019 | `03-public-list.html` | `frontend/src/pages/PublicListPage.tsx:602–623`、`backend/src/public/public-list.ts` | prototype `03` `card()` 之 `<dl>` 現為：制定部門／公告日期／**使用部門**／**循環別**／內容摘要（＋標頭之編號、狀態徽章、書名）。F019 AC 明訂「每筆至少顯示編號/名稱/制定部門/**使用部門**/狀態/公告日期」。實作逐項對位（`PublicListPage.tsx:602,606,612,618,623`）。⇒ 移除 2 欄、新增 3 欄（制定公司／制定室別／版次），**且 F019 該條 AC 之「至少顯示使用部門」字面須被推翻** |
| 4 | 前台：document detail 移除文件使用部門的欄位 | **CHANGE** | F019（詳情）；漣漪 F041 AC-U6 | `04-public-document-detail.html` | `frontend/src/pages/PublicDocumentDetailPage.tsx:415` | prototype `04:201` 明列 `['文件使用部門', '<span…>營業二本部 / 營運管理部 / 審查室</span>…']` 並附註「（處/室層＋部層＋課層；選上層自動涵蓋其下所有單位）」。實作 `PublicDocumentDetailPage.tsx:415 <Field label="文件使用部門">`。⇒ prototype 刻意呈現該欄以示範層級語意，移除即為推翻 |
| 5 | 前台：document detail 附件/附錄的下載缺少浮水印 | **BUG-IMPL ＋ CHANGE（複合，須拆兩案）** | 5a：F020／F016／F026；5b：F039 | `04-public-document-detail.html` | `frontend/src/pages/PublicDocumentDetailPage.tsx:255`、`backend/src/attachments/attachments.controller.ts:87–94`、`backend/src/appendices/appendices.controller.ts:169` | **5a（附件＝ICSOP PDF／OJT）＝BUG-IMPL**：prototype `04:105` 逐字「ICSOP PDF · **檢視/下載將燒錄浮水印**」，F020 AC「Given 使用者下載文件…Then PDF 內容層已燒錄浮水印」。但實作 `PublicDocumentDetailPage.tsx:255` 呼叫 `downloadAttachment(att.blobPath)` → `GET /documents/attachments/download`（`attachments.controller.ts:87`，`getDownloadUrl` 核發**短效期 SAS 原檔 URL**），**完全繞過** `WatermarkService.download`（後者才是 `/public/documents/:id/download`＝`endpoints.ts:694`，僅 `PublicViewerPage` 使用）。⇒ 前台詳情頁之附件下載事實上是 RAW，與 prototype／F020 直接矛盾。**5b（附錄）＝CHANGE**：F039 AC-29 逐字「**未疊加或燒錄浮水印**（已定案）」、F039 §下載浮水印「本條為**已定案事項**，非開放問題」、prototype `04:252` 逐字「附錄不燒錄浮水印」。⇒ 推翻既有裁決 OQ-E05-03 |
| 6 | 前台：文件下載及列印時，中文字出現亂碼 | **BUG-IMPL**（根因已定位） | F020／F036／F038 | `05` `22` `23` | **`backend/Dockerfile`**、`backend/src/public/fonts/cjk-font.ts`、`backend/src/public/pdf-burner.ts` | 🔴 **根因**：`backend/Dockerfile` 之 build stage 僅 `COPY tsconfig*.json nest-cli.json ./` ＋ `COPY src ./src`（行 6–7），runtime stage 僅 `COPY --from=build /app/dist ./dist`（行 22）——**`backend/assets/` 從未進入 image**。`cjk-font.ts:19–26` 之候選路徑為 `<backend 根>/assets/fonts/NotoSansTC-Regular.ttf` 與 `process.cwd()/assets/...`，容器內兩者皆不存在 → `loadCjkFontBytes()` 回 `null` → `embedWatermarkFont` 退化 `StandardFonts.Helvetica`（`cjk-font.ts:75–77`）→ `pdf-burner.ts:39` 之 `render` 切為 `asciiSafe`，**所有中文變 `?`**。字型檔本體存在於 repo（`backend/assets/fonts/NotoSansTC-Regular.ttf`，7,090,820 bytes）。**單元測試永遠測不到**：ts-jest 以 repo 根執行，`existsSync` 恆真。⚠ 同一根因亦劣化 #17 與 F036 樹狀圖 PDF |
| 7 | 前台：文件檢視浮水印不符 prototype 與規格要求三層式，欄位也不完整(無姓名與員工編號) | **BUG-IMPL** | F020 | `05-public-viewer-watermark.html` | `frontend/src/pages/PublicViewerPage.tsx:226–235`、`backend/src/public/watermark.ts:54–65`、`backend/src/public/watermark.service.ts:99–101` | **三層式已於 prototype 明確定義**：`05:110` `…map(()=>\`<span>${WM_DATA}<br>${WM_NOTICE}<br>${WM_TIME}</span>\`)` ＝ 資料列／機密聲明／時間戳**三行**；`05:106` `WM_DATA = '22345-王小明-和潤企業股份有限公司-營運管理部-審查室'` **已含員工編號與姓名**。F020 Description 亦明訂機密聲明「另起一行」。**實作未做**：`PublicViewerPage.tsx:234` 直接渲染 `{watermark}`（後端回傳之**線性字串**，`watermark.ts:64` `ordered.filter(present).join('-')`，**不含任何 `\n`**），雖有 `whitespace-pre-line`（`:226`）亦無換行可斷 → 呈現為**一行**。對照組證明這是可做到的：`LifecycleTreePreviewPage.tsx:33–41` 已有 `watermarkLines()` 正確拆三行並於 `:369–371` 逐行 `<span style={{display:'block'}}>`。**欄位不完整**：`watermark.service.ts:99–100` `employeeNo: session.employeeNo ?? ''`／`name: session.name ?? ''`，空值經 `watermark.ts:46–48 present()` 過濾即**靜默消失**（§8.4 收合規則設計為處理「處/室」缺值，卻同時吞掉姓名/員工編號）→ 若登入帳號之 `ACCOUNT.name`／`ACCOUNT.employeeNo` 為 null（手動帳號常見），浮水印即缺此兩欄。**姓名為 F003 AC-P 必填**，故姓名為空必屬 bug；員工編號則需裁決（見 OQ-D18-14） |
| 8 | 後台：循環管理 > 樹狀圖檢視：增加快速點擊兩下時，顯示該節點文件清單的功能 | **GAP-SPEC** | F036（主）；資料源 F009／F017 | `22-lifecycle-tree-preview.html` | `frontend/src/pages/LifecycleTreePreviewPage.tsx:330`、後端需新增節點文件清單端點 | prototype `22:72` 逐字「點節點＝醒目標示其所有下游節點；點空白處取消」，`22:239` 節點僅綁 `onclick="onNodeClick(...)"`，**無 `dblclick`**。F036 AC 僅有「點擊任一節點 → 醒目標示…下游」與「不提供任何 DAG 編輯互動元件（純唯讀）」。實作 `LifecycleTreePreviewPage.tsx:330` 同構。⇒ 雙擊顯文件清單為**全新能力**，規格與 prototype 皆未定義 |
| 9 | 後台：ICSOP 文件管理：篩選條件依序為 - 制定公司、制定部門、制定室別、當責室長、狀態、程序書編號、程序書書名內、公告日期、連結點程序書、附錄、使用表單、OJT、循環別 | **CHANGE** | F017（主）；漣漪 F039／F018／F016 | `13-document-list.html` | `frontend/src/pages/DocumentListPage.tsx:53–61`、`backend/src/documents/document-list-query.ts` | prototype `13:110` 註解「**9 個可搜尋下拉篩選**」，`13:295–306` `FILTERS` 順序＝循環別／狀態／程序書編號／程序書書名／制定部門／制定室別／當責室長／制定公司／連結點程序書。F017 Description「提供 **9 個**可搜尋下拉篩選」、Main Flow 4 逐項列同 9 項、AC 亦逐字列 9 項。實作 `DocumentListPage.tsx:53–61` 逐項對位。⇒ 需 **9 → 13**（新增 公告日期／附錄／使用表單／OJT）**且順序全面重排** |
| 10 | 後台：ICSOP 文件管理：進入編輯頁後，未提供返回的按鈕。麵包屑應該要有作用。 | **GAP-SPEC** | F011（返回）；F002／橫切（麵包屑） | `15-document-edit.html`、`07-admin-shell.html` | `frontend/src/pages/DocumentEditPage.tsx:613`、`frontend/src/components/PageHeader.tsx:37–42` | prototype `15` **無任何返回鍵**（`grep 返回|arrow-left` 於 `15` 無命中；對照 prototype `22:48` 有 `<button onclick="goBack()" aria-label="返回循環池">`，證明其他頁有此慣例而編輯頁刻意/疏漏未有）。麵包屑：`PageHeader.tsx:40` 各段渲染為 `<span>{b}</span>`（**非 `<Link>`**），`DocumentEditPage.tsx:613 breadcrumb={['ICSOP 文件管理','編輯']}` 僅為 `string[]` 型別，**型別本身即不支援連結**；prototype `07:49` 亦為純文字。⇒ 兩半皆為規格/prototype 未定義 |
| 11 | 後台：ICSOP 文件管理 > 編輯頁：版次輸入方式不夠直覺(能輸入 1 / 2，但顯示兩位會讓使用者想輸入 01 / 02，但畫面無法反應) | **BUG-IMPL**（實作與 prototype 行為不一致） | F011（＋data-model 第 10 欄） | `15-document-edit.html` | `frontend/src/pages/DocumentEditPage.tsx:739`（對照組 `DocumentCreatePage.tsx:626–634`） | data-model `:296` 第 10 欄「版次 `edition` 兩段式字串 `{YY}'{NN}`（如 `26'01`）」。**prototype 正確**：`15:526–531` `onEditionChange()` 先把**輸入框元素值**設為未補零之原始數字（`nEl.value=…slice(0,2)`），**只有 `draft.edition`／預覽**才 `n.padStart(2,'0')` ⇒ 使用者打「0」→「01」全程可見。**實作錯誤**：`DocumentEditPage.tsx:739` 之受控 input 其 `value={editionParts[1]}`，而 `editionParts` 係由**已補零的** `draft.edition` 反解（`:608`），且 onChange 每次擊鍵即 `n.padStart(n?2:0,'0')` ⇒ 打「0」立即變成 `00`，再打「1」得 `'001'.slice(0,2)='00'`，**畫面卡死在 `00`**，與使用者描述「想輸入 01/02 但畫面無法反應」逐字吻合。**建立頁無此病**：`DocumentCreatePage.tsx:167` 以獨立 `edYear`／`edSeq` state 承接，`:618,627` onChange 不補零，僅 `:167` 預覽補零 |
| 12 | 後台：ICSOP 文件管理：清單頁的文件檔案下載無浮水印，應燒錄 | **CHANGE（推翻人類既有裁決 OQ-FM-01）** | F026（裁決所在）／F020／F016／F017 | `13-document-list.html` | `frontend/src/pages/DocumentListPage.tsx:137–161`、`backend/src/attachments/attachments.controller.ts:87` | 🔴 F026 Edge Cases `:56` 逐字：「**後台下載提供原始檔案**（管理存取，經短效期 SAS URL 核發，伺服器不經手位元組故不燒錄浮水印）…**浮水印燒錄與調閱稽核僅發生於前台檢視器路徑（F020）**…（**OQ-FM-01 人類裁決，2026-07-24：後台維持 RAW、不接線 PdfBurner**。）」`feature-status.md:64,145` 二度覆述為「審核閘門 3 決策」之一。實作忠實照做（`DocumentListPage.tsx:139 downloadAttachment(blobPath)`）。⇒ **實作無 bug；是既有人類裁決被本次需求推翻**，須人類重新裁決 |
| 13 | 後台：ICSOP 文件管理：內容頁的文件檔案下載無浮水印，應燒錄 | **CHANGE（同 #12，同一裁決）** | F026／F020／F016 | `16-document-readonly.html` | `frontend/src/pages/DocumentReadonlyPage.tsx:170–174` | 同 #12 之 OQ-FM-01。`DocumentReadonlyPage.tsx:170` 註解逐字「ICSOP PDF／OJT：走受控下載端點（blobPath）；浮水印與否由伺服器端依 F020 決定」，`:174 downloadAttachment(...)` 走同一 RAW 端點 |
| 14 | 後台：附錄管理：清單頁提供匯出清單的功能 | **GAP-SPEC** | F039 | `24-appendix-management.html` | `frontend/src/pages/AppendixManagementPage.tsx`、後端需新增匯出端點 | `grep -l 匯出 prototypes/*.html` **僅命中 `17-access-history.html`**；prototype `24` 無匯出。F039 Interface Contract（10 個端點）**無匯出端點**，AC-01～AC-34 亦無匯出條款。全站唯一既有匯出＝F024 調閱歷程（`AccessHistoryPage.tsx:179,219`，「已匯出查詢結果（CSV，草案格式）」） |
| 15 | 後台：附錄管理：清單頁檔案下載需燒錄浮水印 | **CHANGE（推翻 OQ-E05-03／OQ-FM-01）** | F039（主）／F026／F020 | `24-appendix-management.html` | `backend/src/appendices/appendices.controller.ts:93–99`、`frontend/src/api/endpoints.ts:817–821` | F039 Interface Contract `:199` 逐字：「`GET /admin/appendices/:appendixId/download`｜後台個別下載（核發短效期 URL；管理存取，**不寫稽核、不燒錄浮水印**，比照 F026 OQ-FM-01）」；F039 `:50–51`「附錄下載**不燒錄浮水印**…**本條為已定案事項，非開放問題**；規格中不得再以『未定案』措辭描述。**附錄多為 .xlsx，本無 PDF 浮水印可燒**」。`endpoints.ts:817` 註解逐字複述。⇒ 推翻裁決＋**直面非 PDF 格式之架構難題**（見 §2.4） |
| 16 | 後台：文件變更歷程：清單頁提供匯出清單的功能 | **GAP-SPEC**（規格已明列為未決 OQ-E07-06） | F037／F038 | `23-change-history.html` | `frontend/src/pages/ChangeHistoryPage.tsx`、後端需新增匯出端點 | F037 Alternative Flows `:28` 逐字「匯出查詢結果（比照 F024 之 CSV/Excel）：**是否納入本 feature 待確認，見 OQ-E07-06**」；F038 OQ 列亦引 OQ-E07-06（該 OQ 同時涵蓋「下載 PDF 排版」）。prototype `23` 無匯出鈕。⇒ 本次即為對 OQ-E07-06 之「是」裁決，但**範圍與格式仍未定** |
| 17 | 後台：文件變更歷程：新舊樹狀圖的浮水印不符 prototype 與規格要求三層式，欄位也不完整(無姓名與員工編號) | **BUG-IMPL** | F038（AC「比照 F020／NFR-007、機密聲明另起一行」） | `23-change-history.html`、格式權威 `05` | `frontend/src/pages/ChangeHistoryPage.tsx:851–860` | F038 AC 逐字要求下載 PDF「格式權威同 NFR-007、**機密聲明另起一行**、比照 F020」，Main Flow 4 要求預覽「整頁疊加浮水印」比照 F036 viewer 手法。**實作未做**：`ChangeHistoryPage.tsx:857–859` 之 `<span … style={{…whiteSpace:'nowrap'}}>{watermark}</span>` 直接渲染線性字串、且 `nowrap` **主動禁止換行**——`ChangeHistoryPage.tsx` 全檔**無 `watermarkLines` 等價函式**（對照 `LifecycleTreePreviewPage.tsx:34` 有）。欄位不完整之根因同 #7（`watermark.service.ts:99–100`）。下載 PDF 之中文亂碼另受 #6 影響 |
| 18 | 後台：使用表單管理：提供表單編號欄位供設定 | **GAP-SPEC**（含 schema 變更＋migration） | F018（主）；漣漪 data-model／F009 節點抽屜／#9 篩選 | `19-usage-form-management.html` | `backend/src/database/entities/usage-form-pool.entity.ts`、`backend/src/usage-forms/*.store.ts`、`frontend/src/pages/UsageFormManagementPage.tsx` | prototype `19:110–115` 表頭僅 6 欄：表單名稱／格式／大小／上傳者 · 上傳時間／關聯文件數／操作；`19:161–163` 上傳表單僅「表單名稱（必填）」。F018 Main Flow 1「清單顯示名稱/格式/大小/上傳者/關聯文件數」，全檔無「編號」。`usage-forms.store.ts:10,19` 之列型別僅 `name`。data-model `:370` 另記既有落差：`USAGE_FORM_POOL`／`DOC_USAGE_FORM` **尚未登錄於 data-model**（OQ-E10-05）⇒ 本項需先補登錄再加欄 |

### 型別統計

- **BUG-IMPL（4）**：#6、#7、#11、#17
- **BUG-IMPL ＋ CHANGE 複合（1）**：#5（5a 附件＝BUG-IMPL；5b 附錄＝CHANGE）
- **CHANGE（7）**：#2、#3、#4、#9、#12、#13、#15
- **GAP-SPEC（6）**：#1、#8、#10、#14、#16、#18

---

## 2. 漣漪與衝突

### 2.1 🔴 #12／#13／#15（＋#5b）確實推翻人類既有裁決 OQ-FM-01

**屬實。** 證據鏈三處互相引用、全部指向同一裁決：

- `docs/specs/features/F026-role-field-matrix.md:56` — 「後台維持 RAW、不接線 PdfBurner（OQ-FM-01 人類裁決，2026-07-24）」
- `docs/specs/feature-status.md:64` — 列為當日「**審核閘門 3 決策**」之一
- `docs/specs/feature-status.md:145` — F026 ✅ 之驗收敘述即以此為據
- `docs/specs/features/F039-appendix-management.md:51,199` — 附錄下載「比照 F026 OQ-FM-01」，並宣告「**本條為已定案事項，非開放問題**」
- `docs/specs/test-design/field-matrix-test-design.md:91,143,151` — 已存在一條**基準線測試**，其斷言重點逐字為「此服務**完全不具備燒錄能力**，作為 OQ-FM-01 裁決後之明確比對基準線」

**⇒ 推翻後之連鎖影響（必須一併處理，否則規格自相矛盾）：**

1. **F026 欄位矩陣本文**：矩陣 20 列之**格值不變**（唯讀/可寫維度未動），但 Edge Cases `:56` 整段須改寫，且 AC-05／AC-06／AC-07 三條「可下載」之語意須明確化為「可下載（燒錄）」或「可下載（RAW）」。F026 現行 AC-05 只對**前台**寫「允許並燒錄浮水印」，後台側無對應 AC ⇒ 推翻後須**新增**後台燒錄 AC。
2. **F020 適用範圍擴張**：F020 現行 Description 將燒錄綁定於「網頁檢視器 → 下載/列印」路徑，Preconditions 亦寫「文件已有 ICSOP PDF」。後台燒錄意味 `PdfBurner` 需被**第二組呼叫端**（`AttachmentsService`／`AppendicesService`）消費 ⇒ F020 須明確聲明其為**跨路徑共用能力**而非 viewer 專屬。
3. **F039 三處**：`:50–51` 定案段落、`:199` 端點表、AC-29（「未疊加或燒錄浮水印（已定案）」）三處全數反轉。
4. **既有測試須被推翻**：`field-matrix-test-design.md` 之「不具備燒錄能力」基準線案例將由**通過**變成**必須失敗**——這是 test-generator 建環時的陷阱，須在交棒時明示。
5. **稽核語意連鎖（未決）**：現行後台下載**刻意不寫稽核**（F039 `:199`、F026 `:56`「調閱稽核僅發生於前台檢視器路徑」）。若後台改為燒錄，「管理存取 vs 消費存取」之區分基礎即消失 ⇒ 是否同步開始寫稽核？見 **OQ-D18-03**。此題直接放大 `AUDIT_LOG` 資料量並改變 F024 查詢結果組成。
6. **傳輸架構改變**：現行 `getDownloadUrl` 核發 SAS URL、**伺服器不經手位元組**（正是「不燒錄」的技術理由）。燒錄必須讓位元組流經應用層 ⇒ 端點語意由「回傳 URL」變為「回傳檔案串流」，前端 `downloadAttachment` 之呼叫端（`DocumentListPage`／`DocumentReadonlyPage`／`DocumentEditPage`／`PublicDocumentDetailPage` 共 4 頁）全數受影響，且觸及 NFR-001 下載效能與 Blob 出向流量。

### 2.2 🔴 #2／#3／#4 移除「使用部門」與 F041／F019 之相依 —— **不顯示 ≠ 不判定**

**幾乎確定不等於。** 使用部門在本系統承擔**三個彼此獨立**的職責，本次需求只碰到其中一個：

| 職責 | 依據 | 本次是否受影響 |
|---|---|---|
| ① **可見性過濾**（業務子分類 deny-by-default） | F041（🟢 APPROVED 2026-08-11）、F019 `AC-U1`～`AC-U6`、`public-list.ts:166 isDocVisibleToViewer` | **絕對不可動**。動了＝資安退化：業務使用者將看見全公司文件 |
| ② **置頂排序**（子樹祖先鏈） | F019 Main Flow 2–3、`public-list.ts:78 isWithinSubtree` | **不應動**。惟 #3 移除顯示欄位後，使用者將**看不到為何某些文件被置頂**（置頂區標題「您部門相關文件」仍在，但依據欄位消失）⇒ 見 OQ-D18-05 |
| ③ **UI 顯示與篩選** | prototype `03` `#fDept`＋`card()` 之「使用部門」列；prototype `04:201` | **本次唯一應動者** |

**⇒ 必須在改寫 AC 時逐字寫明**：`isWithinSubtree`／`isDocVisibleToViewer`／`isUsingDeptMatched` 三個純函式**簽章與語意一律不變**（F041 INV-4、F026 `AC-U3` 判定式重用鎖定明文禁止因需求變動而修改），`DOC_USING_DEPT` 表不動、後端查詢仍以 `usingDeptIds` 過濾。移除的只是 **DTO 之對外欄位與前端渲染**。

**額外衝突**：F019 `AC-U7` 之 `SCOPE_NOTICE_BUSINESS` 逐字文案含「使用部門為您所屬部門（含其下所有單位）」——移除該欄位顯示後，此句所指之欄位在畫面上已不存在。文案是否調整＝人類裁決（OQ-D18-05）。**注意**：F019 `AC-U7` 標註「逐字權威＝`prototypes/03-public-list.html` 之具名常數」且「下游 test-generator 會逐字斷言」，擅改會打斷既有測試。

**再一項**：#2 移除「使用部門」篩選後，F041 `AC-16`／OQ-E08-07 4b 之裁決「業務子分類**不限縮**使用部門下拉之選項」將**失去載體**（下拉不存在了）。該 AC 需標記為「因篩選器移除而不再適用」，不可留下懸空 AC。

### 2.3 #7／#17「三層式浮水印」之現行定義 —— **已定義，故為 BUG-IMPL**

| 問題 | 答案 | 出處 |
|---|---|---|
| prototype 是否已定義三層？ | **是。** `05:110` 逐字 `<span>${WM_DATA}<br>${WM_NOTICE}<br>${WM_TIME}</span>` ＝ ①身分資料列 ②固定機密聲明 ③時間戳，三行 | `prototypes/05-public-viewer-watermark.html:110` |
| 欄位清單是否已含姓名／員工編號？ | **是。** `05:106` `WM_DATA = '22345-王小明-和潤企業股份有限公司-營運管理部-審查室'`；F020「浮水印欄位取值規則」表首兩列即員工編號（`EMPNO`）與姓名（`USERNM`） | `05:106`、`F020:15–16` |
| 規格是否要求另起一行？ | **是。** F020 Description 逐字「該機密聲明**另起一行**（獨立一行）顯示，惟線性稽核快照字串之欄位順序不變」；F036 AC、F038 AC 亦各自複述 | `F020:9`、`F036 AC`、`F038 AC` |

**⇒ #7 與 #17 皆為 `BUG-IMPL`，不需改規格**，test-generator 可直接依既有 AC 建環。**已存在正確參考實作**：`LifecycleTreePreviewPage.tsx:33–41 watermarkLines()`——修法應是**把它抽成共用函式**供三處消費（viewer／tree preview／change-history diff），而非再寫第三、第四份。

⚠ **但「欄位不完整」一半是資料問題，不是渲染問題**：`buildWatermarkSnapshot`（`watermark.ts:54–65`）之 `present()` 過濾原為服務 §8.4「無下層者處/室留空收合」而設，副作用是**任何**空欄位（含姓名、員工編號）都會被靜默吞掉而不留痕跡。需先確認測試帳號之 `ACCOUNT.name`／`ACCOUNT.employeeNo` 實際值（見 OQ-D18-14）。

### 2.4 🔴 #5b／#15 非 PDF 附件之燒錄 —— **本 delta 最大架構風險**

事實盤點：

- 附錄白名單＝ **`xlsx／xls／pdf`**（F039「本規格鎖定之命名」表，`FileCategory.APPENDIX`）；使用表單白名單＝ **excel／pdf**（F018）
- F039 `:51` 明文承認理由：「**附錄多為 .xlsx，本無 PDF 浮水印可燒**」；F026 `:56` 同理由：「使用表單常為 .xlsx，無 PDF 浮水印可燒」
- 現行 `PdfBurner`（`backend/src/public/pdf-burner.ts`）以 `pdf-lib` 操作 **PDF 內容層**，對 xlsx／xls **完全不適用**

**⇒ 四種可能策略，代價各異（本檔不選，列為 OQ-D18-02 供裁決）：**

| 策略 | 作法 | 代價 |
|---|---|---|
| A（建議預設） | **僅 PDF 燒錄**；非 PDF 維持原檔，UI 明示「此格式不支援浮水印」 | 需求未被 100% 滿足；但零新依賴、可立即交付 |
| B | 非 PDF **轉檔成 PDF** 後燒錄 | 需 LibreOffice/Gotenberg 等重量級依賴；xlsx 版面失真；離線環境部署成本高；違反「附錄可編輯下載」之潛在使用情境 |
| C | 寫入 **Office 原生浮水印**（xlsx 頁首/背景） | 需 `exceljs` 類套件；Excel 之「浮水印」實為頁首圖片，**畫面上看不到、僅列印可見**；防護力遠低於 PDF 燒錄，可能給予虛假安全感 |
| D | **禁止非 PDF 上傳為附錄** | 推翻 F039 白名單定案；使用者現有 .xlsx 附錄無法遷移 |

⚠ 另有一個**必須先答的前提問題**：使用者說「應燒錄」，是否理解「本系統之附錄有相當比例為 .xlsx」？此為需求前提之事實查核，建議連同策略選項一併回報。

### 2.5 #11 版次之資料型別與顯示規則

- **權威定義**：`data-model.md:296` 第 10 欄 —「版次 `edition`，基數 1，**兩段式字串 `{YY}'{NN}`**（年度＇序號，如 `26'01`）」、`:309` 記其由「人為版本號 `manualVersion`」改名而來。
- **型別＝字串，非數字**。故「顯示兩位」不是格式化問題，而是**輸入元件把已格式化的字串反餵給自己**（見 #1 逐項表之證據）。
- **既有 AC**：F011「Given 修改版次送出, When 儲存, Then 清單顯示新版次、UUID 不變」——**未規範輸入互動**。故若人類要的不只是修 bug、而是改變輸入語意（例如允許單位數 `26'1`、或改為兩個獨立數字欄位、或加上下箭頭 stepper），則本項會由 `BUG-IMPL` **升級為 `GAP-SPEC`**。見 OQ-D18-08。
- **一致性義務**：建立頁（`DocumentCreatePage`）目前**行為正確**。修編輯頁時務必使兩頁**收斂為同一元件**，否則下一輪又會漂移。

### 2.6 #18 表單編號之唯一性與既有列

- `USAGE_FORM_POOL` 現無任何編號欄（`usage-forms.store.ts:10,19` 僅 `name`）。⇒ **需 schema 變更＋migration**（本 delta 18 項中**唯一**需要 migration 者）。
- ⚠ **既有落差先償**：`data-model.md:370` 明記 `USAGE_FORM_POOL`／`DOC_USAGE_FORM`（F018 已實作）**尚未登錄於 data-model**（OQ-E10-05）。加欄前須先補登錄該實體，否則 data-model 會出現「只有新欄、沒有本體」的殘缺定義。
- **既有列的編號從何而來？** 無來源。系統從未收集過此資訊，上游亦無對應欄位。⇒ 既有列**只能為空**。故欄位必須 `nullable`（見 OQ-D18-15），否則 migration 無法執行。
- **漣漪**：若編號需唯一，`APPENDIX_POOL` 是否比照？（附錄與使用表單為刻意同構之雙生結構，F039 全篇以 F018 為樣板）——使用者**只提使用表單**，本檔**不擅自擴及附錄**，但列為 OQ-D18-16 供裁決，避免下一輪再來一次。
- **漣漪**：#9 新增之「使用表單」篩選下拉，其顯示字串是否改為「編號 名稱」？見 OQ-D18-16。

### 2.7 跨項次之檔案級衝突（供分線時避讓）

| 檔案 | 被幾項觸及 | 說明 |
|---|---|---|
| `frontend/src/components/PageHeader.tsx` | #1、#10 | 麵包屑可點擊之改動同源，**須由同一條線持有** |
| `frontend/src/pages/ChangeHistoryPage.tsx` | #16（清單工具列匯出）、#17（`DiffBoard` 浮水印） | 同檔不同區域，可拆但需序列合併 |
| `backend/src/public/watermark.service.ts` ／ `pdf-burner.ts` | #5、#6、#12、#13、#15、#17 | 燒錄能力之共同核心，**強烈建議單線持有** |
| `backend/src/attachments/attachments.controller.ts` | #5a、#12、#13 | 同一 RAW 端點，三項共修 |
| `docs/specs/features/F026-*.md` | #12、#13、#15 | 同一段落（`:56`）三項共改 |
| `frontend/src/pages/DocumentEditPage.tsx` | #10、#11 | 同檔不同區域 |

---

## 3. Open Questions（編號＋建議預設答案）

> 格式：**問題 → 建議預設（＋理由）**。人類只需回「照建議」或指定改動。
> 標 🔴 者為**必須人類裁決**，不裁決則後續必然做錯。

### 浮水印與燒錄

**🔴 OQ-D18-01（#5b／#12／#13／#15）｜確認推翻 OQ-FM-01？推翻範圍到哪？**
候選範圍：(a) 後台 ICSOP PDF (b) 後台 OJT (c) 後台/池 使用表單 (d) 後台/池 附錄 (e) 前台詳情之附件（＝#5a，此項本即 bug，不需裁決）。
**建議預設＝確認推翻，範圍涵蓋 (a)(b)(c)(d) 之全部 PDF 檔；非 PDF 依 OQ-D18-02 處理。**
理由：使用者連開 4 條（#5／#12／#13／#15）指向同一件事，訴求一致且明確；原裁決之理由（「管理存取 vs 消費存取」）在使用者心智中顯然不成立。但須如實回報代價：一條 2026-07-24 之審核閘門決策被反轉、`field-matrix-test-design.md` 之基準線測試需反向重寫、SAS 直連改為串流會增加應用層負載。

**🔴 OQ-D18-02（#5b／#15）｜非 PDF 附件（xlsx／xls）如何處理？**
**建議預設＝策略 A：僅 PDF 燒錄；非 PDF 維持原檔下載，並於 UI 該列明示「此格式不支援浮水印」。**
理由：B（轉檔）在離線/內網環境引入重量級依賴且版面必失真；C（Office 原生浮水印）畫面不可見、防護力虛假；D（禁止上傳）推翻既有白名單且無法遷移存量。A 可立即交付且不阻擋日後升級。**惟需向使用者確認其知悉「附錄多為 .xlsx」此一事實前提**。

**OQ-D18-03（#12／#13／#15）｜後台改為燒錄後，是否同步開始寫調閱稽核？**
**建議預設＝是，寫入稽核**（`targetType` 沿用既有對映 `DOCUMENT`／`USAGE_FORM`／`APPENDIX`，`actionType=DOWNLOAD`）。
理由：浮水印之價值在於「事後可追溯到人」，若燒錄了卻無稽核紀錄，追溯鏈斷在一半。且「不寫稽核」之原有理由與「不燒錄」是同一個（管理存取），一併反轉才自洽。**代價**：`AUDIT_LOG` 成長、F024 查詢結果將混入大量管理端下載，可能需要 F024 新增「來源＝前台/後台」之篩選維度（此為衍生 GAP，若採此預設請一併交給 spec-writer）。

**OQ-D18-04（#5a）｜前台詳情頁之附件下載，修法是改走既有 `/public/documents/:id/download`，還是讓 `/documents/attachments/download` 具備燒錄能力？**
**建議預設＝讓 `/documents/attachments/download` 具備燒錄能力（依 OQ-D18-01 之範圍統一處理）。**
理由：既有 `/public/documents/:id/download` 只認 ICSOP PDF（以 documentId 定位），無法承接 OJT／使用表單／附錄；且 #12／#13 本就要求後台同一端點燒錄，兩者合流可只做一次。

### 前台清單與詳情

**🔴 OQ-D18-05（#2／#3／#4）｜移除「使用部門」＝僅移除 UI 顯示與篩選，還是連權限判定一併移除？**
**建議預設＝僅移除 UI 顯示與篩選；F041 業務子分類可見性過濾與 F019 置頂排序之後端邏輯完全不變。**
理由：見 §2.2。若連判定一併移除，業務子分類使用者將可看見全公司文件——這是資安退化，且會直接推翻 2026-08-11 已通過人類閘門之 F041 全案。**若使用者實際意圖是後者，必須明確說「是」，本檔不代為推定。**

**OQ-D18-06（#2／#3）｜移除使用部門顯示後，「您部門相關文件」置頂區與 `SCOPE_NOTICE_BUSINESS` 文案是否調整？**
**建議預設＝置頂區塊與兩條 `SCOPE_NOTICE_*` 文案皆逐字不動。**
理由：置頂仍在運作，說明句解釋的是「可見範圍」而非「畫面上有哪個欄位」；且 F019 `AC-U7` 標明兩條常數為「逐字定稿之 UI 文案權威，修改前須經人類再裁決」，test-generator 會逐字斷言。動它＝額外打斷既有測試。

**OQ-D18-07（#2）｜五個「搜尋下拉」之選項來源＝當前結果集 distinct，還是全域主檔 distinct？需不需要新增後端端點？**
**建議預設＝全域 distinct、由後端新增單一端點一次回傳（如 `GET /public/documents/filter-options`），與後台 prototype `13` 之 combobox 語意一致。**
理由：以當前結果集推導會產生「篩了就選不回來」之死鏈；後台 13 已建立「選項與結果分離」慣例，前後台不宜分歧。**⚠ 資安檢核**：業務子分類使用者之選項清單**必須先經同一套 `isDocVisibleToViewer` 過濾**，否則下拉選項本身就洩漏他部門文件之存在（與 F019 `AC-U4` 之 `hiddenCount` 不洩漏原則同源）。**注意此處與 F041 `AC-16`（業務不限縮使用部門下拉）不矛盾**——那條講的正是即將被移除的使用部門下拉。

**OQ-D18-08（#2）｜「當責室長」篩選之比對對象＝僅主要室長，還是主要∪次要？**
**建議預設＝主要∪次要（命中任一即納入）**，與後台 F017 之「當責室長」篩選採同一語意。
理由：兩處語意分歧會讓同一份文件在前後台以不同條件被找到。**須先由 spec-writer 核對後台現況語意再定案**（本檔未逐行驗證 `document-list-query.ts` 之 chief 比對範圍）。

**OQ-D18-09（#3／#4）｜移除欄位後，後端 DTO 是否仍回傳 `usingDeptNames`？**
**建議預設＝對外 DTO 移除 `usingDeptNames`，`usingDeptIds` 亦不外洩；後端內部判定照常使用。**
理由：欄位既不顯示，回傳即為無用之資訊暴露面（尤其對業務子分類使用者）。**代價**：`PublicListPage.tsx:633–634` 之「使用部門逐段高亮」邏輯（G-PUB-016）將一併移除。

### 後台文件管理

**🔴 OQ-D18-10（#9）｜新增之「附錄／使用表單／OJT」三項篩選，語意為何？**
**建議預設＝「附錄」「使用表單」＝選具體某一份（可搜尋下拉，比照既有「連結點程序書」之同構作法）；「OJT」＝有／無二值下拉（`全部／有OJT／無OJT`）。**
理由：附錄與使用表單皆為 0..\* 多對多，選具體一份才有查找價值（「找出引用了 X 表單的所有程序書」）；OJT 為單檔 0..1（`DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'`），只有「有/無」有意義。**若使用者實際想要的是三者皆為「有/無」，則工作量與語意大不相同，必須先確認。**

**OQ-D18-11（#9）｜「公告日期」篩選＝單日等值／區間／年月？**
**建議預設＝區間（起～迄，兩端皆可留空）**，與 F024 調閱歷程之時間區間查詢一致。
理由：公告日期為連續值，等值查詢幾無實用性；沿用站內既有時間查詢慣例可重用元件。

**OQ-D18-12（#9）｜「程序書書名內」是否為模糊搜尋（contains）？**
**建議預設＝是。** 該格同時提供「可搜尋下拉選整筆＝等值」與「直接輸入未選取＝contains、大小寫不敏感、`%`／`_`／`'` 須跳脫」兩種行為，與 F019 既有跳脫要求一致。
理由：使用者原文特意寫「程序書書名**內**」，「內」字強烈暗示子字串比對；且既有 9 項篩選中「程序書書名」原為純下拉，此字為刻意加註。**若確認為 contains，這是對 F017 既有篩選語意的擴充，spec-writer 須明寫。**

**OQ-D18-13（#9）｜13 個篩選是否仍全部一列排開？行動裝置如何收納？**
**建議預設＝桌面採多列 grid 自動換行，行動裝置沿用 prototype `03` 之底部 sheet 模式；並提供「清除全部篩選」。**
理由：9 → 13 後單列必然溢出。此題屬版面，最終由 ui-ux-designer 決定，此處僅標記其存在。

**OQ-D18-14（#7／#17）｜浮水印缺姓名/員工編號之根因確認，以及「手動帳號無員工編號」時之期望呈現。**
**建議預設＝(1) 先確認測試帳號之 `ACCOUNT.name`／`ACCOUNT.employeeNo` 實際值；(2) 姓名為 F003 必填，若為空即屬資料/同步 bug，須修；(3) 員工編號對手動帳號可能天然為空，維持 §8.4「留空並收合分隔符」規則，不以 `loginId` 頂替。**
理由：以 `loginId` 頂替會讓浮水印上出現一個看似員工編號、實則不是的值，反而傷害追溯可信度。**但若使用者要求手動帳號也必須可追溯，則需改為 F003 建立帳號時強制填員工編號——那是另一項需求，不在本 delta。**

**OQ-D18-15（#11）｜版次之期望輸入/顯示語義？**
**建議預設＝輸入框「不即時補零」（打什麼顯示什麼），**失焦（blur）時**自動補零至兩位，儲存值恆為 `{YY}'{NN}`；建立頁與編輯頁收斂為同一元件。
理由：即時補零正是造成「畫面無法反應」的成因；blur 補零兼顧「不干擾輸入」與「顯示/儲存恆為兩位」。**若使用者其實接受單位數（存 `26'1`），則須改 data-model 之格式定義，代價較大，不建議。**

### 匯出

**OQ-D18-16（#14／#16）｜匯出格式與範圍？**
**建議預設＝CSV（UTF-8 **with BOM**，否則 Excel 開啟中文亂碼）；範圍＝當前篩選條件之**全部結果（非僅當前頁）**；上限 10,000 筆（超出則回錯誤並提示縮小條件）；欄位＝畫面所見欄位；檔名含匯出時間戳。與 F024 既有匯出（`AccessHistoryPage.tsx:179`，現標註「草案格式」）**同構**。**
理由：站內已有一份匯出（F024），三處各自為政會產生三種格式。**附帶收益**：本題正好可順手把 F024 那份「草案格式」一併定稿。**⚠ 與 #6 相關**：BOM 缺失是 CSV 中文亂碼的經典成因，與 #6 之 PDF 字型亂碼是**兩件不同的事**，不要混為一談。

**OQ-D18-17（#16）｜文件變更歷程兩個 tab（ICSOP 程序書／循環樹狀圖）＝各自匯出，還是合併成一份？**
**建議預設＝各自匯出**（兩者欄位結構完全不同：前者是欄位層 old/new，後者是 DAG 結構事件）。
理由：合併必然產生大量空欄。此題同時構成對 **OQ-E07-06** 之部分裁決，spec-writer 應將 OQ-E07-06 由「未決」改為「已定案（匯出＝是，排版另計）」。

### 樹狀圖與導覽

**OQ-D18-18（#8）｜雙擊節點顯示文件清單之呈現方式與欄位？**
**建議預設＝唯讀側抽屜（right drawer），比照 F009 節點抽屜之版面但**移除全部寫入元件**；欄位＝程序書編號／程序書書名／版次／狀態／公告日期；點擊某列可另開後台唯讀詳情（`/admin/documents/:id`）；單擊之「標示下游」行為完全保留。**
理由：F036 AC 明訂「不提供任何編輯互動元件（純唯讀）」，抽屜必須是 F009 的唯讀孿生而非復用其可寫版本。側抽屜不遮擋樹狀圖，優於 modal。**⚠ 權限落差**：F036 之可視角色含 **Supervisor**（全公司唯讀），但 F009 節點抽屜為 ICSOPAdmin 寫入路徑——新抽屜之資料來源端點須沿用 **F036「循環管理 read」** 之權限閘門，不可誤用 F009 的。

**OQ-D18-19（#8）｜是否也要在 F038 之新舊樹狀圖 diff 預覽支援雙擊？**
**建議預設＝否。** 歷史快照中的「該節點文件清單」語意不明（是當時的還是現在的？），且會擴大 #8 的規模。
理由：使用者只提「循環管理 > 樹狀圖檢視」。

**OQ-D18-20（#1）｜回到後台首頁之手段，採哪一種（可複選）？**
**建議預設＝三者皆做：(a) 側欄最上方新增「首頁」項（icon `layout-dashboard`，route `/admin`）(b) 側欄 logo 區可點擊回 `/admin` (c) 麵包屑首段「ICSOP 管理後台」可點擊回 `/admin`。**
**且建議＝「首頁」不新增 F025 功能矩陣列**（它不是受控功能，凡能進後台者皆應可回首頁）。
理由：(a) 最顯眼、(b)(c) 是使用者的肌肉記憶。若新增矩陣列，等於要為五種角色各定義一次「首頁權限」，徒增複雜度而無收益。**惟此點與「側欄僅顯示該角色有權限之功能（F002 步驟 4）」之既有規則有張力，須明寫例外。**

**OQ-D18-21（#10）｜麵包屑「有作用」的具體定義？**
**建議預設＝最後一段（當前頁）為純文字不可點，其餘各段可點；`PageHeader` 之 `breadcrumb` 型別由 `string[]` 改為 `{label, to?}[]`（`to` 缺省即不可點）。編輯頁另於 topbar 動作區新增「返回」鈕（回 `/admin/documents`），比照 prototype `22:48` 之既有慣例。**
理由：最後一段可點＝點了停在原地，是常見的無作用設計。型別改動會波及**全部**使用 `PageHeader` 的頁面（約 14 頁），須整批處理，這也是本項應與 #1 同線的原因。

### 使用表單編號

**OQ-D18-22（#18）｜表單編號是否唯一？是否必填？既有列如何處理？**
**建議預設＝(1) 唯一（比對前 trim、不分大小寫）；(2) **可空**（`nullable`）；(3) 既有列一律留空，由管理員日後自行補；(4) 不自動產生編號。**
理由：既有 `USAGE_FORM_POOL` 之列**無任何編號來源**，設為 `NOT NULL` 會使 migration 無法執行（除非塞入無意義的假值，那更糟）。「唯一但可空」在 MSSQL 需以 **filtered unique index**（`WHERE formNumber IS NOT NULL`）實作，否則多筆 NULL 會互相衝突。

**OQ-D18-23（#18）｜是否比照為附錄（`APPENDIX_POOL`）也加編號？表單編號是否進入 #9 之篩選顯示？**
**建議預設＝(1) **不**主動擴及附錄（使用者只提使用表單，本檔不擴大範圍）；(2) #9 之「使用表單」下拉顯示字串改為 `{編號} {名稱}`（無編號者僅顯示名稱），選項值仍為 `formId`。**
理由：附錄與使用表單是刻意同構的雙生結構，日後若要求一致會再來一輪——此點**已如實標記**，由人類決定是否現在一起做。

### 重現與驗證

**OQ-D18-24（#6）｜亂碼之確切重現路徑，以及是否確認即為 Dockerfile 缺 `assets` 之根因？**
**建議預設＝以「`backend/Dockerfile` 未 COPY `assets/`」為主因先修（證據見 §1 #6），並請使用者確認亂碼之**外觀**：**
- 若中文全變成 **`?`** → 即為此根因，修 Dockerfile 即可（`COPY assets ./assets` 需同時加到 build 與 runtime stage，或直接加在 runtime stage）
- 若為 **`åæ½¤èæ¥­`** 類的歐文亂碼 → 屬編碼層問題，另有成因（`multipart.ts:22` 已修過同類 bug，但**檔名層**與**PDF 內容層**是兩條路徑）
- 若為 **豆腐方框 `□`** → 字型有載入但缺字，屬字型子集化問題

理由：`?` 與其他兩種外觀對應完全不同的修法，先問清楚可省一輪。**另請確認是「下載」「列印」皆有，還是僅其一**——若僅列印，則問題在瀏覽器列印路徑而非 server 燒錄。

---

## 4. 建議的實作分線（disjoint lanes）

> 依「檔案不重疊 ∧ 阻塞關係最少」切分。**Lane 0 應先單獨落地**（它是驗證其他所有浮水印工作的前提）。

| Lane | 項次 | 主要檔案 | 阻塞於 | 型別組成 | 備註 |
|---|---|---|---|---|---|
| **0 · CJK 字型部署 hotfix** | #6 | `backend/Dockerfile`（＋ compose 驗證） | 無（OQ-D18-24 僅為確認） | BUG-IMPL | **單檔改動、可立即出**。⚠ 必須在**容器內**實跑驗證（單元測試恆綠，證明不了任何事——同 `project-icsop-migration-deploy` 之既有教訓）。Lane 1／4 之驗收皆依賴本線先完成 |
| **1 · 浮水印燒錄** | #5、#12、#13、#15、#7、#17 | `backend/src/public/{watermark.service,pdf-burner,watermark}.ts`、`backend/src/attachments/attachments.{controller,service}.ts`、`backend/src/appendices/`、`backend/src/usage-forms/`、`frontend/src/pages/{PublicViewerPage,ChangeHistoryPage,PublicDocumentDetailPage,DocumentListPage,DocumentReadonlyPage}.tsx`、`docs/specs/features/{F020,F026,F039}` | 🔴 **OQ-D18-01／02／03／04** | CHANGE×4 ＋ BUG-IMPL×2 | **本 delta 最大、風險最高的一線，不可與他線共修**。#7／#17 之修法應**抽出共用 `watermarkLines()`**（現有正確版在 `LifecycleTreePreviewPage.tsx:34`）供三處消費 |
| **2 · 前台清單與詳情** | #2、#3、#4 | `frontend/src/pages/{PublicListPage,PublicDocumentDetailPage}.tsx`、`backend/src/public/{public-list,public-document-detail}.ts`＋store、`prototypes/{03,04}.html`、`docs/specs/features/F019` | 🔴 **OQ-D18-05**；OQ-D18-06/07/08/09 | CHANGE×3 | **與 Lane 1 在 `PublicDocumentDetailPage.tsx` 有檔案重疊**（Lane 1 改下載按鈕行為、Lane 2 改欄位列）⇒ 建議 Lane 2 後於 Lane 1 合併，或明確劃分區域。**F041 回歸測試必須全綠**是本線的硬閘門 |
| **3 · 後台文件管理篩選與編輯** | #9、#11 | `frontend/src/pages/{DocumentListPage,DocumentEditPage,DocumentCreatePage}.tsx`、`backend/src/documents/document-list-query.ts`、`prototypes/{13,15}.html`、`docs/specs/features/{F017,F011}` | OQ-D18-10／11／12／13／15 | CHANGE×1 ＋ BUG-IMPL×1 | #11 之修法須讓建立/編輯兩頁**收斂為同一元件**（現在只有編輯頁壞） |
| **4 · 導覽外殼** | #1、#10 | `frontend/src/components/{AppShell,PageHeader}.tsx`、`frontend/src/domain/menu.ts`、`prototypes/07.html`（＋各頁 `breadcrumb` prop 呼叫端）、`docs/specs/features/F002` | OQ-D18-20／21 | GAP-SPEC×2 | **`PageHeader` 之 `breadcrumb` 型別改動會觸及約 14 個呼叫端**（含 Lane 3 之 `DocumentEditPage`）⇒ 本線應**最先完成型別改動並合併**，其餘線再 rebase，否則四線同時改同一個 prop 必衝突 |
| **5 · 匯出** | #14、#16 | `frontend/src/pages/{AppendixManagementPage,ChangeHistoryPage}.tsx`、後端新增匯出端點、`prototypes/{24,23}.html`、`docs/specs/features/{F039,F037,F038}`（＋順手定稿 F024 匯出格式） | OQ-D18-16／17 | GAP-SPEC×2 | **與 Lane 1 在 `ChangeHistoryPage.tsx` 重疊**（Lane 5 改清單工具列、Lane 1 改 `DiffBoard` 浮水印）⇒ 不同區域，可並行但需序列合併。三處匯出（含 F024）宜共用同一 CSV 產生器 |
| **6 · 樹狀圖節點文件清單** | #8 | `frontend/src/pages/LifecycleTreePreviewPage.tsx`、後端新增節點文件清單端點、`prototypes/22.html`、`docs/specs/features/F036` | OQ-D18-18／19 | GAP-SPEC×1 | **完全 disjoint**，可最早獨立啟動 |
| **7 · 使用表單編號** | #18 | `backend/src/database/entities/usage-form-pool.entity.ts`＋**migration**、`backend/src/usage-forms/*`、`frontend/src/pages/UsageFormManagementPage.tsx`、`prototypes/19.html`、`docs/specs/{data-model,features/F018}` | OQ-D18-22／23 | GAP-SPEC×1 | **本 delta 唯一需 migration 者**。⚠ 依 `project-icsop-migration-deploy`：寫完 migration **必須對真 SOP DB 實跑**，單元測試全綠證明不了資料表/欄位存在。另須先補登錄 `USAGE_FORM_POOL` 至 data-model（償還 OQ-E10-05） |

### 分線注意事項

1. **合併順序建議**：Lane 0 → Lane 4（型別地基）→ Lane 6／7（disjoint，可任意插入）→ Lane 3 → Lane 2 → Lane 5 → Lane 1（最大、最後）。
2. **共用資源序列化**：依 `project-icsop-worktree-parallel` 之既有硬限制，各線共用同一套 SOP DB 與埠 ⇒ **單元測試可並行、DB 整合測試必須序列化**。
3. **交付前之強制檢核**：Lane 1 涉及部署層（字型）、Lane 7 涉及 migration，兩者**皆須容器內實跑驗證**。依 `project-icsop-feature-tracker` 之既有教訓，本專案歷次「只有真瀏覽器/真容器才會踩」的 bug 佔比極高（代理白名單、SPA bypass、MSSQL 時區、`--force-recreate`），**建議本 delta 收尾時再做一次 Chrome MCP 瀏覽器煙霧測試**。

---

## 5. 交棒給下一棒（spec-writer）之明確提醒

1. **不要為 `BUG-IMPL` 四項（#6／#7／#11／#17）新增 AC**——它們的 AC 已存在且正確，新增只會製造兩份權威。若要動，僅可**加註**指向現有 AC。
2. **#5 必須拆成兩案處理**（5a BUG-IMPL、5b CHANGE），合併處理會讓 5a 這個純 bug 被 5b 的人類裁決卡住。
3. **推翻既有裁決時須留下追溯**：OQ-FM-01（2026-07-24）與 OQ-E05-03 之反轉，應比照本專案既有慣例（見 F038 `AC-S2` 之「2026-08-08 使用者裁決 5 改寫」寫法），在原條文處**就地改寫並標註推翻日期與理由**，不可靜默刪除。
4. **`field-matrix-test-design.md:91,143,151` 之「不具備燒錄能力」基準線測試將反向**——請在交給 test-generator 時明示，否則它會依舊測試建出錯誤的環。
5. **F041 相關 AC 之處置**：`F041 AC-16`／`F019 AC-U3` 中關於「使用部門下拉不限縮」之條款，因下拉本身被移除而失去載體，須標記為「不再適用」而非留下懸空 AC。
