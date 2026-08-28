---
type: implementation-log
feature_id: F042
feature_name: OJT 進度管理（Phase B backend）
status: complete
last_updated: 2026-08-28
---

# F042: OJT 進度管理 — Backend 實作日誌

> 本輪為 **backend** 棒（接手前一位中斷之實作者）。前端為下一棒。
> 約束環由 test-generator（tg-ojt）先行建立、對實作全盲；本棒**未撰寫、未修改任何測試檔**，
> 測試面之矛盾一律以申訴交由仲裁處理（見 §申訴清單）。

## 測試結果彙總

| 套件 | 結果 |
|---|---|
| backend 單元 `npx jest --maxWorkers=4` | ✅ **182 suite 全綠 / 2827 測試全綠** |
| backend 整合 `npm run test:int -- --runInBand` | ✅ **22 suite 全綠 / 178 測試全綠** |
| 新模組 `src/ojt-progress/` | ✅ **6 suite / 74 測試 全綠** |
| DI smoke（`npx ts-node di-smoke.ts`） | ✅ **PASSED**（含 `OjtProgressModule` 之完整相依圖） |
| migration 對 dev 真 SOP DB 實跑 | ✅ **通過**（證據見 §migration 實跑證據） |

**零紅**。全部 **9** 項測試面矛盾皆由 test-generator 仲裁修復（見 §申訴清單），本棒**未修改任何測試檔**。

### 🔴 第九項申訴連帶揪出之**規格錯誤**（`AC-J7` ③）

改 `field-matrix.ts` OJT 列為五格全 `FORBIDDEN` 後，`field-matrix.spec.ts` 同檔內兩案互斥：
`AC-J8` 要求 `OJT簽到表×ICSOPAdmin` 為 `FORBIDDEN`；`AC-J7` 案以公式建「D9 導入前」基準
（未特判 OJT）並斷言「恰 0 格不同」⇒ 要求同一格為 `WRITABLE`。

**根因是規格本身寫錯，非測試失誤**——F026 `AC-J7` ③「與 D9 導入前之格值**逐格相同**」與事實不符：
```
git show 03cc8f0^:backend/src/rbac/field-matrix.ts
  → [FieldKey.OJT_SIGNIN]: ICSOP_WRITABLE
  → const ICSOP_WRITABLE = { …, ICSOPAdmin: 'WRITABLE', … }
```
（`03cc8f0` 即引入 `OJT_WRITABLE` 之 D9 commit，`^` 為其前一版。）D9 導入前該格**是可寫的**，
故 ② 之「五格全唯讀」與 ③ 之「逐格相同」差在 `ICSOPAdmin` 一格，**不可能同時成立**。

**以 ② 為準**（`AC-J8` 明文「五者皆唯讀」並**點名**最可能之失誤即「讓 `ICSOPAdmin` 之可寫留著」，
且 F042 `AC-22` 明文含 `ICSOPAdmin`）；③ 為作者對歷史狀態之誤記，非獨立裁決。

✅ **裁決結果**：保留**真實**基準（附 git 舉證），斷言改為「恰 1 格不同＝
`OJT簽到表×ICSOPAdmin`（`WRITABLE`→`FORBIDDEN`），其餘 99 格與導入前相同」，並更正 F026 規格。
🔴 **刻意不在公式中特判 OJT**——特判會使本案退化為建構上恆真，測不出
「OJT×ICSOPAdmin 忘記改回 `FORBIDDEN`」這個真實失誤（本 repo 已明文禁止之假綠形狀）。

### 主要 AC 對應

