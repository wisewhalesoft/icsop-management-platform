---
type: implementation-log
feature_id: F041
feature_name: 一般使用者子分類——業務／其他（業務限縮於使用部門）
status: complete
last_updated: 2026-08-11
---

# F041: 一般使用者子分類（業務／其他） — Implementation Log

> 本輪為 Uncle-Bob 約束環模式（**簡易版 ring**：僅 backend jest／frontend vitest，無 Playwright／Stryker／
> dependency-cruiser，使用者指示）。測試（環）由 `test-generator` 於實作前 blind-to-implementation 撰寫，
> 本 agent **僅撰寫 production code**，未新增／修改／刪除任何測試檔。
> 環中發現之缺陷一律以爭議申訴送交 `test-generator` 裁決（見「環爭議與裁決」節）。

## Test Results Summary

### 環（約束檔 ↔ AC ↔ 結果）

| 代號 | 檔案 | 對應 AC | 結果 |
|---|---|---|---|
| BE-1 | `backend/src/rbac/viewer-scope.spec.ts`（新增） | AC-01～AC-13（含 AC-10 與 `isPinned` 逐案相等） | PASS |
| BE-2 | `backend/src/public/public-list.spec.ts` | AC-14～AC-19／F019 AC-U1～U5 | PASS |
| BE-3 | `backend/src/public/public-documents.service.spec.ts` | AC-14（viewer pass-through） | PASS |
| BE-4 | `backend/src/public/public-documents.controller.spec.ts` | viewer 組出與委派（含新增 `@Req()`） | PASS |
| BE-5 | `backend/src/public/public-document-detail.service.spec.ts` | AC-20～AC-24／F019 AC-U6 | PASS |
| BE-6 | `backend/src/public/watermark.service.spec.ts` | AC-25～AC-30／F020 AC-U1～U5＋架構風險#19 | PASS |
| BE-6b | `backend/src/public/watermark.controller.spec.ts` | `toWatermarkSession` 之 userSubtype 映射（爭議 #1 裁決後新增） | PASS |
| BE-7 | `backend/src/org-sync/typeorm-org-sync.store.spec.ts` | AC-34／F003 AC-U4（green guard） | PASS |
| BE-8 | `backend/src/accounts/accounts.service.spec.ts` | AC-36／F003 AC-U2／AC-U5 | PASS |
| BE-9 | `backend/src/rbac/function-matrix.spec.ts` | AC-37／F025 AC-U2／AC-U3 | PASS |
| BE-10 | `backend/src/rbac/field-matrix.spec.ts` | AC-38／F026 AC-U2 | PASS |
| FE-1 | `frontend/src/domain/user-subtype.test.ts`（新增） | AC-01／AC-02／AC-31／AC-32 | PASS |
| FE-2 | `frontend/src/pages/PublicListPage.userSubtype.test.tsx`（新增） | AC-33／AC-40／F019 AC-U7 | PASS |
| FE-3 | `frontend/src/pages/AccountManagementPage.test.tsx` | AC-32／F003 AC-U1／U2 | PASS |
| FE-4／FE-5 | `frontend/src/domain/function-matrix.test.ts`／`field-matrix.test.ts` | AC-37／AC-38（前端鏡射 arity） | PASS |

### 機器閘門（實跑數字）

| 閘門 | 指令 | 結果 |
|---|---|---|
| backend 型別 | `cd backend && npx tsc --noEmit` | **0 error**（exit 0） |
| backend 單元 | `cd backend && npx jest --maxWorkers=2` | **117 suites / 1505 tests 全綠**（RED 基線：7 suites failed／6 tests failed／1382 passed） |
| frontend 型別 | `cd frontend && npx tsc --noEmit` | **0 error** |
| frontend 單元 | `cd frontend && npx vitest run --no-file-parallelism --pool=threads` | **56 files / 722 tests 全綠**（RED 基線：3 files failed／3 tests failed／692 passed） |
| DB migration | `cd backend && npm run migration:run` | **實跑成功**（見「Migration 實跑證據」節） |

**零測試碼佐證**：本 agent 對 `*.spec.ts`／`*.test.ts`／`*.test.tsx` 之改動筆數為 **0**。
工作樹中之測試檔改動全數為 `test-generator` 所為（建環時 10 檔＋爭議 #1 裁決後之 `watermark.controller.spec.ts`）。
`docs/specs/**` 亦未改動（本檔所在之 `implementation-log/` 除外）。

