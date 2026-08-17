/**
 * 變更歷程之顯示標籤對照（F037／F038 匯出之值層）。
 *
 * 權威：`docs/specs/error-handling.md#export` 值層通則——「列舉／代碼欄一律輸出**畫面所見之中文
 * 標籤**，不得輸出屬性名或列舉代碼」（`documentName` → `程序書書名`；`CONTENT` → `編輯`）。
 *
 * ⚠ **已知殘餘**：本 repo 為前後端分離之 monorepo 且**無共用 package**，故對照表目前於
 * `frontend/src/pages/ChangeHistoryPage.tsx` 亦有一份。`error-handling.md#export` 要求「只有一份」，
 * 但其落點未經 architect 定案；本輪沿用 architecture-spec §10.14 對 `watermarkLines()` 之既有處置
 * ——兩份實作以**同一組值**綁定，可觀測不變式為「CSV 儲存格之值與畫面同一格之可見文字逐字相同」。
 * 已列入交付報告之殘餘風險。
 */

/** 變更欄位屬性名 → 畫面所見之中文欄名（與前端 `FIELD_LABEL` 同值）。 */
const FIELD_LABEL: Record<string, string> = {
  status: '文件狀態',
  documentName: '程序書書名',
  documentNumber: '文件編號',
  lifecycleId: '所屬循環',
  draftingCompanyId: '制定公司',
  draftingDeptId: '制定部門',
  draftingSectionId: '制定室別',
  primaryChiefId: '當責室長-主要',
  secondaryChiefIds: '當責室長-次要',
  usingDeptIds: '文件使用部門',
  edition: '版次',
  announcedDate: '公告日期',
  version: '版次',
  contentSummary: '內容摘要',
  summary: '內容摘要',
  attachment: '附件',
  /**
   * F037 `AC-D11` ①：附件替換事件之型別化鍵。現行發佈端（`attachments.service.ts`）寫入之
   * `field` 為 `attachment`，本鍵為 AC 明列之型別化形式，兩者皆對映以免任一形式漏接。
   * ⚠ 前端 `ChangeHistoryPage.FIELD_LABEL` 需同步（不變式＝CSV 與畫面逐字相同）。
   */
  'attachment(ICSOP_PDF)': '檔案（ICSOP PDF）',
};

/** 來源分類（由 `field` 推導；`CREATE` 事件優先）——與前端 `sourceOf()` 同一規則。 */
const SOURCE_OF_FIELD: Record<string, string> = {
  draftingCompanyId: '制定組織',
  draftingDeptId: '制定組織',
  draftingSectionId: '制定組織',
  primaryChiefId: '當責室長',
  secondaryChiefIds: '當責室長',
  announcedDate: '公告日期',
  usingDeptIds: '使用部門',
  status: '狀態切換',
  attachment: '附件',
};

/**
 * 循環結構變更類型 → 畫面所見之中文標籤（F038 `AC-D7` ①；與前端 `LC_TYPE` 之 `label` 同值）。
 *
 * 🔴 值域**恰為六者**（＝ prototype 23「變更類型」篩選下拉之選項，逐字）：
 * `新增節點`／`移除節點`／`新增連線`／`移除連線`／`節點改名`／`文件掛載變更`。
 * 🔴 掛載／改派／解除**三對一**映射為 `文件掛載變更`——這與畫面完全一致（下拉本即只有六個選項），
 * 細節由同列之 `變更摘要` 讀出。若日後需區分，**須先改畫面之六值下拉，不得只改 CSV**。
 */
const LIFECYCLE_CHANGE_KIND_LABEL: Record<string, string> = {
  NODE_ADDED: '新增節點',
  NODE_REMOVED: '移除節點',
  EDGE_ADDED: '新增連線',
  EDGE_REMOVED: '移除連線',
  NODE_RENAMED: '節點改名',
  DOCUMENT_MOUNTED: '文件掛載變更',
  DOCUMENT_REASSIGNED: '文件掛載變更',
  DOCUMENT_UNMOUNTED: '文件掛載變更',
};

/** 未收錄之列舉一律原樣輸出（優於輸出空白，使異常可被看見；與 `fieldLabel` 同一策略）。 */
export function lifecycleChangeKindLabel(changeType: string): string {
  return LIFECYCLE_CHANGE_KIND_LABEL[changeType] ?? changeType;
}

/** 文件狀態列舉 → 中文（`field === 'status'` 之舊值／新值適用）。 */
const STATUS_LABEL: Record<string, string> = {
  active: '有效',
  inactive: '失效',
  void: '作廢',
};

/** 未收錄之屬性名一律原樣輸出（優於輸出空白，使異常可被看見）。 */
export function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field;
}

/** `編輯` 為 catch-all（版次／摘要／書名／編號…）。 */
export function sourceLabel(changeType: string, field: string): string {
  if (changeType === 'CREATE') return '建立';
  return SOURCE_OF_FIELD[field] ?? '編輯';
}

/** 舊值／新值之顯示字串：空值為 `（空）`；狀態欄轉中文。 */
export function changeValueLabel(field: string, value: string | null): string {
  if (value === null || value === '') return '（空）';
  return field === 'status' ? (STATUS_LABEL[value] ?? value) : value;
}

/** 操作人顯示字串：`姓名（員編）`（與畫面同一格式）。 */
export function actorLabel(name: string | null, employeeNo: string | null): string {
  return `${name ?? '—'}（${employeeNo ?? '—'}）`;
}
