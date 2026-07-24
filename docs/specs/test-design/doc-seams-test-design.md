---
type: test-design-feature
covers: [F011, F014, F016, F017, F026]
priority: P0-MVP
related_spec:
  - docs/specs/features/F011-edit-with-comparison.md
  - docs/specs/features/F014-accountable-dept-chief.md
  - docs/specs/features/F016-pdf-ojt-attachment.md
  - docs/specs/features/F017-backend-document-list.md
  - docs/specs/features/F026-role-field-matrix.md
last_updated: 2026-07-24
status: draft
---

# doc-seams — E04 後端縫合測試設計

> worktree: `icsop-doc-seams`（branch `feature/doc-seams`）· source: `docs/specs/feature-status.md`（F010/F011/F014/F016/F017 列）＋上列 5 份 feature spec
> 範圍：關閉 E04 剩餘後端縫隙，使 F011/F014/F016/F017 由 🟡 部分升級為 ✅。**不含**新資料表；**不修改** `docs/specs/feature-status.md`／`spec-index.md`／`open-questions.md`（凍結中，需要的異動已列於本檔末「待人類裁定事項」）。

## 0. 範圍聲明（已被現有 *.spec / *.test 覆蓋、不重設之基線）

以下既有測試已覆蓋，本檔**不重新設計**，僅在必要處交叉引用：

- `backend/src/documents/documents.service.spec.ts`：`create()`（F010/F026/F013/F014 建立側）、`setStatus()`（F012）、`listDocuments()` 既有篩選/排序/分頁/名稱解析（F017 既有部分）、`update()` 既有 scalar 覆寫/唯一性排除自身/併發映射（F011 既有部分）。
- `backend/src/documents/document-field-write.spec.ts`：`classifyFields`/`canWriteField` 之角色×欄位純判定表（F026）。
- `backend/src/rbac/field-matrix.ts` 對應 spec：`FieldKey.CHIEF_SECONDARY`／`USING_DEPTS` 之矩陣值（僅 ICSOPAdmin=WRITABLE，其餘四角色=FORBIDDEN）已由既有測試逐欄覆蓋。
- `backend/src/attachments/attachments.service.spec.ts`：`uploadSingle()`（F016 上傳/格式/大小/覆蓋/RBAC）、`getDownloadUrl()`（受控下載）。
- `frontend/src/pages/DocumentEditPage.test.tsx`／`DocumentReadonlyPage.test.tsx`／`DocumentListPage.test.tsx`：既有欄位對照/取消/儲存/唯讀/F015 連結點整批送出等既有渲染與互動。

本檔聚焦五個縫隙（對應任務 A–E），逐一給出契約設計＋測試案例：

| 縫隙 | 一句話 | 主要異動檔案（生產碼，供 tdd-developer 對照；本檔僅設計測試） |
|---|---|---|
| A | 附件列表端點 | `backend/src/attachments/attachments.controller.ts`、`attachments.service.ts`、`attachments.store.ts`（新批次方法，供 C 用）|
| B | 編輯側多值持久化 + F026 編輯路徑欄位面 | `backend/src/documents/documents.service.ts`（移除剔除邏輯）、`backend/src/documents/typeorm-documents.store.ts::update()`（新增 replace-set）|
| C | 清單「檔案」＋「連結點程序書」欄資料契約 | `backend/src/documents/documents.store.ts`（`DocumentListItem` 擴充）、`documents.service.ts::listDocuments()`（富化）|
| D | 前端串接 | `DocumentEditPage.tsx`、`DocumentReadonlyPage.tsx`、`DocumentListPage.tsx` |
| E | 整合測試 | `backend/test/int/*.itest.ts`（新增/擴充）＋ `backend/test/int/harness.ts`（修正，見附註）|

---

## 1. (A) 附件列表端點 — `GET /admin/documents/:documentId/attachments`

### 1.1 契約設計

- **路由**：新增於既有 `AttachmentsController`（不另開 controller，與上傳端點同檔，維持 F016 seam 精簡之既有原則）。
- **RBAC（兩層，與既有下載閘門「同一防線組合」而非同一 FunctionKey）**：
  1. **Layer 1（路由層，功能面）**：`@RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')` — 與同檔兩個上傳端點採**完全相同**之 decorator（非沿用 `download` 端點的 `FunctionKey.DOCUMENT_DOWNLOAD_PRINT`，因本端點掛於 `admin/documents/:documentId/attachments`，服務對象為後台編輯頁／唯讀頁，兩者本就已要求 `ICSOP_DOCUMENT_MANAGEMENT` read 才能進頁；一般使用者（該功能矩陣＝NONE）在此層即被拒，回 403 `PERMISSION_DENIED`）。`SessionGuard` 早於此層，缺 session → 401（不到 controller）。此為與既有下載閘門「兩道防線」精神一致之處：guard chain 結構相同（`SessionGuard` → `RolePermissionGuard`），僅 FunctionKey 依端點的實際使用情境調整。
  2. **Layer 2（服務層，資源存在性）**：查無此 `documentId` → 404 `DOCUMENT_NOT_FOUND`（與 `DocumentsService.getDocument()` 之既有慣例一致）。此層是區分「空清單」與「文件不存在」兩種情境的必要防線（若無此層，兩者都會回 200+`[]`，無法區分）。
- **服務方法**：`AttachmentsService.listForDocument(session, documentId): Promise<DocumentAttachmentRecord[]>`
  - 依序查 `store.findSingle(documentId, 'ICSOP_PDF')`、`store.findSingle(documentId, 'OJT_SIGNIN')`（沿用既有 `AttachmentStore.findSingle` 方法，**不需新增 store 介面**於此點），過濾 `null`，固定回傳順序＝ICSOP_PDF 優先、OJT_SIGNIN 次之（供前端渲染順序穩定、避免測試依賴不穩定排序）。
  - 存在性檢查：`AttachmentsService` 新增 `@Optional() @Inject(DOCUMENT_STORE) private readonly documentStore?: DocumentStore`（比照 `DocumentsService` 對 `DOCUMENT_LINK_STORE`／`NameResolutionService` 之既有 `@Optional()` 慣例，避免破壞既有以 `new AttachmentsService(blob, store)` 建構之既有單元測試）。若未注入（`undefined`）→ 略過存在性檢查（僅供測試替身彈性，非正式路徑之預期狀態）。
- **回應形狀**：`DocumentAttachmentRecord[]`（重用既有型別，欄位不變：`id`/`documentId`/`type`/`fileName`/`blobPath`/`contentType`/`size`/`uploadedBy`/`uploadedAt`）。**不**包裝於 `{ items }`（與上傳端點回傳單一 record 之慣例一致，清單直接回陣列）。

### 1.2 測試案例（unit — `backend/src/attachments/attachments.service.spec.ts` 新增 `describe('listForDocument（附件列表，A）')`）

#### TS-A-001 兩類附件皆已上傳 → 依固定順序回傳兩筆
- **Given**：文件 `doc-1` 已有 `ICSOP_PDF`（`fileName='sop.pdf'`）與 `OJT_SIGNIN`（`fileName='ojt.pdf'`）各一筆
- **When**：`svc.listForDocument(ICSOP_ADMIN, 'doc-1')`
- **Then**：回傳陣列長度 2，順序為 `[ICSOP_PDF, OJT_SIGNIN]`（不論底層 store 插入順序為何）
- **AC**：F016 AC1「可於詳情下載」之列表面延伸（gap-derived）
- **檔案**：`backend/src/attachments/attachments.service.spec.ts`

