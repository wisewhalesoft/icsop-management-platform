---
type: implementation-log
feature_id: F001
feature_name: 同一 email 命中多帳號 → 帳號選擇（AC-M1～AC-M29）
status: complete
last_updated: 2026-08-24
---

# F001: 同一 email 命中多帳號 → 帳號選擇 — Implementation Log

> Uncle-Bob 約束環模式。環由 `ringgen-f001`／`ringgen-f001-s` 於實作前 blind-to-implementation
> 撰寫（6 檔／96 案，含 1 檔既有回歸鎖）。本輪**未修改任何測試檔**，僅寫 production code。
> 權威來源：`docs/specs/features/F001-auth-login-session.md#multi-account-picker` `AC-M1`〜`AC-M29`
> ＋ `docs/specs/upstream-hr-source-contract.md` §12.2 ＋ `docs/specs/error-handling.md`
> （`AUTH_SELECTION_TICKET_INVALID`，已登錄）。

## 修法概要

三個新純函式模組 + 既有 `AuthController`／`AccountRepository`／`AuthModule` 之擴充：

1. **`multi-account-picker.ts`**（純邏輯、零 IO）：`decideMultiAccountLogin()` 沿用既有
   `classifyAccountByEmail` 之 email 比對規則（`AC-M1`／`AC-M28`），額外判定姓名一致性
   （`AC-M7`，僅 trim＋大小寫正規化）決定 `RequiresSelection`（進選單）或 `AmbiguousIdentity`
   （退回既有拒登＋告警，`AC-M8`／`AC-M9`）。`sortCandidates()` 提供決定性排序（`AC-M4`）。
   `planCallbackResponse()` 把決策映射為 `/auth/callback` 應執行之動作（`issueSession`／
   `reject`／`requireSelection`），與實際 Express 接線分離（MSAL 完整交換無法在既有測試基建下
   驅動成功路徑，故此層改測「規劃正確性」）。
2. **`selection-ticket.ts`**：`SelectionTicketService` 簽章機制比照 `session-token.service.ts`；
   時效判斷**不依賴** `jsonwebtoken` 內建 `exp`（改注入 `now()`＋自帶 `issuedAt`，`verify()` 以
   `{ignoreExpiration:true}` 略過內建檢查），達成 `AC-M19`「非 sliding」之可測性。一次性消耗
   （`AC-M23`）比照 `login-throttle.ts` 之單機 process 記憶體（`Set<jti>`），零 schema（`AC-M29`）。
3. **`candidate-payload.ts`**：`buildCandidatePayload()` 依 `AC-M14` 逐欄缺值規則（空/缺漏→
   em dash；有值無對照→顯示原值；有對照→顯示解析結果）投影出畫面用之 8 欄封閉集（`AC-M12`）。
4. **`AccountRepository` 擴充**：新增**選填**方法 `findCandidatesByEmail?(email)`（比照既有
   `findByLoginIdAnyCompany?` 型樣）。`TypeOrmAccountRepository` 實作之；既有測試替身未實作 →
   `AuthController.callback()` 於缺此方法時**逐字沿用**既有 `findByEmail`／`classifyAccountByEmail`
   ／`decideAuthOutcome` 流程（`AC-M27` 零漣漪），僅在有此方法時才走新的 `decideMultiAccountLogin`
   ／`planCallbackResponse` 分支。此設計使 `typeorm-account.repository.spec.ts` 對 `findByEmail`
   之既有 5 欄 `toEqual` 精確比對**完全不受影響**。
5. **`AuthController` 擴充**：建構子新增第 4 參數 `SelectionTicketService`（**帶預設值**，使
   既有直接 `new AuthController(a,b,c)` 之測試檔——如 `aad-failure-disclosure.spec.ts`——不受
   影響；正式路徑由 `AuthModule` 之 `useFactory` DI 提供）。新增 `getSelectAccount()`／
   `postSelectAccount()` 兩端點；`postSelectAccount()` 驗證順序＝票證有效性 →
   `accountId` 屬於票證綁定集合（`AC-M21`／`AC-M22`）→ 現行狀態仍 active（`AC-M24`）→ 原子性
   消耗票證（`AC-M23`），任一步失敗皆不核發 session、不回退重查候選（`AC-M20`）。

前端新增 `SelectAccountPage.tsx`（無對應 prototype，`[OPEN-M5]`；版面依丙節 AC 自訂合理預設）、
`endpoints.ts` 之 `getSelectAccountCandidates()`／`selectAccount()`、`types.ts` 之
`SelectAccountResponse`／`SelectAccountCandidate`，並於 `App.tsx` 之 `AppRoutes()` 未登入分支
新增路由 `/login/select-account`。

