---
type: implementation-log
feature_id: F039
feature_name: 附錄管理（附錄池 ＋ 文件關聯與顯示順序 sortOrder）
epic_story: E10 / US-100、US-101、US-102
status: complete
last_updated: 2026-08-07
---

# F039 附錄管理 — 實作紀錄（Uncle-Bob 約束環：生產程式碼側）

> **角色分工**：本次採 test-generator（`tg-appendix`）↔ tdd-implementation（`ti-appendix`）之約束環模式。
> 測試（後端 Jest 單元、前端 Vitest、Playwright fidelity）**全部由 test-generator 撰寫且對實作全盲**；
> 本 agent **未新增／修改／刪除／跳過任何測試檔或測試設定**，僅撰寫生產程式碼。
> 遇到測試缺陷或與 spec 牴觸之處，一律以 `SendMessage` 向 `tg-appendix` 申訴、由其裁決並自行修改（見 §五）。
>
> **權威來源**：`docs/specs/features/F039-appendix-management.md`（34 條 AC）、
> `docs/specs/architecture-spec.md` §3.6／§4.9／§5.10（7 項決策）、`docs/specs/data-model.md`
> `#appendix-entity`／`#doc-appendix`／`#auditlog-entity`、
> `prototypes/24-appendix-management.html`（版面權威）＋ `14`／`15`／`16`／`04`（附錄區塊）。

---

## 一、測試結果總覽（本 agent 實跑，序列執行）

### 後端（`cd backend && npm test`）

| 項目 | 結果 |
|---|---|
| Test Suites | **111 total**（103 既有 ＋ 8 由紅轉綠） |
| Tests | **1361**（baseline 1203 ＋ 158 新增／修復） |
| 全套件 | 109 passed / 2 failed → **2 支為 CPU 競用假紅**，單獨重跑全綠（見下） |
| `npx tsc --noEmit` | **乾淨（0 error）** |
| `npm run deps:check`（dependency-cruiser 度量閘） | **✔ no dependency violations（271 modules / 749 dependencies）** |

**由紅轉綠之 8 支 suite**：
| 檔案 | 原紅因 |
|---|---|
| `src/appendices/appendices.service.spec.ts` | TS2307：`./appendices.service`／`./appendices.store` 不存在 |
| `src/appendices/appendices.document-association.service.spec.ts` | 同上 |
| `src/appendices/appendices.controller.spec.ts` | TS2307：`./appendices.controller` 不存在 |
| `src/appendices/audit-writer-recorder.adapter.spec.ts` | TS2307：`./audit-writer-recorder.adapter` 不存在 |
| `src/rbac/function-matrix.spec.ts` | `FunctionKey.APPENDIX_MANAGEMENT` 不存在 |
| `src/rbac/field-matrix.spec.ts` | `FieldKey.APPENDICES` 不存在 |
| `src/audit/audit-event.spec.ts` | `targetType:'APPENDIX'` 非合法聯集成員、`row.appendixId` 不存在 |
| `src/audit/access-history-filter.spec.ts` | `kindToTargetTypes('文件')` 未含 `'APPENDIX'` |

**2 支假紅之處置（非本次變更所致）**：
`src/public/pdf-burner.spec.ts`、`src/lifecycle/lifecycle-change-diff.service.spec.ts` 各 1 條
`[NFR]` 效能案例於全套件執行時 `Exceeded timeout of 5000 ms`。兩者皆為 pdf-lib 真實燒錄之
耗時案例，與附錄功能無任何程式路徑交集（附錄下載**不燒錄浮水印**）。單獨重跑：

```
npx jest src/public/pdf-burner.spec.ts src/lifecycle/lifecycle-change-diff.service.spec.ts --runInBand
→ Test Suites: 2 passed, 2 total ／ Tests: 13 passed, 13 total ／ Time: 29.019 s
```
（全套件執行時該單一 suite 耗時 518 s vs 隔離執行 29 s，為多 agent 併行之 CPU 競用所致。）

