import { IsObject, IsOptional, IsInt, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateCategoryDto {
  @ApiProperty({
    example: { kg: "Кофе", ru: "Кофе", en: "Coffee" },
  })
  @IsObject()
  name!: Record<string, string>;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
