import { describe, it, expect } from 'vitest';
import { deriveDisplayStatus, DISPLAY_LABEL, statusCounts } from './document-display';
import type { DocumentListItem } from '../api/types';

const today = new Date('2026-07-22T10:00:00Z');
const doc = (over: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'd', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc',
  lifecycleName: null, nodeId: null, draftingCompanyId: null, draftingDeptId: null,
  draftingSectionId: null, draftingCompanyName: null, draftingDeptName: null,
  draftingSectionName: null, primaryChiefId: null, primaryChiefName: null,
  edition: null, announcedDate: null, contentSummary: null, ...over,
});

describe('document-display（前端衍生狀態，mirror 後端）', () => {
  it('deriveDisplayStatus：有效＋公告已過→已公告、未到/未填→進度中、失效/作廢照原樣', () => {
    expect(deriveDisplayStatus('active', '2026-07-01T00:00:00.000Z', today)).toBe('announced');
    expect(deriveDisplayStatus('active', '2026-08-01T00:00:00.000Z', today)).toBe('in_progress');
    expect(deriveDisplayStatus('active', null, today)).toBe('in_progress');
    expect(deriveDisplayStatus('inactive', null, today)).toBe('inactive');
    expect(deriveDisplayStatus('void', null, today)).toBe('void');
  });

  it('DISPLAY_LABEL', () => {
    expect(DISPLAY_LABEL.announced).toBe('已公告');
    expect(DISPLAY_LABEL.in_progress).toBe('進度中');
  });

  it('statusCounts：總數/已公告/進度中', () => {
    const docs = [
      doc({ status: 'active', announcedDate: '2026-07-01T00:00:00.000Z' }), // announced
      doc({ status: 'active', announcedDate: null }), // in_progress
      doc({ status: 'inactive' }),
    ];
    const c = statusCounts(docs, today);
    expect(c.total).toBe(3);
    expect(c.announced).toBe(1);
    expect(c.inProgress).toBe(1);
  });
});