#### TS-A-002 僅上傳其中一類 → 僅回傳該筆
- **Given**：`doc-1` 僅有 `ICSOP_PDF`
- **When**：`svc.listForDocument(ICSOP_ADMIN, 'doc-1')`
- **Then**：回傳陣列長度 1，`type==='ICSOP_PDF'`
- **AC**：gap-derived（部分附件情境）
- **檔案**：同上

#### TS-A-003 空案例：文件存在但兩類皆未上傳 → 200 空陣列
- **Given**：`documentStore` 內存在 `doc-2`（但 `ATTACHMENT_STORE` 無任何列）
- **When**：`svc.listForDocument(ICSOP_ADMIN, 'doc-2')`
- **Then**：回傳 `[]`（非拋錯）
- **AC**：任務描述「empty case」（gap-derived）
- **檔案**：同上

#### TS-A-004 非存在文件 → DOCUMENT_NOT_FOUND
- **Given**：注入 `documentStore`（含 `findById` 回 `null`）、`documentId='ghost'`
- **When**：`svc.listForDocument(ICSOP_ADMIN, 'ghost')`
- **Then**：拋出 404 `DOCUMENT_NOT_FOUND`；`store.findSingle` 不因此中斷（可先查或後查皆可，但最終不回傳任何附件資料）
- **AC**：任務描述「non-existent document case」（gap-derived，比照 `DocumentsService.getDocument` 慣例）
- **檔案**：同上

#### TS-A-005 `documentStore` 未注入時之防禦性降級 → 略過存在性檢查、正常回傳附件
- **Given**：`new AttachmentsService(blob, attachmentStore)`（不傳 `documentStore` 第三參數）、`doc-1` 有 `ICSOP_PDF`
- **When**：`svc.listForDocument(ICSOP_ADMIN, 'doc-1')`
- **Then**：不拋錯，正常回傳既有附件（僅為測試替身彈性之防禦分支，非預期正式部署狀態）
- **AC**：gap-derived（可選注入之降級行為）
- **檔案**：同上

#### TS-A-006 功能面唯讀角色（SysAdmin/Supervisor/DeptContact）→ 允許讀取（與上傳的 read-gate 一致，唯讀角色可查看已有哪些附件）
- **Given**：`session={roleCode:'Supervisor'}`、`doc-1` 有 `ICSOP_PDF`
- **When**：`svc.listForDocument(session, 'doc-1')`（若設計為 controller 層即擋，則此案例改於 controller-route 測試驗證 decorator action=`'read'`；service 層本身不應另設欄位面檢查，因為「列出」非「寫入」）
- **Then**：成功回傳，不拋 `FIELD_WRITE_FORBIDDEN`（列表為讀取操作，不受 F026 欄位面寫入矩陣管轄）
- **AC**：F026「唯讀角色可查/可下載」之列表面延伸（gap-derived）
- **檔案**：同上

#### TS-A-007 一般使用者（User，功能面 NONE）→ 403 PERMISSION_DENIED（於 controller 層即擋，service 不受呼）
- **Given**：controller 層 `RequirePermission(ICSOP_DOCUMENT_MANAGEMENT,'read')`；`canPerform('User', 'ICSOP文件管理','read')===false`
- **When**：以 `RolePermissionGuard` 之既有純判定（非啟動整個 Nest guard pipeline，比照既有 guard 單元測試手法）驗證 `canPerform` 結果
- **Then**：`false`（route 層會回 403，此處驗證判定源頭）
- **AC**：F025「ICSOP文件管理」User=無 / `PERMISSION_DENIED`（既有矩陣值，gap-derived 之列表面延伸）
- **檔案**：同上（或若專案偏好於 rbac 測試驗證，可放 `backend/src/rbac/function-matrix.spec.ts` 既有案例交叉引用，不必新增）

### 1.3 測試案例（unit — 路由/RBAC metadata，新檔 `backend/src/attachments/attachments-controller-routes.spec.ts`，比照既有 `documents-controller-routes.spec.ts` 之「新端點上線前之最低防線」模式）

#### TS-A-008 `GET admin/documents/:documentId/attachments` 正確掛載 `RequirePermission(ICSOP_DOCUMENT_MANAGEMENT, 'read')`
- **Given**：以 `Reflector` 讀取 `AttachmentsController.prototype.listAttachments`（或最終命名）之 metadata
- **When**：`reflector.get(REQUIRE_PERMISSION_KEY, handler)`
- **Then**：`functionKey===FunctionKey.ICSOP_DOCUMENT_MANAGEMENT`、`action==='read'`
- **AC**：gap-derived（新端點上線前之最低防線，同既有 F011 PATCH :id 路由測試precedent）
- **檔案**：`backend/src/attachments/attachments-controller-routes.spec.ts`（新檔）

#### TS-A-009 新路由路徑字面與既有兩個上傳路由不互相遮蔽
- **Given**：三個 handler 之 `PATH_METADATA`
- **When**：比對路徑字串
- **Then**：`admin/documents/:documentId/attachments`（GET）與 `admin/documents/:documentId/attachments/icsop-pdf`（POST）、`.../ojt`（POST）三者字面不同、方法（GET vs POST）亦不同，Nest 路由器不會誤配
- **AC**：gap-derived（路由防護回歸）
- **檔案**：同上

### 1.4 整合測試（`[integration]`，見第 5 節 E 之 TS-E-A-*）

---

## 2. (B) 編輯側多值持久化 + F026 編輯路徑欄位面 enforcement

### 2.1 現況與待替換測試

`backend/src/documents/documents.service.ts::update()` 現行第 210-213 行明確**剔除** `secondaryChiefIds`／`usingDeptIds`（註解「編輯路徑不持久化多值（create-side only）」），對應的舊測試 **`backend/src/documents/documents.service.spec.ts:315-321`（`it('F014-C7 編輯路徑不持久化多值...')`）編碼的是舊契約，本檔設計取代之**。舊測試斷言 `store.updated[0].patch` 不含這兩個鍵；新契約下，ICSOPAdmin 合法寫入時**應該**含有這兩個鍵（且已正規化）。

⚠ **F026 欄位面 forbidden 判定其實已經正確**：`classifyFields(roleCode, props)` 在 `update()` 第 200 行即以完整 `props`（含 `secondaryChiefIds`/`usingDeptIds`）呼叫，非 ICSOPAdmin 寫入這兩欄**現在就會**在到達剔除邏輯之前被攔下、拋 `FIELD_WRITE_FORBIDDEN`。真正的缺口是「ICSOPAdmin 合法寫入時被靜默丟棄、未落地」，而非「拒寫判定失靈」。本節測試需明確涵蓋兩者：(1) ICSOPAdmin 合法寫入後**確實落地**（新行為）、(2) 非 ICSOPAdmin 寫入仍正確拒絕（回歸防護，防止本次修改意外破壞既有已正確之防線）。

### 2.2 契約設計

