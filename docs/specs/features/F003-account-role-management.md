# F003: 帳號與角色指派管理
Priority: P0-MVP | Status: Draft（帳號 CRUD／角色指派已實作；建立→登入死鏈已於 authfix 閉合，識別鍵＝loginId） | Last Updated: 2026-08-14
Epic/Story: E01 / US-005, US-006

> 合併理由：帳號 CRUD 與角色指派為同一後台管理畫面之連續操作，共用帳號實體與稽核。
> **🔵 2026-08-14 additive delta（使用者直接裁定，非開放問題）——手動帳號之基本資料（姓名／公司／部門／職位）**：「建立手動帳號」與「編輯帳號」modal 除既有欄位外，一併提供 **姓名（必填）／公司／部門／職位**；三者皆為**主檔下拉**、分別持久化於 `ACCOUNT.companyCode`／`orgCode`／`jobTitleCode`。**本 delta 之 AC 編號採 `AC-P#`**（P＝Profile 基本資料），與既有無編號 AC 及 `AC-U#` 併存、**不重編任何既有編號**。**無 schema 變更、不需 migration**（見 `AC-P22`）。
> **🟢 2026-08-11 additive delta（APPROVED，人類閘門通過）——一般使用者子分類（業務／其他）指派入口**：角色指派 modal 於所選角色為「一般使用者」時，額外呈現子分類選擇器；**帳號清單「角色」欄與「編輯帳號」modal 之「目前角色」亦一併顯示子分類徽章**（AC-U6／AC-U7，2026-08-11 補訂）。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**。⚠ **角色種類仍為 5 種、不新增**（子分類為 `ACCOUNT` 之獨立欄位，非第 6 種角色）——本檔既有 AC「僅顯示 5 種固定角色」**不變**。

