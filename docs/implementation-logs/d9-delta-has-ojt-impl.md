---
type: implementation-log
feature_id: F017
feature_name: 文件清單 OJT 圖示欄之 hasOjt 富化（D9 缺失 delta）
status: complete
last_updated: 2026-08-21
---

# F017 `AC-N37`～`AC-N40`：`hasOjt` 富化 — 實作日誌

## 缺陷與根因

使用者實測揪出：文件清單頁「有 OJT／無 OJT」圖示**永遠顯示「無 OJT」**。

根因：`DocumentListItem.hasOjt`（`backend/src/documents/documents.store.ts:138`）在整個
`backend/src` 只有介面上的一個選填宣告，**沒有任何地方計算它、賦值給它** ⇒ 恆為 `undefined`。

架構規格 `architecture-spec.md` §10.12 當時的假設是「`DOCUMENT_ATTACHMENT` 之批次查詢已存在於
`icsopPdfBlobPath` 之富化路徑，同一次查詢即可取得 `hasOjt`，零額外往返」——但該假設不成立：
`DocumentsService.enrichIcsopPdf()` 的批次查詢係 `findManyByType(ids, 'ICSOP_PDF')`，**依附件型別
過濾**，`OJT_SIGNIN` 從未被查出。既有的「有 OJT／無 OJT」篩選下拉（前端就 `hasOjt` 過濾，後端無
對應 filter 參數）因此一直是壞的。

此缺陷**非本輪引入**，屬 2026-08-16 delta 之 `F017 AC-D5` 從未落實。與既有教訓同型：
「型別宣告存在」≠「值真的被產出」。

## 測試結果

環由 `ring-be2` 於 `5444812` 定版（`TS-N37-001`～`008`，8 案）。

| Scenario ID | 說明 | 修復前 | 修復後 |
|---|---|---|---|
| TS-N37-001 | 有 `OJT_SIGNIN` → `hasOjt` 嚴格 `true` | FAIL | **PASS** |
| TS-N37-002 | 無任何附件 → 嚴格 `false`（非 `undefined`） | FAIL | **PASS** |
| TS-N37-003 | 僅 `ICSOP_PDF` → `false`，且不干擾「檔案」欄 | FAIL | **PASS** |
| TS-N37-004 | 僅 `OJT_SIGNIN` → 「檔案」欄仍為 `null`（回歸鎖定） | FAIL | **PASS** |
| TS-N37-005 | 鑑別力：同一清單混合有／無 OJT，兩者值不同 | FAIL | **PASS** |
| TS-N37-006 | 未注入 `attachmentStore` → 優雅降級為 `false` | FAIL | **PASS** |
| TS-N37-007 | 不得 N+1：`findSingle` 0 次呼叫 | PASS | **PASS** |
| TS-N37-008 | 不得 N+1：批次呼叫次數不隨列數增長（5 筆 vs 20 筆相等） | PASS | **PASS** |

### 實跑數字

| 指令 | 修復前（環定版時） | 修復後 |
|---|---|---|
| `npx jest src/documents/documents.service.spec.ts` | 118 案：6 紅 / 112 綠 | 118 案：**118 綠 / 0 紅** |
| `npx jest`（全量） | 153 suites / 2286 案，6 紅 | 153 suites / 2286 案，**全綠 / 0 紅** |
| `npx tsc --noEmit` | — | **exit 0，零錯誤** |

中間態（申訴裁決前）為該檔 1 紅 / 117 綠、全量 1 紅 / 2285 綠——唯一的紅是下方申訴之
`documents.service.spec.ts:961` 常數，**非本次實作造成的行為回歸**，且該案早於本輪的環。
`ring-be2` 裁決後該常數已更正，現為全綠。

## 改動檔案

| 檔案路徑 | 變更 | 說明 |
|---|---|---|
| `backend/src/documents/documents.service.ts` | modified | 新增私有方法 `enrichOjt()`；於 `listDocuments()` 中接於 `enrichIcsopPdf()` 之後呼叫 |

**未觸動任何 `*.spec.ts`、`docs/specs/**`、`prototypes/**`、`frontend/**`。**
未動 `typeorm-attachments.store.ts`，故**不涉及任何需真庫實跑才算數的 SQL 變更**（既有
`findManyByType` 之 SQL 原封不動，只是多帶一種型別參數再呼叫一次）。

## 實作決策

### 選定路線：新增第二次固定次數之批次查詢（非改簽章）

`TS-N37-008` 的註解刻意開放兩條路線。選擇「新增第二次批次查詢」而非「改
`findManyByType()` 簽章吃型別陣列」，理由：