### 前端（`cd frontend && npx vitest run`）

| 項目 | 結果 |
|---|---|
| Tests | **574 total（574 passed / 0 failed）** |
| `npx tsc --noEmit` | **乾淨（0 error）** |

新增／修復之 5 檔：
| 檔案 | 內容 |
|---|---|
| `src/pages/AppendixManagementPage.test.tsx`（新增，19 tests） | AC-02/03/05/06/08/10/11/12/15/16/17/31/32/33 ＋ G-ADM-024 上傳者顯示 |
| `src/pages/DocumentCreatePage.test.tsx`（+7） | AC-18/19/20/21/22 ＋「未選任何附錄不呼叫」 |
| `src/pages/DocumentEditPage.test.tsx`（+6） | AC-21/23/24 ＋ 高風險 #4（PUT replace-set）＋ 唯讀角色呈現 |
| `src/pages/DocumentReadonlyPage.test.tsx`（+3） | AC-25/26 ＋ 後台個別下載 |
| `src/pages/PublicDocumentDetailPage.test.tsx`（+4） | AC-25/26/27/29 |

> 先前 77 條「被連坐」之既有測試（因 `vi.mocked(api.getDocumentAppendices)` 於 setup 期
> TypeError 而整檔失敗）已隨端點 export 落地全數回綠。

### Playwright（`e2e/tests/fidelity-appendix-*.spec.ts`，3 支）

**本 agent 未執行**——需整合環境（真實後端 ＋ SOP DB ＋ ICSOPAdmin storageState），見 §六。
生產程式碼已按其斷言之 DOM 契約實作（六欄表頭、`搜尋附錄名稱…` placeholder、格式篩選 option、
`上傳附錄` 按鈕、`查無符合的附錄` 空狀態、側欄「附錄管理」項、
`[data-appendix-item]` ＋ `data-appendix-order` ＋ `[data-appendix-name]` ＋ `[data-appendix-empty]`、
無 `draggable` 屬性）。

### AC ↔ 覆蓋對照

| AC | 覆蓋處 |
|---|---|
| AC-01～AC-07（上傳與驗證） | `appendices.service.spec.ts`（後端）＋ `AppendixManagementPage.test.tsx`（前端 UI） |
| AC-08～AC-10（移除） | 同上 |
| AC-11～AC-15（覆蓋更新） | 同上（AC-15 驗證優先序前後端各一） |
| AC-16～AC-17（清單／關聯檢視） | `AppendixManagementPage.test.tsx` ＋ `listPoolOverview` 單元 |
| AC-18～AC-24（關聯與排序） | `appendices.document-association.service.spec.ts`（sortOrder 不變式）＋ Create/Edit 頁 Vitest（UI 互動） |
| AC-25～AC-26（詳情呈現） | `listByDocument` 單元 ＋ Readonly／PublicDetail Vitest ＋ Playwright fidelity |
| AC-27～AC-30（下載與稽核） | `audit-writer-recorder.adapter.spec.ts`、`audit-event.spec.ts`、`access-history-filter.spec.ts`、`appendices.service.spec.ts` |
| AC-31～AC-34（權限） | `appendices.service.spec.ts`（服務層守門鏈）＋ `AppendixManagementPage.test.tsx`（前端自我守門） |

---

## 二、變更檔案清單

### 後端 — 新增（`backend/src/appendices/`，architecture §3.6 決策一「獨立複製、不抽泛型」）

