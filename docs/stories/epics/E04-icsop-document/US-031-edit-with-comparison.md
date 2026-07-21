# US-031: 編輯與版本對照

> **Story ID**: US-031
> **Epic**: [E04 ICSOP 文件管理](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a **ICSOP 管理員**,
I want **編輯既有 ICSOP 文件時看到目前版本的欄位值與我正輸入的新值並列對照**,
So that **我能在儲存前確認變更內容是否正確，避免誤改**。

## Acceptance Criteria

**AC1 — 對照顯示**
- Given 我開啟一筆既有 ICSOP 文件的編輯頁面
- When 頁面載入完成
- Then 每個可編輯欄位皆同時顯示「目前值」與「輸入中新值」兩欄，供我對照

**AC2 — 儲存覆蓋、不留歷史**
- Given 我已修改若干欄位並確認對照內容無誤
- When 我送出儲存
- Then 系統以新值覆蓋原記錄，不產生歷史版本檔案，且系統 UUID 維持不變

**AC3 — 取消編輯不影響原資料**
- Given 我已修改部分欄位但尚未送出
- When 我點擊取消或離開頁面
- Then 原資料不受影響，欄位值維持編輯前狀態

## Technical Notes

- 版本策略：僅保存當前版本，無歷史版本表，符合已定案決策（不做 soft version 或 audit-log 式版本快照）
- 當前版本對照涵蓋之欄位以 [E04 文件欄位權威定義](epic-brief.md) 為準；本次欄位調整後含制定公司、制定部門、制定室別、內容摘要、版次（`{YY}'{NN}`，如 `26'01`）、公告日期，已移除當責部門（發布日期→公告日期、人為版本號→版次）
- 對照 UI 建議以 side-by-side 或 diff highlight 呈現，變更欄位需視覺標示（如高亮）
- 欄位層級可編輯性依 [E08 US-071 角色×欄位權限矩陣](../E08-permission-matrix/US-071-role-field-matrix.md) 控制，唯讀欄位（如系統 UUID）不可進入編輯狀態
- 編輯送出動作需觸發稽核記錄（見 [E07](../E07-audit-trail/epic-brief.md)）

## Test Cases

- **TC-031-01（Happy Path）**：修改版次並送出，儲存成功，清單顯示新版次，UUID 不變
- **TC-031-02（Happy Path）**：開啟編輯頁面，確認所有欄位皆呈現「目前值/新值」對照
- **TC-031-03（Error）**：修改後的編號違反唯一性規則，依 [US-033](US-033-document-number-uniqueness.md) 阻擋儲存，原資料不受影響
- **TC-031-04（Edge）**：取消編輯後重新開啟編輯頁，欄位值應為編輯前之原始值（確認未被暫存的中間輸入污染）

## Dependencies

**Blocked By**:
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)

**Blocks**: 無直接下游 story，但為 [US-032](US-032-status-toggle.md)、[US-034](US-034-accountable-dept-chief-assignment.md)、[US-035](US-035-document-cross-link.md) 之欄位編輯提供共用的編輯/對照 UI 基礎

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E04 ICSOP 文件管理](epic-brief.md)
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)
