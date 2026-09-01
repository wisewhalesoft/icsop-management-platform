import { AuditWriterRecorder } from './audit-writer-recorder.adapter';
import { AuditAccessEvent } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';

/**
 * F039 附錄稽核 → 真實 AuditWriter 轉接（architecture-spec.md §3.6 決策三）。
 *
 * ⚠ 高風險點 #2（architect 點名）：既有 usage-forms/audit-writer-recorder.adapter.ts 之
 * USAGE_FORM 分支**未轉送 documentId**（既有落差，`AUDIT_LOG.documentId` 對 USAGE_FORM 列恆
 * null——見 usage-forms 模組已知缺口，非本次任務範圍）。AC-27 明確要求附錄稽核列同時落地
 * `appendixId` **與** `documentId`；決策三要求 appendices/ 的轉接器（獨立複製，非共用
 * usage-forms 內部檔案）**正確轉送兩者**——此為本檔存在的核心理由，不得沿用 USAGE_FORM
 * 分支之「單一 targetId」轉送模式。
 */

class FakeAuditWriter {
  calls: AuditAccessEvent[] = [];
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.calls.push(event);
    return Promise.resolve();
  }
}

describe('AuditWriterRecorder（附錄稽核 → 真實 AuditWriter 轉接，F039）', () => {
  let writer: FakeAuditWriter;
  let recorder: AuditWriterRecorder;
  beforeEach(() => {
    writer = new FakeAuditWriter();
    recorder = new AuditWriterRecorder(writer as unknown as AuditWriterService);
  });

  it('將 APPENDIX DOWNLOAD 事件對映為 AuditAccessEvent：targetId=appendixId 且 documentId 亦轉送（AC-27）', async () => {
    await recorder.record({
      targetType: 'APPENDIX',
      actionType: 'DOWNLOAD',
      appendixId: 'ax-42',
      documentId: 'doc-7',
      accountId: 'acct-9',
    });

    expect(writer.calls).toHaveLength(1);
    const ev = writer.calls[0] as AuditAccessEvent & { documentId?: string };
    expect(ev.targetType).toBe('APPENDIX');
    expect(ev.actionType).toBe('DOWNLOAD');
    expect(ev.targetId).toBe('ax-42');
    expect(ev.actorId).toBe('acct-9');
    // AC-27 之核心斷言：documentId 必須被轉送（不同於 usage-forms 既有落差）。
    expect(ev.documentId).toBe('doc-7');
    expect(ev.occurredAt).toBeInstanceOf(Date);
  });

  it('轉發 recordAccess 之 rejection（呼叫端 AppendicesService 決定是否吞例外，比照 Outbox 非阻斷語意）', async () => {
    writer.recordAccess = () => Promise.reject(new Error('outbox down'));
    await expect(
      recorder.record({
        targetType: 'APPENDIX',
        actionType: 'DOWNLOAD',
        appendixId: 'ax-1',
        documentId: 'doc-1',
        accountId: 'a1',
      }),
    ).rejects.toThrow('outbox down');
  });

  /**
   * 🔴🔴 architecture-spec.md §11.6／§11.11 #20（本輪最擔心之三條之一，lead 明文點名）：
   * `AuditWriterRecorder` 之 `record()` **已查證完全未轉送** `employeeNo`／`company`／`department`／
   * `section`／`roleCode`／`watermarkSnapshot` 六個欄位予 `AuditWriterService.recordAccess()`——
   * 即便呼叫端 `AppendicesService.downloadAppendix()` 已正確組出 `watermarkSnapshot: burned.snapshot`
   * 傳入 `this.audit.record({...})`，adapter 在轉送前把它丟棄了。
   *
   * 🔴 **原理上測不到之原因**：既有測試（本檔前兩案）以**替身** `AuditWriter`（`FakeAuditWriter`）
   * 直接回顯呼叫參數，驗證的是「服務層有沒有算對」，從未經過 adapter 本身的轉送邏輯——本測試
   * 是本檔**第一次**以「輸入含六個身分欄＋`watermarkSnapshot` 的完整 `AppendixAuditEvent`」驅動
   * `record()`，並斷言傳給 `writer.recordAccess()` 的**完整參數物件**（而非僅 spy 呼叫次數），才是
   * 真正驗證了轉送邏輯本身。
   *
   * 🔴 本缺口是滿足 `AC-N17`／`AC-N51`（後台燒錄下載寫入正確之身分快照與 `watermarkSnapshot`）之
   * 必要前提，亦已違反既有已核准之 `AC-D5`（F039 前台附錄下載）——本條同時是兩者之回歸鎖定。
   */
  it('🔴 §11.6／§11.11#20 六個身分/快照欄位必須完整轉送予 AuditWriterService.recordAccess()（既有缺口修正）', async () => {
    await recorder.record({
      targetType: 'APPENDIX',
      actionType: 'DOWNLOAD',
      appendixId: 'ax-42',
      documentId: 'doc-7',
      accountId: 'acct-9',
      employeeNo: 'E001',
      company: '和潤企業股份有限公司',
      department: '營運管理部',
      section: '審查室',
      roleCode: 'Supervisor',
      watermarkSnapshot: 'E001-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-08-20 10:00:00 (UTC+8)',
    } as never);

    expect(writer.calls).toHaveLength(1);
    const ev = writer.calls[0] as AuditAccessEvent & {
      employeeNo?: string;
      company?: string;
      department?: string;
      section?: string;
      roleCode?: string;
    };
    expect(ev.employeeNo).toBe('E001');
    expect(ev.company).toBe('和潤企業股份有限公司');
    expect(ev.department).toBe('營運管理部');
    expect(ev.section).toBe('審查室');
    expect(ev.roleCode).toBe('Supervisor');
    expect(ev.watermarkSnapshot).toBe(
      'E001-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-08-20 10:00:00 (UTC+8)',
    );
  });

  it('watermarkSnapshot 為 null（非 PDF 下載）之情形亦須逐字轉送 null（非被丟棄為 undefined）', async () => {
    await recorder.record({
      targetType: 'APPENDIX',
      actionType: 'DOWNLOAD',
      appendixId: 'ax-1',
      documentId: 'doc-1',
      accountId: 'a1',
      watermarkSnapshot: null,
    } as never);

    expect(writer.calls[0].watermarkSnapshot).toBeNull();
  });
  /**
   * 🔴 2026-09-01 delta：**第七欄——姓名**。
   *
   * 上一個案例的標題寫著「六個身分/快照欄位必須完整轉送」，而它列舉的六欄裡**沒有姓名**——
   * `AUDIT_LOG.name` 於本路徑因此恆為 null（dev 實測 9／9，100%），F024 調閱歷程之
   * 「操作人員」欄整欄空白，偏偏員編／公司／部門／處室都有值。
   *
   * 這是 2026-08-21 修補時「照著清單補、清單本身漏了一項」的形狀：既有測試逐字驗證了那份
   * 清單，於是清單的漏項同時也是測試的漏項。本案例把姓名釘進同一道環。
   */
  it('🔴 操作人員姓名（actorName）必須轉送——2026-08-21 之「六欄」清單漏列之第七欄', async () => {
    await recorder.record({
      targetType: 'APPENDIX',
      actionType: 'DOWNLOAD',
      appendixId: 'apx-1',
      documentId: 'doc-7',
      accountId: 'acct-9',
      actorName: '王小明',
    } as never);

    expect(writer.calls).toHaveLength(1);
    // 正向半句先確立載體存在，避免恆真之否定斷言：
    expect(writer.calls[0].actorName).toBe('王小明');
    expect(writer.calls[0].actorName).not.toBeNull();
  });
});
