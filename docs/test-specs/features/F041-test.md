# F041 一般使用者子分類（業務／其他）— 測試設計（AC ↔ 可執行約束對照）

> **本輪為「簡易版 ring」**（使用者明確指示，2026-08-11）：**僅 backend jest／frontend vitest 單元與元件測試**；
> 不含 Playwright e2e fidelity、Stryker mutation、dependency-cruiser metric gate。
>
> 規格權威＝[F041](../../specs/features/F041-user-subtype-business-scope.md)（🟢 APPROVED，AC-01～AC-40 ＋ §F2 缺口修補 AC-41～AC-46，共 46 條；後者為 2026-08-11 出貨後補訂）
> ＋ 5 個 feature 之 `AC-U#` delta（23 條 AC-U1～U5 系 ＋ 6 條 §F2 對應 delta：F019 AC-U8、F025 AC-U4、F003 AC-U6～U9，共 29 條）
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

### 2026-08-11 續篇（AC-41～AC-46 缺口修補）之 blind 聲明

**讀過之非測試檔**：`docs/specs/features/F041-user-subtype-business-scope.md`（§F2）、
`docs/specs/features/F003-account-role-management.md`（AC-U6～U9）、`docs/specs/features/F019-public-list-browsing.md`（AC-U8）、
`docs/specs/features/F025-role-function-matrix.md`（AC-U4）、`prototypes/08-account-management.html`（全檔，含 JS 純函式區塊
`normalizeUserSubtype`／`userSubtypeLabel`／`isSubtypeApplicable`／`SUBTYPE_DESC`／`subtypeBadge`／accounts 假資料／`roleRadios`／
`subtypeWrap`／`subtypeRadios` 之 markup 與繫結邏輯——此為 prototype 本身，非生產碼，依規格為版面文案之權威來源）、
`prototypes/04-public-document-detail.html`（`#rejectOverlay` 全段）、`prototypes/18-permission-matrix.html`（banner 段落）。
**讀過之既有測試檔**（僅供對齊 DI／accessible-name／`data-testid` 慣例，未用於決定任何業務斷言）：
`AccountManagementPage.test.tsx`、`PermissionMatrixPage.test.tsx`、`user-subtype.test.ts`、`PublicDocumentDetailPage.test.tsx`、
`PublicDocumentDetailPage.subcategory.test.tsx`。
**未讀取任何生產碼**：`frontend/src/domain/user-subtype.ts`、`frontend/src/pages/AccountManagementPage.tsx`、
`frontend/src/pages/PermissionMatrixPage.tsx`、`frontend/src/pages/PublicDocumentDetailPage.tsx`、`frontend/src/api/types.ts` 均**未開啟**。

**欄位名／匯出路徑之對映裁決（非猜測實作，供 tdd-implementation 依循；如認為不適用請溝通，勿自行改測試）**，
以「verify-by-running」而非讀源碼之方式核對（`vitest run` ＋ `tsc --noEmit` 對現行已部署之生產碼實跑，僅觀察編譯器／測試框架
之錯誤訊息以確認命名，未開啟任何 `.tsx`/`.ts` 生產檔）：
1. `AccountView`（`frontend/src/api/types.ts`）具 `userSubtype?: string | null` 欄位——`tsc --noEmit` 實跑**未報型別錯誤**，
   確認此欄位名稱假設正確（比照既有 `roleCode`／`orgCode` 之逐字沿用慣例）。
2. `SUBTYPE_DESC` 假定與 `normalizeUserSubtype`／`userSubtypeLabel`／`isSubtypeApplicable` 同檔（`frontend/src/domain/user-subtype.ts`）
   具名匯出——`tsc --noEmit` 實跑報 `TS2305: Module "./user-subtype" has no exported member 'SUBTYPE_DESC'`，證實**此常數現行未以此名稱/路徑匯出**（AC-44 因此為 RED，非測試接縫猜錯——匯出路徑之假設本身無法進一步以盲測方式核實是否為「根本不存在」或「存在於他處」，此點回報 team-lead 覆核）。

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
| **FE-6** | `frontend/src/pages/PermissionMatrixPage.test.tsx`（既有，擴充） | 元件 | F041 定案橫幅逐字＋既有兩橫幅存廢與 DOM 順序（AC-45／F025 AC-U4） |
| **FE-7** | `frontend/src/pages/PublicDocumentDetailPage.f041.test.tsx`（新增） | 元件 | 404 拒絕畫面逐字文案／圖示／錯誤碼列／不殘留文件欄位／殘留內容回歸鎖（AC-46／F019 AC-U8） |

### §F2 缺口修補（2026-08-11，AC-41～AC-46）約束檔擴充

