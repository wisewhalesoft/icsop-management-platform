# F020: 文件浮水印（網頁疊加＋下載/列印燒錄）
Priority: P0-MVP | Status: 部分（unit 綠；快照/稽核/端點完成；**CJK 燒錄字型已補**（@pdf-lib/fontkit + Noto Sans TC 嵌入，asciiSafe '□'→'?' bug 修正，見 implementation-log/F036-impl.md）；**<3s 燒錄計時已補 int 迴歸測試**（`test/int/watermark-burn-timing.itest.ts`，TS-HD-WM-001/002 取代 TS-F020-028 佔位；暖機後 10 頁 CJK 燒錄本機實測 ≈250ms ≪ 3s NFR，門檻設 8000ms 迴歸警戒線）；真實中文 PDF 視覺/位元組驗證仍 [integration]） | Last Updated: 2026-07-24
Epic/Story: E06 / US-053, US-054

> 合併理由：網頁檢視器疊加（US-053）與下載/列印 PDF 燒錄（US-054）共用同一浮水印內容產生邏輯與稽核觸發，須格式完全一致。
> **🟢 2026-08-11 restrictive delta（APPROVED，人類閘門通過）**：「業務」子分類之一般使用者，其檢視器／PDF 代理／下載／列印之**授權檢查層**須加入「使用部門相符」判斷。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**。⚠ 本 delta 影響的是**授權檢查層**（是否允許執行），**不改變浮水印內容產生層**——[NFR-007](../nfr.md#watermark) 之字串格式、欄位取值規則、三處一致性要求**完全不變**。
> **🔴 2026-08-16 CHANGE delta（使用者裁決；缺失／變更 delta 第 5b 項 ＋ 同日第二次閘門之 `OQ-D18-25`）——前台下載燒錄範圍擴張至附錄與使用表單**：前台文件詳情頁下載之 **PDF 格式附錄**與 **PDF 格式使用表單**自本日起**必須燒錄浮水印**（分別推翻 [F039](F039-appendix-management.md#front-burn-delta) 與 `OQ-E05-03`／[F018](F018-usage-form-management.md#front-burn-delta) 之既有定案，權威改寫落於各該檔；本檔為燒錄能力側之宣告）；非 PDF 格式維持原檔並於 UI 明示（策略 A）。**本 delta 之 AC 編號採 `AC-D#`**（D＝2026-08-16 defect delta）。
> 🔴 **後台一律維持 RAW、不燒錄**——[F026](F026-role-field-matrix.md) 之 **OQ-FM-01 人類裁決（2026-07-24）於 2026-08-16 經再次確認為維持有效、不得推翻**；使用者已明確裁定「只做前台，後台維持 RAW」（缺失 delta 第 12／13／15 項**不做**）。前台/後台之分流以 **AC-D3** 之可觀測行為契約鎖定。
> 📌 **本 feature 自本日起明確為「跨路徑共用之燒錄能力」**，其消費者為：前台檢視器 VIEW／DOWNLOAD／PRINT（既有）、**前台文件詳情頁之附件下載**（ICSOP PDF・OJT，＝#5a，既有 AC 已涵蓋、屬 BUG-IMPL）、**前台文件詳情頁之附錄下載**（＝#5b，本 delta 新增）、**前台文件詳情頁之使用表單下載**（＝`OQ-D18-25`，同日第二次閘門新增；**其專屬端點 `GET /public/documents/:documentId/usage-forms/:formId/download` 由 [F018](F018-usage-form-management.md#front-burn-delta) `AC-D22` 定義**——⚠ 先前補記時曾假設沿用既有共用 route，該假設已於容器驗收證實不可行，見 `OQ-D18-33`）、[F036](F036-lifecycle-tree-preview.md) 樹狀圖下載/列印、[F038](F038-lifecycle-tree-change-history.md) 新舊樹狀圖下載。**不含任何後台路徑**。
> ✅ **前台燒錄範圍自此為一致之四路徑**（檢視器／附件／附錄／使用表單），**同一詳情頁上不再有「這個燒、那個不燒」之分歧**。

## Description
使用者於網頁檢視器開啟文件時疊加浮水印；下載/列印時於伺服器端將浮水印**燒錄**進 PDF 內容層。浮水印格式（權威，[NFR-007](../nfr.md#watermark)）：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`，由伺服器端當下動態產生；其中「僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現」為固定機密聲明字串（非變數）；於檢視器疊加與 PDF 燒錄呈現時，該機密聲明**另起一行**（獨立一行）顯示，惟線性稽核快照字串之欄位順序不變。三種操作（查看/下載/列印）皆觸發稽核（F023）。

## 浮水印欄位取值規則（契約 §8，定案 2026-07-20）

| 欄位 | 取值規則 |
|---|---|
| 員工編號 | 該登入帳號（`USERID`）對應之 `EMPNO`。一人多帳號時各帳號各自呈現其 `EMPNO`，屬預期行為 |
| 姓名 | `USERNM` |
| **公司名稱** | `VW_HRCOMF.COMPFULLNM` **全稱**（例：**和潤企業股份有限公司**，非簡稱「和潤企業」） |
| **部門** | 由使用者部門代碼推導之**部層**（`LEFT(CODE,2)+'000'`）之 `DESC_FULL`（如「營運管理部」）。**Fallback**：若無部層 → 取本部層 `DESC_FULL`；再無 → Root |
| **處/室** | 使用者所屬部門 `DESC_CHI` 之**最末段**（以 `/` 切分後取最後一段），即**最細單位**名稱 |
| 固定機密聲明 | 固定字串（非變數），呈現時另起一行 |
| 當下時間 | 伺服器端動態產生 |

### 「處/室」欄之單一規則（契約 §8.3）
上游組織實為 5 層（多出「課」層），浮水印格式僅有「部門」「處/室」兩欄。定案採**單一規則、無特例**：一律取使用者所屬之**最細單位**名稱。
- 處/室層使用者（實測 854 人，77%）→ 顯示室名（如「審查室」）
- 課層使用者（實測 166 人，15%）→ 顯示**課名**（如「醫療一課」），略過中間的處層（如「北區綜合處」）

取值來源為 `DESC_CHI` 而非 `DESC_FULL`：`DESC_FULL` 為串接全名（「營運管理部審查室」）無分隔符不可拆；`DESC_CHI` 以 `/` 明確分段（「營管部/審查室」→「審查室」）。

### 🔴 無下層者之分隔符收合（契約 §8.4）
掛於部層（84 人）、本部層（8 人）、Root（2 人）者，共 **94 人（8.4%）** 無處/室：

- **「處/室」欄留空，並自動收合分隔符**，呈現為
  `{員工編號}-{姓名}-{公司名稱}-{部門}-{固定機密聲明}-{當下時間}`
- **不得出現連續分隔符**（如 `…-營運管理部--僅供內部使用…`）。
- **檢視器疊加、PDF 燒錄、稽核快照三者必須套用同一收合規則**，確保 [NFR-007](../nfr.md#watermark) 之字串一致性不被破壞。

## Preconditions
- 使用者已登入（F001）；文件已有 ICSOP PDF（F016）；身分/部門/公司資料來自 F004 同步結果。

## Main Flow
1. 讀取當下登入身分與伺服器時間，依上述取值規則（含部層推導、`DESC_CHI` 最末段擷取、空欄收合）組裝浮水印快照；**該快照為檢視器疊加、PDF 燒錄、稽核紀錄之唯一共同來源**。
2. 網頁檢視（VIEW）：回傳疊加浮水印圖層之預覽，不提供「另存無浮水印原檔」途徑。
3. 下載/列印（DOWNLOAD/PRINT）：取原始 PDF → 伺服器端以 PDF 處理套件燒錄浮水印文字圖層 → 回傳檔案（浮水印內嵌內容層）。
4. 以同一份身分/時間快照寫入稽核（F023），操作類型明確區分 VIEW/DOWNLOAD/PRINT。

## Alternative Flows
- 列印與下載技術上可共用同一份已燒錄 PDF，但稽核仍須區分兩種操作類型。

## Edge Cases
- **使用者掛於部層／本部層／Root（無下層，實測 94 人／8.4%）**：「處/室」欄留空並收合分隔符，浮水印字串不得出現連續分隔符。
- **使用者掛於課層（實測 166 人／15%）**：「處/室」欄顯示課名（最細單位），略過中間處層。
- 使用者部門查無部層上層（實測 57 個處/室中有 1 筆查無）：依 fallback 取本部層 `DESC_FULL`；再無則取 Root。
- 使用者為孤兒帳號（`DEPTID` 於部門主檔查無）：「部門」與「處/室」皆留空並收合分隔符，不得顯示原始代碼或 `null`。
- 一人多帳號：以當次登入之 `USERID` 對應之 `EMPNO` 呈現，不同帳號浮水印之員工編號可能不同，屬預期行為。
- 同使用者相隔時間兩次開啟同文件：時間戳記不同（各自當下伺服器時間）。
- 未登入直接存取檢視器/下載網址：拒絕並導回登入頁。
- 開發工具移除浮水印 DOM：屬 NFR-007 已知限制，非本 feature 完全防禦範圍。
- 未授權角色直接呼叫下載 API：依 F025 拒絕。

## Postconditions
- 取得之檔案脫離系統後浮水印仍存在；稽核內容與浮水印一致。

## Acceptance Criteria
- Given 一般使用者開啟文件, When 檢視器載入, Then 疊加浮水印顯示員工編號/姓名/公司名稱/部門/處室/固定機密聲明/時間（伺服器端動態產生，格式見上）。
- Given 相隔時間兩次開啟同文件, When 各自產生浮水印, Then 時間戳記不同。
- Given 使用者下載文件, When 下載完成, Then PDF 內容層已燒錄浮水印（非僅前端疊加）。
- Given 使用者列印, When 產生列印用 PDF, Then 內容層同樣已燒錄浮水印。
- Given 查看/下載/列印各操作, When 完成, Then 各自記錄對應類型稽核，且與浮水印內容一致。
- Given 未登入使用者存取檢視器網址, When 請求, Then 拒絕並導回登入頁。
- Given 未授權角色呼叫下載 API, When 請求, Then 依 F025 拒絕。
- Given 使用者所屬公司為 AS, When 產生浮水印, Then 公司名稱顯示 `COMPFULLNM` 全稱「和潤企業股份有限公司」，非簡稱。
- Given 使用者部門代碼為 `JAC00`（處室層）, When 產生浮水印, Then 「部門」為部層 `JA000` 之 `DESC_FULL`（營運管理部）、「處/室」為 `DESC_CHI` 最末段（審查室）。
- Given 使用者部門代碼為 `BJAA0`（課層）, When 產生浮水印, Then 「處/室」顯示課名（醫療一課），不顯示中間處層名稱。
- Given 使用者掛於部層或本部層（無下層）, When 產生浮水印, Then 「處/室」欄留空且分隔符自動收合，浮水印字串中不存在連續分隔符。
- Given 同一無下層使用者同時執行查看/下載/列印, When 三者各自產生浮水印, Then 檢視器疊加、PDF 燒錄內容層、稽核快照三者之收合後字串完全一致（僅時間戳記依當下產生）。
- Given 使用者部門無對應部層, When 產生浮水印, Then 「部門」依 fallback 取本部層 `DESC_FULL`。

### 業務子分類授權檢查 delta（🟢 APPROVED 2026-08-11 人類閘門通過；規則權威＝[F041](F041-user-subtype-business-scope.md)）

> 前提選項均經 2026-08-11 人類裁決確認：**OQ-E08-06→C**（檢視器／下載列印本輪納入收斂）、**OQ-E06-04→A**（後端服務層權威）、**OQ-E08-10→A**（不記錄拒絕稽核）、**OQ-E06-03→A**（拒絕回 404）。
> 逐題裁決結果與未採選項之追溯見 [F041 §OQ 裁決紀錄](F041-user-subtype-business-scope.md#oq-dependency)。
> **本 delta 之作用點＝授權檢查層**（`WatermarkService` 之 `view`／`getOriginalPdf`／`download`／`print` 四個入口，
> 於取得原始 PDF **之前**），**非**浮水印內容產生層——既有 `buildWatermarkSnapshot` 純函式與其全部 AC 完全不動。

- **AC-U1**：Given 業務子分類之一般使用者（`roleCode='User'`、`userSubtype='business'`、`orgCode='JAC00'`）嘗試開啟一筆已公告但使用部門不相符（如 `usingDeptIds=['JAD00']`）之文件檢視器（`view`）或 PDF 代理（`getOriginalPdf`）, When 請求送出, Then 拒絕；**不組裝浮水印快照**（`buildSnapshot` 所依賴之組織查找 spy 呼叫次數為 0）、**不回傳文件編號／書名**、**不回傳任何 PDF 位元組**。〔[F041](F041-user-subtype-business-scope.md) AC-25〕
- **AC-U2**：Given 同上使用者嘗試 `download` 或 `print`, When 請求送出, Then 拒絕；`WatermarkPdfSource.getOriginalPdf` 之 spy **呼叫次數為 0**（不從 Blob 取回原始位元組）、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**（不產生任何燒錄浮水印之檔案位元組）。〔[F041](F041-user-subtype-business-scope.md) AC-26〕
- **AC-U3**：Given AC-U1／AC-U2 之拒絕路徑, When 檢視稽核, Then **未寫入任何 `VIEW`／`DOWNLOAD`／`PRINT` 成功事件**（調閱事實未發生），且 **`AuditWriter` 完全未被呼叫**（✅ OQ-E08-10 定案為選項 A＝不新增拒絕稽核事件）。**本 feature 因此完全不觸及稽核子系統**：`AUDIT_LOG` 不動、[F023](F023-audit-logging.md)／[F024](F024-access-history-query.md) 皆不需 AC delta。〔[F041](F041-user-subtype-business-scope.md) AC-27／AC-28〕
- **AC-U4**（**回歸鎖定**）：Given 業務子分類使用者存取**使用部門相符**之文件、或任一「其他」子分類／非 `'User'` 角色之使用者存取任一已公告文件, When 執行 `view`／`download`／`print`, Then 三者行為與本 delta 導入前**完全一致**——浮水印快照字串逐字相同（僅時間戳記依當下產生）、燒錄位元組正常產生、三類稽核各寫入一筆；既有 `watermark.service.spec.ts`／`watermark.spec.ts` 之全部案例維持綠燈，**不得修改任何既有期望值**。〔[F041](F041-user-subtype-business-scope.md) AC-29〕
- **AC-U5**（**後端權威**）：Given 測試**直接呼叫 `WatermarkService` 之四個方法**（繞過 controller 與前端）、viewer 為業務子分類且文件不相符, When 呼叫, Then 仍被拒絕——授權檢查位於**服務層**，前端不顯示連結僅為體驗優化、不構成防護（沿用 [F026](F026-role-field-matrix.md) Technical Notes 既有原則，OQ-E06-04 選項 A）。〔[F041](F041-user-subtype-business-scope.md) AC-30〕

### 前台下載燒錄範圍擴張 delta（🔴 2026-08-16 使用者裁決；缺失／變更 delta 第 5a／5b／6／7 項） {#front-burn-scope-delta}

> 前提裁決：**OQ-D18-01**→只做前台、後台維持 RAW（OQ-FM-01 維持有效）；**OQ-D18-02**→策略 A（僅 PDF 燒錄，非 PDF 維持原檔且 UI 明示）；**OQ-D18-03**→前台燒錄後**仍寫調閱稽核**（比照前台既有慣例，[F039](F039-appendix-management.md) AC-27／[F018](F018-usage-form-management.md) `AC-D14` 不變）；**OQ-D18-04**→analyst 建議之「讓共用端點具備燒錄能力」**已由 lead 推翻**，改採**前台/後台路徑分流**（分流之技術方案由 system-architect 決定，本檔僅鎖定可觀測行為）；**OQ-D18-25**（同日第二次閘門）→**前台使用表單之 PDF 亦燒錄**，推翻 `OQ-E05-03`。
> 📌 **本節之「前台附屬檔案」一詞，統指前台文件詳情頁上之三類檔案：附件（ICSOP PDF・OJT）、附錄、使用表單**——三者於燒錄與 UI 明示上規則完全一致，不再分歧。

#### 📌 加註（不新增 AC，指向既有 AC）

- **#5a 前台詳情頁「附件」下載繞過燒錄＝`BUG-IMPL`**：`prototypes/04-public-document-detail.html:105` 逐字「ICSOP PDF · **檢視/下載將燒錄浮水印**」，本檔既有 AC「**Given 使用者下載文件, When 下載完成, Then PDF 內容層已燒錄浮水印（非僅前端疊加）**」**已完整涵蓋**前台詳情頁之附件（ICSOP PDF／OJT）下載路徑。實作改走短效期 SAS 原檔 URL 而繞過燒錄，屬**缺陷**，**不新增 AC**——新增只會製造兩份權威。
- **#6 中文亂碼（PDF 燒錄之 CJK 字型缺失）＝`BUG-IMPL`**：使用者已確認外觀為「**中文全變 `?`**」（OQ-D18-24），根因＝`backend/Dockerfile` 未 COPY `assets/`（build 與 runtime 兩 stage 皆無），致 `loadCjkFontBytes()` 於容器內回 `null` 而退化為 `StandardFonts.Helvetica` → `asciiSafe`。**屬部署層缺陷，不新增 AC**；既有 AC「PDF 內容層已燒錄浮水印（格式權威同 [NFR-007](../nfr.md#watermark)）」即涵蓋「浮水印字串須與規格逐字相同」之要求。⚠ **單元測試恆綠（ts-jest 以 repo 根執行，`existsSync` 恆真），驗證必須在容器內實跑**。同一根因亦劣化 [F036](F036-lifecycle-tree-preview.md) 樹狀圖 PDF 與 [F038](F038-lifecycle-tree-change-history.md) 新舊樹狀圖 PDF。<br>📌 **`ICSOP_REQUIRE_CJK_FONT` 之值語意（2026-08-16 補訂，ringA 提報）**：該旗標採 **fail-safe 讀法**——**唯有值恰為字串 `'false'` 時方為關閉**；未設定、空字串、`'0'`、`'no'`、大小寫變體（`'False'`／`'FALSE'`）或任何其他值**一律視為開啟**（即要求 CJK 字型必須可載入，否則 fail-fast）。理由：本旗標之作用是**防止再次靜默退化為 `?` 亂碼**，其預設必須是嚴格側；「拼錯環境變數值就悄悄關掉保護」正是本 delta 第 6 項所修之同類錯誤。
- **#7 三層式浮水印與欄位不完整＝`BUG-IMPL`**：三層式（①身分資料列 ②固定機密聲明 ③時間戳）已於 `prototypes/05-public-viewer-watermark.html:110` 與本檔 Description「該機密聲明**另起一行**（獨立一行）顯示」明確定義，**不新增 AC**。欄位不完整（無姓名／員工編號）之處置依 **OQ-D18-14**：姓名為 [F003](F003-account-role-management.md) `AC-P` 必填，為空即屬資料/同步缺陷須修；**員工編號對手動帳號可能天然為空，維持 §8.4「留空並收合分隔符」規則、不以 `loginId` 頂替**（頂替會產生看似員工編號實則不是的值，反而傷害追溯可信度）。已存在正確參考實作（`LifecycleTreePreviewPage` 之 `watermarkLines()`），修法應**抽為共用函式供三處消費**（viewer／tree preview／change-history diff），而非再寫第三、第四份。

#### 新增 AC

- **AC-D1**（前台附屬檔案之 PDF 燒錄）：Given 一般使用者於**前台**文件詳情頁下載一份 `format = pdf` 之**附錄**或**使用表單**, When 下載完成, Then 回應之檔案位元組其 **PDF 內容層已燒錄浮水印**（非僅前端疊加），其浮水印字串、欄位順序、收合規則與機密聲明另起一行之呈現，與本 feature 之檢視器／下載路徑**完全一致**（格式權威同 [NFR-007](../nfr.md#watermark)）。<br>🔴 **本條推翻兩處既有定案**：① [F039](F039-appendix-management.md) AC-29「未疊加或燒錄浮水印（已定案）」、F039 §下載浮水印、F039 端點表（附錄側）；② `OQ-E05-03`「使用表單暫不燒錄浮水印」（使用表單側，`OQ-D18-25` 同日第二次閘門）。**推翻範圍嚴格限於前台路徑**。權威改寫分別落於 [F039 §front-burn-delta](F039-appendix-management.md#front-burn-delta) 與 [F018 §front-burn-delta](F018-usage-form-management.md#front-burn-delta)，本條為燒錄能力側之對應宣告。
- **AC-D2**（策略 A：非 PDF 不燒錄且 UI 明示）：Given 某**附件、附錄或使用表單**之格式**非 PDF**（`xlsx`／`xls`／`jpg`／`png`）, When 於**前台**文件詳情頁下載, Then 回應為**原始檔位元組、未經任何浮水印處理**（不轉檔、不失真）；且 When 渲染該檔案所在之清單列, Then 該列顯示逐字文案 **`此格式不支援浮水印`**（`queryByText('此格式不支援浮水印')` 於該列內可命中）；PDF 格式之列**不得**出現該文案。**三類檔案（附件／附錄／使用表單）適用同一規則、同一文案，不得分歧。**
- **AC-D3**（🔴 前台/後台分流之可觀測行為契約）：Given **同一份** PDF 檔案（同一 `blobPath`；可為 ICSOP PDF、OJT、**附錄**或**使用表單**）, When 由**前台**文件詳情頁下載, Then 取得**已燒錄浮水印**之位元組；When 由**後台**下載（ICSOP 文件管理清單「檔案」欄／後台唯讀詳情／編輯頁／**附錄管理頁**個別下載／**使用表單管理頁**個別下載）, Then 取得**原始檔（RAW）位元組、未燒錄浮水印**，且兩者之位元組**不相等**。<br>📌 **本條刻意只規範可觀測行為、不綁定端點實作方式**——前台/後台如何分流（獨立端點、端點參數、或呼叫端上下文判定）由 **system-architect** 決定。<br>⚠ **不得**採用「讓既有共用端點 `GET /documents/attachments/download` 一律具備燒錄能力」之作法：該端點之呼叫端**同時含後台三頁與前台詳情頁**，直接改造將使後台亦被燒錄，違反 OQ-FM-01。
- **AC-D3a**（🔴 **前台一律代理串流，非 PDF 亦然**——刻意之傳輸模式例外；2026-08-16 lead 裁定採 architect 方案）：Given 一般使用者於**前台**文件詳情頁下載**任一**附件／附錄／使用表單（**含 `xlsx`／`xls`／`jpg`／`png` 等非 PDF**）, When 請求送出, Then 回應之 body 為**由應用層代理回傳之檔案位元組本身**，**不得**為短效期 SAS URL、不得為 3xx 轉址至 Blob（`Content-Type` 為該檔之 MIME、`Content-Disposition: attachment`，回應 body 之位元組即 `AC-D2` 所斷言之原始檔位元組）。When 由**後台**下載同一檔案, Then 回應之 body **同為代理回傳之檔案位元組**（`Content-Type` 為該檔之 MIME、`Content-Disposition: attachment` 且檔名為**上傳時之原始檔名**），差別僅在**不燒錄浮水印、不寫調閱稽核**（`AC-D4`）。<br>🔴 **2026-08-17 修訂（使用者裁決；缺失修正第 5／6 項）**：本子句原文為「維持**既有 SAS 核發**（伺服器不經手位元組）」，該作法**已於線上失效**——前端 `window.open(sasUrl)` 是對 `*.blob.core.windows.net` 的 top-level 導覽，Chrome Safe Browsing 對該網域出示**「偵測到危險網站」紅底攔截頁**，使用者根本下載不到檔案。原措辭之兩條理由（稽核可靠性、燒錄分支一致性）**本就只對前台成立**，故後台側從未被它們保護；而「省頻寬／伺服器不經手位元組」的考量在此站不住：**全體員工走的前台早已代理同一批檔案**，僅四種後台角色使用的路徑改走代理，負載嚴格更低。<br>📌 **順帶關閉之第二個缺陷**：SAS 直連時瀏覽器只看得到 blobPath 末段，而該段是 `randomUUID()`（見 `buildAttachmentBlobPath`／`buildFormBlobPath`／`buildAppendixBlobPath`）⇒ 使用者存到的是 `<uuid>.pdf`，原始檔名整個丟失。代理串流以 `Content-Disposition` 帶回原始檔名（含中文，RFC 5987 編碼）。<br>📌 **涵蓋之四條後台端點**（全部改為代理串流，**無一例外**——留任何一條就是留一個仍會跳攔截頁的入口）：`GET /documents/attachments/download`、`GET /documents/:documentId/usage-forms/:formId/download`、`GET /admin/usage-forms/:formId/download`、`GET /admin/appendices/:appendixId/download`。<br>🔒 **`AC-D4` 之後台 RAW 硬邊界完全未動**：四條端點一律不呼叫 `burnIfPdf`、`burnPdf` spy 恆為 0、不寫任何調閱稽核——**本修訂只換傳輸方式，不碰內容與稽核**。<br>📌 **本條為 architecture-spec §5.2「非浮水印檔案走 SAS Token」之刻意例外**（自 2026-08-17 起適用於**前後台兩側**），日後**不得**以「與 §5.2 不一致」為由改回 SAS。兩項理由（缺一不可）：<br>① **稽核可靠性**：SAS 直連時實際下載發生於 Blob 端，應用層無從確知是否成功——前台之調閱稽核義務（`AC-D5`／[F039](F039-appendix-management.md) AC-27／[F018](F018-usage-form-management.md) `AC-D14`）會退化為「核發了 URL」而非「檔案確實被取得」，追溯鏈失真。<br>② **分支一致性**：一律代理，「PDF 燒錄／非 PDF 原檔」才能在**同一個處理器內**依同一份伺服器端事實（`format`／副檔名，見 architecture-spec §10.3）一致決定；混合模式（PDF 代理、非 PDF 走 SAS）會使該判定分裂於兩條傳輸路徑，日後白名單擴充時必然漂移。<br>⚠ **前端觸發方式（前後台皆適用）**：因回應為 binary stream，前端**不得**以 `window.open(url)` 或 `<a href>` 觸發（top-level navigation 送 `Accept: text/html` 會撞 SPA fallback，使用者將下載到副檔名為 `.pdf` 但內容是 app shell 的檔案——本專案 2026-07-25 瀏覽器煙霧測試已踩過同型 bug）；須以 `fetch` 取 Blob 後程式化觸發下載（`frontend/src/api/download-blob.ts` 之 `downloadViaBlob`）。實作細節見 architecture-spec §10.1。<br>📌 **兩個禁令、同一結論**：`window.open` 在**前台**會撞 SPA fallback（拿到 app shell），在**後台**（2026-08-17 修訂前）會撞 Safe Browsing 攔截頁；代理串流 ＋ `downloadViaBlob` 同時消滅兩者。
- **AC-D4**（🔒 後台 RAW 回歸鎖定；OQ-FM-01 維持有效）：Given 本 delta 實作完成, When 以任一角色（含 ICSOPAdmin／SysAdmin／Supervisor／DeptContact）自**任一後台畫面**下載 ICSOP PDF／OJT／**使用表單**／**附錄**, Then 一律取得**原始檔位元組**、`PdfBurner.burnPdf` 之 spy **呼叫次數為 0**、且**不寫入任何調閱稽核**；[F026](F026-role-field-matrix.md) 之後台 RAW 語意與 `field-matrix-test-design.md` 之「不具備燒錄能力」基準線**維持有效、不得反向重寫**。<br>⚠ **本條為本批兩次裁決之共同硬邊界**：前台燒錄範圍雖兩度擴大（附錄 → 使用表單），**後台側始終一格未動**。
- **AC-D5**（前台燒錄後仍寫稽核；OQ-D18-03）：Given AC-D1 之前台下載成功（含燒錄）, When 檢視稽核, Then 各該 feature 之既有稽核 AC **完全不變**——附錄側為 [F039](F039-appendix-management.md) AC-27（`targetType='APPENDIX'`／`actionType='DOWNLOAD'`／`appendixId`＋`documentId` 落列）、使用表單側為 [F018](F018-usage-form-management.md) `AC-D14`（`targetType='USAGE_FORM'`／`formId` 落列）；**燒錄與否不改變稽核義務**。非 PDF 之前台下載（AC-D2）**同樣寫入該筆稽核**。<br>📌 **`AUDIT_LOG.watermarkSnapshot` 之落值規則**：已燒錄（PDF）→ 落值且與該次浮水印逐字相同；未燒錄（非 PDF）→ `null`。見 [data-model AUDIT_LOG](../data-model.md#auditlog-entity)。
- **AC-D6**（🔴 **共用附件下載端點之閘門收斂**；2026-08-16 lead 裁定，關閉既有資安缺口 `OQ-D18-A1`）：Given 前台已改走專屬燒錄路徑（`AC-D3`）後，共用端點 `GET /documents/attachments/download` 僅剩後台三頁（ICSOP 文件管理清單／後台唯讀詳情／編輯頁）為呼叫端, When 以 `roleCode = 'User'` 之帳號（**`userSubtype` 為 `business` 或 `other` 皆然**）直接呼叫該端點（縱使持有合法且屬於某筆現存附件之 `blobPath`）, Then 一律回 **403 `PERMISSION_DENIED`**（路由層功能閘門），**不核發任何短效期 URL、不回傳任何位元組、不寫稽核**；Given 以 SysAdmin／ICSOPAdmin／Supervisor／DeptContact 呼叫, Then **維持既有行為**（允許，回 RAW 之短效期 URL）。<br>📌 **實作方式＝收斂該端點之功能閘門**：由 `下載列印文件` read（五角色皆可）改為 **`ICSOP 文件管理` read**——該功能列之矩陣值為 SysAdmin `READ`／ICSOPAdmin `CRUD`／Supervisor `READ`／DeptContact `READ`／**User `NONE`**，與 `AC-D4` 所列之後台四角色**逐格吻合**。**[F025](F025-role-function-matrix.md) 矩陣本身逐格不變**（僅端點改綁既有功能列，未新增列、未改任何格值）。<br>🔴 **本條所關閉之既有缺口（非本 delta 引入）**：`AttachmentsService.getDownloadUrl()` 現況**完全沒有 [F041](F041-user-subtype-business-scope.md) 可見性檢查**，僅驗「`blobPath` 屬於某筆現存附件」——業務子分類 `User` 一旦取得任一 `blobPath` 即可**繞過 F041 部門限制取得 RAW 原檔**（該端點不在 F041 原本收斂之四個接縫內）。<br>📌 **一般使用者之下載能力不因此受損**：前台之下載一律改走 `AC-D3` 之前台專屬路徑（該路徑內含 F041 可見性檢查與燒錄），[F026](F026-role-field-matrix.md) 矩陣「ICSOP PDF＝唯讀（可下載）」對 User **仍然成立**。<br>⚠ **被否決之替代方案**：「保留閘門、僅於該端點補一道 F041 檢查」——lead 裁定採收斂（前台已無呼叫端，收斂比再補一道檢查更徹底、且不需在後台路徑上維護一個永遠為真的判斷）。**兩者不得皆不做。**

- **AC-D7**（🔴 前台詳情頁三類清單之逐字文案與選擇器契約；**2026-08-16 補訂**，權威＝`prototypes/04-public-document-detail.html`）：Given 前台文件詳情頁渲染完成, When 檢視「附件」「使用表單」「附錄」三類清單, Then 下列**逐字成立**——
  - ① **每一列皆帶一個浮水印註記元素**（`data-wm-note` 屬性），其可見文字為**二擇一**：`format = pdf` → 逐字 `檢視/下載將燒錄浮水印`（**正向文案**）；非 PDF → 逐字 `此格式不支援浮水印`。**三類清單使用同一組文案，不得分歧**（`AC-D2` 之延伸）。
  - ② **`檢視/下載將燒錄浮水印` 為本檔既有文案之擴用**：原僅出現於附件區之 ICSOP PDF 列（`04:105`），本 delta 將其一致化沿用至附錄與使用表單之 PDF 列；**該字串一字未改**。
  - ③ **列選擇器**：附件列帶 `data-attachment-item`、使用表單列帶 `data-usage-form-item`、附錄列帶既有之附錄列掛鉤；`within(row).getByText(...)` 可據此定位到該列之 `data-wm-note`。
  - ④ **後台不得出現**：後台清單／唯讀詳情／編輯頁**一律不渲染** `data-wm-note` 與上述兩條文案（後台恆 RAW，顯示「將燒錄」或「不支援」皆為誤導）——`queryByText('檢視/下載將燒錄浮水印') === null` 與 `queryByText('此格式不支援浮水印') === null` 於後台三頁皆成立。
  
  📌 **本條之存在理由**：`AC-D2` 只規定了非 PDF 之負向文案，**未規定 PDF 之正向文案、亦未定義任何列選擇器**——test-generator 無從定位「該列」，也無從驗證 PDF 列之呈現。本輪約束環為簡化版（僅 jest/vitest、無 fidelity 測試）⇒ AC 是唯一防線。<br>📌 **旗標來源**：文案之選擇依伺服器端旗標（見 `AC-D2` 之註），**前端不得自行以 `format` 字串重算**。
- **AC-D8**（🔴 前台附件下載端點之權限閘門與可觀測契約；**2026-08-16 補訂**，test-generator ringC 提報 `G-L2-02`）：`architecture-spec.md` §10.1 為前台附件下載新增**兩個專屬端點**，其 handler 名稱與權限閘門原**未入任何 AC**，致約束環無從建立 route-metadata 斷言。端點形狀**以 §10.1 為準、不另立**：
  | 方法 | 路徑 | 權限閘門 | handler |
  |---|---|---|---|
  | GET | `/public/documents/:documentId/attachments/icsop-pdf/download` | 功能 `下載列印文件` **read** | `downloadIcsopPdf` |
  | GET | `/public/documents/:documentId/attachments/ojt/download` | 功能 `下載列印文件` **read** | `downloadOjt` |

  - ① **閘門值**：兩者皆為功能鍵 `下載列印文件`（`DOCUMENT_DOWNLOAD_PRINT`）之 **`'read'`**——**與既有前台下載路徑（`/public/documents/:id/download`）完全相同**，五種角色（含一般使用者）皆通過功能層。<br>⚠ **不得**誤用 `ICSOP_DOCUMENT_MANAGEMENT`（那是 `AC-D6` 所收斂之**後台**共用端點之閘門，其 User 為 `NONE`）——誤用會使一般使用者連前台附件都下載不到，直接架空 [F026](F026-role-field-matrix.md) 矩陣「ICSOP PDF／OJT＝唯讀（可下載）」。
  - ② **不接受客戶端傳入 `blobPath`**：伺服器自 `(documentId, type)` 反查儲存位置；請求中出現 `blobPath` 參數一律忽略（§10.1 之路徑分流前提——客戶端只能選擇呼叫哪個端點，不能指定取哪個位元組）。
  - ③ **[F041](F041-user-subtype-business-scope.md) 可見性檢查於服務層生效**：業務子分類使用者對使用部門不相符之文件呼叫此二端點, Then 回 **404 `DOCUMENT_NOT_FOUND`**（沿用 `AC-U1`／`AC-U2` 之既有語意），**不回傳任何位元組、不寫稽核**。
  - ④ **可觀測契約沿用既有 AC**：燒錄／非 PDF 原檔／UI 明示＝`AC-D1`／`AC-D2`；代理串流（不回 SAS URL、不 3xx）＝`AC-D3a`；稽核＝`AC-D5`。**本條只補齊「端點存在、handler 名稱、閘門值」三項 route-metadata**，不重複規範上述行為。
## Error Scenarios
- 未授權存取/未登入：見 [error-handling.md#public](../error-handling.md#public)、[#file](../error-handling.md#file)。防竄改與已知限制：[NFR-007](../nfr.md#watermark)。
- **業務子分類之使用部門不相符**（🟢 APPROVED）：一律回 **404 `DOCUMENT_NOT_FOUND`**（✅ OQ-E06-03 定案，既有錯誤碼、不新增），見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)；規則權威＝[F041](F041-user-subtype-business-scope.md)。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§5.3 `COMPFULLNM`、§8 浮水印欄位對應定案、§8.2 取值規則、§8.3 最細單位、§8.4 無下層者留空收合）
- Diagram: [../diagrams/F020-watermark-audit.mmd](../diagrams/F020-watermark-audit.mmd)
- Data: [DOCUMENT_ATTACHMENT](../data-model.md#attachment-entity), [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F016](F016-pdf-ojt-attachment.md), [F019](F019-public-list-browsing.md); Blocks: [F023](F023-audit-logging.md)
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（授權檢查層之使用部門判斷；🟢 APPROVED 2026-08-11 人類閘門通過）
- NFR: [浮水印一致性](../nfr.md#watermark), [檔案下載效能](../nfr.md#performance)
- OQ: OQ-NFR007a（視覺樣式）, OQ-NFR007b（時區/格式）
- **2026-08-16 使用者裁決**: OQ-D18-01（只做前台、後台維持 RAW）／OQ-D18-02（策略 A）／OQ-D18-03（前台燒錄後仍寫稽核）／OQ-D18-04（**analyst 建議已被 lead 推翻**，改採前台/後台分流）／OQ-D18-14（員工編號留空不頂替）／OQ-D18-24（亂碼根因＝Dockerfile 缺 `assets`）／**OQ-D18-25（同日第二次閘門：前台使用表單 PDF 亦燒錄，推翻 `OQ-E05-03`）**。見 [§前台下載燒錄範圍擴張 delta](#front-burn-scope-delta)。
- **前台附錄燒錄之權威**：[F039](F039-appendix-management.md#front-burn-delta)（其 AC-29 與端點表已就地改寫）
- **前台使用表單燒錄之權威**：[F018](F018-usage-form-management.md#front-burn-delta)（`AC-D11`～`AC-D14`；`OQ-E05-03` 已就地改寫為推翻）
- **待 system-architect（本 delta 新增）**：① **前台/後台下載路徑之分流設計**（現行 `GET /documents/attachments/download` 為前後台共用、核發 SAS 由前端直取 Blob，伺服器不經手位元組；燒錄要求位元組流經應用層 ⇒ 端點語意由「回傳 URL」變為「回傳串流」，僅前台側改變）；② 燒錄之延遲與 Blob 出向流量對 [NFR-001](../nfr.md#performance) 之影響；③ `watermarkLines()` 共用函式之落點（供 viewer／tree preview／change-history diff 三處消費）。
