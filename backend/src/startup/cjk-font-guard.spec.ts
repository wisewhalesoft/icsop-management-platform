import {
  REQUIRE_CJK_FONT_ENV,
  assertCjkFontAvailable,
  isCjkFontRequired,
} from './cjk-font-guard';

/**
 * L0 · 缺失 delta 第 6 項（CJK 字型部署）— **啟動時 fail-fast 之邏輯單元測試**。
 *
 * 權威＝`docs/specs/architecture-spec.md` §10.10（決策 A10）修法二：
 *   「於 `main.ts` bootstrap、`app.listen()` **之前**呼叫 `loadCjkFontBytes()`；回 `null`
 *    即 `throw` 並以非 0 退出，log 逐字列出兩個候選路徑。」
 *   「以環境變數 `ICSOP_REQUIRE_CJK_FONT`（**預設 `true`**）控制…🔴 **不可預設 `false`**
 *    ——預設值就是那個會被忘記設定的值。」
 *
 * 🔴 為何本檔測的是一個**純函式 seam** 而不是 `main.ts`：
 *   `main.ts` 之 bootstrap 會建立整個 Nest app，無法在 unit 層執行。故 fail-fast 之
 *   **判定邏輯**必須抽為零 I/O 之純函式（`backend/src/startup/cjk-font-guard.ts`），
 *   由 `main.ts` 於 `app.listen()` 前呼叫。
 *   ⚠ 「`main.ts` 有沒有真的呼叫它」**本層測不到**——列入交付物 ③ 之 (乙) 類，
 *      以容器啟動實跑把關（缺字型時容器必須起不來）。
 *
 * ⚠ 本檔**刻意不測** `loadCjkFontBytes()` 本身（§10.10 明示：那是本案的盲區本身）。
 *   字型位元組一律以參數注入。
 */
/**
 * ⏱ 併行競爭下之餘裕（file-scoped，**不動全域 jest 設定**）。
 * 實測基線（2026-08-16 全量 145 suites 之 `jest --json` 量測）：本檔 suite wall **0.5s**、
 * 單一測試最大 **15ms**。本檔全為零 I/O 之純函式（字型位元組一律以參數注入，從不讀檔），
 * 慢不是本質的。此行純為滿載時之保險，未放寬任何斷言。
 */
jest.setTimeout(20_000);

const CANDIDATES = [
  '/app/assets/fonts/NotoSansTC-Regular.ttf',
  '/app/dist/public/fonts/../../../assets/fonts/NotoSansTC-Regular.ttf',
] as const;

const FONT = new Uint8Array([0x00, 0x01, 0x00, 0x00]);

describe('cjk-font-guard — 啟動 fail-fast（#6 · §10.10 修法二）', () => {
  describe(`${REQUIRE_CJK_FONT_ENV} 之解讀`, () => {
    it('TS-D6-010 環境變數名稱逐字為 ICSOP_REQUIRE_CJK_FONT', () => {
      expect(REQUIRE_CJK_FONT_ENV).toBe('ICSOP_REQUIRE_CJK_FONT');
    });

    it('TS-D6-011 未設定 → 視為 required（預設 true，不可預設 false）', () => {
      expect(isCjkFontRequired({})).toBe(true);
    });

    it('TS-D6-012 設為 "true" → required', () => {
      expect(isCjkFontRequired({ [REQUIRE_CJK_FONT_ENV]: 'true' })).toBe(true);
    });

    it('TS-D6-013 設為 "false" → 不 required（供不需燒錄之環境關閉）', () => {
      expect(isCjkFontRequired({ [REQUIRE_CJK_FONT_ENV]: 'false' })).toBe(false);
    });

    it('TS-D6-014 設為空字串 → 仍 required（fail-safe：只有明確 "false" 才關閉）', () => {
      expect(isCjkFontRequired({ [REQUIRE_CJK_FONT_ENV]: '' })).toBe(true);
    });
  });

  describe('assertCjkFontAvailable', () => {
    it('TS-D6-015 字型存在 → 不拋（required 亦然）', () => {
      expect(() => assertCjkFontAvailable(FONT, CANDIDATES, {})).not.toThrow();
    });

    it('TS-D6-016 🔴 字型缺失且 required → 拋錯（靜默降級正是本 bug 穿過全部測試的唯一原因）', () => {
      expect(() => assertCjkFontAvailable(null, CANDIDATES, {})).toThrow();
    });

    it('TS-D6-017 拋出之訊息**逐字列出兩個候選路徑**（§10.10：log 逐字列出）', () => {
      let message = '';
      try {
        assertCjkFontAvailable(null, CANDIDATES, { [REQUIRE_CJK_FONT_ENV]: 'true' });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toBe('');
      for (const p of CANDIDATES) expect(message).toContain(p);
    });

    it('TS-D6-018 字型缺失但明確關閉（"false"）→ 不拋（可關閉性）', () => {
      expect(() =>
        assertCjkFontAvailable(null, CANDIDATES, { [REQUIRE_CJK_FONT_ENV]: 'false' }),
      ).not.toThrow();
    });
  });
});