| AC | 說明 | 落點 | 狀態 |
|---|---|---|---|
| AC-01 | 列粒度＝`documentId × orgCode`，不展開子樹 | `ojt-progress.service.ts` | PASS |
| AC-02 | 場次累加、非覆蓋 | `OJT_SESSION` 表 ＋ service | PASS |
| AC-03 | 列完成狀態恆二態（場次數 ≥ 1） | `ojt-progress.service.ts` | PASS |
| AC-04 | 文件層三值 `all`／`partial`／`none`（空集合⇒`none`） | `deriveOjtStatus()` | PASS |
| AC-05～AC-10 | 場次登記（RBAC／單檔／格式／大小／Blob 路徑） | `ojt-progress.service.ts` | PASS |
| AC-11～AC-17 | TAB1／TAB2 查詢、篩選、覆蓋率、部層 rollup、30 天窗 | `ojt-progress.service.ts` | PASS |
| AC-18 | 稽核落列（`OJT_SESSION_UPLOAD`／`OJT_SESSION_DELETE`） | `audit-event.ts`／`audit.types.ts` | PASS |
| AC-19／AC-20 | 刪除限 ICSOPAdmin；**無編輯路徑** | controller ＋ service | PASS |
| AC-25 | 孤兒化／復活（冪等兩道 UPDATE） | `typeorm-documents.store.ts` | PASS |
| AC-26 | 既有 `OJT_SIGNIN` 1:1 遷移為待歸位列＋歸位工作台 | migration ＋ service | PASS |
| AC-27／AC-J16～J18 | 新功能列「OJT 進度管理」 | `function-matrix.ts` | PASS |
| AC-J1／AC-J2 | 覆蓋語意作廢；舊端點移除回 404 | `attachments.*` | PASS |
| AC-J7／AC-J8 | F026 OJT 列改五角色唯讀 | `field-matrix.ts` | PASS |
| AC-J12～J15 | `hasOjt` → `ojtStatus`；四值篩選；不得 N+1 | `documents.service.ts`／`document-list-query.ts` | PASS |
| AC-J22～J24 | access-history 標籤（`場次登記`／`場次刪除`／`OJT 場次`） | `access-history-labels.ts` | PASS |
| AC-J26／AC-24 | **前台不提供 OJT 場次檔下載**（該路徑不存在） | `public/watermark.*` | PASS |
| AC-24 | 前台唯讀顯示已完成單位清單 | `public/public-document-detail.service.ts` | 🟡 **部分兌現**：單位名稱清單 ✅／**含完成日期 ⬜ 待 OQ 裁決**（多場次時取最早或最新場次未有裁決；改形狀需前後端＋兩環＋`prototypes/04` 連動，2026-08-28 lead 裁示本輪不做） |
| AC-J7②／AC-J8 | OJT 列**五角色**（含 `ICSOPAdmin`）皆唯讀＝`FORBIDDEN` | `rbac/field-matrix.ts` | PASS |

## 變更檔案

### 新增

| 檔案 | 說明 |
|---|---|
| `backend/src/database/migrations/1724889600000-ojt-session.ts` | 建 `OJT_SESSION` ＋ 1:1 資料遷移（同交易）|
| `backend/src/database/migrations/1724976000000-audit-log-org-code.ts` | `AUDIT_LOG` additive `orgCode` |
| `backend/src/database/entities/ojt-session.entity.ts` | `OJT_SESSION` entity |
| `backend/src/ojt-progress/` | controller／service／store port／TypeORM store／module 等 9 檔 |
| `backend/src/documents/ojt-completion.reader.ts` | `OjtCompletionReader` port（AC-04／AC-21 共用同一次查詢）|
| `backend/src/documents/typeorm-ojt-completion.reader.ts` | 上述 port 之 TypeORM 實作（固定 2 次批次查詢）|

### 修改

第二輪（前端棒提報之契約洞）另動：`documents/documents.controller.ts` ＋ `documents.service.ts`
（`AC-21` 端點）｜`public/{public-document-detail.service,public.module}.ts`（`AC-24` 兩欄＋反循環自建
reader）｜`ojt-progress/{ojt-progress.controller,ojt-progress.service}.ts`（信封形狀＋`listPendingView`）。

`app.module.ts`（註冊模組）｜`attachments/{controller,service,store}.ts`（移除 OJT 分支與型別）｜
`audit/{access-history-filter,access-history-labels,audit-event,audit.types,typeorm-audit.store}.ts`｜
`database/entities/audit-log.entity.ts`｜
`documents/{document-list-query,documents.controller,documents.module,documents.service,documents.store,typeorm-documents.store}.ts`｜
`public/{typeorm-watermark.sources,watermark.controller,watermark.service}.ts`｜
`rbac/{field-matrix,function-matrix}.ts`

## 架構決策（規格界線內）

1. **`OjtCompletionReader` 注入於建構子最末位（第 9 位）而非環所寫之第 6 位**。環之理由基於
   「既有 5 個位置參數」之前提，該前提與現況不符（實為 9 個）；第 6／7／8 位已分別被
   `nodeNameStore`／`lifecycleStore`／`dagStore` 佔用，且被既有測試以位置參數釘死。
   置於末位為唯一零漣漪之選擇（tg 已於 risks-and-gaps `D-OJT-03` 預先授權此仲裁）。

