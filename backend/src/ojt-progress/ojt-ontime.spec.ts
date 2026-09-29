import { OjtOnTimeRow, ojtOnTimeRate } from './ojt-ontime';

/**
 * F044 卡④「OJT 準時完成率(訓練日已截止)」之**純函式層**（2026-09-29 口徑改版：不分版次統計）。
 *
 * 口徑（見 `ojt-ontime.ts` 檔頭）：
 *   · 計數單位＝文件 × 使用單位 × 要求訓練之版次；分子＝該單位在那一版辦過場次者。
 *   · 母體＝未裁撤、有公告日、應完成日（公告日 + 1 個月，月底夾擠）**早於**今日。
 *   · 排除計數：裁撤＝相異單位數、無公告日＝相異文件數、孤兒＝服務層傳入。
 */

function row(over: Partial<OjtOnTimeRow> & Pick<OjtOnTimeRow, 'orgCode' | 'documentId'>): OjtOnTimeRow {
  return {
    companyCode: 'AS',
    announcedDate: '2026-01-15',
    isActive: true,
    requiredEditions: [null],
    trainedEditions: [],
    ...over,
  };
}

/** 🔒 凍結之「今日」。公告日 `2026-01-27` 之應完成日＝`2026-02-27`（已截止）；`2026-01-28` ⇒ `2026-02-28`（＝今日，未截止）。 */
const TODAY = '2026-02-28';

describe('ojtOnTimeRate — 計數單位＝文件 × 單位 × 版次', () => {
  it('無版次概念之文件：每個「文件 × 單位」恰一筆，辦過場次即完成', () => {
    const s = ojtOnTimeRate(
      [
        row({ orgCode: 'A1000', documentId: 'D1', trainedEditions: [null] }),
        row({ orgCode: 'B1000', documentId: 'D1' }),
      ],
      TODAY,
    );
    expect(s.denominator).toBe(2);
    expect(s.numerator).toBe(1);
    expect(s.rate).toBe(50);
  });

  /**
   * 🔴 本次改版之核心：改版並要求重訓過一次 ⇒ 每個單位對該文件有**兩筆**應完成。
   * 只辦過舊版者算 1/2、只辦過新版者也算 1/2——兩版都辦過才是 2/2。
   * ⚠ 依單位聚合或只看當下版次的實作在本語料下分母皆為 3（非 6）。
   */
  it('兩個要求版次 ⇒ 每單位兩筆；逐版次判定完成', () => {
    const editions = ["25'01", "26'01"];
    const s = ojtOnTimeRate(
      [
        row({ orgCode: 'A1000', documentId: 'D1', requiredEditions: editions, trainedEditions: ["25'01"] }),
        row({ orgCode: 'B1000', documentId: 'D1', requiredEditions: editions, trainedEditions: ["26'01"] }),
        row({
          orgCode: 'C1000',
          documentId: 'D1',
          requiredEditions: editions,
          trainedEditions: ["25'01", "26'01", "26'01"],
        }),
      ],
      TODAY,
    );
    expect(s.denominator).toBe(6);
    expect(s.numerator).toBe(4);
    expect(s.rate).toBe(67);
  });

  it('同一版次重複出現於要求清單（紀錄表 ∪ 當下基準）只算一筆', () => {
    const s = ojtOnTimeRate(
      [row({ orgCode: 'A1000', documentId: 'D1', requiredEditions: ["26'01", "26'01", null, null] })],
      TODAY,
    );
    expect(s.denominator).toBe(2);
  });

  it('null 版次與字串版次互不相符；null 對 null 相符', () => {
    const s = ojtOnTimeRate(
      [
        row({ orgCode: 'A1000', documentId: 'D1', requiredEditions: [null], trainedEditions: ["26'01"] }),
        row({ orgCode: 'B1000', documentId: 'D2', requiredEditions: ["26'01"], trainedEditions: [null] }),
        row({ orgCode: 'C1000', documentId: 'D3', requiredEditions: [null], trainedEditions: [null] }),
      ],
      TODAY,
    );
    expect(s.denominator).toBe(3);
    expect(s.numerator).toBe(1);
  });

  it('場次在要求清單以外之版次不算數、也不增加分母', () => {
    const s = ojtOnTimeRate(
      [row({ orgCode: 'A1000', documentId: 'D1', requiredEditions: ["26'01"], trainedEditions: ["24'09"] })],
      TODAY,
    );
    expect(s.denominator).toBe(1);
    expect(s.numerator).toBe(0);
  });

  it('跨公司同碼單位各自計數（不依單位聚合，亦不因同碼而合併）', () => {
    const s = ojtOnTimeRate(
      [
        row({ companyCode: 'AS', orgCode: 'B1000', documentId: 'D1', trainedEditions: [null] }),
        row({ companyCode: 'AD', orgCode: 'B1000', documentId: 'D1' }),
      ],
      TODAY,
    );
    expect(s.denominator).toBe(2);
    expect(s.numerator).toBe(1);
  });

  it('rate＝Math.round(分子 / 分母 × 100)：3/7 → 43', () => {
    const rows: OjtOnTimeRow[] = [];
    for (let i = 0; i < 7; i += 1) {
      rows.push(row({ orgCode: `X${i}000`, documentId: `D${i}`, trainedEditions: i < 3 ? [null] : [] }));
    }
    expect(ojtOnTimeRate(rows, TODAY).rate).toBe(43);
  });
});

