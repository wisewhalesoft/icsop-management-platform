import { describe, expect, it } from 'vitest';
import type { DocumentListItem } from '../api/types';
import { byDraftingProximity } from './document-list-sort';

/** 🔵 2026-09-23：後台清單預設排序＝相近程度昇冪、同層程序書編號降冪；缺值排最後。 */
const row = (documentNumber: string, draftingProximity?: number): DocumentListItem =>
  ({ documentNumber, draftingProximity }) as DocumentListItem;

describe('byDraftingProximity', () => {
  it('相近程度優先於編號；同層編號降冪；缺值最後', () => {
    const rows = [row('Z9', 4), row('A1', 0), row('A2', 0), row('Z8', 3), row('Z99'), row('M5', 1)];
    expect(rows.sort(byDraftingProximity).map((r) => r.documentNumber)).toEqual([
      'A2', 'A1', 'M5', 'Z8', 'Z9', 'Z99',
    ]);
  });
});
