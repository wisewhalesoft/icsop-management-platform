---
type: implementation-log
feature_id: UX16-WS0
feature_name: UX16 共用接縫（ARCH-UX1／ARCH-UX2／ARCH-UX5／ARCH-UX7）＋ WS-A 項 4（AC-UX8～AC-UX12）
status: complete
last_updated: 2026-09-22
---

# UX16 WS-0 共用接縫 ＋ WS-A（項 4）— 實作記錄

> 🔴 本檔刻意**不叫** `F041-impl.md`／`F042-impl.md`：本輪有四位實作者同時在不同工作線上，
> 以 feature 命名之 impl log 會被彼此覆寫（本 repo 已發生過）。本檔只記 WS-0／WS-A 這一條 lane。

## 一、範圍與不變式

- 🔴 **本 lane 零測試異動**：`git diff --stat` 之全部異動皆為生產程式碼；
  `*.spec.ts`／測試 helper／jest 設定一格未動。爭議一律以 SendMessage 送 `ring-ux16` 裁決。
- territory 外之檔案（`documents.service.ts`／`public-documents.service.ts`／
  `typeorm-ojt-org-directory.ts`／各前端頁面等）一律未碰。

## 二、Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/org-directory/org-division.ts` | new | `divisionOf`／`indexOrgUnitsByCompany`（自 `dashboard/division-resolver.ts` 逐字承接，含跨公司防護與「無本部唯一成因」之註解）＋ `createOrgPathResolverWithDivision`（`ARCH-UX7`／`AC-UX45`／`AC-UX57`） |
| `backend/src/dashboard/division-resolver.ts` | modified | 移除上述兩支之定義，改為 `export { divisionOf, indexOrgUnitsByCompany } from '../org-directory/org-division';`；`orgSegmentOf`／`companyLabel`／`SEG_*` 與檔頭 JSDoc 一字未動，內部 `divisionOf` 改為 import |
| `backend/src/org-directory/org-path.ts` | modified | 新增 `resolveDepartmentUnit<T>()`（回傳 fallback 鏈實際採用之**列**），`resolveDepartmentFullName` 改為其投影（規則仍只有一份，行為逐字不變） |
| `backend/src/org-directory/name-resolution.service.ts` | modified | 新增 `listOrgUnitsByCompany()`（passthrough `ORG_UNIT_READ_STORE.listByCompany`，`ARCH-UX2`；無快取） |
| `backend/src/business-categories/business-category-sort.ts` | new | `sortByOrderThenName()`（`ARCH-UX5`／`AC-UX31` ③；UTF-16 碼位序，禁 `localeCompare`） |
| `backend/src/org-sync/role-derivation.ts` | modified | `AC-UX8`：規則 A 停止消費 `isBusinessJobTitleName()`，`targetSubtype` 恆 `'other'`；該函式本體與 export 保留，作廢之原行以 `OLD>` 就地註解 |
| `backend/src/database/migrations/1725753600000-account-user-subtype-derived-backfill.ts` | new | `AC-UX9`／`ARCH-UX9`：純 `UPDATE ACCOUNT SET userSubtype='other' WHERE roleSource='derived' AND userSubtype='business'`，`down()` no-op |

## 三、Architectural Decisions（規格邊界內之實作選擇）

1. **`AC-UX57` 之收合判準落在「部段實際來自哪一列」，不是 `departmentCodeOf()`**
   §16.7 之參考實作只取 `resolveDepartmentFullName()` 的**名稱**，答不出「本部段與部段是不是
   同一個單位」——而 `AC-UX57` ① 明文要求**以 `orgCode` 相等為準、禁止以顯示名相等為準**。
   故在 `org-path.ts` 加一支 `resolveDepartmentUnit<T>()` 把既有 fallback 鏈（部層→本部層→Root）
   之**結果列**對外，`resolveDepartmentFullName()` 改寫為 `resolveDepartmentUnit(...)?.descFull ?? null`。
   - 🔒 **規則仍只有一份**——沒有在 `org-division.ts` 複製一份 fallback 鏈（§16.7 之「不複製規則」）。
   - 🔒 `resolveDepartmentFullName` 之簽章／行為逐字不變；其既有消費端（`watermark.ts` re-export、
     `org-path.ts` 內部）零改動，`watermark.spec.ts` 之 fallback 鏈案例（`JAC00` → `營業二本部`）維持綠燈。
   - 🔴 **沒有**給 `buildOrgPath`／`createOrgPathResolver` 加任何布林旗標（交辦之明文禁令）。