> **🔴 2026-08-25 delta（APPROVED，人類閘門通過）——角色自動化：可指派範圍限制 ＋ `roleSource`。**
> 權威＝[stories/2026-08-25-role-automation-delta.md](../../stories/2026-08-25-role-automation-delta.md)、[open-questions §RA](../open-questions.md#ra-2026-08-25)。**本 delta 之 AC 編號採 `AC-R#`**。
>
> **① 操作者範圍擴大（連動 [F025](F025-role-function-matrix.md) 兩列變更）**：本檔既有多處敘述「帳號管理與角色指派僅 SysAdmin 可 CRUD」
> **已不再完整**——ICSOP 管理員對「帳號管理」升為 `CRUD`、對「角色指派」為 `受限CRUD`。
> **② 可指派角色範圍（`ROLE_ASSIGN_SCOPE_FORBIDDEN`, 403）**：ICSOP 管理員可指派 `Supervisor`／`DeptContact`／`User`，
> **不得指派 `SysAdmin`／`ICSOPAdmin`**（否則可自我提權，兩層管理者之區隔即消失）；SysAdmin 不受此限。
> 新錯誤碼登錄於 [error-handling.md](../error-handling.md)，與 `ROLE_INVALID`（角色字串不合法，400）為**兩種不同情形，不得合併**。
> 驗證順序：既有 `ROLE_INVALID`（②）→ 帳號存在 → **新增之可指派範圍檢查** → 既有自我降級阻擋。
> **③ `roleSource` 之維護**：`PATCH /admin/accounts/:id/role` 成功時，一律將 [`ACCOUNT.roleSource`](../data-model.md#account-role-source)
> 由 `'derived'` 翻為 `'manual'`（單向、無反向路徑），使該列之角色**永不再被同步覆寫**（裁定 `Q1.2`）。
> ⚠ 此為 `AC-P12`（編輯成功之副作用邊界）之**例外**：該條列舉「`roleCode`／`userSubtype`／`status`／`source`／`loginId`／`companyCode` 一律不受影響」，
> 現須補上 `roleSource`——但僅限**角色指派端點**會改動它，`PATCH /admin/accounts/:id`（編輯基本資料）**仍不得**觸及。
> **④ 🔴 角色變更稽核（裁定 `Q4.5`，須先於自動化完成）**：現行 `assignRole` **完全沒有寫稽核紀錄**（`backend/src/accounts/` 全模組無任何 audit 呼叫）。
> 手動時代尚可忍受，一旦每日自動推導上線，「這個人的角色為什麼變了」將無人可查。本項**無前置依賴**，應優先實作。

## Description
系統管理員於後台建立/查詢/編輯/停用帳號，區分「手動建立」與「上游同步」兩來源；並將 5 種固定角色之一指派給帳號。

## Preconditions
- 操作者為系統管理員（依 F025，帳號管理與角色指派僅 SysAdmin 可 CRUD）。

## Main Flow
### 帳號管理
1. 建立手動帳密帳號：填帳號、初始密碼、**姓名（必填）**、指派角色，並可選填 **公司／部門／職位**（皆為主檔下拉） → 密碼雜湊儲存，`source=manual`。契約與驗證見 [`AC-P1`～`AC-P8`](#manual-account-profile)。
2. 查詢：依來源（手動/上游）、角色、啟用狀態篩選，清單標示來源類型。
3. 停用帳號：立即無法登入，既有 session 強制失效，記錄稽核。

### 角色指派
4. 選定帳號，從 5 種固定角色選一並儲存 → 下次該帳號請求即套用新權限。
5. 由管理類角色降級為一般使用者：送出前顯示影響提示，二次確認後執行。

## Alternative Flows
- 上游同步帳號：基本資料（姓名/部門）以同步結果為準，管理員原則上僅能調整角色與啟用狀態（覆寫與否見 OQ-E01-03）。

## Edge Cases
- 停用一個已登入使用者：其既有 session 立即失效（連動 F001/F005 之 token 撤銷）。
- 系統管理員降級自身：草案應阻擋，避免無管理員可操作（OQ-E01-05）。

## Postconditions
- 帳號存在於清單（停用為軟刪除，非移除），角色變更即時生效。

## Acceptance Criteria
- Given 系統管理員填寫新帳號, When 送出建立, Then 建立帳號、密碼雜湊儲存、標記 `source=manual`。
- Given 帳號名稱重複, When 建立, Then 回 `ACCOUNT_USERNAME_EXISTS`，拒絕建立。
- Given 選定帳號執行停用, When 送出, Then 立即無法登入、既有 session 失效、記錄稽核。
- Given 選定帳號指派角色, When 儲存, Then 更新角色且下次請求即生效。
- Given 由管理類角色降級為一般使用者, When 送出前, Then 顯示失去後台權限提示並需二次確認。
- Given API 傳入非法角色字串, When 寫入, Then 回 `ROLE_INVALID`（400），拒絕寫入。
- Given 角色選擇下拉載入, When 開啟, Then 僅顯示 5 種固定角色，不可新增/刪除角色種類。

### 一般使用者子分類指派 delta（🟢 APPROVED 2026-08-11 人類閘門通過；規則權威＝[F041](F041-user-subtype-business-scope.md)）

> **✅ OQ-E08-04 已定案為選項 B（子分類旗標）**，2026-08-11 人類裁決。**本檔既有 AC「僅顯示 5 種固定角色」不變**——子分類為角色以外之獨立欄位，非第 6 個角色選項。
> 📝 追溯：若當初裁為選項 A（新增第 6 種角色），本節將全數作廢、改為角色下拉新增第 6 個選項，且既有 AC 須改寫為「6 種」；若裁為選項 C（上游職務功能自動判定），本節亦全數作廢、管理端無指派入口（該路徑依賴之上游職務功能字典尚未定案，見 [upstream-hr-source-contract.md](../upstream-hr-source-contract.md) §5.4，屬否決之主要理由）。

- **AC-U1**：Given 系統管理員於角色指派 modal 將某帳號之角色選為「一般使用者」, When 畫面更新, Then 額外呈現子分類選擇器（選項為「業務」「其他」，顯示字串由 `userSubtypeLabel` 產生）；Given 所選角色為其餘 4 種之任一, Then **不呈現**該選擇器（`isSubtypeApplicable` 回 `false`）。〔[F041](F041-user-subtype-business-scope.md) AC-31／AC-32〕
- **AC-U2**：Given 系統管理員選定子分類並儲存, When 送出, Then 持久化 `ACCOUNT.userSubtype`（值為 `'business'` 或 `'other'`），下次該帳號之請求即套用新的可見範圍（比照本檔既有「角色變更下次請求即生效」之語意）。
- **AC-U3**：Given 建立新手動帳號或上游同步新增帳號而未指定子分類, When 持久化, Then `userSubtype` 為 `'other'`（預設不限縮）。〔[F041](F041-user-subtype-business-scope.md) AC-35〕
- **AC-U4**：Given [F004](F004-org-sync.md) 組織同步對既有帳號執行 upsert, When 同步完成, Then 該帳號之 `userSubtype` **不被覆寫**（該欄非上游來源欄位，同步 payload 不含此鍵）。〔[F041](F041-user-subtype-business-scope.md) AC-34〕
- **AC-U5**（**✅ 已定案：保留不清空，2026-08-11 人類裁決**）：Given 帳號之角色由「一般使用者」改為其餘 4 種之任一, When 儲存, Then `userSubtype` **保留原值、不清空**（其僅在 `roleCode='User'` 時具效力，見 [F041](F041-user-subtype-business-scope.md) INV-2）；**不需**新增任何二次確認提示。<br>📝 已明確接受之代價：日後改回一般使用者時舊設定直接復活、不重新詢問（否決之替代案＝強制寫回 `'other'` ＋二次確認提示）。〔[F041](F041-user-subtype-business-scope.md) AC-36〕

#### 前端呈現面補訂（2026-08-11，AC-U6～AC-U9）

> **補訂理由**：`prototypes/08-account-management.html` 檔頭明列**三項**已套用內容，但原 delta（AC-U1～AC-U5）**只覆蓋了第 ① 項**（指派角色 modal 之選擇器）；
> ②「角色」欄之子分類徽章 與 ③「編輯帳號」modal 之「目前角色」顯示子分類**從未被寫成任何一條 AC**，
> 導致下游 test-generator（對實作全盲、只依 AC 建環）之環中不存在此二項，實作漏渲染而**測試全綠仍出貨**——由使用者於實際環境肉眼發現。
> 本組即該缺口之修補。**編號自 AC-U6 起、不重編既有 AC-U1～AC-U5**（重編會破壞 `docs/test-specs/features/F041-test.md` 既有之 AC↔測試對照）。
> 全部條文可由 **vitest 元件測試**直接斷言；規則與逐字內容之權威一律為 [F041](F041-user-subtype-business-scope.md) §F2 與 prototype 原始碼。

- **AC-U6**（**清單「角色」欄之子分類徽章**）：Given 帳號清單之某列 `roleCode === 'User'`, When 渲染「角色」欄, Then 於角色徽章右側追加子分類徽章（文字＝`userSubtypeLabel(userSubtype)`＝`業務`／`其他`；`null`／未知值仍渲染且顯示 `其他`）；Given 該列為其餘 4 種角色之任一（**即使 `userSubtype='business'`**）, Then **僅**呈現角色徽章、該欄不得出現 `業務`／`其他` 任一字串（[F041](F041-user-subtype-business-scope.md) INV-2；反向案例之樣本＝prototype persona `20088 陳彥廷`）。〔[F041](F041-user-subtype-business-scope.md) AC-41〕
- **AC-U7**（**「編輯帳號」modal 之「目前角色」**）：Given 開啟「編輯帳號」modal, When 渲染「目前角色」, Then 其徽章組合與 AC-U6 **完全相同**（同序、同文字、同收斂規則、同適用性條件）。實作應與清單列**共用同一呈現元件**，使兩處不可能各自漂移；測試須同時涵蓋兩處。〔[F041](F041-user-subtype-business-scope.md) AC-42〕
- **AC-U8**（**指派角色 modal 子分類選擇器之預選值**）：Given 對 `userSubtype='business'` 之一般使用者開啟「指派角色」modal, Then 選擇器**預選「業務」**；Given `userSubtype` 為 `'other'`／`null`／未知, Then 預選「其他」（＝`normalizeUserSubtype` 之輸出，不得出現皆未選之狀態）；Given 對**非**一般使用者但 `userSubtype='business'` 之帳號（persona `20088 陳彥廷`）開啟該 modal, Then 初始不呈現選擇器, When 於 modal 內改選「一般使用者」, Then 選擇器出現且**預選「業務」**——此為 AC-U5「舊設定直接復活」在 UI 上的唯一可觀測面。〔[F041](F041-user-subtype-business-scope.md) AC-43〕
- **AC-U9**（**子分類選項之說明文字**）：Given 子分類選擇器呈現, When 檢視兩選項, Then 各自顯示逐字說明——`'business'` → `前台僅顯示「使用部門相符」之已公告文件（含子樹）`、`'other'` → `前台瀏覽範圍不變`；須以具名常數 `SUBTYPE_DESC` 持有供 vitest import 斷言，不得於 JSX 內散落字面字串。〔[F041](F041-user-subtype-business-scope.md) AC-44〕

### 手動帳號基本資料 delta（姓名／公司／部門／職位；2026-08-14 使用者直接裁定） {#manual-account-profile}

> **背景**：使用者於實際環境回報「建立手動帳號」只能設定 帳號／密碼／角色，缺 姓名／公司／部門／職位。此為**超出既有 prototype 之新需求**——`prototypes/08-account-management.html` 現行建立流程把 `name`／`dept`／`title` 填為 `（待同步姓名）`／`（待同步）` 佔位字串（`:344`），該行為於本 delta 後作廢（見 `AC-P18`）。
> **已裁定、不再徵詢**：① 輸入型式一律為**主檔下拉**，**不得**改為自由文字——`orgCode`／`jobTitleCode` 為代碼欄位，且 `orgCode` 決定 [F026](F026-role-field-matrix.md) 欄位可見性與 [F041](F041-user-subtype-business-scope.md) 業務子分類之前台可見範圍（[F033](F033-permission-aware-retrieval.md) 檢索層過濾亦依之），自由文字將使該判定失去代碼基準；② 姓名必填、公司／部門／職位選填；③ 編輯沿用既有上游唯讀規則（`source='manual'` 可編輯、`source='upstream'` 唯讀）。
> **編號**：`AC-P1`～`AC-P27`。**既有 AC 與 `AC-U1`～`AC-U9` 全數不變**（重編會破壞 `docs/test-specs/` 既有之 AC↔測試對照）。
> **權威來源**：欄位長度／可空性一律以 `backend/src/database/entities/account.entity.ts` 與 baseline migration 為準（見 `AC-P22`）。
> **🔵 2026-08-14 第二次裁決（使用者看過 prototype 後）——公司別可跨公司選擇**：「建立/編輯帳號時**公司別要可選（不限制自己所屬公司）**」。初稿之「鎖定操作者公司」已提示其代價（`companyCode` 為唯一鍵一半、為清單過濾鍵）並經使用者確認後仍維持此決定，故 **`AC-P5`／`AC-P10`／`AC-P15` 就地改寫**（編號不變、語意反轉），並新增 **`AC-P23`～`AC-P27`** 處理四項漣漪：清單跨公司可見與逐列解析、`loginId` 全域唯一、**帳密登入須能解析跨公司帳號（否則建立後無法登入）**、部門候選為空之呈現。連帶於 [F001](F001-auth-login-session.md) 新增 `AC-C1`／`AC-C2`。**仍為零 schema 變更**（`AC-P22` 不變）。

#### 建立（POST `/admin/accounts`）之契約與驗證

- **AC-P1（建立 payload 契約）**：Given request body 為 `{ loginId: string, password: string, roleCode: string, name: string, companyCode?: string, orgCode?: string|null, jobTitleCode?: string|null }` 且全部值合法, When 送出 `POST /admin/accounts`, Then 回 **201** 與 `AccountView`，其 `name`／`orgCode`／`jobTitleCode` 等於正規化後之送入值，且 `source='manual'`、`userSubtype='other'`（`AC-U3` 不變）、`status='active'`、`passwordHash` 為雜湊值且**不出現於回應**。未列於本契約之其他鍵一律忽略、不寫入。
- **AC-P2（輸入正規化，先於一切驗證）**：Given payload 之 `name`／`companyCode`／`orgCode`／`jobTitleCode`, When 進入驗證, Then 四者一律先 trim；`orgCode`／`jobTitleCode` 於 trim 後為空字串、純空白或未提供者一律收斂為 `null`（**空字串不得落地**，比照 [error-handling.md#lifecycle-subcategory](../error-handling.md#lifecycle-subcategory) 之 `normalizeSubcategory` 慣例）。
- **AC-P3（姓名必填）**：Given `name` 未提供／為 `null`／trim 後為空字串, When `POST /admin/accounts`, Then 回 **400 `VALIDATION_ERROR`**，**不建立任何帳號**。（刻意與既有 `loginId`／`password`／`roleCode` 缺漏**同碼**，維持本端點單一之「必填缺漏」錯誤碼，不新增 `ACCOUNT_NAME_REQUIRED`。）
- **AC-P4（長度上限，對齊 entity）**：Given trim 後長度 `name` > 30 或 `companyCode` > 10 或 `orgCode` > 10 或 `jobTitleCode` > 10（任一成立）, When 建立或編輯, Then 回 **400 `VALIDATION_ERROR`**，不寫入。（`loginId` ≤ 20 為既有限制，行為不變。）
- **AC-P5（公司欄＝可跨公司選擇；🔵 2026-08-14 使用者裁決，取代初稿之「鎖定操作者公司」）**：公司欄之候選集合＝**全部有效公司**（`SELECTABLE_COMPANIES`，見 `AC-P15`），**不限操作者所屬公司**。Given payload **未提供** `companyCode`, Then 以**操作者 session 之 `companyCode`** 寫入（預設值，仍為最常見情境）；Given 提供且存在於 `SELECTABLE_COMPANIES`, Then 以該值寫入，**縱使不等於操作者所屬公司亦允許**；Given 提供但**不存在於** `SELECTABLE_COMPANIES`（含空字串、未知代碼、已結束之公司如 `AC`）, Then 回 **400 `ACCOUNT_COMPANY_CODE_INVALID`**，不建立。<br>📝 錯誤碼語意由「非本人公司」改為「**非有效公司**」（`error-handling.md` 已同步）。跨公司之連帶處置見 `AC-P23`（清單）／`AC-P24`（唯一性）／`AC-P25`（登入）／`AC-P26`（部門候選為空）。裁決紀錄見 [open-questions.md](../open-questions.md) `OQ-E01-07`。
- **AC-P6（部門代碼有效性）**：Given `orgCode` 非 `null`, When 建立或編輯, Then 必須存在一筆 `ORG_UNIT` 同時滿足 `orgCode` 相等**且** `companyCode` 等於該帳號之 `companyCode`；不存在 → 回 **400 `ACCOUNT_ORG_CODE_INVALID`**，不寫入。Given `orgCode` 為 `null`, Then 略過本驗證、寫入 `null`。<br>⚠ **刻意不檢查 `isActive`**：下拉候選僅列 active（`AC-P13`），但既有帳號之部門可能於組織同步後被停用，若寫入端要求 active，將使該帳號**連姓名都無法再儲存**。
- **AC-P7（資位代碼有效性）**：Given `jobTitleCode` 非 `null`, When 建立或編輯, Then 必須存在一筆 `JOB_TITLE` 之 `(companyCode, code)` 與「該帳號之 `companyCode`＋送入之 `jobTitleCode`」**精確相等**；不存在 → 回 **400 `ACCOUNT_JOB_TITLE_INVALID`**，不寫入。<br>⚠ 寫入驗證**刻意不採**顯示端之兩段式跨公司 fallback（[data-model.md#job-title-entity](../data-model.md#job-title-entity)）——手動帳號之下拉僅列本公司代碼（`AC-P14`），不受影響；不對稱之追溯見 `OQ-E01-08`。
- **AC-P8（驗證順序，固定不可調換）**：Given 一次請求同時違反多項規則, When 送出, Then **僅**回序位最前者之錯誤碼：① 必填／格式／長度（`VALIDATION_ERROR`, 400）→ ② 角色合法性（`ROLE_INVALID`, 400）→ ③ 公司（`ACCOUNT_COMPANY_CODE_INVALID`, 400）→ ④ 部門（`ACCOUNT_ORG_CODE_INVALID`, 400）→ ⑤ 資位（`ACCOUNT_JOB_TITLE_INVALID`, 400）→ **⑥ 職位（`ACCOUNT_JOB_POSITION_INVALID`, 400；2026-08-31 `AC-P30`）** → ⑦ 帳號唯一性（`ACCOUNT_USERNAME_EXISTS`, 409）。③④⑤ 係**插入於既有 ② 與 ⑦ 之間**、⑥ 插入於 ⑤ 之後，既有各項之相對順序皆不變（例：角色非法＋帳號重複，仍回 `ROLE_INVALID`）。

#### 編輯（PATCH `/admin/accounts/:id`）

- **AC-P9（編輯 payload 契約）**：Given request body 為 `{ name?: string, password?: string, companyCode?: string, orgCode?: string|null, jobTitleCode?: string|null }`, When 送出, Then **欄位缺席＝不變更**；`orgCode`／`jobTitleCode` 明確傳 `null`（或空字串，經 `AC-P2` 收斂）＝**清為 `null`**；`name` 若出現則 trim 後不得為空、亦不得為 `null`，違反回 **400 `VALIDATION_ERROR`**（姓名為必填欄位，不可清空）。
- **AC-P10（編輯**可**變更公司；🔵 2026-08-14 使用者裁決，取代初稿之「不可變更」）**：Given `source='manual'` 之帳號、payload 含 `companyCode` 且值存在於 `SELECTABLE_COMPANIES`, When `PATCH /admin/accounts/:id`, Then 允許變更；Given 值不存在於 `SELECTABLE_COMPANIES`, Then 回 **400 `ACCOUNT_COMPANY_CODE_INVALID`**；Given 值等於現值, Then 視為 no-op。
  - **AC-P10a（碰撞保護；🔵 2026-08-14 裁定＝縱深防禦，`AC-P10a` 與 `AC-P24` 兩條**皆保留**）**：Given 變更後之 `(companyCode, loginId)` 已為**其他**帳號所佔用, When 送出, Then 回 **409 `ACCOUNT_USERNAME_EXISTS`**，**不寫入任何欄位**（沿用既有錯誤碼，語意一致＝該公司下此帳號名稱已存在）。
    - **與 `AC-P24` 之關係（下游曾指出「邏輯上不可達」，裁定如下）**：兩條**檢查點不同、比對範圍不同**，非重複，皆須實作。

      | | `AC-P24` | `AC-P10a` |
      |---|---|---|
      | 檢查點 | 建立（`POST`） | 編輯（`PATCH`），且**僅當 `companyCode` 變更**時 |
      | 比對範圍 | **全部公司**（全域） | **變更後之單一公司**（`(新 companyCode, loginId)`） |
      | 動機 | 使 [F001](F001-auth-login-session.md) `AC-C1` 之登入解析可單以 `loginId` 定位 | 對應 DB 唯一鍵 `UQ_ACCOUNT_company_login`（**per-company**，非全域） |
      | 由 UI 之可達性 | 正常操作即可達 | **正常操作不可達** |

    - **`AC-P10a` 之三個真實可達路徑（故「不可達」僅限 UI 正常路徑，不等於永不發生）**：① **上游同步帳號不經 `AC-P24`**——[F004](F004-org-sync.md) 之 upsert 不走建立端，且 `USERID` 之 100% 唯一性實測**僅在單一公司內**成立（[契約 §7.1](../upstream-hr-source-contract.md)），跨公司未保證；日後 `SYNC_COMPID` 納入第二家公司即可能出現跨公司同 `loginId`。② **本 delta 之前既有之列**——`AC-P24` 僅約束實作後之新建立，**不回溯掃描或清理既有資料**。③ **並發競態**——`AC-P24` 為應用層 read-then-write，DB 僅保證 per-company 唯一，兩筆不同公司之同名建立可各自通過檢查而雙雙寫入。
    - **測試建構方式（給 test-generator）**：此前提**不得經由 `POST` 端構造**（會先被 `AC-P24` 以 409 擋下）。應**直接經 store／repository 種入**違反全域唯一之既有資料（例如 `(AS, 'u001')` 與 `(AE, 'u001')` 兩列），再 `PATCH` 其中一列之 `companyCode` 使其撞上另一列 → 期望 **409 `ACCOUNT_USERNAME_EXISTS`** 且**兩列皆未發生任何變更**。
  - **AC-P10b（舊代碼必然失效 → 強制同請求重新給值）**：`orgCode`／`jobTitleCode` 之有效性以 `companyCode` 為範圍（`AC-P6`／`AC-P7`），公司一變更舊值**必然失效**。Given payload 變更 `companyCode`（值 ≠ 現值）, When 同一請求**未同時提供** `orgCode` **或**未同時提供 `jobTitleCode`（兩者皆須明確出現於 payload，值可為合法代碼**或** `null`）, Then 回 **400 `VALIDATION_ERROR`**，不寫入任何欄位。**嚴禁靜默沿用舊值**（會在 DB 留下跨公司髒代碼，使部門/職位解析永久錯位）。Given 兩者皆已提供, Then 依 `AC-P6`／`AC-P7` 以**變更後之 `companyCode`** 為範圍驗證。
- **AC-P11（上游帳號唯讀，後端強制）**：Given 目標帳號 `source='upstream'`, When PATCH body 含 `name`／`password`／`companyCode`／`orgCode`／`jobTitleCode` **任一**（**含明確傳 `null` 之清空意圖**；`companyCode` 縱使等於現值亦視為上游欄位而拒絕）, Then 回 **403 `ACCOUNT_UPSTREAM_READONLY`**，**不寫入任何欄位**，且本檢查**先於**一切值驗證（`AC-P4`／`AC-P6`／`AC-P7`）。前端 `disabled` 僅為輔助，**後端為權威**（前端被繞過時仍須拒絕）。<br>角色指派（`PATCH /admin/accounts/:id/role`）與啟用狀態（`PATCH /admin/accounts/:id/status`）**不受本條限制**——上游帳號仍可調角色與啟用狀態（`OQ-E01-03` 定案）。
- **AC-P12（編輯成功之副作用邊界）**：Given `source='manual'` 之帳號與合法 payload, When 送出, Then 回 **200** 與 `AccountView`，僅 payload 出現之欄位被更新；`roleCode`／`userSubtype`／`status`／`source`／`loginId`／`companyCode` **一律不受影響**（角色與子分類之唯一寫入路徑仍為 `PATCH :id/role`，`AC-U2` 不變）。

#### 主檔查詢端點契約

- **AC-P13（部門主檔＝沿用既有 `GET /org-units`，不新增端點）**：Given 已登入之使用者, When 呼叫 `GET /org-units?companyCode={code}`（既有端點，預設僅回 `isActive=true`）, Then 回 `OrgUnitRecord[]`；權限沿用既有 `PUBLIC_BROWSING` read（5 角色皆可，[org-directory.controller](../../../backend/src/org-directory/org-directory.controller.ts) 既有裁定），**不新增 F025 功能鍵、不改動既有權限**。部門下拉之候選＝該回應中 `tier ≠ 'ROOT'` 之全部列，依 `orgCode` 昇冪排序；**不得**再限縮 tier——上游帳號之 `orgCode` 實測分布於 `DIVISION`／`DEPARTMENT`／`SECTION`／`SUBSECTION` 多層，限縮將使手動帳號無法與上游帳號同層對齊。
- **AC-P14（職位主檔＝新增 `GET /job-titles`）**：本 delta 之**第一個**新增端點（另一個為 `AC-P15` 之 `GET /companies`，共 2 個）。Given 具「帳號管理」read 權限之使用者（SysAdmin／ICSOPAdmin）, When 呼叫 `GET /job-titles?companyCode={code}`（`companyCode` 選填，未帶時預設＝操作者 session 之 `companyCode`）, Then 回 `{ companyCode: string, code: string, name: string }[]`，**依 `companyCode` 精確過濾**（不做跨公司 fallback，與 `AC-P7` 之寫入驗證同一集合）且依 `code` 昇冪排序；Given 主管／部門窗口／一般使用者呼叫, Then 回 **403 `PERMISSION_DENIED`**；Given 未登入, Then 回 **401 `AUTH_SESSION_EXPIRED`**。<br>📝 實作位置由 architect 決定；`JOB_TITLE_READ_STORE` 已由 `OrgDirectoryModule` 匯出，就近新增讀取 controller 即可，**不需新表、不需新 store**。
- **AC-P15（公司主檔＝新增 `GET /companies`；🔵 2026-08-14 使用者裁決，取代初稿之「不新增端點」）**：本 delta **第二個（也是最後一個）新增端點**。
  - **資料來源＝既有靜態對映 `COMPANY_FULL_NAMES`（`backend/src/org-directory/company-name.ts`），本 delta 將其由 1 筆擴充為有效公司集合，並以其鍵集合定義具名常數 `SELECTABLE_COMPANIES`。不新增 DB 表、不新增同步來源、不需 migration。**
  - **INV-C1（不變式，可機器驗證）**：`SELECTABLE_COMPANIES` ≡ `Object.keys(COMPANY_FULL_NAMES)`。**兩者必須恆等**——否則會出現「下拉可選但清單／浮水印顯示 `—`」之不一致。新增公司＝**只改這一處常數**，下拉、清單公司欄（`AC-P23`）、[F020](F020-watermark.md) 浮水印公司名稱三處自動一致。
  - **本輪內容（依 [upstream-hr-source-contract.md §10.1](../upstream-hr-source-contract.md) 之 dev 實測）**：`AS` → `和潤企業股份有限公司`；`AE` → `和潤電能`〔`[ASSUMPTION]` 全稱待覆核，見下〕。**排除 `AC`**（`COMPENDDT = 1900-01-01`，測試資料且已結束）、**排除 `AD`／`AJ`／`ILS`**（`VW_HRCOMF` 無該筆，且 AD／AJ 部門主檔嚴重不完整，契約明載「補齊前不具備納入條件」）。
  - **契約**：Given 具「帳號管理」read 權限之使用者（SysAdmin／ICSOPAdmin）, When 呼叫 `GET /companies`（無 query 參數）, Then 回 `{ companyCode: string, companyName: string }[]`，依 `companyCode` 昇冪排序；Given 主管／部門窗口／一般使用者呼叫, Then 回 **403 `PERMISSION_DENIED`**；Given 未登入, Then 回 **401 `AUTH_SESSION_EXPIRED`**。
  - ⚠ **`[ASSUMPTION]` 全稱來源之既存矛盾**：`company-name.ts` 檔頭註解稱「上游無公司全稱來源、`VW_HRCOMF` 無全稱欄」，但 [契約 §5.3](../upstream-hr-source-contract.md) 明載 `companyName ← COMPFULLNM`、§8 更以該欄為浮水印公司名稱之定案來源。**兩者矛盾且尚未實測值層級**。本輪處置＝維持靜態常數（零風險、零 migration），`AE` 之顯示字串暫用契約 §10.1 所載之 `和潤電能`。追溯與後續（改由 F004 攝入 `VW_HRCOMF` 建 `COMPANY` 主檔表）見 `OQ-E01-10`。

#### 前端行為（可由 vitest 元件測試直接斷言）

- **AC-P16（公司 → 部門＋資位 雙連動；🔵 2026-08-14 依 AC-P5 擴充，原僅涵蓋部門；🔵 2026-08-31 由 `AC-P31` 再擴為含職位之三連動）**：Given 部門與職位下拉之候選集合, When 計算, Then **兩者皆**為 `companyCode` 之純函式（分別僅含該公司之 `ORG_UNIT`／`JOB_TITLE`）；Given 公司欄之值由 A 變更為 B, Then 部門欄**與職位欄**之已選值**皆清空**（不得殘留 A 公司之 `orgCode`／`jobTitleCode`，與後端 `AC-P10b` 之強制重新給值同一意圖）且候選重新以 B 計算；Given 公司欄無值, Then 部門與職位下拉皆為 `disabled`。
- **AC-P17（部門選項之顯示字串）**：Given 部門下拉渲染, When 產生每一選項, Then 其文字＝`buildOrgPath(units, orgCode)`（既有 `frontend/src/domain/org-path.ts`，全站唯一之組織路徑算法）、其 value＝`orgCode`；**不得**於本頁另建第二套組織名稱組字邏輯。
- **AC-P18（留空之清單顯示）**：Given 某帳號之 `name`／`orgCode`／`jobTitleCode` 為 `null`（或代碼查無對照）, When 渲染帳號清單, Then 對應之「姓名」「部門」「職位」欄一律顯示 **`—`**（既有 `AccountManagementPage` 規則）；**不得**出現 `（待同步）`／`（待同步姓名）` 等佔位字串——該字串為 prototype 08 建立流程之暫時佔位，本 delta 後應自 prototype 移除。「公司」欄之值＝`resolveCompanyName(**該列自身之** companyCode)`（見 `AC-P23c`——跨公司後**不得**對全列套用同一值），查無對映才顯示 `—`（於 `AC-P15` INV-C1 成立時不可達）。
- **AC-P19（編輯 modal 之預填與唯讀；🔵 2026-08-14 依 AC-P10 調整公司欄）**：Given 開啟「編輯帳號」modal, Then 姓名／公司／部門／職位四欄以該帳號**現值預填**（`orgCode`／`jobTitleCode` 為 `null` 時選取「未設定」之空選項；公司欄預選該帳號自身之 `companyCode`，**非**操作者之公司）；Given 該帳號 `source='manual'`, Then 四欄**皆可編輯**（含公司欄，為可改選之完整下拉）；Given `source='upstream'`, Then 四欄與密碼欄皆 `disabled` 並沿用既有上游提示文案（既有姓名欄唯讀規則之延伸，版面權威＝`prototypes/08-account-management.html`）。

#### 權限、稽核與 schema

- **AC-P20（權限）**：建立與編輯手動帳號＝「帳號管理」**write**（[F025](F025-role-function-matrix.md) 矩陣：系統管理員 CRUD／ICSOP管理員唯讀／主管・部門窗口・一般使用者無）。Given ICSOPAdmin 呼叫 `POST /admin/accounts` 或 `PATCH /admin/accounts/:id`, Then 回 **403 `PERMISSION_DENIED`**（唯讀）；Given 主管／部門窗口／一般使用者呼叫, Then 回 **403 `PERMISSION_DENIED`**；Given 未登入, Then 回 **401 `AUTH_SESSION_EXPIRED`**。本 delta **不改動 [F025](F025-role-function-matrix.md) 任一格值、不新增功能鍵**。
- **AC-P21（稽核：不寫入）**：Given 建立或編輯手動帳號成功, When 交易完成, Then **不寫入任何 `AUDIT_LOG` 列**、`AuditWriter` **完全未被呼叫**——`AUDIT_LOG.targetType` 之列舉**不含 `ACCOUNT`**（[data-model.md#auditlog-entity](../data-model.md#auditlog-entity)），[F023](F023-audit-logging.md) 之範圍限文件／使用表單／附錄／循環／變更歷程／組織異動提示。故本 delta **完全不觸及稽核子系統**（比照 [F041](F041-user-subtype-business-scope.md) `OQ-E08-10` 之處置）。<br>📝 本檔 Main Flow 第 3 點「停用帳號…記錄稽核」與上述 schema 之落差為**既存**（非本 delta 新增），追溯見 `OQ-E01-09`。
- **AC-P22（無 schema 變更；⚠ 僅適用 2026-08-14 delta，已由 `AC-P33` 就 2026-08-31 delta 局部推翻）**：Given 本 delta 之全部 AC, When 實作, Then **不新增任何 migration**——四欄皆已存在：`name` `nvarchar(30) NULL`、`companyCode` `varchar(10) NOT NULL`、`orgCode` `varchar(10) NULL`（皆於 `1721520000000-baseline-auth-org`）、`jobTitleCode` `varchar(10) NULL`（於 `1723852800000-account-job-title`）。Given 實作完成後執行 `migration:show`, Then 無新增之待執行項。

#### 跨公司之連帶處置（🔵 2026-08-14 使用者裁決之漣漪，AC-P23～AC-P27）

> 使用者裁決「公司別可選、不限自己所屬公司」後，以下四處若不同時修訂，功能將**在真實環境壞掉**（帳號建立後看不到、登不進去、部門/職位顯示錯位）。本組即該裁決之完整代價，**不得只做 AC-P5／AC-P10 而略過本組**。

- **AC-P23（帳號清單改為跨公司可見 ＋ 逐列解析）**：
  - **AC-P23a（移除租戶過濾）**：`GET /admin/accounts` **不再**以操作者 `companyCode` 過濾。Given SysAdmin 於 A 公司、系統中存在 B 公司之手動帳號, When 呼叫清單, Then **該帳號出現於結果**。（不改則跨公司建立之帳號建立後即消失，功能等同壞掉。）權限不變（「帳號管理」read＝SysAdmin／ICSOPAdmin，兩者皆為全域管理角色，非租戶隔離角色）。
  - **AC-P23b（新增公司篩選）**：清單查詢新增選填 `companyCode` 篩選參數（比照既有 `source`／`roleCode`／`status`／`keyword` 之慣例）；Given 帶 `companyCode=X`, Then 僅回該公司之帳號；Given 未帶, Then 回全部公司。前端於既有篩選列新增「公司」下拉（選項＝`GET /companies` ＋不限縮之預設項，其逐字文案為 **`所有公司`**，以具名常數 `COMPANY_ALL_LABEL` 持有供測試 import 斷言），樣式與文案句式比照既有三個篩選器（`所有來源`／`所有角色`／`所有狀態`）。<br>📝 初稿誤寫為「全部」，與既有三者之「所有…」句式不一致；**2026-08-14 裁定採 `所有公司`**。<br>✅ **prototype 已同步（2026-08-14）**：`prototypes/08-account-management.html` 之 `COMPANY_ALL_LABEL` 已為 `所有公司`，與本 AC 一致。
  - **AC-P23c（公司名稱逐列解析）**：清單之 `company` 欄位必須以**該列自身之 `companyCode`** 解析（`resolveCompanyName(row.companyCode)`），**不得**以操作者公司對全列套用同一值。〔現行實作為全列共用單一值，跨公司後即為錯誤來源〕
  - **AC-P23d（部門名稱以複合鍵解析）**：`department` 之解析鍵必須為 **`(row.companyCode, row.orgCode)`**，不得僅以 `orgCode` 比對——`ORG_UNIT` 之唯一鍵為 `(companyCode, orgCode)`，不同公司可存在**相同 `orgCode` 但不同單位**，僅以 `orgCode` 比對將解析出他公司的部門名稱。查無 → `null`（顯示 `—`，`AC-P18`）。
  - **AC-P23e（資位名稱以該列公司解析）**：`title` 之解析必須傳入**該列之 `companyCode`**（`resolveTitle(row.companyCode, row.jobTitleCode)`），不得傳入操作者公司。〔現行實作傳入操作者公司，跨公司後會落到兩段式解析之 fallback 分支而顯示他公司職稱名〕
- **AC-P24（`loginId` 唯一性擴為全域）**：手動帳號建立之唯一性檢查範圍由「所選公司內」擴為 **全部公司**。Given 送入之 `loginId` 已存在於**任一**公司之任一帳號（含上游同步帳號）, When 建立, Then 回 **409 `ACCOUNT_USERNAME_EXISTS`**，不建立。<br>理由：`AC-P25` 之登入解析須能單以 `loginId` 定位帳號；全域唯一使「命中多筆」不可達，是最簡潔且無歧義之保證。⚠ 這是**比既有更嚴格之超集**——既有「同公司重複 → 409」之行為與測試完全不變，僅新增「他公司同名 → 409」。DB 唯一鍵 `(companyCode, loginId)` **不變、不需 migration**（全域唯一由應用層保證）。<br>⚠ **應用層保證於並發下非絕對**（read-then-write，DB 僅強制 per-company 唯一）：此限制為**刻意接受**——手動建帳為低頻管理操作，且 `AC-P10a` 即為其安全網。若日後需 DB 層強制全域唯一，須新增 `loginId` 之篩選式唯一索引（`WHERE source='manual'`），屬 additive migration、另案評估，**本輪不做**。
- **AC-P25（帳密登入須能解析跨公司帳號）**：⚠ **本條為本裁決最嚴重之漣漪**——現行途徑 B 以 `(DEFAULT_COMPANY_CODE ?? 'AS', loginId)` 定位帳號，且登入頁**不送 `companyCode`**；若不修訂，於 `AE` 建立之手動帳號**建立後永遠無法登入**（重演本檔檔頭所載、已閉合過一次之「建立→登入死鏈」）。<br>Given 以 `AE` 建立之啟用手動帳號與正確密碼, When 於登入頁送出帳密（**不帶** `companyCode`）, Then **登入成功**並核發 session，其 `SessionUser.companyCode` 為 `AE`。解析規則與登入頁契約（不新增公司選擇器）之權威定義見 [F001](F001-auth-login-session.md) `AC-C1`／`AC-C2`。
- **AC-P26（部門候選為空之呈現）**：`ORG_UNIT` 目前僅同步 `AS`（`SYNC_COMPID='AS'`，[F004](F004-org-sync.md)），故選擇 `AS` 以外之公司時**部門候選必為空集合**——此為資料現實，**非錯誤、不得阻擋建立**。Given 所選公司之 `GET /org-units?companyCode=` 回空陣列, When 渲染部門下拉, Then 呈現停用（`disabled`）之下拉並顯示空狀態說明（逐字內容由 prototype 08 定稿），`orgCode` 送出為 `null`；Given 此情況下送出建立, Then **正常建立成功**（`orgCode=null`，清單顯示 `—`）。職位下拉**不受此限**——`JOB_TITLE` 刻意不以 `COMPID` 過濾攝入（跨公司 fallback 需要全表），實測含多家公司之對照列。
- **AC-P27（既有依賴 `companyCode` 之下游不受破壞）**：Given 任一以 `AS` 建立或同步之帳號, When 執行本 delta 前後之同一操作（登入、清單、浮水印、部門/職位解析、[F041](F041-user-subtype-business-scope.md) 業務子分類範圍判定）, Then 結果**逐項相同**。跨公司僅為**新增可達狀態**，不得改變任何既有 `AS` 路徑之行為（此為本組 AC 之回歸護欄）。

#### 🔵 2026-08-31 資位／職位拆欄 delta（AC-P28～AC-P33，使用者裁定）

> **背景**：既有「職位」欄（`jobTitleCode` → `JOB_TITLE.name`）之語意實為**資位**（職等：業務專員／
> 辦事員／副理…），已就地更名為「資位」；真正的**職位**（職務位置：營業一般職／事務一般職／室長／
> 處長…）另有來源 —— `VW_PERSONNEL_SQL.JOB_CODE` 對照 `VW_JOB_FUN.(COMPID, CODE)` → `DESC_CHI`
> （契約 §5.4.2）。二者為**正交維度**（實測 AS：資位「副理」× 職位「室長」16 人、
> 資位「課長」× 職位「處長」12 人）。
>
> **命名範圍（裁定）**：內部識別子 `ACCOUNT.jobTitleCode`／`JOB_TITLE`／API `title` 一律**不改名**
> （對齊上游 `TITLE_CODE`／`JTITLE_NM`），本次只改**畫面文案**與規格用語。新欄位一律以
> `jobPosition*` 命名。

- **AC-P28（清單「職位」欄）**：Given 帳號清單（`GET /admin/accounts`）, When 渲染, Then 表頭為
  姓名／帳號／公司／部門／**資位**／**職位**／來源／角色／狀態／最後登入（＋write 角色之操作），
  「職位」緊鄰「資位」之右；其值＝以 **`(該列自身之 companyCode, jobPositionCode)` 精確命中**之
  `JOB_POSITION.name`。🔴 **不得跨公司 fallback**（與資位之 `AC-P23e` 兩段式刻意不同）——同代碼跨公司
  語意可**相反**（實測 `C04` 在 AS＝處長、在 AD＝部長；`D04` 在 AS＝營業經理、在 AD＝科長）。
  Given 代碼為 `null` 或查無對照, Then 顯示 **`—`**（沿用 `AC-P18`；實測 AS 之 `B20` 6 人即此情形）。
- **AC-P29（職位主檔＝新增 `GET /job-positions`）**：Given 具「帳號管理」read 權限之使用者
  （SysAdmin／ICSOPAdmin）, When 呼叫 `GET /job-positions?companyCode={code}`（`companyCode` 選填，
  未帶時預設＝操作者 session 之 `companyCode`）, Then 回 `{ companyCode, code, name }[]`，
  **依 `companyCode` 精確過濾**且依 `code` 昇冪；Given 主管／部門窗口／一般使用者呼叫, Then 回
  **403 `PERMISSION_DENIED`**；Given 未登入, Then 回 **401 `AUTH_SESSION_EXPIRED`**（RBAC 與端點形狀
  逐項比照 `AC-P14`，**不新增 F025 功能鍵**）。
- **AC-P30（`jobPositionCode` 之寫入與驗證）**：Given 建立／編輯手動帳號之 payload 含 `jobPositionCode`,
  When 送出, Then 經 `AC-P2` 正規化（trim 後空字串 → `null`）後寫入；非 `null` 時必須存在一筆
  `JOB_POSITION` 之 `(companyCode, code)` 與「該帳號之 `companyCode`＋送入之 `jobPositionCode`」
  **精確相等**，否則回 **400 `ACCOUNT_JOB_POSITION_INVALID`**、不寫入。
  驗證順序（`AC-P8` 之擴充）：⑤ 資位（`ACCOUNT_JOB_TITLE_INVALID`）→ **⑥ 職位
  （`ACCOUNT_JOB_POSITION_INVALID`）** → ⑦ 唯一性（`ACCOUNT_USERNAME_EXISTS`）；既有各項相對順序不變。
  ⚠ 此處**不存在**資位那種「顯示寬鬆、寫入嚴格」之不對稱（`OQ-E01-08`）——職位兩端皆為精確。
- **AC-P31（公司 → 部門＋資位＋職位 三連動；擴充 `AC-P16`）**：Given 三者之候選集合, When 計算,
  Then 皆為 `companyCode` 之純函式；Given 公司欄之值由 A 變更為 B, Then 部門／資位／**職位**之已選值
  **三者皆清空**且候選以 B 重算；Given 公司欄無值, Then 三個下拉皆 `disabled`。
  對應後端 `AC-P10b` 之強制重新給值——**該規則同步擴為三者**：變更 `companyCode` 時
  `orgCode`／`jobTitleCode`／`jobPositionCode` 必須於同一請求一併給值，缺一即 `VALIDATION_ERROR`。
  ⚠ 職位下拉不受 `AC-P26`「候選為空即停用」之限（同資位），僅公司無值時停用。
- **AC-P32（上游帳號之職位亦唯讀；擴充 `AC-P11`）**：Given `source='upstream'` 之帳號, When
  `PATCH /admin/accounts/:id` 之 payload 出現 `jobPositionCode`（含明確傳 `null` 之清空意圖）, Then 回
  **403 `ACCOUNT_UPSTREAM_READONLY`**，不寫入任何欄位；編輯 modal 之職位下拉一併 `disabled`。
- **AC-P33（本 delta **有** schema 變更；推翻 `AC-P22`）**：Given 本組 AC, When 實作, Then 需
  **一個 additive migration**（`1725062400000-account-job-position`）：`ACCOUNT.jobPositionCode
  varchar(10) NULL` ＋ `JOB_POSITION` 表（`(companyCode, code)` 唯一索引）。
  🔴 **既有列不會自動回填**：帳號同步為增量（`MTDT > watermark`），必須執行一次
  `SYNC_FULL_RESYNC=1 npm run sync:once`；且 `classifyAccount` 必須納入 `jobPositionCode` 比對，
  否則全量重同步亦會整批判為 noop（見 [F004](F004-org-sync.md) 與契約 §5.4.2）。

## Error Scenarios
- 帳號重複/上游唯讀/非法角色/自我降級：見 [error-handling.md#auth](../error-handling.md#auth)（`ACCOUNT_USERNAME_EXISTS`, `ACCOUNT_UPSTREAM_READONLY`, `ROLE_INVALID`, `ROLE_SELF_DOWNGRADE_BLOCKED`）。
- 手動帳號基本資料（姓名／公司／部門／資位／職位）之必填、長度、代碼有效性與驗證順序：見 [error-handling.md#account-profile](../error-handling.md#account-profile)（`VALIDATION_ERROR`, `ACCOUNT_COMPANY_CODE_INVALID`, `ACCOUNT_ORG_CODE_INVALID`, `ACCOUNT_JOB_TITLE_INVALID`, `ACCOUNT_JOB_POSITION_INVALID`, `ACCOUNT_UPSTREAM_READONLY`）。

## Related
- Data: [ACCOUNT](../data-model.md#account-entity), [ROLE](../data-model.md#role-entity), [ORG_UNIT](../data-model.md#orgunit-entity)（部門下拉來源）, [JOB_TITLE](../data-model.md#job-title-entity)（**資位**下拉來源）, [JOB_POSITION](../data-model.md#job-position-entity)（**職位**下拉來源，`AC-P29`）
- Depends on: [F025 角色×功能矩陣](F025-role-function-matrix.md)
- Related: [F005 離職停用](F005-auto-disable-departed.md)（session 撤銷機制共用）
- **跨公司手動帳號之帳密登入解析**: [F001](F001-auth-login-session.md) `AC-C1`～`AC-C3`（`AC-P25` 之權威定義；不修訂則他公司帳號建立後無法登入）
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（`userSubtype` 欄位語意、指派入口 `AC-U1`～`AC-U5`；🟢 APPROVED 2026-08-11 人類閘門通過。**前端呈現面 `AC-U6`～`AC-U9` 為 2026-08-11 缺口修補**，對應 [F041 §F2](F041-user-subtype-business-scope.md#f2-fidelity-gap) AC-41～AC-44）
- **版面／文案權威**: `prototypes/08-account-management.html`（清單列 `:323`、編輯 modal `:355`、指派 modal 預選 `:375`／選項渲染 `:382`～`:388`、`SUBTYPE_DESC` `:267`）
- OQ: OQ-E01-03/05。定案: **OQ-E08-04**（2026-08-11 人類裁決＝**選項 B 子分類旗標**；角色維持固定 5 種，本檔既有「僅顯示 5 種固定角色」AC 不變）
