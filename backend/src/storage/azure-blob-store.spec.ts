import { AzureBlobStore } from './azure-blob-store';

/**
 * AzureBlobStore 單元測試 —— 僅驗證「離線可驗證」之 SAS URL 核發邏輯（getDownloadUrl）。
 * SAS 產生屬本機 HMAC 簽章（不連線）故可於單元測試涵蓋；put/delete/exists/getBytes 需真實 Azure
 * 連線，改由 test/int/storage.itest.ts 針對 dev Blob 驗證（不隨單元套件執行）。
 *
 * 使用一組「格式正確但非正式環境」之連線字串（帳戶金鑰為 Azurite 眾所周知之開發金鑰，非機密），
 * 避免將正式帳戶金鑰寫入測試碼。
 */
const DEV_CONN =
  'DefaultEndpointsProtocol=https;AccountName=devstoreacct1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'EndpointSuffix=core.windows.net';
const CONTAINER = 'mid-signed-pdf';

/** 自 SAS URL 之 `se`（expiry）查詢參數取回 epoch 毫秒。 */
function expiryMsOf(url: string): number {
  const se = new URL(url).searchParams.get('se');
  expect(se).toBeTruthy();
  return Date.parse(se as string);
}

describe('AzureBlobStore.getDownloadUrl（SAS URL 核發）', () => {
  let store: AzureBlobStore;
  beforeEach(() => {
    store = new AzureBlobStore(DEV_CONN, CONTAINER);
  });

  it('核發 https、唯讀、含簽章之 SAS URL，指向正確容器/blob 路徑', async () => {
    const key = 'documents/doc-1/icsop_pdf/abc.pdf';
    const url = await store.getDownloadUrl(key, 300);

    expect(url.startsWith('https://')).toBe(true);
    // 主機＝<account>.blob.core.windows.net；路徑含容器 + key。
    expect(url).toContain('devstoreacct1.blob.core.windows.net');
    expect(url).toContain(`/${CONTAINER}/${key}`);
    // 簽章 + 到期 + 限 https 協定（spr=https）。
    const qs = new URL(url).searchParams;
    expect(qs.get('sig')).toBeTruthy();
    expect(qs.get('se')).toBeTruthy();
    expect(qs.get('spr')).toBe('https');
    // 唯讀權限（sp 僅含 r，不含 w/d/c）。
    expect(qs.get('sp')).toBe('r');
  });

  it('到期時間 ≈ now + ttlSeconds（依傳入 TTL）', async () => {
    const before = Date.now();
    const url = await store.getDownloadUrl('k/x.pdf', 300);
    const expiry = expiryMsOf(url);
    // SAS `se` 精度為秒；容忍 ±10s 時鐘/取整誤差。
    const expected = before + 300_000;
    expect(Math.abs(expiry - expected)).toBeLessThan(10_000);
  });

  it('較長 TTL 產生較晚之到期時間', async () => {
    const short = expiryMsOf(await store.getDownloadUrl('k/x.pdf', 60));
    const long = expiryMsOf(await store.getDownloadUrl('k/x.pdf', 3600));
    expect(long).toBeGreaterThan(short);
  });

  it('不同 key 產生指向不同 blob 路徑之 URL', async () => {
    const a = await store.getDownloadUrl('a/1.pdf', 300);
    const b = await store.getDownloadUrl('b/2.pdf', 300);
    expect(new URL(a).pathname).toContain('/a/1.pdf');
    expect(new URL(b).pathname).toContain('/b/2.pdf');
    expect(a).not.toBe(b);
  });
});
