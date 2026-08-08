# F040: 循環子分類（Lifecycle Subcategory）
Priority: P0-MVP | Status: 規格 🟢 APPROVED（2026-08-07 人類閘門通過含 4 項裁決；2026-08-08 追加裁決 5） · 實作 🟡 部分（2026-08-08） | Last Updated: 2026-08-08

Epic/Story: E03 / 需求來源＝使用者口述（2026-08-07），尚無對應 US 檔

> **實作狀態（2026-08-08）**：核心全數落地並經四道機器閘門驗證（backend 116 suites／1440 tests、frontend 48 files／664 tests、兩側 tsc exit 0），
> migration `LifecycleSubcategory1723680000000` 已對真 SOP DB 實跑 COMMIT（前置盤點重複列 0 筆、唯一索引語意實測通過）。
> **標 🟡 而非 ✅**：本輪採簡易版 ring（僅 jest/vitest，跳過 Playwright fidelity／Stryker／dep-cruiser），
> 6 條 AC-S delta 無測試覆蓋（F008-S1、F009-S1、F019-S1/S2、F036-S1/S3、F038-S1），
> 且其中 4 條經查核為**尚未實作**（F008-S1、F009-S1、F036-S1 之切換器選項、F038-S1）；
> 另 AC-34／F008-S2／F038-S2 原所指之 `LIFECYCLE_CHANGE_LOG.lifecycleName` 快照欄於現行 schema **不存在**（規格↔schema 落差），
> 已由**使用者 2026-08-08 裁決 5** 定案：**修規格、不修 schema**——該表不存循環名稱，顯示時以 `lifecycleId` join `LIFECYCLE` 取當前值；
> 已明確接受之代價＝**舊事件失去名稱快照語意**（見 AC-34 與 [open-questions.md](../open-questions.md) OQ-E07-11）。
> 詳見 [feature-status.md](../feature-status.md) F040 列與 [implementation-log/F040-impl.md](../implementation-log/F040-impl.md)。

> **本檔為「循環子分類」之單一權威來源（single source of truth）。**
> 凡涉及子分類之正規化、唯一性不變式、顯示名稱組合、選取有效性之規則，一律以本檔為準；
> [F007](F007-lifecycle-pool-crud.md)／[F010](F010-create-document.md)／[F011](F011-edit-with-comparison.md)／[F017](F017-backend-document-list.md)／[F019](F019-public-list-browsing.md)／[F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md)／[F036](F036-lifecycle-tree-preview.md)／[F038](F038-lifecycle-tree-change-history.md)
> 各自僅加**該功能面之 additive AC delta**並回指本檔，不重複規範內容。

## 為何獨立成一個 feature（結構決定與理由）

本需求為**橫切（cross-cutting）**需求：資料形狀改在 `LIFECYCLE`，但行為散落於 9 個既有 feature。兩種可行結構：

| 選項 | 說明 | 判定 |
|---|---|---|
| (a) 僅在各 feature 加 AC delta | 不新增檔案 | **否決**——唯一性不變式（含雙向共存衝突）、顯示名稱組合、選取有效性三組規則會在 9 個檔案間重複敘述，違反「不重複、以引用替代」之 spec 紀律，且下游 test-generator 無單一可對照之權威來源，極易產生規則分歧 |
| (b) 新開橫切 feature spec ＋ 各 feature 薄 AC delta | 本檔 | **採用**——規則集中、可獨立單測（純函式＋服務層），各 feature 僅需一至數條可驗證之 delta 並回指本檔 |

**採用 (b)**。本檔之 AC 為**行為契約**（後端服務層／前端純函式），各 feature 之 delta 為**該畫面/端點確實行使該契約**之驗證。

## 本規格鎖定之命名（下游程式碼逐字使用，不得改寫）

