import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";

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
        synchronize: config.get("NODE_ENV") !== "production",
      }),
      inject: [ConfigService],
    }),
    AuthModule,
  ],
})
export class AppModule {}
