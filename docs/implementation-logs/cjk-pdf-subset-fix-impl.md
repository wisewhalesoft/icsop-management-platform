---
type: implementation-log
feature_id: F020-F036-defect
feature_name: PDF 中文缺字（fontkit 子集化短 loca 截斷）
status: complete
last_updated: 2026-08-17
---

# PDF 中文缺字修復 — Implementation Log

2026-08-16 delta 第 6／7 項（中文亂碼、浮水印）之真因。影響**所有**伺服器端產生／燒錄之 PDF：
F036 樹狀圖（本文＋浮水印）、F020 前台附件浮水印、F037/F038 變更歷程 PDF。

## 根因（實測佐證，非推論）

`@pdf-lib/fontkit@1.1.1` 之 `TTFSubset` 在**短 loca 格式**下截斷奇數位移：

1. Noto Sans TC 為**長 loca**（`head.indexToLocFormat = 1`），其 glyf 記錄長度**允許為奇數**。
   實測（`assets/fonts/NotoSansTC-Regular.ttf`）：薪 365、循 277、狀 245、尚 199、載 283、序 293、
   書 139、品 117、車 95、保 193、撥 609、款 335、文 141、傳 293 …（皆奇數）。
2. `TTFSubset._addGlyph()` 逐字**原樣複製** glyf 位元組，並以 `offset += buffer.length` 累加位移
   ⇒ 子集內位移常為奇數。
3. `loca.preEncode()` 只要末位移 ≤ `0xffff`（小子集必然成立）就選**短 loca**，並執行
   `offsets[i] >>>= 1`。短 loca 以「位移/2」儲存，**奇數位移被無聲截掉 1 byte**。
4. 自第一個奇長度字之後，所有字形邊界全數錯位 ⇒ 讀取端拿到殘缺輪廓 ⇒ 渲染成空白／破字。

**位元組級佐證**（修前之子集）：`indexToLocFormat = 0`（短），子集 glyph 長度序列
`86,364,54,278,…` —— 薪的真實長度 365 在子集內變成 364，**少 1 byte**，其後全部平移。
以 fontkit 重新解析該子集，41 個字形中 12 個 `path` 解析失敗、4 個空輪廓。

**已排除**（與 lead 診斷一致）：字型資產存在、確實嵌入（`/FontFile2` + `Identity-H` + `CIDFontType2`）、
未退回 Helvetica。**同一 document 內兩個子集並非成因**——樹狀圖之兩個子集分屬兩份 document
（renderer 產生基底並 `save()`；burner 再 `load()` 後另行嵌入），彼此獨立；兩者是各自壞掉，不是互相衝突。
`/ToUnicode` 修前即已正確存在（見下）。

## 修法

`backend/src/public/fonts/cjk-font.ts` 新增 `glyfSafeFontkit()`：包裝 fontkit，讓其產出之每個
TrueType 子集在開始收字時把 `loca.version` 釘為 `1`（長格式）。`preEncode()` 見 version 已設即提早返回，
位移保持原始位元組值並以 uint32 寫出，`head.indexToLocFormat` 亦由 fontkit 依 `loca.version` 同步為 1。

- 介入點是 pdf-lib 公開契約 `registerFontkit(fontkit)` → `fontkit.create()` → `font.createSubset()`，
  **只包裝我們自己建立的實例**，不動 `node_modules`、不改任何全域 prototype。
- 型別由 pdf-lib 公開 API 反推（`Parameters<PDFDocument['registerFontkit']>[0]`），不相依其內部 d.ts 路徑。
- CFF/OTF 子集（無 `_addGlyph`，不走 glyf/loca）自動略過，行為不變。

### 為何不是直接關掉 `subset: false`
實測 `subset: false` 之單頁 PDF ＝ **4,343,126 bytes**（Flate 後仍 +4.3 MB／份）。
本修法保留子集化，代價僅 loca 表由 2 bytes/字 變 4 bytes/字。

## 實測結果（走真實 production code path：`PdfLibTreeRenderer` → `PdfLibBurner`）

