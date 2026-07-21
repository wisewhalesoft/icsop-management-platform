import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RequestWithSession } from '../auth/session.guard';

/**
 * 佔位權限守門：僅系統管理員（SysAdmin）可通過。
 *
 * F004 前置條件為「手動觸發者為系統管理員」。⚠ 本守門為 F025（角色×功能矩陣）就緒前之
 * 最小實作；F025 完成後應改由矩陣統一判定，並移除此類分散於各 feature 的硬編角色檢查。
 * 須置於 SessionGuard 之後（依賴其掛上之 req.sessionUser）。
 */
@Injectable()
export class SysAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    if (req.sessionUser?.roleCode !== 'SysAdmin') {
      throw new ForbiddenException('PERMISSION_DENIED');
    }
    return true;
  }
}
