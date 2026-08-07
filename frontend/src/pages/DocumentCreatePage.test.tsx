import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentCreatePage } from './DocumentCreatePage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type {
  SessionUser,
  LifecycleView,
  DocumentListItem,
  DocumentListPage,
  OrgUnitRecord,
  PersonRecord,
} from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
];

function doc(over: Partial<DocumentListItem>): DocumentListItem {
  return {
    id: 'd0', status: 'active', documentNumber: '', documentName: '',
    lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', nodeId: null,
    draftingCompanyId: null, draftingDeptId: null, draftingSectionId: null,
    draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
    primaryChiefId: null, primaryChiefName: null,
    edition: null, announcedDate: null, contentSummary: null,
    icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
    ...over,
  };
}

const page = (items: DocumentListItem[] = []): DocumentListPage => ({
  items, total: items.length, page: 1, pageSize: 50, hasNext: false,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentCreatePage />
      </MemoryRouter>
    </ToastProvider>,
  );

function org(over: Partial<OrgUnitRecord>): OrgUnitRecord {
  return {
    companyCode: 'AS', orgCode: '', codePrefix: '', parentCode: null, tier: 'SECTION',
    name: '', descFull: null, managerEmpNo: null, isActive: true, ...over,
  };
}
// 迷你組織樹：ROOT 和潤本部 → DIVISION 經企本部 → 部（企劃部/資訊部/稽核部）→ 室
const ORG: OrgUnitRecord[] = [
  org({ orgCode: '00000', parentCode: null, tier: 'ROOT', name: '和潤本部' }),
  org({ orgCode: 'A0000', parentCode: '00000', tier: 'DIVISION', name: '經營企劃管理本部' }),
  org({ orgCode: 'A2000', parentCode: 'A0000', tier: 'DEPARTMENT', name: '企劃部' }),
  org({ orgCode: 'A3000', parentCode: 'A0000', tier: 'DEPARTMENT', name: '資訊部' }),
  org({ orgCode: 'B2000', parentCode: 'A0000', tier: 'DEPARTMENT', name: '稽核部' }), // 無室
  org({ orgCode: 'A2100', parentCode: 'A2000', tier: 'SECTION', name: '車輛行銷室', managerEmpNo: '20050' }),
  org({ orgCode: 'A2200', parentCode: 'A2000', tier: 'SECTION', name: '數位行銷室', managerEmpNo: '99999' }),
  org({ orgCode: 'A3100', parentCode: 'A3000', tier: 'SECTION', name: '應用發展室' }),
];
const PERSONS: PersonRecord[] = [
  { employeeNo: '20050', name: '陳彥廷', orgCode: 'A2100', employmentStatus: 'active' },
  { employeeNo: '20053', name: '林建宏', orgCode: 'A2200', employmentStatus: 'active' },
];

/** 依序選定 循環→制定公司→制定部門，回傳到「可選室別」的狀態。 */
async function selectToDept(): Promise<void> {
  await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
  await userEvent.click(screen.getByLabelText(/制定公司/));
  await userEvent.click(await screen.findByRole('option', { name: '和潤本部' }));
  await userEvent.click(screen.getByLabelText(/制定部門/));
  await userEvent.click(await screen.findByRole('option', { name: '企劃部' }));
}

describe('DocumentCreatePage — F010 建立文件（移植 prototype 14）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.getDocuments).mockResolvedValue(page([]));
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
    vi.mocked(endpoints.searchPersons).mockResolvedValue([]);
    vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
    vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]); // F039：預設空池，個別測試覆寫
  });

  it('ICSOPAdmin 渲染分步表單並載入循環下拉', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    expect(screen.getByLabelText(/ICSOP 文件編號/)).toBeInTheDocument();
    expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument();
    expect(screen.getByText(/循環與節點歸屬/)).toBeInTheDocument();
    expect(screen.getByText(/建立時為「未指派」/)).toBeInTheDocument();
  });

  it('非 ICSOPAdmin（Supervisor）→ 403', () => {
    mockAuth('Supervisor');
    renderPage();
    expect(screen.getByText(/無建立文件權限/)).toBeInTheDocument();
  });

  it('未選循環顯示 gate 提示；選定後消失', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    expect(screen.getByText(/請先選擇「所屬循環」/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    expect(screen.queryByText(/請先選擇「所屬循環」/)).not.toBeInTheDocument();
  });

  it('編號前綴依循環自動帶入；只填後段序號並組出完整編號送出', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createDocument).mockResolvedValue({} as never);
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    expect(screen.getByText('ICSOP-SRC-')).toBeInTheDocument(); // 前綴
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '車輛分期進件作業');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleId: 'lc1', status: 'active', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }),
      ),
    );
  });

  it("版次 YY 與 NN 組出 26'01 隨送出", async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createDocument).mockResolvedValue({} as never);
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-02');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.type(screen.getByLabelText('版次年度'), '26');
    await userEvent.type(screen.getByLabelText('版次序號'), '1');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(expect.objectContaining({ edition: "26'01" })),
    );
  });

  it("G-DOC-107 版次範例採直式撇號 26'01（比照 stored YY'NN），非彎引號", async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    // 直式撇號範例存在；彎引號版本不存在。
    expect(screen.getByText("26'01")).toBeInTheDocument();
    expect(screen.queryByText('26’01')).not.toBeInTheDocument();
  });

  it('缺必填 → 前端擋下、不呼叫 createDocument', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    expect(endpoints.createDocument).not.toHaveBeenCalled();
    // SYS-1：必填總結改以 toast 呈現（不再是內嵌 role=alert）。
    expect(await screen.findByText(/僅 循環別/)).toBeInTheDocument();
  });

  it('即時唯一性：編號命中佔用（有效）文件 → 顯示 DUPLICATE 並擋下送出', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getDocuments).mockResolvedValue(page([
      doc({ id: 'x', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', status: 'active' }),
    ]));
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    expect(screen.getByText(/DOCUMENT_NUMBER_DUPLICATE/)).toBeInTheDocument(); // 即時內嵌提示
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    expect(endpoints.createDocument).not.toHaveBeenCalled();
  });

  it('編號重複（後端 409）→ 顯示提示', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createDocument).mockRejectedValue(new ApiError(409, 'DOCUMENT_NUMBER_DUPLICATE'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '999-9-99');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(screen.getByText(/編號已存在/)).toBeInTheDocument());
  });
});

