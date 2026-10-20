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
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import type { Translations } from "@/common/translations";
import { IsTranslations } from "@/common/validators";
import { RESERVED_SLUGS, VALID_NOMINALS, VALID_VALIDITY_MONTHS } from "../venue.constants";

export class CreateVenueDto {
  @ApiProperty({ example: 9, description: "The owning merchant (business account)" })
  @IsInt()
  @IsPositive()
  merchantId!: number;

  @ApiProperty({ example: "Sierra Coffee" })
  @IsString()
  @IsNotEmpty()
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
}