| 類別 | 字串 | 說明 |
|---|---|---|
| 屬性名 | `subcategory` | `LIFECYCLE` 新增欄位；非必填，無值時**恆為 `null`**（不得以空字串表示） |
| 顯示名稱函式 | `lifecycleDisplayName` | 純函式，輸入 `{ name, subcategory }`，輸出顯示字串（見 AC-04～AC-06） |
| 正規化函式 | `normalizeSubcategory` | 純函式，trim → 空值收斂為 `null`（見 AC-01～AC-02） |
| 選取解析函式 | `resolveLifecycleSelection` | 前端純函式，輸入 `(name, subcategory, pool)` → `{ ok, lifecycleId }` 或 `{ ok:false, code }`（見 AC-21～AC-23） |
| 錯誤碼 | `LIFECYCLE_DUPLICATE`／`LIFECYCLE_SUBCATEGORY_CONFLICT`／`LIFECYCLE_SUBCATEGORY_REQUIRED` | 見 [error-handling.md#lifecycle-subcategory](../error-handling.md#lifecycle-subcategory) |
| 顯示分隔符 | 全形括號 `（` `）` | `名稱（子分類）`，括號前後**無空白**；為可斷言之字面值，不得改為半形或加空白 |

## Description

「循環」新增**非必填**之 `subcategory`（子分類）欄位。**循環之業務身分＝`(name, subcategory)` 之組合**（雙主鍵概念）：
同一循環名稱下之不同子分類，視為**彼此獨立的循環**，各自擁有獨立 UUID、獨立 DAG 結構、獨立文件掛載。

為使「有子分類時必須選到子分類」不自相矛盾，**同一名稱不得同時存在「無子分類」與「有子分類」之列**（雙向禁止，見不變式 INV-2）。
凡使用循環池之功能（文件建立／編輯之「所屬循環」），若所選名稱底下存在子分類，未選到具體子分類即為無效操作，一律擋下。

**ICSOP 文件編號不受影響**（[已定案，不再為開放問題]）：文件編號第 2 段之循環代碼（`SRC`／`PUC`／…）**仍僅依循環名稱**查表推導；
子分類不參與代碼推導、不改變既有九大循環代碼、不改變任何既有文件編號。

## Preconditions

- 操作者為 ICSOP 管理員（[F025](F025-role-function-matrix.md)：循環管理僅 ICSOPAdmin 可寫；SysAdmin／Supervisor 全公司唯讀）。
- **實作前置檢查已完成**（見下節）——`LIFECYCLE` 現況 `name` 無任何唯一鍵，可能已存在同名重複列。

## 實作前置檢查（migration 前必做，非開放問題）

> MSSQL 之 `UNIQUE INDEX` **視多個 `NULL` 為相等**（與 ANSI 標準相反）。此語意對本需求**恰好正確**：
> `UNIQUE (name, subcategory)` 會使同一名稱之「無子分類」列只能存在一筆，正是 INV-1 所欲。
> 但也因此，**既有同名重複列會使建立索引之 migration 直接失敗**，故必須前置檢查與清理。

| # | 步驟 | 內容 | 失敗時處置 |
|---|---|---|---|
| 1 | 盤點 | `SELECT name, COUNT(*) AS c FROM LIFECYCLE GROUP BY name HAVING COUNT(*) > 1` | 有結果 → 進入步驟 2；無結果 → 直接進入步驟 3 |
| 2 | 清理 | 由 ICSOP 管理員**逐筆裁定**：為重複列補上相異之 `subcategory`，或更名，或刪除（刪除須先依 [F007](F007-lifecycle-pool-crud.md) 清空該循環之全部文件掛載）。**嚴禁自動合併**——合併會改變既有文件之 `lifecycleId` 參照與 DAG 歸屬 | 未清理完成 → **不得**執行步驟 4 |
| 3 | 加欄 | `ALTER TABLE LIFECYCLE ADD subcategory nvarchar(100) NULL`；既有列全部落在 `NULL`（＝無子分類），語意上向後相容 | — |
| 4 | 建索引 | 於 `(name, subcategory)` 建立唯一索引 | 若因殘留重複而失敗，migration **必須中止並回報**，不得靜默略過索引（略過將使 INV-1 僅剩服務層單保險） |
| 5 | 驗證 | 對真實 app DB（SOP）實跑 migration，並以 `SELECT name, subcategory, COUNT(*) … HAVING COUNT(*)>1` 覆核為 0 筆 | — |

- **INV-2 無法由單一唯一索引表達**（它是「同一 name 之列集合的形狀」約束，非列層唯一性）。本規格定義 INV-2 由**服務層權威保證**（AC-11／AC-12／AC-17）；DB 層是否另以 indexed view／trigger 二線強制，屬實作選擇，不阻塞。
- 既有 `LIFECYCLE.name` 為 `nvarchar(100)`；`subcategory` **建議同為 `nvarchar(100)`**（見 [open-questions.md](../open-questions.md) OQ-E03-11）。

## 不變式（Invariants）

| ID | 不變式 | 違反時 |
|---|---|---|
| **INV-1** | `(name, subcategory)` 組合於全表唯一；`subcategory` 為 `null` 時，該 `null` 視為單一具體值參與比對（同名之「無子分類」列至多一筆） | `LIFECYCLE_DUPLICATE`（409） |
| **INV-2** | 對任一 `name`，其列集合**要麼恰為一筆 `subcategory = null`，要麼全部 `subcategory ≠ null`**；兩者不得並存（雙向） | `LIFECYCLE_SUBCATEGORY_CONFLICT`（409） |
| **INV-3** | `subcategory` 於持久化時恆為 `null` 或**非空之 trim 後字串**；不得存在空字串或前後空白 | 由 `normalizeSubcategory` 於服務層入口保證 |
| **INV-4** | 任一 ICSOP 文件之 `lifecycleId` 恆指向一筆**在其名稱下為合法唯一解**之 `LIFECYCLE` 列（＝該列 `subcategory` 有值，或該列 `subcategory` 為 `null` 且其名稱下無其他有子分類之列） | `LIFECYCLE_SUBCATEGORY_REQUIRED`（400，**唯一觸發情境見 AC-25**）<br>※ `lifecycleId` **缺漏**不屬本不變式範圍，歸既有 `DOCUMENT_REQUIRED_FIELD_MISSING`（AC-24） |

- **比對範圍（已定案 ✅，2026-08-07 使用者裁定，OQ-E03-10）**：唯一性（INV-1／INV-2）比對**涵蓋全部列，不分 `status`**（`active` 與 `inactive` 皆納入）。理由：停用之循環仍存在於池中、仍被既有文件之 `lifecycleId` 參照，若排除比對將使「停用後可建同名同子分類」而產生兩筆語意相同之列。此語意亦與 DB 唯一索引一致（不需篩選索引）。
- 子分類值**可跨名稱重複**（`A（甲）` 與 `B（甲）` 併存合法）——唯一性是「組合」而非「子分類本身」。

## Main Flow

1. **建立循環**（[F007](F007-lifecycle-pool-crud.md)）：輸入名稱（必填）、**子分類（非必填）**、說明。
2. 服務層以 `normalizeSubcategory` 正規化子分類（trim；空字串／空白／未提供 → `null`），並 trim 名稱。
3. 驗證順序（**固定，先後不可調換**）：① 名稱非空（`LIFECYCLE_NAME_REQUIRED`）→ ② INV-1 組合唯一（`LIFECYCLE_DUPLICATE`）→ ③ INV-2 共存衝突（`LIFECYCLE_SUBCATEGORY_CONFLICT`）。
4. 通過 → 建立循環、配發 UUID、導向該循環 DAG 畫布編輯頁（沿用 F007 既有行為）。
5. **編輯循環**：可修改名稱／子分類／說明；唯一性驗證同步驟 3，惟**排除自身列**（維持原值不視為衝突，比照 [F013](F013-document-number-uniqueness.md) 之編輯側慣例）。
6. **顯示**：所有呈現循環名稱之處（清單、下拉、標題、快照、稽核）一律經 `lifecycleDisplayName` 組合，不得於各處自行以 `name` 串接。
7. **選取**（[F010](F010-create-document.md)／[F011](F011-edit-with-comparison.md)）：「所屬循環」以**兩段式**選取（名稱 → 子分類），**兩段式純屬前端 UI 狀態**。
   若所選名稱底下存在子分類而未選到具體子分類，前端 `resolveLifecycleSelection` 回 `LIFECYCLE_SUBCATEGORY_REQUIRED` 並阻擋送出（AC-21，此行為**不變**）；
   通過後解析為**單一 `lifecycleId`** 送出——**API payload 之「所屬循環」恆僅 `lifecycleId` 一欄，本次不新增 `lifecycleName`**（人類閘門裁決 1）。
   後端仍權威驗證，但其 `LIFECYCLE_SUBCATEGORY_REQUIRED` **只在一種情境觸發**：payload 帶有之 `lifecycleId` 在其名稱下非合法唯一解（INV-2 髒資料，AC-25）。
   `lifecycleId` 缺漏者維持既有 `DOCUMENT_REQUIRED_FIELD_MISSING`（AC-24），不動 [F010](F010-create-document.md) 既有行為與測試。

## Alternative Flows

- **名稱底下無子分類**（僅一筆 `subcategory = null`）：選取為單段式——選定名稱即完成，**不要求**、亦**不呈現**子分類層。此即既有全部循環之現況行為（向後相容）。
- **由「無子分類」轉為「有子分類」**：該名稱僅有一筆列時，直接編輯該列補上子分類即可（AC-19）；若該名稱已有多筆列，屬 INV-2 已被違反之狀態，不應存在（由實作前置檢查排除）。
- **由「有子分類」轉回「無子分類」**：僅當該名稱底下**只有這一筆**列時允許（AC-18）；若尚有其他子分類列則回 `LIFECYCLE_SUBCATEGORY_CONFLICT`（AC-17）。

## Edge Cases

| 情境 | 預期行為 |
|---|---|
| 子分類輸入 `"  甲  "` | 正規化為 `"甲"` 後持久化（AC-01） |
| 子分類輸入空字串／純空白／未提供 | 一律視為**無子分類**，持久化為 `null`（AC-02） |
| 名稱 trim 後為空 | `LIFECYCLE_NAME_REQUIRED`（400），**優先於**任何唯一性檢查（AC-14） |
| 已存在 `A（甲）`，嘗試建立 `B（甲）` | 允許——子分類可跨名稱重複（AC-13） |
| 已存在 `A（甲）`，嘗試建立 `A（乙）` | 允許——同名不同子分類為兩個獨立循環（AC-10） |
| 讀到 `subcategory` 為空字串之髒資料 | `lifecycleDisplayName` 防禦性視同無子分類，回傳原 `name`（AC-06）；不得輸出 `名稱（）` |
| 過渡期資料違反 INV-2（同名同時有 `null` 與非 `null` 列） | 文件選取端一律擋下該 `null` 列，回 `LIFECYCLE_SUBCATEGORY_REQUIRED`（AC-25，後端本碼之**唯一**觸發情境）；不得靜默接受 |
| 建立／編輯文件之 payload 未帶 `lifecycleId` | 維持既有 400 `DOCUMENT_REQUIRED_FIELD_MISSING`（[F010](F010-create-document.md) 既有行為，**本次不變更**）；**不**回 `LIFECYCLE_SUBCATEGORY_REQUIRED`（AC-24） |
| 子分類長度超過欄位上限 | 沿用 `name` 之既有處置機制，**本次不新增專屬錯誤碼**（見 OQ-E03-11） |
| 既有文件之 `lifecycleId` 指向無子分類循環 | 完全有效，不需任何資料回填（AC-35） |
| 循環於 DAG 結構變更事件寫入**之後**才改名或改子分類 | `LIFECYCLE_CHANGE_LOG` 之既有事件於 [F038](F038-lifecycle-tree-change-history.md) 顯示為**新名稱**（join 當前值，**非**快照，AC-34）；`AUDIT_LOG` 之既有調閱紀錄則維持舊快照值不變（AC-36）。此不一致為 2026-08-08 使用者裁定之已知取捨，非缺陷 |

## Postconditions

- `LIFECYCLE` 表滿足 INV-1～INV-3；任一名稱之列集合形狀明確（單一無子分類列，或全為有子分類列）。
- 任一 ICSOP 文件之「所屬循環」恆可唯一定位到一個具體循環（含子分類）。
- 全站任何呈現循環名稱之處，字串皆由 `lifecycleDisplayName` 產生，前後台一致。
- `LIFECYCLE_CHANGE_LOG` **不保存循環名稱**；其「循環別」之顯示為查詢時 join `LIFECYCLE` 之當前值（AC-34），**不具快照語意**——已明確接受之代價見 AC-34。`AUDIT_LOG.lifecycleName` 則維持快照語意（AC-35／AC-36）。
- 既有循環（`subcategory = null`）與既有文件之行為與本次變更前**完全相同**。

## Acceptance Criteria

> 每條均可由**後端服務層測試**或**前端純函式／元件測試**直接驗證（vitest／jest），不需 e2e。
> 「池」指測試中預先置入之 `LIFECYCLE` 列集合，以 `名稱（子分類）` 表示，`A(∅)` 表示 `subcategory = null`。
> **示範資料（人類閘門 2026-08-07 裁決 3，與 prototype 逐字一致）**：具名示例一律採 `銷售及收款循環（消金）`／`（企金）`／`（子公司）`。抽象示例 `A(甲)`／`A(乙)`／`A(∅)` 維持不變，供純邏輯條款使用。

### A. 輸入正規化（純函式）

- **AC-01**：Given 子分類輸入為 `"  甲  "`，When 呼叫 `normalizeSubcategory`，Then 回傳 `"甲"`（前後空白已去除）。
- **AC-02**：Given 子分類輸入分別為 `""`、`"   "`、`undefined`、`null`，When 呼叫 `normalizeSubcategory`，Then 四者皆回傳 `null`（不得回傳空字串）。
- **AC-03**：Given 名稱輸入為 `"  銷售及收款循環  "`、子分類為 `null`，When 建立循環，Then 持久化之 `name` 為 `"銷售及收款循環"`（已 trim）、`subcategory` 為 `null`。

### B. 顯示名稱組合（純函式）

- **AC-04**：Given `{ name: '銷售及收款循環', subcategory: '消金' }`，When 呼叫 `lifecycleDisplayName`，Then 回傳恰為 `"銷售及收款循環（消金）"`（全形括號、括號前後無空白）。
- **AC-05**：Given `{ name: '銷售及收款循環', subcategory: null }`，When 呼叫 `lifecycleDisplayName`，Then 回傳恰為 `"銷售及收款循環"`（不含任何括號）。
- **AC-06**：Given `{ name: '銷售及收款循環', subcategory: '' }` 或 `subcategory: '   '`（未經正規化之髒資料），When 呼叫 `lifecycleDisplayName`，Then 回傳恰為 `"銷售及收款循環"`，**不得**回傳 `"銷售及收款循環（）"`。

### C. 建立之唯一性（服務層）

- **AC-07**：Given 池為空，When 建立 `A(∅)`，Then 建立成功並配發 UUID。
- **AC-08**：Given 池為 `{ A(∅) }`，When 再建立 `A(∅)`，Then 回 409 `LIFECYCLE_DUPLICATE`，且池筆數不變。
- **AC-09**：Given 池為 `{ A(甲) }`，When 再建立 `A(甲)`，Then 回 409 `LIFECYCLE_DUPLICATE`，且池筆數不變。
- **AC-10**：Given 池為 `{ A(甲) }`，When 建立 `A(乙)`，Then 建立成功，池為 `{ A(甲), A(乙) }`，兩者 UUID 相異。
- **AC-11**：Given 池為 `{ A(∅) }`，When 建立 `A(甲)`，Then 回 409 `LIFECYCLE_SUBCATEGORY_CONFLICT`，且池筆數不變（方向一：已有無子分類 → 不得新增子分類）。
- **AC-12**：Given 池為 `{ A(甲) }`，When 建立 `A(∅)`（未填子分類），Then 回 409 `LIFECYCLE_SUBCATEGORY_CONFLICT`，且池筆數不變（方向二：已有子分類 → 不得新增無子分類）。
- **AC-13**：Given 池為 `{ A(甲) }`，When 建立 `B(甲)`，Then 建立成功（子分類值可跨名稱重複）。
- **AC-14**：Given 名稱 trim 後為空且該（空）名稱在池中已有同組合之列，When 建立，Then 回 400 `LIFECYCLE_NAME_REQUIRED`（**非** `LIFECYCLE_DUPLICATE`）——驗證順序為名稱必填優先。

### D. 編輯之唯一性（服務層，排除自身）

- **AC-15**：Given 池為 `{ A(甲) }`，When 編輯該列僅修改 `description`（名稱與子分類維持原值），Then 儲存成功、不回任何唯一性錯誤，且 `updatedAt` 更新。
- **AC-16**：Given 池為 `{ A(甲), A(乙) }`，When 將 `A(乙)` 之子分類改為 `甲`，Then 回 409 `LIFECYCLE_DUPLICATE`，兩列皆不變。
- **AC-17**：Given 池為 `{ A(甲), A(乙) }`，When 將 `A(乙)` 之子分類清空（改為 `null`），Then 回 409 `LIFECYCLE_SUBCATEGORY_CONFLICT`（該名稱底下仍有 `A(甲)`），兩列皆不變。
- **AC-18**：Given 池為 `{ A(甲) }`（該名稱僅此一列），When 將其子分類清空，Then 儲存成功，池為 `{ A(∅) }`。
- **AC-19**：Given 池為 `{ A(∅) }`（該名稱僅此一列），When 為其補上子分類 `甲`，Then 儲存成功，池為 `{ A(甲) }`。
- **AC-20**：Given 池為 `{ A(甲) }` 且該列 `status = 'inactive'`，When 建立 `A(甲)`，Then 回 409 `LIFECYCLE_DUPLICATE`——唯一性比對**涵蓋停用列**（已定案 ✅，2026-08-07 使用者裁定，OQ-E03-10）。

### E. 選取有效性（前端純函式＋後端權威驗證）

- **AC-21**：Given 池為 `{ A(甲), A(乙) }`，When 呼叫 `resolveLifecycleSelection('A', null, pool)`，Then 回 `{ ok: false, code: 'LIFECYCLE_SUBCATEGORY_REQUIRED' }`（僅選名稱層不足以定位）。
- **AC-22**：Given 池為 `{ A(甲), A(乙) }`，When 呼叫 `resolveLifecycleSelection('A', '甲', pool)`，Then 回 `{ ok: true, lifecycleId: <A(甲) 之 id> }`。
- **AC-23**：Given 池為 `{ A(∅) }`，When 呼叫 `resolveLifecycleSelection('A', null, pool)`，Then 回 `{ ok: true, lifecycleId: <A(∅) 之 id> }`——名稱底下無子分類時，只選名稱即為完整選取，**不要求**子分類。
- **AC-24**（**2026-08-07 人類閘門裁決 1 收斂**）：Given 建立文件之 payload **未帶 `lifecycleId`**（缺漏、`null` 或空字串），When 呼叫建立端點，Then 回 400 **`DOCUMENT_REQUIRED_FIELD_MISSING`**（[F010](F010-create-document.md) 既有行為，**本次不變更**），**非** `LIFECYCLE_SUBCATEGORY_REQUIRED`。<br>⚠ **本次不新增 `lifecycleName` payload 欄位**：建立／編輯文件之 API 契約中「所屬循環」**恆僅有 `lifecycleId` 一個欄位**；名稱與子分類之兩段式選取**純屬前端 UI 狀態**，送出前已由 `resolveLifecycleSelection` 解析為單一 `lifecycleId`。故「payload 只帶名稱層」在後端**不是一個可達的請求形狀**，不得為此新增欄位或錯誤分支。
- **AC-25**（**後端 `LIFECYCLE_SUBCATEGORY_REQUIRED` 之唯一觸發情境**）：Given 池違反 INV-2 而同時存在 `A(∅)` 與 `A(甲)`（過渡期髒資料），且建立文件之 payload **帶有** `A(∅)` 之 `lifecycleId`，When 呼叫建立端點，Then 回 400 `LIFECYCLE_SUBCATEGORY_REQUIRED`，**不產生任何文件記錄**。判定式：所指列之 `subcategory` 為 `null`，**且**池中存在同 `name`、`subcategory ≠ null` 之其他列 → 該 `lifecycleId` 在其名稱下非合法唯一解。
- **AC-26**：Given 既有文件之編輯 payload 帶有一個符合 AC-25 判定式之 `lifecycleId`，When 送出編輯，Then 回 400 `LIFECYCLE_SUBCATEGORY_REQUIRED`，**原文件資料完全不變**；Given 編輯 payload 未帶 `lifecycleId`（＝不修改該欄位），Then 依既有三態語意處理、不觸發本碼。
- **AC-27**：Given `lifecycleId` 指向池中一筆實際存在且具體之列（`subcategory` 有值，或 `subcategory` 為 `null` 且該名稱下無其他有子分類之列），When 建立或編輯文件，Then 通過循環選取驗證（其餘欄位驗證照舊）。

### F. 文件編號代碼不受影響（定案 2）

- **AC-28**：Given 池為 `{ 銷售及收款循環(消金), 銷售及收款循環(企金), 銷售及收款循環(子公司) }`（**與 prototype 逐字一致之示範資料**，人類閘門裁決 3），When 對三者分別呼叫 `cycleCodeOf`，Then 皆回傳 `"SRC"`——代碼推導**僅依名稱**，子分類不參與。
- **AC-29**：Given 任一循環新增或修改其 `subcategory`，When 檢視九大標準循環之代碼對照表與任何既有文件之 `documentNumber`，Then 皆與變更前**逐字相同**（子分類不觸發任何編號重算或遷移）。

### G. 顯示規則之單一來源

- **AC-30**：Given 任一呈現循環名稱之資料組裝路徑（清單列、下拉選項、頁面標題、快照欄位、稽核欄位），When 產生顯示字串，Then 其值等於 `lifecycleDisplayName({ name, subcategory })` 之輸出；**不得**在該路徑內自行以 `name` 串接或省略子分類。
- **AC-31**：Given 池為 `{ A(甲), A(乙) }`，When 任一循環下拉／篩選器產生選項，Then 產生**兩個相異選項**（`A（甲）`、`A（乙）`），且其選項值為各自之 `lifecycleId`（**非** `name` 字串）——確保兩者可分別被選取與篩選。

### H. 向後相容

- **AC-32**：Given 池中全部列之 `subcategory` 皆為 `null`（＝本次變更前之現況），When 執行 [F007](F007-lifecycle-pool-crud.md) 既有全部 AC（建立／編輯／刪除保護／停用／名稱必填），Then 行為與變更前**完全一致**，無任何新增之阻擋。
- **AC-33**：Given 既有文件之 `lifecycleId` 指向一筆 `subcategory = null` 之循環，When 讀取、編輯、於清單顯示、於前台瀏覽，Then 一律有效，且顯示字串為該循環之 `name`（不含括號）；**不需**任何資料回填或遷移。

### I. 快照與稽核之可辨識性

> **適用範圍之界線（2026-08-08 使用者裁決 5）**：**只有 `AUDIT_LOG` 具備循環名稱之快照語意**（AC-35／AC-36）。
> `LIFECYCLE_CHANGE_LOG` **不存**循環名稱，其顯示為查詢時 join 所得之**當前值**（AC-34）。兩者不得混為一談。

- **AC-34**（**2026-08-08 使用者裁決 5 改寫**；原條文所指之 `LIFECYCLE_CHANGE_LOG.lifecycleName` 欄位於 schema 中不存在）：Given 對一個有子分類之循環執行 DAG 結構變更（[F008](F008-dag-node-edge.md)／[F009](F009-node-drawer-maintenance.md)），When 寫入 `LIFECYCLE_CHANGE_LOG`，Then **僅落 `lifecycleId`，不寫入任何循環名稱欄位**（本表無 `lifecycleName` 欄，本次亦**不新增欄位、不新增 migration**）；When 查詢或呈現該事件之循環名稱，Then 以 `lifecycleId` join `LIFECYCLE` 取**當前**之 `{ name, subcategory }`，其顯示字串為 `lifecycleDisplayName` 之輸出（含子分類）。<br>⚠ **已明確接受之代價（不得隱藏）**：此為**當前值**而非快照值——循環於事件寫入後改名或改子分類，既有事件所顯示之循環名稱將**隨之變為新名稱**，**不具名稱快照語意**。此與 [F038](F038-lifecycle-tree-change-history.md) 原意之「歷史事件可唯一辨識所屬循環」有落差（`lifecycleId` 仍可唯一辨識該循環，但**人類可讀之歷史名稱不保證與事件發生當下相同**）。使用者於 2026-08-08 裁定**不為此新增欄位與 migration**；日後若要改採快照語意，見 [open-questions.md](../open-questions.md) OQ-E07-11。
- **AC-35**：Given 對一個有子分類之循環執行 [F036](F036-lifecycle-tree-preview.md) 之檢視／下載／列印，When 寫入 `AUDIT_LOG`，Then 其 `lifecycleName` 快照值同為 `lifecycleDisplayName` 之輸出（含子分類）。
- **AC-36**（**2026-08-08 使用者裁決 5 收斂適用範圍**）：Given 循環之 `subcategory`（或 `name`）於事件寫入後才被修改，When 查詢既有之 **`AUDIT_LOG`** 紀錄，Then 其 `lifecycleName` 維持寫入當下之快照值不變（快照語意，比照既有 `documentNumber`／人員名稱快照慣例）。<br>⚠ **本條不適用於 `LIFECYCLE_CHANGE_LOG`**：該表不存循環名稱，其顯示恆為 join 所得之當前值（AC-34），故改名／改子分類後既有事件之顯示**會一併改變**。

## Error Scenarios

| 錯誤碼 | HTTP | 觸發情境 |
|---|---|---|
| `LIFECYCLE_NAME_REQUIRED` | 400 | 名稱 trim 後為空（既有碼，驗證順序最優先） |
| `LIFECYCLE_DUPLICATE` | 409 | 違反 INV-1：`(name, subcategory)` 組合已存在（含 `subcategory = null` 之組合） |
| `LIFECYCLE_SUBCATEGORY_CONFLICT` | 409 | 違反 INV-2：同一名稱之「無子分類」與「有子分類」列將並存（雙向皆適用） |
| `LIFECYCLE_SUBCATEGORY_REQUIRED` | 400 | 違反 INV-4：文件建立／編輯所帶之 `lifecycleId` 在其名稱下**非合法唯一解**（該列 `subcategory` 為 `null` 但同名尚有有子分類之列）。**後端唯一觸發情境**（AC-25）；前端 `resolveLifecycleSelection` 亦以本碼阻擋「僅選名稱層」之送出（AC-21） |
| `DOCUMENT_REQUIRED_FIELD_MISSING` | 400 | `lifecycleId` 缺漏（既有碼、既有行為，本次不變更，AC-24）；列此僅為釐清邊界，**不屬本 feature 新增** |

語意、驗證順序與回退細節：見 [error-handling.md#lifecycle-subcategory](../error-handling.md#lifecycle-subcategory)。

## Related

- **Diagram**：[../diagrams/F040-lifecycle-subcategory.mmd](../diagrams/F040-lifecycle-subcategory.mmd)（建立／編輯之唯一性判定決策流）
- **Data**：[LIFECYCLE](../data-model.md#lifecycle-entity)（`subcategory` 欄位與 INV-1～INV-3）、[ICSOP_DOCUMENT](../data-model.md#document-entity)（第 11 欄「所屬循環」）、[LIFECYCLE_CHANGE_LOG](../data-model.md#lifecyclechangelog-entity)（**不存**循環名稱，顯示時 join 取當前值，AC-34）、[AUDIT_LOG](../data-model.md#auditlog-entity)（`lifecycleName` 為快照，AC-35／AC-36）
- **Owns（本檔為權威、以下僅加 delta）**：[F007](F007-lifecycle-pool-crud.md)、[F010](F010-create-document.md)、[F011](F011-edit-with-comparison.md)、[F017](F017-backend-document-list.md)、[F019](F019-public-list-browsing.md)、[F008](F008-dag-node-edge.md)、[F009](F009-node-drawer-maintenance.md)、[F036](F036-lifecycle-tree-preview.md)、[F038](F038-lifecycle-tree-change-history.md)
- **不受影響（明確聲明）**：[F013](F013-document-number-uniqueness.md) 文件編號唯一性規則與比對範圍完全不變；`frontend/src/domain/cycle-codes.ts` 之查表鍵維持 `name`
- **權限**：[F025](F025-role-function-matrix.md)「循環管理」列（不新增矩陣列，子分類為既有功能之欄位擴充）
- **Prototype**：待 ui-ux-designer 傳播（10 循環清單／建立·編輯 modal、14／15 文件建立·編輯之兩段式循環選取、13／03 循環別篩選、11／12／22／23 標題顯示）
- **已定案（使用者裁定，不再為開放問題）**：① `(name, subcategory)` 唯一 ＋ 同名「無子分類 ↔ 有子分類」不得並存（雙向）；② 文件編號循環代碼僅依名稱、不受子分類影響；③ 影響範圍＝上列 9 個 feature；④ 本輪設計深度＝spec-writer ＋ ui-ux-designer（additive 欄位，不跑 system-architect）〔①～④ 為 2026-08-07 裁定〕；⑤ **（2026-08-08 裁定）`LIFECYCLE_CHANGE_LOG` 不新增 `lifecycleName` 快照欄、不新增 migration**——循環名稱改以 `lifecycleId` join `LIFECYCLE` 取當前值（AC-34 已改寫、AC-36 適用範圍收斂為 `AUDIT_LOG`、[F008](F008-dag-node-edge.md) AC-S2 與 [F038](F038-lifecycle-tree-change-history.md) AC-S2 同步改寫）；**明確接受之代價＝舊事件將顯示新名稱、失去名稱快照語意**
- **未決（不阻塞實作）**：[open-questions.md](../open-questions.md) OQ-E03-10（唯一性比對是否涵蓋 `inactive`，現採「涵蓋」）、OQ-E03-11（`subcategory` 長度上限與是否需專屬錯誤碼，現採 `nvarchar(100)` 同 `name`）、**OQ-E07-11**（是否日後為 `LIFECYCLE_CHANGE_LOG` 補 `lifecycleName` 快照欄；本輪已否決，保留追溯）
