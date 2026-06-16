import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { MerchantsModule } from "./merchants/merchants.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get("DATABASE_HOST"),
        port: parseInt(config.get<string>("DATABASE_PORT", "5432"), 10),
        username: config.get("DATABASE_USER"),
        password: config.get("DATABASE_PASSWORD"),
        database: config.get("DATABASE_NAME"),
        entities: [__dirname + "/**/*.entity{.ts,.js}"],
        synchronize: config.get("DB_SYNC") === "true",
        ssl:
          config.get("DATABASE_SSL") === "true"
            ? { rejectUnauthorized: false }
            : false,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    MerchantsModule,
  ],
})
export class AppModule {}
