import { Global, Module } from "@nestjs/common";

import { SiteRebuildService } from "./site-rebuild.service";

// Global: venues, merchants and categories all report changes to the website.
@Global()
@Module({
  providers: [SiteRebuildService],
  exports: [SiteRebuildService],
})
export class SiteModule {}