逐字驗證法：抽出 PDF 內容串流之 glyph id ＋ 解壓 `/FontFile2`，把子集字形輪廓（SVG path）
與原字型「整行 `layout()`」之期望字形逐一比對。

| 對象 | 修前 | 修後 |
|---|---|---|
| 樹狀圖本文（標題＋4 節點＋掛載列，7 行） | **0/7** 行字形正確 | **7/7** |
| 浮水印三行（身分／機密聲明／時間戳） | **0/3** 行字形正確 | **3/3** |

修前之破法與 lead 瀏覽器所見一致（例：`商品進件作業` → `進` ＋ `作業`；`薪工循環 - 循環樹狀圖` →
只剩 `環 - 環樹`）。

檔案大小：樹狀圖基底 9,463 → **9,503** bytes（+40）；燒錄後 22,211 → **22,310** bytes（+99，+0.4%）。

文字層：`/ToUnicode` CMap **修前修後皆存在且正確**（每字型 61 筆）。以 resource-aware 解析
（依 `Tf` 追蹤目前字型、套該字型自己的 CMap）可完整抽出全部中文，含 `2026-08-17 14:30:00 (UTC+8)`
——**無多餘連字號**。lead 觀察到的「抽不到中文／`2026-0-8-17`」應為抽取工具在解析損壞之嵌入字型時的產物；
本次未動 ToUnicode 產生邏輯，亦不需要動。

## Files Changed
| File Path | Change Type | Description |
|-----------|------------|-------------|
| `backend/src/public/fonts/cjk-font.ts` | modified | 新增 `glyfSafeFontkit()`／`withLongLocaOffsets()`；`embedWatermarkFont()` 改用包裝後之 fontkit |

單一 choke point：`embedWatermarkFont()` 是全 repo 唯一 `embedFont` 呼叫處，
故 `pdf-burner.ts`／`lifecycle-tree-pdf.ts`／`lifecycle-change-history-pdf.ts` 三條路徑一次修好，
三者原始碼未動。**未新增任何相依套件；未修改任何測試檔。**

## 閘門實跑（2026-08-17）
- backend `jest`：**146/146 suites、1954/1954 tests** 綠（首跑有 1 筆 `lifecycle-tree-pdf.spec.ts`
  逾時假紅，單跑 3/3 綠、重跑全套 146/146 綠 ⇒ worker 競用之 flake，非本修改所致）
- backend `nest build`：exit 0；`npm run deps:check`：no violations（298 modules）
- backend `[int] watermark-burn-timing`：2/2 綠，10 頁 CJK 燒錄 127.8ms（門檻 8000ms，效能無退化）
- frontend `vitest`：**82/82 files、1158/1158 tests** 綠；`tsc --noEmit` exit 0（前端未改動）

## 可機器化把關之建議（交環作者）
現有環只斷言「有沒有呼叫 `burnPdf`」與快照字串，抓不到本類缺陷。建議新增一條**純 Node、
無瀏覽器、決定性**之 jest 約束（本次診斷腳本即其原型）：

> 以真實 renderer/burner 產生 PDF → 解析內容串流取 `<hex> Tj` 之 glyph id 序列 →
> 解壓 `/FontFile2` 以 fontkit 重新解析子集 → 對每個 id 取 `getGlyph(id).path.toSVG()`，
> 斷言等於原字型 `layout(整行).glyphs[i].path.toSVG()`。

三個必要細節（踩過）：①期望值必須用**整行 `layout()`**，不可逐字 layout——Noto Sans TC 對
`A0980123` 之數字會做上下文替代（`'0'` 單獨＝gid 17，接在 `'A'` 後＝gid 20346），逐字比對會假紅。
②一份文件可能有多個子集（本文＋燒錄各一），需逐子集嘗試。③`/FontFile2` 為 FlateDecode，需先解壓。
此斷言修前 0/10 行、修後 10/10 行，對「子集化壞掉」「誤退 Helvetica」「字型資產遺失」皆有攔截力。
