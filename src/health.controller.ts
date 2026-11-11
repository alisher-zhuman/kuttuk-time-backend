import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InjectDataSource } from "@nestjs/typeorm";
import { Throttle } from "@nestjs/throttler";
import type { DataSource } from "typeorm";

import { Public } from "./auth/public.decorator";

// GET /api/health - for the external uptime monitor: the app answers. It must NOT touch the
// database: Koyeb's free Postgres has 5 active hours a month and sleeps after 5 idle minutes -
// a monitor querying it every 5 minutes kept it awake and used the whole month's quota in hours
// (2026-11-11, prod down). GET /api/health/db - a manual check that the database answers too
// (wakes it - never point a monitor at it).
@ApiTags("health")
@Public()
@Controller("health")
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: "Liveness for an uptime monitor - the app only, never the database" })
  @ApiOkResponse({ schema: { example: { status: "ok" } } })
  check(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("db")
  // A manual check - by hand, now and then; a low limit keeps anyone from keeping the DB awake.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Manual check: the database answers (wakes it - not for monitors)" })
  @ApiOkResponse({ schema: { example: { status: "ok" } } })
  async checkDb(): Promise<{ status: "ok" }> {
    try {
      await this.dataSource.query("SELECT 1");
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }

    return { status: "ok" };
  }
}
