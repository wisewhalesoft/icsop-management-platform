# Epic E03: 循環池與 DAG 畫布維護

> **Epic ID**: E03
> **Priority**: P0
> **Phase**: 1
> **Status**: Draft
> **Stories**: 6 個

## Epic Goal

管理「循環（Life Cycle）」池的 CRUD，以及單一循環內部工作流程結構的維護與唯讀檢視。單一循環本質上是一個**有向無環圖（DAG）**：每個節點（node）對應實際工作流程中的一個步驟，節點之間可以有多個 parent、也可以有多個 child（非單純樹狀結構），畫布採上到下（top-down）佈局，節點間以箭頭連接，系統須禁止使用者建立成環的連線。

點擊單一節點會開啟抽屜（drawer），供 ICSOP 管理員維護該節點名稱，並掛載對應的 ICSOP 文件；抽屜內的文件候選清單需過濾非該循環的文件，並在文件已被設定於其他節點時提出警示，避免誤重複掛載。此 Epic 是 E04 ICSOP 文件管理的結構性前置條件——每份文件都必須歸屬於一個循環的一個節點。

除可編輯畫布外，本 Epic 亦提供**唯讀樹狀圖預覽**（US-025）：由循環管理清單開啟，比照文件檢視器風格疊加浮水印並計入稽核，供具可視權限之角色快速掌握循環結構與下游關聯，不涉及任何編輯操作。

## User Stories

| Story ID | Title | Priority | File |
|---|---|---|---|
| US-020 | 循環池 CRUD | P0 | [US-020-lifecycle-pool-crud.md](US-020-lifecycle-pool-crud.md) |
| US-021 | DAG 節點與連線維護 | P0 | [US-021-dag-node-edge-maintenance.md](US-021-dag-node-edge-maintenance.md) |
| US-022 | DAG 防環驗證 | P0 | [US-022-dag-cycle-prevention.md](US-022-dag-cycle-prevention.md) |
| US-023 | 節點抽屜維護 | P0 | [US-023-node-drawer-maintenance.md](US-023-node-drawer-maintenance.md) |
| US-024 | 節點文件過濾與重複掛載警示 | P0 | [US-024-node-document-filter-warning.md](US-024-node-document-filter-warning.md) |
| US-025 | 循環樹狀圖預覽（唯讀＋浮水印） | P1 | [US-025-lifecycle-tree-preview.md](US-025-lifecycle-tree-preview.md) |

## Dependencies

- **Depends On**: [E08 US-070 角色×功能權限矩陣](../E08-permission-matrix/US-070-role-function-matrix.md) — 循環管理功能僅開放 ICSOP 管理員操作，須先有角色權限定義。
- **Blocks**: [E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)（文件建立時需選擇一個已存在的循環）、[E04 US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md)
- **US-025 額外依賴**: [E07 稽核與文件調閱歷程](../E07-audit-trail/epic-brief.md)（樹狀圖預覽計入稽核，含檢視/下載/列印三種動作）、[NFR-007 浮水印防竄改與一致性](../../non-functional/NFR-007-watermark-integrity.md)（浮水印格式權威，含下載/列印燒錄一致性）、[E04 US-037 後台文件清單與搜尋](../E04-icsop-document/US-037-backend-document-list-search.md)（13-document-list 為第二開啟入口）、[E06 US-054 下載/列印 PDF 浮水印燒錄](../E06-public-browsing/US-054-download-print-watermark-burn.md)（下載/列印燒錄手法參考）——與 E06 前台瀏覽共用浮水印/燒錄呈現手法，但本身不屬前台範疇。
- **權威寫入路徑（已定案）**：文件在 E04 US-030 建立時選定「所屬循環」（必填）；「所屬節點」以 **E03 節點抽屜（US-023）為唯一權威寫入路徑**（掛載／改派）。文件編輯頁僅唯讀顯示目前節點並可跳轉至畫布，不在文件表單直接改節點。因此 E03 與 E04 非單向阻擋，而是共用同一組欄位、由節點抽屜統一寫入「所屬節點」，避免雙入口不一致。

## Success Criteria

- ICSOP 管理員可完整建立、查詢、編輯、刪除／停用循環。
- 畫布可視覺化呈現 DAG 結構（上到下佈局、箭頭連接），支援多 parent／多 child 節點。
- 任何會造成環的連線嘗試都會被系統攔截並提示錯誤，資料庫中不存在成環的邊。
- 節點抽屜的文件候選清單正確過濾非該循環文件，且對已掛載於其他節點的文件提出警示並要求二次確認。
- 具可視權限之角色可由循環管理清單或 ICSOP 文件清單開啟樹狀圖唯讀預覽，正確呈現節點結構、直角箭頭連線、下游標示，並疊加浮水印與計入稽核，且無法透過此頁面進行任何編輯操作；下載/列印該樹狀圖時，浮水印須實際燒錄進 PDF 內容層並各自計入稽核。

## Open Questions

> **本 Epic 之 Open Questions 已全數定案**，保留於此供追溯。完整決策紀錄見 [open-questions.md](../../../specs/open-questions.md)。

- [x] **循環是否需要「擁有部門」等其他欄位**（OQ-E03-01 ✅）— **定案（採選項 A）**：不需要「擁有部門」等欄位。原始關切之一（支撐主管「本部門相關」循環可視範圍判定）已因 [OQ-E08-03 定案](../E08-permission-matrix/epic-brief.md)（主管循環管理放寬為全公司唯讀）而消失；open-questions.md 就本題本身亦已直接定案為「不需要」。未來如有報表/統計、跨部門協作標示等其他用途，屬另案評估範疇，非本輪新增欄位之理由。
- [x] **循環狀態機是否與文件狀態聯動**（OQ-E03-02 ✅）— **定案**：不聯動。
- [x] **（已定案 2026-07-17，OQ-E03-03）循環刪除規則**：允許刪除，但需先清空所有文件掛載（非「禁止硬刪、僅允許停用」）；停用仍為獨立於刪除規則之外、隨時可用的操作。詳見 [US-020](US-020-lifecycle-pool-crud.md) AC3～AC5。
- [x] **一個節點是否可掛多份文件**（OQ-E03-04 ✅）— **定案**：可（反向限制維持既有定案：一份文件僅屬一個節點）。
- [x] **節點/循環結構是否需版本或變更歷史**（OQ-E03-05 ✅）— **定案（材質變更，覆蓋原「比照 ICSOP 文件僅保留當前版本」草案）**：**保留結構變更歷程**，採 [F038 循環樹狀圖變更歷程](../../../specs/features/F038-lifecycle-tree-change-history.md)（append-only 事件＋完整快照，粒度定案見 [E07 OQ-E07-05](../E07-audit-trail/epic-brief.md)）。
- [x] **（已定案）E03 與 E04 的權威寫入路徑**：文件建立時選「所屬循環」（必填）；「所屬節點」以節點抽屜（US-023）為唯一權威寫入路徑，文件表單不設節點。架構師仍需就此設計交易邊界（改派時同一交易解除原節點、綁定新節點）。
