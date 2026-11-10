import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { Public } from "./auth/public.decorator";

// For an external uptime monitor: 200 while the app answers and the database does too,
// 503 when the database doesn't. Public, default rate limit by IP; says nothing else.
@ApiTags("health")
@Public()
@Controller("health")
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: "Liveness for an uptime monitor: the app and the database answer" })
  @ApiOkResponse({ schema: { example: { status: "ok" } } })
  async check(): Promise<{ status: "ok" }> {
    try {
      await this.dataSource.query("SELECT 1");
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }

    return { status: "ok" };
  }
}
