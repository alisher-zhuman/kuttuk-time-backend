import { Module } from "@nestjs/common";

import { AdminPayoutsController } from "./admin-payouts.controller";
import { AdminPayoutsService } from "./admin-payouts.service";

@Module({
  controllers: [AdminPayoutsController],
  providers: [AdminPayoutsService],
})
export class PayoutsModule {}
