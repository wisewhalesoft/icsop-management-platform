---
type: implementation-log
feature_id: F003
feature_name: 手動帳號基本資料 delta（姓名／公司／部門／職位）＋ F001 跨公司帳密登入解析
status: complete
last_updated: 2026-08-14
---

# F003 手動帳號基本資料 delta — 實作紀錄（backend 半邊）

> 範圍：`backend/` 產品碼。frontend 由 `impl-frontend` 並行處理，檔案不相交。
> 規格權威：`docs/specs/features/F003-account-role-management.md#manual-account-profile`（AC-P1～AC-P27）、
> `docs/specs/features/F001-auth-login-session.md`（AC-C1～AC-C3）、`docs/specs/error-handling.md` v1.5。
> 本人未新增／修改任何測試檔；兩處測試變更皆由 `test-generator` 依 dispute 裁決後自行落地（見文末）。

## Test Results Summary

| 驗收門檻 | 指令 | 實際結果 |
|---|---|---|
| 單元環 | `npx jest src/accounts/account-profile.spec.ts` | **45 / 45 綠**（實作前為 36 紅 / 9 綠） |
| 帳號＋登入閉環回歸 | `npx jest src/accounts src/auth/account-login-closure.spec.ts` | **5 suites / 82 tests 全綠** |
| backend 全量 | `npx jest` | **123 suites / 1630 tests 全綠**（`Test Suites: 123 passed`／`Tests: 1630 passed`；零回歸） |
| 整合（F003） | `npx jest --config test/jest-int.json account-profile` | **40 / 40 綠**（dispute #2 裁決落地後複驗） |
| 整合（F001） | `npx jest --config test/jest-int.json auth.itest` | **7 / 7 綠** |
| 整合全量 | `npm run test:int` | **19 suites / 155 tests，唯一紅為 `access-history` 之 TS-AQ-INT-012**（既有紅燈＝資料飄移，team-lead 指定排除、未修改）。其餘 **18 suites 全綠，無任何回歸** |
| typecheck | `npx tsc --noEmit -p tsconfig.json` | **通過（零錯誤）** |
| 架構度量 | `npm run deps:check` | **no dependency violations（287 modules / 797 deps）** |

### AC 對照

| AC | 落地位置 | 狀態 |
|---|---|---|
| AC-P1／AC-P2 建立契約與正規化 | `accounts.service.ts` `createManual`＋`account-profile-rules.ts` | PASS |
| AC-P3 姓名必填 | `createManual` 步驟① | PASS |
| AC-P4 長度上限 | `assertProfileLengths`（建立／編輯共用） | PASS |
| AC-P5 公司可跨選／無效即 400 | `createManual` 步驟③＋`isSelectableCompany` | PASS |
| AC-P6 部門有效性（不檢查 isActive） | `assertOrgCodeValid` | PASS |
| AC-P7 職位有效性（不做跨公司 fallback） | `assertJobTitleValid` | PASS |
| AC-P8 驗證順序 ①②③④⑤⑥ | `createManual` 之語句順序 | PASS |
| AC-P9 編輯契約（缺席／清空／姓名不可清空） | `updateAccount` | PASS |
| AC-P10／AC-P10a／AC-P10b 變更公司 | `updateAccount` 步驟 3／6／2 | PASS |
| AC-P11 上游唯讀先於值驗證 | `updateAccount` 步驟 1＋`UPSTREAM_READONLY_KEYS` | PASS |
| AC-P12 副作用邊界 | patch 僅含 payload 出現過之鍵 | PASS |
| AC-P14 `GET /job-titles` | `org-directory/master-data.controller.ts` | PASS（int） |
| AC-P15 `GET /companies`＋INV-C1 | 同上＋`company-name.ts` | PASS（int） |
| AC-P20 權限／AC-P21 稽核靜默 | 既有 guard 鏈；未接 `AuditWriter` | PASS（int） |
| AC-P22 無 migration | 四欄皆已存在 | 未新增任何 migration |
| AC-P23a～e 清單跨公司＋逐列解析 | `listAccounts`＋`typeorm-account.store.ts` | PASS（含 AC-P23d 複合鍵，dispute #2 修正後複驗綠） |
| AC-P24 loginId 全域唯一 | `existsLoginIdGlobal` | PASS（int） |
| AC-P25／AC-C1～C3 跨公司登入 | `password-login.service.ts` `resolveAccount` | PASS（int 7/7） |
| AC-P26 部門候選為空仍可建立 | `assertOrgCodeValid` 對 `null` 略過 | PASS（int） |
| AC-P27 既有 AS 路徑回歸 | — | PASS（int） |

