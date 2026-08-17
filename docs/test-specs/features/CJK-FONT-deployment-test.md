---
type: test-design-topic
topic_id: CJK-FONT
topic_name: CJK 字型部署與啟動 fail-fast（缺失 delta 第 6 項）
related_spec: docs/specs/architecture-spec.md#ch10-defect-delta（§10.10 決策 A10）
affected_features: F020, F036, F038
last_updated: 2026-08-16
status: draft
---

# CJK 字型部署（#6）— Test Design（Lane L0）

> source: `docs/specs/architecture-spec.md` §10.10（A10）＋ §10.15 第 1 項 · 2026-08-16 · lane L0

## 根因（已由 lead 實測確認，非推論）

`backend/Dockerfile` 之 build stage 只 `COPY tsconfig*.json nest-cli.json ./` ＋ `COPY src ./src`，
runtime stage 只 `COPY --from=build /app/dist ./dist` ⇒ **`backend/assets/` 從未進入 image**。
容器內 `loadCjkFontBytes()` 之兩個候選路徑皆不存在 → 回 `null` → `embedWatermarkFont()` 退化
`StandardFonts.Helvetica` → `pdf-burner.ts` 之 `render` 切為 `asciiSafe` → **所有中文變 `?`**。
字型檔本體存在於 repo（`backend/assets/fonts/NotoSansTC-Regular.ttf`，7,090,820 bytes）。

## 🔴 本題之測試策略（為何不寫 `loadCjkFontBytes()` 之 unit test）

§10.10 修法三與 §10.15 第 1 項已明示：`ts-jest` 以 repo 根執行、`__dirname` 指向
`backend/src/public/fonts`，**兩個候選路徑在 repo 中恆存在** ⇒ `existsSync` 恆真 ⇒
**不論 Dockerfile 寫什麼，任何針對 `loadCjkFontBytes()` 的 unit test 都會綠**。
> 「不要為 `loadCjkFontBytes()` 寫 unit test——寫了只會製造『已覆蓋』的假象。」

故本 lane 只建兩種約束：**(a) Dockerfile 靜態文字斷言** ＋ **(d) fail-fast 判定邏輯之純函式測試**。

## Test Scenarios

### A. Dockerfile 靜態斷言 — `backend/src/startup/cjk-font-deployment.spec.ts`

| ID | 場景 | 斷言 | 對應 |
|---|---|---|---|
| TS-D6-001 | runtime stage 之文字 | 含 `COPY assets ./assets` | §10.10 修法一 |
| TS-D6-002 | 兩個 COPY 之先後 | `COPY assets` 在 `COPY --from=build` **之前**（layer 快取效益） | §10.10 修法一註 |
| TS-D6-003 | repo 內字型檔 | `backend/assets/fonts/NotoSansTC-Regular.ttf` 存在且 > 1MB | 刪檔＝同一 bug 之另一形態 |

> ⚠ **刻意不斷言**「build stage 不得有 `COPY assets`」——§10.10 雖不建議（多 7MB 且無用），
> 但那是最佳化取捨、非正確性要求；為此紅燈屬過度約束。

### B. 啟動 fail-fast 之判定邏輯 — `backend/src/startup/cjk-font-guard.spec.ts`

**新增之測試接縫（由本 lane 定義，implementer 須照此形狀實作）**：
`backend/src/startup/cjk-font-guard.ts`

```ts
export const REQUIRE_CJK_FONT_ENV = 'ICSOP_REQUIRE_CJK_FONT';
export function isCjkFontRequired(env: NodeJS.ProcessEnv): boolean;
export function assertCjkFontAvailable(
  fontBytes: Uint8Array | null,
  candidatePaths: readonly string[],
  env: NodeJS.ProcessEnv,
): void;   // 缺字型且 required → throw，訊息逐字含全部 candidatePaths
```

`main.ts` 於 `app.listen()` **之前**呼叫：載入字型 → `assertCjkFontAvailable(bytes, 候選路徑, process.env)`
→ 拋錯即以非 0 退出。**為何抽純函式**：`main.ts` 之 bootstrap 會建立整個 Nest app，unit 層無法執行。

