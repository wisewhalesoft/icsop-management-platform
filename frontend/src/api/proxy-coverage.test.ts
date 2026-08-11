import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 代理白名單覆蓋率約束（架構層 metric gate）。
 *
 * 背景：前端與後端同源靠兩份代理設定達成——dev 用 vite.config.ts 的 server.proxy，
 * 容器用 frontend/nginx.conf 的 location。兩份都是**手動維護的白名單**，後端新增
 * 路由前綴時若忘記同步，該端點的 fetch 會拿到 SPA 的 index.html（HTTP 200 + text/html），
 * 前端 JSON 解析失敗後常被 .catch 收斂成空值 —— **畫面靜默壞掉、沒有任何錯誤訊息**。
 *
 * 本專案已三次踩到同一個坑：/public、/org-units（2026-07-25 瀏覽器煙霧測試）、
 * /persons 與 /documents（2026-08-11，當責室長下拉永遠查無人員）。單元測試抓不到，
 * 因為它是「設定檔與後端路由之間的一致性」，不屬於任何一支程式的行為。
 *
 * 故以本測試把一致性變成機器可檢查的約束：掃描後端所有 @Controller 的路由前綴，
 * 要求兩份代理設定都涵蓋；例外須列入 NOT_PROXIED 並寫明理由。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const BACKEND_SRC = join(REPO_ROOT, 'backend', 'src');
const NGINX_CONF = join(REPO_ROOT, 'frontend', 'nginx.conf');
const VITE_CONFIG = join(REPO_ROOT, 'frontend', 'vite.config.ts');

/**
 * 刻意不代理之前綴。新增項目必須附理由——這是唯一的逃生口，不得無故擴張。
 */
const NOT_PROXIED: Record<string, string> = {
  health: '容器 liveness 探針，直接打後端 :3000；SPA 不呼叫，無須經前端同源代理。',
};

/** 取路由第一段（代理白名單以第一段為單位）。'admin/documents/:id' → 'admin'。 */
function firstSegment(routePath: string): string {
  return routePath.replace(/^\/+/, '').split('/')[0] ?? '';
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * 後端全部路由前綴。逐個 @Controller 類別切段解析，使「有前綴之 controller」與
 * 「@Controller() 空前綴、路徑寫在方法裝飾器」兩種寫法都能正確歸戶。
 */
function backendRoutePrefixes(): Set<string> {
  const files = walk(BACKEND_SRC).filter(
    (f) => f.endsWith('.controller.ts') && !f.endsWith('.spec.ts'),
  );
  expect(files.length, '找不到任何 *.controller.ts，路徑或副檔名慣例可能已變').toBeGreaterThan(0);

  const prefixes = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    // 以 @Controller( 切段：每段開頭是該類別的前綴引數，其後的方法裝飾器屬於該類別。
    const chunks = src.split('@Controller(').slice(1);
    for (const chunk of chunks) {
      const prefixMatch = /^\s*'([^']*)'/.exec(chunk);
      const prefix = prefixMatch?.[1] ?? '';
      if (prefix) {
        prefixes.add(firstSegment(prefix));
        continue;
      }
      // 空前綴 → 路徑寫在方法裝飾器上。
      for (const m of chunk.matchAll(/@(?:Get|Post|Patch|Put|Delete)\(\s*'([^']+)'/g)) {
        prefixes.add(firstSegment(m[1]));
      }
    }
  }
  prefixes.delete('');
  return prefixes;
}

/** vite.config.ts server.proxy 之鍵。 */
function viteProxyPrefixes(): Set<string> {
  const src = readFileSync(VITE_CONFIG, 'utf-8');
  const out = new Set<string>();
  for (const m of src.matchAll(/^\s*'(\/[^']+)':\s*\{\s*target/gm)) {
    out.add(firstSegment(m[1]));
  }
  return out;
}

/** nginx.conf 之 location 指令（含 regex location，取其字面第一段）。 */
function nginxProxyPrefixes(): Set<string> {
  const src = readFileSync(NGINX_CONF, 'utf-8');
  const out = new Set<string>();
  for (const m of src.matchAll(/^\s*location\s+(?:~\s*)?\^?([^\s{]+)/gm)) {
    const seg = firstSegment(m[1]);
    if (seg) out.add(seg);
  }
  return out;
}

describe('前端代理白名單必須涵蓋後端全部路由前綴', () => {
  const backend = backendRoutePrefixes();
  const expected = [...backend].filter((p) => !(p in NOT_PROXIED)).sort();

  it('後端前綴解析結果非空且含已知路由（守護解析器本身）', () => {
    expect(backend.has('admin')).toBe(true);
    expect(backend.has('auth')).toBe(true);
    expect(backend.has('persons')).toBe(true);
  });

  it.each(expected)('vite.config.ts 代理 /%s（dev 同源）', (prefix) => {
    expect(
      viteProxyPrefixes(),
      `vite.config.ts 之 server.proxy 缺 '/${prefix}'。未代理時 dev 端 fetch 會收到 SPA index.html（200 text/html）→ JSON 解析失敗 → 畫面靜默壞掉。請新增 '/${prefix}': { target: BACKEND_TARGET, changeOrigin: true }；若確定不需代理，請加入本檔 NOT_PROXIED 並寫明理由。`,
    ).toContain(prefix);
  });

  it.each(expected)('nginx.conf 代理 /%s（容器同源）', (prefix) => {
    expect(
      nginxProxyPrefixes(),
      `frontend/nginx.conf 缺 location /${prefix}。未代理時容器端 fetch 會收到 SPA index.html（200 text/html）→ JSON 解析失敗 → 畫面靜默壞掉。請新增對應 location 區塊；若確定不需代理，請加入本檔 NOT_PROXIED 並寫明理由。`,
    ).toContain(prefix);
  });

  it('兩份設定彼此一致（避免只補其中一份）', () => {
    const vite = [...viteProxyPrefixes()].sort();
    const nginx = [...nginxProxyPrefixes()].filter((p) => p !== 'assets').sort();
    // nginx 的 `location /` fallback 會被解析成空段而略去；'assets' 為靜態資產，非 API 代理。
    expect(nginx, 'nginx.conf 與 vite.config.ts 的代理前綴不一致——修正時兩份都要改').toEqual(
      vite,
    );
  });

  it('NOT_PROXIED 之項目必須確實存在於後端（避免例外清單腐爛）', () => {
    for (const prefix of Object.keys(NOT_PROXIED)) {
      expect(backend, `NOT_PROXIED 列了 '${prefix}'，但後端已無此前綴，請移除`).toContain(prefix);
      expect(NOT_PROXIED[prefix].length, `'${prefix}' 的理由不得為空`).toBeGreaterThan(10);
    }
  });
});