## Files Changed

| 檔案 | 類型 | 說明 |
|---|---|---|
| `backend/src/org-directory/company-name.ts` | modified | `COMPANY_FULL_NAMES` 擴為 `AS`＋`AE`；新增 `SELECTABLE_COMPANIES`（**以 `Object.keys` 導出**，INV-C1 結構上不可漂移）、`isSelectableCompany`、`listSelectableCompanies`、`CompanyOption` |
| `backend/src/org-directory/master-data.controller.ts` | **new** | `GET /companies`（AC-P15）與 `GET /job-titles`（AC-P14）；皆為「帳號管理」read |
| `backend/src/org-directory/org-directory.module.ts` | modified | 註冊上述兩個 controller（重用既有 `JOB_TITLE_READ_STORE`） |
| `backend/src/accounts/account-profile-rules.ts` | **new** | AC-P2 正規化與 AC-P4 長度常數（建立／編輯共用之純邏輯） |
| `backend/src/accounts/accounts.service.ts` | modified | `createManual` 六階段驗證；`updateAccount` 六階段驗證；`listAccounts` 改逐列解析；新增 `buildDepartmentIndex`／`assertOrgCodeValid`／`assertJobTitleValid`／`loginIdTaken` |
| `backend/src/accounts/accounts.store.ts` | modified | `AccountView.companyCode?`；`AccountListFilters.companyCode?`；`CreateAccountInput` 增 `orgCode`／`jobTitleCode`／`userSubtype`；`UpdateAccountPatch` 增三欄；`AccountStore.existsLoginIdGlobal?`（選填） |
| `backend/src/accounts/typeorm-account.store.ts` | modified | `toView` 帶出 `companyCode`；`list` 移除租戶過濾、改吃 `filters.companyCode`；新增 `existsLoginIdGlobal`；`create` 寫入 `orgCode`／`jobTitleCode`／`userSubtype` |
| `backend/src/accounts/accounts.controller.ts` | modified | `CreateBody`／新 `UpdateBody` 型別；清單新增 `companyCode` query |
| `backend/src/auth/account-repository.ts` | modified | 新增**選填** `findByLoginIdAnyCompany?(loginId): Promise<PasswordAuthAccount[]>` |
| `backend/src/auth/typeorm-account.repository.ts` | modified | 實作上述方法；抽出共用 `toPasswordAuth` |
| `backend/src/auth/password-login.service.ts` | modified | 帳號解析改兩段式 `resolveAccount`（AC-C1） |

## Architectural Decisions

1. **INV-C1 以結構保證，非以測試保證**：`SELECTABLE_COMPANIES = Object.keys(COMPANY_FULL_NAMES)`。
   刻意不另寫一份陣列——兩者恆等於是型別/求值層級的事實，不依賴任何人記得同步。新增公司只改一處常數，
   下拉（`GET /companies`）、寫入驗證（AC-P5／AC-P10）、清單公司欄（AC-P23c）、F020 浮水印四處自動一致。

2. **兩個介面擴充一律採「選填方法＋降級」**（`AccountStore.existsLoginIdGlobal?`、
   `AccountRepository.findByLoginIdAnyCompany?`）。理由：這兩個介面各有 5～6 個既有測試替身以
   `implements` 宣告；改為必填方法會使全部替身編譯失敗，屬與本 delta 無關的破壞。降級行為皆為
   **新行為之子集**（per-company 檢查是全域檢查的子集；跳過第②段＝既有單公司行為），故不會誤放行。

3. **`AccountStore.list` 之第一參數保留但不再用於過濾**：AC-P23a 要求移除租戶過濾，但該簽章被
   環中的測試替身 `implements`，變更參數形狀會破壞測試檔（非我可動）。故 TypeORM 實作將其
   更名為 `_operatorCompany` 並於註解載明「不再用於過濾」，租戶範圍改由 `filters.companyCode` 表達。

4. **AC-P23d 用複合鍵索引而非 N+1 查詢**：`buildDepartmentIndex` 先自本頁列取出**去重後**的公司集合
   （上限＝`SELECTABLE_COMPANIES` 大小），每家公司呼叫一次 `listByCompany(company, {includeInactive:true})`，
   以 `` `${companyCode}|${orgCode}` `` 為鍵建 Map。`includeInactive` 為必要——AC-P6 明載寫入端不檢查
   `isActive`，顯示端若只取 active 會讓「部門已停用之既有帳號」顯示 `—`，與寫入端不一致。

