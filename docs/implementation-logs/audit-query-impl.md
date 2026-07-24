---
type: implementation-log
feature_id: F024
feature_name: 文件調閱歷程查詢後台（audit-query 畢業）
worktree: icsop-audit-query（branch feature/audit-query）
status: complete
last_updated: 2026-07-24
---

# F024 audit-query — 實作紀錄（畢業：WHERE 下推＋索引＋整合驗證＋前端保真）

> 上游設計：`docs/specs/test-design/audit-query-test-design.md`（12 must-pass int + P95 + 3 前端案例）。
> 嚴格 TDD：先寫失敗測試、觀察其紅、再實作至綠；未弱化任何既有斷言。

## 一、測試結果總覽

### 後端單元（`npx jest`，src/**/*.spec.ts）
| 檔案 | 內容 | 狀態 |
|---|---|---|
| `access-history-pushdown.spec.ts`（新增） | `resolveAuditQuerySpec` 正規化（30 天預設/kind 對映/分頁預設）、`likeContains` 轉義、`localDayStart`/`localDayEndExclusive` 日界、`queryHistory` 委派 `store.queryPage`（不走全表 `listAll`） | PASS（12 tests） |
| `access-history-filter.spec.ts`（既有，未改斷言） | `resolveAuditQuery` 純函式（重構為共用 `resolveAuditQuerySpec`，行為不變） | PASS |
| `audit-writer.service.spec.ts`（既有，+queryPage） | 補 `FakeAuditStore.queryPage`＋結構性防禦測試加斷言 `queryPage` 為 function | PASS |
| `access-history.controller.spec.ts`（既有） | RBAC/路由/匯出委派 | PASS |
| 全套件 | 95 suites / 1094 tests（baseline 94/1082 → +1 suite/+12 tests） | **全綠** |

### 後端整合（`backend/test/int/access-history.itest.ts`，新增；由 orchestrator 合併後序列跑，本 worktree **未執行**）
| Scenario ID | 描述 | must-pass |
|---|---|---|
| TS-AQ-INT-001/005 | 空條件套近 30 天預設（admin 200）；含當次、不含 35 天前歷史列 | ✅ |
| TS-AQ-INT-002 | kind=文件&target=當次 → 僅 DOCUMENT（VIEW+DOWNLOAD） | ✅ |
| TS-AQ-INT-003 | kind=循環&target=循環名 → 僅 LIFECYCLE、lifecycleName 正確 | ✅ |
| TS-AQ-INT-004 | kind=變更&target=當次 → DOCUMENT_CHANGE_LOG/CHANGE_LOG_VIEW | ✅ |
| TS-AQ-INT-006 | 真 User session → 403 PERMISSION_DENIED（真實 guard chain） | ✅ |
| TS-AQ-INT-007 | 未登入 → 401 | ✅ |
| TS-AQ-INT-008 | 匯出遵循查詢條件（與 TS-002 一致） | ✅ |
| TS-AQ-INT-009 | 匯出角色守門同查詢 → 403 | ✅ |
| TS-AQ-INT-010 | 展開 VIEW 列：非空浮水印快照＋身分快照一致（含 company=和潤企業股份有限公司、accountId、roleCode） | ✅ |
| TS-AQ-INT-011 | 展開 CHANGE_LOG_VIEW：watermarkSnapshot=null、documentNumber 有值、**targetName 已填**（跨 track 依賴，見四） | ✅（依賴 doc-changelog 已併入） |
| TS-AQ-INT-012 | 合成 orgCode → department/section 優雅回 null | ✅ |
| TS-017 | 迴歸警戒：~300 雜訊列中 target 鎖定 3 訊號列 → 恰 3 筆且 <5000ms（**非** P95 合規證明） | ✅ |
| TS-018 | 跨年度 datetime2 往返：窄查回 2 筆、全查回 4 筆、皆新到舊且值精確 | ✅ |
| TS-AQ-PERF-001 | WHERE 下推之結構性檢查點（見三，code-review，非自動化斷言） | 見報告 |

### 前端（`npx vitest run`）
| Scenario ID | 描述 | 狀態 |
|---|---|---|
| TS-AQ-FE-001 | 操作類型 pill 顏色依 actionType（DOWNLOAD=blue、LIFECYCLE_VIEW=emerald，逐字 ACT_STYLE） | PASS |
| TS-AQ-FE-002 | 展開後箭頭 chevron-right → chevron-down（修死三元） | PASS |
| TS-AQ-FE-003 | 超過一頁 → 換頁控制項；下一頁 page+1 重查；末頁停用下一頁 | PASS |
| `Icon.registry.test.tsx` | 圖示註冊守門（未引入新圖示；chevron-down/right 皆已註冊） | PASS |
| 全套件 | 35 files / 377 tests（baseline 35/374 → +3 tests） | **全綠** |

