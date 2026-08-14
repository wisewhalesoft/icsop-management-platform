import { AppDataSource } from './data-source';

/**
 * 一次性資料修補：把「latin1 誤解之 UTF-8 檔名」（mojibake）還原為正確中文。
 *
 * 成因見 storage/multipart.ts —— multer/busboy 對 part header 預設以 latin1 解碼，
 * 修正（`defParamCharset: 'utf8'`）之前上傳的檔名已以亂碼落地於下列欄位：
 *   APPENDIX_POOL.name（附錄多檔上傳）／DOCUMENT_ATTACHMENT.fileName（附件一律走檔名）／
 *   USAGE_FORM_POOL.name（未填自訂名稱時）。
 * blobPath 不受影響（key 為 UUID + 副檔名），故本腳本只改顯示名稱、不動 Blob。
 *
 * 執行（預設 dry-run，只列出將修補之列；加 --apply 才寫入）：
 *   npm run repair:filenames            # 本機 ts-node
 *   npm run repair:filenames -- --apply
 *   node dist/database/repair-mojibake-filenames.js --apply   # 容器內（只有 dist）
 *
 * 冪等：僅挑「可完整還原成有效 UTF-8 且含非 latin1 字元」者；已正確之列不符合條件，重跑不變。
 */

const TARGETS: Array<{ table: string; keyCol: string; col: string }> = [
  { table: 'APPENDIX_POOL', keyCol: 'id', col: 'name' },
  { table: 'DOCUMENT_ATTACHMENT', keyCol: 'id', col: 'fileName' },
  { table: 'USAGE_FORM_POOL', keyCol: 'id', col: 'name' },
];

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * 還原一個疑似 mojibake 字串；不像 mojibake（或還原後不是有效 UTF-8）則回 null。
 *
 * 判準三條同時成立才動手，寧可少修不可誤傷：
 *  ① 每個字元碼位 < 256（latin1 可表示）——真正的中文字碼位遠大於 255，故正確之列必不符合；
 *  ② 這些位元組能以嚴格 UTF-8 解碼（無替代字元）；
 *  ③ 還原後確實出現非 latin1 字元（真的解出了中文），且與原字串不同。
 */
export function repairMojibake(value: string): string | null {
  if (value === '' || [...value].some((ch) => ch.codePointAt(0)! > 0xff)) return null;
  let decoded: string;
  try {
    decoded = strictUtf8.decode(Buffer.from(value, 'latin1'));
  } catch {
    return null;
  }
  if (decoded === value) return null;
  if (![...decoded].some((ch) => ch.codePointAt(0)! > 0xff)) return null;
  return decoded;
}

async function repair(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await AppDataSource.initialize();
  try {
    let found = 0;
    let fixed = 0;
    for (const t of TARGETS) {
      let rows: Array<Record<string, string>>;
      try {
        rows = await AppDataSource.query(
          `SELECT [${t.keyCol}] AS k, [${t.col}] AS v FROM [${t.table}]`,
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[repair] 略過 ${t.table}：${e instanceof Error ? e.message : e}`);
        continue;
      }
      for (const r of rows) {
        const next = repairMojibake(r.v);
        if (!next) continue;
        found += 1;
        // eslint-disable-next-line no-console
        console.log(`[repair] ${t.table}.${t.col} ${r.k}\n    ${r.v}\n  → ${next}`);
        if (apply) {
          await AppDataSource.query(
            `UPDATE [${t.table}] SET [${t.col}] = @0 WHERE [${t.keyCol}] = @1`,
            [next, r.k],
          );
          fixed += 1;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      apply
        ? `[repair] 完成：${fixed}/${found} 筆已回寫。`
        : `[repair] dry-run：偵測到 ${found} 筆亂碼（未寫入；加 --apply 執行修補）。`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

// 被單元測試 import 時不自動執行（僅 CLI 直接執行才跑）。
if (require.main === module) {
  repair()
    .then(() => process.exit(0))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[repair] 失敗：', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