5. **AC-P6 改用 `listByCompany` 而非 `findByOrgCode`**：後者之生產實作
   （`TypeOrmOrgUnitReadStore.findByOrgCode`）把 `companyCode` 寫死為建構子帶入的 `SYNC_COMPID`，
   跨公司後會對非 AS 公司恆回 `null`（＝合法代碼也被拒）。`listByCompany` 才是以參數公司為範圍的正解。

6. **AC-P10a 與 AC-P24 落在不同方法**：前者用 `store.existsLoginId(新公司, loginId)`（per-company，
   對應 DB 唯一鍵），後者用 `store.existsLoginIdGlobal(loginId)`（全域，使 AC-C1 之登入解析可單以
   loginId 定位）。spec 之對照表明載兩者檢查點與比對範圍皆不同，故未合併。

7. **AC-C1 第②段回傳陣列而非單筆**：`findByLoginIdAnyCompany` 刻意回 `PasswordAuthAccount[]`——
   「恰一筆才採用」之判定需要**筆數本身**；若介面回單筆，「命中多筆」情境在型別層就已無從偵測，
   實作必然退化為任選一筆（正是 AC-C1③ 明令禁止者）。

8. **未觸及稽核子系統**（AC-P21）：`AUDIT_LOG.targetType` 列舉不含 `ACCOUNT`，故建立／編輯路徑
   完全不注入 `AuditWriter`。int 層以「前後 `COUNT(*)` 相等」驗證。

9. **零 migration**（AC-P22）：`name`／`companyCode`／`orgCode`／`jobTitleCode` 四欄皆已存在於
   `account.entity.ts` 與既有 migration，本次僅新增寫入路徑。

## 對測試提出之 dispute 與裁決

| # | 對象 | 內容 | 結果 |
|---|---|---|---|
| 1 | `accounts.service.spec.ts:181/192/197`、`account-login-closure.spec.ts:92/106` | 5 個 `createManual` 呼叫點之 payload 無 `name`，與 AC-P3（姓名必填）／AC-P8（`VALIDATION_ERROR` 序位①）**數學上互斥**（窮舉兩種可能行為皆有一側必紅） | **test-generator 採納**，5 處各補 `name:'X'`，待測命題不變、未弱化任何斷言。現全綠 |
| 2 | `test/int/account-profile.itest.ts:479` | `expect(row!.department).not.toMatch(/審查室/)` 於前一行已要求 `department` 為 `null` 的前提下必丟 `Matcher error: received value must be a string`；窮舉 `department` 全值域無一能讓 478/479 同時綠——**與實作無關之不可滿足斷言** | **test-generator 採納（選項 A）**，刪除 :479 並加註說明；:478 `toBeNull()` 本即嚴格更強之命題（null 無子字串可言），鑑別力不減。複驗 **40/40 全綠** |

> ✅ 兩件 dispute 皆由測試作者裁決並自行修正測試檔。本人自始至終未新增／修改／弱化／跳過任何測試檔——
> `git status -- backend/` 中的 5 個測試檔（`accounts.service.spec.ts`／`account-login-closure.spec.ts`／
> `auth.itest.ts`／`account-profile.spec.ts`／`account-profile.itest.ts`）**全部**為 test-generator 之產出。

## Blocking Issues

- **無阻擋，本 delta 之 backend 半邊全部完成。**
- 過程中 `src/http-contract.spec.ts` 曾出現一次紅燈，經查為 **CPU 競用假紅**（supertest 預設 5s
  testTimeout，與 frontend vitest 並行時逾時；單獨執行 10/10 綠 / 3.4s，且該檔測附錄上傳檔名編碼、
  與本 delta 無交集）。競用消退後之全量重跑為 **123/123 suites 全綠**，已確認非實質問題。
- `test/int/access-history.itest.ts` 之 `TS-AQ-INT-012` 為既有紅燈（資料飄移），依 team-lead 指示不列入驗收、未修改。

---

# F003 手動帳號基本資料 delta — 實作紀錄（frontend 半邊）