- **`documents.service.ts::update()` 異動**：移除 `delete clean.secondaryChiefIds; delete clean.usingDeptIds;` 兩行；改為**比照 create() 之正規化**，但僅在呼叫端**明確帶入該鍵**時才處理（partial patch 語意）：
  ```
  if ('secondaryChiefIds' in clean) clean.secondaryChiefIds = normalizeIdList(clean.secondaryChiefIds);
  if ('usingDeptIds' in clean) clean.usingDeptIds = normalizeIdList(clean.usingDeptIds);
  ```
  未帶鍵（`undefined`，即 payload 根本無此屬性）→ `clean` 不含此鍵 → 不觸碰既有集合（partial update 語意，避免使用者只改書名卻意外清空次要室長）。
- **`typeorm-documents.store.ts::update()` 異動**：新增 replace-set 邏輯（delete-then-insert 全量取代，**非** F015 連結點式的差集 add/remove）：
  - 僅當 `'secondaryChiefIds' in patch` 時，於同一交易內 `DELETE FROM DOC_SECONDARY_CHIEF WHERE documentId=:id` 後，依 `patch.secondaryChiefIds`（非空才 insert）重新插入。
  - `usingDeptIds` 同理，操作 `DOC_USING_DEPT`。
  - **設計決策：選用「delete-then-insert 全量取代」而非 F015 連結點的「差集 add/remove」**。理由：(1) 任務描述明文「replace-set semantics」；(2) `DOC_SECONDARY_CHIEF`/`DOC_USING_DEPT` 之 row `id` 純為代理鍵，全庫無其他資料表以此 id 為 FK 參照（已查 `doc-secondary-chief.entity.ts`/`doc-using-dept.entity.ts`，僅 `(documentId, employeeNo|orgCode)` 複合唯一鍵，無下游消費者依賴 id 穩定性）；(3) 前端已將整個多值陣列隨 PATCH 整批送出（非個別 add/remove API），差集運算對此情境無實益，delete-then-insert 更簡單、更不易有邊界遺漏。
  - **交易邊界**：建議將 scalar `repo.update()` 與多值 delete/insert 包入同一 `ds.transaction()`（比照 `create()` 既有模式），確保 scalar 欄位與多值集合同進退（目前 `update()` 之 scalar 覆寫**未**包在交易內，此為連帶必要之強化，非本次縫隙之外的額外範圍——若不修，多值寫入失敗會讓 scalar 已落地但多值未更新，資料不一致）。
- **正規化與 create 路徑一致**：呼叫同一支既有純函式 `normalizeIdList`（trim、去空字串、去重、保留順序），不新增第二套正規化邏輯。

### 2.3 測試案例（unit — `backend/src/documents/documents.service.spec.ts`，新增/取代 describe 區塊 `DocumentsService.update — F014 多值編輯側持久化（B）`）

#### TS-B-001（取代 F014-C7）ICSOPAdmin 修改次要室長與使用部門 → 實際落地於 store.update 之 patch
- **Given**：`doc-1` 現值 `secondaryChiefIds=['20053']`、`usingDeptIds=['A2000']`
- **When**：`svc.update('ICSOPAdmin', 'doc-1', { secondaryChiefIds: ['99999'], usingDeptIds: ['X'] })`
- **Then**：`store.updated[0].patch` **含** `secondaryChiefIds: ['99999']` 與 `usingDeptIds: ['X']`（正規化後）；回傳之 `document.secondaryChiefIds`／`usingDeptIds` 反映新值（FakeStore 之 spread 覆寫語意足以驗證此層）
- **AC**：gap-derived（F014 edit-side 契約，本次縫隙之核心行為；F026「ICSOP 管理員更新文件狀態欄位…允許寫入」之同構延伸至多值欄位）
- **檔案**：`backend/src/documents/documents.service.spec.ts`

#### TS-B-002 正規化與 create 路徑一致：去空白/去空字串/去重
- **Given**：`doc-1`
- **When**：`svc.update('ICSOPAdmin', 'doc-1', { secondaryChiefIds: ['20053', ' 20053 ', '', '20541'] })`
- **Then**：`store.updated[0].patch.secondaryChiefIds` 為 `['20053', '20541']`（同 F014-C2 建立側正規化行為）
- **AC**：F014 建立側正規化規則延伸至編輯路徑（gap-derived）
- **檔案**：同上

#### TS-B-003 空陣列顯式送入 → 清空既有集合（非「未提供」）
- **Given**：`doc-1` 現值 `secondaryChiefIds=['20053']`
- **When**：`svc.update('ICSOPAdmin', 'doc-1', { secondaryChiefIds: [] })`
- **Then**：`store.updated[0].patch` **含** `secondaryChiefIds: []`（鍵存在、值為空陣列——區別於「未提供該鍵」）；回傳值 `secondaryChiefIds` 為 `[]`
- **AC**：F014「移除全部次要室長保留主要…允許次要為空集合」之編輯路徑延伸
- **檔案**：同上

#### TS-B-004 省略鍵（payload 未帶 secondaryChiefIds/usingDeptIds）→ 不觸及既有集合
- **Given**：`doc-1` 現值 `secondaryChiefIds=['20053']`、`usingDeptIds=['A2000']`
- **When**：`svc.update('ICSOPAdmin', 'doc-1', { documentName: '新名' })`（未帶多值鍵）
- **Then**：`store.updated[0].patch` **不含** `secondaryChiefIds`／`usingDeptIds` 鍵（`Object.prototype.hasOwnProperty` 為 false，非「值為 undefined」）；回傳值之 `secondaryChiefIds`／`usingDeptIds` 維持原值 `['20053']`／`['A2000']`（FakeStore spread 語意下，缺鍵不覆寫）
- **AC**：任務描述「omitted key (undefined) → no change」（gap-derived，B 節核心驗收點）
- **檔案**：同上

#### TS-B-005 非 ICSOPAdmin（SysAdmin）寫次要室長 → 仍為 FIELD_WRITE_FORBIDDEN、未落地（回歸防護）
- **Given**：`doc-1`
- **When**：`svc.update('SysAdmin', 'doc-1', { secondaryChiefIds: ['99999'] })`
- **Then**：拋 403 `FIELD_WRITE_FORBIDDEN`；`store.updated` 長度為 0（連 scalar 部分都不應落地，因 forbidden 於任何欄位寫入前即整體拒絕，比照既有 `create()` 之 all-or-nothing 語意）
- **AC**：F026 AC「Given 角色對某欄位為『唯讀』, When 透過 API 寫入該欄位, Then 回明確權限錯誤（非靜默忽略），該更新不寫入 DB」（逐字對應，編輯路徑延伸）
- **檔案**：同上

#### TS-B-006 非 ICSOPAdmin（Supervisor）寫使用部門 → FIELD_WRITE_FORBIDDEN（回歸防護，覆蓋另一角色/另一欄位組合）
- **Given**：`doc-1`
- **When**：`svc.update('Supervisor', 'doc-1', { usingDeptIds: ['A2000'] })`
- **Then**：拋 403 `FIELD_WRITE_FORBIDDEN`；未落地
- **AC**：同 TS-B-005
- **檔案**：同上

#### TS-B-007 混合 payload：可寫欄位（documentName）＋禁寫多值（非 ICSOPAdmin）→ 整體拒絕，可寫欄位亦不落地
- **Given**：`doc-1`
- **When**：`svc.update('DeptContact', 'doc-1', { documentName: '新名', secondaryChiefIds: ['1'] })`
- **Then**：拋 403 `FIELD_WRITE_FORBIDDEN`；`documentName` 亦未被更新（all-or-nothing，非「跳過禁寫欄位、其餘照常寫入」）
- **AC**：F026 既有 all-or-nothing 語意於多值欄位之延伸驗證（gap-derived，防止「部分欄位靜默放行」之隱性缺口）
- **檔案**：同上

