/**
 * F001 Azure AD endpoint host 覆寫 delta — 🔒 **原始碼掃描式約束**：
 *   `AC-E8`（TLS 憑證驗證不得關閉）、`AC-E6` 之接線守則（釘死的檢查必須被呼叫）、
 *   `AC-E15`（零漣漪：本設定不得滲入 session／帳密登入／節流之任何模組）。
 *
 * 為何用掃描：這三條的載體不在單一函式的回傳值裡，而在「整個程式碼庫**沒有**某段東西」
 * 或「某個檢查**確實被叫到**」。掃描是唯一能機器判定的形式。
 *
 * 🔴 **掃描式約束必須自我守護**——`it.each([])` 零案例會假綠、regex 打錯字也會假綠。
 *   因此每一組掃描都附帶：①「掃到的檔案數 > 0 且達下限」②「規則本身對合成違規字串確實會命中」
 *   兩道自我守護。少了它們，這整個檔案可以在什麼都沒查的情況下全綠。
 *
 * 權威來源：`docs/specs/features/F001-auth-login-session.md` `AC-E6`／`AC-E8`／`AC-E15`。
 * 設計文件：`docs/test-specs/features/F001-AAD-authority-host-test.md`。
 */

import fs from 'node:fs';
import path from 'node:path';

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

type ScannedFile = { rel: string; text: string };

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkTs(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** 生產原始碼（不含 `*.spec.ts`——測試檔本身會寫出違規字串當作反例）。 */
function productionSources(): ScannedFile[] {
  return walkTs(path.join(BACKEND_ROOT, 'src')).map((full) => ({
    rel: path.relative(REPO_ROOT, full).replace(/\\/g, '/'),
    text: fs.readFileSync(full, 'utf8'),
  }));
}

/** 部署面檔案（TLS 也可能在容器／compose／npm script 這一層被關掉）。 */
function deploymentFiles(): ScannedFile[] {
  const candidates = [
    'backend/Dockerfile',
    'frontend/Dockerfile',
    'docker-compose.yml',
    '.env.sample',
    '.env.deploy.example',
    'backend/package.json',
  ];
  return candidates
    .map((rel) => ({ rel, full: path.join(REPO_ROOT, rel) }))
    .filter(({ full }) => fs.existsSync(full))
    .map(({ rel, full }) => ({ rel, text: fs.readFileSync(full, 'utf8') }));
}

type Rule = { id: string; pattern: RegExp; violationSample: string };

/** `AC-E8` 明文列舉之關閉手段，逐一成規則。 */
const TLS_RULES: Rule[] = [
  {
    id: 'NODE_TLS_REJECT_UNAUTHORIZED',
    pattern: /NODE_TLS_REJECT_UNAUTHORIZED/,
    violationSample: "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';",
  },
  {
    id: 'rejectUnauthorized:false',
    pattern: /rejectUnauthorized\s*[:=]\s*false/,
    violationSample: 'new https.Agent({ rejectUnauthorized: false })',
  },
  {
    id: 'strictSSL:false',
    pattern: /strictSSL\s*[:=]\s*false/,
    violationSample: 'const opts = { strictSSL: false };',
  },
  {
    id: 'checkServerIdentity-override',
    pattern: /checkServerIdentity\s*[:=]/,
    violationSample: 'checkServerIdentity: () => undefined,',
  },
  {
    id: 'NODE_EXTRA_CA_CERTS',
    pattern: /NODE_EXTRA_CA_CERTS/,
    violationSample: 'ENV NODE_EXTRA_CA_CERTS=/tmp/mitm.pem',
  },
];

describe('AC-E8 🔒 TLS 憑證驗證不得以任何方式關閉', () => {
  const sources = [...productionSources(), ...deploymentFiles()];

  it('自我守護：掃描範圍非空且涵蓋部署面檔案', () => {
    expect(sources.length).toBeGreaterThan(50);
    const rels = sources.map((s) => s.rel);
    expect(rels).toContain('backend/Dockerfile');
    expect(rels).toContain('docker-compose.yml');
    expect(rels.filter((r) => r.startsWith('backend/src/'))).not.toHaveLength(0);
  });

  it.each(TLS_RULES)('自我守護：規則 $id 對合成違規字串確實命中', ({ pattern, violationSample }) => {
    expect(pattern.test(violationSample)).toBe(true);
  });

  it.each(TLS_RULES)('$id 未出現於任何生產原始碼或部署檔', ({ pattern }) => {
    const hits = sources
      .filter((s) => pattern.test(s.text))
      .map((s) => {
        const line = s.text.split(/\r?\n/).findIndex((l) => pattern.test(l)) + 1;
        return `${s.rel}:${line}`;
      });
    expect(hits).toEqual([]);
  });
});

describe('AC-E6 釘死的 issuer 檢查必須被實際呼叫（不得只寫成沒人用的死碼）', () => {
  const sources = productionSources();

  it('自我守護：生產原始碼清單非空', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('expectedAadIssuer／isAcceptableAadIssuer 至少被 aad-authority.ts 以外之生產檔引用', () => {
    const callers = sources
      .filter((s) => !s.rel.endsWith('/aad-authority.ts'))
      .filter((s) => /\b(expectedAadIssuer|isAcceptableAadIssuer)\b/.test(s.text))
      .map((s) => s.rel);
    expect(callers).not.toEqual([]);
  });
});

describe('AC-E15 零漣漪：authority host 設定不得滲入 session／帳密登入／節流模組', () => {
  const DECOUPLED = [
    'src/auth/session-token.service.ts',
    'src/auth/session.config.ts',
    'src/auth/session.guard.ts',
    'src/auth/login-throttle.ts',
    'src/auth/password-login.ts',
    'src/auth/password-login.service.ts',
    'src/auth/account-resolver.ts',
    'src/auth/auth-outcome.ts',
  ];

  it('自我守護：受管制之八個模組全部存在（檔名改了要重新對帳，不得靜默略過）', () => {
    const missing = DECOUPLED.filter((rel) => !fs.existsSync(path.join(BACKEND_ROOT, rel)));
    expect(missing).toEqual([]);
  });

  it.each(DECOUPLED)('%s 不得出現 AZURE_AD_AUTHORITY_HOST／authorityHost', (rel) => {
    const full = path.join(BACKEND_ROOT, rel);
    const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
    expect(text).not.toBe('');
    expect(text).not.toMatch(/AZURE_AD_AUTHORITY_HOST/);
    expect(text).not.toMatch(/\bauthorityHost\b/);
  });
});
