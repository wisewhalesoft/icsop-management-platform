---
type: implementation-log
feature_id: org-foundation
feature_name: Wave 2 前置地基（名稱解析／組織讀取／DESC_FULL／session 擴充）
status: complete
last_updated: 2026-07-23
---

# org-foundation — Implementation Log

> worktree: `feature/org-foundation`（Wave 2 public + doc-edit 兩線之前置，須先併回 main）。
> 單元測試 only；真上游 VW_HPMUSER/VW_DEPT_SQL 同步＝`[integration]`（documented TODO）。

## 關鍵決策

### ACCOUNT vs PERSON —— 採 ACCOUNT，不另建 PERSON 表
`upstream-person-org-source.md` 定案 PERSON 來源＝`VW_HPMUSER`（**與 ACCOUNT 同步之來源完全同一
view**），範圍同為 `COMPID='AS'`、在職判定同為 `EMPSTS='A'`。現況 ACCOUNT 同步
（`org-sync.service.ts` + `classifyAccount`）對每筆 `EMPSTS='A'` 建立/更新帳號，離職者保留為
`status='disabled'`（姓名不刪）。因此 **ACCOUNT 已涵蓋全體在職 AS 員工**（且離職者可回溯）。
另建 PERSON 表只會重複相同來源的相同欄位（employeeNo/name/orgCode/status），違反單一來源。
→ **名稱解析之 `PersonStore` 生產實作直接讀 `Account` 實體**（`TypeOrmPersonStore`）；不建 PERSON 表。
（呼應既有 F004 impl 決策：契約 §5.2 僅定義 VW_HPMUSER→ACCOUNT，未定義任何 VW→PERSON。）

此決策使 ORG-PERSON-sync-test.md 之「PERSON 同步」情境（TS-PERSON-001~011、016）由**既有 ACCOUNT
同步涵蓋**（本 worktree 不重寫/不重測 ACCOUNT 同步）；真正新增者為「讀取端 + 名稱解析」
（TS-PERSON-012~015 + NAME-resolution 全部）。`[pending-source]` 的 TS-PERSON-009/010
（`VW_PERSONNEL_SQL` 之 NAME=銀行名 / INNER JOIN 吞人陷阱）**不適用**——來源改為 `VW_HPMUSER`（無此二陷阱）。

### COMPANY 全稱 —— 靜態對映，不做 VW_HRCOMF 同步
定案：上游無公司全稱來源；採靜態 `COMPID→全稱`（`AS＝和潤企業股份有限公司`）。
→ 覆寫 ORG-COMPANY-sync-test.md 之「VW_HRCOMF 同步」前提；不建 COMPANY 實體/同步/reader。
新增 `resolveCompanyName()`（純函式）滿足消費端 TS-COMPANY-009/010；多公司改設定表／上游為 TODO。

### Session 擴充 —— NO PII in JWT
定案（覆寫 SESSION-extension-test.md 之 TS-SESSION-001/002「進 JWT」假設）：
`orgCode/name/employeeNo` **不進 signed JWT**（client 可解碼 payload＝PII 揭露；且避免陳舊）。
改擴 `CurrentAccount`（SessionGuard 本就每請求查 DB），由 guard 以 DB 現行值填入 request-context 之
`SessionUser`，經 `/auth/me` 提供。身分快照之權威＝DB 現行值（與 roleCode「即時生效」一致，取
TS-SESSION-008 路徑）。既有 4 claim 之 issue/verify 邏輯不變（PII 本就未被 issue() 映射）。

### 讀取端點 RBAC —— reuse 既有唯讀權限，不新增 F025 key
以 `FunctionKey.PUBLIC_BROWSING`（前台瀏覽，五角色皆 READ）閘門 ORG/PERSON 讀取端點：
F019 前台部門篩選需覆蓋全部 5 角色；F014 編輯權限（僅 ICSOPAdmin）於各自寫入端點另行把關。
未新增 F025 key（避免臆造 spec 值、且 function-matrix.spec 有全列 toEqual 把關）。
未登入 → 401（SessionGuard）。人員搜尋之更細角色範圍（OQ-PERSON-4/OQ-ORGREAD-2）＝spec 待定，見下方回報。

## Test Results Summary

