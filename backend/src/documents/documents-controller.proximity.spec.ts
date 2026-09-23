import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { RequestWithSession } from '../auth/session.guard';

/**
 * 🔵 2026-09-23：清單之檢視者**只能**取自 `req.sessionUser`（不得取自 query——否則任何人可偽造
 * 他人單位看排序，雖無資料外洩，但排序就不再代表「我」）。
 */
describe('DocumentsController#list — 相近程度之檢視者', () => {
  it('以 session 之 orgCode／companyCode 作為 viewer 傳入 service', async () => {
    const listDocuments = jest.fn().mockResolvedValue({ items: [] });
    const ctrl = new DocumentsController({ listDocuments } as unknown as DocumentsService);
    const req = { sessionUser: { orgCode: 'JAC00', companyCode: 'AS' } } as unknown as RequestWithSession;
    await ctrl.list({ orgCode: 'ZZZ00', companyCode: 'AD' } as Record<string, string>, req);
    expect(listDocuments).toHaveBeenCalledWith(expect.anything(), {
      orgCode: 'JAC00',
      companyCode: 'AS',
    });
  });

  it('無 session ⇒ viewer 為 undefined', async () => {
    const listDocuments = jest.fn().mockResolvedValue({ items: [] });
    const ctrl = new DocumentsController({ listDocuments } as unknown as DocumentsService);
    await ctrl.list({});
    expect(listDocuments).toHaveBeenCalledWith(expect.anything(), undefined);
  });
});
