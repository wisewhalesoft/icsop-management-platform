---
type: test-design-feature
covers: [F018, F019, F026]
related_spec:
  - docs/specs/features/F018-usage-form-management.md
  - docs/specs/features/F019-public-list-browsing.md
  - docs/specs/features/F026-role-field-matrix.md
worktree: public-seams (feature/public-seams)
priority: P0-MVP（F019 全部；F026 子集）／P1（F018）
last_updated: 2026-07-24
status: draft
---

# public-seams 測試設計：DOC_USING_DEPT 消費端接線 + 使用表單自訂名稱

> ID 命名慣例：本文件所有新設計案例一律以 `TS-PS-` 開頭（PS = public-seams），與既有
> `docs/test-specs/features/F018-test.md`（`TS-F018-*`）、`F019-test.md`（`TS-F019-*`）之編號
> **不重疊、不覆寫**，僅以交叉引用註記取代/補強關係，避免兩份文件各自改一邊忘改另一邊。

## 0. 範圍聲明

### 0.1 本文件涵蓋
- **(A) F019** — `TypeOrmPublicDocumentStore` 真實 join `DOC_USING_DEPT`：置頂（pinning）與部門篩選之端到端資料路徑。
- **(B) F026** — 「使用部門子樹前綴判定」之共用純邏輯設計（與 F019 置頂共用同一 predicate）。
- **(C) F018** — 使用表單上傳之自訂名稱參數（`name`）。
- **(D) 前端** — `PublicListPage.tsx` vs `prototypes/03-public-list.html`、`UsageFormManagementPage.tsx` vs `prototypes/19-usage-form-management.html` 之置頂/篩選/命名 surface。
- **(E) 整合測試** — `backend/test/int/` 新增針對真實 `DOC_USING_DEPT` 之置頂/篩選查詢。

### 0.2 明確不重工（已由既有文件/測試覆蓋，本文件不重新設計）
- F019 之強制基底條件（已公告過濾）、關鍵字搜尋、循環/狀態篩選、分頁、RBAC、清除篩選、清單卡片基本欄位 —— 已由 `backend/src/public/public-list.spec.ts`、`public-documents.service.spec.ts`、`frontend/src/pages/PublicListPage.test.tsx` 覆蓋（對應 `docs/test-specs/features/F019-test.md` TS-F019-001~032，除本文件明確標註「取代/修正」者外，其餘沿用不動）。
- F018 之格式/大小驗證、覆蓋共用警示（`USAGE_FORM_OVERWRITE_SHARED`）、移除保護（`USAGE_FORM_IN_USE`）、RBAC 矩陣、下載稽核 —— 已由 `backend/src/usage-forms/usage-forms.service.spec.ts`、`frontend/src/pages/UsageFormManagementPage.test.tsx` 覆蓋（對應 `docs/test-specs/features/F018-test.md` TS-F018-001~030），除本文件明確標註者外不重工。
- F020 浮水印燒錄、F021 RWD 斷點、F026 欄位可寫/唯讀 RBAC 矩陣（欄位層 `FIELD_WRITE_FORBIDDEN`）—— out of scope，另檔。
- F033 RAG 檢索層權限過濾 —— out of scope（Phase 3，未實作）。

### 0.3 假設與定案依據
- 本輪組織模型僅涵蓋單一公司 `AS`（`ORG_UNIT.companyCode` 現況恆為 `'AS'`，全站既有慣例）；`DOC_USING_DEPT.orgCode`／`ACCOUNT.orgCode` 皆為 `varchar` 業務鍵、**無** DB 層 FK 約束至 `ORG_UNIT`（見 `1722556800000-doc-org-multivalue.ts` 第 44-57 行、`account.entity.ts` 第 30-31 行），故本文件之單元/整合測試可使用任意合法 5 碼 marker 代碼，不需預先存在對應 `ORG_UNIT` 列。
- `upstream-person-org-source.md` 明列子樹比對「必須 COMPID 分區」以避免跨公司同碼異名洩漏——**本輪 schema（`DOC_USING_DEPT`/`ACCOUNT.orgCode`）未攜帶 companyCode 欄位**，與全站現行「單一公司 AS」簡化假設一致。多公司情境下之跨公司隔離為本文件明確排除之未來風險，列於 §8 開放問題，不設計測試（無多公司 fixture 路徑，屬不可測情境）。
- `docs/specs/data-model.md` 第 245 行文字為 `DOC_USING_DEPT：(documentId, orgUnitId)`，但實際持久化實體 `doc-using-dept.entity.ts` 為 `(documentId, orgCode)`（業務鍵，非 FK UUID）。本文件以**實際程式碼為權威**設計測試，此文件用字落差建議由人類更新 `data-model.md`（見 §9），不影響本文件測試設計之正確性。

### 0.4 ⚠ 關鍵發現：F019 置頂（pinning）語意需修正，取代 OQ-F019-03 之暫定假設

現況 `backend/src/public/public-list.ts` 第 58-62 行 `isPinned()`：

```
export function isPinned(item, userOrgCode) {
  if (!userOrgCode) return false;
  return item.usingDeptIds.includes(userOrgCode);   // 精確集合成員比對
}
```

此為 `docs/test-specs/features/F019-test.md` OQ-F019-03「暫依 spec 字面（a）精確集合成員比對」之產物，並已固化為 `public-list.spec.ts` 內 `TS-F019-005`。**但 `prototypes/03-public-list.html`（本專案 UI 版面/行為之硬性權威來源）第 135-139 行明確以不同語意實作**：

```js
// 登入者組織路徑（王小明 · 營業二本部 / 營運管理部 / 審查室；部門代碼 JAC00）
const USER_SCOPE = ['全公司','營業二本部','營業二本部 / 營運管理部','營業二本部 / 營運管理部 / 審查室'];
// §9.1/§9.2 定案：文件使用部門可指定任意層級，選上層自動涵蓋其下所有單位
// → 「您部門相關」＝文件使用部門命中登入者組織路徑上任一層級（含全公司）
const inScope = use => use.some(u => USER_SCOPE.includes(u));
```

