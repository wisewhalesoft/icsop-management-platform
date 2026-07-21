# Epic E08: 權限矩陣

> **Epic ID**: E08
> **Priority**: P0
> **Phase**: 1
> **Status**: Draft
> **Stories**: 2 個

## Epic Goal

由分析師提出「角色 × 功能」與「角色 × 欄位」兩份權限矩陣**草案**，作為後續開發實作與使用者／利害關係人審核之基礎。這兩份矩陣是全系統權限控管的核心依據，所有其他 Epic 的後台功能與 ICSOP 文件欄位存取都必須遵循此矩陣。

**重要聲明**：本 Epic 產出之矩陣為分析師依原始需求（i、j 項：「需定義角色權限矩陣」）所做的**草案**，原始需求僅要求「定義矩陣」，未提供矩陣的實際內容。草案內容於各 Story 之 Open Questions 中已標註待確認項目；依 [open-questions.md](../../../specs/open-questions.md) OQ-E08-02 定案，**開發不因等待正式審核而阻塞**——採現行草案作為開發依據，正式審核／簽核可與開發並行進行，如有調整再依 F025 AC「矩陣審核後更新版本」處理。

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-070 | 角色×功能權限矩陣草案 | P0 | [US-070-role-function-matrix.md](US-070-role-function-matrix.md) |
| US-071 | 角色×欄位權限矩陣草案 | P0 | [US-071-role-field-matrix.md](US-071-role-field-matrix.md) |

## Dependencies

**Depends On**：
- [E01 US-005 帳號管理 CRUD](../E01-account-auth/US-005-account-management.md) / [US-006 角色指派管理](../E01-account-auth/US-006-role-assignment.md) — 5 種角色需先定義存在。
- [E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md) — 文件欄位清單需先定義，US-071 才能逐欄位定義權限。

**Blocks**：
- 幾乎所有其他 Epic 的寫入型（Create/Update/Delete）操作，皆需依本 Epic 矩陣於 API 層做權限判斷。

## Success Criteria

- 產出可直接轉換為 API 層授權邏輯（如 RBAC middleware 設定）的矩陣文件。
- 矩陣涵蓋 5 種角色 × 全部後台功能模組，以及 5 種角色 × ICSOP 文件全部欄位。
- 所有草案假設均有 Open Questions 標註，避免被誤認為已定案需求。

## Open Questions

> **本 Epic 之 Open Questions 已全數定案**，保留於此供追溯。完整決策紀錄見 [open-questions.md](../../../specs/open-questions.md)。

- [x] （已定案）「主管」「部門窗口」對 ICSOP 文件管理**皆唯讀**，僅 ICSOP 管理員可編輯。
- [x] （已定案 2026-07-16）**系統管理員**對循環管理／ICSOP 文件管理／文件使用表單管理及所有文件欄位**比照主管為唯讀**（可查不可改、無寫入權）；**主管無「文件使用表單管理」與「文件調閱歷程查詢」權限**。原「當責部門系統管理員例外」一併收斂為唯讀。
- [x] （已定案 2026-07-17，OQ-E08-03）**主管「循環管理（DAG）」可視範圍由「唯讀（本部門相關）」改為「唯讀」（全公司）**，與主管對 ICSOP 文件管理之全公司唯讀範圍一致；主管對循環仍唯讀、不可編輯。詳見 [US-070](US-070-role-function-matrix.md)。
- [x] **矩陣其餘部分是否需經正式審核後才能作為開發依據**（OQ-E08-02 ✅）— **定案**：**採現行草案作為開發依據**（不阻塞實作），待利害關係人正式簽核；簽核如有調整，再依 F025 AC「矩陣審核後更新版本」處理。**此決定不等於矩陣內容本身已完成利害關係人正式審核**，僅代表「開發不必等審核完成」，兩件事分開處理。
