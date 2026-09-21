# F044: 後台首頁儀表板改版（統計卡／環圖／最新公告／類別分布）
Priority: P1 | Status: 🟢 **APPROVED（2026-09-21 人類閘門通過）**——`OQ-D44-01`～`OQ-D44-30` **30 題全數結案**、`OQ-D44-31`～`OQ-D44-34` **4 題結案**（兩項 BLOCKING 解除）、`ARCH-G0`～`ARCH-G6` **7 項架構裁定全數回填**、`[ASSUMPTION]` `A-G1`～`A-G6` **6 項全數結案**（含 `A-G3` 經人類閘門核准）；`AC-G1`～`AC-G93` 共 **93 條**；**已核准進入建環（test-generator）** | Last Updated: 2026-09-21
Epic/Story: E13 / [US-109](../../stories/epics/E13-admin-dashboard/US-109-dashboard-kpi-cards.md)（四張統計卡）＋[US-110](../../stories/epics/E13-admin-dashboard/US-110-remove-quick-access.md)（移除快速進入功能區）＋[US-111](../../stories/epics/E13-admin-dashboard/US-111-announced-donut-charts.md)（雙環圖）＋[US-112](../../stories/epics/E13-admin-dashboard/US-112-latest-announcements-list.md)（最新公告清單）＋[US-113](../../stories/epics/E13-admin-dashboard/US-113-category-distribution-bar.md)（類別分布長條圖）

