---
type: test-design-feature
covers: [F026]
priority: P0-MVP
related_spec:
  - docs/specs/features/F026-role-field-matrix.md
  - docs/specs/features/F020-watermark.md#backend-burn-delta
worktree: field-matrix (feature/field-matrix)
last_updated: 2026-08-20
status: draft
---

> 🔴🔴 **D9 delta（2026-08-20，`OQ-D9-08` 選項 B）——本檔 §0.2／§1／§1.3／§3／§9／§10 之「後台不燒錄
> （OQ-FM-01）」基準線已就地反向重寫，比照 `AC-F17` 之既有處置慣例，逐節保留原文供追溯、不得刪除。**
> `OQ-FM-01`（2026-07-24）與其 2026-08-16 之再次確認（`OQ-D18-01`）**已於本輪全面失效**——後台
> 文件本體、附件（ICSOP PDF／OJT）、附錄、使用表單之全部下載端點自本輪起**一律燒錄浮水印**，
> 無例外角色（含 ICSOPAdmin），且一律寫入調閱稽核。**原「TS-FM-001／TS-FM-002 描述現況特徵、待
> OQ-FM-01 裁決」之定位已終結——OQ-FM-01 已裁決，且裁決結果與本檔原載之現況相反。**
> 實際執行之測試已就地反向重寫於 `backend/src/attachments/attachments.service.spec.ts`
> （「D9 delta — 後台受控下載改為一律燒錄＋寫稽核」describe，取代原 TS-FM-001）與
> `backend/src/usage-forms/usage-forms.front-burn.service.spec.ts`（「D9 delta — 後台受控下載
> 改為一律燒錄＋寫稽核」describe，取代原 TS-FM-002；`usage-forms.service.spec.ts` 之 bare-svc
> 半段僅保留「非 PDF 仍為原始位元組」之 RAW 格式驅動半段，該半段本身不受 D9 影響）。

# field-matrix 測試設計：F026 AC5-9（附件／浮水印／使用部門子樹）欄位權限判定

> ID 命名慣例：本文件新設計案例一律以 `TS-FM-` 開頭（FM = field-matrix），與既有
> `backend/src/attachments/attachments.service.spec.ts`（`TS-0XX`/`TS-A-0XX`）、
> `backend/src/usage-forms/usage-forms.service.spec.ts`（`TS-0XX`/`TS-PS-F018-*`）、
> `backend/src/org-sync/org-hierarchy.spec.ts`（`TS-PS-ORG-*`）之編號**不重疊、不覆寫**，
> 僅以交叉引用註記既有覆蓋，避免重工。

## 0. 範圍聲明

### 0.1 任務目標
關閉 `docs/specs/feature-status.md` F026 列所載缺口：「AC5-9 之附件/浮水印欄位權限判定未實作」。
依 launching 指示，`docs/specs/features/F026-role-field-matrix.md` 之 `## Acceptance Criteria` 清單
（9 條，逐條依文件內出現順序編號 AC1~AC9，spec 原文無顯式編號，此編號為本文件與 launching prompt
之共同約定）第 5~9 條逐字如下：

| # | 逐字原文 |
|---|---|
| AC5 | Given 一般使用者前台下載 ICSOP PDF, When 下載, Then 允許並燒錄浮水印，但無法存取後台編輯介面。 |
| AC6 | Given 主管下載使用表單, When 下載, Then 允許；同角色嘗試上傳/取代該附件則被拒。 |
| AC7 | Given ICSOP 管理員編輯「文件使用部門」, When 開啟選單, Then 可選擇本部／部／處室／課任一層級之單位並儲存成功。 |
| AC8 | Given 文件使用部門設為部層 `JA000`、使用者所屬部門為 `JAC00`, When 判定使用部門相符性, Then 判定為相符（子樹自動展開）。 |
| AC9 | Given 文件使用部門設為處室層 `JAC00`、使用者所屬部門為同部之另一處室, When 判定, Then 判定為不相符。 |

### 0.2 ⚠ 關鍵發現：tracker「未實作」已過時，實際缺口比字面窄且性質不同

深入讀碼後（`backend/src/attachments/`、`backend/src/usage-forms/`、`backend/src/public/`、
`backend/src/rbac/`、對應 `*.spec.ts`/`*.test.tsx`）發現：

1. **欄位面 RBAC 判定（`FIELD_WRITE_FORBIDDEN`/`PERMISSION_DENIED`）本身早已落地且已被充分單元測試**——
   `document-asset-authz.ts::assertCanWriteDocumentAsset`（F016/F018/F027 共用兩道閘門）已在
   `attachments.service.ts::uploadSingle`、`usage-forms.service.ts::assertCanWrite` 實際呼叫，並有
   逐角色測試（見 §3 引用清單）。前端三頁（`DocumentReadonlyPage`／`DocumentEditPage`／
   `UsageFormManagementPage`）亦已依角色渲染唯讀/可寫 UI 且已有對應 `.test.tsx`。此與
   `public-seams-test-design.md` §0.2、§3.3 之既有結論一致（該文件已明言「F026 之其餘欄位權限矩陣…
   已有既有 RBAC 測試涵蓋」）。
