import { describe, it, expect } from 'vitest';
import {
  // ── 本輪新增（2026-09-01，F042 AC-30～AC-36）────────────────────────────────
  docGroupsOf,
  matchesDocKeyword,
  docGroupRatioText,
  docGroupPercentText,
  GROUP_MODE_ORG_TEXT,
  GROUP_MODE_DOC_TEXT,
  GROUP_MODE_ARIA_TEXT,
  DOC_SEARCH_ARIA_TEXT,
  DOC_SEARCH_PLACEHOLDER_TEXT,
  DOC_GROUP_BASIS_NOTE_TEXT,
  // ── 既有（本輪只沿用、不改寫）──────────────────────────────────────────────
  coveragePercent,
  NO_STATISTICS_TEXT,
  EMPTY_ROWS_TEXT,
  EMPTY_ALL_TEXT,
  EMPTY_ALL_HINT,
} from './ojt-progress-view';
import type { OjtProgressRow } from '../api/types';

/**
 * F042 OJT 進度管理 — TAB2 第二種分組模式「以文件分組」之**純函式層**約束環。
 * 權威：docs/specs/features/F042-ojt-progress-management.md
 *   §九（`AC-30`～`AC-36`）＋ §3-B（掛鉤對照）＋ §6 ⑳（逐字文案總表）。
 *
 * ⚠ 對實作全盲：本檔所 import 之八個新符號（`docGroupsOf`／`matchesDocKeyword`／
 * `docGroupRatioText` ＋ 五個文案常數）尚不存在 ⇒ 本檔全紅即為本環之預期紅燈。
 * 既有五個符號（`coveragePercent`／`NO_STATISTICS_TEXT`／三個空狀態常數）為**沿用**，
 * 本檔對它們只做**回歸鎖定**，不改其行為。
 *
 * 🔴 **為什麼要有純函式層這一檔（元件層測不到的三件事）**：
 *   ① `AC-32` 之「分母為 0 不得 NaN%／0%／100%」在元件層**不可達**——文件群組是「因為有列」
 *      才存在的，`Y ≥ 1` 恆成立；唯一能餵 `(0, 0)` 的地方就是這裡。
 *   ② 排序（`AC-34`）在元件層只驗得到「渲染順序」，看不出**比較器**是否具決定性；純函式層可以
 *      直接餵兩種不同的輸入順序去比對。
 *   ③ 文案常數之逐字（`AC-35`）：🔒 **全環之中文文案字面只在本檔出現這一次**——其餘每一處
 *      （含元件層）一律 import 常數。同一組文案在兩處各打一份即為分歧之起點（本規格集之既有原則）。
 */

/** 進度列 fixture；預設為「一般、已完成」之列，個別案再以 `over` 覆寫。 */
const row = (over: Partial<OjtProgressRow> = {}): OjtProgressRow => ({
  documentId: 'd1',
  documentNumber: 'ICSOP-AAA-101-1-01',
  documentName: '車輛分期進件作業',
  companyCode: 'AS',
  orgCode: 'JAC00',
  orgName: '和潤企業 / 營運管理部 / A 室',
  sessionCount: 1,
  completed: true,
  inactive: false,
  orphaned: false,
  // 🔴 F042 第五輪 additive 欄；預設與既有語意等價（場次全數符合當下基準版次）。
  currentEditionSessionCount: 1,
  trainingEdition: null,
  documentEdition: null,
  announcedDate: null,
  ...over,
});