> **AC 編號規則**：本批一律採 **`AC-G#`**（G＝dashboard analytics 批，2026-09-21），`AC-G1`～**`AC-G93`**。
> 📝 **2026-09-21 第二輪（system-architect 交件）**：`AC-G85`～`AC-G89` 為 [architecture-spec 第 15 章](../architecture-spec.md#ch15-f044) 裁定回填之補充 AC（見 [§癸二](#arch-backfill)）；`AC-G3`／`AC-G8`／`AC-G14`／`AC-G15`／`AC-G19`／`AC-G23`／`AC-G66`／`AC-G75` 與 [§癸 (b)](#corpus) 為就地修訂。
> 📝 **2026-09-21 第六輪（人類裁決第二輪：實作理由退出畫面）**：新增 **`AC-G94`／`AC-G95`** 與 [§癸四](#rationale-out)（含 🔴 **`LESSON-G2`**）；`AC-G15`／`AC-G29`／`AC-G38`／`AC-G40`／`AC-G57`／`AC-G68` 各加一條指標，DOM 契約＋2 列（ⓘ 觸發器／內容）、命名鎖定＋1 列。🔒 **`AC-G71` 不放寬：改的是理由的位置，不是數字的位置。**
> 📝 **2026-09-21 第四輪（ui-ux-designer 接收端 prototype 25）**：新增 **`AC-G91`～`AC-G93`**（`取消排序` chip｜以文件分組不生效｜原型↔正式站次序分歧鎖）與 [§癸 (h)](#corpus)／[(i)](#corpus)；`AC-G20` 之段內次序措辭已由 `orgName 昇冪` 改為「該頁原本之次序」（🔴 不寫死排序鍵）。
> 📝 **2026-09-21 第三輪（ui-ux-designer 交件）**：新增 **`AC-G90`**（前端套用 `defaultDimension`）；`AC-G24`／`AC-G42`／`AC-G43`／`AC-G64`／`AC-G65`、[DOM 契約表](#dom-contract)（＋2 列）、[命名鎖定](#naming-lock)（第 4／11／16 列升 🔒，＋第 16b 列）與 [§癸 (d)](#corpus) 為就地修訂。<br>🔴 **其中 `AC-G42`／`AC-G43` 為「載體失效」修正**：一個架構決策（把判定搬到後端）使它們的 prototype 載體**在無人察覺下蒸發**——條文一字未變、測試也沒翻紅，只是沒有任何東西再驗它們了。
> 🔒 **全部修訂之原措辭一律逐字保留於各自原處**。
> 🟢 **已 grep 全 repo 確認 `AC-G` 未被使用**（`docs/`／`backend/`／`frontend/`／`prototypes/` 全域零命中），與既有 `AC-B#`／`AC-C#`／`AC-D#`／`AC-E#`／`AC-F#`／`AC-J#`／`AC-M#`／`AC-N#`／`AC-P#`／`AC-RD#`／`AC-S#`／`AC-T#`／`AC-U#`／`AC-X#`／`AC-Y#` 批次區隔、不重號。
> 🔴 **明文禁止**續編 `AC-N83` 以後（2026-08-20 D9 批保留區間）、`AC-J27` 以後（E11 OJT 批保留區間）、`AC-B30` 以後（E12 類別批保留區間）。

> 🔴 **核准前置警語（核准的是「規格與 prototype」，不是任何已完成的實作）**
> 本檔之 `🟢 APPROVED` 表示**規格內容與 prototype 獲人類閘門核准、可以開工**；它**不表示**任何測試或程式碼已經存在。
> 🔴 **截至 2026-09-21，F044 之測試與程式碼尚未寫一行**——下一棒是 test-generator（建環），再下一棒才是 tdd-implementation。
> ⚠ 本檔滿頁 🟢 指的是「這一題已裁決」，**不是「這一項已上線」**。🔒 **不得以本檔之核准狀態作為「功能已完成」之依據**（比照 [F043](F043-business-function-category.md) 檔頭之同型警語）。
> ⇒ **驗收条件仍然是**：① 環建起來且先全紅；② 實作後兩端單元測試全綠**且既有測試期望值未經修改**（[§庚](#regression-lock)）；③ [architecture-spec §15.10](../architecture-spec.md#ch15-blindspots) 之 **12 項盲區**逐項實機覆核（🔴 其中 #8 `副本部長`／`副總經理` **永遠無法覆核，交付報告中不得列為「已驗證」**）。

> 🔴 **本輪之約束環為簡化環：只有 vitest（前端）／jest（後端）。沒有 Playwright e2e、沒有 fidelity 測試、沒有 mutation testing、沒有 dependency-cruiser 以外之 metric gate。**
> ⇒ **凡「只能用眼睛看」之需求，在本輪等於沒有防線。** 本檔之每一條 AC 都已降轉為「可由 RTL（`getByRole`／`getByTestId`／`textContent`）或純函式斷言」之形狀，並在 [§癸](#corpus) 明文列出建環語料之鑑別力要求。
> 🔴 **凡未指名載體之需求，在本輪不可驗證、等於零。** 本檔之 DOM 契約（[§子](#dom-contract)）為 🔒 鎖定值，下游不得自行更名。

> 🔴 **本功能不新增任何資料表、不新增任何欄位、不需要任何 migration。**
> 全部統計皆由既有實體（`ICSOP_DOCUMENT`／`ORG_UNIT`／`JOB_POSITION`／`ACCOUNT`／`OJT_SESSION`／`DOC_USING_DEPT`／`BUSINESS_CATEGORY*`）之唯讀聚合導出（`AC-G74`）。[data-model](../data-model.md) **本輪一列未改**——理由見 [§壬](#for-architect) 之「為何 data-model 不動」。

---

## 需求來源（使用者原文，2026-09-21，逐字保留、不得改寫其意）

> 「用 /tdd claude team 模式 + 簡化 test-generator(只做 vitest / jest) 完成 admin-shell 後台首頁調整：
> 1. 上方統計資訊重新調整為4個項目-已公告、進度中、本月新版公告、OJT 準時完成率(1個月內)。分別統計：已公告的 ICSOP 文件數量、進度中(公告日期未到)的 ICSOP 文件數量(比照 ICSOP 文件管理)、當月有公布新版本(含新增文件與舊文件新增版本)的 ICSOP 文件數量、近 1 個月應完成 OJT 的單位數 / 已完成 OJT 的單位數比率，顯示實際單位數量與比率、對於具有 OJT 管理權限的角色，提供"查看明細"的連結，可進入 OJT 進度管理功能-OJT 資料清單頁籤，並將未全部完成 OJT 的單位排在上方。
> 2. 取消快速進入功能區(因功能與左邊側邊選單重複)。
> 3. 快速進入功能區以2個圖表區塊、1個清單區塊取代：(1) 圖表-當月已公告：提供圓餅(環)圖統計 ICSOP 當月已公告文件數量、提供切換頁籤(依制定公司(董事長、總經理預設)、依制定本部(本部長、副本部長預設，須標示所屬公司)、依制定部門(部長與其他預設，須標示所屬公司與本部))、圖說(顏色 - 文字說明：當月公告數量、進度中的數量)、(2) 圖表-累積已公告：同 (1)，但提供不限時間的累積數量 (3) 清單區塊-最新公告(ICSOP 版本更新)：以公告日、版次、程序書書名、狀態欄位，提供最新公告的 ICSOP 文件清單，依公告日降冪排序。對於具有 ICSOP 文件管理權限的角色，提供"查看更多"的連結，可進入 ICSOP 文件管理功能，並依照公告日期降冪排序。
> 4. 最下方新增雙色長條圖表-依業務/功能類別分布：雙色分別為已公告與進度中，呈現"業務/功能類別"中，每一個業務/功能類別掛載文件已公告與進度中文件的數量。」

📌 原文第 1 句之「/tdd claude team 模式 + 簡化 test-generator」為**開發流程指示**，非產品需求，不予轉寫（但其後果已落 [§癸](#corpus)）。

---

## 🔴 人類裁決（2026-09-21，權威，不得再翻案） {#human-decisions}

> 逐題之完整敘述、選項、代價與建議依據，其單一真相來源＝[stories/F044-admin-dashboard-analytics.md §Open Questions](../../stories/F044-admin-dashboard-analytics.md)。本表為裁決結果之權威紀錄，**不得與該檔分歧**；若分歧，以本表為準並回報。

| OQ | 裁決 | 落點 |
|---|---|---|
| `OQ-D44-01` | **甲**：`本月新版公告` ＝ `announcedDate` 落在**當月**；子題 ＝ **只算已公告**（`announcedDate ≤ 今日`）。🔴 該卡數字與 FR-3 (1) 環圖各段總和**恆等**（回歸鎖） | `AC-G4`／`AC-G5`／`AC-G6` |
| `OQ-D44-02` | **甲**：重用既有 `pendingPublish` provider，**明文禁止**另寫第二份「進度中」定義 | `AC-G3` |
| `OQ-D44-03` | **甲**：新 4 張卡**完全取代**舊 5 張 KPI 待辦卡 | `AC-G1` |
| `OQ-D44-04` | **甲**：`GET /admin/dashboard/summary` 之既有 5 個計數鍵**保留不動**（additive） | `AC-G75` |
| `OQ-D44-05` | 「最近活動」區塊**保留、一字不動** | `AC-G22` |
| `OQ-D44-06` | **甲**：前 3 張卡四種後台角色皆顯示 | `AC-G16` |
| `OQ-D44-07` | **甲**：第 4 張 OJT 卡**僅** ICSOPAdmin／SysAdmin 顯示，與既有 `canViewDashboard` 對齊；**2026-09-02 之裁決不被推翻** | `AC-G17`／`AC-G80` |
| `OQ-D44-08` | **甲**：`rate = 已完成 ÷ 應完成`；卡面 `已完成 X / 應完成 Y（Z%）`；分母為 0 時**省略比率**並顯示明確空狀態（🔴 明文禁止 `NaN%`／`0%`／`100%`） | `AC-G13`／`AC-G14` |
| `OQ-D44-09` | **甲**：母體＝應完成日（公告日＋1 個月）落在 `[今日 − 1 個月, 今日]`；**已明確接受**「母體可能非常小甚至為 0、卡片長期空狀態」之代價 | `AC-G7`／`AC-G8` |
| `OQ-D44-10` | **甲**：**不引入**第二種完成判定；完成判定沿用 [F042](F042-ojt-progress-management.md) `AC-03`（版次相符之場次存在即完成）；「準時」由時間窗口承載 | `AC-G11` |
| `OQ-D44-11` | **乙**：分母＝**相異使用單位數**（`(companyCode, orgCode)`）；「已完成」＝該單位在窗口內**全部**應完成文件皆已完成 | `AC-G9`／`AC-G10` |
| `OQ-D44-12` | a 沿用 [F042](F042-ojt-progress-management.md) 排除規則／b 公告日為 `null` 者完全不進母體／c 接受卡片數字與 TAB2 列數可不同，**卡片須提供排除註記**（比照 F042 `AC-28`⑭） | `AC-G12`／`AC-G15` |
| `OQ-D44-13` | **甲**：`查看明細` 走 **URL 參數** deep link | `AC-G19` |
| `OQ-D44-14` | **甲**：**排序**（非篩選）、作用於 TAB2「以使用單位分組」之群組、**deep link 專屬**、未帶參數時 TAB2 行為一格不動；排序位置 ＝ **客端** | `AC-G20`／`AC-G21`／`AC-G79` |
| `OQ-D44-15` | 採建議（移除快速進入功能區之漣漪清單照 analyst 查證結果；**不作廢任何既有編號 AC**） | `AC-G23`／`AC-G24`／[§辛](#affected-files) |
| `OQ-D44-16` | 採建議釐清：環之每段＝一個組織；圖例每列＝色塊＋組織名＋兩個數字；段數 ＝ **Top N ＋ `其他` 合併段**（N 交 ui-ux-designer），圖例保留完整可捲動列表 | `AC-G26`／`AC-G35`／`AC-G38`／`AC-G39` |
| `OQ-D44-17` | **甲**：兩區塊之「進度中」同值，接受 | `AC-G36` |
| `OQ-D44-18` | **甲**：制定組織無法解析者歸入逐字 `未指定` 獨立分段（**禁止排除**） | `AC-G32`／`AC-G34` |
| `OQ-D44-19` | 採建議：本部＝沿 `parentCode` 上溯第一個 `tier='DIVISION'`；找不到歸 `未指定`／`無本部` 段，**禁止排除**；圖例文字 `公司簡稱 / 本部名`、部門維度 `公司簡稱 / 本部名 / 部名`；**必須沿用既有 `orgUnitDisplayName` 與 `ORG_PATH_SEPARATOR`，禁止另寫第二套組裝** | `AC-G29`／`AC-G30`／`AC-G31`／`AC-G33` |
| `OQ-D44-20` | a 先以 `(companyCode, jobPositionCode)` 解析 `JOB_POSITION.name`（**禁跨公司 fallback**、**禁以 `code` 直接比對**），再以 name 白名單比對／b 白名單**逐字保留 `副本部長`**／c **可手動切換**／d **不記憶** | `AC-G40`／`AC-G41`／`AC-G42` |
| `OQ-D44-21` | **甲**：四種後台角色看到的是**全公司全量**，後台不引入可見範圍過濾 | `AC-G45` |
| `OQ-D44-22` | 採建議：10 筆／狀態欄＝衍生顯示狀態／母體含進度中（`status='active'`）／`announcedDate` 為 null 排除／版次 null ＝ `未設版次` | `AC-G49`～`AC-G54` |
| `OQ-D44-23` | **甲**：`查看更多` 導向文件管理並**帶公告日降冪排序參數**；不帶狀態篩選；客端／後端對 null 排序之既有落差**本輪不動** | `AC-G56`／`AC-G57` |
| `OQ-D44-24` | 統計單位＝**類別**；同一份文件在同一類別內**只計一次**（相異 `documentId`） | `AC-G59`／`AC-G60` |
| `OQ-D44-25` | 採建議：停用類別不顯示／零掛載不顯示／依總數降冪＋穩定次序／Top 10 ＋ 可展開全部 | `AC-G62`～`AC-G65` |
| `OQ-D44-26` | 僅 `status='active'`，分 `已公告`／`進度中` 兩色；`inactive`／`void` **完全不計入** | `AC-G61` |
| `OQ-D44-27` | **甲**：本區塊之可見性閘門**直接讀功能矩陣、禁止寫成角色清單**（比照 `canSeeLifecycleDimension` 之既有紀律） | `AC-G66` |
| `OQ-D44-28` | **甲**：沿用全站 **UTC** 基準，不另立一套 | `AC-G69` |
| `OQ-D44-29` | **甲**：**自繪 SVG**，不引入第三方圖表庫 | `AC-G46` |
| `OQ-D44-30` | a **交 system-architect 裁定**（analyst 傾向「獨立端點」為建議）／b 不做快取／c 不寫稽核 | [§壬](#for-architect)／`AC-G73` |

---

## 本規格鎖定之命名與逐字文案 {#naming-lock}

> 🔒 ＝下游程式碼與測試**逐字**使用，不得同義改寫；🔵 ＝建議值，ui-ux-designer 可調整但須回填本表。

| # | 用途 | 逐字值 | 狀態 | 依據 |
|---|---|---|---|---|
| 1 | 卡片標題（恰 4，順序固定） | `已公告`／`進度中`／`本月新版公告`／`OJT 準時完成率` | 🔒 **鎖定** | 使用者原文逐字 |
| 2 | 第 4 張卡之期間補述 | `(1個月內)` | 🔒 **鎖定** | 使用者原文逐字（**半形括號、無空白**） |
| 3 | 第 4 張卡之數值（🔴 2026-09-21 第七輪拆為**兩個節點**） | 環中央 **`{Z}%`**；環旁 **`已完成 {X} / 應完成 {Y}`** | 🔒 **鎖定** | `OQ-D44-08` ＋ 2026-09-21 第七輪人類裁決（`AC-G13`／`AC-G97`）。`/` 兩側各一半形空格；`%` 半形；🔴 **不再含全形括號**。<br>📝 `OLD>` 原為單一字串 `已完成 {X} / 應完成 {Y}（{Z}%）`（全形括號）——使用者要求改成環圖後，該單一字串已不存在；🔒 **惟「顯示實際單位數量與比率」這個要求未變**，兩個數字都還在 |
| 4 | 第 4 張卡之分母為 0 空狀態 | `近 1 個月內無應完成之 OJT 單位` | 🔒 **鎖定（2026-09-21 ui-ux-designer 落地，🔵 → 🔒）** | `OQ-D44-08`；🔴 **禁止** `NaN%`／`0%`／`100%`／空白 ⇒ `[ASSUMPTION] A-G4` 結案 |
| 5 | OJT 明細連結 | `查看明細` | 🔒 **鎖定** | 使用者原文逐字 |
| 6 | 環圖區塊標題（恰 2） | `當月已公告`／`累積已公告` | 🔒 **鎖定** | 使用者原文逐字 |
| 7 | 環圖維度頁籤（恰 3，順序固定） | `依制定公司`／`依制定本部`／`依制定部門` | 🔒 **鎖定** | 使用者原文逐字 |
| 8 | 圖例數字之前綴（恰 2） | `已公告`／`進度中` | 🔒 **鎖定** | 🔴 **刻意採 `DISPLAY_LABEL` 之逐字值，而非使用者原文之「公告數量」**——同一畫面上「已公告」已是四處共用之狀態詞，若圖例另用「公告」，使用者會問這兩者差在哪。⚠ 此為本檔**唯一**一處未逐字沿用使用者措辭之文案。🟢 **2026-09-21 人類閘門核准＝接受**（`A-G3` 結案）——已原樣呈報給使用者、由使用者直接選定，**非下游自行推定** |
| 9 | 制定組織無法解析之分段 | `未指定` | 🔒 **鎖定** | `OQ-D44-18` 甲 |
| 10 | 有制定部門但無 `DIVISION` 祖先之分段 | `無本部` | 🔒 **鎖定** | `OQ-D44-19`；🔴 **與第 9 列刻意分為兩段**，理由見 `AC-G33` |
| 11 | Top N 之合併段（僅存於**圖形**） | `其他` | 🔒 **鎖定** | `OQ-D44-16`。🟢 **N 已由 ui-ux-designer 定案＝`DONUT_TOP_N = 8`**（2026-09-21，理由載於 prototype）⇒ `[ASSUMPTION] A-G6` 結案 |
| 12 | 最新公告區塊標題 | `最新公告（ICSOP 版本更新）` | 🔒 **鎖定** | 使用者原文（**全形括號**，比照全站標題慣例） |
| 13 | 最新公告欄名（恰 4，順序固定） | `公告日`／`版次`／`程序書書名`／`狀態` | 🔒 **鎖定** | 使用者原文逐字 |
| 14 | 文件管理連結 | `查看更多` | 🔒 **鎖定** | 使用者原文逐字 |
| 15 | 類別長條圖區塊標題 | `依業務/功能類別分布` | 🔒 **鎖定** | 使用者原文；`業務/功能類別` 為 [F043](F043-business-function-category.md) 鎖定字串（**半形斜線、前後無空白**） |
| 16 | 類別長條圖之**展開**入口（僅存於未展開態） | **`顯示全部類別`** | 🔒 **鎖定（2026-09-21 ui-ux-designer 回填，🔵 → 🔒）** | `OQ-D44-25` d｜`AC-G65` ⇒ `[ASSUMPTION] A-G5` 結案 |
| 16b | 類別長條圖之**收合**入口（僅存於已展開態） | **`僅顯示前 {CATEGORY_LIMIT} 類`**（現值＝`僅顯示前 10 類`） | 🔒 **鎖定（2026-09-21 新增）** | `AC-G65`。🔴 **與上列「互斥存在」**（條件渲染，禁用 `hidden`／`display:none` 切換）——這是使存在性斷言具鑑別力的唯一方式。⚠ 測試須由 `CATEGORY_LIMIT` 推導該字串，不得寫死字面 |
| 17前 | ⓘ 說明觸發器之無障礙名稱 | **`說明`** | 🔒 **鎖定（2026-09-21 人類裁決第二輪）** | `AC-G95`。🔴 全頁多個 ⓘ 共用同一個 `aria-label` ⇒ **斷言必須先限定容器或以 `data-info-for` 區辨**，明文禁止全域 `getByRole('button', { name: '說明' })`（比照 [F043](F043-business-function-category.md) 對重用字串之既有紀律） |
| 17 | 版次無值 | `未設版次` | 🔒 **沿用既有** | [F042](F042-ojt-progress-management.md) `EDITION_NONE_TEXT`；🔴 **禁止新增第二個常數** |
| 18 | 狀態欄之值 | `已公告`／`進度中`／`失效`／`作廢` | 🔒 **沿用既有** | `backend/src/documents/display-status.ts` 之 `DISPLAY_LABEL` |
| 19 | 組織路徑分隔符 | ` / `（前後各一半形空格） | 🔒 **沿用既有** | `ORG_PATH_SEPARATOR`；🔴 **禁止寫死第二份** |
| 20 | deep link 參數（OJT） | `tab=sessions`／`sort=incomplete-first` | 🔒 **鎖定（2026-09-21 `ARCH-G4` 定案，🔵 → 🔒）** | `OQ-D44-13`／`14`。🔒 `tab` 之值域逐字取自既有 `type TabKey = 'dashboard' \| 'sessions'`（`OjtProgressPage.tsx`），**不另造 `tab=list`／`tab=2` 之第二套詞彙**；`sort` 之值域恰一值 `incomplete-first`。🔴 **命名為 `sort` 而非 `sortBy`／`sortDir`**——後者是 [F017](F017-backend-document-list.md) 文件清單之「欄位＋方向」詞彙（第 21 列），OJT 這個不是欄位也沒有方向，它是一個**具名排序模式**；沿用 `sortBy` 會邀請下一個人補上 `sortDir=asc`，然後這裡就有了第三套排序詞彙。詳見 `AC-G88` |
| 20b | 端點路徑（恰 3 個新端點） | `GET /admin/dashboard/analytics`／`GET /admin/dashboard/category-distribution`／`GET /admin/ojt-progress/ontime-summary` | 🔒 **鎖定（2026-09-21 `ARCH-G3` 定案）** | 見 `AC-G86`。🔒 三者皆在既有 `/admin` 前綴下 ⇒ `vite.config.ts`／`nginx.conf` 之代理白名單**零修改**，`proxy-coverage.test.ts` 不受影響 |
| 21 | deep link 參數（文件清單） | `sortBy=announcedDate`／`sortDir=desc` | 🔒 **鎖定** | 🔴 **必須與既有前端 `SortBy` 型別之值域（`documentNumber`／`announcedDate`）與 `sortDir`（`asc`／`desc`）逐字相同**，否則會出現第二套排序詞彙 |
| 22 | 程式碼識別子 | `dashboardAnalytics`／`orgDimension`／`donut`／`categoryDistribution` | 🔵 建議 | 🔴 **明文禁止** `chart`（裸）／`pie`（本功能是**環**圖）／`kpi`（既有 5 張卡已佔用該詞） |

---

## 已查證之既有事實（spec-writer 自行查證，2026-09-21） {#verified-facts}

> 🔵 以下每一條都對應實際檔案；**凡與上游 analyst 敘述不同者已標 ⚠ 並註明更正**。

| # | 事實 | 出處 |
|---|---|---|
| 1 | `deriveDisplayStatus(status, announcedDate, today)`：`inactive`／`void` 照原樣；`active` 且 `announcedDate` 為 null → `in_progress`；`active` 且 `announcedDate ≤ today` → `announced`；否則 `in_progress`。`DISPLAY_LABEL` 之四值為 `已公告`／`進度中`／`失效`／`作廢` | `backend/src/documents/display-status.ts` |
| 2 | `DashboardCounts` 恰 5 鍵（`pendingOrgChanges`／`unassignedDocs`／`disabledAccounts`／`accessLast7Days`／`pendingPublish`）；`DashboardSummaryService.safe()` 將任一 provider 之例外與非有限值收斂為 `0` | `backend/src/dashboard/dashboard-summary.service.ts` |
| 3 | `pendingPublish` 之真實查詢＝`status='active'` AND (`announcedDate IS NULL` OR `announcedDate > now`)（TypeORM `where` 陣列＝OR） | `backend/src/dashboard/dashboard-counts.ts` |
| 4 | 首頁現況＝`PageHeader` ＋ 歡迎區 ＋ **5 張 KPI 卡**（`KPI_CARDS`，逐張 `roles` 白名單，容器 `role="group" aria-label="待辦提示"`）＋ `快速進入功能區` 標題與卡片格線（`CARD_DESC`／`visibleMenu`／`accessLabelFor`）＋ `最近活動`（`role="list" aria-label="最近活動"`） | `frontend/src/pages/DashboardHome.tsx` |
| 5 | `ORG_PATH_SEPARATOR = ' / '`（已 export）；`orgUnitDisplayName(unit, lookupDepartment)` 為 `制定部門`／`制定室別` 兩欄之單一顯示名算法（2026-09-04 定案 A+） | `backend/src/org-directory/org-path.ts` |
| 6 | 公司簡稱＝`resolveCompanyShortName(companyCode)`；OJT 之 `公司簡稱 / 部 / 處室` 單一組裝點為 `typeorm-ojt-org-directory.ts`，其作法即 `[公司簡稱, orgPath].join(ORG_PATH_SEPARATOR)` | `backend/src/org-directory/company-name.ts`、`backend/src/ojt-progress/typeorm-ojt-org-directory.ts:108-110` |
| 7 | `buildJobPositionResolver(records)` ⇒ `(companyCode, code) => name \| null`：**單段精確解析，公司缺失即 `null`，明文無跨公司 fallback**。實查歧義碼：`B01` AS/AE＝`本部長`、AD＝`本處長`；`B03` AS/AE＝`部長`、AD＝`處長`；`C04` AS/AE＝`處長`、AD＝`部長`；`D04` AS＝`營業經理`、AD＝`科長` | `backend/src/org-directory/job-position-directory.ts`、`docs/specs/upstream-hr-source-contract.md` §5.4.2 |
| 8 | ⚠ **`副本部長` 不存在於上游已記錄之 `VW_JOB_FUN` 名稱清單**（正式環境四家共 75 列，其中 17 列無人使用）；全 repo grep `副本部` 零命中。已記錄之冷僻值含 `代理科長`／`處長代行`／`營業副理(消)`／`借調主管職`，**未見** `副總經理` | `docs/specs/upstream-hr-source-contract.md:321,405` |
| 9 | 🔴 **`SessionUser`（`GET /auth/me` 之回傳）不含 `jobPositionCode`，亦不含職位名**——恰含 `loginId`／`email`／`companyCode`／`roleCode`／`orgCode`／`name`／`employeeNo`／`userSubtype`（`SessionGuard` 每請求以 DB 現行值覆寫 `orgCode`／`name`／`employeeNo`／`accountId`／`userSubtype`）。⚠ **analyst 未指出此缺口**：`ACCOUNT.jobPositionCode` 欄位確實存在，但**前端拿不到它** ⇒ 預設頁籤判定之輸入在前端無載體。🟢 **2026-09-21 `ARCH-G2` 已裁定＝乙案**——端點直接回 `defaultDimension`，**`SessionUser` 一欄未加**，判定鏈全在後端（`AC-G87`）⇒ `OQ-D44-31` 結案 | `backend/src/auth/session-token.service.ts`、`backend/src/auth/session.guard.ts:56-66`、`frontend/src/api/types.ts:12-22`、`backend/src/database/entities/account.entity.ts:95` |
| 10 | `serverToday(now) = now.toISOString().slice(0,10)`（**UTC**）；行程時區已於 Dockerfile／compose／jest 釘死 UTC。前端對應點＝`todayIsoDate(now)` | `backend/src/ojt-progress/ojt-progress.service.ts:247`、`frontend/src/pages/ojt-progress-view.ts:235` |
| 11 | 🔴 **`trainingDueDate(announcedDate)`（公告日＋1 個月，月底溢位夾回當月最後一日、一律 UTC 拆解）目前只存在於前端**；F042 檔內明文稱其為「全站唯一之推導點」，後端刻意只送 `announcedDate` 原料。⇒ 若 OJT 卡之聚合落在後端，「＋1 個月」就會出現**第二個定義點**——這正是該註解要避免的形狀。處置見 `AC-G8` 與 `ARCH-G1` | `frontend/src/pages/ojt-progress-view.ts:658-670` |
| 12 | F042 `coverage`：`denominator` ＝**進度列**（`documentId × orgCode`）數、排除裁撤單位（`isActive=false`）與孤兒；`denominator === 0` 時**省略 `rate` 鍵**；排除註記之既有純函式＝`exclusionNote(numerator, denominator, inactiveCount, orphanedCount)` | `backend/src/ojt-progress/ojt-progress.service.ts:661-672`、`frontend/src/pages/ojt-progress-view.ts:199-221` |
| 13 | `canViewDashboard(roleCode)` ＝ `ICSOPAdmin ∣ SysAdmin`（2026-09-02 人類裁決）；其註解逐字：「此處隱藏的是一個**對他們沒有用處的分頁**，不是一道防線」 | `frontend/src/pages/ojt-progress-view.ts:633-635` |
| 14 | TAB2 逐字＝`OJT 資料清單`（`TAB_SESSIONS_TEXT`）；分組模式恰二態 `以使用單位分組`（預設）／`以文件分組`；`listRows` 之伺服端排序恆為 `orgName.localeCompare` → `documentNumber.localeCompare`，**無排序參數** | `frontend/src/pages/ojt-progress-view.ts:12,490-491`、`backend/src/ojt-progress/ojt-progress.service.ts:606-608` |
| 15 | 🔴 **`OjtProgressPage.tsx` 完全沒有 `useSearchParams`**；`tab` 為 `useState<TabKey>(mayViewDashboard ? 'dashboard' : 'sessions')`，既有「導向 TAB2」入口（`:479 setTab('sessions')`）為同頁 React state | `frontend/src/pages/OjtProgressPage.tsx:179,479` |
| 16 | 🔴 **`DocumentListPage` 之 `sortBy`／`sortDir` 為純前端 `useState('')`／`useState('asc')`，不讀 URL、不送後端**；客端排序對 null 之處置為 `?? ''`。`type SortBy = '' \| 'documentNumber' \| 'announcedDate'`。同頁已有兩組 deep link 先例（`readSubtreeParams`／`readBcSubtreeParams`），皆以「恰成對之兩參數、任一缺席即視為未套用」為紀律 | `frontend/src/pages/DocumentListPage.tsx:181,384-385,259-297,750-757` |
| 17 | 後端 `applyDocumentQuery` 支援 `sortBy='announcedDate'`＋`sortDir`，且 **`null` 一律排最後、不受方向影響**——與前端客端排序之 `?? ''` 語意**不同**（既有落差） | `backend/src/documents/document-list-query.ts:96-110` |
| 18 | `FunctionKey` 常數恰 **15** 鍵（spec-writer 實數：`ACCOUNT_MANAGEMENT`／`ROLE_ASSIGNMENT`／`LIFECYCLE_MANAGEMENT`／`ICSOP_DOCUMENT_MANAGEMENT`／`USAGE_FORM_MANAGEMENT`／`APPENDIX_MANAGEMENT`／`OJT_PROGRESS_MANAGEMENT`／`BUSINESS_CATEGORY_MANAGEMENT`／`DOCUMENT_INDEX_MANAGEMENT`／`DOCUMENT_ACCESS_HISTORY`／`DOCUMENT_CHANGE_HISTORY`／`ORG_SYNC_MANAGEMENT`／`PUBLIC_BROWSING`／`DOCUMENT_DOWNLOAD_PRINT`／`SYSTEM_PARAMETER`）；`ICSOP_DOCUMENT_MANAGEMENT` ＝ `row('READ','CRUD','READ','READ','NONE')`；`BUSINESS_CATEGORY_MANAGEMENT` ＝ `row('READ','CRUD','READ','NONE','NONE')`（**部門窗口為 `NONE`**）；`OJT_PROGRESS_MANAGEMENT` 對主管／部門窗口為 `RESTRICTED_CRUD` | `backend/src/rbac/function-matrix.ts:132,145,161` |
| 19 | `canSeeLifecycleDimension = canPerform(role, FunctionKey.LIFECYCLE_MANAGEMENT, 'read')`——**讀矩陣、不列角色**，且以「過濾整個定義陣列」達成，使桌面與行動兩處同時生效 | `frontend/src/pages/DocumentListPage.tsx:333,784-789` |
| 20 | 類別層「掛載文件數」之既有口徑＝**去重後之相異文件數**，以 `COUNT(DISTINCT d.[documentId])` **下推 SQL**（非 JS 去重）；類別層文件集合必經 `BUSINESS_CATEGORY_DOC` → `BUSINESS_CATEGORY_NODE` join（決策 E9 刻意不放冗餘 `businessCategoryId` 欄） | [F043](F043-business-function-category.md) `AC-01` 第 3 點、`backend/src/business-categories/typeorm-business-category.store.ts:101-130` |
| 21 | 🟢 **`快速進入功能區` 於 `docs/specs/features/` 全域零命中**（spec-writer 覆核；全 repo 僅命中 `prototypes/07-admin-shell.html`／`DashboardHome.tsx`／`DashboardHome.test.tsx`／`docs/ui-ux-design-overview.md`／`docs/implementation-logs/frontend-foundation.md`／`docs/specs/prototype-alignment/browser-smoke-findings.md`／E13 story 三檔）⇒ **移除它不作廢任何一條既有編號 AC** | 全 repo grep |
| 22 | 🟢 `accessLabelFor` 之 `受限CRUD` 分支在側欄 `AppShell.tsx:107` 另有載體，且 `menu.test.ts:141` 直接測該純函式 ⇒ 移除儀表板卡片**不會**使 [F042](F042-ojt-progress-management.md) `AC-28`⑮ 失去載體 | `frontend/src/components/AppShell.tsx`、`frontend/src/domain/menu.test.ts` |
| 23 | 🔴 **前端無任何圖表函式庫**：`frontend/package.json` dependencies 僅 `@dagrejs/dagre`／`@xyflow/react`／`lucide-react`／`pdfjs-dist`／`react`／`react-dom`／`react-router-dom` | `frontend/package.json` |
| 24 | `data-testid` 於本 repo 已是既有測試定位慣例（`empty-state`／`filter-bar`／`count-text`／`public-tree-board` 等） | `frontend/src/**/*.tsx` |

---

## 不變式（INV） {#invariants}

> 🔴 **每一條不變式都有一條對應的 AC 把它鎖住。** 不變式本身不是 AC，它是「為什麼那條 AC 存在」。

| ID | 不變式 | 鎖定於 |
|---|---|---|
| **INV-G1** | 卡片 `本月新版公告` 之數字 ＝ 環圖區塊 `當月已公告` **各段（含 `未指定`／`無本部`／`其他`）之已公告數總和**，且在**三個維度各自**成立 | `AC-G6` |
| **INV-G2** | 卡片 `已公告` 之數字 ＝ 環圖區塊 `累積已公告` 各段之已公告數總和，且在**三個維度各自**成立 | `AC-G34` |
| **INV-G3** | 🔴 **刻意不等**：卡片 `進度中` ≠ 圖例之進度中數字總和。理由＝圖例列集合＝**該窗口下有已公告文件之組織**；一個組織若只有進度中文件、無任何已公告文件，**不會有環段、也不會有圖例列**，其進度中份數因而不出現在圖例上。這不是漏算，是「環圖統計的是已公告」之必然結果 | `AC-G37`（明文記載 ＋ 斷言該不等**可以發生**） |
| **INV-G4** | 🔴 **刻意不等**：長條圖各類別之（已公告＋進度中）總和 ≠ 卡片（已公告＋進度中）。理由有二：① 一份文件可掛多個類別 ⇒ 跨類別被重複計入；② 未掛任何類別之文件完全不出現。⇒ 兩者**沒有**恆等關係，也**不得**為了對齊而改動任一方 | `AC-G68` |
| **INV-G5** | 長條圖某類別之（已公告＋進度中） **≤** 類別池清單同一列之「掛載文件數」。理由＝後者計全部掛載文件（不分狀態），前者只計 `status='active'`。⇒ 兩者**刻意不同**，[F043](F043-business-function-category.md) 之數字**一字不改** | `AC-G68` |
| **INV-G6** | 環圖之「進度中」數字**與時間窗口無關**（它是「當下尚未到公告日」之狀態）⇒ 同一組織若同時出現於兩個區塊，其進度中數字**恆等** | `AC-G36` |
| **INV-G7** | 儀表板上「已公告／進度中」之判定在**卡片、兩張環圖、長條圖、最新公告清單**五處**皆來自 `deriveDisplayStatus` 這一支純函式**，不得各算一份 | `AC-G70` |
| **INV-G8** | 「今日」「當月」「近 1 個月」「＋1 個月」之推導在整個功能中**各只有一個定義點** | `AC-G8`／`AC-G69` |

---

## DOM 契約（🔒 鎖定；本輪之唯一驗證載體） {#dom-contract}

> 🔴 **本輪沒有視覺回歸、沒有 e2e。** 下表之 `role`／`aria-label`／`data-testid`／逐字文案就是 AC 的全部載體；改掉其中任何一個等於讓對應的 AC 失去意義。
> 🔒 **`data-testid` 之值為鎖定字串**，ui-ux-designer 可調整版面、顏色、排版，**不得**更名或移除這些鉤子。

| 區塊 | 容器 | `data-testid` | 其他語意 |
|---|---|---|---|
| 統計卡列 | `role="group"` | `dashboard-stat-cards` | `aria-label="統計資訊"` |
| 卡①已公告 | — | `stat-card-announced` | 卡內數值節點 `stat-value`、標題節點逐字 `已公告` |
| 卡②進度中 | — | `stat-card-in-progress` | 同上，標題逐字 `進度中` |
| 卡③本月新版公告 | — | `stat-card-monthly-announced` | 同上，標題逐字 `本月新版公告` |
| 卡④OJT 準時完成率 | — | `stat-card-ojt-ontime` | 標題逐字 `OJT 準時完成率`＋`(1個月內)`；數值節點 🔴 **`stat-value` 與 `ojt-ontime-value` 為巢狀**（見下方）；排除註記節點 `ojt-ontime-exclusion-note`；連結 `role="link"` 逐字 `查看明細` |
| **卡④ 之環圖**（`AC-G97`） | — | `ojt-ontime-donut` | `<svg>` 一律 `aria-hidden="true"`；🔴 **`denominator === 0` 時整個不進 DOM** |
| **卡④ 之百分比**（`AC-G97`） | — | 🔒 **屬性選擇子 `[data-ojt-ontime-rate]`** | 🔴 **必須是 `<svg>` 之外的 HTML 文字節點**（疊於環中央，比照 `[data-donut-total]`）；逐字 `{Z}%`；🔴 **不得與 `donut-month`／`donut-cumulative` 系列擞名** |
| 環圖區塊（當月） | `role="region"` | `donut-month` | `aria-label="當月已公告"` |
| 環圖區塊（累積） | `role="region"` | `donut-cumulative` | `aria-label="累積已公告"` |
| 維度頁籤列 | `role="tablist"` | `org-dimension-tabs` | `aria-label="制定組織維度"`；三個 `role="tab"`，逐字 `依制定公司`／`依制定本部`／`依制定部門`；選取者 `aria-selected="true"` |
| 環圖面板 | `role="tabpanel"` | `donut-panel` | 以 `aria-labelledby` 指向當前 tab |
| 圖例 | `role="list"` | `donut-legend` | 每列 `role="listitem"`、`data-testid="donut-legend-row"`、`data-org-key="{DonutSlice.key}"`（🔒 值域見下方 sentinel 表） |
| 圖例列之三個文字節點 | — | `legend-org-name`／`legend-announced`／`legend-in-progress` | 後二者之文字恰為 `已公告 {n}`／`進度中 {n}` |
| **環之合計份數** | — | 🔒 **屬性選擇子 `[data-donut-total]`** | 🔴 **必須是 `<svg>` 之外的 HTML 文字節點**（prototype 置於環中央之絕對定位層，旁附說明 `已公告合計（份）`）。⇒ 它是「本維度已公告合計」之**唯一文字出處**（`AC-G85`／`AC-G71`） |
| **Top N 截斷說明行** | — | 🔒 **屬性選擇子 `[data-donut-truncation]`** | 🔴 **恆存在**（未達合併上限時亦渲染，只是文案不同）。合併發生時須載明：**被合併之組織數**、**該合併段之已公告合計份數**、排序規則；⇒ 它是 `其他` 段份數之**唯一文字出處**（`AC-G40`／`AC-G71`） |
| 最新公告區塊 | `role="region"` | `latest-announcements` | `aria-label="最新公告（ICSOP 版本更新）"`；表格 `role="table"`，四個 `role="columnheader"` 逐字如 [§命名鎖定](#naming-lock) 第 13 列；連結 `role="link"` 逐字 `查看更多` |
| 類別長條圖區塊 | `role="region"` | `category-distribution` | `aria-label="依業務/功能類別分布"`；`role="list"`，每條 `role="listitem"`、`data-testid="category-bar-row"`、`data-category-id="{id}"` |
| 長條列之三個文字節點 | — | `bar-category-name`／`bar-announced`／`bar-in-progress` | 後二者之文字恰為 `已公告 {n}`／`進度中 {n}` |
| 任一區塊之空狀態 | — | `empty-state` | 🔒 **沿用全站既有 `data-testid="empty-state"`**，不新增第二個 |
| **ⓘ 說明觸發器**（`AC-G95`） | `<button type="button">` | `info-trigger` | `data-info-for="{key}"`；`aria-label` 逐字 **`說明`**；`aria-expanded`（`"false"`／`"true"`）；`aria-describedby` 指向內容 `id`。🔒 **觸發器本身不承載任何資訊** |
| **ⓘ popover 內容**（`AC-G95`） | — | `info-content` | 具穩定 `id`；🔴 **恆在 DOM 裡**（未展開時僅以視覺方式隱藏）；🔴 **明文禁止以 `title` 屬性實作**。可直接 `getByTestId('info-content')` 讀取，不需先觸發 hover |

### `data-org-key` 之值域（🔒 鎖定；2026-09-21 自 [architecture-spec §15.5 ①](../architecture-spec.md#ch15-contracts) 回填）

| 維度 | 一般段之 `key` | 說明 |
|---|---|---|
| `依制定公司` | `companyCode`（如 `AS`） | 2 碼 |
| `依制定本部` | `` `${companyCode}__${divisionOrgCode}` `` | 複合鍵；分隔符 `__` 逐字沿用既有 `orgGroupKeyOf()`（`frontend/src/pages/ojt-progress-view.ts`），**不另立第二種** |
| `依制定部門` | `` `${companyCode}__${deptOrgCode}` `` | 同上 |
| **sentinel 段（恰 2）** | 🔒 **`__unspecified__`**（`未指定` 段）／🔒 **`__no_division__`**（`無本部` 段） | 🔒 逐字鎖定，**不得**改為 `unspecified`／`NO_DIVISION`／空字串／`null` |

### 🔴 卡④ 之 `stat-value` 與 `ojt-ontime-value` 為**巢狀**，不是二選一

`AC-G24` 要求「四張卡之每一個數字皆可由 `getByTestId('stat-value')` 之 `textContent` 取得」，而上表又要求卡④ 之數值節點為 `ojt-ontime-value`（`AC-G13` 之逐字句鎖在它身上）。🔴 **兩者是巢狀關係，下游不得挑一個實作**：

```html
<div data-testid="stat-value"><span data-testid="ojt-ontime-value">已完成 3 / 應完成 4（75%）</span></div>
```

**And** 🔒 兩者之 `textContent` **完全相同**（外層不得再加任何文字），⇒ `AC-G24` 與 `AC-G13` **同時成立**
**And** 🔴 **明文禁止**只實作其中一個——只有 `stat-value` ⇒ `AC-G13` 之逐字斷言失去載體；只有 `ojt-ontime-value` ⇒ `AC-G24` 之「四張卡」在卡④ 落空
**And** ⚠ 分母為 0 時（`AC-G14`）卡④ 呈現 `empty-state`，此時兩個節點**一併不存在**——`AC-G24` 之「四張卡」在該狀態下只涵蓋前三張，這是刻意的。

> 🔒 **為何 sentinel 採雙底線包夾**：`companyCode` 為 2 碼、`orgCode` 為 5 碼英數 ⇒ **結構上不可能與真實鍵碰撞**。
> 🔴 **兩個 sentinel 之 `label` 為逐字 `未指定` ／ `無本部`，不加公司前綴**（`AC-G36` 末段）——它們是「解析不出來」的桶，不屬於任何一家公司。
> 📌 測試可直接以 `[data-org-key="__no_division__"]` 定位該段，這是 `AC-G34` 在元件層唯一穩定的定位點。

---

## §甲 · 上方四張統計卡（FR-1 / US-109） {#cards}

#### `AC-G1` — 卡片集合恰 4 張、逐字標題、順序固定、取代舊 5 張
**Given** 我以四種後台角色（`SysAdmin`／`ICSOPAdmin`／`Supervisor`／`DeptContact`）之任一進入 `/admin`
**When** 頁面載入完成
**Then** `data-testid="dashboard-stat-cards"` 之容器內，卡片數**恰為 4 或 3**（3 ＝ 第 4 張依 `AC-G17` 隱藏時），其標題依序逐字為 `已公告`、`進度中`、`本月新版公告`、`OJT 準時完成率`
**And** 🔴 舊 5 張 KPI 待辦卡（`待確認組織異動`／`未指派節點文件`／`停用帳號待覆核`／`調閱紀錄（近7日）`／`待公布的文件`）之**逐字標題於整頁 DOM 中零命中**
**And** 既有容器 `aria-label="待辦提示"` 不再存在（其位置由 `aria-label="統計資訊"` 取代）。
> 🔴 **`OQ-D44-03` ＝ 甲（取代）之明確後果**：`SysAdmin` 失去 `停用帳號待覆核` 之首頁入口、`SysAdmin`／`ICSOPAdmin` 失去 `待確認組織異動` 之首頁入口。**這是人類裁決明示授權之刪除**，不是遺漏；該兩項功能之側欄入口一字不動（`AC-G76`）。

#### `AC-G2` — `已公告` 之口徑
**Given** 系統中存在各種狀態之 ICSOP 文件
**When** 計算卡① 之數值
**Then** 其值 ＝ `|{ d ∈ ICSOP_DOCUMENT : deriveDisplayStatus(d.status, d.announcedDate, today) === 'announced' }|`，**累積、不限時間**
**And** 🔴 判定**必須**來自 `backend/src/documents/display-status.ts` 之 `deriveDisplayStatus`；**明文禁止**在聚合層以 `status='active' AND announcedDate <= @today` 之裸 SQL 另表達一次該語意而不經該純函式驗證（INV-G7）。
> 📌 **可測形狀**：以純函式 `countByDisplayStatus(docs, today)` 承載，輸入為文件集合、輸出為 `{announced, inProgress}`。斷言以固定 `today` 驅動，**不得**呼叫 `new Date()`。

#### `AC-G3` — `進度中` 之口徑：**唯一一份實作**，並與既有 `pendingPublish` 以回歸鎖釘住
> 📝 **2026-09-21 就地改寫（[architecture-spec §15.12 一 A](../architecture-spec.md#ch15-handback)，lead 裁示採 architect 解讀）。**
> `OLD>` 原第 2 句逐字為「**Then** 其值**必須來自該同一個 provider**（`OQ-D44-02` ＝ 甲）」——該措辭與 `AC-G70`／INV-G7 正面牴觸，已依下列理由改寫。

**Given** 既有 `DashboardCountProviders.pendingPublish()` 已以 SQL 形式定義「進度中」＝ `status='active'` AND (`announcedDate IS NULL` OR `announcedDate > now`)
**When** 計算卡② 之數值
**Then** 其值 ＝ `|{ d ∈ ICSOP_DOCUMENT : deriveDisplayStatus(d.status, d.announcedDate, today) === 'in_progress' }|`，**由與卡①③ 同一份投影、同一個 `now`、同一次 `deriveDisplayStatus` 分類取得**
**And** 🔴 **「進度中」之判定僅存在一份實作**（`deriveDisplayStatus`，INV-G7）；**明文禁止**新增任何名為 `inProgressCount`／`pendingCount`／`notYetAnnounced` 等之第二份計數實作
**And** 🔒 既有 `pendingPublish` provider 與 `GET /admin/dashboard/summary` **一行未改**（`AC-G75`）
**And** 🔒 **回歸鎖**：`GET /admin/dashboard/summary` 之 `pendingPublish` 與卡② 之值在**同一份語料下恆等**（一條斷言同時取兩者比較）。

> 🔴 **為何第 2 句必須是「同一次 `deriveDisplayStatus` 分類」而不是「`pendingPublish()` 的回傳值」——決定性理由（逐字，不得刪節）**：
> **若卡② 字面上就是 `pendingPublish()` 的回傳值，本條第 4 句要求的「一條斷言同時取兩者比較」會退化成 `x === x`，恆真、零鑑別力。** 那正是 [§癸](#corpus) 通篇在防的形狀。
> ⇒ 人類裁決 `OQ-D44-02`（「重用既有 provider、禁止另寫第二份」）之正確意旨是「**不得有第二份實作**」，而非「必須讀取那支 provider 的回傳值」。
>
> ⚠ **`OQ-D44-02` 之意圖被完整兌現、機制被取代——此因果必須留在檔案裡**（否則日後只讀到裁決單的人會以為這裡違規）：
> 該裁決要防的是「**進度中有兩個定義點**」。本解法把唯一定義點收斂到 `deriveDisplayStatus`（INV-G7 之五處全部走它），**比原本的「重用一支 SQL COUNT」更徹底**——原方案下畫面走 SQL、環圖與長條圖走純函式，反而是兩個定義點；現方案下四處全走純函式，`pendingPublish` 退為一個被回歸鎖釘住的旁證。
>
> ⚠ **本解法之代價，必須明文承認**：`pendingPublish` 的 SQL 與 `deriveDisplayStatus` **是否真的等價，本輪沒有任何機器閘門驗得到**——上句之回歸鎖在簡化環下由 **fake provider** 驅動，它比較的是兩支 JS，**從未比對真實 SQL**。已列入 [architecture-spec §15.10](../architecture-spec.md#ch15-blindspots) 人工覆核清單第 5 項（實機比對 `GET /admin/dashboard/summary` 之 `pendingPublish` 與首頁卡②，🔴 建議在「公告日恰為今日」之文件存在時做）。

#### `AC-G4` — `本月新版公告` 之口徑
**Given** 系統中有上月公告、本月已公告、本月未來公告日、以及當月改版後重新公告之文件
**When** 計算卡③ 之數值
**Then** 其值 ＝ `|{ d : deriveDisplayStatus(d.status, d.announcedDate, today) === 'announced' ∧ d.announcedDate ∈ 當月 }|`
**And** 🔴 **`announced` 這個條件已同時涵蓋「`status='active'`」與「`announcedDate ≤ 今日`」兩件事** ⇒ `OQ-D44-01` 子題之「只算已公告」由此條件承載，**不需要也不得**另寫一個 `announcedDate <= today` 的比較
**And** 🔴 **明文禁止**讀取 `DOCUMENT_CHANGE_LOG`（`OQ-D44-01` ＝ 甲，乙案已被否決；該日誌自 [F037](F037-document-change-history.md) 起才有、無 backfill）
**And** ⚠ **須明確接受之代價**（人類已裁決）：每月 1 號此卡接近 0、月內逐日爬升；一份當月改為 `inactive`／`void` 之文件**不計入**（它已不是 `announced`）。

#### `AC-G5` — 「當月」之定義與月界之凍結時鐘向量
**Given** 時區基準為 UTC（`AC-G69`）
**Then** 「當月」＝ 半開區間 `[當月 1 日 00:00:00.000Z, 次月 1 日 00:00:00.000Z)`
**And** 🔴 **測試必須凍結時鐘**，至少涵蓋下列固定向量（每一列皆為「`today` ／ 某文件之 `announcedDate` ／ 是否計入卡③」）：

| # | `today`（凍結） | `announcedDate` | 計入卡③？ | 這一列在防什麼 |
|---|---|---|---|---|
| ① | `2026-03-15T00:00:00Z` | `2026-02-28T00:00:00Z` | ❌ | 上月公告被誤計 |
| ② | `2026-03-15T00:00:00Z` | `2026-03-01T00:00:00Z` | ✅ | 月初邊界被誤排除 |
| ③ | `2026-03-15T00:00:00Z` | `2026-03-15T00:00:00Z` | ✅ | 「今日」被誤判為未來 |
| ④ | `2026-03-15T00:00:00Z` | `2026-03-31T23:59:59Z` | ❌ | **本月未來日被誤計**（子題＝只算已公告） |
| ⑤ | `2026-03-31T23:59:59Z` | `2026-03-31T00:00:00Z` | ✅ | 月末最後一刻被誤排除 |
| ⑥ | `2026-04-01T00:00:00Z` | `2026-03-31T00:00:00Z` | ❌ | 跨月後仍計入上月 |
| ⑦ | `2026-03-15T00:00:00Z` | `null` | ❌ | null 被當成 0 而落入某個月 |

**And** 🔴 **明文禁止**以 `Date.now()` 回推方式建立 fixture（本 repo 已記錄「每天 00:00–02:00 必紅、其餘 22 小時綠」之跨日定時炸彈）。

#### `AC-G6` — 🔒 INV-G1 恆等鎖：卡③ ＝ 環圖區塊「當月已公告」各段總和
**Given** 任一份語料
**When** 同時計算卡③ 與環圖區塊 `當月已公告` 在**三個維度**下之各段已公告數
**Then** 對**每一個維度**，`Σ(各段已公告數) === 卡③ 之值`
**And** 🔴 該總和**必須包含** `未指定`／`無本部`／`其他` 段（`AC-G32`／`AC-G33`／`AC-G38`）
**And** 🔴 **本條為回歸鎖，不得寫成「畫面上顯示正確的數字」**——斷言形狀為「以同一份輸入集合驅動兩支純函式，比較其輸出數字」。
> 🔴 **這是本功能最重要的一條 AC。** 分組邏輯任何一處「順手排除掉解析不出來的那幾筆」都會立刻讓它翻紅，而在畫面上那只是一個「差了幾份、看不出來從哪差的」的數字。

#### `AC-G7` — `OJT 準時完成率` 之時間窗口
**Given** 應完成訓練日期 ＝ 該文件之 `announcedDate` ＋ 1 個月（[F042](F042-ojt-progress-management.md) 第五輪定義）
**When** 決定卡④ 之母體
**Then** 母體 ＝ 應完成日落在**閉區間** `[今日 − 1 個月, 今日]` 之（文件 × 使用單位）進度列所涉及之單位
**And** 🔴 **明文禁止**改為「`announcedDate` 落在近一個月」（`OQ-D44-09` 之丙案，已被否決——那批多半尚未到期，其「未完成」不代表落後）
**And** ⚠ **已由人類明確接受之代價**：母體可能非常小甚至為 0，卡片會長期顯示空狀態。**這是正確行為，不是 bug。**

#### `AC-G8` — 🔴 「±1 個月」之單一推導點與固定向量
**Given** [F042](F042-ojt-progress-management.md) 之 `trainingDueDate()` 已把「＋1 個月（月底溢位夾回當月最後一日、一律 UTC 拆解）」宣告為**全站唯一之推導點**，且該函式目前**只存在於前端**（[事實 #11](#verified-facts)）
**Then** 本功能之「＋1 個月」與「−1 個月」**必須共用同一個月份位移演算法**，具名為 `addMonthsClamped(isoDate, delta)`；`trainingDueDate()` 改為**委派**該函式（其對外行為、簽章與逐字註解一字不改）
**And** 🟢 **`ARCH-G1` 已於 2026-09-21 裁定＝聚合落後端**（[architecture-spec §15.2](../architecture-spec.md#ch15-g1)）⇒ **孿生實作路徑生效**：後端 `backend/src/ojt-progress/add-months-clamped.ts`、前端 `frontend/src/pages/ojt-progress-view.ts`（同名同簽章），兩份**必須由下表之固定向量表逐列鎖住**（跨 package 無法共用原始碼，比照 `org-path.ts` 檔頭之「兩份實作須同步維護」既有紀律）：

| # | 輸入 | `delta` | 期望輸出 | 這一列在防什麼 |
|---|---|---|---|---|
| ① | `2026-01-15` | `+1` | `2026-02-15` | 一般情形 |
| ② | `2026-01-31` | `+1` | `2026-02-28` | 🔴 月底溢位未夾回（天真 `setMonth` 會得 `2026-03-03`） |
| ③ | `2024-01-31` | `+1` | `2024-02-29` | 閏年之夾回點 |
| ④ | `2026-12-31` | `+1` | `2027-01-31` | 跨年 |
| ⑤ | `2026-03-31` | `−1` | `2026-02-28` | 🔴 反向之月底夾回 |
| ⑥ | `2024-03-31` | `−1` | `2024-02-29` | 反向＋閏年 |
| ⑦ | `2026-01-01` | `−1` | `2025-12-01` | 反向跨年 |
| ⑧ | `2026-05-31` | `−1` | `2026-04-30` | 反向 31→30 |

**And** 🔴 **三條執行要求（缺一則此表形同虛設；[architecture-spec §15.2](../architecture-spec.md#ch15-g1) 逐列確認後鎖定）**：
1. 🔴 兩份測試檔（`backend/src/ojt-progress/add-months-clamped.spec.ts` 與 `frontend/src/pages/ojt-progress-view.test.ts` 之新增 describe）之**向量陣列逐字相同**，且**各自檔頭以逐字註解指向對方路徑**（比照 `org-path.ts` 檔頭之「兩份實作須同步維護」寫法）。
2. 🔴 **前端側即使本功能不呼叫 `delta = −1`**（窗口計算全在後端），**仍須以 ⑤～⑧ 鎖住**——否則兩份實作只有一半被比對，**反向夾回可以在後端漂移而前端全綠**。
3. 🔴 兩側皆**禁止** `setMonth(...)`／`getMonth() ± 1` 之就地運算，一律以 `Date.UTC` 拆組（沿用既有 `trainingDueDate()` 之作法）。

**And** 🔒 `trainingDueDate()` 改為 `addMonthsClamped(announcedDate, +1)` 之**委派**，其對外行為、簽章與逐字註解**一字不改**（`AC-G80`）。

> 🔴 **負向鎖定：被明文否決之「聰明」替代方案——把窗口反推成 `announcedDate` 之區間**
> （[architecture-spec §15.2 末](../architecture-spec.md#ch15-g1)／[§15.11](../architecture-spec.md#ch15-rejected) ②。**這是實作者最可能自作聰明的地方，逐字寫在此處作為負向鎖定。**）
>
> 有一種看起來可以完全免除後端月份位移的作法：既然應完成日 ＝ `announcedDate + 1 月`、窗口是 `[今日 − 1 月, 今日]`，那麼母體似乎等價於 `announcedDate ∈ [今日 − 2 月, 今日 − 1 月]`，如此後端只需比較日期字串。
>
> 🔴 **此等價不成立，明文否決。** `addMonthsClamped` 因月底夾擠而**不可逆**：`2026-01-29`、`2026-01-30`、`2026-01-31` 三個不同的公告日在 `+1` 之後**同為** `2026-02-28`。反推所得之區間端點無法同時涵蓋這三者而不誤納其他日期。
> ⇒ 🔒 **必須正向計算每一列之應完成日再做區間比對**（`AC-G7`）。
> ⚠ 此錯法**每年只有月底那幾天會錯、且在乾淨語料下完全看不出來**——🔴 **[§癸](#corpus) 之建環語料必須含 `2026-01-29`／`2026-01-30`／`2026-01-31` 三個公告日並凍結 `today` 於 `2026-02-28`，使正向與反推兩種作法輸出不同**，否則本條負向鎖定零鑑別力。

#### `AC-G9` — 卡④ 之分母：相異使用單位數
**Given** `OQ-D44-11` ＝ 乙
**When** 計算卡④ 之分母
**Then** 分母 ＝ 母體（`AC-G7`）中**相異 `(companyCode, orgCode)` 之個數**
**And** 🔴 **分組鍵必須是複合鍵 `(companyCode, orgCode)`**，**明文禁止**單以 `orgCode` 分組——5 碼部門代碼各公司獨立編碼（dev 實測四家間 42 個重複碼），單鍵分組會把不同公司的兩個部併成一組（[F042](F042-ojt-progress-management.md) 2026-09-01 已修過同型缺陷）
**And** ⚠ **與 [F042](F042-ojt-progress-management.md) `coverage.denominator`（進度列數）刻意不同**，兩者標籤不同（`單位` vs `覆蓋率`），**不得為了一致而對齊**。

#### `AC-G10` — 卡④ 之分子：該單位「全部」應完成文件皆已完成
**When** 計算卡④ 之分子
**Then** 分子 ＝ 分母之單位中，**該單位在窗口內之全部應完成文件皆已完成**者之個數
**And** 某單位若在窗口內有 3 份應完成文件、完成 2 份 ⇒ **不計入分子**（部分完成不算）
**And** 📌 **可測形狀**：純函式 `ojtOnTimeRate(rows, today)`，`rows` 為（`companyCode`, `orgCode`, `documentId`, `announcedDate`, `completed`, `isActive`）之列集合，輸出 `{ numerator, denominator, rate?, excludedInactive, excludedOrphaned, excludedNoAnnouncedDate }`。

#### `AC-G11` — 完成判定沿用 F042，禁止第二種口徑
**Given** `OQ-D44-10` ＝ 甲
**Then** 「已完成」之判定**完全沿用** [F042](F042-ojt-progress-management.md) `AC-03`（存在 `edition` 與該文件當下 `ojtTrainingEdition` 相符之場次，`null` 對 `null` 亦相符；**判定僅依場次，不依訓練日期是否已過**）
**And** 🔴 **明文禁止**引入 `trainingDate ≤ 應完成日` 之「準時」條件——「準時」由時間窗口（`AC-G7`）承載
**And** 🔒 **回歸鎖**：同一份語料下，若把窗口放寬為「全部」，`ojtOnTimeRate` 之 `numerator/denominator` 與 [F042](F042-ojt-progress-management.md) `getSummary().coverage` 在**單位粒度**上之對應關係可被檢查（同一批列、同一個完成判定）。

#### `AC-G12` — 卡④ 之排除規則
**Then** 下列三類**自分子與分母同時排除**：
1. **裁撤單位**（`isActive === false`）——沿用 [F042](F042-ojt-progress-management.md) `AC-17`（`OQ-D44-12` a）；
2. **孤兒列**（單位已移出 `DOC_USING_DEPT`）——沿用 [F042](F042-ojt-progress-management.md) `AC-25`，依**集合成員關係**判定、**不讀 `orphanedAt` 旗標**；
3. **`announcedDate` 為 `null` 之文件**（`OQ-D44-12` b）——無公告日即無從推算期限，不可能「準時」或「逾期」。
**And** 🔴 上述三類之**計數各自可取得**（`excludedInactive`／`excludedOrphaned`／`excludedNoAnnouncedDate`），供 `AC-G15` 之排除註記使用。

#### `AC-G13` — 卡④ 之數值呈現：🔴 **百分比在環中央、實際數量在環旁**（2026-09-21 第七輪就地改寫）

> 🔴 **人類原話（2026-09-21，逐字）**：
> > OJT 準時完成率能加上圓餅圖來強化達成率的視覺效果嗎？就不需要 XX %
> 🔒 **裁定＝環中央放百分比文字**（**不是**完全不顯示百分比）——視覺上是環圖，而百分比**仍是 DOM 文字節點**。

**Given** `denominator > 0`
**Then** 🔒 環**中央**之 `[data-ojt-ontime-rate]` 之 `textContent` 逐字為 `{Z}%`
**And** 🔒 環**旁（或下方）**之 `data-testid="ojt-ontime-value"` 之 `textContent` 逐字為 `已完成 {X} / 應完成 {Y}`
> 🔴 **「顯示實際單位數量與比率」是使用者最初需求之逐字要求（`OQ-D44-08`）——🔒 **`已完成 X / 應完成 Y` 那半句不得因本次改動而消失**。**本次改的是排版，不是資訊量。**
**And** `Z` 🔴 **必須委派既有 `coveragePercent`**，明文禁止另打一份 `Math.round`（[F042](F042-ojt-progress-management.md) 已記錄「兩份會各自漂移」之真實缺陷）
**And** 🔒 `/` 兩側各恰一個半形空格；`%` 為半形；🔴 **拆分後兩個節點皆不再含全形括號**（原全形 `（）` 隨舊句型一併作廢）
**And** 🔴 **兩個節點必須各自可獨立斷言**；明文禁止把 `{Z}%` 串回 `ojt-ontime-value`（那等於沒拆，且會讓 `AC-G97` 之環中央斷言失去唯一載體）

<details><summary>📝 `OLD>` 原條文逐字保留（單一字串 `已完成 X / 應完成 Y（Z%）`）</summary>

**Given** `denominator > 0`
**Then** 卡面數值節點（`data-testid="ojt-ontime-value"`）之 `textContent` 逐字為 `已完成 {X} / 應完成 {Y}（{Z}%）`
**And** `Z = Math.round(X / Y * 100)`（🔴 **必須委派既有 `coveragePercent`，明文禁止另打一份 `Math.round`**——[F042](F042-ojt-progress-management.md) 已記錄「兩份會各自漂移」之真實缺陷）
**And** 🔒 `/` 兩側各恰一個半形空格；括號為**全形** `（）`；`%` 為半形。


</details>

#### `AC-G14` — 卡④ 之分母為 0：省略比率、明確空狀態
**Given** `denominator === 0`
**Then** 🔴 **`GET /admin/ojt-progress/ontime-summary` 之回應中 `rate` 鍵由「後端」省略**（不是前端判斷後不渲染），比照 [F042](F042-ojt-progress-management.md) `coverage.rate` 之既有紀律
> 📝 **2026-09-21 就地補明（[architecture-spec §15.12 二](../architecture-spec.md#ch15-handback) ⑥）**：原條文只寫「聚合結果中 `rate` 鍵省略」，**未指明省略發生在哪一層**。
> 🔴 **為何必須是後端省略**：`0%`／`100%`／`NaN%` 三種謊報都是「**有一個數字可以渲染**」才發生的。鍵不存在時 TypeScript 會**逼呼叫端處理 `undefined` 分支**；若後端照送一個 `0` 再要前端自己判斷分母，那道型別防線就沒了。此為本 repo 既有 `coverage.rate` 之紀律，逐字沿用。

**And** 卡面顯示 `data-testid="empty-state"` 之明確提示（建議逐字 `近 1 個月內無應完成之 OJT 單位`）
**And** 🔴 **明文禁止**出現 `NaN%`／`undefined%`／`0%`／`100%`／空白——`0%` 與「全部未完成」無從分辨，`100%` 是謊報
**And** 📌 該分支在正式站**會是常態**（`AC-G7` 之代價），不是邊角案例。

#### `AC-G97` — 卡④ 之環圖（🔴 2026-09-21 第七輪人類裁決新增）

**Given** `denominator > 0`
**Then** 卡④ 以**自繪 SVG 環圖**呈現完成率（🔒 `AC-G48` 不放寬：不引入圖表庫、禁 `<canvas>`）
**And** 🔒 **汿圖法沿用兩張大環圖已用之手法**：`<svg>` 一律 `aria-hidden="true"`，🔴 **百分比文字疊在 `<svg>` 之外**（比照 `[data-donut-total]`）——⇒ 🔒 **`AC-G71` 不需放寬**
**And** 🔒 環容器 `data-testid="ojt-ontime-donut"`；中央百分比節點 `[data-ojt-ontime-rate]`（🔴 **刻意不與兩張大環圖之 `donut-month`／`donut-cumulative`／`donut-legend`／`[data-donut-total]` 擞名**）
**And** 🔴 **環之幾何必須抽為純函式並以固定向量斷言**（比照 `AC-G49` 之 `donutSegments`）：本輪無視覺回歸，**弧長對不對機器驗不到**，只有純函式那一層驗得到；向量至少含 `X === 0`（空環）、`X === Y`（滿環）與一個中間值

**And** 🔴 **`denominator === 0` 時之處置（逐字鎖定）**：
  · 🔴 **環圖本身不繪**（`ojt-ontime-donut` **不進 DOM**）——不得繪空環、不得繪 0% 環；
  · 🔴 `[data-ojt-ontime-rate]` 與 `ojt-ontime-value` **亦不進 DOM**；
  · 🔒 改以 `data-testid="empty-state"` 之明確提示取代整個數值區，逐字為 [§命名鎖定](#naming-lock) 第 4 列之 `近 1 個月內無應完成之 OJT 單位`；
  · 🔴 **明文禁止** `NaN%`／`0%`／`100%`／空白（`AC-G14` 之既有紀律一字未改）
> 🔴 **為何不繪空環**：一個 0% 的環與「全部未完成」在畫面上**完全一樣**——那正是 `AC-G14` 禁止 `0%` 的同一個理由，只是換成了圖形形式。

**And** 🔒 **`AC-G94`／`AC-G95` 之通則續存**：本次新增之任何說明性文字一律適用（可見只說「這是什麼、數字多少」，理由進 ⓘ）；🔴 卡④ 已有一個 ⓘ（`AC-G89`），**不得再加第二個**——環圖需要說明時一律併入該 ⓘ
**And** 🔒 **範圍**：只改 F044 新版面；[F042](F042-ojt-progress-management.md) OJT 進度管理頁**一格不動**

#### `AC-G15` — 卡④ 之排除註記
**Then** 卡內存在 `data-testid="ojt-ontime-exclusion-note"` 之註記節點，**恆顯示**（含排除 0 筆時之明確說明），內容至少載明：① 當前分子／分母（或空狀態）；② 本次共排除幾列、分別因裁撤單位／已移出使用部門／無公告日期；③ 一句說明「被排除者於 `OJT 資料清單` 分頁仍可能呈現，故兩處數字不相等屬正常」
**And** 🟢 **`ARCH-G6` 已於 2026-09-21 裁定＝不共用 `exclusionNote()`**，本條之 fallback 條款生效 ⇒ 註記由新的姊妹純函式 `ojtOnTimeNote` 產生，其規格見 **`AC-G89`**
> 📝 **就地改寫**：`OLD>` 原逐字為「**And** 🔵 **建議直接委派** [F042](F042-ojt-progress-management.md) 既有之 `exclusionNote()` 並以第三個排除原因擴充之；若 system-architect 裁定不可共用，本卡之註記純函式須與其**逐字句型一致**並由固定向量鎖住」。⚠ **「逐字句型一致」這半句一併作廢**——architect 查證三段句型無一相同（見 `AC-G89`）。
**And** 🔴 **2026-09-21 人類裁決第二輪：本條之說明性文字須依 [`AC-G94`／`AC-G95`](#rationale-out) 拆為【可見】與【ⓘ popover】兩部分**，逐字新文案見 [§癸四 逐處處置表](#rationale-sites) 第 1 列。🔒 **本條之其餘要求（數字、門檻、不變式）一字未改**。

**And** 🔒 卡④ 之**數值節點**（`data-testid="ojt-ontime-value"`，`AC-G13` 之逐字句）與**註記節點**（`data-testid="ojt-ontime-exclusion-note"`，本條）為**兩個節點**，`AC-G13` 之逐字鎖只作用於前者
**And** 🔴 **為何要有這條**（`OQ-D44-12` c）：卡片數字與 TAB2 列數**必然可以不同**（TAB2 不套 `isActive` 過濾）。不明說差額從哪來，使用者就會自己去數 TAB2 然後回報一個不存在的 bug。

#### `AC-G16` — 前三張卡之角色可見性
**Given** 我以四種後台角色之任一登入
**Then** 卡①②③ **一律呈現**（`OQ-D44-06` ＝ 甲）
**And** 🔴 **明文禁止**為這三張卡寫任何角色白名單——四種後台角色對 `ICSOP文件管理` 皆有 `READ` 以上（[事實 #18](#verified-facts)），看得到清單卻看不到其總數會是一個說不通的不對稱
**And** `User`（一般使用者）不在此列——其無後台（[F002](F002-role-based-routing.md)），本條不適用。

#### `AC-G17` — 卡④ 之可見性：🔴 **四種後台角色皆顯示（讀矩陣）**（2026-09-21 第七輪人類裁決）

**Given** `FUNCTION_MATRIX[OJT_PROGRESS_MANAGEMENT]` ＝ `row('READ', 'CRUD', 'RESTRICTED_CRUD', 'RESTRICTED_CRUD', 'NONE')`（SysAdmin `READ`／ICSOPAdmin `CRUD`／主管 `RESTRICTED_CRUD`／部門窗口 `RESTRICTED_CRUD`／一般使用者 `NONE`）
**Then** 卡④（`data-testid="stat-card-ojt-ontime"`）對**四種後台角色皆進 DOM**
**And** 🔴 **閘門必須是 `canPerform(role, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')`**——**讀矩陣**，🔴 **明文禁止**寫成角色清單、🔴 **亦禁止再重用 `canViewDashboard`**
**And** 🔒 `查看明細` 連結之閘門同一支述詞（`AC-G18` 本來就是這樣寫的，本輪一致）
**And** `User`（一般使用者）為 `NONE` 且無後台（[F002](F002-role-based-routing.md)）⇒ 不在此列

> 🔴 **本裁決是「限縮」而非「推翻」2026-09-02 之裁決，三件事必須同時成立**：
> ① 🔒 **`canViewDashboard` 一行未改**；② 🔒 **OJT 進度管理頁之 TAB1 仍對主管／部門窗口隱藏**；③ 改變的**只是「卡④ 不再重用該述詞」**。
>
> 🔴 **為何當初那樣裁、現在為何改**（不寫清楚，兩處會永遠互相矛盾）：
> · **當初**：`OQ-D44-07` 裁為甲，理由是「使用者原文未表態、而既有裁決已表態 ⇒ 沿用既有裁決是唯一不需推翻任何人的選項」。那個推理在當時是對的。
> · 🔴 **問題在於重用了一個答錯問題的述詞**：`canViewDashboard` 回答的是「誰看得到**那一個分頁**」，卡④ 問的是「誰看得到**這一個數字**」——**把兩個不同的問題綁在同一個答案上，就是這次不一致的來源**。
> · 🔴 **後果是一個反轉的權限梯度**：SysAdmin 只有 `READ` 卻看得到，主管／部門窗口有 `RESTRICTED_CRUD` **反而看不到**——**權限更多的角色看到更少**。
> · 🟢 **決定性論據來自 2026-09-02 那條裁決自己的註解**（`ojt-progress-view.ts`，逐字）：
>   > 🔒 **前端可見性、不是授權邊界**：主管／部門窗口**本就看得到 TAB2 的全部列**，儀表板**不多揭露任何一列資料**。此處隱藏的是一個**對他們沒有用處的分頁**，不是一道防線。
>   ⇒ 讓他們看到卡④ **不是安全性改動**，純粹是「有沒有用」的判斷；而當初隱藏的是**一整個分頁**，不是這一個數字。

<details><summary>📝 `OLD>` 原條文逐字保留</summary>

**Given** `OQ-D44-07` ＝ 甲，且**2026-09-02 之裁決不被推翻**
**Then** 卡④（`data-testid="stat-card-ojt-ontime"`）**僅對 `ICSOPAdmin` 與 `SysAdmin` 進 DOM**；對 `Supervisor` 與 `DeptContact` **完全不進 DOM**（不是 `hidden`、不是 `disabled`）
**And** 🔴 **述詞必須是 [F042](F042-ojt-progress-management.md) 既有之 `canViewDashboard(roleCode)` 這一支**，**明文禁止**在本頁複製 `role === 'ICSOPAdmin' || role === 'SysAdmin'`
**And** 🔒 **回歸鎖**（`AC-G80`）：`canViewDashboard` 之行為與其在 `OjtProgressPage` 之既有用途**一字不改**
**And** 📌 **為何是同一支而不是兩支**：這兩處回答的是同一個問題——「誰看得到全公司的 OJT 統計」。寫成兩份，下次任一邊調整時另一邊會被靜默遺漏。


</details>

#### `AC-G18` — `查看明細` 連結之逐字與閘門
**Given** 卡④ 已呈現
**Then** 卡內存在 `role="link"`、`textContent` 逐字為 `查看明細` 之連結
**And** 🔴 其顯示閘門**必須**為 `canPerform(role, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')`——**直接讀功能矩陣**，**明文禁止**寫成角色清單（比照 `canSeeLifecycleDimension` 之既有紀律，其註解逐字：「寫成角色清單也能過測，但下次矩陣一動，這裡就會與真正的授權分家」）
**And** ⚠ 在 `AC-G17` 之下，卡④ 只對 `ICSOPAdmin`／`SysAdmin` 呈現，而該二角色對 `OJT 進度管理` 皆有讀取權 ⇒ **本閘門於畫面上目前恆為真**。**這不是把它寫成常數的理由**——閘門存在是為了在矩陣變動時仍然正確，其鑑別力載體為**純函式層之直接斷言**（見 [§癸](#corpus) (e)）。

#### `AC-G19` — `查看明細` 之 deep link：URL 參數形態
**Given** `OQ-D44-13` ＝ 甲（URL 參數）
**When** 我點擊 `查看明細`
**Then** 瀏覽器導向 `/admin/ojt-progress` 並帶上查詢參數，使目標頁① 開在 `OJT 資料清單` 分頁、② 套用「未全部完成之單位排在上方」之排序
**And** 🔴 `OjtProgressPage` 須新增 `useSearchParams` 之讀取，且**於 `useState` 之初始化函式即自網址取樣**——照抄 `DocumentListPage` 之 `readSubtreeParams`／`readBcSubtreeParams` 既有紀律，否則首屏會先閃一次預設分頁
**And** 🔴 **參數缺席或值不可辨識 ⇒ 靜默 no-op、退回既有預設**（不回錯誤、不 toast），比照 [F017](F017-backend-document-list.md) `AC-T41` ①②
**And** 🔒 **參數已由 `ARCH-G4` 於 2026-09-21 定案並升為鎖定值**：`/admin/ojt-progress?tab=sessions&sort=incomplete-first`（[§命名鎖定](#naming-lock) 第 20 列，🔵 → 🔒）
**And** 🔴 **兩參數各自獨立解析，見 `AC-G88`**（🔴 **刻意不採**本頁既有之「恰成對」紀律）
**And** ⚠ **既有之 `gotoSessionsPending()`（同頁 React state）不得移除、不得改寫**——它是另一條入口，行為一字不動。

#### `AC-G20` — `incomplete-first` 排序之語意：排序、客端、作用於「以使用單位分組」
**Given** `OQ-D44-14` ＝ 甲，排序位置 ＝ 客端
**When** deep link 帶有 `sort=incomplete-first` 且分組模式為 `以使用單位分組`
**Then** 群組先依「該群組是否**全部**進度列皆已完成」分為兩段——**未全部完成之群組在上**
**And** **段內維持該頁／該端點原本之次序**（🔴 **不得寫成 `orgCode` 昇冪、也不得寫成 `orgName` 昇冪**——兩者都會在其中一邊造成漣漪；理由與可測形狀見 **`AC-G93`**）
**And** 🔴 **是排序，不是篩選**：已完成之群組**仍然呈現**（`OQ-D44-14` 之丙案已被否決——藏起來使用者就無法確認「其他都完成了」）
**And** 🔴 **客端排序**：`listRows` 之後端端點、其回應形狀與其伺服端排序（`orgName` → `documentNumber`）**一格不動**（`AC-G79`）
**And** 分組模式為 `以文件分組` 時本排序**不生效** ⇒ 見 **`AC-G92`**
**And** 取消排序之入口、其逐字文案與定位掛鉤 ⇒ 見 **`AC-G91`**
**And** 📌 **可測形狀**：純函式 `sortGroupsIncompleteFirst(groups)`，輸入為既有 `OjtRowGroup[]`、輸出為重排後之同一組群組（**元素恆等、僅順序改變**，須斷言「排序前後之群組集合完全相同」）。

#### `AC-G21` — 🔒 未帶參數時 TAB2 行為一格不動
**Given** 不帶任何新參數進入 `/admin/ojt-progress`
**Then** 預設分頁、兩項篩選（單位搜尋、完成狀態三值）、兩種分組模式（`以使用單位分組` 預設／`以文件分組`）、群組與列之次序、全部逐字文案**與本功能導入前逐項相同**
**And** 🔒 [F042](F042-ojt-progress-management.md) 之既有測試**全數維持綠燈且期望值未經修改**——🔴 **若任何一條既有斷言需要改期望值，即表示本條被違反，必須停下來回報，不得改測試。**

#### `AC-G22` — 🔒 「最近活動」區塊保留、一字不動
**Given** `OQ-D44-05` ＝ 保留
**Then** `role="list" aria-label="最近活動"` 之區塊、其五類 `kind` 對映、未知 `kind` 之中性 fallback、`activityTimeLabel` 之相對時間、空狀態逐字 `目前無最近活動` **全部一字不改**
**And** `GET /admin/dashboard/activity` 之端點、其伺服端過濾與文案決定權**一行未改**。

#### `AC-G23` — 單一聚合失敗不阻斷其餘區塊
**Given** 四張卡／兩張環圖／最新公告／類別分布之任一資料來源丟出例外或回傳非有限值
**When** 頁面載入
**Then** **僅該區塊**降級，其餘區塊照常呈現，整頁不崩潰
**And** 🔴 **降級語意 ＝ 後端「省略該鍵」（`undefined`）＋ 前端呈現 `data-testid="empty-state"`**；🔴 **明文禁止降級為 `0` 或空陣列**
**And** 🔴 **明文禁止**以單一 `try/catch` 包住整個儀表板而使任一失敗導致全頁空白；`dashboard-analytics.service.ts` 對 `cards`／`donuts`／`latestAnnouncements` **各自** try/catch
**And** 🔒 既有 `GET /admin/dashboard/summary` 之 `safe()` → `0` 收斂語意**不變**（`AC-G75`）——**「沿用 `safe()` 之 `0`」僅適用於該既有端點**，不適用於本功能之三個新端點（`AC-G86`）
**And** 📌 本條之載體：純函式／服務層斷言「一個子聚合丟例外時，回應中該鍵不存在、其餘鍵仍為其正確值」；元件層斷言「該鍵缺席時渲染 `empty-state`、其餘區塊數值不變」。

> 📝 **2026-09-21 就地改寫（[architecture-spec §15.12 一 B](../architecture-spec.md#ch15-handback)，lead 裁示採 architect 裁定）。**
> `OLD>` 原第 1 句逐字為「**Then** **僅該區塊**降級（顯示 `data-testid="empty-state"` 之明確未知態，**或沿用既有 `safe()` 之 `0`**），其餘區塊照常呈現，整頁不崩潰」。
> 🔴 **為何禁止降為 `0`**：INV-G1／INV-G2 要求「卡③ ＝ 當月環圖各段總和」「卡① ＝ 累積環圖各段總和」。若環圖降級為空陣列（總和 0）而卡片仍是真實數字，**畫面上就會出現一組對不起來的數字，而且看起來完全像一個計算錯誤**——那正是 `AC-G6`／`AC-G35` 整條 AC 想要防止的形狀。**省略鍵 ＋ 空狀態，使「算不出來」與「真的是 0」在畫面上可分辨。**
> ⚠ 既有 `summary` 之 5 個鍵之間**沒有任何恆等式**，故其 `safe()` → `0` 在那裡是安全的。兩者不同是刻意的。

#### `AC-G24` — 統計卡之數值必須以文字形式存在
**Then** 四張卡之每一個數字皆可由 `getByTestId('stat-value')` 之 `textContent` 取得
**And** 🔴 **卡④ 自 2026-09-21 第七輪起有**兩個**數值節點**（`AC-G13`），其嵢狀約定隨之改寫：
  · `stat-value` 仍為**外層**，其 `textContent` 須**同時含住**環中央之 `{Z}%` 與環旁之 `已完成 {X} / 應完成 {Y}`；
  · 🔴 **兩個內層節點（`[data-ojt-ontime-rate]` 與 `ojt-ontime-value`）仍各自可獨立斷言**；
  · 🔒 **三者皆不得缺一**——只有 `stat-value` ⇒ `AC-G13` 之逐字斷言失去載體；只有內層 ⇒ 本條之「四張卡」在卡④ 落空
📝 `OLD>` 原句為「卡④ 之 `stat-value` 與 `ojt-ontime-value` 為**嵢狀**，兩者 `textContent` **完全相同**」——**「完全相同」該半句因拆成兩個數值節點而作廢**；嵢狀本身仍然成立。
**And** 🔴 **明文禁止**以圖形、進度條寬度、`aria-valuenow` 等**非文字**方式作為某個數值之**唯一**載體。

---

## §乙 · 移除「快速進入功能區」（FR-2 / US-110） {#remove-quick-access}

#### `AC-G25` — 區塊整個移除
**Given** 我以任一後台角色進入 `/admin`
**Then** 整頁 DOM 中逐字 `快速進入功能區` **零命中**
**And** 不存在任何導向側欄功能之卡片格線（`CARD_DESC` 常數、`visibleMenu`／`accessLabelFor` 之 import 於 `DashboardHome.tsx` 一併移除）
**And** 🟢 **已查證**（[事實 #21](#verified-facts)）：`docs/specs/features/` 之下對該字串零命中 ⇒ **本條不作廢任何一條既有編號 AC**，不需要任何「推翻既有條文」之授權。

#### `AC-G26` — 🔒 `受限CRUD` 徽章之載體不因本功能消失
**Given** [F042](F042-ojt-progress-management.md) `AC-28`⑮ 要求 `accessLabelFor` 之 `受限CRUD` 不得落入 `唯讀` 分支
**Then** 該 AC 之載體轉為側欄 `AppShell.tsx`（其亦呼叫 `accessLabelFor`）與 `frontend/src/domain/menu.test.ts` 之純函式測試
**And** 🔒 `accessLabelFor` 本身**一行未改**，其既有測試**全數維持綠燈且期望值未經修改**
**And** 🟢 **已查證**（[事實 #22](#verified-facts)）：移除儀表板卡片不會使該 AC 失去載體。

#### `AC-G27` — prototype 同步
**Then** `prototypes/07-admin-shell.html` 之 `快速進入功能區` 標題、`cardGrid` 容器與 `CARDS`／`renderCards` 相關腳本**一併移除**
**And** 🔒 該檔之側欄 `MENU` 常數**一行未改**
**And** 該檔同步加入本功能之四張卡／兩張環圖／最新公告／長條圖版面（由 ui-ux-designer 執行）。

#### `AC-G28` — 既有測試之處置（降級斷言不得消失）

> 📝 **2026-09-21 建環階段就地更正（ring-f044 實查，lead 裁決）：漣漪是**三處**，不是兩處。**
> `OLD>` 原文逐字為「`frontend/src/pages/DashboardHome.test.tsx` 有**兩處**依賴本區塊…`:190` 之 `getByText('快速進入功能區')` 斷言移除；`:185` 之案例…改寫其載體」。
> 🔴 **實查為 `:77`／`:92`／`:190` 三處**；`:77`／`:92` 是整個 `describe('DashboardHome — KPI 卡（GAP-07-1）')`，其斷言對象**正是 `AC-G1` 要移除的**那個 `role="group" aria-label="待辦提示"` 容器與五張舊 KPI 卡之逐字標題。

**Then** 三處之處置逐項如下（🟢 已由 ring-f044 執行）：

| 位置 | 內容 | 處置 | 授權來源 |
|---|---|---|---|
| `:77`／`:92` | `describe('DashboardHome — KPI 卡（GAP-07-1）')` 共 2 案，斷言 `aria-label="待辦提示"` 容器與五張舊卡逐字標題 | 🔴 **整個 describe 刪除** | 🔒 `OQ-D44-03` ＝ **甲（新 4 張完全取代舊 5 張）**——這是**人類明示授權之刪除**，需於測試檔逐字記錄該出處 |
| `:190` | 含 `getByText('快速進入功能區')` 之案例 | 🔴 **保留、只換載體**（→ `getByTestId('dashboard-stat-cards')`），原措辭以 `OLD>` 逐字保留 | `AC-G84`——已確認它**就是**「活動端點失敗不阻斷儀表板」那一條降級斷言 |

**And** 🔴 **明文禁止**以「該案例依賴已移除的區塊」為由把 `:190` 整案刪除（`AC-G84`）
**And** 🔒 **刪除一組正向斷言的正確作法是把它變成負向斷言，不是讓它蒸發**（🟢 ring-f044 之處置，列為紀律）：
  五個被刪掉的舊 KPI 卡逐字標題（`待確認組織異動`／`未指派節點文件`／`停用帳號待覆核`／`調閱紀錄（近7日）`／`待公布的文件`）
  **沒有靜默消失**——已反轉為 `AC-G1` 之負向鎖：五條 `it.each` 斷言其**於整頁 DOM 零命中** ＋ 一條斷言 `aria-label="待辦提示"` 不存在。
  ⇒ 🔒 **一組斷言被刪時，它所保護的事實必須以相反的方向被重新鎖住。** 否則「這五個字串不再出現」就沒有任何人在看。

#### 🔴 `AC-G28`附 — automock 之漣漪（三份文件皆未涵蓋之一項） {#automock-ripple}

> 🔴 **本項為 2026-09-21 建環階段發現，規格、架構、設計三份文件皆未涵蓋。**

**Given** `frontend/src/pages/DashboardHome.test.tsx` 使用 `vi.mock('../api/endpoints')` 之 **automock**
**When** `DashboardHome` 開始呼叫 `AC-G86` 之三個新端點
**Then** automock 對尚未存在的匹函式回 `undefined` ⇒ `undefined.then(...)` **同步拋出**，且是在任何 `.catch()` 被掛上之前
  ⇒ 🔴 **該檔每一個案例都會死，且死因與它自己的主題完全無關**（歡迎詞、最近活動…全部陣亡）

**And** 🟢 **已處置（ring-f044）**：加一個**前向相容**的 `stubF044Endpoints()`，它**只 stub「已存在的匯出」**（以 `typeof fn.mockResolvedValue === 'function'` 守衛）
  · **今天**：三個端點尚未存在 ⇒ 完全的 no-op；
  · **端點落地當下**：自動生效，不需再改該檔。
  · 🔴 **刻意不寫成** `vi.mocked(endpoints.getDashboardAnalytics).mockResolvedValue(...)`——那會在**今天**就引爆該檔。

> 🔒 **提煉為可複用紀律（本條真正的價值）**：
> 🔴 **凡既有測試檔使用 automock（`vi.mock('模組'\)` 無工廠），且被測元件將新增對該模組之呼叫，則該檔在新呼叫落地當下會整檔死亡，死因與各案例主題無關。**
> ⇒ 這種漣漪**不會出現在「哪些 AC 受影響」的清單裡**，因為它不是 AC 層的問題，是**測試基礎設施層**的問題。
> ⇒ 🔒 **漣漪盤點時除了問「哪些 AC」、「哪些檔案」，還要問「哪些測試檔 mock 了我即將改動的那個模組」。**

---
---

## §丙 · 兩張環圖（FR-3 / US-111） {#donuts}

> 🔴 **兩個區塊共用同一套規則，唯一差異是時間窗口。** 下列 `AC-G29`～`AC-G50` 之每一條**同時適用於兩個區塊**，除非該條明文指定區塊。
> 📌 **為何共用**：頁籤、圖例、分組、組織解析、預設值判定逐項相同。寫成兩份規格與兩套測試，就是製造「其中一處日後漏改」的機會。

#### `AC-G29` — 兩個區塊之逐字標題與共用規則
**Then** 存在兩個 `role="region"` 區塊，`aria-label` 逐字為 `當月已公告`（`data-testid="donut-month"`）與 `累積已公告`（`data-testid="donut-cumulative"`）
**And** 兩者之頁籤集合、圖例格式、分組鍵、組織名解析與預設頁籤判定**完全相同**
**And** 時間窗口：前者僅計 `announcedDate ∈ 當月`（與 `AC-G4`／`AC-G5` **同一個窗口定義點**），後者不限時間。
**And** 🔴 **2026-09-21 人類裁決第二輪：本條之說明性文字須依 [`AC-G94`／`AC-G95`](#rationale-out) 拆為【可見】與【ⓘ popover】兩部分**，逐字新文案見 [§癸四 逐處處置表](#rationale-sites) 第 5 列。🔒 **本條之其餘要求（數字、門檻、不變式）一字未改**。

#### `AC-G30` — 環之分段語意
**Then** 環之**每一段 ＝ 一個組織**（隨當前頁籤為公司／本部／部門），段之大小對應該組織之**已公告**份數
**And** 🔴 **明文禁止**把環做成「已公告 vs 進度中」兩段——那會讓三個組織維度頁籤完全失去意義（兩段不隨頁籤改變），與使用者原文自相矛盾（`OQ-D44-16`）
**And** 每一段之值恆 ≥ 1（分段來自已公告集合，不存在 0 份之段）。

#### `AC-G31` — 三個維度頁籤：逐字、順序、`tablist` 語意、鍵盤可操作
**Then** 存在 `role="tablist"`、`aria-label="制定組織維度"`、`data-testid="org-dimension-tabs"` 之頁籤列
**And** 其內恰 3 個 `role="tab"`，`textContent` 依序逐字為 `依制定公司`、`依制定本部`、`依制定部門`
**And** 當前選取者 `aria-selected="true"`，其餘為 `"false"`；面板為 `role="tabpanel"` 且以 `aria-labelledby` 指向當前 tab
**And** 🔴 可以鍵盤操作（`←`／`→` 切換、`Enter`／`Space` 選取），以 `user-event` 驗證（比照 [F042](F042-ojt-progress-management.md) TAB bar 之既有實作）。

#### `AC-G32` — `依制定公司` 維度之分組鍵與標籤
**Then** 分組鍵 ＝ `companyCode`
**And** 標籤 ＝ `resolveCompanyShortName(companyCode)`
**And** 🔴 查無簡稱時 ⇒ 標籤為 **`companyCode` 之原字串**（不得顯示 `null`／`undefined`／`—`／空白；比照既有寬容處置），**且不得歸入 `未指定` 段**——「查不到簡稱」與「沒有制定公司」是兩件不同的事。

#### `AC-G33` — `依制定本部` 維度之上溯規則
**Then** 本部 ＝ 自 `draftingDeptId` 沿 `ORG_UNIT.parentCode` **上溯至第一個 `tier === 'DIVISION'` 之單位**
**And** 上溯須具**循環守衛**（以已訪集合防資料異常造成無窮迴圈，比照 `orgAncestorPathLabel` 之既有作法）
**And** 上溯之查表範圍**限於該文件之 `companyCode`**——`ORG_UNIT` 唯一鍵為 `(companyCode, orgCode)`，🔴 **明文禁止**跨公司查表（本 repo 2026-09-07 已記錄「以登入者公司解析他公司資料、把錯值用正確的人名遮住」之缺陷）
**And** 分組鍵 ＝ `(companyCode, divisionOrgCode)` 之複合鍵。

#### `AC-G34` — 兩個「無法解析」之分段：`未指定` 與 `無本部`，禁止排除
**Then** 下列兩種情形各自成為**獨立分段**，**明文禁止排除**（`OQ-D44-18` ＝ 甲、`OQ-D44-19`）：

| 情形 | 逐字段名 | 三個維度下之行為 |
|---|---|---|
| `draftingDeptId` 為 `null`（或查無該 `orgCode`） | `未指定` | 三個維度**皆**歸入此段 |
| `draftingDeptId` 有值，但沿 `parentCode` 上溯**無** `DIVISION` 祖先 | `無本部` | **僅 `依制定本部` 維度**歸入此段；`依制定部門` 維度照常以其部為一段；`依制定公司` 維度照常以其公司為一段 |

**And** 🔴 **兩段刻意分開、不得合併**：合併會讓「完全沒填制定部門」與「填了但組織樹結構特殊」這兩個不同的資料品質問題變成同一個數字，而它們的處理方式完全不同。`OQ-D44-19` 之裁決明文允許 `無本部` 作為獨立段名
**And** 🔴 **排除會使環圖各段總和 ≠ 卡片數字**（INV-G1／INV-G2），而畫面上沒有任何線索說明差額從哪來——那是最難查的一種不一致。

#### `AC-G35` — 🔒 INV-G2 恆等鎖：卡① ＝ 環圖區塊「累積已公告」各段總和
**Given** 任一份語料
**Then** 對**三個維度各自**，`Σ(累積已公告各段之已公告數) === 卡① 之值`
**And** 🔴 該總和**必須包含** `未指定`／`無本部`／`其他` 段
**And** 📌 斷言形狀同 `AC-G6`（純函式對純函式，不經畫面）。

#### `AC-G36` — 組織標籤之組裝：沿用既有函式，禁止第二套
**Then** 各維度之圖例標籤逐項為：

| 維度 | 標籤格式 | 組裝方式 |
|---|---|---|
| `依制定公司` | `{公司簡稱}` | `resolveCompanyShortName` |
| `依制定本部` | `{公司簡稱} / {本部名}` | `[公司簡稱, orgUnitDisplayName(division)].join(ORG_PATH_SEPARATOR)` |
| `依制定部門` | `{公司簡稱} / {本部名} / {部名}` | `[公司簡稱, orgUnitDisplayName(division), orgUnitDisplayName(dept)].join(ORG_PATH_SEPARATOR)` |

**And** 🔴 **必須沿用既有 `orgUnitDisplayName` 與 `ORG_PATH_SEPARATOR`，明文禁止另寫第二套組裝、禁止寫死 `' / '`**（`OQ-D44-19`）
**And** **空段自動收合、不產生連續或尾綴分隔符**（沿用 `buildOrgPath` 之既有紀律）——⚠ 故 `依制定部門` 維度下某文件之部若無 `DIVISION` 祖先，其標籤為 `{公司簡稱} / {部名}`（本部段收合），**不插入 `無本部` 字樣**。📌 這是 `[ASSUMPTION] A-G1`，見 [§開放問題](#open-questions)
**And** 🔴 **`未指定` 與 `無本部` 兩段之標籤為該逐字值本身**，不加公司前綴（它們是「解析不出來」的桶，不屬於任何一家公司）。

#### `AC-G37` — 圖例之逐列格式與 DOM 契約
**Then** 圖例為 `role="list"`、`data-testid="donut-legend"`
**And** 每一列為 `role="listitem"`、`data-testid="donut-legend-row"`、帶 `data-org-key="{分組鍵}"`
**And** 每列恰含：① 色塊（純裝飾，`aria-hidden="true"`）；② `data-testid="legend-org-name"` ＝ `AC-G36` 之標籤；③ `data-testid="legend-announced"` ＝ 逐字 `已公告 {n}`；④ `data-testid="legend-in-progress"` ＝ 逐字 `進度中 {n}`
**And** 🔴 **每一個數字都必須以文字形式存在於 DOM**——**明文禁止**讓某個數值之唯一載體是 SVG `path` 之 `d` 屬性、`stroke-dasharray`、`width`／`height` 或 `title` 之 tooltip（`AC-G53`）。

#### `AC-G38` — 🔒 INV-G6：兩區塊之「進度中」恆等；圖例列集合 ＝ 環段集合
**Then** 圖例之列集合**恰等於**該區塊之環段集合（不多不少）
**And** 對**同時出現於兩個區塊**之組織，其 `進度中 {n}` 之 `n` **恆等**（`OQ-D44-17` ＝ 甲）
**And** ⚠ **某組織可能只出現於 `累積已公告` 而不出現於 `當月已公告`**（該組織當月沒有公告）——這是正確行為
**And** 🔴 「進度中」**沒有時間維度**（它是「當下尚未到公告日」之狀態）⇒ 兩處同值是同一個事實，不是複製貼上的錯誤。**本條之存在就是為了讓日後有人發現兩處一樣時，不會把它「修好」。**
**And** 🔴 **2026-09-21 人類裁決第二輪：本條之說明性文字須依 [`AC-G94`／`AC-G95`](#rationale-out) 拆為【可見】與【ⓘ popover】兩部分**，逐字新文案見 [§癸四 逐處處置表](#rationale-sites) 第 3 列。🔒 **本條之其餘要求（數字、門檻、不變式）一字未改**。

#### `AC-G39` — 🔴 INV-G3：卡②「進度中」與圖例進度中總和之**刻意不等**
**Then** 規格明文記載：`卡② 之值` **不必等於** `Σ(圖例各列之進度中數)`
**And** 🔴 **測試必須以一份「使該不等實際發生」之語料鎖住它**——語料須含一個**只有進度中文件、沒有任何已公告文件**之組織。在該語料下：① 該組織**不出現**於任一環段與圖例列；② `卡② > Σ(圖例進度中)`
**And** 🔴 **為何要主動鎖住一個不等式**：不鎖，日後有人會「發現兩個數字對不上」而去把圖例補上零已公告的組織——那會讓環圖出現 0 度的段，並破壞 `AC-G30`。

#### `AC-G40` — Top N ＋ `其他` 合併段
**Given** 部門維度在正式站可達 40+ 段
**Then** 環**圖形**上之段數以 Top N 限制（N 之值交 ui-ux-designer 裁量並回填 [§命名鎖定](#naming-lock)），其餘合併為逐字 `其他` 之單一段
**And** 🔴 `其他` 段之值 ＝ 被合併之各組織已公告數之**總和**（不得四捨五入、不得省略）
**And** 🔴 合併**不得**改變 `AC-G6`／`AC-G35` 之總和恆等。
**And** 🔴 **2026-09-21 人類裁決第二輪：本條之說明性文字須依 [`AC-G94`／`AC-G95`](#rationale-out) 拆為【可見】與【ⓘ popover】兩部分**，逐字新文案見 [§癸四 逐處處置表](#rationale-sites) 第 2 列。🔒 **本條之其餘要求（數字、門檻、不變式）一字未改**。

#### `AC-G41` — 圖例保留完整列表，不受 Top N 限制
**Then** 圖例（`data-testid="donut-legend"`）**列出全部組織**（含被合併進 `其他` 段者），可捲動
**And** 🔴 **上限只保護圖形版面，不得隱藏資料**——`getByTestId('donut-legend-row')` 取得之列數 ＝ 該窗口下有已公告文件之相異組織數（＋ `未指定`／`無本部` 段，若非空）
**And** ⚠ 故 `其他` 段在**圖形**上是一段、在**圖例**上不是一列（圖例列的是真實組織）。此不對稱刻意，須於實作中明文註記。

#### `AC-G42` — 預設頁籤之判定純函式（🔴 **後端**純函式，非元件層 AC）

> 🔴 **2026-09-21 載體更正——本條與 `AC-G43` 自此為「純函式層 AC」，不是「元件層 AC」。**
> **因果**：`ARCH-G2` 裁定 `defaultDimension` 由端點直接回傳、`SessionUser` 一欄未加 ⇒ **前端不再持有職位白名單** ⇒ ui-ux-designer 已依指示自 `prototypes/07-admin-shell.html` 移除 `JOB_POSITIONS`／`resolveJobPositionName`／`DIM_COMPANY_TITLES`／`DIM_DIVISION_TITLES`／`defaultOrgDimension` 五個常數與函式（原文以 `OLD>` 逐字保留於該檔）。
> ⇒ 原本指望的「`AD|B01 本處長` 這個下拉選項」作為「禁以 `code` 比對」在**畫面上**的可觀察載體，**已不存在**。
>
> 🔴 **值得寫進檔案的教訓**：**一個架構決策（把判定搬到後端）可以讓一條 AC 的載體在無人察覺之下蒸發。** 本輪之機器閘門**不會**發現這件事——`AC-G42` 的條文一個字都沒變、既有測試也沒有翻紅，它只是**沒有任何東西再驗它了**。這一次是 ui-ux-designer 主動提報才抓到的。
> ⇒ 🔒 **凡本輪之後再有「把某段判定換一層執行」的決策，必須逐條回頭問：那條 AC 的載體還在嗎。**

**Then** 存在**後端**純函式 `defaultOrgDimension(jobPositionName: string | null): 'company' | 'division' | 'department'`（落點 `backend/src/dashboard/default-org-dimension.ts`，[architecture-spec §15.3](../architecture-spec.md#ch15-g2)），其規則為（🔒 逐字白名單）：

| `jobPositionName`（trim 後**完整字串相等**） | 輸出 |
|---|---|
| `董事長`／`總經理` | `'company'`（依制定公司） |
| `本部長`／`副本部長` | `'division'`（依制定本部） |
| **其餘一切**（含 `null`、空字串、`部長`、`處長`、`本處長`、`室長`、`科長`、一般職…） | `'department'`（依制定部門） |

**And** 🔴 比對為 **trim 後之完整字串相等**，**明文禁止** `includes`／`startsWith`／正則部分比對——`副總經理`（若上游日後新增）在 `includes` 之下會被誤判為 `'company'`
**And** 🔵 **`副本部長` 逐字保留**（`OQ-D44-20` b）：已查證該值**不存在於上游已記錄之 75 列職位名稱**，全 repo grep 零命中 ⇒ 它目前**不會命中任何人**，屬使用者明文指定之無害前瞻條目
**And** ⚠ **對 test-generator 之明文提醒**：針對 `副本部長`（與 `副總經理`）之斷言在真實語料下**沒有載體**，只能以人工 fixture 驗證純函式；🔴 **不得**宣稱它在實機上被驗過。
**And** 🔒 **本條之全部向量落在後端 jest**（[§癸 (d)](#corpus)）；🔴 **前端 vitest 不承擔本條任何一個向量**——前端已無此判定邏輯可測（見上方載體更正）。

#### `AC-G43` — 職位名之解析：禁跨公司 fallback、禁以 `code` 比對（🔴 **後端**，非元件層）
> 🔴 載體同 `AC-G42`：**後端純函式／服務層**。`buildJobPositionResolver` 與 `JOB_POSITION` 對照表**只有後端讀得到**——這正是 `ARCH-G2` 選乙案的決定性理由。

**Then** `jobPositionName` **必須**先以 `(companyCode, jobPositionCode)` 經既有 `buildJobPositionResolver` 解析取得
**And** 🔴 **明文禁止跨公司 fallback**（沿用 `job-position-directory.ts` 之既有紀律）；查無 ⇒ `null` ⇒ `AC-G42` 落入 `'department'`
**And** 🔴 **明文禁止**以 `code` 直接比對（例：`code === 'B01' → division`）——實查 `B01` 於 AS/AE ＝ `本部長`、於 **AD ＝ `本處長`**；AD 沒有本部層，其 `B01` 落到「制定部門」是**正確**的，不是將就
**And** 📌 **這樣就對了、且不需要維護跨公司代碼白名單**：名稱本身已承載語意差異。

#### `AC-G44` — 可手動切換、不跨 session 記憶
**Given** 預設頁籤已依 `AC-G42` 選取
**When** 我點擊另一個頁籤
**Then** 該區塊切換至該維度並重繪環與圖例
**And** 🔴 **不記憶**（`OQ-D44-20` d）：重新整理或再次進入首頁 ⇒ 回到**職位預設值**，不是上次的選擇
**And** 🔴 **明文禁止**寫入 `localStorage`／`sessionStorage`／使用者偏好表
**And** 📌 **可測形狀**：`unmount` 後重新 `render` ⇒ 選取之 tab 回到 `defaultOrgDimension(...)` 之輸出。

#### `AC-G45` — 兩個區塊之頁籤是否連動
**Then** 🔵 **建議＝兩個區塊各自獨立切換**（各有一組 `tablist`，`data-testid` 分別為 `org-dimension-tabs`，以其所屬 `region` 限定容器）
**And** 🔴 **斷言必須先限定容器**（`within(getByTestId('donut-month'))`）——🔴 **明文禁止**全域 `getByRole('tab', { name: '依制定公司' })`：兩個區塊各有一組同名頁籤，全域查詢會拋 multiple elements 或悄悄命中錯的那一個
**And** 📌 此為 `[ASSUMPTION] A-G2`，最終交 ui-ux-designer 裁量並回填本條（若裁為連動，須改為單一共用 `tablist`，並刪除本條之「各自獨立」措辭）。

#### `AC-G46` — 空狀態
**Given** 當月無任何已公告文件
**When** 渲染 `當月已公告` 區塊
**Then** 呈現 `data-testid="empty-state"` 之明確提示
**And** 🔴 **不得**為空白畫布、**不得**為 0 段之環、**不得**只有一個標題
**And** ⚠ 此狀態在**每月 1 日 UTC 00:00 起至當月第一份文件公告為止**必然發生，不是邊角案例。

#### `AC-G47` — 資料可見範圍＝全量
**Given** `OQ-D44-21` ＝ 甲
**Then** 四種後台角色看到的統計母體**皆為全公司全量**
**And** 🔴 **後台不引入任何可見範圍過濾**——[F041](F041-user-subtype-business-scope.md) 之使用部門可見性**只作用於前台**，本功能不得把它搬到後台
**And** 🔒 **回歸鎖**：同一角色於首頁看到的 `已公告` 總數，與其在 `/admin/documents` 不套任何篩選時之已公告計數**恆等**。

#### `AC-G48` — 自繪 SVG，不引入第三方圖表庫
**Given** `OQ-D44-29` ＝ 甲
**Then** 環圖與長條圖**以自行繪製之 SVG 實作**（環＝`<circle>` 之 `stroke-dasharray` 或 `<path>` 弧；長條＝矩形）
**And** 🔴 **`frontend/package.json` 之 dependencies 不得新增任何項目**——🔒 **回歸鎖**：斷言其 dependencies 鍵集合與本功能導入前**完全相同**
**And** 🔴 **明文禁止** `<canvas>`：canvas 之內容無法被任何 RTL 斷言取得，在本輪之簡化環下等於整個圖表不可驗證。

#### `AC-G49` — 環圖之 SVG 須為裝飾層，語意由文字承載
**Then** 環之 `<svg>` 標為 `aria-hidden="true"`（或 `role="presentation"`）
**And** 🔴 **每一段所代表之組織與數字，其唯一權威載體為圖例之文字節點**（`AC-G37`）——這使「圖畫錯了但數字對」與「數字錯了」在測試上成為兩件可分辨的事，而本輪只保證後者
**And** ⚠ **須明確接受之代價（已記入 [§癸](#corpus)）**：本輪之閘門**無法**驗證「弧長是否與數字成比例」。⇒ 🔴 **弧長計算必須抽為純函式** `donutSegments(values: number[]): {offset: number; length: number}[]`，並以固定向量斷言其輸出（含總和為周長、單一值佔滿、零值不產生段三個向量）——這是把幾何正確性拉回可測範圍的唯一途徑。

#### `AC-G50` — 顏色不得為唯一區分手段
**Then** `已公告` 與 `進度中` 之區分**必須另有文字標籤**（`AC-G37` 之逐字前綴已滿足）
**And** 各組織之區分**必須**另有文字（圖例之組織名）
**And** 🔴 **明文禁止**任何「只有看顏色才知道是哪一個」之資訊。

---

## §丁 · 最新公告（ICSOP 版本更新）清單（FR-4 / US-112） {#latest}

#### `AC-G51` — 區塊標題、DOM 契約與欄位恰四欄
**Then** 存在 `role="region"`、`aria-label="最新公告（ICSOP 版本更新）"`、`data-testid="latest-announcements"` 之區塊
**And** 其內表格之 `role="columnheader"` **恰 4 個**，`textContent` 依序逐字為 `公告日`、`版次`、`程序書書名`、`狀態`
**And** 🔴 **恰四欄**（使用者原文明訂）——**明文禁止**順手加上「文件編號」「制定部門」等第五欄。

#### `AC-G52` — 母體
**Then** 母體 ＝ `{ d : d.status === 'active' ∧ d.announcedDate !== null }`（`OQ-D44-22` c＋d）
**And** 🔴 `inactive`／`void` **排除**；`announcedDate` 為 `null` 者**排除**（無公告日無法參與「依公告日降冪」之排序）
**And** ⚠ 依降冪 ⇒ **未來公告日者排在最上方、狀態顯示 `進度中`**。這是刻意的：若只含已公告，`狀態` 欄將恆為同一值、零資訊量——使用者要這一欄，正說明他預期看得到不只一種狀態。

#### `AC-G53` — 排序與 tie-break：禁止 `localeCompare`
**Then** 依 `announcedDate` **降冪**
**And** 🔴 同日者以 `documentNumber` **昇冪**為 tie-break，比較子為**序數比較**（`a < b ? -1 : a > b ? 1 : 0`）
**And** 🔴 **明文禁止** `localeCompare`——本 repo 已記錄「同一份資料在不同機器排出不同順序、測試一邊綠一邊紅」之 ICU 定序漂移缺陷
**And** 🔴 排序必須**完全決定性**：仍同值時以 `documentId` 昇冪收尾
**And** 📌 **可測形狀**：純函式 `latestAnnouncements(docs, limit)`；斷言須含「兩份同日文件」之向量。

#### `AC-G54` — 筆數上限
**Then** 只呈現前 **10** 筆（`OQ-D44-22` a）
**And** 上限套用於**排序之後**（先排序、再截斷；🔴 先截斷再排序會得到錯的十筆，且在小語料下看不出來——語料須含 ≥ 12 筆）。

#### `AC-G55` — 狀態欄之值
**Then** `狀態` 欄顯示**衍生顯示狀態**之逐字值（`DISPLAY_LABEL`：`已公告`／`進度中`／`失效`／`作廢`），**不是**原始 `status`（`active`／`inactive`／`void`）
**And** 🔒 與卡片、環圖、長條圖**同源於 `deriveDisplayStatus`**（INV-G7）
**And** ⚠ 在 `AC-G52` 之母體下，實際只會出現 `已公告` 與 `進度中` 兩值——**但映射表不得因此裁減為兩值**（裁減會讓它與 `DISPLAY_LABEL` 分家）。

#### `AC-G56` — 版次與公告日之呈現
**Then** `版次` 欄於 `edition === null` 時顯示逐字 `未設版次`（🔒 沿用 [F042](F042-ojt-progress-management.md) 之 `EDITION_NONE_TEXT`，**禁止新增第二個常數**），**不留白、不假造版次字串**
**And** `公告日` 欄格式為 `YYYY-MM-DD`，**以 UTC 拆解**（比照 `todayIsoDate`／`trainingDueDate` 之既有紀律）
**And** `程序書書名` 欄顯示 `documentName`；過長時可截斷顯示，但 🔴 **完整值必須仍可由 `title` 屬性或 `aria-label` 取得**（不得成為不可取得之資訊）。

#### `AC-G57` — 空狀態
**Given** 母體為空
**Then** 呈現 `data-testid="empty-state"` 之明確提示，**不得空白**
**And** 提示須說明資料從何而來（比照 [F042](F042-ojt-progress-management.md) `EMPTY_ALL_HINT` 之既有作法：不留下「什麼都沒有、也看不出該去哪裡」的死路）。
**And** 🔴 **2026-09-21 人類裁決第二輪：本條之說明性文字須依 [`AC-G94`／`AC-G95`](#rationale-out) 拆為【可見】與【ⓘ popover】兩部分**，逐字新文案見 [§癸四 逐處處置表](#rationale-sites) 第 6～9 列。🟢 **2026-09-21 就地更正**：第 6～9 項之引導文字**改回可見、不得收進 ⓘ**（它們回答的是「接下來該去哪裡」，而空狀態正是最需要引導的時刻）；但其中三條混有內部詞彙，**必須以使用者語言重寫**。🔒 **本條之其餘要求（數字、門檻、不變式）一字未改**。

#### `AC-G58` — `查看更多` 之逐字、閘門與導向
**Given** 我的角色對 `ICSOP文件管理` 有讀取權
**Then** 區塊中存在 `role="link"`、`textContent` 逐字為 `查看更多` 之連結
**And** 🔴 閘門**必須**為 `canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')`——**直接讀矩陣、禁止寫成角色清單**
**And** **When** 我點擊它，**Then** 導向 `/admin/documents?sortBy=announcedDate&sortDir=desc`
**And** 🔴 **不帶狀態篩選**（`OQ-D44-23`）：連結叫「查看更多」，帶篩選會看到**更少**
**And** ⚠ 對 `DeptContact`（`ICSOP文件管理` ＝ `READ`）本連結**仍然呈現**——四種後台角色皆有讀取權，故本閘門於畫面上目前恆為真；其鑑別力載體為純函式層之直接斷言（同 `AC-G18` 之附註）。

#### `AC-G59` — `DocumentListPage` 新增 URL 排序參數之讀取
**Given** 現況 `sortBy`／`sortDir` 為純前端 `useState`、不讀 URL（[事實 #16](#verified-facts)）
**Then** 新增自 `useSearchParams` 取樣之能力，🔴 **於 `useState` 之初始化函式即取樣**——照抄同頁 `readSubtreeParams`／`readBcSubtreeParams` 之既有紀律，否則首屏會先閃一次未排序之清單
**And** 🔒 參數名與值域**逐字沿用既有型別**：`sortBy ∈ {'documentNumber', 'announcedDate'}`、`sortDir ∈ {'asc', 'desc'}`
**And** 🔴 **參數缺席或值不可辨識 ⇒ 靜默 no-op、退回既有預設**（`sortBy=''`／`sortDir='asc'`），不回錯誤、不 toast
**And** 🔴 **排序仍在客端執行、仍不送後端**——本條只新增「初始值從哪裡來」，**不改變排序的執行位置**
**And** ⚠ 🔒 **既有落差本輪不動**（`OQ-D44-23` 第三題）：客端排序對 `announcedDate` 為 null 之處置（`?? ''`）與後端 `applyDocumentQuery`（null 一律排最後、不受方向影響）**語意不同**。這是既有落差、與本需求無關，🔴 **明文禁止本輪順手對齊**（對齊會改動 [F017](F017-backend-document-list.md) 之既有行為與測試期望值，需另行授權）。

---

## §戊 · 依業務/功能類別分布之雙色長條圖（FR-5 / US-113） {#category-bar}

#### `AC-G60` — 區塊標題與 DOM 契約
**Then** 存在 `role="region"`、`aria-label="依業務/功能類別分布"`、`data-testid="category-distribution"` 之區塊（🔒 `業務/功能類別` 為 [F043](F043-business-function-category.md) 鎖定字串：**半形斜線、前後無空白**）
**And** 其內為 `role="list"`，每條長條為 `role="listitem"`、`data-testid="category-bar-row"`、帶 `data-category-id="{id}"`
**And** 每條含三個文字節點：`bar-category-name`（＝ `businessCategoryDisplayName`）、`bar-announced`（逐字 `已公告 {n}`）、`bar-in-progress`（逐字 `進度中 {n}`）。

#### `AC-G61` — 統計單位＝類別，同一類別內去重
**Given** `BUSINESS_CATEGORY_DOC` 之唯一鍵為 `(nodeId, documentId)` ⇒ 同一份文件可掛在同一類別的**多個節點**
**When** 計算某類別之文件數
**Then** 統計單位為**類別**（非節點），同一份文件在同一類別內**只計一次**（相異 `documentId` 計數）
**And** 🔴 **必須沿用 [F043](F043-business-function-category.md) `AC-01` 既有之類別層口徑「掛載文件數（去重後之相異文件數）」，明文禁止另寫第二份去重邏輯**——否則類別池清單與首頁長條圖會出現兩個不同的「掛載文件數」
**And** 🔴 類別層之文件集合**必經 `BUSINESS_CATEGORY_DOC` → `BUSINESS_CATEGORY_NODE` join**（F043 決策 E9：刻意不放冗餘 `businessCategoryId` 欄）
**And** ⚠ **一份文件掛在多個「不同」類別時，在每一個類別各計一次**——這是 INV-G4 之成因，不是缺陷。

#### `AC-G62` — 計入之文件狀態：僅 `active`，分兩色
**Then** **僅計入 `status === 'active'`**，並依 `deriveDisplayStatus` 分為 `已公告` 與 `進度中` 兩段
**And** 🔴 `inactive`／`void` **完全不計入**（`OQ-D44-26`）——雙色既然逐字就是那兩種，第三、四種狀態沒有可落之色
**And** 🔒 判定同源於 `deriveDisplayStatus`（INV-G7）。

#### `AC-G63` — 類別之取捨
**Then** `status === 'inactive'` 之類別**不顯示**（`OQ-D44-25` a）
**And** ⚠ 🔴 **與 [F043](F043-business-function-category.md) `OQ-B-04`（後台文件清單第 16 欄仍顯示停用類別之掛載）刻意不同**——那一處在講「這份文件掛過什麼」（歷史事實），這一處在講「目前有哪些類別」（現況看板）。🔴 **不得為了一致而對齊**
**And** 掛載文件數（已公告＋進度中）為 **0** 之類別**不顯示**（`OQ-D44-25` b；長度為 0 的長條只佔版面、不帶資訊）
**And** ⚠ 一個類別可能「有掛載文件，但全部是 `inactive`／`void`」⇒ 在 `AC-G62` 之下其兩段皆為 0 ⇒ **不顯示**。這與「完全沒有掛載」在畫面上不可分辨，屬已接受之代價。

#### `AC-G64` — 排序：完全決定性，禁止 `localeCompare`
**Then** 依 `已公告 + 進度中` 之總數**降冪**
**And** 同值時依 `businessCategoryDisplayName` **昇冪**，比較子為**序數比較**（`<`／`>`）
**And** 仍同值時依 `categoryId` 昇冪收尾（絕對決定性）
**And** 🔴 **明文禁止** `localeCompare`——中文類別名在不同 ICU 版本／不同機器下定序不同，本 repo 已記錄該形狀之缺陷（測試一邊綠一邊紅）
**And** 📌 **可測形狀**：純函式 `categoryDistribution(rows)` → 已排序之陣列。
  🔒 **主向量 ＝「兩個總數相同、顯示名不同之類別」**（驗第 2 層之序數比較）——這是**真實語料中確實會出現**的形狀。
  ⚠ 第 3 層（`categoryId` 收尾）之向量見下方註記。

> 📝 **2026-09-21 就地更正（ui-ux-designer 提報，spec-writer 已獨立覆核）。**
> `OLD>` 原逐字為「斷言須含『兩個總數相同之類別』與**『兩個顯示名相同之類別（不同 id）』**兩組向量」。
>
> **designer 之提報**：`(name, subcategory)` 唯一性（[F043](F043-business-function-category.md) **INV-B1**，比對涵蓋全部列不分 `status`）使「兩個顯示名相同、id 不同之類別」**結構上不可能存在** ⇒ 該向量在真實語料中恆無載體，與 [§癸](#corpus) 開頭警告的形狀相同。
>
> **spec-writer 覆核結果（🔵 部分成立，結論相同但理由要修正）**：
> - 🟢 **INV-B1 確實存在**（`checkBusinessCategoryUniqueness()` 之 ② `BUSINESS_CATEGORY_DUPLICATE`，`backend/src/business-categories/business-category-subcategory.ts`），且 `businessCategoryDisplayName` ＝ `lifecycleDisplayName` 之別名，格式為 `名稱（子分類）`／`名稱`（全形括號、無空白）。
> - ⚠ **但「結構上不可能」略微過強**：INV-B1 鎖的是 `(name, subcategory)` **這個配對**，不是 displayName 字串本身。反例——`{name: '授信（消金）', subcategory: null}` 與 `{name: '授信', subcategory: '消金'}` 之配對**不同**（INV-B1 不擋）、`name` 也不同（INV-B2 不擋），但**兩者之 displayName 都是 `授信（消金）`**。
> - ⇒ 🔒 **正確的結論**：該碰撞**只在「名稱本身含全形括號」這個病態輸入下可達**，正常業務資料不會出現。
>
> **⇒ 處置（三項）**：
> 1. 🔒 **主向量改為「兩個總數相同、顯示名不同之類別」**（如上）。
> 2. 🔒 **第 3 層 `categoryId` 收尾之條文保留不動**——上述反例證明 displayName 碰撞**確實可達**，這一層不是多餘的保險。
> 3. ⚠ **若仍要為第 3 層寫向量，必須以 `{name: 'X（Y）', subcategory: null}` ＋ `{name: 'X', subcategory: 'Y'}` 建構，並在測試註解明記其為人工 fixture**；🔴 **不得宣稱它在實機／真實語料上被驗過**（比照 `AC-G42` 之 `副本部長` 註記）。

#### `AC-G65` — 筆數上限與展開
**Then** 預設只呈現前 **10** 條（`OQ-D44-25` d；🔒 ui-ux-designer 已定案 `CATEGORY_LIMIT = 10`）
**And** 🔒 **兩個逐字按鈕文案，且兩者「互斥存在」**（2026-09-21 ui-ux-designer 回填並升為鎖定值）：

| 狀態 | 逐字按鈕 | 該狀態下另一顆按鈕 |
|---|---|---|
| **未展開**（只顯示前 10 條） | 🔒 **`顯示全部類別`** | 🔴 `僅顯示前 10 類` **不得存在於 DOM** |
| **已展開**（顯示全部） | 🔒 **`僅顯示前 10 類`** | 🔴 `顯示全部類別` **不得存在於 DOM** |

**And** 🔴 **「互斥存在」本身是一條可驗的性質，必須斷言，不只是描述**：未展開態 `queryByText('僅顯示前 10 類')` 為 `null`、已展開態 `queryByText('顯示全部類別')` 為 `null`
> 🔴 **為何要鎖這個性質**：designer **刻意**讓 `顯示全部類別` 只存在於未展開態，使「存在性斷言」具有鑑別力。若兩顆按鈕同時在 DOM 裡（例如以 `hidden` 切換），`getByText('顯示全部類別')` 在**兩種狀態下都會通過** ⇒ 整條展開／收合的 AC 退化為恆真。這正是 [§癸](#corpus) 通篇在防的形狀。
> ⚠ 連帶後果：本條**明文禁止**以 `hidden`／`display:none`／`disabled` 切換這兩顆按鈕，必須是**條件渲染**（進不進 DOM）。

**And** ⚠ `僅顯示前 10 類` 之 `10` 隨 `CATEGORY_LIMIT` 而動 ⇒ 🔒 **測試須由同一個常數推導該字串，不得寫死 `'僅顯示前 10 類'` 字面**（否則調整上限時會同時改壞實作與測試的期望值，而那一改是「改測試期望值」——[§庚](#regression-lock) 明文禁止的動作）
**And** 🔴 **上限只保護版面，不得隱藏資料**——展開後 `getAllByTestId('category-bar-row')` 之列數 ＝ 通過 `AC-G63` 之類別總數
**And** ⚠ 類別總數 **≤ 10** 時**兩顆按鈕皆不存在**（無可展開之物），改以一行說明承載「已全部列出」；🔴 **語料必須同時含「超過 10 類」與「不足 10 類」兩種規模**，否則此分支恆不可達
**And** 展開狀態**不跨 session 記憶**（比照 `AC-G44`）。

#### `AC-G66` — 可見性閘門：直接讀矩陣
**Given** `FunctionKey.BUSINESS_CATEGORY_MANAGEMENT` ＝ `SysAdmin:READ`／`ICSOPAdmin:CRUD`／`Supervisor:READ`／**`DeptContact:NONE`**／`User:NONE`
**Then** 對 `DeptContact`，本區塊（`data-testid="category-distribution"`）**完全不進 DOM**
**And** 🔴 閘門**必須**為 `canPerform(role, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')`——**直接讀矩陣值**，🔴 **明文禁止**寫成角色清單（`role !== 'DeptContact'`）。理由逐字比照 `canSeeLifecycleDimension` 之既有註解：「寫成角色清單也能過測，但下次矩陣一動，這裡就會與真正的授權分家」
**And** 🔴 **對 `DeptContact` 而言，`GET /admin/dashboard/category-distribution` 也不得被呼叫**（避免在網路層洩漏他看不到的功能之統計）——前端閘門須在發起請求之前生效
**And** 🔴 **前端閘門與後端閘門兩道都要有，缺一不可**（2026-09-21 補明，[architecture-spec §15.5 ②](../architecture-spec.md#ch15-contracts)）：
  · **前端閘門**決定區塊進不進 DOM、請求發不發（上兩句）；
  · **後端閘門**＝`DashboardController` 之服務層 `canPerform(roleCode, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')`，不通過丟 `ForbiddenException` ⇒ **403**（比照 `appendices.service.ts` 之既有作法；`dashboard-activity.ts` 亦已在本模組內使用 `canPerform`）。
  🔴 **只靠前端不呼叫等於沒有授權邊界**；🔴 **兩道都必須讀矩陣、都不得寫成角色清單**。
**And** 🔴 **本條正是 `AC-G86` 要求類別分布「必須是獨立端點」的唯一理由**——若它與卡片同一個端點，`DeptContact` 進首頁就必然呼叫到它，本條在合併的形狀下**無法滿足**。
**And** 📌 **為何不是「反正只是數字」**：讓一個在側欄根本看不到該功能的角色在首頁看到該功能的統計圖，是本 repo 已修過多次的「死鏈／越權可見」形狀之鏡像。

#### `AC-G67` — 數值必須以文字形式存在
**Then** 每一條之類別名稱、已公告數、進度中數**皆可由 `textContent` 取得**
**And** 🔴 **明文禁止**讓某個數值之唯一載體是矩形之 `width`／`height`／`style`／`aria-valuenow`
**And** 🔴 長條之幾何正確性同 `AC-G49`：寬度計算須抽為純函式 `barWidths(announced, inProgress, max)` 並以固定向量斷言（含 `max === 0`、單邊為 0、兩邊皆為 0 三個向量）。

#### `AC-G68` — 空狀態，與兩條刻意不等之明文記載
**Given** 系統中尚無任何業務/功能類別，或全部類別皆通不過 `AC-G63`
**Then** 呈現 `data-testid="empty-state"` 之明確提示，**不得空白**，且須說明資料從何而來
**And** 🔴 **規格明文記載並以斷言鎖住兩條刻意不等**：
- **INV-G4**：`Σ(各類別之已公告＋進度中)` **不必等於** `卡① + 卡②`。成因＝① 一份文件掛多個類別會被重複計入；② 未掛任何類別之文件完全不出現。🔴 **測試語料必須同時含這兩種形狀**，並斷言該不等**實際發生**（否則這條 AC 恆真、零鑑別力）。
- **INV-G5**：某類別之（已公告＋進度中） **≤** 類別池清單同一列之「掛載文件數」。成因＝後者計全部掛載文件（不分狀態）。🔴 **語料必須含一個掛有 `inactive` 文件之類別**，使該不等式取到嚴格小於。
**And** 🔴 **為何要主動鎖住兩個不等式**：不鎖，日後有人會「發現兩處數字對不上」而去把其中一方改成另一方——那會同時打破 [F043](F043-business-function-category.md) `AC-01` 與本檔 `AC-G62`。
**And** 🔴 **2026-09-21 人類裁決第二輪：本條之說明性文字須依 [`AC-G94`／`AC-G95`](#rationale-out) 拆為【可見】與【ⓘ popover】兩部分**，逐字新文案見 [§癸四 逐處處置表](#rationale-sites) 第 4／6～9 列。🟢 **2026-09-21 就地更正**：第 6～9 項之引導文字**改回可見、不得收進 ⓘ**（它們回答的是「接下來該去哪裡」，而空狀態正是最需要引導的時刻）；但其中三條混有內部詞彙，**必須以使用者語言重寫**。🔒 **本條之其餘要求（數字、門檻、不變式）一字未改**。

---

## §己 · 橫切事項 {#cross-cutting}

#### `AC-G69` — 時區基準：UTC，單一推導點
**Given** `OQ-D44-28` ＝ 甲
**Then** 「今日」「當月」「近 1 個月」之基準**一律以 UTC 取得**，沿用既有 `serverToday(now)`（後端）／`todayIsoDate(now)`（前端）
**And** 🔴 **基準必須集中於單一推導點**，前後端不得各算一份（INV-G8）
**And** 🔴 **明文禁止**在本功能中使用 `getFullYear()`／`getMonth()`／`getDate()` 等本地時區方法
**And** ⚠ **已明確接受之代價**：使用者位於 UTC+8 ⇒ 每月 1 日台北時間 00:00–08:00 這段窗口內，「本月」仍會算成上個月。**這是既有行為之延伸，不是本功能新增的缺陷**；🔴 **明文禁止**日後有人「順手改成 Asia/Taipei」——那會讓首頁的「今天」與 OJT 頁的「今天」在每日 00:00–08:00 得出不同答案。

#### `AC-G70` — 🔒 INV-G7：五處「已公告／進度中」同源
**Then** 卡片、`當月已公告` 環圖、`累積已公告` 環圖、最新公告清單之狀態欄、類別長條圖——**五處之判定皆來自 `deriveDisplayStatus` 這一支純函式**
**And** 🔴 **明文禁止**在任一聚合中以裸 SQL／裸比較另行表達同一語意而不經該函式驗證
**And** 🔒 **回歸鎖**：以同一份語料同時驅動五處，斷言其「已公告」判定**逐筆一致**。

#### `AC-G71` — 🔴 圖表之非視覺等價（NFR-F044-2 升格為編號 AC）
**Then** 環圖與長條圖之**全部數值**必須同時以**文字形式**存在於 DOM
**And** 🔴 **負向鎖定（逐字）**：**禁止**讓任何一個數值之唯一載體是 SVG `path` 之 `d`、`stroke-dasharray`、`stroke-dashoffset`、矩形之 `width`／`height`、`transform`、`<canvas>` 內容、或僅出現在 `title`／tooltip 之懸停內容
**And** 📌 **可測形狀**：對每一個圖表區塊，斷言「該區塊內每一個應呈現之數字，皆可由 `within(region).getByText(...)` 或指定 `data-testid` 之 `textContent` 取得」
**And** 🔴 **為何升格**：本輪之測試策略明示為「只做 vitest / jest」——**無視覺回歸、無 e2e**。若數值只存在於圖形幾何中，整個功能將**無法被任何自動化測試鑑別**，那正是「機器閘門全綠卻整張圖畫錯」的成因形狀。

#### `AC-G72` — 不寫稽核
**Given** `OQ-D44-30` c
**Then** 本功能之任何聚合讀取**不寫 `AUDIT_LOG`**
**And** 🔴 **不得**為此新增任何 `targetType`／`actionType`（那屬 schema 變更）
**And** 📌 現況兩個 dashboard 端點皆未寫稽核；最新公告清單會揭露**程序書書名**，但那與後台文件清單（未寫稽核）揭露的是同一層級資訊。

#### `AC-G73` — 不做快取
**Given** `OQ-D44-30` b
**Then** 本輪**不引入任何快取層**（無 in-memory TTL、無 Redis、無 HTTP `Cache-Control` 之自訂策略）
**And** 未達 NFR-F044-1 之 P95 ≤ 2 秒時，由 system-architect 另行決定策略（而非由實作者自行加一層）
**And** 📌 **理由**：過早最佳化會引入「數字為什麼不即時更新」這個新問題。

#### `AC-G74` — 🔒 不新增資料表、欄位或 migration
**Then** 本功能**不新增任何資料表、不新增任何欄位、不需要任何 migration**
**And** 🔴 **明文禁止**在 `ICSOP_DOCUMENT` 上新增 `draftingDivisionId`（本部）之冗餘欄——本部由 `parentCode` 上溯推導（`AC-G33`）
**And** 🔴 **明文禁止**在 `BUSINESS_CATEGORY_DOC` 上新增冗餘 `businessCategoryId` 欄（[F043](F043-business-function-category.md) 決策 E9 刻意不放）
**And** 🔒 **回歸鎖**：`backend/src/database/migrations/` 之檔案數與內容**與本功能導入前完全相同**
**And** 🟢 **2026-09-21 確認：連傳輸型別也未變更。** `ARCH-G2` 裁定為乙案（端點回 `defaultDimension`）⇒ `SessionUser` 一欄未加（`AC-G87`）；`ARCH-G0`～`ARCH-G6` 六項裁定**無一涉及新欄位或新資料表**。<br/>📝 `OLD>` 「⚠ **唯一之 additive API payload 變更**＝`SessionUser` 可能需要新增職位資訊（§壬 `ARCH-G2`）——那是**傳輸型別**，不是資料模型」。

---

## §庚 · 回歸鎖定清單（🔒 本輪之後必須仍然為真） {#regression-lock}

> 🔴 **下列每一條之驗證方式皆為「既有測試維持綠燈**且期望值未經修改**」。**
> 🔴 **若任何一條既有斷言需要改期望值，即表示該條被違反，必須停下來回報，不得改測試。** 本 repo 已記錄「擴充列舉值漏改既有絕對值鎖」與「測試把缺陷釘成預期行為」兩種缺陷形狀，兩者的共同特徵都是「有人改了測試的期望值」。

#### `AC-G75` — 🔒 `GET /admin/dashboard/summary` 一行未改（本輪**一鍵未加**）
> 📝 **2026-09-21 就地改寫（[architecture-spec §15.12 一 C](../architecture-spec.md#ch15-handback)，lead 裁示）。**
> `OLD>` 原第 2 句逐字為「**And** 新鍵一律 **additive**，置於既有 5 鍵之後」——architect 裁定改走三個新端點、`summary` 完全不動，原措辭會誤導下游以為**必須**加鍵。

**Then** `DashboardCounts` 之鍵集合**恰為既有 5 鍵**（`pendingOrgChanges`／`unassignedDocs`／`disabledAccounts`／`accessLast7Days`／`pendingPublish`），逐鍵存在、型別不變、值之語意不變（`OQ-D44-04` ＝ 甲）
**And** 🔴 **本輪一鍵未加**——F044 之全部資料走 `AC-G86` 之三個新端點；`dashboard-summary.service.ts`／`dashboard-counts.ts`／`DashboardCounts` 型別**一行未改**
**And** 🔒 **回歸鎖之形狀**＝「既有 5 鍵皆存在且其值在同一份語料下與導入前相同」，**不是**「鍵數恰為 N」之絕對值鎖
**And** 🔒 該兩檔之既有測試**全數維持綠燈且期望值未經修改**
**And** ⚠ 本端點在 `AC-G1` 與 `AC-G86` 之後將**無執行期消費者**（`DashboardHome` 不再呼叫 `getDashboardSummary()`）——🔴 **仍不得移除端點、不得移除任一鍵**（`OQ-D44-04` 已裁決）；日後清理另立追蹤項（[architecture-spec §15.12 四](../architecture-spec.md#ch15-handback) ④）。
**And** 📌 **[§癸 (f)](#corpus) 之 `Object.keys(summary).length === 5` 風險因本裁定歸零**（鍵集合一個未動）。🔒 **該段文字仍保留**，作為日後有人想動 `summary` 時的警語——那時風險會立刻復活。

#### `AC-G76` — 側欄零漣漪
**Then** `MENU`／`visibleMenu()`／`accessLabelFor()` 之行為與逐字文案**一行未改**
**And** 以五種角色逐一渲染側欄，其選單項集合、順序、逐字標籤、圖示與存取徽章**與本功能導入前逐格相同**
**And** 🔒 `frontend/src/domain/menu.test.ts` 之既有斷言（含 `:141` 對 `accessLabelFor` 之純函式測試）全數綠燈、期望值未改。

#### `AC-G77` — `FUNCTION_MATRIX` 逐格不動、不新增功能列
**Then** `FunctionKey` 之鍵集合（**恰 15 鍵**）與 5 種角色 × 全部功能列之逐格值，**與本功能導入前完全相同**
**And** 🔴 **不新增「首頁」或「儀表板」功能列**（比照 [F002](F002-role-based-routing.md) `AC-D5` 之既有鎖定）——首頁不是受控功能
**And** 🔒 `backend/src/rbac/function-matrix.spec.ts` 全綠且期望值未改。

#### `AC-G78` — `accessLabelFor` 之 `受限CRUD` 徽章
**Then** [F042](F042-ojt-progress-management.md) `AC-28`⑮ 之 `受限CRUD` **不落入 `唯讀` 分支**這件事仍為真，其載體為側欄 `AppShell.tsx` 與 `menu.test.ts`（`AC-G26`）。

#### `AC-G79` — F042 TAB2 未帶參數時之既有排序
**Then** `listRows` 之伺服端排序恆為 `orgName.localeCompare` → `documentNumber.localeCompare`，**一行未改**、**無排序參數**
**And** `以使用單位分組` 之群組次序（`(companyCode, orgCode)` 複合鍵昇冪）與組內次序（程序書編號昇冪）**一格不動**
**And** 🔒 `backend/src/ojt-progress/ojt-progress.rows.spec.ts`（及同族 spec）全綠且期望值未改。

#### `AC-G80` — 🔒 F042 `canViewDashboard` 之回歸鎖（本功能自第七輪起**不再重用它**）

**Then** `canViewDashboard(roleCode)` ＝ `ICSOPAdmin ∣ SysAdmin` 🔒 **一行未改**，其在 `OjtProgressPage` 之既有用途（TAB1 對主管／部門窗口隱藏）**行為不變**
**And** 🔴 **本功能自 2026-09-21 第七輪起不再重用該述詞**（`AC-G17` 改為讀矩陣）——🔒 **但本條之回歸鎖不隨之廢止**：它鎖的是「那支函式沒被我們改到」，而非「我們還在用它」
> 🔴 **為何不重用了還要繼續鎖**：`AC-G25` 已自 `DashboardHome` 移除對它的 import；若連回歸鎖一併拿掉，就沒有任何斷言在看「本輪有沒有順手改到 F042 那一側」了。
**And** 🔴 明文禁止改寫或擴充 `canViewDashboard` 之值域

<details><summary>📝 `OLD>` 原條文逐字保留</summary>

**Then** `canViewDashboard(roleCode)` ＝ `ICSOPAdmin ∣ SysAdmin` **一行未改**，其在 `OjtProgressPage` 之既有用途（TAB1 對主管／部門窗口隱藏）**行為不變**
**And** 🔴 本功能**重用**該述詞（`AC-G17`），**不改寫、不擴充其值域**。


</details>

#### `AC-G81` — F042 之篩選項數、完成狀態值數與分組模式態數
**Then** OJT 進度管理之篩選**恰兩項**（單位搜尋、完成狀態）、完成狀態**恰三值**、分組模式**恰二態**
**And** 🔴 **不得因本功能而增加第三項篩選或第三種分組模式**——`sort=incomplete-first` 是 deep link 之**排序參數**，不是第三項篩選（`AC-G20`）。

#### `AC-G82` — F017 文件清單之既有形狀
**Then** ICSOP 文件管理清單之**16 欄畫面欄位**、**14 項篩選**、**CSV 15 欄**、預設排序與匯出 body 之鍵集合**與本功能導入前逐項相同**
**And** 不帶新參數進入 `/admin/documents` 時之行為**一格不動**（`AC-G59`）
**And** 🔒 [F017](F017-backend-document-list.md) 既有測試全綠且期望值未改。

#### `AC-G83` — `frontend/package.json` 之相依不變
**Then** `dependencies` 之鍵集合與版本**與本功能導入前完全相同**（`AC-G48`）
**And** `devDependencies` 亦不得因圖表而新增任何項目。

#### `AC-G84` — 既有 `DashboardHome` 之降級斷言不得消失
**Then** 「活動端點失敗不阻斷儀表板」這條斷言仍然存在（載體已依 `AC-G28` 更換）
**And** 🔴 **明文禁止**以「該案例依賴已移除的區塊」為由整案刪除。

---

## §癸二 · 架構裁定回填之補充 AC（2026-09-21，`AC-G85`～`AC-G89`） {#arch-backfill}

> 🟢 **本節之五條 AC 全數來自 [architecture-spec 第 15 章](../architecture-spec.md#ch15-f044) 之裁定回填**（`ARCH-G1`～`ARCH-G6` 已全數定案）。
> 🔴 **`AC-G85` 是其中最重要的一條**：它所鎖的規則在原稿 84 條 AC 中**完全沒有被定義過**——沒有它，排序在任何實作下都「正確」，而畫面順序會隨環境漂移。

#### `AC-G85` — 🔴 `DonutSlice[]` 之排序：完全決定性，禁止 `localeCompare`
> 🔴 **本條為新增（[architecture-spec §15.12 二](../architecture-spec.md#ch15-handback) ①）。原稿 `AC-G1`～`AC-G84` 未定義環圖切片之次序。**

**Given** 任一維度（`company`／`division`／`department`）之切片集合
**When** 後端產出 `DonutSlice[]`
**Then** 排序為三層，**完全決定性**：
1. 依 `announced` **降冪**；
2. 同值時依 `label` **昇冪**，比較子為**序數比較**（`a < b ? -1 : a > b ? 1 : 0`）；
3. 仍同值時依 `key` **昇冪**收尾。

**And** 🔴 **明文禁止 `localeCompare`**——理由同 `AC-G64`：中文組織名在不同 ICU 版本／不同機器下定序不同，本 repo 已記錄該形狀之缺陷（同一份資料在不同機器排出不同順序，測試一邊綠一邊紅）
**And** 🔴 **兩個 sentinel 段（`__unspecified__`／`__no_division__`）參與同一排序，不強制置底**
> 📌 **為何不置底**：強制置底等於在版面上把資料品質問題推到看不見的地方，與 `AC-G34`「禁止排除」之意旨相反——`AC-G34` 要的是**讓缺漏可見**，置底是它的軟性版本。

**And** 🔒 圖例之 DOM 順序**必須逐項對應該排序**（`getAllByTestId('donut-legend-row')` 之 `data-org-key` 序列 ＝ `DonutSlice[]` 之 `key` 序列）
**And** 📌 **可測形狀**：純函式 `donutSlices(...)` → 已排序陣列。🔴 **語料必須含**：① 兩個 `announced` 相同之組織（驗第 2 層）；② 兩個 `label` 相同但 `key` 不同之組織（跨公司同名部，驗第 3 層）；③ 至少一個 sentinel 段，其 `announced` 值**落在中間**（既非最大也非最小，驗「不置底」——🔴 若 sentinel 剛好最小，置底與不置底輸出相同，該半句恆真）。

#### `AC-G86` — 端點契約：恰 3 個新端點，被恆等式綁住的區塊必須來自同一次請求
> 🟢 **`ARCH-G3` 於 2026-09-21 定案（[architecture-spec §15.4](../architecture-spec.md#ch15-g3)／[§15.5](../architecture-spec.md#ch15-contracts)）。**

**Then** 本功能恰新增 **3 個**端點，區塊對映如下（🔒 路徑逐字見 [§命名鎖定](#naming-lock) 第 20b 列）：

| 端點 | 服務之區塊 | 閘門 |
|---|---|---|
| `GET /admin/dashboard/analytics` | 卡①②③ ＋ 兩張環圖（各 3 維度）＋ 最新公告清單 ＋ `defaultDimension` | `SessionGuard`；**無額外功能鍵**（`AC-G16`／`AC-G47`） |
| `GET /admin/dashboard/category-distribution` | 類別長條圖 | `SessionGuard` ＋ 服務層 `BUSINESS_CATEGORY_MANAGEMENT` `read` ⇒ `DeptContact` **403**（`AC-G66`） |
| `GET /admin/ojt-progress/ontime-summary` | 卡④ | `SessionGuard` ＋ 既有 `assertCanRead()`（`OJT_PROGRESS_MANAGEMENT` `read`）；🔒 **掛在 OJT 模組，不是 dashboard 模組** |

**And** 🔴 **卡①②③ 與兩張環圖、最新公告必須來自同一次請求、同一個 `now`、同一份投影**
> 🔴 **決定性理由**：INV-G1／INV-G2 是**跨區塊之恆等式**。若卡片與環圖來自兩個端點，就是**兩次查詢、兩個時間點、兩份快照**——一份文件在兩次請求之間被公告或改為 `inactive`，恆等式就在正式站上破掉了。而本輪之回歸鎖（`AC-G6`／`AC-G35`）是以**單一語料驅動兩支純函式**，它**永遠不會紅**。
> ⇒ 🔒 **凡被恆等式綁在一起的區塊，必須來自同一次請求。**（此即 analyst 原傾向之「每區塊一端點」被否決的理由。）

**And** 🔴 **類別分布必須獨立**——三個理由：① `AC-G66` 要求 `DeptContact` **不得呼叫**，合併形狀下無法滿足；② 它是最重之聚合（NFR-F044-1 #3），獨立後其失敗或變慢只影響最下方一個區塊；③ 它與其餘區塊之關係是 INV-G4／INV-G5 兩條**刻意不等**，不存在需要同一快照才成立的恆等式
**And** 🔴 **三個端點皆無查詢參數**；🔴 **`today` 明文不得由 client 傳入**（否則使用者可自行改「今天」而使全部統計失真）
**And** 🔒 `GET /admin/dashboard/summary` **一行未改**，且在本輪之後**不再被前端呼叫**（`AC-G75`）——這是 `OQ-D44-03` 與 `OQ-D44-04` 兩項裁決並存之必然結果，不是遺漏
**And** 🔒 三個端點皆在既有 `/admin` 前綴下 ⇒ `frontend/vite.config.ts` 與 `frontend/nginx.conf` 之**代理白名單零修改**，`proxy-coverage.test.ts` 不受影響
**And** 🔴 **「恰 3 個」這個絕對值鎖是刻意的，🔒 不得以 [§癸 (f)](#corpus) 為由把它刪掉**：
> 📌 §癸 (f) 警示的是「順手擴充導致既有絕對值鎖翻紅」這種**維護負擔**。本條與之**同形但不同質**——差別在於：**那個絕對值本身是不是一個被保護的設計性質。**
> 端點數正是 **INV-G1／INV-G2 恆等式安全性的載體**（分端點＝兩份快照，恆等式可在正式站破掉而測試永遠不紅）。
> ⇒ 🔒 **它翻紅時是一個「發現」，不是一個「維護負擔」**——有人動了端點切法，而那件事必須被看見並重新評估恆等式。
> ⚠ **區別之判準**：該數字改變時，是否有一條**不變式**跟著改變？是 ⇒ 鎖它；否 ⇒ 改成回歸鎖。
> ⚠ 本 repo 已三次踩過「新增路由前綴忘記同步代理 ⇒ fetch 拿到 SPA 的 `index.html`、畫面靜默壞掉」。本裁定結構性地避開它，但 🔴 **仍須以 `proxy-coverage.test.ts` 之既有斷言維持綠燈為證**。

**And** 📌 **可測形狀**：controller 之路由字面與 `frontend/src/api/endpoints.ts` 之 URL 字面各有直接斷言；「四個區塊各自獨立載入、各自獨立降級」以 `AC-G23` 之元件層斷言承載。

#### `AC-G87` — `defaultDimension` 由端點回傳；`SessionUser` 一欄未加
> 🟢 **`ARCH-G2`（原 BLOCKING）於 2026-09-21 定案＝乙案（[architecture-spec §15.3](../architecture-spec.md#ch15-g2)）⇒ `OQ-D44-31` 結案。**

**Then** `GET /admin/dashboard/analytics` 之回應含 `defaultDimension: 'company' | 'division' | 'department'`
**And** 🔒 **`SessionUser`（`GET /auth/me`）一欄未加**——其 8 個欄位（`loginId`／`email`／`companyCode`／`roleCode`／`orgCode`／`name`／`employeeNo`／`userSubtype`）**逐欄不變**；`SessionGuard`、`AccountRepository` 介面與其 in-memory 測試替身**一行未改**
**And** 🔴 **判定鏈全在後端**：`sessionUser.companyCode` ＋ `loginId` → 本端點自己回查 `ACCOUNT.jobPositionCode` → `buildJobPositionResolver(companyCode, code)` → `jobPositionName | null` → `defaultOrgDimension(jobPositionName)`（`AC-G42`）
**And** 🔴 **回查採新增之窄 adapter 直讀 `ACCOUNT` 實體**（比照 `dashboard-counts.ts` 之既有反循環作法），🔴 **不得**加寬 `AccountRepository.findCurrentByLogin` 之投影——該方法**每一個請求都會跑**（`SessionGuard`）
**And** 🔴 **為何不走「`SessionUser` 加 `jobPositionCode`」**（逐字保留否決理由）：**禁跨公司 fallback 之紀律只存在於後端**（`buildJobPositionResolver` 與 `JOB_POSITION` 皆只有後端讀得到）。要前端自行解析，等於把解析點與白名單比對點拆到兩個 package，而前端不可能有那張對照表——那正是 `OQ-D44-20` 明文要防的事
**And** 🟢 **使用者原文「董事長、總經理預設／本部長、副本部長預設」因本裁定保住了載體**，`AC-G42` 不需退化為「一律預設依制定部門」
**And** 📌 **可測形狀**：`defaultOrgDimension` 之純函式向量（[§癸 (d)](#corpus)）＋ 服務層「給定 `jobPositionCode` 與 `companyCode` → 回應之 `defaultDimension`」一條端到端服務斷言（含 🔴 **AD 之 `B01` ⇒ `'department'`** 這個關鍵向量）。

#### `AC-G88` — deep link 之兩參數**各自獨立解析**（刻意不採「恰成對」紀律）
> 🟢 **`ARCH-G4` 於 2026-09-21 定案（[architecture-spec §15.6](../architecture-spec.md#ch15-g4)）。**

**Then** 存在兩支純函式，各自以**封閉值域**解析：

| 純函式 | 值域（🔒 封閉） | 不可辨識之值 |
|---|---|---|
| `readTabParam(q): TabKey \| null` | `dashboard` ／ `sessions`（🔒 逐字取自既有 `type TabKey`） | 回 `null` ⇒ 靜默忽略該參數，退回既有預設 |
| `readSortParam(q): 'incomplete-first' \| null` | `incomplete-first`（恰一值） | 回 `null` ⇒ 靜默忽略該參數，退回既有次序 |

**And** 🔴 **兩參數各自獨立解析，明文不採本頁既有之「恰成對」紀律**（`readSubtreeParams`／`readBcSubtreeParams`）
> 🔴 **為何刻意不同**：那兩處成對，是因為 `nodeSubtreeId` **離開 `lifecycleId` 無法解析**（兩張不同的圖、id 不可互相定位）。此處 `tab` 與 `sort` **各自獨立可解釋**，硬綁成對會製造一條「**只想開 TAB2 卻被整組忽略**」的無聲失敗路徑。

**And** 🔴 取樣點：`useState<TabKey>(() => readTabParam(q) ?? (mayViewDashboard ? 'dashboard' : 'sessions'))`——**於初始化函式內**（`AC-G19`）
**And** ⚠ `tab=dashboard` 對 `Supervisor`／`DeptContact` **無效**（`canViewDashboard` 為偽）⇒ 退回 `sessions`。這不是新規則，是既有 `useState` 初值邏輯的延續（`AC-G80`）
**And** 📌 **可測形狀**：兩支純函式各以**三個向量**斷言——空字串、大小寫不符（如 `Sessions`）、未知值（如 `tab=list`）皆須回 `null`。🔴 **再加一個組合向量**：只帶 `sort=incomplete-first`（不帶 `tab`）時，`sort` **仍然生效**（這一條就是「非成對」的鑑別力所在；若實作寫成成對，它會紅）。

#### `AC-G89` — `ojtOnTimeNote`：卡④ **ⓘ popover 之文字產生者**（🔴 2026-09-21 就地改寫）

> 🔴 **本條於 2026-09-21 經 lead 裁定就地改寫（`ring-f044` 建環時提報本條與 [§癸四 第 1 列](#rationale-sites) 互相矛盾）。**
> **矛盾之成因**：第六輪（實作理由退出畫面）把卡④ 的說明文字搬進 ⓘ，`AC-G15`／`AC-G29`／`AC-G38`／`AC-G40`／`AC-G57`／`AC-G68` 六條都加了指標，**唯獨 `AC-G89` 漏了**——
> 於是它仍要求一支帶「覆蓋率頭句＋百分比＋`NO_STATISTICS_TEXT`」的函式，而那些內容**在新版面上已經不存在**。
> 🔒 **裁定＝(b)**：`ojtOnTimeNote` **即為 ⓘ 之產生者**。理由：(a)（廢止本條）會留下一支**沒有消費者的死函式**；而本條存在的理由本來就是「卡④ 需要一段**與 F042 `exclusionNote` 不同**的文字」——**那個需求現在由 ⓘ 承接，載體換了、需求沒變。**

**Then** 純函式 `ojtOnTimeNote(stats): string` 置於 `frontend/src/pages/ojt-progress-view.ts` **同一個檔案、緊鄰 `exclusionNote()`**，其輸出即為卡④ **ⓘ popover 之內容**（`data-testid="info-content"`，`AC-G95`）
**And** 🔒 **其逐字內容之唯一權威＝[§癸四 第 1 列](#rationale-sites) 之【ⓘ popover】四段**（「這張卡只看…」／「其中 {a} 個單位已裁撤…」／「另有 {c} 份文件…」／「「OJT 進度管理」頁不限期限…」）
> 🔴 **明文禁止在本條再抄一份該四段**——那就是「同一件事兩個定義點」，且兩份初始碰巧相同、漂移前兩份都會綠。本條只指向它。

**And** 🔒 **負向鎖續存（`ARCH-G6` 之裁定理由未隨載體而消失）**：🔴 卡④ 之文字**不得共用、不得委派** [F042](F042-ojt-progress-management.md) 之 `exclusionNote()`；🔒 **既有 `exclusionNote()` 一行未改**，其既有測試全數綠燈且期望值未修改（`AC-G80`）
> 🔴 **理由（即使句型對照表已作廢，這個結論仍然成立）**：兩者若綱在同一支函式上，**任一邊調整措辭都會靜默改寫另一邊**；而 NFR-F044-3 #4 要求兩個口徑不同的數字（分母＝進度列 vs 分母＝單位）**必須在畫面上可分辨**。
**And** 🔴 **兩支函式必須以逐字註解互相指向、寫明「刻意不合流」之理由**（比照 `deptCodeOf` 與 `isWithinSubtree` 之既有處置）——否則下一個人會把它們合併

**And** 🔒 **`coveragePercent()` 之共用要求並未消失，只是換了載體**：百分比現在渲染於卡面 `ojt-ontime-value`（`已完成 X / 應完成 Y（Z%）`），🟢 **`AC-G13` 已明文要求該處委派 `coveragePercent()`、禁止另打一份 `Math.round`**（spec-writer 已查證） ⇒ 🔒 **該要求不隨本條之改寫而蒸發**
**And** ⚠ **`NO_STATISTICS_TEXT` 於 F044 自此可能無消費者**：分母為 0 之空狀態走的是[§命名鎖定](#naming-lock) 第 4 列之 `近 1 個月內無應完成之 OJT 單位`（`AC-G14`）。🔒 **它在 [F042](F042-ojt-progress-management.md) 仍有消費者，不需處置**——本行是為了讓下一個人知道這是**刻意的變化**、不是漏接線

**And** 🔴 **固定向量之鎖定對象已隨之更換**：不再鎖「覆蓋率頭句＋三個原因列數」，改為鎖 **ⓘ 之四段**；其向量要求一律以 [`AC-G15`](#cards) 與 [§癸四 第 1 列](#rationale-sites) 為準（含 🔴 `excludedNoAnnouncedDate > 0` 且前兩項為 0 那個關鍵向量）

<details><summary>📝 `OLD>` 原條文逐字保留（含已作廢之三段句型對照表與四列向量要求）</summary>

> 🟢 **`ARCH-G6` 於 2026-09-21 定案＝不共用（[architecture-spec §15.8](../architecture-spec.md#ch15-g6)）——與本檔原 🔵 建議相反。**

**Then** 新增純函式 `ojtOnTimeNote(stats): string`，置於 `frontend/src/pages/ojt-progress-view.ts` **同一個檔案、緊鄰 `exclusionNote()`**
**And** 🔒 **既有 `exclusionNote()` 一行未改**，其既有測試全數綠燈且期望值未修改（`AC-G80`）
**And** 🔒 **共用點僅限兩個既有符號**：`coveragePercent()`（🔴 禁止另打一份 `Math.round`，`AC-G13`）與 `NO_STATISTICS_TEXT`
**And** 🔴 **為何不共用整支**（architect 查證，三段句型無一相同）：

| 段 | F042 TAB1 `exclusionNote()` | F044 卡④ 之需求 | 可否共用 |
|---|---|---|---|
| 頭 | `覆蓋率為 {n} / {d}（{p}%）` | 🔒 `已完成 {X} / 應完成 {Y}（{Z}%）`（`AC-G13` 逐字鎖定） | ❌ |
| 排除列舉 | **兩個**原因 | **三個**原因（多 `無公告日期`，`AC-G12`） | ❌ |
| 尾句 | 「裁撤單位仍可新增場次；已移出者不可…」 | `AC-G15`③ 之「被排除者於 `OJT 資料清單` 分頁仍可能呈現…」 | ❌ |

> ⇒ 「共用並擴充」在實作上等於把頭、列舉、尾句**三者都變成參數**，共用的只剩一個 `join`——代價是 F042 TAB1 與 F044 卡④ 的文案從此綁在同一支函式上，**任一邊調整措辭都會靜默改寫另一邊**。
> 🔴 **這正是 NFR-F044-3 #4 要防的事**：兩個口徑不同的數字（分母＝進度列 vs 分母＝單位）必須在畫面上可分辨，而「標籤不同」是唯一的分辨手段。把它們塞進同一個文案產生器，是往反方向走。

**And** 🔴 **兩支函式必須以逐字註解互相指向，並寫明「刻意不合流」之理由**（比照 `deptCodeOf` 與 `isWithinSubtree` 之既有處置）——否則下一個人會把它們合併
**And** 🔴 **輸出以固定向量表鎖住，至少四列**：① `denominator === 0`（空狀態，用 `NO_STATISTICS_TEXT`）；② 三種排除皆為 0；③ 三種排除皆 > 0；④ **只有 `excludedNoAnnouncedDate` > 0**（🔴 第 ④ 列是新增的第三個原因之唯一鑑別力來源——若語料中它恆為 0，「多一個原因」這件事恆真）。


</details>

#### `AC-G90` — 前端如何**套用** `defaultDimension`：`normalizeDefaultDimension` ＋ 🔴 禁止前端自行推導
> 🔴 **本條為新增（2026-09-21，ui-ux-designer 提報之載體移轉）。** `AC-G42`／`AC-G43` 移往後端後，**前端這一側真正可驗的部分**就是本條——沒有它，前端在本輪對「預設頁籤」這件事一條斷言都沒有。

**Given** `GET /admin/dashboard/analytics` 之回應含 `defaultDimension`（`AC-G87`）
**Then** 前端以純函式 `normalizeDefaultDimension(v)` 收斂端點回傳之 `defaultDimension`（🔒 **命名沿用 ui-ux-designer 於 prototype 已實作者**）
**And** 🔒 **初始選取**：**兩個環圖區塊**之初始 `aria-selected="true"` 之 `role="tab"`，其維度皆由 `normalizeDefaultDimension(defaultDimension)` 之輸出決定——**兩區各自獨立切換（`AC-G45`），但初始值同為該一個預設值**
**And** 🔴 **值不可辨識時靜默退回 `'department'`**；🔴 **鑑別語料至少須含下列四種非法向量**：
  · `undefined`（端點降級而省略該鍵，`AC-G23`）；· `null`；· `''`（空字串）；· **合法字串但非三值之一**（例 `'division '` 帶尾空白、`'COMPANY'` 大寫）。
  🔴 **沒有這四種向量，「靜默退回」與「原樣採用」在三個合法值之下輸出完全相同，該條恆真、零鑑別力。**
**And** 🔴 **不得**因此丟錯、不得 toast、不得讓整個區塊降級——頁籤本身是一個**可自行切換**的控制項（`AC-G44`），退回預設值對使用者是無感的
**And** 🔴 **負向鎖定（逐字，本條之核心）**：**前端明文禁止自行從職位推導維度。** 具體即：
  · 🔴 **禁止**在前端任何位置出現職位名稱白名單（`董事長`／`總經理`／`本部長`／`副本部長` 等字面）；
  · 🔴 **禁止**在前端出現 `jobPositionCode`／`JOB_POSITION` 之解析；
  · 🔴 **禁止**在 `defaultDimension` 缺席時「改用職位自己算一份」作為 fallback；
  · 🔴 **禁止**前端向 `/job-positions`（或任何職位對照端點）取資料來推導預設頁籤。
> 🔴 **為何要寫成負向鎖定**：實作者為了「保險」在前端再寫一份白名單，是這一條最可能的失敗形狀——而那就是**第二個定義點**，且兩份初始碰巧相同 ⇒ **漂移前兩份都會綠**。`ARCH-G2` 選乙案的整個理由就是為了不讓這份白名單跨到前端來。
> 📌 **可測形狀（三層，缺一不可）**：
> ① **純函式**：`normalizeDefaultDimension` 之**七個向量**（合法三值 ＋ 上述四種非法向量）。
> ② 🔴 **元件層之關鍵向量（本條負向鎖定在元件層的唯一鑑別力來源）**：給一個**職位為 `部長`** 之 session 替身，而端點回 `defaultDimension: 'company'` ⇒ 🔴 **畫面必須選取「依制定公司」**（而非「依制定部門」）。
>   ⇒ 若實作者在前端自己從職位推導，`部長` 會算出 `'department'`、與端點之 `'company'` 不同 ⇒ **斷言翻紅**。🔒 **這是唯一一個能讓「前端自己算一份」在行為上現形的向量。**
> ③ 🔒 **原始碼層（本條之負向鎖定唯一的機器載體）**——🟢 **本輪之簡化環允許這種斷言**：vitest 可以 `readFileSync` 讀前端原始碼目錄再斷言，它**仍然是一支 vitest spec，不需要任何新工具、不需要額外的闘門**。
>
> **可執行形狀（逐字）**：遞迴掃描 `frontend/src` 全樹之 `.ts`／`.tsx`，斷言下列兩組型樣**零命中**：
>
> | # | 型樣 | 擋的是什麼 |
> |---|---|---|
> | ① | `董事長`｜`總經理`｜`本部長`｜`副本部長`（職位名字面） | 白名單被複製到前端 |
> | ② | `jobPositionCode`｜`JOB_POSITION`（識別子） | 前端取得或解析職位代碼（含向 `/job-positions` 取資料） |
>
> 🔴 **掃描範圍之排除與三道守門（2026-09-21 建環階段就地回填；ring-f044 實查、lead 核准）**
>
> 🔴 **事實更正**：本條原文要求型樣 ②（`jobPositionCode`｜`JOB_POSITION`）於 `frontend/src` **全樹零命中**，但實查該二識別子**在本輪之前就已存在於前端**——它們是 [F003](F003-account-role-management.md) 手動帳號之「職位」下拉／清單欄（`AC-P29`／`AC-P31`）之既有實作，與本功能無關。
> ⇒ 照原文字面實作，該斷言**永遠不可能綠**，下游只會把它關掉——**本條自己就警告過這個形狀**。
> 📝 `OLD>` 原措辭為「· `api/types.ts` 中如果日後出現純粹的**型別鏡射**（非判定邏輯），需以具名例外清單放行並逐項註明理由」——**例外機制方向是對的，只是漏估了範圍（不只 `api/types.ts` 一檔）**。
>
> **排除①（無條件）**：本 spec 自身與**全部測試檔**（`*.test.ts(x)`／`*.spec.ts`）——人工 fixture 本就合法含有這些字面。
>
> **排除②（僅限型樣 ②，具名四檔，逐檔須註明理由）**：
>
> | 檔案 | 放行理由 |
> |---|---|
> | `src/api/types.ts` | [F003](F003-account-role-management.md) `AC-P31`：帳號 payload 之型別鏡射（純型別，非判定邏輯） |
> | `src/api/endpoints.ts` | [F003](F003-account-role-management.md) `AC-P9`／`AC-P29`：建立／編輯帳號之 request 型別 |
> | `src/domain/account-profile.ts` | [F003](F003-account-role-management.md) `AC-P19`／`AC-P29`：帳號基本資料之職位下拉候選與送出正規化 |
> | `src/pages/AccountManagementPage.tsx` | [F003](F003-account-role-management.md) `AC-P31`：帳號管理之職位欄（表單狀態與下拉） |
>
> 🔴 **三道守門（缺一則例外清單會變成後門）**：
> | # | 守門 | 它防的是什麼 |
> |---|---|---|
> | ① | **清單自我守護**：四檔須**仍然存在**且**仍然命中**型樣 ②，且每條 `reason` 非空 | 清單腐化：檔案被改名／職位欄被移除後，死條目繼續放行一個已不存在的理由 |
> | ② | 🔴 **軸向守門**：例外四檔內**不得**出現 `defaultDimension`／`orgDimension`／`normalizeDefaultDimension`／`依制定` | **放行不等於在那四個檔案裡開一個後門**——職位識別子可以在那裡（F003 用途），但一旦它們與「環圖維度」的詞彙**共存**，就是第二個定義點的徵兆 |
> | ③ | 🔒 **型樣 ①（職位名字面）維持全樹零例外** | 白名單本體被複製到前端——這才是本條最想擋的那件事，🔴 **不得為任何理由開例外** |
>
> 🔒 **另一道軸向斷言**：儀表板相關檔案不得出現 `/job-positions` 之取用（`AC-G90` 負向鎖定第四項）。
>
> 🔴 **本作法之已知局限（逐字，不得刪除、不得淡化）**：**它擋得住「白名單被寫進前端」，擋不住「前端用別的方式繞出同樣的推導」**（例：把判定藏在一張代碼→維度的對照表、以拼接字串逃過 grep、或從別的端點拿到職位資訊再自己判斷）。
> ⇒ 🔒 **本條是「降低風險」，不是「證明不存在」**。🔴 **明文禁止**下游把它寫成「已證明前端無第二個定義點」。
> 🔒 **本條與其他全文掃描類條款共用三個失敗形狀，見 [§癸 (j)](#scan-failure-shapes)。**
> ⇒ 真正能在**行為上**抓到「前端自己算一份」的，是上方 ② 那個元件層向量（職位 `部長` ＋ 端點回 `'company'` ⇒ 必須選「依制定公司」）——🔒 **② 與 ③ 缺一不可**：② 抓行為但抓不到「寫了還沒被呼叫」的潛伏白名單，③ 抓潛伏白名單但抓不到變形繞過。

**And** 🔒 `prototypes/07-admin-shell.html` 已於 2026-09-21 移除該五個前端常數／函式，原文以 `OLD>` 逐字保留於該檔（供追溯，**不得**被當成仍然有效的實作參考）。

---

## §癸三 · ui-ux-designer 接收端回填之補充 AC（2026-09-21，`AC-G91`～`AC-G93`） {#ux-backfill}

> 🟢 **來源**：ui-ux-designer 補完 `prototypes/25-ojt-progress.html`（deep link 之**接收端**）後提報之三項，lead 已獨立驗證零漣漪宣稱並裁示落為 AC。
> 🔴 **其中 `AC-G92` 與 `AC-G93` 是 prototype 在結構上無法承載的條款**——下游**不得**以「prototype 沒有就是不用做」作為略過的理由。

#### `AC-G91` — `取消排序` chip：逐字文案、定位掛鉤、點擊後自 DOM 移除

**Given** 經 deep link（`sort=incomplete-first`）進入 `OJT 資料清單` 分頁
**Then** 列上方呈現一張說明 chip，其定位掛鉤為 🔒 **`[data-ojt-sort-notice="incomplete-first"]`**（host 為 `#sortNoticeHost`）
**And** 🔒 chip 本文逐字為：

> `已依「未全部完成之單位優先」排序（自後台首頁之「查看明細」帶入）。此為排序，不是篩選——已全部完成之單位仍然呈現於下方。`

**And** 🔒 chip 內含一顆逐字為 **`取消排序`** 之控制項（與篩選列之「清除」對稱）
**When** 我點擊 `取消排序`
**Then** 排序解除，群組次序回到 `AC-G79` 之預設（即未帶參數時之次序）
**And** 🔴 **chip 自 DOM 移除，非 CSS 隱藏**（非 `hidden`／`display:none`／`visibility`）
**And** 🔴 **未帶 `sort=incomplete-first` 時，`[data-ojt-sort-notice]` 自始至終不進 DOM**

> 🔴 **斷言錨點紀律（本條最容易寫成恆真的地方，逐字鎖住）**：
> 上兩句之負向斷言**必須釘在屬性選擇子 `[data-ojt-sort-notice]` 上**，🔴 **不得釘在 host `#sortNoticeHost` 上**。
> 理由：**host 是一個恆存在的空容器**（`host.innerHTML = ''`）——釘 host 的斷言在**任何實作下都不會紅**，是一條恆真的空斷言，正是 [§癸](#corpus) 開頭警告的那個形狀。
> 📌 可測形狀：`expect(container.querySelector('[data-ojt-sort-notice]')).toBeNull()`（而非對 `#sortNoticeHost` 斷言）。

**And** 📌 **為何需要這顆按鈕**（designer 提報、lead 裁定採用）：沒有它，經 deep link 進來的人**只能改網址**才能回到既有次序。🔴 **不鎖的話實作者很可能省略它。**

#### `AC-G92` — 「以文件分組」模式下 `sort=incomplete-first` **不生效**

**Given** deep link 帶有 `sort=incomplete-first`
**When** TAB2 之分組模式為 **`以文件分組`**（[F042](F042-ojt-progress-management.md) `AC-30`～`AC-36` 之第二態）
**Then** 本排序**不施加**；群組次序維持該模式之既有規則（[F042](F042-ojt-progress-management.md) `AC-31`／`AC-32`／`AC-34`），**一格不動**
**And** 🔴 **理由**：該模式之群組是**文件**而不是**單位** ⇒ 「未全部完成的**單位**」在該模式下**沒有載體**，硬套會得到一個語意不明的順序
**And** 使用者在帶著該參數之下**切換到**「以文件分組」時，排序即失效；**切回**「以使用單位分組」時復效（參數本身不被清掉）

> 🔴 **本條在本輪之唯一載體是純函式與元件層測試，不是 prototype。**
> 理由：`prototypes/25-ojt-progress.html` **只實作了「以使用單位分組」一種模式**，結構上根本沒有另一個模式可以承載這個分支。
> ⇒ 🔴 **明文禁止**以「prototype 沒有這個分支」作為不實作本條的理由。移植至正式站時**必須補上**。
> 📌 可測形狀：元件層以「帶 `sort=incomplete-first` ＋ 分組模式切至『以文件分組』」驅動，斷言其群組序列**逐項等於未帶參數時之序列**。

#### `AC-G93` — 🔴 段內次序＝**該頁原本之次序**（原型與正式站分歧之鎖）

**Given** 🔴 **已查證之兩個不同值**（designer 查證、lead 核可）：

| 來源 | 既有群組次序 |
|---|---|
| `prototypes/25-ojt-progress.html` | **`orgCode` 昇冪**（`Array.from(byOrg.keys()).sort()`） |
| 正式站 `listRows` | **`orgName.localeCompare` → `documentNumber.localeCompare`**（已鎖於 `AC-G79`） |

**Then** `sort=incomplete-first` 之段內次序規則逐字為 🔒 **「段內維持該頁／該端點原本之次序」**
**And** 🔴 **明文禁止**寫成 `orgCode` 昇冪（會改掉正式站之既有次序，違反 `AC-G79`）
**And** 🔴 **明文禁止**寫成 `orgName` 昇冪（會改掉原型之畫面，造成另一邊的漣漪）
**And** 🔴 **負向鎖定**：移植時**不得照抄原型之群組次序**。上表之分歧是**原型落後於已上線程式碼**之既有落差，與本需求無關，🔒 **本輪不修正**（修正等於改動未帶參數時的畫面，違反零漣漪）

> 📌 **可測形狀（唯一不會綁死其中一邊的寫法）**：
> 斷言「排序後之群組序列，在移除分段效果後（即**只看未完成段內部與已完成段內部**），**逐項等於未帶參數時之序列之對應子序列**」。
> ⇒ 該形狀**同時適用於兩種不同的既有次序**，因為它不提到排序鍵是什麼，只描述「**相對次序未被打亂**」這件事。

**And** 🔒 **分段實作紀律（designer 實作，lead 裁定鎖住）**：以 `filter(未完成).concat(filter(全完成))` 達成，
  🔴 **刻意不倫賴 `Array.prototype.sort` 之穩定性**——段內次序是**一條 AC**（本條），不該建立在引擎實作細節上。

---

## §癸四 · 實作理由退出畫面（2026-09-21 人類裁決第二輪，`AC-G94`／`AC-G95`） {#rationale-out}

> 🔴 **人類原話（2026-09-21，逐字）**：
> > 實作邏輯和技術細節不需要出現在 UI 上給使用者看，如果要留也應該用 hover 的方式保留
>
> 裁決範圍：🔒 **只改 F044 新版面（後台首頁）**。[F042](F042-ojt-progress-management.md) `OJT 進度管理` 頁之同型文字**本輪不動**，另立追蹤項。

### 🔴 `LESSON-G2` — 「不變式需要可驗證的載體」≠「不變式需要可見的文案」 {#lesson-g2}

**根因在本規格，不在下游。** 本檔為了讓每條不變式都有可驗證的載體，反覆要求「INV 須有畫面承載」；
下游忠實照做，結果把**寫給機器看的理由**變成了**寫給人看的文案**。最露骨的一句是環圖下方的：

> `OLD>` 下方圖例仍逐列列出全部 11 個組織，**沒有任何數字只存在於圖形裡**。

那是把 `AC-G71` **逐字唇給使用者聽**。

🔒 **紀律（比照 [`LESSON-G1`](#open-questions)之寫法）**：
> **「不變式需要可驗證的載體」不等於「不變式需要可見的文案」。**
> 載體可以是 `data-*` 屬性、`aria-label`、或 popover 內的文字；
> 把不變式的**理由**寫成畫面上的常駐說明，是**把驗收標準洩漏給使用者**。
> ⇒ 🔴 **日後凡要求「INV 須有畫面載體」時，必須同時指定「它是給誰看的」。**

#### `AC-G94` — 🔒 可見文字與 popover 之分工，及被禁用之措辭

**Then** 本功能引入之所有說明性文字一律遵守：

> 📝 **2026-09-21 就地更正（lead 自行修正其裁示；spec-writer 提出之保留意見成立）**：
> `OLD>` 原分工表逐字為「**可見文字**＝『這是什麼』與『數字是多少』｜**ⓘ popover 內**＝『為什麼』｜**兩者皆不得**＝只對實作者有意義之措辭」。
> 🔴 **原規則過度套用**：它把「接下來該去哪裡」這一類使用者引導也一併掃進 ⓘ，**把空狀態變成了死路**——比原本要防的問題更糟。

🔒 **判準不是「技術性與否」，是「這句話在回答使用者的哪一個問題」**：

| 這句話回答的是 | 落點 |
|---|---|
| 「我接下來該做什麼／這裡為什麼是空的」 | 🟢 **可見**（🔴 **空狀態尤其必須可見**） |
| 「這個數字為什麼是這樣算的／為什麼兩處對不起來」 | **ⓘ popover** |
| 「這條驗收標準是什麼」 | 🔴 **刪除** |
| 「這是什麼、數字是多少」 | 🟢 **可見**（數字另見下方硬規定） |

**And** ⚠ **可見的那一類仍須以使用者語言書寫**——🔒 **「可以留」不等於「原文可以不改」**。
  例：「即時聚合」「儲存狀態為有效」「掛載數為 0」雖然回答的是「接下來該去哪裡」，但措辭仍是內部詞彙，必須重寫。

**And** 🔒 **同一個概念在同一頁只能有一種使用者可見的說法**（📝 2026-09-21 新增，`ux-f044` 提報後立）：
  內部欄位語言（`儲存狀態為有效`／`掛載數為 0`／`即時聚合`／`進度列`）**一律翻成狀態欄或畫面上已存在的詞**
  （例：`儲存狀態為有效` → `未失效或作廢`，因為 `失效`／`作廢` 是 `DISPLAY_LABEL` 中使用者實際看得到的字）。
> 🔴 **本條因規格自己違反而立**：§癸四 第 4 列之鎖定文案曾含 `只計入儲存狀態為有效的文件。`，而第 8 列又把**同一個詞**列為「必須重寫之內部欄位語言」——兩者標準打架。
> ⚠ `ux-f044` 照鎖定文案逐字實作、未自行潤飾（**這是正確的**）⇒ 🔒 **鎖定文案自身必須先通過本條的檢驗**，否則下游越忠實、錯誤越確實地被實作出來。

**And** 🔴 **下列詞彙／句型明文禁止出現於任何使用者可見文字（含 popover 內）**：

| # | 被禁用者 | 為什麼 |
|---|---|---|
| ① | AC 編號、不變式編號、「不變式」一詞 | 驗收標準不是產品資訊 |
| ② | 「刻意」「屬正常」「請勿互相對帳」「不是重複貼上」 | 為實作辩護的語氣 |
| ③ | 「沒有任何數字只存在於圖形裡」這類**描述驗收標準**之句子 | 這是 `AC-G71` 本文，不是給人看的 |
| ④ | 🔴 **以內部模型詞彙去解釋實作之用法**（例：`統計單位＝類別（非節點）` 這種**對比句型**） | 使用者不知道什麼是節點。🔴 **禁的是這個用法，不是這個詞**——見下方可測形狀之 ④ |

**And** 🔴 **數字一律留在可見文字中，不得移入 popover**
> 🔒 **`AC-G71` 不放寬**：本條改的是**理由的位置**，不是**數字的位置**。每一個圖表數值仍須以文字形式存在於 DOM；若有數值僅存於 popover 內，雖仍在 DOM、`AC-G71` 形式上滿足，但 🔴 **本條另行禁止**——使用者不應要展開說明才看得到數字。

**And** 📌 **可測形狀（🔴 前三類與第四類不同調，不得混為一份黑名單）**：

| 類別 | 掃描方式 | 為何可以／不可以 |
|---|---|---|
| ①②③ | 🟢 **裸字面掃描**（AC／INV 編號、`刻意`／`屬正常`／`不是重複貼上`、描述驗收標準之句子） | 這三類之字面**本身**就不該出現在使用者面前，與上下文無關 |
| ④ | 🔴 **不得以裸詞黑名單實作**。改以下列兩種之一：<br>· ① **鎖定具體對比句型**（例：`（非節點）`、`非節點`、`統計單位＝` 這类片語）；<br>· ② 若仍要掃裸詞，則**必須附具名例外清單**（比照 `AC-G90` ③ 之處置） | 🔴 該類之違規與否**取決於上下文**，裸詞會對**合法的領域語言誤報** |

**And** 🔒 **第 ④ 類之具名例外（本輪已知一項）**：`最近活動` 區塊之 `ACTIVITY` 內容**全面豁免**。
  理由兩項：① `OQ-D44-05` 裁決該區塊 **保留、一字不動**（`AC-G22`），本條無權改它；② 其中的「節點」（例：`循環「銷售及收款循環」新增節點「案件結束作業」`）是**真實的領域語言**——循環管理確實有「節點」這個概念，側欄與 DAG 抽屜皆用此詞。

**And** 🔴 **上述兩類均須以正向探針自我守護**（先確認掃描確實讀到了畫面文字），否則渲染失敗時它會恆綠。

> 🔴 **紀律（📝 2026-09-21 新增；lead 覆核 prototype 掃描時多掃了「節點」一詞而發現）**：
> **禁的是「用這個詞去解釋實作」，不是「這個詞出現」。**
> ⇒ 🔒 **凡把「用法禁令」實作成裸字黑名單，就會對合法用法誤報；而誤報的斷言註定被關掉。**
> ⚠ 這正是 `AC-G90` ③ 已經踩過一次的同一個失敗形狀（`jobPositionCode` 在 F003 是合法的，裸詞掃描永遠不可能綠）。
> 📌 **且本輪已有一個差點踩到的實例**：`ux-f044` 自用的掃描清單有 14 個詞、**剛好沒列「節點」**，所以沒誤報。🔴 **它是靠清單剛好正確，不是靠規則正確**——條文若不改，下一個實作者把「節點」加進清單就會翻紅。
> 🔒 **本條與其他全文掃描類條款共用三個失敗形狀，見 [§癸 (j)](#scan-failure-shapes)。**

#### `AC-G95` — ⓘ popover 之機制與 DOM 契約

**Then** 每一處被移出之說明皆以**ⓘ 觸發器 ＋ popover 內容**承載：

| 角色 | 契約（🔒 鎖定） |
|---|---|
| 觸發器 | `<button type="button">`，`data-testid="info-trigger"`，`data-info-for="{key}"`，`aria-label` 逐字 `說明`，`aria-expanded`（`"false"`／`"true"`），`aria-describedby` 指向內容之 `id` |
| 內容 | `data-testid="info-content"`，具穩定 `id`，🔴 **恆在 DOM 裡**（未展開時以視覺方式隱藏） |

**And** 🔴 **內容必須在 DOM 裡，明文禁止使用 `title` 屬性**——`title` 在觸控裝置上不可達、螢幕閱讀器支援不一致，且 RTL 難以穩定斷言
**And** 🔴 **hover／focus／點擊三種皆可展開**（鍵盤與觸控均可達）
**And** 🔴 **三者皆為「開啟」而非「切換」**（📝 2026-09-21 新增，`ux-f044` 實作時發現之陷阱）：
> 🔴 **為什麼不能寫成 toggle**：`user-event.click()` 會**先 focus 再點擊**。若 focus 開啟、click 再切換，則**一次點擊後 `aria-expanded` 會回到 `false`** ⇒ 本條之「`false` → `true`」斷言**恆紅**，而實作看起來完全合理。
> ⇒ 🔒 **收合路徑恰為三條，不含再次點擊**：移開游標／`Tab` 離開／`Esc`。
> 📌 這是**實作者與建環者都會踩的**一個坑：建環者會以為是實作錯了，實作者會以為是測試寫錯了。
> 🔴 **本紀律對建環者本身同樣適用（📝 2026-09-21 新增；`ring-f044` 自己踩到並自我更正）**：
> 其 `Tab 進入（focus）⇒ 開啟` 一條原本紅，它**沒有**直接回報「實作沒處理 focus」，而是先查自己：`.focus()` 後**同步**斷言會在 React 18 批次更新沖洗前求值 ⇒ **是測試的錯**，改 `waitFor` 後通過。
> ⇒ 🔒 **「拿到紅燈時第一反應不該是『實作錯了』」——這句話對寫環的人自己也成立。**
**And** 🔒 觸發器本身**不得承載任何資訊**（只是一個 ⓘ）——資訊全數在內容裡
**And** 📌 **可測形狀**：`getByTestId('info-content')` 之 `textContent` 可直接斷言（不需先觸發 hover）；另以 `user-event` 驗 `aria-expanded` 之 `false` → `true`（點擊與 `Tab`＋`Enter` 各一條）。

#### `AC-G96` — `latestAnnouncementsTotal`：最新公告之**母體總數**為 additive 回應欄位

> 📝 **2026-09-21 新增（`ring-f044` 提報、lead 裁定）**：`G44-14` 原報「`{n} > 10` 時前端結構上算不出來」——**現象對**（前端只收到截斷後的 ≤ 10 筆），**但不需要新查詢**。

**Given** 後端純函式 `latestAnnouncements(docs, limit, today)` 已在**截斷前**於手上算出 `pool`（`status === 'active' && announcedDate !== null`，`dashboard-analytics.ts`）
**Then** `GET /admin/dashboard/analytics` 之回應 **additive 新增** 🔒 `latestAnnouncementsTotal: number`
**And** 🔴 **它必須取自該同一個 `pool`（即 `pool.length`）**，🔴 **明文禁止另寫一次過濾條件、禁止第二次查詢、禁止新增端點**
> 🔴 **理由**：另寫一次過濾就是 `AC-G3` 那個「同一件事兩個定義點」的形狀重演——兩份初始碰巧相同，**漂移前兩份都會綠**。且本例之成本為**零**：`pool` 已經在那支純函式手上。
**And** 🔒 **不牴觸 `AC-G86`**：該條鎖的是**端點數**（恰 3 個），不是回應形狀；additive 新增欄位在其射程外
**And** 🔒 頁尾可見文字之 `{n}` ＝ `latestAnnouncementsTotal`、`{m}` ＝ 實際顯示筆數（§癸四 第 10 列）；🔒 `{m}` 不得寫死 10（小語料下 `{n} < 10`）
**And** 🔴 **語料要求（兩種規模，缺一則有一個分支恆不可達）**：① `{n} > 10`（超過上限，頁尾須顯示兩個不同的數）；② `{n} === {m}`（未達上限）。

### 逐處處置（F044 引入者共 9 處） {#rationale-sites}

> 🔴 **本表是「已知清單」，不是窮舉。通則是 [`AC-G94`](#rationale-out)，不是本表。**
> ⇒ 🔒 **凡畫面上出現本表未列之說明性文字，一律以 `AC-G94` 之判準自行判斷並處置，不得以「不在表裡」為由放著不管。**
> ⚠ **本表第 10／11 列即為實例**：它們不在原九列中，是 `ux-f044` 依通則自行發現並處置後回報、本輪才被鎖定的。📝 **原九列表由 lead 盤點，漏了這兩處**——這正是「清單永遠不會窮盡、通則才會」的實例。
>
> 🔒 下表之【可見】與【ⓘ】皆為**鎖定文案**；`{...}` 為代入值。原文一律以 `OLD>` 逐字保留於本表。

| # | 位置 | 【可見】 | 【ⓘ popover】 | `OLD>` 原文要點 |
|---|---|---|---|---|
| 1 | 卡④ `ojt-ontime-exclusion-note` | 🔴 **恰加總前兩項**：`已排除 {a+b} 個單位`（`a+b` ＝ 0 時**無可見排除文字**，ⓘ 仍在） | `這張卡只看最近一個月內應完成訓練的單位；應完成日為文件公告日再加一個月。`<br>`其中 {a} 個單位已裁撤、{b} 個單位已不再使用該文件，不列入計算。`<br>🔴 **獨立成句（不得串入上一句的加總）**：`另有 {c} 份文件尚未設定公告日期，無法推算應完成日，因此從一開始就不在這張卡的範圍內。`<br>`「OJT 進度管理」頁不限期限，也會列出這裡不計入的單位，因此兩邊的數字不同。` | `OLD>` 含「母體＝」「屬正常」「進度列」等實作詞彙。<br>🔴 **2026-09-21 第二次就地更正（`ring-f044` 提報，口徑錯誤非文案偏好）**：`OLD>` 可見文字曾為 `已排除 {n} 個單位`、`{n}` ＝ **三項相加**——但第三項 `{c}` 在 ⓘ 內逐字是「**{c} 份文件**」，把**文件加總成單位** ⇒ 該數字在語意上是錯的 |
| 2 | `[data-donut-truncation]` | 合併時：`圖形顯示前 {TOP_N} 個，其餘 {m} 個合併為「其他」（共 {v} 份）。`<br>未合併時：`本維度共 {TOTAL} 個組織，已全部繪出。` | `圖形最多畫 {TOP_N} 段，其餘合併為「其他」。下方圖例仍逐列列出全部 {TOTAL} 個組織。` | 🔴 `OLD>` 之「沒有任何數字只存在於圖形裡」整句刪除（`AC-G94` ③）。<br>📝 **2026-09-21 就地更正（ux-f044 提報）**：原兩個分支皆用 `{N}`，但**指的不是同一個量**——已拆為 🔒 **`{TOP_N}`＝`DONUT_TOP_N`（現值 8，圖形最多畫幾段）** 與 🔒 **`{TOTAL}`＝本維度之組織總數**。原 `{N}` 不得再使用 |
| 3 | 環圖下方「進度中」說明 | **刪除** | `「進度中」指目前還沒到公告日的文件，與月份無關，所以兩張圖上同一個組織的「進度中」數字相同。` | `OLD>` 含「不是重複貼上」（`AC-G94` ②） |
| 4 | 類別長條圖統計單位說明 | **刪除** | `每個類別各自計算掛在它底下的文件；同一份文件若掛在多個類別，每個類別都會算到它，所以各類別加總會多於上方卡片的文件總數。已失效或作廢的文件不列入計算。` | 📝 **2026-09-21 就地更正（ux-f044 提報）**：本列鎖定文案原含 `只計入儲存狀態為有效的文件。`，與第 8 列把同一個詞列為「必須重寫之內部欄位語言」**自相矛盾**；已統一為狀態欄的詞。原文 `OLD>` 保留於本列。<br>🔴 更早之 `OLD>` 含「非節點」（`AC-G94` ④）與「刻意不相等」（②） <br>⚠ **本列曾於 2026-09-21 更正，prototype 同步落後過一次**（`prototypes/07-admin-shell.html:1103` 一度仍為更正前之 `只計入儲存狀態為有效的文件。`，而該字串**本身就違反 `AC-G94`**）。🔒 **此處之權威是本規格，不是 prototype**——`ring-f044` 以規格為準並額外斷言舊措辭不得再現，**正確** |
| 5 | 兩個環圖區塊 `desc` | **刪除** | 當月：`公告日落在本月、且已到公告日的文件。環上每一段代表一個組織。`<br>累積：`所有已到公告日的文件，不限時間。環上每一段代表一個組織。` | `OLD>` 使用 `―` 強調與規格句型 |
| 6 | 環圖空狀態 `hint` | 🟢 **可見、且原樣不改**：`文件於「ICSOP 文件管理」建立並設定公告日期後，公告日一到即會出現在此。` | —（無需 ⓘ） | 🟢 純使用者語言，無內部詞彙 |
| 7 | 統計卡列之 **載入失敗降級態** `hint`（🔴 **主文字逐字 `統計數字暫時無法取得`**）| 🟢 **可見、但重寫**：`這些數字來自「ICSOP 文件管理」。重新整理後仍未顯示時，請通知系統管理員。` | — | ⚠ `OLD>` 含「**即時聚合**」（實作詞彙）。<br>🔴 **2026-09-21 釐清（ux-f044 提報）**：本列是 **`AC-G23` 之載入失敗降級態**（端點省略鍵→`empty-state`），**不是「資料為空」態**——兩者的主文字不同，下游勿混用 |
| 8 | 最新公告空狀態 `hint` | 🟢 **可見、但重寫**：`這裡列出「ICSOP 文件管理」中已設定公告日期、且未失效或作廢的文件，最新公告的排在最前面。` | — | ⚠ `OLD>` 含「**儲存狀態為有效**」「降冪排列」（內部欄位語言） |
| 9 | 類別長條圖空狀態 `hint` | 🟢 **可見、但重寫**：`這裡列出「業務/功能類別管理」中啟用中、且底下已掛上文件的類別。還沒掛上文件的類別不會出現在這裡。` | — | ⚠ `OLD>` 含「**掛載數為 0**」「長條來源＝」（內部詞彙） |
| **10** | 最新公告頁尾（🔴 **表外遇見，ux-f044 依通則自行處置、本輪鎖定**） | `共 {n} 份，這裡顯示最新的 {m} 份。` | `依公告日由新到舊排列。尚未到公告日的文件（狀態為「進度中」）因為日期在後面，會排在最前面。` | `OLD>` 含「屬正常」（`AC-G94` ②）與「降冪」（④） <br>🔴 **2026-09-21 `{n}` 之來源已裁定（`ring-f044` 提報「前端算不出來」）**：`{n}` ＝ **母體總數**（`status='active'` ∧ `announcedDate 非 null`），`{m}` ＝ 實際顯示筆數（≤ 10）。見 `AC-G96` |
| **11** | 類別長條圖截斷行（🔴 **表外遇見，同上**） | `顯示前 {CATEGORY_LIMIT} 類，另有 {k} 類未顯示。`（未截斷時：`共 {n} 類，已全部顯示。`） | `依「已公告」與「進度中」的文件數合計，由多到少排列；點「顯示全部類別」可看到全部 {n} 類。` | `OLD>` 含「排序＝」（`AC-G94` ④）。⚠ `{CATEGORY_LIMIT}` 須由常數推導（`AC-G65`） |

**And** 🔴 **「不進母體」≠「被排除」（📝 2026-09-21 `ring-f044` 提報後新增；口徑問題，不是文案偏好）**：

| 項目 | 計數單位 | 語意 | 是否計入可見之「已排除 N 個單位」 |
|---|---|---|---|
| `excludedInactive` | **單位** | 該單位已裁撤，**曾在母體內、被排除** | ✅ **計入** |
| `excludedOrphaned` | **單位** | 該單位已移出使用部門，**曾在母體內、被排除** | ✅ **計入** |
| `excludedNoAnnouncedDate` | 🔴 **文件** | 無公告日 ⇒ 無從推算應完成日 ⇒ 依 `OQ-D44-12b` **根本不進母體** | 🔴 **不計入** |

> 🔴 **兩個理由，缺一不可**：
> ① **單位不同**——前兩項數的是**單位**、第三項數的是**文件**，相加得到的是一個**沒有意義的數**；
> ② **語意不同**——前兩項是「進了母體又被拿掉」，第三項是「從來沒進過母體」。依 `OQ-D44-12b`，無公告日者**完全不進入母體** ⇒ 把它叫「排除」本身就是錯的。

**And** 🔒 **可見數字須有單一推導點**：新增純函式 `excludedUnitCount(stats)` ⇒ `excludedInactive + excludedOrphaned`，🔴 **可見文字一律委派它**，明文禁止在元件層再寫一次加法（否則日後有人把第三項加回去，而兩處都會綠）
**And** 🔒 **`OjtOnTimeSummary`／`OjtOnTimeNoteStats` 之三個欄位名稱不改**（已在 `AC-G86` 端點契約內），🔴 **但每一欄必須以文件註解寫明其計數單位（單位／文件）**——三個 `excluded*` 同前綴卻不同單位，是下一個人必然會把它們相加的形狀
**And** 🔴 **語料要求**：必須含一筆 `excludedNoAnnouncedDate > 0` 且 `excludedInactive + excludedOrphaned === 0` 之向量——在該向量下，【可見】應**無排除文字**而 ⓘ **仍說明那 {c} 份文件**；🔴 若實作仍三項相加，該向量會翻紅（這是本條唯一的鑑別力來源）

**And** 🔒 **`AC-G57`／`AC-G68` 之「空狀態不得是死路」不放寬，且本輪更加強化**：第 6～9 項之引導文字**一律留在可見層**，🔴 **不得收進 ⓘ**——空狀態正是使用者最需要引導的時刻。

> 📝 **2026-09-21 就地更正（lead 自行修正其裁示）**：
> `OLD>` 原裁示為「6～9 一律進 popover」，規格曾寫成「ⓘ 須緊鄰空狀態主文字，使去向說明仍在**一個互動之內**可達」。
> 🟢 **spec-writer 提出之保留意見經 lead 覆核成立**：那四條是「接下來該去哪裡」的使用者引導，不是實作理由；把它收進 ⓘ **等於把空狀態變成死路**，比原本要防的問題更糟。
> ⇒ 🔒 **改回可見，但四條中有三條混了內部詞彙，必須重寫**（見上表第 7～9 列）——這正是上方 `AC-G94` 那句「『可以留』不等於『原文可以不改』」的實例。
> 📌 **本次更正本身值得記一筆**：一條新規則（`AC-G94`）在初次套用時**過度擴張**，是很常見的形狀；防它的方式是把規則寫成**問句**（「這句話在回答使用者的哪一個問題？」）而非**形容詞**（「技術性的」）。

---

## 非功能需求 {#nfr}

> 🔵 本功能專屬；全站既有 NFR-001～NFR-010 一律繼續適用、一字不改。

### NFR-F044-1 · 儀表板首屏效能
1. 全部聚合資料（4 張卡 ＋ 2 張環圖 ＋ 最新公告 ＋ 類別分布）之伺服端回應時間，在正式站資料規模（ICSOP 文件約 591 份、`ORG_UNIT` 約 139 筆 active 部／處室、四家公司）下，**P95 ≤ 2 秒**。
2. 任一聚合失敗**不得**使其餘區塊消失（`AC-G23`）。
3. 🔴 **類別分布為本功能最重之聚合**（`BUSINESS_CATEGORY_DOC` → `BUSINESS_CATEGORY_NODE` → `BUSINESS_CATEGORY` 兩段 join ＋ `DISTINCT`）；🔴 **明文禁止 N+1**（不得逐類別發一次查詢）。
4. 🔴 **本部上溯不得逐筆回查 DB**：須比照 `createOrgPathResolver` 之既有紀律——每家公司只建一次 `orgCode → 單位` 索引，逐筆查表為 O(1)。
- **Validation Method**: 以正式站規模語料對端點量測 P95；以「單一 provider 丟例外」之單元測試驗證降級；以查詢計數斷言驗證無 N+1。
- **本輪之現實限制**：🔴 **簡化環無效能閘門。** 第 1 點在本輪**不會被機器驗證**，須由人類於實機覆核。第 3、4 點可由單元測試之查詢計數驗證，**必須做**。

### NFR-F044-2 · 圖表之無障礙與非視覺等價
🔴 **已升格為編號 AC**：`AC-G37`／`AC-G49`／`AC-G50`／`AC-G67`／`AC-G71`。本節僅保留指標，不重複條文。

### NFR-F044-3 · 口徑一致性（同畫面兩個數字不得打架）
1. 「已公告」與「進度中」之判定必須來自同一支純函式（`AC-G70`／INV-G7）。
2. 應該相等者**必須恆等**（INV-G1／INV-G2，鎖於 `AC-G6`／`AC-G35`）。
3. 🔴 **刻意不等者必須明文記載其理由，並以斷言鎖住該不等「實際會發生」**（INV-G3／INV-G4／INV-G5／INV-G6，鎖於 `AC-G38`／`AC-G39`／`AC-G68`）。
4. 首頁之 OJT 完成率（分母＝相異單位）與 OJT 頁 TAB1 之覆蓋率（分母＝進度列）口徑不同，🔴 **必須在畫面上可分辨**——前者逐字標題為 `OJT 準時完成率(1個月內)`、卡面句為 `已完成 X / 應完成 Y（Z%）`；後者為「覆蓋率」。兩者標籤不同即為分辨手段。

### NFR-F044-4 · 日期與時區基準
🔴 **已升格為編號 AC**：`AC-G5`／`AC-G8`／`AC-G69`（含凍結時鐘之固定向量表）。

### NFR-F044-5 · 零漣漪回歸鎖定
🔴 **已升格為 [§庚](#regression-lock)** `AC-G75`～`AC-G84`。

---

## §辛 · 受影響之既有檔案與其應如何註記 {#affected-files}

### 一、需新增 delta 段落之既有 feature 檔（spec-writer 已就地補上）

| 檔案 | delta 錨點 | 內容 | 本輪是否已改 |
|---|---|---|---|
| [F042](F042-ojt-progress-management.md) | `{#dashboard-deeplink-delta}` | TAB2 之 URL deep link（`AC-G19`）、`incomplete-first` 客端排序（`AC-G20`）、未帶參數零漣漪（`AC-G21`／`AC-G79`）、`canViewDashboard` 重用（`AC-G17`／`AC-G80`）、篩選與分組態數鎖（`AC-G81`） | ✅ 已補 |
| [F017](F017-backend-document-list.md) | `{#dashboard-sort-deeplink-delta}` | 清單頁新增 URL 排序參數讀取（`AC-G59`）、`查看更多` 之導向（`AC-G58`）、清單既有形狀零漣漪（`AC-G82`）、null 排序落差本輪不動 | ✅ 已補 |

### 二、**不需**改動、但需知悉其條文被本檔引用者

| 檔案 | 被引用之處 | 為何不需改 |
|---|---|---|
| [F002](F002-role-based-routing.md) | `AC-D5`（不新增功能列） | 本功能沿用該鎖定，未推翻（`AC-G77`） |
| [F025](F025-role-function-matrix.md) | 矩陣逐格值 | 本功能**不新增功能列、不改任一格**（`AC-G77`）；其條文一字不動 |
| [F043](F043-business-function-category.md) | `AC-01`（類別層去重口徑）、`OQ-B-04`（停用類別於第 16 欄仍顯示） | 本功能**沿用**前者、**刻意不對齊**後者（`AC-G61`／`AC-G63`）；F043 之條文與數字一字不改 |
| [F012](F012-document-status-toggle.md)／[F037](F037-document-change-history.md) | `deriveDisplayStatus`／`DOCUMENT_CHANGE_LOG` | 前者被沿用、後者被**明文排除**（`AC-G4`）；兩檔條文皆不動 |
| [F041](F041-user-subtype-business-scope.md) | 前台可見性 | 本功能**不把它搬到後台**（`AC-G47`）；F041 條文不動 |

### 三、非 spec 檔之漣漪（交下游執行，spec-writer 本輪不改）

| 檔案 | 處置 | 負責 |
|---|---|---|
| `prototypes/07-admin-shell.html` | 移除 `快速進入功能區` 區塊（標題＋`cardGrid`＋`CARDS`／`renderCards`）；加入本功能四個區塊之版面。🔒 側欄 `MENU` 一行未改 | ui-ux-designer |
| `docs/ui-ux-design-overview.md:973` | 差異表「另加『快速進入功能區』卡片 合計 +4/−0」→ 更新 | ui-ux-designer |
| `docs/ui-ux-design-overview.md:1137` | 「修正後主管卡片為 `[...]`」→ 標記為已作廢（該區塊已移除） | ui-ux-designer |
| `docs/specs/prototype-alignment/browser-smoke-findings.md:49,51` | 🔵 **不改**（2026-07-25 歷史實測紀錄，非現況規格） | — |
| `docs/implementation-logs/frontend-foundation.md` | 🔵 **不改**（實作紀錄，非規格） | — |
| `frontend/src/pages/DashboardHome.test.tsx` **`:77`／`:92`／`:190`**（🔴 **三處**，原估兩處） | `:77`／`:92` 整個 KPI 卡 `describe` **刪除**（授權＝`OQ-D44-03` ＝ 甲）；`:190` **保留、只換載體**（`AC-G84`）。🔒 五個被刪之舊卡標題已**反轉為 `AC-G1` 之負向鎖**，不得靜默消失。詳 `AC-G28` | 🟢 ring-f044（已執行） |
| 🔴 `frontend/src/pages/DashboardHome.test.tsx` 之 **automock**（`vi.mock('../api/endpoints')`） | 🔴 **三份文件皆未涵蓋之漣漪**：新端點落地當下 automock 回 `undefined` ⇒ `undefined.then(...)` 同步拋出 ⇒ **該檔整檔死亡、死因與各案例主題無關**。處置＝**前向相容的 `stubF044Endpoints()`**（只 stub 已存在之匯出）。詳 [`AC-G28`附](#automock-ripple) | 🟢 ring-f044（已執行） |
| `docs/specs/feature-status.md` | 新增 F044 列（🟡 規格完成、未建環） | lead（避免與本輪其他 agent 衝突，spec-writer 未動） |

### 四、🟢 架構裁定後之檔案清單（2026-09-21；權威＝[architecture-spec §15.9](../architecture-spec.md#ch15-modules)）

> 🔵 本表為**指標**，逐檔內容之權威在該節，不得於此複製或改寫。列在這裡是為了讓只讀 F044 的 agent 知道「這一輪會動到哪些既有檔案」。

**新增 10 個檔案**（其中 🟢 **7 個是零 IO 之純函式檔**——本輪之全部鑑別力集中於此）：後端 `dashboard/dashboard-analytics.service.ts`｜`dashboard-analytics.sources.ts`｜🟢`dashboard-analytics.ts`｜🟢`division-resolver.ts`｜🟢`default-org-dimension.ts`｜🟢`category-distribution.ts`｜`category-distribution.source.ts`｜🟢`ojt-progress/add-months-clamped.ts`｜🟢`ojt-progress/ojt-ontime.ts`；前端 🟢`pages/dashboard-analytics-view.ts`。

**修改既有檔案（全部 additive）**：

| 側 | 檔案 | 改動 | 本檔之回歸鎖 |
|---|---|---|---|
| BE | `dashboard/dashboard.controller.ts`／`dashboard.module.ts` | ＋2 個 `@Get`／＋2 個 provider | 既有 2 個路由與 2 個 provider 一行未改（`AC-G75`） |
| BE | `ojt-progress/ojt-progress.controller.ts`／`.service.ts` | ＋1 個 `@Get`／＋1 個公開方法（重用既有 `private aggregate()`） | `AC-G79`／`AC-G81`；`getSummary`／`listRows` 一行未改 |
| FE | `pages/DashboardHome.tsx` | 移除快速進入區＋舊 5 張卡；新增 4 個區塊；🔴 **不再呼叫 `getDashboardSummary()`** | `AC-G22`（最近活動一字不動）；`AC-G75`（端點仍在） |
| FE | `pages/ojt-progress-view.ts` | ＋`addMonthsClamped`／`ojtOnTimeNote`／`sortGroupsIncompleteFirst`／`readTabParam`／`readSortParam`；`trainingDueDate` 改委派 | `AC-G80`：`canViewDashboard`／`coveragePercent`／`exclusionNote`／`EDITION_NONE_TEXT` **一行未改** |
| FE | `pages/OjtProgressPage.tsx` | ＋`useSearchParams`；`tab` 之 `useState` 改初始化函式取樣 | `AC-G21`／`AC-G88`；`gotoSessionsPending()` 不動 |
| FE | `pages/DocumentListPage.tsx` | ＋URL 排序參數取樣 | `AC-G82`（16 欄／14 項篩選／CSV 15 欄不動） |
| FE | `api/endpoints.ts`／`api/types.ts` | ＋3 個函式與其鏡射型別 | `getDashboardSummary` 保留（`AC-G75`），僅不再被 `DashboardHome` 呼叫 |

🔒 **模組相依方向零變更**：`DashboardModule` 依既有紀律**不 import 任何功能模組**（以窄 adapter 直讀實體，比照 `dashboard-counts.ts`）；卡④ 走 OJT 自己的端點 ⇒ **不新增任何模組、不新增任何模組間相依**。
🔒 **代理白名單零修改**：三個新端點皆在既有 `/admin` 前綴下 ⇒ `vite.config.ts`／`nginx.conf` 不動，`proxy-coverage.test.ts` 不受影響（`AC-G86`）。

---

## §壬 · system-architect 裁定（🟢 2026-09-21 全數定案） {#for-architect}

> 🟢 **`ARCH-G1`～`ARCH-G6` 已於 2026-09-21 全數裁定**，逐項內容之權威＝[architecture-spec 第 15 章](../architecture-spec.md#ch15-f044)。**本節僅為指標，不得與該章分歧。**
> 🟢 **兩項 BLOCKING（`ARCH-G1`／`ARCH-G2`）已解除**，設計層阻塞不再存在。
> 🔵 架構師另自行補提一項總體切分原則 **`ARCH-G0`**（見下表末列），本檔原未涵蓋。

| ID | 議題 | 🟢 裁定（2026-09-21） | 落點 |
|---|---|---|---|
| 🟢 **`ARCH-G0`** | 總體切分原則（architect 自行補提） | **SQL 只做投影／join／DISTINCT；分類、分組、上溯、排序、截斷、算術一律純函式。** 🔴 三條禁令：禁 `WHERE announcedDate <= GETUTCDATE()` 或 SQL `CASE` 形式之狀態分類｜禁 SQL 內本部上溯（遞迴 CTE）｜禁 SQL 內排序與截斷（`TOP 10`／`ORDER BY`）。**唯一例外＝類別掛載之 `DISTINCT (businessCategoryId, documentId)`**（沿用 [F043](F043-business-function-category.md) `AC-01` 之既有下推口徑）。<br/>🔴 **理由**：本輪無整合測試 ⇒ 凡落在 SQL 內之邏輯，**一條測試都碰不到它** | [§15.1](../architecture-spec.md#ch15-g0)；本檔 `AC-G70`／`AC-G53`／`AC-G64`／`AC-G61` |
| 🟢 `ARCH-G1` | 卡④ 聚合落前端或後端 | **後端**（`OjtProgressService.getOnTimeUnitStats`，重用既有 `private aggregate()`；口徑純函式落 `backend/src/ojt-progress/ojt-ontime.ts`）。🔴 **功能性理由**：`excludedOrphaned` 在前端**結構上算不出來**（孤兒依定義已不在 `DOC_USING_DEPT` 集合內 ⇒ `rows` 端點結構性地不含孤兒）⇒ 前端方案無法滿足 `AC-G15`。⇒ `addMonthsClamped` 為前後端孿生實作，由 `AC-G8` 之 8 列向量表雙鎖 | `AC-G8`／`AC-G15`／`AC-G86` |
| 🟢 `ARCH-G2` | 預設頁籤之判定輸入來源 | **乙案：端點直接回 `defaultDimension`；`SessionUser` 一欄未加。** ⇒ `OQ-D44-31` 結案 | **`AC-G87`**（新增） |
| 🟢 `ARCH-G3` | 端點切法 | **恰 3 個新端點**；`/admin/dashboard/summary` 一行未改且不再被前端呼叫 | **`AC-G86`**（新增）／`AC-G75` |
| 🟢 `ARCH-G4` | OJT deep link 參數 | `?tab=sessions&sort=incomplete-first`，**兩參數各自獨立解析**（非成對） | **`AC-G88`**（新增）／`AC-G19`／[§命名鎖定](#naming-lock) 第 20 列（🔵 → 🔒） |
| 🟢 `ARCH-G5` | 本部上溯之查詢策略 | **應用層每公司一次索引 ＋ 純函式上溯**（`backend/src/dashboard/division-resolver.ts` 之 `divisionOf`，含循環守衛）。🔴 **否決遞迴 CTE**（本輪測不到）、🔴 **否決 `codePrefix` LIKE**（方向相反：那是**子樹**比對，本題是**祖先**查找）、🔴 **否決新欄／展開表**（`AC-G74`）。<br/>🔒 **跨公司防護是結構性的**：`byCode` 只含一家公司之列 ⇒ 誤用他公司同碼在資料結構上不可能發生；⚠ **明文禁止**攤平成單一 `Map` 再「小心地只查本公司」 | `AC-G33`／NFR-F044-1 #4 |
| 🟢 `ARCH-G6` | 是否共用 `exclusionNote()` | **不共用整支**（三段句型無一相同）；只共用 `coveragePercent()` 與 `NO_STATISTICS_TEXT`，新增同檔姊妹純函式 `ojtOnTimeNote` | **`AC-G89`**（新增）／`AC-G15` |

<details><summary>📝 原「待裁定」表格（逐字保留供追溯）</summary>

| ID | 議題 | 本檔之立場 | 為何不能由 spec-writer 決定 |
|---|---|---|---|
| 🔴 **`ARCH-G1`** | **卡④（OJT 準時完成率）之聚合落在前端還是後端？** | 本檔以純函式 `ojtOnTimeRate(rows, today)` 承載其口徑（`AC-G10`），**刻意不指定它住在哪一層** | 🔴 **這一題決定「＋1 個月」會不會出現第二個定義點。** [F042](F042-ojt-progress-management.md) 明文把 `trainingDueDate()` 宣告為**全站唯一之推導點**，而它**只存在於前端**（後端刻意只送 `announcedDate` 原料）。若聚合落在後端，就必須在後端複製一份月份位移——那正是該註解要避免的形狀。`AC-G8` 已為兩種裁定各備一條路（委派／固定向量雙鎖），但**選哪一條是架構決定** |
| 🔴 **`ARCH-G2`** | **預設頁籤所需之「職位名」如何送到前端？** | 本檔以純函式 `defaultOrgDimension(jobPositionName)` 承載判定規則（`AC-G42`），**刻意不指定該輸入從哪個 payload 來** | 🔴 **已查證：`SessionUser`（`GET /auth/me`）不含 `jobPositionCode`、也不含職位名**（[事實 #9](#verified-facts)）⇒ 前端**目前拿不到判定所需的輸入**。⚠ **analyst 未指出此缺口。** 三種可能：① `SessionUser` additive 新增 `jobPositionName`（由 `SessionGuard` 以 DB 現行值填入，比照既有 `name`／`orgCode` 之作法）；② 環圖端點直接回傳 `defaultDimension`；③ 另立 `/admin/dashboard/preferences`。🔴 **①②③ 之測試落點完全不同**，未裁定則環不知道要鎖哪裡 |
| `ARCH-G3` | 端點切法：擴充既有 `GET /admin/dashboard/summary` 為單一聚合端點，或新增數個獨立端點 | 🔵 analyst 傾向獨立端點（既有 `safe()` 降級紀律天然符合；類別分布為最重之聚合，單一端點會拖慢整張卡片列） | `OQ-D44-30` a 明文交 system-architect |
| `ARCH-G4` | OJT deep link 之參數命名（🔵 建議 `?tab=sessions&sort=incomplete-first`） | 建議值已記於 [§命名鎖定](#naming-lock) 第 20 列 | `OQ-D44-13` 明文交 system-architect |
| `ARCH-G5` | 本部上溯之查詢策略（是否於 SQL 內以遞迴 CTE 下推，或於服務層以索引上溯） | 本檔只要求「不得逐筆回查 DB」（NFR-F044-1 第 4 點） | 效能實作策略，非規格 |
| `ARCH-G6` | 排除註記純函式是否共用 [F042](F042-ojt-progress-management.md) 之 `exclusionNote()`（本檔多一種排除原因） | 🔵 建議共用並擴充；若不共用，須以固定向量鎖住兩者句型一致（`AC-G15`） | 跨模組相依方向之決定 |

</details>

### 為何 data-model 不動

`ICSOP_DOCUMENT`、`ORG_UNIT`、`JOB_POSITION`、`ACCOUNT`、`OJT_SESSION`、`DOC_USING_DEPT`、`BUSINESS_CATEGORY*` 七組實體**已具備本功能所需之全部欄位**：制定公司＝`companyCode`、制定部門＝`draftingDeptId`、本部由 `ORG_UNIT.parentCode` 上溯推導、職位＝`ACCOUNT.jobPositionCode` × `JOB_POSITION`、類別掛載＝`BUSINESS_CATEGORY_DOC` × `_NODE`。⇒ **零新表、零新欄、零 migration**（`AC-G74`）。
🟢 **2026-09-21 確認**：`ARCH-G2` 定案為**乙案（端點回 `defaultDimension`，`SessionUser` 一欄未加）**，⇒ 連**傳輸型別**都沒有變更，本段之結論更加成立。`ARCH-G1`～`ARCH-G6` 六項裁定**無一涉及新欄位或新資料表** ⇒ [data-model](../data-model.md) **本輪確定一列未改**（[architecture-spec §15.12 三](../architecture-spec.md#ch15-handback) 之零漣漪表逐項確認）。
📝 `OLD>` 原逐字為「`ARCH-G2` 之可能結果①（`SessionUser` 新增 `jobPositionName`）是**傳輸型別之 additive 擴充**⋯⚠ **若 system-architect 裁定為其他形狀而涉及新欄位，本段作廢，須回頭補 data-model。**」——該條件句已因裁定而不觸發。

---

## §癸 · 對 test-generator 之建環要求（🔴 語料鑑別力） {#corpus}

> 🔴 **本 repo 反覆踩過的缺陷形狀：一條 AC 在「正確作法」與「某個顯而易見的錯誤作法」之下輸出相同 ⇒ 那條 AC 對該缺陷零鑑別力，寫得再漂亮都是恆真。**
> 下列五處**必須**備妥能區分的語料；🔴 **建環時須逐項自證「若改成錯誤作法，這條斷言會紅」**。

#### (a) `本月新版公告` vs `已公告`（`AC-G4`／`AC-G5`）
語料**必須同時含**：① 上月公告之文件；② 本月已公告之文件；③ **本月但公告日在未來**之文件；④ `announcedDate` 為 `null` 之文件；⑤ 本月公告但已改為 `inactive` 之文件。
🔴 **若語料只有「本月」與「非本月」兩種，則「只算已公告」這半句恆真、零鑑別力。**

#### (b) 本部上溯（`AC-G33`／`AC-G34`）
> 📝 **2026-09-21 就地更正（🔴 事實更正，[architecture-spec §15.12 一 D](../architecture-spec.md#ch15-handback)／[§15.7 末](../architecture-spec.md#ch15-g5)）。**
> `OLD>` ② 原逐字為「**無 `DIVISION` 祖先之部**（**直掛 ROOT 或組織樹結構特殊**）」。
> 🔴 **該描述會讓語料造不出來，照它建的環仍然恆真。** architect 查證 `backend/src/org-sync/org-hierarchy.ts`：`parentCode` 由代碼前綴**機械推導**（`deriveParentCode`：`AN000` → `A0000`），且 `deriveTier` 對 `X0000` 形狀**恆**判為 `DIVISION` ⇒ 任一 `DEPARTMENT`／`SECTION` 之上溯鏈**必然**經過一個 `X0000`。「直掛 ROOT」（`parentCode = '00000'`）在真實資料裡**不可能出現**。

語料**必須同時含**：
① 有 `DIVISION` 祖先之部（正常路徑）；
② 🔴 **一個部，其對應之本部層列（`X0000`，如 `A0000`）在 `ORG_UNIT` 中不存在** ⇒ 落 `無本部` 段。
  🔒 **這是 `無本部` 的唯一成因**（上游 `VW_DEPT_SQL` 未提供該本部層列，或該列因 `isActive` 以外之原因未落地）。語料必須以「**缺少那一列**」來構造，**不得**以「奇怪的樹形」構造；
③ `draftingDeptId` 為 `null`（或查無該 `orgCode`）之文件 ⇒ 落 `未指定` 段；
④ **不同公司之相同 `orgCode`**（驗證 `AC-G33` 之禁跨公司查表；dev 實測四家間有 42 個重複碼）。

🔴 **若語料中每一個部的 `X0000` 列都存在，「無本部」那一段永遠不會產生，`AC-G34` 恆真。**
🔴 **若語料只有一家公司，「禁跨公司查表」恆真。**
📌 **附帶**：上溯深度由代碼結構決定，**最多 4 跳**（`SUBSECTION` → `SECTION` → `DEPARTMENT` → `DIVISION`）；`AC-G33` 要求的循環守衛在正常資料下**永不觸發**，它是對「有人手改過 `parentCode`」的防禦——⇒ 🔴 **其唯一載體是純函式層的人工 fixture**（刻意造一個 `parentCode` 互指的環），不得宣稱它被真實資料驗過。

#### (c) 類別長條圖之去重與不等式（`AC-G61`／`AC-G68`）
語料**必須同時含**：① **同一份文件掛在同一類別之多個節點**（驗去重）；② **同一份文件掛在不同類別**（驗 INV-G4 之重複計入確實發生）；③ **完全未掛任何類別之文件**（驗 INV-G4 之第二個成因）；④ **掛有 `inactive` 文件之類別**（驗 INV-G5 取到嚴格小於）；⑤ **停用之類別**（驗 `AC-G63`）；⑥ **兩個總數相同之類別**與**兩個顯示名相同、id 不同之類別**（驗 `AC-G64` 之 tie-break 決定性）。
🔴 **若語料中每份文件只掛一個類別的一個節點，去重斷言與兩條不等式全部恆真。**

#### (d) 職位預設頁籤（`AC-G42`／`AC-G43`）——🔴 **全數落在後端 jest，前端 vitest 不承擔**

> 📝 **2026-09-21 載體移轉（ui-ux-designer 提報）**：`ARCH-G2` 裁定 `defaultDimension` 由端點回傳 ⇒ **前端不再持有職位白名單**，prototype 之 `JOB_POSITIONS`／`resolveJobPositionName`／`DIM_COMPANY_TITLES`／`DIM_DIVISION_TITLES`／`defaultOrgDimension` 五項已移除。
> 🔴 **原本指望的「`AD|B01 本處長` 下拉選項」這個畫面載體已不存在** ⇒ 下列七個向量**一律以後端 `defaultOrgDimension`（純函式）與 `buildJobPositionResolver`（解析層）之 jest 斷言承載**。
> ⚠ 前端這一側之可驗部分已另立為 **`AC-G90`**（`normalizeDefaultDimension` 五個向量 ＋ 「前端無白名單」之原始碼層斷言）。

語料（🔴 **全部於後端**）**必須含**：
① 🔴 **AD 公司之 `B01` ＝ `本處長` ⇒ `'department'`**——**本項最關鍵之向量**：若實作以 `code === 'B01'` 判定，它會錯誤地回 `'division'`，斷言翻紅；
② AS 公司之 `B01` ＝ `本部長` ⇒ `'division'`（與① 成對，兩者共同證明判定走的是 **name** 而非 **code**）；
③ AD 之 `C04` ＝ `部長`、AS 之 `C04` ＝ `處長`（皆 `'department'`）；
④ 🔴 **跨公司 fallback 之反例**：一個只存在於 AS 而不存在於 AD 的代碼，以 AD 之 `companyCode` 查詢 ⇒ **必須回 `null`** ⇒ `'department'`（若實作允許 fallback，它會拿到 AS 的名稱而可能回 `'division'`）；
⑤ `jobPositionCode` 為 `null` 之帳號 ⇒ `'department'`；
⑥ 人工 fixture `副本部長` ⇒ `'division'`；
⑦ 人工 fixture `副總經理` ⇒ `'department'`（驗**完整字串相等**、非 `includes`——`includes` 之下它會被誤判為 `'company'`）。

⚠ **⑥⑦ 在真實語料中沒有載體**（上游正式環境四家共 75 列職位名皆無此二值，全 repo grep `副本部` 零命中）——🔴 **測試註解須明記其為人工 fixture，不得宣稱它在實機上被驗過**（同 [architecture-spec §15.10](../architecture-spec.md#ch15-blindspots) #8：永遠無法覆核）。
🔴 **若語料只有一家公司**，①②④ 三個向量全部恆真，`AC-G43` 對「禁 code 比對」與「禁跨公司 fallback」零鑑別力。

#### (e) 可見性閘門「讀矩陣 vs 角色清單」（`AC-G18`／`AC-G58`／`AC-G66`）

> 📝 **2026-09-21 建環階段就地更正（ring-f044 找到注入點，lead 核准）——本項之悲觀結論已被推翻。**
> `OLD>` 原文逐字為「🔴 **元件層測試對此零鑑別力**——在當前矩陣值下，『讀矩陣』與『寫角色清單』渲染出來的畫面**完全相同**。⇒ **鑑別力載體必須是純函式層**…若無法注入矩陣替身，則至少須以 `canPerform` 之呼叫被實際發生（spy）作為載體」。

🟢 **正確的結論：閘門可以被真正驗證——注入點不是 `FUNCTION_MATRIX`，是 `canPerform` 本身。**

- ❌ `FUNCTION_MATRIX` 是**模組級常數**，確實沒有注入點——這部分原文沒寫錯。
- 🟢 **但那件事不蕴含「閘門無法被驗證」**：改而 **mock 掉述詞本身**即可——
  前端 `vi.mock('...function-matrix', importOriginal)` 保留其餘匯出、只換掉 `canPerform`；後端 `jest.spyOn`。
- 🔒 **這是一條會被反覆引用的紀律**：「某個常數沒有注入點」與「靠它做判定的那個行為無法驗證」是**兩件事**；
  先問「有沒有一個函式將它包起來」，再下「零鑑別力」的結論。

🔴 **四個錯誤實作探針已實測（ring-f044，皆能翻紅）**：

| # | 錯誤實作 | 翻紅數 |
|---|---|---|
| ① | 寫死角色清單（`role !== 'DeptContact'`） | 3 |
| ② | 讀矩陣但**讀錯格**（拿錯功能鍵） | 5 |
| ③ | 寫死恆允許 | 6 |
| ④ | 🔴 **呼叫了 `canPerform` 但忽略回傳值、改比對角色字面** | 2 |

⇒ 🔒 第 ④ 項正是**舊方案（以 spy 確認 `canPerform` 被呼叫）抳不住的形狀**——它確實呼叫了，spy 會通過，但判定根本沒用到回傳值。
  ⇒ 🔴 **明文禁止**以「`canPerform` 被呼叫過」作為本組 AC 之唯一載體；**必須 mock 其回傳值並斷言畫面隨之而變**。

📌 `AC-G66` 仍是三者中唯一在**未經 mock 之當前矩陣值下**即有畫面鑑別力者（`DeptContact` ＝ `NONE`）——那一條兩種斷言都該有。

#### (f) 零漣漪之「絕對值鎖」風險（[§庚](#regression-lock)）
🔴 **本 repo 已記錄「擴充列舉值漏改既有絕對值鎖」之形狀**（新斷言要 15 列／3 值、既有他處斷言鎖死 14／2，同一份環不可能全綠）。
⇒ 建環前**必須 grep「值字面」而非函式名**（例：grep `16`／`14`／`15` 於 F017 相關測試，grep `5` 於 dashboard summary 相關測試），確認新增鍵不會撞上任何既有之「恰 N 個」斷言。
⚠ 特別注意 `AC-G75`：`DashboardCounts` 由 5 鍵擴為 5+N 鍵 ⇒ 🔴 **任何 `Object.keys(summary).length === 5` 之既有斷言都會翻紅**，必須先找出來並判斷該改成回歸鎖（既有 5 鍵皆存在）還是保留絕對值。

> 🟢 **2026-09-21 更新：本輪之風險已歸零。** `ARCH-G3` 裁定改走三個新端點（`AC-G86`），`DashboardCounts` 之鍵集合**一個未動**（`AC-G75`）⇒ 上段所警示之翻紅不會發生。
> 🔒 **但上段文字刻意保留**，作為日後有人想 additive 擴充 `summary` 時的警語——**那時這個風險會立刻復活**。
> ⚠ 本段之其餘部分（grep「值字面」而非函式名）**仍然適用**：F017 之 16 欄／14 項篩選／CSV 15 欄（`AC-G82`）、F042 之「恰兩項篩選／恰三值／恰二態」（`AC-G81`）、`FunctionKey` 恰 15 鍵（`AC-G77`）皆為絕對值鎖。

#### (g) 🔴 卡④ 之窗口：必須能區分「正向計算」與「反推 `announcedDate` 區間」（`AC-G7`／`AC-G8`）
> 🔴 **本項為 2026-09-21 新增**，對應 `AC-G8` 之負向鎖定（[architecture-spec §15.11](../architecture-spec.md#ch15-rejected) ②）。

實作者最可能自作聰明的捷徑是：把母體條件由「應完成日 ＝ `announcedDate + 1 月` 落在 `[今日 − 1 月, 今日]`」**反推**成「`announcedDate ∈ [今日 − 2 月, 今日 − 1 月]`」，如此後端只需比較日期字串、完全不需要月份位移。

🔴 **該等價不成立**（`addMonthsClamped` 因月底夾擠而不可逆），但**在乾淨語料下兩者輸出完全相同** ⇒ 若不特意安排，`AC-G7`／`AC-G8` 對這個錯法**零鑑別力**。

**語料必須含**：三份文件，`announcedDate` 分別為 **`2026-01-29`／`2026-01-30`／`2026-01-31`**（三者 `+1` 後**同為** `2026-02-28`），並凍結 `today` 於 **`2026-02-28`**。
- **正向計算**（正確）：三份**全部**落入窗口 `[2026-01-28, 2026-02-28]`。
- **反推區間**（錯誤）：窗口為 `announcedDate ∈ [2025-12-28, 2026-01-28]` ⇒ 三份**全部落空**。

⇒ 兩種作法之分母相差 3，斷言必紅。🔴 **少了這三列，該負向鎖定只是一段註解。**

#### (h) 🔴 `sortGroupsIncompleteFirst` 之段內次序（`AC-G20`／`AC-G93`）

> 🟢 **designer 誠實提報**：`prototypes/25-ojt-progress.html` 之示範語料中「全部完成」的群組**只有 1 個** ⇒ 「已完成段之段內次序」那半句之向量長度為 1，
> **無法區分「穩定分段」與「把全完成者以任意次序丟到最後」**。
> 🟢 **designer 刻意不補第二個全完成群組，這個取捨是對的**（lead 核可）：補了就要改既有語料，會連帶動到 TAB1 之 KPI、`#inactiveNote`、區二 rollup 與 [F042](F042-ojt-progress-management.md) 既有測試期望值——`AC-G21`／`AC-G79` 明文禁止。

⇒ 🔴 **該向量的缺口必須由 test-generator 在純函式層以人工 fixture 補齊**（而**不是**去改 prototype 語料）：

`sortGroupsIncompleteFirst(groups)` 之純函式測試語料**必須含**：
- 至少 **2 個全部完成**之群組；
- 至少 **2 個未全部完成**之群組；
- 且兩段在**輸入序列中是交錯排列**的（例：未完成、全完成、未完成、全完成）——🔴 若輸入本來就已經是「未完成在前」，排序前後輸出相同，整條恆真。

斷言：**兩段各自的段內次序逐項等於它們在輸入中的相對次序**（非僅比對集合），且**輸出之群組集合與輸入完全相同**（證明是排序不是篩選，`AC-G20`）。

#### (i) 🔴 四個「形狀錯了、內容沒錯」之實例（前三個機器抓不到，第四個由環抓到）（本輪紀錄） {#human-caught}

> 🔴 **本節不是語料要求，是對下一輪的警語。** 本輪發生**四次**「規格是對的、測試也綠的，但那條 AC 實際上已經沒有人在驗」（🟢 **第四次已由環抓到**）。
>
> 🔒 **三者之共同點（本節真正要留下的一句）**：
> 　　🔴 **三者都是斷言的「形狀」錯了，而不是斷言的「內容」錯了。**
>
> ⇒ 這是機器抓不到它們的原因：**內容錯了會翻紅，形狀錯了不會**——它要麼恆真（永遠不紅），要麼恆紅而被人關掉。
> 🔴 **四次就不是巧合，是一個形狀。**

| # | 實例 | 為何機器抓不到 |
|---|---|---|
| ① | **`AC-G42`／`AC-G43` 之載體蒸發**（`LESSON-G1`）：`ARCH-G2` 把職位判定搬到後端 ⇒ prototype 之職位白名單被移除 ⇒ 兩條 AC 的畫面載體消失 | **條文一字未變、既有測試也沒翻紅**——「沒有東西再驗它」不是任何斷言會失敗的事 |
| ② | **原型與正式站之群組次序分歧**（`AC-G93`）：原型為 `orgCode` 昇冪、正式站為 `orgName.localeCompare` | 兩邊**各自都是綠的**；實作者照抄原型的答案時，翻紅的會是 F042 既有測試——而那時最容易的反應是「改測試期望值」 |
| ③ | **斷言錨點釘在恆存在的容器**（`AC-G91`）：「點擊後 chip 自 DOM 移除」之負向斷言若釘在 host `#sortNoticeHost` 而非 `[data-ojt-sort-notice]` | **host 是恆存在的空容器** ⇒ 該斷言在**任何實作下都不會紅**，是一條恆真的空斷言；它看起來與正確寫法**一模一樣**，只差一個選擇子 |
| ④ | 🔴 **`AC-G89` 之載體蒸發（`LESSON-G1` 第二個實例）**：第六輪把卡④ 說明文字搬進 ⓘ，六條相關 AC 都加了指標、**唯獨 `AC-G89` 漏了** ⇒ 它仍要求一支帶「覆蓋率頭句＋百分比」的函式，而那些內容已不存在 | **條文一字未變**；若無環，實作者會遠聲地把它實作成一支**沒有消費者的函式**，而兩邊都綠 |

🔴 **三個實例的檢查方法其實是同一個——一條可執行的自檢**：

> 🔒 **寫完一條斷言，問兩件事：**
> ① **它有沒有可能對「正確的東西」翻紅？**　⇒ 誤報，**會被關掉**。
> ② **它有沒有可能對「錯誤的東西」不紅？**　⇒ 恆真，**等於沒寫**。
> 🔴 **兩題都要答得出來具體情境**；答不出來，就是還沒想清楚它在鎖什麼。

🔒 **特別針對「全文掃描類」斷言（`ring-f044` 可直接拿去用的清單）**——三個共同失敗形狀：
**① 誤報被關掉**（需具名例外＋清單自我守護）｜**② 恆綠沒守護**（缺正向探針）｜**③ 把用法禁令當詞禁令**（需鎖句型而非鎖詞）。
逐項與其處置見 [§癸 (j)](#scan-failure-shapes)。

🟢 **第 ④ 項與第 ① 項是同一個形狀（`LESSON-G1`），但之間有一個關鍵差異，值得寫明**：

| | ① `AC-G42`／`AC-G43` | ④ `AC-G89` |
|---|---|---|
| 發現者 | 🔴 **`ux-f044` 主動提報**，機器**零感知** | 🟢 **環的 4 條紅燈直接指出矛盾** |
| 差異之成因 | 那時**還沒有環** | 這時**環已經在那裡** |

> 🔒 **結論（兩輪之間真正的進步）**：**「載體蒸發」這個形狀，已由「只能靠人覆核」變成「至少在有環覆蓋的區域會翻紅」。**
> ⚠ **但必須同時寫明其限制**：🔴 **只有被環覆蓋到的載體才會紅**——沒有環的地方（prototype 版面、人工 fixture 之實機意義、效能、圖形幾何）**仍然只能靠人**。
> ⇒ 🔒 **不得以本項進步為由，取消第 1 條衍生紀律的人工回頭檢查。**

🔒 **兩條衍生紀律**：
1. 凡有「把某段判定換一層執行」之決策，必須逐條回頭問：**那條 AC 的載體還在嗎？**
2. 凡 prototype 與已上線程式碼就同一件事給出不同答案，**不得默認原型是權威**——先查哪一邊是既有行為，再把分歧**逐字寫進規格**。

#### (j) 🔴 全文掃描類斷言之三個共同失敗形狀（`AC-G90` ③／`AC-G94`／任何日後新增者） {#scan-failure-shapes}

> 📝 **2026-09-21 新增（lead 建議收斂）**：本輪已出現 **三個共用同一形狀的條款**，收成一條共用紀律。
> 🔒 **本節適用於本檔現有及日後新增之所有「掃全文、斷言零命中」型的條款。**

「掃描全文、斷言某型樣零命中」是本輪反覆使用的斷言形式。它有**三個失敗形狀，三個都不會讓測試看起來是壞的**：

| # | 失敗形狀 | 它在畫面上的樣子 | 必須搭配的處置 | 本輪實例 |
|---|---|---|---|---|
| ① | 🔴 **誤報 → 被關掉** | 斷言恆紅，且命中的那一處**看起來完全合法** ⇒ 下一個人把它注解掉 | 🔒 **具名例外清單**（逐項附理由與來源 AC）＋**清單自我守護**（例外項須仍存在且仍命中） | `AC-G90` ③：`jobPositionCode` 於 [F003](F003-account-role-management.md) 合法，裸詞掃描**永遠不可能綠** |
| ② | 🔴 **恆綠（沒有守護）** | 斷言永遠綠，因為它根本沒讀到東西（掃描路徑錯、渲染失敗、選擇子拼錯） | 🔒 **正向探針**：先斷言「掃描確實讀到了預期中必然存在的東西」，再斷言零命中 | `AC-G90` ③ 之「確實讀到前端原始碼」、`AC-G94` 之「確實讀到畫面文字」 |
| ③ | 🔴 **把「用法禁令」實作成「詞禁令」** | 同 ①，但根因更隱微：**規則本身就不該是字面級的** | 🔒 **鎖定具體片語／句型**（而非裸詞），或退而求其次用 ① 之具名例外 | `AC-G94` ④：「節點」於 `最近活動` 是**真實的領域語言**，禁的是以它解釋統計單位那個**用法** |
| ④ | 🔴 **掃描的「狀態涵蓋面」不足** | 斷言綠，但它**只在一個狀態下跑過**；只出現於其他狀態的違規字串**從未被渲染出來過** | 🔒 **逐狀態渲染再掃**（完整語料／空資料／載入失敗降級／權限受限…），並將「已掃過哪些狀態」寫進測試註解 | 🔴 **`ring-f044` 自己抓到並修掉的假綠**：初版掃描只在**完整語料**下執行，於是 `即時聚合`（僅載入失敗態）、`掛載數為 0`／`降冪`（僅空狀態）**三條全部假綠通過**——而它們正是 §癸四 第 7／8／9 列要處置的違規 |

🔒 **四條合一之紀律——寫一條「掃全文、斷言零命中」之前，先回答三個問題**：
> ① **現在就跑一遍，它綠嗎？** 不綠 ⇒ 你需要的是**具名例外**，不是把型樣改弱。
> ② **如果掃描對象突然變成空的，它會翻紅嗎？** 不會 ⇒ 加**正向探針**。
> ③ **我禁的是這個字，還是這個用法？** 是用法 ⇒ **鎖句型，不鎖詞**。
> ④ **我在哪些狀態下跑過它？**　只跑一個 ⇒ **只證明了那一個**。

🔴 **這四個形狀本輪各發生一次，四次都不是「斷言翻紅」提醒的**：① 由 `ring-f044` 建環時實查發現；② 由 spec-writer 寫條文時自行預防；③ 由 lead **在掃描清單外多掃了一個詞**而發現；④ 由 `ring-f044` **自己想到要換個狀態再跑一次**而發現。

> 🔒 **第 ④ 項之通則（`ring-f044` 原句，逐字收錄）**：
> 📌 **凡「某文案不得出現」之掃描，其涵蓋面等於「被渲染到的狀態集合」——只掃一個狀態，就只證明了那一個狀態。**
> ⇒ 🔒 這也正好解釋了為什麼 `ux-f044` 要在 prototype 備**四個示範態**（完整／空資料／載入失敗降級／權限受限）：**那不是為了好看，是掃描類斷言的涵蓋面來源。**
⇒ 🔒 **推論**：這類斷言的正確性**無法由它自己保證**——它們需要一次人為的「拿一個不在清單上的東西試試看」。🔒 **建議列入交棒清單。**

---

## 開放問題與 `[ASSUMPTION]`（本輪新提報） {#open-questions}

> 🔵 下列為 spec-writer 於撰寫本檔時發現、**30 題裁決單未涵蓋**者。均已以最佳解讀寫入 AC 並標註，**不阻塞建環**，但須於人類覆核時一併裁示。

| ID | 議題 | 本檔之處置 | 若裁為其他 |
|---|---|---|---|
| ~~`OQ-D44-31`~~ | **預設頁籤所需之「職位名」目前前端拿不到**（`SessionUser` 無此欄）——analyst 未指出 | 🟢 **已結案（2026-09-21，`ARCH-G2` ＝乙案）**：端點直接回 `defaultDimension`，**`SessionUser` 一欄未加** ⇒ **`AC-G87`**。🟢 使用者原文「董事長、總經理預設／本部長、副本部長預設」**保住了載體**，`AC-G42` 不需退化為「一律預設依制定部門」 | 🟢 **已定案 ✅**（阻塞解除） |
| ~~`OQ-D44-32`~~ | **「＋1 個月」是否會產生第二個定義點** | 🟢 **已結案（2026-09-21，`ARCH-G1` ＝聚合落後端）**：🔴 功能性理由——`excludedOrphaned` 在前端**結構上算不出來** ⇒ 前端方案**無法滿足 `AC-G15`**。⇒ `AC-G8` 之孫生實作路徑生效（三條執行要求），並新增**反推捷徑之負向鎖定** ＋ [§癸 (g)](#corpus) 之鑑別語料 | 🟢 **已定案 ✅**（阻塞解除） |
| ~~`[ASSUMPTION] A-G1`~~ | `依制定部門` 維度下無 `DIVISION` 祖先時之標籤 ＝ `{公司簡稱} / {部名}`（本部段**收合**） | 🟢 **2026-09-21 ui-ux-designer 落地確認**；依據＝`buildOrgPath` 之既有「空欄自動收合」紀律（`AC-G36`） | 🟢 **已結案 ✅** |
| ~~`[ASSUMPTION] A-G2`~~ | 兩個環圖區塊之頁籤**各自獨立**切換（非連動） | 🟢 **2026-09-21 ui-ux-designer 落地確認**（`AC-G45`）。🔴 斷言仍須**先限定容器**（`within(getByTestId('donut-month'))`）——兩區塊各有一組同名頁籤 | 🟢 **已結案 ✅** |
| ~~`[ASSUMPTION] A-G3`~~ | 圖例數字之前綴採 `DISPLAY_LABEL` 之 `已公告 {n}`／`進度中 {n}`，**而非使用者原文之「公告數量」** | 🟢 **2026-09-21 人類閘門核准＝接受**（本項已依規格之「不得藏起來」要求**原樣呈報給使用者**，使用者直接選定此選項）。理由：`已公告`／`進度中` 在同一畫面之**卡片、環圖、長條圖、清單狀態欄四處**已是共用狀態詞（`DISPLAY_LABEL`），圖例獨用「公告數量」會讓**同一個數字在同一頁有兩個名字**，那本身就會被回報為 bug。<br>🔴 **本項為全檔唯一一處未逐字沿用使用者措辭者**，🟢 **已於人類閘門呈報並獲授權**，不再是一項推定 | 🟢 **已定案 ✅**（2026-09-21 人類閘門） |
| ~~`[ASSUMPTION] A-G4`~~ | 卡④ 分母為 0 空狀態逐字 ＝ `近 1 個月內無應完成之 OJT 單位` | 🟢 **2026-09-21 ui-ux-designer 落地**，[§命名鎖定](#naming-lock) 第 4 列升 🔒 | 🟢 **已結案 ✅** |
| ~~`[ASSUMPTION] A-G5`~~ | 類別長條圖之展開入口逐字 ＝ `顯示全部類別` | 🟢 **2026-09-21 ui-ux-designer 落地**，[§命名鎖定](#naming-lock) 第 16 列升 🔒；🔴 **並新增第 16b 列之收合鈕 `僅顯示前 10 類` 與「互斥存在」性質**（`AC-G65`） | 🟢 **已結案 ✅** |
| ~~`[ASSUMPTION] A-G6`~~ | 環圖之 Top N 中 N 之值 | 🟢 **2026-09-21 ui-ux-designer 定案＝`DONUT_TOP_N = 8`**（理由載於 prototype），[§命名鎖定](#naming-lock) 第 11 列已回填 | 🟢 **已結案 ✅** |
| 🔴 **`LESSON-G1`** | **一個架構決策可以讓一條 AC 的載體在無人察覺之下蒸發**——`ARCH-G2` 把職位判定搬到後端，使 `AC-G42`／`AC-G43` 的 prototype 載體（`AD|B01 本處長` 選項）消失；**條文一字未變、既有測試也沒翻紅**，它們只是沒有任何東西再驗了 | 🔴 **本輪之機器闘門抓不到這種事**；是 ui-ux-designer 主動提報才發現。🔒 **凡日後再有「把某段判定換一層執行」之決策，必須逐條回頭問：那條 AC 的載體還在嗎** | 🟢 **已處置**（`AC-G42`／`AC-G43` 改為後端純函式 AC；新增 `AC-G90` 承載前端可驗部分） |
| 🔴 **`LESSON-G2`** | **「不變式需要可驗證的載體」≠「不變式需要可見的文案」**——本規格反覆要求「INV 須有畫面承載」，下游忠實照做，結果把**寫給機器看的理由**變成了**畫面上的常駐文案**（最露骨一句：`下方圖例仍逐列列出全部 11 個組織，沒有任何數字只存在於圖形裡。` ——那是把 `AC-G71` 逐字唇給使用者聽） | 🔴 **根因在規格，不在下游**。載體可以是 `data-*`、`aria-label` 或 popover 內的文字；把不變式的**理由**寫成常駐說明，是**把驗收標準洩漏給使用者**。🔒 **日後凡要求「INV 須有畫面載體」時，必須同時指定「它是給誰看的」** | 🟢 **已處置**：新增 [`AC-G94`／`AC-G95`](#rationale-out)，九處逐條定案新文案（[§癸四](#rationale-sites)） |
| ⚠ `OQ-D44-33` | **NFR-F044-1 之 P95 ≤ 2 秒在本輪沒有機器閘門**（簡化環無效能測試） | 明記於 NFR-F044-1 之「本輪之現實限制」，須由人類實機覆核 | 若要機器驗證，須另行授權引入效能測試工具（超出本輪範圍） |
| ⚠ `OQ-D44-34` | **環圖弧長／長條寬度之幾何正確性在本輪無法端到端驗證** | `AC-G49`／`AC-G67`：把幾何計算抽為純函式並以固定向量斷言，是本輪唯一能把它拉回可測範圍的途徑 | 若人類要求端到端視覺驗證，須引入 Playwright 或視覺回歸（本輪明示不做） |

---

## Definition of Done（本檔之交付標準）

- [x] 30 題 `OQ-D44-*` 之裁決逐題落為編號 AC，無遺漏、無自行推定
- [x] `AC-G1`～`AC-G93` 共 **93 條**（原稿 84 ＋ 架構回填 5 ＋ 設計回填 4），每一條皆指名其載體（`role`／`aria-label`／`data-testid`／逐字文案／純函式名）
- [x] 全部口徑類 AC 皆為「給定輸入集合 → 期望輸出數字」之純函式可測形狀
- [x] 每一個圖表數值皆有文字載體之要求（`AC-G71` 之負向鎖定）
- [x] **八處**鑑別語料要求明文列出（[§癸](#corpus) (a)～(h)）；🔴 (d) 已隨載體移至**後端 jest**；另 (i) 記錄兩個「人類／agent 抓到、機器抓不到」之實例
- [x] 回歸鎖定清單 `AC-G75`～`AC-G84`
- [x] 三條恆等不變式（INV-G1／INV-G2／INV-G6）與三條**刻意不等**（INV-G3／INV-G4／INV-G5）皆有對應 AC
- [x] 受影響既有檔案逐項列出，兩處 delta 已就地補上
- [x] 交 system-architect 之 6 項（含 2 項 BLOCKING）明文列出
- [x] 🟢 **`ARCH-G0`～`ARCH-G6` 已於 2026-09-21 全數裁定並回填**（兩項 BLOCKING 解除）；4 項牴觸已就地修訂（6 項回填已落為 `AC-G85`～`AC-G89` 與就地補明）
- [x] 🟢 **ui-ux-designer 第一批 5 項已合入**（DOM 契約＋2 列｜卡④ 嵢狀節點｜`AC-G64` tie-break 向量更正｜`AC-G65` 收合鈕與互斥存在｜🔴 `AC-G42`／`AC-G43` 之載體失效修正 ＋ 新增 `AC-G90`）
- [x] 🟢 `[ASSUMPTION]` `A-G1`／`A-G2`／`A-G4`／`A-G5`／`A-G6` 已由 ui-ux-designer 落地並回填（Top N ＝ **8**，`CATEGORY_LIMIT` ＝ **10**）；🟢 **`A-G3` 亦已於同日經**人類閘門**核准＝接受**（已依「不得藏起來」要求原樣呈報，由使用者直接選定） ⇒ **6 項 `[ASSUMPTION]` 全數結案**；🔒 `A-G3`（圖例前綴採 `DISPLAY_LABEL` 而非原文「公告數量」）為**全檔唯一一處未逐字沿用使用者措辭者**，將於**人類閘門一併呈報，不得藏起來**。
- [x] 🟢 **ui-ux-designer 接收端（prototype 25）之 4 項已合入**：`AC-G91`（`取消排序` chip ＋ 🔴 錨點釘在 `[data-ojt-sort-notice]` 而非恆存在的 host）｜`AC-G92`（以文件分組不生效，🔴 prototype 結構上無法承載）｜`AC-G93`（🔴 原型 `orgCode` 昇冪 vs 正式站 `orgName.localeCompare` 之分歧鎖）｜[§癸 (h)](#corpus)（全完成群組 ≥ 2 之人工 fixture）
- [x] 🟢 **人類覆核本檔並核准進入建環——已於 2026-09-21 通過**（使用者裁決兩項：`A-G3` ＝ 接受；核准進入建環）
- [x] 🟢 **2026-09-21 人類裁決第二輪（實作理由退出畫面）已落為 `AC-G94`／`AC-G95`**，九處逐條定案新文案；🔴 `LESSON-G2` 已寫入——**根因在本規格自己**（要求 INV 有畫面載體、卻未指定「給誰看」）

🔴 **但本清單全部打勾＝「規格完成」，不等於「功能完成」。**截至 2026-09-21，F044 之測試與程式碼**尚未寫一行**（見檔頭之核准前置警語）。

### 下一棒：test-generator（建環） {#handoff}

🔴 **交棒時須單獨點名之三條**——它們的鑑別力取決於**斷言寫在哪裡**而非「斷言寫了什麼」，若被寫成空斷言，**機器闘門會全綠**：

| # | AC | 風險 |
|---|---|---|
| ① | `AC-G90` ③（原始碼層） | 須含**兩個必要排除**（本 spec 自身與測試檔；`api/types.ts` 之具名例外），且其**已知局限逐字不得淡化**（「降低風險」非「證明不存在」）；🔒 **②（元件層向量）與 ③（原始碼層）缺一不可** |
| ② | `AC-G91` | 負向斷言必須釘 `[data-ojt-sort-notice]`，**釘 host `#sortNoticeHost` 是恆真的空斷言** |
| ③ | `AC-G18`／`AC-G58`／`AC-G66` | 🟢 **2026-09-21 已解決，本列保留作為紀律**：注入點不是 `FUNCTION_MATRIX`（模組級常數、確實無注入點），而是 **`canPerform` 本身**（前端 `vi.mock` ＋ `importOriginal`；後端 `jest.spyOn`）。🔴 **仍禁止**以「`canPerform` 被呼叫過」為唯一載體——探針 ④（呼叫了却忽略回傳值、改比對角色字面）正是 spy 抳不住的形狀。詳 [§癸 (e)](#corpus) |
