/**
 * 啟動時之 CJK 字型 fail-fast 判定（architecture-spec §10.10 決策 A10 修法二）。
 *
 * 為何存在：`backend/assets/` 未進 image 時，`loadCjkFontBytes()` 回 `null`，燒錄靜默退化為
 * `StandardFonts.Helvetica` + asciiSafe，浮水印之中文全部變成 `?`。浮水印是合規性控制項
 * （NFR-007），「中文全是 `?`」不是降級而是**控制項失效**；靜默降級正是該缺失能穿過全部
 * 單元/整合測試與一次瀏覽器煙霧測試的唯一原因。故於 `app.listen()` 之前攔截。
 *
 * 本模組刻意為**零 I/O 之純函式**：字型位元組由呼叫端（`main.ts`）注入，使判定邏輯可於
 * unit 層驗證。字型檔是否真的存在於容器內，只能靠容器啟動實跑把關。
 */

/** 控制是否強制要求 CJK 字型之環境變數名稱。 */
export const REQUIRE_CJK_FONT_ENV = 'ICSOP_REQUIRE_CJK_FONT';

/**
 * 是否要求 CJK 字型必須存在。
 *
 * 🔴 預設為 `true`——預設值就是那個會被忘記設定的值。只有**明確**設為 `'false'` 才關閉
 * （供不需燒錄之環境，例如純前端 e2e 的 API stub）；空字串等同未設定，仍為 required。
 */
export function isCjkFontRequired(env: Record<string, string | undefined>): boolean {
  return env[REQUIRE_CJK_FONT_ENV] !== 'false';
}

/**
 * 字型缺失且為 required 時拋錯，訊息逐字列出全部候選路徑（供容器內排錯）。
 *
 * @param fontBytes `loadCjkFontBytes()` 之結果；`null` 代表兩個候選路徑皆不存在
 * @param candidatePaths 逐字列入錯誤訊息之候選路徑
 */
export function assertCjkFontAvailable(
  fontBytes: Uint8Array | null,
  candidatePaths: readonly string[],
  env: Record<string, string | undefined>,
): void {
  if (fontBytes && fontBytes.length > 0) return;
  if (!isCjkFontRequired(env)) return;
  throw new Error(
    [
      'CJK 浮水印字型載入失敗：以下候選路徑皆不存在或無法讀取。',
      ...candidatePaths.map((p) => `  - ${p}`),
      `缺少字型時浮水印之中文會靜默變成 "?"（合規性控制項失效），故拒絕啟動。`,
      `若本環境確實不需燒錄，請設定 ${REQUIRE_CJK_FONT_ENV}=false。`,
    ].join('\n'),
  );
}
