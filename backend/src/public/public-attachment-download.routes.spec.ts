import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { WatermarkController } from './watermark.controller';
import { PublicDocumentsController } from './public-documents.controller';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey, canPerform } from '../rbac/function-matrix';

/**
 * F020 `AC-D8` —— 前台附件下載之**一個專屬端點**之 route-metadata 約束。
 *
 * 權威：`docs/specs/features/F020-watermark.md` `AC-D8`（2026-08-16 補訂，起因為 ringC 提報之
 * `G-L2-02`：該端點之 handler 名稱與權限閘門原未入任何 AC）＋ `architecture-spec.md` §10.1。
 *
 * | 方法 | 路徑 | 閘門 | handler |
 * |---|---|---|---|
 * | GET | `/public/documents/:documentId/attachments/icsop-pdf/download` | `下載列印文件` read | `downloadIcsopPdf` |
 *
 * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 7）：`AC-D8` 原表（2026-08-16 補訂）
 * 之第二列 `GET .../attachments/ojt/download`（`downloadOjt`）已依
 * [F020](../../docs/specs/features/F020-watermark.md#ojt-frontstage-note-delta) `AC-J26`
 * 明文作廢——「前台不提供 OJT 場次檔下載（[F042](../../docs/specs/features/F042-ojt-progress-management.md)
 * `AC-24`）：簽到表為出席紀錄，與 `AC-16` 之 PII 防線同源 ⇒ 本檔之燒錄／不燒錄規則自始不適用於
 * 場次檔之前台路徑（**該路徑不存在**）」。實測確認：`icsop-pdf` 半案（含掃描器自我守護案）全綠、
 * `ojt` 半案 5 案全紅、皆為 `hits.length===0`——掃描器本身有效，純粹是該路徑真的不存在。
 * `CASES` 移除 `ojt` 列，其餘（`icsop-pdf` 之閘門、handler 名、`AC-D6` 誤用防呆、五角色逐格）
 * 逐字不動。
 *
 * 🔴 **本檔存在之理由（真缺陷已自環中逃逸）**：前端 `endpoints.ts` 之 `downloadPublicAttachment()`
 * 早已呼叫 `icsop-pdf` 該路徑、`PublicDocumentDetailPage` 亦已接上，但**後端從未實作** ⇒ 實測回
 * 404 `application/json`。使用者第 5a 項因此從「下載得到但沒浮水印」惡化為「下載不了」。
 * 全綠之原因：前端測試 mock 掉 `downloadPublicAttachment`；後端只測燒錄服務、無 controller 暴露；
 * `AC-D3` 只斷言「不呼叫舊的 `downloadAttachment`」——那條確實滿足。**沒有任何測試跨越前後端邊界。**
 * 通則層之防線另見 `frontend/src/api/endpoint-contract.test.ts`。
 *
 * ⚠ 對實作全盲：撰寫時該 route 尚不存在，故本檔為**預期紅燈**，implementer 實作後轉綠。
 * ⚠ 刻意**不綁定 handler 落在哪個 class**：以 `PATH_METADATA` 於全部 `public/documents` 前綴之
 *    controller 中搜尋（`:param` 名稱正規化，因參數命名非可觀測契約）。若以 class 綁定，
 *    implementer 換一個 controller 承載就會紅得不是原因。
 */

const HOSTS = [
  { name: 'WatermarkController', cls: WatermarkController },
  { name: 'PublicDocumentsController', cls: PublicDocumentsController },
] as const;

type Hit = { controller: string; cls: object; key: string; fn: object };

/** `:documentId/attachments/...` → `:p/attachments/...`（參數名不入契約），並去除首尾斜線。 */
function norm(p: string): string {
  return p.replace(/^\/+|\/+$/g, '').replace(/:[^/]+/g, ':p');
}

function findHandlers(relPath: string): Hit[] {
  const want = norm(relPath);
  const hits: Hit[] = [];
  for (const { name, cls } of HOSTS) {
    const proto = cls.prototype as object;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      const fn = Object.getOwnPropertyDescriptor(proto, key)?.value as unknown;
      if (typeof fn !== 'function') continue;
      const path: unknown = Reflect.getMetadata(PATH_METADATA, fn);
      if (typeof path === 'string' && norm(path) === want) {
        hits.push({ controller: name, cls, key, fn: fn as object });
      }
    }
  }
  return hits;
}

