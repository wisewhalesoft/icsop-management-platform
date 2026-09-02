import { describe, it, expect } from 'vitest';
import {
  EDITION_NONE_KEY,
  EDITION_NONE_TEXT,
  canViewDashboard,
  dueDateText,
  DUE_DATE_UNKNOWN_TEXT,
  editionText,
  groupSessionsByEdition,
  rowEditionText,
  trainingDueDate,
} from './ojt-progress-view';

/**
 * F042 第五輪（2026-09-02 人類需求）之**純函式層**約束環：
 *   ① 儀表板分頁對主管／部門窗口隱藏（`canViewDashboard`）
 *   ② 應完成訓練日期＝**公告日期 + 1 個月**（`trainingDueDate`）
 *   ③ 場次明細之版次分組（`groupSessionsByEdition`）
 *
 * 🔴 **為什麼這三件事要有純函式層這一檔**（元件層測不到／測不準的部分）：
 *   · 加月之**月底溢位**（`1/31 + 1 月`）在元件層需要一份剛好落在月底的語料才碰得到，
 *     且失敗時只會顯示成一個看起來很像對的日期；純函式層可以直接逐日餵邊界。
 *   · 分組之**排序與空群組**在元件層只看得到渲染結果，看不出比較器是否具決定性。
 *   · 角色述詞是一個封閉的五值域，逐值釘死比在元件層跑五次 render 便宜且更完整。
 */

describe('canViewDashboard — 儀表板分頁之可見角色（2026-09-02 人類裁決）', () => {
  /**
   * 🔴 **五個角色逐一釘死**（非只驗兩個可見者）：只寫可見那一半時，一個「恆回 true」的
   * 實作會全綠；只寫不可見那一半時，「恆回 false」同樣全綠。
   */
  it.each([
    ['ICSOPAdmin', true],
    ['SysAdmin', true],
    ['Supervisor', false],
    ['DeptContact', false],
    ['User', false],
  ] as const)('%s → %s', (role, expected) => {
    expect(canViewDashboard(role)).toBe(expected);
  });

  it('未知角色／未登入 → false（fail-closed）', () => {
    expect(canViewDashboard('Nope')).toBe(false);
    expect(canViewDashboard(undefined)).toBe(false);
  });

  /**
   * 🔒 **與「可新增場次」之角色集合刻意不同**——本輪起兩者分岔（主管／部門窗口可登記場次，
   * 但看不到儀表板）。⚠ 若某次重構把兩支合流，本案立刻翻紅。
   */
  it('與 canAddSession 之角色集合不同：主管可登記場次、卻看不到儀表板', async () => {
    const { canAddSession } = await import('./ojt-progress-view');
    expect(canAddSession('Supervisor')).toBe(true);
    expect(canViewDashboard('Supervisor')).toBe(false);
  });
});

describe('trainingDueDate — 應完成訓練日期＝公告日期 + 1 個月', () => {
  it('一般情形：月份 +1、日期不變', () => {
    expect(trainingDueDate('2026-03-10T00:00:00.000Z')).toBe('2026-04-10');
  });

  it('跨年：12 月 → 次年 1 月', () => {
    expect(trainingDueDate('2026-12-05T00:00:00.000Z')).toBe('2027-01-05');
  });

  /**
   * 🔴 **本輪最容易寫錯的一條**：天真作法 `d.setMonth(d.getMonth() + 1)` 在來源日超過目標月
   * 天數時會**自動跨到下個月**（1/31 → 3/3），比使用者預期晚三天，且一年只有少數幾天看得出來。
   * 正確行為＝夾回目標月之最後一日。
   */
  it.each([
    ['2026-01-31T00:00:00.000Z', '2026-02-28'], // 平年 2 月
    ['2028-01-31T00:00:00.000Z', '2028-02-29'], // 閏年 2 月
    ['2026-01-30T00:00:00.000Z', '2026-02-28'],
    ['2026-03-31T00:00:00.000Z', '2026-04-30'], // 31 日 → 30 日之月份
  ])('月底溢位夾回當月最後一日：%s → %s', (announced, due) => {
    expect(trainingDueDate(announced)).toBe(due);
  });

  it('月底但目標月天數足夠時不夾（2/28 → 3/28，非 3/31）', () => {
    expect(trainingDueDate('2026-02-28T00:00:00.000Z')).toBe('2026-03-28');
  });

  /**
   * 🔴 **以 UTC 拆解**：UTC+8 之開發機若改用本地時區方法，`00:00Z` 會被讀成當地 08:00（同日）
   * 而 `16:00Z` 會被讀成隔日 ⇒ 期限差一天。本案以一個「本地時區會跨日」之時刻釘住。
   */
  it('時刻不影響日期（以 UTC 拆解，非本地時區）', () => {
    expect(trainingDueDate('2026-05-15T16:30:00.000Z')).toBe('2026-06-15');
  });

  it('無公告日期／空字串／不可解析 → null', () => {
    expect(trainingDueDate(null)).toBeNull();
    expect(trainingDueDate(undefined)).toBeNull();
    expect(trainingDueDate('')).toBeNull();
    expect(trainingDueDate('not-a-date')).toBeNull();
  });

  it('dueDateText：有值即日期字串；無值為「—」', () => {
    expect(dueDateText('2026-03-10T00:00:00.000Z')).toBe('2026-04-10');
    expect(dueDateText(null)).toBe(DUE_DATE_UNKNOWN_TEXT);
    expect(DUE_DATE_UNKNOWN_TEXT).toBe('—');
  });
});

