import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  ParseBoolPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiQuery,
} from "@nestjs/swagger";

import { VenuesService } from "./venues.service";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { AdminUpdateVenueDto } from "./dto/admin-update-venue.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

const UNAUTHORIZED = { statusCode: 401, message: "Unauthorized", error: "Unauthorized" };
const FORBIDDEN = { statusCode: 403, message: "Forbidden", error: "Forbidden" };
const NOT_FOUND = { statusCode: 404, message: "Venue not found", error: "Not Found" };
const SLUG_CONFLICT = {
  statusCode: 409,
  message: 'slug "sierra-coffee" is already in use',
  error: "Conflict",
};

const VENUE_DETAIL_EXAMPLE = {
  id: 9,
  name: "Sierra Coffee",
  description: { kg: "...", ru: "Лучший кофе в городе", en: "Best coffee in the city" },
  categories: [1],
  nominals: [500, 1000, 2000],
  validityMonths: 12,
  logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
  slug: "sierra-coffee",
  isActive: true,
  createdAt: "2026-06-15T10:00:00.000Z",
  merchantId: 9,
};

@ApiTags("Admin · Venues")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("admin")
@Controller("admin/venues")
export class AdminVenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({
    summary: "List all venues",
    description:
      "**Roles:** `admin` only. Includes inactive venues and venues of inactive merchants.",
  })
  @ApiQuery({ name: "search", required: false, example: "sierra" })
  @ApiQuery({ name: "category", required: false, example: 1 })
  @ApiQuery({ name: "isActive", required: false, example: true })
  @ApiQuery({ name: "merchantId", required: false, example: 9 })
  @ApiOkResponse({
    schema: {
      example: [
        {
          id: 9,
          name: "Sierra Coffee",
          logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
          isActive: true,
          merchantId: 9,
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  findAll(
    @Query("search") search?: string,
    @Query("category", new ParseIntPipe({ optional: true })) category?: number,
    @Query("isActive", new ParseBoolPipe({ optional: true })) isActive?: boolean,
    @Query("merchantId", new ParseIntPipe({ optional: true })) merchantId?: number,
  ) {
    return this.venuesService.findAllAdmin({ search, category, isActive, merchantId });
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get one venue (detail/edit view)",
    description: "**Roles:** `admin` only",
  })
  @ApiOkResponse({ schema: { example: VENUE_DETAIL_EXAMPLE } })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Venue not found", schema: { example: NOT_FOUND } })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.venuesService.findOneAdmin(id);
  }

  @Post()
  @ApiOperation({
    summary: "Create a venue for a merchant",
    description: "**Roles:** `admin` only",
  })
  @ApiCreatedResponse({ schema: { example: VENUE_DETAIL_EXAMPLE } })
  @ApiBadRequestResponse({ description: "Validation failed, or merchantId doesn't exist" })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiConflictResponse({ description: "slug already in use", schema: { example: SLUG_CONFLICT } })
  create(@Body() dto: CreateVenueDto) {
    return this.venuesService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update any venue",
    description:
      "**Roles:** `admin` only. Incl. `slug`, `isActive` and `merchantId` (moves the venue to another merchant: past sales stay paid out to the old one, redemption moves to the new one).",
  })
  @ApiOkResponse({ schema: { example: VENUE_DETAIL_EXAMPLE } })
  @ApiBadRequestResponse({ description: "Validation failed, or merchantId doesn't exist" })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Venue not found", schema: { example: NOT_FOUND } })
  @ApiConflictResponse({ description: "slug already in use", schema: { example: SLUG_CONFLICT } })
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: AdminUpdateVenueDto) {
    return this.venuesService.updateAdmin(id, dto);
  }
}