| 檔案 | 說明 |
|---|---|
| `appendices.store.ts` | 資料存取邊界介面 ＋ DI symbols（`APPENDIX_POOL_STORE`／`AUDIT_RECORDER`／`DOCUMENT_EXISTENCE_CHECKER`／`UPLOADER_DIRECTORY`／`UPLOADER_ORG_RESOLVER`）、`AppendixRecord`／`AppendixPoolItem`／`DocumentAppendixRecord`／`AppendixAuditEvent` |
| `appendices.service.ts` | 池 CRUD ＋ 關聯排序 ＋ 下載 ＋ 兩道守門鏈。匯出 `APPENDIX_NAME_MAX_LENGTH=400`、`SHARED_OVERWRITE_MIN_REFS=2`、`IN_USE_MIN_REFS=1`、純函式 `resolveAppendixName()`／`buildAppendixBlobPath()` |
| `appendices.controller.ts` | 10 條路由（見 §三）；守門鏈 `SessionGuard→RolePermissionGuard` |
| `typeorm-appendices.store.ts` | `APPENDIX_POOL`／`DOC_APPENDIX` 之 TypeORM 實作，含 replace-set 單一交易與 `sp_getapplock` 序列化 |
| `typeorm-uploader-directory.ts` | accountId→姓名/orgCode（複製自 usage-forms，含非 GUID 過濾之既有防呆） |
| `typeorm-document-existence.checker.ts` | `DOCUMENT_NOT_FOUND` 之唯讀 join（**F039 對 F018 之刻意新增要求**） |
| `audit-writer-recorder.adapter.ts` | `AppendixAuditEvent` → `AuditAccessEvent`；**正確轉送 documentId**（AC-27） |
| `appendices.module.ts` | 模組組裝；`imports: [AuthModule, RbacModule, StorageModule, AuditModule, OrgDirectoryModule]` |

### 後端 — 新增（entity ／ migration）

| 檔案 | 說明 |
|---|---|
| `src/database/entities/appendix-pool.entity.ts` | `APPENDIX_POOL`（name nvarchar(400)／blobPath／format／size bigint／uploadedBy／uploadedAt datetime2） |
| `src/database/entities/doc-appendix.entity.ts` | `DOC_APPENDIX`（複合 PK (documentId, appendixId) ＋ `sortOrder int` ＋ `IX_DOC_APPENDIX_appendixId`） |
| `src/database/migrations/1723507200000-appendix.ts` | 建兩張表（**刻意不建** `(documentId, sortOrder)` 唯一索引，OQ-E10-02） |
| `src/database/migrations/1723593600000-audit-log-appendix-id.ts` | `ALTER TABLE [AUDIT_LOG] ADD [appendixId] uniqueidentifier NULL`（additive、無 backfill、無 FK、無索引） |

> ⚠ 兩支 migration **本 agent 未於任何環境執行**（unit-only；SOP DB 套用由 orchestrator 決定）。

### 後端 — additive 修改（既有檔案）

| 檔案 | 變更 |
|---|---|
| `src/rbac/function-matrix.ts` | `FunctionKey.APPENDIX_MANAGEMENT = '附錄管理'`；矩陣新增列 `row('READ','CRUD','NONE','NONE','NONE')`（插於 `USAGE_FORM_MANAGEMENT` 之後、`DOCUMENT_INDEX_MANAGEMENT` 之前，對齊 F025 表格列序） |
| `src/rbac/field-matrix.ts` | `FieldKey.APPENDICES = '附錄'`；矩陣新增列**重用既有 `ICSOP_WRITABLE` 常數**（不新建常數），插於 `USAGE_FORMS` 之後 |
| `src/storage/file-rules.ts` | `FileCategory` 新增 `'APPENDIX'`；`ALLOWED_FORMATS.APPENDIX = ['xlsx','xls','pdf']`；沿用 `MAX_FILE_SIZE_BYTES` |
| `src/audit/audit.types.ts` | `AuditTargetType` ＋`'APPENDIX'`；新增 `AppendixAuditEvent`（含**必填 `documentId`**）；`AuditAccessEvent` 聯集擴充；`AuditRow` 新增 `appendixId?`（選填之理由見 §四-1） |
| `src/audit/audit-event.ts` | `buildAuditRow` switch 新增 `case 'APPENDIX'`（同時對映 `appendixId` 與 `documentId`）；**既有 5 個 case 分支逐字未動** |
| `src/audit/access-history-filter.ts` | `kindToTargetTypes('文件')` → `['DOCUMENT','USAGE_FORM','APPENDIX']`（AC-30） |
| `src/audit/typeorm-audit.store.ts` | `toRow()` ＋ `appendixId`；`append()` 之 `insert()` ＋ `appendixId: row.appendixId ?? null`；`queryPage()` 未動 |
| `src/database/entities/audit-log.entity.ts` | 新增 `appendixId` 欄（比照 `formId`） |
| `src/app.module.ts` | 註冊 `AppendicesModule` |

