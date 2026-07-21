# US-030: 建立 ICSOP 文件

> **Story ID**: US-030
> **Epic**: [E04 ICSOP 文件管理](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a **ICSOP 管理員**,
I want **建立一筆新的 ICSOP 文件（建立時僅需核心 4 欄，其餘可稍後以編輯補齊）**,
So that **該文件可被歸入指定循環／節點，並於前台正確被瀏覽與使用**。

## Acceptance Criteria

**AC1 — 建立文件（必填僅 4 欄）**
- Given 我是已登入的 ICSOP 管理員，位於「ICSOP 文件管理」建立頁面
- When 我填妥 4 項必填（所屬循環／循環別、文件狀態〔下拉，預設有效〕、ICSOP 文件編號、文件名稱），其餘欄位（制定組織、當責室長、使用部門、版次、公告日期、內容摘要、附件、連結點）留白或選填
- Then 系統產生系統 UUID（唯讀），成功儲存該筆文件；未填之非必填欄位不阻擋建立

**AC2 — 必填欄位驗證（4 欄）**
- Given 我在建立頁面
- When 我未填寫 4 項必填之任一（所屬循環、文件狀態、ICSOP 文件編號、文件名稱）即送出
- Then 系統阻擋儲存並於對應欄位顯示錯誤訊息（`DOCUMENT_REQUIRED_FIELD_MISSING`），不產生新記錄

**AC3 — 所屬節點欄位的建立當下狀態**
- Given 我已選定所屬循環
- When 我尚未於 [E03 DAG 節點抽屜](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md) 中將此文件指派至任一節點
- Then 系統允許文件以「所屬節點未指派」狀態被建立與儲存，並於後台清單（[US-037](US-037-backend-document-list-search.md)）標示此狀態，待後續由節點抽屜完成指派

**AC4 — 文件編號唯一性檢查**
- Given 我輸入的 ICSOP 文件編號已存在於系統中
- When 我送出建立表單
- Then 依 [US-033](US-033-document-number-uniqueness.md) 規則阻擋儲存並提示重複

## Technical Notes

- 所屬循環下拉選單資料來源為 [E03 循環池 CRUD](../E03-lifecycle-dag/US-020-lifecycle-pool-crud.md)
- 制定公司／制定部門／制定室別／當責室長／使用部門下拉選單資料來源為 [E02 組織同步](../E02-org-sync/US-010-daily-scheduled-sync.md) 之組織與人員資料
- 制定三級**由上而下**（公司 > 部 > 處/室）：先選制定公司 → 篩選其下制定部門 → 篩選其下制定室別；上層變更清空下層。制定組織於建立時為非必填
- 版次為兩段式字串 `{YY}'{NN}`（年度＇序號，如 `26'01`）；公告日期為單一日期欄位，決定有效文件於清單顯示為「已公告」（已過）或「進度中」（未到）
- 建立當下不強制上傳 ICSOP PDF／OJT 簽到表／使用表單，附件上傳為獨立流程（[US-036](US-036-pdf-ojt-attachment-upload.md)、[E05](../E05-usage-form/epic-brief.md)），但需在 Open Question 中確認是否允許「無附件」的文件存在於有效狀態
- **所屬節點的權威維護入口（定案）**：文件表單僅提供「所屬循環」選擇（必填）；「所屬節點」不在文件表單設定，一律透過 [E03 US-023 節點抽屜](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md) 掛載／改派——節點抽屜為「所屬節點」的唯一權威寫入路徑
- 欄位權限依 [E08 US-071 角色×欄位權限矩陣](../E08-permission-matrix/US-071-role-field-matrix.md) 限制可編輯角色
- 建立動作應觸發稽核記錄（見 [E07](../E07-audit-trail/epic-brief.md)）

## Test Cases

- **TC-030-01（Happy Path）**：僅填 4 項必填（循環別／文件狀態／編號／文件名稱）、其餘欄位留白，送出後成功建立、產生 UUID
- **TC-030-06（Edge — 未填公告日期）**：建立時未填公告日期，儲存成功，該文件於清單顯示為「進度中」（前台一般使用者不可見）
- **TC-030-02（Error — 必填欄位缺漏）**：未填 ICSOP 文件編號即送出，系統阻擋並提示
- **TC-030-03（Error — 編號重複）**：輸入已存在編號送出，系統阻擋並提示重複
- **TC-030-04（Edge — 未指派節點）**：建立文件時不指定所屬節點，儲存成功但清單標示「未指派節點」
- **TC-030-05（Edge — 多位次要室長）**：新增 3 位當責室長－次要，儲存後三者皆正確關聯

## Dependencies

**Blocked By**:
- [E03 US-020 循環池 CRUD](../E03-lifecycle-dag/US-020-lifecycle-pool-crud.md)（所屬循環選單需先有資料）
- [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md)

**Blocks**:
- [US-031 編輯與版本對照](US-031-edit-with-comparison.md)
- [US-032 文件狀態切換](US-032-status-toggle.md)
- [US-033 文件編號唯一性管理](US-033-document-number-uniqueness.md)
- [US-034 制定組織與當責室長設定](US-034-accountable-dept-chief-assignment.md)
- [US-035 文件連結點管理](US-035-document-cross-link.md)
- [US-036 PDF 與 OJT 附件上傳](US-036-pdf-ojt-attachment-upload.md)
- [E03 US-023 節點抽屜維護](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md)（文件需先存在才能被節點抽屜選取）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E04 ICSOP 文件管理](epic-brief.md)
- [NFR-002 資訊安全與身分驗證](../../non-functional/NFR-002-security.md)
