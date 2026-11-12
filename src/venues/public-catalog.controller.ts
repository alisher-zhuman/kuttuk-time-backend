import { Controller, Get, Header } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { Public } from "@/auth/public.decorator";

import { PublicCatalog, VenuesService } from "./venues.service";

// The whole visible catalog in every language, without a token - for the website's build
// (pages for search engines, sitemap.xml). Called at build time, not by buyers' browsers, so
// it wakes the database only when the site is rebuilt.
@ApiTags("Venues")
@Controller("public")
export class PublicCatalogController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get("catalog")
  @Public()
  @Header("Cache-Control", "public, max-age=300")
  @ApiOperation({
    summary: "The visible catalog, all languages (public)",
    description:
      "**Public.** Visible venues (venue and merchant active) and all categories, raw `{ru,kg,en}`. For the website's build - SEO pages and sitemap.xml.",
  })
  @ApiOkResponse({
    schema: {
      example: {
        venues: [
          {
            id: 9,
            slug: "sierra-coffee",
            name: "Sierra Coffee",
            description: { ru: "Кофейня", kg: "Кофейня", en: "Coffee shop" },
            logo: "https://res.cloudinary.com/x/image/upload/v1/kuttuk-time/abc.webp",
            categories: [1],
            nominals: [500, 1000, 2000],
            validityMonths: 12,
            address: "г. Бишкек, ул. Киевская 1",
            mapUrl: "https://2gis.kg/bishkek/search/Sierra",
            updatedAt: "2026-11-12T06:00:00.000Z",
          },
        ],
        categories: [{ id: 1, name: { ru: "Кофейни", kg: "Кофейнялар", en: "Coffee" }, order: 0 }],
      },
    },
  })
  getCatalog(): Promise<PublicCatalog> {
    return this.venuesService.publicCatalog();
  }
}