`USER_SCOPE` 是使用者自身部門「由根到葉」之**祖先鏈**（含「全公司」）。換算為代碼前綴語意：**文件之使用部門代碼，若為使用者所屬部門代碼之任一祖先層級（含自身），即置頂**——即 `userOrgCode.startsWith(deriveCodePrefix(usingDeptCode))`，與現行 `isPinned()` 的精確比對不同（精確比對只是本規則在「祖先層級恰為使用者自身」時的特例）。

**此語意與 `F026-role-field-matrix.md` 第 66 行 AC 完全一致**：「Given 文件使用部門設為部層 `JA000`、使用者所屬部門為 `JAC00`, When 判定使用部門相符性, Then 判定為相符（子樹自動展開）」——`JA000` 是 `JAC00` 的祖先，這正是 prototype 的 `USER_SCOPE` 案例類型。F026 第 40 行並明文「同一規則適用於 F019 前台部門篩選與 F033 RAG 檢索層權限過濾，三者不得各自訂定不同展開規則」——這是**跨 feature 一致性之明文規範**，不僅是佐證。

**結論（本文件之設計決策，供 tdd-developer 依循）**：F019 置頂判定應改採「使用者部門是否位於文件使用部門所定義子樹（含自身）內」，而非精確比對。此決策：
1. 有 prototype 具體示範佐證（非臆測）；
2. 與 F026 spec 逐字 AC 一致；
3. 與 F026 spec 明文之跨 feature 一致性規範一致；
4. **推翻** `docs/test-specs/features/F019-test.md` 之 OQ-F019-03 暫定結論與 `public-list.spec.ts` 內 `TS-F019-005` 之現行期望值——兩者皆需連動修正（見 §2.1.2）。

若人類裁定不採此結論，§8 列出替代方案與其影響範圍。

---

## 1. 共用純邏輯：組織子樹歸屬判定（F019 置頂 × F026 使用部門相符性 共用一次）

### 1.1 設計提案

**新增純函式**（建議置於既有純邏輯之家 `backend/src/org-sync/org-hierarchy.ts`，與 `deriveCodePrefix`/`deriveParentCode` 同檔，無 IO）：

```
/** targetCode 是否位於 scopeCode 所定義子樹（含自身）內；scopeCode 之有效前綴為 targetCode 之前綴。
 *  Root（有效前綴為空字串）⇒ 對任何 targetCode 皆為 true（全域涵蓋）。
 *  F019 置頂／F026「使用部門相符性」／F033 檢索過濾（未來）共用同一判定，見 F026 spec §9.1 末段。 */
export function isWithinSubtree(scopeCode: string, targetCode: string): boolean {
  const prefix = deriveCodePrefix(scopeCode);
  if (prefix === '') return true;
  return targetCode.startsWith(prefix);
}
```

**用法對照**（同一函式、參數角色互換，覆蓋三個消費情境）：

| 消費情境 | 呼叫方式 | scope 角色 | target 角色 |
|---|---|---|---|
| F019 部門篩選（既有，`matchesDeptFilter`，不變） | `isWithinSubtree(選定篩選代碼, 文件使用部門代碼)` | 使用者選定之篩選單位 | 文件之使用部門 |
| F019 置頂（**本次修正**，`isPinned`） | `isWithinSubtree(文件使用部門代碼, 使用者部門代碼)` | 文件之使用部門 | 使用者自身部門 |
| F026「使用部門相符性」AC | `isWithinSubtree(文件使用部門代碼, 使用者部門代碼)` | 同上，與置頂**同一判定** | 同上 |

### 1.2 Test Scenarios（目標檔案：`backend/src/org-sync/org-hierarchy.spec.ts`，新增 `describe('isWithinSubtree')` 區塊）

#### TS-PS-ORG-001 scope 與 target 完全相同（自身）→ 相符
- Given：scopeCode=`JAC00`, targetCode=`JAC00`
- Then：`isWithinSubtree` 回傳 `true`

#### TS-PS-ORG-002 scope 為 target 之上層（父階）→ 相符（子樹涵蓋）
- Given：scopeCode=`JA000`（部層）, targetCode=`JAC00`（其下處室）
- Then：`true`
- 對應：F026 AC「文件使用部門設為部層 JA000、使用者所屬部門為 JAC00 → 相符」；prototype `USER_SCOPE` 示範

#### TS-PS-ORG-003 scope 為 target 之下層（更細單位）→ 不相符
- Given：scopeCode=`JAC00`（處室層）, targetCode=`JA000`（其上部層）
- Then：`false`（`'JA000'.startsWith('JAC')` 不成立）
- 說明：對稱驗證——比使用者所在單位更細之使用部門，不視為涵蓋使用者
- ⚠ prototype demo 資料未直接示範此方向（demo 使用者固定為最細處室層），屬邏輯對稱之衍生推論，非逐項 prototype 證據；標記供架構師覆核，非阻擋（推論依據充分：§9 filter 方向與本方向為同一函式之對稱呼叫）

#### TS-PS-ORG-004 scope 與 target 為同層兄弟 → 不相符
- Given：scopeCode=`JAC00`, targetCode=`JAD00`（同部門下另一處室）
- Then：`false`
- 對應：F026 AC「文件使用部門設為處室層 JAC00、使用者所屬部門為同部之另一處室 → 不相符」

#### TS-PS-ORG-005 scope 為 Root（`00000`，有效前綴空字串）→ 對任何 target 皆相符
- Given：scopeCode=`00000`, targetCode=`JCHA0`
- Then：`true`
- 對應：prototype demo「和潤-費用請款作業」`use=['全公司']` 對示範使用者（JAC00）仍出現於置頂區

#### TS-PS-ORG-006 最細課層雙向皆不誤判（防禦性邊界）
- Given：scopeCode=`JCHA0`（課）, targetCode=`JCHB0`（同處室下另一課）
- Then：`false`

#### TS-PS-ORG-007 target 為非法輸入（長度≠5）→ 沿用 `deriveCodePrefix`/`assertOrgCode` 既有防呆，拋 `RangeError('INVALID_ORG_CODE: ...')`
- Given：targetCode=`'X'`
- Then：拋錯（本函式僅對 `scopeCode` 呼叫 `deriveCodePrefix`；`targetCode` 未經 `assertOrgCode`，需**明確決定**是否也要防呆——見 §8 開放問題，本案例列出以提醒此不對稱）

---

## 2. F019（A）— 真實 `DOC_USING_DEPT` Join 接線

