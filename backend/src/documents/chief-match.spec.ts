/**
 * `matchesChiefFilter()` — 前後台共用之「當責室長」比對純函式（2026-08-16 delta）
 *
 * 權威：
 *   · docs/specs/architecture-spec.md §10.6「比對純函式共用」（逐字給定簽章與語意）
 *   · docs/specs/architecture-spec.md §10.11（🔴 L3 建立、L4 直接 import；
 *     「L4 先寫本地實作再於合併時收斂＝反模式，明確禁止」）
 *   · docs/specs/features/F019-public-list-browsing.md `AC-D7`（前台）
 *   · docs/specs/features/F017-backend-document-list.md `AC-D7`（後台，嚴格超集）
 *
 * 🔴 本函式存在之唯一理由是**結構性保證**：前台 `public-list.ts` 與後台 `document-list-query.ts`
 *    不可能分歧，因為它們是同一個函式。故本檔另設「單一實作」之靜態約束（見末段）。
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { matchesChiefFilter } from './chief-match';

type Row = { primaryChiefId: string | null; secondaryChiefIds: string[] };
const row = (primary: string | null, secondary: string[] = []): Row => ({
  primaryChiefId: primary,
  secondaryChiefIds: secondary,
});

describe('matchesChiefFilter（F019 AC-D7 × F017 AC-D7 同一語意）', () => {
  it('TS-CHIEF-001 未提供 chiefId（undefined／空字串）→ 不施加限制，一律 true', () => {
    expect(matchesChiefFilter(row('E001', ['E002']), undefined)).toBe(true);
    expect(matchesChiefFilter(row(null, []), undefined)).toBe(true);
    expect(matchesChiefFilter(row('E001'), '')).toBe(true);
  });

  it('TS-CHIEF-002 命中主要室長 → true', () => {
    expect(matchesChiefFilter(row('E001', ['E002']), 'E001')).toBe(true);
  });

  it('TS-CHIEF-003 命中次要室長 → true（🔴 本 delta 之語意擴充）', () => {
    expect(matchesChiefFilter(row('E009', ['E001']), 'E001')).toBe(true);
  });

  it('TS-CHIEF-004 皆未命中 → false', () => {
    expect(matchesChiefFilter(row('E001', ['E002']), 'E003')).toBe(false);
  });

  it('TS-CHIEF-005 主要為 null、次要命中 → true（主要可空）', () => {
    expect(matchesChiefFilter(row(null, ['E001']), 'E001')).toBe(true);
  });

  it('TS-CHIEF-006 主要為 null、次要為空 → 任何 chiefId 皆 false（不得以 null 誤命中）', () => {
    expect(matchesChiefFilter(row(null, []), 'E001')).toBe(false);
  });

  it('TS-CHIEF-007 多筆次要室長，命中任一即 true', () => {
    const r = row('E100', ['E101', 'E102', 'E103']);
    for (const id of ['E100', 'E101', 'E102', 'E103']) expect(matchesChiefFilter(r, id)).toBe(true);
    expect(matchesChiefFilter(r, 'E104')).toBe(false);
  });

  it('TS-CHIEF-008 比對為嚴格相等（不做 trim／大小寫正規化，員編為 code 不做模糊比對）', () => {
    expect(matchesChiefFilter(row('E001'), 'e001')).toBe(false);
    expect(matchesChiefFilter(row('E001'), ' E001')).toBe(false);
  });

  it('TS-CHIEF-009 既有行為之嚴格超集：原「僅比對主要」之全部 true 期望值不反轉', () => {
    // F017 AC-D7 明訂本次為嚴格超集——既有「以主要室長篩選能找到該文件」之期望值一律不變。
    expect(matchesChiefFilter(row('E12345', []), 'E12345')).toBe(true);
    expect(matchesChiefFilter(row('E67890', []), 'E12345')).toBe(false);
  });
});

/**
 * 🔴 §10.11 之結構性保證：前後台**各自依路徑 import 同一份**，不得各寫一份本地實作。
 * 以原始碼靜態文字斷言把「單一實作」釘住（比照 §10.15 #1 之 Dockerfile 靜態斷言手法）——
 * 這是 unit 層唯一能擋住「L4 自行複製一份比對邏輯」之手段。
 */
describe('matchesChiefFilter 之單一實作約束（架構 §10.11）', () => {
  const src = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('TS-CHIEF-101 前台 public-list.ts 依路徑 import 本函式', () => {
    expect(src('public/public-list.ts')).toMatch(/matchesChiefFilter/);
    expect(src('public/public-list.ts')).toMatch(/from\s+'(\.\.\/)?documents\/chief-match'/);
  });

  it('TS-CHIEF-102 後台 document-list-query.ts 依路徑 import 本函式', () => {
    expect(src('documents/document-list-query.ts')).toMatch(/matchesChiefFilter/);
    expect(src('documents/document-list-query.ts')).toMatch(/from\s+'\.\/chief-match'/);
  });

  it('TS-CHIEF-103 兩處皆不得留下「僅比對主要」之舊式兩端比對（第二份實作之特徵）', () => {
    // 舊語意之字面特徵＝**兩端皆為 `.primaryChiefId`** 之不等比對
    // （如 `filters.primaryChiefId !== r.primaryChiefId`）。本 delta 必須由共用函式取代。
    // ⚠ 刻意要求兩端皆命中：單邊之 `x.primaryChiefId !== null` 為合法的空值檢查，
    //   若一併禁掉會產生與 AC 無關之假紅。
    const OLD_SHAPE = /\w+\.primaryChiefId\s*[!=]==?\s*\w+\.primaryChiefId/;
    for (const rel of ['public/public-list.ts', 'documents/document-list-query.ts']) {
      expect(src(rel)).not.toMatch(OLD_SHAPE);
    }
  });
});