2. **收合時捨棄的是「本部段」而非「部段」**：兩者既為同一列，輸出字串相同；捨本部段可讓
   `segments` 之組裝順序與 `createOrgPathResolver` 逐字一致，空段收合仍由同一個 `.filter()` 承接。
3. **`division-resolver.ts` 之 `import { divisionOf }` 只引一支**：`indexOrgUnitsByCompany` 在本檔
   已無內部消費者，只需 re-export；一併 import 會留下未使用之區域繫結。
4. **migration 時間戳取 `1725753600000`**：既有最大為 `1725580800000`，同批另有一支
   `business-category-sort-order`（`ARCH-UX5`，屬他人 lane）待建，刻意跳過 `1725667200000` 留給它，
   避免兩支撞號。兩支彼此獨立、無先後相依。
5. **`down()` 為 no-op 且檔內明文寫出「不得寫成反向 UPDATE」**：反向回填會把**從來就不是**業務的
   絕大多數帳號一併標成 `business`，造成比原缺口更大的錯誤。

## 四、Test Results Summary

| 環檔 | 結果 |
|---|---|
| `backend/src/org-directory/org-division.spec.ts` | ✅ 全綠（含 `AC-UX57` ⓐ 與「同名不同碼不得收合」之互補鑑別案） |
| `backend/src/business-categories/business-category-sort.spec.ts` | ✅ 全綠 |
| `backend/src/database/migrations/account-user-subtype-derived-backfill.selection.spec.ts` | ✅ 全綠 |
| `backend/src/org-sync/role-derivation.spec.ts` | ✅ **60 passed／1 skipped／0 failed**（`ring-ux16` 已於 2026-09-22 裁決並就地改寫三案，見 §六） |

其餘閘門：

| 閘門 | 結果 |
|---|---|
| `npx tsc --noEmit` | 全 repo 僅 3 個錯誤，**皆為他人 lane 尚未建立之模組**（`node-company-counts`／`public-business-category-subtree`／`ojt-progress-export-columns`）；本 lane 之檔案零錯誤 |
| `npm run deps:check` | ✔ no dependency violations（412 modules／1238 dependencies）——`ARCH-UX1` 所防之循環未發生 |
| 零回歸（受影響消費端） | `src/dashboard` ＋ `src/org-directory` ＋ `src/public/watermark.spec.ts` ＋ `src/audit/audit-identity` ＝ **20 suites／324 tests 全綠**（`division-resolver.spec.ts`／`dashboard-analytics` 之 F044 零漣漪成立，兩者一格未改） |

## 五、🔴 本輪測不到（須部署後人工覆核）

1. **migration 未對任何真庫執行**（architecture-spec §16.12 #3）：須實跑 COMMIT 後以
   `SELECT COUNT(*) FROM ACCOUNT WHERE roleSource='derived' AND userSubtype='business'` 覆核為 `0`（`AC-UX10`）。
   🔴 不跑它就讓例行同步跑 `deriveRoles()` ⇒ 正式環境約 699 筆湧進同一份計畫 ⇒ 門檻整批擋下、一筆不寫。
2. **`createOrgPathResolverWithDivision` 對真實 `ORG_UNIT` 之 `parentCode` 鏈是否正確**（§16.12 #6）：
   純函式層僅以固定向量驗證邏輯本身。

## 六、爭議與裁決（已結案；我全程未動任何測試）