## Test Results Summary

| 檔 | 承接 AC | 條數 | 結果 |
|---|---|---|---|
| `backend/src/auth/multi-account-picker.spec.ts` | AC-M1/M2/M4/M5/M6/M7/M8/M9/M16/M28 | 26 | PASS |
| `backend/src/auth/multi-account-callback-plan.spec.ts` | AC-M2/M3/M8/M26 | 8 | PASS |
| `backend/src/auth/selection-ticket.spec.ts` | AC-M10/M19/M20/M22/M23/M29 | 16 | PASS |
| `backend/src/auth/candidate-payload.spec.ts` | AC-M12/M14/M15 | 11 | PASS |
| `backend/src/auth/auth.controller.select-account.spec.ts` | AC-M11/M17/M18/M19/M20/M21/M22/M23/M24/M26/M27 | 16 | PASS |
| `backend/src/auth/multi-account-regression.spec.ts`（既有回歸鎖） | AC-M27/M28/M29 | 8 | PASS |
| `frontend/src/pages/SelectAccountPage.test.tsx` | AC-M12/M13/M14/M15/M16/M17/M26 | 7 | PASS |
| `frontend/src/api/endpoints.select-account.test.ts` | `[ASSUMPTION]`／AC-M12／AC-M18 | 2 | PASS |
| `frontend/src/app-routes.select-account.test.tsx` | `[ASSUMPTION]` 路由 | 2 | PASS |
| **合計** | | **96** | **9 suites／96 tests 全綠** |

全套回歸：backend **166 suites／2455 tests 全綠**（零回歸基線 160/2370 ＋ 本環 6/85 新 suites／
tests，逐數相符）；frontend **99 files／1416 tests 全綠**。`npx tsc --noEmit`（前後端）零錯誤。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `backend/src/auth/multi-account-picker.ts` | new | 候選判定＋callback 規劃（純函式） |
| `backend/src/auth/selection-ticket.ts` | new | 選擇票證簽發／驗證／一次性消耗 |
| `backend/src/auth/candidate-payload.ts` | new | 候選查詢端點 payload 投影 |
| `backend/src/auth/account-repository.ts` | modified | 新增選填 `findCandidatesByEmail?` |
| `backend/src/auth/typeorm-account.repository.ts` | modified | 實作 `findCandidatesByEmail` |
| `backend/src/auth/auth.controller.ts` | modified | 建構子擴充；`callback()` 分流；新增 `getSelectAccount`／`postSelectAccount`／`applyCallbackPlan`／`selectAccountRedirect` |
| `backend/src/auth/auth.module.ts` | modified | 註冊 `SelectionTicketService` provider |
| `frontend/src/pages/SelectAccountPage.tsx` | new | 帳號選擇畫面 |
| `frontend/src/api/endpoints.ts` | modified | 新增 `getSelectAccountCandidates`／`selectAccount` |
| `frontend/src/api/types.ts` | modified | 新增 `SelectAccountResponse`／`SelectAccountCandidate` |
| `frontend/src/App.tsx` | modified | 未登入分支新增 `/login/select-account` 路由 |

## Architectural Decisions

- **零漣漪整合**：`AccountRepository.findCandidatesByEmail` 選填＋`callback()` 雙軌（有則走新
  流程、無則逐字沿用舊流程），使既有 `typeorm-account.repository.spec.ts` 之 `findByEmail` 精確
  形狀斷言、及 6+ 個既有 Fake repo 測試替身完全不受影響。
- **選擇票證非 sliding 之可測性**：不依賴 `jsonwebtoken` 內建 `exp`（真實時鐘於單元測試中幾乎
  不流逝），改以注入 `now()`＋自帶 `issuedAt` 欄位＋`{ignoreExpiration:true}` 完全掌控時效判斷。
- **org 名稱解析不掛 `OrgDirectoryModule`**：該模組已 `imports:[AuthModule]`，若 `AuthModule`
  反向 import 會形成循環模組依賴；`getSelectAccount()` 之顯示名稱富化未被約束環測試覆蓋，故
  直接以既有 `AppDataSource.getRepository(OrgUnit).findOne(...)` 查詢，不建立模組間循環引用。
- **`AuthController` 第 4 建構子參數帶預設值**：相容既有測試檔繞過 Nest DI、直接
  `new AuthController(a,b,c)` 之呼叫方式；正式路徑仍由 `AuthModule` 之 `useFactory` 明確注入。

## Blocking Issues

無。實作過程未向 `ringgen-f001-s`（test-generator）發送任何修改請求——96 案之斷言與 AC 文字
逐項一致，未發現落差。
