---
type: implementation-log
feature_id: B
feature_name: 開放多公司（AD／AE／AJ／AS 四家）
status: partial
last_updated: 2026-08-24
---

# B 階段：開放多公司 — Implementation Log

> 權威來源：`docs/specs/upstream-hr-source-contract.md` §10（範圍決策）／**§10.0（實作階段之更正）**／§11 #14–#16（未結項）。
> 前置：A 階段（換上游來源 `VW_HPMUSER` → `VW_PERSONNEL_SQL`）＋ C 階段（穩定鍵遷移）已完成。

## 一、規劃與實際的落差（最重要的一節）

契約 §10 原記載「`ORG_UNIT`／`ACCOUNT`／浮水印本就保留 `COMPID` 維度，故**無需 schema 變更**」。
**實作後證實為誤**——需要兩支 migration，且發現一個**安全性缺陷**。

落差的根因：`orgCode` 是 5 碼部門代碼、**每家公司各自從 `00000`（Root）獨立編碼**。AS 的
`A0000` 與 AD 的 `A0000` 字串相同、意義完全不同。只有一家公司時，「以裸 orgCode 查詢」與
「以 `(companyCode, orgCode)` 查詢」結果**恆等**，缺口因而長期潛伏、從未被任何測試抓到。

## 二、四個根因（已完成）

| # | 根因 | 修正 | 檔案 |
|---|---|---|---|
| ① | `OrgUnitReadStore.findByOrgCode(orgCode)` 無公司維度；`TypeOrmOrgUnitReadStore` 建構子寫死 `defaultCompany='AS'` | 加 `companyCode` **必要**參數；移除預設值 | `org-unit-read.ts`／`typeorm-org-unit-read.store.ts` |
| ② | `PersonStore` 三方法同上（`TypeOrmPersonStore` 寫死 `companyCode='AS'`） | 同上 | `person-directory.ts`／`typeorm-person.store.ts` |
| ③ | `ICSOP_DOCUMENT`／`DOC_USING_DEPT` **無 `companyCode`**，文件無法自證所屬公司 | 加欄位＋migration；既有列 backfill `'AS'`，使用部門依所屬文件 JOIN 回填 | migration `1724371200000` |
| ④ | 🔴 **安全性**：`isUsingDeptMatched` 以裸 `orgCode` 前綴比對 | `UsingDeptRef{companyCode,orgCode}` 取代裸字串；`ViewerScope` 補 `companyCode` | `rbac/viewer-scope.ts` |

### 另一支 migration（同步引擎，非上表四項）

`SYNC_RUN` **無 `compid`**，且 `getAccountWatermark(_compid)` 宣告了參數卻從未使用（全域查
「最後一次成功同步」）。多公司下會使**新公司首次同步繼承他公司水位** ⇒ 增量查詢誤判無異動
⇒ 該公司帳號幾乎全數不寫入，**且同步回報成功、不報錯**。
→ migration `1724284800000-sync-run-compid`；互斥鎖與水位改 per-company。

## 三、修法上的兩個關鍵決策

**1. `companyCode` 一律必填，不給預設值。**
預設值正是本缺陷的成因（`defaultCompany='AS'`／`DEFAULT_COMPANY='AS'` 使全部呼叫端沉默地只查 AS）。
改必填後，未接上公司別的呼叫點**直接編譯失敗**——本次 12 個下游生產檔案由編譯器完整列出，
非人工清點。這也是為何能有把握沒有漏改。

**2. 批次解析改為依公司分組／複合鍵，而非隨便挑一個公司代碼。**
`DocumentsService.enrichNames`／`enrichSecondaryChiefs` 原本把整頁文件的 `orgCode`／`employeeNo`
扁平化成一批查詢。一頁清單可能橫跨多家公司，而兩者皆僅在單一公司內唯一——混批會使某公司
員工的姓名被誤植到另一家的文件列上（靜默錯誤，且隨清單筆數放大）。
→ 改以 `(companyCode, code)` 複合鍵；室長姓名依公司分組、每公司一次查詢（公司數 ≤ 4，非 N+1）。

## 四、下游接線（已完成，12 個生產檔案）

`name-resolution.service.ts`／`org-directory.service.ts`／`org-directory.controller.ts`（`DEFAULT_COMPANY`
改為**取登入者公司**）／`documents.service.ts`／`typeorm-documents.store.ts`／`documents.store.ts`／
`public-list.ts`／`public-documents.service.ts`／`public-document-detail.service.ts`／
`public-documents.store.ts`／`typeorm-public-documents.store.ts`／`typeorm-doc-meta.source.ts`／
`watermark-burner.service.ts`。

**浮水印（A3）特別註記**：`WatermarkSession.companyCode` 本就存在（供 `resolveCompanyShortName`），
舊版卻未傳入 `findByOrgCode`，使非 AS 公司之部門欄顯示錯誤或留空——**而燒錄結果烙印於已下載
PDF、無法事後更正**。已接上。

## 五、測試

**最終狀態**：前端 **99 檔／1417 案全綠**；後端 `tsc` 與前端 `tsc` 皆零錯誤。
後端完整套件之殘留失敗經隔離重跑全過，屬本 session 反覆出現之資源競爭 flaky
（`http-contract` 457 秒、`pdf-glyph-integrity` 280 秒——執行時間本身即為資源耗盡之證據），
與 B 階段無關。


