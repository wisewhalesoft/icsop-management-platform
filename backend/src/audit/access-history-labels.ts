/**
 * F024 匯出之值層中文標籤（角色／操作類型／類型三張對照表）。
 *
 * 權威：
 *  - `docs/specs/features/F024-access-history-query.md#export-fix-delta` `AC-F5` ①②③
 *  - `docs/specs/architecture-spec.md` §10.18 決策 `A16-2`（落點＝本檔；三個函式之簽章逐字取自該節）
 *  - `docs/specs/error-handling.md#export`（值層通則：列舉／代碼欄一律輸出中文標籤）
 *
 * 🔒 **兩份逐字相同**之不變式：本模組與前端 `frontend/src/domain/roles.ts` 之 `ROLE_META`、
 *    `frontend/src/pages/AccessHistoryPage.tsx` 之 `ACT_LABEL`／`rowKind()` **各留一份**。
 *    本 repo 前後端為兩個獨立 TS 專案、無共用 package ⇒「只有一份」在現有 build 管線下不可達；
 *    沿用 §10.14（`watermarkLines()`）與 `change-history/change-labels.ts`（`OQ-D18-34`）之既有處置。
 *    可觀測不變式＝「CSV 儲存格之值與畫面同一格之可見文字逐字相同」（`AC-F5` ④，含兩項刻意例外）。
 *
 * 📌 落在 `audit/` 而非 `storage/`（§10.18 A16-2）：`csv-export.ts` 是**格式層**純規則（BOM／CRLF／
 *    RFC4180／注入前綴），對「值是什麼」一無所知並由四處匯出共用；本模組是 F024 **領域專屬**之值語意。
 *
 * ⚠ 純函式、零 IO、零 Nest DI。
 */

/**
 * 角色代碼 → 中文標籤（`AC-F5` ①；與 `frontend/src/domain/roles.ts` 之 `ROLE_META[x].label` 同值）。
 * 未收錄或 `null` → **空字串**（刻意不同於 `actionTypeLabel`／`auditKindLabel` 之「原樣輸出」策略，
 * 為 `AC-F5` ① 明訂之差異，非疏漏）。
 */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  SysAdmin: '系統管理員',
  ICSOPAdmin: 'ICSOP 管理員',
  Supervisor: '主管',
  DeptContact: '部門窗口',
  User: '一般使用者',
};

export function roleLabel(roleCode: string | null): string {
  if (!roleCode) return '';
  return ROLE_LABEL[roleCode] ?? '';
}

/**
 * 操作類型代碼 → 中文標籤（`AC-F5` ②；與 `AccessHistoryPage.tsx` 之 `ACT_LABEL` 同值）。
 *
 * 🔴 **只回標籤、不含代碼**——畫面該欄為複合格式 `{代碼} · {標籤}`，CSV 只出中文標籤。
 *    此為 `error-handling.md#export`「列舉／代碼欄一律輸出中文標籤」之通則優先於「逐字比照畫面」，
 *    已於 2026-08-18 人類閘門認可；日後不得以「CSV 與畫面不一致」為由改回輸出代碼。
 *
 * ⚠ fallback（既有缺口之承接，非本輪新增）：`LIFECYCLE_DELETE`（F007）與 `ALERT_RESOLVED`（F006）
 *    於畫面對照表中不存在、現況顯示裸代碼 ⇒ CSV 沿用同一 fallback＝**原樣輸出代碼**
 *    （不留空、不臆造標籤）。登錄於 `OQ-E07-13`，本輪不補。
 */
const ACTION_TYPE_LABEL: Readonly<Record<string, string>> = {
  VIEW: '檢視',
  DOWNLOAD: '下載',
  PRINT: '列印',
  LIFECYCLE_VIEW: '循環樹狀圖檢視',
  LIFECYCLE_DOWNLOAD: '循環樹狀圖下載',
  LIFECYCLE_PRINT: '循環樹狀圖列印',
  CHANGE_LOG_VIEW: '文件變更歷程檢視',
  LIFECYCLE_CHANGELOG_VIEW: '循環變更歷程檢視',
  LIFECYCLE_CHANGELOG_DOWNLOAD: '新舊樹狀圖下載',
  // 本 delta 新增（`AC-F13`）：匯出動作本身之稽核列亦會出現在後續查詢／匯出結果中。
  ACCESS_HISTORY_EXPORT: '調閱歷程匯出',
  // 🔴 D9 delta（`AC-N53`／`AC-N50`，`OQ-D9-29`）：OJT 簽到表上傳事件。
  // 🔒 F042 上線後本代碼**不再產生新列**，但對照**不得移除**——`AUDIT_LOG` 為 append-only，
  // 2026-08-20～E11 上線期間之歷史列永久存在且本頁仍須渲染（`AC-J22` 明訂）。
  ATTACHMENT_UPLOAD: '附件上傳',
  // 🔴 F042 E11 delta（`AC-J22`，`OQ-E11-13=B`）：教育訓練場次之登記與刪除，逐字取自
  // `prototypes/17-access-history.html`。⚠ **兩者必須互異**——把「登記」與「刪除」標成同一個
  // 詞，等於在畫面上抹掉兩者之差別（`AC-J22` ① 之硬性要求）。
  OJT_SESSION_UPLOAD: '場次登記',
  OJT_SESSION_DELETE: '場次刪除',
};

export function actionTypeLabel(actionType: string): string {
  return ACTION_TYPE_LABEL[actionType] ?? actionType;
}

/**
 * `AUDIT_LOG.targetType` → 類型欄三值之一（`AC-F5` ③；與 `AccessHistoryPage.tsx` 之 `rowKind()`
 * 同一規則）。
 *
 * ⚠ `APPENDIX` → `變更` 為**既有不一致之承接**：後端 `kindToTargetTypes('文件')` 將 `APPENDIX`
 *    歸「文件」類篩選，而畫面推導將其顯示為「變更」。本輪刻意不修（登錄 `OQ-E07-13`）——
 *    CSV 與畫面保持一致優先，兩處同時錯優於兩處各自錯不同方向。
 *    本 delta 新增之 `ACCESS_HISTORY` 亦落入「其餘 → 變更」之通則（`AC-F13` 自我遞迴效應）。
 */
export function auditKindLabel(
  targetType: string,
): '文件' | '循環' | '變更' | '上傳' | 'OJT 場次' {
  if (targetType === 'DOCUMENT' || targetType === 'USAGE_FORM') return '文件';
  if (targetType === 'LIFECYCLE') return '循環';
  // 🔴 F042 E11 delta（`AC-J23`）：第五個類型值。與 `DOCUMENT_ATTACHMENT` 同理，**必須**置於
  // 下方 `return '變更'` 之前——落入通則會使場次事件在「類型」欄顯示為「變更」，與新增之
  // 「OJT 場次」篩選值自相矛盾。刻意**不**沿用「上傳」：刪除事件顯示為「上傳」是說謊。
  if (targetType === 'OJT_SESSION') return 'OJT 場次';
  // 🔴 D9 delta（`AC-N53`）：`DOCUMENT_ATTACHMENT` **不得**落入下方「其餘 → 變更」之通則——
  // 那會使上傳事件在「類型」欄顯示為「變更」，與 `AC-N69` 新增之「上傳」篩選值自相矛盾
  // （選了「上傳」篩出來的列，類型欄卻寫「變更」）。故本判斷必須置於 return '變更' 之前。
  if (targetType === 'DOCUMENT_ATTACHMENT') return '上傳';
  return '變更';
}