2. **`DocumentListItem.hasOjt` 保留為 `@deprecated` 選填欄位、永不賦值**。前一棒將其整個自型別
   移除，連坐 4 個既有／環檔（其物件字面量寫有 `hasOjt`，觸發 TS2353 多餘屬性檢查而整檔編譯失敗）。
   環自身之 `document-list-query.spec.ts` 亦仍在用它 ⇒ 型別須保持可指派。
   🔒 `AC-J12` 之真值強制風險不因此回歸：本欄恆為 `undefined`（falsy），三值狀態一律只走 `ojtStatus`。

3. **`OJT_SESSION.orgCode` 對 `DOC_USING_DEPT` 以值比對、不建 FK**（data-model
   `#ojt-session-consistency` 明文）：使用部門編輯採 delete-then-insert 全量取代，以 FK 指向其
   代理鍵會使任何一次編輯 CASCADE 抹掉該文件全部場次。

4. **建表與資料遷移同置一支 migration**（data-model `#ojt-session-migration`：「資料遷移與列舉
   退場為同一次資料層事件，非分兩批」）；TypeORM 預設單一交易 ⇒ 不存在「已刪附件但場次未建」之中間態。

5. **前台 OJT 下載路徑整條移除**（controller route ＋ service 型別 ＋ source 三層）。權威為
   F020 `AC-J26`「該路徑不存在」。🔒 策略 A 與逐字文案 `此格式不支援浮水印` **完全未動**——
   依 `AC-J26` ② 其前台載體改由使用表單區／附錄區之 `.xlsx` 列承載。

## migration 實跑證據（dev 真庫 `SOP` @ `SQTHFC20`）

> 🔴 血訓：單元測試全綠證明不了資料表存在，亦證明不了舊列已遷移。以下為實跑後之查詢輸出。

- 已落 `migrations` 表：`OjtSession1724889600000`、`AuditLogOrgCode1724976000000`。
- `OJT_SESSION` 12 欄型別／可空皆符 data-model v1.10（`orgCode varchar(10) NULL`、
  `orphanedAt datetime2 NULL`、`trainingDate date NOT NULL`、`size bigint`）。
- 索引：`IX_OJT_SESSION_doc_org`（實測 `is_unique = false`，與 `DOC_USING_DEPT` 之複合**唯一**索引
  刻意不同）／`IX_OJT_SESSION_doc`／`IX_OJT_SESSION_uploadedAt`；
  FK `FK_OJT_SESSION_document` → `ICSOP_DOCUMENT`，`delete_referential_action_desc = CASCADE`。
- **1:1 遷移**：遷移前 `DOCUMENT_ATTACHMENT` 為 `ICSOP_PDF` 7 筆 ＋ `OJT_SIGNIN` 2 筆；
  遷移後 **`OJT_SIGNIN` 0 筆、`ICSOP_PDF` 仍 7 筆（未誤傷）**，`OJT_SESSION` 恰 2 列、
  `orgCode` 皆為 `NULL`（待歸位）、`blobPath` 逐字沿用舊 `ojt_signin/` 路徑（未搬移）、
  `trainingDate = 2026-08-21`（＝各自 `uploadedAt` 之日期）、`companyCode` 由其文件帶入 `AS`。
- `AUDIT_LOG.orgCode` `varchar(10) NULL` 已存在。
  🔴 **寫入路徑已逐一核對接線**：`TypeOrmAuditStore.append` 之顯式 `repo.insert({...})` 欄位清單
  含 `orgCode`（非只改 entity）——此即上一輪「migration 跑了但值人間蒸發」之踩點。

## 🔴 第二輪：前端棒提報之契約洞（2026-08-28 補作）

前端棒實測提報兩項、本棒覆核 §架構設計 一之端點表後另查出兩項，共 **4 項**皆為
「後端未實作 spec 明文形狀」之缺口，**非測試面矛盾**，故直接補實作（未動任何測試檔）。

| # | 缺口 | 權威 | 偵測情形 |
|---|---|---|---|
| ⑤ | 缺端點 `GET /admin/documents/:id/ojt-completion` | `AC-21` | 前端環 `endpoint-contract.test.ts` 紅燈中 |
| ⑥ | `PublicDocumentDetailDto` 缺 `ojtCompletedUnits`／`ojtUsingUnitCount` | `AC-24` | 🔴 **無任何測試會紅**——前端元件測試把 endpoints 整個 mock，`endpoint-contract.test.ts` 只驗 URL 存在性不驗回應形狀 |
| ⑦ | 三個清單端點回**裸陣列**，非端點表明訂之信封 `{items,total}`／`{sessions}`／`{items}` | §架構設計 一「回應形狀」欄 | 🔴 **無任何測試會紅**——後端環測的是**服務層**（回陣列，合理），controller 之回應形狀無人覆蓋 |
| ⑧ | `/pending` 未帶 `documentNumber`／`documentName` | 同上（端點表逐欄列出） | 工作台只顯示得出 UUID，操作者無從判斷該把哪筆歸到哪個單位 |

