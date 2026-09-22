# UX16（2026-09-22 使用者體驗優化 16 項）— Session 交接

> **狀態：Phase A 完成、Phase B 進行中。全部未 commit（工作區 90 個變更檔，`HEAD` 仍為 `57500e5`）。**
> 本檔為 session 中斷時之續作進入點。權威一律以磁碟現檔為準。

## 一、已完成（Phase A — 設計，人類閘門已通過）

| 產出 | 位置 |
|---|---|
| Delta story（16 項逐項分析＋驗收意圖） | `docs/stories/2026-09-22-ux-delta-16.md`（新檔） |
| AC delta | 7 檔之 `## UX16 delta` 節，**`AC-UX1`～`AC-UX57`**（F002／F004／F017／F019／F041／F042／F043） |
| 開放問題 | `docs/specs/open-questions.md#ux16-2026-09-22`，**`OQ-UX16-01`～`35` 全數結案** |
| 架構 | `docs/specs/architecture-spec.md` **§16**，`ARCH-UX1`～`ARCH-UX10` ＋ **11 項機器不可驗證盲區（§16.12）** |
| Prototype | `prototypes/{02,03,04,13,25,26,29,30}-*.html` 就地更新，舊文案全數 `OLD>` 保留 |

### 人類裁決（2026-09-22，不得由 agent 推翻）
A 項 4＝**停業務判定 ＋ 回填既有 `business`→`other`**（判定式/欄位/手動指派選項全保留；前台可見範圍因此**放寬**，已知並接受）
B 項 8＝**新增真正的 `sortOrder` 欄位**（含 migration 與後台維護 UI）
C 項 15＝**新增獨立「制定本部」下拉篩選**
D 項 12＝**節點內小字逐列列出各制定公司計數**
E 項 13＝**依寫權門控**（主管與系統管理員皆不顯示 DAG 畫布）
F 項 16＝匯出欄位＝**TAB2 逐列全欄**（畫面欄位扣掉操作類）
G 項 2＝麵包屑 `ICSOP 管理後台` **不動**（兩個名字並存是刻意的）
H 項 9＝多類別**逐筆全列**、0 筆顯示 `—`
I 項 8＝調序介面**數值輸入框 ＋ 上下移動鈕兩者皆提供**
J 項 16＝匯出維持三項篩選，**文件搜尋不納入**，但須在 toast 明示（`AC-UX55`）

### 四項已核准之推翻
① `prototypes/30` 之 🔒「刻意沒有導向鈕」負向設計 ② F017 `AC-D1`「篩選恰 13 個」＋「僅附加末端」先例 ③ `PublicFilterOptions`「恰五組」契約 ④ `org-path.ts` 之「捨本部層」三級模型原則（本部升格為全站篩選/顯示維度，🔒 **既有三級顯示欄一格未動**）

## 二、Phase B 現況

### P0 建環（`ring-ux16`，對實作全盲）— ✅ 完成並經 lead 獨立實跑複核
建環當下閘門：backend 244 suites（16 紅）/3724 tests（37 紅）；frontend 150 files（17 紅）/2544 tests（75 紅）。零回歸。
新增/改寫測試檔清單見 `docs/test-specs/risks-and-gaps.md` `UX16-01`～`08`。

### P1 實作（四條線）
| 線 | 項次 | 狀態 |
|---|---|---|
| `impl-core` | WS-0 共用接縫 ＋ 4 | ✅ **完成**（四項 DoD 全滿足；`deps:check` 零違規；F044 零漣漪結構性成立） |
| `impl-ojt` | 14,15,16 | 🔵 中斷於進行中 |
| `impl-cat` | 8,12,13 | 🔵 中斷於進行中 |
| `impl-front` | 1,2,3,5,6,7,9,10,11 | 🔵 中斷於進行中 |