### 型別
- 後端 `npx tsc --noEmit`：clean（src）。int 檔另以 throwaway tsconfig（含 test/**）驗證 clean。
- 前端 `npx tsc --noEmit`：clean。

## 二、Store 介面變更（OQ-AQ-01 核心修正）

**簽章**：於 `AuditStore` 介面（`backend/src/audit/audit.types.ts`）**新增必填方法**
```ts
queryPage(scope: AuditQueryScope, filters: AuditQueryFilters): Promise<Page<AuditRow>>;
```
並新增共用型別 `ResolvedAuditQuery`（filters 正規化後之下推規格）。`listAll` 保留（不可竄改結構性防禦
TS-012 斷言其存在）但**移出查詢熱路徑**、標註為非 F024 查詢用（避免隨 NFR-003 保留 ≥3 年累積而全表掃描/OOM）。

**下推內容**（`TypeOrmAuditStore.queryPage`，QueryBuilder）：
- kind → `targetType IN (:...types)`（新索引支援 seek）；
- `occurredAt >= localDayStart(from)` 且 `< localDayEndExclusive(to)`（本地日界，排他上界＝「含當日整天」，
  與記憶體版 `ymd()` 語意一致；以 Date 參數綁定，經 tedious 與 occurredAt 之 datetime2 同尺度比對）；
- person → `LOWER(name)/LOWER(employeeNo) LIKE :p ESCAPE '\'`；target → documentNumber/lifecycleName/targetName 三欄 LIKE；
- `ORDER BY occurredAt DESC, id ASC`（id 為決定性次鍵 → 分頁穩定不遺漏/重複）；
- `OFFSET/FETCH`（`.skip().take()`）＋ `getManyAndCount()` 之 SQL COUNT → total；僅回當頁列。

**共用正規化**：`resolveAuditQuerySpec(filters, now)` 為 SQL 下推與記憶體版 `resolveAuditQuery` 之單一來源
（30 天預設、kind 對映、分頁預設、appliedDefaultRange），確保兩路徑對相同 filters 結果一致。
`queryHistory` 由「listAll + resolveAuditQuery」改為「委派 store.queryPage」。

**相容處置**：唯二 `implements AuditStore` 者＝`TypeOrmAuditStore`（實作 queryPage）與 `FakeAuditStore`
（audit-writer.service.spec.ts，補 queryPage 委派 resolveAuditQuery，行為與舊路徑一致）。controller 已早有
`page`/`pageSize` 轉發，無需改動。

## 三、索引 Migration 與 migration:run 結果

**檔案**：`backend/src/database/migrations/1723075200000-audit-log-kind-index.ts`
- up: `CREATE INDEX [IX_AUDIT_LOG_targetType_occurredAt] ON [AUDIT_LOG] ([targetType],[occurredAt])`（IF NOT EXISTS 冪等）
- down: 對稱 DROP（IF EXISTS）
- 鍵序：等值鍵 targetType 在前（低基數 IN seek）、範圍/排序鍵 occurredAt 在後（免額外 Sort）。
- 時間戳 `1723075200000` 為本 track 保留；**刻意跳過 `1722988800000`（doc-changelog track 佔用）避免檔名碰撞**。
- entity 同步加 `@Index('IX_AUDIT_LOG_targetType_occurredAt', ['targetType','occurredAt'])`。

**實跑（我方對真 SOP 執行）**：`cd backend && npm run migration:run`
→ 輸出：`18 migrations are already loaded`、`SyncRunAccountStats1722902400000 is the last executed`、
`1 migrations are new` → 執行 `CREATE INDEX ...`（IF NOT EXISTS 通過）→ INSERT migrations 列 →
`Migration AuditLogKindIndex1723075200000 has been executed successfully` → COMMIT。
**索引已實際建立於真 SOP 之 AUDIT_LOG**。TS-AQ-PERF-001（WHERE/ORDER/OFFSET 產生之 SQL）屬 code-review
檢查點——queryPage 已以 QueryBuilder 產生帶 WHERE/ORDER BY/OFFSET-FETCH 之 SQL（可 `.getSql()` 本地核）。

## 四、targetName 跨 track 依賴狀態（TS-AQ-INT-011）

- 現行 `document-change-history.service.ts::viewDocument()` 之 `recordAccess()` **未設 targetName** →
  變更類稽核列 targetName=null（前端展開「對象名稱／說明」顯示「—」）。此為 **doc-changelog track 之寫入端**
  正在修正之項（會於 change-history recordAccess 補上描述文字）。**本 worktree 未觸碰該檔（越界禁區）**，僅讀取結果。
- 依 launching prompt 指示，TS-AQ-INT-011 斷言**修正後之終態＝targetName 非空字串**（非原設計文件之 null 回歸基準）。
  斷言採 `toBeTruthy()`＋`typeof === 'string'`（不硬綁特定文案），對 doc-changelog 選用之描述文字/文件名皆穩健。
- **執行前提**：本 int 檔僅於合併後之序列 int pass 執行（doc-changelog 已併入）→ targetName 屆時已有值。
  若序列 pass 執行時 doc-changelog 尚未併入，此單一斷言將紅——屬**預期之跨 track 相依訊號**，非 read-side 缺陷。

## 五、Files Changed
| 路徑 | 類型 | 說明 |
|---|---|---|
| `backend/src/audit/audit.types.ts` | modified | 新增 `ResolvedAuditQuery` 型別＋`AuditStore.queryPage`；未改 AuditKind/AuditTargetType 值集 |
| `backend/src/audit/access-history-filter.ts` | modified | 抽出 `resolveAuditQuerySpec`＋`buildAuditPage`；新增 `likeContains`/`localDayStart`/`localDayEndExclusive`；`resolveAuditQuery` 重構為共用（行為不變） |
| `backend/src/audit/typeorm-audit.store.ts` | modified | 實作 `queryPage`（SQL 下推）；`listAll` 標註非查詢路徑 |
| `backend/src/audit/audit-writer.service.ts` | modified | `queryHistory` 委派 `store.queryPage`（移除全表 listAll+resolveAuditQuery） |
| `backend/src/audit/access-history-pushdown.spec.ts` | new | 下推正規化/helpers/委派之單元覆蓋 |
| `backend/src/audit/audit-writer.service.spec.ts` | modified | `FakeAuditStore` 補 queryPage；結構性防禦測試加 queryPage 斷言 |
| `backend/src/database/entities/audit-log.entity.ts` | modified | 加 `@Index('IX_AUDIT_LOG_targetType_occurredAt')` |
| `backend/src/database/migrations/1723075200000-audit-log-kind-index.ts` | new | 組合索引 migration（已對真 SOP 執行） |
| `backend/test/int/access-history.itest.ts` | new | 12 must-pass + TS-017/018 |
| `frontend/src/pages/AccessHistoryPage.tsx` | modified | ACT_TONE pill 顏色、chevron 死三元修正、換頁控制項＋goToPage |
| `frontend/src/pages/AccessHistoryPage.test.tsx` | modified | 新增 TS-AQ-FE-001/002/003（＋DOWNLOAD/LIFECYCLE mock 列） |
| `docs/specs/features/F024-access-history-query.md` | modified | Status 行更新為畢業 |
| `docs/test-specs/features/F024-test.md` | modified | TS-017/018 stub → 指向畢業設計（單一權威來源） |

## 六、給 orchestrator 的 feature-status.md 變更建議（frozen，未自行改）
1. 第 115 行 F024 列：`🟡 部分` → `✅ 完成`；備註改為：
   「畢業：OQ-AQ-01 WHERE/ORDER/OFFSET 下推 + IX_AUDIT_LOG_targetType_occurredAt（migration 1723075200000，已對真 SOP 執行）+ 12 int（TS-AQ-INT-001~012）+ TS-017/018 + 前端保真三修（pill 顏色/chevron/換頁）。TS-AQ-INT-011 targetName 依賴 doc-changelog 寫入端修正。」
2. 第 40 行彙總：🟡 部分 16 → 15（自清單移除 F024）；對應 ✅ 完成計數 +1、清單加入 F024。
3. **migration 時間戳協調**：確認 `1723075200000`（本 track）與 `1722988800000`（doc-changelog track）於合併時無碰撞——本 worktree 已刻意跳過後者。

## 七、Architectural Decisions / 偏離設計之處
- **queryPage 設為必填**（非 optional）：唯二實作者皆在本模組手術面內，介面更乾淨；FakeAuditStore 一行委派即維持既有行為。
- **person/target 之 LIKE 下推至 SQL**（而非設計 §2.1.2 建議之「僅對已縮小候選集於應用層評估」）：因分頁/total 亦下推，
  應用層再篩會使 OFFSET/COUNT 失準；LIKE 於 SQL 評估仍避免全表載回 Node，且以 ESCAPE 保字面子字串語意（等價記憶體版 includes）。
- **int 查詢以 runId 唯一前綴縮限**（非設計逐字之 person=ZZINT）：AUDIT_LOG append-only 累積跨執行，唯一前綴確保確定性/隔離。
- **未觸碰**：documents/、change-history/、rbac/、attachments/、public/watermark（他 track 手術面）；未改 audit.types 之 AuditKind/AuditTargetType 值集。
