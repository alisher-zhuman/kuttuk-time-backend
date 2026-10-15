import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import type { CurrentUser } from "./interfaces/current-user.interface";

// Rate limits per user when there is one: behind Koyeb's proxy req.ip is the proxy hop,
// so an IP key makes everyone on the same node share one counter. Works only because
// JwtGuard is registered before this guard (app.module.ts) and has already set req.user.
// Public routes have no user and stay keyed by req.ip — see CLAUDE.md TODOs.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as CurrentUser | undefined;

    return user?.userId ? `user:${user.userId}` : String(req.ip);
  }
}
