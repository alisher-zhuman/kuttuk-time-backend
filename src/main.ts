import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import type { Request, Response, NextFunction } from "express";

import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/http-exception.filter";
import { Merchant } from "./merchants/entities/merchant.entity";

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const merchantRepo = app.get<Repository<Merchant>>(getRepositoryToken(Merchant));

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") ?? [];

  // TODO: switch to `origin: allowedOrigins` before prod launch
  void allowedOrigins;
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Slug redirect — runs before NestJS routing so it doesn't interfere with global prefix
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || req.path === "/" || req.path.startsWith("/api")) {
      return next();
    }
    
    const slug = req.path.slice(1);

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      return next();
    }

    try {
      const merchant = await merchantRepo.findOne({ where: { slug, isActive: true } });

      if (merchant) {
        return res.redirect(302, `https://t.me/kuttuk_time_bot/app?startapp=${slug}`);
      }
    } catch (_) {}
    return next();
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle("KuttukTime API")
    .setDescription(
      "Gift certificate platform for local businesses in Kyrgyzstan",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  await app.listen(process.env.PORT ?? 3000);
};

bootstrap();
