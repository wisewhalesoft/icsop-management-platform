# F025: 角色×功能權限矩陣
Priority: P0-MVP | Status: Draft｜**業務/功能類別管理功能列 delta：🟢 APPROVED（2026-09-02 人類閘門通過）（`AC-B28`～`AC-B29`；權威＝[F043](F043-business-function-category.md)）** | Last Updated: 2026-09-02
Epic/Story: E08 / US-070（附錄管理列：E10 / US-102 AC5）

> **定案**：主管、部門窗口對 ICSOP 文件管理皆唯讀，僅 ICSOP 管理員可編輯；**系統管理員對循環管理／ICSOP 文件管理／文件使用表單管理為唯讀（比照主管，可查不可改）**；**主管無「文件使用表單管理」與「文件調閱歷程查詢」權限**。**主管對循環管理（DAG）為全公司唯讀**（2026-07-17 定案：原「唯讀（本部門相關）」反向放寬為「唯讀」＝全公司，與主管文件管理全公司唯讀一致；OQ-E08-03 定案、OQ-E03-06 收斂）。**「文件變更歷程」為獨立後台功能**（獨立側選單項，非「文件調閱歷程」子頁；兩 tab：ICSOP 程序書 [F037](F037-document-change-history.md)／循環樹狀圖 [F038](F038-lifecycle-tree-change-history.md)），權限為獨立一列：僅 SysAdmin／ICSOPAdmin 全公司唯讀、其餘無（OQ-E07-04 定案）。**新增「文件索引管理」權限列（[F031](F031-admin-index-visibility.md)）**：系統管理員 唯讀／ICSOP 管理員 CRUD／主管・部門窗口・一般使用者 無；該列涵蓋 RAG 提取結果預覽／索引狀態／重新索引（重抽），系統管理員唯讀係比照其對 ICSOP 文件管理／循環管理之唯讀原則（可查不可改）。**新增「附錄管理」權限列（[F039](F039-appendix-management.md)，2026-08-06）**：系統管理員 唯讀／ICSOP 管理員 CRUD／主管・部門窗口・一般使用者 無——與「文件使用表單管理」列**完全比照**（E10 epic 已與使用者確認附錄之權限模型同構）。**功能鍵字串定案為「附錄管理」**（逐字採用 [US-070](../../stories/epics/E08-permission-matrix/US-070-role-function-matrix.md) 矩陣列名；建議常數 `FunctionKey.APPENDIX_MANAGEMENT`），**刻意不沿用**使用表單之「文件使用表單管理」句型；既有「文件使用表單管理」列名維持不變（已實作、改名將造成跨層識別碼 churn）。**「角色指派」為「帳號管理」之 modal 內操作、非獨立側選單頁**（prototype 側選單已移除獨立項），惟權限矩陣仍將其列為獨立權限列（系統管理員 CRUD、其餘 無；ICSOP 管理員 對帳號管理為唯讀但**無**角色指派權）。其餘部分為分析師草案，待審核（見 OQ-E08-02）。以 RBAC 中介層（guard/middleware）於 API 層落實。

> 🔴 **2026-09-02 delta（人類裁決，即時生效）——「循環管理」自主管權限移除（`唯讀` → `無`）**：使用者原文「循環管理：從主管權限中移除(原為唯讀，改為不可存取)」。矩陣「循環管理（DAG）」列之**主管欄由「唯讀」改為「無」**，其餘四格（系統管理員 唯讀／ICSOP 管理員 CRUD／部門窗口 無／一般使用者 無）**一格未動**。<br>⚠ **本裁決反轉 `OQ-E08-03`（2026-07-17「主管循環管理全公司唯讀」）之結論**——該定案之原文與理由**刻意保留於本檔各處不刪**（見上方定案段與 §Notes），供追溯「為何曾經是唯讀」；本行為其後續裁決，時間較晚者為準。<br>🔴 **連帶生效之四處（皆源自同一格值，非各自的新規則）**：① [F036](F036-lifecycle-tree-preview.md) 樹狀圖預覽／下載／列印三端點（閘門＝`循環管理 read`）對主管改為 403；② 節點抽屜與子樹文件清單端點（同一閘門）對主管改為 403；③ 後台側選單不再對主管呈現「循環管理」；④ [F017](F017-backend-document-list.md) 後台文件清單之**「樹狀圖」欄**對主管與部門窗口**不進 DOM**（部門窗口本就無權，先前卻看得到按鈕、點下去必 403——**既有死鏈**，本輪一併修掉）。<br>🔒 **主管對「ICSOP 文件管理」仍為全公司唯讀，一格未動**——⚠ 本輪最可能之連帶失誤即「順手把主管的文件管理也一起收掉」。<br>📌 **儀表板動態來源**（`dashboard-activity`）依同一矩陣推導 ⇒ 主管可見來源自動少掉 `LIFECYCLE_CHANGED`，**不需要也不得**另建一份角色清單。

