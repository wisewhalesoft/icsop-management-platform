# F020: 文件浮水印（網頁疊加＋下載/列印燒錄）
Priority: P0-MVP | Status: 部分（unit 綠；快照/稽核/端點完成；**CJK 燒錄字型已補**（@pdf-lib/fontkit + Noto Sans TC 嵌入，asciiSafe '□'→'?' bug 修正，見 implementation-log/F036-impl.md）；**<3s 燒錄計時已補 int 迴歸測試**（`test/int/watermark-burn-timing.itest.ts`，TS-HD-WM-001/002 取代 TS-F020-028 佔位；暖機後 10 頁 CJK 燒錄本機實測 ≈250ms ≪ 3s NFR，門檻設 8000ms 迴歸警戒線）；真實中文 PDF 視覺/位元組驗證仍 [integration]） | Last Updated: 2026-07-24
Epic/Story: E06 / US-053, US-054

> 合併理由：網頁檢視器疊加（US-053）與下載/列印 PDF 燒錄（US-054）共用同一浮水印內容產生邏輯與稽核觸發，須格式完全一致。
> **🟢 2026-08-11 restrictive delta（APPROVED，人類閘門通過）**：「業務」子分類之一般使用者，其檢視器／PDF 代理／下載／列印之**授權檢查層**須加入「使用部門相符」判斷。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**。⚠ 本 delta 影響的是**授權檢查層**（是否允許執行），**不改變浮水印內容產生層**——[NFR-007](../nfr.md#watermark) 之字串格式、欄位取值規則、三處一致性要求**完全不變**。

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