| Scenario | 說明 | 狀態 |
|---|---|---|
| TS-DESCFULL-001~003 | normalizeDept 保留/trim/null descFull | PASS |
| TS-DESCFULL-004 | classifyOrgUnit 納入 descFull（迴歸缺口修正）→ update | PASS |
| TS-DESCFULL-005/010 | descFull+name 同變 update／僅保存不 fallback | PASS |
| TS-DESCFULL-006 | 既有列 descFull=null → 全量同步自動回填（run 級） | PASS |
| TS-DESCFULL-007/008 | applySync/findOrgUnits 攜帶 descFull／entity nullable nvarchar | PASS |
| TS-DESCFULL-009 | 真實資料回填 | [integration] TODO |
| TS-SESSION-001(改) | issue() 不將 PII 寫入 JWT payload | PASS |
| TS-SESSION-004/014 | 既有 4 欄回歸／長姓名不進 JWT→token 不膨脹 | PASS |
| TS-SESSION-005/006 | DB orgCode/employeeNo=null → sessionUser 反映 null | PASS |
| TS-SESSION-008 | CurrentAccount 擴充 → 每請求 DB 現行值填入（轉調即時反映） | PASS |
| TS-SESSION-012/013 | F019/F020 消費：orgCode string 可餵前綴／name+employeeNo 組浮水印 | PASS |
| TS-SESSION-009/010 | 見「再詮釋」——身分經 /auth/me（guard）交付，非登入 issue | 改寫為 guard 路徑 PASS |
| TS-SESSION-015 | 真實登入後 /auth/me 一致 | [integration] TODO |
| TS-NAMERES-001~012 | 名稱解析（單筆/離職/查無/批次/重複/路徑/5層/消費契約） | PASS |
| TS-COMPANY-009/010 | resolveCompanyName 命中/查無 | PASS |
| TS-COMPANY-001~008/011 | VW_HRCOMF 同步 | 定案改為靜態對映，不實作（見上） |
| TS-ORGREAD-001~008 | list/active-only/cascade/subtree/前綴精確/跳脫/tree | PASS |
| TS-ORGREAD-011/012 | 401 基準（SessionGuard）／五角色可讀（PUBLIC_BROWSING） | PASS |
| TS-ORGREAD-009/010 | 三級樹「公司」對映（雙軌 OQ-ORGREAD-1） | 採方案 A：COMPANY 不混入 ORG_UNIT 回應 |
| TS-ORGREAD-013 | 前綴查詢 index-seek | [integration] TODO |
| TS-PERSON-012~014 | getPerson（含離職）／searchActive（僅在職）／兩端點語意差異 | PASS |
| TS-PERSON-015 | 未登入 → 401 | PASS（SessionGuard 掛載，授權層亦 fail-closed） |
| TS-PERSON-016 | 真實上游同步 | 由既有 ACCOUNT 同步涵蓋；[integration] TODO |

## Files Changed

| File | 類型 | 說明 |
|---|---|---|
| org-sync/normalization.ts | modified | NormalizedOrgUnit +descFull；normalizeDept 產出 |
| org-sync/change-classification.ts | modified | ExistingOrgUnit +descFull；classifyOrgUnit 納入比對（bug fix） |
| org-sync/typeorm-org-sync.store.ts | modified | applySync insert/update + findOrgUnits 攜帶 descFull |
| org-sync/org-descfull.spec.ts | new | DESC_FULL 四層 + entity schema 斷言 |
| org-sync/org-sync.service.spec.ts | modified | fixture 補 descFull + 新增 TS-DESCFULL-006 回填 |
| org-sync/change-classification.spec.ts | modified | srcOrg/localOrg fixture 補 descFull |
| database/entities/org-unit.entity.ts | modified | +descFull（nvarchar200 nullable） |
| database/migrations/1722211200000-org-descfull.ts | new | ORG_UNIT ADD descFull（**僅撰寫不執行**） |
| auth/session-token.service.ts | modified | SessionUser +orgCode/name/employeeNo（選填）；SessionClaims 不變（NO PII） |
| auth/account-repository.ts | modified | CurrentAccount +orgCode/name/employeeNo（選填） |
| auth/session.guard.ts | modified | fresh 以 DB current 填入三欄 |
| auth/typeorm-account.repository.ts | modified | findCurrentByLogin 回傳三欄 |
| auth/session-extension.spec.ts | new | SESSION 擴充（NO PII / DB 為真相 / 消費契約） |
| org-directory/* | new | 名稱解析服務 + 讀取端點 + 靜態公司名 + 兩生產 store + module |
| app.module.ts | modified | 註冊 OrgDirectoryModule |

## 下游 worktree 需要的契約（verbatim）

### NameResolutionService（`org-directory/name-resolution.service.ts`，OrgDirectoryModule 匯出）
```ts
resolvePersonName(employeeNo: string): Promise<string | null>
resolvePersonNames(employeeNos: string[]): Promise<Map<string, string>> // 僅命中鍵；未命中缺席
resolveOrgUnitName(orgCode: string): Promise<string | null>
resolveOrgUnitPath(orgCode: string, separator?: string /* 預設 '/' */): Promise<string | null>
```
### OrgDirectoryService（同模組匯出）
```ts
listOrgUnits(companyCode: string, opts?: { includeInactive?: boolean }): Promise<OrgUnitRecord[]>
orgUnitChildren(parentCode: string, opts?, companyCode='AS'): Promise<OrgUnitRecord[]>
orgUnitSubtree(companyCode: string, codePrefix: string, opts?): Promise<OrgUnitRecord[]>
orgUnitTree(companyCode: string, opts?): Promise<OrgTreeNode[]>
getPerson(employeeNo: string): Promise<PersonRecord | null>       // 含離職者
searchActivePersons(keyword: string, limit?: number): Promise<PersonRecord[]> // 僅在職
```
### 廣義型別
```ts
interface PersonRecord { employeeNo: string; name: string | null; orgCode: string | null;
  employmentStatus: 'active' | 'departed' }
