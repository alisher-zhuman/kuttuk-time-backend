import { isIP } from "node:net";

import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import type { CurrentUser } from "./interfaces/current-user.interface";

// Who a request counts against. Behind Cloudflare → Koyeb, req.ip is Koyeb's proxy hop (one
// internal address for everyone), so it can't tell clients apart:
// - a logged-in user → their own counter (`user:<id>`). Works only because JwtGuard is
//   registered before this guard (app.module.ts) and has already set req.user;
// - anyone else → the client IP Cloudflare puts in CF-Connecting-IP. Checked on prod
//   2026-10-22: it is the real client IP, and a client can't forge it — a request that sends
//   its own CF-Connecting-IP is refused by Cloudflare (error 1000). X-Forwarded-For /
//   True-Client-IP / Forwarded are NOT used: they pass the client's value through;
// - no such header (local runs) → req.ip.
export const throttleKey = (req: {
  user?: unknown;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string => {
  const user = req.user as CurrentUser | undefined;

  if (user?.userId) {
    return `user:${user.userId}`;
  }

  const cf = req.headers?.["cf-connecting-ip"];

  if (typeof cf === "string" && isIP(cf.trim())) {
    return `ip:${cf.trim()}`;
  }

  return String(req.ip);
};

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return throttleKey(req);
  }
}
