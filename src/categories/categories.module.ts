import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Category } from "./entities/category.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { CategoriesService } from "./categories.service";
import { CategoriesController } from "./categories.controller";
import { AdminCategoriesController } from "./admin-categories.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Category, Merchant])],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
