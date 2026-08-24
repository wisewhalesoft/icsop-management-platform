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

---

# 🔴🔴🔴 2026-08-21 三項裁決第 2 項 —— 抽屜擴為子樹 ＋ 子樹 deep link delta 測試設計（簡易版環）

> 本段由 **test-generator**（單線，backend＋frontend 皆本人建）於 2026-08-21 追加，涵蓋 `AC-T10`～`AC-T27`。
> 權威＝[F036 §抽屜擴為子樹 delta](F036-lifecycle-tree-preview.md#subtree-drawer-delta)
>      ＋ [architecture-spec.md §12.1～§12.3](../architecture-spec.md#ch12-t3-decisions)（決策 C1／C2／C3）
>      ＋ `docs/ui-ux-design-overview.md` §A.7.2／§A.7.3。
> 🔴 **本輪約束環為簡易版**（人類指定）：僅 backend jest／frontend vitest 單元＋元件測試，
> **無 Playwright fidelity、無 e2e、無 Stryker mutation、無 metric gate**，不呼叫 `ring-setup` skill。
> ⚠ `AC-T28`（`descendants` F1–F5 固定向量）已於 [F020 段](#) 之姊妹批一併涵蓋——見下表最末列，
> 落地於 `lifecycle-tree-layout.spec.ts`（backend）／`lifecycle-tree-layout.test.ts`（frontend）
> **既有檔案之擴充區塊**（本輪唯一未新建檔案之項目，理由見下方「檔案清單」註記）。

## AC ↔ 約束對照

| AC | 約束 | 檔案 | 層級 |
|---|---|---|---|
| `AC-T10` 抽屜內容＝整個子樹，依節點分組 | `node-docs-subtree.service.spec.ts`（TS-T10-00x，後端分組）／`LifecycleTreePreviewPage.subtreeDrawer.test.tsx`（TS-T10-F0x，前端渲染） | unit／component |
| `AC-T11` 分組順序（三層 tie-break） | (a) 後端：`node-docs-subtree.service.spec.ts`（TS-T11-00x）；(b) 前端反漂移：`LifecycleTreePreviewPage.subtreeDrawer.test.tsx`（TS-T11-F01，刻意亂序 mock） | unit／component |
| `AC-T12` 掛載 0 份節點不產生分組 | (a) 後端：`node-docs-subtree.service.spec.ts`（TS-T12-001）；(b) 前端不得自行過濾：`LifecycleTreePreviewPage.subtreeDrawer.test.tsx`（TS-T12-F01） | unit／component |
| `AC-T13` 去重、組內排序、合計自洽 | (a) 後端：`node-docs-subtree.service.spec.ts`（TS-T13-00x）；(b) 前端：`LifecycleTreePreviewPage.subtreeDrawer.test.tsx`（TS-T13-F0x） | unit／component |
| `AC-T14` 🔴 INV-SUBTREE（`S_grp ⊆ S_hl`） | `LifecycleTreePreviewPage.subtreeDrawer.test.tsx`（TS-T14-F01，前端 `descendants()` 與 mock 子樹回應之交叉驗證） | component |
| `AC-T15`／`AC-T16` 逐字文案與選擇器契約 | `LifecycleTreePreviewPage.subtreeDrawer.test.tsx`（TS-T15/T16-F0x） | component |
| `AC-T17` 導向鈕存在與屬性 | 同檔（TS-T17-F0x） | component |
| `AC-T18` 🔴 子樹合計為 0 → 導向鈕自 DOM 移除（`=== null`，正負向對照） | 同檔（TS-T18-F01 ＋ 正向對照案） | component |
| `AC-T19` `openedAsPopup()` 四種替身 | `opened-as-popup.test.ts`（獨立小檔，理由見下方分檔說明） | unit |
| `AC-T20` 導向 · 主路徑 | `LifecycleTreePreviewPage.subtreeJump.test.tsx`（TS-T20-F01） | component |
| `AC-T21` 導向 · 退化路徑 | 同檔（TS-T21-F01） | component |
| `AC-T22` 可觀測 seam | 同檔（TS-T22-F0x） | component |
| `AC-T23` 🔴 opener.closed===true 之 jsdom-only 分支 | `opened-as-popup.test.ts`（獨立單元）＋ `LifecycleTreePreviewPage.subtreeJump.test.tsx`（TS-T23-F01，元件層級回聲） | unit＋component |
| `AC-T24` 🔒 導向鈕為 `<button>` | `LifecycleTreePreviewPage.subtreeDrawer.test.tsx`（TS-T24-F01） | component |
| `AC-T25` 權限閘門與資料契約 | ①②③：`node-docs-subtree.service.spec.ts`（TS-T25-00x）／`node-docs-subtree-routes.spec.ts`（TS-T25-R0x） | unit |
| `AC-T26` 🔒 既有行為回歸鎖定 | 依賴既有測試檔（`LifecycleTreePreviewPage.nodeDrawer.test.tsx`／`.test.tsx`／`node-docs-controller-routes.spec.ts`／`node-docs-list.service.spec.ts`）**逐字不動、繼續執行**——本輪未修改任何一個既有檔案 | 既有 |
| `AC-T27` 🔒 F038 diff 不受影響 | 依賴既有 `ChangeHistoryPage.watermark.test.tsx` 之「不支援節點雙擊」案（本輪未新增，既有案已涵蓋語意） | 既有 |
| `AC-T28` `descendants` F1–F5 固定向量（兩端） | `backend/src/lifecycle/lifecycle-tree-layout.spec.ts`／`frontend/src/pages/lifecycle-tree-layout.test.ts`**既有檔案之擴充區塊**（新增 `describe('descendants（AC-T28 · F1–F5 固定向量...)')`） | unit |

## 🔴 六個點名項目之落實情形（本 delta 涉及第 1、2、4、6 點）

- **第 1 點（`AC-T23` 只能在 jsdom 建）**：`opened-as-popup.test.ts` 明確以獨立案例
  `{ closed: true }` 之 opener 替身驅動，並在檔頭與案例標題重申「Chromium 量不到，不得指望瀏覽器實測」；
  `LifecycleTreePreviewPage.subtreeJump.test.tsx` 之 `TS-T23-F01` 為其元件層級回聲。
- **第 2 點（`AC-T28` 兩端各建）**：backend／frontend 之 `lifecycle-tree-layout.*` 檔**皆已擴充**（已實跑
  確認：frontend 15 案全綠、backend 因 `descendants` 尚未匯出而整檔紅——兩端皆有落地，非只做一端）。
- **第 4 點（`AC-T18` 移除而非隱藏）**：`LifecycleTreePreviewPage.subtreeDrawer.test.tsx` 之
  `TS-T18-F01` 斷言 `document.querySelector('[data-subtree-jump]') === null`，並配一條「子樹合計 > 0
  時確實存在」之正向對照案，兩案合起來才具鑑別力（單獨「查無」對隱藏/移除/未實作三種情形皆為真）。
- **第 6 點（`AC-T14` 之抽屜集合 ⊆ 醒目標示集合）**：`TS-T14-F01` 以前端真實 `descendants(edges, r)`
  算出 `S_hl`，斷言全部 `S_hl` 節點之 `data-highlighted="true"`，再驗抽屜之 `S_grp ⊆ S_hl`。

## 🔴 檔案清單與分檔理由

| 檔案 | 新／擴充 | 理由 |
|---|---|---|
| `backend/src/lifecycle/lifecycle-tree-layout.spec.ts` | **擴充既有檔**（唯一例外） | `AC-T28` 本文明文要求「兩端各一個既有測試檔（`buildTreeLayout` 之既有測試檔）擴充 `descendants` 區塊」，架構決策 C1 亦以此檔為綁定基準；此為 lead 之「一律新建」指示外之明文例外，已於本 delta 開頭說明 |
| `frontend/src/pages/lifecycle-tree-layout.test.ts` | **擴充既有檔** | 同上，前端半 |
| `backend/src/lifecycle/node-docs-subtree.service.spec.ts` | 新建 | `AC-T10`～`AC-T13`(a)／`AC-T25` |
| `backend/src/lifecycle/node-docs-subtree-routes.spec.ts` | 新建 | `AC-T25` route metadata |
| `frontend/src/pages/LifecycleTreePreviewPage.subtreeDrawer.test.tsx` | 新建 | `AC-T10`(b)～`AC-T18`／`AC-T24`，**不含**導向鈕之點擊派送與 opener seam |
| `frontend/src/pages/opened-as-popup.test.ts` | 新建（獨立小檔） | `AC-T19`／`AC-T23`：獨立成檔避免其 import 一個尚不存在之模組拖垮其他檔案之收集 |
| `frontend/src/pages/LifecycleTreePreviewPage.subtreeJump.test.tsx` | 新建（獨立成檔） | `AC-T20`～`AC-T23`：import 尚不存在之 `subtree-jump-seam` 模組，與 `subtreeDrawer.test.tsx` 分離以保留後者之獨立診斷力 |
| `frontend/src/pages/LifecycleTreePreviewPage.backActionFreshness.test.tsx` | 新建（2026-08-21 追加，team-lead 人工抽查裁決） | `AC-D3b`／`AC-T19`：釘住離開動作須於點擊當下重新判定 `openedAsPopup()`，不得沿用掛載時快取值。詳細裁決依據見 [risks-and-gaps.md#t3-onback-sampling-timing-survived-two-revisions](../risks-and-gaps.md#t3-onback-sampling-timing-survived-two-revisions) |
| `frontend/src/pages/LifecycleTreePreviewPage.formatFunctions.test.ts` | 新建（2026-08-21 追加，team-lead 裁決補環） | `AC-D9`：`formatMountedCount`／`formatSubtreeCount` 兩個具名純函式之存在性、`n=0/1/12` 逐字輸出、以及「不得再合併為同一函式」之不變式——本檔預期一開始即為綠（既有實作已正確，本檔只是補上保護） |

## ⚠ 契約性假設（test-generator 訂立，非讀取實作決定；供 tdd-implementation 對齊或申訴）

1. **`NodeDocsService` 之 DagStore 注入位置**：既有建構子已實測（ts-jest 型別錯誤揭露，非讀原始碼）
   為 `(store, changePublisher?, nowFn?)`——**上限 3 參數**。本檔要求擴充至第 4 個位置注入
   `DagStore`（比照 `LifecycleTreePreviewService` 之多 store 模式）。此為**必然之建構子擴張**
   （已知會拖垮整檔編譯直到擴充完成，屬預期紅，見 `constructor-expansion-and-symbol-discovery` 慣例）。
2. **子樹端點之前端 client 函式名**：`endpoints.getLifecycleNodeSubtreeDocuments(lifecycleId, nodeId)`。
3. **`openedAsPopup()` 落點**：`frontend/src/pages/opened-as-popup.ts`，單一具名匯出。
4. **`AC-T22` seam 落點**：`frontend/src/pages/subtree-jump-seam.ts`，匯出
   `recordSubtreeJump()`／`getSubtreeJumpCalls()`／`resetSubtreeJumpCalls()`——**此為
   architecture-spec §12.6 明文尚未定案之項目**（system-architect 未完成），由 test-generator
   先行拍板供本輪建環，非常規假設，若日後 system-architect 補定案且形狀不同，屬既定之申訴管道。
5. **`AC-T11`(a) 第③層 tie-break（x／y 皆相同時之節點 id 字典序）未獨立建 fixture**——構造兩個
   「真正同 x 同 y」之節點需仰賴 `buildTreeLayout()` 內部欄位分配演算法之確切細節，該演算法屬
   production 原始碼，對實作全盲之限制下無法安全構造。已登錄
   [risks-and-gaps.md §T3](../risks-and-gaps.md#t3-ac-t11-third-tier-tiebreak)。
