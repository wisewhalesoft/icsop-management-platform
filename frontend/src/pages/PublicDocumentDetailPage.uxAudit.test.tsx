import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicDocumentDetailPage } from './PublicDocumentDetailPage';
import { ToastProvider } from '../components/useToast';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicDocumentDetail, DocumentAppendixRecord } from '../api/types';

/**
 * 前台詳情之 UX 稽核回歸測試（docs/specs/ux-audit-frontstage.md · A-2）。
 *
 * 受控下載每次核發皆由後端寫入一筆調閱稽核，故「請求期間可重複點擊」不僅是體感問題，
 * 而會產生重複稽核紀錄。本檔鎖定該防護：進行中鎖定按鈕、拒絕併發核發、完成後解鎖。
 */
vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const DOC_ID = 'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f';

function mockAuth(): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode: 'JAC00', name: '王小明' },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function detailOf(over: Partial<PublicDocumentDetail> = {}): PublicDocumentDetail {
  return {
    id: DOC_ID,
    status: 'active',
    displayStatus: 'announced',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    lifecycleId: 'lc1',
    lifecycleName: '銷售及收款循環',
    nodeId: 'n1',
    nodeName: '進件作業',
    draftingCompanyName: '和潤企業股份有限公司',
    draftingDeptId: 'D',
    draftingDeptName: '企劃部',
    draftingSectionId: 'S',
    draftingSectionName: '車輛行銷室',
    primaryChiefId: 'e1',
    primaryChiefName: '陳彥廷（企劃部 車輛行銷室 室長）',
    edition: "26'01",
    announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '規範車輛分期案件之進件收件流程。',
    // 🔴 [2026-08-28 E11] AC-J1／AC-01=(C)：DOCUMENT_ATTACHMENT.type 已不含 'OJT_SIGNIN'。
    attachments: [
      { type: 'ICSOP_PDF', fileName: '車輛分期進件作業_v1.3.pdf', blobPath: 'blob/icsop.pdf' },
    ],
    usageForms: [{ id: 'f1', name: '進件申請書.xlsx', format: 'xlsx' }],
    links: [],
    ...over,
  };
}

/**
 * 🔧 遷移時順帶修正**既存**型別錯誤（非本輪引入；HEAD 即已存在）：
 * `DocumentAppendixRecord`（`api/types.ts:691-701`）並無 `documentId`／`blobPath` 兩欄，
 * 舊 fixture 之多餘屬性使 `tsc --noEmit` 紅燈（F002 `AC-D7` 之機器驗證載體）。兩欄本測試皆未使用。
 *   OLD> `{ id: 'ap1', documentId: DOC_ID, name: '附錄一 · 徵信檢核表.xlsx', format: 'xlsx', blobPath: 'blob/ap1.xlsx', sortOrder: 1 },`
 */
const APPENDIX: DocumentAppendixRecord[] = [
  { id: 'ap1', name: '附錄一 · 徵信檢核表.xlsx', format: 'xlsx', sortOrder: 1 },
];

