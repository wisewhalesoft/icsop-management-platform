import { detectDataInconsistencyAlerts } from './data-inconsistency-detection';
import {
  ActiveAccountRef,
  DataInconsistencyDetectionInput,
} from './org-change-alert.types';

/**
 * F005「在職中但離職日已過」資料不一致告警 —— 純邏輯，無 IO、與儲存方案無關。
 *
 * 全量掃描同步後在職帳號；落差未被下次同步修正前恆為真（比照 closed-dept 之不變式檢查哲學）。
 * ⚠ 去重鍵＝帳號 loginId（不以 EMPNO 連坐）；不停用，僅告警。
 *
 * 🔄 v2.0（契約 §6）：在職判定改由 `RESIGN_DATE` 導出後，比較基準由**時間戳**改為**日期**。
 *    TS-INCON-005 之語意隨之改寫（見該案之註記）。
 */

const NOW = new Date('2026-07-24T02:00:00.000Z'); // 本次同步 createdAt
const PAST = new Date('2024-12-31T00:00:00.000Z'); // 過去之 RESIGN_DATE
const RUN = 'run-1';

function account(over: Partial<ActiveAccountRef> = {}): ActiveAccountRef {
  return {
    loginId: 'u1',
    employeeNo: 'E001',
    name: '王小明',
    orgCode: 'JAC00',
    status: 'active',
    resignDate: PAST,
    ...over,
  };
}

function input(
  over: Partial<DataInconsistencyDetectionInput> = {},
): DataInconsistencyDetectionInput {
  return {
    activeAccounts: [],
    existingPendingLoginIds: new Set(),
    createdAt: NOW,
    sourceSyncRunId: RUN,
    ...over,
  };
}