### 2.1 置頂（Pinning）

#### 2.1.1 語意修正（取代 OQ-F019-03，見 §0.4）

`isPinned()` 改為：

```
export function isPinned(item, userOrgCode) {
  if (!userOrgCode) return false;
  return item.usingDeptIds.some((code) => isWithinSubtree(code, userOrgCode));
}
```

#### 2.1.2 Test Scenarios（目標檔案：`backend/src/public/public-list.spec.ts`，`describe('F019 排序：使用部門置頂 + 編號降冪')` 區塊）

#### TS-PS-F019-001（**取代既有 `TS-F019-005`，期望值反轉**）文件使用部門為使用者部門之上層 → 置頂
- Given：使用者 `orgCode=JAC00`；文件 D1 `usingDeptIds=['JA000']`
- When：`isPinned(D1, 'JAC00')`
- Then：**`true`**（既有 `public-list.spec.ts` 內 `TS-F019-005` 現行斷言為 `false`，需同步修改為 `true`，並更新其標題/註解移除「非子樹展開」字樣）
- 對應：§0.4 關鍵發現；F026 AC；prototype 03 `USER_SCOPE`

#### TS-PS-F019-002 使用者部門與文件使用部門完全相符（自身層級）→ 置頂（既有 `TS-F019-001` 語意不變，回歸驗證）
- Given：user=`JAC00`, D1.usingDeptIds=`['JAC00']`
- Then：pinned=`true`

#### TS-PS-F019-003（新邊界）文件使用部門為使用者所屬部門之下層（更細單位）→ 不置頂
- Given：user=`JA000`（部層本身）, D1.usingDeptIds=`['JAC00']`（其下處室）
- Then：pinned=`false`
- 對應：TS-PS-ORG-003 之衍生應用；同標記為需架構師覆核之衍生假設

#### TS-PS-F019-004 文件使用部門為多筆，其一為使用者之上層 → 仍置頂（既有 `TS-F019-004` 精神延伸）
- Given：D1.usingDeptIds=`['JCHA0','JA000']`, user=`JAC00`
- Then：`'JCHA0'` 不涵蓋 `JAC00`（非其祖先）、`'JA000'` 涵蓋 → 整體 pinned=`true`（OR 語意不變，僅底層判定改用 `isWithinSubtree`）

#### TS-PS-F019-005 使用者部門為 `null`/`undefined` → 一律非置頂（既有守門不受本次修正影響，回歸驗證）
- Given：user=`null`, D1.usingDeptIds=`['JAC00']`
- Then：pinned=`false`

#### TS-PS-F019-006 全公司（Root `00000`）使用部門 → 對任何使用者皆置頂
- Given：D1.usingDeptIds=`['00000']`, user=`JCHA0`
- Then：pinned=`true`
- 對應：prototype demo「全公司」使用部門案例

### 2.2 部門篩選（子樹前綴）

既有 `matchesDeptFilter()`（`public-list.ts` 第 86-94 行）之比對方向與行為**不受本次修正影響**（呼叫方向本就是「篩選代碼→文件代碼」，與置頂相反，見 §1.1 對照表），現有 `TS-F019-006~011` 全數沿用、不重工。**建議**（非必要，風險可控之一致性優化）：可將 `matchesDeptFilter` 內部改呼叫 §1.1 之 `isWithinSubtree(deptCode, code)` 取代目前手寫之 `deriveCodePrefix`+`startsWith`，使三處消費情境共用同一實作，但因既有邏輯已 unit-green 且無缺陷，此重構為選配，不阻擋本次修復。

### 2.3 `TypeOrmPublicDocumentStore` Join 契約設計

#### 2.3.1 現況缺口
`typeorm-public-documents.store.ts` 第 51 行 `usingDeptIds: []` 為寫死空陣列（見檔案頂部註解「🔴 已知落差」）。`DOC_USING_DEPT` 表已存在（F014 track migration `1722556800000-doc-org-multivalue.ts`）且建立路徑已寫入資料（`typeorm-documents.store.ts` 第 161-166 行），僅讀取路徑未接線。

#### 2.3.2 建議實作路徑：比照既有 `lifecycleName` 解析模式（分離查詢＋JS 端分組），非 SQL JOIN

現有程式碼已示範此模式（`typeorm-public-documents.store.ts` 第 36-42 行：先取 `docs`，再以 `lcIds` 去重後**另一次獨立查詢** `Lifecycle`、於 JS 端組 `Map`）。**建議 `usingDeptIds` 比照辦理**，而非以 SQL `LEFT JOIN` 展開：

```
const docIds = docs.map((d) => d.id);
const deptRows = docIds.length
  ? await ds.getRepository(DocUsingDept).find({ where: { documentId: In(docIds) } })
  : [];
const deptMap = groupUsingDeptIds(deptRows);   // 純函式，見下
...
usingDeptIds: deptMap.get(d.id) ?? [],
```

**理由（勝於原始 SQL JOIN 之設計依據）**：
1. 一對多 JOIN（1 文件 × N 筆使用部門）會使 `ICSOP_DOCUMENT` 列因 JOIN 而重複展開，需額外 `DISTINCT`/`GROUP_CONCAT` 等 SQL 技巧才能避免文件筆數膨脹；分離查詢＋JS 分組**天然不會重複**。
2. 與同檔案既有 `lifecycleName` 解析手法一致，降低认知負擔、複用既有分頁上限（`take(5000)`）與去重（`In()`）慣例。
3. 分組邏輯（`deptRows → Map<documentId, string[]>`）可抽成**不需 DataSource 之純函式**，**達成 unit 可測**（見 2.3.3），避免全部推給 [integration]。

#### 2.3.3 Test Scenarios — 分組純函式（目標檔案：新增 `backend/src/public/typeorm-public-documents.store.spec.ts`，比照 `org-sync/typeorm-org-sync.store.spec.ts` 之「hand-mock 不需真 DB」慣例）

建議匯出 `groupUsingDeptIds(rows: { documentId: string; orgCode: string }[]): Map<string, string[]>`。

#### TS-PS-F019-STORE-001 空輸入 → 空 Map
- Given：`rows=[]`
- Then：`map.size===0`

#### TS-PS-F019-STORE-002 單一文件單筆列 → 陣列長度 1
- Given：`rows=[{documentId:'d1',orgCode:'JAC00'}]`
- Then：`map.get('d1')` 為 `['JAC00']`

