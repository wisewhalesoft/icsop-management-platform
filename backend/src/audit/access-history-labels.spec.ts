import { roleLabel, actionTypeLabel, auditKindLabel } from './access-history-labels';

/**
 * F024 匯出鈕失效之修復 delta — `AC-F5`（值層：列舉欄一律輸出中文標籤）。
 *
 * 權威：
 *  - `docs/specs/features/F024-access-history-query.md#export-fix-delta` `AC-F5` ①②③④
 *  - `docs/specs/architecture-spec.md` §10.18 決策 `A16-2`（落點＝`backend/src/audit/
 *    access-history-labels.ts`，後端專屬純函式模組，與前端 `ROLE_META`／`ACT_LABEL`／
 *    `rowKind()` 各留一份，機器可驗不變式＝「兩份逐字相同」）
 *  - `docs/specs/error-handling.md#export`（值層通則：列舉／代碼欄一律輸出中文標籤）
 *
 * ⚠ 對實作全盲：`./access-history-labels` 於本環撰寫時**尚不存在** —— import 失敗（找不到模組
 *    或找不到具名匯出）即為預期之編譯紅燈。
 *
 * 📌 三個函式名稱（`roleLabel`／`actionTypeLabel`／`auditKindLabel`）與其簽章直接取自
 *    architecture-spec §10.18 A16-2 已裁決之模組內容（非本環臆造）。
 *
 * 🔒 兩份逐字相同之不變式：本檔斷言的每一個期望值皆逐字取自 `frontend/src/domain/roles.ts`
 *    之 `ROLE_META`（已由既有 `roles.test.ts` 鎖定同一組值）與 `AC-F5` ②③ 之對照表本身
 *    （非讀取 `AccessHistoryPage.tsx` 之 `ACT_LABEL`／`rowKind()` 決定期望值——那是前端既有
 *    production 程式碼，本檔的期望值一律來自 AC 文字，兩側對齊之保證由「都取自同一份 AC」達成，
 *    而非本檔讀取前端原始碼）。
 */

describe('roleLabel（AC-F5 ①：角色代碼 → 中文標籤，不得輸出 roleCode）', () => {
  it.each([
    ['SysAdmin', '系統管理員'],
    ['ICSOPAdmin', 'ICSOP 管理員'],
    ['Supervisor', '主管'],
    ['DeptContact', '部門窗口'],
    ['User', '一般使用者'],
  ])('%s → %s', (code, label) => {
    expect(roleLabel(code)).toBe(label);
  });

  it('roleCode 為 null → 空字串', () => {
    expect(roleLabel(null)).toBe('');
  });

  it('roleCode 不在對照表中（未知值）→ 空字串（非原樣輸出代碼——與 actionTypeLabel 之 fallback 策略刻意不同）', () => {
    expect(roleLabel('UnknownRole')).toBe('');
  });

  it('輸出值一律不得含原始角色代碼字面值', () => {
    for (const code of ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User']) {
      expect(roleLabel(code)).not.toBe(code);
    }
  });
});