> 範圍：`frontend/` 產品碼。由 `impl-frontend` 與 backend 半邊並行實作，檔案不相交。
> 版面／文案權威：`prototypes/08-account-management.html`（建立 modal `:159`、編輯 modal `:197`、
> 雙連動 `syncProfileOptions` `:467`、`buildOrgPath` 移植 `:378`、具名常數 `:330/:335/:339`）。
> 本人**未新增／修改任何測試檔**；三處測試變更皆由 `test-generator` 依 dispute 裁決後自行落地（見文末）。

## Test Results Summary

| 驗收門檻 | 指令 | 實際結果 |
|---|---|---|
| 前端全量 | `cd frontend && npx vitest run` | **60 檔 / 786 測試全綠** |
| 門檻三檔複驗 | `npx vitest run src/api/proxy-coverage.test.ts src/pages/AccountManagementPage.test.tsx src/pages/LoginPage.test.tsx` | **3 檔 / 70 測試全綠** |
| typecheck | `cd frontend && npx tsc --noEmit` | 原 2 個 `getCompanies`／`getJobTitles` 未匯出之錯誤**已消失**；剩餘**唯一**錯誤為既有缺口（見 Blocking Issues） |

基準為 781（773 綠＋8 紅）。781 → 786 之差額全部有帳：dispute #2 裁決時 `test-generator` **新增 1 條**
測試（`AccountManagementPage.test.tsx` 38→39）；`src/api/proxy-coverage.test.ts` 係以後端 controller
前綴參數化之 `it.each`，本 delta 新增 `/companies`／`/job-titles` 兩個前綴 ⇒ **動態多出 4 條** case。

### AC 對照（前端側）

| AC | 落地位置 | 狀態 |
|---|---|---|
| AC-P3 姓名必填＋行內錯誤 | `CreateModal.submit`（沿用 `ERROR_MSG.VALIDATION_ERROR`＝「必要欄位缺漏」） | PASS |
| AC-P13 部門候選（tier≠ROOT、orgCode 昇冪、不再限縮 tier） | `domain/account-profile.ts` `orgOptionsFor` | PASS |
| AC-P14 職位候選（依 companyCode 精確過濾、code 昇冪） | 同上 `jobOptionsFor`＋`getJobTitles(companyCode)` | PASS |
| AC-P15 公司候選＝全部有效公司 | `getCompanies()`＋`ProfileFields` 公司下拉 | PASS |
| AC-P16 公司→部門＋職位**雙連動**（換公司兩者已選值皆清空、候選重算） | `ProfileFields` 之 `onChange({companyCode, orgCode:'', jobTitleCode:''})` | PASS |
| AC-P17 部門選項文字＝`buildOrgPath` | `ProfileFields`（先 `unitsOf` 收斂再呼叫，簽章不變） | PASS |
| AC-P18 留空顯示「—」、無「（待同步）」 | 清單既有 `?? '—'`；全頁無佔位字串 | PASS |
| AC-P19 編輯預填＋upstream 四欄唯讀 | `EditModal` 之 `ProfileValue` 初值＋`readOnly={upstream}` | PASS |
| AC-P23b 清單公司篩選器（預設項＝`所有公司`） | 篩選列新增 `aria-label="公司篩選"` 下拉 | PASS |
| AC-P26 候選為空 → 部門停用＋逐字空狀態說明，不阻擋建立 | `ProfileFields` 之 `orgEmpty`／`ORG_EMPTY_NOTICE` | PASS |
| F001 AC-C2 登入頁不得新增公司欄位 | 未改 `LoginPage`（回歸護欄） | PASS |

## Files Changed

