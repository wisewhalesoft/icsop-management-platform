import { readdirSync } from 'fs';
import { join } from 'path';
import { globSync } from 'tinyglobby';
import { AppDataSource } from './data-source';

/**
 * migrations glob 不得吃到同目錄之 `*.spec.ts`（2026-10-06）。
 *
 * 症狀：`npm run sync:once`／`migration:run`（ts-node）啟動 DataSource 時 TypeORM 會 require
 * glob 命中之每個檔案；`migrations/` 內之 `*.selection.spec.ts` 於 jest 外執行即
 * `ReferenceError: describe is not defined` ⇒ 本機同步整支起不來，`test:int` 亦出現「failed to run」雜訊。
 *
 * 以 TypeORM 實際使用之 tinyglobby 展開**實際設定值**，而非比對字串——鎖結果不鎖寫法。
 */
describe('AppDataSource.options.migrations', () => {
  const migrationsDir = join(__dirname, 'migrations');
  const expand = (): string[] =>
    (AppDataSource.options.migrations as string[]).flatMap((p) =>
      globSync(p.replace(/\\/g, '/')),
    );

  it('不含任何 spec 檔（目錄內確實存在 spec 檔，本斷言非恆真）', () => {
    const specsOnDisk = readdirSync(migrationsDir).filter((f) => f.endsWith('.spec.ts'));
    expect(specsOnDisk.length).toBeGreaterThan(0);
    expect(expand().filter((f) => f.endsWith('.spec.ts'))).toEqual([]);
  });

  it('時間戳記開頭之 migration 檔一支不漏', () => {
    const onDisk = readdirSync(migrationsDir)
      .filter((f) => /^\d+-.+\.ts$/.test(f) && !f.endsWith('.spec.ts'))
      .sort();
    expect(onDisk.length).toBeGreaterThan(0);
    const matched = expand()
      .map((f) => f.split('/').pop()!)
      .sort();
    expect(matched).toEqual(onDisk);
  });
});
