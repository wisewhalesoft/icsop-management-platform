# F003: 帳號與角色指派管理
Priority: P0-MVP | Status: Draft（帳號 CRUD／角色指派已實作；建立→登入死鏈已於 authfix 閉合，識別鍵＝loginId） | Last Updated: 2026-07-23
Epic/Story: E01 / US-005, US-006

> 合併理由：帳號 CRUD 與角色指派為同一後台管理畫面之連續操作，共用帳號實體與稽核。
> **🟢 2026-08-11 additive delta（APPROVED，人類閘門通過）——一般使用者子分類（業務／其他）指派入口**：角色指派 modal 於所選角色為「一般使用者」時，額外呈現子分類選擇器；**帳號清單「角色」欄與「編輯帳號」modal 之「目前角色」亦一併顯示子分類徽章**（AC-U6／AC-U7，2026-08-11 補訂）。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**。⚠ **角色種類仍為 5 種、不新增**（子分類為 `ACCOUNT` 之獨立欄位，非第 6 種角色）——本檔既有 AC「僅顯示 5 種固定角色」**不變**。

## Description
系統管理員於後台建立/查詢/編輯/停用帳號，區分「手動建立」與「上游同步」兩來源；並將 5 種固定角色之一指派給帳號。

## Preconditions
- 操作者為系統管理員（依 F025，帳號管理與角色指派僅 SysAdmin 可 CRUD）。

## Main Flow
### 帳號管理
1. 建立手動帳密帳號：填帳號、初始密碼、指派角色 → 密碼雜湊儲存，`source=manual`。
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

## Error Scenarios
- 帳號重複/上游唯讀/非法角色/自我降級：見 [error-handling.md#auth](../error-handling.md#auth)（`ACCOUNT_USERNAME_EXISTS`, `ACCOUNT_UPSTREAM_READONLY`, `ROLE_INVALID`, `ROLE_SELF_DOWNGRADE_BLOCKED`）。

## Related
- Data: [ACCOUNT](../data-model.md#account-entity), [ROLE](../data-model.md#role-entity)
- Depends on: [F025 角色×功能矩陣](F025-role-function-matrix.md)
- Related: [F005 離職停用](F005-auto-disable-departed.md)（session 撤銷機制共用）
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（`userSubtype` 欄位語意、指派入口 `AC-U1`～`AC-U5`；🟢 APPROVED 2026-08-11 人類閘門通過。**前端呈現面 `AC-U6`～`AC-U9` 為 2026-08-11 缺口修補**，對應 [F041 §F2](F041-user-subtype-business-scope.md#f2-fidelity-gap) AC-41～AC-44）
- **版面／文案權威**: `prototypes/08-account-management.html`（清單列 `:323`、編輯 modal `:355`、指派 modal 預選 `:375`／選項渲染 `:382`～`:388`、`SUBTYPE_DESC` `:267`）
- OQ: OQ-E01-03/05。定案: **OQ-E08-04**（2026-08-11 人類裁決＝**選項 B 子分類旗標**；角色維持固定 5 種，本檔既有「僅顯示 5 種固定角色」AC 不變）
