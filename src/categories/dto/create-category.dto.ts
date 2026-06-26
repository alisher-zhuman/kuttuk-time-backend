import { IsString, IsNotEmpty, IsInt, IsOptional, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateCategoryDto {
  @ApiProperty({ example: "coffee" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