- **新增跨公司隔離回歸鎖**（`rbac/viewer-scope.spec.ts`）：刻意讓「部門代碼完全相同、只有公司別
  不同」，含最嚴重的 **Root（`00000`）洩漏形狀**——Root 之有效前綴為空字串、對任何代碼皆成立，
  公司過濾一旦漏掉，別家公司掛 Root 的文件會對全體使用者可見。另鎖住「非受限 viewer 不得因本
  修正而被誤鎖」（避免修過頭）。
- **簽章 arity 鎖**（`public-list-filters.spec.ts` `TS-F019-D13-001`）：期望值由 `2／2／2` 更新為
  **`2／3／2`**，並於測試內註明「本鎖之用意是防止 AC-D12 那批 delta 順手改動判定邏輯，不是永久
  凍結簽章；本次為有明確授權之安全性修正」。
- 其餘為 fixture 補欄位與替身簽章跟進（19 檔）。

## 六、🔴 未完成項（交還使用者）

| # | 項目 | 風險 |
|---|---|---|
| 1 | **兩支 migration 未對真庫實跑** | 欄位不存在則同步與文件讀取全面失敗。本專案既有教訓：**單元測試全綠證明不了資料表存在** |
| 2 | **四家公司之首次同步未實跑** | 建議 `SYNC_ONLY_COMPID=AD npm run sync:once` **逐家**驗證，勿一次四家 |
| ~~3~~ | ~~前端「制定公司」選單讀 `tier='ROOT'`~~ | ✅ **已完成**（見下方七） |
| ~~4~~ | ~~前端部門下拉未依公司過濾~~ | ✅ **已完成**（見下方七） |
| 5 | `alert-generation.ts`（F006 組織異動提示）之跨公司文件比對 | 盤點編號 B11；`listDocumentRefs()` 需能按 companyCode 過濾 |
| 6 | `TypeOrmDocumentStore.list()` 之制定三欄篩選未加公司條件 | 盤點編號 B7／B8 |

> 第 5、6 項為盤點列出之下游，依人類裁決「四個根因先做，下游後續」暫緩。
> （第 3、4 項原列為未竟事項，已於同一輪補完，見下節。）

## 七、前端多公司接線（第二輪補完）

**問題**：三處頁面以 `orgUnits.filter(u => u.tier === 'ROOT')` 充當公司清單。四家公司之 Root
代碼**皆為 `00000`**（各公司獨立編碼）⇒ 下拉出現多個值相同、標籤不同的選項，選了等於沒選；
且 **AE 無 Root 列**（實測 `ROOT_N=0`），該公司使用者連制定公司都選不出來。

| 檔案 | 修正 |
|---|---|
| `api/endpoints.ts` | `getOrgUnits(companyCode?)` 開放選填參數（後端早已支援 `?companyCode=`，前端未開放） |
| `api/types.ts` | `DocumentView` 補 `companyCode`（鏡射後端） |
| `DocumentCreatePage.tsx` | 公司下拉改讀 `GET /companies`；組織資料改為**依所選公司**載入（新增 effect），未選公司即清空 |
| `DocumentEditPage.tsx` | 公司下拉同上；組織以**文件自身之 `companyCode`** 載入 |
| `AccountManagementPage.tsx` | 新增 `ensureOrgUnits(companyCode)`，比照既有 `ensureJobTitles` 之逐公司累積模式 |

**`AccountManagementPage` 的隱藏問題**：該頁註解寫「跨公司之收斂由 `unitsOf` 於前端完成」，
但 `getOrgUnits()` 無參數呼叫在 B 階段後只會回**登入者自己公司**的資料 ⇒ 建立他公司帳號時
部門下拉恆為空，且會誤觸 `AC-P26` 的空狀態文案「此公司尚未同步組織主檔」——看起來像資料問題，
實際上只是前端沒去要那家公司的資料。已改為逐公司補抓。

⚠ 累積去重以 **`(companyCode, orgCode)` 複合鍵**：不同公司之 `orgCode` 字串可能相同，
僅以 `orgCode` 去重會使後載入的公司覆蓋先前公司之同代碼單位。

### 🔴 實作中浮現：`companyCode` 與 `draftingCompanyId` 之語意分離

改公司下拉時我一度**直接把公司代碼塞進 `draftingCompanyId`**，被 `DocumentCreatePage.test.tsx`
的送出斷言擋下（期望 `'00000'`、實得 `'AS'`）。這暴露了兩個欄位語意混用的問題：

| 欄位 | 語意 | 值域 |
|---|---|---|
| `companyCode`（B 階段新增） | 文件**所屬公司** | `AS`／`AD`／`AE`／`AJ` |
| `draftingCompanyId`（既有） | 制定組織三級之第一級 ＝ `ORG_UNIT.orgCode` | 該公司之 ROOT 節點代碼（通常 `00000`） |

B 階段前只有一家公司，ROOT 節點事實上就等同「公司」，兩者混用不會出錯；新增 `companyCode`
後必須分離。現行作法：`companyCode` 由公司下拉直接決定；`draftingCompanyId` 由**該公司之
組織資料**推導其 ROOT 節點，**查無 ROOT 列時留空**（AE 即為此情形，實測 `ROOT_N=0`），
🔴 **不得以公司代碼頂替**——那正是本次差點重犯的錯誤。

> 這條是「舊測試擋下新錯誤」的實例：該斷言原本只是驗證送出值，卻在語意變更時發揮了
> 防止兩個概念被混為一談的作用。