## Files Changed

### Backend — 新增

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/rbac/viewer-scope.ts` | new | 判定契約權威：`ViewerScope`／`normalizeUserSubtype`／`isDeptScopedViewer`／`isUsingDeptMatched`／`isDocVisibleToViewer`／`toViewerScope` |
| `backend/src/database/migrations/1723766400000-account-user-subtype.ts` | new | `ACCOUNT.userSubtype nvarchar(20) NOT NULL DEFAULT 'other'` ＋ `CHECK` |

### Backend — 修改

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/public/public-list.ts` | modified | `buildPublicList` 第二參數 `userOrgCode` → **必要參數** `viewer: ViewerScope`；於 `base` 之後插入 `visible` 過濾；`splitAndSort(filtered, viewer.orgCode)`。`isPinned`／`splitAndSort`／`hiddenCount` 計算式**均未改動** |
| `backend/src/public/public-documents.service.ts` | modified | `list()` 第一參數改為 `viewer`；`toDto()` 之置頂來源改 `viewer.orgCode` |
| `backend/src/public/public-documents.controller.ts` | modified | `list()` 以 `toViewerScope(req.sessionUser)` 取代裸 `orgCode`；`detail()` **從零新增 `@Req()`** 並改為 `detail(id, toViewerScope(...))` |
| `backend/src/public/public-document-detail.service.ts` | modified | `detail()` 新增必要參數 `viewer`；於「非已公告→404」之後、**名稱解析之前**插入可見性檢查；新增私有 `rejectDeptRestricted()` |
| `backend/src/public/watermark.service.ts` | modified | `WatermarkDocMeta.getDocMeta()` additive 回傳 `usingDeptIds`；`WatermarkSession` 加選填 `userSubtype`；`view`／`burnAndAudit` 呼叫序重排（先 `loadDocMeta` → `assertDocVisible` → 才 `buildSnapshot`）；`getOriginalPdf` 於受限 viewer 時先判定；新增 `toViewer`／`loadDocMeta`／`assertDocVisible`／`rejectDeptRestricted` |
| `backend/src/public/watermark.controller.ts` | modified | `toWatermarkSession()` 新增 `userSubtype: u.userSubtype ?? null` |
| `backend/src/public/typeorm-watermark.sources.ts` | modified | `TypeOrmDocMeta.getDocMeta()` 以分離查詢 `DOC_USING_DEPT` 補上 `usingDeptIds`（比照 `typeorm-public-documents.store.ts` 既有手法，不改 JOIN） |
| `backend/src/auth/session-token.service.ts` | modified | `SessionUser` 加 `userSubtype?: string \| null`（**不進 `SessionClaims`／JWT**，比照 orgCode 之 PII 定案） |
| `backend/src/auth/account-repository.ts` | modified | `CurrentAccount` 加 `userSubtype?: string \| null` |
| `backend/src/auth/typeorm-account.repository.ts` | modified | `findCurrentByLogin()` 回傳 `userSubtype`（`findOne` 未指定 select，零額外查詢成本） |
| `backend/src/auth/session.guard.ts` | modified | `fresh` 物件加 `userSubtype: current.userSubtype ?? null`（繼承「下次請求即生效」特性） |
| `backend/src/database/entities/account.entity.ts` | modified | 新增 `userSubtype nvarchar(20) NOT NULL DEFAULT 'other'` |
| `backend/src/accounts/accounts.store.ts` | modified | `AccountView` 加**選填** `userSubtype`；`UpdateAccountPatch` 加選填 `userSubtype` |
| `backend/src/accounts/accounts.service.ts` | modified | `assignRole()` 新增第四參數；**僅** `newRole === 'User'` 時併入 `normalizeUserSubtype(...)` 之結果 |
| `backend/src/accounts/accounts.controller.ts` | modified | `PATCH :id/role` body 接受選填 `userSubtype` 並透傳（controller 不做任何子分類邏輯） |
| `backend/src/accounts/typeorm-account.store.ts` | modified | `toView()` 帶出 `userSubtype`（供前端 modal 預選現值） |

### Frontend — 新增

| File Path | Change Type | Description |
|---|---|---|
| `frontend/src/domain/user-subtype.ts` | new | `normalizeUserSubtype`／`userSubtypeLabel`／`isSubtypeApplicable`＋`SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS` 逐字常數 |

