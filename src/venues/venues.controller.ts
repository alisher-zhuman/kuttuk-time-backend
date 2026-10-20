import { Controller, Get, Param, Query, Headers, ParseIntPipe } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from "@nestjs/swagger";

import { VenuesService } from "./venues.service";
import { Public } from "@/auth/public.decorator";
import { VALID_NOMINALS, VALID_VALIDITY_MONTHS } from "./venue.constants";

const UNAUTHORIZED = { statusCode: 401, message: "Unauthorized", error: "Unauthorized" };
const NOT_FOUND = { statusCode: 404, message: "Venue not found", error: "Not Found" };

// The buyer's storefront. A venue is visible only while it and its merchant are both active.
@ApiTags("Venues")
@ApiBearerAuth()
@Controller("venues")
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({
    summary: "List active venues",
    description: "**Roles:** user · merchant · admin",
  })
  @ApiQuery({ name: "search", required: false, example: "sierra" })
  @ApiQuery({ name: "category", required: false, example: 1 })
  @ApiOkResponse({
    description: "Array of venues",
    schema: {
      example: [
        {
          id: 9,
          name: "Sierra Coffee",
          description: "Лучший кофе в городе",
          logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
          minNominal: 500,
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  findAll(
    @Headers("accept-language") acceptLanguage: string = "kg",
    @Query("search") search?: string,
    @Query("category", new ParseIntPipe({ optional: true })) category?: number,
  ) {
    const lang = (acceptLanguage ?? "kg").slice(0, 2);
    return this.venuesService.findAll(lang, search, category);
  }

  // Declared before ":idOrSlug" — Express matches routes in order, so "options" would
  // otherwise be taken for a venue slug (hence RESERVED_SLUGS).
  @Get("options")
  @Public()
  @ApiOperation({
    summary: "Allowed venue values (nominals, validity months)",
    description:
      "**Public.** The single source of truth for the venue forms — the frontend doesn't keep its own lists. Sorted ascending.",
  })
  @ApiOkResponse({
    schema: { example: { nominals: [500, 1000, 2000], validityMonths: [3, 6, 12, 24] } },
  })
  getOptions(): { nominals: number[]; validityMonths: number[] } {
    return {
      nominals: [...VALID_NOMINALS].sort((a, b) => a - b),
      validityMonths: [...VALID_VALIDITY_MONTHS].sort((a, b) => a - b),
    };
  }

  @Get(":idOrSlug")
  @ApiOperation({
    summary: "Get one venue by ID or slug",
    description: "**Roles:** user · merchant · admin",
  })
  @ApiOkResponse({
    description: "Venue object",
    schema: {
      example: {
        id: 9,
        name: "Sierra Coffee",
        description: "Лучший кофе в городе",
        logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
        nominals: [500, 1000, 2000],
        validityMonths: 12,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiNotFoundResponse({
    description: "Venue not found, or it / its merchant is deactivated",
    schema: { example: NOT_FOUND },
  })
  findOne(
    @Param("idOrSlug") idOrSlug: string,
    @Headers("accept-language") acceptLanguage: string = "kg",
  ) {
    const lang = (acceptLanguage ?? "kg").slice(0, 2);
    return this.venuesService.findOne(idOrSlug, lang);
  }
}