### 前端 — 新增

| 檔案 | 說明 |
|---|---|
| `src/pages/AppendixManagementPage.tsx` | prototype 24 移植（六欄清單／搜尋／格式篩選／展開關聯／上傳 modal／二次確認 modal／唯讀 banner／封鎖畫面） |

### 前端 — 修改

| 檔案 | 變更 |
|---|---|
| `src/api/types.ts` | `AppendixDocumentRef`／`AppendixRecord`／`AppendixPoolItem`／`DocumentAppendixRecord`／`AppendixDownloadGrant` |
| `src/api/endpoints.ts` | 10 個 wrapper（`getAppendixPool`／`getAppendixPoolOverview`／`uploadAppendix`／`overwriteAppendix`／`deleteAppendix`／`downloadAppendixFromPool`／`getDocumentAppendices`／`replaceDocumentAppendices`／`appendDocumentAppendices`／`unlinkDocumentAppendix`／`downloadDocumentAppendix`） |
| `src/domain/function-matrix.ts`／`field-matrix.ts` | 鏡射後端新增列（同列序） |
| `src/domain/menu.ts` | 新增 `{ id:'appendix', label:'附錄管理', icon:'paperclip', route:'/admin/appendices' }`，插於 `usageform` 之後、`docindex` 之前 |
| `src/App.tsx` | 路由 `/admin/appendices` |
| `src/components/SearchCombobox.tsx` | `MultiSearchCombobox` 新增**選填** `orderable`／`onMoveUp`／`onMoveDown`／`removeTitle`／`itemIcon`；新增 module-level `OrderedSelectionList` |
| `src/pages/PermissionMatrixPage.tsx` | `FUNC_DISPLAY` ＋「附錄管理」列、`FIELD_DISPLAY` ＋「附錄（多）」列（索引須與矩陣同序，anti-drift 測試據此比對）；banner「共 19 欄」→「共 20 欄」 |
| `src/pages/DocumentCreatePage.tsx` | STEP4 附錄選取＋排序區；`createDocument()` 成功後獨立呼叫 `replaceDocumentAppendices()` |
| `src/pages/DocumentEditPage.tsx` | 「附錄」section（可寫＝有序 combobox／唯讀＝`ReadonlyOrderedAppendices`）；`appendicesChanged`（**順序敏感**）；儲存時整組覆寫 |
| `src/pages/DocumentReadonlyPage.tsx` | 附錄併入附件清單末段（序號徽章＋`data-appendix-*`）＋「無附錄」空態；下載走 `downloadAppendixFromPool` |
| `src/pages/PublicDocumentDetailPage.tsx` | 新增「附錄」section（序號／名稱／下載）＋欄位列「附錄 N 份（見下方）」；下載走 `downloadDocumentAppendix`（寫稽核） |

---

## 三、端點契約落地

