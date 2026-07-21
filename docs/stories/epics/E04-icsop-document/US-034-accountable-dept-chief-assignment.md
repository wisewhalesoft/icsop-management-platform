# US-034: 制定組織與當責室長設定

> **Story ID**: US-034
> **Epic**: [E04 ICSOP 文件管理](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a **ICSOP 管理員**,
I want **維護文件的制定公司／制定部門／制定室別、當責室長（主要／次要）與文件使用部門**,
So that **文件的組織歸屬、責任歸屬與使用範圍能正確對應目前組織架構**。

## Acceptance Criteria

**AC1 — 欄位維護**
- Given 我編輯一筆 ICSOP 文件
- When 我從組織資料下拉選單中選擇制定公司（1 個）、制定部門（1 個）、制定室別（1 個）、當責室長－主要（1 位）、當責室長－次要（可多位）、文件使用部門（可多個）
- Then 系統成功儲存並正確關聯至對應的組織/人員記錄

**AC2 — 選單資料來源為最新同步之組織資料**
- Given 組織資料已透過 [E02 每日排程同步](../E02-org-sync/US-010-daily-scheduled-sync.md) 更新
- When 我開啟制定組織/當責室長選單
- Then 選單呈現的是最新一次同步後的部門/人員清單，不含已停用（離職）人員

**AC3 — 組織異動提示入口**
- Given 系統偵測到與本文件制定組織/當責室長/使用部門相關的組織異動（見 [E02 US-013](../E02-org-sync/US-013-org-change-impact-alert.md)）
- When 我開啟本文件之編輯頁面
- Then 系統於相關欄位旁顯示提示標記，並提供快速重新設定的操作入口

**AC4 — 制定三級聯動**
- Given 我在編輯頁選擇「制定室別」
- When 選取完成
- Then 系統依組織階層自動帶入其所屬「制定部門」與「制定公司」

## Technical Notes

- 制定公司／制定部門／制定室別為三級組織欄位，皆對應 ORG_UNIT；選擇下層（室別）可依組織階層回溯自動帶入上層（部門/公司）
- 當責室長－次要為多選欄位，需支援新增/移除多筆
- 組織架構層級：公司 >（多）本部 >（多）部 >（多）處/室，選單應依此層級呈現以利選取（見 [E02](../E02-org-sync/epic-brief.md)）
- 已離職或已停用帳號之人員不應出現在「當責室長」可選清單中（見 [E02 US-012](../E02-org-sync/US-012-auto-disable-departed-accounts.md)）

## Test Cases

- **TC-034-01（Happy Path）**：設定制定公司、制定部門、制定室別、主要室長、2 位次要室長、3 個使用部門，全部成功儲存
- **TC-034-02（Error）**：嘗試選擇已停用（離職）人員作為當責室長，系統阻擋或於選單中不顯示該人員
- **TC-034-03（Edge）**：組織異動後開啟已受影響文件的編輯頁，正確顯示提示標記
- **TC-034-04（Edge）**：移除全部次要室長（保留主要室長），儲存成功且欄位允許為空集合
- **TC-034-05（Happy Path — 制定三級聯動）**：選擇制定室別後，系統自動帶入其所屬制定部門與制定公司

## Dependencies

**Blocked By**:
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)
- [E02 US-010 每日排程同步](../E02-org-sync/US-010-daily-scheduled-sync.md)

**Blocks**:
- [E02 US-013 組織異動影響文件提示](../E02-org-sync/US-013-org-change-impact-alert.md)（此欄位是被提示對象）

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E04 ICSOP 文件管理](epic-brief.md)
- [E02 組織同步與異動管理](../E02-org-sync/epic-brief.md)
