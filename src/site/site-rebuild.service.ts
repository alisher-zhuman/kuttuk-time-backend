import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// After this long without another change, the website is rebuilt once - an admin editing a venue
// field by field gives one build, not five (Vercel Hobby allows 100 deployments a day).
export const SITE_REBUILD_DELAY_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 15_000;

// The website's search-engine pages are built from GET /api/public/catalog at build time, so a
// change to what buyers see (a venue, a merchant's visibility, categories) must trigger a rebuild:
// Vercel's Deploy Hook (VERCEL_DEPLOY_HOOK_URL). Unset → nothing happens (local, tests).
// Best-effort: a failed call is logged, the change itself is already saved.
@Injectable()
export class SiteRebuildService implements OnModuleDestroy {
  private readonly logger = new Logger(SiteRebuildService.name);
  private timer: NodeJS.Timeout | null = null;
  private reasons = new Set<string>();

  constructor(private readonly config: ConfigService) {}

  private hookUrl(): string | undefined {
    return this.config.get<string>("VERCEL_DEPLOY_HOOK_URL")?.trim() || undefined;
  }

  // Schedules a rebuild; every call within the delay pushes it back.
  request(reason: string): void {
    if (!this.hookUrl()) {
      return;
    }

    this.reasons.add(reason);

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => void this.flush(), SITE_REBUILD_DELAY_MS);
  }

  // A pending rebuild isn't lost when the app stops (a redeploy).
  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const url = this.hookUrl();
    const reasons = [...this.reasons].join(", ");

    this.reasons.clear();

    if (!url) {
      return;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) {
        this.logger.log(`Website rebuild requested (${reasons})`);
      } else {
        this.logger.warn(`Website rebuild failed: HTTP ${response.status} (${reasons})`);
      }
    } catch (error) {
      // Never log the URL - it is the secret.
      this.logger.warn(
        `Website rebuild failed: ${error instanceof Error ? error.name : "error"} (${reasons})`,
      );
    }
  }
}