2. **真正尚缺的是「附件下載」與「浮水印燒錄」兩者之間的接線本身**——即 §1 詳述之 **OQ-FM-01**：
   後台（Supervisor/DeptContact/ICSOPAdmin 經 `DocumentReadonlyPage`/`DocumentEditPage`）下載
   ICSOP PDF 所走的 `AttachmentsController.download`（`AttachmentsService.getDownloadUrl`）**完全未呼叫
   任何燒錄函式**，僅回傳原始 blob URL；但 UI 文案（`DocumentReadonlyPage.tsx` 第 285/319/330 行）與
   AC6 之 Edge Case 原文（F026 spec 第 53 行：「主管/部門窗口可下載 ICSOP PDF/使用表單（**燒錄浮水印，
   F020**），但上傳/取代該附件被拒。」）皆宣稱／暗示此路徑亦會燒錄。這才是「浮水印」與「附件」
   兩詞在 tracker 缺口描述中真正尚未接線之處，而非欄位可寫/唯讀判定本身。
3. 结论：本文件之新設計案例聚焦於（a）§1 之燒錄接線落差（OQ-FM-01，最高價值發現）、
   （b）AC6 逐字要求但既有測試尚缺之精確角色×動作組合（Supervisor/DeptContact 之「取代」與
   「下載使用表單」）、（c）AC7/AC8/AC9 之既有覆蓋確認與範圍界線。**不重新設計**已充分覆蓋之
   RBAC 矩陣基礎案例（見 §3 逐一引用）。

### 0.3 明確不重工（已由既有測試覆蓋，本文件不重新設計）
- **欄位面純矩陣值**（`FIELD_MATRIX[ICSOP_PDF/USAGE_FORMS/OJT_SIGNIN][角色]`）—— 已由
  `backend/src/rbac/field-matrix.spec.ts`（第 90-92 行）覆蓋。
- **F016 附件（ICSOP_PDF/OJT_SIGNIN）上傳 RBAC**（ICSOPAdmin 允許；SysAdmin/Supervisor/DeptContact→
  `FIELD_WRITE_FORBIDDEN`；User→`PERMISSION_DENIED`）—— 已由 `attachments.service.spec.ts`
  `TS-012~TS-016` 覆蓋；「上傳」與「取代」為同一 `uploadSingle()` 方法（覆蓋語意見 `TS-009/010`），
  無需為 F016 之「取代」另立案例。
- **F016 附件受控下載（未登入拒絕、失效參照拒絕）**—— 已由 `TS-017~TS-019` 覆蓋。
- **F018 使用表單池上傳/覆蓋/移除 RBAC**（ICSOPAdmin CRUD；SysAdmin 查詢可、寫入→
  `FIELD_WRITE_FORBIDDEN`；Supervisor/DeptContact/User→`PERMISSION_DENIED`）—— 已由
  `usage-forms.service.spec.ts` `TS-024~TS-028` 覆蓋。
- **F018 前台下載稽核、未登入拒絕**（`FILE_ACCESS_DENIED`）—— 已由 `TS-013/TS-014` 覆蓋。
- **F020 浮水印快照組裝、VIEW/DOWNLOAD/PRINT 燒錄、稽核、非阻斷**—— 已由 `watermark.service.spec.ts`
  全數覆蓋；**guard 層五角色皆可存取**（`FunctionKey.PUBLIC_BROWSING`/`DOCUMENT_DOWNLOAD_PRINT` 現行
  矩陣五角色皆 READ，無角色別 403，OQ-F020-03 已定案）—— 已由 `watermark.controller.spec.ts`
  `TS-F020-024` 覆蓋。
- **AC8/AC9（使用部門子樹相符性純邏輯）**—— 已由 `org-sync/org-hierarchy.spec.ts`
  `TS-PS-ORG-002`（明確標註「對應 F026 AC-F026-a」）／`TS-PS-ORG-004`（標註「對應 F026 AC-F026-b」）
  覆蓋，`isWithinSubtree` 為 F019 置頂與 F026「使用部門相符性」共用之同一純函式（見 §5）。
- **前端角色化 UI 渲染**（唯讀說明、可寫按鈕顯隱、User 403、Supervisor 無「前往編輯」/無「取代」）——
  已由 `DocumentReadonlyPage.test.tsx`（`Supervisor：顯示唯讀說明`/`User 無讀取權 → 403`/
  `TS-D-011~014`）、`DocumentEditPage.test.tsx`（`Supervisor 唯讀`/`User 無讀取權 → 403`/`TS-D-010`）、
  `UsageFormManagementPage.test.tsx`（`TS-F018-024~026`）覆蓋。

### 0.4 Hard constraint 提醒（協調事項，非本文件可決）
- `documents.service.ts`／`audit.types.ts` 為 doc-changelog／audit-query track 之界面，本文件**不**
  於該二檔新增測試案例。AC7（使用部門任一層級可儲存）之持久層行為落在 `documents.service.ts`
  （`DocumentsService.create`/`update`），本文件僅於 §6 引用既有覆蓋並提出協調建議，不新增案例。

---