describe('DocumentCreatePage — STEP3 制定組織與當責室長（F014，移植 prototype 14 STEP3）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.getDocuments).mockResolvedValue(page([]));
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue(ORG);
    vi.mocked(endpoints.searchPersons).mockResolvedValue(PERSONS);
    vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
    vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]); // F039：預設空池，個別測試覆寫
    vi.mocked(endpoints.createDocument).mockResolvedValue({} as never);
    mockAuth('ICSOPAdmin');
  });

  it('渲染 STEP3 真實表單（制定公司/部門/室別、當責室長主/次、使用部門）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    expect(screen.getByLabelText(/制定公司/)).toBeInTheDocument();
    expect(screen.getByLabelText(/制定部門/)).toBeInTheDocument();
    expect(screen.getByLabelText(/制定室別/)).toBeInTheDocument();
    expect(screen.getByLabelText(/當責室長-主要/)).toBeInTheDocument();
    expect(screen.getByLabelText(/當責室長-次要/)).toBeInTheDocument();
    expect(screen.getByLabelText(/文件使用部門/)).toBeInTheDocument();
  });

  it('G-DOC-101 制定公司/部門/室別 label 帶 1/2/3 編號徽章（由上而下相依）', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    // 徽章為各 label 之首字元（編碼由上而下：公司=1、部門=2、室別=3）。
    expect(container.querySelector('label[for="dCompany"]')?.textContent).toMatch(/^1/);
    expect(container.querySelector('label[for="dDept"]')?.textContent).toMatch(/^2/);
    expect(container.querySelector('label[for="dSection"]')?.textContent).toMatch(/^3/);
  });

  it('G-DOC-104/106 文件使用部門說明含「路徑呈現層級關係」且置於欄位之前', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    const helper = screen.getByText(/路徑呈現層級關係/);
    expect(helper).toBeInTheDocument();
    const input = screen.getByLabelText(/文件使用部門/);
    // 說明置於輸入欄位之前（DOM 先後）。
    expect(helper.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('三級由上而下：制定部門於未選公司時停用；選定公司後開放', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    expect(screen.getByLabelText(/制定部門/)).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/制定公司/));
    await userEvent.click(await screen.findByRole('option', { name: '和潤本部' }));
    expect(screen.getByLabelText(/制定部門/)).not.toBeDisabled();
  });

  it('制定室別僅顯示所選部門底下之室別（不含他部之室）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await selectToDept();
    await userEvent.click(screen.getByLabelText(/制定室別/));
    expect(await screen.findByRole('option', { name: '車輛行銷室' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '數位行銷室' })).toBeInTheDocument();
    // 應用發展室屬「資訊部」，不應出現在「企劃部」之室別
    expect(screen.queryByRole('option', { name: '應用發展室' })).not.toBeInTheDocument();
  });

  it('變更制定部門清空已選制定室別', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await selectToDept();
    await userEvent.click(screen.getByLabelText(/制定室別/));
    await userEvent.click(await screen.findByRole('option', { name: '車輛行銷室' }));
    await waitFor(() => expect(screen.getByLabelText(/制定室別/)).toHaveValue('車輛行銷室'));
    // 改選他部 → 室別清空
    await userEvent.click(screen.getByLabelText(/制定部門/));
    await userEvent.click(await screen.findByRole('option', { name: '資訊部' }));
    await waitFor(() => expect(screen.getByLabelText(/制定室別/)).toHaveValue(''));
  });

  it('選定制定室別後帶入該室 managerEmpNo 對應之在職者為主要室長預設候選', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await selectToDept();
    await userEvent.click(screen.getByLabelText(/制定室別/));
    await userEvent.click(await screen.findByRole('option', { name: '車輛行銷室' }));
    // managerEmpNo 20050 → 在職者 陳彥廷 帶入主要室長
    await waitFor(() =>
      expect(screen.getByLabelText(/當責室長-主要/)).toHaveValue('陳彥廷（A2100）'),
    );
  });

  it('制定室別 managerEmpNo 無對應在職者（離職/查無）→ 主要室長維持空白', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await selectToDept();
    await userEvent.click(screen.getByLabelText(/制定室別/));
    // 數位行銷室 managerEmpNo=99999，不在 searchPersons 結果 → 不帶入
    await userEvent.click(await screen.findByRole('option', { name: '數位行銷室' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByLabelText(/當責室長-主要/)).toHaveValue('');
  });

  it('完整送出：制定三級＋主要室長（預設候選）＋1 次要＋1 使用部門隨 createDocument 落地', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await selectToDept();
    // 制定室別（帶入主要室長 20050）
    await userEvent.click(screen.getByLabelText(/制定室別/));
    await userEvent.click(await screen.findByRole('option', { name: '車輛行銷室' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/當責室長-主要/)).toHaveValue('陳彥廷（A2100）'),
    );
    // 次要室長：輸入關鍵字後選 林建宏
    await userEvent.type(screen.getByLabelText(/當責室長-次要/), '林');
    await userEvent.click(await screen.findByRole('option', { name: /林建宏/ }));
    // 使用部門：搜尋車輛行銷室路徑並加入
    await userEvent.type(screen.getByLabelText(/文件使用部門/), '車輛行銷室');
    await userEvent.click(await screen.findByRole('option', { name: /車輛行銷室/ }));
    // 必填
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '車輛分期進件作業');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          draftingCompanyId: '00000',
          draftingDeptId: 'A2000',
          draftingSectionId: 'A2100',
          primaryChiefId: '20050',
          secondaryChiefIds: ['20053'],
          usingDeptIds: ['A2100'],
        }),
      ),
    );
  });
});

