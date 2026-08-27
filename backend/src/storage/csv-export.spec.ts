import {
  CsvColumn,
  EXPORT_ROW_LIMIT,
  LINKED_DOC_NUMBER_SEPARATOR,
  assertExportRowLimit,
  exportFileName,
  joinLinkedDocumentNumbers,
  toCsvBuffer,
} from './csv-export';

/**
 * 匯出（CSV）共用產生器之約束環 —— Lane L5（#14／#16）。
 *
 * 權威：
 *  - `docs/specs/error-handling.md#export`（三處匯出共用之唯一規則來源）
 *  - F039 `AC-D6`／`AC-D8`／`AC-D9`／`AC-D11`（附錄池匯出）
 *  - F037 `AC-D2`／`AC-D3`／`AC-D4`／`AC-D7`／`AC-D9`（程序書變更歷程匯出）
 *  - F038 `AC-D2`／`AC-D4`／`AC-D5`（循環樹狀圖變更歷程匯出）
 *  - architecture-spec §10.4（落點＝`backend/src/storage/csv-export.ts`，純函式模組、零 Nest DI）
 *
 * ⚠ 對實作全盲：`./csv-export` 於本環撰寫時**尚不存在** —— import 失敗即為預期之編譯紅燈。
 *
 * 🔴 本檔刻意涵蓋 architecture-spec §10.15 之兩項盲區：
 *   #4 CSV BOM  → 斷言**位元組**前三 byte 為 EF BB BF（非字串比對，字串比對在編碼被改成 latin1 時仍會綠）
 *   #5 檔名時區 → 以**固定 `Date` 注入**並斷言逐字檔名，另在**兩個不同 `process.env.TZ`** 下重跑同一
 *                斷言。不做這一步時，開發機（UTC+8）與容器（TZ=UTC）會得到不同結果而**兩邊都綠**
 *                （與本 repo 2026-08-15 之 MSSQL 時區 bug 同型）。
 */

interface Row {
  a: string | null;
  b?: string;
}

const col = (header: string, value: (r: Row) => string | number | null | undefined): CsvColumn<Row> => ({
  header,
  value,
});

const COLS: CsvColumn<Row>[] = [col('欄一', (r) => r.a), col('欄二', (r) => r.b)];

/** 以位元組解出 CSV 之邏輯列（跳過 BOM；行終止符 CRLF／LF 皆接受，不過度約束）。 */
function linesOf(buf: Buffer): string[] {
  const body = buf.subarray(3).toString('utf8');
  return body.replace(/\r?\n$/, '').split(/\r?\n/);
}