## 1. ⚠ 最高價值發現：附件下載與浮水印燒錄之接線落差（OQ-FM-01）

### 1.1 現況程式碼證據

`backend/src/attachments/attachments.service.ts::getDownloadUrl()`：

```ts
async getDownloadUrl(session, blobPath): Promise<DownloadGrant> {
  if (!session?.accountId) throw new ForbiddenException('FILE_ACCESS_DENIED');
  const rec = await this.store.findByBlobPath(blobPath);
  if (!rec) throw new NotFoundException('FILE_ACCESS_DENIED');
  const url = await this.blob.getDownloadUrl(blobPath, DOWNLOAD_URL_TTL_SECONDS);
  return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };  // ← 無任何燒錄呼叫，原始 blob URL
}
```

`backend/src/usage-forms/usage-forms.service.ts::downloadForm()`/`downloadFromPool()` 同構——皆僅
`blob.getDownloadUrl(...)`，無 burner 依賴、無燒錄呼叫。

但前端 `DocumentReadonlyPage.tsx` 第 285 行：「附件可下載（**燒錄浮水印**），但不可上傳/取代」；
第 319 行：「下載/列印時伺服器端**燒錄浮水印**並寫入稽核」；第 330 行對 ICSOP PDF 顯示
「**下載燒錄浮水印**」徽章——三處文案皆宣稱此下載路徑（`downloadAttachment` →
`GET /documents/attachments/download` → `AttachmentsController.download` →
`AttachmentsService.getDownloadUrl`）會燒錄，但實際呼叫鏈中**不存在任何 `PdfBurner`/`burnPdf` 呼叫**。

真正會燒錄的僅有 `WatermarkController`（`GET /public/documents/:id/download`/`:id/print`）—— 此為
「一般使用者前台下載」（AC5）之路徑，經 `WatermarkService.download()`→`this.burner.burnPdf(...)`，
已充分測試（`watermark.service.spec.ts` `TS-F020-017`）。**AC5 本身因此已被滿足**（一般使用者用的
就是這條會燒錄的路徑）。

問題在 AC6 之 Edge Case 原文：「主管/部門窗口可下載 ICSOP PDF/使用表單（**燒錄浮水印，F020**），
但上傳/取代該附件被拒。」——主管/部門窗口存取文件是經**後台**（`ICSOP_DOCUMENT_MANAGEMENT`=READ，
非 `PUBLIC_BROWSING`），對應 `DocumentReadonlyPage`/`DocumentEditPage` 之「附件（僅下載）」/
「附件卡片」，其下載走的正是**不燒錄**的 `AttachmentsController.download`／
`UsageFormsController.download`（前後台共用同一 `documents/:documentId/usage-forms/:formId/download`
端點，同樣不燒錄）。**Edge Case 原文與現行程式碼行為不一致。**

### 1.2 這是否為阻擋性缺口？—— 標記為 OQ，不由本文件裁決

- AC6 之正式 AC 條文本身（非 Edge Case）**未提及**燒錄，僅要求「下載允許、上傳/取代被拒」——此二
  項已由既有測試充分覆蓋（見 §0.3、§3）。
- Edge Case 段落在本專案 spec 慣例中通常仍具拘束力（其餘 feature 之 Edge Case 亦被視為驗收依據），
  故此落差**不可逕行忽略**，但是否燒錄屬產品/架構決策（後台預覽是否應與前台一致燒錄？或後台屬
  「原始檔案稽核用途」故刻意不燒錄、UI 文案才是錯誤的一方？兩種修法方向截然不同：前者需將
  `AttachmentsService`/`UsageFormsService` 接上 `PdfBurner`+身分快照；後者僅需修正三處 UI 文案），
  本文件僅**如實記錄現況**並設計「現況特徵測試」（characterization test，見 §1.3），**不**擅自
  新增「應燒錄」之強制斷言（避免違反「不得杜撰新需求」）。裁決後若確認需燒錄，`tdd-developer` 可將
  §1.3 之特徵測試改寫為正向驗收測試。

### 1.3 New Test Scenarios（🔴🔴 D9 delta，2026-08-20 就地反向重寫；原「記錄現況」定位已終結）

> **原標題**（逐字保留供追溯）：「New Test Scenarios — 記錄現況（目標檔案：
> `backend/src/attachments/attachments.service.spec.ts`）」——`OQ-FM-01` 已裁決（`OQ-D9-08` 選項 B，
> 2026-08-20），且裁決方向與原「現況記錄、待裁決」之特徵測試相反，故本節之「現況特徵測試」定位
> 直接終結，兩案皆已**取代為正向燒錄驗收測試**。

#### TS-FM-001（🔴 已反向重寫，原文逐字保留供追溯）後台受控下載改為一律燒錄浮水印＋寫稽核

