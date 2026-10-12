import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { finikConfig } from "./finik.config";
import { FinikService } from "./finik.service";

@Module({
  imports: [ConfigModule.forFeature(finikConfig)],
  providers: [FinikService],
  exports: [FinikService],
})
export class FinikModule {}
