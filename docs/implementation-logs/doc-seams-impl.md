---
type: implementation-log
feature_id: F011, F014, F016, F017, F026
feature_name: doc-seams — E04 後端縫合（附件列表／編輯側多值／清單富化／前端串接）
status: complete
last_updated: 2026-07-24
---

# doc-seams（F011 / F014 / F016 / F017 / F026）— Implementation Log

> worktree: `icsop-doc-seams`（branch `feature/doc-seams`）
> 測試設計權威來源：`docs/specs/test-design/doc-seams-test-design.md`（58 案；含 4 項人類裁定）
> prototype 權威來源：`prototypes/13-document-list.html`、`15-document-edit.html`、`16-document-readonly.html`
> 整合測試（`*.itest.ts`）**已寫未跑**（orchestrator 於合併後序列執行 `npm run test:int`）。本輪無新 migration。

## 測試結果總覽

| 套件 | 基線 | 本輪 | 差異 |
|---|---|---|---|
| backend `npx jest` | 82 suites / 909 tests | **83 suites / 938 tests** | +1 suite / +29 tests |
| frontend `npx vitest run` | 33 files / 218 tests | **33 files / 240 tests** | +22 tests |
| backend `npx tsc --noEmit` | clean | **clean** | — |
| frontend `npx tsc --noEmit` | clean | **clean** | — |

整合測試新增/擴充 10 案（未執行）：`attachments.itest.ts`（新檔 4）、`f014.itest.ts`（+4）、`documents.itest.ts`（+2）。

### 案例對照

| Scenario | 說明 | 檔案 | 狀態 |
|---|---|---|---|
| TS-A-001~007 | `listForDocument` 固定序／部分附件／空案例／404／降級／唯讀角色可讀／User 功能面 false | `backend/src/attachments/attachments.service.spec.ts` | PASS（9 it，TS-A-006 以 it.each 展開 3 角色） |
| TS-A-008~009 | 新路由 RBAC metadata＋與兩支上傳路由不互相遮蔽 | `backend/src/attachments/attachments-controller-routes.spec.ts`（新檔） | PASS |
| TS-B-001~010 | 編輯側多值落地／正規化／顯式清空／省略鍵不觸碰／三組 forbidden 回歸／diff／changedFields | `backend/src/documents/documents.service.spec.ts` | PASS |
| TS-C-001~008 | 清單「檔案」欄（ICSOP PDF）／「連結點程序書」欄摘要／空狀態／即時目標狀態／未注入降級 | `backend/src/documents/documents.service.spec.ts` | PASS |
| （加測）批次富化 | 富化為單次批次查詢，不隨列數退化為 N+1 | 同上 | PASS |
| TS-D-001~006 | 次要室長／使用部門可搜尋多選、儲存整批送出、未變更不帶鍵、唯讀角色、FIELD_WRITE_FORBIDDEN 錯誤映射 | `frontend/src/pages/DocumentEditPage.test.tsx` | PASS |
| TS-D-007~010 | 編輯頁附件卡（現有檔名＋下載＋取代；空狀態；唯讀無取代） | 同上 | PASS |
| TS-D-011~014 | 唯讀頁三類附件合併清單／部分存在／全空／下載＋稽核提示 | `frontend/src/pages/DocumentReadonlyPage.test.tsx` | PASS |
| TS-D-015~021 | 清單「檔案」欄下載鈕／「—」／連結點 pill／多 pill／pill 下載目標 PDF | `frontend/src/pages/DocumentListPage.test.tsx` | PASS |
| TS-D-021b | 目標無 ICSOP PDF → 既有錯誤提示、不崩潰（裁定 1 明文要求） | 同上 | PASS |
| TS-E-A-001~004 | 附件列表端點 vs 真 SOP DB（上傳→列表→真表一致／空／404／401） | `backend/test/int/attachments.itest.ts`（新檔） | 已寫未跑 |
| TS-E-B-001~004 | 編輯側 replace-set 真表驗證（取代／清空／不觸碰／403） | `backend/test/int/f014.itest.ts` | 已寫未跑 |
| TS-E-C-001~002 | 清單富化真實 join／分頁不錯置 | `backend/test/int/documents.itest.ts` | 已寫未跑 |

## 各縫隙實作

### (A) 附件列表端點 `GET /admin/documents/:documentId/attachments`

