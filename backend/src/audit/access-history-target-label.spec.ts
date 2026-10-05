import {
  AccessHistoryTargetLookup,
  EMPTY_LOOKUP,
  TargetLookupRequest,
  TargetLookupResult,
  labelWithLookup,
  targetLabelOf,
  targetLookupRequest,
  targetNameOf,
} from './access-history-target-label';
import { AuditRow } from './audit.types';

/**
 * 🔴 2026-10-05 調閱歷程「對象空白」delta（H）：對象欄顯示值之取值規則。
 *
 * 語料逐列對照正式站實測之空白形狀（2026-10-05 GROUP BY targetType, actionType）：
 *  - DOCUMENT／DOWNLOAD：documentId 有、documentNumber 與 targetName 皆 null（後台附件下載）；
 *  - APPENDIX：documentId 時有時無、三個快照欄皆 null；
 *  - USAGE_FORM：formId 有、targetName null（舊行為顯示裸 formId）；
 *  - BUSINESS_CATEGORY_DOC_MOUNTED：documentId＋businessCategoryId 有、其餘快照皆 null；
 *  - BUSINESS_CATEGORY_VIEW：targetName 有（類別名稱）、documentNumber null；
 *  - ACCOUNT：targetAccountId 有、targetName＝「舊角色 → 新角色」（事件說明，非對象）；
 *  - ORG_CHANGE_ALERT（舊列）：除 targetName 外皆 null，且提示 id 從未落地 ⇒ 無從回查。
 */

function row(over: Partial<AuditRow>): AuditRow {
  return {
    id: 'r1',
    accountId: 'a1',
    employeeNo: null,
    name: null,
    company: null,
    department: null,
    section: null,
    roleCode: null,
    targetType: 'DOCUMENT',
    actionType: 'DOWNLOAD',
    documentId: null,
    documentNumber: null,
    lifecycleId: null,
    lifecycleName: null,
    formId: null,
    appendixId: null,
    targetAccountId: null,
    businessCategoryId: null,
    nodeId: null,
    targetName: null,
    watermarkSnapshot: null,
    occurredAt: new Date('2026-10-05T01:00:00Z'),
    source: 'DIRECT',
    ...over,
  };
}

const LOOKUP: TargetLookupResult = {
  documents: new Map([['d1', { documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }]]),
  appendices: new Map([['ax1', '名詞定義說明.pdf']]),
  usageForms: new Map([['f1', '進件申請書.xlsx']]),
  businessCategories: new Map([['bc1', '授信（消金）']]),
  accounts: new Map([['acc-9', { name: '陳主管', loginId: '20781' }]]),
};

describe('targetLabelOf — 對象欄顯示值', () => {
  it('🔒 快照優先：documentNumber 有值 ⇒ 原樣（不被回查之現值覆寫）', () => {
    const r = row({ documentId: 'd1', documentNumber: 'ICSOP-OLD-NUMBER' });
    expect(targetLabelOf(r, LOOKUP)).toBe('ICSOP-OLD-NUMBER');
  });

  it('🔒 循環列 ⇒ lifecycleName（既有行為不變）', () => {
    const r = row({ targetType: 'LIFECYCLE', lifecycleId: 'lc1', lifecycleName: '銷售及收款循環' });
    expect(targetLabelOf(r, LOOKUP)).toBe('銷售及收款循環');
  });

  it('A：後台附件下載（只有 documentId）⇒ 以 documentId 回查之文件編號', () => {
    const r = row({ documentId: 'd1' });
    expect(targetLabelOf(r, LOOKUP)).toBe('ICSOP-SRC-101-1-01');
  });

  it('B：附錄於文件脈絡下載 ⇒ 文件編號；池管理頁（無文件）⇒ 附錄名稱', () => {
    expect(targetLabelOf(row({ targetType: 'APPENDIX', appendixId: 'ax1', documentId: 'd1' }), LOOKUP)).toBe(
      'ICSOP-SRC-101-1-01',
    );
    expect(targetLabelOf(row({ targetType: 'APPENDIX', appendixId: 'ax1' }), LOOKUP)).toBe('名詞定義說明.pdf');
  });

  it('C：使用表單於池管理頁下載 ⇒ 表單名稱（不再是裸 formId）', () => {
    const r = row({ targetType: 'USAGE_FORM', formId: 'f1' });
    expect(targetLabelOf(r, LOOKUP)).toBe('進件申請書.xlsx');
  });

  it('C：表單已被刪除（查無）⇒ 退回 formId（舊行為之保留，不讓既有可見值消失）', () => {
    const r = row({ targetType: 'USAGE_FORM', formId: 'f-gone' });
    expect(targetLabelOf(r, LOOKUP)).toBe('f-gone');
  });

  it('E：業務/功能類別檢視（targetName＝類別名稱）⇒ 類別名稱', () => {
    const r = row({
      targetType: 'BUSINESS_CATEGORY',
      actionType: 'BUSINESS_CATEGORY_VIEW',
      businessCategoryId: 'bc1',
      targetName: '授信（消金）',
    });
    expect(targetLabelOf(r, EMPTY_LOOKUP)).toBe('授信（消金）');
  });

  it('F：舊掛載列（只有 id）⇒ 被掛載文件之編號', () => {
    const r = row({
      targetType: 'BUSINESS_CATEGORY',
      actionType: 'BUSINESS_CATEGORY_DOC_MOUNTED',
      businessCategoryId: 'bc1',
      documentId: 'd1',
    });
    expect(targetLabelOf(r, LOOKUP)).toBe('ICSOP-SRC-101-1-01');
  });

  it('角色異動 ⇒ 被異動之帳號（姓名＋登入帳號），**不**拿 targetName（「舊角色 → 新角色」是事件說明）', () => {
    const r = row({
      targetType: 'ACCOUNT',
      actionType: 'ROLE_ASSIGNED',
      targetAccountId: 'acc-9',
      targetName: 'User → Supervisor',
    });
    expect(targetLabelOf(r, LOOKUP)).toBe('陳主管（20781）');
  });

  it('D：組織異動提示（新列）⇒ documentNumber；舊列無從回查 ⇒ null，**不**拿受影響欄位說明充數', () => {
    expect(
      targetLabelOf(
        row({ targetType: 'ORG_CHANGE_ALERT', actionType: 'ALERT_RESOLVED', documentNumber: 'ICSOP-X' }),
        LOOKUP,
      ),
    ).toBe('ICSOP-X');
    expect(
      targetLabelOf(
        row({ targetType: 'ORG_CHANGE_ALERT', actionType: 'ALERT_RESOLVED', targetName: '制定部門' }),
        LOOKUP,
      ),
    ).toBeNull();
  });

  it('匯出事件（無對象）⇒ null', () => {
    const r = row({ targetType: 'ACCESS_HISTORY', actionType: 'ACCESS_HISTORY_EXPORT' });
    expect(targetLabelOf(r, LOOKUP)).toBeNull();
  });
});