describe('ojt-progress-view — TAB2「以文件分組」之純函式層（F042 AC-30～AC-36）', () => {
  /**
   * ===================== 一、文案常數之逐字鎖（AC-35／F042 §6 ⑳） =====================
   * 🔒 本 describe 是**全環唯一**允許出現中文文案字面之處：它把「常數」綁到「規格逐字」。
   * 其餘任何一條斷言若直接寫中文文案字面，就等於在第二個地方又存了一份文案。
   */
  describe('一、文案常數之逐字鎖（AC-35；全環唯一一份中文文案字面）', () => {
    it('分組模式之兩個 option 可見文字與其 aria-label（§6 ⑳）', () => {
      expect(GROUP_MODE_ORG_TEXT).toBe('以使用單位分組');
      expect(GROUP_MODE_DOC_TEXT).toBe('以文件分組');
      expect(GROUP_MODE_ARIA_TEXT).toBe('資料清單之分組方式');
    });

    it('文件搜尋之 aria-label 與 placeholder（§6 ⑳；句尾為單一刪節號 …）', () => {
      expect(DOC_SEARCH_ARIA_TEXT).toBe('搜尋文件');
      expect(DOC_SEARCH_PLACEHOLDER_TEXT).toBe('搜尋文件（編號或書名）…');
    });

    it('口徑說明行之逐字（AC-32 之必要載體）', () => {
      expect(DOC_GROUP_BASIS_NOTE_TEXT).toBe(
        '本區各文件之「已完成 X / 共 Y 單位」取自本清單當下呈現之進度列（含已裁撤單位與已移出使用部門之單位），與儀表板「文件-訓練覆蓋率」之口徑刻意不同；兩處數字不相等屬正常，請勿互相對帳。',
      );
    });

    /**
     * 🔒 AC-35：空狀態**沿用既有常數、不另造詞**。本案同時是「本輪沒有偷偷改既有文案」之回歸鎖。
     * ⚠ 若實作為文件分組模式**另造**一組空狀態文案，本案不會紅（它只鎖既有常數之值）——
     *   「不另造詞」之真正防線在元件層（斷言畫面上出現的就是這三個常數），兩層一起才完整。
     */
    it('🔒 空狀態沿用既有三個常數，逐字未動（回歸鎖）', () => {
      expect(EMPTY_ROWS_TEXT).toBe('查無符合條件的進度列');
      expect(EMPTY_ALL_TEXT).toBe('目前沒有任何 OJT 進度列');
      expect(EMPTY_ALL_HINT).toContain('文件使用部門');
    });

    it('完成度之逐字形狀（半形斜線；⚠ 與文件表單側 [data-ojt-derived-summary] 之全形 ／ 刻意不同）', () => {
      expect(docGroupRatioText(2, 3)).toBe('已完成 2 / 共 3 單位');
      // 🔴 負向：不得順手對齊成文件表單側之全形斜線句型（上一句正向斷言已確立載體存在）。
      expect(docGroupRatioText(2, 3)).not.toContain('／');
    });
  });

  /**
   * ===================== 二、docGroupsOf：分組鍵與群組形狀（AC-31／AC-32） =====================
   */
  describe('二、docGroupsOf — 分組鍵與群組形狀（AC-31①②／AC-32）', () => {
    it('以 documentId 收斂：同一文件之多列成一組，不同文件不合併', () => {
      const groups = docGroupsOf([
        row({ documentId: 'dA', documentNumber: 'N-A', orgCode: 'A1', orgName: '和潤企業 / X 部 / A 室' }),
        row({ documentId: 'dA', documentNumber: 'N-A', orgCode: 'A2', orgName: '和潤企業 / X 部 / B 室' }),
        row({ documentId: 'dB', documentNumber: 'N-B', orgCode: 'B1', orgName: '和潤企業 / Y 部 / A 室' }),
      ]);
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.documentId)).toEqual(['dA', 'dB']);
      expect(groups[0].rows).toHaveLength(2);
      expect(groups[1].rows).toHaveLength(1);
    });

    it('群組帶文件編號與書名（標題之兩個欄位，AC-31②）', () => {
      const [g] = docGroupsOf([
        row({ documentId: 'dA', documentNumber: 'ICSOP-ZZZ-9', documentName: '徵信作業要點' }),
      ]);
      expect(g.documentNumber).toBe('ICSOP-ZZZ-9');
      expect(g.documentName).toBe('徵信作業要點');
    });

    /**
     * 🔴 AC-31 之負向鎖定：鍵是 `documentId`，不是書名。書名非唯一，以書名分組會把兩份不同
     * 文件併成一組 ⇒ 畫面上**憑空少掉一份文件**（本 repo 之「畫面說謊」既有形狀）。
     */
    it('🔴 鍵是 documentId 而非書名：兩份同名之不同文件不得併成一組', () => {
      const groups = docGroupsOf([
        row({ documentId: 'd1', documentNumber: 'N-1', documentName: '徵信作業要點' }),
        row({ documentId: 'd2', documentNumber: 'N-2', documentName: '徵信作業要點' }),
      ]);
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.documentId).sort()).toEqual(['d1', 'd2']);
    });

    /**
     * 🔴 AC-32 口徑：X／Y 取自**傳入之列本身**——含 `inactive`（已裁撤）與 `orphaned`
     * （已移出使用部門）之列。⚠ 這正是與 TAB1 `docCoverage` 分岔之處：後者之列由
     * `DOC_USING_DEPT` 驅動 ⇒ 孤兒天然不成列。
     */
    it('done／total 取自傳入之列本身，含 inactive 與 orphaned 之列（AC-32 口徑）', () => {
      const [g] = docGroupsOf([
        row({ documentId: 'dA', orgCode: 'A1', orgName: '和潤企業 / X 部 / A 室', completed: true }),
        row({ documentId: 'dA', orgCode: 'A2', orgName: '和潤企業 / X 部 / B 室', completed: false, sessionCount: 0, inactive: true }),
        row({ documentId: 'dA', orgCode: 'A3', orgName: '和潤企業 / X 部 / C 室', completed: true, orphaned: true }),
      ]);
      expect(g.total).toBe(3);
      expect(g.done).toBe(2);
    });

    it('空陣列 → 無任何群組（非丟例外、非回傳 undefined）', () => {
      expect(docGroupsOf([])).toEqual([]);
    });

    /**
     * 🔴 分組不得改寫列本身（`AC-30` 之核心：分組只改「列裝進哪個盒子」）。
     * 以物件參照相等作斷言——若實作在分組時複製並「順手」補欄位／改欄位，本案即紅。
     */
    it('🔴 群組保留原列之物件參照：分組不得複製或改寫任何一列', () => {
      const r1 = row({ documentId: 'dA', orgCode: 'A1', orgName: '和潤企業 / X 部 / A 室' });
      const [g] = docGroupsOf([r1]);
      expect(g.rows[0]).toBe(r1);
    });
  });

  /**
   * ===================== 三、排序之決定性（AC-34） =====================
   * 🔴 語料刻意亂序餵入；🔒 差異落在 Latin 字元（A／B／C、編號），使斷言不受 ICU 中文定序
   * 與 code unit 定序之分歧影響——排序規則本身是 `localeCompare`，但**測試不該把自己綁在
   * 某一種中文定序的結果上**（那會使同一份程式碼在不同環境紅綠不定）。
   */
  describe('三、排序之決定性（AC-34）', () => {
    it('文件群組依 documentNumber 昇冪（亂序輸入）', () => {
      const groups = docGroupsOf([
        row({ documentId: 'd3', documentNumber: 'ICSOP-C-003' }),
        row({ documentId: 'd1', documentNumber: 'ICSOP-A-001' }),
        row({ documentId: 'd2', documentNumber: 'ICSOP-B-002' }),
      ]);
      expect(groups.map((g) => g.documentNumber)).toEqual(['ICSOP-A-001', 'ICSOP-B-002', 'ICSOP-C-003']);
    });

    it('組內列依 orgName 昇冪（亂序輸入）', () => {
      const [g] = docGroupsOf([
        row({ documentId: 'dA', orgCode: 'C1', orgName: '和潤企業 / 財務會計部 / C 室' }),
        row({ documentId: 'dA', orgCode: 'A1', orgName: '和潤企業 / 財務會計部 / A 室' }),
        row({ documentId: 'dA', orgCode: 'B1', orgName: '和潤企業 / 財務會計部 / B 室' }),
      ]);
      expect(g.rows.map((r) => r.orgName)).toEqual([
        '和潤企業 / 財務會計部 / A 室',
        '和潤企業 / 財務會計部 / B 室',
        '和潤企業 / 財務會計部 / C 室',
      ]);
    });

    it('🔴 排序不得依賴資料到達順序：同一組列以兩種輸入順序餵入，輸出順序相同', () => {
      const a = row({ documentId: 'dA', orgCode: 'A1', orgName: '和潤企業 / X 部 / A 室' });
      const b = row({ documentId: 'dA', orgCode: 'B1', orgName: '和潤企業 / X 部 / B 室' });
      expect(docGroupsOf([a, b])[0].rows.map((r) => r.orgCode)).toEqual(['A1', 'B1']);
      expect(docGroupsOf([b, a])[0].rows.map((r) => r.orgCode)).toEqual(['A1', 'B1']);
    });
  });

  /**
   * ===================== 四、百分比之單一推導點（AC-32） =====================
   * 🔴 `coveragePercent()` 為全頁**唯一**之百分比推導點。本頁已發生過的真實缺陷形狀有二：
   *   (a) 另打一份 `Math.round(...)`；(b) 讀一個 API 未送之 `rate` 欄而印出 `undefined%`。
   *
   * 📝 **介面形狀之更正（test-generator，2026-09-01 首跑後）**：本檔初稿假定
   * `coveragePercent(done, total)` 回傳**已格式化之字串**（`'67%'`／`NO_STATISTICS_TEXT`）；
   * 首跑之紅燈揭露既有簽章實為 **`(done, total) => number | null`**——回傳 `67`／`100`／`0`，
   * 分母為 0 時回 **`null`**（＝「無可統計」之信號，由呼叫端換成 `NO_STATISTICS_TEXT`）。
   * 🔒 **本次更正的是介面形狀，不是行為斷言**：四捨五入、`0%` 非錯誤、分母 0 不得退化為
   * `NaN%`／`0%`／`100%` 三者一字未鬆——只是把「誰負責把數字變成字串」放回既有的位置，並
   * 為文件群組指定其**顯示字串之單一推導點** `docGroupPercentText(done, total)`。
   */
  describe('四、百分比之單一推導點（AC-32）', () => {
    it('coveragePercent 之既有契約（回歸鎖）：回傳數值、四捨五入（非無條件捨去）；分母為 0 回 null', () => {
      expect(coveragePercent(2, 3)).toBe(67); // 67 而非 66 ⇒ round 而非 floor
      expect(coveragePercent(3, 3)).toBe(100);
      expect(coveragePercent(0, 3)).toBe(0); // 全部未完成 ⇒ 0（非錯誤、非空白）
      const zero = coveragePercent(0, 0);
      expect(zero).toBeNull(); // 正向：確立回傳值即「無可統計」之信號
      expect(zero).not.toBe(0); // 🔴 不得與「全部未完成」合流
      expect(zero).not.toBe(100); // 🔴 更不得謊報為全部完成
    });

    /**
     * 🔴 文件群組之百分比**顯示字串**必須由 `coveragePercent` 推導——第一句鎖「等於單一推導點
     * 之產出」，第二句以逐字對照確保不是「兩邊一起壞」（若實作把 `docGroupPercentText` 與
     * `coveragePercent` 同時改成 floor，只有第二句會紅）。
     */
    it('docGroupPercentText 之顯示字串由 coveragePercent 推導（單一推導點；2/3 ⇒ 67%）', () => {
      expect(docGroupPercentText(2, 3)).toBe(`${coveragePercent(2, 3)}%`);
      expect(docGroupPercentText(2, 3)).toBe('67%');
      expect(docGroupPercentText(1, 2)).toBe('50%');
      expect(docGroupPercentText(0, 3)).toBe('0%');
    });

    /**
     * 🔴 AC-32／AC-14 之既有規則：分母為 0 時 `0/0` 在 JS 為 `NaN`，直接渲染會出現 `NaN%`；
     * 退化為 `0%` 則與「全部未完成」無從分辨；退化為 `100%` 更會謊報。
     * 📌 本分支於元件層不可達（群組因有列才存在，`Y ≥ 1` 恆成立）⇒ **本案是它在全環中唯一的載體**。
     */
    it('🔴 分母為 0 ⇒ NO_STATISTICS_TEXT（先正向確立回傳值，再逐一排除三種退化）', () => {
      const text = docGroupPercentText(0, 0);
      expect(text).toBe(NO_STATISTICS_TEXT); // 正向：載體存在且為既有常數
      expect(text).not.toMatch(/NaN/); // 🔴 null → `null%`／`NaN%` 皆為本條所禁
      expect(text).not.toBe('0%');
      expect(text).not.toBe('100%');
    });
  });

  /**
   * ===================== 五、matchesDocKeyword：文件搜尋之比對規則（AC-33②） =====================
   */
  describe('五、matchesDocKeyword — 文件搜尋（AC-33②）', () => {
    const target = row({ documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' });

    it('命中文件編號之子字串，且不分大小寫', () => {
      expect(matchesDocKeyword(target, 'SRC-101')).toBe(true);
      expect(matchesDocKeyword(target, 'src-101')).toBe(true);
      expect(matchesDocKeyword(target, 'IcSoP')).toBe(true);
    });

    it('命中書名之子字串', () => {
      expect(matchesDocKeyword(target, '分期進件')).toBe(true);
    });

    /**
     * 🔴 負向斷言之前先有正向：同一列對「分期進件」命中（本案第一句）、對本案之關鍵字不命中。
     * 少了正向半句，「查無 ⇒ 兩邊都 false ⇒ 負向恆真」就是本 repo 最常見之假綠。
     */
    it('🔴 不命中 ⇒ false（同一列另有命中案，故本斷言具鑑別力）', () => {
      expect(matchesDocKeyword(target, '分期進件')).toBe(true);
      expect(matchesDocKeyword(target, 'ZZZ-999')).toBe(false);
    });

    it('空字串與純空白（trim 後為空）⇒ 視為不過濾，一律 true', () => {
      expect(matchesDocKeyword(target, '')).toBe(true);
      expect(matchesDocKeyword(target, '   ')).toBe(true);
    });

    it('關鍵字前後之空白不影響比對（trim 後再比）', () => {
      expect(matchesDocKeyword(target, '  SRC-101  ')).toBe(true);
    });
  });
});