#### TS-PS-F019-STORE-003 單一文件多筆列（3 筆不同 orgCode）→ 全數保留，順序等同輸入順序
- Given：`d1` 對應 3 筆列（`JAC00`/`JA000`/`00000`）
- Then：`map.get('d1')` 長度為 3、含全部 3 筆代碼

#### TS-PS-F019-STORE-004 多份文件各自分組 → 不互相污染
- Given：`d1` 2 筆、`d2` 1 筆，交錯輸入（非依 documentId 排序）
- Then：`map.get('d1')` 長度 2、`map.get('d2')` 長度 1，兩者代碼不重疊

#### TS-PS-F019-STORE-005（設計待決，見 §8）輸入含重複 `(documentId, orgCode)` 列 → 是否去重
- Given：`d1` 對應兩筆相同 `orgCode='JAC00'`（理論上因 `UQ_DOC_USING_DEPT_doc_org` 唯一索引不應發生，但純函式層是否仍需防禦性去重）
- 建議行為：**原樣呈現、不主動去重**（DB 唯一索引已是唯一性防線；純函式不做防禦性去重以免掩蓋資料異常），但此為設計假設，需 tdd-developer 確認

### 2.4 整合層必要性（不可單靠 unit 證明之部分）
以下項目**必須**以真實 MSSQL 驗證，unit 層 Fake/Mock 無法涵蓋，設計於 §6：
- 兩次獨立查詢（`ICSOP_DOCUMENT` 全量 + `DOC_USING_DEPT.documentId In(...)`）於真實 MSSQL 上不因 1:N 關聯而使文件筆數重複。
- 0 筆 `DOC_USING_DEPT` 列之文件（從未指派使用部門）於真實 join 路徑仍正確出現、`usingDeptIds=[]`。
- 端到端置頂／篩選經真實 session（`ACCOUNT.orgCode`）與真實 HTTP round-trip。

---

## 3. F026（B）— 使用部門子樹前綴判定（與 F019 置頂共用同一 predicate）

### 3.1 AC 對照
F026 spec「文件使用部門欄位之粒度」章節（第 66-67 行）兩條 AC：
- **AC-F026-a**：文件使用部門設為部層 `JA000`、使用者所屬部門為 `JAC00` → 判定為相符。
- **AC-F026-b**：文件使用部門設為處室層 `JAC00`、使用者所屬部門為同部之另一處室 → 判定為不相符。

### 3.2 測試設計：交叉引用，不重工另立測試檔
此二 AC 之判定邏輯與 §1 之 `isWithinSubtree(scopeCode=文件使用部門, targetCode=使用者部門)` 完全一致（**與 F019 置頂為同一呼叫形態**，見 §1.1 對照表），故不重新設計測試，改以交叉引用滿足覆蓋：

| F026 AC | 對應共用測試 |
|---|---|
| AC-F026-a | `TS-PS-ORG-002`（§1.2） |
| AC-F026-b | `TS-PS-ORG-004`（§1.2） |

### 3.3 範圍界線
本文件僅覆蓋 tracker 明列缺口「使用部門子樹前綴判定」本身之純邏輯（`feature-status.md` F026 列：「AC5-9（附件/浮水印/使用部門子樹前綴 `orgCode LIKE 'prefix%'` 判定）未實作」之後段）。F026 之其餘欄位權限矩陣（19 欄可寫/唯讀）、`FIELD_WRITE_FORBIDDEN` 情境已有既有 RBAC 測試涵蓋（另檔，非本文件範圍）。若日後 F026／F033 出現獨立消費此 predicate 之具體端點（如使用部門編輯表單即時相符性驗證、RAG 檢索過濾），該端點層級之整合測試留待對應 feature 之獨立 test-design 補齊。

---

## 4. F018（C）— 使用表單自訂名稱

### 4.1 API 契約設計提案

- **端點**：`POST /admin/usage-forms`（現有，`FilesInterceptor('files', 20, ...)`）。
- **新增欄位**：multipart 文字欄位 `name`（選填，字串）。**僅單檔上傳分支（`uploads.length===1`）套用**；批次分支（`uploadForms`，多檔）不接受/不轉發 `name`，各檔沿用各自檔名——因 prototype 19 `fileInput`（第 138 行）**無 `multiple` 屬性**，UI 僅支援單檔選取，批次路徑目前無任何介面可逐檔命名，強行設計批次命名參數將無 UI 對應之驗收依據。
- **Controller** `upload()`：新增 `@Body('name') name?: string`，僅於單檔分支傳給 `svc.uploadForm(session, file, name)`。
- **Service** `uploadForm(session, file, name?)`：
  - `resolvedName = (name ?? '').trim() || file.fileName`（未提供 / 空字串 / 純空白 → 一律 fallback 檔名；有值 → trim 後採用）
  - 寫入 `store.create({ name: resolvedName, ... })`
- **覆蓋端點**（`PUT /admin/usage-forms/:formId`）**刻意不變**：不接受 `name`，覆蓋僅取代檔案內容，原表單名稱不變（prototype `doOverwrite()`/`overwriteForm()` 均未提供改名欄位）——需以負向測試明確鎖定此邊界（TS-PS-F018-009）。

### 4.2 Backend Unit Test Scenarios（目標檔案：`backend/src/usage-forms/usage-forms.service.spec.ts`）

#### TS-PS-F018-001 提供自訂名稱（不同於檔名）→ 以自訂名稱建立記錄
- Given：`file.fileName='放款覆核表.xlsx'`, `name='貸款覆核申請表'`
- When：`uploadForm(session, file, '貸款覆核申請表')`
- Then：建立記錄 `name==='貸款覆核申請表'`（非檔名）
- 對應：gap-derived AC（本文件 §4.1，來源＝launching prompt 之 F018 使用表單名稱缺口描述，非原 spec 逐字 AC）

#### TS-PS-F018-002 未提供 `name`（`undefined`）→ fallback 檔名（既有行為回歸，不可破壞）
- Given：`name=undefined`
- Then：`record.name===file.fileName`

#### TS-PS-F018-003 `name` 為空字串 `''` → 視為未提供，fallback 檔名
- Then：`record.name===file.fileName`

