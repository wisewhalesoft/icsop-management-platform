import {
  resolveCompanyName,
  COMPANY_FULL_NAMES,
  COMPANY_SHORT_NAMES,
  resolveCompanyShortName,
  assertCompanyShortNamesComplete,
} from './company-name';

/**
 * 公司全稱解析（org-foundation）。對應 ORG-COMPANY-sync-test.md 之消費端 TS-COMPANY-009/010。
 *
 * ⚠ 定案（覆寫 test-spec 之 VW_HRCOMF 同步假設）：上游全專案無公司全稱來源（portalapp-sp 佐證），
 *   採靜態 COMPID→全稱 對映（AS＝和潤企業股份有限公司，與 prototype 14 COMPANY_NAME 一致）。
 *   多公司時再改為設定表／上游。故不建 COMPANY 實體、不做 VW_HRCOMF 同步。
 */
describe('resolveCompanyName（靜態 COMPID→全稱）', () => {
  it('TS-COMPANY-009 AS → 和潤企業股份有限公司', () => {
    expect(resolveCompanyName('AS')).toBe('和潤企業股份有限公司');
  });

  it('前後空白容忍', () => {
    expect(resolveCompanyName('  AS  ')).toBe('和潤企業股份有限公司');
  });

  it('TS-COMPANY-010 查無公司代碼 → null（不拋錯）', () => {
    expect(resolveCompanyName('ZZ')).toBeNull();
  });

  it('null / undefined / 空字串 → null', () => {
    expect(resolveCompanyName(null)).toBeNull();
    expect(resolveCompanyName(undefined)).toBeNull();
    expect(resolveCompanyName('')).toBeNull();
  });

  it('對映表含 AS（供 F020 浮水印公司欄）', () => {
    expect(COMPANY_FULL_NAMES.AS).toBe('和潤企業股份有限公司');
  });
});

/**
 * 🔴 D9 delta（2026-08-20，OQ-D9-06／OQ-D9-07）：浮水印專用公司簡稱常數。
 * 權威：docs/specs/features/F020-watermark.md#d9-watermark-delta `AC-N10`／`AC-N11`（INV-C2）／`AC-N12`／`AC-N13`。
 * 落點與符號名逐字取自 architecture-spec.md §11.9（`COMPANY_SHORT_NAMES`／`resolveCompanyShortName`／
 * `assertCompanyShortNamesComplete`，非本檔臆造）。
 */
describe('D9 delta — COMPANY_SHORT_NAMES（浮水印專用公司簡稱，AC-N10）', () => {
  it('AC-N10 逐字為 { AS: 和潤企業, AE: 和潤電能 }', () => {
    expect(COMPANY_SHORT_NAMES).toEqual({ AS: '和潤企業', AE: '和潤電能' });
  });

  /**
   * 🔴 AC-N11（INV-C2）：短稱表鍵集合 ≡ 全稱表鍵集合，且每一鍵之短稱值非空字串、非 null。
   * 本不變式之存在理由：新增公司時可能只登錄全稱、漏登短稱 ⇒ 浮水印公司名稱靜默退化為空欄
   * （§8.4 分隔符收合規則會讓漏登看起來像正常留空，不會有人發現）。
   */
  it('AC-N11（INV-C2）短稱表鍵集合逐項相等於全稱表鍵集合（排序後比對）', () => {
    const fullKeys = Object.keys(COMPANY_FULL_NAMES).sort();
    const shortKeys = Object.keys(COMPANY_SHORT_NAMES).sort();
    expect(shortKeys).toEqual(fullKeys);
  });

  it('AC-N11（INV-C2）每一鍵之短稱值皆非空字串、非 null', () => {
    for (const key of Object.keys(COMPANY_FULL_NAMES)) {
      const short = COMPANY_SHORT_NAMES[key as keyof typeof COMPANY_SHORT_NAMES];
      expect(short).not.toBeNull();
      expect(typeof short).toBe('string');
      expect((short as string).length).toBeGreaterThan(0);
    }
  });

  it('AC-N11（INV-C2）執行期防線：assertCompanyShortNamesComplete() 於現行常數下不拋錯', () => {
    expect(() => assertCompanyShortNamesComplete()).not.toThrow();
  });

  /**
   * ⚠ 鑑別力說明：`assertCompanyShortNamesComplete()` 為無參數之執行期防線，操作對象固定為模組級
   * 常數本身，無法從測試端注入「漏登」情境來證明它會拋錯（那需要真的修改常數本身）。故本條僅能
   * 以「函式存在且對現行（正確）常數不拋錯」作為正向佐證；其鑑別力真正落在「若未來有人漏登一個
   * 公司代碼，此函式會拋錯」這件事本身，需待未來新增公司時才會被實際驗證到——這是本不變式設計上
   * 的固有限制（供 lead 知悉，非本檔可補）。上方「鍵集合逐項相等」與「值皆非空」兩條測試已從
   * INPUT-OUTPUT 角度直接驗證 INV-C2 的核心事實，具備真正鑑別力（若任一鍵缺漏或值為空，這兩條
   * 會先紅）。
   */
});

describe('D9 delta — resolveCompanyShortName（AC-N12）', () => {
  it('AC-N12 AS → 和潤企業（非「和潤企業股份有限公司」全稱）', () => {
    expect(resolveCompanyShortName('AS')).toBe('和潤企業');
  });

  it('AC-N12 AE → 和潤電能', () => {
    expect(resolveCompanyShortName('AE')).toBe('和潤電能');
  });

  it('AC-N12 查無公司代碼 → null（不得回退為全稱、不得輸出字面 null）', () => {
    expect(resolveCompanyShortName('ZZ')).toBeNull();
  });

  it('null／undefined／空字串 → null（比照 resolveCompanyName 之寬容處置）', () => {
    expect(resolveCompanyShortName(null)).toBeNull();
    expect(resolveCompanyShortName(undefined)).toBeNull();
    expect(resolveCompanyShortName('')).toBeNull();
  });

  it('前後空白容忍（比照 resolveCompanyName 既有慣例）', () => {
    expect(resolveCompanyShortName('  AS  ')).toBe('和潤企業');
  });
});

/**
 * 🔴 AC-N13（🔒 全稱三處消費點回歸鎖定）——本檔僅能驗證 `COMPANY_FULL_NAMES` 本身之值未被
 * `resolveCompanyShortName` 之新增連帶修改（單元層防線）；三處消費點（F003 帳號管理下拉/清單、
 * `GET /companies`、F024 調閱歷程公司欄）之逐字全稱斷言分別歸屬各自 feature 之既有測試檔，
 * 本檔不越界重工，僅在此註記其權威來源不變。
 */
describe('D9 delta — AC-N13（🔒 全稱三處消費點回歸鎖定，本檔僅驗證共用常數本身未被連帶修改）', () => {
  it('COMPANY_FULL_NAMES 之值逐字未變（AS 仍為全稱，未被簡稱化）', () => {
    expect(COMPANY_FULL_NAMES.AS).toBe('和潤企業股份有限公司');
    expect(resolveCompanyName('AS')).toBe('和潤企業股份有限公司');
  });

  it('INV-C1（既有）維持成立：SELECTABLE_COMPANIES 等同 COMPANY_FULL_NAMES 鍵集合 —— 由既有 org-company-sync 測試持有，本檔僅確認鍵集合未被本次新增之短稱表連帶改動', () => {
    expect(Object.keys(COMPANY_FULL_NAMES).sort()).toEqual(['AE', 'AS']);
  });
});