> FE-3（`AccountManagementPage.test.tsx`）新增兩個 `describe` 區塊覆蓋 AC-41／AC-42（清單列與編輯 modal 之子分類徽章）
> 與 AC-43（指派角色 modal 之預選值）；FE-1（`user-subtype.test.ts`）新增 `describe('SUBTYPE_DESC...')` 覆蓋 AC-44。
> 新增 **FE-6**（`PermissionMatrixPage.test.tsx` 擴充）覆蓋 AC-45、**FE-7**（`PublicDocumentDetailPage.f041.test.tsx` 新檔）覆蓋 AC-46。
> 本組全部條文權威＝prototype 原始碼逐行位置（見 F041 spec §F2 每條 AC 之引註），全部為 vitest 元件測試，無 Playwright。

| AC | 內容摘要 | 約束檔 | RED 實跑結果（2026-08-11） |
|---|---|---|---|
| AC-41 | 帳號清單「角色」欄之子分類徽章（含 fail-open 未知值仍呈現、INV-2 反向排除） | FE-3 | 🔴 RED（2/3 案例；INV-2 反向案例綠，見下方說明） |
| AC-42 | 編輯帳號 modal「目前角色」同組合，與 AC-41 共用元件 | FE-3 | 🔴 RED（1/2 案例；INV-2 反向案例綠） |
| AC-43 | 指派角色 modal 子分類選擇器之預選值（含非 User 改選 User 之保留值復活） | FE-3 | 🟢 GREEN（4/4，已實作，回歸鎖） |
| AC-44 | 子分類選項之說明文字，具名常數 `SUBTYPE_DESC` | FE-1 | 🔴 RED（2/2；**與 team-lead 原預期不符，見下方「與預期不符」說明**） |
| AC-45 | 權限矩陣頁之 F041 定案橫幅（既有兩橫幅之下、分頁列之上） | FE-6 | 🔴 RED（1/1） |
| AC-46 | 前台文件詳情 404 畫面之逐字文案／圖示／錯誤碼列 | FE-7 | 🔴 RED（1/4；其餘 3 案例綠，見下方說明） |

**RED-for-right-reason 逐一核對**（實跑，非僅推理，見 SendMessage 回報之完整輸出）：
- AC-41／AC-42：`TestingLibraryElementError: Unable to find an element with the text: 業務` — 角色徽章（`一般使用者`）確實渲染，子分類徽章完全缺席，非查詢寫錯。
- AC-45：`expected undefined to be truthy` — 逐字比對的橫幅元素查無，既有兩橫幅（`共 20 欄`／`分析師草案`）仍在，非查詢寫錯。
- AC-46：`Unable to find an element with the text: 查無此文件，或該文件尚未公告。` — 現行畫面之標題「查無此文件」已存在（綠），但說明句、`file-x` 圖示、錯誤碼列三者皆缺（現行為 `文件可能尚未公告或已下架。` ＋ `inbox` 圖示 ＋ 無錯誤碼列，與 spec 備註完全吻合）。
- AC-44：`TypeError: Cannot read properties of undefined (reading 'business')` — `SUBTYPE_DESC` 未從 `frontend/src/domain/user-subtype.ts` 匯出（`tsc --noEmit` 亦報 `TS2305: has no exported member 'SUBTYPE_DESC'`）。

**與 team-lead 原預期不符之處（AC-44）**：team-lead 交辦訊息預期 AC-43／AC-44 皆「已實作、測試應一寫即綠」。實跑結果 AC-43 確為綠，但 **AC-44 為紅**——`SUBTYPE_DESC` 常數尚未以此名稱從 `frontend/src/domain/user-subtype.ts` 匯出（或說明文字尚未整合為具名常數）。test-generator 依既有測試設計文件所載之匯出位置假定（同檔案，比照 `SCOPE_NOTICE_*`）撰寫，未讀取任何生產碼；此為實跑實測結果，非猜測。

**AC-41／AC-42／AC-46 各有部分子案例為 GREEN（非 RED），理由**：
- AC-41／AC-42 之 INV-2 反向案例（roleCode≠User 但 userSubtype='business' → 不得顯示徽章）現況本就不顯示任何徽章（因為徽章功能整體未實作），斷言「不出現」故天然為綠——**回歸鎖，非缺陷**；一旦 AC-41/AC-42 正向案例被實作，此案例才會真正發揮「INV-2 排除」的鎖定作用。
- AC-46 之「不殘留文件欄位」「殘留內容回歸鎖（真實路由切換）」「返回文件瀏覽按鈕維持不動」三案例皆綠——現行 404 畫面本就不含任何文件欄位、真實跨文件路由切換亦未觀察到殘留（可能因元件於 id 變動時已正確清空 state，或路由層本身已 remount）、既有按鈕確實仍在。三者皆為合法的回歸鎖，非缺陷。

**RED gate 完整實跑**：`npm --prefix frontend test`（全量 57 檔／738 案例）：**4 檔 7 案例紅、53 檔 731 案例綠**，紅的 7 案例逐一核對皆為上述 AC-41／AC-42／AC-44／AC-45／AC-46 之新增斷言，**零既有測試回歸**（722 條既有測試全數維持綠燈；`npm --prefix frontend run typecheck` 除 `SUBTYPE_DESC` 未匯出之預期錯誤外無其他型別錯誤，證實 `AccountView.userSubtype` 之欄位名假設正確）。

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