#### TS-PS-F018-004 `name` 為純空白（`'   '`）→ trim 後為空 → fallback 檔名
- Then：`record.name===file.fileName`

#### TS-PS-F018-005 `name` 前後含空白（`' 貸款覆核申請表 '`）→ 儲存值已 trim
- Then：`record.name==='貸款覆核申請表'`（不含前後空白）

#### TS-PS-F018-006 `name` 長度恰為 400 字元（`USAGE_FORM_POOL.name` 為 `nvarchar(400)` 邊界，見 `usage-form-pool.entity.ts` 第 12-13 行）→ 成功
- Then：成功建立，`record.name` 完整保留 400 字元

#### TS-PS-F018-007（**設計待決，見 §8**）`name` 長度為 401 字元 → 拒絕或截斷？
- 現況：本專案**全站無任何欄位長度驗證慣例**（`grep class-validator` 全庫零命中），`error-handling.md` 亦無對應錯誤碼。若不設計驗證，超長字串將直接送至 MSSQL driver，由 DB 層拋出未分類例外（使用者看到不友善錯誤，而非明確驗證訊息）。
- **建議設計**（供人類定案，非本文件逕自拍板）：新增 `assertNameWithinLimit(name, 400)`（比照 `file-rules.ts` `assertSizeWithinLimit` 風格），拒絕時回 400 + 新錯誤碼（如 `USAGE_FORM_NAME_TOO_LONG`，需人類定案碼名並補入 `error-handling.md`）。
- 本案例列為**待人類裁決後**方可轉為正式驗收測試，暫不阻擋 TS-PS-F018-001~006 之落地。

#### TS-PS-F018-008 批次上傳（`uploadForms`，多檔）→ 不接受/不受影響，各自沿用檔名（既有行為回歸，確保新增 `name` 不誤傷批次路徑）
- Given：3 檔批次上傳，皆未帶 `name`（因 controller 批次分支不轉發此參數）
- Then：各記錄 `name` 各自等於其 `fileName`

#### TS-PS-F018-009 覆蓋上傳（`overwriteForm`）不接受/不套用 `name` → 覆蓋後表單名稱維持原值（負向案例，鎖定 §4.1 之明確邊界）
- Given：既有表單 `name='進件申請書.xlsx'`；覆蓋新檔 `fileName='進件申請書_v2.xlsx'`
- When：`overwriteForm(session, formId, newFile)`（contract 無 `name` 參數可傳）
- Then：覆蓋後 `record.name` 仍為原值 `'進件申請書.xlsx'`

### 4.3 既有測試需連動修改（非新增，屬本次修復之必要配套）

- **`frontend/src/pages/UsageFormManagementPage.test.tsx` 第 121-133 行 `'TS-F018-001 上傳合法 xlsx → 呼叫 uploadUsageForms([file])'`**：現行斷言 `expect(endpoints.uploadUsageForms).toHaveBeenCalledWith([file])`（第 132 行）**逐字鎖定本次要修的 gap 本身**（未攜帶名稱）。本次修復落地後**必須**同步改為斷言攜帶名稱參數（見 TS-PS-F018-FE-001），否則新舊測試將互相矛盾，其中一個必然變紅。

### 4.4 Frontend 契約設計 + Test Scenarios

- **`frontend/src/api/endpoints.ts`** `uploadUsageForms(files: File[], name?: string)`：`files.length===1` 且提供 `name` 時，multipart 額外 `fd.append('name', name.trim())`；批次（length>1）維持不附加（現行 UI 無法觸發此路徑）。
- **`frontend/src/pages/UsageFormManagementPage.tsx`** `submitUpload()`：改為 `await uploadUsageForms([uploadFile], uploadName.trim());`（現況第 204 行呼叫 `uploadUsageForms([uploadFile])`，遺漏第二參數即為本次要修的 bug 本身——**FE 狀態 `uploadName` 已存在、已驗證、已顯示於 UI，僅未真正送出**）。

（目標檔案：`frontend/src/pages/UsageFormManagementPage.tsx` / `.test.tsx`、`frontend/src/api/endpoints.ts`）

#### TS-PS-F018-FE-001（**取代既有 `TS-F018-001` 之錯誤斷言，見 §4.3**）選擇檔案 → 名稱自動帶入檔名（既有行為不變）→ 送出 → `uploadUsageForms` 應攜帶名稱參數呼叫
- Given：開啟上傳 modal，選擇檔案 `放款覆核表.xlsx`（名稱欄位依既有邏輯自動帶入同值）
- When：點擊「上傳」
- Then：`uploadUsageForms` 以 `([file], '放款覆核表.xlsx')` 呼叫（新增第二參數斷言）

#### TS-PS-F018-FE-002 使用者修改名稱欄位為自訂文字（不同於檔名）→ 送出 → 以自訂名稱呼叫
- Given：選檔後、送出前手動清空並輸入「貸款覆核申請表」
- When：點擊「上傳」
- Then：`uploadUsageForms` 以 `([file], '貸款覆核申請表')` 呼叫；成功 toast 訊息含自訂名稱（既有 `已上傳表單「${uploadName.trim()}」` 邏輯不變，僅顯示值已為自訂值）

#### TS-PS-F018-FE-003 已手動輸入名稱後才選擇檔案 → 不覆蓋既有輸入值（既有邏輯，補測試覆蓋，非新需求）
- Given：開啟 modal → 先於名稱欄位輸入「自訂表單名」→ 才選擇檔案「放款覆核表.xlsx」
- Then：名稱欄位仍為「自訂表單名」，未被檔名覆蓋（`UsageFormManagementPage.tsx` 第 191 行 `if (!uploadName.trim()) setUploadName(f.name)` 已實作此邏輯，比對 prototype 第 333 行同語意，僅缺測試覆蓋）

#### TS-PS-F018-FE-004（既有已覆蓋，回歸列出、不重工）名稱欄位留空送出 → 顯示「表單名稱不可為空」、不呼叫上傳
- 說明：`uploadNameErr` 現有邏輯已符合 prototype 文案（第 163 行「表單名稱不可為空。」），既有測試套件已隱含覆蓋此路徑之錯誤展示（`uploadNameErr` state 邏輯），本文件僅重申其為必要回歸項，不新增案例。

---