- `AttachmentsController.listAttachments`：`@RequirePermission(ICSOP_DOCUMENT_MANAGEMENT, 'read')`（與同檔兩支上傳端點相同），`SessionGuard` 早於授權層 → 未登入 401。
- `AttachmentsService.listForDocument(session, documentId)`：先以選填注入之 `DOCUMENT_STORE.findById` 判資源存在性（查無 → 404 `DOCUMENT_NOT_FOUND`，用以區別「文件不存在」與「文件存在但無附件（200 `[]`）」），再依固定序 `ICSOP_PDF → OJT_SIGNIN` 取 `findSingle`、濾除 null。
- 回應形狀＝`DocumentAttachmentRecord[]`（不包裝 `{items}`）。列表屬讀取，不套 F026 欄位面寫入矩陣（唯讀角色可查）。
- 模組相依：`AttachmentsModule` 自行以 `useFactory` 提供 `DOCUMENT_STORE`（同 `AppDataSource` 單例），**不匯入 `DocumentsModule`**，避免與 (C) 的反向相依構成模組循環。

### (B) 編輯側多值持久化 ＋ F026 編輯路徑

- `documents.service.ts::update()` 移除 `delete clean.secondaryChiefIds/usingDeptIds`，改為 `'key' in clean` 才 `normalizeIdList`（與 create 路徑共用同一支純函式）：
  - 帶鍵且非空 → 取代；帶鍵且 `[]`（或正規化後為空）→ 清空；未帶鍵 → patch 不含該鍵，store 不觸碰既有集合。
- `typeorm-documents.store.ts::update()` 改為單一 `ds.transaction()`：純量 `repo.update()` ＋ 多值 delete-then-insert（全量取代，非差集）＋ 讀回檢視，確保純量與多值同進退（原本純量未包交易，屬本縫隙連帶必要強化）。
- F026：`classifyFields` 呼叫位置未動（forbidden 判定原本即正確）；TS-B-005~007 為回歸防線，確認非 ICSOPAdmin 寫多值仍整體拒絕（all-or-nothing，連可寫欄位亦不落地）。
- **取代測試**：舊 `documents.service.spec.ts` 的 `F014-C7 編輯路徑不持久化多值` 編碼舊契約，已依測試設計 §2.1 由 TS-B-001 取代（非「為了讓測試過而刪測試」）。

### (C) 清單富化（`DocumentListItem`）

