import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from "@nestjs/swagger";

import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { ReorderCategoriesDto } from "./dto/reorder-categories.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

@ApiTags("Admin · Categories")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("admin")
@Controller("admin/categories")
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: "Create a category", description: "**Roles:** `admin` only" })
  @ApiCreatedResponse({ description: "Category created" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch("reorder")
  @ApiOperation({
    summary: "Reorder categories",
    description:
      "**Roles:** `admin` only. Send ALL category ids in the desired order — array position becomes the new `order`.",
  })
  @ApiOkResponse({ description: "Categories reordered" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  @ApiBadRequestResponse({ description: "ids don't match existing categories" })
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categoriesService.reorder(dto);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Rename a category",
    description: "**Roles:** `admin` only",
  })
  @ApiOkResponse({ description: "Category renamed" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  @ApiNotFoundResponse({ description: "Category not found" })
  updateName(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.updateName(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({
    summary: "Delete a category",
    description:
      "**Roles:** `admin` only. Also removes this category from any merchant that has it assigned.",
  })
  @ApiNoContentResponse({ description: "Category deleted" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  @ApiNotFoundResponse({ description: "Category not found" })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
