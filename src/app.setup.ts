import { type INestApplication, Logger, ValidationPipe } from "@nestjs/common";

import { GlobalExceptionFilter } from "./common/filters/http-exception.filter";

const DEV_ORIGIN = "http://localhost:5173";

// The browser origins allowed to call the API: ALLOWED_ORIGINS, comma-separated. Unset outside
// production → the local Vite dev server; unset in production → none (and an error at boot).
// Auth is a bearer token, not a cookie, so CORS isn't what keeps other sites out — it's hygiene.
export const corsOrigins = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const listed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (listed.length > 0) {
    return listed;
  }

  if (env.NODE_ENV === "production") {
    new Logger("Cors").error("ALLOWED_ORIGINS is empty — no browser origin can call the API");

    return [];
  }

  return [DEV_ORIGIN];
};

// Shared by main.ts and the integration-test app, so tests run the same request pipeline.
export const configureApp = (app: INestApplication): void => {
  app.enableCors({ origin: corsOrigins(), credentials: false });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
};