describe('DocumentCreatePage — STEP4 附件與關聯文件（F016/F018/F015，移植 prototype 14 STEP4）', () => {
  const EXISTING = doc({ id: 'docB', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業', status: 'active' });
  const FORM = {
    id: 'form1', name: '進件申請書.xlsx', blobPath: 'usage-forms/x.xlsx',
    format: 'xlsx', size: 1024, uploadedBy: 'u', uploadedAt: '2026-06-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.getDocuments).mockResolvedValue(page([EXISTING]));
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
    vi.mocked(endpoints.searchPersons).mockResolvedValue([]);
    vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([FORM]);
    vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]); // F039：本區塊聚焦附件/使用表單，附錄池預設空
    vi.mocked(endpoints.createDocument).mockResolvedValue({ id: 'new1' } as never);
    vi.mocked(endpoints.uploadIcsopPdf).mockResolvedValue({} as never);
    vi.mocked(endpoints.linkUsageForms).mockResolvedValue(undefined);
    vi.mocked(endpoints.updateDocument).mockResolvedValue({} as never);
    mockAuth('ICSOPAdmin');
  });

  it('渲染 STEP4：附件上傳卡、使用表單、文件連結點', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    expect(screen.getByText('附件與關聯文件')).toBeInTheDocument();
    expect(screen.getByLabelText(/上傳 ICSOP PDF/)).toBeInTheDocument();
    expect(screen.getByLabelText(/上傳 OJT 簽到表/)).toBeInTheDocument();
    expect(screen.getByLabelText(/使用表單/)).toBeInTheDocument();
    expect(screen.getByLabelText(/文件連結點/)).toBeInTheDocument();
  });

  it('選取使用表單與連結點 → 建立後以新文件 id 關聯表單並整批送出連結', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-09');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '車輛分期進件作業');
    // 使用表單
    await userEvent.type(screen.getByLabelText(/使用表單/), '進件');
    await userEvent.click(await screen.findByRole('option', { name: /進件申請書/ }));
    // 連結點
    await userEvent.type(screen.getByLabelText(/文件連結點/), '消金');
    await userEvent.click(await screen.findByRole('option', { name: /消金審核作業/ }));
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(endpoints.createDocument).toHaveBeenCalled());
    await waitFor(() => expect(endpoints.linkUsageForms).toHaveBeenCalledWith('new1', ['form1']));
    await waitFor(() => expect(endpoints.updateDocument).toHaveBeenCalledWith('new1', { links: ['docB'] }));
  });

  it('選取 ICSOP PDF 檔 → 建立後以新文件 id 上傳附件', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-10');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    const file = new File(['%PDF-1.4'], 'proc.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/上傳 ICSOP PDF/), file);
    expect(screen.getByText(/已選擇：proc.pdf/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(endpoints.uploadIcsopPdf).toHaveBeenCalledWith('new1', file));
  });
});