describe('ojtOnTimeRate — 母體＝訓練日已截止（應完成日 < 今日）', () => {
  it('應完成日為昨日 ⇒ 計入；應完成日為今日 ⇒ 不計入', () => {
    expect(ojtOnTimeRate([row({ orgCode: 'A', documentId: 'D', announcedDate: '2026-01-27' })], TODAY).denominator).toBe(1);
    expect(ojtOnTimeRate([row({ orgCode: 'A', documentId: 'D', announcedDate: '2026-01-28' })], TODAY).denominator).toBe(0);
  });

  it('不設下界：一年前截止者仍計入', () => {
    expect(ojtOnTimeRate([row({ orgCode: 'A', documentId: 'D', announcedDate: '2024-12-01' })], TODAY).denominator).toBe(1);
  });

  it('公告日在未來者不計入', () => {
    expect(ojtOnTimeRate([row({ orgCode: 'A', documentId: 'D', announcedDate: '2026-03-10' })], TODAY).denominator).toBe(0);
  });

  /**
   * 月底夾擠：`2026-01-29／30／31` + 1 月皆＝`2026-02-28`。今日 `2026-03-01` ⇒ 三份皆已截止；
   * 今日 `2026-02-28` ⇒ 三份皆未截止。天真 `setMonth(+1)` 會得 `03-01`／`03-02`／`03-03`，前一情境全數落空。
   */
  it('月底夾擠：1/29、1/30、1/31 之應完成日皆為 2/28', () => {
    const rows = ['2026-01-29', '2026-01-30', '2026-01-31'].map((d, i) =>
      row({ orgCode: `M${i}000`, documentId: `D${i}`, announcedDate: d }),
    );
    expect(ojtOnTimeRate(rows, '2026-03-01').denominator).toBe(3);
    expect(ojtOnTimeRate(rows, '2026-02-28').denominator).toBe(0);
  });

  it('容許完整 ISO 字串之公告日', () => {
    const s = ojtOnTimeRate([row({ orgCode: 'A', documentId: 'D', announcedDate: '2026-01-01T00:00:00.000Z' })], TODAY);
    expect(s.denominator).toBe(1);
  });

  it('未截止之列既不計入母體、也不進任何排除計數', () => {
    const s = ojtOnTimeRate([row({ orgCode: 'A', documentId: 'D', announcedDate: '2026-02-20' })], TODAY);
    expect(s).toEqual({
      numerator: 0,
      denominator: 0,
      excludedInactive: 0,
      excludedOrphaned: 0,
      excludedNoAnnouncedDate: 0,
    });
  });
});

describe('ojtOnTimeRate — 排除與其計數單位', () => {
  it('裁撤單位不進母體；計數為相異單位數（同一單位多份文件只算一個）', () => {
    const s = ojtOnTimeRate(
      [
        row({ orgCode: 'E1000', documentId: 'D1', isActive: false }),
        row({ orgCode: 'E1000', documentId: 'D2', isActive: false }),
        row({ companyCode: 'AD', orgCode: 'E1000', documentId: 'D1', isActive: false }),
        row({ orgCode: 'A1000', documentId: 'D1' }),
      ],
      TODAY,
    );
    expect(s.denominator).toBe(1);
    expect(s.excludedInactive).toBe(2); // AS|E1000、AD|E1000
  });

  it('無公告日之文件不進母體；計數為相異文件數（一份文件多個單位只算一份）', () => {
    const s = ojtOnTimeRate(
      [
        row({ orgCode: 'A1000', documentId: 'D8', announcedDate: null }),
        row({ orgCode: 'B1000', documentId: 'D8', announcedDate: null }),
      ],
      TODAY,
    );
    expect(s.denominator).toBe(0);
    expect(s.excludedNoAnnouncedDate).toBe(1);
  });

  it('孤兒計數由第三個參數帶入；未傳時為 0', () => {
    expect(ojtOnTimeRate([], TODAY, 3).excludedOrphaned).toBe(3);
    expect(ojtOnTimeRate([], TODAY).excludedOrphaned).toBe(0);
  });
});

describe('🔒 AC-G14 — 分母為 0 時**省略** rate 鍵（不是回 0）', () => {
  it('denominator === 0 ⇒ 不存在 rate 鍵', () => {
    const s = ojtOnTimeRate([], TODAY);
    expect('rate' in s).toBe(false);
  });

  it('denominator > 0 ⇒ rate 鍵存在（證明上一條不是「永遠沒有 rate」）', () => {
    const s = ojtOnTimeRate([row({ orgCode: 'A', documentId: 'D' })], TODAY);
    expect(s.rate).toBe(0);
  });
});
