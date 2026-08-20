/**
 * 暫時性 DI 冒煙腳本（跑完即刪，非交付物）。
 * §11.11 #21：純建構子單元測試繞過 Nest 容器，對「token 解析得出來嗎」完全不可見。
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AttachmentsService } from './src/attachments/attachments.service';
import { AppendicesService } from './src/appendices/appendices.service';
import { UsageFormsService } from './src/usage-forms/usage-forms.service';
import { WatermarkService } from './src/public/watermark.service';
import { WatermarkBurnerService } from './src/public/watermark-burner.service';
import { WATERMARK_BURNER } from './src/public/watermark-burner.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const probes: [string, object][] = [
    ['AttachmentsService', app.get(AttachmentsService)],
    ['AppendicesService', app.get(AppendicesService)],
    ['UsageFormsService', app.get(UsageFormsService)],
    ['WatermarkService', app.get(WatermarkService)],
    ['WatermarkBurnerService', app.get(WatermarkBurnerService)],
  ];
  for (const [name, svc] of probes) {
    const keys = Object.keys(svc as Record<string, unknown>);
    const burner = (svc as Record<string, unknown>)['burner'];
    const burnerSvc = (svc as Record<string, unknown>)['burnerSvc'];
    console.log(
      `[DI] ${name}: burner=${burner === undefined ? 'UNDEFINED' : (burner as object).constructor.name}` +
        ` burnerSvc=${burnerSvc === undefined ? '-' : (burnerSvc as object).constructor.name}` +
        ` fields=[${keys.join(',')}]`,
    );
  }
  const token = app.get(WATERMARK_BURNER);
  console.log(`[DI] WATERMARK_BURNER token resolved -> ${token.constructor.name}`);

  const att = app.get(AttachmentsService) as unknown as Record<string, unknown>;
  if (att['burner'] === undefined) throw new Error('AttachmentsService.burner UNDEFINED');
  if (att['auditWriter'] === undefined) throw new Error('AttachmentsService.auditWriter UNDEFINED');
  const app2 = app.get(AppendicesService) as unknown as Record<string, unknown>;
  if (app2['burner'] === undefined) throw new Error('AppendicesService.burner UNDEFINED');
  const uf = app.get(UsageFormsService) as unknown as Record<string, unknown>;
  if (uf['burner'] === undefined) throw new Error('UsageFormsService.burner UNDEFINED');

  await app.close();
  console.log('DI SMOKE PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('DI SMOKE FAILED:', e);
  process.exit(1);
});
