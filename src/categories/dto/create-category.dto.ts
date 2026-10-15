import { IsOptional, IsInt, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import type { Translations } from "@/common/translations";
import { IsTranslations } from "@/common/validators";

export class CreateCategoryDto {
  @ApiProperty({
    example: { kg: "Кофе", ru: "Кофе", en: "Coffee" },
  })
  @IsTranslations()
  name!: Translations;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
