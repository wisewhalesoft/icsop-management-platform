import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * 帳密登入節流（brute-force 防護）之限流門檻——固定時窗（fixed window）。
 *
 * 這是「請求節流」（HTTP 429、時窗自動重置、無持久化、無需人工解鎖），
 * 與 OQ-E01-02 定案「不做（帳號）鎖定」之持久性帳號封鎖屬不同機制，兩者不衝突；
 * 本節流即 OQ-F001-B-04（密碼路徑首次直接持有可線上窮舉之本地密碼比對攻擊面）之落地。
 *
 * 以下門檻為建議預設值（nfr.md／open-questions.md 皆無逐字定案數字），詳見
 * docs/specs/test-design/hardening-test-design.md §2.1／§5，需人類於落地前簽核。
 */
export const LOGIN_THROTTLE_WINDOW_MS = 60_000; // 60 秒固定時窗
export const LOGIN_THROTTLE_PER_LOGINID_LIMIT = 5; // 同一 (companyCode, loginId) 每時窗最多 5 次失敗
export const LOGIN_THROTTLE_PER_IP_LIMIT = 20; // 同一來源 IP 每時窗最多 20 次失敗

/** 節流觸發之錯誤碼（429）。待人類補入凍結之 error-handling.md（見設計 §2.2／§5）。 */
export const AUTH_TOO_MANY_ATTEMPTS = 'AUTH_TOO_MANY_ATTEMPTS';

/**
 * 建構節流拒絕例外（429）。
 *
 * ⚠ Nest 並無 `TooManyRequestsException` shortcut 類別（@nestjs/common v11 之 exceptions/
 * 目錄無此檔，僅 `HttpStatus.TOO_MANY_REQUESTS = 429` 列舉可用）。若直接
 * `new HttpException('AUTH_TOO_MANY_ATTEMPTS', 429)`，getResponse() 將回「裸字串」body，
 * 形狀與其餘所有錯誤碼（Nest shortcut 例外之 `{statusCode, message, error}` 物件）不一致，
 * 且會破壞 frontend/src/api/client.ts 之 extractError（讀 `body.message`）→ 前端無法辨識此碼。
 * 故一律以「物件形狀」拋出（等同 HttpException.createBody() 之結果）。
 */
export function tooManyAttemptsException(): HttpException {
  return new HttpException(
    { statusCode: 429, message: AUTH_TOO_MANY_ATTEMPTS, error: 'Too Many Requests' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

/**
 * 單機 process 記憶體內固定時窗計數器（無 IO、無持久化、無新基礎設施、無新 npm 相依）。
 * 沿用 architecture-spec 之「單機部署、不引入 Redis」原則（sp_getapplock／JWKS 快取皆同哲學）。
 *
 * 雙軸（IP／loginId）獨立節流以具名 key namespace（`ip:` / `login:`）達成——同一實例可安全承載
 * 兩種不同門檻之獨立 key，互不污染（見 TS-HD-THR-009）。
 *
 * 時鐘可注入（`now`）以便純邏輯測試不依賴真實計時器；生產路徑以零參數實例化（Date.now）。
 */
@Injectable()
export class LoginThrottleService {
  private readonly entries = new Map<string, WindowEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** 回傳「仍在有效視窗內」之計數列；視窗過期（now-start >= WINDOW，邊界含）或不存在 → undefined。 */
  private active(key: string): WindowEntry | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (this.now() - e.windowStart >= LOGIN_THROTTLE_WINDOW_MS) return undefined;
    return e;
  }

  /** 是否已達門檻而封鎖（視窗過期則視為未封鎖，無需顯式 reset）。不變更狀態。 */
  isBlocked(key: string, limit: number): boolean {
    const e = this.active(key);
    return e ? e.count >= limit : false;
  }

  /**
   * 記錄一次失敗。視窗過期／不存在 → 起始新視窗（count=1）；否則於現有視窗遞增，
   * 計數封頂於 `limit`（避免持續 hammering 使計數無界成長；封頂後 isBlocked 維持 true）。
   */
  recordFailure(key: string, limit: number): void {
    const e = this.active(key);
    if (!e) {
      this.entries.set(key, { count: 1, windowStart: this.now() });
      return;
    }
    e.count = Math.min(e.count + 1, limit);
  }

  /** 顯式清除某 key 之計數（成功登入時重置 loginId 軸；底層計數歸零）。 */
  reset(key: string): void {
    this.entries.delete(key);
  }
}
