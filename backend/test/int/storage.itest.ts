import { randomUUID } from 'crypto';
import { bootIntApp, shutdownIntApp, IntCtx } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { BLOB_STORE, BlobStore } from '../../src/storage/blob-store';
import { AuditWriterService } from '../../src/audit/audit-writer.service';
import { AuditWriterRecorder } from '../../src/usage-forms/audit-writer-recorder.adapter';

/**
 * [int] 真實 Blob（dev Azure 容器）＋ 使用表單下載稽核落地（F016 / F018 → F023）。
 *
 * ⚠ 不隨單元套件執行；由 orchestrator 於合併後序列跑（SOP DB / dev Blob 與其他 track 共用）。
 *   執行：`npm run test:int`（需 host 能連 SOP + Azure Blob）。
 *
 * 全部測試資產以 marker 標記：
 *   - Blob key 前綴 `zzint/`（afterAll 精準刪除；delete 冪等）。
 *   - AUDIT_LOG 為 append-only（DB 觸發器阻擋 DELETE），故稽核列以隨機 GUID 之 formId/accountId 標記、
 *     不清除（保留無害；harness cleanupMarkers 不觸及 AUDIT_LOG）。
 */
describe('[int] storage — 真實 Blob roundtrip + 使用表單下載稽核 vs SOP/Azure', () => {
  let ctx: IntCtx;
  let blob: BlobStore;
  const markerKey = `zzint/marker-${randomUUID()}.txt`;

  beforeAll(async () => {
    ctx = await bootIntApp();
    blob = ctx.app.get<BlobStore>(BLOB_STORE);
  }, 60000);

  afterAll(async () => {
    // Blob marker 回收（冪等；即便測試中途失敗亦嘗試清除）。
    await blob?.delete(markerKey).catch(() => undefined);
    await shutdownIntApp(ctx);
  });

  it('put → exists → getDownloadUrl → delete（真實 dev Blob 生命週期）', async () => {
    const payload = Buffer.from('zzint blob marker payload', 'utf8');

    await blob.put(markerKey, payload, 'text/plain');
    expect(await blob.exists(markerKey)).toBe(true);

    const url = await blob.getDownloadUrl(markerKey, 300);
    expect(typeof url).toBe('string');
    expect(url).toContain(markerKey); // SAS URL（AzureBlobStore）或 fake URL 皆含 key

    await blob.delete(markerKey);
    expect(await blob.exists(markerKey)).toBe(false);
  });

  it('使用表單下載事件 → AUDIT_LOG 落地一列（USAGE_FORM/DOWNLOAD，經 Outbox 補償）', async () => {
    // UsageFormsService.downloadForm 於下載成功後即以此參數呼叫 AuditWriterRecorder.record；
    // 此處直接驅動同一 recorder → 真實 AuditWriterService → Outbox → AUDIT_LOG，驗證整合接線。
    const writer = ctx.app.get(AuditWriterService);
    const recorder = new AuditWriterRecorder(writer);

    const formId = randomUUID();
    const accountId = randomUUID();
    await recorder.record({
      targetType: 'USAGE_FORM',
      actionType: 'DOWNLOAD',
      formId,
      documentId: randomUUID(),
      accountId,
    });

    // recordAccess 經 Outbox 非阻斷入列；補償重試搬遷 pending → AUDIT_LOG（平時由 @Cron 掃描）。
    await writer.processOutboxRetry();

    // 直查 AUDIT_LOG（依 formId；append-only，本列殘留屬既知）驗證整合接線落地。
    const rows: Array<{ targetType: string; actionType: string; accountId: string }> =
      await AppDataSource.query(
        `SELECT [targetType], [actionType], [accountId] FROM [AUDIT_LOG] WHERE [formId] = '${formId}'`,
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].targetType).toBe('USAGE_FORM');
    expect(rows[0].actionType).toBe('DOWNLOAD');
    expect(rows[0].accountId.toUpperCase()).toBe(accountId.toUpperCase());
  });
});
