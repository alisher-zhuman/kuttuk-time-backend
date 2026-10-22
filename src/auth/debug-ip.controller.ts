import { Controller, Get, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";

import { Public } from "./public.decorator";

// TEMPORARY (2026-10-22) — to find which header carries the real client IP behind
// Cloudflare → Koyeb, and whether a client can forge it (see CLAUDE.md TODOs: public routes are
// rate-limited by the proxy IP). Echoes only the caller's own IP headers back to the caller, so
// nothing about anyone else is disclosed. Remove together with the getTracker fix.
@ApiExcludeController()
@Public()
@Controller("debug")
export class DebugIpController {
  @Get("ip")
  ip(@Req() req: Request) {
    const header = (name: string) => req.headers[name] ?? null;

    return {
      reqIp: req.ip ?? null,
      remoteAddress: req.socket.remoteAddress ?? null,
      cfConnectingIp: header("cf-connecting-ip"),
      trueClientIp: header("true-client-ip"),
      xForwardedFor: header("x-forwarded-for"),
      xRealIp: header("x-real-ip"),
      forwarded: header("forwarded"),
      cfRay: header("cf-ray") !== null,
    };
  }
}