> **原文（逐字保留，已作廢）**：「現況特徵：後台受控下載（`getDownloadUrl`）不呼叫任何燒錄函式，
> 回傳原始 blob URL。對應 AC：AC6 Edge Case（現況記錄，非既定驗收；OQ-FM-01）。Test Type：
> Characterization（現況特徵，非 Positive/Negative）。Preconditions：已上傳 ICSOP PDF（`ICSOP_ADMIN`
> 上傳）；`FakeBlobStore` 記錄每次 `getUrlCalls`。Steps：① `svc.getDownloadUrl({ roleCode:
> 'Supervisor', accountId: 'x' }, rec.blobPath)` ② 檢視回傳值與 `blob` 之呼叫記錄。Expected Result：
> 回傳 `url` 等同 `blob.getDownloadUrl(blobPath, TTL)` 之原始輸出（未經任何轉換／未含燒錄後綴）；
> 測試中不注入任何 `burner`/`PdfBurner` 依賴（`AttachmentsService` 建構子本無此參數）——本案例之
> 斷言重點即『此服務完全不具備燒錄能力』，作為 OQ-FM-01 裁決後之明確比對基準線。標註：此測試預期
> 現在即通過（描述現況，非期望修復後行為）。若人類裁決『後台亦須燒錄』，此測試需被取代為正向燒錄
> 驗收測試（届時 `AttachmentsService` 需新增 burner 相依），並在 `docs/specs/error-handling.md`／
> `F026`／`F020` spec 補充明文規則。」

- **現行狀態（🔴 2026-08-20 裁決兌現）**：`OQ-FM-01` 已由 `OQ-D9-08`（選項 B，使用者裁決）全面推翻。
- **對應 AC**：docs/specs/features/F020-watermark.md#backend-burn-delta `AC-N14`（一律燒錄）／
  `AC-N16`（無例外角色）／`AC-N17`（寫稽核）／`AC-N18`（身分＝操作者本人）。
- **Test Type**：Positive（正向驗收，非 Characterization）。
- **傳輸模式已於中途另案改為代理串流**（`AC-D3a`，2026-08-17）：呼叫方法已由 `getDownloadUrl` 改為
  `downloadAttachmentRaw`，回傳形狀由 `{url}` 改為 `{bytes, fileName, contentType}`——此為與燒錄
  裁決獨立之既有改動，非本次反向重寫之範圍，僅一併如實記錄。
- **執行載體（已落地，非計畫）**：`backend/src/attachments/attachments.service.spec.ts` 之
  「D9 delta — 後台受控下載改為一律燒錄＋寫稽核（AC-N14／AC-N15／AC-N16／AC-N17／AC-N18；
  全面推翻 OQ-FM-01／OQ-D18-01）」describe 區塊——含 PDF 燒錄 1 次、非 PDF 不燒錄（策略 A）、
  四角色皆燒錄（無例外）、身分快照為操作者本人、稽核恰新增一筆等逐項斷言。

#### TS-FM-002（🔴 已反向重寫，原文逐字保留供追溯）使用表單後台下載改為一律燒錄浮水印＋寫稽核

> **原文（逐字保留，已作廢）**：「（目標檔案：`backend/src/usage-forms/usage-forms.service.spec.ts`，
> 同構案例）現況特徵：使用表單下載（前台 `downloadForm` 與後台 `downloadFromPool`）皆不燒錄。
> 對應 AC：AC6 Edge Case（現況記錄，OQ-FM-01）。Test Type：Characterization。Preconditions：
> 已上傳表單並關聯文件。Steps：分別以 `svc.downloadForm(SUPERVISOR, docId, formId)` 與
> `svc.downloadFromPool(SUPERVISOR_OR_SYSADMIN, formId)` 呼叫。Expected Result：兩者回傳值皆為
> `blob.getDownloadUrl(form.blobPath, TTL)` 之原始輸出；`UsageFormsService` 建構子無 burner 相依，
> 無法燒錄。標註：同 TS-FM-001，現況通過、待 OQ-FM-01 裁決。」

- **現行狀態（🔴 2026-08-20 裁決兌現）**：同上，`OQ-FM-01` 已全面推翻。
- **對應 AC**：F020 `AC-N14`／`AC-N15`／`AC-N16`／F023 `AC-N51`。
- **Test Type**：Positive。
- **執行載體（已落地，非計畫）**：`backend/src/usage-forms/usage-forms.front-burn.service.spec.ts`
  之「D9 delta — 後台受控下載改為一律燒錄＋寫稽核（AC-N14／AC-N51；全面推翻 OQ-FM-01）」
  describe——含 `downloadFromPool()`（表單池管理頁）與 `downloadFormRaw()`（後台唯讀/編輯頁，
  符號名取自 architecture-spec.md §11.6，見該檔頭之風險提示）兩條路徑之燒錄與稽核正向斷言。
  `usage-forms.service.spec.ts`（bare `svc`，未注入燒錄協作點）之對應舊案（`TS-FM-002`）僅保留
  「非 PDF 仍回原始位元組」之格式驅動半段（不受 D9 影響），「不寫稽核」半段之舊斷言已移除、
  不代之以新斷言（理由：bare `svc` 缺 burner，若在此斷言寫稽核有假紅風險，見該檔案內註解）。

---

## 2. AC6 逐字要求之精確角色×動作組合（既有測試未覆蓋之縫隙）

