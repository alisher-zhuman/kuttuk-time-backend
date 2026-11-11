import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsIn,
  IsPositive,
  IsArray,
  ArrayMinSize,
  ArrayUnique,
  Matches,
  IsNotIn,
  MaxLength,
  IsOptional,
  ValidateIf,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import type { Translations } from "@/common/translations";
import { IsTranslations } from "@/common/validators";
import {
  RESERVED_SLUGS,
  VALID_NOMINALS,
  VALID_VALIDITY_MONTHS,
  VENUE_NAME_MAX,
  MAP_URL,
  MAP_URL_MAX,
  VENUE_ADDRESS_MAX,
} from "../venue.constants";

export class CreateVenueDto {
  @ApiProperty({ example: 9, description: "The owning merchant (business account)" })
  @IsInt()
  @IsPositive()
  merchantId!: number;

  @ApiProperty({ example: "Sierra Coffee" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(VENUE_NAME_MAX)
  name!: string;

  @ApiProperty({
    example: {
      ru: "Лучший кофе в городе",
      kg: "Шаардагы эң жакшы кофе",
      en: "Best coffee in the city",
    },
  })
  @IsTranslations()
  description!: Translations;

  @ApiProperty({ example: [1, 3], description: "Category ids" })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  categories!: number[];

  @ApiProperty({
    example: [500, 1000, 2000, 3000, 5000],
    description: `Available nominals in KGS, one of: ${VALID_NOMINALS.join(", ")}`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(VALID_NOMINALS, { each: true })
  nominals!: number[];

  @ApiProperty({
    example: 12,
    description: `Certificate validity in months, one of: ${VALID_VALIDITY_MONTHS.join(", ")}`,
  })
  @IsIn(VALID_VALIDITY_MONTHS)
  validityMonths!: number;

  @ApiProperty({ example: "https://res.cloudinary.com/..." })
  @IsString()
  @Matches(/^https:\/\/res\.cloudinary\.com\//, { message: "logo must be a Cloudinary URL" })
  logo!: string;

  @ApiProperty({ example: "sierra-coffee", description: "URL slug for redirect link" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: "slug must contain only lowercase letters, numbers and hyphens",
  })
  @IsNotIn(RESERVED_SLUGS, { message: `slug must not be one of: ${RESERVED_SLUGS.join(", ")}` })
  slug!: string;

  @ApiProperty({
    example: "ул. Киевская 95, 2 этаж",
    description: `Optional, one text for every language, ≤ ${VENUE_ADDRESS_MAX} chars. null or blank clears it`,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(VENUE_ADDRESS_MAX)
  address?: string | null;

  @ApiProperty({
    example: "https://2gis.kg/bishkek/firm/70000001234567",
    description:
      "Optional link to the venue on a map: https, 2GIS / Google Maps / Yandex Maps only. null or blank clears it",
    required: false,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => typeof value === "string" && value.trim() !== "")
  @IsString()
  @MaxLength(MAP_URL_MAX)
  @Matches(MAP_URL, { message: "mapUrl must be a 2GIS, Google Maps or Yandex Maps https link" })
  mapUrl?: string | null;
}
