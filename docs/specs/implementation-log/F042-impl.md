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
| backend 單元 `npx jest --maxWorkers=4` | ✅ **182 suite 全綠 / 2852 測試全綠（第四輪後）** |
| backend 整合 `npm run test:int -- --runInBand` | ✅ **22 suite 全綠 / 178 測試全綠** |
| 新模組 `src/ojt-progress/` | ✅ **6 suite / 99 測試 全綠（第四輪後）** |
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

## 🔴 第三輪：`docCoverage` 節流（`OQ-E11-21`，2026-08-28）

使用者實機揪出之規模缺陷修正。`getSummary(session, docScope?)` 新增第二參數，`docCoverage`
由陣列改為受限切片物件 `{scope, maxRows, items, shown, hidden, totalDocuments, byState, incompleteTotal}`。

**實作檔**：`ojt-progress.service.ts`（型別＋`sliceDocCoverage()` 等三個 module-level 純函式＋
`recentSessions()` 決定性次鍵）｜`ojt-progress.controller.ts`（`@Query('docScope')`）。
✅ 已確認 `docCoverage` 無跨模組消費端（grep 全 `src/` 除 `ojt-progress/` 外零命中）。

**測試**：ojt-progress 6 suite **85 案全綠**（原 59）；全量 **182 suite / 2838 測試全綠**；
整合 **22 suite / 178 測試全綠**。未動任何測試檔、無異議。

**三條刻意寫進註解的不變式**：
1. **過濾 → 排序 → 截斷，順序不得調換**（先截斷再排序＝取到「寫入順序」前 N 筆，
   高覆蓋率文件會因剛好排前面而逃過截斷）。
2. **統計欄一律取自 `population`、不取自 `filtered`／`items`**（假綠陷阱 9：上限摻進統計後，
   三種範圍各得看似合理卻互相矛盾的數字）。
3. **不加 `orphaned` 過濾且那不是遺漏**——孤兒天然不成列；多加一道會掩埋「為何這裡不需要」。

**`docScope` 正規化**：缺值與未知值 → `incomplete`，經 `docCoverage.scope` 回聲；
🔒 **只在服務層做一份**，controller 不重複驗（兩份規則遲早分歧）。

### 🔴 真庫實打揭露之產品面缺陷（已裁決，待新規格）

> **fixture 再怎麼設計都看不到，只有真資料會說話。**

對 dev 真庫（`SOP`）實打端點之事實：
- `totalDocuments=591`、`byState={all:0, partial:1, none:590}`、`hidden=576` ⇒ 節流確有必要。
- **591 份文件中僅 4 份設有使用部門**（`SELECT COUNT(DISTINCT documentId) FROM DOC_USING_DEPT`）。
  其餘 587 份 `totalUnits=0`，依 `AC-04` 歸為 `none`、覆蓋率 0/0 取 0 ⇒ **並列第一、占滿前 15 名**。
- ⇒ **唯一一份真有訓練進度的文件（`partial`，0.5）排在第 591 名，預設範圍下永遠看不到**；
  使用者看到的 15 筆全是「根本沒有訓練義務」的文件。
- 五種 `docScope`（含缺值與 `bogus`）實打：正規化正確、HTTP 200 非 400，且
  **跨五次請求之統計欄與 `coverage`／`deptRollup`／`recentSessions` 完全相同**
  ⇒ 不變式在**真資料**上成立，不只在 fixture 上。