#### TS-B-008 版本對照 diff（changes）含多值欄位之變更
- **Given**：`doc-1` 現值 `secondaryChiefIds=['20053']`
- **When**：`svc.update('ICSOPAdmin', 'doc-1', { secondaryChiefIds: ['99999'] })`
- **Then**：回傳 `changes` 陣列中含 `{ field: 'secondaryChiefIds', before: ['20053'], after: ['99999'] }`（或等效之陣列快照比對；由於 `beforeRec[k] !== afterRec[k]` 為參照比較，陣列類型需確認 service 現有 diff 邏輯是否需調整為深比對——**若不調整，陣列變更可能被誤判為「相同」而遺漏於 changes，此為實作細節，需 tdd-developer 注意**，本測試案例即為驗證此陷阱之防線）
- **AC**：F011 AC「每個可編輯欄位皆呈現『目前值/新值』對照」之多值延伸（gap-derived）
- **檔案**：同上

#### TS-B-009 changedFields 陣列含 `secondaryChiefIds`/`usingDeptIds`（供 F037 變更事件 payload）
- **Given**：`doc-1`
- **When**：`svc.update('ICSOPAdmin', 'doc-1', { usingDeptIds: ['B0000'] })`
- **Then**：`FakePublisher.events[0].changedFields` 含 `'usingDeptIds'`
- **AC**：既有 `DocumentChangedEvent` 契約（F037 seam）之多值延伸（gap-derived，回歸防護，確保本次修改不遺漏既有事件發布路徑）
- **檔案**：同上

#### TS-B-010 usingDeptIds 全為空白/重複字串正規化後為空陣列 → 等同顯式清空
- **Given**：`doc-1` 現值 `usingDeptIds=['A2000']`
- **When**：`svc.update('ICSOPAdmin', 'doc-1', { usingDeptIds: ['  ', '  '] })`
- **Then**：正規化後為 `[]`；`store.updated[0].patch.usingDeptIds` 為 `[]`（與 TS-B-003 顯式 `[]` 同一行為，驗證正規化與清空語意疊加不衝突）
- **AC**：F014 正規化規則＋B 節清空語意之組合邊界（gap-derived）
- **檔案**：同上

### 2.4 整合測試（`[integration]`，見第 5 節 E 之 TS-E-B-*）

---

## 3. (C) 清單「檔案」＋「連結點程序書」欄資料契約

### 3.1 契約設計

依 prototype 13 實際渲染（見 §3.1.1／§3.1.2）逐一設計 `DocumentListItem` 最小擴充：

```
DocumentListItem 新增：
  icsopPdfBlobPath: string | null   // 供既有下載端點 GET documents/attachments/download?blobPath= 使用
  icsopPdfFileName: string | null   // 供下載鈕 title/aria-label（比照 prototype fileBtn 之 title="下載 {name}"）
  links: DocumentLinkView[]         // 重用既有型別（linkId/targetDocumentId/targetNumber/targetName/targetStatus），不新增型別
```

#### 3.1.1 「檔案」欄（prototype `fileBtn(d.pdf, true)`）
- prototype 僅顯示**該文件自身**之 ICSOP PDF（單一下載鈕、icon=`file-down`），**不含** OJT／使用表單。
- 若該文件無 ICSOP PDF（`icsopPdfBlobPath===null`）→ 顯示「—」（prototype 資料集恆有 pdf，此為既有下游 F016 附件缺口情境之合理推論，非 prototype 逐字資料）。

#### 3.1.2 「連結點程序書」欄（prototype `linkCell(d.links)`）
- 空陣列 → 顯示「—」（prototype 逐字：`if(!links.length) return '<span class="text-slate-300">—</span>'`）。
- 非空 → 每個連結各一個小按鈕，**標籤僅顯示目標文件編號**（`l.split(' ')[0]`，即 prototype 資料 `'ICSOP-SRC-101-2-00 消金審核作業'` 之空格前半段），icon=`download`，`title` 屬性顯示完整「編號 書名」。

### 3.2 設計決策（與 prototype 字面行為之刻意偏離，需人類確認，見末節）

prototype 13 之 `linkCell` 按鈕 `onclick="dl(l,false)"` 語意上是「**下載**該連結目標文件之 PDF」（toast 文案「下載『{name}』」）。若逐字實作，需再曝露每個連結目標的 `blobPath`（巢狀附件資料），大幅超出「minimal contract addition（count and/or summaries）」的授權範圍，且與現有 `DocumentEditPage.tsx`／`DocumentReadonlyPage.tsx` 對連結點的既有真實互動模式（`navigate(/admin/documents/${targetDocumentId})`，即**導覽**至目標文件而非下載）不一致。**本設計選擇維持與其餘頁面一致的「導覽」語意**（視覺上仍沿用 prototype 之 icon/樣式，但點擊改為導覽而非下載），並將此偏離明列於「待人類裁定事項」。

### 3.3 測試案例（unit — `backend/src/documents/documents.service.spec.ts`，`listDocuments（F017）` describe 區塊新增）

#### TS-C-001 清單項含自身 ICSOP PDF 之 blobPath/fileName
- **Given**：文件 `d1` 之 `ATTACHMENT_STORE`（透過新注入之 fake）含 `d1` 的 `ICSOP_PDF`（`fileName='sop.pdf', blobPath='documents/d1/icsop_pdf/abc.pdf'`）
- **When**：`svc.listDocuments({})`
- **Then**：`items[0].icsopPdfBlobPath==='documents/d1/icsop_pdf/abc.pdf'`、`icsopPdfFileName==='sop.pdf'`
- **AC**：F017 Main Flow「14 欄」第 6 項「檔案（ICSOP PDF，下載鈕/圖示）」
- **檔案**：`backend/src/documents/documents.service.spec.ts`

#### TS-C-002 無附件之文件 → icsopPdfBlobPath 為 null
- **Given**：文件 `d2` 無任何 `DOCUMENT_ATTACHMENT` 列
- **When**：`svc.listDocuments({})`
- **Then**：`items` 中 `d2` 之 `icsopPdfBlobPath===null`、`icsopPdfFileName===null`
- **AC**：gap-derived（附件缺口之空狀態）
- **檔案**：同上

#### TS-C-003 OJT 附件不影響「檔案」欄（該欄僅承載 ICSOP PDF）
- **Given**：文件 `d3` 僅有 `OJT_SIGNIN`（無 `ICSOP_PDF`）
- **When**：`svc.listDocuments({})`
- **Then**：`items` 中 `d3` 之 `icsopPdfBlobPath===null`（OJT 不落入此欄，符合 prototype 僅顯示 ICSOP PDF 之設計）
- **AC**：§3.1.1 契約設計（gap-derived）
- **檔案**：同上

#### TS-C-004 清單項含連結點摘要（有連結）
- **Given**：文件 `d1` 有連結指向 `d2`（`documentNumber='ICSOP-SRC-101-2-00', documentName='消金審核作業', status='active'`）
- **When**：`svc.listDocuments({})`
- **Then**：`items` 中 `d1.links` 長度 1，`links[0].targetDocumentId==='d2'`、`targetNumber==='ICSOP-SRC-101-2-00'`、`targetName==='消金審核作業'`、`targetStatus==='active'`
- **AC**：F017 Main Flow「14 欄」第 12 項「連結點程序書」
- **檔案**：同上

