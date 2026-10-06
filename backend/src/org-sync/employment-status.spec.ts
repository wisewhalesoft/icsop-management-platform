import {
  isEmploymentActive,
  isDeptActive,
  DEPT_SENTINEL_CLOSE_DATE,
} from './employment-status';

/**
 * 在職 / 部門有效判定（upstream-hr-source-contract.md §4 / §6）。
 *  - v2.0 在職權威＝`RESIGN_DATE >= 基準日`（以日為單位；語意＝最後在職日）
 *  - v1.0 之 `EMPSTS='A'` 已停用（來源 VW_HPMUSER 母體污染，契約 §3.7）
 *  - 部門有效 ⇔ CLOSE_DATE > now（哨兵 9999-12-31，時間戳嚴格大於，語意不變）
 */

describe('isEmploymentActive（RESIGN_DATE >= 基準日）', () => {
  // 同步實務上於當日稍晚執行；刻意選非零時之基準，才驗得出「以日比較」而非比時間戳。
  // 🔴 F004 AC-RS1：基準日＝**台北**日曆日。本基準＝台北 2026-08-24 18:00（UTC 10:00）。
  //    ⚠ 2026-10-06 前本處為 `2026-08-24T18:00:00Z`——那是台北 **08-25** 02:00（正是每日排程時刻），
  //    下方「最後在職日＝當日」一案因而把「08-24 離職者於 08-25 凌晨仍判在職」之缺陷釘成預期行為。
  const now = new Date('2026-08-24T10:00:00Z');

  it('哨兵已收斂為 null（未離職）→ 在職', () => {
    expect(isEmploymentActive(null, now)).toBe(true);
    expect(isEmploymentActive(undefined, now)).toBe(true);
  });

  it('離職日在未來 → 在職', () => {
    expect(isEmploymentActive(new Date('2026-12-31T00:00:00Z'), now)).toBe(true);
    expect(isEmploymentActive(new Date('2026-08-25T00:00:00Z'), now)).toBe(true);
  });

  it('🔴 最後在職日＝當日 → 仍在職（當日整天，不因同步時刻而翻面）', () => {
    // 迴歸鎖定：天真的 `resign >= now` 會在此回 false，使當天離職者整批被誤停用。
    expect(isEmploymentActive(new Date('2026-08-24T00:00:00Z'), now)).toBe(true);
  });

  it('當日之判定不隨同步時刻改變（台北 00:00 與 23:59:59 一致）', () => {
    const resign = new Date('2026-08-24T00:00:00Z');
    expect(isEmploymentActive(resign, new Date('2026-08-23T16:00:00Z'))).toBe(true); // 台北 08-24 00:00
    expect(isEmploymentActive(resign, new Date('2026-08-24T15:59:59Z'))).toBe(true); // 台北 08-24 23:59:59
  });

  describe('🔴 F004 AC-RS1：基準日＝台北日曆日（不依 UTC、不依行程時區）', () => {
    const resign = new Date('2026-08-31T00:00:00Z'); // 最後在職日 D＝2026-08-31

    it('台北 D+1 00:00:00（UTC D 16:00）→ 離職', () => {
      expect(isEmploymentActive(resign, new Date('2026-08-31T16:00:00Z'))).toBe(false);
    });

    it('台北 D+1 02:00（UTC **D** 18:00，每日排程時刻；正式站 AS 20541／AJ 50002 之重現點）→ 離職', () => {
      expect(isEmploymentActive(resign, new Date('2026-08-31T18:00:00Z'))).toBe(false);
    });

    it('台北 D+1 07:59:59（UTC D 23:59:59，UTC 日期仍為 D）→ 離職', () => {
      expect(isEmploymentActive(resign, new Date('2026-08-31T23:59:59Z'))).toBe(false);
    });

    it('台北 D 23:59:59（UTC D 15:59:59）→ 仍在職', () => {
      expect(isEmploymentActive(resign, new Date('2026-08-31T15:59:59Z'))).toBe(true);
    });

    it('台北 D 00:00（UTC D-1 16:00，UTC 日期為 D-1）→ 仍在職', () => {
      expect(isEmploymentActive(resign, new Date('2026-08-30T16:00:00Z'))).toBe(true);
    });
  });

  it('離職日已過（前一日）→ 非在職', () => {
    expect(isEmploymentActive(new Date('2026-08-23T00:00:00Z'), now)).toBe(false);
    expect(isEmploymentActive(new Date('2020-01-01T00:00:00Z'), now)).toBe(false);
  });

  it('接受可解析之日期字串', () => {
    expect(isEmploymentActive('2026-08-24', now)).toBe(true);
    expect(isEmploymentActive('2026-08-23', now)).toBe(false);
  });

  it('無法解析之值 → 拋 RangeError（不靜默視為在職）', () => {
    expect(() => isEmploymentActive('not-a-date', now)).toThrow(RangeError);
  });
});

describe('isDeptActive（CLOSE_DATE > now）', () => {
  const now = new Date('2026-07-21T00:00:00Z');

  it('哨兵 9999-12-31 → 有效（true）', () => {
    expect(isDeptActive(DEPT_SENTINEL_CLOSE_DATE, now)).toBe(true);
    expect(isDeptActive(new Date('9999-12-31T00:00:00Z'), now)).toBe(true);
  });

  it('CLOSE_DATE 在未來 → 有效', () => {
    expect(isDeptActive(new Date('2026-08-01T00:00:00Z'), now)).toBe(true);
  });

  it('CLOSE_DATE 已過 → 無效（false）', () => {
    expect(isDeptActive(new Date('2020-01-01T00:00:00Z'), now)).toBe(false);
  });

  it('CLOSE_DATE 等於 now → 無效（非嚴格大於）', () => {
    expect(isDeptActive(new Date('2026-07-21T00:00:00Z'), now)).toBe(false);
  });

  it('接受可解析之日期字串', () => {
    expect(isDeptActive('9999-12-31', now)).toBe(true);
    expect(isDeptActive('2020-01-01', now)).toBe(false);
  });
});