function renderDetail() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/public/documents/${DOC_ID}`]}>
        <Routes>
          <Route path="/public/documents/:id" element={<PublicDocumentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * 建立一個可由測試自行決定完成時機的下載 promise。
 *
 * 🔴 2026-08-16 載體遷移（F020 `AC-D3`／`AC-D3a`；申訴 #10）：前台三類下載自 SAS 核發
 * （`Promise<{url, expiresInSeconds}>`）改為代理串流（`downloadViaBlob`，`Promise<void>`），
 * 故 deferred 之型別隨之改變。**鎖之語意（disabled ＋ aria-busy ＋ 單一併發）逐字不變。**
 *
 * 原型別／原本體（逐字保留，供追溯）：
 *   OLD> `promise: Promise<{ url: string; expiresInSeconds: number }>;`
 *   OLD> `const promise = new Promise<{ url: string; expiresInSeconds: number }>((res) => {`
 *   OLD> `  resolve = () => res({ url: 'https://x/file', expiresInSeconds: 60 });`
 */
function deferredGrant(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = () => res();
  });
  return { promise, resolve };
}

describe('前台詳情 · UX 稽核回歸（A-2 下載併發鎖）', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPENDIX);
    vi.mocked(api.downloadDocumentFront).mockResolvedValue(undefined);
    vi.mocked(api.printDocumentFront).mockResolvedValue(undefined);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  /**
   * 🔴 載體遷移（申訴 #10）：驅動鎖之 promise 自 `downloadAttachment`（SAS，已被
   * `PublicDocumentDetailPage.watermark.test.tsx:239` 明文禁止於前台）改掛
   * `downloadPublicAttachment`（前台代理串流）。**鎖之語意逐字不變。**
   *   OLD> `vi.mocked(api.downloadAttachment).mockReturnValue(grant.promise);`
   */
  it('附件下載進行中鎖定該按鈕（disabled + aria-busy），完成後解鎖', async () => {
    const user = userEvent.setup();
    const grant = deferredGrant();
    vi.mocked(api.downloadPublicAttachment).mockReturnValue(grant.promise);

    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const atts = within(screen.getByTestId('attachment-list'));
    const btn = atts.getByRole('button', { name: '下載 車輛分期進件作業_v1.3.pdf' });

    await user.click(btn);
    await waitFor(() => {
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
    });

    grant.resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn).toHaveAttribute('aria-busy', 'false');
  });

  /**
   * 🔴 載體遷移（申訴 #10）：同上，改掛 `downloadPublicAttachment`。**「不二次核發」之語意逐字不變。**
   *   OLD> `vi.mocked(api.downloadAttachment).mockReturnValue(grant.promise);`
   *   OLD> `expect(api.downloadAttachment).toHaveBeenCalledTimes(1);`（兩處）
   */
  it('進行中重複點擊不會二次核發（避免重複調閱稽核）', async () => {
    const user = userEvent.setup();
    const grant = deferredGrant();
    vi.mocked(api.downloadPublicAttachment).mockReturnValue(grant.promise);

    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const atts = within(screen.getByTestId('attachment-list'));
    const btn = atts.getByRole('button', { name: '下載 車輛分期進件作業_v1.3.pdf' });

    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());

    await user.click(btn);
    await user.click(btn);

    expect(api.downloadPublicAttachment).toHaveBeenCalledTimes(1);

    grant.resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(api.downloadPublicAttachment).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴 載體遷移（申訴 #10）：兩端皆改掛前台代理串流 helper。**「任一下載進行中即不受理其他下載」
   * 之保守策略（ux-audit-frontstage.md:238）逐字不變。**
   *   OLD> `vi.mocked(api.downloadAttachment).mockReturnValue(grant.promise);`
   *   OLD> `vi.mocked(api.downloadUsageForm).mockResolvedValue({ url: 'https://x/form', expiresInSeconds: 60 });`
   *   OLD> `expect(api.downloadUsageForm).not.toHaveBeenCalled();`
   *   OLD> `await waitFor(() => expect(api.downloadUsageForm).toHaveBeenCalledTimes(1));`
   */
  it('某列下載進行中時，其他列之下載亦不受理（單一併發鎖）', async () => {
    const user = userEvent.setup();
    const grant = deferredGrant();
    vi.mocked(api.downloadPublicAttachment).mockReturnValue(grant.promise);
    vi.mocked(api.downloadUsageFormFront).mockResolvedValue(undefined);

    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const attBtn = within(screen.getByTestId('attachment-list')).getByRole('button', {
      name: '下載 車輛分期進件作業_v1.3.pdf',
    });
    const formBtn = within(screen.getByTestId('usage-form-list')).getByRole('button', {
      name: '下載 進件申請書.xlsx',
    });

    await user.click(attBtn);
    await waitFor(() => expect(attBtn).toBeDisabled());

    // 其他列按鈕本身未 disable（僅進行中那列顯示忙碌），但核發被鎖拒絕
    await user.click(formBtn);
    expect(api.downloadUsageFormFront).not.toHaveBeenCalled();

    grant.resolve();
    await waitFor(() => expect(attBtn).not.toBeDisabled());

    // 解鎖後可正常核發
    await user.click(formBtn);
    await waitFor(() => expect(api.downloadUsageFormFront).toHaveBeenCalledTimes(1));
  });

  /**
   * 🔴 載體遷移（申訴 #10）：改掛 `downloadDocumentAppendixFront`（前台附錄代理串流）。
   * **鎖之語意逐字不變。**
   *   OLD> `vi.mocked(api.downloadDocumentAppendix).mockReturnValue(grant.promise);`
   *   OLD> `expect(api.downloadDocumentAppendix).toHaveBeenCalledTimes(1);`
   */
  it('附錄下載同樣受併發鎖保護', async () => {
    const user = userEvent.setup();
    const grant = deferredGrant();
    vi.mocked(api.downloadDocumentAppendixFront).mockReturnValue(grant.promise);

    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const btn = within(screen.getByTestId('appendix-list')).getByRole('button', {
      name: '下載 附錄一 · 徵信檢核表.xlsx',
    });

    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    await user.click(btn);
    expect(api.downloadDocumentAppendixFront).toHaveBeenCalledTimes(1);

    grant.resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});
