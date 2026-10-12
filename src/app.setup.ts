import { type INestApplication, ValidationPipe } from "@nestjs/common";

import { GlobalExceptionFilter } from "./common/filters/http-exception.filter";

// Shared by main.ts and the integration-test app, so tests run the same request pipeline.
export const configureApp = (app: INestApplication): void => {
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
};
