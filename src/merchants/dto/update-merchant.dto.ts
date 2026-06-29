import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, IsObject, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateMerchantDto {
  @ApiProperty({ example: "Sierra Coffee", required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: { ru: "Лучший кофе в городе", kg: "Шаардагы эң жакшы кофе", en: "Best coffee in the city" },
    required: false,
  })
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiProperty({ example: ["coffee", "restaurant"], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiProperty({ example: [500, 1000, 2000], required: false })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  nominals?: number[];

  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsNumber()
  validityMonths?: number;

  @ApiProperty({ example: "https://res.cloudinary.com/...", required: false })
  @IsOptional()
  @IsString()
  @Matches(/^https:\/\/res\.cloudinary\.com\//, { message: "logo must be a Cloudinary URL" })
  logo?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: "sierra-coffee", required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug must contain only lowercase letters, numbers and hyphens" })
  slug?: string;
}