| 檔案 | 類型 | 說明 |
|---|---|---|
| `frontend/src/api/endpoints.ts` | modified | 新增 `getCompanies()`（`GET /companies`）與 `getJobTitles(companyCode?)`（`GET /job-titles?companyCode=`）；`getAccounts` 加選填 `companyCode` 篩選；`createAccount`／`updateAccount` 之 body 型別擴 `name`／`companyCode`／`orgCode`／`jobTitleCode` |
| `frontend/src/api/types.ts` | modified | 新增 `CompanyRecord`／`JobTitleRecord`；`AccountView` 加選填 `companyCode`／`jobTitleCode`；`AccountFilters` 加 `companyCode`。**全為 additive optional**，既有 fixture 零破壞 |
| `frontend/src/domain/account-profile.ts` | **new** | 具名常數 `COMPANY_ALL_LABEL`／`ORG_EMPTY_NOTICE`／`PROFILE_UNSET_LABEL` ＋純函式 `unitsOf`／`orgOptionsFor`／`jobOptionsFor`／`mergeJobTitles`／`normalizeProfileCode`（比照既有 `domain/user-subtype.ts` 之處置：逐字文案以具名常數持有，不得散落 JSX） |
| `frontend/src/pages/AccountManagementPage.tsx` | modified | 新增共用元件 `ProfileFields`（建立／編輯共用）；建立 modal 加 姓名（必填＋行內錯誤）／公司／部門／職位；編輯 modal 加同三欄＋`#eProfileHint`；清單新增公司篩選器；頁面層載入三份主檔 |
| `frontend/vite.config.ts` | modified | `server.proxy` 新增 `/companies`、`/job-titles`（見下「代理白名單」） |
| `frontend/nginx.conf` | modified | 新增 `/companies`、`/job-titles` 兩個 `location` 區塊（同上） |

## Architectural Decisions

1. **`buildOrgPath` 簽章刻意不變，複合鍵由呼叫端負責（AC-P17／AC-P23d）**：多公司後若把全部
   `ORG_UNIT` 餵進 `buildOrgPath`，會解析出**他公司**的部門名（`ORG_UNIT` 唯一鍵為
   `(companyCode, orgCode)`，不同公司可有相同 `orgCode`）。故呼叫端先 `unitsOf(units, companyCode)`
   收斂再傳入——與 prototype `:372-376` 逐字同一處置，全站仍只有一套組織路徑算法。

2. **建立與編輯共用單一 `ProfileFields` 元件**：prototype 兩處為逐字相同之 `fillCompanySelect`／
   `fillOrgSelect`／`fillJobSelect` 呼叫（`:551-552`／`:588-590`）。共用即**結構上不可能各自漂移**，
   比照 F041 `RoleWithSubtype` 之先例。

3. **職稱主檔按公司累積並去重**：`GET /job-titles?companyCode=` 每公司抓一次，以
   `(companyCode, code)` 複合鍵 `mergeJobTitles` 合併。**去重是必要的**——重複列會讓同一職稱在
   下拉出現兩次。跨公司同碼不同名（AE 之 `C01`＝高級協理 vs AS 之 `C01`＝協理）即 AC-P23e 之陷阱。

4. **三份主檔載入失敗一律降級為空集合**：公司／部門／職位三欄皆為選填，主檔不可用時仍應能建立
   帳號（只是無候選），不得使整頁壞掉。連帶處置：**編輯時若公司欄無值（主檔載入失敗），整組
   profile 欄位缺席不送**（AC-P9「欄位缺席＝不變更」），避免主檔失效時誤把帳號既有的部門／職位
   清成 `null`。⚠ 另因 `vi.mock` 之 automock 只涵蓋既有匯出、回傳 `undefined`，所有主檔呼叫一律
   以 `Promise.resolve(...)` 包裹後 `.then`，否則未 mock 該端點之既有測試會在 `useEffect` 內同步拋錯。

5. **React 天然免疫 prototype 的 disabled 殘留陷阱**：prototype `openEdit` 是 imperative 疊加
   `s.disabled=true`，故必須每次開啟重置（`fillCompanySelect` 內 `sel.disabled=false`）。React 版
   modal 為 `{editTarget && <EditModal/>}` 每次重新掛載、`disabled` 純由 props 推導，不存在該類 bug。

6. **⭐ 代理白名單（後端加端點 → 紅燈出現在前端，跨半邊的隱形耦合點）**：本專案前後端同源靠
   **兩份手動維護的白名單**——dev 用 `vite.config.ts` 的 `server.proxy`、容器用 `frontend/nginx.conf`
   的 `location`。`impl-backend` 新增 `/companies`／`/job-titles` 兩個 route prefix 後，既有的架構層
   gate `frontend/src/api/proxy-coverage.test.ts`（掃描全部 `@Controller` 前綴比對兩份白名單）**立刻
   多出 4 條紅燈**。<br>
   漏代理的後果是**靜默**的：fetch 收到 SPA 的 `index.html`（200 `text/html`），JSON 解析失敗後被
   呼叫端的 `.catch` 收斂成空陣列 → **建立/編輯帳號的公司下拉、職位下拉、清單公司篩選器三處
   永遠沒有選項，且零錯誤訊息**。<br>
   ⚠ **單元測試結構上抓不到**：`AccountManagementPage.test.tsx` 以 `vi.mock('../api/endpoints')`
   全數 mock，永遠不會碰到真實 HTTP。本專案已因同一原因踩過四次（`/public`、`/org-units`、
   `/persons`＋`/documents`，本次第四次）。**下次任一 agent 新增後端 controller 前綴時，兩份設定
   都要同步補**——這是 backend↔frontend 分工的隱形耦合點。

