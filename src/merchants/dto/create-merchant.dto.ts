import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  IsArray,
  ArrayMinSize,
  IsObject,
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

  @ApiProperty({ example: ["coffee", "restaurant"], description: "coffee | restaurant | spa | fitness" })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  categories!: string[];

  @ApiProperty({ example: [500, 1000, 2000, 3000, 5000], description: "Available nominals in KGS" })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  nominals!: number[];

  @ApiProperty({ example: 12, description: "Certificate validity in months", required: false })
  @IsOptional()
  @IsNumber()
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