describe('actionTypeLabel（AC-F5 ②：操作類型代碼 → 中文標籤，CSV 只出標籤不出代碼）', () => {
  it.each([
    ['VIEW', '檢視'],
    ['DOWNLOAD', '下載'],
    ['PRINT', '列印'],
    ['LIFECYCLE_VIEW', '循環樹狀圖檢視'],
    ['LIFECYCLE_DOWNLOAD', '循環樹狀圖下載'],
    ['LIFECYCLE_PRINT', '循環樹狀圖列印'],
    ['CHANGE_LOG_VIEW', '文件變更歷程檢視'],
    ['LIFECYCLE_CHANGELOG_VIEW', '循環變更歷程檢視'],
    ['LIFECYCLE_CHANGELOG_DOWNLOAD', '新舊樹狀圖下載'],
    ['ACCESS_HISTORY_EXPORT', '調閱歷程匯出'],
  ])('%s → %s（只出標籤，不含代碼）', (code, label) => {
    const out = actionTypeLabel(code);
    expect(out).toBe(label);
    expect(out).not.toContain(code);
  });

  /**
   * ⚠ 既有缺口之承接（非本輪新增）：`LIFECYCLE_DELETE`（F007）與 `ALERT_RESOLVED`（F006）
   * 於畫面之對照表中不存在，現況顯示裸代碼。CSV 沿用同一 fallback＝輸出原代碼
   * （不留空、不臆造標籤）。登錄於 `OQ-E07-13`，本輪不補。
   */
  it.each(['LIFECYCLE_DELETE', 'ALERT_RESOLVED'])(
    '%s（既有缺口之 fallback）→ 原樣輸出代碼（不留空、不臆造標籤）',
    (code) => {
      expect(actionTypeLabel(code)).toBe(code);
    },
  );

  it('未知代碼（非既有 11 種變體之一）→ 原樣輸出（fallback 與既有缺口一致，非崩潰）', () => {
    expect(actionTypeLabel('SOME_FUTURE_ACTION')).toBe('SOME_FUTURE_ACTION');
  });

  /**
   * 🔴 D9 delta（2026-08-20，`OQ-D9-29`）：`ATTACHMENT_UPLOAD`（OJT 上傳事件）之操作類型中文標籤。
   * 權威：docs/specs/features/F024-access-history-query.md#d9-audit-view-delta `AC-N53`；
   * docs/specs/features/F023-audit-logging.md#d9-audit-delta `AC-N50`。
   */
  it('AC-N53 ATTACHMENT_UPLOAD（本 delta 新增之 actionType）→ 附件上傳（只出標籤，不含代碼）', () => {
    const out = actionTypeLabel('ATTACHMENT_UPLOAD');
    expect(out).toBe('附件上傳');
    expect(out).not.toContain('ATTACHMENT_UPLOAD');
  });

  /**
   * 🔴 F042 E11 delta（2026-08-27／28，`OQ-E11-13`→B）：`OJT_SESSION_UPLOAD`／
   * `OJT_SESSION_DELETE` 為本輪新增之獨立 actionType（取代 D9 批之 `ATTACHMENT_UPLOAD`），
   * 逐字標籤已由 ux-ojt 定稿於 `prototypes/17-access-history.html`。
   * 權威：docs/specs/features/F024-access-history-query.md#ojt-progress-audit-view-delta
   *   `AC-J22`。
   * 🔒 舊 `ATTACHMENT_UPLOAD`→`附件上傳` 之對照（上方既有測試）append-only 續留，不得移除。
   */
  it('AC-J22 actionTypeLabel(OJT_SESSION_UPLOAD) → 場次登記（只出標籤，不含代碼）', () => {
    const out = actionTypeLabel('OJT_SESSION_UPLOAD');
    expect(out).toBe('場次登記');
    expect(out).not.toContain('OJT_SESSION_UPLOAD');
  });

  it('AC-J22 actionTypeLabel(OJT_SESSION_DELETE) → 場次刪除（只出標籤，不含代碼）', () => {
    const out = actionTypeLabel('OJT_SESSION_DELETE');
    expect(out).toBe('場次刪除');
    expect(out).not.toContain('OJT_SESSION_DELETE');
  });

  /**
   * 🔴 AC-J22①之硬性要求：兩個標籤必須互異——把「登記」與「刪除」標成同一個詞，等於在畫面上
   * 抹掉兩者之差別。本斷言獨立於上方兩條逐字斷言存在：字面日後若改，互異性才是要保住的東西。
   */
  it('AC-J22① actionTypeLabel(OJT_SESSION_UPLOAD) 與 actionTypeLabel(OJT_SESSION_DELETE) 必須互異', () => {
    expect(actionTypeLabel('OJT_SESSION_UPLOAD')).not.toBe(actionTypeLabel('OJT_SESSION_DELETE'));
  });
});

