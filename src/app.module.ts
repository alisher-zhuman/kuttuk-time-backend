import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { MerchantsModule } from "./merchants/merchants.module";
import { VenuesModule } from "./venues/venues.module";
import { PayoutsModule } from "./payouts/payouts.module";
import { UploadModule } from "./upload/upload.module";
import { CategoriesModule } from "./categories/categories.module";
import { OrdersModule } from "./orders/orders.module";
import { CertificatesModule } from "./certificates/certificates.module";
import { JwtGuard } from "./auth/jwt.guard";
import { UserThrottlerGuard } from "./auth/user-throttler.guard";
import { buildTypeOrmOptions } from "./database/typeorm.options";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => buildTypeOrmOptions((key) => config.get<string>(key)),
      inject: [ConfigService],
    }),
    AuthModule,
    MerchantsModule,
    VenuesModule,
    UploadModule,
    CategoriesModule,
    OrdersModule,
    CertificatesModule,
    PayoutsModule,
  ],
  providers: [
    // Order matters: global guards run in registration order, and the throttler keys on
    // req.user, which JwtGuard sets. Covered by test/integration/rate-limit.int-spec.ts.
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