/** 有效閘門＝method-level 覆寫優先，否則沿用 class-level 預設。 */
function effectivePermission(hit: Hit): RequiredPermission | undefined {
  return (
    (Reflect.getMetadata(REQUIRE_PERMISSION_KEY, hit.fn) as RequiredPermission | undefined) ??
    (Reflect.getMetadata(REQUIRE_PERMISSION_KEY, hit.cls) as RequiredPermission | undefined)
  );
}

const CASES = [{ type: 'icsop-pdf', handler: 'downloadIcsopPdf' }] as const;

describe('F020 AC-D8 — 前台附件下載之一個專屬端點（route-metadata）', () => {
  /**
   * 🔒 掃描器自我守護：若 `PATH_METADATA` 之讀法或 controller 前綴慣例日後改變，
   * 下面兩組斷言會「查無 handler」而紅——但那是**掃描器壞了**，不是端點沒實作。
   * 本案以一條**已存在**之 route 證明掃描器本身有效，使兩種紅燈可被區分。
   */
  it('掃描器有效性自我檢查：找得到既有之 `:id/download`（前台整份文件下載）', () => {
    const hits = findHandlers(':id/download');
    expect(hits.length).toBeGreaterThan(0);
  });

  describe.each(CASES)('GET public/documents/:documentId/attachments/$type/download', ({ type, handler }) => {
    const relPath = `:documentId/attachments/${type}/download`;

    // 💡 紅燈解讀：找不到此 route ⇒ 前端 `endpoints.ts` 之 `downloadPublicAttachment()` 已在呼叫
    //    此路徑（`PublicDocumentDetailPage` 已接上），後端未實作 ⇒ 使用者實際收到 404。權威＝F020 `AC-D8`。
    // ⚠ jest 之 `expect()` **不接受**第二個訊息參數（那是 vitest 專有），故診斷寫在註解與案名。
    it(`存在恰一個掛此路徑之 handler，且 HTTP 方法為 GET`, () => {
      const hits = findHandlers(relPath);
      expect(hits.map((h) => `${h.controller}.${h.key}`)).toHaveLength(1);
      expect(Reflect.getMetadata(METHOD_METADATA, hits[0].fn)).toBe(RequestMethod.GET);
    });

    it(`handler 名稱逐字為 \`${handler}\``, () => {
      const hits = findHandlers(relPath);
      expect(hits.length).toBe(1);
      expect(hits[0].key).toBe(handler);
    });

    it('有效閘門為功能 `下載列印文件`（DOCUMENT_DOWNLOAD_PRINT）之 read', () => {
      const hits = findHandlers(relPath);
      expect(hits.length).toBe(1);
      const meta = effectivePermission(hits[0]);
      expect(meta).toBeDefined();
      expect(meta!.functionKey).toBe(FunctionKey.DOCUMENT_DOWNLOAD_PRINT);
      expect(meta!.action).toBe('read');
    });

    it('🔴 不得誤用 ICSOP_DOCUMENT_MANAGEMENT（那是 AC-D6 之後台閘門，User 為 NONE）', () => {
      const hits = findHandlers(relPath);
      expect(hits.length).toBe(1);
      expect(effectivePermission(hits[0])!.functionKey).not.toBe(
        FunctionKey.ICSOP_DOCUMENT_MANAGEMENT,
      );
    });

    it('AC-D8 ① 逐角色解析：五種角色（含一般使用者 User）皆通過功能層', () => {
      const hits = findHandlers(relPath);
      expect(hits.length).toBe(1);
      const meta = effectivePermission(hits[0])!;
      // 💡 紅燈解讀：若 User 被擋，F026 矩陣之「ICSOP PDF／OJT＝唯讀（可下載）」即被架空。
      //    以 map 而非逐一 expect，使失敗訊息直接列出是哪個角色不通過（jest 無 per-assertion message）。
      const resolved = ['User', 'SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact'].map(
        (role) => `${role}=${canPerform(role, meta.functionKey, meta.action)}`,
      );
      expect(resolved).toEqual([
        'User=true',
        'SysAdmin=true',
        'ICSOPAdmin=true',
        'Supervisor=true',
        'DeptContact=true',
      ]);
    });
  });
});
