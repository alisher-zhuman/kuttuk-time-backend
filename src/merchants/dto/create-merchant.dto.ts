import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsPositive,
  IsArray,
  ArrayMinSize,
  IsObject,
  Min,
  Max,
  Matches,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateMerchantDto {
  @ApiProperty({ example: "Sierra Coffee" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: { ru: "Лучший кофе в городе", kg: "Шаардагы эң жакшы кофе", en: "Best coffee in the city" },
    required: false,
  })
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiProperty({ example: [1, 3], description: "Category ids" })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  categories!: number[];

  @ApiProperty({ example: [500, 1000, 2000, 3000, 5000], description: "Available nominals in KGS (500-10000)" })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(500, { each: true })
  @Max(10000, { each: true })
  nominals!: number[];

  @ApiProperty({ example: 12, description: "Certificate validity in months (1-24)", required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  validityMonths?: number;

  @ApiProperty({ example: "https://res.cloudinary.com/..." })
  @IsString()
  @Matches(/^https:\/\/res\.cloudinary\.com\//, { message: "logo must be a Cloudinary URL" })
  logo!: string;

  @ApiProperty({ example: 123456789 })
  @IsNumber()
  @IsPositive()
  merchantTelegramId!: number;

  @ApiProperty({ example: "sierra-coffee", description: "URL slug for redirect link" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, { message: "slug must contain only lowercase letters, numbers and hyphens" })
  slug!: string;
}
