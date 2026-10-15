import { ApiProperty } from "@nestjs/swagger";

import type { Translations } from "@/common/translations";
import { IsTranslations } from "@/common/validators";

export class UpdateCategoryDto {
  @ApiProperty({
    example: { kg: "Кофе", ru: "Кофе", en: "Coffee" },
  })
  @IsTranslations()
  name!: Translations;
}