## 5. 前端（D）— `PublicListPage` vs `prototypes/03-public-list.html`

### 5.1 核心 置頂/篩選 surface — 無需新增 FE 程式碼或測試（正面結論）
`PublicListPage.tsx` 已完整依 `PublicListItemDto`（`pinned`/`usingDeptIds`/`usingDeptNames`）結構渲染置頂區/其餘區、卡片使用部門欄位；`PublicListPage.test.tsx` 既有 fixture（`docItem()` 預設 `usingDeptIds: ['JAC00']`、`usingDeptNames: ['審查室']`、`pinned` 可覆寫）**已涵蓋後端修復後將產生的真實資料形狀**。§2 之後端修復（置頂語意修正 + 真實 join）**不需要任何前端程式碼變更**，`PublicListPage.tsx` 本身不是本次缺口的一部分。此為明確結論，避免 tdd-developer 誤判需要連動修改前端渲染邏輯。

### 5.2 次要發現：置頂區標題缺少部門路徑後綴（prototype fidelity gap）

`prototypes/03-public-list.html` 第 78 行：
```html
<h2 ...>您部門相關文件 · <span class="text-slate-400 font-normal">營運管理部 / 審查室</span></h2>
```

現行 `frontend/src/pages/PublicListPage.tsx` 第 254 行：
```tsx
<h2 className="text-sm font-semibold text-slate-700">您部門相關文件</h2>
```

**缺少「· {使用者部門路徑}」後綴**——違反「UI 斷言須逐字比對 prototype」之硬性要求。同一落差亦見於頁首列（第 130-135 行）之 `orgLabel`：現行僅回傳 `ORG_UNIT.name`（葉節點簡稱，如「審查室」），而 prototype 頁首（第 32-33 行）顯示完整路徑「營運管理部 / 審查室」。

**設計建議**：新增純函式 `buildOrgPath(orgUnits: OrgUnitRecord[], orgCode: string): string`，沿 `parentCode` 鏈向上組出「父 / 子」路徑字串（複用既有已載入之 `orgUnits`，`PublicListPage.tsx` 第 42-46 行已透過 `getOrgUnits()` 取得），供頁首與置頂標題**共用同一計算**，避免兩處各自實作出不一致格式。（是否改採 `ORG_UNIT.descFull` 作為路徑來源，見 §8 開放問題。）

（目標檔案：`frontend/src/pages/PublicListPage.tsx` / `.test.tsx`）

#### TS-PS-FE-001 置頂區標題含使用者部門路徑後綴（逐字比對 prototype 第 78 行格式）
- Given：`mockAuth(orgCode='JAC00')`（既有 fixture 慣例，`name='王小明'`）；`orgUnits` fixture 含 `J0000`（DIVISION）/`JA000`（DEPARTMENT）/`JAC00`（SECTION）三層鏈（既有 `PublicListPage.test.tsx` 第 54-56 行已備妥此三筆）
- When：渲染含至少一筆置頂文件之清單
- Then：置頂區標題文字為「您部門相關文件 · 營運管理部 / 審查室」（現況僅「您部門相關文件」，需修正）

#### TS-PS-FE-002 頁首列使用者部門顯示亦應為完整路徑，非僅葉節點名稱
- 同上路徑組成邏輯；建議與 TS-PS-FE-001 共用同一 `buildOrgPath` helper
- Then：頁首「王小明 · 營運管理部 / 審查室」（現況「王小明 · 審查室」）

#### TS-PS-FE-003 使用者部門於 `orgUnits` 清單中查無資料（尚未載入完成/API 失敗回退空陣列）→ fallback 不得顯示 `undefined`/崩潰
- Given：`orgUnits=[]`（`getOrgUnits()` 失敗之既有 catch fallback，`PublicListPage.tsx` 第 45 行）
- Then：頁首/置頂標題 fallback 為 `orgCode` 本身（既有 `orgLabel` fallback 慣例延伸至路徑版本），不拋錯、不顯示 `undefined`

---

## 6. 整合測試（E）— `backend/test/int/`

### 6.1 Harness 慣例回顧（沿用 `backend/test/int/harness.ts`、`usage-form-pool.itest.ts` 既定模式）
- FK 鏈：`LIFECYCLE` → `ICSOP_DOCUMENT` → `DOC_USING_DEPT`（先插入 marker `Lifecycle`，才能插入 marker `IcsopDocument`，才能插入 `DocUsingDept`）。
- marker 前綴沿用既有 `MARK.doc`（`ZZINT-`）、`MARK.lc`（`ZZINT_LC_`）、`MARK.acct`（`zzint-`）——**`harness.ts` 之 `cleanupMarkers()` 已涵蓋 `DOC_USING_DEPT`／`ICSOP_DOCUMENT`／`LIFECYCLE`／`ACCOUNT` 之精準清除（第 39-63 行），本文件新增測試不需額外 cleanup 函式**，只需沿用既有前綴。
- `DOC_USING_DEPT.orgCode`／`ACCOUNT.orgCode` 無 FK 至 `ORG_UNIT`（§0.3），可安全使用合成 marker 代碼，不需真實組織樹資料。

### 6.2 新增檔案：`backend/test/int/public-documents.itest.ts`

**Fixture 設計**（`beforeAll`）：
1. marker `Lifecycle`（`${MARK.lc}PUB`）。
2. marker 帳號兩筆：
   - `${MARK.acct}pubchild`：`orgCode='Z9AB0'`（合成子階代碼，模擬「處室」層）、`roleCode='User'`、`status='active'`。
   - `${MARK.acct}pubnodept`：`orgCode=null`（無部門使用者）。
3. marker 文件五筆（`documentNumber` 皆 `${MARK.doc}PUB-00N`，`status='active'`，`announcedDate=`昨日，即已公告）：

| 文件 | `DOC_USING_DEPT` 列 | 用途 |
|---|---|---|
| PUB-001 | `['Z9A00']`（父階，`pubchild` 之上層） | 置頂：祖先命中 |
| PUB-002 | `['Z9AB0']`（與 `pubchild` 完全相同） | 置頂：自身命中 |
| PUB-003 | `['Z9AC0']`（`pubchild` 之同層兄弟） | 置頂：不應命中 |
| PUB-004 | （無列，0 筆） | 無使用部門資料之文件 |
| PUB-005 | `['Z9X00']`（無關分支） | 部門篩選負向對照 |

