import { IsObject } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateCategoryDto {
  @ApiProperty({
    example: { kg: "Кофе", ru: "Кофе", en: "Coffee" },
  })
  @IsObject()
  name!: Record<string, string>;
}