### 2.1 缺口說明
`usage-forms.service.spec.ts` 既有 RBAC 案例（`TS-025~028`）僅涵蓋 `listPool`／`uploadForm` 兩動作；
AC6 逐字要求的「下載允許」與「取代（`overwriteForm`）被拒」**兩個精確動作**、且**明確指名角色
（主管；Edge Case 並列部門窗口）**，尚無案例直接以這兩個方法名稱＋這兩個角色斷言。`overwriteForm`
與 `uploadForm` 雖共用 `assertCanWrite()`（因此邏輯上必然同樣拒絕），但方法呼叫路徑不同
（`overwriteForm` 另有引用數/格式檢查次序），依「端點存在≠可用」之 house DoD，仍應在**真實呼叫的
方法**上斷言，不可僅以「兩者共用同一 guard 函式」代替。

### 2.2 New Test Scenarios（目標檔案：`backend/src/usage-forms/usage-forms.service.spec.ts`，
新增 `describe('RBAC — AC6 主管/部門窗口下載允許、取代被拒（F026 精確組合）')` 區塊）

#### TS-FM-003 主管（Supervisor）下載使用表單（前台/詳情頁真實呼叫點）→ 允許，核發憑證＋稽核
- **對應 AC**：AC6（正面路徑，逐字「主管下載使用表單…允許」）
- **Test Type**：Positive
- **Preconditions**：`ICSOP_ADMIN` 上傳表單並 `linkForms` 至 `'doc-1'`
- **Steps**：
  1. `const s: SessionContext = { roleCode: 'Supervisor', accountId: 'sup1' }`
  2. `await svc.downloadForm(s, 'doc-1', f.id)`
- **Expected Result**：回傳 `grant.url` 含 `f.blobPath`；`audit.events` 新增一筆
  `{ actionType: 'DOWNLOAD', accountId: 'sup1', formId: f.id, documentId: 'doc-1' }`；不拋錯
  （`downloadForm` 僅檢查 `session.accountId` 存在，無角色白名單，故任何已登入角色皆可——本案例將
  「Supervisor 具體可行」由既有僅測 `User` 之覆蓋擴至 AC6 逐字指名角色）

#### TS-FM-004 部門窗口（DeptContact）下載使用表單 → 允許（Edge Case 並列角色回歸）
- **對應 AC**：AC6 Edge Case（「主管/部門窗口可下載…」）
- **Test Type**：Positive
- **Steps/Expected**：同 TS-FM-003，`roleCode: 'DeptContact'`

#### TS-FM-005 主管（Supervisor）嘗試「取代」使用表單（`overwriteForm`）→ `PERMISSION_DENIED`，未寫入
- **對應 AC**：AC6（負面路徑，逐字「同角色嘗試…取代該附件則被拒」）
- **Test Type**：Negative
- **Preconditions**：既有表單（`ICSOP_ADMIN` 建立，0 份引用，排除 `USAGE_FORM_OVERWRITE_SHARED`
  干擾）
- **Steps**：
  ```
  const s: SessionContext = { roleCode: 'Supervisor', accountId: 'sup1' };
  await svc.overwriteForm(s, f.id, xlsx({ fileName: 'v2.xlsx' }));
  ```
- **Expected Result**：`rejects.toThrow('PERMISSION_DENIED')`（Supervisor 對 `USAGE_FORM_MANAGEMENT`
  功能面為「無」，`assertCanWrite`→`assertCanWriteDocumentAsset` 之 `canPerform` 第一關即擋下，不觸及
  欄位層）；`blob.putCalls` 長度為 0（未寫入新檔）；`(await store.findById(f.id))?.blobPath` 仍為原值

#### TS-FM-006 部門窗口（DeptContact）嘗試「取代」使用表單 → `PERMISSION_DENIED`（Edge Case 並列角色回歸）
- **對應 AC**：AC6 Edge Case
- **Test Type**：Negative
- **Steps/Expected**：同 TS-FM-005，`roleCode: 'DeptContact'`

> 註：ICSOP PDF/OJT（F016）之「取代」與「上傳」為同一 `uploadSingle()` 方法，已由既有 `TS-013~015`
> （SysAdmin/Supervisor/DeptContact → `FIELD_WRITE_FORBIDDEN`）完整覆蓋「取代」語意，不需為 F016
> 另立案例（見 §0.3）。

---

## 3. AC5-9 → 現況覆蓋總表（含既有測試引用）

