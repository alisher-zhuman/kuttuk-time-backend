import {
  ArrayMinSize,
  ArrayUnique,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsPositive,
  IsArray,
  IsInt,
  IsIn,
  Matches,
  IsNotIn,
  MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import type { Translations } from "@/common/translations";
import { IsOptionalNotNull, IsTranslations } from "@/common/validators";
import {
  RESERVED_SLUGS,
  VALID_NOMINALS,
  VALID_VALIDITY_MONTHS,
  VENUE_NAME_MAX,
} from "../venue.constants";

export class AdminUpdateVenueDto {
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

  @ApiProperty({ example: true, required: false })
  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: "sierra-coffee", required: false })
  @IsOptionalNotNull()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: "slug must contain only lowercase letters, numbers and hyphens",
  })
  @IsNotIn(RESERVED_SLUGS, { message: `slug must not be one of: ${RESERVED_SLUGS.join(", ")}` })
  slug?: string;

  @ApiProperty({ example: 9, description: "Move the venue to another merchant", required: false })
  @IsOptionalNotNull()
  @IsInt()
  @IsPositive()
  merchantId?: number;
}