1. **爆炸半徑最小**：改簽章要動 `attachments/attachments.store.ts` 介面 ＋
   `typeorm-attachments.store.ts` ＋三個 spec 內的 fake。其中
   `attachments.service.spec.ts:31` 與 `xls-source.service.spec.ts:63` 兩個 fake 因 TypeScript
   方法參數之**雙變性（bivariance）**會靜默通過 `tsc`，卻在被傳入陣列時行為錯誤——正是
   「型別過得去、執行時錯」的隱形陷阱。
2. **與既有慣例同型**：`enrichLinks()` 本來就是「兩次批次查詢」，往返數固定、與列數無關。
3. §10.12 的「零額外往返」是已被證偽的假設；第二次**固定次數**批次查詢是誠實成本。

### `hasOjt` 一律顯式賦值為布林

無附件／未注入 `attachmentStore` 皆賦 `false`，而非省略鍵。與姊妹富化欄位
`icsopPdfBlobPath`／`icsopPdfFileName`「無資料＝顯式空值（`null`）」之既有慣例一致。
注意此處**不能**沿用 `enrichIcsopPdf()` 的「無 store 就 early-return」寫法——那會讓
`hasOjt` 留在 `undefined`（`TS-N37-006` 正是鎖這一點），故 `enrichOjt()` 改為「無 store →
以空集合續行」，確保每一列都被顯式賦值。

### OJT 與「檔案」欄刻意分離

`enrichOjt()` 獨立於 `enrichIcsopPdf()`，因 prototype 13 之「檔案」欄僅承載 ICSOP PDF；
`TS-N37-004` 即為此回歸鎖定（僅有 OJT 的文件，「檔案」欄必須仍是 `null`）。

## 申訴與裁決結果（`ring-be2` 已採納）

`documents.service.spec.ts:961`（C 節「富化為批次查詢（不隨列數退化為 N+1）」）之
`expect(batchSpy).toHaveBeenCalledTimes(1)` 與本欄需求**數學互斥**。

- **該斷言早於本輪的環**：`git show HEAD~1:./src/documents/documents.service.spec.ts` 同一行號
  已有 `toHaveBeenCalledTimes(1)`；`5444812` 為 +123/-0，未觸動它。
- **互斥窮舉**（給定該檔 `FakeAttachmentStore` 現有形狀，service 能得知 OJT 存在與否的全部管道）：
  1. `findSingle` → `TS-N37-007` 明令 0 次，且本身即 N+1。排除。
  2. `findManyByType(ids,'OJT_SIGNIN')`（第二次呼叫）→ 撞 961 的 `1`。**現況**。
  3. 改簽章吃型別陣列 → fake 第 108 行 `r.type === type`，傳陣列恆不相等 ⇒ `hasOjt` 恆 `false`
     ⇒ `TS-N37-001/004/005` 紅。需 `ring-be2` 同步改 fake。
  4. `AttachmentStore` 新增必填方法 → fake `implements` 立即 tsc 失敗；改選填 → fake 沒有它 ⇒
     降級 `false` ⇒ `TS-N37-001` 紅。排除。
  5. 經 `DocumentStore`／`FakeStore` → 附件只 seed 進 `FakeAttachmentStore`。排除。

  ⇒ 只剩路線 2 與 3，各自撞不同測試，無第三條路；任一裁決都必須動到該 spec 檔一處。
- **建議**：將 961 的常數 `1` 更新為 `2`。這**不是弱化**——`toHaveBeenCalledTimes(2)` 與 `(1)`
  同為精確固定次數 pin，防 N+1 的強度分毫未減，只是常數隨事實更新；且 `TS-N37-008` 的註解
  已明文開放「新增第二個固定次數的批次查詢」，961 是唯一與該裁決不同步的殘留。

**裁決結果（2026-08-21）**：`ring-be2` 採納申訴與建議路線，自行將 `documents.service.spec.ts:961`
之常數由 `1` 更正為 `2`，並加註說明「本行仍是精確固定次數之 pin（非鬆綁為 `toBeGreaterThan(0)`
或移除斷言）——若日後退化為隨列數增長，本斷言依然會抓到」。

⚠ 該 spec 檔之變更**由 `ring-be2` 執筆**，實作端（本 agent）自始至終未觸動任何 `*.spec.ts`。
實作端之 `git diff` 僅含 `backend/src/documents/documents.service.ts` 一個 production 檔。

## 已知盲區（如實標註，非新增）

`typeorm` 層是否正確組出 `hasOjt` 仍是「單元測試證明不了資料表存在」型盲區，與
`icsopPdfBlobPath` 富化現況一致——但本次**未改動任何 SQL**，`enrichOjt()` 走的是既有
`findManyByType()` 查詢（僅型別參數不同），風險等同既有已上線路徑。
瀏覽器端「圖示是否真的翻成『有 OJT』」仍建議由 lead 於遠端環境目視確認一次。
