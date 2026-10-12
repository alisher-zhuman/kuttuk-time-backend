import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { Request, Response, NextFunction } from "express";

import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") ?? [];

  // TODO: switch to `origin: allowedOrigins` before prod launch
  void allowedOrigins;
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Slug redirect — runs before NestJS routing so it doesn't interfere with global prefix
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || req.path === "/" || req.path.startsWith("/api")) {
      return next();
    }

    const slug = req.path.slice(1);

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      return next();
    }

    return res.redirect(302, `https://t.me/kuttuk_time_bot/app?startapp=${slug}`);
  });

  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle("KuttukTime API")
    .setDescription("Gift certificate platform for local businesses in Kyrgyzstan")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup("api", app, document);

  await app.listen(process.env.PORT ?? 3000);
};

bootstrap();
