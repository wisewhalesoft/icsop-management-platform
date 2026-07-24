import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

/**
 * 圖示註冊守門測試。
 *
 * `Icon` 對未註冊名稱回傳 `null`（僅 DEV console.warn），因此漏註冊在測試與正式環境
 * 皆「靜默不顯示」——本專案已三度踩到（git-branch/trash-2、pin/list）。
 * 本測試掃描 src 下所有原始碼中出現的字面圖示名稱，逐一實際渲染，確保都解析得到 svg。
 *
 * 掃描範圍：
 *   1. JSX：`<Icon ... name="foo" />`、`name={'foo'}`、`name={c ? 'a' : 'b'}`
 *   2. 領域資料：`icon: 'foo'`（menu.ts／roles.ts 等以 kebab-case 字串保存）
 * 動態計算之名稱（來自變數/函式）無法靜態擷取，不在守備範圍。
 */
const SRC_ROOT = resolve(__dirname, '..');
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return [full];
  });
}

function sourceFiles(): string[] {
  return walk(SRC_ROOT).filter(
    (f) =>
      /\.tsx?$/.test(f) &&
      !/\.(test|spec)\.tsx?$/.test(f) &&
      !f.endsWith(join('components', 'Icon.tsx')),
  );
}

/** 自單一檔案內容擷取所有字面圖示名稱。 */
export function extractIconNames(source: string): string[] {
  const names = new Set<string>();

  // 1. <Icon ... name=... /> — 先抓整個標籤再取 name，避免誤抓其他元件的 name。
  for (const tag of source.match(/<Icon\b[\s\S]*?\/>/g) ?? []) {
    const dq = tag.match(/name="([^"]+)"/);
    if (dq) {
      names.add(dq[1]);
      continue;
    }
    const braced = tag.match(/name=\{([\s\S]*?)\}/);
    if (braced) {
      // 三元運算子：條件式中的字面量是比較對象而非圖示名（如
      // `name={k === 'doc' ? 'file-diff' : 'git-fork'}` 之 'doc'），僅取 `?` 之後的分支。
      const q = braced[1].indexOf('?');
      const branches = q === -1 ? braced[1] : braced[1].slice(q + 1);
      for (const lit of branches.match(/'([^']+)'|"([^"]+)"/g) ?? []) {
        names.add(lit.slice(1, -1));
      }
    }
  }

  // 2. 領域資料中的 icon: 'foo'
  for (const m of source.matchAll(/\bicon:\s*['"]([^'"]+)['"]/g)) {
    names.add(m[1]);
  }

  // 只保留形似 lucide kebab-case 名稱者（濾掉樣板字串殘留、路徑等）。
  return [...names].filter((n) => KEBAB.test(n));
}

describe('Icon 註冊守門', () => {
  const files = sourceFiles();
  const used = new Map<string, string[]>();

  for (const file of files) {
    for (const name of extractIconNames(readFileSync(file, 'utf8'))) {
      const rel = file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
      used.set(name, [...(used.get(name) ?? []), rel]);
    }
  }

  it('掃描到足夠數量之圖示使用（守門本身失效偵測）', () => {
    // 掃描器若因語法變動而失靈會回傳空集合，導致本測試「全綠但什麼都沒驗」。
    expect(used.size).toBeGreaterThan(30);
  });

  it.each([...used.keys()].sort())('圖示 %s 已註冊且可渲染', (name) => {
    const { container } = render(<Icon name={name} />);
    expect(
      container.querySelector('svg'),
      `圖示「${name}」未註冊於 Icon.tsx REGISTRY，將靜默渲染為 null。使用處：${(
        used.get(name) ?? []
      ).join('、')}`,
    ).not.toBeNull();
  });
});
