---
type: test-design-feature
feature_id: F036
feature_name: 循環樹狀圖預覽（本檔僅涵蓋 2026-08-16 節點雙擊 delta）
priority: P0-MVP
related_spec: docs/specs/features/F036-lifecycle-tree-preview.md#node-dblclick-delta
last_updated: 2026-08-16
status: draft
---

# F036 — 節點雙擊顯示文件清單 delta · Test Design（Lane L6）

> source: `docs/specs/features/F036-lifecycle-tree-preview.md` `AC-D1`～`AC-D9`
> ＋ `docs/specs/architecture-spec.md` §10.5（決策 A5）＋ `prototypes/22-lifecycle-tree-preview.html`
> 缺失／變更 delta 第 8 項 · 2026-08-16 · lane L6
>
> ⚠ 本檔**只涵蓋 `AC-D#` 批次**；F036 既有 AC 與 `AC-S#`（子分類）不在本輪範圍。

## 新增之端點契約（本 lane 據 §10.5 定形，implementer 須照此形狀實作）

```
GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/documents
  掛於既有 NodeDocsController（前綴已是 admin/lifecycles/:lifecycleId/nodes/:nodeId）
  @Get('documents') @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')   ← read，不是 write
  → NodeMountedDoc[]  = { id, documentNumber, documentName, edition, status, announcedDate }[]
  節點不存在 → NODE_NOT_FOUND
```

- 服務層方法：`NodeDocsService.listNodeDocuments(lifecycleId, nodeId)`
- Store 方法：`NodeDocsStore.listNodeMountedDocs(lifecycleId, nodeId)`（單表查詢，五欄全在 `ICSOP_DOCUMENT`）
- 前端 endpoint：`getLifecycleNodeDocuments(lifecycleId, nodeId)`；型別 `NodeMountedDocument`（`api/types`）
- **回原始 `status` ＋ `announcedDate`**，中文徽章由前端既有 `deriveDisplayStatus` 衍生（§10.5）

## 測試策略

| 層 | 手段 | 檔案 |
|---|---|---|
| 服務（資料形狀） | jest ＋ 記憶體 fake store | `backend/src/lifecycle/node-docs-list.service.spec.ts` |
| 路由／RBAC | jest ＋ `Reflector` 讀 metadata ＋ `RolePermissionGuard` 實跑 | `backend/src/lifecycle/node-docs-controller-routes.spec.ts` |
| 稽核邊界（結構性） | 同上檔：`design:paramtypes` ＋ 兩個 production 檔之**原始碼文字**不得出現 `Audit` | 同上 |
| 元件（抽屜） | vitest ＋ Testing Library，mock `api/endpoints` | `frontend/src/pages/LifecycleTreePreviewPage.nodeDrawer.test.tsx` |

## AC ↔ 約束對照

| AC | 約束 | 檔案 · ID |
|---|---|---|
| `AC-D1` 雙擊 → 右側抽屜滑出、標題＝節點名、關閉鈕／Escape 關閉 | `#nodeDocDrawer` 之 `aria-hidden` 切換、`#ndTitle` | nodeDrawer TS-D8-020～024 |
| `AC-D2` 恰 N 列、五欄、編號與版次 mono、狀態依 F012 衍生徽章 | 列數／逐值／`mono` class／`已公告`・`作廢` | nodeDrawer TS-D8-025～027；BE TS-D8-001/006 |
| `AC-D3` 點列 → `/admin/documents/:id` | location 探針 | nodeDrawer TS-D8-028 |
| `AC-D4` 🔒 純唯讀 | 五個逐字寫入元件皆 `queryByText === null`；抽屜內 0 個 `input`／`select`／`textarea`；後端回**扁平陣列、無 `candidates`** | nodeDrawer TS-D8-029/030；BE TS-D8-002 |
| `AC-D5` 🔴 閘門＝循環管理 **read** | route metadata（`functionKey`＋`action`）＋ 五角色逐一跑 `RolePermissionGuard`＋**對照組**（Supervisor 對 `mount` 仍被擋） | routes TS-D8-010/013/014/015/016 |
| `AC-D6` 🔒 單擊標示下游不被取消 | 雙擊後 `data-selected`／`data-highlighted` 仍成立；單擊不開抽屜、不打端點 | nodeDrawer TS-D8-031/032 |
| `AC-D7` 0 份仍開抽屜並顯示空狀態 | `[data-node-doc-empty]` ＋ 逐字文案 | nodeDrawer TS-D8-033；BE TS-D8-004 |
| `AC-D8` 不新增稽核 | 兩個 production 檔全檔不得出現 `Audit`（「不注入」＞「注入但不呼叫」） | routes TS-D8-017/018 |
| `AC-D9` 逐字文案與選擇器 | `aria-label`／`#ndTitle`／`#ndCount`／`data-node-doc-row`／`data-node-doc-empty`／`唯讀`／節點徽章／工具列提示句 | nodeDrawer TS-D8-020～022、033～035 |
| Error Scenarios 載入失敗 | 抽屜**不關閉**、顯示 `role="alert"`、樹狀圖標示不受影響 | nodeDrawer TS-D8-036 |
| 🔒 回歸 | `mount`／`unmount` 仍為 `write`、`drawer` 仍為 `read` | routes TS-D8-012 |

## 測試資料

DAG：`a1 →{a2,a3}`、`a2 → a4`；`docCount` 依序 2／1／0／1。
`a1` 之兩份文件：`status='active'` ＋ 已過公告日（→ `已公告`）與 `status='void'`（→ `作廢`）。

## 🔴 本環涵蓋不到

| # | 涵蓋不到者 | 為何 | 把關手段 |
|---|---|---|---|
| 1 | `AC-D9`「節點徽章與抽屜筆數**同一資料來源**」 | §10.5 選定 **lazy per-node** ⇒ 節點徽章來自預覽回應之 `docCount`、抽屜筆數來自新端點之陣列長度，**架構上就是兩個來源**。二者不一致時應顯示何者，規格未定義 ⇒ 不得發明斷言。本環只能在兩者一致之 fixture 下各自驗證其逐字格式 | 記入 `risks-and-gaps`（G-D8-01）；容器內以真資料雙擊數個節點，肉眼比對徽章與抽屜筆數 |
| 2 | 抽屜之**視覺**為「右側滑出、非 modal、不遮擋樹狀圖」 | jsdom 無版面計算（CSS transform／z-index 皆不生效） | 瀏覽器煙霧：於樹狀圖預覽頁雙擊節點，確認抽屜自右滑入且樹狀圖仍可捲動／縮放／再點選 |
| 3 | 真 DB 之 `WHERE nodeId = :nodeId AND lifecycleId = :lifecycleId` 是否確實過濾 | fake store 之過濾是測試自己寫的 | 容器內 int：以真 SOP DB 對兩個循環之同名節點各打一次，確認不互相污染 |
| 4 | 端點回應是否被 nginx／vite 代理白名單擋下 | §10.15 第 3 項：unit 與 vitest 皆不經過 nginx | 瀏覽器煙霧 ＋ 檢查 `nginx.conf`／`vite.config.ts` 之 `/admin` 代理白名單 |
