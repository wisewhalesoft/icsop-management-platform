---
type: implementation-log
feature_id: F036
feature_name: 循環樹狀圖預覽（CJK 燒錄字型）＋ F020 浮水印 CJK 燒錄
status: partial
last_updated: 2026-07-23
---

# F036 / F020: CJK PDF 燒錄字型 — Implementation Log（usageform worktree）

本輪範圍＝補齊 **F020 浮水印燒錄** 與 **F036 樹狀圖 PDF** 兩處長期缺口：pdf-lib 內建 `StandardFonts.Helvetica`
為 WinAnsi 編碼、無法編碼 CJK，真實中文會拋 `WinAnsi cannot encode`。以 `@pdf-lib/fontkit` 嵌入 CJK TTF
解決；並修正既有 `asciiSafe` 退化路徑之 `'□'`（U+25A1）本身不可編碼 bug。

## CJK 字型方案
- **字型**：Noto Sans TC（Regular，SIL Open Font License 1.1，permissive），資產置
  `backend/assets/fonts/NotoSansTC-Regular.ttf`（7.09 MB，源自 Google Fonts；授權/來源見同目錄 `LICENSE.md`）。
- **載入器 `backend/src/public/fonts/cjk-font.ts`**：
  - `loadCjkFontBytes()`：以 `__dirname` 上溯 + `process.cwd()` 兩候選解析 `assets/fonts/…`（src 執行與 dist 執行皆
    落在 `backend/assets`），快取結果（含「缺檔」）避免每次燒錄重讀 7MB。缺檔回 `null`。
  - `embedWatermarkFont(pdf, bytes)`：bytes 非空 → `pdf.registerFontkit(fontkit)` + `embedFont(bytes,{subset:true})`
    回 `{cjk:true}`（子集化嵌入，燒錄後檔案僅含實際用到字符、非整份 7MB）；bytes 為 null → `StandardFonts.Helvetica`
    回 `{cjk:false}`（退化）。
  - `asciiSafe(s)`：`[^\x20-\x7E] → '?'`（WinAnsi 可編碼）。**修正既有 bug**：原 `pdf-burner.ts` 以 `'□'`（U+25A1）
    佔位，而 '□' 本身 WinAnsi 不可編碼 → 退化路徑反而拋例外；改用 '?'。
- **兩處燒錄接線**（constructor 預設 `= loadCjkFontBytes()`，模組 `new PdfLibBurner()/new PdfLibTreeRenderer()` 自動取得 CJK 字型；傳 `null` 可強制退化）：
  - `backend/src/public/pdf-burner.ts`（`PdfLibBurner`，F020 下載/列印燒錄）。
  - `backend/src/lifecycle/lifecycle-tree-pdf.ts`（`PdfLibTreeRenderer`，F036 基底樹圖）。
  - 有 CJK 字型 → 直接繪原始中文；退化 → `asciiSafe`。

## Test Results Summary
| Scenario / 測項 | 說明 | Status |
|---|---|---|
| pdf-burner.spec（新，5） | CJK 嵌入路徑真實中文燒錄不拋 + %PDF + 子集化<2MB；ASCII 退化路徑不拋（U+25A1 bug 迴歸守門）；資產可載入>1MB；asciiSafe→'?'；toDisplayLines | PASS |
| lifecycle-tree-pdf.spec（+1） | 既有 CJK 節點名 render；新增 ASCII 退化路徑不拋（U+25A1 迴歸） | PASS（3） |
| 全後端套件 | 無回歸（含 lifecycle-preview / watermark 假體 seam 測不受影響） | PASS（76 suites / 873 tests） |
| backend tsc（src+test） | 型別乾淨 | PASS |

## Files Changed
| File Path | Change | Description |
|---|---|---|
| backend/assets/fonts/NotoSansTC-Regular.ttf | new | Noto Sans TC（OFL-1.1）CJK 字型資產 |
| backend/assets/fonts/LICENSE.md | new | 字型授權/來源/部署說明 |
| backend/src/public/fonts/cjk-font.ts | new | 字型載入器 + embedWatermarkFont + asciiSafe（'?'） |
| backend/src/public/pdf-burner.ts | modified | fontkit + CJK 嵌入；asciiSafe '□'→'?' bug 修正 |
| backend/src/public/pdf-burner.spec.ts | new | CJK 燒錄 smoke（5） |
| backend/src/lifecycle/lifecycle-tree-pdf.ts | modified | fontkit + CJK 嵌入（共用 cjk-font 載入器） |
| backend/src/lifecycle/lifecycle-tree-pdf.spec.ts | modified | 退化路徑迴歸（+1） |
| backend/package.json | modified | 新增 dependency `@pdf-lib/fontkit@^1.1.1` |

## Architectural Decisions
- **共用載入器（cjk-font.ts）**：F020 burner 與 F036 renderer 共用同一嵌入/退化邏輯，避免兩份漂移；`asciiSafe`
  與 embed 決策集中一處。
- **subset:true**：源資產雖 7MB，燒錄輸出僅含實際字符（smoke 輸出 ~數十 KB），不使每份下載膨脹。子集化 CPU 成本屬
  [integration] 效能考量（NFR <3s）。
- **優雅降級不拋例外**：字型資產缺（未部署）時退化 Helvetica + '?'，下載/匯出不崩潰；smoke 兩路徑皆斷言不拋。

## [integration] 仍未覆蓋
- 真實中文於 PDF 之**視覺可讀性/位元組層抽取驗證**與**效能（<3s）**：需真實 PDF pipeline，屬 [integration]。
- 生產封裝需確保 `backend/assets/` 隨 `dist/` 一併部署（載入器以 backend 根解析；缺檔則降級）。

## 需回報之 spec-doc 變更（未自行編輯共用 doc）
- `docs/specs/nfr.md`（#watermark）/ `docs/specs/feature-status.md`：F020/F036 之「CJK 燒錄字型＝[integration]」缺口
  已由本輪解除（fontkit + Noto Sans TC 嵌入），真實視覺/效能驗證仍 [integration]。
