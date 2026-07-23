import { WatermarkSession } from '../public/watermark.service';
import { WatermarkIdentity } from '../public/watermark';

/**
 * F036 浮水印快照建構 seam（結構相容 `WatermarkService.buildSnapshot`）。
 *
 * 循環樹狀圖預覽之浮水印**逐字重用 F020 之 WatermarkService**（伺服器端唯一來源：身分快照 +
 * org 查找 + 公司全稱 + UTC+8 時間），避免各自組字造成格式漂移（NFR-007 一致性）。
 * 以最小介面注入，使單元測試可用假體、免 boot PublicModule；生產以 `useExisting: WatermarkService`。
 */
export interface LifecycleWatermarkBuilder {
  buildSnapshot(
    session: WatermarkSession,
  ): Promise<{ snapshot: string; fields: WatermarkIdentity }>;
}

export const LIFECYCLE_WATERMARK_BUILDER = Symbol('LIFECYCLE_WATERMARK_BUILDER');