- `DocumentListItem` 擴充三欄：`icsopPdfBlobPath` / `icsopPdfFileName` / `links: DocumentLinkView[]`（重用既有連結檢視型別，不新增型別）。
- 富化於 `DocumentsService.listDocuments()`，以 **store-token 對 store-token** 之選填注入（`ATTACHMENT_STORE`，比照既有 `DOCUMENT_LINK_STORE`），不建立 `DocumentsService → AttachmentsService` 相依。
- **不 N+1**：新增三支批次 store 方法
  - `AttachmentStore.findManyByType(documentIds, type)`
  - `DocumentLinkStore.findBySources(sourceIds)`
  - `DocumentStore.findSummaries(ids)`（連結目標之編號/書名/**目前**狀態）
  清單富化固定為 1（附件）＋ 1（連結列）＋ 1（目標摘要）次查詢，與列數無關；已加測試釘住（spy `findSingle`/`findBySource` 不得被呼叫）。
- ⚠ MSSQL 2100 參數上限：三支批次查詢之單欄 `IN` 皆以 `chunkByParamBudget(keys, 1, 1000)` 切批（清單前端以 pageSize 2000 載入完整工作集，未切批會逼近硬上限）。
- 模組相依：`DocumentsModule` 自行以 `useFactory` 提供 `ATTACHMENT_STORE`（同 `AppDataSource` 單例），不匯入 `AttachmentsModule`。

### (D) 前端串接

新增 API：`getDocumentAttachments(documentId)`、`downloadAttachment(blobPath)`（對映既有 `GET /documents/attachments/download`，不新增下載路由）。

- **`DocumentListPage.tsx`**
  - 「檔案」欄：`icsopPdfBlobPath` 存在 → 單一按鈕（`w-8 h-8 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center`＋`file-down` `w-4 h-4`＋`title="下載 {fileName}"`）；否則 `<span class="text-slate-300">—</span>`。不含 OJT 鈕（裁定 2）。
  - 「連結點程序書」欄：`<div class="flex flex-wrap items-center gap-1">` ＋每連結一個 pill（`inline-flex items-center gap-1 px-1.5 py-1 rounded border border-slate-200 hover:bg-primary-50 text-primary-600 text-[11px]`＋`download` `w-3 h-3`＋標籤＝**目標文件編號**＋`title="下載連結點程序書：{編號} {書名}"`）；空 → `—`。
  - pill 點擊＝**下載**（裁定 1）：`getDocumentAttachments(targetDocumentId)` → 取 `ICSOP_PDF` → `downloadAttachment(blobPath)` → `window.open`。目標無 ICSOP PDF／API 失敗 → 既有 `notice`（`role="alert"`）顯示「無法下載「…」」，不崩潰、不導覽。前端不帶任何浮水印旗標（伺服器端依 F020 決定）。
- **`DocumentEditPage.tsx`**
  - `Draft` 擴充 `secondaryChiefIds` / `usingDeptIds`；`changed()` 對陣列欄改內容比對；兩欄納入「已變更 N 個欄位」計數與「取消」還原；儲存僅在實際變更時帶鍵（對應後端 partial patch 語意）。
  - 兩欄改用頁內既有 `MultiSearchCombobox`（與連結點/使用表單同一模式）：次要室長候選＝`searchPersons`（載入時 best-effort 解析既有員編之顯示名稱），使用部門候選＝全部 `orgUnits` 以 `orgPath` 路徑標籤呈現（任意層級）。唯讀角色改渲染唯讀 chips（無搜尋框、無移除鈕），對應 prototype 之 `write-only`。
  - 附件卡 `ReplaceCard` 依 prototype 15 擴充：現有檔名列（`file-text` `w-5 h-5 text-red-500` ＋ `text-sm text-slate-700 truncate flex-1`）＋`flex gap-2 mt-3` 內之「下載」「取代」；未上傳 → 無檔名列與下載鈕；唯讀角色 → 不渲染「取代」。上傳成功後就地更新卡片（覆蓋式）。
- **`DocumentReadonlyPage.tsx`**
  - 「附件（僅下載）」改為 prototype 16 `renderAttach` 之合併清單：檔案（ICSOP PDF）→ OJT 實體簽到表 → 使用表單 ×N；缺者不列；僅 ICSOP PDF 掛「下載燒錄浮水印」徽章。
  - ICSOP PDF／OJT 走 `downloadAttachment(blobPath)`，使用表單維持 F018 既有端點；兩者共用既有 notice 文案「下載「…」（已寫入稽核 DOWNLOAD）」。
  - 移除既有「附件列表端點未就緒」註腳。

### (E) 整合測試與 harness 前置修正

- **`backend/test/int/harness.ts::cleanupMarkers()`**（裁定 3）：於 `DOC_SECONDARY_CHIEF`/`DOC_USING_DEPT` 之後、`ICSOP_DOCUMENT` 之前補 `DELETE FROM [DOCUMENT_ATTACHMENT] WHERE [documentId] IN (marker docs)`。該 FK 為 `NO ACTION`，缺此步驟時刪文件會 FK 違反並被 `.catch` 靜默吞掉，造成 marker 殘留與下次執行編號碰撞。
- 兩支上傳真 Blob 之 itest 皆於 `afterAll` 冪等回收所建 blob key（比照 `storage.itest.ts` 之 marker 回收慣例），避免 dev 容器殘留。

## 架構決策（皆在既有邊界內）

1. **雙向 store-token 而非模組互匯**：`AttachmentsModule` 自建 `DOCUMENT_STORE`、`DocumentsModule` 自建 `ATTACHMENT_STORE`，兩者共用 `AppDataSource` 單例。若改為模組互匯會形成 Nest 模組循環（A 需文件、C 需附件）。
2. **多值採 delete-then-insert 全量取代**：關聯列 id 為代理鍵、無下游 FK 參照，且前端隨 PATCH 整批送出，全量取代較差集運算單純且無邊界遺漏（測試設計 §2.2 已論證）。
3. **`links` 沿用 `DocumentLinkView`**：`targetDocumentId` / `targetNumber` / `targetName` / `targetStatus` 已涵蓋裁定 1 所需之「目標 id ＋編號＋書名」，不新增型別。
4. **`update()` 之 diff 仍為參照比較**：多值欄因 store 回傳新陣列，`changes` 必含該欄（TS-B-008 綠）。惟「重送內容相同之陣列」會產生一筆內容相同的 diff 紀錄（前端只送實際變更之鍵，故不會觸發）。詳見下方待裁定事項。

## 與測試設計之差異（需 orchestrator 知悉）

| 項目 | 設計原文 | 實作 | 理由 |
|---|---|---|---|
| TS-D-021 pill 語意 | 導覽至目標文件 | **下載目標文件之 ICSOP PDF** | 人類裁定 1（prototype 13 `linkCell` 字面；prototype fidelity 為硬性要求） |
| TS-D-021b | 無 | 新增（目標無 PDF → 既有錯誤提示） | 裁定 1 明文要求「surface the API error…rather than crashing」 |
| TS-D-013 空狀態 | 「統一空狀態文案」 | 不渲染任何列、不新增文案 | 裁定 4（prototype 無此文案，不得杜撰）；同時移除語意已不符的「尚無關聯使用表單。」 |
| TS-A-006 | 單案例（Supervisor） | `it.each` 展開 SysAdmin/Supervisor/DeptContact | 三個唯讀角色同一規則，逐一釘住 |
| C 節加測 1 案 | 無 | 「富化為批次查詢」 | 任務書明文「Enrichment must not turn the list into an N+1 query」需可執行驗證 |
| TS-D-001 選擇器 | `getByLabelText('當責室長-次要')` | `getByLabelText('當責室長-次要（可多位，允許為空）')` | prototype 之 label 逐字為「當責室長-次要（可多位，允許為空）」，測試改用該逐字標籤 |

## prototype 未能逐字重現之處（1 項）

- **prototype 15「文件使用部門」之「至少需保留 1 個使用部門」限制未實作**（prototype 之 `rmUse` 僅於 `draft.using.length>1` 時渲染移除鈕，並備有 `useErr` 文案）。原因：與同一份 prototype 的標籤「文件使用部門（0..*）」、F014「允許為空集合」、後端 `[]`＝清空之契約、以及測試設計 TS-D-003（移除唯一的使用部門後整批送出）三者直接衝突；裁定亦要求沿用既有 `MultiSearchCombobox`（該元件恆可移除）。**已依 source-of-truth 優先序（test design > feature spec > prototype）採 0..*。** 若產品實際要求「至少 1 個」，需同步修 F014 spec、後端清空語意與 prototype 標籤。
- 其餘（欄寬 `min-w-[60px]`/`min-w-[108px]`、pill/按鈕 class 串、icon 名與尺寸、`—` 樣式、附件列版面與徽章、卡片版面）皆逐項對齊。所有使用之 icon（`file-down`、`download`、`file-text`、`sheet`、`upload`、`info`）均已在 `frontend/src/components/Icon.tsx` REGISTRY 註冊。

## 待人類/orchestrator 裁定

1. **`update()` 陣列 diff 之偽變更**：目前 `beforeRec[k] !== afterRec[k]` 為參照比較。若外部呼叫端重送與現值相同的多值陣列，會在 F037 變更日誌留下一筆 old==new 的紀錄。前端不會觸發（只送變更鍵）。修法為在 diff 加陣列深比較（需一併補測試）。本輪依「不超出設計範圍」原則未做。
   註：測試設計 §TS-B-008 的風險敘述方向相反（寫「可能被誤判為相同而遺漏」），實際為反向（可能多記一筆）。
2. **`docs/specs/feature-status.md` 之列異動**（本 worktree 未改，凍結中）——請 orchestrator 套用下節。

## feature-status.md 應套用之列異動

| Feature | 現況 | 建議 | 說明 |
|---|---|---|---|
| F011 | 🟡 | 🟡（維持，備註更新） | 編輯頁多值欄位補齊；`*.itest.ts` 已寫未跑 → 待 int 綠後可升 ✅ |
| F014 | 🟡 | 🟡（維持，備註更新） | edit-side 已補（後端 replace-set ＋前端多選）；待 `f014.itest.ts` 新增 4 案跑綠後升 ✅ |
| F016 | 🟡 | 🟡（維持，備註更新） | 附件列表端點＋兩頁既有檔名/下載已補；待 `attachments.itest.ts` 跑綠後升 ✅ |
| F017 | 🟡 | 🟡（維持，備註更新） | 「檔案」「連結點程序書」兩欄縫隙關閉；待 `documents.itest.ts` 新增 2 案跑綠後升 ✅ |
| F026 | 🟡 | 🟡（維持，備註更新） | 編輯路徑多值欄 forbidden 回歸補齊（純 unit，無 int 依賴）；可視 orchestrator 判斷升 ✅ |

備註統一指向本檔：`docs/implementation-logs/doc-seams-impl.md`。

## 變更檔案

| 路徑 | 類型 | 說明 |
|---|---|---|
| `backend/src/attachments/attachments.controller.ts` | modified | 新增 `GET admin/documents/:documentId/attachments` |
| `backend/src/attachments/attachments.service.ts` | modified | `listForDocument()`＋選填 `DOCUMENT_STORE` 注入 |
| `backend/src/attachments/attachments.store.ts` | modified | `findManyByType` 批次介面 |
| `backend/src/attachments/typeorm-attachments.store.ts` | modified | `findManyByType`（IN 切批） |
| `backend/src/attachments/attachments.module.ts` | modified | 自建 `DOCUMENT_STORE` provider |
| `backend/src/attachments/attachments.service.spec.ts` | modified | TS-A-001~007 |
| `backend/src/attachments/attachments-controller-routes.spec.ts` | new | TS-A-008~009 |
| `backend/src/documents/documents.service.ts` | modified | 多值持久化＋清單富化（enrichIcsopPdf/enrichLinks） |
| `backend/src/documents/documents.store.ts` | modified | `DocumentListItem` 三欄＋`DocumentSummary`＋`findSummaries` |
| `backend/src/documents/document-link.store.ts` | modified | `findBySources` 批次介面 |
| `backend/src/documents/typeorm-documents.store.ts` | modified | `update()` 交易＋replace-set；`findSummaries`；list 基線欄 |
| `backend/src/documents/typeorm-document-link.store.ts` | modified | `findBySources`（IN 切批） |
| `backend/src/documents/documents.module.ts` | modified | 自建 `ATTACHMENT_STORE` provider |
| `backend/src/documents/documents.service.spec.ts` | modified | TS-B-001~010、TS-C-001~008＋批次加測（取代 F014-C7） |
| `backend/src/documents/document-list-query.spec.ts` | modified | fixture 補新欄 |
| `backend/src/xls-source/xls-source.service.spec.ts` | modified | fake store 補 `findManyByType` |
| `backend/test/int/harness.ts` | modified | `cleanupMarkers` 補 `DOCUMENT_ATTACHMENT`（FK 順序） |
| `backend/test/int/attachments.itest.ts` | new | TS-E-A-001~004 |
| `backend/test/int/f014.itest.ts` | modified | TS-E-B-001~004 |
| `backend/test/int/documents.itest.ts` | modified | TS-E-C-001~002 |
| `frontend/src/api/types.ts` | modified | `DocumentListItem` 三欄 |
| `frontend/src/api/endpoints.ts` | modified | `getDocumentAttachments`／`downloadAttachment` |
| `frontend/src/pages/DocumentListPage.tsx` | modified | 「檔案」「連結點程序書」兩欄 |
| `frontend/src/pages/DocumentEditPage.tsx` | modified | 多值可編輯＋附件卡現有檔名/下載 |
| `frontend/src/pages/DocumentReadonlyPage.tsx` | modified | 三類附件合併清單 |
| `frontend/src/pages/DocumentListPage.test.tsx` | modified | TS-D-015~021、021b |
| `frontend/src/pages/DocumentEditPage.test.tsx` | modified | TS-D-001~010 |
| `frontend/src/pages/DocumentReadonlyPage.test.tsx` | modified | TS-D-011~014 |
| `frontend/src/pages/DocumentCreatePage.test.tsx`／`document-display.test.ts` | modified | fixture 補新欄 |
| `docs/specs/features/F011/F014/F016/F017/F026-*.md` | modified | Status 行 |
| `docs/specs/test-design/doc-seams-test-design.md` | new（輸入） | 測試設計（本輪輸入文件） |
