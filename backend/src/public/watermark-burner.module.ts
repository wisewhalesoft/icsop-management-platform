import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { ORG_UNIT_READ_STORE } from '../org-directory/org-unit-read';
import { PDF_BURNER, PdfBurner, PdfLibBurner } from './pdf-burner';
import {
  WATERMARK_BURNER,
  WATERMARK_DOC_META,
  WATERMARK_ORG_LOOKUP,
  WatermarkBurnerService,
  WatermarkDocMeta,
  WatermarkOrgLookup,
} from './watermark-burner.service';
import { TypeOrmDocMeta } from './typeorm-doc-meta.source';

/**
 * F020 浮水印**燒錄協作點**模組（architecture-spec §11.5 決策 B5）。
 *
 * 🔒 **零消費者相依**：本模組只 import `OrgDirectoryModule`（`ORG_UNIT_READ_STORE`），
 * **不 import** `PublicModule`／`AttachmentsModule`／`AppendicesModule`／`UsageFormsModule`
 * 之任何一個。四個消費者皆單向 import 本模組 ⇒ 模組循環在結構上不可能發生。
 *
 * 🔴 **啟動期 fail-fast**（§11.5 之核心目的）：四個消費端之建構子已**移除 `@Optional()`**——
 * 任一模組若忘記 import 本模組或漏註冊 provider，Nest 於 `app.listen()` **之前**即拋
 * `UnknownDependenciesException`、程序非 0 結束。上一輪 `FRONT_BURNER` **從未被任何模組
 * provide** 卻因 `@Optional()` 而靜默降級（燒錄整段跳過、單元測試全綠、使用者以為有浮水印
 * 其實一個字都沒燒）——那個失敗模式自本版起結構上不可能重演。
 *
 * ⚠ TS 型別之 `?` 保留（`burner?: WatermarkBurner`）：`@Optional()` 與 TS 之 `?` 是**兩個
 * 獨立的旋鈕**——前者控制「Nest 容器裝不到時要不要炸」，後者只控制「編譯器要不要讓你省略
 * 這個參數」。保留 `?` 使既有純建構子單元測試（`new XxxService(blob, store)`）繼續編譯通過。
 */
@Module({
  imports: [OrgDirectoryModule],
  providers: [
    { provide: WATERMARK_ORG_LOOKUP, useExisting: ORG_UNIT_READ_STORE },
    { provide: PDF_BURNER, useFactory: (): PdfBurner => new PdfLibBurner() },
    {
      provide: WATERMARK_DOC_META,
      useFactory: (): WatermarkDocMeta => new TypeOrmDocMeta(AppDataSource),
    },
    {
      provide: WatermarkBurnerService,
      useFactory: (
        org: WatermarkOrgLookup,
        burner: PdfBurner,
        docMeta: WatermarkDocMeta,
      ) => new WatermarkBurnerService(org, burner, docMeta, () => new Date()),
      inject: [WATERMARK_ORG_LOOKUP, PDF_BURNER, WATERMARK_DOC_META],
    },
    { provide: WATERMARK_BURNER, useExisting: WatermarkBurnerService },
  ],
  exports: [
    WATERMARK_BURNER,
    WatermarkBurnerService,
    WATERMARK_ORG_LOOKUP,
    WATERMARK_DOC_META,
    PDF_BURNER,
  ],
})
export class WatermarkBurnerModule {}
