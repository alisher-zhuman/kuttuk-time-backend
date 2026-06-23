import { IsString, IsOptional, IsBoolean, IsArray, IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateMerchantDto {
  @ApiProperty({ example: "Sierra Coffee", required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: "Лучший кофе в городе", required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: "coffee", required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: [500, 1000, 2000], required: false })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  nominals?: number[];

  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsNumber()
  validityMonths?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
