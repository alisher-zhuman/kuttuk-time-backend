import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  IsArray,
  ArrayMinSize,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateMerchantDto {
  @ApiProperty({ example: "Sierra Coffee" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: "Лучший кофе в городе", required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: "coffee", description: "coffee | restaurant | spa | fitness" })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ example: [500, 1000, 2000, 3000, 5000], description: "Available nominals in KGS" })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  nominals!: number[];

  @ApiProperty({ example: 12, description: "Certificate validity in months", required: false })
  @IsOptional()
  @IsNumber()
  validityMonths?: number;

  @ApiProperty({ example: 123456789 })
  @IsNumber()
  @IsPositive()
  merchantTelegramId!: number;
}