| 方法 | 路徑 | 守門 | 服務方法 |
|---|---|---|---|
| GET | `/admin/appendices` | `附錄管理` read | `listPool` |
| GET | `/admin/appendices/overview` | `附錄管理` read | `listPoolOverview` |
| POST | `/admin/appendices` | read ＋ 欄位 write | `uploadAppendix`（單檔，可帶 `name`）／`uploadAppendices`（多檔，不接受 `name`） |
| PUT | `/admin/appendices/:appendixId` | 同上 | `overwriteAppendix`（`?confirmed=true`） |
| DELETE | `/admin/appendices/:appendixId` | 同上 | `deleteAppendix`（`?confirmed=true`） |
| GET | `/admin/appendices/:appendixId/download` | `附錄管理` read | `downloadFromPool`（不寫稽核） |
| **PUT** | `/admin/documents/:documentId/appendices` | 同寫入 | `replaceDocumentAppendices`（**排序權威路徑，UI 唯一呼叫**） |
| POST | `/admin/documents/:documentId/appendices` | 同寫入 | `appendDocumentAppendices`（API 完整性，UI 不呼叫） |
| DELETE | `/admin/documents/:documentId/appendices/:appendixId` | 同寫入 | `unlinkDocumentAppendix` |
| GET | `/documents/:documentId/appendices` | `前台瀏覽` read | `listByDocument`（依 `sortOrder` 遞增） |
| GET | `/documents/:documentId/appendices/:appendixId/download` | `下載列印文件` read | `downloadAppendix`（**寫稽核**） |

錯誤碼×HTTP 對照全數落地：`FILE_FORMAT_NOT_ALLOWED`／`FILE_SIZE_EXCEEDED`／`APPENDIX_NAME_TOO_LONG`（400）、
`FILE_ACCESS_DENIED`／`PERMISSION_DENIED`／`FIELD_WRITE_FORBIDDEN`（403）、
`APPENDIX_NOT_FOUND`／`DOCUMENT_NOT_FOUND`（404）、`APPENDIX_IN_USE`／`APPENDIX_OVERWRITE_SHARED`（409，訊息含 N）。

---

## 四、實作決策與 architect 點名之 5 個高風險點

### architect 點名之 5 個「照抄 F018 必踩」

| # | 風險 | 落地方式 |
|---|---|---|
| 1 | `DOCUMENT_NOT_FOUND`（F018 從不驗 documentId） | 新增 `DocumentExistenceChecker` seam ＋ `TypeOrmDocumentExistenceChecker`；`replaceDocumentAppendices`／`appendDocumentAppendices`／`unlinkDocumentAppendix`／`listByDocument`／`downloadAppendix` 皆於**任何寫入前**呼叫 `requireDocument()` |
| 2 | AC-27 `documentId` 雙欄位落地（F018 轉接器漏轉） | `AppendixAuditEvent` 帶**變體專屬必填 `documentId`**；`appendices/audit-writer-recorder.adapter.ts` 顯式轉送；`buildAuditRow` 之 `APPENDIX` case 同時填 `appendixId` ＋ `documentId` |
| 3 | AC-20/21 無拖曳 | `OrderedSelectionList` 僅渲染 `上移`／`下移`／移除三顆按鈕；**無 `draggable` 屬性、無任何 `onDrag*` 監聽**；首項停用上移、末項停用下移 |
| 4 | `PUT` replace-set，非 diff-based | 前端 Create／Edit 兩頁皆**只呼叫** `replaceDocumentAppendices(documentId, orderedIds)`；未接線 `appendDocumentAppendices`／`unlinkDocumentAppendix` 至 UI；編輯頁之 `appendicesChanged` 為**順序敏感**比對（純重排亦視為變更並送出） |
| 5 | `sortOrder` 不變式 | 服務層去重保序 → store 於**單一交易**內 delete-then-insert，`sortOrder = index + 1`；`unlinkDocumentAppendix`／`unlinkAllForAppendix` 於交易內對剩餘列重新編號為連續 1..N |

### 其他實作決策

1. **`AuditRow.appendixId` 宣告為選填（`appendixId?: string \| null`），偏離 architecture §3.6 決策三之「必填」字面。**
   理由：`backend/src/audit/access-history-filter.spec.ts` 之 `row()` 夾具以完整物件字面建構 `AuditRow`
   且未帶該鍵；宣告為必填會使該既有夾具（與任何既有列建構點）TS 編譯失敗——這正好違反該決策
   自身「additive、既有 6 種 targetType 語意與呼叫端不受影響」之要求。生產路徑
   （`buildAuditRow`／`TypeOrmAuditStore.toRow`）**一律顯式填值**（非 APPENDIX 列為 `null`），
   執行期行為與「必填」完全相同。已向 `tg-appendix` 報備，未收到收緊要求。

