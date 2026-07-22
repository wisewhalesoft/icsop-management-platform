import { FIELD_KEY_BY_PROP, classifyFields } from './document-field-write';

describe('document-field-write（F026 欄位面 enforcement）', () => {
  it('FIELD_KEY_BY_PROP 涵蓋建立/編輯之文件欄位屬性', () => {
    expect(FIELD_KEY_BY_PROP.status).toBe('文件狀態');
    expect(FIELD_KEY_BY_PROP.documentNumber).toBe('文件編號');
    expect(FIELD_KEY_BY_PROP.id).toBe('系統UUID');
  });

  it('ICSOPAdmin：業務欄位 writable、系統 UUID ignored', () => {
    const r = classifyFields('ICSOPAdmin', ['status', 'documentNumber', 'documentName', 'id']);
    expect(r.writable.sort()).toEqual(['documentName', 'documentNumber', 'status'].sort());
    expect(r.ignored).toEqual(['id']);
    expect(r.forbidden).toEqual([]);
  });

  it('SysAdmin：業務欄位 forbidden（僅 ICSOPAdmin 可寫）、UUID 仍 ignored', () => {
    const r = classifyFields('SysAdmin', ['status', 'id']);
    expect(r.forbidden).toEqual(['status']);
    expect(r.ignored).toEqual(['id']);
    expect(r.writable).toEqual([]);
  });

  it('Supervisor：業務欄位 forbidden', () => {
    const r = classifyFields('Supervisor', ['documentName']);
    expect(r.forbidden).toEqual(['documentName']);
  });

  it('未知屬性 → 併入 ignored（白名單，不放行任意欄位）', () => {
    const r = classifyFields('ICSOPAdmin', ['status', 'evilField']);
    expect(r.writable).toEqual(['status']);
    expect(r.ignored).toContain('evilField');
  });
});
