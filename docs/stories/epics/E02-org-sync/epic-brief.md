# Epic E02: 組織同步與異動管理

> **Epic ID**: E02
> **Priority**: P0
> **Phase**: 1（US-013 為 Phase 2）
> **Status**: Draft
> **Stories**: 5 個

## Epic Goal

外部系統以 MSSQL/View 提供當前組織/人員/職級資料。**經 2026-07-20 上游實測，組織實際為 5 層**：「公司 >（多）本部 >（多）部 >（多）處/室 >（多）課」（原假設之 4 層漏計「課」層，實測有 27 個課級單位、166 名在職者）。階層由 5 碼部門代碼之前綴推導，逐碼一層。本 Epic 負責將此外部資料定期（每日排程 + 可手動觸發）同步進本系統，作為帳號、權限、ICSOP 文件當責設定、前台瀏覽排序等功能的資料基礎。

> 上游來源之權威 view、欄位對應、階層推導規則、在職判定與資料品質實測，見 [upstream-hr-source-contract.md](../../../specs/upstream-hr-source-contract.md)。

當人員離職或組織/職級異動時，系統需自動停用離職者帳號（保留稽核歷史，非刪除），並在異動可能影響 ICSOP 文件的制定公司/制定部門/制定室別、當責室長、使用部門設定時提示 ICSOP 管理員重新確認。所有異動與同步狀態需可於後台頁面追蹤。

## User Stories

| Story ID | Title | Priority | File |
|----------|-------|----------|------|
| US-010 | 每日排程同步 | P0 | [US-010-daily-scheduled-sync.md](US-010-daily-scheduled-sync.md) |
| US-011 | 手動觸發同步 | P1 | [US-011-manual-trigger-sync.md](US-011-manual-trigger-sync.md) |
| US-012 | 離職者自動停用帳號 | P0 | [US-012-auto-disable-departed-accounts.md](US-012-auto-disable-departed-accounts.md) |
| US-013 | 組織異動影響文件提示 | P1 | [US-013-org-change-impact-alert.md](US-013-org-change-impact-alert.md) |
| US-014 | 組織人員異動管理後台頁面 | P1 | [US-014-org-change-management-backend.md](US-014-org-change-management-backend.md) |

## Dependencies

**Blocks（本 Epic 完成前，下游功能無法正確運作）**
- [E01 US-001 Azure AD OIDC 登入（靜默 SSO）](../E01-account-auth/US-001-upstream-signature-login.md) — 使用者身分資料（部門/處室/職級）之豐富化依賴組織同步結果
- [E04 US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md) — 欄位選項來源為同步後的組織/人員資料
- [E06 US-050 前台清單與排序規則](../E06-public-browsing/US-050-public-list-sorting.md) — 「使用部門符合者置頂」規則依賴使用者所屬部門資料

**Depends On**
- 無內部 Epic 依賴（基礎性 Epic）。但技術上依賴外部 MSSQL View 之可用性與 schema 穩定性，屬外部系統限制，詳見 [NFR-006 系統整合可靠性](../../non-functional/NFR-006-integration-reliability.md)
- **殘留外部風險（2026-07-20 實測後更新）**：schema 本身已確認，但 (a) 上游 5 碼部門代碼之編碼規則若變更，階層推導與權限前綴比對將全面失效；(b) `VW_HPMUSER` 為 `SELECT *` 定義，上游加欄會無聲漂移 → 同步須做欄位集合防禦性檢查。見 [upstream-hr-source-contract.md](../../../specs/upstream-hr-source-contract.md) §11。

## Success Criteria

- 每日排程同步可在無人工介入下穩定執行，同步結果可追溯（成功/失敗、異動筆數）
- 系統管理員可隨時手動觸發同步並即時看到執行狀態
- 離職者於同步後立即無法登入，既有 session 失效，但歷史稽核紀錄完整保留
- 組織異動導致的 ICSOP 文件當責設定風險，能在後台清單中被看見，不會被靜默忽略
- 同步失敗不會造成既有帳號、組織資料、ICSOP 文件當責設定損毀或遺失

## Open Questions

> **本 Epic 之 Open Questions 已全數定案**（前四項於 2026-07-17 訪談定案、schema 於 2026-07-20 實測定案），保留於此供追溯。完整決策紀錄見 [open-questions.md](../../../specs/open-questions.md)。

- [x] **外部 MSSQL View 的確切 schema**（OQ-E02-01 ✅ 2026-07-20）— 已完成 dev 環境唯讀實測盤點（資料已遮罩；結構性結論可信，值層級統計待正式環境覆核）。權威來源＝`VW_DEPT_SQL`（組織）／`VW_HPMUSER`（帳號，11 欄白名單）／`VW_HRCOMF`（公司）／`VW_PERSONAL_JOB`＋`VW_JOB_FUN`（職稱/職務功能）；穩定鍵＝`(COMPID, USERID)`；增量欄位＝`MTDT`；在職判定＝`EMPSTS='A'`；哨兵日期＝`9999-12-31`。詳見 [upstream-hr-source-contract.md](../../../specs/upstream-hr-source-contract.md)。殘留未結項（最小欄位 view、AD/AJ 資料補齊等）見該契約 §11。
- [x] **每日排程執行時間、時區、重試策略**（OQ-E02-02 ✅）— 每日凌晨 **02:00 (UTC+8)**；失敗 **3 次遞增間隔**重試。
- [x] **組織異動觸發之「當責重新指派」提示是否需簽核**（OQ-E02-03b ✅）— **非強制提示**，比照「無簽核流程」精神，不阻擋續編。
- [x] **大幅轉調（非離職）是否比照離職等級警示**（OQ-E02-06 ✅）— 產生**待確認提示，不停用帳號**。
- [x] **同步失敗/逾時之通知管道**（OQ-E02-05 ✅）— **站內＋Email 通知系統管理員**。