**✅ 使用者裁決＝「拆成獨立統計 ＋ 沉底」**（2026-08-28）：`totalUnits===0` 自成一態
（`未指定使用部門`，與「尚未開始」分離）、摘要行列份數、排序沉底不占名額、
`僅未全部完成` 範圍不含它們、`incompleteTotal` 排除它們。
⏸ **本棒暫緩**，待 ux-fix 定稿 prototype、sw-fix 寫入 `AC-14` 與端點契約（`byState` 可能加第四鍵）
並更新約束環後再實作。**現行 182/182 ＋ 22/22 為有效基準線，不得先行改動。**
✅ **已於第四輪解除暫緩並實作完成**（`byState` 確實加了第四鍵）——見 [§第四輪](#-第四輪未指定使用部門第四種呈現態oq-e11-222026-08-28)。

### ⚠ 兩個**未被驗證**的上界（非「已驗證安全」）

對 dev 真庫查證：`recentSessions` 30 天窗口內 **2 筆**，**把窗口整個拿掉也是 2 筆**
⇒ 窗口目前排除不掉任何一列；前端「上限 8」更從未被觸碰。
🔴 兩者在真實負載下之行為**仍屬未知**，收尾時須明確標示為「未被驗證的上界」。

## 🔴 第四輪：「未指定使用部門」第四種呈現態（`OQ-E11-22`，2026-08-28）

第三輪末所記之「⏸ 本棒暫緩」項目，於規格與環就緒後實作。`docScope` 三值 → **四值**、
`byState` 三鍵 → **四鍵**、排序鍵 **兩段 → 三段**、不變式 ③ → **③′**。

**實作檔（僅產品碼，測試檔零改動）**：

| 檔案 | 變更 | 說明 |
|---|---|---|
| `backend/src/ojt-progress/ojt-progress.service.ts` | modified | `OjtDocScope` 增 `'unassigned'`；`normalizeDocScope()` 接受之；新增 module-level 純述詞 `hasNoTrainingObligation()`；`byState` 增第四鍵；`incomplete` 過濾收窄；`unassigned` 正向過濾；排序三段鍵；`incompleteTotal` 改 ③′ |
| `backend/src/ojt-progress/ojt-progress.controller.ts` | modified | 僅 docblock 之值域字面（🔒 正規化仍只留服務層一份，本層不驗值） |

**四項規格對應**：
1. **⑧ 判準＝`totalUnits === 0`**，落為單一具名述詞 `hasNoTrainingObligation()`，
   使「範圍過濾／沉底排序／`incompleteTotal` 扣除」三處**共用同一個定義**、不會各寫一份而漂移。
2. **⑨ `incomplete` 收窄為 `totalUnits > 0 && state !== 'all'`**；`completed`／`all` 一字未動
   （`totalUnits === 0` 依 `AC-04` 恆為 `none`，天然不入 `completed`，**未另加排除**）。
3. **⑩ 排序沉底**：第 (1) 段鍵 `Number(無義務(a)) - Number(無義務(b))` 置於覆蓋率鍵**之前**；
   🔒 切片三步「過濾 → 排序 → 截斷」順序未動。
4. **⑪ ③′ `incompleteTotal = partial + none − unassigned`**；🔒 `byState.none` **維持 `AC-04`
   口徑（含無義務者）**，未改成「有義務的 none」——摘要行下行之數字為前端減法。

**測試**：ojt-progress 6 suite **99 案全綠**（原 85）；全量 **182 suite / 2852 測試全綠**；
整合 **22 suite / 178 測試全綠**。未撰寫、未修改任何測試檔；**無異議**。

### ✅ dev 真庫 HTTP 表面實打（一次性探針，跑完即刪）

> 單元全綠證明不了 HTTP 表面（本 repo 血訓）；本輪缺陷本身即真資料才暴露，故照樣實打。

以 `test/int/harness.ts` 之 `bootIntApp()` 對真 `SOP` 庫開真 app，走 `GET /admin/ojt-progress/summary`
六次（缺值／四個合法值／`bogus`），結果：

| docScope | scope 回聲 | shown / hidden | items 前列 |
|---|---|---|---|
| （缺值） | `incomplete` | 4 / 0 | 4 份**有義務**文件，無義務者一份未入 |
| `incomplete` | `incomplete` | 4 / 0 | 同上 |
| `completed` | `completed` | 0 / 0 | 空（真庫尚無全部完成之文件） |
| `unassigned` | `unassigned` | 15 / 572 | 587 份無義務者，依 `documentNumber` 昇冪 |
| `all` | `all` | 15 / 576 | **前 4 名為有義務者**、其後才是無義務者（沉底成立） |
| `bogus` | `incomplete` | 4 / 0 | 正規化回聲，HTTP **200 非 400** |

- 六次請求之 `totalDocuments=591`、`byState={all:0, partial:1, none:590, unassigned:587}`、
  `incompleteTotal=4` **完全相同** ⇒ 母體口徑鎖在**真資料**上成立。
- 不變式 ③′：`1 + 590 − 587 = 4` ✅；不變式 ④：`0 + 1 + 590 = 591 = totalDocuments` ✅。
- 🔴 **修正之直接兌現**：唯一一份真有進度落差之 `ICSOP-GCA-100-1-00`（`1 / 11`，`partial`）
  **在預設範圍第 4 列可見**；修正前它排在第 591 名。`incompleteTotal` 由 **591 降為 4**
  ⇒ 畫面上的待辦號召自「591 件」回到真實的 4 件。

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

---

## 🔴 第四輪（前端棒 fe3）：第四種呈現態之前端落地（`OQ-E11-22`，2026-08-28）

> 本節由**前端棒**續寫（上方各節為 backend 棒）。環由 test-generator（tg3）先行建立、對實作全盲；
> 本棒**未撰寫、未修改任何測試檔**（`git diff --numstat` 對 `OjtProgressPage.test.tsx` 恆為
> `225 8`，與接手時之快照逐字相同；`OjtProgressPage.layout.test.tsx` 未出現於 diff）。

### 測試結果彙總

| 套件 | 結果 |
|---|---|
| `npx vitest run src/pages/OjtProgressPage.test.tsx --maxWorkers=4` | ✅ **88 / 88 全綠**（接手時恰 15 紅） |
| `npx vitest run --maxWorkers=4`（全量） | ✅ **113 檔 / 1709 測試 全綠**，其餘 73 案零波及 |
| `npx tsc --noEmit` | ⚠ **3 錯，全部在環之測試檔自身**（見 §前端申訴 1 件）；產品碼 0 錯 |

### 實作檔（僅產品碼）

| 檔案 | 變更 | 說明 |
|---|---|---|
| `frontend/src/api/types.ts` | modified | `OjtDocScope` 三值 → **四值**；`OjtDocCoverageSlice.byState` 增第四鍵 `unassigned?`（🔴 **選填**，理由見下）；`incompleteTotal` 之不變式註解就地更正為 ③′ |
| `frontend/src/pages/ojt-progress-view.ts` | modified | scope `option` 增第三順位；範圍空狀態第三句；截斷名詞表四變體；截斷句之**排序描述**與**去處**各拆成一張 `Record<OjtDocScope, string>`；新增 `DOC_UNASSIGNED_TEXT`／`DOC_UNASSIGNED_VISUAL`／`docCoverageRowView()`／`DOC_COVERAGE_NA_TEXT`／`DOC_COVERAGE_TRACKED_LABEL`／`DOC_COVERAGE_BREAKDOWN_LABEL`／`docCoverageBreakdown()`／`docCoverageBarClass()` |
| `frontend/src/pages/OjtProgressPage.tsx` | modified | 摘要行 `<p>` → **兩行 `<div>`**（class 逐字貼齊 prototype 之 `text-xs text-slate-500 mb-2 space-y-1` ＋兩個 `flex flex-wrap items-center gap-x-4 gap-y-1` 子行）；列上條件掛 `data-doc-no-using-dept`；比值與百分比欄 `—`；晶片改走 `docCoverageRowView()`；**補回進度條**（見下） |
| `frontend/src/components/Icon.tsx` | modified | 註冊 `circle-slash`（lucide `CircleSlash`） |

### 四項規格對應（`AC-14` ⑧～⑮／`AC-28` ⑲）

1. **⑧ 判準＝`totalUnits === 0`** 落為列內單一具名區域變數 `noUsingDept`，屬性／晶片／比值／百分比
   四處共用同一個判斷，不各寫一份。
2. **⑨ 四值範圍**：`DOC_COVERAGE_SCOPE_OPTIONS` 增第三順位；🔒 **切換仍為重新請求**
   （`loadSummary` 之 `useCallback` 相依於 `docScope`，未改為客端過濾）。
3. **⑫ 退化值不照畫**：`—` 由 `DOC_COVERAGE_NA_TEXT` 承載，比值與百分比兩欄共用同一常數。
4. **⑬ 摘要行兩行**：四個數字由 `docCoverageBreakdown()` **單一推導點**產出，兩條加總關係
   （`tracked + unassigned === total`、`stat 三態 === tracked`）因此為結構上必然、不可能分歧。

### 🔴 本輪之核心防線與其理由

- **負向鎖定 ①（值域維持三值）**：`<tr>` 之 `data-doc-ojt-state` 仍渲染 `c.state`（`AC-04` 口徑，
  無義務列於此為 `none`）；第四態以 `{...(noUsingDept ? { 'data-doc-no-using-dept': '' } : {})}`
  表達 ⇒ **進 DOM／不進 DOM**，非 CSS 隱藏。⚠ 兩者於同一列並存**正是事實**，實作未寫成互斥。
  ⚠ JSX 之 `data-x={true}` 會渲染成 `="true"`（不是無值屬性），故採物件展開。
- **負向鎖定 ②（共用常數不得加鍵）**：`frontend/src/domain/ojt-status-view.ts` **一個字未動**；
  第四態之 icon／色票／逐字住在 page-local 之 `ojt-progress-view.ts`，不外流至
  `prototypes/13`／`DocumentListPage` 之圖示欄與四值篩選。
- 🔴 **高風險假綠點（環已建攔截）**：摘要行下行之 `[data-doc-coverage-stat="none"]` 顯示
  `byState.none − byState.unassigned`（**有義務卻一列都沒完成**），**不是**端點回的 `byState.none`。
  真庫下兩者差 587 份 ⇒ 直接渲染端點欄位會在畫面上宣告一批**數量級錯誤的待辦**。
- **截斷句之兩處分岔用對照表、不用三元式**：`unassigned` 範圍下所有列覆蓋率皆為 `—`，
  宣稱「依覆蓋率排序」是假話，且不得把人導去「OJT 資料清單」（那些文件沒有進度列）。
  🔴 採 `Record<OjtDocScope, string>` 而非 `scope === 'unassigned' ? … : …`：日後若增第五個範圍，
  對照表會**編譯失敗**，三元式則會靜默落進 else 分支並繼續講那句假話。

### 🔵 順帶修復之既有 prototype 落差（lead 核可後補）

`prototypes/25` 之覆蓋率欄對**有義務**之列會畫一條進度條
（`w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden` 內含 `style="width:{pct}%"` 之填色條，
100% `bg-emerald-500`／0% `bg-slate-300`／其餘 `bg-primary-500`；pct 文字 100% 時 `text-emerald-700`），
但 React 自上一輪節流上線（`1b71595`）起**只有純文字百分比、沒有那條進度條**。

**判定為漏做而非決策**：`AC-14` ⑫ 與 §6 兩處反覆寫「第四態…**且不畫進度條**」——該句只有在其他態
**有**進度條時才成立；環那條 `expect(row.querySelectorAll('[style]')).toHaveLength(0)` 之註解亦寫著
「三態列之進度條為唯一會有行內 style 之元素」，等於預設它存在。🔴 **環抓不到它**：該斷言只掃無義務列。
已依 prototype 逐字補回（填色三檔抽為 `docCoverageBarClass()`，🔒 無義務列**根本不進該分支**——
傳 `0` 進去畫一條寬度 0 的灰條，等於仍在宣稱「量測過、結果是 0」）。已請 lead 轉 tg3 補一條斷言蓋住。

### 🔴 前端申訴 1 件（產品碼結構上無法修，已轉 tg3）

`frontend/src/pages/OjtProgressPage.test.tsx` 之 3 個 `TS2741`（第 **472**、**506**、**522** 行，
`byState` 字面量缺 `unassigned`）。

**舉證**：tg3 本輪把同檔第 87 行 `docCoverageSlice()` 之 `over.byState` 型別就地改為**必填四鍵之
inline literal**，但未同步更新自己這 3 個舊呼叫點。該 inline literal **不引用任何 production 符號**
（本棒之 `OjtDocCoverageSlice.byState` 為 `unassigned?` 選填）⇒ **不存在任何產品碼改動能消掉這 3 個錯**
——把它改必填、改選填、甚至整個刪除，這 3 行照錯不誤。
**建議修法**：該 3 處補 `unassigned: 0`（那 3 筆 fixture 之語意本就是「沒有無義務文件」，
補 0 **不改變任何期望值**）。
**執行期已無影響**：`docCoverageBreakdown()` 以 `byState.unassigned ?? 0` 讀取 ⇒ 第 472 案
（`none: 4`）仍正確顯示「尚未開始 4 份」而非 `NaN`，該 3 案目前是**綠的**，純粹是 tsc 紅。

> 📌 **選填之判準（記錄以免下次重犯）**：`byState.unassigned` 在契約上是後端恆送之新鍵，直覺會宣告
> 必填。但 `OjtProgressPage.layout.test.tsx:47` 以**舊三鍵**字面量建構整個 slice 並餵給
> `mockResolvedValue<OjtProgressSummary>`——那是一份**本棒不得編輯**的測試檔 ⇒ 宣告必填會使它 tsc 紅、
> DoD 結構上不可達。**「必填 vs 選填」不是風格選擇，是由那些不可編輯的字面量決定的。**

### ⚠ jsdom 驗不了、需真瀏覽器驗收（版面全綠只證明沒回歸）

1. 摘要行由一行變兩行後之**實際折行與整區高度**（`space-y-1` ＋兩個 `flex-wrap` 容器在 1440 與窄視窗下各自怎麼折）。
2. **`circle-slash` 是否真的畫得出來**——測試只斷言 `textContent`，圖示元件回 `null` 時照樣全綠
   （本棒已主動註冊，但那是環驗不到的洞）。
3. 補回之**進度條實際寬度與三檔顏色**——`style={{width}}` 於 jsdom 無版面引擎。
4. `text-slate-500` 之**實測對比**（5:1 為規格宣稱值，非本輪量測）。
5. 真庫 587 份下 `unassigned` 範圍（18 > 15 會截斷）滿欄 `—` 之**視覺密度**。
6. 🔵 **規格明文列為後續、但真人一點就會遇到**：切至 `unassigned` 範圍後
   `[data-doc-coverage-more]` 仍導向 TAB2，而該範圍之文件在 TAB2 **沒有列** ⇒ 會落在空清單。
   `AC-14` ⑮ 明訂本輪不處理（`OQ-E11-22` 之 🔵 後續），**驗收時不應判為 bug**。