**impl-core 已落地之檔案**：`org-directory/org-division.ts`（新）、`dashboard/division-resolver.ts`（定義搬走＋re-export）、`org-directory/org-path.ts`（additive `resolveDepartmentUnit<T>()`）、`org-directory/name-resolution.service.ts`（`listOrgUnitsByCompany()`）、`business-categories/business-category-sort.ts`（新）、`org-sync/role-derivation.ts`、`migrations/1725753600000-account-user-subtype-derived-backfill.ts`（新）。
⚠ migration 時間戳 `1725667200000` **刻意保留**給 `business-category-sort-order`（impl-cat lane），兩支無先後相依。

### 已核准但可能未完成之變更
`frontend/src/api/download-blob.ts` 之 `downloadViaBlob()` 回傳型別擴充（`Promise<void>` → 帶回應標頭），供 OJT 匯出讀 `X-Export-Row-Count`。**擁有權在 `impl-ojt`**。三條件：①筆數與 CSV 出自同一次查詢 ②🔴 標頭缺失**不得回退為畫面列數**（降級文案由 ring 定並補向量）③ 代理白名單**先確認不要新增規則**（`vite.config.ts` 之 `/(download|export|print|pdf)$/` 已涵蓋；`nginx.conf` 有同一規則的第二份需確認）。

## 三、續作進入點（下一個 session 依序做）

1. **重開四條線或直接接手**：`impl-ojt`／`impl-cat`／`impl-front` 未交件。各線 territory 與陷阱清單見本檔 §四。
2. **lead 獨立實跑完整閘門**（🔴 循序、one-shot、禁止並行）：
   `cd backend && npm test && npx tsc --noEmit && npm run deps:check`
   `cd frontend && npm test && npm run typecheck && npx vite build`
3. **commit**（目前 0 commits，90 個變更檔尚未分次提交）
4. **兩支 migration 對 dev 真庫實跑並 SELECT 覆核**（見 §五）
5. **實機覆核清單**（見 §五）

## 四、四條線之 territory（避免撞車）
- `impl-core`：`org-directory/**`、`dashboard/division-resolver.ts`、`business-categories/business-category-sort.ts`、`org-sync/**`、回填 migration ✅已完成
- `impl-ojt`：`backend/src/ojt-progress/**`、`OjtProgressPage.tsx`、`ojt-progress-view.ts`、`api/download-blob.ts`
- `impl-cat`：`backend/src/business-categories/**`（除 `public-business-category-*`）、`business-category.entity.ts`、`1725667200000-business-category-sort-order.ts`、`BusinessCategoryListPage.tsx`、`BusinessCategoryTreePreviewPage.tsx`、`business-category-reorder.ts`
- `impl-front`：`RoleLanding/PublicListPage/PublicCategoryTreePage/PublicDocumentDetailPage/DocumentListPage.tsx`、`domain/menu.ts`、`App.tsx`、`backend/src/public/**`、`backend/src/documents/**`、`business-categories/public-business-category-*.ts`
- 共用且需協調：`frontend/src/api/{endpoints,types}.ts`

## 五、機器證明不了、只能靠實機的事（交付報告必列）
1. 🔴 **回填 migration 必須在下次例行同步前對真庫實跑**，覆核 `SELECT COUNT(*) FROM ACCOUNT WHERE roleSource='derived' AND userSubtype='business'` ＝ `0`。不跑則約 699 筆湧進同一份計畫 ⇒ **門檻整批擋下、一筆不寫，而全部單元測試照樣全綠**。
2. `sortOrder` migration 實跑：`SELECT TOP 20 name, subcategory, sortOrder FROM BUSINESS_CATEGORY ORDER BY sortOrder` — 確認間距 10、且次序與改版前依 `name` 之次序逐筆相同。
3. 項 7 捲軸固定（**jsdom 結構上不可觀測**，環只鎖 class 契約）。
4. 項 12 節點版面（小字逐列後節點變高，是否撞到連線路由）。
5. 項 5 完整導向路徑（抽屜→切分頁→chip 生效→清除 chip）。
6. 四段組織路徑在真實 `parentCode` 鏈上之呈現。
7. 匯出 CSV 以 Excel 開啟之中文與 BOM。
8. §16.12 之 11 項盲區全表。
⚠ Chrome MCP 覆核時分頁**必須在前景**（背景分頁使 screenshot／rAF timeout）。