（`Z9A00` 有效前綴 `Z9A`；`Z9AB0`/`Z9AC0` 有效前綴分別為 `Z9AB`/`Z9AC`，皆以 `Z9A` 開頭——構造方式與既有 `JA000`/`JAC00`/`JAD00` 範例同構，僅代碼本身為避免與真實上游代碼衝突而採用合成前綴 `Z9`。）

### 6.3 Test Scenarios

#### TS-PS-INT-001 置頂：文件使用部門為使用者部門之上層 → 置頂
- Given：session=`pubchild`（`orgCode='Z9AB0'`）
- When：`GET /public/documents`（cookie=`pubchild`）
- Then：200；回傳項目中 PUB-001 之 `pinned===true`

#### TS-PS-INT-002 置頂：文件使用部門與使用者自身代碼完全相同 → 置頂
- Then：PUB-002 之 `pinned===true`

#### TS-PS-INT-003 置頂：文件使用部門為同層兄弟單位（非上層、非自身）→ 不置頂
- Then：PUB-003 之 `pinned===false`（仍出現於「其餘」集合，非消失）

#### TS-PS-INT-004 無使用部門列之文件 → `usingDeptIds=[]`、不置頂、不因無資料而從清單消失
- Then：回傳項目含 PUB-004；其 `usingDeptIds` 為空陣列、`usingDeptNames` 為空陣列、`pinned===false`
- 對應：任務描述明列「a document with no using-dept rows」；驗證 LEFT JOIN / 分離查詢語意（非 INNER JOIN 誤刪此文件）

#### TS-PS-INT-005 使用者無部門（`ACCOUNT.orgCode=null`）→ 全部文件皆不置頂，清單仍正常回傳
- Given：session=`pubnodept`（`orgCode=null`）
- When：`GET /public/documents`
- Then：200；所有回傳項目 `pinned===false`；`total` 與有部門使用者查詢之總筆數相同（僅 `pinned` 旗標不同，非清單內容被過濾）
- 對應：任務描述明列「a user with no department」

#### TS-PS-INT-006 部門篩選：選定上層 `Z9A00` → 涵蓋其下所有使用部門
- When：`GET /public/documents?deptCode=Z9A00`
- Then：回傳集合含 PUB-001、PUB-002、PUB-003（三者 `usingDept` 皆以 `Z9A` 開頭），不含 PUB-005

#### TS-PS-INT-007 部門篩選：選定同層兄弟 `Z9AC0` → 僅命中該處室，不含 `Z9AB0`
- When：`GET /public/documents?deptCode=Z9AC0`
- Then：僅 PUB-003 命中；PUB-002（`Z9AB0`）不命中

#### TS-PS-INT-008 一份文件對應多筆 `DOC_USING_DEPT` 不導致清單重複回傳同一文件（去重驗證）
- Given：額外對 PUB-001 補插入第二筆 `DOC_USING_DEPT`（`orgCode='Z9AB0'`），使其同時掛兩個使用部門
- When：`GET /public/documents`（不篩選）
- Then：回傳陣列中 PUB-001 之 `id` 僅出現一次；其 `usingDeptIds` 陣列長度為 2、含兩筆代碼
- 對應：§2.3.2 設計理由第 1 點（避免 1:N 關聯造成文件筆數膨脹）

#### TS-PS-INT-009 排序：置頂區整體在前、其餘在後，區內皆依文件編號降冪（真實資料端到端）
- Given：另建 4 筆 marker 文件，編號刻意穿插（2 筆命中 `pubchild` 置頂、2 筆不命中），公告日期皆已過
- When：`GET /public/documents`（session=`pubchild`，不分頁篩選）
- Then：回傳陣列順序＝［置頂兩筆依編號降冪］+［其餘兩筆依編號降冪］，驗證真實 `documentNumber` 字串排序（非數值排序）於實際 collation 下之行為與純函式層一致
- 對應：任務描述「ordering (pinned block first, then the existing sort within each block)」

#### TS-PS-INT-010（[manual/code-review]，非自動化斷言）分離查詢設計不產生 N+1
- 說明：§2.3.2 建議之「文件列 + 一次性 `In()` 使用部門列」兩次查詢設計，其「不逐筆查詢」特性屬程式碼結構層面的可驗證性質，不易於 supertest 黑箱情境下以斷言精確驗證 SQL 執行次數。列為程式碼審查檢查點而非自動化整合測試案例。

---

## 7. AC / Gap → TS 覆蓋對照表

| 來源 | 內容摘要 | 對應 TS |
|---|---|---|
| F019 AC1（置頂，語意修正） | 使用部門含 X 的文件置頂（含祖先層級） | TS-PS-ORG-001/002, TS-PS-F019-001~006, TS-PS-INT-001/002/003/006 |
| F019 spec「文件使用部門...含全公司」Root 涵蓋 | Root 使用部門對任何使用者皆置頂 | TS-PS-ORG-005, TS-PS-F019-006 |
| F019 Edge：使用者部門查無相符 | 無置頂區塊，純編號降冪（既有 TS-F019-003，不重工） | （既有 F019-test.md） |
| F019 §9 部門篩選子樹（既有，不變） | `orgCode LIKE prefix%` | （既有 F019-test.md TS-006~011） |
| gap-derived：DOC_USING_DEPT 真實資料路徑（feature-status.md F019 列） | 真實 join，含 0 筆/多筆/去重 | TS-PS-F019-STORE-001~005, TS-PS-INT-004/008 |
| gap-derived：使用者無部門（feature-status.md／launching prompt 明列） | 全部不置頂，清單仍正常 | TS-PS-INT-005 |
| F026 AC「部層 JA000 / 使用者 JAC00 → 相符」 | 子樹祖先相符 | TS-PS-ORG-002 |
| F026 AC「處室層 JAC00 / 同部另一處室 → 不相符」 | 兄弟不相符 | TS-PS-ORG-004 |
| gap-derived：F018 自訂表單名稱（launching prompt 明列，非原 F018 spec AC） | `name` 參數、預設檔名、trim、批次/覆蓋不適用 | TS-PS-F018-001~009, TS-PS-F018-FE-001~004 |
| prototype 03 第 78 行「您部門相關文件 · {路徑}」 | 置頂標題部門路徑後綴 | TS-PS-FE-001 |
| prototype 03 第 32-33 行 頁首部門路徑 | 完整路徑非僅葉節點 | TS-PS-FE-002 |
| 任務描述「ordering (pinned block first...)」 | 端到端排序驗證 | TS-PS-INT-009 |