describe('auditKindLabel（AC-F5 ③：targetType → 類型欄三值之一）', () => {
  it.each([
    ['DOCUMENT', '文件'],
    ['USAGE_FORM', '文件'],
    ['LIFECYCLE', '循環'],
  ])('%s → %s', (targetType, kind) => {
    expect(auditKindLabel(targetType)).toBe(kind);
  });

  /**
   * ⚠ APPENDIX → 變更 為既有不一致之承接（AC-F5 ③ 明文）：後端 `kindToTargetTypes('文件')`
   * 將 APPENDIX 歸「文件」類篩選，但畫面推導（本模組亦比照）將其顯示為「變更」。
   * 本輪刻意不修，登錄於 OQ-E07-13。CSV 與畫面保持一致優先。
   */
  it.each(['DOCUMENT_CHANGE_LOG', 'LIFECYCLE_CHANGE_LOG', 'ORG_CHANGE_ALERT', 'APPENDIX'])(
    '%s → 變更（含 APPENDIX 既有不一致之承接，刻意非「文件」）',
    (targetType) => {
      expect(auditKindLabel(targetType)).toBe('變更');
    },
  );

  /** F024 本輪新增之 ACCESS_HISTORY targetType（A16-1）亦落入「其餘 → 變更」之通則。 */
  it('ACCESS_HISTORY（本 delta 新增之 targetType，AC-F13 自我遞迴效應）→ 變更', () => {
    expect(auditKindLabel('ACCESS_HISTORY')).toBe('變更');
  });

  /**
   * 🔴 D9 delta（2026-08-20，`OQ-D9-29`／`OQ-D9-34`）：`DOCUMENT_ATTACHMENT` 為本輪新增之第 8 個
   * `targetType`（OJT 上傳事件），其類型欄標籤**不得**落入「其餘 → 變更」之通則——必須獨立顯示為
   * 「上傳」，否則會被歸入「變更」類、與 F024 `AC-N69`「上傳事件可篩出」之新增類型值互相矛盾。
   * 權威：docs/specs/features/F024-access-history-query.md#d9-audit-view-delta `AC-N53`。
   */
  it('AC-N53 DOCUMENT_ATTACHMENT（本 delta 新增之 targetType）→ 上傳（不得落入「其餘→變更」通則）', () => {
    expect(auditKindLabel('DOCUMENT_ATTACHMENT')).toBe('上傳');
    expect(auditKindLabel('DOCUMENT_ATTACHMENT')).not.toBe('變更');
  });

  /**
   * 🔴 F042 E11 delta（2026-08-27／28）：`OJT_SESSION` 為第 9 個 targetType（`OQ-E11-17` 覆核
   * 核可），F024「類型」值由四種增為五種。刻意**不沿用**既有「上傳」類（`DOCUMENT_ATTACHMENT`）
   * ——沿用會使 `OJT_SESSION_DELETE` 於畫面上顯示為「上傳」，且場次不是 `DOCUMENT_ATTACHMENT`，
   * `targetType→targetId` 對映沿用舊值等同指鹿為馬。權威：
   * docs/specs/features/F024-access-history-query.md#ojt-progress-audit-view-delta `AC-J23`。
   * 🔒 既有 `DOCUMENT_ATTACHMENT`→`上傳` 之對照（上方既有測試）append-only 續留、不得移除
   * （`AUDIT_LOG` 為 append-only，2026-08-20～E11 上線期間之歷史列永久存在且本頁仍須渲染）。
   */
  it('AC-J23 auditKindLabel(OJT_SESSION) → OJT 場次（第五類型值，不得落入「上傳」或「其餘→變更」通則）', () => {
    expect(auditKindLabel('OJT_SESSION')).toBe('OJT 場次');
    expect(auditKindLabel('OJT_SESSION')).not.toBe('上傳');
    expect(auditKindLabel('OJT_SESSION')).not.toBe('變更');
  });
});