| AC | 現況狀態 | 覆蓋證據（既有，不重工） | 本文件新增 |
|---|---|---|---|
| AC5（一般使用者前台下載+燒錄，無法存取後台） | ✅ 已滿足 | 下載+燒錄：`watermark.service.spec.ts` `TS-F020-017`（`sessionOf()` 預設 `roleCode:'User'`）、`TS-F020-024`（guard 五角色皆可，含 User）。無法存取後台：`role-permission.guard.spec.ts`「ICSOP文件管理 read：一般使用者（無）→ 403 PERMISSION_DENIED」（第 73 行）＋前端 `DocumentReadonlyPage.test.tsx`「User 無讀取權 → 403」＋`DocumentEditPage.test.tsx`「User 無讀取權 → 403」（第 114 行） | 無（citation-only；已充分） |
| AC6（主管下載使用表單允許、取代被拒） | 🟡 部分：下載/取代之 RBAC 判定邏輯已存在（共用 `assertCanWriteDocumentAsset`），但**指名角色×指名動作**之直接斷言、以及 Edge Case 之燒錄宣稱缺口尚未被測試鎖定 | 上傳被拒（隱含取代語意雛型）：`usage-forms.service.spec.ts` `TS-025~028`（僅測 `uploadForm`/`listPool`） | TS-FM-003~006（§2）＋ TS-FM-001/002（§1，OQ-FM-01 現況記錄） |
| AC7（使用部門任一層級可寫入儲存） | 🟡 落在 `documents.service.ts`（受保護介面，本 track 不觸碰）；既有間接覆蓋但未逐級窮舉 | `documents.service.spec.ts` `F014-C1`（`usingDeptIds: ['A2000','B0000']`，經 `deriveTier` 驗證分屬 DEPARTMENT/DIVISION 兩種不同層級，已提供初步「非單一層級」證據）、`TS-B-001`（編輯路徑可更新）、`F014-C5`/`TS-B-006`（非 ICSOPAdmin 拒寫） | 無新測試（協調事項，見 §6） |
| AC8（部層涵蓋處室 → 相符） | ✅ 已滿足 | `org-hierarchy.spec.ts` `TS-PS-ORG-002`（程式碼內註解明確標註「對應 F026 AC-F026-a」） | 無 |
| AC9（同部兄弟處室 → 不相符） | ✅ 已滿足 | `org-hierarchy.spec.ts` `TS-PS-ORG-004`（註解標註「對應 F026 AC-F026-b」） | 無 |

---

## 4. Test Level 判定：全數維持 unit，不新增 itest（含理由）

依 launching 指示「若 AC5-9 之強制執行僅能對真實資料證明，才設計 itest；否則說明為何維持 unit」：

1. **AC5/AC6 之判定本質為純角色×動作查表**（`canPerform`/`canWriteField`/`assertCanWriteDocumentAsset`），
   全部輸入輸出皆為記憶體內物件（session shape、字串），與底層是否為 MSSQL 無關；`FakeBlobStore`／
   `FakeAttachmentStore`／`FakeFormPoolStore`（既有）已足以在完全不依賴真實 DB 之情況下對真實呼叫
   路徑（service 方法，而非裸函式）斷言，滿足「端點存在≠可用」之 DoD（呼叫的是 `AttachmentsService`/
   `UsageFormsService` 之公開方法，非僅 `canWriteField` 裸函式）。
2. **`blobPath` 之持久化/查詢一致性**（受控下載端點是否真能在真實 MSSQL 上查到剛寫入的
   `DOCUMENT_ATTACHMENT`/`USAGE_FORM_POOL` 列）**已有既有 itest 覆蓋**——
   `backend/test/int/attachments.itest.ts`（`TS-E-A-001~004`）、`backend/test/int/usage-form-pool.itest.ts`
   ——皆非本次新增之 RBAC 判定範疇，本文件之 §1/§2 案例不涉及新資料表或新查詢路徑，純粹是「同一組已
   int-verified 之 store 方法，換不同角色呼叫」，重複以 itest 驗證並無新增風險覆蓋（真實 DB 不會改變
   `canPerform`/`canWriteField` 之查表結果）。
3. **AC8/AC9（`isWithinSubtree`）為完全無 IO 之純函式**（`org-hierarchy.ts` 檔頭註明「純邏輯，無
   IO」），無設計 itest 之必要或可能。
4. **結論：本文件全部 6 個新案例（TS-FM-001~006）皆為 unit test**，目標檔案分別為
   `attachments.service.spec.ts`（1 案）、`usage-forms.service.spec.ts`（5 案）。**不新增 `*.itest.ts`
   檔案，亦不需修改 `backend/test/int/harness.ts`**（未涉及新資料表，`DOCUMENT_ATTACHMENT`/
   `USAGE_FORM_POOL` 之 FK 清理已由既有 harness 涵蓋，本文件未新增資料表）。

---

## 5. AC8/AC9 之 F026 角度確認（無新測試，僅確認消費關係）

`org-sync/org-hierarchy.ts` 第 68 行原始碼註解明文：「F026 使用部門相符性／F033（未來）：同置頂」——
即 F026 之「使用部門相符性」判定與 F019 置頂共用**完全相同的呼叫形態**
`isWithinSubtree(文件使用部門代碼, 使用者部門代碼)`（scope=文件使用部門，target=使用者部門）。
由於 `isWithinSubtree` 為純函式（無狀態、呼叫方是誰不影響其輸出），`TS-PS-ORG-002`/`TS-PS-ORG-004`
之測試結果對 F026 AC8/AC9 而言是**充分且必要**的證明，不因呼叫方模組（F019 `public-list.ts` 或未來
F026/F033 之獨立呼叫點）而異。

