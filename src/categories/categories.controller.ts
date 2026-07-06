import { Controller, Get, Headers } from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { CategoriesService } from "./categories.service";

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
        { id: 1, name: "Coffee", order: 0 },
        { id: 2, name: "Restaurant", order: 1 },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  findAll(@Headers("accept-language") acceptLanguage: string = "kg") {
    const lang = (acceptLanguage ?? "kg").slice(0, 2);
    return this.categoriesService.findAll(lang);
  }
}