2. **`APPENDIX_POOL` blob key 前綴為 `appendices/`**（比照 `usage-forms/`），覆蓋一律配發新 key，
   DB 參照更新成功後才回收舊 key（write-new-then-swap-pointer，§4.3）。

3. **`sp_getapplock` 僅於 `type === 'mssql'` 時執行**：`POST`／`DELETE` 之「先讀後寫」以文件層級
   應用鎖序列化（`doc-appendix-${documentId}`，5000 ms timeout）；非 MSSQL 方言略過（由交易本身保證）。
   `PUT`（replace-set）刻意**不加鎖**，維持 last-write-wins，與 F011 文件編輯之既定立場一致。

4. **`MultiSearchCombobox` 之 `orderable` 為選填且預設關閉**：現行 4 個呼叫端
   （`usingDepts`／`secondaryChiefs`／使用表單／文件連結點）之 DOM 與行為逐字不變，
   `SearchCombobox.test.tsx` 既有斷言全綠。

5. **上傳者名冊採複製而非跨模組匯入**（§3.6 決策一「建議複製」）：`appendices/typeorm-uploader-directory.ts`
   為 `usage-forms/` 同名檔之複本（含非 GUID 過濾之既有防呆），維持 §3.1「模組間不互相匯入業務模組內部檔案」。

---

## 五、測試爭議與裁決結果（向 `tg-appendix` 申訴 6 項，全數獲採納）

| # | 檔案／位置 | 爭議 | 裁決 |
|---|---|---|---|
| 1 | `frontend/src/domain/function-matrix.test.ts:25` | `toHaveLength(12)` 未隨新增 `APPENDIX_MANAGEMENT` 更新（後端已 13）；但 `AppendixManagementPage.test.tsx` 之 RBAC 三態要求前端矩陣必須有此列（`canPerform` fail-closed） | 採納，改 13 |
| 2 | `frontend/src/domain/field-matrix.test.ts:11` | `toHaveLength(19)` 同理（後端已 20） | 採納，改 20 |
| 3 | `frontend/src/domain/menu.test.ts` | `MENU toHaveLength(9)`／SysAdmin ids 陣列／ICSOPAdmin `toHaveLength(8)` 未含 `appendix` | 採納，改 10／插入 `'appendix'`／改 9 |
| 4 | `frontend/src/pages/PermissionMatrixPage.test.tsx` | banner `/共 19 欄/` vs F026 spec 已改為「共 20 欄位」 | **裁定 20**；本 agent 據此把 `PermissionMatrixPage.tsx` banner 改為「共 20 欄 …與『附錄（多）』」 |
| 5 | `frontend/src/pages/DocumentCreatePage.test.tsx:2` | 使用 `within()` 但未 import（`ReferenceError`，同批另兩檔皆有 import） | 採納，補 import |
| 6 | `frontend/src/pages/PublicDocumentDetailPage.test.tsx:254` | `.closest('section, div')!` 回傳 `Element`，餵給 `within()` → TS2345（Vitest 執行期綠，但 typecheck 閘紅） | 採納，改為 `HTMLElement` 型別 |

> 本 agent 對上述 6 處**未動任何一個字元**；`git diff` 顯示測試檔之變更全部來自 `tg-appendix`。
> 另外，**未為了讓測試轉綠而弱化任何實作語意**（驗證順序、錯誤碼、守門鏈皆逐條依 spec 落地）。

---

## 六、偏離 spec／prototype 之處與理由（供人類覆核）

