import {
  Controller,
  Get,
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

const UNAUTHORIZED = { statusCode: 401, message: "Unauthorized", error: "Unauthorized" };
const FORBIDDEN = { statusCode: 403, message: "Forbidden", error: "Forbidden" };
const NOT_FOUND = { statusCode: 404, message: "Category not found", error: "Not Found" };

@ApiTags("Admin · Categories")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("admin")
@Controller("admin/categories")
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: "List all categories (raw, all languages)",
    description:
      "**Roles:** `admin` only. Returns `name` as `{kg, ru, en}`, not resolved to one language.",
  })
  @ApiOkResponse({
    schema: {
      example: [{ id: 1, name: { kg: "Кофе", ru: "Кофе", en: "Coffee" }, order: 0 }],
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  findAll() {
    return this.categoriesService.findAllAdmin();
  }

  @Post()
  @ApiOperation({ summary: "Create a category", description: "**Roles:** `admin` only" })
  @ApiCreatedResponse({
    description: "Category created",
    schema: {
      example: { id: 5, name: { kg: "Спа", ru: "Спа", en: "Spa" }, order: 4 },
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch("reorder")
  @ApiOperation({
    summary: "Reorder categories",
    description:
      "**Roles:** `admin` only. Send ALL category ids in the desired order — array position becomes the new `order`. Response body is empty.",
  })
  @ApiOkResponse({ description: "Categories reordered — empty response body" })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiBadRequestResponse({
    description: "ids don't match existing categories",
    schema: {
      example: {
        statusCode: 400,
        message: "ids must match the full set of existing category ids",
        error: "Bad Request",
      },
    },
  })
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categoriesService.reorder(dto);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Rename a category",
    description: "**Roles:** `admin` only",
  })
  @ApiOkResponse({
    description: "Category renamed",
    schema: {
      example: { id: 1, name: { kg: "Кофе", ru: "Кофе напитки", en: "Coffee" }, order: 0 },
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Category not found", schema: { example: NOT_FOUND } })
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
  @ApiNoContentResponse({ description: "Category deleted — empty response body" })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Category not found", schema: { example: NOT_FOUND } })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