## 對測試提出之 dispute 與裁決

三件全部提交 `test-generator` 裁決、**全部成立**，皆由測試作者自行修正，我未改任何測試檔一字。

| # | 對象 | 內容 | 裁決 |
|---|---|---|---|
| 1 | `AccountManagementPage.test.tsx:62`（既有）vs `:601`（新增） | 兩條測試**操作序列相同**（皆只填帳號＋密碼、未填姓名），期望卻互斥：前者要 `createAccount` **被呼叫**、後者要**不被呼叫**且顯示行內錯誤。以窮舉證明無任何實作可同時滿足（submit 當下兩者輸入狀態等價） | **採納**：`:62` 補 `type(姓名,'陳美惠')`，待測命題不變 |
| 2 | `AccountManagementPage.test.tsx:565` | 「編輯 manual(AE) → 部門 `not.toBeDisabled()`」與 `AC-P26`（候選為空即停用）衝突；fixture 之 AE 刻意無 `ORG_UNIT`。prototype `:591` 註解明寫「upstream 只會**加上**停用，不會解除 AC-P26 造成的停用」＝權威依據。唯一能兩全的改法是讓建立/編輯兩 modal 規則不同，即破壞保真 | **採納**：改斷言為「停用原因是**資料現實**而非 `source` 唯讀」（查無上游提示＋顯示 `ORG_EMPTY_NOTICE`），**並新增第 39 條**（AS 樣本）防止實作無條件停用編輯 modal 之部門欄。`AC-P19`「四欄皆可編輯」應讀作「**不因 source 而唯讀**」，非「無條件 enabled」 |
| 3 | `AccountManagementPage.test.tsx:131` | 依 prototype 補上 `#eProfileHint`（`:215`）後，`getByText(/由上游系統維護/)` 會與 `#eNameHint`（`:205`）**多命中**而拋 "Found multiple elements"——兩句於 upstream 時同時可見。我未改文案亦未改測試，先暫不渲染該句並提報 | **採納**：改為**兩個逐字精確查詢**（比 `getAllByText` 更嚴格，鎖住兩句各自的文案）。我已補上 `#eProfileHint`，兩句依 prototype 逐字還原 |

## Blocking Issues

- **無阻擋，本 delta 之 frontend 半邊全部完成。**
- `frontend` typecheck 剩餘**唯一**錯誤，經 team-lead 覆核後**裁定不修、排除於本輪驗收**：
  ```
  src/pages/PublicDocumentDetailPage.uxAudit.test.tsx(76,16): error TS2353:
    'documentId' does not exist in type 'DocumentAppendixRecord'.
  ```
  證明為既有缺口：該測試檔 `git diff --quiet HEAD` ⇒ 未修改；`git show HEAD:frontend/src/api/types.ts`
  之 `DocumentAppendixRecord` 與現行工作區逐字相同（本 delta 對 `types.ts` 之 diff 為純新增）。
  ⚠ 追查發現該夾具用的 `documentId` **在後端契約裡並不存在**（`backend/src/appendices/appendices.store.ts`
  之 `AppendixRecord` 有 `blobPath` 但無 `documentId`），故補 `documentId?` 只是把虛構欄位寫進產品
  型別；真正的鏡射落差是**前端型別少了 `blobPath`**（前端目前無消費者）。屬 F039 附錄線之另案。
- 前端全量首次執行曾出現 30 個 worker timeout 錯誤，經查為**與 backend jest 並行之 CPU 競用假紅**
  （`--maxWorkers=2` 重跑即 60/60 全綠）。

---

# 追加：AC-P17 部門欄格式回歸（2026-08-14，Task #2）

## 症狀與根因

帳號管理清單 API 之 `department` 欄回 `ORG_UNIT.name` 原值（`營管部/審查室`），與同畫面
「部門下拉」所用之 `buildOrgPath` 輸出（`營運管理部 / 審查室`）**兩種格式並列於同一頁**。
真容器實測：清單第 1 頁 50 列，含 ` / ` 者 0 列 —— 系統性，非個案。

