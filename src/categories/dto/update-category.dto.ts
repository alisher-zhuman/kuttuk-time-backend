import { IsString, IsOptional, IsInt, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateCategoryDto {
  @ApiProperty({ example: "coffee", required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