describe('csv-export 共用產生器（error-handling.md#export；F037/F038/F039 匯出）', () => {
  describe('編碼與 BOM（F039 AC-D6 ①／F037 AC-D2 ①／F038 AC-D2 ①）', () => {
    it('位元組以 UTF-8 BOM（EF BB BF）開頭', () => {
      const buf = toCsvBuffer([{ a: '作業對照表' }], COLS);
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
    });

    it('BOM 之後為 UTF-8 編碼之中文（非 latin1；逐位元組還原）', () => {
      const buf = toCsvBuffer([{ a: '附錄名稱' }], COLS);
      expect(buf.subarray(3).toString('utf8')).toContain('附錄名稱');
      // '附' 之 UTF-8 為 E9 99 84；若被以 latin1 寫出，此序列不會出現。
      expect(buf.includes(Buffer.from([0xe9, 0x99, 0x84]))).toBe(true);
    });
  });

  describe('表頭與空結果（F039 AC-D6 ②／AC-D9；F037 AC-D2 ②／AC-D7）', () => {
    it('第 1 列為逐字表頭，欄序與 cols 一致', () => {
      const buf = toCsvBuffer([], COLS);
      expect(linesOf(buf)[0]).toBe('欄一,欄二');
    });

    it('0 筆 → 僅含表頭列之 CSV（非錯誤、非空檔）', () => {
      const buf = toCsvBuffer([], COLS);
      expect(buf.length).toBeGreaterThan(3); // 不是只有 BOM
      expect(linesOf(buf)).toHaveLength(1);
    });

    it('🔒 表頭列不套用注入前綴（error-handling#export「表頭列不適用」）', () => {
      const buf = toCsvBuffer([], [col('=HDR', (r) => r.a), col('-Header2', (r) => r.b)]);
      expect(linesOf(buf)[0]).toBe('=HDR,-Header2');
      expect(linesOf(buf)[0]).not.toContain("'=");
      expect(linesOf(buf)[0]).not.toContain("'-");
    });

    it('資料列數等於輸入列數（＋1 列表頭）', () => {
      const buf = toCsvBuffer([{ a: '1' }, { a: '2' }, { a: '3' }], COLS);
      expect(linesOf(buf)).toHaveLength(4);
    });
  });

  describe('RFC 4180 逸出（F039 AC-D6 ③／F037 AC-D2 ③／F038 AC-D2 ③）', () => {
    it('含逗號 → 雙引號包覆', () => {
      expect(linesOf(toCsvBuffer([{ a: '甲,乙' }], COLS))[1]).toBe('"甲,乙",');
    });

    it('含雙引號 → 包覆且內部 " 逸出為 ""', () => {
      expect(linesOf(toCsvBuffer([{ a: '他說"好"' }], COLS))[1]).toBe('"他說""好""",');
    });

    it('含換行 → 雙引號包覆（儲存格內換行保留）', () => {
      const buf = toCsvBuffer([{ a: '第一行\n第二行' }], COLS);
      const body = buf.subarray(3).toString('utf8');
      expect(body).toContain('"第一行\n第二行"');
    });

    it('不含特殊字元 → 不加引號（恆等）', () => {
      expect(linesOf(toCsvBuffer([{ a: '作業對照表', b: '2' }], COLS))[1]).toBe('作業對照表,2');
    });

    it('null／undefined → 空儲存格（不得輸出字面 null／undefined）', () => {
      const line = linesOf(toCsvBuffer([{ a: null }], COLS))[1];
      expect(line).toBe(',');
      expect(line).not.toContain('null');
      expect(line).not.toContain('undefined');
    });
  });

  describe('🔴 CSV 注入防護（F039 AC-D11／F037 AC-D9／F038 AC-D5）', () => {
    it('以 = 開頭 → 前置一個半形單引號', () => {
      expect(linesOf(toCsvBuffer([{ a: "=cmd|'/c calc'!A1" }], COLS))[1]).toBe(
        "'=cmd|'/c calc'!A1,",
      );
    });

    it.each([
      ['+', '+1234'],
      ['-', '-1'],
      ['@', '@SUM(A1)'],
    ])('以 %s 開頭 → 前置單引號', (_label, value) => {
      expect(linesOf(toCsvBuffer([{ a: value }], COLS))[1]).toBe(`'${value},`);
    });

    it('以 Tab（\\t）開頭 → 前置單引號', () => {
      const body = toCsvBuffer([{ a: '\tx' }], COLS).subarray(3).toString('utf8');
      expect(body.split(/\r?\n/)[1]).toBe("'\tx,");
    });

    it('以 CR（\\r）開頭 → 前置單引號（且該值因含 CR 而被引號包覆）', () => {
      const body = toCsvBuffer([{ a: '\rx' }], COLS).subarray(3).toString('utf8');
      expect(body).toContain('"\'\rx"');
    });

    it('不以六種字元開頭 → 不加任何前綴（轉換為恆等）', () => {
      expect(linesOf(toCsvBuffer([{ a: '作業對照表' }], COLS))[1]).toBe('作業對照表,');
      expect(linesOf(toCsvBuffer([{ a: 'FM-001' }], COLS))[1]).toBe('FM-001,');
    });

    it('🔴 順序：先加前綴、再 RFC 4180 包覆逸出（順序顛倒會產出不同字串）', () => {
      // 值 `="a,b"` → 加前綴得 `'="a,b"` → 含 , 與 " → 包覆並逸出內部 " → `"'=""a,b"""`
      expect(linesOf(toCsvBuffer([{ a: '="a,b"' }], COLS))[1]).toBe('"\'=""a,b""",');
    });
  });

  describe('匯出筆數上限（F039 AC-D8／F037 AC-D3／F038 AC-D4 ③）', () => {
    it('上限常數為 10000', () => {
      expect(EXPORT_ROW_LIMIT).toBe(10_000);
    });

    it('恰 10000 筆 → 通過（邊界值含）', () => {
      expect(() => assertExportRowLimit(10_000)).not.toThrow();
    });

    it('10001 筆 → 拋 EXPORT_ROW_LIMIT_EXCEEDED（400），訊息含上限值', () => {
      let caught: unknown;
      try {
        assertExportRowLimit(10_001);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      const err = caught as { message: string; getStatus?: () => number };
      expect(err.message).toContain('EXPORT_ROW_LIMIT_EXCEEDED');
      expect(typeof err.getStatus).toBe('function');
      expect(err.getStatus?.()).toBe(400);
    });

    it('0 筆亦通過（空結果為合法匯出）', () => {
      expect(() => assertExportRowLimit(0)).not.toThrow();
    });
  });

  /**
   * 🔴 A16-3（F024 AC-F9 ②，architecture-spec §10.18）：`assertExportRowLimit` 訊息須內插
   * 實際筆數，且該數字必須排在 `EXPORT_ROW_LIMIT` 常數（10000）**之前**——`countFromLimitError()`
   * 取的是訊息中**第一個**符合 `/\d+/` 的數字，順序顛倒則 `{N}` 仍恆為上限值，本題等於白修。
   *
   * ⚠ 對實作全盲：現況 `assertExportRowLimit` 之訊息**未內插** `count`（僅含上限值 10000），
   * 下列斷言於本環撰寫時即為紅燈，屬預期紅燈。
   *
   * 📝 回歸複核（非本環新增之保證，已由 architecture-spec §10.18 A16-3 獨立查證，此處僅重申）：
   * 上方既有測試（「10001 筆 → 拋 EXPORT_ROW_LIMIT_EXCEEDED（400），訊息含上限值」）僅以
   * `.toContain('EXPORT_ROW_LIMIT_EXCEEDED')` 斷言，並未鎖定「訊息只含上限值」，故本節之修改
   * 不會使該既有測試變紅——它會在本節生效後繼續保持綠燈（合法之既有回歸鎖定）。
   */
  describe('🔴 A16-3（F024 AC-F9 ②）：訊息內插實際筆數，且排在上限值之前', () => {
    function messageOf(count: number): string {
      let caught: unknown;
      try {
        assertExportRowLimit(count);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      return (caught as { message: string }).message;
    }

    it('10001 筆 → 訊息含實際筆數 10001', () => {
      expect(messageOf(10_001)).toContain('10001');
    });

    it('🔴 順序：實際筆數必須出現於上限值（10000）之前（countFromLimitError 取第一個數字）', () => {
      const msg = messageOf(10_001);
      const idxActual = msg.indexOf('10001');
      const idxLimit = msg.indexOf('10000');
      expect(idxActual).toBeGreaterThanOrEqual(0);
      expect(idxLimit).toBeGreaterThan(idxActual);
    });

    it('大量超限（128430 筆）→ 訊息中第一個數字為實際筆數 128430，非恆為上限值 10000', () => {
      const msg = messageOf(128_430);
      const firstNumber = msg.match(/\d+/)?.[0];
      expect(firstNumber).toBe('128430');
    });

    it('恰上限＋1（10001）與大量超限（128430）之訊息中「第一個數字」不得恆為同一值（鑑別力自查）', () => {
      const first10001 = messageOf(10_001).match(/\d+/)?.[0];
      const first128430 = messageOf(128_430).match(/\d+/)?.[0];
      expect(first10001).not.toBe(first128430);
    });
  });

  describe('🔴 檔名與時區（F039 AC-D7／F037 AC-D4／F038 AC-D4 ①；§10.15 盲區 #5「會雙綠」）', () => {
    /** 2026-08-16T16:32:08Z → UTC+8 為 2026-08-17 00:32:08（**跨日**，故可鑑別 UTC vs UTC+8）。 */
    const FIXED = new Date('2026-08-16T16:32:08.000Z');

    it('形狀為 {scope}_{YYYYMMDD}_{HHmmss}.csv，時間以 UTC+8 計（跨日邊界）', () => {
      expect(exportFileName('appendices', FIXED)).toBe('appendices_20260817_003208.csv');
    });

    it('三處 scope 各自之逐字檔名', () => {
      const t = new Date('2026-08-16T06:32:08.000Z'); // → 2026-08-16 14:32:08 (UTC+8)
      expect(exportFileName('appendices', t)).toBe('appendices_20260816_143208.csv');
      expect(exportFileName('document_change_history', t)).toBe(
        'document_change_history_20260816_143208.csv',
      );
      expect(exportFileName('lifecycle_change_history', t)).toBe(
        'lifecycle_change_history_20260816_143208.csv',
      );
    });

    it('月／日／時／分／秒皆補零（單位數不得輸出單字元）', () => {
      // 2026-01-04T17:05:09Z → UTC+8 2026-01-05 01:05:09
      expect(exportFileName('appendices', new Date('2026-01-04T17:05:09.000Z'))).toBe(
        'appendices_20260105_010509.csv',
      );
    });

    it('🔴 行程時區不影響結果：TZ=UTC 與 TZ=America/New_York 下得到同一檔名', () => {
      const original = process.env.TZ;
      try {
        process.env.TZ = 'UTC';
        const asUtc = exportFileName('appendices', FIXED);
        process.env.TZ = 'America/New_York'; // UTC-4/-5，與 UTC+8 相差 12–13 小時
        const asNy = exportFileName('appendices', FIXED);
        expect(asUtc).toBe('appendices_20260817_003208.csv');
        expect(asNy).toBe(asUtc);
      } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
      }
    });
  });
});

/**
 * 🔵 `AC-X2`（2026-08-27）：`關聯文件編號` 欄之共用組字——F018 表單池與 F039 附錄池
 * 兩處匯出共用同一函式（各寫一份必然於分隔符或空值呈現上漂移）。
 */
describe('joinLinkedDocumentNumbers（關聯文件編號欄）', () => {
  it('分隔符逐字為半形分號 `;`', () => {
    expect(LINKED_DOC_NUMBER_SEPARATOR).toBe(';');
  });

  it('多筆 → 以 `;` 相接，且**順序即傳入順序**（＝管理頁展開列所見之順序）', () => {
    expect(
      joinLinkedDocumentNumbers([
        { documentNumber: 'ICSOP-SRC-101-1-01' },
        { documentNumber: 'ICSOP-SRC-102-2-03' },
      ]),
    ).toBe('ICSOP-SRC-101-1-01;ICSOP-SRC-102-2-03');
  });

  it('單筆 → 不附任何分隔符', () => {
    expect(joinLinkedDocumentNumbers([{ documentNumber: 'ICSOP-SRC-101-1-01' }])).toBe(
      'ICSOP-SRC-101-1-01',
    );
  });

  it.each([[[]], [undefined]])('0 筆／undefined → 空字串（**非** `—`、非 `0`）', (docs) => {
    expect(joinLinkedDocumentNumbers(docs as undefined)).toBe('');
  });

  it('🔒 分號不觸發 RFC 4180 包覆：整格於 CSV 中維持裸字串（無雙引號）', () => {
    const cols: CsvColumn<{ n: string }>[] = [{ header: '關聯文件編號', value: (r) => r.n }];
    const joined = joinLinkedDocumentNumbers([
      { documentNumber: 'A-1' },
      { documentNumber: 'B-2' },
    ]);
    expect(linesOf(toCsvBuffer([{ n: joined }], cols))[1]).toBe('A-1;B-2');
  });
});
