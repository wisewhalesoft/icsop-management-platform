# F004: 組織資料同步（每日排程＋手動觸發）
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-20
Epic/Story: E02 / US-010, US-011

> 合併理由：排程與手動觸發共用同一同步服務核心，僅觸發來源不同（`trigger_type`）。
> 來源之權威定義見 [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)（2026-07-20 dev 環境唯讀實測定案；資料已遮罩，值層級統計待正式環境覆核）。

> **🔴 2026-08-25 additive delta（APPROVED，人類閘門通過）——同步新增「角色推導」階段。**
> 權威＝[stories/2026-08-25-role-automation-delta.md](../../stories/2026-08-25-role-automation-delta.md)、[open-questions §RA](../open-questions.md#ra-2026-08-25)。**本 delta 之 AC 編號採 `AC-R#`**。
> **既有之組織／帳號／職稱同步行為一律不變**；角色推導為**同一交易內、緊接於帳號 upsert 之後**的新階段（裁定 `Q4.4`：隨每日 02:00 排程一起跑）。
>
> **兩條推導規則**：
> ① **業務子分類** — 職稱名稱含「業務」二字 ⇒ `userSubtype='business'`，其餘 `'other'`（16 種職稱／699 人）。
>    以**執行時字串比對**落實（裁定 `Q4.6`），**不另存代碼對照表**；上游新增代碼由同一規則即時判定、無人工步驟（`Q4.2`）。
> ② **主管角色** — `ACCOUNT.employeeNo` 命中任一 active `ORG_UNIT.managerEmpNo`，且 `tier ≠ 'SUBSECTION'`（排除「課」層），
>    且 `orgCode ∉ {A2000, A5000, A6000, A7000, A8000}`（AS 借調部，**以代碼列舉、不得用名稱含「借調」比對**）⇒ `Supervisor`（150 個部門）。
>
> **三條寫入約束**：
> - `roleCode` **只升不降**（`Q1.3`）：降級一律轉為告警待審、不自動執行（沿用既有 `org-change-alert` 之 pending／resolved 流程）。
> - `userSubtype` **不適用**「只升不降」（`Q1.3b`），一律以推導結果直接寫入。🔴 **兩者規則不同，實作與測試必須分離。**
> - 僅覆寫 [`ACCOUNT.roleSource='derived'`](../data-model.md#account-role-source) 之列（`Q1.2`）；`'manual'` 之列永不被同步覆寫。
>
> **🔴 閾值之前提條件**：角色變更量之中止閾值比照既有 5%（`Q4.3`），且**必須把 `userSubtype` 變更也計入**，不得只算 `roleCode`。
> 這是 ① 採「執行時字串比對而不存對照表」能夠成立的**唯一防線**——上游若將「業務專員」改名為「營業專員」，288 人會靜默失去限縮，
> 該變更量佔 1,368 之 21%，唯有閾值計入 `userSubtype` 時才會觸發中止而被發現。**此條未落 AC 則保護不存在。**
> 首次全量套用需變更 699 人、必然撞閾值，以**環境變數一次性放寬**（`OQ-RA-01`，比照既有消失閾值覆寫慣例），跑完即移除。
> ⚠ **另有小母體絕對下限 `ROLE_CHANGE_MIN_ABSOLUTE = 10`**（`OQ-RA-04`）：變更數 ≤10 一律放行。
> 無此下限則 AE（在職 16 人，5%＝0.8）之推導**永遠不會套用**——任何一筆變更都會超標。
> 實際生效門檻：AE／AJ／AD＝10、AS＝52。

## Description
每日排程並可手動立即從上游人資系統之唯讀 view 同步組織架構（公司＞本部＞部＞處/室＞課，共 **5 層**）與人員/職級資料，作為帳號、權限、文件當責、前台排序之資料基礎。同步冪等、具交易性、有互斥鎖，並分類新增/更新/離職停用三類異動。

## 來源物件與存取方式（契約 §1–§3）

| 用途 | 來源 view | 說明 |
|---|---|---|
| 組織階層 | `VW_DEPT_SQL` | AS 有效部門 114 筆；`isActive` ⇔ `CLOSE_DATE > GETDATE()`（哨兵 `9999-12-31`） |
| 帳號／在職狀態 | `VW_HPMUSER` | **必須逐欄白名單（12 欄）**，絕不得 `SELECT *`；`USERPW`／`DEFAULTPW` 永不讀取、永不落地、永不記錄 |
| 職稱（資位）對照 | `VW_PERSONAL_JOB` | **2026-08-12 新增**。僅取 `COMPID`／`JTITLE_ID`／`JTITLE_NM` 三欄之 DISTINCT → `JOB_TITLE` 對照主檔，供帳號清單「**資位**」欄；🔴 `ID_NUMBER`（身分證字號）等個資欄永不讀取。契約 §5.4.1 |
| 職位對照 | `VW_JOB_FUN` | **2026-08-31 新增**。取 `COMPID`／`CODE`／`DESC_CHI` 三欄（四家共 73 列，逐代碼一列故不需 DISTINCT）→ `JOB_POSITION` 對照主檔，供帳號清單「**職位**」欄。🔴 解析須 `(COMPID, CODE)` 精確、**禁止跨公司 fallback**（同碼跨公司語意可相反）。契約 §5.4.2 |
| 公司主檔 | `VW_HRCOMF` | `companyName` 取 `COMPFULLNM`（全稱） |

- 存取一律以 4 段式命名 `[APYHFC23].[HR2].[dbo].[<view>]` 經 linked server 進行。
- linked server 之 `is_collation_compatible = False`，跨 server 查詢無法有效下推述詞。**所有彙總／過濾一律以 `OPENQUERY` 下推至對端執行**，不得於本地端拉回整表比對（契約 §1）。
- 欄位對應見契約 §5.1／§5.2／§5.3。
- **主鍵為 `(COMPID, USERID)`**；`EMPNO` 非唯一（實測 18 組重複），不得作為主鍵（契約 §7.2）。

## 組織階層推導規則（契約 §3.5，權威）

- **層級一律由 5 碼部門代碼之前綴決定，每一碼代表一層**：`00000`＝Root、`A0000`＝本部、`AN000`＝部、`ANA00`＝處/室、其餘（第 4 碼有值）＝課。
- 上層推導：部層 ＝ `LEFT(CODE,2)+'000'`；本部 ＝ `LEFT(CODE,1)+'0000'`。
- 🔴 **明確禁用 `P_DEPTID`（`CAPITAL`）／`TOP_DEPTID`／`S_DEPTID`（`DEPARTMENT`）作為階層依據**：實測三者所指部門散布於不同層級，且 `P_DEPTID` 會跳過「部」層導致遞迴僅得 3 層、遺失真實層級。
- 同步時應一併寫入預先計算之 `codePrefix`（＝去除代碼尾端連續 `0` 後之字串），供 F019／F026／F033 之子樹前綴比對使用。

## Preconditions
- 上游人資 view 可經 linked server `[APYHFC23].[HR2]` 唯讀連線（與應用 MSSQL 為不同連線），連線參數以環境變數注入、不得寫死。
- 手動觸發者為系統管理員（F025）。

## Main Flow
1. 觸發（scheduled 或 manual）→ 取得同步互斥鎖；已有進行中則拒絕。
2. 建立 `SYNC_RUN`（status=running）。
3. **組織階層：以 `OPENQUERY` 全量取回 `VW_DEPT_SQL`（僅 114 筆，成本極低且免除階層增量的正確性風險）**，依代碼前綴推導 `tier`／`parentCode`／`codePrefix`。
4. **帳號／人員：以 `OPENQUERY` 依 `VW_HPMUSER.MTDT > <上次同步時間>` 增量取回白名單 12 欄**；公司主檔 `VW_HRCOMF` 全量取回。
5. **消失筆數閾值檢查**（見 Edge Cases）：計算「上次存在、本次消失」之在職帳號比例，超過閾值即中止本次同步。
6. 開啟資料庫交易，逐筆比對來源與本地，分類：新增 / 更新 / 離職停用（在職判定依 `EMPSTS='A'`，見 F005）。
7. 冪等套用異動；離職/停用類型觸發 F005；當責相關異動與「在職者掛已關閉部門」產生 F006 提示。
8. 提交交易 → 更新 `SYNC_RUN`（status=success、異動筆數、本次 `MTDT` 水位）。
9. 手動觸發時，後台頁面自動更新顯示結果（輪詢/WebSocket，無需手動重新整理）。

## Alternative Flows
- 無異動：仍記一筆「success、異動筆數 0」，不對資料表產生實際寫入。
- 服務中途重啟：下次執行正確接續，不重複/不遺漏（冪等；來源 view 皆為 `(NOLOCK)`，存在 dirty read 可能，故重跑必須冪等）。
- 首次同步或 `MTDT` 水位遺失：帳號改為全量取回，其餘流程不變。

## Edge Cases
- **消失筆數閾值保護（防大規模誤停用）**：單次同步若「上次存在、本次消失」之在職帳號比例超過閾值（**10%**；🔵 2026-08-31 由草案 5% 調整，理由見下方 AC 與契約 §7.3），**立即中止同步並告警系統管理員，不執行任何停用**，`SYNC_RUN` 記為 `failed`＋原因 `DISAPPEARED_RATIO_EXCEEDED`。理由：上游 `VW_PERSONNEL_SQL` 之 `INNER JOIN`（`HREMPMF` ⨝ `HRDEPTMF`）會在員工 `DEPTID` 於部門主檔查無時**靜默吞掉整筆**，人員憑空消失不等於離職（契約 §3.2／§7.3）。
- **孤兒部門**（`VW_HPMUSER.DEPTID` 於部門主檔查無）：記錄警告並保留該帳號（不停用、不中止）。實測 AS 孤兒率 **0.0%**，但 AD 22.1%／AE 65.7%／AJ 84.9%，**多公司擴充前必須先處理**（契約 §7.3、§10.1）。
- 髒資料（型別不符）：中止該筆寫入並記警告，不影響其他正常筆數。
- 手動與排程並發：互斥鎖確保僅一個執行。
- 上游 `VW_HPMUSER` 定義為 `SELECT *`，base table 增欄時 view 會無聲變動：同步作業須對欄位集合做防禦性檢查，發現非預期欄位集合時記警告（契約 §3.4）。

## 同步範圍（契約 §10）
- **本輪僅同步 `COMPID = 'AS'`（和潤企業）**：AS 實測在職 1,114 人、有效部門 114、孤兒率 0.0%，資料品質具備納入條件。
- `ORG_UNIT`／`ACCOUNT`／浮水印之資料模型**保留公司維度（`COMPID`）**，日後上游補齊 AD／AJ 之公司主檔與部門主檔後可直接開啟，無需 schema 變更。

## Postconditions
- 本地組織/人員資料反映最新來源；每次執行皆有可追溯 `SYNC_RUN`。
- 失敗時既有資料與同步前完全一致（逐筆比對無變化）。

## Acceptance Criteria
- Given 排程啟用且來源可連線, When 排程時間到, Then 讀取並反映異動，產出含開始/結束/結果/異動筆數之紀錄。
- Given 來源無變化, When 同步, Then 記「success、異動筆數 0」，不產生實際寫入。
- Given 來源逾時/連線失敗/格式異常, When 同步, Then 中止、保留既有資料、記 `failed`＋錯誤訊息。
- Given 來源有新增/更新/離職異動, When 同步, Then 正確分類三類異動，離職類觸發 F005。
- Given 無其他同步進行中, When 管理員點「立即同步」, Then 啟動同步並顯示「執行中」。
- Given 已有同步進行中, When 再次點擊, Then 回 `SYNC_IN_PROGRESS`，不啟動第二個程序。
- Given 非系統管理員, When 呼叫手動同步 API, Then 回 403（F025）。
- Given 部門代碼為 `JAC00`, When 同步推導階層, Then `tier`＝處/室、`parentCode`＝`JA000`（部層）、`codePrefix`＝`JAC`，且推導不參考 `P_DEPTID`／`TOP_DEPTID`／`S_DEPTID`。
- Given 部門代碼為 `JCHA0`（第 4 碼有值）, When 同步推導階層, Then `tier`＝課，`ORG_UNIT` 完整保存 5 層不壓縮。
- Given 上次同步在職帳號 1,000 筆, When 本次同步有 120 筆（12% > 10%）在職帳號自來源消失, Then 中止同步、不停用任何帳號、`SYNC_RUN` 記 `failed` 並告警系統管理員。
- Given 本次同步有 20 筆（2% ≤ 10%）在職帳號消失, When 同步, Then 正常進行後續離職判定流程。
- 🔵 **閾值為何是 10%（2026-08-31 使用者裁定）**：AS 有 **74 筆永久性「消失」帳號**（16 轉調他家且新公司帳號已啟用／6 他家亦離職／52 為 v1.0 `VW_HPMUSER` 污染殘留之 RPA・外部事務所・保留號・測試帳號，全部從未登入）。依上方「絕不以來源消失逕行判定為離職」，同步**不會**停用它們，故 AS 之消失比例恆為 6.6%（74/1124）——5% 閾值使 AS 每次同步必然中止（2026-08-24 起連續失敗 11 次、7 天未同步），「每次都擋」等同於沒有護欄。<br>⚠ **代價**：AS 之觸發點為 112 人，其中 74 個名額已被上述幽靈帳號長期佔用，真實上游異常需再多消失 **39 人**才會被擋下。那 74 筆若日後清理，應一併考慮把閾值調回較嚴格水準。
- Given 帳號之 `DEPTID` 於 `VW_DEPT_SQL` 查無（孤兒）, When 同步, Then 保留該帳號、記錄警告，不停用亦不中止同步。
- Given 同步查詢執行, When 對上游進行彙總或過濾, Then 該述詞以 `OPENQUERY` 下推至對端執行（不得整表拉回本地端比對）。
- Given 同步讀取 `VW_HPMUSER`, When 組裝查詢, Then 僅選取白名單 12 欄，`USERPW`／`DEFAULTPW` 不出現於查詢、回應或任何日誌。
- Given 同步讀取 `VW_PERSONAL_JOB`, When 組裝查詢, Then 僅選取 `COMPID`／`JTITLE_ID`／`JTITLE_NM` 三欄，`ID_NUMBER` 等個資欄不出現於查詢、回應或任何日誌。
- Given 職稱（資位）對照主檔取回失敗, When 同步進行, Then **不使本次同步失敗**——僅記錄警告，帳號／組織異動照常套用（資位為顯示欄位，不涉授權或身分）。
- Given 上游回傳同一 `(COMPID, JTITLE_ID)` 之多列, When 規劃對照異動, Then 去重僅取先到者（避免同鍵雙插違反唯一索引，致整筆交易回滾）。
- Given 同步讀取 `VW_JOB_FUN`, When 組裝查詢, Then 僅選取 `COMPID`／`CODE`／`DESC_CHI` 三欄，**不加 `END_DT` 過濾**（view 已內建且無該欄），亦不以 `COMPID` 過濾（全量 73 列）。
- Given 職位對照主檔取回失敗, When 同步進行, Then **不使本次同步失敗**——處置與資位對照完全相同（僅記錄警告）。
- Given 上游回傳同一 `(COMPID, CODE)` 之多列, When 規劃職位對照異動, Then 去重僅取先到者（理由同資位；實測該鍵唯一，去重為防禦而非現況需要）。
- Given 一次同步同時包含新職位對照列與引用該代碼之新帳號, When 於單一交易套用, Then 對照列**先於**帳號寫入，使同批新帳號之 `jobPositionCode` 當次即可解析出名稱。
- Given 新增一個來自上游之帳號欄位（既有列為 NULL）, When 僅執行增量同步, Then 既有帳號**不會**被回填——增量只取 `MTDT > watermark` 之帳號，既有帳號不在結果中，`classifyAccount` 的新欄位比對無從觸發。**必須另行執行一次全量重同步**（`SYNC_FULL_RESYNC=1 npm run sync:once`）。
- Given 執行全量重同步, When 完成, Then 水位照常依來源 `MTDT` 最大值推進，後續排程自動回到增量；且再次執行應為 0 異動（冪等）。
- Given 組織階層同步, When 執行, Then `VW_DEPT_SQL` 為全量取回（非依 `MTDT` 增量）。

## Error Scenarios
- 來源不可用/格式錯誤/互斥/髒資料/重試通知：見 [error-handling.md#sync](../error-handling.md#sync)、[NFR-006](../nfr.md#integration)。
- 消失筆數超過閾值（`DISAPPEARED_RATIO_EXCEEDED`）：中止同步、不停用、告警系統管理員，見 [error-handling.md#sync](../error-handling.md#sync)。

#### 🔵 2026-08-31 delta：角色推導被跳過之呈現與一次性放行（`AC-RD1`～`AC-RD5`，使用者裁定）

> **背景**：角色變更閾值（5%，`Q4.3`）被觸發時，同步本身仍為 **success**，`stats.roleDerivationSkipped`
> 只存在於**觸發當下**之 `SyncResult`。但常態觸發是每日 02:00 排程——跳過發生時沒有任何人在看畫面，
> 隔天管理員看到的只有一列綠色的「成功」。實測 AS 602/1124（53.6%）被靜默丟棄，畫面完全無感，
> 且唯一的放行手段是 CLI 環境變數（`SYNC_ROLE_CHANGE_THRESHOLD`），管理員無從自助。

- **AC-RD1（事實必須落地）**：Given 任一次同步之角色推導因變更量超過閾值而整批未套用, When 該次
  `SYNC_RUN` 收尾, Then `roleDerivationSkipped=true`、`roleChangeCount`（分子＝會被寫入之角色/子分類
  變更數）與 `roleDerivationBase`（分母＝納入推導之帳號數）一併落地（migration `1725148800000`）。
  ⚠ 兩個數字**不論是否跳過皆記錄**——畫面之二次確認需要實際筆數，只給比例不足以判斷。
- **AC-RD2（常駐呈現）**：Given 同步歷程之某列 `roleDerivationSkipped=true`, When 渲染,
  Then 該列下方**常駐**顯示「角色推導已跳過：N/M（X%）」與說明（不需展開、不論 status 為
  success），並明示「帳號與組織資料已同步成功，僅角色與子分類停在舊值」。
- **AC-RD3（一次性放行；僅系統管理員）**：Given 具「組織人員異動管理」write 之使用者（＝僅系統
  管理員）, When 於該列按「本次仍要套用」並於二次確認框確認, Then 以
  `POST /admin/org-sync/run { applyRoleDerivation: true, compid }` 重跑**該公司**並套用推導；
  Given ICSOPAdmin（唯讀）, Then 看得到 `AC-RD2` 之事實但**無按鈕**。本 delta **不新增 F025 功能鍵**。
- **AC-RD4（🔴 不得提供閾值輸入）**：Given 放行之請求契約, Then 僅接受布林 `applyRoleDerivation`，
  **不接受任何閾值數字**；呼叫端夾帶之閾值欄位一律忽略。理由：畫面若能填百分比，一次性放寬會退化為
  隨手填 100% 的常駐開關，而該閾值是「上游職稱改名致大量帳號靜默失去限縮」之**唯一偵測管道**
  （`Q4.6`）。Given 放行但未帶 `compid`, Then 回 **400 `VALIDATION_ERROR`**——不限縮公司會把無上限的
  窗口一併套到其餘公司。
- **AC-RD5（放行僅此一次）**：Given 放行成功之後的下一次同步（含每日排程）, When 變更量仍超過閾值,
  Then **再次跳過**——放行不改變閾值設定、不寫入任何持久化開關。放行當次之 `warnings` 須記錄操作者
  與實際比例，供事後追溯。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§1 拓撲與 `OPENQUERY`、§3.4 密碼欄禁讀、§3.5 階層前綴推導、§5 欄位對應、§7 同步策略與消失保護、§10 範圍決策）
- Diagram: [../diagrams/F004-org-sync.mmd](../diagrams/F004-org-sync.mmd)
- Data: [ORG_UNIT](../data-model.md#orgunit-entity), [PERSON](../data-model.md#person-entity), [SYNC_RUN](../data-model.md#syncrun-entity)
- Blocks: [F005](F005-auto-disable-departed.md), [F006](F006-org-change-alert-backend.md), [F014](F014-accountable-dept-chief.md), [F019](F019-public-list-browsing.md), [F026](F026-role-field-matrix.md), [F033](F033-permission-aware-retrieval.md)
- 定案: OQ-E02-01（View schema → 見來源契約）, OQ-E02-02（排程 02:00 UTC+8、失敗 3 次遞增間隔重試）
- OQ: OQ-E02-05（通知管道）；消失筆數閾值已於 2026-08-31 依實際觀測由草案 5% 校準為 **10%**（契約 §7.3）
- OQ-RA-01（首次全量套用之閾值放寬）自 2026-08-31 起**不再只能走 CLI**：系統管理員可於「組織人員異動管理」自助放行（`AC-RD3`）。角色變更閾值本身**維持 5%、不得永久調高**（`Q4.6`）