### Frontend — 修改

| File Path | Change Type | Description |
|---|---|---|
| `frontend/src/api/types.ts` | modified | `SessionUser`／`AccountView` 各加選填 `userSubtype` |
| `frontend/src/api/endpoints.ts` | modified | `assignAccountRole(id, roleCode, userSubtype?)`；body **條件式**納入該鍵 |
| `frontend/src/pages/PublicListPage.tsx` | modified | info note 改為 `data-testid="scope-notice"`＋依 viewer 分支之常數（取代原本散落於 JSX 之字面字串） |
| `frontend/src/pages/AccountManagementPage.tsx` | modified | `RoleModal` 加 `subtype` 狀態、條件式子分類選擇器（`SUBTYPE_CODES`／`SUBTYPE_DESC`／`SubtypeBadge`）、`submit()` 之 `subChanged` 判定與第三參數傳遞 |

## Architectural Decisions

1. **四入口簽章為必要參數而非選填**（架構 §3.7 決策一）：`buildPublicList`／`list()`／`detail()` 之 `viewer`
   一律必填，由 TypeScript 型別系統強制呼叫端提供——deny-by-default 不能仰賴呼叫端「剛好記得傳」。

2. **AC-10／AC-15 由結構保證，非額外邏輯**：`isUsingDeptMatched` 之運算式
   `usingDeptIds.some(code => isWithinSubtree(code, orgCode))` 與 `public-list.ts` 之 `isPinned()` **逐字相同**
   （INV-4：全系統唯一一套部門比對邏輯）。因此「通過 `visible` 過濾者必然 `isPinned === true`」是數學推論，
   AC-15「其餘區恆空」不需任何特判，前端分區渲染邏輯亦零改動。

3. **AC-18 之零額外邏輯**：`hiddenCount = items.length - base.length` 保持原式不動；新增之 `visible` 步驟
   插在 `base` 之後，該式從未參照它，故「僅計基底條件隱藏者」天然成立。

4. **`WatermarkService` 之呼叫序重排而非新增檢查點**：`view()`／`burnAndAudit()` 原本**先** `buildSnapshot()`，
   與 AC-25「org 查找 0 次」直接衝突。改為先 `loadDocMeta()`（view 本就要取，零額外查詢；download/print 則是把
   原本由 `audit()` 內部做的那次查詢提前並重用）→ 判定 → 才 `buildSnapshot()`／`getOriginalPdf()`／`burnPdf()`。
   AC-27／AC-28「拒絕路徑不寫任何稽核」因此自然成立——`audit()` 之呼叫點本就在通過檢查之後。

5. **`getOriginalPdf` 僅對受限 viewer 查中繼**：以 `isDeptScopedViewer()` 短路，使非受限 viewer 之 PDF 代理
   維持「零額外查詢」之現況（該端點為檢視器熱路徑），同時仍滿足 AC-25／AC-26 之 0 次呼叫斷言。

6. **架構風險#19 deny-by-default**：`assertDocVisible` 以 `meta?.usingDeptIds ?? []` 餵入判定式——
   `docMeta` 未注入或查無時，受限 viewer 恆得 `false`（拒絕），非受限 viewer 恆得 `true`（沿用既有 `meta=null` 容錯）。
   單一運算式同時涵蓋兩種情形，不需分支特判。

7. **拒絕之單一 throw 點**：`PublicDocumentDetailService` 與 `WatermarkService` 各有一個私有
   `rejectDeptRestricted()`。今天回 404 `DOCUMENT_NOT_FOUND`（OQ-E06-03 選項 A）；日後若政策改判 403，
   此二方法為唯一需修改處。

8. **AC-36「保留不清空」之落點在 `newRole` 而非參數有無**：`assignRole()` 是否寫入 `userSubtype` 鍵，
   取決於 `newRole === 'User'`，與呼叫端是否傳入第四參數**無關**。故非 User 角色縱使夾帶該值亦不寫入。
   「日後改回 User 沿用舊值」之復活效果由前端 modal 預選 `normalizeUserSubtype(target.userSubtype)`
   後原樣送出達成，後端不做特判（此即 BE-8 第四條測試所鎖之契約）。

9. **`AccountView.userSubtype` 宣告為選填**：若做成必填，既有數十處 `AccountView` 物件字面量夾具與
   前端 `ROWS` fixture 會全數編譯失敗。選填不影響生產路徑（TypeORM store 恆帶出值）。