## 六、本輪抓到的三種測試失效形狀（值得帶去下一輪）
| 形狀 | 錯的是什麼 | 怎麼抓 |
|---|---|---|
| 絕對總數過期 | 斷言的**值** | grep **值的字面**（非函式名） |
| 載體蒸發 | 被斷言的**東西**不見了 | 逐條問「載體還在嗎」 |
| **語料前提被抽掉** | **夾具再也達不到前置條件** | 🔴 **只有跑全套並逐條歸因抓得到**——那 8 條 pipeline 紅的斷言裡沒有任何一處出現關鍵字 |

其餘紀律：規格說「依某欄位排序」必須**指名比較器**（本專案 SQL 筆畫序／`localeCompare`／碼位序**三者互異**）；新造可見字串若是既有字串之**前綴或後綴**一律視為缺陷；`it.skip` 必須帶**可判定的解封條件**；「這條路徑走不到」是關於**上游輸入範圍**的主張、須指出呼叫端。

---

## 七、暫停後陸續回報之增量（session 中斷前最後狀態）

- **backend 全套已降至 244 suites／6 failed、3745 tests／18 failed**，剩下的紅**全部**是 `impl-front` 尚待落地之 F019 富化邏輯（`public-document-detail.service.ux16`／`public-documents.service.ux16`／`public-list.ux16`／`public-list-filter-options.ux16`）。`role-derivation*`／`job-title-directory`／`business-categories`／`ojt-progress`／`documents` 全綠 ⇒ `impl-ojt` 與 `impl-cat` 之後端部分已大致落地（前端狀態未經 lead 複核）。
- 🟢 **§六 之「複合鍵解析無覆蓋」缺口已關閉**：`ring-ux16` 依 lead 指示改為「查有沒有真實載體」，查得 `org-directory/job-title-directory.spec.ts` 才是權威落點，於該檔補上直接斷言（`jobTitleKey('AS','D04') !== jobTitleKey('AD','D04')`），`role-derivation.spec.ts` 之 `it.skip` 案例**直接刪除**（非休眠），只留遷移說明。⇒ 🔒 **紀律修正：一條斷言失去載體時，第一步是「查真正的載體在哪」，`it.skip` 只有在確認全無載體時才是選項。**
- 🟢 **author↔runner 通道往正確方向運作過一次**：`impl-front` 提報 `public-documents.service.ux16.spec.ts` 之 `draftingDivisionId` 值形狀有誤，`ring-ux16` 查證後承認**是自己的測試錯了**（`AC-UX22` 🔒／`AC-UX41` ④ 鎖定 value 為 `${公司代碼}__{本部代碼}` 複合鍵，它誤用裸代碼），已修正 2 行。🔴 **實作者全程未動測試**，不變式維持。
- ⚠ **未經 lead 獨立複核**：上述數字皆為 agent 回報。下次開工**必須自己重跑**（見 §三 第 2 點）。
- 🟢 **§七 之複合鍵處置結果為覆蓋率「淨增」而非淨減**：`impl-core` 實跑確認其 lane 22 suites／**381 passed／0 failed／0 skipped**（原 380／1 skipped）。查證揭露一件事——`job-title-directory.spec.ts` 雖測了 `jobTitleKey`，卻**從來沒有任何一條直接斷言「同代碼跨公司不得互相覆蓋」**；`role-derivation.spec.ts:249` 只是**看起來**在守那個不變式，實際守的是規則 A 的副作用。⇒ 🔴 **第四種失效形狀：一條斷言看起來在守 X，實際守的是 Y 的副作用；X 其實一直裸著，而且在 Y 還在時永遠不會被發現。**
- 🔒 **失去載體之斷言，處置優先序（定案）**：① 先查別處有無真實載體 → 有就**搬過去並刪原案** ② 沒有才討論休眠，且必須記 `risks-and-gaps` ＋ 可判定之解封條件 ③ 🔴 **絕不改寫成恆真斷言**（最誘人，因為機器上全綠）。

