import { BlobStore } from './blob-store';

interface FakeBlob {
  content: Buffer;
  contentType: string;
  size: number;
}

/**
 * 記憶體 BlobStore 假體（unit 測試用；亦可作本機 dev fallback）。
 * 記錄 put/delete/getDownloadUrl 之呼叫參數供斷言（呼叫次數、key、TTL）。
 * 不接觸任何真實 Azure；[integration] 層之私有 ACL/SAS 到期由真實實作驗證。
 */
export class FakeBlobStore implements BlobStore {
  readonly blobs = new Map<string, FakeBlob>();
  readonly putCalls: { key: string; contentType: string; size: number }[] = [];
  readonly deleteCalls: string[] = [];
  readonly urlCalls: { key: string; ttlSeconds: number }[] = [];

  put(key: string, buffer: Buffer, contentType: string): Promise<void> {
    this.putCalls.push({ key, contentType, size: buffer.length });
    this.blobs.set(key, { content: buffer, contentType, size: buffer.length });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.deleteCalls.push(key);
    this.blobs.delete(key);
    return Promise.resolve();
  }

  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.blobs.has(key));
  }

  getDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    this.urlCalls.push({ key, ttlSeconds });
    return Promise.resolve(`https://fake.blob/${key}?sig=fake&ttl=${ttlSeconds}`);
  }

  getBytes(key: string): Promise<Buffer | null> {
    const b = this.blobs.get(key);
    return Promise.resolve(b ? b.content : null);
  }
}