10. **前後端各一份 `normalizeUserSubtype`**：本專案無前後端共用 package（既有慣例，比照 F040
    `lifecycle-subcategory.ts`）。兩份語意逐字一致，且各自被環約束（BE-1 與 FE-1 之 9 案例輸入完全相同）。

## Migration 實跑證據

> 遵循本 repo 既有踩雷紀錄：**單元測試全綠不證明資料表/欄位存在於實際 DB**，migration 必須實跑。

- **執行方式**：由 host 執行 `cd backend && npm run migration:run`（ts-node；`data-source.ts` 讀專案根 `.env`）。
  未走容器路徑——容器 `dist` 為舊建置，尚不含本次新檔（容器路徑須先重建 image）。
- **目標 DB**：`APP_MSSQL_HOST=172.20.202.212` / `APP_MSSQL_DATABASE=SOP`（與容器環境變數一致）。
- **執行結果**：`Migration AccountUserSubtype1723766400000 has been executed successfully.`（第 **29** 支）。

實跑後之 `SELECT` 驗證（探針列已於同一腳本內刪除，殘留 0 筆）：

| 驗證項 | 結果 |
|---|---|
| 欄位存在與型別 | `userSubtype` / `nvarchar` / 長度 20 / `IS_NULLABLE=NO` / `COLUMN_DEFAULT=('other')` |
| CHECK 約束 | `CK_ACCOUNT_userSubtype` = `([userSubtype]='other' OR [userSubtype]='business')` |
| 既有列 backfill | **1119 列全部為 `'other'`**（無任何既有帳號被意外限縮，AC-35 之意圖達成） |
| AC-35（不帶該欄之 INSERT） | 落地為 `'other'` |
| INV-1（CHECK 實效） | `UPDATE ... SET userSubtype='Business'` → **被 CHECK 約束拒絕**（此即 AC-02 fail-open 之安全性依據） |
| 合法值寫入 | `'business'` 寫入成功 |

⚠ **尚未部署到執行中的容器**：`icsop-management-platform-backend-1` 仍跑舊 `dist`（其 `Account` entity 不認識
新欄位）。因欄位為 additive＋有 DEFAULT，舊程式碼之 INSERT 不會失敗，故不構成 runtime 破壞；但 F041 之行為
要到重建 backend image 後才會在瀏覽器生效。

## 環爭議與裁決

### 爭議 #1（已裁決：`test-generator` 採納並自行改測試）

- **標的**：`backend/src/public/watermark.controller.spec.ts` 之
  `it('toWatermarkSession：accountId=ACCOUNT.id（UUID）、身分快照映射')`——6 鍵完整 `toEqual`，不含 `userSubtype`。
  該檔於建環時**未被納入簽章遷移**（其餘 10 檔皆已遷移）。
- **本 agent 之舉證**：架構 §3.7 決策一之四入口簽章變更表第 4 列逐字要求 `toWatermarkSession()` 新增
  `userSubtype: u.userSubtype ?? null`；而環本身（`watermark.service.spec.ts` 之 `bizSession()`）正是以
  `WatermarkSession.userSubtype` 注入業務子分類，故生產路徑唯一能填它的就是這個函式。
  `toEqual` 不忽略「值為 `null` 的多餘鍵」⇒ **「加該行」與「維持 6 鍵斷言」在數學上互斥**。
  不加＝AC-25～AC-30 在真實 HTTP 路徑上完全失效（環綠但生產防護是死的），正是 AC-30「後端權威」要防的事。
- **裁決結果**：`test-generator` 採納，於該 `toEqual` 加 `userSubtype: null`，並**另補一條**
  「`SessionUser` 帶 `userSubtype='business'` → 映射為 `'business'`」之正向測試（比本 agent 建議更嚴）。
- **本 agent 對該檔之改動筆數：0。**

## 本輪未覆蓋（沿用 test-generator 之判定，非缺陷）

| AC | 理由 |
|---|---|
| AC-35 | 由 DB 層 `NOT NULL DEFAULT 'other'` 保證，in-memory fake 不模擬欄位預設值 → jest/vitest 無可斷言之標的。**已改以 migration 實跑之 `INSERT` 探針驗證**（見上表），非留白。 |
| AC-39 | F033（RAG 問答）Phase 3 尚未實作，規格明載本輪不驗收。 |

## Blocking Issues

無。
