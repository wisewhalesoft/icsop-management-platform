import { AuditWriterRecorder } from './audit-writer-recorder.adapter';
import { AuditAccessEvent } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';

/** 擷取 recordAccess 之參數的最小假 AuditWriter（不接觸 Outbox/Store）。 */
class FakeAuditWriter {
  calls: AuditAccessEvent[] = [];
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.calls.push(event);
    return Promise.resolve();
  }
}

describe('AuditWriterRecorder（使用表單稽核 → 真實 AuditWriter 轉接）', () => {
  let writer: FakeAuditWriter;
  let recorder: AuditWriterRecorder;
  beforeEach(() => {
    writer = new FakeAuditWriter();
    recorder = new AuditWriterRecorder(writer as unknown as AuditWriterService);
  });

  it('將 USAGE_FORM DOWNLOAD 事件對映為 AuditAccessEvent（targetId=formId、actorId=accountId）', async () => {
    await recorder.record({
      targetType: 'USAGE_FORM',
      actionType: 'DOWNLOAD',
      formId: 'form-42',
      documentId: 'doc-7',
      accountId: 'acct-9',
    });

    expect(writer.calls).toHaveLength(1);
    const ev = writer.calls[0];
    expect(ev.targetType).toBe('USAGE_FORM');
    expect(ev.actionType).toBe('DOWNLOAD');
    expect(ev.targetId).toBe('form-42');
    expect(ev.actorId).toBe('acct-9');
    expect(ev.occurredAt).toBeInstanceOf(Date);
  });

  it('轉發 recordAccess 之 rejection（呼叫端 UsageFormsService 決定是否吞例外）', async () => {
    writer.recordAccess = () => Promise.reject(new Error('outbox down'));
    await expect(
      recorder.record({
        targetType: 'USAGE_FORM',
        actionType: 'DOWNLOAD',
        formId: 'f1',
        documentId: 'd1',
        accountId: 'a1',
      }),
    ).rejects.toThrow('outbox down');
  });

  /**
   * 🔴🔴 architecture-spec.md §11.6／§11.11 #20（本輪最擔心之三條之一，lead 明文點名）：本檔原始碼
   * 註解自陳「此 seam 未持有更豐富之身分/對象快照，其餘欄留空由 AuditWriter 補 null」——即現況
   * `record()` 完全未轉送 `employeeNo`／`company`／`department`／`section`／`roleCode`／
   * `watermarkSnapshot` 六個欄位。既有測試（本檔前兩案）以替身 `AuditWriter` 直接回顯呼叫參數，
   * 從未經過 adapter 本身的轉送邏輯，故此缺口在既有測試層完全不可見（同型缺口見
   * `appendices/audit-writer-recorder.adapter.spec.ts` 之對應測試）。
   *
   * 🔴 本缺口是滿足 `AC-N17`／`AC-N51`（後台燒錄下載）與既有已核准 `AC-D14`（F018 前台使用表單
   * 下載）之必要前提。
   */
  it('🔴 §11.6／§11.11#20 六個身分/快照欄位必須完整轉送予 AuditWriterService.recordAccess()（既有缺口修正）', async () => {
    await recorder.record({
      targetType: 'USAGE_FORM',
      actionType: 'DOWNLOAD',
      formId: 'form-42',
      documentId: 'doc-7',
      accountId: 'acct-9',
      employeeNo: 'E001',
      company: '和潤企業股份有限公司',
      department: '營運管理部',
      section: '審查室',
      roleCode: 'DeptContact',
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
    expect(ev.roleCode).toBe('DeptContact');
    expect(ev.watermarkSnapshot).toBe(
      'E001-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-08-20 10:00:00 (UTC+8)',
    );
  });

  it('watermarkSnapshot 為 null（非 PDF 下載）之情形亦須逐字轉送 null（非被丟棄為 undefined）', async () => {
    await recorder.record({
      targetType: 'USAGE_FORM',
      actionType: 'DOWNLOAD',
      formId: 'f1',
      documentId: 'd1',
      accountId: 'a1',
      watermarkSnapshot: null,
    } as never);

    expect(writer.calls[0].watermarkSnapshot).toBeNull();
  });
});