describe('targetNameOf — 對象名稱／說明之補位', () => {
  it('快照有值 ⇒ 原樣', () => {
    expect(targetNameOf(row({ documentId: 'd1', targetName: '舊名稱' }), LOOKUP)).toBe('舊名稱');
  });

  it('缺漏 ⇒ 依對象類型回查（文件名稱／附錄名稱／表單名稱／類別名稱）', () => {
    expect(targetNameOf(row({ documentId: 'd1' }), LOOKUP)).toBe('車輛分期進件作業');
    expect(targetNameOf(row({ targetType: 'APPENDIX', appendixId: 'ax1', documentId: 'd1' }), LOOKUP)).toBe(
      '名詞定義說明.pdf',
    );
    expect(targetNameOf(row({ targetType: 'USAGE_FORM', formId: 'f1' }), LOOKUP)).toBe('進件申請書.xlsx');
    expect(
      targetNameOf(
        row({ targetType: 'BUSINESS_CATEGORY', actionType: 'BUSINESS_CATEGORY_DOC_MOUNTED', businessCategoryId: 'bc1', documentId: 'd1' }),
        LOOKUP,
      ),
    ).toBe('授信（消金）');
  });
});

describe('targetLookupRequest — 只回查需要的 id', () => {
  it('快照齊全之列不產生任何回查', () => {
    const req = targetLookupRequest([
      row({ documentId: 'd1', documentNumber: 'X', targetName: 'Y' }),
      row({ targetType: 'LIFECYCLE', lifecycleId: 'lc1', lifecycleName: 'L', targetName: 'L' }),
    ]);
    expect(req).toEqual({
      documentIds: [],
      appendixIds: [],
      usageFormIds: [],
      businessCategoryIds: [],
      accountIds: [],
    });
  });

  it('缺漏者依類型收集且去重', () => {
    const req = targetLookupRequest([
      row({ documentId: 'd1' }),
      row({ documentId: 'd1' }),
      row({ targetType: 'APPENDIX', appendixId: 'ax1' }),
      row({ targetType: 'USAGE_FORM', formId: 'f1' }),
      row({ targetType: 'BUSINESS_CATEGORY', businessCategoryId: 'bc1', documentId: 'd2' }),
      row({ targetType: 'ACCOUNT', actionType: 'ROLE_ASSIGNED', targetAccountId: 'acc-9', targetName: 'x' }),
    ]);
    expect(req.documentIds.sort()).toEqual(['d1', 'd2']);
    expect(req.appendixIds).toEqual(['ax1']);
    expect(req.usageFormIds).toEqual(['f1']);
    expect(req.businessCategoryIds).toEqual(['bc1']);
    expect(req.accountIds).toEqual(['acc-9']);
  });
});

describe('labelWithLookup — 回查失敗不使整頁失敗', () => {
  it('lookup 拋錯 ⇒ 仍回傳每一列（僅以快照計算），並回報錯誤', async () => {
    const errors: unknown[] = [];
    const failing: AccessHistoryTargetLookup = {
      lookup: (_req: TargetLookupRequest) => Promise.reject(new Error('DB_DOWN')),
    };
    const out = await labelWithLookup(
      [row({ documentId: 'd1' }), row({ documentId: 'd1', documentNumber: 'SNAP' })],
      failing,
      (e) => errors.push(e),
    );
    expect(out.map((r) => r.targetLabel)).toEqual([null, 'SNAP']);
    expect(errors).toHaveLength(1);
  });

  it('0 列 ⇒ 不呼叫 lookup', async () => {
    let called = 0;
    const lookup: AccessHistoryTargetLookup = {
      lookup: () => {
        called += 1;
        return Promise.resolve(EMPTY_LOOKUP);
      },
    };
    expect(await labelWithLookup([], lookup)).toEqual([]);
    expect(called).toBe(0);
  });
});