#### TS-C-005 無連結點文件 → links 為空陣列
- **Given**：文件 `d4` 無任何 `DOCUMENT_LINK`
- **When**：`svc.listDocuments({})`
- **Then**：`items` 中 `d4.links` 為 `[]`（前端渲染「—」）
- **AC**：F017 Edge Cases「文件無連結點程序書（0 筆）：該欄留空或顯示『—』」（逐字對應）
- **檔案**：同上

#### TS-C-006 一文件有多個連結點 → links 陣列含全部
- **Given**：文件 `d1` 連結 `d2`、`d5` 兩筆
- **When**：`svc.listDocuments({})`
- **Then**：`d1.links` 長度 2，含兩筆目標摘要
- **AC**：F017「連結點程序書（0..*）」之多筆情境
- **檔案**：同上

#### TS-C-007 連結目標已作廢 → links 摘要之 targetStatus 反映最新狀態（非快照）
- **Given**：文件 `d1` 連結 `d6`（`d6.status` 由 `active` 改為 `void`）
- **When**：`svc.listDocuments({})`
- **Then**：`d1.links[0].targetStatus==='void'`（即時查詢，非連結建立當下之快照）
- **AC**：F015「連結目標為『作廢』…清單標示目標狀態」之清單面延伸（既有 `getDocumentLinks` 單筆版本已有此語意，本案例驗證批次富化版本一致）
- **檔案**：同上

#### TS-C-008 `attachmentStore`／`linkStore` 皆未注入時之防禦性降級（既有測試相容性）
- **Given**：`new DocumentsService(store)`（不傳 attachmentStore/linkStore，比照既有多處單元測試之最小建構）
- **Then**：`listDocuments({})` 不拋錯，`items[*].icsopPdfBlobPath===null`、`links===[]`（優雅降級，不因新依賴破壞既有大量既存測試）
- **AC**：gap-derived（向下相容防護，確保本次修改不破壞既有 `documents.service.spec.ts` 中未注入新依賴之既有案例）
- **檔案**：同上

### 3.4 整合測試（`[integration]`，見第 5 節 E 之 TS-E-C-*）

---

## 4. (D) 前端串接

### 4.1 D1 — 編輯頁：次要室長／使用部門改為可編輯（prototype 15 §「制定組織與當責室長」）

依 prototype 15 markup（`secChips`/`sec_input`／`useChips`/`use_input`），兩欄位改用與既有 `links`／使用表單相同的 `MultiSearchCombobox` 模式（`DocumentEditPage.tsx` 已有前例：`edLinks`／`edForms`），取代現有唯讀 chips 區塊。

**測試案例（`frontend/src/pages/DocumentEditPage.test.tsx`）**：

#### TS-D-001 ICSOPAdmin 可透過可搜尋下拉新增次要室長
- **Given**：`mockAuth('ICSOPAdmin')`、頁面已載入（`VIEW.secondaryChiefIds=['20053']`）
- **When**：於「當責室長-次要」輸入框輸入查詢字並點選一筆新選項（比照既有 `文件連結點` 互動：`userEvent.type(screen.getByLabelText('當責室長-次要'), '林')` → `click(screen.findByRole('option', {name:/林建宏/}))`）
- **Then**：畫面出現新 chip；「已變更」標示顯示
- **AC**：F011 AC「每個可編輯欄位皆呈現『目前值/新值』對照」（延伸至 F014 多值編輯）
- **檔案**：`frontend/src/pages/DocumentEditPage.test.tsx`

#### TS-D-002 移除既有次要室長 chip
- **Given**：同上，已有 1 筆次要室長 chip
- **When**：點擊該 chip 之移除按鈕（`aria-label` 或既有 `MultiSearchCombobox` 之 remove 互動，比照 `rmLink` 對應之 React 版本）
- **Then**：chip 消失；「已變更」標示顯示
- **AC**：同上
- **檔案**：同上

#### TS-D-003 儲存時 secondaryChiefIds／usingDeptIds 隨 PATCH 整批送出
- **Given**：已新增 1 筆次要室長、移除 1 筆使用部門
- **When**：點擊「儲存」
- **Then**：`updateDocument` 被呼叫，payload 含 `expect.objectContaining({ secondaryChiefIds: [...新集合], usingDeptIds: [...新集合] })`（比照既有 F015 連結點測試 `TS-D` 之斷言手法）
- **AC**：B 節契約（gap-derived，前後端串接驗證）
- **檔案**：同上

#### TS-D-004 未變更次要室長／使用部門時，儲存 payload 不含這兩鍵（維持既有其餘欄位之選擇性 patch 慣例）
- **Given**：僅修改 `documentName`，未觸碰次要室長/使用部門
- **When**：點擊「儲存」
- **Then**：`updateDocument` payload **不含** `secondaryChiefIds`／`usingDeptIds` 鍵（沿用既有 `changed()` 判斷邏輯，僅送出實際變更欄位）
- **AC**：對應後端 TS-B-004「省略鍵→不觸及」，前後端一致性驗證
- **檔案**：同上

#### TS-D-005 Supervisor（唯讀角色）→ 次要室長/使用部門仍為唯讀顯示，無新增/移除入口
- **Given**：`mockAuth('Supervisor')`
- **When**：頁面渲染
- **Then**：不出現搜尋輸入框／移除按鈕（唯讀 chips，與其餘唯讀欄位一致）
- **AC**：F026「主管…唯讀」之多值欄位延伸
- **檔案**：同上

#### TS-D-006 欄位面拒絕（FIELD_WRITE_FORBIDDEN）之錯誤訊息呈現
- **Given**：`mockAuth('ICSOPAdmin')`（前端誤放行但後端拒絕之防禦情境，例如 session 角色與後端不同步）、`updateDocument` mock 拋出 `ApiError('FIELD_WRITE_FORBIDDEN')`
- **When**：儲存
- **Then**：畫面顯示既有 `ERROR_MSG['FIELD_WRITE_FORBIDDEN']`＝「無權修改此欄位」（既有錯誤映射表已含此鍵，驗證新欄位走同一錯誤處理路徑、不需新增映射）
- **AC**：F026 Error Scenarios（既有錯誤處理路徑之回歸防護）
- **檔案**：同上

### 4.2 D2 — 附件顯示：編輯頁＋唯讀頁（prototype 15/16）

新增 API：`getDocumentAttachments(documentId): Promise<DocumentAttachmentRecord[]>`（`GET /admin/documents/:documentId/attachments`，對映 A 節端點；重用既有 `DocumentAttachmentRecord` 型別）。

#### D2a — 編輯頁（prototype 15 附件卡片：現有檔名＋下載＋取代）

現行 `ReplaceCard` 元件僅有上傳/取代，無現有檔名/下載——依 prototype 15（`<span>車輛分期進件作業_v1.3.pdf</span>` + 下載鈕 + 取代鈕）需擴充。

#### TS-D-007 已上傳 ICSOP PDF 時，編輯頁顯示現有檔名與下載鈕
- **Given**：`getDocumentAttachments` mock 回傳 `[{type:'ICSOP_PDF', fileName:'sop_v1.3.pdf', blobPath:'...', ...}]`
- **When**：頁面載入
- **Then**：「ICSOP PDF」卡片顯示檔名 `sop_v1.3.pdf`、出現「下載」按鈕（比照 prototype 15 第 212-216 行結構）與既有「取代」按鈕並存
- **AC**：F016 AC1「可於詳情下載」之編輯頁呈現面（gap-derived）
- **檔案**：`frontend/src/pages/DocumentEditPage.test.tsx`