> **🟢 2026-08-11 delta（APPROVED，人類閘門通過）——一般使用者子分類（業務／其他）**：本矩陣**不新增欄位、不新增功能列、不改變任一格值**。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**。詳見下方 [§一般使用者子分類 delta](#user-subtype-delta)。

## Description
定義 5 種固定角色對各後台功能模組的存取權限（CRUD/唯讀/無），供 API 層授權判斷，避免越權。

> **🔴 2026-08-25 delta（APPROVED，人類閘門通過）——角色自動化：本矩陣兩列變更 ＋ 值域新增第四種。**
> 權威＝[stories/2026-08-25-role-automation-delta.md](../../stories/2026-08-25-role-automation-delta.md)、[open-questions §RA](../open-questions.md#ra-2026-08-25)。**本 delta 之 AC 編號採 `AC-R#`**。
> **① 「帳號管理」列**：ICSOP 管理員 由 `唯讀` 改為 **`CRUD`**（`OQ-RA`／Q4.1）。主管維持 `無`（**非**唯讀）。
> **② 「角色指派」列**：ICSOP 管理員 由 `無` 改為 **`受限CRUD`**（`OQ-RA-03`／Q4.1b）——可指派 `Supervisor`／`DeptContact`／`User`，
> **不得指派 `SysAdmin`／`ICSOPAdmin`**（否則 ICSOPAdmin 可自我提權，兩層管理者之區隔即消失）。
> **③ 值域新增第四種 `受限CRUD`**：本矩陣原僅有 `CRUD`／`唯讀`／`無` 三值，容納不下 ②。新值**僅用於「角色指派」列**，
> 其「受限」之具體範圍由 [F003](F003-account-role-management.md) 之 `AC-R#` 定義，不在本矩陣內展開。
> 🔴 **[2026-08-28 E11] ③ 之「僅用於「角色指派」列」已失效**——`OQ-E11-05`→A 使新增之「OJT 進度管理」列成為 `受限CRUD` 之**第二處消費**，見 [§OJT 進度管理功能列 delta](#ojt-progress-function-key-delta) `AC-J16`。⚠ **兩處之「受限」語意互不相同**（角色指派＝不得指派 SysAdmin／ICSOPAdmin；OJT 進度管理＝僅可新增、不可刪除）——`受限CRUD` 是「**此處另有細則**」之標記，**不是一組固定的權限集合**，**明文禁止**把兩處抽成共用判定式。**上方原句逐字保留、不刪不改。**
> ⚠ **既有 `AC-U1`（逐格不變）之斷言因本 delta 失效**，已於下方就地改寫；[F026](F026-role-field-matrix.md) `AC-U1` **不受影響**（本 delta 不觸及欄位矩陣）。
> ⚠ 其餘 11 列、其餘 4 個角色欄**一律不變**；角色種類仍為固定 5 種。

## 角色×功能矩陣

| 功能 | 系統管理員 | ICSOP管理員 | 主管 | 部門窗口 | 一般使用者 |
|------|-----------|-------------|------|----------|-----------|
| 帳號管理 | CRUD | **CRUD** 🔴 | 無 | 無 | 無 |
| 角色指派 | CRUD | **受限CRUD** 🔴 | 無 | 無 | 無 |
| 循環管理（DAG） | 唯讀 | CRUD | **無**🔴 | 無 | 無 |
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

> 🔴 **[2026-08-27 E11] 上表將新增第 14 列「`OJT 進度管理`」**（[F042](F042-ojt-progress-management.md) `AC-27`），置於既有 13 列之後——✅ **2026-08-28 裁決定值＝`唯讀`｜`CRUD`｜`受限CRUD`｜`受限CRUD`｜`無`**（`OQ-E11-05`→A），見 [§OJT 進度管理功能列 delta](#ojt-progress-function-key-delta) `AC-J16`。🔒 **既有 13 列 × 5 欄（65 格）逐格不變、角色仍為固定 5 種**（`AC-J18`）；⚠ 此為 `AC-N36`「不新增功能列」鎖定之**明文例外**，理由見 `AC-J17`。**上表現行 13 列逐字保留、待棒 3／棒 4 實作時始新增該列。**

> 🔵 **[2026-09-02 E12] 上表將再新增第 15 列「`業務/功能類別管理`」**（逐字列名之權威＝[§業務/功能類別管理功能列 delta](#business-category-function-key-delta) `AC-B28`；規格權威＝[F043](F043-business-function-category.md)），置於 `OJT 進度管理` 之後——🔵 **DRAFT，格值＝`唯讀`｜`CRUD`｜`唯讀`｜`無`｜`無`**（使用者 2026-09-02 原文「開放給 ICSOP 管理員 CRUD，系統管理員 / 主管 唯讀」）。🔒 **既有 14 列 × 5 欄（70 格）逐格不變、角色仍為固定 5 種**（`AC-B29`）；🔴 **本列之主管欄（`唯讀`）與「循環管理（DAG）」列之主管欄（`無`）刻意不同**，理由與回歸鎖定見 `AC-B29`。**上表現行 13 列逐字保留、待人類閘門核准後始新增第 14／15 兩列。**

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

- **AC-U1**（🔴 **2026-08-25 就地改寫**；原文＝「全部功能鍵 × 5 種角色**逐格相同**」，因角色自動化 delta 之兩列變更而失效，逐字保留於此供追溯）：Given `FUNCTION_MATRIX` 之全部功能鍵 × 5 種角色, When 逐格取值, Then **除「帳號管理」與「角色指派」兩列之 ICSOP 管理員欄外**，其餘各格與 F041 delta 導入前**逐格相同**；矩陣之鍵集合亦未增減（**不新增功能鍵**——2026-08-25 delta 亦未新增，僅變更既有兩格之值並擴充值域）。〔[F041](F041-user-subtype-business-scope.md) AC-37〕<br>📌 本條之原始目的（F041 子分類**不得**影響功能矩陣）**完全不變**：兩格之變更源自角色自動化之權限下放，與 `userSubtype` 無關；權限解析函式仍**不接受**子分類參數（`AC-U2` 不變）。
  - 🔴 **[2026-08-27 E11] `AC-U1` 之「矩陣之鍵集合亦未增減」子句已因 [F042](F042-ojt-progress-management.md) `AC-27` 失效**，就地改讀為「**除本 delta 新增之 `OJT 進度管理` 一列外**，鍵集合未增減」——見 [§OJT 進度管理功能列 delta](#ojt-progress-function-key-delta) `AC-J18`。📌 **本條之原始目的（F041 子分類不得影響功能矩陣）完全不變**：新增列與 `userSubtype` 無關，`AC-U2` 逐字不變。**原條文逐字保留於上。**
- **AC-U2**：Given 兩個帳號其 `roleCode` 皆為 `'User'`、`userSubtype` 分別為 `'business'` 與 `'other'`, When 對任一功能鍵呼叫權限解析函式, Then **兩者結果完全相同**；且該函式之簽章**不含** `userSubtype` 參數（子分類不參與功能授權判定）。〔[F041](F041-user-subtype-business-scope.md) AC-37〕
- **AC-U3**：Given 業務子分類使用者呼叫任一後台功能 API（帳號管理／循環管理／ICSOP 文件管理／…）, When 請求送出, Then 回 403 `PERMISSION_DENIED`——與「其他」子分類之一般使用者**完全一致**，業務限制**不放寬亦不加嚴**後台功能權限。
- **AC-U4**（**權限矩陣頁之 F041 註記橫幅**；2026-08-11 補訂，vitest 可斷言）：Given 以系統管理員開啟權限矩陣頁, When 渲染, Then 於既有兩則橫幅（「已定案…全欄位唯讀」／「草案待審（OQ-E08-02）」）**之下、分頁列之上**呈現第三則**跨兩欄**之定案橫幅，其 `textContent`（空白正規化後）逐字為：<br>`🟢 已定案（F041 · OQ-E08-04 裁決 B，2026-08-11 人類閘門通過）：一般使用者再細分之子分類「業務／其他」為 ACCOUNT 之獨立欄位，非第 6 種角色——本頁兩份矩陣維持 5 欄、逐格不變（F041 AC-37／AC-38），權限解析函式亦不接受子分類參數。子分類僅影響前台可見之文件範圍（資料列層級：業務者僅見「使用部門相符」之已公告文件），不參與功能授權與欄位授權判定；指派入口見「帳號管理」之指派角色 modal（08）。`<br>Then 既有兩則橫幅之文案、順序與存廢**一律不變**（`prototypes/18-permission-matrix.html` 檔頭明示：「草案待審（OQ-E08-02）」與 F041 無關，**不得**一併翻轉為已定案）；且兩份矩陣仍為 **5 欄、逐格不變**（AC-U1／[F026](F026-role-field-matrix.md) AC-U1 之既有斷言不得放寬）。<br>📌 本橫幅為 prototype 18 檔頭所稱之「**本檔唯一變更**」，位於**頁面層級、涵蓋兩個分頁**，故僅於本檔立 AC，[F026](F026-role-field-matrix.md) 不另立。〔[F041](F041-user-subtype-business-scope.md) AC-45〕

### D9 delta：功能矩陣不變之回歸鎖定（🔴 2026-08-20；缺失／變更 delta 第 8 項之連動核實） {#d9-function-matrix-lock}

> **核實結論＝本矩陣逐格不變、不新增功能列。**
> `OQ-D9-19`～`OQ-D9-24` 開放主管／部門窗口上傳 OJT，屬**欄位層**（[F026](F026-role-field-matrix.md)）之破例，**非功能層**。
> 理由（已對原始碼核實）：OJT 上傳端點 `POST /admin/documents/:documentId/attachments/ojt` 之路由層閘門為
> `@RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')`（`backend/src/attachments/attachments.controller.ts:73-74`）——
> 本矩陣「ICSOP 文件管理」列對主管／部門窗口之值為 **唯讀**，`'read'` 閘門**本即通過**；實際擋住寫入者為服務層之欄位矩陣。
> ⇒ **開放 OJT 不需要、也不得改動本矩陣任何一格。**
> **本 delta 之 AC 編號採 `AC-N#`**。

- **AC-N36**（🔒 功能矩陣逐格不變 ＋ 閘門值不得改動）：Given 2026-08-20 D9 delta 實作完成, When 逐格取 `FUNCTION_MATRIX` 之全部功能鍵 × 5 種角色之值, Then **與本 delta 導入前逐格相同**、功能鍵集合亦未增減（**不新增「OJT 上傳」之類的功能列**）；且 When 檢視 OJT 上傳端點之 route metadata, Then 其功能鍵仍為 `ICSOP_DOCUMENT_MANAGEMENT`、動作仍為 **`'read'`**（**不得**被改為 `'write'`）。<br>🔴 **「不得改為 `'write'`」之理由（不得省略）**：本矩陣對主管／部門窗口之「ICSOP 文件管理」為**唯讀**，改為 `'write'` 閘門會使兩者**連 OJT 都上傳不了**，直接架空本次裁決；而若為了讓它通過而把矩陣格值改為 CRUD，則等同**把整個 ICSOP 文件管理模組對兩角色開放寫入**——那正是 [F026](F026-role-field-matrix.md) `AC-N24`／`AC-N25` 所要防止的「鬆一片牆」。**兩種改法皆為回歸，不是整理。**

  - 🔴 **[2026-08-27 E11] `AC-N36` 之「不新增功能列」鎖定已被 [F042](F042-ojt-progress-management.md) `AC-27` 明文打破**（**非靜默違反**），見 [§OJT 進度管理功能列 delta](#ojt-progress-function-key-delta) `AC-J16`／`AC-J17`。🔴 **其第二子句（OJT 上傳端點之閘門不得改為 `'write'`）已隨 `OQ-E11-11`→A（端點直接移除回 404）失去標的 ⇒ 一併作廢**。**原條文逐字保留於上。**

### OJT 進度管理功能列 delta（🔴 2026-08-27 E11；權威＝[F042](F042-ojt-progress-management.md)） {#ojt-progress-function-key-delta}

> **本節之性質**：本矩陣自 `OQ-E07-04`（文件變更歷程）以來未再新增功能列，且 2026-08-20 之 `AC-N36` **明文鎖定「不新增功能列」**。
> [F042](F042-ojt-progress-management.md) 新增一個**獨立側選單項與獨立端點群**，天生需要一列——**這正是 `AC-N36` 當初刻意避免之事**。
> 🔴 **本節之首要責任不是新增那一列，而是明文說明「為什麼這次的例外成立」**，使日後讀者不會把它讀成一次靜默的回歸。
> **本 delta 之 AC 編號採 `AC-J#`**（配發表見 [F042 §庚](F042-ojt-progress-management.md#reversal-table)；🔴 **禁止續編 `AC-N77` 以後**）。
> ✅ **2026-08-28 人類閘門：`OQ-E11-05`→**A**（**系統管理員 `唯讀`｜ICSOP管理員 `CRUD`｜主管 `受限CRUD`｜部門窗口 `受限CRUD`｜一般使用者 `無`**；**不擴充 `PermissionAction` 值域**，刪除限 ICSOPAdmin **於端點層把關**）。本節之格值已定。
> 🔴 **本裁決另打破一項本節原未涵蓋之既有鎖定**：2026-08-25 RA delta ③ 之「新值 `受限CRUD` **僅用於「角色指派」列**」自此**為假**——本列為其**第二處消費**。見 `AC-J16` ⚠ 段。
> 📌 **逐條反轉之單一真相來源＝[F042 §既有行為反轉總表](F042-ojt-progress-management.md#reversal-table) 丁節**；本節為其落點，不得與之分歧。

- **AC-J16**（🔴 新增獨立功能列「OJT 進度管理」——`OQ-E11-05`→**A** 定值）：Given [F042](F042-ojt-progress-management.md) 實作完成, When 逐格取 `FUNCTION_MATRIX` 之值, Then 功能鍵集合**新增恰一個**——列名逐字為 **`OJT 進度管理`**（🔒 鎖定字串，見 [F042 §命名鎖定表](F042-ojt-progress-management.md)；常數建議 `FunctionKey.OJT_PROGRESS_MANAGEMENT`），置於既有 13 列之**後**，其五角色之格值逐字為——<br>
  | 功能 | 系統管理員 | ICSOP管理員 | 主管 | 部門窗口 | 一般使用者 |
  |------|-----------|-------------|------|----------|-----------|
  | **OJT 進度管理** 🔵 | **唯讀** | **CRUD** | **受限CRUD** | **受限CRUD** | **無** |

  🔒 **不擴充 `PermissionAction` 值域**（裁決明文）：`受限CRUD` 為 2026-08-25 RA delta 已引入之**既有第四值**，本列直接沿用；其「受限」之具體範圍＝**僅可新增場次、不可刪除**（[F042](F042-ojt-progress-management.md) `AC-05`／`AC-19`）。<br>🔴 **「不可刪除」由端點層把關，不由矩陣表達**：`canPerform(role, OJT_PROGRESS_MANAGEMENT, 'write')` 對 `受限CRUD` 為**允許**，**擋不住刪除** ⇒ 刪除端點內部**必須**另有一道 `role === 'ICSOPAdmin'` 檢查（[F042](F042-ojt-progress-management.md) `AC-19`）。⚠ **這是本 delta 最易「以為矩陣擋住了」之處**——**測試必須以 `Supervisor`／`DeptContact` 實際呼叫刪除端點斷言 403**，不得只驗矩陣格值。<br>⚠ **🔴 本裁決打破 2026-08-25 RA delta ③ 之「僅用於角色指派列」（spec-writer 於回填時發現，原盤點未涵蓋）**：`受限CRUD` 自此有**兩處消費**，且**兩處之「受限」語意互不相同**——「角色指派」列＝**不得指派 `SysAdmin`／`ICSOPAdmin`**（值域限制，見 [F003](F003-account-role-management.md) `AC-R#`）；本列＝**僅可新增、不可刪除**（動作限制）。<br>　🔴 **明文禁止合併為單一語意**：`受限CRUD` 是一個「**此處另有細則**」的標記，**不是**一組固定的權限集合；任何試圖把兩處之「受限」抽成共用判定式之重構，都會同時弄錯兩處。<br>　📌 **RA delta ③ 之原句逐字保留於上方 Description 區塊**，本條僅登記其「僅用於」子句失效。<br>🔒 **側選單相應新增恰一項**，其可見性依本列格值（`無` ⇒ 一般使用者不呈現）。
- **AC-J17**（🔴 **`AC-N36` 之例外為何成立**——本節之核心，不得省略）：Given 讀者比對 `AC-N36`（「不新增功能列」）與 `AC-J16`（新增一列）, When 判斷兩者是否矛盾, Then 依下列**明文區辨**——<br>　① **`AC-N36` 所禁止的是「為了讓一個欄位層破例通過而動功能矩陣」**：2026-08-20 之開放屬**欄位層**（[F026](F026-role-field-matrix.md)），其端點沿用既有 `ICSOP 文件管理` read 閘門，**本即有一列可掛靠**；當時若動矩陣，兩種改法皆為回歸（改閘門為 `'write'` ⇒ 兩角色連 OJT 都上傳不了；改矩陣格值為 CRUD ⇒ 整個文件管理模組對兩角色開放寫入）。<br>　② **[F042](F042-ojt-progress-management.md) 新增的是一個獨立功能**：獨立側選單項、獨立端點群、獨立於 `ICSOP 文件管理` 之權限語意（例：主管對 `ICSOP 文件管理` 為 `唯讀`，卻對本功能可寫）——**它沒有任何既有功能鍵可以掛靠**。若硬掛在 `ICSOP 文件管理` 之下，就會重演 ① 所述之兩種回歸。<br>　③ ⇒ **兩者是不同的事：`AC-N36` 禁止的是「不該新增時新增」，本 delta 是「非新增不可」。**<br>🔴 **可測形狀**：斷言 `FUNCTION_MATRIX` 之功能鍵集合**恰新增 1 個**、且新增者**恰為** `OJT 進度管理`——**不得**出現任何名為「OJT 上傳」「OJT 附件」之列（那才是 `AC-N36` 真正禁止的東西）。<br>⚠ **本條之存在是為了讓「打破鎖定」成為一個有紀錄、有理由、可覆核的決定**，而非讓 `AC-N36` 在下一輪被誰靜默刪掉。
- **AC-J18**（🔒 既有 13 列之回歸鎖定）：Given [F042](F042-ojt-progress-management.md) 實作完成, When 逐格取 `FUNCTION_MATRIX` 之**既有 13 個功能鍵** × 5 種角色（共 65 格）之值, Then **與本 delta 導入前逐格相同**（**新列為第 14 列，總格數 65 → 70**）——特別是 **`ICSOP 文件管理` 列對主管／部門窗口仍為 `唯讀`**（**不得**因本功能對兩者可寫而順手一併放寬）；角色種類仍為固定 **5** 種、**不新增角色欄**。<br>🔴 **本條為本 delta 之「鬆一片牆」偵測器**：新增一列時最可能的失誤，是順手把相鄰的 `ICSOP 文件管理` 列一起改成 CRUD——那正是 [F026](F026-role-field-matrix.md) `AC-N24`／`AC-J9` 所要防止的同一個形狀，只是發生在功能層。<br>🔒 **`AC-U1`（F041 子分類不影響功能矩陣）之原始目的完全不變**：本 delta 之新增列與 `userSubtype` 無關，權限解析函式仍**不接受**子分類參數（`AC-U2` 逐字不變）；`AC-U1` 之「鍵集合亦未增減」子句**已因本 delta 失效**，就地改讀為「**除本 delta 新增之 `OJT 進度管理` 一列外**，鍵集合未增減」。<br>📌 **`AC-U4`（權限矩陣頁之 F041 註記橫幅）不受影響**，其逐字文案不變；惟 `prototypes/18-permission-matrix.html` 之功能矩陣需新增一列（**待棒 4**）。

### 業務/功能類別管理功能列 delta（🟢 **APPROVED（2026-09-02 人類閘門通過）**，2026-09-02；權威＝[F043](F043-business-function-category.md)） {#business-category-function-key-delta}

> 🔵 **本節為 DRAFT，未經人類閘門核准前不得實作。**
> **使用者原文**：「此功能開放給 ICSOP 管理員 CRUD，系統管理員 / 主管 唯讀。」
> **本 delta 之 AC 編號採 `AC-B#`**（`AC-B28`～`AC-B29`；同批之其餘條文落於 [F017](F017-backend-document-list.md#business-category-column-delta) `AC-B1`～`AC-B11` 與 [F019](F019-public-list-browsing.md#business-category-browse-delta) `AC-B12`～`AC-B27`）。
> 🟢 **2026-09-02 同日第二輪人類裁決（4 項）已落章**：① **主管權限之刻意不對稱確認為本意**（`AC-B29` 之成對斷言維持原樣）；② 前台樹狀圖不提供 PDF 下載／列印（[F043](F043-business-function-category.md) `AC-53`）；③ **結構變更歷程＝「文件變更歷程」頁第三個 tab**（標籤逐字 `業務/功能類別樹狀圖`），**權限沿用本矩陣既有之 `文件變更歷程` 列 ⇒ 主管看不到**（[F043](F043-business-function-category.md) `AC-54`，`OQ-B-02` 結案）；④ **[F026](F026-role-field-matrix.md) 不新增列、維持 20 列逐格不變**（`OQ-B-08` 結案）。🔒 **本矩陣之既有 14 列一格未動**；本節仍只新增第 15 列。
> 📌 **本節之例外性質**：`AC-N36`「不新增功能列」之鎖定已於 2026-08-27 由 [F042](F042-ojt-progress-management.md) `AC-J16`／`AC-J17` **明文打破並記錄理由**；本 delta 為**同一類例外之第二次**——[F043](F043-business-function-category.md) 為一個**獨立側選單項＋獨立端點群＋獨立權限語意**之新功能（例：主管對 `循環管理（DAG）` 為 `無`，卻對本功能為 `唯讀`），**沒有任何既有功能鍵可以掛靠**。`AC-J17` ③ 之區辨（「`AC-N36` 禁止的是**不該新增時新增**」）逐字適用於本節，不另行重述。

- **AC-B28**（🔴 新增獨立功能列「業務/功能類別管理」）：Given [F043](F043-business-function-category.md) 實作完成, When 逐格取 `FUNCTION_MATRIX` 之值, Then 功能鍵集合**新增恰一個**——列名逐字為 **`業務/功能類別管理`**（🔒 鎖定字串，**半形斜線 `/`、前後無空白**；常數建議 `FunctionKey.BUSINESS_CATEGORY_MANAGEMENT`），置於既有 14 列之**後**（即第 15 列），其五角色之格值逐字為——

  | 功能 | 系統管理員 | ICSOP管理員 | 主管 | 部門窗口 | 一般使用者 |
  |------|-----------|-------------|------|----------|-----------|
  | **業務/功能類別管理** 🔵 | **唯讀** | **CRUD** | **唯讀** | **無** | **無** |

  🔒 **值域不擴充**：三個格值皆為既有之 `唯讀`／`CRUD`／`無`，**不引入** `受限CRUD`——本功能無「可新增不可刪除」之類的細則，全部寫入動作對 ICSOPAdmin 一律允許、對其餘四角色一律拒絕（[F043](F043-business-function-category.md) `AC-45`）。<br>🔒 **側選單相應新增恰一項**，🔴 **置於「循環管理」之下方**（使用者原文「在循環管理**下方**新增」），其可見性依本列格值（`無` ⇒ 部門窗口與一般使用者不呈現）。<br>🔴 **前台不受本列限制**：部門窗口與一般使用者雖對本列為 `無`，其**前台**之業務/功能類別樹狀圖瀏覽仍由「前台瀏覽」列（5 種角色皆為「可」）承接——**兩者是不同維度，不得混為一談**（[F043](F043-business-function-category.md) `AC-47` 之成對斷言：`/public/business-categories/*` 得 200、`/admin/business-categories/*` 得 403）。
- **AC-B29**（🔒 既有 14 列之回歸鎖定 ＋ 🔴 **與「循環管理」列之刻意不對稱**）：Given [F043](F043-business-function-category.md) 實作完成, When 逐格取 `FUNCTION_MATRIX` 之**既有 14 個功能鍵** × 5 種角色（共 70 格）之值, Then **與本 delta 導入前逐格相同**（**新列為第 15 列，總格數 70 → 75**）；角色種類仍為固定 **5** 種、**不新增角色欄**。
  - 🔴 **本 delta 之核心不對稱斷言（不得省略）**：`FUNCTION_MATRIX['循環管理（DAG）'].主管 === '無'` **且** `FUNCTION_MATRIX['業務/功能類別管理'].主管 === '唯讀'`。<br>　**兩者刻意不同、非疏漏**——**同一日（2026-09-02）的兩項人類裁決**：一項把主管**移出**循環管理（見本檔頂部 2026-09-02 delta），另一項把主管**放進**業務/功能類別管理（本節）。<br>　🟢 **2026-09-02 人類裁決確認**：spec-writer 曾提請人類覆核此不對稱是否為本意，**使用者本人已明確確認為本意**（[F043](F043-business-function-category.md) 決 5）；本斷言**維持原樣、不放寬**。<br>　⚠ **日後最可能發生的「整理」，是把這兩列的主管欄對齊成同一個值——那會同時違反兩條人類裁決。** 本條之斷言必須**明確比對這兩格**，使任一方被對齊時立即紅燈；🔴 **不得**以「兩個 DAG 功能的權限應該一樣」為由重構。
  - 🟢 **主管之另一處刻意落差（決 7，2026-09-02，`OQ-B-02` → 甲案）**：主管對 `業務/功能類別管理` 為 **`唯讀`**，但對其**結構變更歷程**為 **`無`**——該歷程住在「文件變更歷程」頁之**第三個 tab**（標籤逐字 `業務/功能類別樹狀圖`），其閘門為**本矩陣既有之 `文件變更歷程` 列**（SysAdmin `唯讀`／ICSOPAdmin `唯讀`／**其餘 `無`**）⇒ **主管開啟該頁整頁 403，看不到任何一個 tab**。<br>　🔴 **此落差刻意、非漏配**（最容易被當成 bug 修掉之處）：變更歷程之閘門屬於**它所在的頁面**，不屬於**它所描述的對象**——與 [F038](F038-lifecycle-tree-change-history.md) 循環樹狀圖變更歷程之既有處置**完全同構**（`OQ-E07-04`）。被否決之乙案會讓主管進到一個只有第三個 tab 可看、前兩個 tab 皆 403 的半殘頁面。<br>　🔒 **`文件變更歷程` 列一格未動**；逐條可驗收之條文＝[F043](F043-business-function-category.md) `AC-54`。
  - 🔒 **`AC-U1`／`AC-U2`（F041 子分類不影響功能矩陣）之原始目的完全不變**：本 delta 之新增列與 `userSubtype` 無關，權限解析函式仍**不接受**子分類參數。`AC-U1` 之「鍵集合亦未增減」子句已先後因 [F042](F042-ojt-progress-management.md) `AC-J18` 與本條失效，就地改讀為「**除 `OJT 進度管理` 與 `業務/功能類別管理` 兩列外**，鍵集合未增減」。**原條文逐字保留。**
  - 🔒 **`AC-J16`／`AC-J18`（OJT 進度管理列）不受影響**：其列名、格值與 `受限CRUD` 之兩處消費語意**一格未動**；本 delta **不新增** `受限CRUD` 之第三處消費。
  - 📌 **`AC-U4`（權限矩陣頁之 F041 註記橫幅）不受影響**，其逐字文案不變；惟 `prototypes/18-permission-matrix.html` 之功能矩陣需新增一列（**待 ui-ux-designer**，本輪不建檔）。

## Error Scenarios
- 越權/範圍限縮：見 [error-handling.md#permission](../error-handling.md#permission)。
- **業務子分類之前台使用部門限縮**（🟢 APPROVED）：屬**資料列層級過濾**，非本矩陣之功能層級授權；拒絕回 404 `DOCUMENT_NOT_FOUND`（非 403 `PERMISSION_DENIED`），見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction) 與 [F041](F041-user-subtype-business-scope.md)。

## Related
- Data: [ROLE](../data-model.md#role-entity), [ORG_UNIT](../data-model.md#orgunit-entity)
- Depends on: [F003](F003-account-role-management.md); Blocks: 全系統寫入型操作
- Related: [F026 角色×欄位矩陣](F026-role-field-matrix.md)；獨立功能「文件變更歷程」見 [F037](F037-document-change-history.md)／[F038](F038-lifecycle-tree-change-history.md)；功能列「附錄管理」之行為規格見 [F039](F039-appendix-management.md)
- **2026-09-02 人類裁決（業務/功能類別管理，🔵 DRAFT）**：新增第 15 列「業務/功能類別管理」＝`唯讀`｜`CRUD`｜`唯讀`｜`無`｜`無`，行為規格見 [F043](F043-business-function-category.md)；落點＝[§業務/功能類別管理功能列 delta](#business-category-function-key-delta)（`AC-B28`／`AC-B29`）。🔴 **本列之主管欄與「循環管理（DAG）」列之主管欄刻意不同**（同日兩項裁決，一移出一放進），`AC-B29` 之成對斷言為其回歸鎖定。🔒 **[F026](F026-role-field-matrix.md) 不新增列**（理由見 [F043](F043-business-function-category.md) `AC-51`／`OQ-B-08`）。
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（本矩陣不變之理由與 `AC-U1`～`AC-U3`；🟢 APPROVED 2026-08-11，OQ-E08-04 定案為選項 B）
- **2026-08-20 使用者裁決（D9 delta）**：`OQ-D9-19`～`OQ-D9-24`（OJT 上傳開放主管／部門窗口）**不影響本矩陣**，見 [§D9 delta：功能矩陣不變之回歸鎖定](#d9-function-matrix-lock) `AC-N36`；行為權威＝[F016](F016-pdf-ojt-attachment.md#ojt-role-open-delta)、欄位矩陣權威＝[F026](F026-role-field-matrix.md#ojt-write-exception-delta)。
- 定案: OQ-E08-01（SysAdmin 對文件為唯讀、無寫入權）；OQ-E08-03（主管循環管理全公司唯讀、雙入口一致——本次已將矩陣主管「循環管理」欄由「唯讀（本部門相關）」改為「唯讀」）；OQ-E07-04（新增獨立功能列「文件變更歷程」＝僅 SysAdmin／ICSOPAdmin 全公司唯讀，其餘無）。OQ: OQ-E08-02（矩陣其餘部分審核）。
