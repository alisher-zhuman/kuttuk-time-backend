import { IsString, IsNotEmpty, IsOptional, IsInt, IsPositive } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateCertificateDto {
  @ApiProperty({ example: "Coffee for 500 som" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: "One cup of any drink", required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 500, description: "Price in som" })
  @IsInt()
  @IsPositive()
  price!: number;
}
