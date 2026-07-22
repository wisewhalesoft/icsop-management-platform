import {
  DOCUMENT_STATUSES,
  STATUS_LABEL,
  isValidStatus,
  statusOccupiesNumber,
} from './document-status';

describe('document-status', () => {
  it('三種狀態與中文標籤', () => {
    expect([...DOCUMENT_STATUSES]).toEqual(['active', 'inactive', 'void']);
    expect(STATUS_LABEL.active).toBe('有效');
    expect(STATUS_LABEL.inactive).toBe('失效');
    expect(STATUS_LABEL.void).toBe('作廢');
  });

  it('isValidStatus', () => {
    expect(isValidStatus('active')).toBe(true);
    expect(isValidStatus('void')).toBe(true);
    expect(isValidStatus('有效')).toBe(false); // 內部存英文碼
    expect(isValidStatus('frozen')).toBe(false);
  });

  it('佔用編號者＝有效＋作廢；失效釋出（F013/OQ-E04-01b）', () => {
    expect(statusOccupiesNumber('active')).toBe(true);
    expect(statusOccupiesNumber('void')).toBe(true);
    expect(statusOccupiesNumber('inactive')).toBe(false);
  });
});