#### TS-D-008 尚未上傳 ICSOP PDF 時，卡片顯示空狀態（僅上傳/取代入口，無檔名/下載鈕）
- **Given**：`getDocumentAttachments` mock 回傳 `[]`
- **When**：頁面載入
- **Then**：「ICSOP PDF」卡片不顯示檔名區塊與下載鈕，僅顯示上傳/取代之既有互動
- **AC**：gap-derived（空狀態）
- **檔案**：同上

#### TS-D-009 點擊下載按鈕呼叫既有受控下載端點（`GET documents/attachments/download`）
- **Given**：已顯示 ICSOP PDF（`blobPath='documents/d1/icsop_pdf/x.pdf'`）
- **When**：點擊「下載」
- **Then**：呼叫既有下載 API（比照 `DocumentReadonlyPage.tsx` 之 `onDownloadForm` 手法，開新分頁 `window.open(grant.url,...)`）並帶入該 `blobPath`
- **AC**：F016 AC1（延伸）
- **檔案**：同上

#### TS-D-010 唯讀角色（Supervisor）：附件卡片僅顯示下載，不顯示取代入口（既有規則，僅補現有檔名顯示的疊加場景）
- **Given**：`mockAuth('Supervisor')`、已上傳 ICSOP PDF
- **When**：頁面渲染
- **Then**：顯示現有檔名＋下載按鈕；不顯示「取代」按鈕（既有 `write-only` 規則延伸）
- **AC**：F026「主管…可下載但不可上傳/取代」（逐字對應）
- **檔案**：同上

#### D2b — 唯讀頁（prototype 16 `renderAttach()`：ICSOP PDF／OJT／使用表單合併於同一清單）

現行 `DocumentReadonlyPage.tsx`「附件（僅下載）」區塊**僅**列出使用表單，缺 ICSOP PDF／OJT 兩列（程式內註解明載此缺口）。依 prototype 16，三類需合併於同一清單，且**僅 ICSOP PDF** 那列顯示「下載燒錄浮水印」徽章（`wm:true` 僅第一項）。

#### TS-D-011 唯讀頁附件清單含 ICSOP PDF、OJT、使用表單三類，順序與徽章符合 prototype
- **Given**：`getDocumentAttachments` 回傳 ICSOP_PDF＋OJT_SIGNIN 各一筆、`getDocumentForms` 回傳 2 筆使用表單
- **When**：頁面載入
- **Then**：附件清單依序渲染：「檔案（ICSOP PDF）」（含「下載燒錄浮水印」徽章）→「OJT 實體簽到表」（無徽章）→ 使用表單 × 2（無徽章）；每列皆有「下載」按鈕（比照 prototype 16 §174-189 `renderAttach` 之 items 陣列順序與 `wm` 旗標）
- **AC**：F017/F016 之唯讀頁呈現面（gap-derived，直接對應 prototype 16 字面渲染）
- **檔案**：`frontend/src/pages/DocumentReadonlyPage.test.tsx`

#### TS-D-012 僅部分附件存在（如僅 ICSOP PDF，無 OJT）→ 清單僅顯示存在者
- **Given**：`getDocumentAttachments` 僅回傳 ICSOP_PDF
- **When**：頁面載入
- **Then**：清單僅有「檔案（ICSOP PDF）」＋既有使用表單列；無「OJT 實體簽到表」列（非顯示空值列）
- **AC**：gap-derived（部分附件之呈現）
- **檔案**：同上

#### TS-D-013 三類附件與使用表單皆無 → 移除既有「尚無關聯使用表單」單一空狀態，改為整合空狀態或維持個別段落皆空
- **Given**：`getDocumentAttachments` 回傳 `[]`、`getDocumentForms` 回傳 `[]`
- **When**：頁面載入
- **Then**：附件區塊顯示統一空狀態文案（不斷言逐字文案，因 prototype 16 未涵蓋全空情境；僅斷言不拋錯、不顯示個別附件列）
- **AC**：gap-derived（prototype 未定義之推論情境，見待人類裁定事項）
- **檔案**：同上

#### TS-D-014 點擊任一附件之「下載」按鈕皆呼叫既有受控下載端點並顯示稽核提示
- **Given**：ICSOP PDF 一筆
- **When**：點擊該列「下載」
- **Then**：呼叫下載端點取得 URL、開新分頁；顯示「已寫入稽核 DOWNLOAD」提示（比照既有 `onDownloadForm` 之 `notice` 文案模式，ICSOP PDF/OJT 走同一下載 API、非另開新 API）
- **AC**：F016 Postconditions「供 F020 前台檢視/下載來源」之唯讀頁延伸；NFR-002
- **檔案**：同上

### 4.3 D3 — 清單頁：「檔案」欄＋「連結點程序書」欄（prototype 13）

#### TS-D-015 「檔案」欄：有 ICSOP PDF 之列顯示下載按鈕
- **Given**：`getDocuments` mock 回傳項目含 `icsopPdfBlobPath='documents/d1/...'`、`icsopPdfFileName='sop.pdf'`
- **When**：清單渲染
- **Then**：該列「檔案」欄顯示可點擊按鈕（icon＝`file-down`，比照 prototype `fileBtn`），`title`／`aria-label` 含檔名
- **AC**：F017 Main Flow「14 欄」第 6 項
- **檔案**：`frontend/src/pages/DocumentListPage.test.tsx`

#### TS-D-016 「檔案」欄：無 ICSOP PDF 之列顯示「—」
- **Given**：項目 `icsopPdfBlobPath===null`
- **When**：清單渲染
- **Then**：該列「檔案」欄顯示「—」（非按鈕）
- **AC**：gap-derived（附件缺口空狀態）
- **檔案**：同上

#### TS-D-017 點擊「檔案」欄下載按鈕呼叫既有下載端點
- **Given**：項目含 `icsopPdfBlobPath`
- **When**：點擊該列檔案下載按鈕
- **Then**：呼叫既有下載 API 並帶入該 `blobPath`（與 D2 之下載互動共用同一 API 呼叫方式，不新增下載邏輯）
- **AC**：同 TS-D-015
- **檔案**：同上

#### TS-D-018 「連結點程序書」欄：有連結之列顯示每筆連結之編號 pill
- **Given**：項目 `links=[{linkId:'l1', targetDocumentId:'d2', targetNumber:'ICSOP-SRC-101-2-00', targetName:'消金審核作業', targetStatus:'active'}]`
- **When**：清單渲染
- **Then**：該列「連結點程序書」欄顯示 1 個 pill，可見文字為 `ICSOP-SRC-101-2-00`（僅編號，比照 prototype `l.split(' ')[0]`），`title` 含完整「編號＋書名」
- **AC**：F017 Main Flow「14 欄」第 12 項
- **檔案**：同上

#### TS-D-019 「連結點程序書」欄：無連結之列顯示「—」
- **Given**：項目 `links=[]`
- **When**：清單渲染
- **Then**：顯示「—」（逐字對應 F017 Edge Cases）
- **AC**：F017 Edge Cases「文件無連結點程序書（0 筆）：該欄留空或顯示『—』」
- **檔案**：同上

