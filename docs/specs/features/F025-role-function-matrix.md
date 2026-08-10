# F025: 角色×功能權限矩陣
Priority: P0-MVP | Status: Draft | Last Updated: 2026-08-06
Epic/Story: E08 / US-070（附錄管理列：E10 / US-102 AC5）

> **定案**：主管、部門窗口對 ICSOP 文件管理皆唯讀，僅 ICSOP 管理員可編輯；**系統管理員對循環管理／ICSOP 文件管理／文件使用表單管理為唯讀（比照主管，可查不可改）**；**主管無「文件使用表單管理」與「文件調閱歷程查詢」權限**。**主管對循環管理（DAG）為全公司唯讀**（2026-07-17 定案：原「唯讀（本部門相關）」反向放寬為「唯讀」＝全公司，與主管文件管理全公司唯讀一致；OQ-E08-03 定案、OQ-E03-06 收斂）。**「文件變更歷程」為獨立後台功能**（獨立側選單項，非「文件調閱歷程」子頁；兩 tab：ICSOP 程序書 [F037](F037-document-change-history.md)／循環樹狀圖 [F038](F038-lifecycle-tree-change-history.md)），權限為獨立一列：僅 SysAdmin／ICSOPAdmin 全公司唯讀、其餘無（OQ-E07-04 定案）。**新增「文件索引管理」權限列（[F031](F031-admin-index-visibility.md)）**：系統管理員 唯讀／ICSOP 管理員 CRUD／主管・部門窗口・一般使用者 無；該列涵蓋 RAG 提取結果預覽／索引狀態／重新索引（重抽），系統管理員唯讀係比照其對 ICSOP 文件管理／循環管理之唯讀原則（可查不可改）。**新增「附錄管理」權限列（[F039](F039-appendix-management.md)，2026-08-06）**：系統管理員 唯讀／ICSOP 管理員 CRUD／主管・部門窗口・一般使用者 無——與「文件使用表單管理」列**完全比照**（E10 epic 已與使用者確認附錄之權限模型同構）。**功能鍵字串定案為「附錄管理」**（逐字採用 [US-070](../../stories/epics/E08-permission-matrix/US-070-role-function-matrix.md) 矩陣列名；建議常數 `FunctionKey.APPENDIX_MANAGEMENT`），**刻意不沿用**使用表單之「文件使用表單管理」句型；既有「文件使用表單管理」列名維持不變（已實作、改名將造成跨層識別碼 churn）。**「角色指派」為「帳號管理」之 modal 內操作、非獨立側選單頁**（prototype 側選單已移除獨立項），惟權限矩陣仍將其列為獨立權限列（系統管理員 CRUD、其餘 無；ICSOP 管理員 對帳號管理為唯讀但**無**角色指派權）。其餘部分為分析師草案，待審核（見 OQ-E08-02）。以 RBAC 中介層（guard/middleware）於 API 層落實。