---

## 八、2026-09-22 復工（session limit 中斷後）— lead 獨立實跑之真實狀態

🔴 **中斷前 §七 的數字是 agent 回報，實跑後證實偏保守**。復工當下之真實閘門：
- **backend**：244 suites／**2 紅**；3768 tests／**5 紅**（1 skipped）
- **frontend**：2555 tests／**26 紅**

### 逐項實況（以 grep 生產碼＋閘門雙重確認）
| 項次 | 狀態 |
|---|---|
| 4 ＋ WS-0 共用接縫 | ✅ 完成 |
| 1／2／3 分流頁（含 `hasAdminAccess()` 抽出，`App.tsx:77`／`RoleLanding.tsx:49` 已共用） | ✅ 完成 |
| 8／12／13 業務/功能類別 | ✅ 完成 |
| 14／15／16 OJT | ✅ 完成 |
| **5／6／7／9／10／11 前台線** | ❌ **全部未做**（26 條前端紅＋4 條後端紅皆出自此） |

🔴 **項 9 之後端完全未接線**：`public-document-detail.service.ts` 內 `businessCategories`／`categories` **零命中**，DTO 回 `undefined`。

### 復工編制（由 4 個 agent 降為 2 個，降低再次撞上限之風險）
- `ring-ux16b`（接手建環者／唯一測試作者）
- `impl-front2`（接手前台線：項 5/6/7/9/10/11）

### 已處理
- 🟢 **`public-list.ux16.spec.ts:76` 之「縱深防禦」斷言不可滿足**——lead 查證屬實（`viewerOf()` 給 `userSubtype:'other'` ⇒ `isDeptScopedViewer` 為 false ⇒ 該文件本來就可見）。`ring-ux16b` 已加 `businessViewerOf()` 僅用於該案修正，並以**合成的「信任子樹集合、跳過可見性」錯誤實作**證明該斷言有牙齒（正確版 0 筆／側門版 1 筆）。其餘三案維持非限縮 viewer。
- 🟢 **`AC-UX55` 匯出標頭降級**（lead 核准之設計，晚於 AC 定稿）：`ring-ux16b` 補 4 條向量（缺失 `null`／不可解析 `NaN`／降級文案內部詞彙掃描＋正向探針／🔴 **`count:0` 與降級互斥**，防 `if (!count)` 把真實 0 筆誤判為 falsy）。降級文案逐字＝`已匯出 OJT 進度清單（CSV，UTF-8 BOM）；系統暫時無法確認筆數，請以下載檔案為準。` 記於 `risks-and-gaps.md` `UX16-09`，**未改 AC 本文**。

### 🔴 換手才會出現的風險形狀（本輪首見，值得帶走）
**建環者補了新約束，但對應的實作者已陣亡 ⇒ 新紅燈落在一片無主領地上。** 沒人盯的話它會一路活到最後閘門，然後看起來像「實作沒做完」，而不是「沒有人被指派」。
⇒ 🔒 **團隊換手時，除了盤點「誰還沒做完」，還要盤點「哪些新增的約束沒有對應的擁有者」。**
本輪處置：`OjtProgressPage.ux16.test.tsx` 之 2 條新紅（匯出降級分支，含 `endpoints.ts` 之 `{count: number|null}` additive 擴充與 toast 降級）已**登記給 `impl-front2` 於主線交件後承接**，領地例外僅限那兩個檔案。
