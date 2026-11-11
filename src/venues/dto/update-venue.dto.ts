import {
  ArrayMinSize,
  ArrayUnique,
  IsString,
  IsNotEmpty,
  IsArray,
  IsInt,
  IsIn,
  Matches,
  MaxLength,
  IsOptional,
  ValidateIf,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import type { Translations } from "@/common/translations";
import { IsOptionalNotNull, IsTranslations } from "@/common/validators";
import {
  VALID_NOMINALS,
  VALID_VALIDITY_MONTHS,
  VENUE_NAME_MAX,
  MAP_URL,
  MAP_URL_MAX,
  VENUE_ADDRESS_MAX,
} from "../venue.constants";

export class UpdateVenueDto {
  @ApiProperty({ example: "Sierra Coffee", required: false })
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(VENUE_NAME_MAX)
  name?: string;

  @ApiProperty({
    example: {
      ru: "Лучший кофе в городе",
      kg: "Шаардагы эң жакшы кофе",
      en: "Best coffee in the city",
    },
    required: false,
  })
  @IsOptionalNotNull()
  @IsTranslations()
  description?: Translations;

  @ApiProperty({ example: [1, 3], description: "Category ids", required: false })
  @IsOptionalNotNull()
  @IsArray()
  @IsInt({ each: true })
  categories?: number[];

  @ApiProperty({
    example: [500, 1000, 2000],
    description: `Nominals in KGS, one of: ${VALID_NOMINALS.join(", ")}`,
    required: false,
  })
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(VALID_NOMINALS, { each: true })
  nominals?: number[];

  @ApiProperty({
    example: 12,
    description: `Certificate validity in months, one of: ${VALID_VALIDITY_MONTHS.join(", ")}`,
    required: false,
  })
  @IsOptionalNotNull()
  @IsIn(VALID_VALIDITY_MONTHS)
  validityMonths?: number;

  @ApiProperty({ example: "https://res.cloudinary.com/...", required: false })
  @IsOptionalNotNull()
  @IsString()
  @Matches(/^https:\/\/res\.cloudinary\.com\//, { message: "logo must be a Cloudinary URL" })
  logo?: string;

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
