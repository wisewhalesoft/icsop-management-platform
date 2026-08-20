---
type: test-design-feature
feature_id: F026
feature_name: 角色×欄位權限矩陣
priority: P0-MVP
related_spec: docs/specs/features/F026-role-field-matrix.md
last_updated: 2026-08-20
status: draft
---

# F026 — 角色×欄位權限矩陣 · Test Design

> source: docs/specs/features/F026-role-field-matrix.md

⚠ **本檔為 2026-08-20 D9 delta 首次建立**（先前各輪未曾為 F026 單獨立檔；矩陣本身之既有測試
分散於 `backend/src/rbac/field-matrix.spec.ts`／`frontend/src/domain/field-matrix.test.ts`）。
本檔僅記錄本輪（D9）新增之約束，不回溯補齊既有（非 D9）矩陣測試之設計文件。

---

# 🔴🔴 2026-08-20 D9 缺失／變更 delta 測試設計（OJT 上傳破例，frontend 線）

> 本段由 **test-generator（frontend／vitest 線）** 於 2026-08-20 追加，涵蓋 `AC-N22`～`AC-N27`
> 之**前端鏡射**部分，以及 `AC-N75`／`AC-N76`（前端 DOM 契約）。backend 線之矩陣本體改動
> （`backend/src/rbac/field-matrix.ts` 之 `OJT_WRITABLE`）與服務層授權判定，由 **F016-test.md**
> 之 backend 段落持有（`AC-N28`～`AC-N35`），不重複建約束。
>
> 權威＝`docs/specs/features/F026-role-field-matrix.md#ojt-write-exception-delta`、
> `architecture-spec.md §11.8`。🔴 **本 delta 推翻 F026 頂部原定案**「主管、部門窗口、系統管理員
> 對所有文件欄位皆唯讀」——僅為「OJT 簽到表」一欄開例外（`OQ-D9-19`／`OQ-D9-20`，使用者裁決）。

## AC ↔ 約束對照

| AC | 約束檔案 | 層級 |
|---|---|---|
| `AC-N22` 矩陣逐格斷言：恰有 2 格改值（`OJT 簽到表` × `Supervisor`／`DeptContact` → `WRITABLE`） | `frontend/src/domain/field-matrix.test.ts`（「F026 D9 delta：OJT 簽到表破例」describe，「AC-N22」案） | unit |
| `AC-N23` 主管／部門窗口對 OJT 欄之寫入解析為允許 | 同檔（「AC-N23」案） | unit |
| `AC-N24` 🔒 19 欄回歸鎖定（最重要之防護） | 同檔（`it.each` 逐鍵斷言 Supervisor／DeptContact 對其餘 19 鍵皆不為 `WRITABLE`，共 38 案＋自我守護案） | unit |
| `AC-N26` 🔒 系統管理員對 OJT 仍唯讀 | 同檔（「AC-N26」案） | unit |
| `AC-N27` 🔒 一般使用者對 OJT 仍唯讀 | 同檔（「AC-N27」案） | unit |
| `AC-N25` ①②③ 編輯頁前端呈現層隔離（`.ojt-write`／`.write-only` class 契約、恰 1 個可寫控制項） | `frontend/src/pages/DocumentEditPage.test.tsx`（「OJT 上傳破例：編輯頁 .ojt-write 隔離契約」describe，4 案） | component |
| `AC-N75` ①②③④⑤⑦ 唯讀頁附件區 DOM 契約 | `frontend/src/pages/DocumentReadonlyPage.test.tsx`（同上，另見 F016-test.md 前端段落之交叉引用） | component |
| `AC-N76` ①②④ 編輯頁逐元素 `data-attachment-write` 契約、`data-ojt-exception` 徽章 | `frontend/src/pages/DocumentEditPage.test.tsx`（3 案，逐元素＋集合式兩層並列） | component |

## ⚠ 斷言形狀之取捨（如實記錄，非規格臆造；2026-08-20 已依 lead 裁決加嚴）

`AC-N24` 文字為「一律回 403 `FIELD_WRITE_FORBIDDEN`」，既有矩陣中「系統 UUID」欄之角色無關值為
`IGNORE`（系統產生，非本 delta 引入）——`IGNORE` 與 `FORBIDDEN` 是矩陣既有的兩個不同分類。**本段
最初弱化為「恰不為 `'WRITABLE'`」，經 lead 比對 backend 線（`ring-be`）之同型處置後裁定不必弱化**：
backend 線改採「18 業務欄逐一斷言恰為 `FORBIDDEN`、系統 UUID 單獨斷言恰為 `IGNORE`」之兩組拆法，
強度更高且已實測前端矩陣現況與此拆法完全相容（18 業務欄 × 2 角色＝36 案、系統 UUID × 2 角色＝
4 案，共 40 案於實作前皆綠，僅 `AC-N22`／`AC-N23` 之 OJT 本身兩案為紅）。**本段已改採相同兩組
拆法**——弱化版（「不為 WRITABLE」）之風險在於會放過「業務欄被悄悄改成 `IGNORE`（寫入被靜默忽略、
不再回 403）」這類真實缺陷，違背 `AC-N24` 之防護本意；加嚴後之逐格精確斷言可攔截此類缺陷。

## risks-and-gaps 提醒

- `AC-N25`①②③（第三輪擴充，lead 追認之超範圍改動）之集合式互斥斷言
  （`.ojt-write` ∩ `.write-only` = ∅）在**實作前**天然為綠（兩個集合皆為空）——這是預期的
  「不受影響 AC 之綠燈守衛」，非測試失效；真正之鑑別力由 `AC-N76`④ 之逐元素斷言（`data-attachment-
  write="xls"`／`"icsop_pdf"`／`"ojt"` 三個具體掛鉤是否存在且 class 正確）承擔，兩層必須並列保留。
- `AC-N75`④ 之 OJT 上傳按鈕 `aria-label` 逐字值（「上傳／取代 OJT 實體簽到表」）取自 F016 spec
  `AC-N75`④ 原文；`AC-N76` 之編輯頁 OJT 按鈕**未鎖定** `aria-label`（spec 未明訂），本檔對應測試
  刻意不對編輯頁按鈕斷言 `aria-label` 字面值，僅斷言 class／`data-*` 契約，避免臆造規格未授權之約束。