> **2026-09-22 裁決結果（申訴成立）**：`ring-ux16` 已就地改寫 `role-derivation.spec.ts` 三案——
> ① `:214` 改為新邏輯之期望（`subtypeChanges` 為 `[]`／`writeCount` 為 `0`，同語料對舊邏輯仍互斥）；
> ② `:237` 採「夾具改 `userSubtype:'business'`」之建議，兩條路徑分離之原意完整保留；
> ⭐ ③ `:249`（複合鍵解析）**兩段式處置，最終為「遷移並刪除」**：建環者初判為休眠（`it.skip()`），
> team-lead 覆核後更正——**「恆真／休眠斷言比沒有斷言更糟」**，要求先查該不變式是否在別處仍有
> **真實載體**。查證結果：`org-directory/job-title-directory.spec.ts` 雖測了 `jobTitleKey`，卻**沒有
> 任何一條直接斷言「同代碼跨公司不得互相覆蓋」**——而那裡才是複合鍵解析的權威落點
> （`deriveRoles()` 的 `jobTitles` 參數正是以 `jobTitleKey(companyCode, code)` 為鍵）。
> ⇒ 於該檔補上直接斷言，`role-derivation.spec.ts` 之休眠案**直接刪除**、只留遷移說明註解。
> 🔒 **結果是覆蓋率淨增**，不是淨減：原先被誤以為「只有這裡在守」的不變式，其實從來沒被直接守過。
> 風險紀錄 `docs/test-specs/risks-and-gaps.md`（`UX16-08`）。
> ✅ **`role-derivation-pipeline.spec.ts` 之 8 條亦已處置**（同日，`ring-ux16` 就地改寫 6 處語料，
> 一律補 `userSubtype:'business'` ⇒ 回填語意產生**同樣筆數**之變更、方向由 `other→business` 反轉為
> `business→other`，閾值／放行／告警路由三組**正交**關懷之鑑別力原樣保留）→ 14/14 全綠。
> 📌 **這一類紅燈之特徵值得留檔**：斷言裡 grep `business` 命中 0（它們關心的是閾值與告警路由，
> 不是職稱規則），純靠**語料手段**借用規則 A 去製造變更 ⇒ 規則停用後「前提蒸發」，
> 事前字面掃描抓不到，只能靠**改完跑全套、逐檔判斷紅燈歸誰**。


**爭議**：同一份環內，`AC-UX8`（「`deriveRoles()` 輸出中 `to === 'business'` 之列數**恆為 0**」）
與下列**既有**斷言字面互斥，沒有任何實作能同時滿足：

| 檔案 · 案例 | 既有斷言 | 與 `AC-UX8` 之關係 |
|---|---|---|
| `role-derivation.spec.ts:214` | `subtypeChanges` 恰含 `{from:'other', to:'business'}` | 🔴 字面互斥 |
| `role-derivation.spec.ts:236` | 語料 `userSubtype:'other'`＋`J01` ⇒ `toHaveLength(1)` | 該組合在 `AC-UX8` 後恆 0 筆（不變式本身仍成立，換語料即可保住） |
| `role-derivation.spec.ts:249` | `{accountId:'as1', to:'business'}` | 其守護之「`(companyCode, code)` 複合鍵解析」在 `AC-UX8` 後**已無載體**（`deriveRoles` 不再查職稱名） |
| `role-derivation-pipeline.spec.ts`（8 條） | 全部語料為 `derivAcc({jobTitleCode:'J01'})`＋夾具預設 `userSubtype:'other'` | 變更筆數恆 0 ⇒「有變更可套用／筆數 20／超過閾值」前提整個蒸發 |

🔒 **本 lane 自始至終未為了轉綠而恢復 `isBusinessJobTitleName()` 之消費**（那會直接違反 `AC-UX8`
與 2026-09-22 之人類裁決）；11 條紅燈全數由建環者以改語料／休眠處置，生產碼一行未因此退讓。
⭐ **可複用之判準**：申訴時要把「字面互斥」與「前提蒸發」分開講——後者要附上「換語料即可保住原意」
之具體一行，否則會被誤讀為在要求刪掉那些保護。
