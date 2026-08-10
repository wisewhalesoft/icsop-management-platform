# F041 一般使用者子分類（業務／其他）— 測試設計（AC ↔ 可執行約束對照）

> **本輪為「簡易版 ring」**（使用者明確指示，2026-08-11）：**僅 backend jest／frontend vitest 單元與元件測試**；
> 不含 Playwright e2e fidelity、Stryker mutation、dependency-cruiser metric gate。
>
> 規格權威＝[F041](../../specs/features/F041-user-subtype-business-scope.md)（🟢 APPROVED，AC-01～AC-40，40 條）
> ＋ 5 個 feature 之 `AC-U#` delta（23 條：F019 ×7／F020 ×5／F025 ×3／F026 ×3／F003 ×5）
> ＋ [architecture-spec.md §3.7／§4.10／§5.11](../../specs/architecture-spec.md)（🟢 APPROVED，`ViewerScope`／`rbac/viewer-scope.ts` 三純函式落點、四接縫精確位置）
> ＋ [data-model.md#account-user-subtype](../../specs/data-model.md#account-user-subtype)、[error-handling.md#dept-restriction](../../specs/error-handling.md#dept-restriction)
> ＋ `prototypes/03-public-list.html`（`#scopeNotice`、`SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS` 逐字定稿）、`prototypes/08-account-management.html`（`#subtypeWrap`／`#subtypeRadios`）
> ＋ [public-seams-test-design.md §1.2](../test-design/public-seams-test-design.md)（`TS-PS-ORG-001`～`007`，AC-10 之等價驗證輸入）
>
> 本文件由 test-generator 於**未讀取任何 F041 相關實作原始碼**之前提下撰寫（blind-to-implementation）。
> 讀過之非測試檔僅限：prototype HTML、`docs/**`、既有 `*.spec.ts`／`*.test.ts`／`*.test.tsx` 測試檔（供對齊 DI／fixture／accessible-name 慣例，見下「blind 聲明」）。

## blind 聲明（供覆核）

**讀過之測試/設計檔**（僅為對齊既有慣例，未用於決定任何業務斷言）：
`org-hierarchy.spec.ts`、`public-list.spec.ts`、`public-documents.service.spec.ts`、`public-documents.controller.spec.ts`、
`public-document-detail.service.spec.ts`、`watermark.service.spec.ts`、`watermark.controller.spec.ts`、
`typeorm-org-sync.store.spec.ts`、`accounts.service.spec.ts`、`function-matrix.spec.ts`／`.test.ts`、`field-matrix.spec.ts`／`.test.ts`、
`PublicListPage.test.tsx`、`PublicListPage.subcategory.test.tsx`（F040 先例）、`AccountManagementPage.test.tsx`、
`frontend/src/domain/roles.ts`、`org-scope.ts`、`lifecycle-subcategory.ts`（三者為production/domain檔而非測試檔——僅為核對命名/檔案組織慣例，
內容與 F041 業務判定無關，未影響任何斷言；`org-scope.ts`／`roles.ts` 之函式本輪未被 F041 引用）。
**未讀取**：`backend/src/rbac/viewer-scope.ts`（不存在）、`backend/src/public/*.ts`（生產碼）、`backend/src/accounts/accounts.service.ts`、
`backend/src/org-sync/typeorm-org-sync.store.ts`、`frontend/src/pages/PublicListPage.tsx`、`frontend/src/pages/AccountManagementPage.tsx`、
`frontend/src/domain/function-matrix.ts`／`field-matrix.ts`（僅讀其 `.spec.ts`/`.test.ts`）。

## test-generator 之兩項對映裁決（非猜測實作，供 tdd-implementation 依循；如認為不適用請溝通，勿自行改測試）

1. **`SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS` 之匯出檔**：假定為 `frontend/src/domain/user-subtype.ts`（與同規格命名鎖定表同列之
   `userSubtypeLabel`／`isSubtypeApplicable`／`normalizeUserSubtype` 同檔具名匯出）。理由：規格要求「前端須以常數持有、供 vitest 直接
   import 斷言」，`domain/` 是本專案既有「純函式無 IO」之慣例落點（比照 F040 `lifecycle-subcategory.ts`）。
2. **prototype `#scopeNotice` → `data-testid`**：依本專案既有換算慣例（`hiddenNote`→`hidden-note`、`countText`→`count-text`、
   `pinnedList`→`pinned-list`，見 `PublicListPage.test.tsx`），換算為 `data-testid="scope-notice"`。

## 約束檔清單

| 代號 | 檔案 | 層級 | 標的 |
|---|---|---|---|
| **BE-1** | `backend/src/rbac/viewer-scope.spec.ts`（新增） | 純函式 | `normalizeUserSubtype`／`isDeptScopedViewer`／`isUsingDeptMatched`／`isDocVisibleToViewer`（AC-01～AC-13）＋ AC-10 與既有 `isPinned` 逐案相等 |
| **BE-2** | `backend/src/public/public-list.spec.ts`（既有，遷移＋擴充） | 純函式 | `buildPublicList` 業務子分類可見性過濾（AC-14～AC-19／F019 AC-U1～U5） |
| **BE-3** | `backend/src/public/public-documents.service.spec.ts`（既有，遷移＋擴充） | 服務層 | `list()` viewer pass-through |
| **BE-4** | `backend/src/public/public-documents.controller.spec.ts`（既有，遷移＋擴充） | Controller | `list()`/`detail()` 之 viewer 組出與委派（含新增 `@Req()`） |
| **BE-5** | `backend/src/public/public-document-detail.service.spec.ts`（既有，遷移＋擴充） | 服務層 | `detail()` 之拒絕/放行（AC-20～AC-24／F019 AC-U6） |
| **BE-6** | `backend/src/public/watermark.service.spec.ts`（既有，擴充） | 服務層 | `view`／`getOriginalPdf`／`download`／`print` 之拒絕（AC-25～AC-30／F020 AC-U1～U5）＋架構風險#19（`docMeta` 缺省） |
| **BE-7** | `backend/src/org-sync/typeorm-org-sync.store.spec.ts`（既有，擴充） | Store | F004 upsert payload 不含 `userSubtype`（AC-34／F003 AC-U4，green guard） |
| **BE-8** | `backend/src/accounts/accounts.service.spec.ts`（既有，擴充） | 服務層 | `assignRole()` 第四參數之持久化/正規化/非 User 不寫入（AC-36／F003 AC-U2／AC-U5） |
| **BE-9** | `backend/src/rbac/function-matrix.spec.ts`（既有，擴充） | 純函式 | AC-37／F025 AC-U2（arity）／AC-U3（業務子分類後台 API 皆 403 等價） |
| **BE-10** | `backend/src/rbac/field-matrix.spec.ts`（既有，擴充） | 純函式 | AC-38／F026 AC-U2（arity）／AC-U3（交叉引用 BE-1／org-hierarchy.spec.ts） |
| **FE-1** | `frontend/src/domain/user-subtype.test.ts`（新增） | 純函式 | `normalizeUserSubtype`／`userSubtypeLabel`／`isSubtypeApplicable`（AC-01/02/31/32） |
| **FE-2** | `frontend/src/pages/PublicListPage.userSubtype.test.tsx`（新增） | 元件 | `#scopeNotice` 依 viewer 分支（AC-40／F019 AC-U7）＋ 空狀態不分支（AC-33） |
| **FE-3** | `frontend/src/pages/AccountManagementPage.test.tsx`（既有，遷移＋擴充） | 元件 | 指派角色 modal 子分類選擇器（AC-32／F003 AC-U1／U2）＋既有 `assignAccountRole` 呼叫之簽章 shim |
| **FE-4** | `frontend/src/domain/function-matrix.test.ts`（既有，擴充） | 純函式 | 前端鏡射 arity 鎖定（F025 AC-U2） |
| **FE-5** | `frontend/src/domain/field-matrix.test.ts`（既有，擴充） | 純函式 | 前端鏡射 arity 鎖定（F026 AC-U2） |

## F041 40 條 AC ↔ 約束對照

| AC | 內容摘要 | 約束檔 | 狀態 |
|---|---|---|---|
| AC-01 | `normalizeUserSubtype` 合法值原值回傳 | BE-1、FE-1 | ✅ |
| AC-02 | 9 種未知值 → 收斂 `'other'`（fail-open） | BE-1、FE-1 | ✅ |
| AC-03 | 非 User 角色（4 種）→ `isDeptScopedViewer` 恆 false | BE-1 | ✅ |
| AC-04 | User+business→true；User+other→false | BE-1 | ✅ |
| AC-05 | 文件掛部層、使用者掛處室 → 相符 | BE-1 | ✅ |
| AC-06 | 反向不成立 | BE-1 | ✅ |
| AC-07 | 同部另一處室 → 不相符 | BE-1 | ✅ |
| AC-08 | Root 全公司 → 對任何業務使用者皆相符 | BE-1 | ✅ |
| AC-09 | 同處室另一課 → 不相符 | BE-1 | ✅ |
| AC-10 | `isUsingDeptMatched` 與既有 `isPinned` 逐案相等（INV-4） | BE-1 | ✅ |
| AC-11 | 多使用部門 OR 語意 | BE-1 | ✅ |
| AC-12 | orgCode 缺值（孤兒帳號）→ 恆不相符 | BE-1 | ✅ |
| AC-13 | 非受限 viewer 恆可見（含 orgCode=null） | BE-1 | ✅ |
| AC-14 | `buildPublicList` 業務過濾：不相符不進 items/total | BE-2 | ✅ |
| AC-15 | 業務結果全部 pinned=true | BE-2 | ✅ |
| AC-16 | 部門篩選選到範圍外 → 空結果不拋錯 | BE-2 | ✅ |
| AC-17 | 業務限制與其餘篩選 AND，任何組合皆不洩漏 | BE-2 | ✅ |
| AC-18 | hiddenCount 僅計基底條件隱藏者 | BE-2 | ✅ |
| AC-19 | 「其他」子分類回歸鎖定 | BE-2 | ✅ |
| AC-20 | 詳情不相符 → 拒絕、未呼叫名稱解析 | BE-5 | ✅ |
| AC-21 | 404 DOCUMENT_NOT_FOUND，訊息與「不存在」逐字相同 | BE-5 | ✅ |
| AC-22 | 相符 → 完整 DTO，與其他子分類逐欄相同 | BE-5 | ✅ |
| AC-23 | 回歸對照組（other／非 User 角色） | BE-5 | ✅ |
| AC-24 | INV-5 AND：相符但非已公告仍 404 | BE-5 | ✅ |
| AC-25 | view／getOriginalPdf 不相符 → 拒絕、org 查找 0 次 | BE-6 | ✅ |
| AC-26 | download／print 不相符 → burnPdf／getOriginalPdf 0 次 | BE-6 | ✅ |
| AC-27 | 拒絕路徑無 VIEW/DOWNLOAD/PRINT 成功事件 | BE-6 | ✅ |
| AC-28 | AuditWriter 完全未被呼叫 | BE-6 | ✅ |
| AC-29 | 回歸對照組（相符／other／非 User） | BE-6 | ✅ |
| AC-30 | 直接呼叫服務層仍被拒（後端權威） | BE-6 | ✅ |
| AC-31 | `userSubtypeLabel` 5 案例顯示標籤 | FE-1 | ✅ |
| AC-32 | `isSubtypeApplicable` 僅 User 為 true | FE-1、FE-3 | ✅ |
| AC-33 | 空狀態「查無符合結果」不因子分類分支 | FE-2 | ✅ |
| AC-34 | F004 upsert 不含 `userSubtype` 鍵 | BE-7 | ✅（green guard，見下） |
| AC-35 | 新帳號未指定子分類 → DB 預設 `'other'` | — | ✅（migration 實跑覆核，非 jest/vitest，見下） |
| AC-36 | 角色降級保留 `userSubtype` 不清空 | BE-8 | ✅ |
| AC-37 | `FUNCTION_MATRIX` 逐格不變＋簽章不含 userSubtype | BE-9、FE-4 | ✅ |
| AC-38 | `FIELD_MATRIX` 逐格不變＋簽章不含 userSubtype | BE-10、FE-5 | ✅ |
| AC-39 | RAG 過濾下限保證（Phase 3，本輪不驗收） | — | ⬜（規格明文本輪不驗收） |
| AC-40 | `#scopeNotice` 依 viewer 分支（含孤兒帳號沿用業務句） | FE-2 | ✅ |

**合計：39 條 ✅ 完整覆蓋（38 條 jest/vitest ＋ 1 條 migration 實跑覆核）、0 條 🟡 部分覆蓋、1 條 ⬜ 本輪無法驗證（AC-39，理由見下）。**

### AC-35 之覆蓋方式更新（2026-08-11，tdd-implementation 回報）

原標 ⬜——`userSubtype` 預設值由 **DB 層 `NOT NULL DEFAULT 'other'`** 保證（architecture §4.10），非應用層邏輯，in-memory `FakeStore`
不模擬 DB 欄位預設值，jest 層無可斷言標的（寧可少測不可測錯）。**tdd-implementation 已對真實 SOP DB 實跑 migration 並以探針驗證**：
不帶 `userSubtype` 之 `INSERT` 落地為 `'other'`；`UPDATE ... SET userSubtype='Business'`（非法值）確實被 `CHECK` 約束拒絕（＝AC-02
fail-open 之安全前提成立）；既有 1119 列全數 backfill 為 `'other'`；探針列已清除。**本項證據為 tdd-implementation 提供，test-generator
未親自重跑 migration**（DB 存取超出本輪 jest/vitest ring 之驗證範圍），但已核對其描述之驗證方法與 architecture §4.10 之要求一致，予以採信。
F003 AC-U3（同一根因）比照更新。

### ⬜ 未覆蓋之 1 條理由

- **AC-39**：F033（RAG 問答）Phase 3 尚未實作，規格本文明載「本輪不驗收」，無可執行之標的。

### AC-34 為 green guard（規格如此，非缺陷）

BE-7 之斷言在**現行（F041 尚未實作）程式碼下即為綠燈**——現行 `applySync()` 根本不認識 `userSubtype` 這個欄位，天然不會複製它。
其綠燈本身即驗證「不主動新增此鍵」之現況是安全的，供未來任何人「順手」在 insert/update 物件字面量新增 `userSubtype` 一行時之回歸防線。
（比照 [F040 FE-2 之 `cycle-codes.test.ts`](F040-test.md) 同一模式：「不受影響」型 AC 天生即綠。）

## 23 條 `AC-U#` delta ↔ 約束對照

| Feature | AC-U | 內容摘要 | 約束檔 | 狀態 |
|---|---|---|---|---|
| F019 | U1 | 已公告基底之後追加業務過濾（AND） | BE-2（AC-14） | ✅ |
| F019 | U2 | 業務結果全部 pinned=true | BE-2（AC-15） | ✅ |
| F019 | U3 | 業務限制與篩選 AND；空結果非錯誤 | BE-2（AC-16/17） | ✅ |
| F019 | U4 | hiddenCount 僅計基底條件隱藏者 | BE-2（AC-18） | ✅ |
| F019 | U5 | 「其他」子分類回歸鎖定 | BE-2（AC-19） | ✅ |
| F019 | U6 | 詳情/直連 URL 404，不洩漏中繼資料 | BE-5（AC-20/21） | ✅ |
| F019 | U7 | 頂部說明句依 viewer 分支 | FE-2（AC-40） | ✅ |
| F020 | U1 | view/getOriginalPdf 拒絕、不組裝快照 | BE-6（AC-25） | ✅ |
| F020 | U2 | download/print 拒絕、不燒錄不讀原始位元組 | BE-6（AC-26） | ✅ |
| F020 | U3 | 不寫入稽核（AuditWriter 完全未呼叫） | BE-6（AC-27/28） | ✅ |
| F020 | U4 | 回歸對照組：行為與遷移前完全一致 | BE-6（AC-29） | ✅ |
| F020 | U5 | 後端權威：直接呼叫服務層仍拒絕 | BE-6（AC-30） | ✅ |
| F025 | U1 | 矩陣不新增列、逐格不變 | BE-9（既有 13 列測試，未新增列） | ✅ |
| F025 | U2 | 權限解析函式簽章不含 userSubtype | BE-9、FE-4（arity） | ✅ |
| F025 | U3 | 業務子分類呼叫後台 API 皆 403，與其他子分類一致 | BE-9（新增顯式測試） | ✅ |
| F026 | U1 | 矩陣不新增欄位列、逐格不變 | BE-10（既有 20 欄測試，未新增列） | ✅ |
| F026 | U2 | 欄位權限解析函式簽章不含 userSubtype | BE-10、FE-5（arity） | ✅ |
| F026 | U3 | `isWithinSubtree`／`isUsingDeptMatched` 重用鎖定 | BE-1（AC-10）＋既有 `org-hierarchy.spec.ts`（未修改） | ✅ |
| F003 | U1 | 指派角色 modal 子分類選擇器顯示條件 | FE-3 | ✅ |
| F003 | U2 | 選定子分類儲存 → 持久化 | BE-8、FE-3 | ✅ |
| F003 | U3 | 未指定子分類 → 預設 `'other'` | — | ✅（同 AC-35，migration 實跑覆核，見上） |
| F003 | U4 | F004 upsert 不覆寫 `userSubtype` | BE-7 | ✅ |
| F003 | U5 | 非 User 角色不清空既有值 | BE-8 | ✅ |

**合計：23 條 ✅、0 條 ⬜。**

## 給 tdd-implementation 之注意事項（重述自 team-lead 交辦，供本檔自足）

1. **AC-33 與 AC-40 為不同字串、不同 DOM 位置**——FE-2 已分開兩個 `describe` 區塊斷言，且有一條測試明確驗證業務子分類查無結果時
   兩者同時出現（見 `PublicListPage.userSubtype.test.tsx` 最後一條）。
2. **AC-10 之等價驗證**（BE-1）以 10 組輸入（`TS-PS-ORG-001~006` 之單筆案例 ＋ AC-11 之多筆 OR ＋ AC-12 之孤兒帳號）同時呼叫
   `isUsingDeptMatched` 與既有 `isPinned`，斷言逐案相等——任一邊被獨立修改即會變紅。
3. **`WatermarkService` 之 `docMeta` 未提供＋業務子分類 viewer → 拒絕**已鎖（BE-6「架構風險#19」兩條，含對照組）。
4. **拒絕路徑之精確計數**：`PdfBurner.burnPdf`／`WatermarkPdfSource.getOriginalPdf` 之呼叫次數以獨立 spy 計數器斷言為 0
   （非僅檢查回傳值），`AuditWriter.recordAccess` 以 `FakeAudit.events.length===0` 斷言完全未呼叫。
5. **既有測試之機械式遷移**（非放寬，見架構 §3.7 決策一「刻意的破壞性變更」）：
   - `public-list.spec.ts`／`public-documents.service.spec.ts`：`buildPublicList`/`list()` 第二／第一參數由 `userOrgCode` 字串
     改為 `viewer: ViewerScope`，既有案例以 `viewerOf(orgCode)`（其他子分類、不受限）包裝，期望值**一律未改**。
   - `public-document-detail.service.spec.ts`：`detail()` 新增必要參數 `viewer`，既有案例以 `UNRESTRICTED_VIEWER` 包裝。
   - `public-documents.controller.spec.ts`：`detail()` 新增 `@Req()`（現況完全未接收），既有呼叫改為 `detail(id, req)`；
     `list`/`detail` 對服務層之期望值由裸字串改為 `expect.objectContaining({...})`（不過度鎖定 `toViewerScope()` 未公開之邊界行為，如
     `userSubtype` 的 null-coalescing 細節）。
   - `AccountManagementPage.test.tsx`：既有「指派角色」測試因 `assignAccountRole` 新增第三參數，期望值改為
     `('a2', 'Supervisor', undefined)`（依架構 §3.7 決策四之呼叫慣例：`isSubtypeApplicable(selected) ? subtype : undefined`）。
6. **F003 AC-U5 之精確條件**：`assignRole()` 之 patch 是否含 `userSubtype` 鍵，取決於**newRole 本身**（`newRole==='User'`），
   與「呼叫端是否傳入第四參數」無關——BE-8 之測試刻意在 `newRole!=='User'` 時仍傳入第四參數，驗證該值仍不被寫入。

## RED gate 實跑結果

見本次 SendMessage 回報（team-lead 要求以訊息回報，避免報告檔案不同步）；本文件僅記錄設計面之對照與理由。