interface OrgUnitRecord { companyCode; orgCode; codePrefix; parentCode: string|null; tier: string;
  name: string; descFull: string | null; managerEmpNo: string | null; isActive: boolean }
interface OrgTreeNode extends OrgUnitRecord { children: OrgTreeNode[] }
resolveCompanyName(companyCode): string | null  // org-directory/company-name.ts（AS=和潤企業股份有限公司）
```
### 擴充後之 SessionUser / CurrentAccount
```ts
interface SessionUser { loginId; email; companyCode; roleCode?;
  orgCode?: string | null; name?: string | null; employeeNo?: string | null } // 新三欄僅 request-context，NOT in JWT
interface CurrentAccount { status; roleCode?;
  orgCode?: string | null; name?: string | null; employeeNo?: string | null }
```
`/auth/me` 回傳之 `req.sessionUser` 於本擴充後即含上述三欄（來源＝每請求 DB 現行值）。

### 讀取端點（RBAC＝SessionGuard + PUBLIC_BROWSING read；未登入 401）
```
GET /org-units?companyCode=AS&includeInactive=false
GET /org-units/tree?companyCode=AS
GET /org-units/children?parentCode=JA000&companyCode=AS
GET /org-units/subtree?companyCode=AS&prefix=JA
GET /persons/search?q=<kw>&limit=20     // 僅在職
GET /persons/:employeeNo                // 含離職者；查無 404 PERSON_NOT_FOUND
```

## `[integration]` 延後（documented TODO）
- 真實 VW_HPMUSER/VW_DEPT_SQL 同步、真實 MSSQL 寫入（TS-*-016、TS-SESSION-015、TS-DESCFULL-009、
  TS-ORGREAD-013 index-seek）——dev 已遮罩，只信結構；本輪以替身測。migration `1722211200000` 僅撰寫未執行。

## 需 spec owner 處理之缺口（本 worktree 不改 shared spec，回報）
1. **data-model.md**：ORG_UNIT 新增 `descFull` 欄（部門全名，← DESC_FULL）需入資料模型；PERSON 實體
   —— 建議標註「本輪由 ACCOUNT 提供人員名冊，不落地獨立 PERSON 表」，jobLevel 等 PERSON 專屬欄
   （VW_PERSONAL_JOB）待 F014 職級需求再定。
2. **F025-role-function-matrix.md**：ORG/PERSON 讀取端點目前 reuse「前台瀏覽」read。若需更細之
   讀取權限（OQ-ORGREAD-2/OQ-PERSON-4，例：人員全表搜尋是否限管理端角色），需新增專屬功能 key。
3. **error-handling.md**：新增讀取端錯誤碼 `PERSON_NOT_FOUND`（404），供 spec 收錄。
4. **feature-status.md**：F014/F006/F026 之後端前置（名稱解析／組織讀取／session 擴充／descFull）
   已就緒，可更新其相依狀態。
