# US-010: 每日排程同步

> **Story ID**: US-010
> **Epic**: [E02 組織同步與異動管理](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 8

## User Story

As a 系統管理員，
I want 系統每日自動依排程從外部 MSSQL View 同步組織架構（公司/本部/部/處室）與人員/職級資料，
So that 本系統內的部門、人員、職級資訊能維持與外部人資系統一致，作為帳號、權限與 ICSOP 文件當責設定的正確基礎。

## Acceptance Criteria

**AC1: 排程正常執行並更新資料**
- Given 系統排程已設定啟用，且外部 MSSQL View 可正常連線
- When 排程時間到達
- Then 系統自動讀取 View 中的組織架構與人員/職級資料，並將異動（新增/修改/刪除對應狀態）反映至本系統資料庫，同時產出一筆同步執行紀錄（開始時間、結束時間、結果、異動筆數）

**AC2: 無異動時不產生無意義變更**
- Given 外部來源資料自上次同步後未發生變化
- When 排程執行同步
- Then 系統比對後判定無異動，仍記錄一筆「執行成功、異動筆數為 0」的同步紀錄，但不對組織/人員資料表產生實際寫入異動

**AC3: 同步異常時不損毀既有資料**
- Given 外部 MSSQL View 於同步過程中逾時、連線失敗或回傳資料格式異常
- When 排程執行同步
- Then 系統中止本次同步、保留同步前的既有組織/人員資料不變、記錄一筆「失敗」狀態的同步紀錄並附上錯誤訊息，供 [US-014](US-014-org-change-management-backend.md) 後台頁面顯示

**AC4: 增量識別與異動分類**
- Given 外部資料相較上次同步有新增部門、新增人員、人員異動（部門/職級/在職狀態變更）
- When 排程執行同步
- Then 系統依 `VW_HPMUSER.MTDT` 增量識別人員/帳號異動；組織階層（`VW_DEPT_SQL`）每次全量取回並整批比對（不做增量）；系統需能分類辨識「新增」「更新」「離職/停用」三種異動類型，離職/停用類型另觸發 [US-012](US-012-auto-disable-departed-accounts.md) 之帳號停用流程（在職判定權威欄位為 `EMPSTS='A'`，不得以人員消失於來源資料逕行判定為離職，見 AC5 與 [US-012 AC5](US-012-auto-disable-departed-accounts.md)）

**AC5: 消失筆數閾值保護（中止同步，不執行任何停用）**
- Given 本次同步比對後，「上次同步時仍為在職」之帳號中，於本次來源資料（`VW_HPMUSER`）消失之比例超過閾值（草案 **5%**，實際值待系統管理員審核定案）
- When 系統執行同步比對
- Then 系統**中止本次同步、不執行任何帳號停用**、保留同步前既有帳號狀態不變，並產生一筆「中止」狀態之同步紀錄（含消失筆數/比例）與告警通知系統管理員，避免因上游來源資料異常（如 join 條件變動、連線異常等，見[上游人資來源資料契約 §3.2/§7.3](../../../specs/upstream-hr-source-contract.md)）導致大規模誤停用

## Technical Notes

- 同步邏輯建議實作為冪等（idempotent）操作，可安全重複執行而不產生重複資料
- 資料寫入建議使用資料庫交易（transaction），確保單次同步的資料一致性（全部成功或全部回滾）
- 排程機制可採用 NestJS 內建 `@nestjs/schedule` 或系統層 cron，需可透過設定調整執行時間
- 需與 [NFR-006 系統整合可靠性](../../non-functional/NFR-006-integration-reliability.md) 之重試/通知規則對齊
- 外部資料來源為唯讀 MSSQL View，本系統僅為讀取方，不回寫外部系統
- **權威來源物件**（2026-07-20 上游 dev 環境唯讀實測定案；資料已遮罩）：組織階層 `VW_DEPT_SQL`、帳號/在職狀態 `VW_HPMUSER`（僅取白名單 11 欄，禁讀密碼與非必要個資欄位）、公司主檔 `VW_HRCOMF`，皆經 linked server 以四段式命名存取（`[APYHFC23].[HR2].[dbo].[<view>]`）；因跨 server collation 不相容（`is_collation_compatible = False`），彙總/過濾邏輯須以 `OPENQUERY` 下推至對端執行，否則會整表拉回本地端比對，詳見[上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)
- 組織階層之「層級」不可用 view 提供的 `TOP_DEPTID`／`DEPARTMENT`／`CAPITAL` 欄位判定（實測皆不可靠），須改以 5 碼部門代碼前綴推導層級與上層代碼（見上游人資來源資料契約 §3.5）

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-010-01 | 外部 View 有 3 筆新增人員、2 筆部門異動，執行排程後，本系統資料正確反映全部 5 筆異動，且同步紀錄顯示成功與正確異動筆數 | Happy Path |
| TC-010-02 | 模擬外部 MSSQL View 連線逾時，執行排程後，系統記錄失敗狀態、既有組織/人員資料表內容與同步前完全一致（逐筆比對無變化） | Error Case |
| TC-010-03 | 外部 View 回傳資料中含有欄位型別不符（如日期格式錯誤）的髒資料，系統應中止該筆寫入並記錄警告，不影響其他正常筆數的同步 | Error Case |
| TC-010-04 | 連續兩次排程執行間外部資料完全無變化，第二次同步紀錄應顯示異動筆數為 0 且不產生資料庫寫入操作（可透過檢查 updated_at 未變動驗證） | Edge Case |
| TC-010-05 | 同步執行途中系統被強制中斷（模擬服務重啟），下次排程執行時應能正確接續而不產生資料重複或遺漏 | Edge Case |
| TC-010-06 | 模擬本次同步在職帳號消失比例達 6%（超過草案 5% 閾值），系統應中止同步、不執行任何帳號停用、既有帳號狀態與同步前完全一致，並產生「中止」狀態同步紀錄與告警 | Error Case |

## Dependencies

**Blocked By**
- 外部 MSSQL View 需已建置並可連線（外部系統前置條件，非本系統開發範圍）

**Blocks**
- [US-011 手動觸發同步](US-011-manual-trigger-sync.md) — 共用同步核心邏輯
- [US-012 離職者自動停用帳號](US-012-auto-disable-departed-accounts.md) — 依賴本 Story 判定之離職異動
- [US-013 組織異動影響文件提示](US-013-org-change-impact-alert.md) — 依賴本 Story 判定之異動清單
- [E04 US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md) — 依賴同步後的組織/人員資料作為選項來源

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing（覆蓋率 >80%，含交易回滾情境）
- [ ] Code review approved
- [ ] Documentation updated

## Related

- Epic: [E02 組織同步與異動管理](epic-brief.md)
- NFR: [NFR-006 系統整合可靠性](../../non-functional/NFR-006-integration-reliability.md)
- NFR: [NFR-004 可用性與備援](../../non-functional/NFR-004-availability-backup.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)（權威來源物件、欄位對應、同步策略定案）