describe('DocumentCreatePage — STEP4 附錄選取與排序（F039，移植 prototype 14）', () => {
  const APPX = [
    { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', size: 57344, uploadedBy: 'u', uploadedAt: '2026-06-10T00:00:00.000Z', docCount: 0, documents: [] },
    { id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf', size: 98304, uploadedBy: 'u', uploadedAt: '2026-06-10T00:00:00.000Z', docCount: 0, documents: [] },
    { id: 'ax8', name: '共用名詞附錄.xlsx', format: 'xlsx', size: 30720, uploadedBy: 'u', uploadedAt: '2026-03-30T00:00:00.000Z', docCount: 0, documents: [] },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.getDocuments).mockResolvedValue(page([]));
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
    vi.mocked(endpoints.searchPersons).mockResolvedValue([]);
    vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
    vi.mocked(endpoints.getAppendixPool).mockResolvedValue(APPX);
    vi.mocked(endpoints.createDocument).mockResolvedValue({ id: 'new1' } as never);
    vi.mocked(endpoints.replaceDocumentAppendices).mockResolvedValue(undefined);
    mockAuth('ICSOPAdmin');
  });

  async function fillRequired(numberSuffix: string, name: string) {
    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), numberSuffix);
    await userEvent.type(screen.getByLabelText(/文件名稱/), name);
  }

  it('渲染附錄搜尋選取區（可多個、允許為空、可排序）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    expect(screen.getByLabelText(/附錄/)).toBeInTheDocument();
  });

  it('AC-19 依序勾選 A、B、C 並送出 → replaceDocumentAppendices 以該順序呼叫（sortOrder 1/2/3）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await fillRequired('101-1-11', '名');
    const appx = screen.getByLabelText(/附錄/);
    await userEvent.type(appx, '作業流程');
    await userEvent.click(await screen.findByRole('option', { name: /作業流程對照表/ }));
    await userEvent.type(appx, '名詞定義');
    await userEvent.click(await screen.findByRole('option', { name: /名詞定義說明/ }));
    await userEvent.type(appx, '共用名詞');
    await userEvent.click(await screen.findByRole('option', { name: /共用名詞附錄/ }));
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() => expect(endpoints.createDocument).toHaveBeenCalled());
    await waitFor(() =>
      expect(endpoints.replaceDocumentAppendices).toHaveBeenCalledWith('new1', ['ax1', 'ax2', 'ax8']),
    );
  });

  it('AC-18 新選取者一律加入末位（接續現有最大 sortOrder）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await fillRequired('101-1-12', '名');
    const appx = screen.getByLabelText(/附錄/);
    await userEvent.type(appx, '名詞定義');
    await userEvent.click(await screen.findByRole('option', { name: /名詞定義說明/ }));
    await userEvent.type(appx, '作業流程');
    await userEvent.click(await screen.findByRole('option', { name: /作業流程對照表/ }));
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() =>
      expect(endpoints.replaceDocumentAppendices).toHaveBeenCalledWith('new1', ['ax2', 'ax1']),
    );
  });

  it('AC-20 對末筆點擊上移兩次 → 畫面順序即時反映；首筆上移／末筆下移不變且不出錯', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    const appx = screen.getByLabelText(/附錄/);
    for (const kw of ['作業流程', '名詞定義', '共用名詞']) {
      await userEvent.type(appx, kw);
      await userEvent.click(await screen.findByRole('option', { name: new RegExp(kw) }));
    }
    // 以名稱文字順序驗證（不依賴特定 test-id 命名，容錯於實作細節）。
    const orderedNames = () =>
      screen.getAllByText(/^(作業流程對照表\.xlsx|名詞定義說明\.pdf|共用名詞附錄\.xlsx)$/).map((e) => e.textContent);
    expect(orderedNames()).toEqual(['作業流程對照表.xlsx', '名詞定義說明.pdf', '共用名詞附錄.xlsx']);

    const upButtons = screen.getAllByRole('button', { name: '上移' });
    await userEvent.click(upButtons[upButtons.length - 1]); // 對末筆（共用名詞附錄）上移
    await userEvent.click(screen.getAllByRole('button', { name: '上移' })[1]); // 再上移一次（此時它在中間）
    expect(orderedNames()).toEqual(['共用名詞附錄.xlsx', '作業流程對照表.xlsx', '名詞定義說明.pdf']);

    // 首筆上移不變、不出錯
    await userEvent.click(screen.getAllByRole('button', { name: '上移' })[0]);
    expect(orderedNames()).toEqual(['共用名詞附錄.xlsx', '作業流程對照表.xlsx', '名詞定義說明.pdf']);
    // 末筆下移不變、不出錯
    const downButtons = screen.getAllByRole('button', { name: '下移' });
    await userEvent.click(downButtons[downButtons.length - 1]);
    expect(orderedNames()).toEqual(['共用名詞附錄.xlsx', '作業流程對照表.xlsx', '名詞定義說明.pdf']);
  });

  it('AC-21 排序操作元件僅提供上移／下移按鈕，DOM 上不存在 draggable 屬性', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    const appx = screen.getByLabelText(/附錄/);
    await userEvent.type(appx, '作業流程');
    await userEvent.click(await screen.findByRole('option', { name: /作業流程對照表/ }));
    const chip = screen.getByText('作業流程對照表.xlsx').closest('[data-appendix-item], div') as HTMLElement;
    expect(chip.querySelector('[draggable="true"]')).toBeNull();
    expect(chip.hasAttribute('draggable')).toBe(false);
    expect(screen.getByRole('button', { name: '上移' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下移' })).toBeInTheDocument();
  });

  it('AC-22 送出前取消勾選 B → 本次送出之關聯清單為 A、C（不含 B），A 在 C 之前', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await fillRequired('101-1-13', '名');
    const appx = screen.getByLabelText(/附錄/);
    for (const kw of ['作業流程', '名詞定義', '共用名詞']) {
      await userEvent.type(appx, kw);
      await userEvent.click(await screen.findByRole('option', { name: new RegExp(kw) }));
    }
    // 取消勾選 B（名詞定義說明.pdf）：於已選清單移除該項。
    const bRow = screen.getByText('名詞定義說明.pdf').closest('div')!;
    await userEvent.click(within(bRow).getByRole('button', { name: /取消選取|移除/ }));
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() =>
      expect(endpoints.replaceDocumentAppendices).toHaveBeenCalledWith('new1', ['ax1', 'ax8']),
    );
  });

  it('未選任何附錄 → 允許為空，不呼叫 replaceDocumentAppendices', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());
    await fillRequired('101-1-14', '名');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() => expect(endpoints.createDocument).toHaveBeenCalled());
    expect(endpoints.replaceDocumentAppendices).not.toHaveBeenCalled();
  });
});