describe('detectDataInconsistencyAlerts', () => {
  it('TS-INCON-001 在職帳號之 resignDate 為過去日期 → 產生 DATA_INCONSISTENCY', () => {
    const out = detectDataInconsistencyAlerts(input({ activeAccounts: [account()] }));

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      alertKind: 'DATA_INCONSISTENCY',
      accountLoginId: 'u1',
      personEmployeeNo: 'E001',
      personName: '王小明',
      createdAt: NOW,
      sourceSyncRunId: RUN,
    });
    // 帳號層事件不綁文件、不涉部門。
    expect(out[0].documentId).toBeNull();
    expect(out[0].affectedField).toBeNull();
    expect(out[0].deptOrgCode).toBeNull();
    expect(out[0].deptName).toBeNull();
    expect(out[0].deptCloseDate).toBeNull();
  });

  it('TS-INCON-002 beforeValue/afterValue 內容正確（含已過之離職日）', () => {
    const out = detectDataInconsistencyAlerts(input({ activeAccounts: [account()] }));

    expect(out[0].beforeValue).toMatch(/在職/);
    expect(out[0].afterValue).toContain('2024-12-31');
    expect(out[0].afterValue).toMatch(/已過期|不符/);
    // v2.0：不得再出現已停用來源之欄名（契約 §3.7）。
    expect(out[0].beforeValue).not.toMatch(/EMPSTS/);
    expect(out[0].afterValue).not.toMatch(/RESIGNDT/);
  });

  it('TS-INCON-003 resignDate=null（哨兵已由 normalization 收斂）→ 不產生', () => {
    const out = detectDataInconsistencyAlerts(
      input({ activeAccounts: [account({ resignDate: null })] }),
    );

    expect(out).toEqual([]);
  });

  it('TS-INCON-004 resignDate 等於 createdAt（同一時刻）→ 不視為過去，不產生（邊界）', () => {
    const out = detectDataInconsistencyAlerts(
      input({ activeAccounts: [account({ resignDate: new Date(NOW.getTime()) })] }),
    );

    expect(out).toEqual([]);
  });

  it('🔴 TS-INCON-005（v2.0 改寫）resignDate 早於 createdAt 一毫秒但仍為同一日 → 不產生', () => {
    // v1.0 此案期望「產生」（比時間戳）。v2.0 起 status 由 RESIGN_DATE 導出（契約 §6），
    // 而 RESIGN_DATE 為日期（00:00:00）、同步於當日稍晚執行 ⇒ 沿用時間戳比較會使
    // **每位「最後在職日為今天」的在職者都被誤報**。故改以日期比較。
    const out = detectDataInconsistencyAlerts(
      input({ activeAccounts: [account({ resignDate: new Date(NOW.getTime() - 1) })] }),
    );

    expect(out).toEqual([]);
  });

  it('🔴 TS-INCON-005b 最後在職日＝同步當日零時 → 不產生（每日離職者不得誤報）', () => {
    // 迴歸鎖定：NOW 為 02:00，離職日為當日 00:00——正是實務上最常見的形狀。
    const sameDayMidnight = new Date('2026-07-24T00:00:00.000Z');
    const out = detectDataInconsistencyAlerts(
      input({ activeAccounts: [account({ resignDate: sameDayMidnight })] }),
    );

    expect(out).toEqual([]);
  });

  it('TS-INCON-005c resignDate 為前一日 → 產生（跨日方為落差）', () => {
    const prevDay = new Date('2026-07-23T23:59:59.999Z');
    const out = detectDataInconsistencyAlerts(
      input({ activeAccounts: [account({ resignDate: prevDay })] }),
    );

    expect(out).toHaveLength(1);
  });

  it('TS-INCON-006 status=disabled 帳號 → 不產生（縱深防禦）', () => {
    const out = detectDataInconsistencyAlerts(
      input({ activeAccounts: [account({ status: 'disabled' })] }),
    );

    expect(out).toEqual([]);
  });

  it('TS-INCON-007 既有 pending 同 accountLoginId → 不重複產生（去重）', () => {
    const out = detectDataInconsistencyAlerts(
      input({
        activeAccounts: [account()],
        existingPendingLoginIds: new Set(['u1']),
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-INCON-008 既有同鍵已 resolved（不在 pending 集合）→ 允許再次產生', () => {
    const out = detectDataInconsistencyAlerts(
      input({
        activeAccounts: [account()],
        existingPendingLoginIds: new Set(),
      }),
    );

    expect(out).toHaveLength(1);
  });

  it('TS-INCON-009 連續兩次同步、情境未變 → 第一次產生、第二次因既有 pending 不重複建立', () => {
    const scan = input({ activeAccounts: [account()] });

    const first = detectDataInconsistencyAlerts(scan);
    expect(first).toHaveLength(1);

    const second = detectDataInconsistencyAlerts({
      ...scan,
      existingPendingLoginIds: new Set(['u1']),
    });
    expect(second).toEqual([]);
  });

  it('TS-INCON-010 多名帳號同時符合 → 各自獨立產生多筆', () => {
    const out = detectDataInconsistencyAlerts(
      input({
        activeAccounts: [
          account({ loginId: 'u1', employeeNo: 'E001' }),
          account({ loginId: 'u2', employeeNo: 'E002' }),
          account({ loginId: 'u3', employeeNo: 'E003' }),
        ],
      }),
    );

    expect(out.map((a) => a.accountLoginId)).toEqual(['u1', 'u2', 'u3']);
  });

  it('TS-INCON-011 employeeNo=null（資料缺漏）→ 仍正常產生，personEmployeeNo=null', () => {
    const out = detectDataInconsistencyAlerts(
      input({ activeAccounts: [account({ employeeNo: null })] }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].personEmployeeNo).toBeNull();
    expect(out[0].accountLoginId).toBe('u1');
  });

  it('TS-INCON-013 已 resolved 但底層 resignDate 未變 → 下次全量掃描再次產生（刻意行為）', () => {
    const out = detectDataInconsistencyAlerts(
      input({
        activeAccounts: [account()],
        existingPendingLoginIds: new Set(), // 已被人工 resolved，但 resignDate 欄位本身未變
      }),
    );

    expect(out).toHaveLength(1);
  });
});