#### TS-D-020 一列多個連結 → 顯示多個 pill
- **Given**：項目 `links` 長度 2
- **When**：清單渲染
- **Then**：該列顯示 2 個 pill
- **AC**：同 TS-D-018
- **檔案**：同上

#### TS-D-021 點擊連結點 pill → 導覽至目標文件（設計決策：非下載，見 §3.2）
- **Given**：項目 `links=[{targetDocumentId:'d2', ...}]`
- **When**：點擊該 pill
- **Then**：`navigate` 被呼叫並帶入 `/admin/documents/d2`（與 `DocumentEditPage.tsx`／`DocumentReadonlyPage.tsx` 既有連結點導覽行為一致）
- **AC**：§3.2 設計決策（gap-derived，**此案例之精確互動語意待人類確認**，見待人類裁定事項）
- **檔案**：同上

---

## 5. (E) 整合測試（`*.itest.ts`，`backend/test/int/`，`npm run test:int`）

### 5.0 前置修正（阻擋，非本節新增案例，但為執行本節測試之必要條件）

`backend/test/int/harness.ts::cleanupMarkers()` 目前**未清除 `DOCUMENT_ATTACHMENT`**（僅清 `DOCUMENT_LINK`／`DOC_SECONDARY_CHIEF`／`DOC_USING_DEPT`／`ICSOP_DOCUMENT`／`LIFECYCLE`／`ACCOUNT`）。`DOCUMENT_ATTACHMENT.documentId` 之 FK 為 `NO ACTION`（無 CASCADE，migration 註解明載「刪文件之連帶清理由 app 層處理」）。**任何本節上傳附件至 marker 文件的 itest，若不先清除 `DOCUMENT_ATTACHMENT`，後續 `cleanupMarkers()` 執行 `DELETE FROM ICSOP_DOCUMENT` 時會因 FK 違反而失敗（`.catch(()=>undefined)` 會靜默吞掉此錯誤，導致 marker 文件殘留、下次執行時编號碰撞或資料越積越多）**。需於 `cleanupMarkers()` 新增：
```
await q(`DELETE FROM [DOCUMENT_ATTACHMENT] WHERE [documentId] IN ${markerDocs}`).catch(() => undefined);
```
置於刪除 `DOC_SECONDARY_CHIEF`/`DOC_USING_DEPT` 之後、刪除 `ICSOP_DOCUMENT` 之前（同一順序邏輯）。此修正影響所有現有/新增 itest 套件之清理正確性，非僅本節案例，故列為前置阻擋項而非獨立測試案例。

### 5.1 (A) 附件列表 — 新檔 `backend/test/int/attachments.itest.ts`

#### TS-E-A-001 上傳 ICSOP PDF＋OJT → GET 列表回傳兩筆，欄位與真實 Blob/DB 落地一致
- **Given**：`bootIntApp()`、建立 marker 循環＋marker 文件（`ZZINT-` 前綴，比照 `f014.itest.ts` 之 lifecycle+document 建立手法）
- **When**：`POST .../attachments/icsop-pdf`（multipart，supertest `.attach('file', buffer, {filename, contentType})`）與 `POST .../attachments/ojt` 各上傳一次，再 `GET .../attachments`
- **Then**：回應狀態 200，陣列長度 2，`type` 分別為 `ICSOP_PDF`／`OJT_SIGNIN`；直查 `DOCUMENT_ATTACHMENT` 資料表確認兩筆列存在且 `blobPath` 與回應一致
- **AC**：A 節契約 + F016 AC1/AC2
- **檔案**：`backend/test/int/attachments.itest.ts`（新檔）

#### TS-E-A-002 空案例：文件存在但未上傳任何附件 → GET 回 200 空陣列
- **Given**：另建一筆 marker 文件（不上傳附件）
- **When**：`GET .../attachments`
- **Then**：200、`[]`
- **AC**：A 節「empty case」
- **檔案**：同上

#### TS-E-A-003 非存在文件 → 404 DOCUMENT_NOT_FOUND
- **Given**：任意不存在之 UUID
- **When**：`GET admin/documents/{隨機UUID}/attachments`
- **Then**：404
- **AC**：A 節「non-existent document case」
- **檔案**：同上

#### TS-E-A-004 未登入 → 401
- **Given**：不帶 Cookie
- **When**：`GET .../attachments`
- **Then**：401
- **AC**：A 節「unauthenticated 401」
- **檔案**：同上

### 5.2 (B) 編輯側多值替換 — 擴充既有 `backend/test/int/f014.itest.ts`（新增 `describe` 區塊，沿用既有 lifecycle/marker 設置，不重開檔案）

#### TS-E-B-001 建立含 2 次要室長 → PATCH 改為不同的 2 次要室長 → 真表列確實被取代（非疊加）
- **Given**：建立文件，`secondaryChiefIds=['20053','20541']`（比照既有 F014-int 建立案例）
- **When**：`PATCH /admin/documents/:id` 送 `{ secondaryChiefIds: ['10001'] }`
- **Then**：`GET :id` 回傳 `secondaryChiefIds` 為 `['10001']`；直查 `DOC_SECONDARY_CHIEF WHERE documentId=:id` 僅 1 筆 `employeeNo='10001'`（原 `20053`/`20541` 兩筆已被刪除，非仍殘留 3 筆）
- **AC**：B 節核心驗收（真 DB 取代，任務 (E) 明文要求）
- **檔案**：`backend/test/int/f014.itest.ts`

#### TS-E-B-002 PATCH 使用部門為空陣列 → 真表列全數刪除
- **Given**：文件現有 `usingDeptIds=['A2000','B0000']`
- **When**：`PATCH` 送 `{ usingDeptIds: [] }`
- **Then**：`GET :id` 回傳 `usingDeptIds=[]`；直查 `DOC_USING_DEPT WHERE documentId=:id` 為 0 筆
- **AC**：B 節「empty array → clears all」
- **檔案**：同上

#### TS-E-B-003 PATCH 未帶多值鍵 → 真表列不受影響
- **Given**：文件現有 `secondaryChiefIds=['20053']`
- **When**：`PATCH` 僅送 `{ documentName: '改名' }`
- **Then**：`GET :id` 之 `secondaryChiefIds` 仍為 `['20053']`；`DOC_SECONDARY_CHIEF` 表列數不變
- **AC**：B 節「omitted key → no change」
- **檔案**：同上

#### TS-E-B-004（既有已覆蓋，交叉引用不重複設計）非 ICSOPAdmin 寫多值 → 403，真表不受影響
- 沿用既有 `f014.itest.ts::'非 ICSOPAdmin（SysAdmin）建立文件 → 403…'` 案例之模式，於編輯路徑補一等效案例：`PATCH` by SysAdmin cookie 送 `{ secondaryChiefIds: ['x'] }` → 403，`DOC_SECONDARY_CHIEF` 表列數不變。
- **AC**：F026 編輯路徑之真實 HTTP 層驗證
- **檔案**：同上

### 5.3 (C) 清單富化 — 擴充既有 `backend/test/int/documents.itest.ts`