> **🟢 2026-08-11 delta（APPROVED，人類閘門通過）——一般使用者子分類（業務／其他）**：本矩陣**不新增欄位、不新增功能列、不改變任一格值**。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**。詳見下方 [§一般使用者子分類 delta](#user-subtype-delta)。

## Description
定義 5 種固定角色對各後台功能模組的存取權限（CRUD/唯讀/無），供 API 層授權判斷，避免越權。

## 角色×功能矩陣

| 功能 | 系統管理員 | ICSOP管理員 | 主管 | 部門窗口 | 一般使用者 |
|------|-----------|-------------|------|----------|-----------|
| 帳號管理 | CRUD | 唯讀 | 無 | 無 | 無 |
| 角色指派 | CRUD | 無 | 無 | 無 | 無 |
| 循環管理（DAG） | 唯讀 | CRUD | 唯讀 | 無 | 無 |
| ICSOP 文件管理 | 唯讀 | CRUD | 唯讀 | 唯讀 | 無 |
| 文件使用表單管理 | 唯讀 | CRUD | 無 | 無 | 無 |
| 附錄管理 | 唯讀 | CRUD | 無 | 無 | 無 |
| 文件索引管理 | 唯讀 | CRUD | 無 | 無 | 無 |
| 文件調閱歷程查詢 | 全部唯讀 | 全部唯讀 | 無 | 無 | 無 |
| 文件變更歷程 | 唯讀 | 唯讀 | 無 | 無 | 無 |
| 組織人員異動管理（同步操作） | CRUD（可觸發同步/查看） | 唯讀 | 無 | 無 | 無 |
| 前台瀏覽 | 可 | 可 | 可 | 可 | 可 |
| 下載/列印文件 | 可（浮水印） | 可（浮水印） | 可（浮水印） | 可（浮水印） | 可（浮水印） |
| 系統參數設定 | CRUD | 無 | 無 | 無 | 無 |

## Preconditions
- 5 種角色已定義（F003）。

## Main Flow
1. RBAC 中介層依矩陣於每個 API 端點判斷角色權限。
2. 範圍限定（唯讀）由後端依組織歸屬（公司>本部>部>處/室）強制過濾；**現行矩陣已無角色使用「本部門相關」範圍**（主管循環管理已放寬為全公司唯讀），組織範圍限縮機制保留為一般能力備用。

## Edge Cases
- 系統管理員對 ICSOP 文件管理／循環／使用表單為**唯讀**：查詢類 API 允許回傳，寫入類（Create/Update/Delete）一律回 403（可查看、不可編輯文件內容）。
- 主管對循環管理為**全公司唯讀**：可查看全部循環，寫入類（新增節點／連線／改派）一律回 403（範圍由本部門相關放寬為全公司，OQ-E08-03 定案）。
- **雙入口可視範圍已一致（OQ-E08-03 定案）**：主管對「循環管理」已由「本部門相關」反向放寬為**全公司唯讀**，與「ICSOP 文件管理」全公司唯讀一致；由文件清單（[F017](F017-backend-document-list.md)）開啟循環樹狀圖預覽（[F036](F036-lifecycle-tree-preview.md)）不再有「主管→非本部門循環→403」落差。DeptContact／User 仍無循環管理權（開啟預覽一律 403）。

## Postconditions
- 所有寫入型操作皆經矩陣授權；未授權一律 403。

## Acceptance Criteria
- Given 角色對某功能為「無/唯讀」, When 呼叫其寫入型 API, Then 回 403 `PERMISSION_DENIED`，操作不執行。
- Given 角色對某功能為「唯讀」, When 呼叫查詢類 API, Then 允許回傳；寫入類一律被拒。
- Given ICSOP 管理員呼叫循環管理 CRUD API, When 請求, Then 允許執行。
- Given 一般使用者呼叫帳號管理 API, When 請求, Then 回 403。
- Given 部門窗口呼叫 ICSOP 文件刪除 API, When 請求, Then 回 403。
- Given 系統管理員呼叫 ICSOP 文件管理**查詢** API（矩陣為「唯讀」）, When 請求, Then 允許回傳；呼叫**寫入**類則回 403。
- Given 主管呼叫文件使用表單管理或文件調閱歷程查詢 API（矩陣為「無」）, When 請求, Then 回 403。
- Given 主管／部門窗口／一般使用者呼叫**附錄管理** API（功能鍵「附錄管理」，矩陣為「無」）, When 請求, Then 回 403 `PERMISSION_DENIED`（F039 AC-33）。
- Given 系統管理員呼叫附錄管理**查詢**類 API（矩陣為「唯讀」）, When 請求, Then 允許回傳；呼叫**寫入**類（上傳／覆蓋／移除／關聯）則被拒（F039 AC-32）。
- Given 主管／部門窗口／一般使用者呼叫**文件變更歷程** API（獨立功能列為「無」）, When 請求, Then 回 403；僅 SysAdmin／ICSOPAdmin 全公司唯讀（OQ-E07-04 定案，F037/F038）。
- Given 矩陣草案經審核調整, When 定案, Then 更新本文件版本並移除對應 OQ，變更留下版本控制記錄。

### 一般使用者子分類 delta（🟢 APPROVED 2026-08-11 人類閘門通過；規則權威＝[F041](F041-user-subtype-business-scope.md)） {#user-subtype-delta}

> **✅ OQ-E08-04 已定案為選項 B（子分類旗標 `ACCOUNT.userSubtype`）**，2026-08-11 人類裁決。**角色維持固定 5 種、本矩陣不新增欄位。**
> 📝 追溯：若當初裁為選項 A（新增第 6 種角色 `BusinessUser`），本矩陣需**新增一欄**（其 13 列之值與「一般使用者」欄逐格相同，形成完全重複之欄位），
> 且須同步改寫 3 處「5 種固定角色」之既有定案文字（[US-006](../../stories/epics/E01-account-auth/US-006-role-assignment.md) AC3、[data-model.md#role-entity](../data-model.md#role-entity)「固定 5 種列舉值，不可由前後台新增/刪除」、[F003](F003-account-role-management.md) AC「僅顯示 5 種固定角色」）——屬**材質變更**、非 additive。此為裁決採 B 之主要理由之一。

**結論：本矩陣不受業務／其他子分類影響。**

理由：業務與其他兩子分類對**全部 13 列後台功能**之權限值**完全相同**（皆與現行「一般使用者」欄一致——除「前台瀏覽」「下載/列印文件」為「可」外，其餘皆為「無」）。
差異僅發生於**前台可見文件範圍**（哪些文件筆數對其可見），而「可見範圍」屬**資料列層級之過濾**，本矩陣規範的是**功能模組層級之存取**（能否呼叫某類 API），兩者為不同維度、不得混為一談。
既有 RBAC 中介層（guard/middleware）之判定輸入維持僅 `roleCode`，**不接受** `userSubtype` 參數。

- **AC-U1**：Given `FUNCTION_MATRIX` 之全部功能鍵 × 5 種角色, When 逐格取值, Then 與本 delta 導入前**逐格相同**；矩陣之鍵集合亦未增減（不新增功能鍵）。〔[F041](F041-user-subtype-business-scope.md) AC-37〕
- **AC-U2**：Given 兩個帳號其 `roleCode` 皆為 `'User'`、`userSubtype` 分別為 `'business'` 與 `'other'`, When 對任一功能鍵呼叫權限解析函式, Then **兩者結果完全相同**；且該函式之簽章**不含** `userSubtype` 參數（子分類不參與功能授權判定）。〔[F041](F041-user-subtype-business-scope.md) AC-37〕
- **AC-U3**：Given 業務子分類使用者呼叫任一後台功能 API（帳號管理／循環管理／ICSOP 文件管理／…）, When 請求送出, Then 回 403 `PERMISSION_DENIED`——與「其他」子分類之一般使用者**完全一致**，業務限制**不放寬亦不加嚴**後台功能權限。

## Error Scenarios
- 越權/範圍限縮：見 [error-handling.md#permission](../error-handling.md#permission)。
- **業務子分類之前台使用部門限縮**（🟢 APPROVED）：屬**資料列層級過濾**，非本矩陣之功能層級授權；拒絕回 404 `DOCUMENT_NOT_FOUND`（非 403 `PERMISSION_DENIED`），見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction) 與 [F041](F041-user-subtype-business-scope.md)。

## Related
- Data: [ROLE](../data-model.md#role-entity), [ORG_UNIT](../data-model.md#orgunit-entity)
- Depends on: [F003](F003-account-role-management.md); Blocks: 全系統寫入型操作
- Related: [F026 角色×欄位矩陣](F026-role-field-matrix.md)；獨立功能「文件變更歷程」見 [F037](F037-document-change-history.md)／[F038](F038-lifecycle-tree-change-history.md)；功能列「附錄管理」之行為規格見 [F039](F039-appendix-management.md)
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（本矩陣不變之理由與 `AC-U1`～`AC-U3`；🟢 APPROVED 2026-08-11，OQ-E08-04 定案為選項 B）
- 定案: OQ-E08-01（SysAdmin 對文件為唯讀、無寫入權）；OQ-E08-03（主管循環管理全公司唯讀、雙入口一致——本次已將矩陣主管「循環管理」欄由「唯讀（本部門相關）」改為「唯讀」）；OQ-E07-04（新增獨立功能列「文件變更歷程」＝僅 SysAdmin／ICSOPAdmin 全公司唯讀，其餘無）。OQ: OQ-E08-02（矩陣其餘部分審核）。