**實作要點**：
- ⑤ 重用既有 `OjtCompletionReader`（**不另寫單筆查詢**，`AC-04` 明文「與 `AC-21` 不得各自實作」）。
  🔴 閘門為 `ICSOP_DOCUMENT_MANAGEMENT read`，**不是** `OJT_PROGRESS_MANAGEMENT`——本區塊是文件頁的
  一部分，其可見範圍須等同該頁進入條件；後者對 `User` 為 `NONE`，混用會讓能開文件頁的角色在頁內吃 403。
- ⑥ 新依賴以**選填、置於末位**注入（`PublicDocumentDetailService` 已有 **14 處**既有測試以位置參數
  建構，必填參數會全數打爆）；`PublicModule` 自建 `TypeOrmOjtCompletionReader`，不 import 對方模組。
- ⑦ 信封在 **controller** 組裝、**service 一行未動** ⇒ 既有服務層測試全數不受影響。
- ⑧ 另立 `listPendingView()`，不改 `listPending()`（其形狀已被既有測試釘住）；文件身分以
  `listAllDocs()` **單次**批次建 Map，不逐列查詢。

### 對執行中真實後端之逐項實證（`PORT=3010`，非單元 mock）

> 🔴 **本節之存在理由**：⑥⑦⑧ 三項在單元與整合測試中**皆為全綠**——它們是「型別宣告了、
> 但值沒接上」與「服務層對、HTTP 層錯」兩種形狀，測試結構上驗不到。唯有對真實 HTTP 表面探針。

| 探針 | 結果 |
|---|---|
| 路由未被 `@Get(':id')` 遮蔽 | `/ojt-completion` → **401**（＝路由存在且守衛執行），與已知良好之 `/links` **401** 同；對照組不存在路徑 → **404**。三者可區分 ⇒ 探針有鑑別力 |
| `/admin/ojt-progress/pending` | **200** `{items:[…]}`，2 筆遷移列皆帶 `documentNumber`／`documentName`（`ICSOP-SRC-102-1-01`／`ICSOP-GCA-100-1-00`）與 `trainingDate: 2026-08-21` |
| `/admin/ojt-progress/rows` | **200** `{items, total: 27}`，首列欄位齊全 |
| `/admin/documents/:id/ojt-completion`（**正向對照**） | 三份文件之 `totalUnits` 分別為 **12／11／3**，與 DB `DOC_USING_DEPT` 實際列數**逐筆相符** ⇒ 證明非「恆回 0 的假綠」 |
| 同上（**反向對照**） | 不存在之 id → `{totalUnits:0, completedOrgCodes:[]}`（優雅降級，非 500） |
| `/public/documents/:id`（`AC-24`） | **200**，`ojtUsingUnitCount: 11`（**非 0**，證明 reader 確實接線）、`ojtCompletedUnits: []`（正確——dev 兩筆場次皆待歸位，依 `AC-26` ① 不使任何單位判定為已完成）|

## 部署面核對

- 新端點皆在 `/admin/` 前綴下，nginx `location /admin/` 與 vite proxy 已覆蓋，**無新增頂層路由**
  ⇒ `proxy-coverage.test.ts` 不受影響。
- 場次下載端點 `/admin/ojt-progress/sessions/:sessionId/download` 結尾為 `/download`，同時命中
  nginx `location ~ ^/admin/.+/(download|export|print|pdf)$` 與 vite `spaBypass` 之同一條 regex
  ⇒ **不會被 SPA fallback 吃掉而靜默回 HTML**。
- `documents.service.ts` 原含之真 NUL byte 已清除（前一棒處理）；該檔 diff 之大部分為 CR 正規化，
  忽略行尾後之真實內容差異為 36 增／18 刪。

## 申訴清單（不自行修改測試，交由仲裁）

