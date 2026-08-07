# F010: 建立 ICSOP 文件
Priority: P0-MVP | Status: 🟡 實作（建立端點＋F010 建立稽核事件 CREATE 逐欄位落地；單元綠；整合已寫未跑；見 implementation-logs/doc-changelog-impl.md）｜**循環子分類 delta：🟢 APPROVED（2026-08-07 人類閘門通過，含 4 項裁決）** | Last Updated: 2026-08-07
Epic/Story: E04 / US-030

> **2026-08-07 additive delta**：「所屬循環（循環別）」之選取改為**兩段式**（名稱 → 子分類）。規則權威＝[F040](F040-lifecycle-subcategory.md)；本檔僅加建立路徑之 AC delta，既有條款一律不變。

## Description
ICSOP 管理員建立新 ICSOP 文件並填寫欄位。**建立時必填僅 4 欄：所屬循環（循環別）、文件狀態、ICSOP 文件編號、文件名稱**；其餘欄位（制定公司/部門/室別、當責室長、使用部門、版次、公告日期、內容摘要、附件、連結點）為非必填，可留待日後以編輯（F011/F014）補齊。「所屬節點」不在表單設定，允許以「未指派節點」建立，稍後經節點抽屜（F009）指派。19 欄位權威定義見 [data-model.md](../data-model.md#document-entity)。UI 顯示標籤：文件編號＝「程序書編號」、文件名稱＝「程序書書名」、所屬循環＝「循環別」（實體名維持 ICSOP 文件）。

## Preconditions
- 操作者為 ICSOP 管理員（F026 欄位權限）。
- 已存在循環（F007）；組織/人員資料已同步（F004）供制定公司/制定部門/制定室別、當責室長、使用部門選單。

## Main Flow
1. 進入建立頁，先選「所屬循環（循環別）」（必填）→ 開放後續欄位並依循環自動帶入編號前綴。
2. 填寫其餘 3 項必填：ICSOP 文件編號、文件名稱、文件狀態（下拉 有效/失效/作廢，預設「有效」）。
3. 選填其餘（**非必填**）：制定組織（**由上而下**：制定公司 → 制定部門 → 制定室別，相依聯動）、當責室長-主要/次要、文件使用部門、版次（`{YY}'{NN}`，如 `26'01`）、公告日期、內容摘要、附件與連結點。
4. 系統產生系統 UUID（唯讀）。
5. 驗證 4 項必填與編號唯一性（F013）；未填之非必填欄位不阻擋建立。
6. 儲存文件；「所屬節點」為未指派狀態；未填公告日期者狀態於清單顯示為「進度中」。
7. 觸發稽核記錄（建立動作）。

## Alternative Flows
- 新增多位當責室長-次要：三者皆正確關聯（DOC_SECONDARY_CHIEF）。
- 制定三級**由上而下**聯動（組織階層＝公司 > 部 > 處/室）：先選制定公司 →「制定部門」僅顯示其下部門 →「制定室別」僅顯示其下室別；上層變更時清空下層已選值。

## Edge Cases
- 未指派節點建立：儲存成功，後台清單（F017）標示「未指派節點」，待節點抽屜完成指派。
- 是否允許「無附件」文件存在於有效狀態：見 OQ-E04-01a。

## Postconditions
- 文件存在、狀態為所選值（預設「有效」）、UUID 產生；未填公告日期者為「進度中」；可被 F009 節點抽屜選取掛載。

## Acceptance Criteria
- Given 填妥 4 項必填（循環別、文件狀態、編號、文件名稱）, When 送出, Then 建立成功、產生 UUID；未填之非必填欄位不阻擋建立。
- Given 未填 4 項必填之任一（循環別/文件狀態/編號/文件名稱）, When 送出, Then 阻擋並於對應欄位顯示錯誤（`DOCUMENT_REQUIRED_FIELD_MISSING`），不產生記錄。
- Given 建立時未填公告日期, When 送出, Then 允許建立；該文件於清單顯示為「進度中」（未公告），前台一般使用者不可見（F019）。
- Given 尚未於節點抽屜指派節點, When 建立, Then 允許以「所屬節點未指派」儲存並於清單標示。
- Given 輸入已存在編號, When 送出, Then 依 F013 阻擋並提示重複。
- Given 新增 3 位當責室長-次要, When 儲存, Then 三者皆正確關聯。

### 循環子分類 delta（🟢 APPROVED 2026-08-07；規則權威＝[F040](F040-lifecycle-subcategory.md)）

- **AC-S1**（**2026-08-07 人類閘門裁決 1 收斂**）：Given 所選循環名稱底下設有子分類（如「銷售及收款循環」有「消金」「企金」「子公司」三子分類）, When 於建立頁僅選定名稱、未選子分類即按送出, Then **前端**純函式 `resolveLifecycleSelection` 回 `{ ok: false, code: 'LIFECYCLE_SUBCATEGORY_REQUIRED' }` 並阻擋送出（不發出請求），**不產生任何文件記錄**。<br>⚠ **後端側之邊界**：兩段式選取純屬前端 UI 狀態，**API payload 之「所屬循環」恆僅 `lifecycleId` 一欄，本次不新增 `lifecycleName`**；若請求確實未帶 `lifecycleId`，後端回既有 400 `DOCUMENT_REQUIRED_FIELD_MISSING`（**既有行為不變更**），**非** `LIFECYCLE_SUBCATEGORY_REQUIRED`（見 [F040](F040-lifecycle-subcategory.md) AC-24）。
- **AC-S5**（後端 `LIFECYCLE_SUBCATEGORY_REQUIRED` 之唯一觸發）：Given 池違反 INV-2 而同時存在無子分類之「銷售及收款循環」與「銷售及收款循環（消金）」（過渡期髒資料）, When 建立 payload 帶前者之 `lifecycleId`, Then 後端回 400 `LIFECYCLE_SUBCATEGORY_REQUIRED`，不產生任何文件記錄（[F040](F040-lifecycle-subcategory.md) AC-25）。
- **AC-S2**：Given 所選循環名稱底下無任何子分類（僅一筆 `subcategory = null`）, When 僅選定名稱即送出（其餘 3 項必填已填）, Then 建立成功——**不要求**亦不呈現子分類層（向後相容，[F040](F040-lifecycle-subcategory.md) AC-23／AC-33）。
- **AC-S3**：Given 選定「銷售及收款循環」＋子分類「消金」, When 送出, Then 建立成功，文件之 `lifecycleId` 恰為「銷售及收款循環（消金）」該筆之 id；編號前綴仍為 `ICSOP-SRC-`——循環代碼**僅依名稱**推導，「消金」「企金」「子公司」三者代碼皆為 `SRC`（[F040](F040-lifecycle-subcategory.md) AC-28）。
- **AC-S4**（**2026-08-07 人類閘門裁決 4：消除單一扁平下拉之歧義**）：Given 池中有「銷售及收款循環（消金）」「（企金）」「（子公司）」, When 於建立頁展開「所屬循環」之**第一段（名稱）**選擇器, Then 「銷售及收款循環」僅呈現為**一個**選項（名稱層去重，不重複列出三次）；When 選定該名稱後展開**第二段（子分類）**選擇器, Then 呈現「消金」「企金」「子公司」**三個相異選項**，各選項之顯示字串為 `lifecycleDisplayName` 之輸出、選項值為各自 `lifecycleId`（**非** `name` 字串）。<br>※ 名稱底下無子分類者不呈現第二段（[F040](F040-lifecycle-subcategory.md) AC-23）；本 AC 所述「以 `lifecycleDisplayName` 顯示、值為 `lifecycleId`」之選項專指**第二段**，第一段之值僅為名稱字串、不送往後端。

## Error Scenarios
- 必填缺漏/編號重複：見 [error-handling.md#document](../error-handling.md#document)。
- 欄位權限：見 [error-handling.md#permission](../error-handling.md#permission)（F026）。
- **循環子分類未選定（2026-08-07）**：見 [error-handling.md#lifecycle-subcategory](../error-handling.md#lifecycle-subcategory)（`LIFECYCLE_SUBCATEGORY_REQUIRED`）。

## Related
- Data: [ICSOP_DOCUMENT（19 欄位）](../data-model.md#document-entity)
- **循環子分類規則權威**: [F040](F040-lifecycle-subcategory.md)（兩段式選取與選取有效性）
- Depends on: [F007](F007-lifecycle-pool-crud.md), [F004](F004-org-sync.md), [F025](F025-role-function-matrix.md)
- Blocks: [F009](F009-node-drawer-maintenance.md), [F011](F011-edit-with-comparison.md), [F013](F013-document-number-uniqueness.md), [F014](F014-accountable-dept-chief.md), [F016](F016-pdf-ojt-attachment.md)
- OQ: OQ-E04-01a（無附件有效文件）。定案: OQ-DATA-01（文件名稱／程序書書名為正式欄位，建立時填寫）。
