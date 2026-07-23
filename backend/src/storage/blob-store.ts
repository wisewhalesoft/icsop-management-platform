/**
 * Blob 儲存抽象（E04/E05/E09 檔案通道）。全站唯一之檔案存取邊界，供附件（F016）、
 * 使用表單（F018）、.xls 原件（F027）共用。真實實作以 Azure Blob 私有容器 + 短效期 SAS Token
 * 落地（[integration]）；unit 測試以 FakeBlobStore 記憶體假體驅動。
 *
 * 介面契約（storage worktree 定案，OQ-F016-02 收斂）：
 *   - put(key, buffer, contentType)：以指定 key 寫入（覆寫式，key 唯一由呼叫端決定）。
 *   - delete(key)：刪除（覆蓋舊檔時回收孤兒 blob）。
 *   - exists(key)：是否存在。
 *   - getDownloadUrl(key, ttlSeconds)：核發短效期下載 URL（SAS Token），TTL 秒數由呼叫端指定。
 * 呼叫端負責產生穩定且不可猜測之 key（見 attachments/usage-form 之 buildBlobPath）。
 */
export const BLOB_STORE = Symbol('BLOB_STORE');

export interface BlobStore {
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  /**
   * 讀取 blob 位元組（後端代理／伺服器端浮水印燒錄之來源，F020）。查無 → null。
   * ICSOP_PDF 走代理模式（架構 §5.2，不核發 SAS）故需伺服器端讀取原始位元組。
   */
  getBytes(key: string): Promise<Buffer | null>;
}

/**
 * 下載憑證預設 TTL（秒）。NFR-002「短效期憑證」未給定具體秒數（見 OQ-F016-05），
 * 此處採 5 分鐘作為保守預設；可經 env `DOWNLOAD_URL_TTL_SECONDS` 覆寫（正式數值待 architect 定案）。
 */
export const DOWNLOAD_URL_TTL_SECONDS =
  Number(process.env.DOWNLOAD_URL_TTL_SECONDS) || 300;