**已由仲裁者修復（6 項）**：① `function-matrix.spec.ts` 同檔 13 vs 14 自相矛盾；
② `SingleAttachmentType` 是否含 `'OJT_SIGNIN'`（型別鎖 vs `documents.service.spec.ts` 之 seed）；
③ `uploadOjt` 存在性（環 vs `attachments-controller-routes.gate.spec.ts`）；
④ `ojt-progress.migration.spec.ts` AC-26 第一案與 `rows.spec.ts` ＋ `AC-01` 互斥；
⑤ `documents.service.spec.ts` 兩個過時效能常數（3→2、2→1，OJT 項已不存在）；
⑥ `OjtCompletionReader` 之建構子位置（第 6 位已被 `nodeNameStore` 釘死）。

**亦已由仲裁者修復（2 項）**：

| # | 檔案 | 矛盾 |
|---|---|---|
| 7 | `src/public/public-attachment-download.routes.spec.ts` | `CASES` 含 `{ type:'ojt', handler:'downloadOjt' }`，斷言該前台路由存在；與 F020 `AC-J26`「該路徑不存在」互斥（路由存在與否無第三態）。🔒 當時 `icsop-pdf` 半案與掃描器自我檢查全綠，證明非掃描器故障 |
| 8 | `test/int/attachments.itest.ts` `TS-E-A-001` | 對已移除之 `POST /admin/documents/:id/attachments/ojt` 上傳並期望列表含 `OJT_SIGNIN`；與 `AC-J2`／`OQ-E11-11`→A 互斥。本輪約束環未涵蓋 `test:int` 這份 jest config，屬涵蓋範圍外之連坐 |

> 📌 **本輪之方法論記錄**：8 項矛盾中有 4 項（②③⑦⑧）屬**移除型 delta 之連坐盲區**——環作者
> 核對「零波及」時是對**舊實作**跑的，`OJT_SIGNIN`／`uploadOjt` 當時仍在，連坐只在實作者真的
> 移除後才現形。另有 1 項（⑦之根因）只有 `test:int` 驗得到：單元之 ts-jest 僅型別檢查
> 「spec 可達之 import 圖」，沒有任何 spec import 的生產檔即使型別已壞仍全綠。

## 給 frontend 棒的交接

**`FunctionKey.OJT_PROGRESS_MANAGEMENT = 'OJT 進度管理'`（矩陣總數 13→14）逐格值**：

| 角色 | 權限 |
|---|---|
| SysAdmin | `READ` |
| ICSOPAdmin | `CRUD` |
| Supervisor | `RESTRICTED_CRUD` |
| DeptContact | `RESTRICTED_CRUD` |
| User | `NONE` |

⚠ `canPerform` 語意上 `RESTRICTED_CRUD` 之 write 為 `true`；「僅可新增不可刪除」由**服務層**另一道
ICSOPAdmin 檢查把關，不在矩陣內（側欄徽章 `受限CRUD` 見 `AC-28` ⑮）。

**8 個端點定稿**（皆 `@UseGuards(SessionGuard, RolePermissionGuard)`，權限鍵一律 `OJT_PROGRESS_MANAGEMENT`）：

| # | 方法 | 路徑 | 閘門 | 備註 |
|---|---|---|---|---|
| 1 | GET | `/admin/ojt-progress/summary` | read | TAB1 |
| 2 | GET | `/admin/ojt-progress/rows` | read | query `orgQuery`／`completionStatus` |
| 3 | GET | `/admin/ojt-progress/rows/:documentId/:orgCode/sessions` | read | |
| 4 | POST | `/admin/ojt-progress/rows/:documentId/:orgCode/sessions` | write | multipart，單檔 |
| 5 | GET | `/admin/ojt-progress/sessions/:sessionId/download` | read | |
| 6 | DELETE | `/admin/ojt-progress/sessions/:sessionId` | write ＋ **服務層限 ICSOPAdmin** | `@HttpCode(204)` |
| 7 | GET | `/admin/ojt-progress/pending` | read | 待歸位工作台 |
| 8 | POST | `/admin/ojt-progress/pending/:sessionId/assign` | write ＋ **服務層限 ICSOPAdmin** | 單向不可逆 |

**⚠ 前端待清理（backend 棒未動）**：`frontend/src/pages/PublicDocumentDetailPage.tsx:279` 仍有
`att.type === 'ICSOP_PDF' ? 'icsop-pdf' : 'ojt'` 分支，指向已移除之前台端點。新模型下前台附件區
不再有 OJT 列（`AC-J26` ①）故該分支不可達，但留著即為死鏈——建議連同 `endpoints.ts` 之
`downloadPublicAttachment` 型別一併收斂為只剩 `'icsop-pdf'`。