describe('editionText／rowEditionText — 版次之顯示', () => {
  it('有版次即原值；null → 「未設版次」（不留白、不假造版次字串）', () => {
    expect(editionText("26'01")).toBe("26'01");
    expect(editionText(null)).toBe(EDITION_NONE_TEXT);
    expect(EDITION_NONE_TEXT).toBe('未設版次');
  });

  it('列標籤逐字為「版次 {值}」', () => {
    expect(rowEditionText("26'01")).toBe("版次 26'01");
    expect(rowEditionText(null)).toBe('版次 未設版次');
  });
});

describe('groupSessionsByEdition — 場次明細依版次分組', () => {
  const s = (trainingDate: string, edition: string | null) => ({ trainingDate, edition });

  it('當下訓練基準版次恆為第一組，且標記 current', () => {
    const groups = groupSessionsByEdition(
      [s('2026-01-05', "25'01"), s('2026-06-01', "26'01")],
      "26'01",
    );
    expect(groups[0]!.edition).toBe("26'01");
    expect(groups[0]!.current).toBe(true);
    expect(groups.slice(1).every((g) => !g.current)).toBe(true);
  });

  /**
   * 🔴 **當下版次之群組恆存在，即使一場都沒有**：改版並要求重訓後，畫面必須看得到
   * 「目前版次：0 場」；若「沒有場次就不長群組」，使用者只會看到一串舊版次的場次，
   * 讀不出「現在這一版還沒人受訓」。
   */
  it('當下版次一場都沒有時仍長出空群組（不得省略）', () => {
    const groups = groupSessionsByEdition([s('2026-01-05', "25'01")], "26'01");
    expect(groups[0]!.edition).toBe("26'01");
    expect(groups[0]!.current).toBe(true);
    expect(groups[0]!.sessions).toEqual([]);
    expect(groups).toHaveLength(2);
  });

  it('舊版次群組依「該組最新訓練日期」遞減排序（非版次字串排序）', () => {
    const groups = groupSessionsByEdition(
      [
        s('2025-02-01', "24'09"), // 版次字串最大、但日期最舊
        s('2026-05-01', "25'01"),
        s('2026-07-01', "26'01"),
      ],
      "26'01",
    );
    expect(groups.map((g) => g.edition)).toEqual(["26'01", "25'01", "24'09"]);
  });

  it('組內場次依訓練日期遞增', () => {
    const groups = groupSessionsByEdition(
      [s('2026-07-01', "26'01"), s('2026-03-01', "26'01")],
      "26'01",
    );
    expect(groups[0]!.sessions.map((x) => x.trainingDate)).toEqual(['2026-03-01', '2026-07-01']);
  });

  /**
   * 🔴 **`null` 版次是一個真正的群組鍵，不是「無群組」**：591 份文件中 584 份未設版次 ⇒
   * 正常情形下每一列的唯一群組鍵就是它。DOM 屬性值不得為 `null`，故以哨兵鍵表示。
   */
  it('null 版次：群組鍵為哨兵值、edition 仍為 null、且為 current', () => {
    const groups = groupSessionsByEdition([s('2026-06-01', null)], null);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe(EDITION_NONE_KEY);
    expect(groups[0]!.edition).toBeNull();
    expect(groups[0]!.current).toBe(true);
    expect(groups[0]!.sessions).toHaveLength(1);
  });

  it('缺 edition 欄之舊回應一律視為 null 版次（與基準之 null 同組）', () => {
    const groups = groupSessionsByEdition([{ trainingDate: '2026-06-01' }], null);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sessions).toHaveLength(1);
  });

  it('一場場次不會同時落入兩組（分組為分割，非標記）', () => {
    const sessions = [s('2026-01-05', "25'01"), s('2026-06-01', "26'01"), s('2026-06-02', null)];
    const groups = groupSessionsByEdition(sessions, "26'01");
    expect(groups.reduce((n, g) => n + g.sessions.length, 0)).toBe(sessions.length);
  });

  it('輸入順序不影響輸出（排序具決定性）', () => {
    const a = [s('2026-01-05', "25'01"), s('2026-06-01', "26'01"), s('2026-03-03', "25'01")];
    const shuffled = [a[2]!, a[0]!, a[1]!];
    const key = (gs: ReturnType<typeof groupSessionsByEdition>) =>
      gs.map((g) => `${g.key}:${g.sessions.map((x) => x.trainingDate).join(',')}`);
    expect(key(groupSessionsByEdition(shuffled, "26'01"))).toEqual(
      key(groupSessionsByEdition(a, "26'01")),
    );
  });
});
