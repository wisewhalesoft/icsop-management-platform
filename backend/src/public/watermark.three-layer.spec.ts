import { toDisplayLines } from './pdf-burner';
import { WATERMARK_CONFIDENTIALITY } from './watermark';
import { WatermarkService, WatermarkOrgLookup, WatermarkSession } from './watermark.service';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';

/**
 * F020 #7／F038 #17 三層式浮水印 —— **後端側**之顯示行拆分契約（Lane L2）。
 *
 * 權威：
 *  - F020 Description（「該機密聲明**另起一行**（獨立一行）顯示」）＋ `prototypes/05-public-viewer-watermark.html:110`
 *    （`<span>${WM_DATA}<br>${WM_NOTICE}<br>${WM_TIME}</span>` ⇒ 三層：①身分資料列 ②固定機密聲明 ③時間戳）
 *  - F038 檔頭加註（#17＝`BUG-IMPL`，既有 AC 已涵蓋，不新增 AC）
 *  - architecture-spec §10.14（🔴「以**同一組固定測試向量**綁定前後端兩份實作；任一邊漂移即紅燈」，
 *    三個代表性快照＝① 完整五欄 ② 缺「處/室」 ③ 缺「處/室」與「部門」）
 *  - `OQ-D18-14`（員工編號對手動帳號天然可空 → 維持契約 §8.4 收合、**不以 `loginId` 頂替**）
 *
 * 🔴 **本檔與 `frontend/src/domain/watermark-lines.test.ts` 之向量必須逐字相同** —— 那是本 repo 沒有
 *    共用 package 之下，前後端一致性的**唯一**機器保證（§10.14）。改任一邊之期望值時必須同時改另一邊。
 *
 * 🔒 **不改後端回傳結構**：F020 明訂「線性稽核快照字串之欄位順序不變」，`buildWatermarkSnapshot()`
 *    一份三用（檢視器疊加／PDF 燒錄／稽核快照）。本檔只約束**顯示層拆行**，不得被解讀為要求後端改回
 *    傳結構化欄位陣列（§10.16 已明確否決該替代方案）。
 */

const TIME = '2026-08-16 10:00:00 (UTC+8)';

/** §10.14 之三個代表性快照（前後端共用；順序與內容不得單邊變更）。 */
export const WATERMARK_LINE_VECTORS: { label: string; snapshot: string; lines: string[] }[] = [
  {
    label: '① 完整五欄（員工編號-姓名-公司全稱-部門-處/室）',
    snapshot: `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-${TIME}`,
    lines: ['E001-王小明-和潤企業股份有限公司-營運管理部-審查室', WATERMARK_CONFIDENTIALITY, TIME],
  },
  {
    label: '② 缺「處/室」（掛部層者，契約 §8.4 收合）',
    snapshot: `E001-王小明-和潤企業股份有限公司-營運管理部-${WATERMARK_CONFIDENTIALITY}-${TIME}`,
    lines: ['E001-王小明-和潤企業股份有限公司-營運管理部', WATERMARK_CONFIDENTIALITY, TIME],
  },
  {
    label: '③ 缺「處/室」與「部門」（孤兒帳號）',
    snapshot: `E001-王小明-和潤企業股份有限公司-${WATERMARK_CONFIDENTIALITY}-${TIME}`,
    lines: ['E001-王小明-和潤企業股份有限公司', WATERMARK_CONFIDENTIALITY, TIME],
  },
];

describe('toDisplayLines（F020 #7／F038 #17 三層式浮水印 — 後端側）', () => {
  it.each(WATERMARK_LINE_VECTORS)('$label → 恰三行且逐字相同', ({ snapshot, lines }) => {
    expect(toDisplayLines(snapshot)).toEqual(lines);
  });

  it('機密聲明恆為**獨立**一行（不與身分列或時間戳同行）', () => {
    for (const v of WATERMARK_LINE_VECTORS) {
      const out = toDisplayLines(v.snapshot);
      expect(out).toHaveLength(3);
      expect(out[1]).toBe(WATERMARK_CONFIDENTIALITY);
      expect(out[0]).not.toContain(WATERMARK_CONFIDENTIALITY);
      expect(out[2]).not.toContain(WATERMARK_CONFIDENTIALITY);
    }
  });

  it('拆行後之各行首尾不得殘留分隔符 `-`（錨點前段去尾、後段去頭）', () => {
    for (const v of WATERMARK_LINE_VECTORS) {
      for (const line of toDisplayLines(v.snapshot)) {
        expect(line.startsWith('-')).toBe(false);
        expect(line.endsWith('-')).toBe(false);
        expect(line.trim()).not.toBe('');
      }
    }
  });

  it('🔒 拆行為純顯示層轉換：三行以 `-` 重新接回即為原線性快照（稽核快照順序不變）', () => {
    for (const v of WATERMARK_LINE_VECTORS) {
      expect(toDisplayLines(v.snapshot).join('-')).toBe(v.snapshot);
    }
  });
});

// ── 欄位不完整（F020 #7 之第二半；`OQ-D18-14`）──────────────────────────────

const ORG = {
  JAC00: { tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' },
  JA000: { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
};

function fakeOrg(): WatermarkOrgLookup {
  return { findByOrgCode: (code) => Promise.resolve((ORG as Record<string, { tier: string; name: string; descFull: string | null }>)[code] ?? null) };
}

class NoopAudit implements AuditWriter {
  recordAccess(_e: AuditAccessEvent): Promise<void> {
    return Promise.resolve();
  }
  queryHistory(): never {
    throw new Error('n/a');
  }
  processOutboxRetry(): Promise<void> {
    return Promise.resolve();
  }
}

const T0 = new Date('2026-08-16T02:00:00Z');

function svcOf() {
  return new WatermarkService(
    fakeOrg(),
    { getOriginalPdf: () => Promise.resolve(null) },
    { burnPdf: (_o: Buffer, s: string) => Promise.resolve(Buffer.from(`BURNED:${s}`)) },
    new NoopAudit(),
    undefined,
    () => T0,
  );
}

const BASE: WatermarkSession = {
  accountId: 'acc-1',
  employeeNo: 'E001',
  name: '王小明',
  companyCode: 'AS',
  orgCode: 'JAC00',
  roleCode: 'User',
};

describe('浮水印欄位不完整之處置（F020 #7／OQ-D18-14）', () => {
  it('🔒 員工編號為空（手動帳號天然可空）→ 該欄收合、不出現連續分隔符、**不以任何識別字頂替**', async () => {
    const { snapshot } = await svcOf().buildSnapshot({ ...BASE, employeeNo: null });
    expect(snapshot).toBe(
      `王小明-和潤企業股份有限公司-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-2026-08-16 10:00:00 (UTC+8)`,
    );
    expect(snapshot).not.toContain('--');
    expect(snapshot.startsWith('-')).toBe(false);
  });

  it('🔒 員工編號為空之快照，其三層拆行仍為恰三行（顯示層不因缺欄而崩壞）', async () => {
    const { snapshot } = await svcOf().buildSnapshot({ ...BASE, employeeNo: '' });
    const lines = toDisplayLines(snapshot);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('王小明-和潤企業股份有限公司-營運管理部-審查室');
    expect(lines[1]).toBe(WATERMARK_CONFIDENTIALITY);
  });

  it('姓名為 F003 必填 → 有值時必出現於第一行（缺姓名屬資料/同步缺陷，非渲染問題）', async () => {
    const { snapshot } = await svcOf().buildSnapshot(BASE);
    expect(toDisplayLines(snapshot)[0]).toContain('王小明');
    expect(toDisplayLines(snapshot)[0]).toContain('E001');
  });
});