| # | 偏離 | 理由 |
|---|---|---|
| A | **覆蓋上傳無獨立 modal**：prototype 24 之 `ovModal`（選新檔→預覽→「送出覆蓋」→確認框）在 React 實作中收斂為「隱藏 `aria-label="覆蓋檔案"` file input →（選檔即）操作確認框」 | 環之 `AppendixManagementPage.test.tsx`（AC-11/12/15）明確編碼此互動序列：點「更新／覆蓋上傳」→ `screen.getByLabelText('覆蓋檔案')` 上傳 → `findByRole('dialog',{name:'操作確認'})`；中間若插入「送出覆蓋」步驟則測試永不會到達確認框。此流程與同構之 F018 `UsageFormManagementPage` 完全一致（頁面間一致性）。**視覺損失＝少一層 modal**，其資訊（目標附錄名、目前引用份數、格式/大小上限說明）已由確認框之標題／內文承載。⚠ 需人類決定是否回補 |
| B | **前台詳情「附錄」欄位列於 0 份時顯示「0 份（見下方）」而非 prototype 04 之「無附錄」** | prototype 04 於欄位格與下方 section 兩處皆輸出「無附錄」；環之 AC-26 用 `findByText('無附錄')`（單數查詢），兩處並存會拋 "found multiple elements"。改採與同頁「使用表單」欄位列既有寫法一致之 `{n} 份（見下方）`，「無附錄」僅出現在下方 section（亦即 Playwright `[data-appendix-empty]` 之落點） |
| C | **未於 `PublicDocumentDetailDto` 內嵌 `appendices`**（team-lead 提綱曾列此項） | F039 Interface Contract 與 architecture §3.6 決策五皆指定詳情頁走**專用端點** `GET /documents/:documentId/appendices`；若同時內嵌於 public detail DTO，將出現兩條資料路徑，正是 spec 明文禁止之「兩路徑不得產生不同的排序語意」風險來源。前台頁面已改呼叫該專用端點（與後台詳情同一 API，AC-25 前後台一致性因此為結構性保證而非紀律保證） |
| D | `data-appendix-*` 三個 DOM 標記寫在共用元件 `SearchCombobox.tsx` 的 `OrderedSelectionList` 內 | 這三個屬性是 prototype 14／15 之逐字契約，亦為 e2e fidelity 斷言依據；`orderable` 目前唯一消費者即附錄選取區。為避免再加兩個「屬性注入」prop 而讓共用元件介面變複雜，選擇直接輸出並於註解標明來源與唯一消費者 |

---

## 七、尚未驗證 / 待後續

1. **Playwright 3 支 fidelity spec 未執行**（需整合環境：真實後端 ＋ SOP DB ＋ ICSOPAdmin storageState ＋ 前端 dev server）。
   其中 `fidelity-document-appendix-ordering.spec.ts` 與 `fidelity-document-appendix-detail.spec.ts` 內建
   `test.skip` 優雅略過（導覽慣例／資料為空時）。
2. **兩支 migration 未於任何環境執行**；SOP DB 套用與 `AUDIT_LOG.appendixId` 加欄之上線程序由 orchestrator 決定。
   `1723593600000` 為 additive、nullable、無 backfill、無 FK，零遷移風險。
3. **`sp_getapplock` 之真實序列化行為**僅能於 MSSQL [integration] 驗證；單元層以 Fake store 驗證邏輯。
4. **瀏覽器煙霧測試未執行**：新增路由 `/admin/appendices` 與端點前綴 `/admin/appendices`、
   `/documents/:id/appendices` 是否已在 nginx／vite 代理白名單內**未經真實瀏覽器確認**——
   本專案曾三度踩到「只有真瀏覽器會踩」的代理白名單缺漏（見 `docs/specs/prototype-alignment/browser-smoke-findings.md`）。
   建議併版前補一次 Chrome 煙霧測試（附錄管理頁 vs prototype 24、建立／編輯頁附錄區、前後台詳情附錄區）。
5. **偏離項 A／B**（§六）需人類決定是否回補 prototype 原始互動／文案。
