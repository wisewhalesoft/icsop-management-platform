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

  /**
   * 🔴 B 階段（多公司）迴歸：`companyCode` 曾未列於 FIELD_KEY_BY_PROP → 被歸為未知屬性
   * 而靜默丟棄，前端送出的公司代碼從未抵達 store；`ICSOP_DOCUMENT.companyCode` 為 NOT NULL，
   * INSERT 因而被 SQL Server 擋下（使用者看到 500）。本組測試把「有對映」釘死。
   */
  it('companyCode 對映至「制定公司」，且 draftingCompanyId 已不在表內（2026-08-27 裁定）', () => {
    expect(FIELD_KEY_BY_PROP.companyCode).toBe('制定公司');
    // 制定公司收斂為單一欄位；舊的 `draftingCompanyId` 已自 DB 與 API 整個移除，
    // 白名單也必須跟著移除——留著等於仍放行一個寫了不會生效的欄位。
    expect(FIELD_KEY_BY_PROP.draftingCompanyId).toBeUndefined();
  });

  it('companyCode：ICSOPAdmin writable、其餘角色 forbidden（不得落入 ignored）', () => {
    const ok = classifyFields('ICSOPAdmin', ['companyCode']);
    expect(ok.writable).toEqual(['companyCode']);
    expect(ok.ignored).toEqual([]);
    for (const role of ['SysAdmin', 'Supervisor', 'DeptContact', 'User']) {
      const r = classifyFields(role, ['companyCode']);
      expect(r.forbidden).toEqual(['companyCode']);
      expect(r.ignored).toEqual([]);
    }
  });

  it('未知屬性 → 併入 ignored（白名單，不放行任意欄位）', () => {
    const r = classifyFields('ICSOPAdmin', ['status', 'evilField']);
    expect(r.writable).toEqual(['status']);
    expect(r.ignored).toContain('evilField');
  });
});