違反 `docs/specs/features/F003-account-role-management.md#manual-account-profile` **AC-P17**
「全站唯一之組織路徑算法，不得另建第二套」。

**屬既有落差**，非上一輪 delta 引入：delta 只把查找鍵改為複合鍵 `(companyCode, orgCode)`
（修掉跨公司誤解析他公司部門名之真 bug），未動輸出格式。

## Test Results Summary

| Scenario | 檔案 | 結果 |
|---|---|---|
| AC-P17 兩層（部→處室）須組成「部層全名 / 處室簡稱」 | `src/accounts/account-profile.spec.ts` | PASS（46/46） |
| AC-P17 真 SOP DB `JAC00` 之 HTTP 清單格式 | `test/int/account-profile.itest.ts` | PASS（41/41） |
| 既有全量迴歸 | backend jest 全量 | PASS（123 suites / 1631 tests） |

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/org-directory/org-path.ts` | new | 組織路徑算法之家：三個取值原語（自 F020 搬入）＋ `buildOrgPath`／`createOrgPathResolver` |
| `backend/src/public/watermark.ts` | modified | 三個取值原語搬出，改為 import + **re-export**（既有匯入端一行未改） |
| `backend/src/accounts/accounts.service.ts` | modified | `buildDepartmentIndex` 之值由 `u.name` 改為路徑；註解補 AC-P17／效能不變式／兩端 fallback 差異之理由 |

## Architectural Decisions

1. **不重寫取值原語（AC-P17 字面要求）**：後端**早已有**同一套演算法的 2/3 ——
   `src/public/watermark.ts`（F020 浮水印）之 `departmentCodeCandidates`、`deriveSectionName`、
   `resolveDepartmentFullName`。本次未重打任何一個，只新增最後的 ` / ` 合併與 fallback。
2. **放置位置（team-lead 2026-08-14 裁決）**：三個原語**搬至** `src/org-directory/org-path.ts`
   （`OrgUnitRecord` 之所在模組，已有 `filterSubtree`／`buildOrgTree` 等同性質純函式），
   `public/watermark.ts` 改為 import + **re-export**。
   理由：`org-directory` 是 accounts／org-sync／public 共同消費之地基模組，不可反向依賴其消費者；
   而 file-level 的 `no-circular` gate 對該反向依賴**抓不到**（`watermark.ts` 為零 import 之葉節點），
   等於沒有守門人。搬移後 `watermark.service.ts`／`watermark.spec.ts` 之 `from './watermark'`
   **一行未改**（`git diff --quiet` 實證），F020 之 9 suites／118 tests 全綠。
   已於檔頭註明與 `frontend/src/domain/org-path.ts` 為同一演算法之兩份實作、須同步維護。
3. **效能：DB 存取次數與改動前完全相同**。仍是「本頁出現過的每家公司各 `listByCompany` 一次」，
   路徑所需之父層（部層）一律自該次結果建成的記憶體索引取得，**不逐列回查 DB**。
   每家公司之 `byCode` 索引只建一次（`createOrgPathResolver` 回傳 closure），逐單位求值 O(1)
   → 整體 O(units + rows)，避免「每列各自 `new Map(units)`」的 O(units²)。
4. **保留「未命中 → `null`」守衛**：`buildOrgPath` 查無時之 fallback 是**回傳代碼原字串**，
   但清單契約要求未命中須為 `null`（`accounts.service.spec.ts:119-124` 之 `ZZZ99`、
   `account-profile.itest.ts:484` 之 AE／`JAC00` 跨公司防線；留空於畫面顯示「—」＝AC-P18）。
   故索引只為**確實存在於該公司**之單位建鍵，fallback 由查表 miss 表達，兩條既有測試不受影響。
   ⚠ 清單與下拉之最末層 fallback 不同**不算兩套演算法**（勿「順手統一」，統一會打破 AC-P18）：
   下拉候選一律來自 ORG_UNIT 主檔，故「查無」於下拉情境在 UI 上**不可達**、其 fallback 是死路；
   清單則可能遇到主檔已查無之**歷史** `orgCode`。兩者共用同一組取值規則，清單只多一道
   「須主檔命中」之前置條件。此理由已寫入 `org-path.ts` 與 `accounts.service.ts` 之註解。

## Blocking Issues

無。四道門檻全綠；未新增／修改／跳過任何測試檔（diff 僅 production 兩檔）。