現況（2026-07-24）**尚無 F026 專屬之獨立呼叫點**消費 `isWithinSubtree`——F026 spec 本身並未定義一個
「使用部門相符性」的獨立 API 端點；此判定目前僅透過 F019 置頂（`public-list.ts`）間接體現。F033
（RAG 檢索層權限過濾）為 Phase 3、仍 ⬜ 未實作，是規劃中的第二個消費點。**故本文件對 AC8/AC9 不新增
任何測試**——純函式層級已完整覆蓋；待 F026/F033 出現具體端點時，該端點層級之整合測試應留待對應
feature 之獨立 test-design 補齊（與 `public-seams-test-design.md` §3.3 之既有結論一致）。

---

## 6. AC7 協調事項（documents.service.ts，受保護介面，不新增測試）

AC7「ICSOP 管理員編輯「文件使用部門」…可選擇本部／部／處室／課任一層級之單位並儲存成功」之持久層
行為位於 `backend/src/documents/documents.service.ts`（`DocumentsService.create`/`update`），依 launching
prompt 之 hard constraint，本 track **不**於該檔新增測試。

**現況既有覆蓋**（引用，非本文件設計）：
- `documents.service.spec.ts` `F014-C1`：`usingDeptIds: ['A2000', 'B0000']` 建立成功並完整落地／回傳。
  以 `org-hierarchy.ts::deriveTier` 驗證：`'A2000'`（`slice(2)==='000'`）為 `DEPARTMENT`（部）層，
  `'B0000'`（`slice(1)==='0000'`）為 `DIVISION`（本部）層——**已隱含涵蓋兩種不同層級混合於同一多值
  陣列之情境**，非僅單一層級。
- `TS-B-001`：編輯路徑可更新 `usingDeptIds`。
- 後端本身**無任何依 `deriveTier` 限制層級之驗證邏輯**（`DocumentsService`/`typeorm-documents.store.ts`
  對 `usingDeptIds` 僅作字串正規化，未檢查層級）——即「允許任一層級」在設計上是**預設行為**（沒有
  程式碼會拒絕它），而非需額外實作之新邏輯，功能性風險低。

**建議**（供 doc-changelog/doc-seams 後續 track 參考，非本文件之待辦）：
若需要逐字對齊 AC7「本部／部／處室／課**任一層級**」之窮舉信心，可在 `documents.service.spec.ts`
新增一案例，`usingDeptIds` 同時包含 `DIVISION`/`DEPARTMENT`/`SECTION`/`SUBSECTION` 四種層級代碼各一筆
並斷言全數落地——但因目標檔案為受保護介面，本文件僅記錄此建議，不代為設計案例編號或直接編輯。

---

## 7. 前端：F026 之 UI Surface 確認（無新增案例）

依 launching prompt 指示核對是否有欄位層級讀/寫 affordance 之 prototype 落地情形：**有**，且皆已有對應
`.test.tsx` 完整覆蓋，逐一列舉（無缺口，故不新增前端案例）：

| 頁面 | AC5/AC6 相關 affordance | 既有測試（不重工） |
|---|---|---|
| `DocumentReadonlyPage.tsx`（prototype 16） | 唯讀角色顯示「附件可下載（燒錄浮水印），但不可上傳/取代」說明；三類附件（ICSOP PDF/OJT/使用表單）合併清單，僅 ICSOP PDF 有「下載燒錄浮水印」徽章；User 403 | `User 無讀取權 → 403`、`Supervisor：顯示唯讀說明、無「前往編輯」`、`TS-D-011~014` |
| `DocumentEditPage.tsx`（prototype 15） | ICSOPAdmin 附件卡片「下載」與「取代」並存；Supervisor 僅「下載」、無「取代」入口；User 403 | `User 無讀取權 → 403`、`Supervisor 唯讀：無儲存鈕、欄位停用`、`TS-D-007~010`（`TS-D-010` 即為 AC6 UI 側之精確斷言：「Supervisor（唯讀）→ 僅顯示檔名與下載，無「取代」入口」） |
| `UsageFormManagementPage.tsx`（prototype 19） | ICSOPAdmin 上傳/覆蓋/移除按鈕齊全；SysAdmin 唯讀提示、無上傳/覆蓋/移除；主管（無功能存取）→ 封鎖畫面 | `TS-F018-024`、`TS-F018-025`、`TS-F018-026` |

**§1 之 OQ-FM-01 落地建議**（若人類裁決後台亦需燒錄）：`DocumentReadonlyPage.tsx` 第 285/319/330 行、
`DocumentEditPage.tsx` 對應文案**現況即與程式碼行為一致地宣稱會燒錄**——若最終裁決為「後台不燒錄」
（即維持 §1.3 現況），則應改的是**前端文案**（移除/修正「燒錄浮水印」宣稱），屬 UI 文字缺陷而非
RBAC 缺陷，修正後 `DocumentReadonlyPage.test.tsx`/`DocumentEditPage.test.tsx` 之對應斷言字串需同步
更新（不在本文件範圍內設計，因需先有裁決）。

**結論：F026 AC5-9 無需新增前端測試案例。**

---

## 8. 錯誤碼對照（引用 `error-handling.md`，未修改該檔）