| ID | 場景 | 期望 | 對應 |
|---|---|---|---|
| TS-D6-010 | 環境變數名 | 逐字 `ICSOP_REQUIRE_CJK_FONT` | §10.10 修法二 |
| TS-D6-011 | 未設定 | required（**預設 true**，不可預設 false） | 「預設值就是那個會被忘記設定的值」 |
| TS-D6-012/013/014 | `'true'`／`'false'`／`''` | required／不 required／required（fail-safe） | 可關閉性 |
| TS-D6-015 | 字型存在 | 不拋 | — |
| TS-D6-016 | 缺字型且 required | 拋錯 | 靜默降級是本 bug 唯一能穿過全部測試之原因 |
| TS-D6-017 | 錯誤訊息 | **逐字含兩個候選路徑** | §10.10「log 逐字列出兩個候選路徑」 |
| TS-D6-018 | 缺字型但明確關閉 | 不拋 | 供純前端 e2e 之 API stub 環境 |

## 🔴 本環涵蓋不到（必須靠容器內實跑／瀏覽器煙霧）

| # | 涵蓋不到者 | 為何 | 把關手段（可執行步驟） |
|---|---|---|---|
| 1 | 容器內字型是否真的存在 | unit 層之 `existsSync` 恆真（見上） | `docker compose -p icsop exec api node -e "process.exit(require('fs').existsSync('/app/assets/fonts/NotoSansTC-Regular.ttf')?0:1)"; echo $?` → 須為 `0` |
| 2 | `main.ts` 是否真的呼叫了 fail-fast | bootstrap 無法在 unit 層執行 | 於容器內暫時改名字型檔後重啟 api：`docker compose -p icsop exec api sh -c "mv /app/assets/fonts/NotoSansTC-Regular.ttf /tmp/"` → `docker compose -p icsop restart api` → `docker compose -p icsop logs --tail=30 api` 應見**非 0 退出**且 log 列出兩個候選路徑；驗畢把檔案移回並再 restart |
| 3 | 燒錄後 PDF 之中文是**真中文**而非 `?` | 需真 Blob ＋ 真 PDF ＋ 字型嵌入 | 容器內對三條路徑各下載一份：① F020 前台檢視器 PDF ② F036 樹狀圖 PDF（`GET /admin/lifecycles/:id/tree-preview/download`）③ F038 新舊樹狀圖 PDF。<br>🔴 **2026-08-17 更正：原本此欄所寫之「以 `pdftotext -` 抽文字層，斷言含真實中文且不含連續 `?`」已實證無效，不得再使用。** 文字層（`ToUnicode`）與字形層（`FontFile2`）是 PDF 中兩個獨立物件——字形輪廓**全毀**時 `pdftotext` 仍抽得出**完整正確**之中文（假綠）；而不加 `-enc UTF-8` 時對**正常** PDF 亦回 0（假紅）。⇒ 改用 [`risks-and-gaps.md#pdf-glyph-integrity`](../risks-and-gaps.md#pdf-glyph-integrity) D 節之**渲染後逐字比對**（標的清單見該節表格） |
| 3b | 🔴 **字形輪廓完整性**（本表原本**完全沒有**這一項——2026-08-16 delta 之逃逸缺陷即在此） | 字型「有嵌入」不等於字形「可畫出」；`@pdf-lib/fontkit@1.1.1` 之短 loca 截斷會讓字形邊界錯位而**無聲**缺字 | 人工：同上之渲染後逐字比對。<br>✅ **機器層已建**（2026-08-17）：[`backend/src/public/pdf-glyph-integrity.spec.ts`](../../../backend/src/public/pdf-glyph-integrity.spec.ts)，9 案，涵蓋 F020／F036／F038 三條真實燒錄路徑，主斷言為「嵌入子集之每一個字形輪廓皆可解析（零拋錯）」；負向對照（移除 `glyfSafeFontkit` 包裝）→ 5 紅。⚠ **只驗輪廓層，不取代**上一列之渲染後逐字比對。詳見 [`risks-and-gaps.md#pdf-glyph-integrity`](../risks-and-gaps.md#pdf-glyph-integrity) F 節 |
| 4 | image 體積之影響 | 非正確性 | `docker image inspect icsop-api --format '{{.Size}}'` 前後比較，預期 +≈7.09MB |
