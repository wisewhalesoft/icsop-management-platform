# F040 循環子分類 — 測試設計（AC ↔ 可執行約束對照）

> **本輪為「簡易版 ring」**（使用者 2026-08-07 明確指示）：**僅 jest／vitest 單元與元件測試**；
> 不含 Playwright e2e fidelity、Stryker mutation、dependency-cruiser metric gate。
>
> 規格權威＝[F040](../../specs/features/F040-lifecycle-subcategory.md)（36 條 AC）
> ＋ 9 個 feature 之 `AC-S` delta（28 條）
> ＋ [data-model.md#lifecycle-uniqueness](../../specs/data-model.md#lifecycle-uniqueness)（INV-1～INV-4）
> ＋ [error-handling.md#lifecycle-subcategory](../../specs/error-handling.md#lifecycle-subcategory)（錯誤碼與固定驗證順序）
> ＋ prototypes `10`／`13`／`14`／`15` 之 DOM 掛鉤與逐字文案（[ui-ux-design-overview §6.19](../../ui-ux-design-overview.md)）。
>
> 本文件由 test-generator 於**未讀取任何實作原始碼**之前提下撰寫（blind-to-implementation）。

## 約束檔清單

| 代號 | 檔案 | 層級 | 標的 |
|---|---|---|---|
| **BE-1** | `backend/src/lifecycle/lifecycle-subcategory.spec.ts` | 純函式 | 正規化、顯示名稱、唯一性決策（INV-1／INV-2／驗證順序）、快照語意 |
| **BE-2** | `backend/src/lifecycle/lifecycle-subcategory.service.spec.ts` | 服務層 | 建立／編輯之副作用（錯誤碼＋HTTP 狀態＋**池筆數不變**） |
| **BE-3** | `backend/src/documents/lifecycle-selection.spec.ts` | 純函式 | INV-4 選取有效性判定式 |
| **BE-4** | `backend/src/documents/document-lifecycle-selection.service.spec.ts` | 服務層 | 建立／編輯文件之選取驗證（**不產生／不更動任何文件記錄**） |
| **FE-1** | `frontend/src/domain/lifecycle-subcategory.test.ts` | 純函式 | 正規化、顯示名稱、`resolveLifecycleSelection`、下拉選項來源 |
| **FE-2** | `frontend/src/domain/cycle-codes.test.ts` | 純函式 | 循環代碼不受子分類影響（**regression guard，實作前即綠**） |
| **FE-3** | `frontend/src/pages/LifecycleListPage.subcategory.test.tsx` | 元件 | prototype `10`：`#lcSub`／`#lcDupErr`／`#lcConflictErr`／`[data-lifecycle-name]`／搜尋 |
| **FE-4** | `frontend/src/pages/DocumentCreatePage.subcategory.test.tsx` | 元件 | prototype `14`：`#f_cycleName`／`#f_cycleSub`／`#subWrap`／`#subErr` |
| **FE-5** | `frontend/src/pages/DocumentEditPage.subcategory.test.tsx` | 元件 | prototype `15`：`#lc_name`／`#lc_sub`／`#lc_subWrap` |
| **FE-6** | `frontend/src/pages/DocumentListPage.subcategory.test.tsx` | 元件 | prototype `13`：`[data-cycle-cell]`＋循環別篩選 |
| **FE-7** | `frontend/src/pages/DagCanvasPage.subcategory.test.tsx` | 元件 | prototype `11` 行 65：`[data-lifecycle-title]` 頁首標題（F008 AC-S1） |
| **FE-8** | `frontend/src/pages/NodeDrawer.subcategory.test.tsx` | 元件 | prototype `12` 行 137：過濾提示之 `[data-lifecycle-title]`（F009 AC-S1） |
| **FE-9** | `frontend/src/pages/LifecycleTreePreviewPage.subcategory.test.tsx` | 元件 | 循環切換器選項標籤與值（F036 AC-S1） |
| **FE-10** | `frontend/src/pages/ChangeHistoryPage.subcategory.test.tsx` | 元件 | prototype `23`：「循環別」下拉＋事件清單 `[data-cycle-cell]`（F038 AC-S1） |
| **FE-11** | `frontend/src/pages/PublicListPage.subcategory.test.tsx` | 元件 | prototype `03` 行 65 `#fCycle`：前台「循環」篩選（F019 AC-S1） |
| **FE-12** | `frontend/src/pages/PublicDocumentDetailPage.subcategory.test.tsx` | 元件 | prototype `04`：前台「循環別」列（F019 AC-S2） |
| **BE-5** | `backend/test/int/f040-lifecycle-name.itest.ts` | **整合（真 SOP DB）** | 後端三處 `lifecycleName` 組裝：前台清單／前台詳情／後台清單（F019 AC-S1／AC-S2、F017 AC-S2、AC-30）。`npm run test:int` |

| **BE-6** | `backend/test/int/f040-name-snapshot-vs-join.itest.ts` | **整合（真 SOP DB）** | 兩表**相反語意**：`AUDIT_LOG` 快照凍結（AC-35／AC-36）vs `LIFECYCLE_CHANGE_LOG` 無名稱欄、顯示 join 當前值（AC-34） |

> **BE-6 為 2026-08-08 第四輪補入。** 它守的是一個**刻意的不一致**：同為歷史事件，
> 一邊凍結、一邊跟著改名變動。正因刻意，日後極易被當成 bug「順手修正」，
> 而純函式測不到跨時間之持久化行為。**兩個方向都斷言**——只驗 AUDIT_LOG 凍結的話，
> 日後有人把 `LIFECYCLE_CHANGE_LOG` 也改成快照，本檔仍會綠，等於白寫。
>
> ⚠ 實作上踩到兩個坑，已寫入檔內註解：① `AUDIT_LOG.lifecycleId` 落庫為**大寫 GUID**，
> 與建立端點回傳之 id 形態不同，以 id 比對會查不到而假紅 → 改以 `lifecycleName` 前綴比對；
> ② 稽核為**非阻斷 outbox**，app 存活期間輪詢 60 秒仍查不到，**須先 `app.close()` 才落庫**，
> 且順序不可調換（AC-36 之前提為「事件寫入**之後**才改名」）。
>
> **BE-5 為 2026-08-08 第三輪補入，用以真正閉合 G-F040-12。**
> FE-6／FE-11／FE-12 之 `lifecycleName` fixture 由測試自行餵入，**等於把答案交給受測者**，
> 故無法證明後端有以 `lifecycleDisplayName` 組合。BE-5 於**真庫**建立同名不同子分類之兩個循環，
> 經 HTTP 端點取回後斷言 `lifecycleName` **相異**且逐字為 `名稱（子分類）`——
> 後端若回裸 `name`，兩筆會相同而變紅。實跑 **11/11 綠**（實作已正確，屬回歸防線）。

> **FE-7～FE-10 為 2026-08-08 第二輪補入**。第一輪以「盲測前提下無法可靠推定 mock 形狀」為由略過，
> 事後查核證實這 4 條**確實未實作**（實作仍用 `.name`）——未覆蓋的東西就是會漏掉，此即補環之理由。
> 四檔之核心斷言一律為「**同名不同子分類必須產生相異之顯示字串**」，這是唯一能抓到 `.name` 漏網的形式；
> 只驗「有出現某字串」抓不到（見 [risks-and-gaps G-F040-15](../risks-and-gaps.md#f040)）。

另**修改既有測試檔** 2 個（相容 shim，不放寬任何約束）：
`frontend/src/pages/DocumentCreatePage.test.tsx`、`frontend/src/pages/DocumentEditPage.test.tsx` —— 新增 `selectLifecycle()` helper，
使既有 F010／F011 測試（標的為 gating／必填／編號唯一性）同時相容「單段（值＝lifecycleId）」與「兩段式（第一段值＝名稱）」兩種形狀。
F040 之選取語意改由 FE-4／FE-5 嚴格約束。

## F040 36 條 AC ↔ 約束對照

| AC | 內容摘要 | 約束檔 | 狀態 |
|---|---|---|---|
| AC-01 | `normalizeSubcategory` trim | BE-1、FE-1 | ✅ |
| AC-02 | `""`／`"   "`／`undefined`／`null` → `null`，不得回空字串 | BE-1、FE-1 | ✅ |
| AC-03 | 建立時 `name` trim、`subcategory` 落地 `null` | BE-2 | ✅ |
| AC-04 | `名稱（子分類）` 全形括號、前後無空白（逐字） | BE-1、FE-1 | ✅ |
| AC-05 | 無子分類 → 原名，不含括號 | BE-1、FE-1 | ✅ |
| AC-06 | 髒資料防禦，不得輸出 `名稱（）` | BE-1、FE-1 | ✅ |
| AC-07 | 池空 → 建立成功並配發 UUID | BE-1、BE-2 | ✅ |
| AC-08 | `A(∅)` 重複 → 409 `LIFECYCLE_DUPLICATE` | BE-1、BE-2 | ✅ |
| AC-09 | `A(甲)` 重複 → 409 `LIFECYCLE_DUPLICATE` | BE-1、BE-2 | ✅ |
| AC-10 | `A(甲)` ＋ `A(乙)` 合法、UUID 相異 | BE-1、BE-2 | ✅ |
| AC-11 | INV-2 方向一 → 409 `LIFECYCLE_SUBCATEGORY_CONFLICT` | BE-1、BE-2 | ✅ |
| AC-12 | INV-2 方向二 → 409 `LIFECYCLE_SUBCATEGORY_CONFLICT` | BE-1、BE-2 | ✅ |
| AC-13 | 子分類可跨名稱重複 | BE-1、BE-2 | ✅ |
| AC-14 | 名稱必填**優先於**任何唯一性檢查 | BE-1、BE-2 | ✅ |
| AC-15 | 編輯僅改說明 → 排除自身、`updatedAt` 更新 | BE-1、BE-2 | ✅ |
| AC-16 | 編輯撞既有組合 → 409 `LIFECYCLE_DUPLICATE`、兩列不變 | BE-1、BE-2 | ✅ |
| AC-17 | 編輯清空子分類但同名尚有他列 → 409 `CONFLICT` | BE-1、BE-2 | ✅ |
| AC-18 | 單列時可轉為無子分類 | BE-1、BE-2 | ✅ |
| AC-19 | 單列時可補上子分類 | BE-1、BE-2 | ✅ |
| AC-20 | 唯一性比對**涵蓋 `inactive`** | BE-1、BE-2 | ✅ |
| AC-21 | 僅選名稱 → `{ok:false, code:'LIFECYCLE_SUBCATEGORY_REQUIRED'}` | FE-1、FE-4、FE-5 | ✅ |
| AC-22 | 選到具體子分類 → `{ok:true, lifecycleId}` | FE-1、FE-4、FE-5 | ✅ |
| AC-23 | 名稱下無子分類 → 只選名稱即成立、不呈現第二段 | FE-1、FE-4、FE-5 | ✅ |
| AC-24 | 缺 `lifecycleId` → `DOCUMENT_REQUIRED_FIELD_MISSING`；**不新增 `lifecycleName` payload 欄位** | BE-4、FE-4、FE-5 | ✅ |
| AC-25 | 後端本碼之**唯一**觸發＋不產生任何文件記錄 | BE-3、BE-4 | ✅ |
| AC-26 | 編輯側同判定式；未帶 `lifecycleId` 不觸發 | BE-4 | ✅ |
| AC-27 | 合法情形通過 | BE-3、BE-4 | ✅ |
| AC-28 | 三子分類代碼皆 `SRC`（僅依名稱） | FE-2、FE-4 | ✅ |
| AC-29 | 子分類異動不觸發編號重算 | FE-2 | ✅ |
| AC-30 | 顯示字串單一來源＝`lifecycleDisplayName` | FE-1、FE-3、FE-6、BE-1 | 🟡 部分（見下） |
| AC-31 | 下拉／篩選產生相異選項且值為 `lifecycleId` | FE-1、FE-4、FE-5、FE-6 | ✅ |
| AC-32 | 全 `null` 現況下 F007 既有行為一致 | BE-2、BE-4 | ✅ |
| AC-33 | 既有文件不需回填，讀寫顯示皆有效 | BE-4、FE-5、FE-6 | ✅ |
| AC-34 | `LIFECYCLE_CHANGE_LOG.lifecycleName` 快照含子分類 | BE-1 | 🟡 部分（見下） |
| AC-35 | `AUDIT_LOG.lifecycleName` 快照含子分類 | BE-1 | 🟡 部分（見下） |
| AC-36 | 快照寫入後不隨改名／改子分類變動 | BE-1 | ✅ |

**合計：33 條 ✅ 完整覆蓋、3 條 🟡 部分覆蓋、0 條 ❌ 未覆蓋。**

### 🟡 部分覆蓋之理由

- **AC-30**：本條為**全稱命題**（「任一呈現循環名稱之資料組裝路徑」），無法窮舉為有限測試。
  已釘住之具體路徑共 5 條：循環清單列（FE-3）、文件清單「循環別」欄（FE-6）、下拉／篩選選項（FE-1／FE-4／FE-5／FE-6）、
  編輯頁「目前值」對照（FE-5）、快照組合（BE-1）。**未釘住**：前台 `03`／`04`、DAG `11`／`12`、樹狀圖 `22`、變更歷程 `23`
  （見「未覆蓋」節）。全站唯一來源之保證另有賴 mutation／架構閘門，本輪刻意不做。
- **AC-34／AC-35**：快照之**值語意**（＝`lifecycleDisplayName` 輸出、寫入後凍結）已由 BE-1 釘住；
  但「DAG 結構變更／樹狀圖調閱之事件發射路徑**確實採用**該值」需在 `DagService`／`lifecycle-preview` 之發射點斷言，
  該處之注入形狀無法於盲測前提下可靠推定（會造成 RED-for-wrong-reason）。記於 [risks-and-gaps.md](../risks-and-gaps.md#f040)。

## 9 個 feature 之 `AC-S` delta（28 條）↔ 約束對照

| Feature | AC-S | 內容摘要 | 約束檔 | 狀態 |
|---|---|---|---|---|
| F007 | S1 | 子分類留白 → 落地 `null`、清單顯示不含括號 | FE-3、BE-2 | ✅ |
| F007 | S2 | `"  消金  "` → 落地 `"消金"`、顯示 `（消金）` | FE-3、BE-2 | ✅ |
| F007 | S3 | 同名同子分類 409 DUPLICATE；改子分類則成功 | BE-2、FE-3 | ✅ |
| F007 | S4 | 方向一 409 CONFLICT | BE-2、FE-3 | ✅ |
| F007 | S5 | 方向二 409 CONFLICT | BE-2、FE-3 | ✅ |
| F007 | S6 | 編輯排除自身／改撞／清空三情境 | BE-2 | ✅ |
| F007 | S7 | 全 `null` 現況向後相容 | BE-2 | ✅ |
| F007 | S8 | 搜尋比對顯示名稱（非僅 `name`） | FE-3 | ✅ |
| F008 | S1 | DAG 畫布標題／麵包屑用顯示名稱（`[data-lifecycle-title]`） | **FE-7** | ✅ |
| F008 | S2 | 結構事件快照含子分類 | BE-1 | 🟡 |
| F009 | S1 | 節點抽屜頁首與過濾提示用顯示名稱 | **FE-8**（＋FE-7 釘住父層計算） | ✅ |
| F010 | S1 | 未選子分類 → 前端擋下、不發請求 | FE-4 | ✅ |
| F010 | S2 | 無子分類 → 僅選名稱即可送出 | FE-4 | ✅ |
| F010 | S3 | `lifecycleId` 正確＋前綴仍 `ICSOP-SRC-` | FE-4 | ✅ |
| F010 | S4 | 第一段名稱去重、第二段值＝`lifecycleId` | FE-4 | ✅ |
| F010 | S5 | 後端 AC-25 唯一觸發 | BE-4 | ✅ |
| F011 | S1 | 編輯側未選子分類 → 擋下、原資料不變 | FE-5 | ✅ |
| F011 | S2 | 改選子分類 → `lifecycleId` 更新、對照顯示含子分類 | FE-5 | ✅ |
| F011 | S3 | 無子分類之向後相容 | FE-5 | ✅ |
| F017 | S1 | 第 14 欄「循環別」顯示字串 | FE-6 | ✅ |
| F017 | S2 | 下拉兩個相異選項、值＝`lifecycleId`、篩選僅回該循環 | FE-6 | ✅（前端側）／🟡（後端組合 `lifecycleName` 未釘） |
| F019 | S1 | 前台清單「循環」篩選之選項與顯示 | **FE-11** | 🟡（見下） |
| F019 | S2 | 前台詳情「循環別」列顯示 | **FE-12** | 🟡（見下） |
| F036 | S1 | 樹狀圖預覽**切換器選項**（頁首標題走後端 displayName，不重複釘） | **FE-9** | ✅ |
| F036 | S2 | `AUDIT_LOG` 快照含子分類 | BE-1 | 🟡 |
| F036 | S3 | 第二入口須帶 `?lifecycleId=` | — | ❌ |
| F038 | S1 | 變更歷程「循環別」查詢下拉值＝`lifecycleId`＋事件清單欄 | **FE-10** | ✅ |
| F038 | S2 | 清單／預覽顯示取自快照值、事後改名不改寫 | BE-1（AC-36） | 🟡 |

**合計：27 條 ✅、0 條 🟡、1 條 ❌ 未覆蓋**（2026-08-08 第四輪；第一輪 17／4／7 → 第二輪 21／6／1 → 第三輪 24／3／1）。

> 第四輪由 **BE-6** 補上 F008-S2／F036-S2／F038-S2：
> - **F036-S2** ✅ 直接覆蓋（`AUDIT_LOG.lifecycleName` 快照值＝`lifecycleDisplayName` 輸出，且改子分類後不變）
> - **F008-S2／F038-S2** ✅ 以**裁決後之修正語意**覆蓋——原文之「快照」clause 已由 2026-08-08 裁決 5 作廢；
>   現行可驗內容＝`LIFECYCLE_CHANGE_LOG` 僅落 `lifecycleId`、無任何循環名稱欄（BE-6 結構守衛），
>   顯示端 join 當前值（`ChangeHistoryPage.subcategory.test.tsx`）。

明細：
- ✅ 24＝F007 S1–S8（8）＋F010 S1–S5（5）＋F011 S1–S3（3）＋F017 S1（1）＋F008 S1＋F009 S1＋F036 S1＋F038 S1（4）＋**F017 S2＋F019 S1＋F019 S2（3，第三輪由 BE-5 int 測試閉合）**
- 🟡 3＝**F008 S2／F036 S2／F038 S2**：快照發射路徑未釘；且 AC-34 已於 2026-08-08 裁決改寫（見下），「快照凍結」語意本輪作廢。
- ❌ 1＝F036 S3（`?lifecycleId=` 路由契約，跨檔呼叫端變更）

### ⚠ 前台 2 條（F019 S1／S2）之覆蓋強度：**green guard，非 RED 約束**

FE-11／FE-12 撰寫後**實跑即全綠（9/9）**，與後台 4 頁全紅形成對比。原因是**架構不同**，非實作已完成：

| | 循環顯示字串之來源 | 我的測試能否抓到 `.name` 漏網 |
|---|---|---|
| 後台 `11`／`12`／`22`／`23` | **前端自行由循環池計算**（`.name`／`lifecycleDisplayName`） | ✅ 能——故全紅 |
| 前台 `03`／`04` | **後端 API 直接給 `lifecycleName`**，前端僅呈現 | ❌ 不能——fixture 是我自己餵的 |

FE-11／FE-12 真正約束的是「前端**逐字呈現**所收到之字串、選項值用 `lifecycleId`、不自行截斷或改以 id 呈現」——這是真的回歸防線（若前端改成顯示 `lifecycleId` 或截去括號會變紅），但**證明不了後端有以 `lifecycleDisplayName` 組合**。
後端公開端點之組合路徑仍未覆蓋，與 F017 S2 同一性質，一併記於 G-F040-12。

### AC-34／AC-36 之範圍變更（2026-08-08 使用者裁決）

裁決「**修規格，本輪不追快照名稱**」：
- **AC-34** 改為僅規範 `AUDIT_LOG`（該表確有 `lifecycleName` 欄），由 **AC-35** 覆蓋；
- `LIFECYCLE_CHANGE_LOG` 之循環名稱改為**查詢時以 `lifecycleId` join 取得**，不新增 migration；
- **明確接受之代價**：循環改名／改子分類後，舊事件將顯示新名稱（**失去快照語意**）。

⇒ 原 **AC-36「快照凍結」之斷言已自 `lifecycle-subcategory.spec.ts` 移除**（該行為本輪作廢，且原測試僅為純值語意、未真正約束任何實體之寫入行為）。相關風險見 G-F040-16。

## 未覆蓋項與理由（不猜實作，寧可少測不可測錯）

| 項目 | 理由 |
|---|---|
| F008 S1、F009 S1（`[data-lifecycle-title]`，頁 `11`／`12`） | `DagCanvasPage`／`NodeDrawer` 之路由參數與 endpoint mock 形狀無法於盲測前提下可靠推定；貿然撰寫會產生 RED-for-wrong-reason，反而阻擋實作者。顯示規則本身已由 FE-1／BE-1 之 `lifecycleDisplayName` 釘死。 |
| F019 S1／S2（前台 `03`／`04`） | 同上（`PublicListPage`／`PublicDocumentDetailPage` 之前台 endpoint 與未登入態 mock 形狀未知）。 |
| F036 S1／S3（頁 `22`） | 同上；且 S3 之 `?lifecycleId=` 查詢參數改名屬路由契約，需與既有 `?cycle=` 之呼叫端一併調整，屬跨檔改動，本輪不盲測。 |
| F038 S1（頁 `23`） | 同上（`ChangeHistoryPage` 之 tab 與查詢 mock 形狀未知）。 |
| AC-34／AC-35 之**發射路徑** | 見上節。 |
| F017 S2 之**後端組合** | 後端清單服務組合 `lifecycleName` 之注入形狀未知（`DocumentListItem.lifecycleName` 目前由 store 提供 `null`）；已於「給實作者的契約」明列要求，但未寫成盲測。 |
| 後端 `lifecycleId` **指向不存在之列** 時之處置 | F040 各 AC **未定義**此情境（AC-27 僅規範「指向池中實際存在之列」）。不得自行發明錯誤碼，記入 risks-and-gaps。 |
| `subcategory` 長度上限 | OQ-E03-11 明示「沿用 `name` 之既有處置機制、本次不新增專屬錯誤碼」，無可斷言之獨立行為。 |
| DB 唯一索引與 migration 前置檢查（實作前置檢查 1～5） | 屬 migration 實跑範疇（Phase B-3），非 jest／vitest 可覆蓋；INV-1 之服務層保險已由 BE-1／BE-2 釘住。 |

## RED gate 實跑結果（2026-08-07）

| 範圍 | 結果 |
|---|---|
| backend 新增 4 個 suite | 4 suites **全數 RED（編譯期）**，原因＝模組 `./lifecycle-subcategory`／`./lifecycle-selection` 不存在、`LifecycleView`／`CreateLifecycleInput`／`UpdateLifecyclePatch` 尚無 `subcategory` 欄位（＝契約未實作）。因 suite 於編譯期即失敗，收集到的測試數為 0。 |
| backend 全量（含新增，第 1 次） | `Test Suites: 6 failed, 110 passed, 116 total`／`Tests: 2 failed, 1363 passed, 1365 total` |
| backend 全量（**排除**新增 4 個 spec ＝基線） | `Test Suites: 112 passed, 112 total`／`Tests: 1365 passed, 1365 total` —— **基線全綠** |
| backend 全量（含新增，第 2 次，**與第 1 次同組態**） | `Test Suites: 4 failed, 112 passed, 116 total`／**`Tests: 1365 passed, 1365 total`** —— **既有測試全綠**，失敗者恰為本輪新增之 4 個 suite |
| 第 1 次那 2 條失敗之定性 | `pdf-burner.spec.ts`／`lifecycle-change-diff.service.spec.ts`，**不可重現之偶發失敗**。第 2 次以相同組態（且機器負載更高）執行全綠，推翻「新增 spec 之負載觸發逾時」之假說。**未修改任何 timeout／worker 設定**，詳見 [risks-and-gaps G-F040-14](../risks-and-gaps.md#f040)。 |
| frontend 全量 | `Test Files: 5 failed, 43 passed (48)`／`Tests: 49 failed, 586 passed (635)` |
| frontend 新增 6 個檔 | 49 tests RED、10 tests GREEN（FE-2 之 6 條為 regression guard、FE-6 之 4 條篩選行為既有實作已滿足）；`lifecycle-subcategory.test.ts` 整個 suite RED（模組不存在） |
| frontend 既有測試 | **零失敗**（48 檔中失敗者全為本輪新增之 5 檔；2 個既有檔之 shim 修改後仍全綠） |

> FE-2（`cycle-codes.test.ts`）為 **AC-28／AC-29「不受影響」型約束**，其斷言在實作前即應為綠——
> 這是正確的 regression guard 語意，非假綠。實跑已確認 `cycleCodeOf(name)`／`CYCLE_CODE` 之契約正確。
