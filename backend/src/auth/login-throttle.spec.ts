import {
  LoginThrottleService,
  LOGIN_THROTTLE_WINDOW_MS,
} from './login-throttle';

/**
 * 帳密登入節流純邏輯（F001 途徑 B／OQ-F001-B-04）。對應 hardening-test-design.md §2.5
 * TS-HD-THR-001〜009。比照 account-resolver.spec / session-token.service.spec 之純類別風格：
 * 注入假時鐘 `now: () => number`，不需真實計時器／jest.useFakeTimers。
 *
 * 固定時窗（fixed window）：{count, windowStart}，視窗過期後整批重置。
 * 雙軸（IP／loginId）以具名 key namespace 共用同一計數器、各帶自身門檻。
 */
describe('LoginThrottleService（固定時窗記憶體計數器）', () => {
  function make(start = 0): { svc: LoginThrottleService; tick: (ms: number) => void } {
    let now = start;
    const svc = new LoginThrottleService(() => now);
    return { svc, tick: (ms: number): void => void (now += ms) };
  }

  it('TS-HD-THR-001 全新 key 首次檢查 → 未封鎖', () => {
    const { svc } = make();
    expect(svc.isBlocked('login:AS:mgr01', 5)).toBe(false);
  });

  it('TS-HD-THR-002 失敗次數低於門檻（4<5）→ 仍未封鎖', () => {
    const { svc } = make();
    for (let i = 0; i < 4; i++) svc.recordFailure('k', 5);
    expect(svc.isBlocked('k', 5)).toBe(false);
  });

  it('TS-HD-THR-003 失敗次數達門檻（5>=5）→ 封鎖', () => {
    const { svc } = make();
    for (let i = 0; i < 5; i++) svc.recordFailure('k', 5);
    expect(svc.isBlocked('k', 5)).toBe(true);
  });

  it('TS-HD-THR-004（防禦性）已封鎖後繼續 recordFailure → 仍封鎖、不拋例外、狀態不異常', () => {
    const { svc } = make();
    for (let i = 0; i < 5; i++) svc.recordFailure('k', 5);
    expect(() => {
      for (let i = 0; i < 3; i++) svc.recordFailure('k', 5);
    }).not.toThrow();
    expect(svc.isBlocked('k', 5)).toBe(true);
  });

  it('TS-HD-THR-005 視窗過期（恰好等於視窗長度，邊界含）後 → 自動解除封鎖', () => {
    const { svc, tick } = make();
    for (let i = 0; i < 5; i++) svc.recordFailure('k', 5);
    expect(svc.isBlocked('k', 5)).toBe(true);
    tick(LOGIN_THROTTLE_WINDOW_MS); // 恰好等於視窗長度視為已過期
    expect(svc.isBlocked('k', 5)).toBe(false);
  });

  it('TS-HD-THR-006 視窗過期後之首次失敗 → 視為新視窗起點（不延續舊計數）', () => {
    const { svc, tick } = make();
    for (let i = 0; i < 5; i++) svc.recordFailure('k', 5);
    tick(LOGIN_THROTTLE_WINDOW_MS); // 過期
    svc.recordFailure('k', 5); // 新視窗計數＝1
    expect(svc.isBlocked('k', 5)).toBe(false);
    for (let i = 0; i < 3; i++) svc.recordFailure('k', 5); // 計數＝4
    expect(svc.isBlocked('k', 5)).toBe(false);
    svc.recordFailure('k', 5); // 計數＝5（需另 4 次而非 1 次 → 佐證重新起算）
    expect(svc.isBlocked('k', 5)).toBe(true);
  });

  it('TS-HD-THR-007 顯式 reset(key) → 立即解除且底層計數歸零（之後需再 5 次才封鎖）', () => {
    const { svc } = make();
    for (let i = 0; i < 5; i++) svc.recordFailure('k', 5);
    svc.reset('k');
    expect(svc.isBlocked('k', 5)).toBe(false);
    for (let i = 0; i < 4; i++) svc.recordFailure('k', 5); // 4 次仍未封鎖
    expect(svc.isBlocked('k', 5)).toBe(false);
    svc.recordFailure('k', 5); // 第 5 次才封鎖
    expect(svc.isBlocked('k', 5)).toBe(true);
  });

  it('TS-HD-THR-008 不同 key 互不干擾', () => {
    const { svc } = make();
    for (let i = 0; i < 5; i++) svc.recordFailure('keyA', 5);
    expect(svc.isBlocked('keyA', 5)).toBe(true);
    expect(svc.isBlocked('keyB', 5)).toBe(false);
  });

  it('TS-HD-THR-009 同一實例承載 IP 軸（limit=20）與 loginId 軸（limit=5）兩門檻互不污染', () => {
    const { svc } = make();
    for (let i = 0; i < 5; i++) svc.recordFailure('ip:1.2.3.4', 20);
    for (let i = 0; i < 5; i++) svc.recordFailure('login:AS:mgr01', 5);
    expect(svc.isBlocked('ip:1.2.3.4', 20)).toBe(false); // 5 < 20
    expect(svc.isBlocked('login:AS:mgr01', 5)).toBe(true); // 5 >= 5
  });
});