---

## 8. 開放設計問題（Open Questions）

- **OQ-PS-01（🔴 阻擋 §2.1 落地，需架構師/PM 定案）**：F019 置頂語意應採「子樹祖先鏈」（本文件 §0.4 建議、有 prototype + F026 spec 雙重佐證）或維持既有「精確集合比對」（OQ-F019-03 暫定假設，已 unit-green 但與 prototype 行為不符）？**若裁定維持精確比對**：§2.1.2 全數案例需改回、`docs/test-specs/features/F019-test.md` 之 OQ-F019-03 應正式定案為「(a) 精確比對」並移除「待確認」標記；**若採本文件建議（子樹祖先鏈）**：需同步修正 `public-list.ts`/`public-list.spec.ts`，並將 `docs/test-specs/features/F019-test.md` OQ-F019-03 標記為「已由 public-seams worktree 依 prototype 03 證據推翻，改採(b)」。**本文件之 §2/§3/§6 測試設計皆已依「子樹祖先鏈」撰寫**，若裁定相反需整批反轉期望值。

- **OQ-PS-02（🟡 非阻擋，建議定案後再落地 TS-PS-F018-007）**：使用表單名稱超過 `nvarchar(400)` 上限（401+ 字元）之行為——新增顯式驗證錯誤碼（建議 `USAGE_FORM_NAME_TOO_LONG`，需補入 `error-handling.md`）或交由 DB 層拋未分類例外？本專案目前全站無欄位長度驗證前例（`class-validator` 零使用），此為**建立先例**之決策，建議由架構師一併考慮是否也要回頭補其他既有 `nvarchar` 欄位（如 `documentName` nvarchar(200)）之一致驗證策略，而非僅為本欄位單點決定。

- **OQ-PS-03（🟢 低風險，可由 tdd-developer 逕行決定不阻擋交付）**：`PublicListPage.tsx` 之「使用者部門路徑」顯示（§5.2）應以 `ORG_UNIT.descFull`（上游 `DESC_FULL`，**可能為 `null`**，見 `org-unit.entity.ts` 第 34-35 行 OQ-DESCFULL-2）為準（與 F020 浮水印「部門」欄一致，`watermark.service.ts` 已有 `descFull` fallback 鏈可參考複用），或前端自行沿 `parentCode` 鏈組字串（不受上游 `null` 影響，但格式可能與 `descFull` 之既有格式不同源，兩處「組織全名」邏輯分家）？建議採前者（複用 F020 既有 fallback 鏈，避免全站出現兩套「組織全名」算法），但 `descFull` 為 `null` 時之 fallback（本文件 TS-PS-FE-003 已預留 fallback 案例，但 fallback 內容——是否退回葉節點 `name`、是否退回前端自組路徑——需定案）。

- **OQ-PS-04（🟢 低風險，設計假設待確認）**：`isWithinSubtree`（§1.1）之 `targetCode` 參數是否也需比照 `scopeCode` 呼叫 `assertOrgCode` 防呆（TS-PS-ORG-007 已標記此不對稱）？現有 `matchesDeptFilter`（`public-list.ts`）同樣僅對 `deptCode`（篩選條件）呼叫 `deriveCodePrefix`，未對 `item.usingDeptIds` 內個別代碼防呆，屬既有慣例（信任內部資料已經 DB 層驗證），建議 `isWithinSubtree` 比照維持現狀（僅 `scopeCode` 防呆），但需 tdd-developer 確認。

- **OQ-PS-05（🟢 低風險，非阻擋，供文件維護）**：`docs/specs/data-model.md` 第 245 行 `DOC_USING_DEPT：(documentId, orgUnitId)` 之措辭與實際持久化實體 `(documentId, orgCode)`（業務鍵）不一致，建議人類於下次 data-model.md 更新時修正措辭（本文件已依實際程式碼設計測試，不受此文字落差影響）。

- **OQ-PS-06（🟢 已知限制，非本輪可解，僅記錄）**：`upstream-person-org-source.md` 明文子樹比對「必須 COMPID 分區」，但 `DOC_USING_DEPT`/`ACCOUNT.orgCode` 現無 companyCode 欄位（§0.3）。本輪單一公司（AS）假設下無法設計對應測試（無多公司 fixture 路徑），若未來擴增多公司，需先於 schema 層補 companyCode 欄位並重新設計本文件全部子樹相關測試（§1/§2/§3/§6）。

---

## 9. 給人類的裁決清單（Summary of Decisions Needing Sign-off）

以下事項依阻擋程度排序，建議人類優先處理 1、2 項後，tdd-developer 方可完整落地本文件之測試設計：

1. **OQ-PS-01**：F019 置頂語意——子樹祖先鏈 vs 精確比對（本文件建議前者，證據見 §0.4）。**這是本次測試設計最重大的發現，直接影響 §2/§3/§6 共約 20 個測試案例之期望值方向**，也影響 `docs/test-specs/features/F019-test.md` 之 OQ-F019-03 狀態應否更新（該檔非本 worktree 所管，但其內容與本文件結論衝突，需人類協調兩份文件之最終一致性）。
2. **OQ-PS-02**：使用表單名稱長度上限（400 字元）超出時之錯誤處理策略——是否新增 `USAGE_FORM_NAME_TOO_LONG`。
3. **OQ-PS-03**：組織路徑顯示應源自 `ORG_UNIT.descFull` 或前端自組（影響 TS-PS-FE-001/002 之確切實作與斷言細節，但不影響「應顯示路徑」此一結論本身）。
4. 其餘 OQ-PS-04/05/06 為低風險/文件維護性質，可由 tdd-developer 依本文件建議逕行處理，不需額外會議裁決。

**未涉及新資料表**：本文件全部測試設計皆基於既有 `DOC_USING_DEPT`（F014 track 已建）、`USAGE_FORM_POOL`（既有 `name` 欄位已足 400 字元）與既有 `ACCOUNT.orgCode`，**未發現需新增 DB 表之情況**。