#### TS-E-C-001 清單回應含真實 join 之 icsopPdfBlobPath 與 links 摘要
- **Given**：建立文件 A（上傳 ICSOP PDF）、文件 B（連結至 A）
- **When**：`GET /admin/documents`
- **Then**：回應中 B 項之 `links[0].targetDocumentId===A.id`、`targetNumber===A.documentNumber`；A 項之 `icsopPdfBlobPath` 非 null 且與上傳回應一致
- **AC**：C 節契約，真實 MSSQL join 正確性（非 unit FakeStore 可驗證之範疇）
- **檔案**：`backend/test/int/documents.itest.ts`

#### TS-E-C-002 分頁情境下富化資料仍逐列正確對應（非錯位）
- **Given**：3 筆文件，各自不同的附件/連結組合
- **When**：`GET /admin/documents?pageSize=2&page=1` 與 `page=2`
- **Then**：兩頁各自回傳項目之 `icsopPdfBlobPath`／`links` 與其 `id` 正確對應（防止批次富化時 Map 對應鍵誤用導致跨列資料錯置）
- **AC**：gap-derived（批次富化實作正確性之關鍵回歸點）
- **檔案**：同上

---

## 6. AC → TS 覆蓋對照表

| AC / 來源 | 內容摘要 | 對應 TS |
|---|---|---|
| 任務 A：RBAC 兩層 | 功能面 read gate + 資源存在性 | TS-A-001~007, TS-A-008~009, TS-E-A-001~004 |
| 任務 A：empty case | 文件存在、無附件 | TS-A-003, TS-E-A-002 |
| 任務 A：non-existent document | 文件不存在 | TS-A-004, TS-E-A-003 |
| 任務 A：unauthenticated 401 | 未登入 | TS-E-A-004（controller guard 層，unit 以 route metadata TS-A-008 佐證） |
| F026 AC「唯讀欄位寫入回明確錯誤、不寫入 DB」 | 逐字對應 | TS-B-005, TS-B-006, TS-B-007, TS-E-B-004 |
| 任務 B：ICSOPAdmin 合法寫入實際落地 | 核心新行為 | TS-B-001, TS-E-B-001 |
| 任務 B：正規化與 create 路徑一致 | trim/去空/去重 | TS-B-002 |
| 任務 B：empty array → clears all | 顯式清空 | TS-B-003, TS-E-B-002 |
| 任務 B：omitted key → no change | partial patch 語意 | TS-B-004, TS-E-B-003 |
| F011 AC1「目前值/新值對照」 | 多值編輯延伸 | TS-B-008, TS-D-001~004 |
| F017 Main Flow「檔案」欄 | ICSOP PDF 下載 | TS-C-001~003, TS-D-015~017, TS-E-C-001 |
| F017 Main Flow「連結點程序書」欄 | 連結摘要 | TS-C-004~007, TS-D-018~021, TS-E-C-001 |
| F017 Edge「無連結點顯示『—』」 | 逐字對應 | TS-C-005, TS-D-019 |
| F016 AC1「可於詳情下載」 | 編輯頁/唯讀頁附件顯示 | TS-D-007~014 |
| F026「主管可下載不可上傳」 | 唯讀角色附件互動 | TS-D-010 |
| gap-derived：向下相容/防禦性降級 | 新依賴不破壞既有測試 | TS-A-005, TS-C-008 |
| gap-derived：harness 前置修正 | itest 清理正確性 | §5.0（阻擋項，非獨立 TS） |

---

## 7. 測試層級與檔案總覽

| 層級 | 檔案 | 新增/擴充 | 案例數 |
|---|---|---|---|
| unit | `backend/src/attachments/attachments.service.spec.ts` | 擴充 | 7（TS-A-001~007）|
| unit | `backend/src/attachments/attachments-controller-routes.spec.ts` | **新檔** | 2（TS-A-008~009）|
| unit | `backend/src/documents/documents.service.spec.ts` | 擴充（取代 F014-C7） | 10（TS-B-001~010） |
| unit | `backend/src/documents/documents.service.spec.ts` | 擴充（`listDocuments` 區塊） | 8（TS-C-001~008） |
| frontend | `frontend/src/pages/DocumentEditPage.test.tsx` | 擴充 | 10（TS-D-001~010） |
| frontend | `frontend/src/pages/DocumentReadonlyPage.test.tsx` | 擴充 | 4（TS-D-011~014） |
| frontend | `frontend/src/pages/DocumentListPage.test.tsx` | 擴充 | 7（TS-D-015~021） |
| integration | `backend/test/int/attachments.itest.ts` | **新檔** | 4（TS-E-A-001~004） |
| integration | `backend/test/int/f014.itest.ts` | 擴充 | 4（TS-E-B-001~004） |
| integration | `backend/test/int/documents.itest.ts` | 擴充 | 2（TS-E-C-001~002） |
| **合計** | | | **58** |

（unit 27＋frontend 21＋integration 10）

---

## 8. 待人類裁定事項（Open Questions）

1. **【需人類裁定】清單頁「連結點程序書」pill 的點擊語意（§3.2 / TS-D-021）**：prototype 13 之 `linkCell` 字面是「下載目標文件之 PDF」（`dl()` toast 文案為「下載」），但逐字實作需額外曝露每個連結目標的 `blobPath`（巢狀附件資料），超出「minimal contract addition」範圍，且與 `DocumentEditPage.tsx`／`DocumentReadonlyPage.tsx` 既有「連結點=導覽至目標文件」之真實互動模式不一致。本設計選擇「導覽」語意（TS-D-021），但這是對 prototype 字面文案的**刻意偏離**，需產品/架構確認是否可接受，或改為擴充契約支援巢狀下載。

2. **【需人類裁定】harness.ts 之 `cleanupMarkers()` 需新增 `DOCUMENT_ATTACHMENT` 清理（§5.0）**：這是既有整合測試基礎設施的既存缺口（非本次任務範圍內產生，但本次新增之附件 itest 會首次觸發此缺口），建議與 tdd-developer 一併排入本次修改範圍，否則附件相關 itest 會在第二次執行時因殘留資料/FK 衝突而不穩定。

3. **【需人類裁定】唯讀頁三類附件皆缺席時的整合空狀態文案（TS-D-013）**：prototype 16 的 mock 資料恆有全部 4 筆附件（PDF/OJT/2×表單），未涵蓋「全空」情境之逐字文案。本設計僅斷言「不拋錯、不顯示個別附件列」，未指定精確文案，需 UI 設計或人類補充逐字文案後才能收斂為精確斷言。

4. **【建議，非阻擋】C 節之批次富化可能引入 `DocumentsModule` ↔ `AttachmentsModule`/`DOCUMENT_LINK_STORE` 之提供者相依**：`DocumentsService` 需新增可選注入 `ATTACHMENT_STORE`（供 icsopPdf 富化）。此為 store-token 對 store-token 之相依（非 Service 對 Service），與既有 `DOCUMENT_LINK_STORE` 之注入模式一致，理論上不構成循環相依；但若 `AttachmentsModule`/`DocumentsModule` 之 Nest module 匯出/匯入未妥善安排，仍可能出現模組解析順序問題，建議 tdd-developer 實作時留意（測試設計本身不受此影響，因 unit 測試皆以 Fake 注入，不經真實 Nest DI 容器）。

5. **【已釐清，供 tdd-developer 參考，非待裁定】F026 編輯路徑之 forbidden 判定其實已經正確**（見 §2.1），本次修改的風險點在於「移除剔除邏輯時，是否不小心也移動或刪除了 `classifyFields` 呼叫本身」，TS-B-005~007 即為此風險之回歸防線。