| 錯誤碼 | HTTP | 適用情境（AC5-9 範圍） | 依據 |
|---|---|---|---|
| `FIELD_WRITE_FORBIDDEN` | 403 | 唯讀角色（SysAdmin 對 F016；SysAdmin 亦適用 F018）寫入業務欄位／上傳附件 | `error-handling.md` 第 59 行 |
| `PERMISSION_DENIED` | 403 | 功能面「無」角色（User 對 F016；Supervisor/DeptContact/User 對 F018）呼叫寫入型 API | `error-handling.md` 第 58 行 |
| `FILE_ACCESS_DENIED` | 403 | 未登入下載、或 `blobPath` 查無對應現存列（F016/F018/F020） | `error-handling.md` 第 53 行 |
| `DOCUMENT_NOT_FOUND` | 404 | 附件列表端點查無此文件 | `error-handling.md` 第 45 行 |
| `USAGE_FORM_OVERWRITE_SHARED`/`USAGE_FORM_IN_USE` | 409 | 取代/移除共用表單未二次確認（與 AC6「取代被拒」為不同機制，不可混淆：前者為業務衝突防呆，後者為 RBAC 拒絕） | `error-handling.md` 第 55-56 行 |
| `DOCUMENT_PDF_NOT_FOUND` | 404 | `WatermarkService.getOriginalPdf`/`download`/`print` 查無原始 PDF（**⚠ 未列於 `error-handling.md`，見 OQ-FM-03**） | `watermark.service.ts` 程式碼 |

---

## 9. 開放設計問題（Open Questions）

- **OQ-FM-01（✅ 已於 2026-08-20 由 `OQ-D9-08` 選項 B 裁決＝應燒錄；🔴 原提報文字逐字保留供追溯）**：
  「後台（Supervisor/DeptContact/ICSOPAdmin 經 `AttachmentsController.download`／
  `UsageFormsController` 之 `downloadFromPool`/`download`）下載 ICSOP PDF／使用表單，是否應與前台
  （`WatermarkController`）一致燒錄浮水印？現況**不燒錄**，但 UI 文案與 AC6 Edge Case 原文皆宣稱／
  暗示會燒錄……本文件不擅自選邊，§1.3 之現況特徵測試可在任一裁決前先行落地作為回歸防線。」
  **裁決結果**：應燒錄，且無例外角色、一律寫稽核（`OQ-D9-08`／`OQ-D9-09`／`OQ-D9-10`）。
  §1.3 之 TS-FM-001／TS-FM-002 已就地改寫為正向驗收案例（見上）；`F020`／`F023`／`F039` spec 之
  `AC-N14`～`AC-N21`／`AC-N50`／`AC-N51`／`AC-N56`～`AC-N58` 已補齊明文；`error-handling.md`
  不需新增錯誤碼（本 delta 未新增任何錯誤路徑）。
- **OQ-FM-02（🟢 低風險，供 doc-changelog/doc-seams 後續 track 參考）**：AC7「任一層級」之窮舉層級
  多樣性測試（§6 建議）是否需要正式補上？現況設計已「預設允許」（無層級檢查邏輯），功能性風險低，
  非阻擋。
- **OQ-FM-03（🟢 文件維護，非阻擋）**：`DOCUMENT_PDF_NOT_FOUND`（`watermark.service.ts` 使用中）未列於
  `docs/specs/error-handling.md` 之錯誤碼總表（第 40-59 行），建議人類於下次該檔更新時補上一列
  （F020）。本文件依實際程式碼設計測試，不受此文件落差影響。
- **OQ-FM-04（🟢 文件維護，非阻擋）**：`docs/specs/feature-status.md` F026 列現行文字「AC5-9 之附件/
  浮水印欄位權限判定未實作」與實際程式碼現況（§0.2 已述：欄位面 RBAC 早已落地，真正缺口窄於字面、
  性質也不同——是「下載↔燒錄」接線，非「可寫/唯讀」判定）已有落差，建議人類於後續 tracker 更新時
  依本文件 §3 之對照表重新措辭該列（該檔本次凍結、本文件不代為修改）。

---

## 10. 給人類的裁決清單（Summary of Decisions Needing Sign-off）

1. **OQ-FM-01（✅ 已於 2026-08-20 由 `OQ-D9-08` 裁決＝應燒錄）**：原文「後台附件/使用表單下載是否
   應燒錄浮水印？直接決定 §1.3 兩案例最終形態（現況特徵 vs 正向驗收）……」逐字保留供追溯——
   §1.3 已改寫為正向驗收，`AttachmentsService`／`UsageFormsService`／`AppendicesService` 之
   `WATERMARK_BURNER` wiring 為 architecture-spec.md §11.5／§11.6 之明文範圍（非本 test-design
   自行決定，已授權 tdd-implementation 依該節落地）。
2. **OQ-FM-04**：`feature-status.md` F026 列文字是否需依本文件 §3 重新措辭（下次該檔解凍時處理）。
3. OQ-FM-02/03 為低風險文件維護性質，不阻擋本文件測試案例（§1/§2 共 6 案）之落地。

**未涉及新資料表**：本文件全部案例皆基於既有 `DOCUMENT_ATTACHMENT`／`USAGE_FORM_POOL` 及既有
`AttachmentStore`/`FormPoolStore` 假體，未發現需新增 DB 表或新 migration 之情況。
