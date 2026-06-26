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
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
} from "@nestjs/swagger";

import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

@ApiTags("Categories")
@ApiBearerAuth()
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: "List all categories",
    description: "**Roles:** user · merchant · admin. Sorted by order.",
  })
  @ApiOkResponse({
    schema: {
      example: [
        { id: 1, name: "coffee", order: 0 },
        { id: 2, name: "restaurant", order: 1 },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({
    summary: "Create a category",
    description: "**Roles:** `admin` only",
  })
  @ApiCreatedResponse({ description: "Category created" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  @ApiConflictResponse({ description: "Category already exists" })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({
    summary: "Update a category (name or order)",
    description: "**Roles:** `admin` only",
  })
  @ApiOkResponse({ description: "Category updated" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  @ApiNotFoundResponse({ description: "Category not found" })
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({
    summary: "Delete a category",
    description: "**Roles:** `admin` only",
  })
  @ApiOkResponse({ description: "Category deleted" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  @ApiNotFoundResponse({ description: "Category not found" })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
